"use client";

import React, { useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  DatabaseBackup,
  Download,
  FileJson,
  Loader2,
  Upload,
} from "lucide-react";
import { Badge, Button } from "@/components/ui/primitives";
import type {
  BackupConflictStrategy,
  ImportLinksBackupResult,
  LinksBackupPayload,
} from "@/lib/types/link-dto";
import { cn } from "@/lib/utils";

interface ApiErrorShape {
  error?: {
    message?: string;
    details?: Record<string, string[]>;
  };
}

function extractIncomingLinks(parsed: unknown): unknown[] | null {
  if (!parsed || typeof parsed !== "object") return null;
  if (Array.isArray(parsed)) return parsed;
  const rec = parsed as Record<string, unknown>;
  if (Array.isArray(rec.links)) return rec.links;
  if (
    rec.data &&
    typeof rec.data === "object" &&
    Array.isArray((rec.data as { links?: unknown }).links)
  ) {
    return (rec.data as { links: unknown[] }).links;
  }
  return null;
}

function collectApiErrors(payload: ApiErrorShape): string[] {
  const list: string[] = [];
  if (payload.error?.message) list.push(payload.error.message);
  if (payload.error?.details) {
    for (const [key, messages] of Object.entries(payload.error.details)) {
      for (const msg of messages) {
        list.push(`${key}: ${msg}`);
      }
    }
  }
  return list.length > 0 ? list : ["Backup validation failed."];
}

export function BackupStudioSection() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const [fileName, setFileName] = useState<string>("");
  const [incomingLinks, setIncomingLinks] = useState<unknown[] | null>(null);
  const [conflictStrategy, setConflictStrategy] =
    useState<BackupConflictStrategy>("skip");

  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [dryRunResult, setDryRunResult] =
    useState<ImportLinksBackupResult | null>(null);
  const [importResult, setImportResult] =
    useState<ImportLinksBackupResult | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const handleExportJson = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportError(null);
    setExportMessage(null);

    try {
      const res = await fetch("/api/v1/links/backup?download=1", {
        cache: "no-store",
      });
      const json = (await res.json()) as {
        data?: LinksBackupPayload;
        error?: { message?: string };
      };
      if (!res.ok || !json.data) {
        setExportError(json.error?.message || "Failed to export links backup.");
        return;
      }

      const payload = json.data;
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = payload.exportedAt.slice(0, 10) || "backup";
      a.href = url;
      a.download = `insidelink-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setExportMessage(
        `Exported ${payload.count} ${payload.count === 1 ? "link" : "links"} to JSON.`,
      );
    } catch {
      setExportError("Network error while exporting links backup.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setDryRunResult(null);
    setImportResult(null);
    setImportErrors([]);

    if (!file) {
      setFileName("");
      setIncomingLinks(null);
      return;
    }

    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      const extracted = extractIncomingLinks(parsed);
      if (!extracted || extracted.length === 0) {
        setIncomingLinks(null);
        setImportErrors([
          "Backup JSON must contain a non-empty `links` array.",
        ]);
        return;
      }
      setIncomingLinks(extracted);
    } catch {
      setIncomingLinks(null);
      setImportErrors(["Selected file is not valid JSON."]);
    }
  };

  const handleStrategyChange = (strategy: BackupConflictStrategy) => {
    setConflictStrategy(strategy);
    // Force a fresh dry-run whenever conflict strategy changes
    setDryRunResult(null);
    setImportResult(null);
  };

  const handleDryRunPreview = async () => {
    if (!incomingLinks || isPreviewing || isImporting) return;
    setIsPreviewing(true);
    setDryRunResult(null);
    setImportResult(null);
    setImportErrors([]);

    try {
      const res = await fetch("/api/v1/links/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          links: incomingLinks,
          conflictStrategy,
          dryRun: true,
        }),
      });
      const json = (await res.json()) as {
        data?: ImportLinksBackupResult;
      } & ApiErrorShape;

      if (!res.ok || !json.data) {
        setImportErrors(collectApiErrors(json));
        return;
      }

      setDryRunResult(json.data);
    } catch {
      setImportErrors(["Network error while running dry-run preview."]);
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!incomingLinks || !dryRunResult || isImporting || isPreviewing) return;
    setIsImporting(true);
    setImportErrors([]);

    try {
      const res = await fetch("/api/v1/links/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          links: incomingLinks,
          conflictStrategy,
          dryRun: false,
        }),
      });
      const json = (await res.json()) as {
        data?: ImportLinksBackupResult;
      } & ApiErrorShape;

      if (!res.ok || !json.data) {
        setImportErrors(collectApiErrors(json));
        return;
      }

      setImportResult(json.data);
      setDryRunResult(null);
    } catch {
      setImportErrors(["Network error while importing backup."]);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <section
      id="backup-studio"
      className="obsidian-surface space-y-6 rounded-2xl border border-zinc-800/90 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
        <div className="flex items-center gap-2.5">
          <span className="il-accent-pill flex h-9 w-9 items-center justify-center rounded-xl border">
            <DatabaseBackup className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-white">
              Backup &amp; Restore Studio
            </h2>
            <p className="text-xs text-zinc-400">
              Export portable JSON snapshots or restore links with mandatory
              dry-run verification.
            </p>
          </div>
        </div>
      </div>

      {/* Export JSON Backup */}
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-zinc-800/80 bg-[var(--il-canvas)]/60 p-4 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <h3 className="text-xs font-semibold text-zinc-200">
            Export JSON Backup
          </h3>
          <p className="text-[11px] text-zinc-500">
            Downloads all links, HUB blocks, routing rules, and theme overrides
            (sensitive PIN hashes excluded).
          </p>
          {exportMessage ? (
            <p className="inline-flex items-center gap-1.5 pt-1 text-xs text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {exportMessage}
            </p>
          ) : null}
          {exportError ? (
            <p className="inline-flex items-center gap-1.5 pt-1 text-xs text-red-400">
              <AlertCircle className="h-3.5 w-3.5" />
              {exportError}
            </p>
          ) : null}
        </div>

        <Button
          variant="secondary"
          onClick={handleExportJson}
          disabled={isExporting}
          className="shrink-0"
        >
          {isExporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {isExporting ? "Exporting..." : "Export JSON Backup"}
        </Button>
      </div>

      {/* Import JSON Backup */}
      <div className="space-y-4 rounded-xl border border-zinc-800/80 bg-[var(--il-canvas)]/60 p-4">
        <div>
          <h3 className="text-xs font-semibold text-zinc-200">
            Import JSON Backup
          </h3>
          <p className="text-[11px] text-zinc-500">
            Upload a JSON backup, choose a duplicate strategy, and run a
            mandatory dry-run preview before importing.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            className="hidden"
            aria-label="Upload JSON backup file"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            Choose JSON File
          </Button>
          {fileName ? (
            <span className="inline-flex items-center gap-1.5 font-mono text-xs text-zinc-300">
              <FileJson className="h-3.5 w-3.5 text-[var(--il-accent)]" />
              {fileName}
              {incomingLinks ? ` (${incomingLinks.length} links)` : ""}
            </span>
          ) : (
            <span className="text-xs text-zinc-500">No file selected</span>
          )}
        </div>

        {/* Duplicate strategy */}
        <div className="space-y-2">
          <span className="block text-xs font-medium text-zinc-300">
            Duplicate Slug Strategy
          </span>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(
              [
                {
                  value: "skip",
                  title: "Skip existing",
                  desc: "Keep current database links untouched on slug collision.",
                },
                {
                  value: "update",
                  title: "Update existing",
                  desc: "Overwrite matching slugs with fields from the backup.",
                },
              ] as const
            ).map((opt) => {
              const active = conflictStrategy === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleStrategyChange(opt.value)}
                  className={cn(
                    "cursor-pointer rounded-xl border p-3 text-left transition",
                    active
                      ? "border-[rgba(var(--il-accent-rgb),0.55)] bg-[var(--il-elevated)]/70"
                      : "border-zinc-800 bg-[var(--il-card)]/70 hover:border-zinc-700",
                  )}
                >
                  <p className="text-xs font-semibold text-white">
                    {opt.title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-400">{opt.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleDryRunPreview}
            disabled={!incomingLinks || isPreviewing || isImporting}
          >
            {isPreviewing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            {isPreviewing ? "Running Dry-Run..." : "Run Dry-Run Preview"}
          </Button>

          <button
            type="button"
            onClick={handleConfirmImport}
            disabled={!dryRunResult || isImporting || isPreviewing}
            className="il-accent-btn inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:pointer-events-none disabled:opacity-45"
          >
            {isImporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            {isImporting ? "Importing..." : "Confirm Import"}
          </button>
        </div>

        {/* Validation Errors */}
        {importErrors.length > 0 ? (
          <div className="rounded-xl border border-red-500/35 bg-red-950/35 p-3.5 text-xs text-red-200">
            <p className="font-semibold text-red-300">
              Validation errors ({importErrors.length})
            </p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4">
              {importErrors.slice(0, 6).map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Dry-Run Preview Report */}
        {dryRunResult ? (
          <div className="space-y-3 rounded-xl border border-[rgba(var(--il-accent-rgb),0.35)] bg-[var(--il-card)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-white">
                Dry-Run Preview ({dryRunResult.totalIncoming} incoming)
              </p>
              <Badge variant="emerald">0 errors · Ready to confirm</Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg border border-zinc-800 bg-[var(--il-canvas)] p-2.5">
                <p className="text-[10px] uppercase text-zinc-500">Created</p>
                <p className="mt-0.5 font-mono text-base font-semibold text-emerald-300">
                  {dryRunResult.toCreate}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-[var(--il-canvas)] p-2.5">
                <p className="text-[10px] uppercase text-zinc-500">Updated</p>
                <p className="mt-0.5 font-mono text-base font-semibold text-sky-300">
                  {dryRunResult.toUpdate}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-[var(--il-canvas)] p-2.5">
                <p className="text-[10px] uppercase text-zinc-500">Skipped</p>
                <p className="mt-0.5 font-mono text-base font-semibold text-zinc-300">
                  {dryRunResult.toSkip}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-[var(--il-canvas)] p-2.5">
                <p className="text-[10px] uppercase text-zinc-500">Errors</p>
                <p className="mt-0.5 font-mono text-base font-semibold text-zinc-300">
                  0
                </p>
              </div>
            </div>

            {dryRunResult.slugsPreview.length > 0 ? (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-zinc-800/80 bg-[var(--il-canvas)] p-2.5">
                {dryRunResult.slugsPreview.map((entry) => (
                  <div
                    key={entry.slug}
                    className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs hover:bg-zinc-900/70"
                  >
                    <div className="min-w-0 truncate">
                      <span className="font-mono text-zinc-300">
                        /{entry.slug}
                      </span>
                      <span className="ml-2 text-zinc-500">{entry.title}</span>
                    </div>
                    <Badge
                      variant={
                        entry.operation === "create"
                          ? "emerald"
                          : entry.operation === "update"
                            ? "sky"
                            : "default"
                      }
                    >
                      {entry.operation}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Completed Import Banner */}
        {importResult ? (
          <div className="rounded-xl border border-emerald-500/35 bg-emerald-950/30 p-3.5 text-xs text-emerald-200">
            <p className="flex items-center gap-1.5 font-semibold text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              Import complete
            </p>
            <p className="mt-1 text-zinc-300">
              Created{" "}
              <strong className="text-white">{importResult.created}</strong>,
              updated{" "}
              <strong className="text-white">{importResult.updated}</strong>,
              skipped{" "}
              <strong className="text-white">{importResult.skipped}</strong>{" "}
              (errors: 0).
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
