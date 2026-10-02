// R16 chunk B/C — shared plain-language copy (build/prompts/R16.md v2.1 §2.2,
// §2.4, §3). ONE source for every question, option, help, assumption and
// summary text in the guided form. Code-free (cross-cutting.md §7 Rule 4 —
// this module renders nothing and decides nothing; it only holds strings) so
// the guided form (chunk B), the questionnaire (chunk E) and the summary
// (chunk C) read the identical words. Option keys are stable, short strings
// — never shown to a submitter, only used internally (by plain-intake.ts and
// by the parity test's text -> key lookup) so a later copy edit never breaks
// the answer -> graph mapping.
//
// A few questions (3, 3supplier, 3aWhich, 11) also offer one option per
// policy platform/vendor/jurisdiction. Those are deliberately NOT listed
// here — this module holds only the STATIC copy — because the dynamic list
// depends on the loaded policy, which this file must never import (it would
// stop being code-free). StructuredForm.tsx and plain-intake.ts each build
// the dynamic options straight from the policy, using the registry entry's
// own id as that option's key.

export type QuestionId =
  | '1' | '2' | '3' | '3supplier' | '3supplierName' | '3model' | '3a' | '3aWhich'
  | '4' | '4a' | '5' | '6' | '6a' | '6b' | '7' | '8' | '8other' | '9' | '10'
  | '11' | '12' | '13' | '14';

export type PlainAnswers = Partial<Record<QuestionId, string | string[]>>;

export interface Assumption {
  questionId: QuestionId;
  question: string;
  assumption: string;
}

export interface PlainOption {
  key: string;
  text: string;
}

export interface PlainQuestion {
  id: QuestionId;
  text: string;
  /** Secondary, italicised guidance shown under the question — e.g. an
   *  example or "this tells us where your information will go." */
  help?: string;
  /** Tick-all (checkbox group) rather than single-select. */
  multi?: boolean;
  /** Free text with no closed option set (Q1, Q2, Q3supplierName, Q3model). */
  freeText?: boolean;
  /** Optional free-text field — the form may be completed with it blank. */
  optional?: boolean;
  options: PlainOption[];
}

export const INTRO_TEXT =
  'New pre-check — tell us about the AI you want to use. Answer in your own words. ' +
  '"Not sure" is always fine: we’ll take the careful assumption and show you what ' +
  'we assumed, so you or your AI risk team can correct it.';

export const PLAIN_QUESTIONS: PlainQuestion[] = [
  {
    id: '1',
    text: 'What do you want to call it?',
    freeText: true,
    options: [],
  },
  {
    id: '2',
    text: 'In a sentence or two, what will it do for you?',
    help: 'e.g. "Turn my client meeting notes into follow-up emails."',
    freeText: true,
    options: [],
  },
  {
    id: '3',
    text: 'Where does the AI come from?',
    help: 'This tells us where your information will go.',
    options: [
      {
        key: 'outside-assistant',
        text:
          'An AI assistant or website run by an outside company — including company accounts your firm set up — ' +
          'e.g. ChatGPT, Microsoft Copilot, Claude, Gemini, or an image or translation website',
      },
      {
        key: 'supplier-feature',
        text:
          'An AI feature inside software your firm already uses from a supplier — e.g. in Salesforce, Workday or Bloomberg',
      },
      {
        key: 'specialist-product',
        text:
          'A product your firm is buying from a specialist supplier — e.g. a credit-scoring, fraud-detection, customer-chatbot or coding tool',
      },
      // (d) one option per policy platform — appended dynamically by the
      // consumer, keyed by the platform's own registry id.
      { key: 'firm-built', text: 'Something a team in your firm built for this job' },
      { key: 'not-sure', text: 'Not sure yet' },
    ],
  },
  {
    id: '3supplier',
    text: 'Which supplier is it?',
    help:
      'Only pick a name if you’re sure it’s the one you use. If you’re not certain, choose "I don’t know" ' +
      'rather than guess — picking the wrong one could miss checks your actual tool needs.',
    options: [
      // one option per policy vendor of kind `supplier` — appended
      // dynamically, keyed by the vendor's own registry id.
      { key: 'not-on-list', text: 'Not on this list' },
      { key: 'dont-know', text: 'I don’t know' },
    ],
  },
  {
    id: '3supplierName',
    text: 'What is it called?',
    optional: true,
    freeText: true,
    options: [],
  },
  {
    id: '3model',
    text: 'Model name, if you know it',
    help: 'Optional — your AI risk team can confirm.',
    optional: true,
    freeText: true,
    options: [],
  },
  {
    id: '3a',
    text: 'Which version are you using?',
    options: [
      {
        key: 'firm-account',
        text:
          'The firm’s own account — I sign in with my work login, and the firm has a contract with the company',
      },
      { key: 'personal-account', text: 'A free or personal account' },
      { key: 'not-sure', text: 'Not sure' },
    ],
  },
  {
    id: '3aWhich',
    text: 'Which of your firm’s AI assistants is it?',
    options: [
      // one option per `company_assistant` vendor — appended dynamically,
      // keyed by the vendor's own registry id.
      { key: 'not-sure', text: 'Not sure' },
    ],
  },
  {
    id: '4',
    text:
      'What kind of AI is it? If more than one fits — for example, something that turns speech into text and writes ' +
      'a summary of it — pick the one nearest the bottom of this list.',
    help:
      'Different kinds of AI go wrong in different ways. (Whether it acts by itself is asked separately, in question 6.)',
    options: [
      {
        key: 'score',
        text:
          'Gives a score, ranking, flag, category or forecast — e.g. a credit score, a fraud alert, a ranking of CVs, the likely cause of a problem',
      },
      {
        key: 'perception',
        text: 'Recognises things in images, sound or documents — e.g. reads cheques, transcribes calls',
      },
      { key: 'language', text: 'Reads, summarises, translates, writes or answers questions in words' },
      { key: 'generative', text: 'Creates images, audio, video or code' },
      {
        key: 'agentic',
        text:
          'An AI agent that works through tasks on its own, using other tools or systems — e.g. sends messages, books things, updates records, changes code',
      },
      { key: 'not-sure', text: 'Not sure' },
    ],
  },
  {
    id: '4a',
    text: 'Could the people who built it show you why it gave a particular result?',
    options: [
      { key: 'rules', text: 'Yes — it follows fixed, written-down rules, like a scorecard' },
      { key: 'explainable', text: 'Yes — they can show which factors drove each result' },
      { key: 'unexplainable', text: 'No, or I don’t know' },
    ],
  },
  {
    id: '5',
    text: 'What information will it see or use? Tick all that apply.',
    help: 'We go by the most sensitive thing you tick.',
    multi: true,
    options: [
      {
        key: 'people',
        text:
          'Information about people — clients, applicants, staff or anyone else: names, contact details, account and ' +
          'financial details, CVs — anything about someone who can be identified',
      },
      {
        key: 'price-sensitive',
        text: 'Price-sensitive information — unannounced deals or results, anything that could move a share price',
      },
      {
        key: 'confidential',
        text:
          'Confidential firm information — internal data, code or documents not meant for outside the firm, whether or not they’re marked confidential',
      },
      { key: 'everyday', text: 'Everyday work information — emails, policies, general documents' },
      { key: 'typed-only', text: 'Only what I type in myself — no documents, records or data' },
      { key: 'public', text: 'Only public information — websites, published reports, news' },
      { key: 'not-sure', text: 'Not sure' },
    ],
  },
  {
    id: '6',
    text:
      'What happens with what it produces? If it does several things, pick the one where it has the most freedom.',
    help: 'The more it does on its own, the more safeguards it needs.',
    options: [
      { key: 'read', text: 'finds or summarises for people to read — nobody acts on it directly' },
      { key: 'answers', text: 'answers people’s questions directly, like a chat assistant' },
      {
        key: 'drafts',
        text: 'creates a draft — text, an image or code — and a person checks it before it’s used',
      },
      { key: 'suggests', text: 'suggests, ranks or flags things, and a person decides what to do' },
      {
        key: 'prepares',
        text: 'prepares an action — a payment, an order, an update — and a person approves each one before it goes ahead',
      },
      {
        key: 'acts-reviewed',
        text: 'decides or acts by itself, and a person reviews afterwards — every case or a sample',
      },
      { key: 'acts-bounded', text: 'acts by itself within limits someone set, with no routine review' },
      { key: 'acts-alone', text: 'acts entirely by itself, with no person involved at any point' },
      { key: 'not-sure', text: 'Not sure' },
    ],
  },
  {
    id: '6a',
    text: 'How much weight does what it produces carry?',
    options: [
      {
        key: 'little',
        text:
          'Little — it’s routine work, like an email, a picture or a first draft; nobody makes an important decision from it',
      },
      { key: 'one-input', text: 'It’s one input among several when someone makes a decision' },
      { key: 'usually-basis', text: 'It’s usually what a decision is based on — people tend to go with it' },
      { key: 'not-sure', text: 'Not sure' },
    ],
  },
  {
    id: '6b',
    text: 'What does it do when it acts?',
    options: [
      { key: 'trades', text: 'Places or changes trades' },
      { key: 'yes-no-decision', text: 'Makes a yes-or-no decision — e.g. accepts or declines an application, signs something off' },
      { key: 'something-else', text: 'Something else — sends, books, updates records, deploys changes' },
    ],
  },
  {
    id: '7',
    text: 'Who ends up seeing or receiving what it produces, in its final form? If more than one, pick the widest.',
    help: 'If it changes code, records or systems instead, think about who is affected by those changes.',
    options: [
      { key: 'me-or-team', text: 'Only me or my own team' },
      { key: 'other-teams', text: 'Other teams in the firm' },
      { key: 'clients', text: 'Clients or customers — including people applying to us' },
      {
        key: 'public-market',
        text: 'The public, the market or regulators — e.g. public social media, published reports',
      },
      { key: 'not-sure', text: 'Not sure' },
    ],
  },
  {
    id: '8',
    text: 'Which of these does it help decide, if any? Pick the closest.',
    options: [
      { key: 'credit', text: 'Whether to lend to someone, or on what terms' },
      {
        key: 'hiring',
        text: 'Who to hire or promote — including tools that only produce notes, transcripts or summaries a person later uses to decide',
      },
      { key: 'pricing', text: 'What to charge a client, or how something is priced or valued' },
      { key: 'trading', text: 'Buying or selling investments' },
      { key: 'fraud', text: 'Spotting fraud or financial crime' },
      { key: 'regulatory', text: 'Figures or statements sent to a regulator' },
      { key: 'operational', text: 'None of these — it’s for day-to-day work' },
      { key: 'other', text: 'Something else — describe it' },
    ],
  },
  {
    id: '8other',
    text: 'What kind of decision is it?',
    optional: false,
    freeText: true,
    options: [],
  },
  {
    id: '9',
    text: 'If it gets something wrong, can the mistake be caught and put right before it does lasting harm — to anyone?',
    options: [
      { key: 'yes', text: 'Yes' },
      { key: 'no', text: 'No — once it happens, it can’t be taken back' },
      { key: 'not-sure', text: 'Not sure' },
    ],
  },
  {
    id: '10',
    text: 'How widely will it be used?',
    help: 'Think about how much of the work it covers, not just how many people use it.',
    options: [
      { key: 'small', text: 'Just me, or a small trial' },
      { key: 'team', text: 'My team, as part of normal work' },
      { key: 'wide', text: 'Several teams, the whole business, or every case of a kind (e.g. all applications)' },
    ],
  },
  {
    id: '11',
    text: 'Which countries does it involve? Tick all.',
    help:
      'For public posts, tick where your firm is based. Otherwise tick where your firm (or your part of it) is based ' +
      'and where the people or business it affects are — people applying to you count. This is not about where the ' +
      'AI’s servers are.',
    multi: true,
    options: [
      // one option per policy jurisdiction — appended dynamically, keyed by
      // the jurisdiction's own code.
      { key: 'elsewhere-not-sure', text: 'Somewhere else, or not sure' },
    ],
  },
  {
    id: '12',
    text: 'Does it replace something you already use for the same job — a model, scorecard, rules or a spreadsheet calculation?',
    options: [
      { key: 'yes', text: 'Yes' },
      { key: 'no', text: 'No' },
      { key: 'not-sure', text: 'Not sure' },
    ],
  },
  {
    id: '13',
    text: 'What can it get into by itself? Tick all that apply.',
    multi: true,
    options: [
      { key: 'none', text: 'Nothing beyond what it’s given for the task' },
      { key: 'credentialed', text: 'It has its own logins, passwords or access tokens for other systems' },
      { key: 'deployment', text: 'It can change software or settings, or deploy updates, without a person' },
      { key: 'shared', text: 'It runs on computers or servers shared with other automated tools' },
      { key: 'not-sure', text: 'Not sure' },
    ],
  },
  {
    id: '14',
    text: 'Can copies of it, or other AI agents, pass work or messages to each other?',
    options: [
      { key: 'no', text: 'No — it works alone' },
      { key: 'yes', text: 'Yes' },
      { key: 'not-sure', text: 'Not sure' },
    ],
  },
];

export function findQuestion(id: QuestionId): PlainQuestion | undefined {
  return PLAIN_QUESTIONS.find((q) => q.id === id);
}

export function findOption(id: QuestionId, key: string): PlainOption | undefined {
  return findQuestion(id)?.options.find((o) => o.key === key);
}

// A worked case's answers (backtest/worked-case-answers.json) were typed
// independently of this file and use plain ASCII apostrophes throughout
// ("they're", "can't"); this module's own option text uses the typographic
// ’ form. Normalising both sides before comparing means the parity
// test's text->key lookup is not hostage to which quote character either
// document happened to use — a real difference in MEANING should fail the
// lookup, a difference in QUOTE GLYPH should not.
function normaliseQuotes(s: string): string {
  return s.replace(/[‘’']/g, "'");
}

/** Reverse lookup used only by the parity test: a worked case's answers are
 *  written blind, in the exact option TEXT (§2.3) — never the key — so the
 *  test must translate text back to a key before calling
 *  plainAnswersToFormValues(), which only understands keys. Static options
 *  only; the caller handles the dynamic platform/vendor/jurisdiction options
 *  itself (see plain-intake.ts's resolve* helpers). */
export function optionKeyForText(id: QuestionId, text: string): string | undefined {
  const target = normaliseQuotes(text);
  return findQuestion(id)?.options.find((o) => normaliseQuotes(o.text) === target)?.key;
}

// §2.3 assumption texts, keyed `${questionId}:${optionKey}`. Exact wording
// where the contract quotes it; a consistent, plainly-written sentence in
// the same voice where it does not (§0.1's "every Not sure is listed back"
// still applies even where v2.1 did not pin the exact words — see the R16-B
// handover for the explicit list of which ones were interpreted).
export const ASSUMPTION_TEXT: Record<string, string> = {
  '3:not-sure': 'an outside website with no contract — the strictest case',
  '3supplier:dont-know': 'a supplier your firm hasn’t assessed — the stricter case',
  '3a:not-sure': 'a personal account with no firm contract — the stricter case',
  '3aWhich:not-sure': 'one of your firm’s AI assistants, but not confirmed which — the stricter case',
  '4:not-sure':
    'an AI agent that can work on its own — the strictest case, because agents need the most safeguards. Change it if you can.',
  '5:not-sure': 'confidential firm information — the stricter case',
  '6:not-sure':
    'it acts entirely by itself with no person involved at any point — the strictest case. This changes the result a lot; change it if you can.',
  '6a:not-sure': 'usually what a decision is based on — the stricter case',
  '7:not-sure': 'the public or the market — the widest audience. Change it if the real audience is narrower.',
  '9:not-sure': 'it can’t be undone — the strictest case. Change it if a mistake can actually be caught and fixed.',
  '12:not-sure': 'it replaces something you already use — the stricter case. Change it if nothing is being replaced.',
  '13:not-sure':
    'it can reach other systems with its own logins, can deploy changes, and runs on shared infrastructure — the strictest case',
  '14:not-sure':
    'whether copies of it can pass work to each other isn’t known — treated as if they can, since that’s the stricter case',
};

export function assumptionText(id: QuestionId, optionKey: string): string | undefined {
  return ASSUMPTION_TEXT[`${id}:${optionKey}`];
}

export function makeAssumption(id: QuestionId, optionKey: string): Assumption | undefined {
  const text = assumptionText(id, optionKey);
  const question = findQuestion(id);
  if (!text || !question) return undefined;
  return { questionId: id, question: question.text, assumption: text };
}

// §3 — "Here's what we understood" section labels (chunk C). Plain,
// code-free headings for UnderstoodSummary; the values beside each are
// derived from the graph by graph-summary.ts / UnderstoodSummary.tsx, never
// computed here.
export const SUMMARY_LABELS = {
  destination: 'Where your information will go',
  dataClasses: 'The information it will use',
  behaviour: 'What it does and who sees it',
  decisions: 'What it helps decide',
  scaleAndCountries: 'How widely it’s used, and where',
  agentReach: 'What it can reach by itself',
  agentCoordination: 'Whether copies of it work together',
  assumptionsFormPath: 'Things we assumed because you weren’t sure',
  assumptionsDescriptionPath: 'Things we couldn’t tell from your description',
  detailsDisclosure: 'Show the details the rules use',
  changeAnswer: 'Change an answer',
} as const;

// Never-render rule (D-23): a platform or supplier without a plain_name gets
// this neutral label instead of the bare [FIRM] placeholder or a raw
// registry id.
export function neutralPlatformLabel(n: number): string {
  return `Your firm's AI service ${n}`;
}

export function neutralSupplierLabel(n: number): string {
  return `Supplier ${n}`;
}
