import { describe, expect, test } from "vitest";
import { resolveTrustedSources } from "../supabase/functions/baby-ai/sources.ts";
import { createServer } from 'node:http';

const HA_CHANNEL_ID = "UC6t0ees15Lp0gyrLrAyLeJQ";

describe("AI 육아 출처 검증", () => {
  test('실제 Fetch도 검증 전 loopback 리디렉션을 방문하지 않는다', async () => {
    let privateRequests = 0;
    const server = createServer((req, res) => {
      if (req.url === '/start') { res.writeHead(302, { location: `http://127.0.0.1:${server.address().port}/private` }); res.end(); }
      else { privateRequests++; res.writeHead(200); res.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      // Only the initial trusted endpoint is mapped to this test server; redirects use native Fetch.
      const sources = await resolveTrustedSources([{ web: { title: 'test', uri: 'https://vertexaisearch.cloud.google.com/start' } }], (_url, options) => fetch(`http://127.0.0.1:${server.address().port}/start`, options));
      expect(sources).toEqual([]);
      expect(privateRequests).toBe(0);
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  });
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
    ], async (url) => String(url).includes('vertexaisearch')
      ? new Response(null, { status: 302, headers: { location: "https://www.who.int/health-topics/infant-health" } })
      : new Response(null, { status: 200 }));

    expect(sources).toEqual([
      { title: "WHO", url: "https://www.who.int/health-topics/infant-health", type: "web" },
    ]);
  });

  test("사설 주소로 향하는 리디렉션은 거부한다", async () => {
    const sources = await resolveTrustedSources([
      { web: { title: "내부 주소", uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/private" } },
    ], async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } }));

    expect(sources).toEqual([]);
  });

  test.each([
    'https://127.0.0.1/private', 'http://169.254.169.254/latest/meta-data/', 'https://[::1]/',
    'https://example.com/untrusted', 'https://www.who.int.evil.test/',
    'https://user:password@www.who.int/', 'https://www.who.int:8443/', 'javascript:alert(1)',
  ])('리디렉션 목적지를 요청 전에 거부한다: %s', async (destination) => {
    const calls = [];
    const sources = await resolveTrustedSources([{ web: { title: 'redirect', uri: 'https://vertexaisearch.cloud.google.com/start' } }], async (url, options) => {
      calls.push(String(url));
      // Model Fetch's automatic-follow behavior to detect requests made before URL validation.
      if (options.redirect !== 'manual') calls.push(destination);
      return new Response(null, { status: 302, headers: { location: destination } });
    });
    expect(sources).toEqual([]);
    expect(calls).toEqual(['https://vertexaisearch.cloud.google.com/start']);
  });

  test('상대 경로를 따르고 허용된 중간 경유지만 요청한다', async () => {
    const calls = [];
    const sources = await resolveTrustedSources([{ web: { title: 'WHO', uri: 'https://vertexaisearch.cloud.google.com/start' } }], async (url, options) => {
      calls.push(String(url)); expect(options.redirect).toBe('manual');
      const target = calls.length === 1 ? '/next' : calls.length === 2 ? 'https://www.who.int/health' : null;
      return target ? new Response(null, { status: 307, headers: { location: target } }) : new Response(null);
    });
    expect(calls).toEqual(['https://vertexaisearch.cloud.google.com/start','https://vertexaisearch.cloud.google.com/next','https://www.who.int/health']);
    expect(sources[0]?.url).toBe('https://www.who.int/health');
  });

  test('순환 리디렉션은 요청 5회 안에 종료한다', async () => {
    let calls = 0;
    const sources = await resolveTrustedSources([{ web: { title: 'loop', uri: 'https://vertexaisearch.cloud.google.com/loop' } }], async () => {
      calls++; return new Response(null, { status: 302, headers: { location: '/loop' } });
    });
    expect(sources).toEqual([]); expect(calls).toBe(5);
  });

  test.each(['metadata','channel'])('YouTube %s 응답의 외부 리디렉션도 요청 전에 차단한다', async (stage) => {
    const calls = [];
    const sources = await resolveTrustedSources([{ web: { title: 'video', uri: 'https://www.youtube.com/watch?v=abc123' } }], async (url, options) => {
      calls.push(String(url));
      if (stage === 'channel' && String(url).includes('/oembed')) return new Response(JSON.stringify({ author_url: 'https://www.youtube.com/@channel' }));
      if (options.redirect !== 'manual') calls.push('https://127.0.0.1/private');
      return new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/private' } });
    });
    expect(sources).toEqual([]);
    expect(calls.every(url=>new URL(url).hostname==='www.youtube.com')).toBe(true);
    expect(calls).toHaveLength(stage==='metadata'?1:2);
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
