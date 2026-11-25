"use client";

import React, { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
    primary:
      "bg-emerald-500 text-zinc-950 font-semibold hover:bg-emerald-400 shadow-sm shadow-emerald-950/30",
    secondary:
      "bg-[#16161b] text-zinc-100 hover:bg-zinc-800 border border-zinc-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
    outline:
      "border border-zinc-800 bg-[#111114]/80 text-zinc-200 hover:border-zinc-700 hover:bg-zinc-900 hover:text-white",
    ghost: "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70",
    danger:
      "bg-red-950/75 text-red-200 border border-red-900/70 hover:bg-red-900/70 hover:text-white",
  };

  const sizeClasses: Record<NonNullable<ButtonProps["size"]>, string> = {
    sm: "px-2.5 py-1.5 text-xs rounded-lg gap-1.5",
    md: "px-3.5 py-2 text-sm rounded-xl gap-2",
    lg: "px-5 py-2.5 text-sm rounded-xl gap-2.5",
    icon: "h-8 w-8 rounded-lg justify-center",
  };

  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center font-medium transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  );
}

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-xl border border-zinc-800 bg-[#111114]/90 px-3.5 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 transition focus:border-emerald-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export type BadgeVariant =
  | "default"
  | "emerald"
  | "success"
  | "violet"
  | "purple"
  | "amber"
  | "warning"
  | "danger"
  | "sky"
  | "blue";

export function Badge({
  variant = "default",
  className,
  children,
}: {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
}) {
  const styles: Record<BadgeVariant, string> = {
    default: "border-zinc-800 bg-[#16161b] text-zinc-300",
    emerald: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
    success: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
    violet: "border-violet-500/25 bg-violet-500/10 text-violet-300",
    purple: "border-violet-500/25 bg-violet-500/10 text-violet-300",
    amber: "border-amber-500/25 bg-amber-500/10 text-amber-300",
    warning: "border-amber-500/25 bg-amber-500/10 text-amber-300",
    danger: "border-red-500/30 bg-red-500/10 text-red-300",
    sky: "border-sky-500/25 bg-sky-500/10 text-sky-300",
    blue: "border-sky-500/25 bg-sky-500/10 text-sky-300",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium",
        styles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  ariaLabel,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:opacity-50",
        checked
          ? "border-emerald-500/50 bg-emerald-500"
          : "border-zinc-700 bg-zinc-800"
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-4" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-xl border border-zinc-800/50 bg-[#111114]/80",
        className
      )}
    />
  );
}

export function DialogModal({
  open,
  onClose,
  title,
  description,
  children,
  maxWidthClass = "max-w-xl",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  maxWidthClass?: string;
}) {
  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md transition-opacity duration-150"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={cn(
          "relative max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-zinc-800/90 bg-[#0d0d10]/95 p-6 text-zinc-100 shadow-[0_24px_64px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl transition-all duration-150",
          maxWidthClass
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800/80 pb-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-white">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="shrink-0 cursor-pointer rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = true,
  loading = false,
}: ConfirmDialogProps) {
  return (
    <DialogModal
      open={open}
      onClose={onClose}
      title={title}
      maxWidthClass="max-w-md"
    >
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          {danger && (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-500/25 bg-red-500/10 text-red-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
          )}
          <p className="text-sm leading-relaxed text-zinc-300">{description}</p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-800/80 pt-4">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </DialogModal>
  );
}
