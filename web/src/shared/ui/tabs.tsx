import * as React from "react";
import { cn } from "@/shared/lib/cn";

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabs() {
  const ctx = React.useContext(TabsContext);
  if (!ctx)
    throw new Error("Tabs compound components must be used within Tabs");
  return ctx;
}

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  onValueChange: (value: string) => void;
}

export function Tabs({ value, onValueChange, className, ...props }: TabsProps) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={cn("flex flex-col", className)} {...props} />
    </TabsContext.Provider>
  );
}

export function TabsList({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex h-9 items-center gap-1 rounded-lg bg-black/5 p-1 dark:bg-white/5",
        className,
      )}
      {...props}
    />
  );
}

interface TabsTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

export function TabsTrigger({ value, className, ...props }: TabsTriggerProps) {
  const { value: selected, onValueChange } = useTabs();
  const isActive = selected === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={() => onValueChange(value)}
      className={cn(
        "inline-flex items-center justify-center rounded-md px-3 py-1 text-sm font-medium transition-colors",
        isActive
          ? "bg-white text-black shadow-sm dark:bg-[#2a2a2a] dark:text-white"
          : "text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white",
        className,
      )}
      {...props}
    />
  );
}

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

export function TabsContent({ value, className, ...props }: TabsContentProps) {
  const { value: selected } = useTabs();
  if (selected !== value) return null;
  return <div className={cn("mt-2", className)} {...props} />;
}
