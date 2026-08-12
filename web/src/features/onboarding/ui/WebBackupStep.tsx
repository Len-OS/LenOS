import { useState, useCallback } from "react";
import { Download, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { nip19 } from "nostr-tools";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { getCurrentPubkey } from "@/shared/lib/nostr-signer";
import {
  createNcryptsecBackup,
  downloadBackupFile,
  verifyNcryptsecBackup,
  MIN_PASSPHRASE_LEN,
} from "../lib/backupCrypto";

const ENCRYPTED_IDENTITY_KEY = "lenos_encrypted_identity";

interface Props {
  onComplete: () => void;
  onSkip: () => void;
}

type Stage = "password" | "download" | "done";

export function WebBackupStep({ onComplete, onSkip }: Props) {
  const [stage, setStage] = useState<Stage>("password");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isRevealed, setIsRevealed] = useState(false);
  const [, setNcryptsec] = useState("");
  const [verifyInput, setVerifyInput] = useState("");
  const [verifyPassword, setVerifyPassword] = useState("");
  const [error, setError] = useState("");
  const [isWorking, setIsWorking] = useState(false);

  const handleCreateBackup = useCallback(async () => {
    if (password.length < MIN_PASSPHRASE_LEN) {
      setError(`Password must be at least ${MIN_PASSPHRASE_LEN} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setIsWorking(true);
    setError("");
    try {
      const encrypted = createNcryptsecBackup(password);
      setNcryptsec(encrypted);
      const pubkeyHex = await getCurrentPubkey();
      if (pubkeyHex) {
        const npub = nip19.npubEncode(pubkeyHex);
        localStorage.setItem(
          ENCRYPTED_IDENTITY_KEY,
          JSON.stringify({ ncryptsec: encrypted, pubkey: npub }),
        );
      }
      downloadBackupFile(encrypted);
      setStage("download");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create backup.");
    } finally {
      setIsWorking(false);
    }
  }, [password, confirmPassword]);

  const handleVerify = useCallback(() => {
    setError("");
    try {
      const result = verifyNcryptsecBackup(verifyInput.trim(), verifyPassword);
      if (!result.matchesCurrentIdentity) {
        setError("This backup file doesn't match your current identity.");
        return;
      }
      setStage("done");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not verify backup — wrong file or password.",
      );
    }
  }, [verifyInput, verifyPassword]);

  const handleFileDrop = useCallback(async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (file.size > 1024) {
      setError("File too large.");
      return;
    }
    try {
      const text = await file.text();
      const firstLine =
        text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
      setVerifyInput(firstLine.trim());
      setError("");
    } catch {
      setError("Could not read file.");
    }
  }, []);

  if (stage === "done") {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/30">
          <ShieldCheck className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-black dark:text-white">
            Backup verified
          </h2>
          <p className="mt-2 text-sm text-black/50 dark:text-white/50">
            Your file and password can restore your identity.
          </p>
        </div>
        <Button className="w-full max-w-sm" onClick={onComplete}>
          Continue
        </Button>
      </div>
    );
  }

  if (stage === "download") {
    return (
      <div className="flex flex-col items-center gap-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-black/5 dark:bg-white/5">
          <ShieldCheck className="h-7 w-7 text-black/50 dark:text-white/50" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-semibold text-black dark:text-white">
            Backup downloaded
          </h2>
          <p className="mt-2 text-sm text-black/50 dark:text-white/50">
            Optionally verify your backup by dropping the file back and entering
            your password.
          </p>
        </div>
        <div className="flex w-full max-w-sm flex-col gap-3">
          <button
            type="button"
            className="flex h-20 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-black/20 bg-black/[0.02] text-sm text-black/50 transition-colors hover:bg-black/[0.05] dark:border-white/20 dark:bg-white/[0.02] dark:text-white/50 dark:hover:bg-white/[0.05]"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void handleFileDrop(e.dataTransfer.files);
            }}
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = ".ncryptsec,.key,text/plain";
              input.onchange = () => void handleFileDrop(input.files);
              input.click();
            }}
          >
            Drop backup file here to verify
          </button>
          {verifyInput && (
            <Input
              type="password"
              placeholder="Backup password"
              className="h-10 font-mono text-sm"
              value={verifyPassword}
              onChange={(e) => {
                setVerifyPassword(e.target.value);
                setError("");
              }}
            />
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
          {verifyInput && verifyPassword && (
            <Button className="w-full" onClick={handleVerify}>
              Verify backup
            </Button>
          )}
          <Button
            variant="ghost"
            className="w-full text-black/50 dark:text-white/50"
            onClick={onComplete}
          >
            Skip verification
          </Button>
        </div>
      </div>
    );
  }

  // stage === "password"
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-black/5 dark:bg-white/5">
        <Download className="h-7 w-7 text-black/50 dark:text-white/50" />
      </div>
      <div className="text-center">
        <h2 className="text-xl font-semibold text-black dark:text-white">
          Back up your key
        </h2>
        <p className="mt-2 text-sm text-black/50 dark:text-white/50">
          Create an encrypted backup file. You need both the file and this
          password to restore your identity.
        </p>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-4">
        <div className="relative">
          <Input
            type={isRevealed ? "text" : "password"}
            placeholder={`Password (min ${MIN_PASSPHRASE_LEN} chars)`}
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
        <Input
          type="password"
          placeholder="Confirm password"
          className="h-10 font-mono text-sm"
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            setError("");
          }}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onSkip}
            type="button"
          >
            Skip for now
          </Button>
          <Button
            className="flex-1"
            onClick={() => void handleCreateBackup()}
            disabled={
              isWorking ||
              password.length < MIN_PASSPHRASE_LEN ||
              !confirmPassword
            }
            type="button"
          >
            {isWorking ? "Creating…" : "Create backup"}
          </Button>
        </div>
      </div>
    </div>
  );
}
