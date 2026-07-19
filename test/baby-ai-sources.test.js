import { describe, expect, test } from "vitest";
import { resolveTrustedSources } from "../supabase/functions/baby-ai/sources.ts";

const HA_CHANNEL_ID = "UC6t0ees15Lp0gyrLrAyLeJQ";

describe("AI 육아 출처 검증", () => {
  test("공식 웹과 확인된 하정훈 채널만 남긴다", async () => {
    const sources = await resolveTrustedSources([
      { web: { title: "질병관리청", uri: "https://www.kdca.go.kr/example" } },
      { web: { title: "광고 블로그", uri: "https://example.com/ad" } },
      { web: { title: "하정훈의 삐뽀삐뽀 119 소아과", uri: `https://www.youtube.com/channel/${HA_CHANNEL_ID}` } },
    ], async () => { throw new Error("UNEXPECTED_FETCH"); });

    expect(sources).toEqual([
      { title: "질병관리청", url: "https://www.kdca.go.kr/example", type: "web" },
      { title: "하정훈의 삐뽀삐뽀 119 소아과", url: `https://www.youtube.com/channel/${HA_CHANNEL_ID}`, type: "youtube" },
    ]);
  });

  test("Google 검색 리디렉션의 최종 공식 URL만 허용한다", async () => {
    const sources = await resolveTrustedSources([
      { web: { title: "WHO", uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc" } },
    ], async () => ({ ok: true, url: "https://www.who.int/health-topics/infant-health" }));

    expect(sources).toEqual([
      { title: "WHO", url: "https://www.who.int/health-topics/infant-health", type: "web" },
    ]);
  });

  test("사설 주소로 향하는 리디렉션은 거부한다", async () => {
    const sources = await resolveTrustedSources([
      { web: { title: "내부 주소", uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/private" } },
    ], async () => ({ ok: true, url: "http://127.0.0.1/private" }));

    expect(sources).toEqual([]);
  });

  test("유튜브 영상은 oEmbed 저자의 채널 ID가 일치할 때만 허용한다", async () => {
    const sourceFetch = async (url) => {
      const target = String(url);
      if (target.startsWith("https://www.youtube.com/oembed")) {
        return {
          ok: true,
          json: async () => ({ author_url: "https://www.youtube.com/@trusted-pediatrician" }),
        };
      }
      if (target === "https://www.youtube.com/@trusted-pediatrician") {
        return { ok: true, text: async () => `{"channelId":"${HA_CHANNEL_ID}"}` };
      }
      throw new Error(`UNEXPECTED_FETCH:${target}`);
    };

    const sources = await resolveTrustedSources([
      { web: { title: "신생아 수면", uri: "https://www.youtube.com/watch?v=abc123" } },
    ], sourceFetch);

    expect(sources).toEqual([
      { title: "신생아 수면", url: "https://www.youtube.com/watch?v=abc123", type: "youtube" },
    ]);
  });
});
