"use client";

import React, { useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Clock3,
  Layers,
  MapPin,
  MousePointerClick,
  Radio,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type {
  AnalyticsSummaryDTO,
  BreakdownItem,
  DailySeriesPoint,
  HourlyPoint,
  RecentClickEventDTO,
  SubLinkBreakdownItem,
  TopLinkItem,
} from "@/server/services/analytics.service";

const regionDisplayNames: Intl.DisplayNames | null = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();

export function formatRegionFlag(code: string): string {
  const upper = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper) || upper === "XX") {
    return "🌐";
  }
  return String.fromCodePoint(
    127397 + upper.charCodeAt(0),
    127397 + upper.charCodeAt(1),
  );
}

export function formatRegionLabel(code: string): string {
  const upper = code.trim().toUpperCase();
  if (!upper || upper === "XX") {
    return "Unknown";
  }
  if (/^[A-Z]{2}$/.test(upper)) {
    try {
      const name = regionDisplayNames?.of(upper);
      if (name && name !== upper) {
        return `${formatRegionFlag(upper)} ${name}`;
      }
    } catch {
      // Fallback to code
    }
    return `${formatRegionFlag(upper)} ${upper}`;
  }
  return upper;
}

function formatUtcShortDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  }).format(parsed);
}

function formatUtcFullDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function formatRelativeClickTime(isoTimestamp: string): string {
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) return isoTimestamp;
  const diffSec = Math.max(
    0,
    Math.floor((Date.now() - parsed.getTime()) / 1000),
  );
  if (diffSec < 60) return diffSec < 10 ? "Just now" : `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function formatUtcTimestamp(isoTimestamp: string): string {
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) return isoTimestamp;
  return `${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(parsed)} UTC`;
}

const CSV_FORMULA_TRIGGER_REGEX = /^[=+\-@\t\r]/;

/**
 * Neutralizes spreadsheet formula injection by prefixing `'` when the unescaped
 * or trimmed cell value starts with `=`, `+`, `-`, `@`, `\t`, or `\r`.
 */
export function neutralizeCsvCell(
  value: string | number | null | undefined,
): string {
  const str = value === null || value === undefined ? "" : String(value);
  const trimmed = str.trim();
  if (
    CSV_FORMULA_TRIGGER_REGEX.test(str) ||
    CSV_FORMULA_TRIGGER_REGEX.test(trimmed)
  ) {
    return `'${str}`;
  }
  return str;
}

export function escapeCsvCell(
  value: string | number | null | undefined,
): string {
  const safe = neutralizeCsvCell(value);
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function csvRow(cells: Array<string | number | null | undefined>): string {
  return cells.map(escapeCsvCell).join(",");
}

/**
 * Generates and downloads a UTF-8 CSV report for an AnalyticsSummaryDTO.
 */
export function exportAnalyticsSummaryCsv(
  summary: AnalyticsSummaryDTO,
  filenamePrefix?: string,
): void {
  const lines: string[] = [];

  lines.push(csvRow(["Section", "Metric", "Value"]));
  lines.push(csvRow(["Summary", "Scope", summary.scope]));
  lines.push(csvRow(["Summary", "Link ID", summary.linkId]));
  lines.push(csvRow(["Summary", "Range", summary.range]));
  lines.push(
    csvRow(["Summary", "Total Clicks in Range", summary.totalClicksInRange]),
  );
  lines.push(
    csvRow(["Summary", "Previous Period Clicks", summary.previousPeriodClicks]),
  );
  lines.push(
    csvRow([
      "Summary",
      "Delta Percentage (%)",
      summary.deltaPercentage !== null ? summary.deltaPercentage : "N/A",
    ]),
  );
  lines.push(
    csvRow(["Summary", "HUB Button Clicks", summary.hubSubLinkClicks]),
  );
  lines.push(csvRow(["Summary", "All-Time Clicks", summary.allTimeClicks]));
  lines.push("");

  lines.push(csvRow(["Daily Series (UTC)", "Date", "Clicks"]));
  for (const point of summary.dailySeries) {
    lines.push(csvRow(["Daily", point.date, point.clicks]));
  }
  lines.push("");

  if (summary.hourlyDistribution.length > 0) {
    lines.push(csvRow(["24h Distribution (UTC)", "Hour (UTC)", "Clicks"]));
    for (const point of summary.hourlyDistribution) {
      lines.push(
        csvRow([
          "Hourly UTC",
          `${String(point.hour).padStart(2, "0")}:00`,
          point.clicks,
        ]),
      );
    }
    lines.push("");
  }

  const breakdownSections: Array<{ name: string; items: BreakdownItem[] }> = [
    { name: "Countries", items: summary.countries },
    { name: "Cities", items: summary.cities },
    { name: "Referrers", items: summary.referrers },
    { name: "Campaigns (?ref=)", items: summary.queryRefs },
    { name: "Devices", items: summary.devices },
    { name: "Operating Systems", items: summary.os },
    { name: "Browsers", items: summary.browsers },
  ];

  lines.push(csvRow(["Dimension", "Key", "Clicks", "Percentage (%)"]));
  for (const section of breakdownSections) {
    for (const item of section.items) {
      lines.push(
        csvRow([section.name, item.key, item.count, `${item.percentage}%`]),
      );
    }
  }

  if (summary.subLinks.length > 0) {
    lines.push("");
    lines.push(
      csvRow([
        "HUB Button Breakdown",
        "Sub-Link ID",
        "Label",
        "Clicks",
        "Share (%)",
      ]),
    );
    for (const sub of summary.subLinks) {
      lines.push(
        csvRow([
          "HUB Button",
          sub.subLinkId,
          sub.label,
          sub.count,
          `${sub.percentage}%`,
        ]),
      );
    }
  }

  if (summary.topLinks && summary.topLinks.length > 0) {
    lines.push("");
    lines.push(
      csvRow([
        "Top Links",
        "Slug",
        "Title",
        "Clicks in Range",
        "All-Time Clicks",
      ]),
    );
    for (const top of summary.topLinks) {
      lines.push(
        csvRow([
          "Top Link",
          `/${top.slug}`,
          top.title,
          top.clicksInRange,
          top.allTimeClicks,
        ]),
      );
    }
  }

  if (summary.recentEvents.length > 0) {
    lines.push("");
    lines.push(
      csvRow([
        "Recent Events",
        "Clicked At (UTC)",
        "Slug",
        "Country",
        "City",
        "Device",
        "OS",
        "Browser",
        "Referrer",
        "Ref",
      ]),
    );
    for (const ev of summary.recentEvents) {
      lines.push(
        csvRow([
          "Recent Event",
          ev.clickedAt,
          `/${ev.slug}`,
          ev.country,
          ev.city ?? "",
          ev.device,
          ev.os,
          ev.browser,
          ev.referrer,
          ev.queryParamRef ?? "",
        ]),
      );
    }
  }

  const csvContent = "\uFEFF" + lines.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safePrefix = (filenamePrefix || `analytics-${summary.linkId}`)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-");
  a.href = url;
  a.download = `${safePrefix}-${summary.range}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function DailyClicksBarChart({
  series,
  totalClicksInRange,
}: {
  series: DailySeriesPoint[];
  totalClicksInRange?: number;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const maxClicks = Math.max(1, ...series.map((d) => d.clicks));
  const total =
    totalClicksInRange ?? series.reduce((acc, point) => acc + point.clicks, 0);

  const gapClass =
    series.length <= 7 ? "gap-2" : series.length <= 31 ? "gap-1" : "gap-[2px]";

  const milestoneLabels = useMemo(() => {
    if (series.length === 0) return [];
    if (series.length === 1) {
      return [{ index: 0, label: formatUtcShortDate(series[0]!.date) }];
    }
    const indices = new Set<number>([0, series.length - 1]);
    if (series.length <= 7) {
      indices.add(Math.floor((series.length - 1) / 2));
    } else {
      indices.add(Math.round((series.length - 1) * 0.25));
      indices.add(Math.round((series.length - 1) * 0.5));
      indices.add(Math.round((series.length - 1) * 0.75));
    }
    return Array.from(indices)
      .sort((a, b) => a - b)
      .map((index) => ({
        index,
        label: formatUtcShortDate(series[index]!.date),
      }));
  }, [series]);

  const activePoint =
    hoveredIndex !== null ? (series[hoveredIndex] ?? null) : null;

  return (
    <div className="obsidian-surface rounded-2xl border border-zinc-800/80 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
          Daily Clicks Trend (UTC)
        </h4>
        <div className="flex items-center gap-3 font-mono text-xs text-zinc-400">
          {activePoint ? (
            <span className="text-emerald-300">
              {formatUtcFullDate(activePoint.date)}: {activePoint.clicks} clicks
            </span>
          ) : (
            <span className="text-zinc-500">
              Peak: {maxClicks.toLocaleString("en-US")} / day
            </span>
          )}
        </div>
      </div>

      <div className={cn("relative flex h-40 items-end pt-8", gapClass)}>
        {series.map((point, idx) => {
          const heightPct =
            point.clicks === 0
              ? 4
              : Math.max(8, Math.round((point.clicks / maxClicks) * 100));
          const pctOfTotal =
            total > 0 ? Math.round((point.clicks / total) * 1000) / 10 : 0;
          const isActive = hoveredIndex === idx;

          const tooltipAlignClass =
            idx <= 2
              ? "left-0"
              : idx >= series.length - 3
                ? "right-0"
                : "left-1/2 -translate-x-1/2";

          return (
            <div
              key={point.date}
              className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-end"
            >
              {isActive && (
                <div
                  role="tooltip"
                  className={cn(
                    "pointer-events-none absolute -top-1 z-20 whitespace-nowrap rounded-lg border border-emerald-500/35 bg-[#09090b]/95 px-2.5 py-1.5 text-[11px] shadow-xl backdrop-blur-md",
                    tooltipAlignClass,
                  )}
                >
                  <div className="font-mono font-medium text-zinc-200">
                    {formatUtcFullDate(point.date)} (UTC)
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 font-mono">
                    <span className="font-semibold text-emerald-300">
                      {point.clicks.toLocaleString("en-US")} clicks
                    </span>
                    <span className="text-zinc-400">
                      ({pctOfTotal}% of total)
                    </span>
                  </div>
                </div>
              )}

              <button
                type="button"
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() =>
                  setHoveredIndex((curr) => (curr === idx ? null : curr))
                }
                onFocus={() => setHoveredIndex(idx)}
                onBlur={() =>
                  setHoveredIndex((curr) => (curr === idx ? null : curr))
                }
                aria-label={`${point.date}: ${point.clicks} clicks (${pctOfTotal}% of total)`}
                style={{ height: `${heightPct}%` }}
                className={cn(
                  "w-full min-w-[2px] cursor-pointer rounded-t-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400",
                  point.clicks > 0
                    ? isActive
                      ? "bg-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.45)]"
                      : "bg-emerald-500/75 hover:bg-emerald-400"
                    : isActive
                      ? "bg-zinc-700"
                      : "bg-zinc-800/60",
                )}
              />
            </div>
          );
        })}
      </div>

      {milestoneLabels.length > 0 && (
        <div className="mt-2 flex items-center justify-between border-t border-zinc-800/60 pt-2 font-mono text-[10px] text-zinc-500">
          {milestoneLabels.map((m) => (
            <span key={m.index}>{m.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 90-Day GitHub-style UTC activity heatmap.
 */
export function ActivityHeatmap90d({
  heatmap90d,
}: {
  heatmap90d: DailySeriesPoint[];
}) {
  const [activePoint, setActivePoint] = useState<DailySeriesPoint | null>(null);

  const { weeks, maxClicks, total90d } = useMemo(() => {
    if (heatmap90d.length === 0) {
      return {
        weeks: [] as Array<Array<DailySeriesPoint | null>>,
        maxClicks: 0,
        total90d: 0,
      };
    }

    const firstDate = new Date(`${heatmap90d[0]!.date}T00:00:00Z`);
    const leadingBlanks = Number.isNaN(firstDate.getTime())
      ? 0
      : firstDate.getUTCDay();

    const padded: Array<DailySeriesPoint | null> = [
      ...new Array<null>(leadingBlanks).fill(null),
      ...heatmap90d,
    ];
    while (padded.length % 7 !== 0) {
      padded.push(null);
    }

    const groupedWeeks: Array<Array<DailySeriesPoint | null>> = [];
    for (let i = 0; i < padded.length; i += 7) {
      groupedWeeks.push(padded.slice(i, i + 7));
    }

    let peak = 0;
    let total = 0;
    for (const point of heatmap90d) {
      total += point.clicks;
      if (point.clicks > peak) peak = point.clicks;
    }

    return { weeks: groupedWeeks, maxClicks: peak, total90d: total };
  }, [heatmap90d]);

  const getCellIntensityClass = (clicks: number) => {
    if (clicks <= 0 || maxClicks <= 0) {
      return "border-zinc-800/80 bg-[#141418]";
    }
    const ratio = clicks / maxClicks;
    if (ratio >= 0.75) {
      return "border-emerald-300/60 bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.35)]";
    }
    if (ratio >= 0.5) {
      return "border-emerald-400/50 bg-emerald-500/85";
    }
    if (ratio >= 0.25) {
      return "border-emerald-600/50 bg-emerald-700/80";
    }
    return "border-emerald-800/60 bg-emerald-950/90";
  };

  return (
    <div className="obsidian-surface rounded-2xl border border-zinc-800/80 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-3.5 w-3.5 text-emerald-400" />
          <h4 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            90-Day Activity Heatmap (UTC)
          </h4>
        </div>

        <div className="font-mono text-xs text-zinc-400">
          {activePoint ? (
            <span className="text-emerald-300">
              {formatUtcFullDate(activePoint.date)}: {activePoint.clicks} click
              {activePoint.clicks === 1 ? "" : "s"}
            </span>
          ) : (
            <span className="text-zinc-500">
              {total90d.toLocaleString("en-US")} clicks in last 90d
            </span>
          )}
        </div>
      </div>

      {weeks.length === 0 ? (
        <p className="py-6 text-center text-xs text-zinc-500">
          No 90-day activity data available yet.
        </p>
      ) : (
        <div className="overflow-x-auto pb-1">
          <div className="inline-flex min-w-full items-start gap-2">
            <div className="grid grid-rows-7 gap-1 pt-0.5 font-mono text-[9px] text-zinc-600">
              <span className="h-3 leading-3">Sun</span>
              <span className="h-3 leading-3">Mon</span>
              <span className="h-3 leading-3">Tue</span>
              <span className="h-3 leading-3">Wed</span>
              <span className="h-3 leading-3">Thu</span>
              <span className="h-3 leading-3">Fri</span>
              <span className="h-3 leading-3">Sat</span>
            </div>

            <div className="flex flex-1 justify-between gap-1">
              {weeks.map((week, weekIdx) => (
                <div key={weekIdx} className="grid grid-rows-7 gap-1">
                  {week.map((day, dayIdx) =>
                    day ? (
                      <button
                        key={day.date}
                        type="button"
                        onMouseEnter={() => setActivePoint(day)}
                        onMouseLeave={() =>
                          setActivePoint((curr) =>
                            curr?.date === day.date ? null : curr,
                          )
                        }
                        onFocus={() => setActivePoint(day)}
                        onBlur={() =>
                          setActivePoint((curr) =>
                            curr?.date === day.date ? null : curr,
                          )
                        }
                        title={`${day.date} (UTC): ${day.clicks} clicks`}
                        aria-label={`${day.date} UTC: ${day.clicks} clicks`}
                        className={cn(
                          "h-3 w-3 cursor-pointer rounded-[3px] border transition-transform hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400",
                          getCellIntensityClass(day.clicks),
                        )}
                      />
                    ) : (
                      <span
                        key={`blank-${weekIdx}-${dayIdx}`}
                        aria-hidden="true"
                        className="h-3 w-3"
                      />
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between border-t border-zinc-800/60 pt-2 text-[10px] text-zinc-500">
        <span>Last 90 UTC days</span>
        <div className="flex items-center gap-1">
          <span>Less</span>
          <span className="h-2.5 w-2.5 rounded-[2px] border border-zinc-800 bg-[#141418]" />
          <span className="h-2.5 w-2.5 rounded-[2px] border border-emerald-800/60 bg-emerald-950/90" />
          <span className="h-2.5 w-2.5 rounded-[2px] border border-emerald-600/50 bg-emerald-700/80" />
          <span className="h-2.5 w-2.5 rounded-[2px] border border-emerald-400/50 bg-emerald-500/85" />
          <span className="h-2.5 w-2.5 rounded-[2px] border border-emerald-300/60 bg-emerald-400" />
          <span>More</span>
        </div>
      </div>
    </div>
  );
}

/**
 * 24-Hour Peak Traffic UTC distribution strip.
 */
export function HourlyDistributionStrip({
  hourlyDistribution,
}: {
  hourlyDistribution: HourlyPoint[];
}) {
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);

  const normalized = useMemo(() => {
    const byHour = new Map<number, number>();
    for (const entry of hourlyDistribution) {
      byHour.set(entry.hour, entry.clicks);
    }
    return Array.from({ length: 24 }, (_, hour) => ({
      hour,
      clicks: byHour.get(hour) ?? 0,
    }));
  }, [hourlyDistribution]);

  const totalHourly = normalized.reduce((sum, item) => sum + item.clicks, 0);
  const maxHourly = Math.max(1, ...normalized.map((item) => item.clicks));

  const peakHour = useMemo(() => {
    if (totalHourly === 0) return null;
    return normalized.reduce((best, curr) =>
      curr.clicks > best.clicks ? curr : best,
    );
  }, [normalized, totalHourly]);

  const activePoint =
    hoveredHour !== null ? (normalized[hoveredHour] ?? null) : null;

  return (
    <div className="obsidian-surface rounded-2xl border border-zinc-800/80 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock3 className="h-3.5 w-3.5 text-sky-400" />
          <h4 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            24-Hour Peak Traffic (UTC)
          </h4>
        </div>

        <div className="font-mono text-xs text-zinc-400">
          {activePoint ? (
            <span className="text-sky-300">
              {String(activePoint.hour).padStart(2, "0")}:00–
              {String(activePoint.hour).padStart(2, "0")}:59 UTC:{" "}
              {activePoint.clicks} clicks
            </span>
          ) : peakHour ? (
            <span className="text-zinc-400">
              Peak window:{" "}
              <strong className="text-sky-300">
                {String(peakHour.hour).padStart(2, "0")}:00 UTC
              </strong>{" "}
              ({peakHour.clicks} clicks)
            </span>
          ) : (
            <span className="text-zinc-500">No hourly activity yet</span>
          )}
        </div>
      </div>

      <div className="flex h-24 items-end gap-1 pt-3">
        {normalized.map((point) => {
          const heightPct =
            point.clicks === 0
              ? 6
              : Math.max(12, Math.round((point.clicks / maxHourly) * 100));
          const isActive = hoveredHour === point.hour;
          const isPeak =
            peakHour !== null &&
            peakHour.clicks > 0 &&
            point.hour === peakHour.hour;

          return (
            <div
              key={point.hour}
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
            >
              <button
                type="button"
                onMouseEnter={() => setHoveredHour(point.hour)}
                onMouseLeave={() =>
                  setHoveredHour((curr) => (curr === point.hour ? null : curr))
                }
                onFocus={() => setHoveredHour(point.hour)}
                onBlur={() =>
                  setHoveredHour((curr) => (curr === point.hour ? null : curr))
                }
                aria-label={`${String(point.hour).padStart(2, "0")}:00 UTC: ${point.clicks} clicks`}
                style={{ height: `${heightPct}%` }}
                className={cn(
                  "w-full min-w-[4px] cursor-pointer rounded-t-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400",
                  point.clicks > 0
                    ? isActive || isPeak
                      ? "bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.45)]"
                      : "bg-sky-500/70 hover:bg-sky-400"
                    : isActive
                      ? "bg-zinc-700"
                      : "bg-zinc-800/70",
                )}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-zinc-800/60 pt-2 font-mono text-[10px] text-zinc-500">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>23:00 UTC</span>
      </div>
    </div>
  );
}

/**
 * Live Clicks Stream displaying up to 25 recent zero-PII click events.
 */
export function RecentClicksStream({
  events,
}: {
  events: RecentClickEventDTO[];
}) {
  return (
    <div className="obsidian-surface rounded-2xl border border-zinc-800/80 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Radio className="h-3.5 w-3.5 text-emerald-400" />
          <h4 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            Live Clicks Stream
          </h4>
        </div>
        <span className="font-mono text-[11px] text-zinc-500">
          Last {events.length} events · Zero PII
        </span>
      </div>

      {events.length === 0 ? (
        <p className="py-6 text-center text-xs text-zinc-500">
          No recent click events recorded yet.
        </p>
      ) : (
        <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
          {events.map((ev) => {
            const locationText = ev.city
              ? `${formatRegionFlag(ev.country)} ${ev.city}${ev.country !== "XX" ? ` (${ev.country})` : ""}`
              : formatRegionLabel(ev.country);

            return (
              <div
                key={ev.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-800/80 bg-[#09090b]/80 px-3 py-2 text-xs"
              >
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <code className="shrink-0 rounded border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[11px] text-emerald-300">
                    /{ev.slug}
                  </code>
                  {ev.subLinkId && (
                    <Badge variant="violet">
                      <Layers className="h-2.5 w-2.5" />
                      {ev.subLinkId}
                    </Badge>
                  )}
                  <span className="truncate font-medium text-zinc-200">
                    {locationText}
                  </span>
                  <span className="text-[11px] text-zinc-500">
                    {ev.device} · {ev.os} · {ev.browser}
                  </span>
                  {ev.referrer && ev.referrer !== "Direct" && (
                    <Badge variant="default">{ev.referrer}</Badge>
                  )}
                  {ev.queryParamRef && (
                    <Badge variant="sky">?ref={ev.queryParamRef}</Badge>
                  )}
                </div>

                <time
                  dateTime={ev.clickedAt}
                  title={formatUtcTimestamp(ev.clickedAt)}
                  className="shrink-0 font-mono text-[11px] text-zinc-500"
                >
                  {formatRelativeClickTime(ev.clickedAt)}
                </time>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function BreakdownListCard({
  title,
  items,
  emptyLabel = "No events recorded in this period",
  formatKey,
  barColorClass = "bg-emerald-500/80",
  icon,
}: {
  title: string;
  items: BreakdownItem[];
  emptyLabel?: string;
  formatKey?: (key: string) => string;
  barColorClass?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="obsidian-surface rounded-2xl border border-zinc-800/80 p-4">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h4 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
          {title}
        </h4>
      </div>

      {items.length === 0 ? (
        <p className="py-6 text-center text-xs text-zinc-500">{emptyLabel}</p>
      ) : (
        <div className="space-y-2.5">
          {items.map((item) => {
            const displayKey = formatKey ? formatKey(item.key) : item.key;
            return (
              <div key={item.key} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-medium text-zinc-200">
                    {displayKey}
                  </span>
                  <span className="shrink-0 font-mono text-zinc-400">
                    {item.count.toLocaleString("en-US")} ({item.percentage}%)
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800/90">
                  <div
                    style={{
                      width: `${Math.min(100, Math.max(4, item.percentage))}%`,
                    }}
                    className={cn("h-full rounded-full", barColorClass)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HubSubLinksCard({
  subLinks,
  totalPrimaryClicks,
}: {
  subLinks: SubLinkBreakdownItem[];
  totalPrimaryClicks: number;
}) {
  return (
    <div className="obsidian-surface rounded-2xl border border-zinc-800/80 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Layers className="h-3.5 w-3.5 text-violet-400" />
          <h4 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            HUB Button Clicks (CTR)
          </h4>
        </div>
        <span className="font-mono text-[11px] text-zinc-500">
          Share of HUB taps
        </span>
      </div>

      <div className="space-y-2.5">
        {subLinks.map((sub) => {
          const ctrPct =
            totalPrimaryClicks > 0
              ? Math.round((sub.count / totalPrimaryClicks) * 1000) / 10
              : null;

          return (
            <div key={sub.subLinkId} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium text-zinc-100">
                    {sub.label}
                  </span>
                  {sub.label !== sub.subLinkId && (
                    <span className="hidden truncate font-mono text-[10px] text-zinc-500 sm:inline">
                      #{sub.subLinkId}
                    </span>
                  )}
                </div>
                <span className="shrink-0 font-mono text-zinc-300">
                  {sub.count.toLocaleString("en-US")} ({sub.percentage}%
                  {ctrPct !== null ? ` · ${ctrPct}% CTR` : ""})
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800/90">
                <div
                  style={{
                    width: `${Math.min(100, Math.max(4, sub.percentage))}%`,
                  }}
                  className="h-full rounded-full bg-violet-500/80"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TopLinksCard({ topLinks }: { topLinks: TopLinkItem[] }) {
  const maxRangeClicks = Math.max(
    1,
    ...topLinks.map((item) => item.clicksInRange),
  );

  return (
    <div className="obsidian-surface rounded-2xl border border-zinc-800/80 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
          <h4 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            Top Performing Links
          </h4>
        </div>
        <span className="font-mono text-[11px] text-zinc-500">
          In range / All-time
        </span>
      </div>

      <div className="space-y-2.5">
        {topLinks.map((link) => {
          const widthPct =
            link.clicksInRange === 0
              ? 2
              : Math.max(
                  6,
                  Math.round((link.clicksInRange / maxRangeClicks) * 100),
                );

          return (
            <div key={link.id} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex min-w-0 items-center gap-2">
                  <code className="shrink-0 rounded border border-zinc-800 bg-[#09090b] px-1.5 py-0.5 font-mono text-[11px] text-emerald-300">
                    /{link.slug}
                  </code>
                  <span className="truncate font-medium text-zinc-200">
                    {link.title}
                  </span>
                </div>
                <span className="shrink-0 font-mono text-zinc-400">
                  <strong className="text-zinc-100">
                    {link.clicksInRange.toLocaleString("en-US")}
                  </strong>{" "}
                  / {link.allTimeClicks.toLocaleString("en-US")}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800/90">
                <div
                  style={{ width: `${widthPct}%` }}
                  className="h-full rounded-full bg-emerald-500/80"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AnalyticsOverviewGrid({
  summary,
}: {
  summary: AnalyticsSummaryDTO;
}) {
  const topCountry = summary.countries[0]?.key;
  const hasHubClicks = summary.hubSubLinkClicks > 0;
  const delta = summary.deltaPercentage;

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "grid grid-cols-1 gap-3 sm:grid-cols-3",
          hasHubClicks && "lg:grid-cols-4",
        )}
      >
        <div className="obsidian-surface rounded-xl border border-zinc-800/90 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] uppercase tracking-wider text-zinc-400">
              Clicks in range ({summary.range})
            </span>
            {delta !== null && (
              <Badge
                variant={
                  delta > 0 ? "emerald" : delta < 0 ? "danger" : "default"
                }
              >
                {delta > 0 ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : delta < 0 ? (
                  <ArrowDownRight className="h-3 w-3" />
                ) : null}
                {delta > 0 ? `+${delta}%` : `${delta}%`}
              </Badge>
            )}
          </div>
          <p className="mt-1 font-mono text-2xl font-semibold text-white">
            {summary.totalClicksInRange.toLocaleString("en-US")}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-zinc-500">
            vs {summary.previousPeriodClicks.toLocaleString("en-US")} prev
            period
          </p>
        </div>

        <div className="obsidian-surface rounded-xl border border-zinc-800/90 p-3.5">
          <span className="text-[11px] uppercase tracking-wider text-zinc-400">
            All-Time Clicks
          </span>
          <p className="mt-1 font-mono text-2xl font-semibold text-emerald-400">
            {summary.allTimeClicks.toLocaleString("en-US")}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Cumulative primary link visits
          </p>
        </div>

        {hasHubClicks && (
          <div className="obsidian-surface rounded-xl border border-zinc-800/90 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] uppercase tracking-wider text-zinc-400">
                HUB Button Clicks
              </span>
              <MousePointerClick className="h-3.5 w-3.5 text-violet-400" />
            </div>
            <p className="mt-1 font-mono text-2xl font-semibold text-violet-300">
              {summary.hubSubLinkClicks.toLocaleString("en-US")}
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Sub-link taps inside HUBs
            </p>
          </div>
        )}

        <div className="obsidian-surface rounded-xl border border-zinc-800/90 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] uppercase tracking-wider text-zinc-400">
              Top Country
            </span>
            <Activity className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <p className="mt-1 truncate text-lg font-semibold text-zinc-100">
            {topCountry ? formatRegionLabel(topCountry) : "—"}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-zinc-500">
            {summary.countries[0]
              ? `${summary.countries[0].count.toLocaleString("en-US")} visits (${summary.countries[0].percentage}%)`
              : "No geographic data yet"}
          </p>
        </div>
      </div>

      <DailyClicksBarChart
        series={summary.dailySeries}
        totalClicksInRange={summary.totalClicksInRange}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ActivityHeatmap90d heatmap90d={summary.heatmap90d} />
        <HourlyDistributionStrip
          hourlyDistribution={summary.hourlyDistribution}
        />
      </div>

      {summary.topLinks && summary.topLinks.length > 0 && (
        <TopLinksCard topLinks={summary.topLinks} />
      )}

      {summary.subLinks.length > 0 && (
        <HubSubLinksCard
          subLinks={summary.subLinks}
          totalPrimaryClicks={summary.totalClicksInRange}
        />
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <BreakdownListCard
          title="Top Countries"
          items={summary.countries}
          formatKey={formatRegionLabel}
        />
        <BreakdownListCard
          title="Top Cities"
          items={summary.cities}
          emptyLabel="No city geolocation data recorded yet"
          barColorClass="bg-cyan-500/80"
          icon={<MapPin className="h-3.5 w-3.5 text-cyan-400" />}
        />
        <BreakdownListCard
          title="Traffic Sources / Referrers"
          items={summary.referrers}
        />
        <BreakdownListCard
          title="Campaigns (?ref= / UTM)"
          items={summary.queryRefs}
          emptyLabel="No ?ref= campaign tags recorded in this period"
          barColorClass="bg-sky-500/80"
        />
        <BreakdownListCard title="Devices" items={summary.devices} />
        <BreakdownListCard title="Operating Systems" items={summary.os} />
        <BreakdownListCard title="Browsers" items={summary.browsers} />
      </div>

      <RecentClicksStream events={summary.recentEvents} />
    </div>
  );
}
