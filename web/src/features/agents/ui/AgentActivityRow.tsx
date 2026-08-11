import { Brain, Wrench, MessageSquare, ListTodo, Terminal } from "lucide-react";

export type ActivityType = "thought" | "tool" | "message" | "plan" | "command";

interface Props {
  type: ActivityType;
  content: string;
  timestamp?: number;
}

const ICON_MAP = {
  thought: Brain,
  tool: Wrench,
  message: MessageSquare,
  plan: ListTodo,
  command: Terminal,
} as const;

const LABEL_MAP = {
  thought: "Thinking",
  tool: "Tool call",
  message: "Response",
  plan: "Planning",
  command: "Command",
} as const;

const COLOR_MAP = {
  thought: "text-purple-500",
  tool: "text-amber-500",
  message: "text-blue-500",
  plan: "text-green-500",
  command: "text-orange-500",
} as const;

export function AgentActivityRow({ type, content, timestamp }: Props) {
  const Icon = ICON_MAP[type];
  const label = LABEL_MAP[type];
  const color = COLOR_MAP[type];

  return (
    <div className="flex gap-2.5 px-3 py-2">
      <div className={`mt-0.5 shrink-0 ${color}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-black/40 dark:text-white/40">
            {label}
          </span>
          {timestamp && (
            <span className="text-[10px] text-black/20 dark:text-white/20">
              {new Date(timestamp * 1000).toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          )}
        </div>
        <p className="mt-0.5 whitespace-pre-wrap font-mono text-xs text-black/70 dark:text-white/70">
          {content}
        </p>
      </div>
    </div>
  );
}
