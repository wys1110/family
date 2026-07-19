export type GeminiTransport = {
  generateText(prompt: string, options: { json: boolean }): Promise<string>;
};

export type GeminiTransportOptions = {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
};

export function createGeminiTransport(options: GeminiTransportOptions): GeminiTransport {
  const apiKey = String(options.apiKey || "").trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY_REQUIRED");
  const model = String(options.model || "gemini-2.5-flash").trim();
  const fetchImpl = options.fetchImpl || fetch;

  return {
    async generateText(prompt, requestOptions) {
      const response = await fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: requestOptions.json ? 0.2 : 0.4,
              maxOutputTokens: requestOptions.json ? 3000 : 2000,
              ...(requestOptions.json ? { responseMimeType: "application/json" } : {}),
            },
          }),
        },
      );

      if (!response.ok) throw new Error(`GEMINI_HTTP_${response.status}`);
      const payload = await response.json() as GeminiResponse;
      const text = payload.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("")
        .trim();
      if (!text) throw new Error("GEMINI_EMPTY_RESPONSE");
      return text;
    },
  };
}

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};
