import { useEffect, useRef, useCallback, useState } from "react";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "@/features/messages/lib/editorSchema";
import { buildPlugins } from "@/features/messages/lib/editorPlugins";
import { FormattingToolbar } from "@/features/messages/ui/FormattingToolbar";

interface Props {
  placeholder?: string;
  disabled?: boolean;
  onSubmit: (text: string) => void;
  onTextChange?: (text: string) => void;
  clearSignal?: number;
}

function docToText(doc: EditorState["doc"]): string {
  const parts: string[] = [];
  doc.forEach((node) => {
    if (parts.length > 0) parts.push("\n");
    node.forEach((inline) => {
      parts.push(inline.text ?? "");
    });
  });
  return parts.join("");
}

export function RichComposer({
  placeholder,
  disabled,
  onSubmit,
  onTextChange,
  clearSignal,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onSubmitRef = useRef(onSubmit);
  const onTextChangeRef = useRef(onTextChange);
  const [toolbarView, setToolbarView] = useState<EditorView | null>(null);
  const [focused, setFocused] = useState(false);
  onSubmitRef.current = onSubmit;
  onTextChangeRef.current = onTextChange;

  const handleSubmit = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const text = docToText(view.state.doc).trim();
    if (!text) return;
    onSubmitRef.current(text);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: view created once on mount
  useEffect(() => {
    if (!mountRef.current) return;
    const state = EditorState.create({
      schema,
      plugins: buildPlugins(schema, handleSubmit),
    });
    const view = new EditorView(mountRef.current, {
      state,
      dispatchTransaction(tr) {
        const newState = view.state.apply(tr);
        view.updateState(newState);
        if (tr.docChanged) {
          onTextChangeRef.current?.(docToText(newState.doc).trim());
        }
      },
      handleDOMEvents: {
        focus: () => { setFocused(true); setToolbarView(view); return false; },
        blur: () => { setFocused(false); return false; },
      },
    });
    viewRef.current = view;
    setToolbarView(view);
    return () => {
      view.destroy();
      viewRef.current = null;
      setToolbarView(null);
    };
  }, []);

  // Clear on send
  useEffect(() => {
    const view = viewRef.current;
    if (!view || clearSignal === undefined) return;
    view.updateState(
      EditorState.create({ schema, plugins: buildPlugins(schema, handleSubmit) }),
    );
    view.focus();
  }, [clearSignal, handleSubmit]);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    el.style.pointerEvents = disabled ? "none" : "";
    el.style.opacity = disabled ? "0.5" : "";
  }, [disabled]);

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      {focused && <FormattingToolbar view={toolbarView} />}
      <div
        ref={mountRef}
        data-placeholder={placeholder}
        className="text-sm text-black dark:text-white [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[1.5rem] [&_.ProseMirror]:max-h-[200px] [&_.ProseMirror]:overflow-y-auto [&_.ProseMirror_p]:m-0 [&_.ProseMirror_strong]:font-semibold [&_.ProseMirror_em]:italic [&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:bg-black/10 [&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:font-mono [&_.ProseMirror_code]:text-xs dark:[&_.ProseMirror_code]:bg-white/10"
      />
    </div>
  );
}
