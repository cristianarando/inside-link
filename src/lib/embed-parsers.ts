export interface YouTubeEmbedInfo {
  videoId: string;
  embedUrl: string;
  thumbnailUrl: string;
}

export const SPOTIFY_ENTITY_TYPES = [
  "track",
  "album",
  "playlist",
  "episode",
  "show",
  "artist",
] as const;

export type SpotifyEntityType = (typeof SPOTIFY_ENTITY_TYPES)[number];

export interface SpotifyEmbedInfo {
  entityType: SpotifyEntityType;
  entityId: string;
  embedUrl: string;
}

export interface GitHubRepoParsed {
  owner: string;
  repo: string;
  fullName: string;
}

const YOUTUBE_VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;
const SPOTIFY_ENTITY_ID_REGEX = /^[A-Za-z0-9]{10,64}$/;
const GITHUB_OWNER_REGEX = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const GITHUB_REPO_REGEX = /^[A-Za-z0-9._-]{1,100}$/;

const RESERVED_GITHUB_ROOTS = new Set([
  "about",
  "account",
  "codespaces",
  "collections",
  "contact",
  "customer-stories",
  "enterprise",
  "events",
  "explore",
  "features",
  "gist",
  "issues",
  "login",
  "marketplace",
  "new",
  "notifications",
  "orgs",
  "organizations",
  "pricing",
  "pulls",
  "readme",
  "search",
  "security",
  "settings",
  "signup",
  "sponsors",
  "team",
  "topics",
  "trending",
  "users",
]);

function parseHttpUrl(rawUrl: string): URL | null {
  if (typeof rawUrl !== "string") return null;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Strictly parses a YouTube watch, short, live, embed, or youtu.be URL into
 * a privacy-enhanced `youtube-nocookie.com` embed descriptor.
 */
export function parseYouTubeEmbed(rawUrl: string): YouTubeEmbedInfo | null {
  const url = parseHttpUrl(rawUrl);
  if (!url) return null;

  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);
  let candidateId: string | null = null;

  if (host === "youtu.be" || host === "www.youtu.be") {
    candidateId = segments[0] ?? null;
  } else if (
    host === "youtube.com" ||
    host === "www.youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtube-nocookie.com" ||
    host === "www.youtube-nocookie.com"
  ) {
    if (segments[0] === "watch") {
      candidateId = url.searchParams.get("v");
    } else if (
      segments[0] === "embed" ||
      segments[0] === "shorts" ||
      segments[0] === "live" ||
      segments[0] === "v"
    ) {
      candidateId = segments[1] ?? null;
    }
  }

  if (!candidateId || !YOUTUBE_VIDEO_ID_REGEX.test(candidateId)) {
    return null;
  }

  return {
    videoId: candidateId,
    embedUrl: `https://www.youtube-nocookie.com/embed/${candidateId}?autoplay=1&rel=0`,
    thumbnailUrl: `https://i.ytimg.com/vi/${candidateId}/hqdefault.jpg`,
  };
}

function isSpotifyEntityType(value: string): value is SpotifyEntityType {
  return (SPOTIFY_ENTITY_TYPES as readonly string[]).includes(value);
}

/**
 * Strictly parses a Spotify share/embed URL into a safe `open.spotify.com/embed` descriptor.
 */
export function parseSpotifyEmbed(rawUrl: string): SpotifyEmbedInfo | null {
  const url = parseHttpUrl(rawUrl);
  if (!url) return null;

  const host = url.hostname.toLowerCase();
  if (host !== "open.spotify.com" && host !== "play.spotify.com") {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  let idx = 0;

  // Support optional locale prefix such as /intl-es/... or /embed/...
  if (segments[idx]?.toLowerCase().startsWith("intl-")) {
    idx++;
  }
  if (segments[idx]?.toLowerCase() === "embed") {
    idx++;
  }

  const rawType = (segments[idx] ?? "").toLowerCase();
  const rawId = segments[idx + 1] ?? "";

  if (!isSpotifyEntityType(rawType) || !SPOTIFY_ENTITY_ID_REGEX.test(rawId)) {
    return null;
  }

  return {
    entityType: rawType,
    entityId: rawId,
    embedUrl: `https://open.spotify.com/embed/${rawType}/${rawId}?utm_source=generator&theme=0`,
  };
}

/**
 * Strictly parses a GitHub repository URL into `{ owner, repo, fullName }`.
 */
export function parseGitHubRepoUrl(rawUrl: string): GitHubRepoParsed | null {
  const url = parseHttpUrl(rawUrl);
  if (!url) return null;

  const host = url.hostname.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 2) return null;

  const owner = segments[0]!;
  const repo = segments[1]!.replace(/\.git$/i, "");

  if (RESERVED_GITHUB_ROOTS.has(owner.toLowerCase())) {
    return null;
  }
  if (repo === "." || repo === "..") {
    return null;
  }
  if (!GITHUB_OWNER_REGEX.test(owner) || !GITHUB_REPO_REGEX.test(repo)) {
    return null;
  }

  return {
    owner,
    repo,
    fullName: `${owner}/${repo}`,
  };
}
