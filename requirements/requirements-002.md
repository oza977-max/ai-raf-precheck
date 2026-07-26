# AIGate — Requirements, Round 2

## V1.5 — The Server Tier

*Round 2 · 26 July 2026 · Status: in elicitation*

---

## Relationship to Previous Rounds

Round 1 (`requirements.md`) specified AIGate V1: a client-only, single-user
proof of concept whose job was to prove the appetite-as-code thesis. It was
built, tested (227 tests) and deployed as a public demo. Round 1 requirements
are **immutable** — they record what was actually built.

Round 2 specifies **V1.5**: the server tier that turns that proof of concept
into something more than one person can use at a time. It does not revisit
any Round 1 decision. It adds the infrastructure V1 deliberately deferred,
and it resolves four defects in the V1 design that only appear once a second
user exists.

**Round 2 IDs are prefixed `R2-`** and are independent of Round 1's sequence.
Where a Round 2 requirement supersedes Round 1 behaviour, it says so
explicitly and names the Round 1 ID.

### The four V1 defects that forced this round

Each was verified by reading the V1 source during elicitation, not asserted
from memory.

| # | Defect | Where | Why it only appears with two users |
|---|---|---|---|
| D-1 | Policy YAML is stored per browser | `src/store/policy-source.ts` | Two users can hold different rulebooks. NF-1 determinism holds inside one browser and silently stops holding across two. |
| D-2 | Audit ordering uses module-level state | `src/store/audit.ts` (`lastOccurredAtMs`) | Single-writer only. Concurrent writers break chronological readback — a flake with one writer, the normal case with several. |
| D-3 | `getRole()` is synchronous | `src/store/role.ts` | Server auth is asynchronous. The signature change ripples to every caller. |
| D-4 | Append-only relies on IndexedDB throwing | `src/store/audit.ts` (`db.add`) | A server-side upsert would silently destroy the append-only property with nothing failing. |

Three further V1 characteristics are in scope because they are unsafe once
shared: IDs are generated client-side in eight places; the duplicate-write
guard is a client-side `useRef` that protects one browser tab only; and the
Anthropic API key sits in `localStorage`.

---

## Expert Panel

| Expert | Work | Role in This Document |
|---|---|---|
| Karl Wiegers | *Software Requirements* (3rd ed.) | Requirement classification, MoSCoW prioritisation, ambiguity detection |
| Gause & Weinberg | *Exploring Requirements* | Context-free questioning, assumption surfacing, the "how would you know it was satisfied?" test on every requirement |
| Alan Cooper | *About Face* (4th ed.) | Personas — specifically the elastic-user problem, which bites hard in V1.5 because the platform admin never opens the application |
| Jeff Patton | *User Story Mapping* | Journey decomposition, now-versus-later slicing |
| Christensen / Moesta | *Competing Against Luck*, *Demand-Side Sales 101* | Job framing — V1.5's job is shared truth, not speed |
| Suzanne & James Robertson | *Mastering the Requirements Process* (3rd ed.) | **Activated.** Signals: authentication, sensitive data, third-party API, multi-platform deployment, compliance. Supplies the completeness categories and the fit-criterion discipline on every non-functional requirement. |

---

## 1. Purpose & Vision

**The job statement:**

> **When** I need risk colleagues to test AIGate against real use cases and
> trust what they are looking at, **I want** one shared, access-controlled
> instance whose register and audit trail everyone sees the same way, **so I
> can** produce evidence a committee will accept — rather than screenshots
> from my laptop and a different rulebook in every browser.

This is a materially different job from Round 1's. V1 existed to answer *"can
a machine reach the verdict a committee would reach, in minutes?"* V1.5
exists to answer *"can several people rely on the same answer, and can the
record of it survive scrutiny?"*

The distinction matters for prioritisation: a V1.5 requirement that does not
serve **shared truth** or **a record that survives scrutiny** is a Could at
best, whatever its other merits.

### What V1.5 is not

V1.5 does not make verdicts more correct. Correctness is a function of the
rulebook and is tested by back-testing, not by infrastructure. A shared
server that reproduces a wrong rulebook consistently is worse than a laptop
that reproduces it inconsistently, because it looks authoritative. Round 2
therefore inherits Round 1's honesty requirements unchanged (NF-2, NF-7) and
adds no claim of correctness.

---

## 2. Target Users

Round 1 had two personas and, in practice, one user. V1.5 has four, and the
fourth generates requirements nobody else does.

### Priya — Head of AI Governance (2LoD) · *also the operator*

Carried forward from Round 1, with a second hat. As **reviewer** she approves
or returns use cases and must be able to trust the audit trail to do so
honestly. As **operator** she runs the instance, owns the rulebook, and is
the only person who can change it.

- **End goal:** see every submission in one register and defend any decision
  in it months later.
- **Experience goal:** never wonder whether what she is looking at is
  complete.
- **Key frustration today:** every tester's results live in their own browser,
  so there is no register — only a collection of disconnected ones.

### James — AI Developer (1LoD)

Carried forward from Round 1, unchanged in intent. Submits use cases. Wants
nothing to do with infrastructure.

- **End goal:** find out whether his idea is in appetite before writing a
  paper about it.
- **Experience goal:** log in and get on with it; never think about storage.
- **Key frustration today:** he cannot show anyone his result except by
  sharing his screen.

### The reviewer's counterpart — a second 2LoD approver

Distinct from Priya because segregation of duties requires that the person
who submits and the person who approves are not the same, and V1's role
dropdown made that unenforceable.

- **End goal:** approve only what he has genuinely reviewed.
- **Key frustration today:** anyone can select "2LoD" from a dropdown, so an
  approval carries no assurance about who gave it.

### Sam — platform administrator (bank IT) · **new in Round 2**

**Never opens the application.** Deploys the container, wires it to the
identity provider, and is accountable for it running. Generates a set of
requirements — configuration, secrets handling, logs, backup, upgrade — that
no other persona produces, and which projects routinely discover only at
deployment.

- **End goal:** deploy it, connect it to the corporate IdP, back it up, and
  never think about it again.
- **Experience goal:** confidence that it does not phone home, and that he can
  see what it is doing when it misbehaves.
- **Key frustration:** applications that assume they will be run by their
  developers.

---

## 3. User Journeys

### Journey 1 — James submits, on a shared instance

James opens the instance URL, is redirected to sign in, and authenticates. He
submits a use case exactly as in V1 — the intake flow is unchanged. On
submission, his entry appears in **the** register, not *his* register. His
role comes from the session, so he cannot approve his own submission.

### Journey 2 — Priya reviews, and trusts the trail

Priya signs in and sees every submission, not only her own. She opens a
pre-checked case and reads its audit trail. The trail is ordered correctly
even though three people submitted within the same second, and it is held
somewhere she cannot edit through her own browser. She approves, and the
approval records **who she is** rather than what she selected.

### Journey 3 — Priya changes the rulebook

Priya edits the appetite. The change creates a new immutable policy version,
recorded in the audit trail with her identity and the time. Everyone's next
verdict uses the new version; existing cases are flagged for re-evaluation.
No other user can make this change.

### Journey 4 — Sam deploys it · *the journey V1 never had*

Sam receives a container image and a configuration reference. He supplies
database location, session secret, identity-provider details, and (optionally)
an Anthropic API key. He starts it, confirms a health endpoint reports
healthy, connects it to the corporate IdP, and schedules a backup of a single
file. He never creates an account in the application and never sees a use
case.

---

## 4. Functional Requirements

### R2-DI — Shared Store & Data Integrity

The heart of Round 2. Every defect in the table above lands here. The
governing constraint is that the store must become shared and durable
**without changing what a verdict says** — the engine stays a pure island
(Round 1 NF-1) and the adapter must be invisible to it.

**R2-DI-1 (Must):** Persistence shall be reached through a storage adapter
interface with at least two interchangeable implementations — a browser-local
implementation and a server-backed implementation — selected by configuration
at startup, with no change to calling code.

> Fit criterion: The same application build runs against either adapter with
> no source change. The existing Round 1 test suite (227 tests) passes
> unmodified against the browser-local adapter. A single configuration value
> switches to the server adapter. No file outside the adapter implementations
> imports a storage library directly — verifiable by grepping for the storage
> library import and finding it in the adapter module only.

**R2-DI-2 (Must):** The server-backed implementation shall persist to a
single-file embedded database requiring no separate database server.

> Fit criterion: A fresh deployment requires no database installation,
> provisioning or connection string beyond a filesystem path. Backup is a copy
> of one file taken while the service is running, and restoring that file to a
> new instance reproduces the register and audit trail exactly.

**R2-DI-3 (Must):** *(resolves D-2)* Audit event ordering shall be
established by a server-assigned, strictly increasing sequence number.
`occurred_at` becomes descriptive metadata and shall not be used as a sort
key.

> Fit criterion: A concurrency test writes events from at least three
> simultaneous clients within the same millisecond. Read-back returns them in
> the order the server accepted them, with sequence numbers strictly
> increasing and containing no duplicates. Removing the client's clock from
> the equation entirely — including setting a client clock to a wrong time —
> does not change read-back order.

**R2-DI-4 (Must):** *(resolves D-4)* The append-only property of the audit
trail shall be enforced by a database-level uniqueness constraint that
rejects a duplicate event identifier. Update and delete operations on audit
events shall not exist in the server's interface.

> Fit criterion: Submitting an event whose identifier already exists returns
> an explicit rejection and writes nothing; it does not overwrite. No code
> path in the server can modify or remove an existing audit row — verifiable
> by inspection: the audit table is written by exactly one INSERT statement
> and no UPDATE or DELETE statement references it.

**R2-DI-5 (Must):** Write operations shall be idempotent under retry, so that
a duplicated request — from a double-click, a component re-mount, a browser
tab duplicate, or a network retry after timeout — records the action once.

> Fit criterion: Issuing the identical write request twice produces exactly
> one audit event and one register change. This is verified by test for each
> write path, not by relying on client-side guards. Round 1's client-side
> `useRef` guard protected a single browser tab; it is necessary but no longer
> sufficient and is not the mechanism relied upon here.

**R2-DI-6 (Must):** The server shall be the authority for the identity of any
record it stores, and shall not accept a client-supplied identifier for an
audit event.

> Fit criterion: A client that supplies an arbitrary or colliding audit event
> identifier cannot cause an existing record to be replaced or a chosen
> identifier to be adopted. Round 1 generates identifiers client-side in eight
> locations; each is either moved server-side or explicitly documented as
> safe because the value is not an integrity boundary.

**R2-DI-7 (Must):** All users of an instance shall see one register. What a
given user may see within it is determined by their authenticated role, not
by which browser they used.

> Fit criterion: Two users signing in from different machines see the same
> register contents for their role. A submission made by one appears for the
> other (subject to role visibility rules) without any export or import step.

**R2-DI-8 (Must):** Switching storage implementation shall not change any
verdict.

> Fit criterion: The same use case evaluated against the same policy version
> produces a byte-identical verdict under both adapters. The engine's purity
> constraint (Round 1 NF-1) is unaffected: no adapter code, network call or
> server type is reachable from the engine's call graph.

**R2-DI-9 (Should):** A browser-local mode requiring no server shall remain
available, so the application can be demonstrated without provisioning
accounts or infrastructure.

> Fit criterion: The public demo build continues to run entirely in the
> browser with no backend. It is visibly labelled as demo mode, and its data
> is never presented as, nor capable of being confused with, an instance
> register.

**R2-DI-10 (Should):** Each audit event shall carry a hash of its own
content combined with the hash of the preceding event, forming a chain, and
the server shall expose the current head hash for independent recording.

> Fit criterion: Altering, inserting or removing any stored audit event
> without recomputing every subsequent hash is detectable by a verification
> routine that walks the chain and reports the first index at which it
> breaks. The routine is runnable on demand and its result is reproducible.
> A head hash recorded externally at time T and re-checked later proves no
> event at or before T was altered.
>
> **Deliberately scoped as detection, not prevention.** A chain catches
> accidental corruption, a restore from the wrong backup, and a partial edit
> by someone who does not recompute. It does NOT defeat an administrator with
> database access who recomputes the whole chain. This is included in Round 2
> only because it cannot be retrofitted — events written without a chain can
> never be chained afterwards — not because it closes the threat.

**R2-DI-11 (Must):** The interface shall describe the audit trail's integrity
properties accurately and shall not claim tamper-proofing, immutability, or
evidential weight it does not possess.

> Fit criterion: Wording referring to the audit trail is checked against what
> is actually implemented. With R2-DI-10 built, "tamper-detecting" is
> permitted and "tamper-proof" is not. If R2-DI-10 is dropped, neither is
> permitted. This inherits Round 1 NF-2 and is the reason R2-DI-10 is
> scoped honestly rather than sold as more than it is.

**R2-DI-12 (Won't — V2):** External anchoring of the audit chain — publishing
the head hash to a store outside the operator's control (a third-party
timestamping service, an append-only log, or a counterparty).

> Fit criterion: Not built in Round 2. This is the step that converts
> detection into evidence against a privileged insider, and it requires a
> decision about where the anchor lives that is premature before the product
> has been back-tested.

### R2-IA — Identity & Access

Round 1's role was a dropdown: any user could select "2LoD" and approve
anything. That made every approval evidentially worthless — it recorded a
choice, not a person. This domain replaces it, and must do so twice over,
because the two deployment targets authenticate differently.

**R2-IA-1 (Must):** The same build shall support at least two authentication
mechanisms — locally-held accounts and an external identity provider —
selected by configuration, with no code change between them.

> Fit criterion: One container image runs in both modes. Switching is a
> configuration change and a restart. The application's own code does not
> branch on deployment target anywhere outside the authentication module —
> verifiable by inspection.

**R2-IA-2 (Must):** *(resolves D-3)* A user's role shall be derived from
their authenticated session on the server and shall not be settable by the
client.

> Fit criterion: A user cannot change their own role by any client-side
> means — editing browser storage, altering a request payload, or replaying a
> modified request. A request asserting a role the session does not hold is
> rejected by the server, not merely hidden in the interface. The Round 1
> role dropdown is removed, not disabled.

**R2-IA-3 (Must):** The system shall prevent a user from approving a use case
they submitted, unless the operator has explicitly enabled single-reviewer
operation for the instance.

> Fit criterion: By default an approval attempt by the submitting user is
> rejected by the server with an explicit reason, testable independently of
> the interface. Enabling self-approval is a deliberate operator
> configuration act, never an automatic fallback the system takes when it
> finds no second reviewer.

**R2-IA-3a (Must):** Where self-approval has been enabled, every approval
given by the submitter shall be recorded and displayed as such, and shall
never be presented as equivalent to an independent review.

> Fit criterion: A self-approved case is distinguishable from an
> independently reviewed one in the register, on the case itself, in the
> audit trail, and in any export — without needing to compare the submitter
> and approver fields by eye. The instance also states that single-reviewer
> operation is in force. This applies Round 1's NF-7 pattern (unsigned pack
> rules make a verdict provisional rather than blocking it) to segregation
> of duties: the weaker state is permitted, but it is never allowed to look
> like the stronger one.

**R2-IA-4 (Must):** Every recorded action shall attribute to an authenticated
identity that persists after the session ends.

> Fit criterion: Audit events carry a stable user identifier and the display
> name in force at the time. Deleting or disabling a user account does not
> remove or anonymise their historical audit entries. An approval read back
> six months later still names who gave it.

**R2-IA-5 (Must):** Sessions shall expire, and expiry shall not cause silent
data loss.

> Fit criterion: A session has a bounded lifetime and can be ended
> deliberately by the user. A request made with an expired session is
> rejected and the user is returned to sign-in with an explanation. Work in
> progress that has not been submitted is either preserved or the user is
> warned before it is lost — it is not discarded without notice.

**R2-IA-6 (Must):** Locally-held account credentials shall never be stored or
logged in a recoverable form.

> Fit criterion: Stored credentials are verified against a salted,
> computationally-expensive one-way hash. No credential appears in any log,
> error message, backup, or diagnostic output — verifiable by searching all
> output streams during an authentication test. The database file, if read
> directly, does not yield a usable credential.

**R2-IA-7 (Should):** Repeated failed authentication attempts shall be
throttled.

> Fit criterion: After a defined number of consecutive failures for an
> account, further attempts are delayed or refused for a defined period, and
> the event is recorded. The threshold and period are configurable by the
> operator, not hard-coded.

**R2-IA-8 (Must):** Provisioning and de-provisioning of users shall be
possible without database surgery.

> Fit criterion: An operator (local mode) or the identity provider (external
> mode) can add, disable and change the role of a user through a supported
> path. Disabling a user prevents sign-in immediately and does not alter
> their audit history (per R2-IA-4).

**R2-IA-9 (Won't — V2):** Self-service registration, group-based role
mapping, and automated user synchronisation.

> Fit criterion: Not built in Round 2. A pilot of a handful of named testers
> does not need them, and in a bank deployment the identity provider owns
> this. Named explicitly so it is not mistaken for an oversight.

### R2-PG — Policy Governance

Resolves D-1. In Round 1 the rulebook lived in each user's browser, so
determinism — the product's headline property — held within one browser and
silently stopped holding across two. The rulebook must become a single,
versioned, controlled artefact.

**R2-PG-1 (Must):** *(resolves D-1)* An instance shall have exactly one
active policy, held on the server, used by every user.

> Fit criterion: Two users evaluating the same use case at the same moment
> use the same policy version and obtain the same verdict. No client-side
> store can override, shadow or stale-cache the active policy. Round 1's
> per-browser policy storage is removed in server mode.

**R2-PG-2 (Must):** Only a user holding the operator role shall be able to
change the active policy.

> Fit criterion: A non-operator attempting to change the policy is refused by
> the server, not merely prevented in the interface. The refusal is testable
> by request, independent of the UI.

**R2-PG-3 (Must):** Every policy change shall produce a new immutable version
and an audit event naming the authenticated user and the time.

> Fit criterion: Policy versions are retained, not overwritten. Any historical
> version can be retrieved and compared against the one that replaced it. The
> audit event records who made the change; it cannot be attributed to
> "system" or left blank.

**R2-PG-4 (Must):** Every verdict shall record the exact policy version used
to produce it, and that version shall remain retrievable for as long as the
verdict is retained.

> Fit criterion: A verdict from six months ago can be re-evaluated against the
> policy version actually in force at the time, reproducing the original
> result byte-for-byte. This carries forward Round 1's provenance behaviour
> and adds the guarantee that the referenced version still exists.

**R2-PG-5 (Must):** When the active policy changes, existing use cases shall
be flagged for re-evaluation rather than silently re-scored or silently left
stale.

> Fit criterion: After a policy change, affected cases display as awaiting
> re-evaluation. Their recorded verdicts are not altered in place, and the
> register does not present a stale verdict as current without a marker.

**R2-PG-6 (Won't — V2):** Four-eyes approval of policy changes, and staged
promotion of a draft policy through review before it becomes active.

> Fit criterion: Not built in Round 2. The rulebook is a control document and
> in a production bank deployment its change process would itself need
> approval. Round 2 makes changes attributable and reversible, which is the
> prerequisite; it does not add a workflow. Named explicitly so its absence
> is a recorded decision rather than an oversight.

---

### R2-LP — Language Model Proxy

The Anthropic key currently sits in browser storage, readable by anyone with
access to that browser. It moves server-side. This is also the first time the
language-model path will run against the real API — in Round 1 it was only
ever exercised against a mock, so its real behaviour, failure modes and cost
are unknown.

**R2-LP-1 (Must):** The language-model API key shall be held only by the
server and shall never be transmitted to, or stored by, a browser.

> Fit criterion: No response from the server contains the key, and no client
> storage holds it. Inspecting all network traffic to a browser during a full
> intake including model use reveals no credential. Round 1's browser key
> field is removed in server mode.

**R2-LP-2 (Must):** Model calls shall be made by the server on behalf of an
authenticated user, and shall be refused for an unauthenticated caller.

> Fit criterion: The proxy endpoint rejects unauthenticated requests. It
> cannot be used as an open relay to the model provider by anyone who
> discovers the URL.

**R2-LP-3 (Must):** No language model shall participate in producing a
verdict.

> Fit criterion: Carried forward from Round 1 unchanged and re-verified here
> because the proxy makes model access easier. With the model provider
> unreachable, every verdict is still produced and is identical to the
> verdict produced with it reachable. The engine's call graph contains no
> model client.

**R2-LP-4 (Must):** Failure or unavailability of the model provider shall
degrade the application to its deterministic path, not break it.

> Fit criterion: With the provider returning errors, timing out, or not
> configured at all, a user can complete an intake and obtain a verdict via
> guided questions. The failure is reported plainly and is not presented as a
> defect in the use case being assessed.

**R2-LP-5 (Should):** The operator shall be able to see model usage and
disable model features for the instance.

> Fit criterion: The operator can determine how many model calls have been
> made over a period, and can turn the feature off such that the application
> continues to function on its deterministic path. Cost is not knowable
> precisely without provider billing, so the requirement is usage visibility,
> not a currency figure.

**R2-LP-6 (Must):** Content sent to the model provider shall be limited to
what the feature requires, and the operator shall be told plainly what leaves
the instance.

> Fit criterion: Documentation states exactly which fields are transmitted for
> each model-backed feature. A use-case description sent for extraction does
> not carry register contents, audit history, user identity, or credentials
> alongside it.

---

### R2-DE — Deployment & Operation

Sam's domain. Everything here is invisible to every other persona, and it is
the set most often discovered at deployment rather than at design.

**R2-DE-1 (Must):** One build artefact shall serve both deployment targets,
with behaviour determined by configuration rather than by a separate build.

> Fit criterion: The same image runs the self-hosted pilot (local accounts)
> and a bank deployment (external identity provider). There is no
> "pilot build" and "enterprise build".

**R2-DE-2 (Must):** All deployment-time settings shall be supplied as
configuration, with a complete reference listing every setting, whether it is
required, and its default.

> Fit criterion: An administrator who has never seen the source can deploy the
> application using the reference alone. Every setting the application reads
> appears in the reference — verifiable by comparing the reference against the
> configuration the application actually consults.

**R2-DE-3 (Must):** Secrets shall be supplied as configuration and shall never
appear in logs, error output, diagnostic pages, or the database in recoverable
form.

> Fit criterion: A deliberate misconfiguration and a forced error are both
> triggered while capturing all output; no secret value appears in any of it.

**R2-DE-4 (Must):** The application shall expose a health endpoint reporting
whether it is able to serve requests.

> Fit criterion: The endpoint returns a healthy result only when the
> application can reach its database. It requires no authentication, and
> reveals no configuration, version detail or internal state beyond
> health.

**R2-DE-5 (Must):** Backup and restore shall be documented and shall not
require the application to be stopped.

> Fit criterion: An administrator following the documented procedure produces
> a backup of a running instance, restores it to a new instance, and finds the
> register, audit trail, users and policy versions intact. The restored audit
> chain verifies (per R2-DI-10).

**R2-DE-6 (Must):** Upgrading to a newer version shall migrate existing data
without loss, and shall fail safely rather than partially.

> Fit criterion: Starting a newer version against an existing database
> migrates it and preserves all records. If migration cannot complete, the
> application refuses to start and leaves the database unmodified, rather
> than starting with partially-migrated data.

**R2-DE-7 (Must):** The application shall make no outbound network connection
other than to services the operator has explicitly configured.

> Fit criterion: With the model provider unconfigured, an instance under
> normal use makes no outbound connections — verifiable by network capture.
> There is no telemetry, update check, or analytics call. This matters because
> a bank will ask, and the answer must be demonstrable rather than asserted.

**R2-DE-8 (Should):** Operational output shall be sufficient to diagnose a
failure without access to the database or the source.

> Fit criterion: Logs are written to standard output in a consistent
> structured form, include enough context to identify the request and user
> (by identifier, not credential), and record authentication failures, policy
> changes and migration events.

---

## 5. Non-Functional Requirements

Volere categories, each with a fit criterion. Where Round 1 already stated a
property, Round 2 restates it only if the server tier could break it.

**R2-NF-1 (Must):** An instance shall support the concurrent use of a pilot
population without degradation.

> Fit criterion: 20 concurrent authenticated users, each performing a full
> intake and evaluation, complete successfully with no failed writes and no
> audit-ordering violation. 20 is the stated pilot ceiling; it is a
> requirement, not a limit of the design.

**R2-NF-2 (Must):** Evaluation shall remain interactive.

> Fit criterion: The time from submitting a confirmed graph to a rendered
> verdict is under 2 seconds at the 95th percentile under the concurrency of
> R2-NF-1, excluding any optional model call. Model-backed features are
> excluded because they depend on a third party.

**R2-NF-3 (Must):** *(carries forward Round 1 NF-1)* Evaluation shall remain
deterministic, and the server tier shall not introduce any source of
variation.

> Fit criterion: Round 1's determinism test — the same input evaluated
> repeatedly, compared over the whole serialised result — passes unchanged.
> The engine acquires no clock, no random source, no network call and no
> server type. Verified by inspecting the engine's import graph, which must
> reach only engine types and the standard library.

**R2-NF-4 (Must):** *(carries forward Round 1 NF-2)* The interface shall not
claim properties the system does not have.

> Fit criterion: Claims about the audit trail, control verification, pack
> adoption and translation fidelity are each checked against implementation.
> Specifically: "tamper-detecting" only if R2-DI-10 is built; "verified" on a
> control only where evidence exists; "provisional" wherever an unsigned pack
> rule fired. A reviewer can trace each claim to the mechanism that makes it
> true.

**R2-NF-5 (Must):** Traffic between browser and server shall be encrypted in
transit, and the application shall not be operable over an unencrypted
connection outside local development.

> Fit criterion: Session cookies are marked secure and http-only. An attempt
> to use the application over an unencrypted connection in a non-development
> configuration is refused rather than silently downgraded.

**R2-NF-6 (Must):** The stored database shall be protected at rest by the
deployment environment, and the application shall document what it does and
does not protect.

> Fit criterion: Documentation states plainly that the application relies on
> filesystem and volume protection for encryption at rest and does not encrypt
> its own database file. This is stated rather than implied, so an
> administrator can apply the controls their environment requires. Overstating
> this would breach R2-NF-4.

**R2-NF-7 (Must):** The Round 1 test suite shall continue to pass unmodified
against the browser-local adapter.

> Fit criterion: All 227 Round 1 tests pass with no change to their source.
> Any test that must change is treated as evidence that a Round 1 behaviour
> was altered, and that alteration is recorded explicitly rather than absorbed
> into a test edit.

**R2-NF-8 (Should):** An instance shall be recoverable from backup within a
working day, by an administrator following documentation alone.

> Fit criterion: A restore rehearsal performed by someone who did not build
> the system, using only the documentation, produces a working instance with
> its register, audit trail, users and policy history intact.

**R2-NF-9 (Should):** Resource requirements shall be modest enough for a
small virtual machine, and shall be documented.

> Fit criterion: Documented memory, CPU and disk expectations for the pilot
> population of R2-NF-1, measured rather than estimated.

**R2-NF-10 (Must):** *(carries forward Round 1 NF-3 in altered form)* The
application shall not require any service the operator has not chosen.

> Fit criterion: No managed database, message broker, cache, identity service
> or observability platform is required. The only mandatory dependency is a
> filesystem. Round 1's "no backend at all" property is superseded in server
> mode but survives in demo mode per R2-DI-9.

---

## 6. Assumptions

Stated so that a wrong assumption fails visibly rather than silently.

1. **The pilot population is small** — of the order of 20 users, not 200. All
   capacity and concurrency requirements are sized to that.
2. **No real client or bank data reaches the self-hosted instance.** Testing
   uses reconstructed or synthetic use cases. This is an operating
   instruction, and R2-CN-3 below turns it into a constraint.
3. **The bank deployment's identity provider speaks a standard protocol.** If
   it does not, the external-authentication requirement is not satisfiable as
   written.
4. **The operator and the reviewer may be the same person during the pilot.**
   This is why R2-IA-3 permits single-reviewer operation rather than assuming
   two people exist.
5. **The rulebook remains unadopted during Round 2.** Verdicts stay
   provisional. Nothing in Round 2 changes the adoption state of the appetite
   or the packs.
6. **The audit trail is not yet evidence against a privileged insider.** Round
   2 moves it off the user's browser and adds detection; it does not defeat an
   administrator with database access.

---

## 7. Constraints

**R2-CN-1:** The evaluation engine's purity is not negotiable. No requirement
in Round 2 may cause the engine to perform input or output, read a clock, or
depend on a server type.

**R2-CN-2:** One build artefact serves both deployment targets. A requirement
that can only be met by forking the build is out of scope by construction.

**R2-CN-3:** The self-hosted instance is not approved for real client,
personal or price-sensitive data, and the application shall state this on the
instance itself.

> Fit criterion: The self-hosted deployment displays its data-classification
> limit to every signed-in user. The statement is configurable, because a bank
> deployment's limit differs from the pilot's.

**R2-CN-4:** The people available to build this are the same as for Round 1 —
one practitioner working with an assistant. Requirements are sized
accordingly; anything needing a specialist team is Won't.

---

## 8. Out of Scope

Explicitly excluded from Round 2. Distinct from "Won't (V2)" items, which are
deferred rather than rejected.

- **Artifact binding** — reading deployment configuration to verify what a
  system actually does, rather than believing its description. This is the
  single largest credibility gain available and it is deliberately *not* here:
  it is a body of work in its own right and depends on decisions Round 2 does
  not need to make.
- **Live monitoring against standing conditions.** The verdict records the
  bounds an approval assumes; nothing checks them at runtime. Round 1 designed
  the data model for this; Round 2 does not populate it.
- **Multi-tenancy.** One instance serves one organisation. No requirement
  assumes tenant isolation.
- **Migration of Round 1 browser data into a server instance.** Decided during
  elicitation: the server starts clean. Browser data was never evidence-grade,
  and importing it would launder proof-of-concept records into a system of
  record.
- **Mobile-specific interfaces.** The application remains desktop-oriented.

---

## 9. Open Questions

Unresolved. Each names who must resolve it, because an open question with no
owner is a defect in waiting.

**Q-1 — Audit retention versus the right to erasure.** R2-IA-4 requires that
disabling a user does not anonymise their historical audit entries, because an
approval must remain attributable. This sits against a data-subject erasure
request. Banks routinely resolve this (audit records carry a lawful basis for
retention), but the resolution is a legal determination, not an engineering
one. **Owner: Legal / Data Protection.** Until resolved, the requirement
stands as written and the tension is recorded here rather than hidden.

**Q-2 — Where an external anchor for the audit chain would live.** R2-DI-12
defers this. Resolving it needs a decision about which third party or internal
system is trusted to hold the head hash. **Owner: the operator, with Technology
Risk.** Not needed before back-testing.

**Q-3 — Session lifetime.** R2-IA-5 requires expiry but does not set a
duration. A pilot and a bank deployment would choose differently. **Owner: the
operator, per instance** — which is why it is configuration, not a constant.

**Q-4 — Whether model-backed features are acceptable at all in a bank
deployment.** R2-LP-6 requires disclosure of what leaves the instance; whether
that is permitted is a separate determination. **Owner: the bank's Technology
Risk and Data Protection functions.** The application supports the feature
being off entirely (R2-LP-5), so this does not block deployment.

**Q-5 — Whether the back-test outcome changes any of this.** Round 2 assumes
the appetite-as-code thesis holds. It has not been tested against historically
decided cases. If back-testing shows verdicts need constant override, the
correct action is not to build this round. **Owner: the practitioner.**

---

## 11. Requirements Index

52 requirements. Generated from the requirement entries above.

| ID | Domain | Summary | Priority |
|---|---|---|---|
| `R2-DI-1` | Shared Store & Data Integrity | Persistence shall be reached through a storage adapter interface with at least two interchangeable… | **Must** |
| `R2-DI-2` | Shared Store & Data Integrity | The server-backed implementation shall persist to a single-file embedded database requiring no separate… | **Must** |
| `R2-DI-3` | Shared Store & Data Integrity | Audit event ordering shall be established by a server-assigned, strictly increasing sequence number.… | **Must** |
| `R2-DI-4` | Shared Store & Data Integrity | The append-only property of the audit trail shall be enforced by a database-level uniqueness constraint that… | **Must** |
| `R2-DI-5` | Shared Store & Data Integrity | Write operations shall be idempotent under retry, so that a duplicated request — from a double-click, a… | **Must** |
| `R2-DI-6` | Shared Store & Data Integrity | The server shall be the authority for the identity of any record it stores, and shall not accept a… | **Must** |
| `R2-DI-7` | Shared Store & Data Integrity | All users of an instance shall see one register. What a given user may see within it is determined by their… | **Must** |
| `R2-DI-8` | Shared Store & Data Integrity | Switching storage implementation shall not change any verdict. | **Must** |
| `R2-DI-9` | Shared Store & Data Integrity | A browser-local mode requiring no server shall remain available, so the application can be demonstrated without… | **Should** |
| `R2-DI-10` | Shared Store & Data Integrity | Each audit event shall carry a hash of its own content combined with the hash of the preceding event, forming a… | **Should** |
| `R2-DI-11` | Shared Store & Data Integrity | The interface shall describe the audit trail's integrity properties accurately and shall not claim… | **Must** |
| `R2-DI-12` | Shared Store & Data Integrity | External anchoring of the audit chain — publishing the head hash to a store outside the operator's control (a… | **Won't (V2)** |
| `R2-IA-1` | Identity & Access | The same build shall support at least two authentication mechanisms — locally-held accounts and an external… | **Must** |
| `R2-IA-2` | Identity & Access | A user's role shall be derived from their authenticated session on the server and shall not be settable by the… | **Must** |
| `R2-IA-3` | Identity & Access | The system shall prevent a user from approving a use case they submitted, unless the operator has explicitly… | **Must** |
| `R2-IA-3a` | Identity & Access | Where self-approval has been enabled, every approval given by the submitter shall be recorded and displayed as… | **Must** |
| `R2-IA-4` | Identity & Access | Every recorded action shall attribute to an authenticated identity that persists after the session ends. | **Must** |
| `R2-IA-5` | Identity & Access | Sessions shall expire, and expiry shall not cause silent data loss. | **Must** |
| `R2-IA-6` | Identity & Access | Locally-held account credentials shall never be stored or logged in a recoverable form. | **Must** |
| `R2-IA-7` | Identity & Access | Repeated failed authentication attempts shall be throttled. | **Should** |
| `R2-IA-8` | Identity & Access | Provisioning and de-provisioning of users shall be possible without database surgery. | **Must** |
| `R2-IA-9` | Identity & Access | Self-service registration, group-based role mapping, and automated user synchronisation. | **Won't (V2)** |
| `R2-PG-1` | Policy Governance | An instance shall have exactly one active policy, held on the server, used by every user. | **Must** |
| `R2-PG-2` | Policy Governance | Only a user holding the operator role shall be able to change the active policy. | **Must** |
| `R2-PG-3` | Policy Governance | Every policy change shall produce a new immutable version and an audit event naming the authenticated user and… | **Must** |
| `R2-PG-4` | Policy Governance | Every verdict shall record the exact policy version used to produce it, and that version shall remain… | **Must** |
| `R2-PG-5` | Policy Governance | When the active policy changes, existing use cases shall be flagged for re-evaluation rather than silently… | **Must** |
| `R2-PG-6` | Policy Governance | Four-eyes approval of policy changes, and staged promotion of a draft policy through review before it becomes… | **Won't (V2)** |
| `R2-LP-1` | Language Model Proxy | The language-model API key shall be held only by the server and shall never be transmitted to, or stored by, a… | **Must** |
| `R2-LP-2` | Language Model Proxy | Model calls shall be made by the server on behalf of an authenticated user, and shall be refused for an… | **Must** |
| `R2-LP-3` | Language Model Proxy | No language model shall participate in producing a verdict. | **Must** |
| `R2-LP-4` | Language Model Proxy | Failure or unavailability of the model provider shall degrade the application to its deterministic path, not… | **Must** |
| `R2-LP-5` | Language Model Proxy | The operator shall be able to see model usage and disable model features for the instance. | **Should** |
| `R2-LP-6` | Language Model Proxy | Content sent to the model provider shall be limited to what the feature requires, and the operator shall be… | **Must** |
| `R2-DE-1` | Deployment & Operation | One build artefact shall serve both deployment targets, with behaviour determined by configuration rather than… | **Must** |
| `R2-DE-2` | Deployment & Operation | All deployment-time settings shall be supplied as configuration, with a complete reference listing every… | **Must** |
| `R2-DE-3` | Deployment & Operation | Secrets shall be supplied as configuration and shall never appear in logs, error output, diagnostic pages, or… | **Must** |
| `R2-DE-4` | Deployment & Operation | The application shall expose a health endpoint reporting whether it is able to serve requests. | **Must** |
| `R2-DE-5` | Deployment & Operation | Backup and restore shall be documented and shall not require the application to be stopped. | **Must** |
| `R2-DE-6` | Deployment & Operation | Upgrading to a newer version shall migrate existing data without loss, and shall fail safely rather than partially. | **Must** |
| `R2-DE-7` | Deployment & Operation | The application shall make no outbound network connection other than to services the operator has explicitly… | **Must** |
| `R2-DE-8` | Deployment & Operation | Operational output shall be sufficient to diagnose a failure without access to the database or the source. | **Should** |
| `R2-NF-1` | Non-Functional | An instance shall support the concurrent use of a pilot population without degradation. | **Must** |
| `R2-NF-2` | Non-Functional | Evaluation shall remain interactive. | **Must** |
| `R2-NF-3` | Non-Functional | (carries forward Round 1 NF-1) Evaluation shall remain deterministic, and the server tier shall not introduce… | **Must** |
| `R2-NF-4` | Non-Functional | (carries forward Round 1 NF-2) The interface shall not claim properties the system does not have. | **Must** |
| `R2-NF-5` | Non-Functional | Traffic between browser and server shall be encrypted in transit, and the application shall not be operable… | **Must** |
| `R2-NF-6` | Non-Functional | The stored database shall be protected at rest by the deployment environment, and the application shall… | **Must** |
| `R2-NF-7` | Non-Functional | The Round 1 test suite shall continue to pass unmodified against the browser-local adapter. | **Must** |
| `R2-NF-8` | Non-Functional | An instance shall be recoverable from backup within a working day, by an administrator following documentation… | **Should** |
| `R2-NF-9` | Non-Functional | Resource requirements shall be modest enough for a small virtual machine, and shall be documented. | **Should** |
| `R2-NF-10` | Non-Functional | (carries forward Round 1 NF-3 in altered form) The application shall not require any service the operator has… | **Must** |

| Priority | Count |
|---|---|
| Must | 42 |
| Should | 7 |
| Won't (V2) | 3 |
---

## 12. Priority Model

| Priority | Meaning |
|---|---|
| **Must** | V1.5 fails its purpose without it. A shared instance that lacks any Must is not deployable to testers. |
| **Should** | High value, included unless it prevents delivery. |
| **Could** | Included only if every Must and Should is complete. |
| **Won't (V2)** | Explicitly deferred, with the reason recorded. Not a rejection — a scheduling decision captured so its absence is deliberate. |

The prioritisation rule from §1 applies throughout: a requirement that serves
neither **shared truth** nor **a record that survives scrutiny** is a Could at
best, whatever its other merits.

---

*Developed using the Grounded Vibe Methodology*
