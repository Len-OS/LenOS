import { useState } from "react";
import { getCurrentPubkey, signNostrEvent } from "@/shared/lib/nostr-signer";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

interface Props {
  onComplete: () => void;
}

export function ProfileSetupStep({ onComplete }: Props) {
  const [name, setName] = useState("");
  const [picture, setPicture] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const pubkey = await getCurrentPubkey();
      if (!pubkey) throw new Error("No identity available.");
      const content = JSON.stringify({
        name: name.trim(),
        picture: picture.trim(),
      });
      const signed = await signNostrEvent(
        { kind: 0, content, tags: [] },
        { requireNip07: false },
      );
      getRelayClient(relayWsUrl()).publish(signed as Record<string, unknown>);
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save profile.");
    }
    setSaving(false);
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-black dark:text-white">
          Set up your profile
        </h2>
        <p className="mt-2 text-sm text-black/50 dark:text-white/50">
          You can change this at any time in settings.
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-4">
        <div>
          <label
            htmlFor="setup-name"
            className="mb-1.5 block text-sm font-medium text-black/70 dark:text-white/70"
          >
            Display name
          </label>
          <input
            id="setup-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2.5 text-sm text-black outline-none focus:border-black/30 dark:border-white/15 dark:text-white dark:focus:border-white/30"
          />
        </div>

        <div>
          <label
            htmlFor="setup-picture"
            className="mb-1.5 block text-sm font-medium text-black/70 dark:text-white/70"
          >
            Picture URL (optional)
          </label>
          <input
            id="setup-picture"
            type="url"
            value={picture}
            onChange={(e) => setPicture(e.target.value)}
            placeholder="https://…"
            className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2.5 text-sm text-black outline-none focus:border-black/30 dark:border-white/15 dark:text-white dark:focus:border-white/30"
          />
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onComplete}
            className="flex-1 rounded-lg border border-black/15 px-4 py-2.5 text-sm font-medium text-black/60 hover:bg-black/5 dark:border-white/15 dark:text-white/60 dark:hover:bg-white/5"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !name.trim()}
            className="flex-1 rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-black/80 disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-white/80"
          >
            {saving ? "Saving…" : "Save & continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
