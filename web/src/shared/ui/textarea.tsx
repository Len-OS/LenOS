import * as React from "react";
import { cn } from "@/shared/lib/cn";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-[60px] w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-black/40 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-black/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:placeholder:text-white/40 dark:focus-visible:ring-white/20",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
