import importlib.util
from pathlib import Path

import pytest


_SCRIPT = Path(__file__).with_name("smoke-agent.py")
_SPEC = importlib.util.spec_from_file_location("smoke_agent", _SCRIPT)
assert _SPEC and _SPEC.loader
smoke_agent = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(smoke_agent)


def _reply(**overrides):
    event = {
        "kind": 9,
        "pubkey": "adapter-pubkey",
        "tags": [["h", "channel-id"], ["e", "command-id", "relay", "reply"]],
    }
    event.update(overrides)
    return event


def _authenticated_state():
    state = smoke_agent.SmokeState("channel-id", "adapter-pubkey")
    state.set_auth_event({"id": "auth-id"})
    assert state.handle(["OK", "auth-id", True, "authenticated"]) == "auth-confirmed"
    state.set_command_event({"id": "command-id"})
    return state


def test_complete_ordered_auth_command_and_exact_reply_passes():
    state = smoke_agent.SmokeState("channel-id", "adapter-pubkey")

    assert state.handle(["AUTH", "challenge"]) == ("auth-challenge", "challenge")
    state.set_auth_event({"id": "auth-id"})
    assert state.handle(["OK", "auth-id", True, "authenticated"]) == "auth-confirmed"
    state.set_command_event({"id": "command-id"})
    assert state.handle(["OK", "command-id", True, "saved"]) == "command-accepted"
    assert state.handle(["EVENT", "smoke-sub", _reply()]) == "reply"
    assert state.reply_event == _reply()


def test_delayed_pre_auth_auth_required_rejection_is_unrelated():
    state = smoke_agent.SmokeState("channel-id", "adapter-pubkey")

    assert state.handle(["OK", "", True, "accepted"]) is None
    assert state.handle(["AUTH", "challenge"]) == ("auth-challenge", "challenge")
    state.set_auth_event({"id": "auth-id"})
    assert state.handle(["OK", "pre-auth-command", False, "auth-required"]) is None
    assert state.handle(["NOTICE", "authentication is pending"]) is None
    assert state.handle(["OK", "auth-id", True, "authenticated"]) == "auth-confirmed"
    state.set_command_event({"id": "command-id"})
    assert state.handle(["OK", "pre-auth-command", False, "auth-required"]) is None
    assert state.handle(["OK", "auth-id", True, "duplicate"]) is None
    assert state.handle(["EOSE", "smoke-sub"]) is None
    assert state.handle(["OK", "command-id", True, "saved"]) == "command-accepted"
    assert state.handle(["EVENT", "smoke-sub", _reply()]) == "reply"
    assert not state.failure


def test_auth_ok_false_is_fatal():
    state = smoke_agent.SmokeState("channel-id", "adapter-pubkey")
    state.set_auth_event({"id": "auth-id"})

    assert state.handle(["OK", "auth-id", False, "invalid: bad signature"]) == "failure"
    assert "authentication rejected" in state.failure
    assert not state.auth_confirmed


def test_authenticated_command_ok_false_is_fatal():
    state = _authenticated_state()

    assert state.handle(["OK", "command-id", False, "restricted"]) == "failure"
    assert "command rejected" in state.failure
    assert not state.command_accepted


@pytest.mark.parametrize(
    "event",
    [
        _reply(pubkey="other-pubkey"),
        _reply(kind=1),
        _reply(tags=[["h", "other-channel"], ["e", "command-id"]]),
        _reply(tags=[["h", "channel-id"], ["e", "other-command"]]),
    ],
)
def test_wrong_adapter_channel_kind_or_e_tag_never_passes(event):
    state = _authenticated_state()

    assert state.handle(["EVENT", "smoke-sub", event]) is None
    assert state.reply_event is None


def test_reply_without_confirmed_command_acceptance_does_not_pass():
    state = _authenticated_state()

    assert state.handle(["EVENT", "smoke-sub", _reply()]) is None
    assert state.reply_event is None
    assert not state.command_accepted


def test_unrelated_ok_does_not_mark_command_accepted_or_report_success():
    state = _authenticated_state()

    assert state.handle(["OK", "unrelated-event", True, "saved"]) is None
    assert not state.command_accepted
    assert state.reply_event is None


def test_timeout_without_exact_reply_has_no_success_state():
    state = _authenticated_state()

    assert state.handle(["NOTICE", "adapter unavailable"]) is None
    assert state.handle(["EOSE", "smoke-sub"]) is None
    assert state.handle(["EVENT", "smoke-sub", _reply(tags=[["h", "channel-id"]])]) is None
    assert state.reply_event is None


def test_websocket_receive_consumes_handshake_remainder_before_socket():
    payload = b'["AUTH","challenge"]'
    frame = bytes([0x81, len(payload)]) + payload

    class NoReadSocket:
        def recv(self, _size):
            raise AssertionError("socket read should not be needed")

    pending = bytearray(frame)
    assert smoke_agent._ws_recv(NoReadSocket(), pending) == payload.decode()
    assert pending == bytearray()


def test_websocket_ping_is_masked_control_frame():
    class CaptureSocket:
        def __init__(self):
            self.sent = b""

        def sendall(self, data):
            self.sent += data

    sock = CaptureSocket()
    smoke_agent._ws_ping(sock)
    assert sock.sent[:2] == bytes([0x89, 0x80])
    assert len(sock.sent) == 6
