import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { Check, Eye, EyeOff, KeyRound, AlertTriangle } from "lucide-react";
import { nip19 } from "nostr-tools";
import { getPublicKey } from "nostr-tools/pure";
import { decrypt } from "nostr-tools/nip49";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { setLocalNsec } from "@/shared/lib/nostr-signer";
import {
  classifyKeyImportInput,
  isPlausibleNcryptsec,
  keyImportSubmitEnabled,
  nsecToNpub,
} from "../lib/keyImportInput";

const KEY_FILE_MAX_BYTES = 1024;

interface Props {
  onComplete: (pubkey: string) => void;
  onSkip: () => void;
}

export function KeyImportStep({ onComplete, onSkip }: Props) {
  const [input, setInput] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const passphraseRef = useRef<HTMLInputElement | null>(null);

  const trimmedInput = input.trim();
  const inputKind = classifyKeyImportInput(input);
  const isPasswordStage = isPlausibleNcryptsec(input);
  const previewNpub = useMemo(() => nsecToNpub(input), [input]);
  const isValid = keyImportSubmitEnabled(input, passphrase);
  const hasInput = trimmedInput.length > 0;
  const showInvalidHint =
    hasInput &&
    !isPasswordStage &&
    previewNpub === null &&
    trimmedInput.length >= 5;

  useEffect(() => {
    if (!hasInput) setIsRevealed(false);
  }, [hasInput]);

  useEffect(() => {
    if (!isPasswordStage) setPassphrase("");
  }, [isPasswordStage]);

  useEffect(() => {
    if (isPasswordStage) passphraseRef.current?.focus();
  }, [isPasswordStage]);

  const handleFiles = useCallback(async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (file.size > KEY_FILE_MAX_BYTES) {
      setError("File too large to be a key backup.");
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
      if (inputKind === "ncryptsec") {
        const secretBytes = decrypt(trimmedInput, passphrase);
        const pubkeyHex = getPublicKey(secretBytes);
        const nsec = nip19.nsecEncode(secretBytes);
        setLocalNsec(nsec);
        onComplete(pubkeyHex);
      } else if (trimmedInput.startsWith("nsec1")) {
        const decoded = nip19.decode(trimmedInput);
        if (decoded.type !== "nsec") {
          setError("Invalid nsec key.");
          return;
        }
        const pubkeyHex = getPublicKey(decoded.data);
        setLocalNsec(trimmedInput);
        onComplete(pubkeyHex);
      } else {
        setError("A public key (npub) cannot sign — paste your nsec or ncryptsec backup.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to import key.");
    } finally {
      setIsImporting(false);
    }
  }, [isValid, isImporting, inputKind, trimmedInput, passphrase, onComplete]);

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-black/5 dark:bg-white/5">
        <KeyRound className="h-7 w-7 text-black/50 dark:text-white/50" />
      </div>

      <div className="text-center">
        <h2 className="text-xl font-semibold text-black dark:text-white">
          Import your Nostr key
        </h2>
        <p className="mt-2 text-sm text-black/50 dark:text-white/50">
          Bring your existing identity or skip to generate a new one.
        </p>
      </div>

      <form
        className="w-full max-w-sm space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void handleImport();
        }}
      >
        {!isPasswordStage && (
          <>
            <div className="relative">
              <Input
                id="key-input"
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
              />
              {hasInput && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setIsRevealed((r) => !r)}
                  aria-label={isRevealed ? "Hide key" : "Reveal key"}
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
              className={`relative flex h-24 w-full flex-col items-center justify-center gap-2 rounded-xl border border-transparent bg-black/[0.03] text-sm transition-colors hover:bg-black/[0.06] dark:bg-white/[0.03] dark:hover:bg-white/[0.06] ${
                isDragging
                  ? "border-primary bg-primary/10 text-primary dark:bg-primary/10"
                  : "text-black/50 dark:text-white/50"
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
              <KeyRound className="h-5 w-5" />
              <span className="text-xs font-medium">
                Drop a key file or click to browse
              </span>
            </button>
          </>
        )}

        {isPasswordStage && (
          <div className="space-y-3">
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-center">
              <p className="text-xs font-medium text-primary">
                Encrypted backup detected
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Enter backup password to decrypt
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
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground"
                onClick={() => setIsRevealed((r) => !r)}
                aria-label={isRevealed ? "Hide password" : "Reveal password"}
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

        {!isPasswordStage && previewNpub && (
          <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 space-y-0.5">
              <p className="text-xs font-medium text-foreground">
                Nostr identity found
              </p>
              <p className="break-all font-mono text-[10px] text-muted-foreground">
                {previewNpub}
              </p>
            </div>
          </div>
        )}

        {showInvalidHint && !error && (
          <p className="text-xs text-muted-foreground">
            {inputKind === "ncryptsec"
              ? "Waiting for complete ncryptsec backup"
              : "Waiting for valid nsec1 key"}
          </p>
        )}

        <div className="flex items-start gap-2 rounded-lg bg-yellow-50 p-3 dark:bg-yellow-900/10">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
          <p className="text-xs text-yellow-800 dark:text-yellow-300">
            Your private key is stored locally and never sent to any server.
          </p>
        </div>

        {error && (
          <p className="text-center text-xs text-destructive">{error}</p>
        )}

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onSkip}
            type="button"
          >
            Skip
          </Button>
          <Button
            className="flex-1"
            type="submit"
            disabled={!isValid || isImporting}
          >
            {isImporting ? "Importing…" : "Import Key"}
          </Button>
        </div>
      </form>
    </div>
  );
}
