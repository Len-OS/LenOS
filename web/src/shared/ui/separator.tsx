import * as React from "react";
import { cn } from "@/shared/lib/cn";

interface SeparatorProps extends React.HTMLAttributes<HTMLHRElement> {
  orientation?: "horizontal" | "vertical";
}

export const Separator = React.forwardRef<HTMLHRElement, SeparatorProps>(
  ({ className, orientation = "horizontal", ...props }, ref) => (
    <hr
      ref={ref}
      aria-orientation={orientation}
      className={cn(
        "shrink-0 border-0 bg-black/10 dark:bg-white/10",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  ),
);
Separator.displayName = "Separator";
