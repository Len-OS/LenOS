import { useState } from "react";
import { nip19 } from "nostr-tools";

interface Props {
  onComplete: () => void;
}

export function IdentityStep({ onComplete }: Props) {
  const [nsecInput, setNsecInput] = useState("");
  const [error, setError] = useState("");

  const importNsec = () => {
    setError("");
    try {
      const decoded = nip19.decode(nsecInput.trim());
      if (decoded.type !== "nsec") {
        setError("Not a valid nsec key.");
        return;
      }
      const privkeyBytes = decoded.data as Uint8Array;
      const privkeyHex = Array.from(privkeyBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      localStorage.setItem("lenos_privkey", privkeyHex);
      onComplete();
    } catch {
      setError("Invalid key format.");
    }
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-black dark:text-white">
          Set up your identity
        </h2>
        <p className="mt-2 text-sm text-black/50 dark:text-white/50">
          Use a Nostr browser extension or import a key to get started.
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-3">
        <p className="text-sm font-medium text-black/70 dark:text-white/70">
          Connect browser extension
        </p>
        <a
          href="https://getalby.com"
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center rounded-lg border border-black/15 px-4 py-3 text-sm font-medium text-black hover:bg-black/5 dark:border-white/15 dark:text-white dark:hover:bg-white/5"
        >
          Install Alby
        </a>
        <a
          href="https://github.com/fiatjaf/nos2x"
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center rounded-lg border border-black/15 px-4 py-3 text-sm font-medium text-black hover:bg-black/5 dark:border-white/15 dark:text-white dark:hover:bg-white/5"
        >
          Install nos2x
        </a>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
          <span className="text-xs text-black/40 dark:text-white/40">or</span>
          <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
        </div>

        <div>
          <label
            htmlFor="onboard-nsec"
            className="mb-1.5 block text-sm font-medium text-black/70 dark:text-white/70"
          >
            Import key
          </label>
          <input
            id="onboard-nsec"
            type="password"
            value={nsecInput}
            onChange={(e) => setNsecInput(e.target.value)}
            placeholder="nsec1…"
            className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2.5 text-sm text-black outline-none focus:border-black/30 dark:border-white/15 dark:text-white dark:focus:border-white/30"
          />
          {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
        </div>

        <button
          type="button"
          onClick={importNsec}
          disabled={!nsecInput.trim()}
          className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-black/80 disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-white/80"
        >
          Import key
        </button>
      </div>
    </div>
  );
}
