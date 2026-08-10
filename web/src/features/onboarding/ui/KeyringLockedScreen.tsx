import { useState, useCallback, useRef } from "react";
import {
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  Check,
  AlertTriangle,
} from "lucide-react";
import { nip19 } from "nostr-tools";
import { getPublicKey } from "nostr-tools/pure";
import { decrypt } from "nostr-tools/nip49";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { setLocalNsec, IDENTITY_STATE_CHANGE_EVENT } from "@/shared/lib/nostr-signer";
import {
  classifyKeyImportInput,
  isPlausibleNcryptsec,
  keyImportSubmitEnabled,
  nsecToNpub,
} from "../lib/keyImportInput";

const KEY_FILE_MAX_BYTES = 1024;

interface Props {
  onRecovered: () => void;
}

export function KeyringLockedScreen({ onRecovered }: Props) {
  const [showImport, setShowImport] = useState(false);
  const [input, setInput] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [isRevealed, setIsRevealed] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const passphraseRef = useRef<HTMLInputElement | null>(null);

  const trimmedInput = input.trim();
  const isPasswordStage = isPlausibleNcryptsec(input);
  const isValid = keyImportSubmitEnabled(input, passphrase);
  const previewNpub = nsecToNpub(input);
  const hasInput = trimmedInput.length > 0;

  const handleFiles = useCallback(async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (file.size > KEY_FILE_MAX_BYTES) {
      setError("File too large.");
      return;
    }
    try {
      const text = await file.text();
      const firstLine =
        text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
      setInput(firstLine.trim());
      setError("");
    } catch {
      setError("Could not read file.");
    }
  }, []);

  const handleImport = useCallback(async () => {
    if (!isValid || isImporting) return;
    setIsImporting(true);
    setError("");

    try {
      let nsec: string;
      if (classifyKeyImportInput(input) === "ncryptsec") {
        const secretBytes = decrypt(trimmedInput, passphrase);
        nsec = nip19.nsecEncode(secretBytes);
      } else {
        nsec = trimmedInput;
      }

      const decoded = nip19.decode(nsec);
      if (decoded.type !== "nsec") {
        setError("Invalid key.");
        return;
      }
      getPublicKey(decoded.data);
      setLocalNsec(nsec);
      window.dispatchEvent(new Event(IDENTITY_STATE_CHANGE_EVENT));
      onRecovered();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to import key.");
    } finally {
      setIsImporting(false);
    }
  }, [isValid, isImporting, input, trimmedInput, passphrase, onRecovered]);

  const handleReload = useCallback(() => {
    window.location.reload();
  }, []);

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
          Your stored identity could not be loaded. This can happen if browser
          storage was cleared or you're in a different browser profile. Reload
          to try again, or re-import your key from a backup.
        </p>

        {!showImport ? (
          <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
            <Button className="w-full" onClick={handleReload}>
              Reload page
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => setShowImport(true)}
            >
              Re-import your key
            </Button>
          </div>
        ) : (
          <form
            className="mt-8 w-full space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handleImport();
            }}
          >
            {!isPasswordStage && (
              <>
                <div className="relative">
                  <Input
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    type={isRevealed ? "text" : "password"}
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      setError("");
                    }}
                    placeholder="nsec1… or ncryptsec1…"
                    className="h-10 pr-10 font-mono text-sm"
                    autoFocus
                  />
                  {hasInput && (
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
                  )}
                </div>

                <input
                  type="file"
                  accept=".key,.ncryptsec,text/plain"
                  className="sr-only"
                  ref={fileInputRef}
                  onChange={(e) => {
                    void handleFiles(e.currentTarget.files);
                    e.currentTarget.value = "";
                  }}
                  tabIndex={-1}
                />
                <button
                  type="button"
                  className={`flex h-20 w-full items-center justify-center gap-2 rounded-xl border border-transparent bg-muted text-sm transition-colors hover:bg-muted/80 ${
                    isDragging
                      ? "border-primary bg-primary/10 text-primary"
                      : "text-muted-foreground"
                  }`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setIsDragging(false);
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    void handleFiles(e.dataTransfer.files);
                  }}
                >
                  <KeyRound className="h-4 w-4" />
                  Drop a backup file or click to browse
                </button>
              </>
            )}

            {isPasswordStage && (
              <div className="space-y-3">
                <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-center">
                  <p className="text-xs font-medium text-primary">
                    Encrypted backup detected
                  </p>
                </div>
                <div className="relative">
                  <Input
                    autoComplete="current-password"
                    type={isRevealed ? "text" : "password"}
                    value={passphrase}
                    onChange={(e) => {
                      setPassphrase(e.target.value);
                      setError("");
                    }}
                    placeholder="Backup password"
                    className="h-10 pr-10 font-mono text-sm"
                    ref={passphraseRef}
                    autoFocus
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
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-xs text-muted-foreground"
                  onClick={() => {
                    setInput("");
                    setPassphrase("");
                    setError("");
                  }}
                >
                  Use a different key
                </Button>
              </div>
            )}

            {previewNpub && (
              <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">
                    Identity found
                  </p>
                  <p className="break-all font-mono text-[10px] text-muted-foreground">
                    {previewNpub}
                  </p>
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                type="button"
                onClick={() => setShowImport(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                type="submit"
                disabled={!isValid || isImporting}
              >
                {isImporting ? "Importing…" : "Restore identity"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
