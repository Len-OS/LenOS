import { useState, useRef, useCallback } from "react";
import {
  Download,
  Shield,
  Key,
  Eye,
  EyeOff,
  RefreshCw,
  Check,
  FileKey2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  createNcryptsecBackup,
  verifyNcryptsecBackup,
  downloadBackupFile,
  generatePassphrase,
  getStoredNsec,
  MIN_PASSPHRASE_LEN,
  type BackupVerification,
} from "@/features/onboarding/lib/backupCrypto";

type Stage = "create" | "test-drop" | "test-password" | "test-success";

export function BackupSettingsPanel() {
  const [stage, setStage] = useState<Stage>("create");
  const [password, setPassword] = useState("");
  const [isRevealed, setIsRevealed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [ncryptsec, setNcryptsec] = useState<string | null>(null);

  // Test flow state
  const [testFile, setTestFile] = useState<string | null>(null);
  const [testFileName, setTestFileName] = useState<string | null>(null);
  const [testPassword, setTestPassword] = useState("");
  const [testRevealed, setTestRevealed] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [testError, setTestError] = useState("");
  const [testResult, setTestResult] = useState<BackupVerification | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const hasNsec = getStoredNsec() !== null;
  const canCreate = password.length >= MIN_PASSPHRASE_LEN;

  const handleCreate = useCallback(async () => {
    if (!canCreate) return;
    setCreating(true);
    setError("");
    try {
      const backup = createNcryptsecBackup(password);
      setNcryptsec(backup);
      downloadBackupFile(backup);
      setStage("test-drop");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create backup.");
    } finally {
      setCreating(false);
    }
  }, [canCreate, password]);

  const handleGenerate = useCallback(() => {
    const pass = generatePassphrase();
    setPassword(pass);
    setIsRevealed(true);
  }, []);

  const handleTestFile = useCallback(
    async (file: File) => {
      try {
        const text = (await file.text()).trim();
        if (!text.toLowerCase().startsWith("ncryptsec1")) {
          setTestError("Not a valid backup file.");
          return;
        }
        if (ncryptsec && text !== ncryptsec.trim()) {
          setTestError("This is a backup, but not the one you just created.");
          return;
        }
        setTestFile(text);
        setTestFileName(file.name);
        setTestError("");
        setStage("test-password");
      } catch {
        setTestError("Could not read file.");
      }
    },
    [ncryptsec],
  );

  const handleVerify = useCallback(async () => {
    if (!testFile || !testPassword) return;
    setVerifying(true);
    setTestError("");
    try {
      const result = verifyNcryptsecBackup(testFile, testPassword);
      setTestResult(result);
      setStage("test-success");
    } catch (e) {
      setTestError(
        e instanceof Error ? e.message : "Wrong password or corrupt file.",
      );
    } finally {
      setVerifying(false);
      setTestPassword("");
    }
  }, [testFile, testPassword]);

  const resetAll = useCallback(() => {
    setStage("create");
    setPassword("");
    setNcryptsec(null);
    setTestFile(null);
    setTestFileName(null);
    setTestPassword("");
    setTestResult(null);
    setError("");
    setTestError("");
    setIsRevealed(false);
  }, []);

  if (!hasNsec) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-black dark:text-white">
          Backup & Recovery
        </h3>
        <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.02]">
          <p className="text-sm text-black/50 dark:text-white/50">
            No private key stored. Import a key first to create backups.
          </p>
        </div>
      </div>
    );
  }

  if (stage === "test-success" && testResult) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-black dark:text-white">
          Backup & Recovery
        </h3>
        <div className="flex flex-col items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-6 text-center dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white">
            <Check className="h-6 w-6" strokeWidth={3} />
          </div>
          <p className="text-sm font-medium text-black dark:text-white">
            Your backup works!
          </p>
          <p className="text-xs text-black/50 dark:text-white/50">
            {testResult.matchesCurrentIdentity
              ? "Verified — restores your current identity."
              : "Verified — restores a different identity."}
          </p>
          <p className="break-all font-mono text-[10px] text-black/40 dark:text-white/40">
            {testResult.npub}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={resetAll}>
            Create another backup
          </Button>
        </div>
      </div>
    );
  }

  if (stage === "test-drop" || stage === "test-password") {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-black dark:text-white">
          Backup & Recovery
        </h3>
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
          <p className="text-sm font-medium text-black/70 dark:text-white/70">
            Test your backup
          </p>
          <p className="mt-1 text-xs text-black/50 dark:text-white/50">
            Select the file you just downloaded and enter its password to
            verify.
          </p>
        </div>

        {stage === "test-drop" && (
          <>
            <input
              type="file"
              accept=".ncryptsec,text/plain"
              className="sr-only"
              ref={fileInputRef}
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                if (f) void handleTestFile(f);
                e.currentTarget.value = "";
              }}
            />
            <Button size="sm" onClick={() => fileInputRef.current?.click()}>
              <FileKey2 className="h-3.5 w-3.5" />
              Select backup file
            </Button>
          </>
        )}

        {stage === "test-password" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2 dark:border-white/10 dark:bg-white/[0.02]">
              <FileKey2 className="h-4 w-4 shrink-0 text-black/40 dark:text-white/40" />
              <span className="truncate font-mono text-xs text-black/60 dark:text-white/60">
                {testFileName}
              </span>
            </div>
            <div className="relative">
              <Input
                type={testRevealed ? "text" : "password"}
                value={testPassword}
                onChange={(e) => {
                  setTestPassword(e.target.value);
                  setTestError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleVerify();
                }}
                placeholder="Backup password"
                className="h-9 pr-10 font-mono text-sm"
                autoFocus
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground"
                onClick={() => setTestRevealed((r) => !r)}
              >
                {testRevealed ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            <Button
              size="sm"
              onClick={() => void handleVerify()}
              disabled={!testPassword || verifying}
            >
              {verifying ? "Verifying…" : "Verify backup"}
            </Button>
          </div>
        )}

        {testError && <p className="text-xs text-destructive">{testError}</p>}

        <Button size="sm" variant="ghost" onClick={resetAll}>
          Start over
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-black dark:text-white">
          Backup & Recovery
        </h3>
        <p className="mt-1 text-xs text-black/50 dark:text-white/50">
          Create encrypted backups of your private key.
        </p>
      </div>

      <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.02]">
        <div className="flex items-start gap-3">
          <Shield className="mt-0.5 h-5 w-5 shrink-0 text-black/40 dark:text-white/40" />
          <div>
            <p className="text-sm font-medium text-black/70 dark:text-white/70">
              Encrypted Key Backup (NIP-49)
            </p>
            <p className="mt-1 text-xs text-black/50 dark:text-white/50">
              Your private key is encrypted with a password before download.
              Without this password the backup cannot be restored.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <label className="mb-1.5 block text-xs font-medium text-black/60 dark:text-white/60">
          Backup Password
        </label>
        <div className="relative">
          <Input
            type={isRevealed ? "text" : "password"}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canCreate) void handleCreate();
            }}
            placeholder={`Minimum ${MIN_PASSPHRASE_LEN} characters`}
            className="h-9 pr-20 font-mono text-sm"
          />
          <div className="absolute right-1 top-1/2 flex -translate-y-1/2 gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              onClick={handleGenerate}
              aria-label="Generate password"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              onClick={() => setIsRevealed((r) => !r)}
              aria-label={isRevealed ? "Hide" : "Reveal"}
            >
              {isRevealed ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
        {password && password.length < MIN_PASSPHRASE_LEN && (
          <p className="text-xs text-muted-foreground">
            {MIN_PASSPHRASE_LEN - password.length} more characters needed
          </p>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!canCreate || creating}
          onClick={() => void handleCreate()}
        >
          <Download className="h-3.5 w-3.5" />
          {creating ? "Encrypting…" : "Create & Download Backup"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setStage("test-drop");
            setNcryptsec(null);
          }}
        >
          <Key className="h-3.5 w-3.5" />
          Test Existing Backup
        </Button>
      </div>
    </div>
  );
}
