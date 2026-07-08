import type { Result } from '../engine/types';

export type LlmError =
  | { kind: 'no-api-key' }
  | { kind: 'network-error'; message: string }
  | { kind: 'parse-error'; raw: unknown };

export type LlmResult<T> = Result<T, LlmError>;
