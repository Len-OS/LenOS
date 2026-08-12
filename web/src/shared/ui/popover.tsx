import * as React from "react";
import { cn } from "@/shared/lib/cn";

interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function Popover({ open, onOpenChange, children }: PopoverProps) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onOpenChange]);

  return (
    <div ref={ref} className="relative inline-block">
      {children}
    </div>
  );
}

export function PopoverTrigger({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={className} {...props} />;
}

interface PopoverContentProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: "start" | "center" | "end";
  side?: "top" | "bottom";
}

export function PopoverContent({
  className,
  align = "center",
  side = "bottom",
  ...props
}: PopoverContentProps) {
  return (
    <div
      className={cn(
        "absolute z-50 min-w-[12rem] rounded-lg border border-black/10 bg-white p-3 shadow-lg dark:border-white/10 dark:bg-[#1e1e1e] animate-in fade-in-0 zoom-in-95",
        side === "bottom" ? "top-full mt-2" : "bottom-full mb-2",
        align === "start" && "left-0",
        align === "center" && "left-1/2 -translate-x-1/2",
        align === "end" && "right-0",
        className,
      )}
      {...props}
    />
  );
}
