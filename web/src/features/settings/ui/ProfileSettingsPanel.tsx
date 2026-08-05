import { useState, useEffect } from "react";
import { getCurrentPubkey, signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";
import { queryEvents } from "@/shared/lib/nostr-client";

interface Profile {
  name: string;
  about: string;
  picture: string;
}

export function ProfileSettingsPanel() {
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [form, setForm] = useState<Profile>({
    name: "",
    about: "",
    picture: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getCurrentPubkey().then((pk) => {
      setPubkey(pk);
      if (!pk) return;
      queryEvents(relayWsUrl(), { kinds: [0], authors: [pk], limit: 1 }).then(
        (events) => {
          const e = events[0];
          if (!e) return;
          try {
            const meta = JSON.parse(e.content as string) as Partial<Profile>;
            setForm({
              name: meta.name ?? "",
              about: meta.about ?? "",
              picture: meta.picture ?? "",
            });
          } catch {}
        },
      );
    });
  }, []);

  const save = async () => {
    if (!pubkey) return;
    setSaving(true);
    try {
      const signed = await signNostrEvent(
        { kind: 0, content: JSON.stringify(form), tags: [] },
        { requireNip07: true },
      );
      getRelayClient(relayWsUrl()).publish(signed as Record<string, unknown>);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    setSaving(false);
  };

  return (
    <div className="max-w-md">
      <div className="mb-4">
        <label
          htmlFor="profile-name"
          className="mb-1 block text-sm font-medium text-black/70 dark:text-white/70"
        >
          Display name
        </label>
        <input
          id="profile-name"
          type="text"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-black/30 dark:border-white/15 dark:text-white dark:focus:border-white/30"
        />
      </div>
      <div className="mb-4">
        <label
          htmlFor="profile-about"
          className="mb-1 block text-sm font-medium text-black/70 dark:text-white/70"
        >
          About
        </label>
        <textarea
          id="profile-about"
          value={form.about}
          onChange={(e) => setForm((f) => ({ ...f, about: e.target.value }))}
          rows={3}
          className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-black/30 dark:border-white/15 dark:text-white dark:focus:border-white/30"
        />
      </div>
      <div className="mb-6">
        <label
          htmlFor="profile-picture"
          className="mb-1 block text-sm font-medium text-black/70 dark:text-white/70"
        >
          Picture URL
        </label>
        <input
          id="profile-picture"
          type="text"
          value={form.picture}
          onChange={(e) => setForm((f) => ({ ...f, picture: e.target.value }))}
          className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-black/30 dark:border-white/15 dark:text-white dark:focus:border-white/30"
        />
      </div>
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving || !pubkey}
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/80 disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-white/80"
      >
        {saved ? "Saved!" : saving ? "Saving…" : "Save profile"}
      </button>
    </div>
  );
}
