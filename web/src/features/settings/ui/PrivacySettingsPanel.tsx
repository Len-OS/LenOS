import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { relayHttpUrl, relayWsUrl } from "@/shared/lib/relay-url";
import { makeNip98AuthHeader } from "@/shared/lib/nip98";
import { getCurrentPubkey } from "@/shared/lib/nostr-signer";

const EXPORT_HISTORY_KEY = "lenos_export_history";

interface ExportRecord {
  iso: string;
  pubkey: string;
}

function loadHistory(): ExportRecord[] {
  try {
    const raw = localStorage.getItem(EXPORT_HISTORY_KEY);
    return raw ? (JSON.parse(raw) as ExportRecord[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(records: ExportRecord[]) {
  localStorage.setItem(
    EXPORT_HISTORY_KEY,
    JSON.stringify(records.slice(0, 20)),
  );
}

// ── My data section ────────────────────────────────────────────────────────────

function MyDataSection() {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ExportRecord[]>(loadHistory);

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const base = relayHttpUrl(relayWsUrl());
      const url = `${base}/api/export`;
      const auth = await makeNip98AuthHeader(url, "GET");
      const res = await fetch(url, { headers: { Authorization: auth } });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        setError((body as { error?: string }).error ?? res.statusText);
        return;
      }
      const blob = await res.blob();
      const pubkey = (await getCurrentPubkey()) ?? "unknown";
      const filename =
        res.headers
          .get("Content-Disposition")
          ?.match(/filename="([^"]+)"/)?.[1] ??
        `export-${pubkey.slice(0, 8)}.json`;

      // Trigger download
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);

      // Record in history
      const record: ExportRecord = {
        iso: new Date().toISOString(),
        pubkey: pubkey.slice(0, 16),
      };
      const updated = [record, ...history];
      setHistory(updated);
      saveHistory(updated);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <p className="mb-1 text-sm font-semibold text-black dark:text-white">
        Export My Data
      </p>
      <p className="mb-4 text-xs text-black/50 dark:text-white/50">
        Download all your Nostr events from this relay as a JSON file.
      </p>

      <button
        type="button"
        onClick={handleExport}
        disabled={exporting}
        className="flex items-center gap-2 rounded-md bg-black px-4 py-2 text-sm text-white hover:bg-black/80 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-white/80"
      >
        {exporting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {exporting ? "Exporting…" : "Export my data"}
      </button>

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      {history.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium text-black/50 dark:text-white/50">
            Previous exports (this device)
          </p>
          <div className="space-y-1">
            {history.slice(0, 5).map((r) => (
              <p
                key={r.iso}
                className="text-xs text-black/40 dark:text-white/40"
              >
                {new Date(r.iso).toLocaleString()} — pubkey{" "}
                <span className="font-mono">{r.pubkey}…</span>
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Admin export section ───────────────────────────────────────────────────────

function AdminExportSection() {
  const [targetPubkey, setTargetPubkey] = useState("");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState<boolean | null>(null);

  // Probe admin status on first render by attempting a dummy admin request.
  // We rely on the 403 from the server rather than a client-side role check.

  const handleExport = async () => {
    const pk = targetPubkey.trim();
    if (!pk) return;
    setExporting(true);
    setError(null);
    try {
      const base = relayHttpUrl(relayWsUrl());
      const url = `${base}/api/export?pubkey=${encodeURIComponent(pk)}`;
      const auth = await makeNip98AuthHeader(url, "GET");
      const res = await fetch(url, { headers: { Authorization: auth } });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        setError((body as { error?: string }).error ?? res.statusText);
        return;
      }
      setForbidden(false);
      const blob = await res.blob();
      const filename =
        res.headers
          .get("Content-Disposition")
          ?.match(/filename="([^"]+)"/)?.[1] ?? `export-${pk.slice(0, 8)}.json`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setExporting(false);
    }
  };

  if (forbidden === true) return null;

  return (
    <div className="mt-8">
      <p className="mb-1 text-sm font-semibold text-black dark:text-white">
        Export by Pubkey
      </p>
      <p className="mb-4 text-xs text-black/50 dark:text-white/50">
        Admin: export any user's data by public key (hex).
      </p>

      <div className="flex gap-2">
        <input
          type="text"
          value={targetPubkey}
          onChange={(e) => setTargetPubkey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleExport()}
          placeholder="hex pubkey (64 chars)"
          className="flex-1 rounded-md border border-black/20 bg-transparent px-3 py-1.5 font-mono text-xs text-black placeholder-black/30 focus:border-black/40 focus:outline-none dark:border-white/20 dark:text-white dark:placeholder-white/30 dark:focus:border-white/40"
        />
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || !targetPubkey.trim()}
          className="flex items-center gap-1.5 rounded-md bg-black px-3 py-1.5 text-sm text-white hover:bg-black/80 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-white/80"
        >
          {exporting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          Export
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ── Panel ──────────────────────────────────────────────────────────────────────

export function PrivacySettingsPanel() {
  return (
    <div className="max-w-md">
      <p className="mb-1 text-sm font-semibold text-black dark:text-white">
        Privacy &amp; Data
      </p>
      <p className="mb-6 text-xs text-black/50 dark:text-white/50">
        Export your relay data in a portable JSON format.
      </p>

      <MyDataSection />
      <AdminExportSection />
    </div>
  );
}
