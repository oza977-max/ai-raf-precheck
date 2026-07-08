# AIGate — Cross-Cutting Specification

**Version:** 1.0  
**Date:** June 2026  
**Status:** Draft  
**Covers:** Tech stack, project structure, module conventions, error handling, TypeScript standards, testing approach, build configuration

---

## Expert Panel

| Expert | Work | Role in This Document |
|--------|------|-----------------------|
| Dan Vanderkam | *Effective TypeScript* (2nd ed., O'Reilly 2024) | TypeScript standards — strict typing, discriminated unions, interface design |
| Dan Abramov / React Core Team | react.dev | React conventions — component composition, state lifting, unidirectional data flow |
| Kent C. Dodds | Testing Library (testing-library.com) | Testing conventions — behaviour-first, user-interaction testing |
| Kent Beck | *Test-Driven Development: By Example* (Addison-Wesley 2002) | TDD discipline — red-green-refactor, test-first |
| Andrew Hunt & David Thomas | *The Pragmatic Programmer* (20th anniversary ed., 2019) | DRY, no hardcoded secrets, tracer bullets |
| Martin Fowler | *Patterns of Enterprise Application Architecture* (Addison-Wesley 2002) | Module boundaries, anti-bloat, Repository pattern |
| Robert C. Martin | *Clean Code* (Prentice Hall 2008) | Single responsibility, error handling, naming |
| Mike Cohn | *Agile Estimating and Planning* (Prentice Hall 2005) | Vertical slicing — first runnable slice governs chunk ordering |

---

## 1. Architecturally Significant Requirements Addressed

| ASR | Requirement | Decision forced |
|---|---|---|
| Client-side only | NF-3, NF-4 | No server, no backend — everything in the browser |
| Deterministic engine | NF-1, PE-1 | Engine is a pure function — no LLM in evaluation path |
| LLM at edges only | UC-3, NF-1 | Anthropic SDK used only for graph extraction and reasoning trace |
| No install for end users | NF-4 | Build output is a `dist/` folder served by any static server |
| TypeScript strict | (stack constraint) | Strict mode, no `any`, discriminated unions for domain types |

---

## 2. Tech Stack

### ADR-001: React + Vite + TypeScript as the application framework

**Decision:** React 18 + Vite 5 + TypeScript 5.x (strict mode). No server-side rendering. Single-page application.

**Status:** Accepted

**Context:** AIGate is a browser-only governance tool (NF-3, NF-4). No backend. Must run from a `dist/` folder served by any static server or opened via `file://` with a local web server. The intake flow, graph editing UI, and register view are sufficiently complex to benefit from a component model. No server components — all components are client components.

**Options considered:**
1. **Vanilla TypeScript + Vite** — zero framework overhead, but complex multi-step flows (intake wizard, graph editor, register) require significant hand-rolled UI plumbing. Increases build time substantially.
2. **React + Vite + TypeScript** — standard React 18 component model; Vite builds to a static `dist/`; Testing Library for behaviour-first tests; well-understood patterns.
3. **Preact + Vite + TypeScript** — 3kb bundle vs ~45kb React. Acceptable trade-off but less ecosystem support and not preferred by stack constraints.

**Decision:** React + Vite + TypeScript. The component model is proportionate to the UI complexity. Bundle size is not a constraint for a local governance tool.

**Consequences:** All components are client components (no RSC). State managed with React's built-in hooks + Zustand for cross-component state (register, verdict). No SSR complexity.

---

### Core library choices

| Concern | Library | Version | Rationale |
|---|---|---|---|
| YAML parsing | `js-yaml` | ^4.1 | De-facto standard; types included via `@types/js-yaml` |
| IndexedDB | `idb` | ^8.0 | Typed Promise wrapper over IndexedDB; used by WHATWG; OQ-2 resolution |
| Form management | `react-hook-form` | ^7.x | Performance-first; minimal re-renders; Zod integration |
| Schema validation | `zod` | ^3.x | Runtime validation + TypeScript type inference from schema |
| LLM integration | `@anthropic-ai/sdk` | ^0.39+ | Browser-compatible (`dangerouslyAllowBrowser: true`); model: `claude-sonnet-4-6` |
| ID generation | `uuid` | ^9.x | RFC 4122; v4 for use case IDs, verdict IDs |
| State management | `zustand` | ^4.x | Minimal cross-component store; no boilerplate |
| Testing | `vitest` + `@testing-library/react` | latest | Vite-native test runner; Testing Library for behaviour-first tests |
| YAML diff (for pack updates) | `deep-diff` | ^1.0 | For RA-10 diff mechanics (V1.5) — include schema now |

**No UI component library.** AIGate uses custom components styled with plain CSS. The Tufte/Few design system (from the requirements + health report HTML) sets the visual language. No Tailwind, no MUI, no Radix — keeps the bundle lean and the styling deterministic.

---

## 3. Project Structure

```
aigate/                         # Project root
├── index.html                  # Vite entry point
├── vite.config.ts              # Vite config (base: './' for file:// compatibility)
├── tsconfig.json               # TypeScript strict mode
├── package.json
├── policy/                     # Policy files (user-editable, not bundled)
│   ├── appetite.yaml           # Main policy file (starter config)
│   └── packs/
│       ├── sr-26-2.yaml
│       ├── ss1-23.yaml
│       ├── eu-ai-act.yaml
│       ├── osfi-e23.yaml
│       ├── mas-feat.yaml
│       ├── dora.yaml
│       └── fsa-japan.yaml
├── src/
│   ├── main.tsx                # React entry point
│   ├── App.tsx                 # Root component + router
│   ├── engine/                 # Policy engine — pure functions, no React
│   │   ├── policy-loader.ts    # Parse + validate YAML policy + packs
│   │   ├── evaluator.ts        # Main evaluation pipeline (PE-1 through PE-6)
│   │   ├── control-solver.ts   # Minimal control set solver (CS-1, CS-2)
│   │   ├── jurisdiction.ts     # Jurisdiction override pack application
│   │   ├── contradiction.ts    # Graph contradiction detection (UC-5, OB-2)
│   │   └── types.ts            # Shared engine types (Graph, Verdict, Policy, etc.)
│   ├── llm/                    # LLM boundary — only caller of Anthropic SDK
│   │   ├── graph-extractor.ts  # UC-3: description → data-flow graph
│   │   ├── reasoning-trace.ts  # VD-8: verdict → plain-English trace
│   │   └── client.ts           # Anthropic SDK wrapper (API key management)
│   ├── store/                  # Persistence
│   │   ├── db.ts               # IndexedDB schema + idb setup
│   │   ├── register.ts         # Use case register (graph model) — RG-1
│   │   └── audit.ts            # Append-only audit trail — NF-2, VD-4
│   ├── components/              # React components (flat — matches implementation-guide.md chunk deliverables)
│   │   ├── IntakeFlow.tsx       # UC-1 through UC-7, UC-3a — 9-state machine
│   │   ├── GraphReview.tsx
│   │   ├── QuestionnaireStep.tsx
│   │   ├── ContradictionReview.tsx
│   │   ├── ConfirmationStep.tsx
│   │   ├── StructuredForm.tsx   # UC-3a fallback
│   │   ├── VerdictDisplay.tsx   # VD-1 through VD-8
│   │   ├── ReasoningTrace.tsx
│   │   ├── CorrectionFlow.tsx
│   │   ├── RegisterView.tsx     # RG-1 through RG-5
│   │   ├── UseCaseDetail.tsx
│   │   ├── SettingsPanel.tsx    # CF-1 through CF-5, API key
│   │   ├── PriorityChip.tsx     # Shared
│   │   ├── StatusBadge.tsx
│   │   ├── AuditTrail.tsx
│   │   └── __tests__/           # Co-located component tests
│   └── hooks/                  # Custom hooks
│       ├── usePolicy.ts        # Load + validate policy file
│       ├── useRegister.ts      # Register CRUD via IndexedDB
│       └── useRole.ts          # Role context (1LoD / 2LoD)
├── public/                     # Static assets
└── dist/                       # Build output (gitignored)
```

**Key structural rule:** `src/engine/` has zero React imports. It is pure TypeScript. This enforces the determinism requirement (NF-1) — the engine is testable in isolation without React render infrastructure. The `src/llm/` directory is the only place the Anthropic SDK is imported.

---

## 4. TypeScript Standards (Vanderkam)

- **Strict mode enabled** in `tsconfig.json`: `strict: true`, `noImplicitAny: true`, `strictNullChecks: true`
- **Discriminated unions** for all domain status types:
  ```typescript
  type VerdictStatus = 'approved' | 'approved_with_controls' | 'rejected';
  type Tier = 'Critical' | 'High' | 'Medium' | 'Low';
  type Track = 'I' | 'II' | 'III';
  type LifecycleStage = 'Idea' | 'Exploring' | 'Pre-checked' | 'Approved' | 'In Production' | 'Monitored' | 'Retired';
  ```
- **No `any`** — use `unknown` + type guard functions for external data (YAML parse results, LLM responses)
- **Interfaces for shared domain objects** (Policy, Graph, Verdict, UseCase, AuditRecord) — placed in `src/engine/types.ts`
- **Zod schemas** for all external boundaries (YAML policy parse, LLM response parse, IndexedDB read) — Zod schema IS the runtime validator AND the TypeScript type source

---

## 5. Error Handling Conventions (Martin, McConnell)

### Engine errors
The engine uses a `Result<T, E>` pattern (no exceptions in the evaluation path):

```typescript
type Result<T, E = EngineError> = 
  | { ok: true; value: T }
  | { ok: false; error: E };

type EngineError = 
  | { kind: 'policy-invalid'; field: string; reason: string }
  | { kind: 'hard-line-tripped'; invariantId: string; path: string }
  | { kind: 'no-control-set'; unsatisfiableInvariant: string }
  | { kind: 'jurisdiction-conflict'; packs: string[]; reason: string };
```

Engine functions never throw — they return `Result`. The UI layer handles `ok: false` cases.

### LLM errors
LLM calls can fail (network, rate limit, invalid key). The `src/llm/client.ts` wraps all SDK calls in try/catch and returns `Result<T, LlmError>`. If any LLM call fails, the UI falls back to the structured form (UC-3a) or flags the error — it never propagates an unhandled exception.

### Policy load errors (CF-5)
Policy validation errors are surfaced at startup via the `usePolicy` hook. If the policy is invalid, the hook returns `{ valid: false, errors: PolicyValidationError[] }` and the App renders an error screen naming each invalid field. Evaluation is disabled until the error is resolved.

### UI errors
React error boundaries at the route level. Each major view (intake, verdict, register) has its own error boundary. Errors are shown as user-readable messages, never as stack traces.

---

## 6. Testing Conventions (Beck, Dodds)

### Test locations
Tests co-located with source:
```
src/engine/evaluator.ts
src/engine/evaluator.test.ts   ← same directory
```

### Test layers

| Layer | What to test | How |
|---|---|---|
| Engine (pure functions) | Evaluation correctness, solver correctness, jurisdiction logic | Vitest unit tests — no React, no mocks |
| LLM boundary | Graph extraction + reasoning trace | Mock Anthropic SDK; test prompt construction and response parsing |
| Store | IndexedDB read/write, append-only constraint | Vitest with fake-indexeddb |
| UI components | User interactions, form flows, verdict display | Testing Library — find by role/label, simulate user events |
| Integration | Full intake → evaluation → verdict → register cycle | Vitest + Testing Library + mocked LLM |

### Key rules (Beck, Dodds)
- Write the failing test first (TDD discipline for engine functions)
- Test the public interface, not internals — `evaluator.test.ts` tests `evaluate(graph, policy)`, not internal helper functions
- No `any` in test assertions — typed assertions against typed results
- `describe` block names describe the scenario; `it` names describe the expected behaviour

---

## 7. Module Boundary Rules

**Rule 1 — Engine is a pure island:** `src/engine/*` imports only from `src/engine/types.ts` and standard TypeScript types. No React, no idb, no Anthropic SDK, no browser APIs.

**Rule 2 — LLM boundary is isolated:** `src/llm/*` is the only place the Anthropic SDK is imported. Nothing in `src/engine/*` or `src/store/*` calls the LLM.

**Rule 3 — Store is persistence-only:** `src/store/*` handles IndexedDB reads and writes. No evaluation logic, no LLM calls, no React imports.

**Rule 4 — UI is presentation-only:** `src/components/*` renders state and calls engine/store functions. No evaluation logic inline in components. Business logic lives in engine or store.

**Dependency direction:** `ui → store`, `ui → engine`, `ui → llm`. Never: `engine → ui`, `store → engine`, `llm → store`.

---

## 8. Vite Configuration

```typescript
// vite.config.ts
export default {
  base: './',           // Relative paths — required for file:// compatibility (NF-4)
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom'],
          'engine': ['js-yaml', 'uuid'],
        }
      }
    }
  }
}
```

`base: './'` is critical — without it, Vite generates absolute paths (`/assets/...`) that break when opened from a local file system.

---

## 9. API Key Management

The Anthropic API key is stored in `localStorage` under the key `aigate:api-key`. It is:
- Never hardcoded or committed to git (`.gitignore` does not apply — it's in the browser)
- Never sent to any server other than `api.anthropic.com` (via the SDK)
- Displayed as a masked input (`type="password"`) in the Settings panel
- Read by `src/llm/client.ts` at call time — not stored in React state

The `dangerouslyAllowBrowser: true` flag in the Anthropic SDK is used explicitly because the user has been informed that their key choice determines data handling (per NF-3 and the README). This flag is deliberate, not a security oversight.

---

## 10. Role Context

There is no authentication in MVP (NF-4 / no-backend constraint). Role is a configurable toggle stored in `localStorage` under `aigate:role`, with values `'1LoD'` or `'2LoD'`. The `useRole` hook reads this value. The Settings panel provides a role selector.

This is explicitly a governance-tool trust model: the tool trusts the user to select their role honestly. True authentication is V2.

---

## 11. Requirement Traceability

| Requirements covered | Notes |
|---|---|
| NF-1, PE-1 | Engine pure function convention enforces determinism |
| NF-3 | No backend; API key in localStorage; no outbound calls except user's API key |
| NF-4 | `base: './'` in Vite config; runs from local file |
| CF-5 | Policy validation at startup; `usePolicy` hook; error screen on invalid policy |
| UC-3a | `StructuredForm.tsx` — fallback when no API key configured |
| OQ-1 | Anthropic `claude-sonnet-4-6` — resolved |
| OQ-2 | `idb` library for IndexedDB — resolved |
| OQ-3 | Role toggle in `localStorage` + Settings panel — resolved (minimal 2LoD mechanism) |

## 12. Open Questions Resolved

| OQ | Resolution |
|---|---|
| OQ-1 (LLM provider) | Anthropic `claude-sonnet-4-6`; fallback to structured form if no key |
| OQ-2 (Register persistence) | IndexedDB via `idb` library |
| OQ-3 (2LoD mechanism) | Role toggle in localStorage + Settings panel; role-filtered register view |
| OQ-4 (Duplicate detection) | LLM semantic comparison if API key present; exact-match + tag fallback otherwise |
| OQ-5 (Audit export format) | JSON primary; CSV secondary (RG-5) |

---

*Developed using the Grounded Vibe Methodology*
