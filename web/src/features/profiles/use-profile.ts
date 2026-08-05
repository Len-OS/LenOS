import { queryEvents } from "@/shared/lib/nostr-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { useEffect, useState } from "react";

interface Profile {
  name: string;
  picture?: string;
  about?: string;
}

const cache = new Map<string, Profile | null>();
const pending = new Set<string>();

export function useProfile(pubkey: string): Profile | null {
  const [profile, setProfile] = useState<Profile | null>(
    cache.get(pubkey) ?? null,
  );

  useEffect(() => {
    if (cache.has(pubkey) || pending.has(pubkey)) return;
    pending.add(pubkey);

    queryEvents(relayWsUrl(), { kinds: [0], authors: [pubkey], limit: 1 })
      .then((events) => {
        if (events.length > 0) {
          try {
            const data = JSON.parse(events[0].content) as {
              name?: string;
              display_name?: string;
              picture?: string;
              about?: string;
            };
            const p: Profile = {
              name: data.name ?? data.display_name ?? "",
              picture: data.picture,
              about: data.about,
            };
            cache.set(pubkey, p);
            setProfile(p);
          } catch {
            cache.set(pubkey, null);
          }
        } else {
          cache.set(pubkey, null);
        }
      })
      .catch(() => cache.set(pubkey, null))
      .finally(() => pending.delete(pubkey));
  }, [pubkey]);

  return profile;
}
