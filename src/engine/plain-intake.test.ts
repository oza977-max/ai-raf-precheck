import { describe, it, expect } from 'vitest';
import { plainAnswersToFormValues } from './plain-intake';
import type { PlainAnswers } from '../components/plain-copy';
import type { PolicyFile } from './types';

// R16-B (§2.1, §2.2). Pure engine module — no React, no I/O, no Date.now,
// no Math.random (cross-cutting.md §7 Rule 1). buildGraphFromForm stays the
// only place ids and the timestamp are minted.

function policy(overrides: Partial<PolicyFile> = {}): PolicyFile {
  return {
    version: '1.0',
    policy_id: 'TEST',
    firm_name: 'Test',
    translation_attestation: { attested_by: 'x', role: 'x', date: 'x', raf_version_checked: 'x' },
    hard_lines: [],
    tracks: [],
    tiers: [],
    invariants: [],
    controls: [],
    kri_thresholds: {},
    jurisdictions: [
      { code: 'UK', name: 'United Kingdom', pack_files: [] },
      { code: 'EU', name: 'European Union', pack_files: [] },
    ],
    roles: {},
    tier_workflow: { Critical: 'x', High: 'x', Medium: 'x', Low: 'x' },
    safety_margin: 0.1,
    platforms: [
      {
        id: 'PLAT-CLOUD-LLM',
        name: 'Cloud LLM',
        approved_envelope: { data_zones: ['Zone B'] },
        satisfies_controls: [],
        plain_name: 'Your firm’s cloud AI assistant',
        vendor_id: 'VENDOR-APPROVED-LLM',
      },
      {
        id: 'PLAT-INTERNAL-ML',
        name: 'Internal ML',
        approved_envelope: { data_zones: ['Zone B', 'Zone C'] },
        satisfies_controls: [],
        plain_name: 'Your firm’s in-house model platform',
      },
    ],
    vendors: [
      {
        id: 'VENDOR-APPROVED-LLM',
        name: 'Approved LLM',
        approved_envelope: {},
        satisfies_controls: [],
        plain_name: 'Your firm’s company AI assistant account',
        kind: 'company_assistant',
      },
      {
        id: 'VENDOR-SUPPLIER-A',
        name: 'Supplier A',
        approved_envelope: {},
        satisfies_controls: [],
        plain_name: 'Supplier A plain name',
        kind: 'supplier',
      },
    ],
    ...overrides,
  };
}

const BASE: PlainAnswers = {
  '1': 'Test tool',
  '2': 'A test description.',
  '3': 'firm-built',
  '4': 'language',
  '5': ['everyday'],
  '6': 'read',
  '7': 'me-or-team',
  '8': 'operational',
  '9': 'yes',
  '10': 'small',
  '11': ['UK'],
  '12': 'no',
};

describe('plainAnswersToFormValues — Q3 (where the AI comes from)', () => {
  it('firm-built -> Zone C, vendor internal', () => {
    const { values } = plainAnswersToFormValues({ ...BASE, '3': 'firm-built' }, policy());
    expect(values.processingDataZone).toBe('Zone C');
    expect(values.vendor).toBe('internal');
  });

  it('not-sure -> Zone A, an unregistered vendor, and is listed as an assumption', () => {
    const { values, assumptions } = plainAnswersToFormValues({ ...BASE, '3': 'not-sure' }, policy());
    expect(values.processingDataZone).toBe('Zone A');
    expect(values.vendor).not.toBe('internal');
    expect(assumptions.some((a) => a.questionId === '3')).toBe(true);
  });

  it('a dynamic platform option resolves zone to the earliest letter among its allowed zones, and vendor to its vendor_id', () => {
    const { values } = plainAnswersToFormValues({ ...BASE, '3': 'PLAT-CLOUD-LLM' }, policy());
    expect(values.processingDataZone).toBe('Zone B');
    expect(values.vendor).toBe('VENDOR-APPROVED-LLM');
    expect(values.platform).toBe('PLAT-CLOUD-LLM');
  });

  it('a platform allowed in both Zone B and Zone C resolves to Zone B (the earliest letter)', () => {
    const { values } = plainAnswersToFormValues({ ...BASE, '3': 'PLAT-INTERNAL-ML' }, policy());
    expect(values.processingDataZone).toBe('Zone B');
  });

  it('a platform with no vendor_id defaults vendor to internal', () => {
    const { values } = plainAnswersToFormValues({ ...BASE, '3': 'PLAT-INTERNAL-ML' }, policy());
    expect(values.vendor).toBe('internal');
  });

  it('supplier-feature -> Zone B, and defers to Q3supplier for the vendor', () => {
    const { values } = plainAnswersToFormValues(
      { ...BASE, '3': 'supplier-feature', '3supplier': 'VENDOR-SUPPLIER-A' },
      policy(),
    );
    expect(values.processingDataZone).toBe('Zone B');
    expect(values.vendor).toBe('VENDOR-SUPPLIER-A');
  });

  it('specialist-product + "Not on this list" + a typed name -> "{text} (not on your firm\'s list)", never matched to the registry', () => {
    const { values } = plainAnswersToFormValues(
      {
        ...BASE,
        '3': 'specialist-product',
        '3supplier': 'not-on-list',
        '3supplierName': 'Supplier A plain name',
      },
      policy(),
    );
    // Even though the typed text is byte-identical to a real registry
    // vendor's plain_name, it must NOT resolve to that vendor's id (D-06).
    expect(values.vendor).toBe('Supplier A plain name (not on your firm’s list)'.replace('’', '’'));
    expect(values.vendor).not.toBe('VENDOR-SUPPLIER-A');
  });

  it('"Not on this list" with nothing typed -> the blank-safe fallback label', () => {
    const { values } = plainAnswersToFormValues(
      { ...BASE, '3': 'specialist-product', '3supplier': 'not-on-list', '3supplierName': '' },
      policy(),
    );
    expect(values.vendor).toBe('An unlisted supplier (not on your firm’s list)');
  });

  it('Q3supplier "I don’t know" -> unregistered, listed as an assumption', () => {
    const { values, assumptions } = plainAnswersToFormValues(
      { ...BASE, '3': 'specialist-product', '3supplier': 'dont-know' },
      policy(),
    );
    expect(values.vendor).not.toBe('internal');
    expect(values.vendor).not.toBe('VENDOR-SUPPLIER-A');
    expect(assumptions.some((a) => a.questionId === '3supplier')).toBe(true);
  });

  it('3model: a free-typed name not on the model registry becomes declaredModelIdOther', () => {
    const { values } = plainAnswersToFormValues({ ...BASE, '3model': 'gpt-4o-custom' }, policy());
    expect(values.declaredModelIdOther).toBe('gpt-4o-custom');
    expect(values.declaredModelId).toBeUndefined();
  });

  it('3model left blank names no model', () => {
    const { values } = plainAnswersToFormValues({ ...BASE }, policy());
    expect(values.declaredModelId).toBeUndefined();
    expect(values.declaredModelIdOther).toBeUndefined();
  });
});

describe('plainAnswersToFormValues — Q3a / Q3aWhich (outside assistant)', () => {
  const outside: PlainAnswers = { ...BASE, '3': 'outside-assistant' };

  it('the firm’s own account, with exactly one company-assistant vendor registered, resolves that vendor at Zone B', () => {
    const { values } = plainAnswersToFormValues({ ...outside, '3a': 'firm-account' }, policy());
    expect(values.processingDataZone).toBe('Zone B');
    expect(values.vendor).toBe('VENDOR-APPROVED-LLM');
  });

  it('with several company-assistant vendors, Q3aWhich selects the specific one', () => {
    const twoAssistants = policy({
      vendors: [
        { id: 'CA-1', name: 'A', approved_envelope: {}, satisfies_controls: [], kind: 'company_assistant' },
        { id: 'CA-2', name: 'B', approved_envelope: {}, satisfies_controls: [], kind: 'company_assistant' },
      ],
    });
    const { values } = plainAnswersToFormValues(
      { ...outside, '3a': 'firm-account', '3aWhich': 'CA-2' },
      twoAssistants,
    );
    expect(values.vendor).toBe('CA-2');
  });

  it('Q3aWhich "Not sure" -> Zone B, unregistered, listed as an assumption', () => {
    const twoAssistants = policy({
      vendors: [
        { id: 'CA-1', name: 'A', approved_envelope: {}, satisfies_controls: [], kind: 'company_assistant' },
        { id: 'CA-2', name: 'B', approved_envelope: {}, satisfies_controls: [], kind: 'company_assistant' },
      ],
    });
    const { values, assumptions } = plainAnswersToFormValues(
      { ...outside, '3a': 'firm-account', '3aWhich': 'not-sure' },
      twoAssistants,
    );
    expect(values.processingDataZone).toBe('Zone B');
    expect(values.vendor).not.toBe('CA-1');
    expect(values.vendor).not.toBe('CA-2');
    expect(assumptions.some((a) => a.questionId === '3aWhich')).toBe(true);
  });

  it('with no company-assistant vendor registered at all, the firm’s-own-account answer is still honest: unregistered', () => {
    const none = policy({ vendors: [] });
    const { values } = plainAnswersToFormValues({ ...outside, '3a': 'firm-account' }, none);
    expect(values.vendor).toBe('company AI assistant (not on your firm’s list)');
    expect(values.processingDataZone).toBe('Zone B');
  });

  it('a free or personal account -> Zone A, unregistered', () => {
    const { values } = plainAnswersToFormValues({ ...outside, '3a': 'personal-account' }, policy());
    expect(values.processingDataZone).toBe('Zone A');
    expect(values.vendor).not.toBe('internal');
  });

  it('Q3a "Not sure" -> Zone A, unregistered, listed as an assumption', () => {
    const { values, assumptions } = plainAnswersToFormValues({ ...outside, '3a': 'not-sure' }, policy());
    expect(values.processingDataZone).toBe('Zone A');
    expect(assumptions.some((a) => a.questionId === '3a')).toBe(true);
  });
});

describe('plainAnswersToFormValues — Q4 / Q4a (kind of AI)', () => {
  it('maps the five static kinds to the engine model types', () => {
    const cases: Array<[string, string]> = [
      ['perception', 'deep-learning'],
      ['language', 'llm'],
      ['generative', 'generative-ai'],
      ['agentic', 'agentic'],
    ];
    for (const [key, expected] of cases) {
      const { values } = plainAnswersToFormValues({ ...BASE, '4': key }, policy());
      expect(values.modelType).toBe(expected);
    }
  });

  it('"score" + 4a "fixed rules" -> statistical', () => {
    const { values } = plainAnswersToFormValues({ ...BASE, '4': 'score', '4a': 'rules' }, policy());
    expect(values.modelType).toBe('statistical');
  });

  it('"score" + 4a "they can show which factors" -> traditional-ml', () => {
    const { values } = plainAnswersToFormValues({ ...BASE, '4': 'score', '4a': 'explainable' }, policy());
    expect(values.modelType).toBe('traditional-ml');
  });

  it('"score" + 4a "No, or I don’t know" -> ml', () => {
    const { values } = plainAnswersToFormValues({ ...BASE, '4': 'score', '4a': 'unexplainable' }, policy());
    expect(values.modelType).toBe('ml');
  });

  it('TC-R16-B-01: Q4 "Not sure" -> agentic, listed as an assumption with the exact text', () => {
    const { values, assumptions } = plainAnswersToFormValues({ ...BASE, '4': 'not-sure' }, policy());
    expect(values.modelType).toBe('agentic');
    const a = assumptions.find((x) => x.questionId === '4');
    expect(a?.assumption).toMatch(/strictest case, because agents need the most safeguards/);
  });

  it('Q13/Q14 answers are read through when present, regardless of how Q4 was answered (agentic or Not sure)', () => {
    const { values } = plainAnswersToFormValues(
      { ...BASE, '4': 'not-sure', '13': ['credentialed'], '14': 'no' },
      policy(),
    );
    expect(values.systemAccessScope).toEqual(['credentialed_systems']);
    expect(values.multiInstanceCoordination).toBe('no');
  });
});

describe('plainAnswersToFormValues — Q5 (information it uses, tick-all)', () => {
  it('maps every static option to its data class', () => {
    const cases: Array<[string, string]> = [
      ['people', 'Client PII'],
      ['price-sensitive', 'MNPI'],
      ['confidential', 'Confidential'],
      ['everyday', 'Internal'],
      ['typed-only', 'Internal'],
      ['public', 'Public'],
    ];
    for (const [key, expected] of cases) {
      const { values } = plainAnswersToFormValues({ ...BASE, '5': [key] }, policy());
      expect(values.inputDataClasses).toEqual([expected]);
    }
  });

  it('TC-R16-B-02: UC-10 — ticking two different kinds of information produces one input node per distinct class', () => {
    const { values } = plainAnswersToFormValues({ ...BASE, '5': ['people', 'confidential'] }, policy());
    expect(values.inputDataClasses).toHaveLength(2);
    expect(values.inputDataClasses).toContain('Client PII');
    expect(values.inputDataClasses).toContain('Confidential');
  });

  it('two options that map to the same class collapse to one distinct input node', () => {
    const { values } = plainAnswersToFormValues({ ...BASE, '5': ['everyday', 'typed-only'] }, policy());
    expect(values.inputDataClasses).toEqual(['Internal']);
  });

  it('"Not sure" adds Confidential and is listed as an assumption', () => {
    const { values, assumptions } = plainAnswersToFormValues({ ...BASE, '5': ['not-sure'] }, policy());
    expect(values.inputDataClasses).toContain('Confidential');
    expect(assumptions.some((a) => a.questionId === '5')).toBe(true);
  });
});

describe('plainAnswersToFormValues — Q6 / Q6a / Q6b (what happens with the output)', () => {
  it('"read" -> read, level 0, non-binding, no 6a asked', () => {
    const { values } = plainAnswersToFormValues({ ...BASE, '6': 'read' }, policy());
    expect(values.outputActionType).toBe('read');
    expect(values.autonomyLevel).toBe(0);
    expect(values.decisionBindingness).toBe('non-binding');
    expect(values.hitl).toBeUndefined();
  });

  it('"answers directly" + 6a "one input among several" -> inform, level 0, advisory', () => {
    const { values } = plainAnswersToFormValues({ ...BASE, '6': 'answers', '6a': 'one-input' }, policy());
    expect(values.outputActionType).toBe('inform');
    expect(values.autonomyLevel).toBe(0);
    expect(values.decisionBindingness).toBe('advisory');
  });

  it('"creates a draft" + 6a "little" -> draft, level 1, hitl true, non-binding', () => {
    const { values } = plainAnswersToFormValues({ ...BASE, '6': 'drafts', '6a': 'little' }, policy());
    expect(values.outputActionType).toBe('draft');
    expect(values.autonomyLevel).toBe(1);
    expect(values.hitl).toBe(true);
    expect(values.decisionBindingness).toBe('non-binding');
  });

  it('"suggests" + 6a "usually what a decision is based on" -> recommend, level 1, hitl true, material', () => {
    const { values } = plainAnswersToFormValues({ ...BASE, '6': 'suggests', '6a': 'usually-basis' }, policy());
    expect(values.outputActionType).toBe('recommend');
    expect(values.autonomyLevel).toBe(1);
    expect(values.hitl).toBe(true);
    expect(values.decisionBindingness).toBe('material');
  });

  it('"prepares an action" -> execute, level 1, hitl true, material — fixed, no 6a asked', () => {
    const { values } = plainAnswersToFormValues({ ...BASE, '6': 'prepares' }, policy());
    expect(values.outputActionType).toBe('execute');
    expect(values.autonomyLevel).toBe(1);
    expect(values.hitl).toBe(true);
    expect(values.decisionBindingness).toBe('material');
  });

  it('"decides/acts, reviewed afterwards" + 6b "trades" -> trade, level 2, no hitl, binding', () => {
    const { values } = plainAnswersToFormValues({ ...BASE, '6': 'acts-reviewed', '6b': 'trades' }, policy());
    expect(values.outputActionType).toBe('trade');
    expect(values.autonomyLevel).toBe(2);
    expect(values.hitl).toBe(false);
    expect(values.decisionBindingness).toBe('binding');
  });

  it('"acts within set limits" + 6b "yes/no decision" -> approve, level 3, no hitl, binding', () => {
    const { values } = plainAnswersToFormValues({ ...BASE, '6': 'acts-bounded', '6b': 'yes-no-decision' }, policy());
    expect(values.outputActionType).toBe('approve');
    expect(values.autonomyLevel).toBe(3);
    expect(values.hitl).toBe(false);
  });

  it('"acts entirely alone" + 6b "something else" -> execute, level 4, no hitl, binding', () => {
    const { values } = plainAnswersToFormValues({ ...BASE, '6': 'acts-alone', '6b': 'something-else' }, policy());
    expect(values.outputActionType).toBe('execute');
    expect(values.autonomyLevel).toBe(4);
    expect(values.hitl).toBe(false);
  });

  it('TC-R16-B-03: Q6 "Not sure" -> execute, level 4, no hitl, binding, listed as an assumption with the exact text', () => {
    const { values, assumptions } = plainAnswersToFormValues({ ...BASE, '6': 'not-sure' }, policy());
    expect(values.outputActionType).toBe('execute');
    expect(values.autonomyLevel).toBe(4);
    expect(values.hitl).toBe(false);
    expect(values.decisionBindingness).toBe('binding');
    const a = assumptions.find((x) => x.questionId === '6');
    expect(a?.assumption).toMatch(/strictest case\. This changes the result a lot/);
  });

  it('Q6a "Not sure" -> material, listed as an assumption', () => {
    const { values, assumptions } = plainAnswersToFormValues({ ...BASE, '6': 'drafts', '6a': 'not-sure' }, policy());
    expect(values.decisionBindingness).toBe('material');
    expect(assumptions.some((a) => a.questionId === '6a')).toBe(true);
  });
});

describe('plainAnswersToFormValues — Q7 (who sees it)', () => {
  it('maps every option', () => {
    const cases: Array<[string, string]> = [
      ['me-or-team', 'internal-only'],
      ['other-teams', 'internal-shared'],
      ['clients', 'client-facing'],
      ['public-market', 'market-facing'],
    ];
    for (const [key, expected] of cases) {
      const { values } = plainAnswersToFormValues({ ...BASE, '7': key }, policy());
      expect(values.outputExposure).toBe(expected);
    }
  });

  it('TC-R16-B-04: "Not sure" -> market-facing, listed as an assumption with the exact text', () => {
    const { values, assumptions } = plainAnswersToFormValues({ ...BASE, '7': 'not-sure' }, policy());
    expect(values.outputExposure).toBe('market-facing');
    const a = assumptions.find((x) => x.questionId === '7');
    expect(a?.assumption).toMatch(/widest audience/);
  });
});

describe('plainAnswersToFormValues — Q8 (decision type)', () => {
  it('maps the closed set', () => {
    const cases: Array<[string, string]> = [
      ['credit', 'credit-decision'],
      ['hiring', 'hiring'],
      ['pricing', 'pricing'],
      ['trading', 'trading'],
      ['fraud', 'fraud-detection'],
      ['regulatory', 'regulatory-reporting'],
      ['operational', 'operational'],
    ];
    for (const [key, expected] of cases) {
      const { values } = plainAnswersToFormValues({ ...BASE, '8': key }, policy());
      expect(values.decisionType).toBe(expected);
    }
  });

  it('"Something else" + 8other free text -> decisionTypeOther, decisionType stays undefined', () => {
    const { values } = plainAnswersToFormValues(
      { ...BASE, '8': 'other', '8other': 'collections prioritisation' },
      policy(),
    );
    expect(values.decisionType).toBeUndefined();
    expect(values.decisionTypeOther).toBe('collections prioritisation');
  });
});

describe('plainAnswersToFormValues — Q9 (can it be undone)', () => {
  it('Yes -> reversible, No -> irreversible', () => {
    expect(plainAnswersToFormValues({ ...BASE, '9': 'yes' }, policy()).values.outputReversibility).toBe('reversible');
    expect(plainAnswersToFormValues({ ...BASE, '9': 'no' }, policy()).values.outputReversibility).toBe('irreversible');
  });

  it('TC-R16-B-05: "Not sure" -> irreversible, listed as an assumption with the exact text', () => {
    const { values, assumptions } = plainAnswersToFormValues({ ...BASE, '9': 'not-sure' }, policy());
    expect(values.outputReversibility).toBe('irreversible');
    const a = assumptions.find((x) => x.questionId === '9');
    expect(a?.assumption).toMatch(/can’t be undone — the strictest case/);
  });
});

describe('plainAnswersToFormValues — Q10 (how widely used)', () => {
  it('small -> limited; team and wide -> at_scale', () => {
    expect(plainAnswersToFormValues({ ...BASE, '10': 'small' }, policy()).values.outputScale).toBe('limited');
    expect(plainAnswersToFormValues({ ...BASE, '10': 'team' }, policy()).values.outputScale).toBe('at_scale');
    expect(plainAnswersToFormValues({ ...BASE, '10': 'wide' }, policy()).values.outputScale).toBe('at_scale');
  });
});

describe('plainAnswersToFormValues — Q11 (jurisdictions, tick-all)', () => {
  it('ticked jurisdiction codes pass through', () => {
    const { values } = plainAnswersToFormValues({ ...BASE, '11': ['UK', 'EU'] }, policy());
    expect(values.jurisdictions.sort()).toEqual(['EU', 'UK']);
  });

  it('"Somewhere else, or not sure" forces an empty jurisdictions list, even alongside other ticks', () => {
    const { values } = plainAnswersToFormValues({ ...BASE, '11': ['UK', 'elsewhere-not-sure'] }, policy());
    expect(values.jurisdictions).toEqual([]);
  });

  it('an unrecognised code is dropped rather than passed through unchecked', () => {
    const { values } = plainAnswersToFormValues({ ...BASE, '11': ['UK', 'ZZ'] }, policy());
    expect(values.jurisdictions).toEqual(['UK']);
  });
});

describe('plainAnswersToFormValues — Q12 (replaces something)', () => {
  it('Yes -> true, No -> false', () => {
    expect(plainAnswersToFormValues({ ...BASE, '12': 'yes' }, policy()).values.replacesPriorModel).toBe(true);
    expect(plainAnswersToFormValues({ ...BASE, '12': 'no' }, policy()).values.replacesPriorModel).toBe(false);
  });

  it('"Not sure" -> true, listed as an assumption', () => {
    const { values, assumptions } = plainAnswersToFormValues({ ...BASE, '12': 'not-sure' }, policy());
    expect(values.replacesPriorModel).toBe(true);
    expect(assumptions.some((a) => a.questionId === '12')).toBe(true);
  });
});

describe('plainAnswersToFormValues — Q13 (agent access, tick-all)', () => {
  it('maps ticked kinds to the engine access-scope values', () => {
    const { values } = plainAnswersToFormValues(
      { ...BASE, '4': 'agentic', '13': ['credentialed', 'shared'] },
      policy(),
    );
    expect(values.systemAccessScope).toEqual(['shared_infrastructure', 'credentialed_systems']);
  });

  it('"Nothing beyond..." is exclusive -> system access scope is ["none"]', () => {
    const { values } = plainAnswersToFormValues(
      { ...BASE, '4': 'agentic', '13': ['none', 'shared'] },
      policy(),
    );
    expect(values.systemAccessScope).toEqual(['none']);
  });

  it('TC-R16-B-06: "Not sure" -> all three non-none kinds, listed as an assumption', () => {
    const { values, assumptions } = plainAnswersToFormValues(
      { ...BASE, '4': 'agentic', '13': ['not-sure'] },
      policy(),
    );
    expect(values.systemAccessScope).toEqual(
      expect.arrayContaining(['shared_infrastructure', 'credentialed_systems', 'deployment_authority']),
    );
    expect(values.systemAccessScope).toHaveLength(3);
    expect(assumptions.some((a) => a.questionId === '13')).toBe(true);
  });

  it('Q13 unanswered (not an agent) leaves systemAccessScope unstated', () => {
    const { values } = plainAnswersToFormValues({ ...BASE, '4': 'language' }, policy());
    expect(values.systemAccessScope).toBeUndefined();
  });
});

describe('plainAnswersToFormValues — Q14 (instance coordination)', () => {
  it('maps no/yes directly', () => {
    expect(
      plainAnswersToFormValues({ ...BASE, '4': 'agentic', '14': 'no' }, policy()).values.multiInstanceCoordination,
    ).toBe('no');
    expect(
      plainAnswersToFormValues({ ...BASE, '4': 'agentic', '14': 'yes' }, policy()).values.multiInstanceCoordination,
    ).toBe('yes');
  });

  it('"Not sure" -> unknown, listed as an assumption', () => {
    const { values, assumptions } = plainAnswersToFormValues(
      { ...BASE, '4': 'agentic', '14': 'not-sure' },
      policy(),
    );
    expect(values.multiInstanceCoordination).toBe('unknown');
    expect(assumptions.some((a) => a.questionId === '14')).toBe(true);
  });
});

describe('plainAnswersToFormValues — basics', () => {
  it('carries the name and description through unchanged', () => {
    const { values } = plainAnswersToFormValues({ ...BASE, '1': 'My tool', '2': 'Does a thing.' }, policy());
    expect(values.useCaseName).toBe('My tool');
    expect(values.description).toBe('Does a thing.');
  });

  it('every Assumption carries the question text alongside the assumption text', () => {
    const { assumptions } = plainAnswersToFormValues({ ...BASE, '9': 'not-sure' }, policy());
    const a = assumptions.find((x) => x.questionId === '9');
    expect(a?.question).toMatch(/can the mistake be caught/i);
  });

  it('no assumptions are recorded when nothing was "Not sure"', () => {
    const { assumptions } = plainAnswersToFormValues(BASE, policy());
    expect(assumptions).toEqual([]);
  });
});
