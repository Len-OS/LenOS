import { history, undo, redo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import {
  toggleMark,
  baseKeymap,
  chainCommands,
  newlineInCode,
  createParagraphNear,
  liftEmptyBlock,
  splitBlock,
} from "prosemirror-commands";
import { inputRules, InputRule } from "prosemirror-inputrules";
import type { Schema } from "prosemirror-model";
import type { Command, EditorState, Transaction } from "prosemirror-state";

export function buildPlugins(schema: Schema, onSubmit: () => void) {
  const boldMark = schema.marks.bold;
  const italicMark = schema.marks.italic;
  const codeMark = schema.marks.code;

  const submitOnEnter: Command = () => {
    onSubmit();
    return true;
  };

  const insertNewline: Command = chainCommands(
    newlineInCode,
    createParagraphNear,
    liftEmptyBlock,
    splitBlock,
  );

  return [
    history(),
    keymap({
      "Mod-z": undo,
      "Mod-y": redo,
      "Mod-Shift-z": redo,
      "Mod-b": toggleMark(boldMark),
      "Mod-i": toggleMark(italicMark),
      "Mod-`": toggleMark(codeMark),
      Enter: submitOnEnter,
      "Shift-Enter": insertNewline,
    }),
    keymap(baseKeymap),
    inputRules({
      rules: [
        new InputRule(
          /\*\*(.+)\*\*$/,
          (
            state: EditorState,
            match: RegExpMatchArray,
            start: number,
            end: number,
          ): Transaction => {
            const mark = boldMark.create();
            return state.tr
              .replaceWith(start, end, schema.text(match[1], [mark]))
              .removeStoredMark(boldMark);
          },
        ),
        new InputRule(
          /_(.+)_$/,
          (
            state: EditorState,
            match: RegExpMatchArray,
            start: number,
            end: number,
          ): Transaction => {
            const mark = italicMark.create();
            return state.tr
              .replaceWith(start, end, schema.text(match[1], [mark]))
              .removeStoredMark(italicMark);
          },
        ),
        new InputRule(
          /`([^`]+)`$/,
          (
            state: EditorState,
            match: RegExpMatchArray,
            start: number,
            end: number,
          ): Transaction => {
            const mark = codeMark.create();
            return state.tr
              .replaceWith(start, end, schema.text(match[1], [mark]))
              .removeStoredMark(codeMark);
          },
        ),
      ],
    }),
  ];
}
