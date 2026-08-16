import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  enableLocalLlm,
  disableLocalLlm,
  localLlmEnabled,
  getLocalLlmModel,
  localChatJson,
  probeLocalLlm,
} from './local-provider';

// Local open-model provider (2026-08-16). Same testing posture as
// graph-extractor.test.ts: the network is mocked, the CONTRACT is asserted —
// what we send, and that every failure shape comes back as a typed LlmResult
// rather than a throw. The live server is exercised by hand (and disclosed),
// not by the suite.

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  enableLocalLlm('http://localhost:11434', 'qwen3:4b');
});

afterEach(() => {
  vi.unstubAllGlobals();
  disableLocalLlm();
});

function okResponse(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

describe('local provider configuration', () => {
  it('enable/disable round-trips, and a trailing slash is not stored', () => {
    enableLocalLlm('http://localhost:11434/', 'qwen3:4b');
    expect(localLlmEnabled()).toBe(true);
    expect(getLocalLlmModel()).toBe('qwen3:4b');
    disableLocalLlm();
    expect(localLlmEnabled()).toBe(false);
  });
});

describe('localChatJson', () => {
  it('sends the schema as the format field and parses the JSON answer', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ message: { content: '{"input_data":"meeting notes"}' } }));

    const schema = { type: 'object', properties: { input_data: { type: 'string' } } };
    const result = await localChatJson('extract', schema);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ input_data: 'meeting notes' });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:11434/api/chat');
    const body = JSON.parse((init as RequestInit).body as string);
    // The decoder-level constraint IS the point of this provider — a call
    // that dropped `format` would still often return valid-looking JSON,
    // so only this assertion notices the posture silently vanishing.
    expect(body.format).toEqual(schema);
    expect(body.model).toBe('qwen3:4b');
    expect(body.stream).toBe(false);
    // The two runaway-generation guards, both verified necessary live:
    // /no_think stops a reasoning model deliberating for 16k tokens, and
    // num_predict is the hard backstop if a model ignores the switch.
    expect(body.messages[0].content.startsWith('/no_think\n')).toBe(true);
    expect(body.options.num_predict).toBe(1024);
  });

  it('strips <think> deliberation before parsing (reasoning models)', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({ message: { content: '<think>the user wants…\nhmm</think>{"a":1}' } }),
    );
    const result = await localChatJson('x', {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ a: 1 });
  });

  it('returns parse-error on non-JSON content, never throws', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ message: { content: 'sorry, I cannot' } }));
    const result = await localChatJson('x', {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('parse-error');
  });

  it('returns network-error when the server is down, never throws', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const result = await localChatJson('x', {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('network-error');
  });

  it('returns network-error on a non-2xx status', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403 } as Response);
    const result = await localChatJson('x', {});
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === 'network-error') {
      expect(result.error.message).toContain('403');
    }
  });

  it('returns no-api-key when the provider is not configured', async () => {
    disableLocalLlm();
    const result = await localChatJson('x', {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('no-api-key');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('probeLocalLlm', () => {
  it('reports success when the exact model is present', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ models: [{ name: 'qwen3:4b' }] }));
    const probe = await probeLocalLlm('http://localhost:11434', 'qwen3:4b');
    expect(probe.ok).toBe(true);
  });

  it('reports the pull command when the server is up but the model is missing', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ models: [{ name: 'gemma4:latest' }] }));
    const probe = await probeLocalLlm('http://localhost:11434', 'qwen3:4b');
    expect(probe.ok).toBe(false);
    expect(probe.detail).toContain('ollama pull qwen3:4b');
  });

  it('reports the serve command (with browser origins) when nothing answers', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const probe = await probeLocalLlm('http://localhost:11434', 'qwen3:4b');
    expect(probe.ok).toBe(false);
    expect(probe.detail).toContain('OLLAMA_ORIGINS');
  });
});
