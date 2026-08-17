import type {
  ActionType,
  DataClass,
  DataZone,
  DecisionBindingness,
  DecisionType,
  Exposure,
  ModelType,
} from '../engine/types';

// Presentation copy for the guided intake form (user feedback, V2-E: "input
// data class, input data zone, AI model type... is not very business
// friendly, how will they know all this").
//
// The form previously exposed the engine's internal field names as labels
// and its raw enum values as options. Those are the canonical vocabulary
// (policy-schema.md §3.0) and must not change — they are what rules match
// on. So the fix is presentation-only: the values stay, the words the user
// reads become questions a front-office person can answer without a
// glossary. Rule 4 (cross-cutting.md §7) — no logic here, just strings.
//
// The technical term is kept in parentheses on each option so a risk or
// model-validation reader can still map an answer back to the vocabulary
// the policy and the verdict are written in.

export const DATA_CLASS_LABELS: Record<DataClass, string> = {
  Public: 'Public — already published or freely available (Public)',
  Internal: 'Everyday business information — nothing sensitive (Internal)',
  Confidential: 'Confidential business information — restricted internally (Confidential)',
  'Client PII': 'Personal details of clients — names, accounts, anything identifying them (Client PII)',
  MNPI: 'Price-sensitive information — live deals, unpublished results, inside information (MNPI)',
};

export const DATA_ZONE_LABELS: Record<DataZone, string> = {
  'Zone A': 'On the open internet — outside the firm’s control (Zone A)',
  'Zone B': 'With an outside supplier — a cloud or vendor service used under contract (Zone B)',
  'Zone C': 'Inside the firm only — our own systems (Zone C)',
};

export const MODEL_TYPE_LABELS: Record<ModelType, string> = {
  statistical: 'A calculation or scorecard — fixed rules and formulas (statistical)',
  'traditional-ml': 'A model trained on historical data to predict or score (traditional ML)',
  ml: 'A model trained on historical data — general machine learning (ML)',
  'deep-learning': 'A neural network — e.g. image, voice or pattern recognition (deep learning)',
  llm: 'A chatbot or writing assistant — understands and produces text (LLM)',
  'generative-ai': 'Generates new content — text, images, audio or code (generative AI)',
  agentic: 'Can decide its own steps and use other tools to get things done (agentic)',
};

export const EXPOSURE_LABELS: Record<Exposure, string> = {
  'internal-only': 'Just my own team (internal-only)',
  'internal-shared': 'Other teams across the firm (internal-shared)',
  'client-facing': 'Clients see it (client-facing)',
  'market-facing': 'It goes outside the firm — market, public or regulators (market-facing)',
};

export const BINDINGNESS_LABELS: Record<DecisionBindingness, string> = {
  'non-binding': 'Background only — nobody acts on it directly (non-binding)',
  advisory: 'One input among several into a human decision (advisory)',
  material: 'It substantially drives the decision a human then makes (material)',
  binding: 'It is the decision — the outcome follows automatically (binding)',
};

export const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  read: 'Finds or summarises information for someone to read (read)',
  inform: 'Answers questions or presents information directly — nothing is actioned (inform)',
  draft: 'Writes a first draft for a person to check and edit (draft)',
  recommend: 'Suggests what should be done, a person decides (recommend)',
  execute: 'Carries out the action itself (execute)',
  trade: 'Places or changes trades (trade)',
  approve: 'Signs things off on its own (approve)',
};

export const DECISION_TYPE_LABELS: Record<DecisionType, string> = {
  'credit-decision': 'Whether to lend, or on what terms (credit decision)',
  'lending-decision': 'Loan origination or limits (lending decision)',
  'fraud-detection': 'Spotting fraud or financial crime (fraud detection)',
  trading: 'Buying, selling or hedging positions (trading)',
  pricing: 'What to charge a client (pricing)',
  hiring: 'Recruitment, selection or promotion (hiring)',
  'regulatory-reporting': 'Numbers or statements that go to a regulator (regulatory reporting)',
  operational: 'Day-to-day internal processes (operational)',
};

export const REVERSIBILITY_LABELS: Record<string, string> = {
  reversible: 'Yes — it can be corrected before any real harm (reversible)',
  irreversible: 'No — once it happens, it cannot be taken back (irreversible)',
  unknown: 'Not sure',
};

export const SCALE_LABELS: Record<string, string> = {
  limited: 'Occasionally, or a small pilot group (limited)',
  at_scale: 'Routinely, across the business (at scale)',
};

// "Autonomy level" as a term means nothing outside model risk. Asked as a
// question about who is in control, the same 0–4 scale is answerable.
export const AUTONOMY_LABELS: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: 'It only provides information — it never acts (level 0)',
  1: 'A person checks and approves every action before it happens (level 1)',
  2: 'It acts, and a person reviews afterwards (level 2)',
  3: 'It acts on its own within limits someone set in advance (level 3)',
  4: 'It acts on its own with no human checkpoint (level 4)',
};

// R5-GR-1 (intake-flow.md §15.1). One consequence line per FIELD, not per
// value: a per-value consequence would re-derive rule behaviour in copy,
// which drifts the first time a rule changes. These say WHY the field
// matters, in words that stay true across policy edits.
export const FIELD_CONSEQUENCES: Record<string, string> = {
  data_class: 'How sensitive the data is. The strictest rules key off personal client data and price-sensitive information.',
  data_zone: 'Where the data lives or the processing runs. Hard lines and zone rules read this field — the open internet is the harshest case.',
  model_type: 'What kind of AI this is. Generative and agentic models attract extra oversight rules.',
  autonomy_level: 'How much happens without a person. Levels 3–4 trigger the strictest oversight.',
  vendor: 'Ties the case to vendor approval status — an unapproved vendor changes the outcome.',
  // R11-MG-2. Reserved-word discipline (CLAUDE.md, /approved|rejected/i):
  // "on the firm's model registry within appetite" says the same thing as
  // "approved" without the banned word reaching a rendered string.
  declared_model_id: 'Ties the case to the model governance registry — a model not on the firm\'s registry within appetite triggers a review.',
  action_type: 'What the output does in the world. Acting or signing off alone is treated far more strictly than drafting or suggesting.',
  exposure: 'Who sees the output. Client- and market-facing exposure raises the stakes.',
  decision_bindingness: 'How much the output drives the decision. Binding output is treated as the decision itself.',
  output_reversibility: 'Whether a wrong output can be caught and corrected. Irreversible raises severity.',
  scale: 'A pilot mistake and an everywhere-at-once mistake are different risks.',
  decision_type: 'Names the decision the rulebook must cover. Credit and lending decisions carry the highest floors.',
  hitl: 'Whether a person checks the output before anything happens as a result of it.',
};

// Round-5 follow-up (user: "how would a user know what is Zone A? what is
// ML?"): tier and track were the last classified values a business reader
// meets with no translation. Meanings mirror policy/appetite.yaml's track
// definitions and the glossary — wording stays claim-safe: it says which
// oversight regime applies, never re-states rule outcomes.
export const TIER_MEANINGS: Record<string, string> = {
  Critical: 'the most serious category — decisions about people or major exposures. Waits for second-line sign-off.',
  High: 'a lot could go wrong if this misbehaves. Waits for second-line sign-off.',
  Medium: 'moderate stakes. Waits for second-line sign-off.',
  Low: 'low stakes — can proceed self-service, and stays on the record.',
};

export const TRACK_MEANINGS: Record<string, string> = {
  I: 'overseen as a traditional model, under classic model risk management.',
  II: 'overseen as a model with extra scrutiny — it replaces a prior model or acts with high autonomy.',
  III: 'overseen by AI governance — generative or agentic AI that newer regulation carves out of the classic model definition.',
};
