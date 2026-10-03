import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// CR7-08 (code review 007). Contrast is measured from the :root tokens in App.css itself.
const css = readFileSync(resolve(__dirname, '../../App.css'), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');
const root = /:root\s*\{([^}]*)\}/.exec(css)![1]!;

function token(name: string): string {
  const m = new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{6})`).exec(root);
  if (!m) throw new Error(`token ${name} not found in :root`);
  return m[1]!;
}
function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
function ratio(fg: string, bg: string): number {
  const a = lum(fg);
  const b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe('App.css tokens — CR7-08', () => {
  for (const bg of ['--card-bg', '--paper', '--cream', '--warn-bg']) {
    it(`TC-CR7-08-ink-faint-on${bg}: --ink-faint is at least 4.5:1 on ${bg}`, () => {
      expect(ratio(token('--ink-faint'), token(bg))).toBeGreaterThanOrEqual(4.5);
    });
  }
  it('TC-CR7-08-warn-text: --warn-text on --warn-bg is at least 4.5:1', () => {
    expect(ratio(token('--warn-text'), token('--warn-bg'))).toBeGreaterThanOrEqual(4.5);
  });
  it('TC-CR7-08-control-border: the form-control border is at least 3:1 on the card and the page', () => {
    const rule = /(?:^|\})\s*textarea,\s*input\[type='text'\],\s*input\[type='password'\],\s*select\s*\{([^}]*)\}/m.exec(css);
    expect(rule).not.toBeNull();
    const m = /border:\s*1px solid\s*(var\((--[a-z-]+)\)|#[0-9a-fA-F]{6})/.exec(rule![1]!);
    expect(m).not.toBeNull();
    const colour = m![2] ? token(m![2]) : m![1]!;
    expect(ratio(colour, token('--card-bg'))).toBeGreaterThanOrEqual(3);
    expect(ratio(colour, token('--paper'))).toBeGreaterThanOrEqual(3);
  });
});
