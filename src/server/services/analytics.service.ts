import { and, asc, desc, eq, gte, isNotNull, isNull, lt, ne, sql, type SQL } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { clickEvents, links } from "../db/schema";
import type { AppDatabase } from "./link.service";

export type AnalyticsRange = "7d" | "30d" | "90d";

export interface DailySeriesPoint {
  date: string; // YYYY-MM-DD (UTC)
  clicks: number;
}

export interface BreakdownItem {
  key: string;
  count: number;
  percentage: number;
}

export interface SubLinkBreakdownItem {
  subLinkId: string;
  label: string;
  count: number;
  percentage: number;
}

export interface TopLinkItem {
  id: string;
  slug: string;
  title: string;
  clicksInRange: number;
  allTimeClicks: number;
}

export interface AnalyticsSummaryDTO {
  scope: "overview" | "link";
  linkId: string;
  range: AnalyticsRange;
  totalClicksInRange: number;
  previousPeriodClicks: number;
  deltaPercentage: number | null;
  hubSubLinkClicks: number;
  allTimeClicks: number;
  dailySeries: DailySeriesPoint[];
  countries: BreakdownItem[];
  devices: BreakdownItem[];
  os: BreakdownItem[];
  browsers: BreakdownItem[];
  referrers: BreakdownItem[];
  queryRefs: BreakdownItem[];
  subLinks: SubLinkBreakdownItem[];
  topLinks?: TopLinkItem[];
}

function rangeToDays(range: AnalyticsRange): number {
  switch (range) {
    case "7d":
      return 7;
    case "90d":
      return 90;
    case "30d":
    default:
      return 30;
  }
}

function toUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function roundOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function mapBreakdownRows(
  rows: Array<{ key: string | null; count: number }>,
  total: number,
  fallbackKey: string
): BreakdownItem[] {
  if (total === 0) return [];
  return rows.map((row) => {
    const count = Number(row.count ?? 0);
    return {
      key: row.key && row.key.length > 0 ? row.key : fallbackKey,
      count,
      percentage: roundOneDecimal((count / total) * 100),
    };
  });
}

function parseHubLinkLabels(
  hubLinksJson: string | null,
  target: Map<string, string>
): void {
  if (!hubLinksJson) return;
  try {
    const parsed = JSON.parse(hubLinksJson) as unknown;
    if (!Array.isArray(parsed)) return;
    for (const item of parsed) {
      if (
        typeof item === "object" &&
        item !== null &&
        "id" in item &&
        "label" in item &&
        typeof item.id === "string" &&
        typeof item.label === "string" &&
        item.id.length > 0
      ) {
        target.set(item.id, item.label);
      }
    }
  } catch {
    // Ignore malformed hubLinksJson and fall back to subLinkId
  }
}

export function createAnalyticsService(db: AppDatabase) {
  function breakdownQuery(col: AnySQLiteColumn, conditions: SQL[], limit: number) {
    const countExpr = sql<number>`COUNT(*)`;
    return db
      .select({
        key: sql<string | null>`${col}`,
        count: countExpr,
      })
      .from(clickEvents)
      .where(and(...conditions))
      .groupBy(col)
      .orderBy(desc(countExpr), asc(col))
      .limit(limit);
  }

  async function getAnalyticsSummary(input: {
    linkId: string | "overview";
    range?: AnalyticsRange;
    now?: Date;
  }): Promise<AnalyticsSummaryDTO | null> {
    const range: AnalyticsRange = input.range ?? "30d";
    const days = rangeToDays(range);
    const now = input.now ?? new Date();
    const isOverview = input.linkId === "overview";

    // Start of UTC day (days - 1) days ago, end of current UTC day, and preceding N-day window
    const startUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1), 0, 0, 0, 0)
    );
    const endUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0)
    );
    const prevStartUtc = new Date(
      Date.UTC(startUtc.getUTCFullYear(), startUtc.getUTCMonth(), startUtc.getUTCDate() - days, 0, 0, 0, 0)
    );

    const linkFilter: SQL[] = isOverview ? [] : [eq(clickEvents.linkId, input.linkId)];

    const primaryEventFilters: SQL[] = [
      ...linkFilter,
      isNull(clickEvents.subLinkId),
      gte(clickEvents.clickedAt, startUtc),
      lt(clickEvents.clickedAt, endUtc),
    ];

    const prevEventFilters: SQL[] = [
      ...linkFilter,
      isNull(clickEvents.subLinkId),
      gte(clickEvents.clickedAt, prevStartUtc),
      lt(clickEvents.clickedAt, startUtc),
    ];

    const hubEventFilters: SQL[] = [
      ...linkFilter,
      isNotNull(clickEvents.subLinkId),
      gte(clickEvents.clickedAt, startUtc),
      lt(clickEvents.clickedAt, endUtc),
    ];

    const dayExpr = sql<string>`strftime('%Y-%m-%d', ${clickEvents.clickedAt} / 1000, 'unixepoch')`;
    const subLinkCountExpr = sql<number>`COUNT(*)`;
    const topLinkClicksExpr = sql<number>`COUNT(${clickEvents.id})`;

    const linkMetaQuery = isOverview
      ? db
          .select({
            id: links.id,
            clicksCount: sql<number>`COALESCE(SUM(${links.clicksCount}), 0)`,
            hubLinksJson: sql<string | null>`NULL`,
          })
          .from(links)
      : db
          .select({
            id: links.id,
            clicksCount: links.clicksCount,
            hubLinksJson: links.hubLinksJson,
          })
          .from(links)
          .where(eq(links.id, input.linkId))
          .limit(1);

    const prevCountQuery = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(clickEvents)
      .where(and(...prevEventFilters));

    const hubTotalQuery = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(clickEvents)
      .where(and(...hubEventFilters));

    const dailySeriesQuery = db
      .select({
        date: dayExpr,
        count: sql<number>`COUNT(*)`,
      })
      .from(clickEvents)
      .where(and(...primaryEventFilters))
      .groupBy(dayExpr)
      .orderBy(asc(dayExpr));

    const countriesQuery = breakdownQuery(clickEvents.country, primaryEventFilters, 10);
    const devicesQuery = breakdownQuery(clickEvents.device, primaryEventFilters, 5);
    const osQuery = breakdownQuery(clickEvents.os, primaryEventFilters, 6);
    const browsersQuery = breakdownQuery(clickEvents.browser, primaryEventFilters, 6);
    const referrersQuery = breakdownQuery(clickEvents.referrer, primaryEventFilters, 10);
    const queryRefsQuery = breakdownQuery(
      clickEvents.queryParamRef,
      [...primaryEventFilters, isNotNull(clickEvents.queryParamRef), ne(clickEvents.queryParamRef, "")],
      10
    );

    const subLinksQuery = db
      .select({
        subLinkId: sql<string>`${clickEvents.subLinkId}`,
        count: subLinkCountExpr,
      })
      .from(clickEvents)
      .where(and(...hubEventFilters))
      .groupBy(clickEvents.subLinkId)
      .orderBy(desc(subLinkCountExpr), asc(clickEvents.subLinkId));

    const hubConfigsQuery = isOverview
      ? db
          .select({ hubLinksJson: links.hubLinksJson })
          .from(links)
          .where(isNotNull(links.hubLinksJson))
      : db
          .select({ hubLinksJson: links.hubLinksJson })
          .from(links)
          .where(and(eq(links.id, input.linkId), isNotNull(links.hubLinksJson)))
          .limit(1);

    const topLinksQuery = db
      .select({
        id: links.id,
        slug: links.slug,
        title: links.title,
        clicksInRange: topLinkClicksExpr,
        allTimeClicks: links.clicksCount,
      })
      .from(links)
      .leftJoin(
        clickEvents,
        and(
          eq(clickEvents.linkId, links.id),
          isNull(clickEvents.subLinkId),
          gte(clickEvents.clickedAt, startUtc),
          lt(clickEvents.clickedAt, endUtc)
        )
      )
      .groupBy(links.id)
      .orderBy(desc(topLinkClicksExpr), desc(links.clicksCount), asc(links.slug))
      .limit(8);

    const [
      linkMetaRows,
      prevCountRows,
      hubTotalRows,
      dailyRows,
      countryRows,
      deviceRows,
      osRows,
      browserRows,
      referrerRows,
      queryRefRows,
      subLinkRows,
      hubConfigRows,
      topLinkRows,
    ] = await db.batch([
      linkMetaQuery,
      prevCountQuery,
      hubTotalQuery,
      dailySeriesQuery,
      countriesQuery,
      devicesQuery,
      osQuery,
      browsersQuery,
      referrersQuery,
      queryRefsQuery,
      subLinksQuery,
      hubConfigsQuery,
      topLinksQuery,
    ]);

    if (!isOverview && !linkMetaRows[0]) {
      return null;
    }

    const allTimeClicks = Number(linkMetaRows[0]?.clicksCount ?? 0);
    const previousPeriodClicks = Number(prevCountRows[0]?.count ?? 0);
    const hubSubLinkClicks = Number(hubTotalRows[0]?.count ?? 0);

    // Pre-fill all UTC days in the window with 0 so charts have no gaps
    const dailyMap = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      const d = new Date(
        Date.UTC(startUtc.getUTCFullYear(), startUtc.getUTCMonth(), startUtc.getUTCDate() + i, 0, 0, 0)
      );
      dailyMap.set(toUtcDateKey(d), 0);
    }

    let totalClicksInRange = 0;
    for (const row of dailyRows) {
      const count = Number(row.count ?? 0);
      totalClicksInRange += count;
      if (row.date && dailyMap.has(row.date)) {
        dailyMap.set(row.date, count);
      }
    }

    const dailySeries: DailySeriesPoint[] = Array.from(dailyMap.entries()).map(([date, clicks]) => ({
      date,
      clicks,
    }));

    const deltaPercentage =
      previousPeriodClicks === 0
        ? null
        : roundOneDecimal(((totalClicksInRange - previousPeriodClicks) / previousPeriodClicks) * 100);

    const subLinkLabelMap = new Map<string, string>();
    for (const cfg of hubConfigRows) {
      parseHubLinkLabels(cfg.hubLinksJson, subLinkLabelMap);
    }

    const subLinks: SubLinkBreakdownItem[] = subLinkRows.map((row) => {
      const count = Number(row.count ?? 0);
      return {
        subLinkId: row.subLinkId,
        label: subLinkLabelMap.get(row.subLinkId) ?? row.subLinkId,
        count,
        percentage: hubSubLinkClicks > 0 ? roundOneDecimal((count / hubSubLinkClicks) * 100) : 0,
      };
    });

    const summary: AnalyticsSummaryDTO = {
      scope: isOverview ? "overview" : "link",
      linkId: input.linkId,
      range,
      totalClicksInRange,
      previousPeriodClicks,
      deltaPercentage,
      hubSubLinkClicks,
      allTimeClicks,
      dailySeries,
      countries: mapBreakdownRows(countryRows, totalClicksInRange, "XX"),
      devices: mapBreakdownRows(deviceRows, totalClicksInRange, "desktop"),
      os: mapBreakdownRows(osRows, totalClicksInRange, "Other"),
      browsers: mapBreakdownRows(browserRows, totalClicksInRange, "Other"),
      referrers: mapBreakdownRows(referrerRows, totalClicksInRange, "Direct"),
      queryRefs: mapBreakdownRows(queryRefRows, totalClicksInRange, ""),
      subLinks,
    };

    if (isOverview) {
      summary.topLinks = topLinkRows.map((row) => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        clicksInRange: Number(row.clicksInRange ?? 0),
        allTimeClicks: Number(row.allTimeClicks ?? 0),
      }));
    }

    return summary;
  }

  return {
    getAnalyticsSummary,
  };
}

export type AnalyticsService = ReturnType<typeof createAnalyticsService>;
