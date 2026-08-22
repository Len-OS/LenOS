#!/usr/bin/env python3
"""
Provision or retrieve the smoke-test channel in lenos-e2e32.

Creates a new open-visibility channel called "smoke-test" in the lenos-e2e32
community via the operator API, then prints the channel UUID for use as
SMOKE_CHANNEL_ID in GitHub Secrets.

Usage:
    RELAY_HTTP_URL=https://relay.lengrowth.com \
    RELAY_OPERATOR_API_ORIGIN=https://relay.lengrowth.com \
    RELAY_OPERATOR_PRIVKEY_HEX=<64-char-hex> \
    COMMUNITY_ID=328be86d-0ce7-4a75-a6e2-919bbeb1782b \
    python3 scripts/provision-smoke-channel.py

Env vars:
    RELAY_HTTP_URL              Base HTTP URL of the relay (no trailing slash).
    RELAY_OPERATOR_API_ORIGIN   Origin used in NIP-98 URL construction.
    RELAY_OPERATOR_PRIVKEY_HEX  64-char hex private key of a relay operator.
    COMMUNITY_ID                UUID of the community to provision in.
    CHANNEL_NAME                Channel name (default: smoke-test).
"""
import hashlib
import json
import os
import ssl
import sys
import time
import urllib.request
import urllib.error
from base64 import b64encode
from os import urandom

# ── secp256k1 / BIP-340 Schnorr (pure Python, no external deps) ─────────────

_P  = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F
_N  = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
_G  = (0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798,
       0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8)


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
    return Q


def _tagged(tag, data):
    h = hashlib.sha256(tag.encode()).digest()
    return hashlib.sha256(h + h + data).digest()


def _pubkey_hex(priv_hex):
    return _pmul(int.from_bytes(bytes.fromhex(priv_hex), 'big'))[0].to_bytes(32, 'big').hex()


def _schnorr_sign(msg_hex, priv_hex):
    d0  = int.from_bytes(bytes.fromhex(priv_hex), 'big')
    msg = bytes.fromhex(msg_hex)
    P   = _pmul(d0)
    d   = d0 if P[1] % 2 == 0 else _N - d0
    Px  = P[0].to_bytes(32, 'big')
    t   = (d ^ int.from_bytes(_tagged("BIP0340/aux", b'\x00' * 32), 'big')).to_bytes(32, 'big')
    k0  = int.from_bytes(_tagged("BIP0340/nonce", t + Px + msg), 'big') % _N
    if k0 == 0:
        raise ValueError("degenerate nonce")
    R   = _pmul(k0)
    k   = k0 if R[1] % 2 == 0 else _N - k0
    Rx  = R[0].to_bytes(32, 'big')
    e   = int.from_bytes(_tagged("BIP0340/challenge", Rx + Px + msg), 'big') % _N
    s   = (k + e * d) % _N
    return (Rx + s.to_bytes(32, 'big')).hex()


def _nostr_event(kind, content, tags, priv_hex):
    pubkey     = _pubkey_hex(priv_hex)
    created_at = int(time.time())
    serial     = json.dumps([0, pubkey, created_at, kind, tags, content],
                            separators=(',', ':'))
    event_id   = hashlib.sha256(serial.encode()).hexdigest()
    sig        = _schnorr_sign(event_id, priv_hex)
    return {"id": event_id, "pubkey": pubkey, "created_at": created_at,
            "kind": kind, "tags": tags, "content": content, "sig": sig}


def _nip98_header(priv_hex, url, method, body_bytes=None):
    tags = [["u", url], ["method", method]]
    if body_bytes is not None:
        payload_hash = hashlib.sha256(body_bytes).hexdigest()
        tags.append(["payload", payload_hash])
    event = _nostr_event(27235, "", tags, priv_hex)
    encoded = b64encode(json.dumps(event, separators=(',', ':')).encode()).decode()
    return f"Nostr {encoded}"


def operator_post(base_url, api_origin, priv_hex, path, payload):
    url = f"{base_url}{path}"
    canonical_url = f"{api_origin}{path}"
    body = json.dumps(payload).encode()
    auth = _nip98_header(priv_hex, canonical_url, "POST", body)

    ctx = ssl.create_default_context()
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": auth,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body_text = e.read().decode('utf-8', 'replace')
        raise RuntimeError(f"HTTP {e.code}: {body_text}") from e


def main():
    relay_http = os.environ.get("RELAY_HTTP_URL", "https://relay.lengrowth.com").rstrip("/")
    api_origin = os.environ.get("RELAY_OPERATOR_API_ORIGIN", relay_http).rstrip("/")
    priv_hex   = os.environ["RELAY_OPERATOR_PRIVKEY_HEX"]
    community  = os.environ.get("COMMUNITY_ID", "328be86d-0ce7-4a75-a6e2-919bbeb1782b")
    name       = os.environ.get("CHANNEL_NAME", "smoke-test")

    print(f"Provisioning channel '{name}' in community {community}...")
    print(f"Relay:   {relay_http}")
    print(f"Origin:  {api_origin}")
    print(f"Operator pubkey: {_pubkey_hex(priv_hex)}")

    result = operator_post(
        relay_http, api_origin, priv_hex,
        f"/operator/communities/{community}/channels",
        {"name": name, "visibility": "open", "description": "Automated E2E smoke test channel"},
    )
    channel_id = result["channel_id"]
    created    = result.get("created", True)
    print()
    print(f"{'Created' if created else 'Already exists'}: {name}")
    print(f"channel_id = {channel_id}")
    print()
    print("Set this as SMOKE_CHANNEL_ID in GitHub Secrets:")
    print(f"  gh secret set SMOKE_CHANNEL_ID --body '{channel_id}' --repo Len-OS/LenOS")


if __name__ == "__main__":
    main()
