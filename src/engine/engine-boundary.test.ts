import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';

// R16-F §5 (DR7-06, design-review-007.html). Mechanical guard for
// cross-cutting.md §7 Rule 1 ("engine is a pure island... Never: engine →
// ui") and CLAUDE.md's matching rule. src/engine/plain-intake.ts used to
// import `findQuestion`/`makeAssumption` and the `QuestionId`/
// `PlainAnswers` types straight from src/components/plain-copy.ts — a live
// violation with no lint rule to catch it (it was found by a design-review
// panel reading imports by hand). This test makes that mechanical: it scans
// every PRODUCTION (non-test) file under src/engine/ for an import whose
// specifier resolves into src/components/, and fails if one exists.
//
// Test files under src/engine/ are deliberately exempt — see the module
// doc comment on this exemption in specs/cross-cutting.md's R16-F §5 note.
// backtest-parity.test.ts/backtest-parity-nonblind.test.ts legitimately
// resolve a worked case's plain-English answers back to engine keys via
// plain-copy.ts's word -> key lookups (optionKeyForText, findQuestion),
// which exist only component-side because the WORDS live there — a
// test-layer integration concern, not a production purity violation.

const ENGINE_DIR = resolve(__dirname, '.');

function listProductionSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listProductionSourceFiles(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

// Every module a file imports — `import`, `import type`, `export … from`,
// and `import()` — read by TypeScript's own pre-processor, not a regex.
// (Verifying R16-F, review pass 1: the first version read import statements
// one LINE at a time, so an import written across several lines —
// `import type {\n  Foo,\n} from '../components/x'`, the style six engine
// files already use — slipped past it unseen.)
function importedModules(text: string): string[] {
  return ts.preProcessFile(text, true, true).importedFiles.map((f) => f.fileName);
}

function componentImports(text: string): string[] {
  return importedModules(text).filter((spec) => /(^|\/)components\//.test(spec));
}

describe('engine/screen boundary (cross-cutting.md §7 Rule 1, CLAUDE.md)', () => {
  it('TC-R16-F-01: no production file under src/engine/ imports from src/components/', () => {
    const offenders: string[] = [];
    for (const file of listProductionSourceFiles(ENGINE_DIR)) {
      for (const spec of componentImports(readFileSync(file, 'utf-8'))) {
        offenders.push(`${file}: imports ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  // Proves the guard above actually catches something, rather than
  // vacuously passing because the regex never matches anything real — the
  // same "prove the check can fail" discipline the hash-chain forgery test
  // (audit.ts's __recomputeChainForTests) uses for a different limit.
  it('TC-R16-F-02: the scan itself would flag a components/ import if one existed', () => {
    const sample = [
      "import { findQuestion } from '../components/plain-copy';",
      "import type { Assumption } from './plain-copy';",
      "export { x } from '../components/x';",
    ].join('\n');
    expect(componentImports(sample)).toEqual(['../components/plain-copy', '../components/x']);
  });

  it('TC-R16-F-66: an import written across several lines, or loaded on demand, is caught too', () => {
    const sample = [
      'import type {',
      '  QuestionId,',
      '  PlainAnswers,',
      "} from '../components/plain-copy';",
      "const later = await import('../components/verdict-view-model');",
      "// a comment that says from '../components/not-an-import' is not an import",
    ].join('\n');
    expect(componentImports(sample)).toEqual(['../components/plain-copy', '../components/verdict-view-model']);
  });
});
