# Requirements Health Report — Acknowledged Decisions

Format: {issue-ID} | {requirement-ID} | {issue-type} | {disposition} | {date} | {assumption-for-tests}

HR-01 | UC-2 | Untestable — similarity threshold undefined | Acknowledge | 2026-06-04 | Tests use 0.80 as default threshold; one test for LLM-path and one for keyword fallback path
HR-02 | NF-5 | Untestable — hardware baseline undefined | Acknowledge | 2026-06-04 | Tests use development machine as baseline; "standard laptop" = MacBook Air M2 8GB
HR-03 | CF-1, PE-7 | Duplicate — near-identical policy file requirement | Acknowledge | 2026-06-04 | Tests written once, traced to both CF-1 and PE-7
HR-04 | PE-5, PE-6, RA-1, RA-2 | Duplicate — jurisdiction logic covered in two domains | Acknowledge | 2026-06-04 | Tests written once, traced to all four IDs
HR-07 | NF-3 | Missing — API key config UX not specified | Acknowledge | 2026-06-04 | Tests assume: key stored in localStorage, masked field, fallback to form on missing/invalid key
HR-08 | NF-2, VD-4 | Inconsistency — provisional audit trail vs absolute VD-4 claim | Acknowledge | 2026-06-04 | Tests verify application-layer immutability only (no delete/edit button); V1 verdicts labelled "Provisional audit trail"
HR-09 | RG-1 | Untestable — graph query latency undefined | Acknowledge | 2026-06-04 | Tests use 2-second target on register of 500 use cases
HR-10 | LC-6 | Missing — failure behaviour on AIGate self-assessment reject | Acknowledge | 2026-06-04 | Tests verify: self-assessment use case exists in register; Rejected verdict shows prominent warning to 2LoD role
