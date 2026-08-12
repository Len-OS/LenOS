import * as React from "react";
import { cn } from "@/shared/lib/cn";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "flex h-9 w-full rounded-md border border-black/10 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-black/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:focus-visible:ring-white/20",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";
