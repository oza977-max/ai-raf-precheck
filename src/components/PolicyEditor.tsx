import { useMemo, useState } from 'react';
import { loadPolicy, onPolicyUpdated } from '../store/policy';
import { getCurrentPolicyYaml, setCurrentPolicyYaml } from '../store/policy-source';
import { loadPacks } from '../store/packs';
import { getPackSources } from '../store/pack-source';
import { loadKnowledgeLens } from '../store/knowledge-lens-loader';
import { getCurrentKnowledgeLensYaml } from '../store/knowledge-lens-source';
import type { PolicyValidationError } from '../engine/types';

interface PolicyEditorProps {
  onSaved?: () => void;
}

// Rule 4 (cross-cutting.md §7): presentation-only. No business logic inline —
// calls store/policy.ts's loadPolicy()/onPolicyUpdated() and
// store/policy-source.ts's setCurrentPolicyYaml(). P7-C03: real Save flow,
// pre-filled with the currently active policy.
export default function PolicyEditor({ onSaved }: PolicyEditorProps) {
  const [yaml, setYaml] = useState(() => getCurrentPolicyYaml());
  const [result, setResult] = useState<
    | { status: 'idle' }
    | { status: 'validated'; warnings: string[] }
    | { status: 'saved'; queuedCount: number }
    | { status: 'error'; errors: PolicyValidationError[] }
  >({ status: 'idle' });

  // V1.2-C (design-gap D1-D4): header/banner/packs/hard-lines panels
  // derive live from the CURRENT textarea content — loadPolicy is pure.
  const parsed = useMemo(() => loadPolicy(yaml), [yaml]);
  const livePolicy = parsed.valid ? parsed.policy : null;
  // NF-10: the starter template's own convention — [FIRM] markers mean
  // the framework has not been adopted by the firm's CRO. Review finding
  // (pass 1): the template's instructional COMMENTS also mention [FIRM]
  // ("Search for [FIRM] markers below…"), so the check strips comment
  // lines first — otherwise a genuinely adopted framework that kept the
  // template header would be branded "provisional" forever, an integrity
  // defect in a product built on honest status claims.
  // V2-A: real pack loading — chips now reflect the loader's actual
  // result. "loaded — pending adoption" is honest: rules apply at eval
  // time but every sign-off is a [FIRM] placeholder until the CRO adopts.
  const packLoad = useMemo(() => loadPacks(getPackSources()), []);

  // R11-UI-1: the third lever, loaded read-only here — this screen shows
  // it exists and how many entries it carries; it is never editable
  // alongside the appetite YAML, because editing it is curation, not
  // rule-authoring (policy-schema.md §10b).
  const knowledgeLensLoad = useMemo(() => loadKnowledgeLens(getCurrentKnowledgeLensYaml()), []);

  const hasFirmMarkers = yaml
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n')
    .includes('[FIRM]');

  function handleValidate() {
    const outcome = loadPolicy(yaml);
    if (outcome.valid) {
      setResult({ status: 'validated', warnings: outcome.warnings });
    } else {
      setResult({ status: 'error', errors: outcome.errors });
    }
  }

  async function handleSave() {
    // BC-P7C03-02: invalid YAML must never reach setCurrentPolicyYaml()/
    // onPolicyUpdated() — validate first, gate the save on success.
    const outcome = loadPolicy(yaml);
    if (!outcome.valid) {
      setResult({ status: 'error', errors: outcome.errors });
      return;
    }

    setCurrentPolicyYaml(yaml);
    // BC-P7C03-01: a real call, queuing real re_evaluation_queued audit
    // events for real active use cases — not a simulated message.
    const { queuedCount } = await onPolicyUpdated(outcome.policy.version);
    setResult({ status: 'saved', queuedCount });
    onSaved?.();
  }

  return (
    <div className="policy-view">
      <h2>Appetite framework</h2>
      <p className="policy-view__meta">
        {livePolicy
          ? `policy v${livePolicy.version} · ${livePolicy.jurisdictions.length} jurisdiction pack${
              livePolicy.jurisdictions.length === 1 ? '' : 's'
            } declared`
          : 'panels unavailable — YAML invalid'}
      </p>
      <p className="policy-view__framing">
        The bank&apos;s rules, machine-readable and versioned. Every verdict traces back to a rule in here. The
        engine enforces it — it does not invent it.
      </p>

      {/* R11-UI-1: three levers, named and visually distinct, each with its
          own one-line power statement — appetite decides, law decides,
          knowledge challenges (never decides). */}
      <div className="policy-view__levers">
        <div className="policy-view__lever">
          <h3>Firm appetite</h3>
          <p className="policy-view__lever-power">Decides.</p>
        </div>
        <div className="policy-view__lever">
          <h3>Regulation</h3>
          <p className="policy-view__lever-power">Decides, where the law applies.</p>
        </div>
        <div className="policy-view__lever policy-view__lever--advisory">
          <h3>Risk knowledge</h3>
          <p className="policy-view__lever-power">Informs — never decides.</p>
        </div>
      </div>

      {hasFirmMarkers && (
        <div className="policy-view__action-required" role="alert">
          <strong>ACTION REQUIRED</strong> — Starter config in use. <code>[FIRM]</code> markers and
          translation-fidelity attestation are unfilled — verdicts are provisional until your CRO adopts this
          framework (NF-10).
        </div>
      )}

      <label htmlFor="policy-yaml-input">Policy YAML</label>
      <textarea
        id="policy-yaml-input"
        className="policy-view__yaml"
        value={yaml}
        onChange={(e) => setYaml(e.target.value)}
        spellCheck={false}
      />
      <button type="button" onClick={handleValidate}>
        Validate
      </button>
      <button type="button" onClick={() => void handleSave()}>
        Save
      </button>

      {result.status === 'validated' && (
        <div role="status">
          <p>Policy is valid.</p>
          {result.warnings.length > 0 && (
            <ul>
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {result.status === 'saved' && (
        <div role="status">
          <p>
            Policy saved — {result.queuedCount} active use case{result.queuedCount === 1 ? '' : 's'} queued for
            re-evaluation.
          </p>
        </div>
      )}

      {result.status === 'error' && (
        <div role="alert">
          <p>Policy is invalid.</p>
          <ul>
            {result.errors.map((e, i) => (
              <li key={`${e.field}-${i}`}>
                <strong>{e.field}</strong>: {e.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {livePolicy && (
        <div className="policy-view__panel">
          <h3>Jurisdiction packs</h3>
          {/* User report (2026-08-17): "loaded — SS1-23 (1 rule, v0.2-draft) ·
              pending adoption" and "declared — no pack file loaded" are
              engineering states with no gloss — a non-expert can't tell what
              either means for a verdict. One plain-English sentence up front,
              once, instead of decoding jargon per row. */}
          <p className="policy-view__panel-sub">
            A region either has extra regulatory rules the engine actually applies, or it doesn&apos;t yet — either
            way, your firm&apos;s own appetite rules always apply. Regulatory rules apply from the moment they load,
            but every verdict that relies on one is marked provisional until a named person at your firm signs off
            that it&apos;s a fair reading of the law.
          </p>
          <ul className="policy-view__packs">
            {livePolicy.jurisdictions.map((j) => {
              // Review fixes (pass 1): a jurisdiction can declare MULTIPLE
              // packs (EU = EU AI Act + DORA) — show them all; and load
              // errors are matched by the declared pack FILE names, not a
              // code-substring heuristic that missed 5 of 7 files.
              const jurisdictionPacks = packLoad.packs.filter((p) => p.jurisdiction === j.code);
              const fileNames = j.pack_files.map((pf) => pf.split('/').pop() ?? pf);
              const packError = packLoad.errors.find((e) => fileNames.some((fn) => e.file.endsWith(fn)));
              const totalRules = jurisdictionPacks.reduce((n, p) => n + p.rules.length, 0);
              return (
                <li key={j.code}>
                  <code className="policy-view__pack-code">{j.code}</code>
                  <span className="policy-view__pack-name">{j.name}</span>
                  {jurisdictionPacks.length > 0 ? (
                    <span className="policy-view__pack-state policy-view__pack-state--loaded">
                      <span className="policy-view__pack-state-plain">
                        {totalRules} rule{totalRules === 1 ? '' : 's'} applying — not yet signed off
                      </span>
                      <span className="policy-view__pack-state-detail">
                        {jurisdictionPacks.map((p) => `${p.pack_id} v${p.version}`).join(' + ')}
                      </span>
                    </span>
                  ) : packError ? (
                    <span className="policy-view__pack-state policy-view__pack-state--invalid">
                      <span className="policy-view__pack-state-plain">
                        Rulebook file has an error and could not be loaded
                      </span>
                      <span className="policy-view__pack-state-detail">{packError.reason.slice(0, 60)}</span>
                    </span>
                  ) : (
                    <span className="policy-view__pack-state">
                      <span className="policy-view__pack-state-plain">
                        No regulatory rulebook yet — only your firm&apos;s own appetite rules apply here
                      </span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {livePolicy && (
        <div className="policy-view__panel">
          <h3>Hard lines — no control set can fix</h3>
          <p className="policy-view__panel-sub">
            Checked first. A use case crossing one is rejected immediately (PE-4).
          </p>
          <ul className="policy-view__hardlines">
            {livePolicy.hard_lines.map((hl) => (
              <li key={hl.id}>
                <code>{hl.id}</code> — {hl.description}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* R11-UI-1: the knowledge lever, visually apart from the two
          deciding levers above — dashed border in CSS matches
          KnowledgeLensPanel's own advisory idiom. */}
      <div className="policy-view__panel knowledge-lens knowledge-lens--summary">
        <h3>Risk knowledge (advisory)</h3>
        {knowledgeLensLoad.valid ? (
          <>
            <p className="policy-view__panel-sub">
              {knowledgeLensLoad.entries.length} curated entr{knowledgeLensLoad.entries.length === 1 ? 'y' : 'ies'}{' '}
              from the MIT AI Risk Repository&apos;s public domain taxonomy (CC BY 4.0). Matched entries render
              beside the verdict on review and sign-off — informs, never decides.
            </p>
            <p className="policy-view__panel-sub">
              This file is curated, not editable here — see{' '}
              <code>grounding/risk-knowledge.yaml</code>.
            </p>
          </>
        ) : (
          <p className="policy-view__panel-sub" role="alert">
            Risk-knowledge file failed to load — the advisory panel is unavailable, but nothing about the
            appetite and jurisdiction levers above is affected.
          </p>
        )}
      </div>
    </div>
  );
}
