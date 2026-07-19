import { describe, expect, test } from "vitest";
import {
  buildChatPrompt,
  buildEvidencePrompt,
  buildStrategyPrompt,
  containsUrgentSignal,
  parseStrategy,
  sevenDayStart,
} from "../supabase/functions/baby-ai/domain.ts";

const context = {
  baby: { ageDays: 90, sex: "남아" },
  profile: { temperament: "소리에 예민함", familyNotes: "아빠는 새벽 담당" },
  logs: [{ occurredAt: "2026-07-19T01:00:00Z", category: "수면", sleepMinutes: 80 }],
  householdId: "secret-household",
  userId: "secret-user",
};

describe("Gemini 육아 도메인", () => {
  test("긴급 표현을 감지한다", () => {
    expect(containsUrgentSignal("아기 입술이 파래지고 숨을 못 쉬어요")).toBe(true);
    expect(containsUrgentSignal("낮잠 시간을 바꾸고 싶어요")).toBe(false);
  });

  test("최근 7일 시작 시각을 계산한다", () => {
    expect(sevenDayStart(new Date("2026-07-19T00:00:00.000Z"))).toBe("2026-07-12T00:00:00.000Z");
  });

  test("전략 프롬프트에서 가족과 사용자 식별자를 제외한다", () => {
    const prompt = buildStrategyPrompt(context, "sleep");
    expect(prompt).not.toContain("secret-household");
    expect(prompt).not.toContain("secret-user");
    expect(prompt).toContain("진단하거나 처방하지 마세요");
    expect(prompt).toContain("최근 7일");
  });

  test("대화는 최근 8개 메시지와 새 질문만 포함한다", () => {
    const history = Array.from({ length: 10 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", text: `메시지-${index}` }));
    const prompt = buildChatPrompt(context, history, "새 질문");
    expect(prompt).not.toContain("메시지-0");
    expect(prompt).not.toContain("메시지-1");
    expect(prompt).toContain("메시지-2");
    expect(prompt).toContain("새 질문");
  });

  test("검색 입력은 자유 메모와 연락처를 보내지 않는다", () => {
    const privateContext = {
      ...context,
      profile: {
        ...context.profile,
        babyNotes: "민준 010-1234-5678 parent@example.com https://family.example",
        motherSchedule: { notes: "엄마 회사는 솔페" },
      },
    };

    const prompt = buildEvidencePrompt(privateContext, "sleep", "민준이가 밤잠을 못 자요. 010-1234-5678");

    expect(prompt).not.toContain("민준");
    expect(prompt).not.toContain("010-1234-5678");
    expect(prompt).not.toContain("parent@example.com");
    expect(prompt).not.toContain("family.example");
    expect(prompt).not.toContain("솔페");
    expect(prompt).toContain("영아 수면");
    expect(prompt).toContain("밤잠");
  });

  test("최종 답변 프롬프트는 초등학생도 이해할 다섯 부분을 요구한다", () => {
    const prompt = buildChatPrompt(context, [], "질문", "공식 근거");

    for (const title of ["한 줄 결론", "지금 할 일", "지켜볼 것", "병원에 갈 때", "참고한 자료"]) {
      expect(prompt).toContain(title);
    }
    expect(prompt).toContain("초등학생도 이해");
    expect(prompt).toContain("공식 근거");
  });

  test("완전한 전략 JSON만 허용한다", () => {
    const valid = JSON.stringify({
      summary: "요약",
      observations: ["관찰"],
      actions: ["실행"],
      watch: ["지표"],
      reassess: "3일",
      safety: "필요시 상담",
    });
    expect(parseStrategy(valid).actions).toEqual(["실행"]);
    expect(() => parseStrategy('{"summary":"불완전"}')).toThrow("INVALID_STRATEGY_RESPONSE");
  });

  test("코드 펜스로 둘러싼 JSON도 안전하게 해석한다", () => {
    const raw = '```json\n{"summary":"요약","observations":[],"actions":["실행"],"watch":[],"reassess":"내일","safety":"상담"}\n```';
    expect(parseStrategy(raw).summary).toBe("요약");
  });
});
