import { describe, expect, it, vi } from "vitest";
import { GeminiJsonModel } from "../src/integrations/gemini.js";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function fail(status: number, text = `upstream ${status}`): Response {
  return new Response(text, { status });
}

function ok(payload: unknown): Response {
  return json({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] });
}

describe("GeminiJsonModel model fallback", () => {
  it("falls over to the next model on a transient status and returns its parsed JSON", async () => {
    const calls: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/models/model-a:")) return fail(503, "This model is currently experiencing high demand");
      return ok({ hello: "world" });
    };
    const model = new GeminiJsonModel("key", "model-a,model-b", fetcher);
    const result = await model.generateJson("system", "input");
    expect(result).toEqual({ hello: "world" });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("/models/model-a:");
    expect(calls[1]).toContain("/models/model-b:");
  });

  it("throws at once on a non-fallback status and never calls the next model", async () => {
    const calls: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      calls.push(String(input));
      return fail(400, "bad schema");
    };
    const model = new GeminiJsonModel("key", "model-a,model-b", fetcher);
    await expect(model.generateJson("system", "input")).rejects.toThrow("Gemini request failed (400): bad schema");
    expect(calls).toHaveLength(1);
  });

  it("tries every model once, retries only the last with backoff, then throws its error", async () => {
    vi.useFakeTimers();
    try {
      const calls: string[] = [];
      const fetcher: typeof fetch = async (input) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("/models/model-a:")) return fail(404, "not found");
        if (url.includes("/models/model-b:")) return fail(429, "quota exceeded");
        return fail(503, "high demand");
      };
      const model = new GeminiJsonModel("key", "model-a,model-b,model-c", fetcher);
      let error: unknown;
      const settled = model.generateJson("system", "input").catch((caught) => { error = caught; });
      await vi.runAllTimersAsync();
      await settled;
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("Gemini request failed (503): high demand");
      // model-a and model-b get one attempt each; model-c (last) gets the full 3-attempt retry.
      expect(calls.filter((url) => url.includes("/models/model-a:"))).toHaveLength(1);
      expect(calls.filter((url) => url.includes("/models/model-b:"))).toHaveLength(1);
      expect(calls.filter((url) => url.includes("/models/model-c:"))).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a single-model string behaves as today: retries a transient status before succeeding", async () => {
    vi.useFakeTimers();
    try {
      const calls: string[] = [];
      const fetcher: typeof fetch = async () => {
        calls.push("call");
        return calls.length === 1 ? fail(503, "high demand") : ok({ ok: true });
      };
      const model = new GeminiJsonModel("key", "gemini-solo", fetcher);
      const promise = model.generateJson("system", "input");
      await vi.runAllTimersAsync();
      await expect(promise).resolves.toEqual({ ok: true });
      expect(calls).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
