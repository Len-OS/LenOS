import { useState } from "react";
import { FileSearch } from "lucide-react";
import { useDocuments } from "../useDocuments";
import { DocumentCard } from "./DocumentCard";
import { DocumentUpload } from "./DocumentUpload";
import { DocumentSearchPanel } from "./DocumentSearchPanel";

type Tab = "files" | "search";

export function DocumentsPage() {
  const { documents, loading, error, upload, remove } = useDocuments();
  const [tab, setTab] = useState<Tab>("files");

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-black/10 px-4 dark:border-white/10">
        <FileSearch className="h-4 w-4 text-black/40 dark:text-white/40" />
        <span className="font-semibold text-black dark:text-white">
          Documents
        </span>
        <div className="ml-auto flex gap-1">
          {(["files", "search"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                tab === t
                  ? "bg-black/10 text-black dark:bg-white/10 dark:text-white"
                  : "text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === "files" ? (
          <div className="mx-auto max-w-xl space-y-4">
            <DocumentUpload onUpload={upload} />
            {error && <p className="text-sm text-red-500">{error}</p>}
            {loading ? (
              <p className="text-center text-sm text-black/30 dark:text-white/30">
                Loading…
              </p>
            ) : documents.length === 0 ? (
              <p className="text-center text-sm text-black/30 dark:text-white/30">
                No documents uploaded yet
              </p>
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <DocumentCard key={doc.id} doc={doc} onDelete={remove} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mx-auto max-w-xl">
            <DocumentSearchPanel />
          </div>
        )}
      </div>
    </div>
  );
}
