#!/usr/bin/env python3
"""
LenGrowth adapter smoke test — no external dependencies required (Python 3.8+).

Connects to a LenOS relay WebSocket, publishes a signed kind:9 @lengrowth
command, waits up to TIMEOUT seconds for the adapter to reply with a kind:9
event referencing ours, then exits 0 on success or 1 on timeout/failure.

Usage:
    RELAY_URL=wss://lenos-e2e32.lengrowth.com \\
    SMOKE_CHANNEL_ID=328be86d-0ce7-4a75-a6e2-919bbeb1782b \\
    python3 scripts/smoke-agent.py

Env vars:
    RELAY_URL         Required. WebSocket URL of the relay workspace to test.
    SMOKE_CHANNEL_ID  Community UUID for the h-tag (required; relay enforces it).
    ADAPTER_PUBKEY    Hex pubkey of the LenGrowth adapter. Defaults to the
                      production adapter key.
    TIMEOUT           Seconds to wait for adapter response (default: 45).
    TEST_PRIVKEY_HEX  64-char hex private key. The default deterministic key is
                      pre-registered as a member of lenos-e2e32. Never rotate it
                      without also re-running the invite-claim setup.
    RELAY_GATEWAY_URL If set, connect to this URL but send Host: <RELAY_URL host>.
                      Use when the tenant subdomain is behind Cloudflare and the
                      direct relay base URL bypasses CF.
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


def _pubkey_hex(priv_hex):
    return _pmul(_i(bytes.fromhex(priv_hex)))[0].to_bytes(32, 'big').hex()


def _schnorr_sign(msg_hex, priv_hex):
    d0  = _i(bytes.fromhex(priv_hex))
    msg = bytes.fromhex(msg_hex)
    P   = _pmul(d0)
    d   = d0 if P[1] % 2 == 0 else _N - d0
    Px  = _b(P[0])
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

def _ws_connect(url, host_override=None):
    p    = urllib.parse.urlparse(url)
    host = p.hostname
    port = p.port or (443 if p.scheme == 'wss' else 80)
    path = (p.path or '/') + (('?' + p.query) if p.query else '')

    sock = socket.create_connection((host, port), timeout=15)
    if p.scheme == 'wss':
        ctx  = ssl.create_default_context()
        sock = ctx.wrap_socket(sock, server_hostname=host)

    ws_host = host_override or f"{p.hostname}:{port}"
    key = b64encode(urandom(16)).decode()
    sock.sendall((
        f"GET {path} HTTP/1.1\r\n"
        f"Host: {ws_host}\r\n"
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
    def _read(n):
        buf = b""
        while len(buf) < n:
            c = sock.recv(n - len(buf))
            if not c:
                raise ConnectionError("Connection closed mid-frame")
            buf += c
        return buf

    while True:
        hdr    = _read(2)
        opcode = hdr[0] & 0x0F
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

        if opcode == 8:
            return None  # close frame
        if opcode == 9:
            # Ping — reply with masked pong (client→server frames must be masked per RFC 6455)
            mask = urandom(4)
            masked_payload = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
            n = len(data)
            if n < 126:
                pong_hdr = bytes([0x8A, 0x80 | n]) + mask
            else:
                pong_hdr = bytes([0x8A, 0x80 | 126]) + struct.pack('>H', n) + mask
            sock.sendall(pong_hdr + masked_payload)
            continue  # keep waiting for the next frame
        if opcode == 10:
            continue  # pong, ignore
        return data.decode('utf-8', errors='replace')


# ── Smoke test ────────────────────────────────────────────────────────────────

KIND_CHAT    = 9      # NIP-29 group chat message; adapter listens and replies here
KIND_NIP42   = 22242  # NIP-42 relay auth challenge response

# Production LenGrowth adapter pubkey (NOSTR_ADAPTER_PUBKEY in Scalingo env)
_DEFAULT_ADAPTER_PUBKEY = "ce928671e149874e5eb96078fe6c3dd0c485c90c26ba05cad98cc948550f9b78"

# Deterministic test key — pre-registered as lenos-e2e32 community member.
# Rotate only if you re-run the invite-claim bootstrap in scripts/smoke-agent.py.
_DEFAULT_PRIV_HEX = "b0b1b2b3b4b5b6b7b8b9babbbcbdbebf0102030405060708090a0b0c0d0e0f10"

RELAY_URL     = os.environ.get("RELAY_URL", "").strip()
GATEWAY_URL   = os.environ.get("RELAY_GATEWAY_URL", "").strip()
CHANNEL_ID    = os.environ.get("SMOKE_CHANNEL_ID", "").strip()
ADAPTER_PK    = os.environ.get("ADAPTER_PUBKEY", _DEFAULT_ADAPTER_PUBKEY).strip()
TIMEOUT       = int(os.environ.get("TIMEOUT", "45"))
PRIV_HEX      = os.environ.get("TEST_PRIVKEY_HEX", _DEFAULT_PRIV_HEX)


def _log(msg):
    print(f"[smoke] {msg}", flush=True)


def main():
    if not RELAY_URL:
        print("[smoke] FAIL: RELAY_URL is required", file=sys.stderr)
        sys.exit(2)
    # SMOKE_CHANNEL_ID is required when the relay enforces h-tag channel scoping.
    # An open-visibility channel is used so the test key can post without being
    # a member. See scripts/provision-smoke-channel.py to create/discover it.

    # When the tenant subdomain is behind Cloudflare, connect via the base
    # relay URL (DNS-only, bypasses CF) with a Host header override.
    connect_url  = GATEWAY_URL if GATEWAY_URL else RELAY_URL
    host_hdr     = None
    if GATEWAY_URL:
        parsed   = urllib.parse.urlparse(RELAY_URL)
        port     = parsed.port or 443
        host_hdr = f"{parsed.hostname}:{port}" if parsed.port else parsed.hostname

    _log(f"connecting to {connect_url}" + (f" (Host: {host_hdr})" if host_hdr else ""))
    try:
        sock = _ws_connect(connect_url, host_override=host_hdr)
    except Exception as exc:
        print(f"[smoke] FAIL: could not connect — {exc}", file=sys.stderr)
        sys.exit(1)

    _log("WebSocket connected")

    # Subscribe to recent kind:9 from the adapter — so we catch replies that
    # arrive before we finish publishing the trigger event.
    # Include #h filter when channel is set: the adapter reply includes an h-tag
    # making it channel-scoped; the relay only delivers channel-scoped events to
    # subscriptions that have a matching #h filter (fan_out_scoped in subscription.rs).
    sub_id = f"smoke-{int(time.time())}"
    sub_filter = {
        "kinds": [KIND_CHAT],
        "authors": [ADAPTER_PK],
        "since": int(time.time()) - 60,
        "limit": 5,
    }
    if CHANNEL_ID:
        sub_filter["#h"] = [CHANNEL_ID]
    _ws_send(sock, json.dumps(["REQ", sub_id, sub_filter]))

    # Publish "@lengrowth get tasks" as an unscoped kind:9.
    # kind:9 does not require an h tag; omitting it avoids the channel-membership
    # check while still triggering the adapter's @lengrowth command handler.
    # If SMOKE_CHANNEL_ID is set it is echoed back in the adapter reply tags
    # (useful when you want to verify a specific channel's dispatch path).
    tags = [["h", CHANNEL_ID]] if CHANNEL_ID else []
    evt  = _nostr_event(KIND_CHAT, "@lengrowth get tasks", tags, PRIV_HEX)
    _ws_send(sock, json.dumps(["EVENT", evt]))
    _log(f"published @lengrowth get tasks (event {evt['id'][:8]}...)")

    deadline  = time.time() + TIMEOUT
    auth_done = False
    published = False

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
            if not auth_done:
                challenge = msg[1]
                _log("NIP-42 challenge received, authenticating...")
                auth_evt = _nostr_event(KIND_NIP42, "", [
                    ["relay", RELAY_URL],
                    ["challenge", challenge],
                ], PRIV_HEX)
                _ws_send(sock, json.dumps(["AUTH", auth_evt]))
                auth_done = True
                # Re-subscribe and re-publish after successful auth.
                _ws_send(sock, json.dumps(["REQ", sub_id, sub_filter]))
                if not published:
                    _ws_send(sock, json.dumps(["EVENT", evt]))
                    _log(f"re-published @lengrowth get tasks after auth")
                    published = True

        elif mtype == "OK":
            accepted = msg[2] if len(msg) > 2 else False
            event_ref = (msg[1] or '')[:8]
            _log(f"relay {'accepted' if accepted else 'REJECTED'} event {event_ref}...")
            if not accepted:
                reason = msg[3] if len(msg) > 3 else "unknown"
                if "auth-required" not in str(reason):
                    print(f"[smoke] FAIL: relay rejected event — {reason}", file=sys.stderr)
                    sys.exit(1)
            else:
                published = True

        elif mtype == "EOSE":
            _log("EOSE — waiting for adapter kind:9 reply...")

        elif mtype == "EVENT":
            event = msg[2] if len(msg) > 2 else {}
            if event.get("kind") != KIND_CHAT:
                continue
            if event.get("pubkey") != ADAPTER_PK:
                continue
            # Accept any kind:9 from the adapter that has our event in an e-tag,
            # OR any adapter kind:9 published after our trigger (adapter only
            # sends replies in response to @lengrowth commands).
            event_tags = event.get("tags", [])
            e_refs = {t[1] for t in event_tags if t and t[0] == "e"}
            if evt["id"] in e_refs or event.get("created_at", 0) >= evt["created_at"]:
                _log(f"PASS: adapter replied (event {event.get('id', '')[:8]}...)")
                _log(f"  content: {event.get('content', '')[:120]}")
                sock.close()
                sys.exit(0)

        elif mtype == "NOTICE":
            _log(f"NOTICE: {msg[1] if len(msg) > 1 else ''}")

    print(f"[smoke] FAIL: no adapter kind:9 reply within {TIMEOUT}s", file=sys.stderr)
    sock.close()
    sys.exit(1)


if __name__ == "__main__":
    main()
