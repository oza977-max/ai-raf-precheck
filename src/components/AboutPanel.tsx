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
        person confirms it. This is also the security posture: with no model in the decision path,
        there is no model to jailbreak into a verdict — adversarial text can at most mis-propose,
        never decide.
      </p>
      <p>
        Full transparency: that optional AI path is built and tested against a simulated API, but it
        has never yet been run against the live service — the guided form is the verified path. If you
        add a key and use it, you are its first real test.
      </p>

      <h2>It comes with rules — you bring the authority</h2>
      <p>
        A common first question: &ldquo;if my firm has no appetite document, does this app have no
        rules?&rdquo; The opposite. Out of the box it carries a complete working ruleset — 5 hard lines,
        18 appetite rules, the full tiering and control machinery — derived from a regulator-grounded
        template, and it produces real verdicts with zero configuration.
      </p>
      <p>
        What it does <em>not</em> come with is <strong>authority</strong>. Rules and authority are
        deliberately separate: the rules enforce from the first click, but every verdict is stamped
        provisional until someone at your firm says &ldquo;these rules are ours.&rdquo; Same rules,
        same verdicts — the stamp is the only thing adoption removes. A bank must own its appetite, so
        the app ships a complete one and makes owning it a deliberate act instead of a default.
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

      <h2>The sign-offs, in one minute</h2>
      <p>
        Everything provisional in this app traces to one principle: when a supervisor asks &ldquo;why
        did you decide that?&rdquo;, a <em>person</em> must answer — a tool cannot. So every judgement
        has a named owner, and there are only three kinds:
      </p>
      <ul>
        <li>
          <strong>Pack sign-off</strong> — a named function (Legal, Model Risk, Technology Risk) reads
          a regulation pack against its quoted source text and signs the firm&rsquo;s reading of that
          law. <em>Once per regulation</em> — not per rule, not per use case — and revisited only when
          the cited text changes.
        </li>
        <li>
          <strong>Translation attestation</strong> — one person confirms the rules file matches what the
          board signed off. <em>Once</em>, with a periodic refresh. This is what the header&rsquo;s
          &ldquo;translation fidelity&rdquo; badge is waiting for.
        </li>
        <li>
          <strong>Second-line sign-off</strong> — a reviewer clears an individual use case above the
          self-service tier. The only <em>recurring</em> one, and it is the reviewer&rsquo;s existing
          day job — the app just hands them the evidence pre-assembled.
        </li>
      </ul>
      <p>
        The first two are a single afternoon, once. After it, every &ldquo;pending adoption&rdquo;
        label in this app goes quiet permanently. The demo deliberately ships in the un-signed state,
        because faking those signatures would be exactly the kind of claim this product exists to
        refuse.
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
