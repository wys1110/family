export async function readJsonObject(request: Request, maxBytes = 32_768): Promise<Record<string, any>> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("INVALID_JSON");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new Error("BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const value = JSON.parse(new TextDecoder().decode(bytes));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_JSON");
  return value;
}
