"use client";

import React from "react";
import { ICON_OPTIONS, LinkIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export function IconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (iconId: string) => void;
}) {
  return (
    <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
      {ICON_OPTIONS.map((option) => {
        const selected = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            title={option.label}
            aria-label={`Icon ${option.label}`}
            aria-pressed={selected}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border p-2 text-[10px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50",
              selected
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300 shadow-sm"
                : "border-zinc-800/80 bg-[#111114]/70 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200",
            )}
          >
            <LinkIcon name={option.id} className="h-4 w-4" />
            <span className="max-w-full truncate">
              {option.label.split(" ")[0]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
