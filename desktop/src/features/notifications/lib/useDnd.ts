import { useCallback, useEffect, useRef, useState } from "react";
import { relayClient } from "@/shared/api/relayClient";
import { signRelayEvent } from "@/shared/api/tauri";
import type { RelayEvent } from "@/shared/api/types";
import { KIND_READ_STATE } from "@/shared/constants/kinds";
import { setDndActive } from "./dndStateStore";

const D_TAG = "dnd";

type DndContent = {
  enabled: boolean;
  expires_at: number | null;
};

function parseDndContent(raw: string): DndContent | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.enabled !== "boolean") return null;
    return {
      enabled: obj.enabled,
      expires_at: typeof obj.expires_at === "number" ? obj.expires_at : null,
    };
  } catch {
    return null;
  }
}

export function useDnd(currentPubkey: string | null): {
  isDndActive: boolean;
  expiresAt: number | null;
  enable: (durationSeconds: number | null) => Promise<void>;
  disable: () => Promise<void>;
} {
  const [isDndActive, setIsDndActive] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disableRef = useRef<() => Promise<void>>(async () => {});

  const applyState = useCallback((content: string) => {
    const parsed = parseDndContent(content);
    if (!parsed) return;
    const now = Math.floor(Date.now() / 1000);
    const active =
      parsed.enabled && (parsed.expires_at === null || parsed.expires_at > now);
    setDndActive(active);
    setIsDndActive(active);
    setExpiresAt(active ? parsed.expires_at : null);
  }, []);

  const publish = useCallback(
    async (enabled: boolean, expires_at: number | null) => {
      const content = JSON.stringify({ enabled, expires_at });
      const event = await signRelayEvent({
        kind: KIND_READ_STATE,
        content,
        tags: [["d", D_TAG]],
      });
      await relayClient.publishEvent(
        event,
        "Timed out publishing DnD setting.",
        "Failed to publish DnD setting.",
      );
    },
    [],
  );

  const disable = useCallback(async () => {
    await publish(false, null);
    setDndActive(false);
    setIsDndActive(false);
    setExpiresAt(null);
  }, [publish]);

  disableRef.current = disable;

  const enable = useCallback(
    async (durationSeconds: number | null) => {
      const expires_at =
        durationSeconds !== null
          ? Math.floor(Date.now() / 1000) + durationSeconds
          : null;
      await publish(true, expires_at);
      setDndActive(true);
      setIsDndActive(true);
      setExpiresAt(expires_at);
    },
    [publish],
  );

  useEffect(() => {
    if (!currentPubkey) {
      setDndActive(false);
      setIsDndActive(false);
      setExpiresAt(null);
      return;
    }

    void relayClient
      .fetchEvents({
        kinds: [KIND_READ_STATE],
        authors: [currentPubkey],
        "#d": [D_TAG],
        limit: 1,
      })
      .then((events) => {
        if (events.length > 0) applyState(events[0].content);
      })
      .catch(() => {});

    let unsub: (() => Promise<void>) | null = null;
    let cancelled = false;

    void relayClient
      .subscribeLive(
        {
          kinds: [KIND_READ_STATE],
          authors: [currentPubkey],
          "#d": [D_TAG],
          limit: 0,
        },
        (event: RelayEvent) => {
          applyState(event.content);
        },
      )
      .then((dispose) => {
        if (cancelled) {
          void dispose();
        } else {
          unsub = dispose;
        }
      });

    return () => {
      cancelled = true;
      if (unsub) void unsub();
    };
  }, [currentPubkey, applyState]);

  useEffect(() => {
    if (expiryTimerRef.current !== null) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
    if (expiresAt !== null) {
      const ms = expiresAt * 1000 - Date.now();
      if (ms > 0) {
        expiryTimerRef.current = setTimeout(() => {
          void disableRef.current();
        }, ms);
      } else {
        void disableRef.current();
      }
    }
    return () => {
      if (expiryTimerRef.current !== null) {
        clearTimeout(expiryTimerRef.current);
        expiryTimerRef.current = null;
      }
    };
  }, [expiresAt]);

  return { isDndActive, expiresAt, enable, disable };
}
