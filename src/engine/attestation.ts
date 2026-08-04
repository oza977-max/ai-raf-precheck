// Translation-fidelity attestation (NF-10).
// Rule 1 (cross-cutting.md §7): engine island — engine types and stdlib only.
//
// NF-10 owns the translation-fidelity gap: somebody named is responsible for
// verifying that the YAML activation conditions faithfully encode the
// board-approved prose RAF, and that verification expires. The block was
// validated on load and read by nobody — the UI carried a hardcoded
// "translation fidelity: unattested" banner instead. It happened to be true,
// because the shipped starter policy is unattested, and it would have gone on
// saying so after somebody attested.
//
// `today` is a parameter, not a clock read. The engine has no Date.now() and
// must not acquire one (NF-1, TC-R3-NF-1-02).
import type { TranslationAttestation } from './types';

/** NF-10's default validity period. The requirement calls it configurable;
 *  until a firm needs otherwise, twelve months is the stated default and is
 *  named here rather than buried as a literal. */
export const ATTESTATION_VALID_MONTHS = 12;

/** Same rule NF-7 applies to pack sign-offs (jurisdiction.ts:33): a field
 *  still carrying an authoring placeholder has not been filled in, and an
 *  un-dated sign-off is not a sign-off. */
const PLACEHOLDER = /\[[^\]]*\]/;

export type AttestationStatus = 'attested' | 'stale' | 'unattested';

export interface AttestationResult {
  status: AttestationStatus;
  /** Plain-English, for rendering. Says which of the three it is and why. */
  reason: string;
}

function parseDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(ms) ? null : ms;
}

/** The day the attestation expires: the attested day plus the validity period.
 *  Computed as a date rather than as a month count, because a month count
 *  cannot tell "twelve months exactly" from "twelve months and one day" — and
 *  that is precisely the boundary the test asks about. Day-of-month overflow
 *  (31 January + 1 month) settles to the end of the target month, which is the
 *  conservative direction: it expires sooner, never later. */
function expiryDay(fromISO: string, months: number): string {
  const [y, m, d] = fromISO.split('-').map(Number) as [number, number, number];
  const targetMonthIndex = m - 1 + months;
  const ty = y + Math.floor(targetMonthIndex / 12);
  const tm = (targetMonthIndex % 12) + 1;
  const lastDayOfTargetMonth = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  const td = Math.min(d, lastDayOfTargetMonth);
  return `${ty}-${String(tm).padStart(2, '0')}-${String(td).padStart(2, '0')}`;
}

export function translationAttestationStatus(
  attestation: TranslationAttestation,
  today: string,
): AttestationResult {
  const { attested_by, date, raf_version_checked } = attestation;

  if (
    PLACEHOLDER.test(attested_by ?? '') ||
    PLACEHOLDER.test(date ?? '') ||
    PLACEHOLDER.test(raf_version_checked ?? '')
  ) {
    return {
      status: 'unattested',
      reason:
        'The translation attestation is still an authoring placeholder — nobody has yet confirmed that these encoded rules match the board-approved RAF.',
    };
  }

  if (parseDay(date) === null || parseDay(today) === null) {
    // Absence of a readable date is not evidence of a recent check.
    return {
      status: 'unattested',
      reason: `The attestation carries no readable date (${date}), so it cannot be shown to be current.`,
    };
  }

  // String comparison is exact for ISO days and needs no clock.
  if (today > expiryDay(date, ATTESTATION_VALID_MONTHS)) {
    return {
      status: 'stale',
      reason: `The translation attestation was last checked on ${date}, more than ${ATTESTATION_VALID_MONTHS} months ago. It is out of date.`,
    };
  }

  return {
    status: 'attested',
    reason: `Attested by ${attested_by} on ${date} against ${raf_version_checked}.`,
  };
}
