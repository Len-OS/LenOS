import { Settings } from "lucide-react";
import * as React from "react";

import { Button } from "@/shared/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { Switch } from "@/shared/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { cn } from "@/shared/lib/cn";
import type { HuddleAudioSettings, HuddleAudioQuality } from "../HuddleContext";

interface HuddleQualityPopoverProps {
  onSettingsChange: (settings: HuddleAudioSettings) => void;
}

const QUALITY_OPTIONS: { value: HuddleAudioQuality; label: string }[] = [
  { value: "low", label: "Low (32 kbps)" },
  { value: "medium", label: "Medium (64 kbps)" },
  { value: "high", label: "High (128 kbps)" },
];

function readSettings(): HuddleAudioSettings {
  return {
    noiseSuppression:
      localStorage.getItem("huddle_noise_suppression") !== "false",
    quality:
      (localStorage.getItem("huddle_audio_quality") as HuddleAudioQuality) ??
      "high",
  };
}

export function HuddleQualityPopover({
  onSettingsChange,
}: HuddleQualityPopoverProps) {
  const [open, setOpen] = React.useState(false);
  const [settings, setSettings] =
    React.useState<HuddleAudioSettings>(readSettings);

  function applyQuality(quality: HuddleAudioQuality) {
    const next: HuddleAudioSettings = { ...settings, quality };
    localStorage.setItem("huddle_audio_quality", quality);
    setSettings(next);
    onSettingsChange(next);
  }

  function applyNoiseSuppression(noiseSuppression: boolean) {
    const next: HuddleAudioSettings = { ...settings, noiseSuppression };
    localStorage.setItem("huddle_noise_suppression", String(noiseSuppression));
    setSettings(next);
    onSettingsChange(next);
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              aria-label="Audio quality settings"
              aria-pressed={open}
              className={cn(
                "lenos-huddle-control-button h-12 w-12 shrink-0 rounded-md",
                open && "text-foreground",
              )}
              size="icon"
              type="button"
              variant="secondary"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent className="lenos-huddle-tooltip" side="top">
          Audio quality
        </TooltipContent>
      </Tooltip>

      <PopoverContent
        align="center"
        className="w-52 p-3"
        side="top"
        sideOffset={10}
      >
        <div className="space-y-3">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Audio Quality
            </p>
            <div className="space-y-1">
              {QUALITY_OPTIONS.map(({ value, label }) => (
                <Button
                  key={value}
                  type="button"
                  variant={settings.quality === value ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 w-full justify-start text-xs font-normal"
                  onClick={() => applyQuality(value)}
                  aria-pressed={settings.quality === value}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <div className="border-t pt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Noise Suppression
              </span>
              <Switch
                checked={settings.noiseSuppression}
                onCheckedChange={applyNoiseSuppression}
                aria-label="Toggle noise suppression"
              />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
