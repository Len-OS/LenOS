import { FileText, Loader2, Trash2, AlertCircle } from "lucide-react";
import type { Document } from "../useDocuments";

interface Props {
  doc: Document;
  onDelete: (id: string) => void;
}

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentCard({ doc, onDelete }: Props) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-white/5">
      <div className="mt-0.5 shrink-0">
        {doc.status === "processing" ? (
          <Loader2 className="h-4 w-4 animate-spin text-black/30 dark:text-white/30" />
        ) : doc.status === "failed" ? (
          <AlertCircle className="h-4 w-4 text-red-500" />
        ) : (
          <FileText className="h-4 w-4 text-black/40 dark:text-white/40" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-black dark:text-white">
          {doc.filename}
        </p>
        <p className="text-xs text-black/40 dark:text-white/40">
          {humanSize(doc.byte_size)}
          {doc.status === "processing" && " · indexing…"}
          {doc.status === "failed" && ` · ${doc.error ?? "failed"}`}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onDelete(doc.id)}
        title="Delete document"
        className="shrink-0 rounded p-1 text-black/30 hover:bg-red-50 hover:text-red-500 dark:text-white/30 dark:hover:bg-red-900/20 dark:hover:text-red-400"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
