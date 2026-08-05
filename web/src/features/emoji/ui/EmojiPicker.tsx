import Picker from "@emoji-mart/react";
import data from "@emoji-mart/data";

interface Props {
  customEmoji: Map<string, string>;
  onSelect: (shortcode: string) => void;
}

export function EmojiPicker({ customEmoji, onSelect }: Props) {
  const hasCustom = customEmoji.size > 0;

  return (
    <div className="overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl dark:border-white/10 dark:bg-[#1e1e1e]">
      {hasCustom && (
        <div className="border-b border-black/10 p-2 dark:border-white/10">
          <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-black/30 dark:text-white/30">
            Community
          </p>
          <div className="flex flex-wrap gap-1">
            {[...customEmoji.entries()].map(([shortcode, url]) => (
              <button
                key={shortcode}
                type="button"
                title={`:${shortcode}:`}
                onClick={() => onSelect(shortcode)}
                className="rounded p-1 hover:bg-black/5 dark:hover:bg-white/5"
              >
                <img
                  src={url}
                  alt={shortcode}
                  className="h-6 w-6 object-contain"
                />
              </button>
            ))}
          </div>
        </div>
      )}
      <Picker
        data={data}
        onEmojiSelect={(emoji: { native?: string; shortcodes?: string }) => {
          if (emoji.native) onSelect(emoji.native);
        }}
        theme="auto"
        previewPosition="none"
        skinTonePosition="none"
      />
    </div>
  );
}
