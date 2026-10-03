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
