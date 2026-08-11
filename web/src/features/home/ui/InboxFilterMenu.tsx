import { useState, useRef, useEffect } from "react";
import { SlidersHorizontal, Check } from "lucide-react";
import type { InboxItem } from "../useHomeInbox";

export interface InboxFilter {
  types: Set<InboxItem["type"]>;
  unreadOnly: boolean;
}

export const DEFAULT_FILTER: InboxFilter = {
  types: new Set(["mention", "dm", "thread_reply"]),
  unreadOnly: false,
};

interface Props {
  filter: InboxFilter;
  onChange: (filter: InboxFilter) => void;
}

const TYPE_OPTIONS: { value: InboxItem["type"]; label: string }[] = [
  { value: "mention", label: "Mentions" },
  { value: "dm", label: "DMs" },
  { value: "thread_reply", label: "Replies" },
];

export function InboxFilterMenu({ filter, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggleType = (type: InboxItem["type"]) => {
    const next = new Set(filter.types);
    if (next.has(type)) {
      if (next.size > 1) next.delete(type);
    } else {
      next.add(type);
    }
    onChange({ ...filter, types: next });
  };

  const isFiltered =
    filter.types.size < TYPE_OPTIONS.length || filter.unreadOnly;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Filter inbox"
        className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
          isFiltered
            ? "bg-blue-500 text-white"
            : "text-black/40 hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white"
        }`}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Filter
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-black/10 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-[#2a2a2a]">
          <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-black/30 dark:text-white/30">
            Type
          </p>
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggleType(opt.value)}
              className="flex w-full items-center justify-between px-3 py-1.5 text-sm text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/5"
            >
              {opt.label}
              {filter.types.has(opt.value) && (
                <Check className="h-3.5 w-3.5 text-blue-500" />
              )}
            </button>
          ))}
          <div className="my-1 border-t border-black/5 dark:border-white/5" />
          <button
            type="button"
            onClick={() =>
              onChange({ ...filter, unreadOnly: !filter.unreadOnly })
            }
            className="flex w-full items-center justify-between px-3 py-1.5 text-sm text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/5"
          >
            Unread only
            {filter.unreadOnly && (
              <Check className="h-3.5 w-3.5 text-blue-500" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}
