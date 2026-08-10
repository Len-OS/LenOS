import { useState, useCallback } from "react";
import { Lock, Eye, EyeOff } from "lucide-react";
import { nip19 } from "nostr-tools";
import { decrypt } from "nostr-tools/nip49";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  setLocalNsec,
  clearLocalNsec,
  IDENTITY_STATE_CHANGE_EVENT,
} from "@/shared/lib/nostr-signer";

const ENCRYPTED_IDENTITY_KEY = "lenos_encrypted_identity";

interface EncryptedIdentity {
  ncryptsec: string;
  pubkey: string;
}

function getEncryptedIdentity(): EncryptedIdentity | null {
  try {
    const raw = localStorage.getItem(ENCRYPTED_IDENTITY_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as EncryptedIdentity;
  } catch {
    return null;
  }
}

interface Props {
  onRecovered: () => void;
}

export function KeyringLockedScreen({ onRecovered }: Props) {
  const stored = getEncryptedIdentity();
  const [password, setPassword] = useState("");
  const [isRevealed, setIsRevealed] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [error, setError] = useState("");
  const [showForgot, setShowForgot] = useState(false);

  const handleUnlock = useCallback(async () => {
    if (!stored || !password || isUnlocking) return;
    setIsUnlocking(true);
    setError("");
    try {
      const secretBytes = decrypt(stored.ncryptsec, password);
      const nsec = nip19.nsecEncode(secretBytes);
      setLocalNsec(nsec);
      onRecovered();
    } catch {
      setError("Wrong password. Try again.");
    } finally {
      setIsUnlocking(false);
    }
  }, [stored, password, isUnlocking, onRecovered]);

  const handleForgot = useCallback(() => {
    const confirmed = window.confirm(
      "This will permanently clear your stored identity from this browser. Make sure you have a backup before continuing.",
    );
    if (!confirmed) return;
    clearLocalNsec();
    localStorage.removeItem(ENCRYPTED_IDENTITY_KEY);
    localStorage.removeItem("lenos_identity_seen");
    window.dispatchEvent(new Event(IDENTITY_STATE_CHANGE_EVENT));
    window.location.reload();
  }, []);

  if (!stored) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
        <div className="flex w-full max-w-md flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <Lock className="h-8 w-8 text-amber-600 dark:text-amber-400" />
          </div>
          <h1 className="mt-6 text-2xl font-semibold text-foreground">
            Identity unavailable
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Your stored identity could not be loaded. Reload to try again, or
            set up a new identity.
          </p>
          <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
            <Button className="w-full" onClick={() => window.location.reload()}>
              Reload page
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                localStorage.removeItem("lenos_identity_seen");
                window.location.reload();
              }}
            >
              Set up new identity
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
          <Lock className="h-8 w-8 text-amber-600 dark:text-amber-400" />
        </div>
        <h1 className="mt-6 text-2xl font-semibold text-foreground">
          Welcome back
        </h1>
        <p className="mt-2 max-w-xs break-all font-mono text-xs text-muted-foreground">
          {stored.pubkey.slice(0, 20)}…
        </p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Enter your backup password to unlock your identity.
        </p>

        <form
          className="mt-8 w-full max-w-xs space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleUnlock();
          }}
        >
          <div className="relative">
            <Input
              autoFocus
              autoComplete="current-password"
              type={isRevealed ? "text" : "password"}
              placeholder="Backup password"
              className="h-10 pr-10 font-mono text-sm"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground"
              onClick={() => setIsRevealed((r) => !r)}
            >
              {isRevealed ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button
            className="w-full"
            type="submit"
            disabled={!password || isUnlocking}
          >
            {isUnlocking ? "Unlocking…" : "Unlock"}
          </Button>
          <button
            type="button"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setShowForgot(true)}
          >
            Forgot password?
          </button>
          {showForgot && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-left">
              <p className="text-xs text-destructive">
                Clearing your identity is permanent. Only proceed if you have a
                backup file and know your nsec.
              </p>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="mt-2 w-full"
                onClick={handleForgot}
              >
                Clear identity and start over
              </Button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
