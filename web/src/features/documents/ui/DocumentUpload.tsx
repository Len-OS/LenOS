import { useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";

interface Props {
  channelId?: string;
  onUpload: (file: File, channelId?: string) => Promise<unknown>;
}

const ACCEPT = ".pdf,.txt,.md,text/plain,text/markdown,application/pdf";

export function DocumentUpload({ channelId, onUpload }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await onUpload(file, channelId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <label
        className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-black/20 p-6 text-center hover:border-black/40 dark:border-white/20 dark:hover:border-white/40"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
      >
        {uploading ? (
          <Loader2 className="h-6 w-6 animate-spin text-black/30 dark:text-white/30" />
        ) : (
          <Upload className="h-6 w-6 text-black/30 dark:text-white/30" />
        )}
        <div>
          <p className="text-sm font-medium text-black/60 dark:text-white/60">
            {uploading ? "Uploading…" : "Drop files or click to upload"}
          </p>
          <p className="text-xs text-black/30 dark:text-white/30">
            PDF, TXT, or Markdown · max 50 MB
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </label>
      {error && (
        <p className="rounded bg-red-50 px-3 py-1.5 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
