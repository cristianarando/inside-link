"use client";

import React from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { ICON_OPTIONS } from "@/components/ui/icons";
import { Button, Input } from "@/components/ui/primitives";
import type { HubLinkItem } from "@/lib/validations/link.schema";

export interface HubLinksEditorProps {
  items: HubLinkItem[];
  onChange: (next: HubLinkItem[]) => void;
}

export function HubLinksEditor({ items, onChange }: HubLinksEditorProps) {
  const handleAdd = () => {
    if (items.length >= 12) return;
    onChange([
      ...items,
      {
        id: `hub-${items.length + 1}-${Date.now().toString(36)}`,
        label: "",
        url: "",
        icon: "external-link",
        variant: "secondary",
      },
    ]);
  };

  const handleUpdate = (index: number, patch: Partial<HubLinkItem>) => {
    onChange(
      items.map((item, idx) => (idx === index ? { ...item, ...patch } : item))
    );
  };

  const handleMove = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const current = next[index]!;
    next[index] = next[target]!;
    next[target] = current;
    onChange(next);
  };

  const handleRemove = (index: number) => {
    if (items.length <= 1) return;
    onChange(items.filter((_, idx) => idx !== index));
  };

  return (
    <div className="space-y-3 rounded-xl border border-zinc-800/90 bg-[#111114]/70 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-zinc-300">
          Project Buttons ({items.length}/12 · minimum 1)
        </span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleAdd}
          disabled={items.length >= 12}
        >
          <Plus className="h-3.5 w-3.5" />
          Add button
        </Button>
      </div>

      <div className="space-y-2.5">
        {items.map((item, idx) => (
          <div
            key={item.id}
            className="space-y-2 rounded-xl border border-zinc-800 bg-[#09090b]/80 p-3"
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
              <div className="sm:col-span-5">
                <Input
                  required
                  placeholder="Label (e.g. Live Demo)"
                  aria-label={`Button ${idx + 1} label`}
                  value={item.label}
                  onChange={(e) => handleUpdate(idx, { label: e.target.value })}
                  className="text-xs"
                />
              </div>
              <div className="sm:col-span-7">
                <Input
                  required
                  type="url"
                  placeholder="https://..."
                  aria-label={`Button ${idx + 1} URL`}
                  value={item.url}
                  onChange={(e) => handleUpdate(idx, { url: e.target.value })}
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={item.icon}
                  onChange={(e) => handleUpdate(idx, { icon: e.target.value })}
                  aria-label={`Button ${idx + 1} icon`}
                  className="h-8 rounded-lg border border-zinc-800 bg-[#111114] px-2.5 text-xs text-zinc-200 focus:border-emerald-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
                >
                  {ICON_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                <select
                  value={item.variant}
                  onChange={(e) =>
                    handleUpdate(idx, {
                      variant: e.target.value as HubLinkItem["variant"],
                    })
                  }
                  aria-label={`Button ${idx + 1} style`}
                  className="h-8 rounded-lg border border-zinc-800 bg-[#111114] px-2.5 text-xs text-zinc-200 focus:border-emerald-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
                >
                  <option value="primary">Primary (Emerald)</option>
                  <option value="secondary">Secondary</option>
                  <option value="outline">Outline</option>
                </select>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleMove(idx, -1)}
                  disabled={idx === 0}
                  title="Move up"
                  aria-label={`Move button ${idx + 1} up`}
                  className="cursor-pointer rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:pointer-events-none disabled:opacity-30"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleMove(idx, 1)}
                  disabled={idx === items.length - 1}
                  title="Move down"
                  aria-label={`Move button ${idx + 1} down`}
                  className="cursor-pointer rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:pointer-events-none disabled:opacity-30"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(idx)}
                  disabled={items.length <= 1}
                  title="Remove button"
                  aria-label={`Remove button ${idx + 1}`}
                  className="cursor-pointer rounded-lg p-1.5 text-zinc-500 transition hover:bg-red-950/50 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:pointer-events-none disabled:opacity-30"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
