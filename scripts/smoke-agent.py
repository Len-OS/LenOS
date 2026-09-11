#!/usr/bin/env python3
"""
Live production LenGrowth adapter integration smoke — no external dependencies
required (Python 3.8+). This checks the currently deployed relay and adapter;
it does not verify a newly built relay image.

Connects to a LenOS relay WebSocket, publishes a signed kind:9 @lengrowth
command in the configured channel, and waits up to TIMEOUT seconds for the
configured adapter to reply with a matching kind:9 event.

Usage:
    RELAY_URL=wss://lenos-e2e32.lengrowth.com \\
    SMOKE_CHANNEL_ID=328be86d-0ce7-4a75-a6e2-919bbeb1782b \\
    python3 scripts/smoke-agent.py

Env vars:
    RELAY_URL         Required. WebSocket URL of the relay workspace to test.
    SMOKE_CHANNEL_ID  Channel UUID for the h-tag (required; relay enforces it).
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
from dataclasses import dataclass
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

    header_end = buf.find(b"\r\n\r\n") + 4
    status = buf.split(b"\r\n")[0].decode()
    if "101" not in status:
        raise ConnectionError(f"WebSocket upgrade rejected: {status}")
    # The first recv may also contain the relay's immediate AUTH challenge.
    # Preserve those bytes instead of dropping them with the HTTP headers.
    return sock, bytearray(buf[header_end:])


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


def _ws_ping(sock):
    """Send a masked control frame to flush gateway-to-client data."""
    mask = urandom(4)
    sock.sendall(bytes([0x89, 0x80]) + mask)


def _ws_recv(sock, pending):
    def _read(n):
        while len(pending) < n:
            c = sock.recv(n - len(pending))
            if not c:
                raise ConnectionError("Connection closed mid-frame")
            pending.extend(c)
        data = bytes(pending[:n])
        del pending[:n]
        return data

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


def is_expected_adapter_reply(event, command_event_id, channel_id, adapter_pubkey):
    """Match only the configured adapter's exact channel-scoped reply."""
    if not isinstance(event, dict):
        return False
    if event.get("kind") != KIND_CHAT or event.get("pubkey") != adapter_pubkey:
        return False
    tags = event.get("tags", [])
    if not isinstance(tags, list):
        return False
    has_channel = any(
        isinstance(tag, list)
        and len(tag) >= 2
        and tag[0] == "h"
        and tag[1] == channel_id
        for tag in tags
    )
    if not has_channel:
        return False
    return any(
        isinstance(tag, list)
        and len(tag) >= 2
        and tag[0] == "e"
        and tag[1] == command_event_id
        for tag in tags
    )


@dataclass
class SmokeState:
    """Correlate NIP-42 authentication, command acceptance, and the reply."""

    channel_id: str
    adapter_pubkey: str
    auth_event_id: str = ""
    auth_confirmed: bool = False
    command_event_id: str = ""
    command_sent: bool = False
    command_accepted: bool = False
    failure: str = ""
    reply_event: dict = None

    def handle(self, message):
        """Advance the state machine and return a meaningful protocol action."""
        if not isinstance(message, list) or not message:
            return None

        message_type = message[0]
        if message_type == "AUTH":
            if not self.auth_event_id and len(message) >= 2:
                return ("auth-challenge", message[1])
            return None

        if message_type == "OK":
            event_id = message[1] if len(message) >= 2 else ""
            accepted = len(message) >= 3 and message[2] is True
            reason = message[3] if len(message) >= 4 else "unknown"

            if self.auth_event_id and event_id == self.auth_event_id:
                if self.auth_confirmed:
                    return None
                if not accepted:
                    self.failure = f"authentication rejected — {reason}"
                    return "failure"
                self.auth_confirmed = True
                return "auth-confirmed"

            if self.command_event_id and event_id == self.command_event_id:
                if not accepted:
                    self.failure = f"command rejected — {reason}"
                    return "failure"
                self.command_accepted = True
                return "command-accepted"

            # This includes delayed responses to commands sent before auth.
            # They are unrelated to the exact events tracked by this run.
            return None

        if message_type == "EVENT":
            event = message[2] if len(message) >= 3 else {}
            if (
                self.auth_confirmed
                and self.command_accepted
                and self.command_event_id
                and is_expected_adapter_reply(
                    event,
                    self.command_event_id,
                    self.channel_id,
                    self.adapter_pubkey,
                )
            ):
                self.reply_event = event
                return "reply"
            return None

        # NOTICE, EOSE, malformed messages, and future relay message types do
        # not advance authentication or command state.
        return None

    def set_auth_event(self, event):
        if self.auth_event_id:
            raise ValueError("AUTH event already set")
        self.auth_event_id = event["id"]

    def set_command_event(self, event):
        if not self.auth_confirmed:
            raise ValueError("cannot send command before authentication")
        if self.command_sent:
            raise ValueError("command already sent")
        self.command_event_id = event["id"]
        self.command_sent = True


def main():
    if not RELAY_URL:
        print("[smoke] FAIL: RELAY_URL is required", file=sys.stderr)
        sys.exit(2)
    if not CHANNEL_ID:
        print("[smoke] FAIL: SMOKE_CHANNEL_ID is required", file=sys.stderr)
        sys.exit(2)

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
        sock, pending = _ws_connect(connect_url, host_override=host_hdr)
    except Exception as exc:
        print(f"[smoke] FAIL: could not connect — {exc}", file=sys.stderr)
        sys.exit(1)

    _log("WebSocket connected")
    _ws_ping(sock)

    state = SmokeState(CHANNEL_ID, ADAPTER_PK)

    # Prepare the subscription before connecting, but do not send it until the
    # relay has confirmed the exact NIP-42 AUTH event below.
    sub_id = f"smoke-{int(time.time())}"
    sub_filter = {
        "kinds": [KIND_CHAT],
        "authors": [ADAPTER_PK],
        "since": int(time.time()) - 60,
        "limit": 5,
    }
    sub_filter["#h"] = [CHANNEL_ID]

    deadline  = time.time() + TIMEOUT

    sock.settimeout(1.0)
    while time.time() < deadline:
        try:
            raw = _ws_recv(sock, pending)
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

        action = state.handle(msg)
        if action == "auth-challenge":
            challenge = msg[1]
            _log("NIP-42 challenge received, authenticating...")
            auth_evt = _nostr_event(KIND_NIP42, "", [
                ["relay", RELAY_URL],
                ["challenge", challenge],
            ], PRIV_HEX)
            state.set_auth_event(auth_evt)
            _ws_send(sock, json.dumps(["AUTH", auth_evt]))
            continue

        if action == "auth-confirmed":
            _log("NIP-42 authentication confirmed")
            # Subscribe and publish exactly once, after auth OK=true for the
            # exact AUTH event ID.
            _ws_send(sock, json.dumps(["REQ", sub_id, sub_filter]))
            command_evt = _nostr_event(
                KIND_CHAT, "@lengrowth get tasks", [["h", CHANNEL_ID]], PRIV_HEX
            )
            state.set_command_event(command_evt)
            _ws_send(sock, json.dumps(["EVENT", command_evt]))
            _log(f"published @lengrowth get tasks (event {command_evt['id'][:8]}...)")
            continue

        if action == "failure":
            print(f"[smoke] FAIL: {state.failure}", file=sys.stderr)
            sock.close()
            sys.exit(1)

        if action == "command-accepted":
            _log("relay accepted the exact command event")
            continue

        if action == "reply":
            event = state.reply_event
            _log(f"PASS: adapter replied (event {event.get('id', '')[:8]}...)")
            _log(f"  content: {event.get('content', '')[:120]}")
            sock.close()
            sys.exit(0)

    print(f"[smoke] FAIL: no adapter kind:9 reply within {TIMEOUT}s", file=sys.stderr)
    sock.close()
    sys.exit(1)


if __name__ == "__main__":
    main()
