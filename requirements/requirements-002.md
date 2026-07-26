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

---

*Elicitation in progress — further domains follow.*
