export interface CommandContext {
  channelId: string;
  publishEvent(params: {
    kind: number;
    content: string;
    tags: string[][];
  }): Promise<void>;
}

export interface SlashCommand {
  name: string;
  description: string;
  usage: string;
  execute(args: string, context: CommandContext): Promise<void>;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: "giphy",
    description: "Search GIFs",
    usage: "/giphy <query>",
    async execute(_args, _context) {
      // Invocation handled by SlashCommandPalette (shows grid picker)
    },
  },
  {
    name: "poll",
    description: "Create a poll",
    usage: "/poll <question> | <opt1> | <opt2>",
    async execute(args, context) {
      const parts = args
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length < 3)
        throw new Error("Poll needs a question and at least 2 options");
      const [question, ...options] = parts;
      const pollId = crypto.randomUUID();
      await context.publishEvent({
        kind: 40002,
        content: JSON.stringify({ type: "poll", pollId }),
        tags: [["e", context.channelId, "", "root"]],
      });
      await context.publishEvent({
        kind: 30078,
        content: JSON.stringify({
          question,
          options,
          createdAt: Math.floor(Date.now() / 1000),
        }),
        tags: [["d", `poll-${pollId}`]],
      });
    },
  },
  {
    name: "remind",
    description: "Set a reminder",
    usage: "/remind <time> <message>",
    async execute(args, context) {
      const spaceIdx = args.indexOf(" ");
      if (spaceIdx === -1) throw new Error("Usage: /remind <time> <message>");
      const timeStr = args.slice(0, spaceIdx).trim();
      const message = args.slice(spaceIdx + 1).trim();
      const notBefore = parseRemindTime(timeStr);
      await context.publishEvent({
        kind: 30078,
        content: JSON.stringify({ message, channelId: context.channelId }),
        tags: [
          ["d", `scheduled-${crypto.randomUUID()}`],
          ["not_before", String(notBefore)],
        ],
      });
    },
  },
];

function parseRemindTime(s: string): number {
  const now = Math.floor(Date.now() / 1000);
  const rel = s.match(/^(\d+)(m|h|d)$/);
  if (rel) {
    const n = parseInt(rel[1], 10);
    const unit = rel[2];
    const secs = unit === "m" ? 60 : unit === "h" ? 3600 : 86400;
    return now + n * secs;
  }
  const abs = Date.parse(s);
  if (!isNaN(abs)) return Math.floor(abs / 1000);
  throw new Error(`Cannot parse time: ${s}`);
}
