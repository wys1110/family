export type GroundingChunk = {
  web?: {
    title?: string;
    uri?: string;
  };
};

export type GroundedSource = {
  title: string;
  url: string;
  type: "web" | "youtube";
};

const TRUSTED_HOSTS = [
  "kdca.go.kr",
  "mohw.go.kr",
  "pediatrics.or.kr",
  "nfa.go.kr",
  "who.int",
  "cdc.gov",
  "aap.org",
  "healthychildren.org",
  "nhs.uk",
];

const GOOGLE_REDIRECT_HOSTS = ["vertexaisearch.cloud.google.com"];
const YOUTUBE_HOSTS = ["youtube.com", "www.youtube.com", "youtu.be"];
const HA_CHANNEL_ID = "UC6t0ees15Lp0gyrLrAyLeJQ";

export async function resolveTrustedSources(
  chunks: GroundingChunk[],
  fetchImpl: typeof fetch = fetch,
): Promise<GroundedSource[]> {
  const resolved = await Promise.all((chunks || []).slice(0, 10).map((chunk) => resolveChunk(chunk, fetchImpl)));
  const unique = new Map<string, GroundedSource>();
  for (const source of resolved) {
    if (source && !unique.has(source.url)) unique.set(source.url, source);
    if (unique.size >= 5) break;
  }
  return [...unique.values()];
}

async function resolveChunk(chunk: GroundingChunk, fetchImpl: typeof fetch): Promise<GroundedSource | null> {
  const title = String(chunk?.web?.title || "").trim().slice(0, 200);
  let url = parseHttpsUrl(chunk?.web?.uri);
  if (!title || !url || isPrivateHost(url.hostname)) return null;

  if (matchesHost(url.hostname, GOOGLE_REDIRECT_HOSTS)) {
    try {
      const response = await fetchImpl(url.toString(), {
        method: "HEAD",
        redirect: "follow",
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) return null;
      url = parseHttpsUrl(response.url);
      if (!url || isPrivateHost(url.hostname)) return null;
    } catch {
      return null;
    }
  }

  if (matchesHost(url.hostname, TRUSTED_HOSTS)) {
    return { title, url: url.toString(), type: "web" };
  }
  if (!YOUTUBE_HOSTS.includes(url.hostname.toLowerCase())) return null;
  if (await isTrustedYoutubeUrl(url, fetchImpl)) {
    return { title, url: url.toString(), type: "youtube" };
  }
  return null;
}

async function isTrustedYoutubeUrl(url: URL, fetchImpl: typeof fetch): Promise<boolean> {
  if (url.pathname === `/channel/${HA_CHANNEL_ID}`) return true;
  if (!(url.pathname === "/watch" || url.hostname === "youtu.be")) return false;

  try {
    const oembed = new URL("https://www.youtube.com/oembed");
    oembed.searchParams.set("url", url.toString());
    oembed.searchParams.set("format", "json");
    const metadataResponse = await fetchImpl(oembed.toString(), {
      signal: AbortSignal.timeout(3000),
    });
    if (!metadataResponse.ok) return false;
    const metadata = await metadataResponse.json() as { author_url?: string };
    const authorUrl = parseHttpsUrl(metadata.author_url);
    if (!authorUrl || !YOUTUBE_HOSTS.includes(authorUrl.hostname.toLowerCase())) return false;
    const channelResponse = await fetchImpl(authorUrl.toString(), {
      signal: AbortSignal.timeout(3000),
    });
    if (!channelResponse.ok) return false;
    const channelPage = await channelResponse.text();
    return channelPage.includes(`"channelId":"${HA_CHANNEL_ID}"`) ||
      channelPage.includes(`"externalId":"${HA_CHANNEL_ID}"`);
  } catch {
    return false;
  }
}

function parseHttpsUrl(value: unknown): URL | null {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function matchesHost(hostname: string, allowed: string[]): boolean {
  const host = hostname.toLowerCase();
  return allowed.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host === "::1") return true;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const octets = ipv4.slice(1).map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return true;
  return octets[0] === 10 || octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168);
}
