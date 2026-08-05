import type React from "react";
import { toggleMark } from "prosemirror-commands";
import type { EditorView } from "prosemirror-view";
import { schema } from "@/features/messages/lib/editorSchema";

interface Props {
  view: EditorView | null;
}

function ToolbarButton({
  label,
  title,
  onMouseDown,
}: {
  label: string;
  title: string;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={onMouseDown}
      className="rounded px-1.5 py-0.5 text-xs font-medium text-black/60 hover:bg-black/5 hover:text-black dark:text-white/60 dark:hover:bg-white/5 dark:hover:text-white"
    >
      {label}
    </button>
  );
}

export function FormattingToolbar({ view }: Props) {
  const run = (e: React.MouseEvent, mark: keyof typeof schema.marks) => {
    e.preventDefault();
    if (!view) return;
    toggleMark(schema.marks[mark])(view.state, view.dispatch);
    view.focus();
  };

  return (
    <div className="flex items-center gap-0.5 border-b border-black/10 px-2 py-1 dark:border-white/10">
      <ToolbarButton
        label="B"
        title="Bold (Mod+B)"
        onMouseDown={(e) => run(e, "bold")}
      />
      <ToolbarButton
        label="I"
        title="Italic (Mod+I)"
        onMouseDown={(e) => run(e, "italic")}
      />
      <ToolbarButton
        label="`"
        title="Code (Mod+`)"
        onMouseDown={(e) => run(e, "code")}
      />
    </div>
  );
}
