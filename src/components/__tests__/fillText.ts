import type userEvent from '@testing-library/user-event';

// FX7-6: put text into a field in ONE input event instead of one per
// character. Every keystroke re-renders the whole <App />, so typing a long
// description made the long intake flows slow enough to run past vitest's 5 s
// per-test limit on a loaded machine. Use this wherever the typing itself is
// not what the test is about (the field still gets a real click/focus and a
// real input event, so React sees the same onChange).
export async function fillText(
  user: ReturnType<typeof userEvent.setup>,
  field: HTMLElement,
  text: string,
): Promise<void> {
  await user.click(field);
  await user.paste(text);
}

// FX7-6: per-test timeout for the long, multi-screen intake flows (a full
// form of ~12 clicks, several confirmations, a verdict, often a second pass).
// Each wait inside them is correct and the flow is ~1 s on an idle machine,
// but on a heavily loaded one it can pass vitest's 5 s default. The global
// testTimeout is untouched; only the flows measured above ~3 s under load
// carry this.
export const SLOW_FLOW_MS = 15000;
