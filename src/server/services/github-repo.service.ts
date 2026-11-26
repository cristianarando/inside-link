import { parseGitHubRepoUrl } from "@/lib/embed-parsers";
import type { HubLinkItem } from "@/lib/validations/link.schema";

export interface GitHubRepoPreview {
  fullName: string;
  description: string | null;
  stars: number | null;
  forks: number | null;
  language: string | null;
  languageColor: string;
  url: string;
}

const DEFAULT_LANGUAGE_COLOR = "#10b981";
const SUCCESS_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const FALLBACK_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const MAX_CACHE_ENTRIES = 250;

const GITHUB_LANGUAGE_COLORS: Record<string, string> = {
  typescript: "#3178c6",
  javascript: "#f1e05a",
  python: "#3572a5",
  rust: "#dea584",
  go: "#00add8",
  dart: "#00b4ab",
  kotlin: "#a97bff",
  swift: "#f05138",
  java: "#b07219",
  "c++": "#f34b7d",
  "c#": "#178600",
  c: "#555555",
  ruby: "#701516",
  php: "#4f5d95",
  html: "#e34c26",
  css: "#563d7c",
  vue: "#41b883",
  svelte: "#ff3e00",
  astro: "#ff5a03",
  shell: "#89e051",
  sql: "#e38c00",
};

interface RepoCacheEntry {
  expiresAt: number;
  data: GitHubRepoPreview;
}

const repoPreviewCache = new Map<string, RepoCacheEntry>();

function getLanguageColor(language: string | null): string {
  if (!language) return DEFAULT_LANGUAGE_COLOR;
  return (
    GITHUB_LANGUAGE_COLORS[language.trim().toLowerCase()] ??
    DEFAULT_LANGUAGE_COLOR
  );
}

function setCacheEntry(
  key: string,
  data: GitHubRepoPreview,
  ttlMs: number,
  now: number,
) {
  if (
    repoPreviewCache.size >= MAX_CACHE_ENTRIES &&
    !repoPreviewCache.has(key)
  ) {
    const oldestKey = repoPreviewCache.keys().next().value;
    if (oldestKey) repoPreviewCache.delete(oldestKey);
  }
  repoPreviewCache.set(key, {
    expiresAt: now + ttlMs,
    data,
  });
}

export function clearGitHubRepoPreviewCache(): void {
  repoPreviewCache.clear();
}

/**
 * Fetches live repository metadata from GitHub's public REST API with a 2.5s timeout,
 * 15-minute in-memory cache, and graceful fallback on rate-limit or network errors
 * so HUB SSR never fails or stalls.
 */
export async function fetchGitHubRepoPreview(
  rawUrl: string,
  deps: { fetchImpl?: typeof fetch; now?: number } = {},
): Promise<GitHubRepoPreview | null> {
  const parsed = parseGitHubRepoUrl(rawUrl);
  if (!parsed) return null;

  const canonicalRepoUrl = `https://github.com/${parsed.fullName}`;
  const cacheKey = parsed.fullName.toLowerCase();
  const now = deps.now ?? Date.now();

  const cached = repoPreviewCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return {
      ...cached.data,
      url: rawUrl.trim() || canonicalRepoUrl,
    };
  }

  const fallbackPreview: GitHubRepoPreview = {
    fullName: parsed.fullName,
    description: null,
    stars: null,
    forks: null,
    language: null,
    languageColor: DEFAULT_LANGUAGE_COLOR,
    url: rawUrl.trim() || canonicalRepoUrl,
  };

  const fetchImpl = deps.fetchImpl ?? fetch;

  try {
    const apiUrl = `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
    const response = await fetchImpl(apiUrl, {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "InsideLink-SSR/2.0",
      },
      signal: AbortSignal.timeout(2500),
    });

    if (!response.ok) {
      setCacheEntry(cacheKey, fallbackPreview, FALLBACK_CACHE_TTL_MS, now);
      return fallbackPreview;
    }

    const json = (await response.json()) as {
      full_name?: unknown;
      description?: unknown;
      stargazers_count?: unknown;
      forks_count?: unknown;
      language?: unknown;
    };

    const fullName =
      typeof json.full_name === "string" && json.full_name.trim().length > 0
        ? json.full_name.trim()
        : parsed.fullName;
    const description =
      typeof json.description === "string" && json.description.trim().length > 0
        ? json.description.trim().slice(0, 220)
        : null;
    const stars =
      typeof json.stargazers_count === "number" &&
      Number.isFinite(json.stargazers_count)
        ? Math.max(0, Math.trunc(json.stargazers_count))
        : null;
    const forks =
      typeof json.forks_count === "number" && Number.isFinite(json.forks_count)
        ? Math.max(0, Math.trunc(json.forks_count))
        : null;
    const language =
      typeof json.language === "string" && json.language.trim().length > 0
        ? json.language.trim()
        : null;

    const preview: GitHubRepoPreview = {
      fullName,
      description,
      stars,
      forks,
      language,
      languageColor: getLanguageColor(language),
      url: rawUrl.trim() || canonicalRepoUrl,
    };

    setCacheEntry(cacheKey, preview, SUCCESS_CACHE_TTL_MS, now);
    return preview;
  } catch {
    setCacheEntry(cacheKey, fallbackPreview, FALLBACK_CACHE_TTL_MS, now);
    return fallbackPreview;
  }
}

/**
 * Pre-fetches GitHub repository previews in parallel for all `github-repo` blocks
 * inside a HUB link, keyed by sub-link `id`.
 */
export async function prefetchGitHubReposForHub(
  hubLinks: readonly HubLinkItem[] | null | undefined,
  deps: { fetchImpl?: typeof fetch; now?: number } = {},
): Promise<Record<string, GitHubRepoPreview>> {
  if (!hubLinks || hubLinks.length === 0) return {};

  const repoItems = hubLinks.filter(
    (item) =>
      item.kind === "github-repo" &&
      typeof item.url === "string" &&
      item.url.length > 0,
  );
  if (repoItems.length === 0) return {};

  const entries = await Promise.all(
    repoItems.map(async (item) => {
      const preview = await fetchGitHubRepoPreview(item.url!, deps);
      return preview ? ([item.id, preview] as const) : null;
    }),
  );

  const map: Record<string, GitHubRepoPreview> = {};
  for (const entry of entries) {
    if (entry) {
      map[entry[0]] = entry[1];
    }
  }
  return map;
}
