// The live link drops visitors into "New pre-check" with no context; the
// README and its diagrams live on GitHub where most visitors never go
// (2026-08-15). This screen is the app answering the three questions every
// first-timer has — what is this, who wrote the rules, is an AI judging me.
//
// Copy rule: never the words "appr*ved" or "rej*cted" (BC-V12B-03 — the
// acceptance suite holds a single-match guard over the verdict, and this
// session walked into it three times). Say "inside appetite" / "outside
// appetite" instead, which is also the more precise language.
// Rule 4 (cross-cutting.md §7): presentation-only.
interface AboutPanelProps {
  onNavigate: (view: 'intake' | 'register' | 'policyEditor') => void;
}

export default function AboutPanel({ onNavigate }: AboutPanelProps) {
  return (
    <section aria-label="About AIGate" className="about-panel">
      <h1>What this is</h1>
      <p>
        A bank writes down what AI risk it will and will not accept — its <strong>risk appetite</strong>.
        AIGate turns that document into executable rules, so that asking &ldquo;can we build this AI
        tool?&rdquo; takes minutes instead of months: describe the use case, answer a short set of
        questions, and get a verdict — inside appetite, inside appetite with named controls, or outside
        appetite — with the exact rule and regulation behind every step.
      </p>

      <h2>No AI is in the decision</h2>
      <p>
        The verdict is computed by deterministic rules: the same answers produce the same verdict, every
        time. An optional AI model helps only at the edges — reading a plain-language description into a
        structured form, which you then check and correct yourself. Nothing it writes is used until a
        person confirms it.
      </p>

      <h2>Who wrote the rules</h2>
      <p>Every rule traces to one of two sources, and the verdict shows which:</p>
      <ul>
        <li>
          <strong>The firm&rsquo;s own appetite</strong> — a framework signed off at board level,
          translated into a plain, commented rules file a risk manager can read and edit.
        </li>
        <li>
          <strong>Regulation</strong> — SS1/23 (UK), SR 26-2 (US), the EU AI Act and DORA, each rule
          quoting the verbatim regulatory text it derives from, each pack requiring a named human
          sign-off. Until your firm adopts a pack, verdicts that rely on it are marked provisional — the
          tool says so rather than hiding it.
        </li>
      </ul>
      <p>
        <button type="button" className="about-panel__link" onClick={() => onNavigate('policyEditor')}>
          Read the rules in force →
        </button>
      </p>

      <h2>The fastest way to understand it</h2>
      <p>
        On first launch, AIGate submitted itself through its own gate — the tool judged the tool. Its
        verdict sits in the register alongside every other use case, with the same citations and the
        same audit trail. Open it, and you have seen the whole product.
      </p>
      <p>
        <button type="button" className="about-panel__link" onClick={() => onNavigate('register')}>
          See AIGate&rsquo;s own self-assessment →
        </button>
      </p>

      <h2>What it deliberately is not</h2>
      <ul>
        <li>Not a chatbot, and not a document generator.</li>
        <li>It does not write your risk appetite — it enforces the one you give it.</li>
        <li>
          It does not replace security, vendor or legal review — it triggers those as named downstream
          steps when a use case requires them.
        </li>
        <li>
          This version runs entirely in your browser: nothing you enter leaves this machine, and the
          audit trail is proof-of-concept grade, not tamper-evident.
        </li>
      </ul>

      <p>
        <button type="button" className="about-panel__link about-panel__cta" onClick={() => onNavigate('intake')}>
          Run your first pre-check →
        </button>
      </p>
    </section>
  );
}
