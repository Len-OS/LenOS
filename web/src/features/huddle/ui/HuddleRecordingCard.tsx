import { Download } from "lucide-react";

interface Props {
  content: string;
  createdAt: number;
}

export function HuddleRecordingCard({ content, createdAt }: Props) {
  let url: string | null = null;
  try {
    const parsed = JSON.parse(content) as { url?: string };
    url = parsed.url ?? null;
  } catch {
    // malformed content
  }

  const date = new Date(createdAt * 1000).toLocaleString();
  const filename = url?.split("/").pop() ?? "recording.lenosopu";

  return (
    <div className="my-1 flex items-center gap-3 rounded-xl border border-black/10 bg-black/[0.03] px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/10">
        <span className="text-xs font-bold text-red-500">REC</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-black dark:text-white">
          Huddle Recording
        </p>
        <p className="truncate text-xs text-black/50 dark:text-white/50">
          {date} · {filename}
        </p>
      </div>
      {url && (
        <a
          href={url}
          download={filename}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-black/5 px-3 py-1.5 text-sm font-medium text-black/70 hover:bg-black/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10"
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </a>
      )}
    </div>
  );
}
