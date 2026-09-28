#!/usr/bin/env python3
"""Traceability check: every test case ID in test-cases/*.md must be proved
by a test that names it.

AIGate sells auditability, so "every obligation is traceable" is a product
claim, not a bookkeeping nicety. This makes the claim mechanical:

  1. Collect every TC-* id defined in test-cases/test-cases*.md, whether as a
     `### TC-...` heading (round 1-4 format) or a `| TC-... |` table row
     (round 5+ format).
  2. A case is TRACED when its id appears in at least one test file under
     src/ (a describe/it name or a comment naming it).
  3. Every `[Trace: <path> ...]` line must point at a file that exists.

Exit 1 if any case is untraced or any trace path is dangling. Cases that are
deliberately not built are listed in DEFERRED with the reason; they are
reported, never silently skipped.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Cases whose criterion describes something deliberately not built. Each needs
# a reason a reader can check. Empty is the goal.
DEFERRED: dict[str, str] = {}

ID = r"TC-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+"
HEADING = re.compile(r"^###\s+(" + ID + ")", re.M)
TABLE_ROW = re.compile(r"^\|\s*(" + ID + r")\s*\|", re.M)
TRACE_PATH = re.compile(r"^\[Trace:\s*([^\s\]—]+)", re.M)


def main() -> int:
    case_files = sorted((ROOT / "test-cases").glob("test-cases*.md"))
    defined: dict[str, str] = {}
    dangling: list[str] = []
    for f in case_files:
        text = f.read_text(encoding="utf-8")
        for m in list(HEADING.finditer(text)) + list(TABLE_ROW.finditer(text)):
            defined.setdefault(m.group(1), f.name)
        for m in TRACE_PATH.finditer(text):
            path = m.group(1).rstrip(",;:")
            if not (ROOT / path).exists():
                dangling.append(f"{f.name}: [Trace: {path}] — file does not exist")

    test_text = "\n".join(
        p.read_text(encoding="utf-8")
        for p in (ROOT / "src").rglob("*")
        if p.is_file() and re.search(r"\.test\.tsx?$", p.name)
    )

    untraced = []
    for tc, src in sorted(defined.items()):
        if tc in DEFERRED:
            continue
        # Boundary match so TC-PE-1-01 is not satisfied by TC-PE-1-010 or TC-PE-1-01a.
        if not re.search(re.escape(tc) + r"(?![A-Za-z0-9])", test_text):
            untraced.append(f"{tc}  ({src})")

    traced = len(defined) - len(untraced) - len(DEFERRED)
    print(f"trace-check: {len(defined)} test cases across {len(case_files)} files")
    print(f"  traced to a named test: {traced}")
    for tc, why in sorted(DEFERRED.items()):
        print(f"  DEFERRED {tc}: {why}")
    for u in untraced:
        print(f"  UNTRACED {u}")
    for d in dangling:
        print(f"  DANGLING {d}")
    if untraced or dangling:
        return 1
    print("trace-check: clean")
    return 0


if __name__ == "__main__":
    sys.exit(main())
