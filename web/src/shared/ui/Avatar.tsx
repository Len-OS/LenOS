interface Props {
  src?: string;
  name: string;
  size?: number;
}

export function Avatar({ src, name, size = 32 }: Props) {
  const initial = name.charAt(0).toUpperCase() || "?";
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-black/10 text-xs font-semibold text-black/60 dark:bg-white/10 dark:text-white/60"
      style={{ width: size, height: size }}
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
  );
}
