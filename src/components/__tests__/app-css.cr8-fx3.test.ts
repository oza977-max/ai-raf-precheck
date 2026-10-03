import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// CR8-12 (code review 008). The header tagline chip was coloured --ink-faint (a dark grey chosen for
// light cards) on the near-black --header-bg: about 2.9:1. Contrast is measured from App.css itself.
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
/** The colour a selector's own rule gives it, resolving a var(--token). */
function colourOf(selector: string): string {
  const rule = new RegExp(`(?:^|\\})\\s*${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`, 'm').exec(css);
  if (!rule) throw new Error(`rule ${selector} not found`);
  const m = /(?:^|;|\s)color:\s*(var\((--[a-z-]+)\)|#[0-9a-fA-F]{6})/.exec(rule[1]!);
  if (!m) throw new Error(`no colour on ${selector}`);
  return m[2] ? token(m[2]) : m[1]!;
}

describe('App.css tokens — CR8-12: text on the dark header', () => {
  it('TC-CR8-12: the header tagline chip is at least 4.5:1 on --header-bg', () => {
    expect(ratio(colourOf('.app-header__badge'), token('--header-bg'))).toBeGreaterThanOrEqual(4.5);
  });

  it('TC-CR8-12-1: --header-text and the muted header colour are at least 4.5:1 on --header-bg', () => {
    expect(ratio(token('--header-text'), token('--header-bg'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token('--header-muted'), token('--header-bg'))).toBeGreaterThanOrEqual(4.5);
  });
});
