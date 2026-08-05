interface Props {
  src?: string;
  name: string;
  size?: number;
  online?: boolean;
}

export function Avatar({ src, name, size = 32, online }: Props) {
  const initial = name.charAt(0).toUpperCase() || "?";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-black/10 text-xs font-semibold text-black/60 dark:bg-white/10 dark:text-white/60"
      >
        {src ? (
          <img
            src={src}
            alt={name}
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          initial
        )}
      </div>
      {online && (
        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-green-400 dark:border-[#111]" />
      )}
    </div>
  );
}
