#!/usr/bin/env python3
"""
Relay + agent smoke test — no external dependencies required (Python 3.8+).

Connects to the relay WebSocket, publishes a signed test Nostr event, waits
up to TIMEOUT seconds for a kind:24200 (agent observer frame) response, then
exits 0 on success or 1 on timeout/failure.

Usage:
    RELAY_URL=wss://relay.example.com python3 scripts/smoke-agent.py

Env vars:
    RELAY_URL         Required. WebSocket URL of the relay to test.
    TIMEOUT           Seconds to wait for agent response (default: 30).
    TEST_PRIVKEY_HEX  64-char hex private key (deterministic test key used
                      if omitted — safe to leave unset in CI).
    AGENT_PUBKEY      Hex pubkey to @-mention in the test event. When set the
                      test expects a direct response from that agent.
    SMOKE_CHANNEL_ID  Hex event-id of the channel to scope the test event into.
                      Required when the relay enforces h-tag scoping on
                      kind-40002 events (e.g. production LenOS relay).
"""
import hashlib, json, os, socket, ssl, struct, sys, time, urllib.parse
from base64 import b64encode
from os import urandom

# ── secp256k1 / BIP-340 Schnorr (pure Python, no external deps) ─────────────

_P  = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F
_N  = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
_GX = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798
_GY = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8
_G  = (_GX, _GY)


def _padd(P, Q):
    if P is None: return Q
    if Q is None: return P
    x1, y1 = P; x2, y2 = Q
    if x1 == x2:
        if y1 != y2: return None
        lam = 3 * x1 * x1 * pow(2 * y1, _P - 2, _P) % _P
    else:
        lam = (y2 - y1) * pow(x2 - x1, _P - 2, _P) % _P
    x = (lam * lam - x1 - x2) % _P
    return (x, (lam * (x1 - x) - y1) % _P)


def _pmul(k):
    Q, P = None, _G
    while k:
        if k & 1: Q = _padd(Q, P)
        P = _padd(P, P); k >>= 1
    assert Q is not None, "degenerate scalar (k=0)"
    return Q


def _tagged(tag, data):
    h = hashlib.sha256(tag.encode()).digest()
    return hashlib.sha256(h + h + data).digest()


def _b(n, l=32): return n.to_bytes(l, 'big')
def _i(b):       return int.from_bytes(b, 'big')


def _pubkey_point(priv_hex):
    return _pmul(_i(bytes.fromhex(priv_hex)))


def _pubkey_hex(priv_hex):
    return _pubkey_point(priv_hex)[0].to_bytes(32, 'big').hex()


def _schnorr_sign(msg_hex, priv_hex):
    """BIP-340 deterministic Schnorr signature. Returns 64-byte hex."""
    d0  = _i(bytes.fromhex(priv_hex))
    msg = bytes.fromhex(msg_hex)
    P   = _pmul(d0)
    # Normalise key so P.y is even.
    d   = d0 if P[1] % 2 == 0 else _N - d0
    Px  = _b(P[0])
    # Deterministic nonce (BIP-340 §3, aux_rand = 0x00*32).
    t   = _b(d ^ _i(_tagged("BIP0340/aux", b'\x00' * 32)))
    k0  = _i(_tagged("BIP0340/nonce", t + Px + msg)) % _N
    if k0 == 0:
        raise ValueError("degenerate nonce")
    R   = _pmul(k0)
    k   = k0 if R[1] % 2 == 0 else _N - k0
    Rx  = _b(R[0])
    e   = _i(_tagged("BIP0340/challenge", Rx + Px + msg)) % _N
    s   = (k + e * d) % _N
    return (Rx + _b(s)).hex()


def _nostr_event(kind, content, tags, priv_hex):
    pubkey     = _pubkey_hex(priv_hex)
    created_at = int(time.time())
    serial     = json.dumps([0, pubkey, created_at, kind, tags, content],
                            separators=(',', ':'))
    event_id   = hashlib.sha256(serial.encode()).hexdigest()
    sig        = _schnorr_sign(event_id, priv_hex)
    return {"id": event_id, "pubkey": pubkey, "created_at": created_at,
            "kind": kind, "tags": tags, "content": content, "sig": sig}


# ── Minimal raw WebSocket client (text frames only) ──────────────────────────

def _ws_connect(url):
    p    = urllib.parse.urlparse(url)
    host = p.hostname
    port = p.port or (443 if p.scheme == 'wss' else 80)
    path = (p.path or '/') + (('?' + p.query) if p.query else '')

    sock = socket.create_connection((host, port), timeout=15)
    if p.scheme == 'wss':
        ctx  = ssl.create_default_context()
        sock = ctx.wrap_socket(sock, server_hostname=host)

    key = b64encode(urandom(16)).decode()
    sock.sendall((
        f"GET {path} HTTP/1.1\r\n"
        f"Host: {host}:{port}\r\n"
        f"Upgrade: websocket\r\nConnection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        f"Sec-WebSocket-Version: 13\r\n\r\n"
    ).encode())

    buf = b""
    while b"\r\n\r\n" not in buf:
        chunk = sock.recv(4096)
        if not chunk:
            raise ConnectionError("WebSocket handshake failed — connection closed")
        buf += chunk

    status = buf.split(b"\r\n")[0].decode()
    if "101" not in status:
        raise ConnectionError(f"WebSocket upgrade rejected: {status}")
    return sock


def _ws_send(sock, text):
    payload = text.encode('utf-8')
    n       = len(payload)
    mask    = urandom(4)
    masked  = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    hdr     = bytes([0x81])
    if n < 126:
        hdr += bytes([0x80 | n])
    elif n < 65536:
        hdr += bytes([0x80 | 126]) + struct.pack('>H', n)
    else:
        hdr += bytes([0x80 | 127]) + struct.pack('>Q', n)
    sock.sendall(hdr + mask + masked)


def _ws_recv(sock):
    """Return next text frame or None on close."""
    def _read(n):
        buf = b""
        while len(buf) < n:
            c = sock.recv(n - len(buf))
            if not c:
                raise ConnectionError("Connection closed mid-frame")
            buf += c
        return buf

    hdr    = _read(2)
    opcode = hdr[0] & 0x0F
    if opcode == 8:
        return None  # close frame
    length = hdr[1] & 0x7F
    if length == 126:
        length = struct.unpack('>H', _read(2))[0]
    elif length == 127:
        length = struct.unpack('>Q', _read(8))[0]
    masked = bool(hdr[1] & 0x80)
    if masked:
        key  = _read(4)
        data = bytes(b ^ key[i % 4] for i, b in enumerate(_read(length)))
    else:
        data = _read(length)
    return data.decode('utf-8', errors='replace')


# ── Smoke test ────────────────────────────────────────────────────────────────

KIND_STREAM_MESSAGE = 40002   # Kind used to publish channel messages.
KIND_AGENT_FRAME    = 24200   # Kind:24200 = ephemeral agent observer frame.
KIND_NIP42_AUTH     = 22242   # Kind used for NIP-42 relay authentication.

RELAY_URL   = os.environ.get("RELAY_URL", "").strip()
TIMEOUT     = int(os.environ.get("TIMEOUT", "30"))
PRIV_HEX    = os.environ.get(
    "TEST_PRIVKEY_HEX",
    # Deterministic test key — hardcoded, not secret, never used in production.
    "b0b1b2b3b4b5b6b7b8b9babbbcbdbebf0102030405060708090a0b0c0d0e0f10",
)
AGENT_PUBKEY = os.environ.get("AGENT_PUBKEY", "").strip()
CHANNEL_ID   = os.environ.get("SMOKE_CHANNEL_ID", "").strip()


def _log(msg):
    print(f"[smoke] {msg}", flush=True)


def main():
    if not RELAY_URL:
        print("[smoke] FAIL: RELAY_URL is required", file=sys.stderr)
        sys.exit(2)

    _log(f"connecting to {RELAY_URL}")
    try:
        sock = _ws_connect(RELAY_URL)
    except Exception as exc:
        print(f"[smoke] FAIL: could not connect — {exc}", file=sys.stderr)
        sys.exit(1)

    _log("WebSocket connected")

    # Subscribe to recent agent observer frames (last 60 s).
    sub_id = f"smoke-{int(time.time())}"
    _ws_send(sock, json.dumps(["REQ", sub_id, {
        "kinds": [KIND_AGENT_FRAME],
        "since": int(time.time()) - 60,
        "limit": 1,
    }]))

    # Publish a test channel message, optionally @-mentioning the test agent.
    # The h tag is required by the relay for channel-scoped events (kind 40002).
    tags = []
    if CHANNEL_ID:
        tags.append(["h", CHANNEL_ID])
    else:
        print("[smoke] WARN: SMOKE_CHANNEL_ID not set — relay may reject the event", flush=True)
    if AGENT_PUBKEY:
        tags.append(["p", AGENT_PUBKEY])
    evt  = _nostr_event(KIND_STREAM_MESSAGE, "lenos-smoke-test", tags, PRIV_HEX)
    _ws_send(sock, json.dumps(["EVENT", evt]))
    _log(f"published test event {evt['id'][:8]}…")

    deadline     = time.time() + TIMEOUT
    auth_done    = False

    sock.settimeout(1.0)
    while time.time() < deadline:
        try:
            raw = _ws_recv(sock)
        except socket.timeout:
            continue
        except Exception as exc:
            print(f"[smoke] FAIL: recv error — {exc}", file=sys.stderr)
            sys.exit(1)

        if raw is None:
            print("[smoke] FAIL: relay closed connection unexpectedly", file=sys.stderr)
            sys.exit(1)

        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            continue

        mtype = msg[0] if msg else ""

        if mtype == "AUTH":
            # NIP-42: sign the challenge and re-authenticate.
            if not auth_done:
                challenge = msg[1]
                _log(f"NIP-42 challenge received, authenticating…")
                auth_evt = _nostr_event(KIND_NIP42_AUTH, "", [
                    ["relay", RELAY_URL],
                    ["challenge", challenge],
                ], PRIV_HEX)
                _ws_send(sock, json.dumps(["AUTH", auth_evt]))
                auth_done = True
                # Re-publish test event after auth.
                _ws_send(sock, json.dumps(["EVENT", evt]))
                _log(f"re-published test event after auth")

        elif mtype == "OK":
            accepted = msg[2] if len(msg) > 2 else False
            _log(f"relay {'accepted' if accepted else 'REJECTED'} event {(msg[1] or '')[:8]}…")
            if not accepted:
                reason = msg[3] if len(msg) > 3 else "unknown"
                # auth-required is recoverable (AUTH message handled above).
                if "auth-required" not in str(reason):
                    print(f"[smoke] FAIL: relay rejected event — {reason}", file=sys.stderr)
                    sys.exit(1)

        elif mtype == "EOSE":
            _log("EOSE — waiting for agent observer frame…")

        elif mtype == "EVENT":
            event = msg[2] if len(msg) > 2 else {}
            if event.get("kind") == KIND_AGENT_FRAME:
                _log(f"PASS: received agent observer frame from "
                     f"{event.get('pubkey', '?')[:8]}…")
                sock.close()
                sys.exit(0)

        elif mtype == "NOTICE":
            _log(f"NOTICE: {msg[1] if len(msg) > 1 else ''}")

    print(f"[smoke] FAIL: no agent observer frame received within {TIMEOUT}s",
          file=sys.stderr)
    sock.close()
    sys.exit(1)


if __name__ == "__main__":
    main()
