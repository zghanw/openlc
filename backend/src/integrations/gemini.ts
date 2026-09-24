export interface JsonModel {
  generateJson<T>(system: string, input: string, jsonSchema?: Record<string, unknown>): Promise<T>;
}

const TRANSIENT_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
// Statuses (plus network/timeout errors) that are worth falling back to the next model for. 404 is
// included here even though a single model never retries on it: a 404 means this model id is gone
// for this key (e.g. retired), not that the request itself was bad.
const FALLBACK_STATUSES = new Set([404, 408, 429, 500, 502, 503, 504]);

async function requestWithRetry(fetcher: typeof fetch, url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(30_000) });
      if (!TRANSIENT_STATUSES.has(response.status) || attempt === attempts - 1) return response;
      lastError = new Error(`Transient Gemini response ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, [500, 1_500][attempt] ?? 1_500));
  }
  throw lastError instanceof Error ? lastError : new Error("Gemini request failed after retries");
}

async function requestOnce(fetcher: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  return fetcher(url, { ...init, signal: AbortSignal.timeout(30_000) });
}

/** Thrown for a response whose JSON answer was cut off - most often because Gemini 3's thinking
 *  tokens ate the whole maxOutputTokens budget before any answer text was written. Handled like a
 *  transient failure: the caller falls back to the next configured model, if there is one. */
class GeminiTruncatedResponseError extends Error {}

async function parseGeneratedJson<T>(response: Response): Promise<T> {
  const body = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }> };
  const candidate = body.candidates?.[0];
  const finishReason = candidate?.finishReason ?? "UNKNOWN";
  const text = candidate?.content?.parts?.map((part) => part.text ?? "").join("");
  // MAX_TOKENS is always a cut-off answer, whether or not any text made it out before the budget ran
  // out. Any other empty/invalid answer (a SAFETY block, a plain malformed response) gets its real
  // finishReason reported instead of being mislabelled as a token-budget problem.
  if (finishReason === "MAX_TOKENS") {
    throw new GeminiTruncatedResponseError("Gemini response was cut off (MAX_TOKENS)");
  }
  if (!text) {
    throw new GeminiTruncatedResponseError(`Gemini response had no answer text (finishReason: ${finishReason})`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new GeminiTruncatedResponseError(`Gemini response was not valid JSON (finishReason: ${finishReason})`);
  }
}

export class GeminiJsonModel implements JsonModel {
  /** GEMINI_MODEL is an ordered, comma-separated fallback list; each entry is tried in turn. */
  private readonly models: string[];

  constructor(
    private readonly apiKey: string,
    model = "gemini-3-flash-preview,gemini-3.5-flash",
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!apiKey) throw new Error("GEMINI_API_KEY is required");
    this.models = model.split(",").map((entry) => entry.trim()).filter(Boolean);
  }

  async generateJson<T>(system: string, input: string, jsonSchema?: Record<string, unknown>): Promise<T> {
    const init: RequestInit = {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: input }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: jsonSchema,
          temperature: 0.2,
          // Gemini 3's thinking tokens count against this cap before any answer text is written,
          // so a small cap can burn the whole budget on thinking and cut the JSON answer off mid-string.
          maxOutputTokens: 16384,
        },
      }),
    };

    let lastError: unknown;
    for (const [index, modelName] of this.models.entries()) {
      const isLastModel = index === this.models.length - 1;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`;
      let response: Response;
      try {
        // Every model but the last gets one attempt; the last keeps today's retry-with-backoff.
        response = isLastModel ? await requestWithRetry(this.fetcher, url, init) : await requestOnce(this.fetcher, url, init);
      } catch (error) {
        if (!isLastModel) { lastError = error; continue; }
        throw error;
      }
      if (response.ok) {
        try {
          return await parseGeneratedJson<T>(response);
        } catch (error) {
          if (!isLastModel && error instanceof GeminiTruncatedResponseError) { lastError = error; continue; }
          throw error;
        }
      }
      if (!isLastModel && FALLBACK_STATUSES.has(response.status)) {
        lastError = new Error(`Gemini request failed (${response.status}): ${await response.text()}`);
        continue;
      }
      // A non-fallback status (e.g. 400, a bad schema) or the last model's own failure: stop here.
      throw new Error(`Gemini request failed (${response.status}): ${await response.text()}`);
    }
    throw lastError instanceof Error ? lastError : new Error("Gemini request failed: no model configured");
  }
}

export class GeminiEmbedder {
  constructor(private readonly apiKey: string, private readonly model = "gemini-embedding-2", private readonly fetcher: typeof fetch = fetch) {
    if (!apiKey) throw new Error("GEMINI_API_KEY is required");
  }
  async embed(text: string): Promise<number[]> {
    const response = await requestWithRetry(this.fetcher,
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:embedContent`,
      {
        method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({ content: { parts: [{ text }] }, outputDimensionality: 768 }),
      },
    );
    if (!response.ok) throw new Error(`Gemini embedding failed (${response.status}): ${await response.text()}`);
    const body = await response.json() as { embedding?: { values?: number[] } };
    if (!body.embedding?.values?.length) throw new Error("Gemini returned no embedding");
    return body.embedding.values;
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    if (!texts.length) return [];
    const response = await requestWithRetry(this.fetcher,
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:batchEmbedContents`,
      {
        method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({ requests: texts.map((text) => ({
          model: `models/${this.model}`,
          content: { parts: [{ text }] },
          outputDimensionality: 768,
        })) }),
      },
    );
    if (!response.ok) throw new Error(`Gemini batch embedding failed (${response.status}): ${await response.text()}`);
    const body = await response.json() as { embeddings?: Array<{ values?: number[] }> };
    const vectors = body.embeddings?.map((embedding) => embedding.values ?? []) ?? [];
    if (vectors.length !== texts.length || vectors.some((vector) => vector.length !== 768)) {
      throw new Error("Gemini returned an invalid batch embedding response");
    }
    return vectors;
  }
}
