import type { LlmResult } from './types';

// Local open-model provider (2026-08-16). Speaks plain HTTP to an Ollama
// server on the USER'S OWN machine — no SDK, no cloud, no data leaving the
// device. Lives in src/llm/* because it is an LLM call (Rule 2's point is
// that LLM I/O has exactly one home, not that the home is Anthropic-only).
//
// Same architectural position as the Claude path: input edge ONLY. Nothing
// returned here reaches evaluate() except through the caller's Zod gate
// against the canonical vocabulary, and nothing is used until a human
// confirms it. A weaker local model mis-proposes more often — the
// confirmation step is the control, and the settings copy says so.
//
// Key/value conventions follow client.ts: read from localStorage at call
// time, never cached in React state.

const URL_KEY = 'aigate:local-llm-url';
const MODEL_KEY = 'aigate:local-llm-model';

export const DEFAULT_LOCAL_LLM_URL = 'http://localhost:11434';
export const DEFAULT_LOCAL_LLM_MODEL = 'qwen3:4b';

export function getLocalLlmUrl(): string | null {
  return localStorage.getItem(URL_KEY);
}

export function getLocalLlmModel(): string {
  return localStorage.getItem(MODEL_KEY) ?? DEFAULT_LOCAL_LLM_MODEL;
}

export function localLlmEnabled(): boolean {
  return getLocalLlmUrl() !== null;
}

/** Honesty review 004 finding 2: the Settings copy promises the
 *  description "never goes to the internet" — so the code must refuse any
 *  non-loopback address rather than letting the claim drift from the
 *  behavior. A firm deployment relaxes this inside its own boundary; the
 *  demo does not. */
export function isLoopbackUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
  } catch {
    return false;
  }
}

export function enableLocalLlm(url: string, model: string): void {
  localStorage.setItem(URL_KEY, url.trim().replace(/\/+$/, ''));
  localStorage.setItem(MODEL_KEY, model.trim());
}

export function disableLocalLlm(): void {
  localStorage.removeItem(URL_KEY);
  localStorage.removeItem(MODEL_KEY);
}

/** Reachability + model presence, for the Settings "test" button. Never
 *  throws: the answer is a rendered string either way. */
export async function probeLocalLlm(
  url: string,
  model: string,
): Promise<{ ok: boolean; detail: string }> {
  const base = url.trim().replace(/\/+$/, '');
  if (!isLoopbackUrl(base)) {
    return {
      ok: false,
      detail:
        'This demo only accepts an address on this machine (localhost) — the promise that your description never leaves it is enforced, not assumed. A firm deployment would point this at a model inside its own boundary.',
    };
  }
  try {
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return { ok: false, detail: `The server answered with status ${res.status}.` };
    const body = (await res.json()) as { models?: Array<{ name?: string }> };
    const names = (body.models ?? []).map((m) => m.name ?? '');
    const found = names.some((n) => n === model || n === `${model}:latest`);
    return found
      ? { ok: true, detail: `Connected — ${model} is available.` }
      : {
          ok: false,
          detail: `Connected, but ${model} is not downloaded. Run: ollama pull ${model}${
            names.length > 0 ? ` (available: ${names.join(', ')})` : ''
          }`,
        };
  } catch {
    return {
      ok: false,
      detail:
        'No local model server answered. Start one with: OLLAMA_ORIGINS="http://localhost:5173,https://oza977-max.github.io" ollama serve',
    };
  }
}

/** Reasoning models wrap deliberation in <think> tags; only what follows is
 *  the answer. Stripped defensively even though think:false is requested —
 *  older Ollama versions ignore that flag. */
function stripThinking(content: string): string {
  return content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

/** One schema-constrained chat call. Ollama's `format` field enforces the
 *  JSON schema at the decoder, so a conforming server cannot emit a
 *  wrong-shaped answer — the same posture as the Claude path's forced tool
 *  call, enforced one level deeper. The caller still re-validates with Zod:
 *  the decoder guarantees shape, not vocabulary. */
export async function localChatJson(
  prompt: string,
  schema: object,
): Promise<LlmResult<unknown>> {
  const url = getLocalLlmUrl();
  if (!url) return { ok: false, error: { kind: 'no-api-key' } };
  try {
    const res = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Review 004 finding 3: without a timeout, a hung server left the
      // extraction step on "Extracting…" forever with no retry control.
      // 120s covers a cold model load + full generation with headroom.
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        model: getLocalLlmModel(),
        // "/no_think" is Qwen 3's in-prompt reasoning switch, needed because
        // older Ollama servers ignore the think flag — verified live
        // (2026-08-16): without it, schema-forced decoding sent the model
        // into a 16,000-token deliberation loop on a 15-word prompt.
        // Harmless noise to models without the switch.
        messages: [{ role: 'user', content: `/no_think\n${prompt}` }],
        format: schema,
        stream: false,
        think: false,
        // temperature 0: the extraction edge should be as repeatable as a
        // sampling model allows. NOT a determinism claim — the deterministic
        // engine never sees this output except via a human-confirmed graph.
        // num_predict mirrors the Claude path's max_tokens 1024 and is the
        // backstop against the runaway-generation pathology above.
        options: { temperature: 0, num_predict: 1024 },
      }),
    });
    if (!res.ok) {
      return { ok: false, error: { kind: 'network-error', message: `local model server: HTTP ${res.status}` } };
    }
    const body = (await res.json()) as { message?: { content?: string } };
    const content = stripThinking(body.message?.content ?? '');
    if (!content) return { ok: false, error: { kind: 'parse-error', raw: body } };
    try {
      return { ok: true, value: JSON.parse(content) };
    } catch {
      return { ok: false, error: { kind: 'parse-error', raw: content } };
    }
  } catch (err) {
    return { ok: false, error: { kind: 'network-error', message: err instanceof Error ? err.message : String(err) } };
  }
}
