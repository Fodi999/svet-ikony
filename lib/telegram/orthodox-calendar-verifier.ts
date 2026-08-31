/**
 * Deterministic, programmatic pre-publish verification for autopost
 * content that asserts a specific saint/commemoration for a specific day
 * (currently: saint_of_day -- see content-format.ts's
 * CONTENT_TYPES_REQUIRING_CALENDAR_VERIFICATION). D1 alone is never
 * treated as sufficient: church_calendar_days/church_saints can contain a
 * wrong entry (this module exists because exactly that happened -- a real
 * production row claimed "Кипріан Карфагенський" for old-style August 18,
 * which two independent sources actually attribute to Martyrs Florus and
 * Laurus -- see orthodox-calendar-sources.ts), so every saint_of_day claim
 * is cross-checked against a curated reference dataset before OpenAI or
 * Telegram are ever called.
 *
 * Deliberately NOT an AI/LLM call: verification must be programmatic and
 * deterministic; AI is used only AFTER verification, to write the text.
 */
import { lookupSourceA, lookupSourceB, type ReferenceSourceEntry, type VerifiedCommemoration } from './orthodox-calendar-sources';

export type { VerifiedCommemoration } from './orthodox-calendar-sources';

export type VerificationReason =
  | 'consensus_confirmed'
  | 'no_reference_data'
  | 'insufficient_sources'
  | 'sources_disagree'
  | 'candidate_name_mismatch'
  | 'source_unavailable';

export type VerificationResult = {
  verified: boolean;
  civilDate: string;
  julianDate: string;
  commemorations: VerifiedCommemoration[];
  sources: string[];
  reason: VerificationReason;
};

function oldStyleMonthDay(julianDateIso: string): string {
  return julianDateIso.slice(5); // 'YYYY-MM-DD' -> 'MM-DD'
}

function namesOf(entry: ReferenceSourceEntry): Set<string> {
  return new Set(entry.commemorations.map((c) => c.name.toLowerCase()));
}

/** Consensus = commemoration names common to every source that was
 * actually queried -- if sources ever disagreed, intersecting drops
 * anything not corroborated by all of them. */
function consensusCommemorations(entries: ReferenceSourceEntry[]): VerifiedCommemoration[] {
  const [first, ...rest] = entries;
  if (!first) return [];
  const commonNames = rest.reduce((common, entry) => {
    const names = namesOf(entry);
    return new Set([...common].filter((name) => names.has(name)));
  }, namesOf(first));

  const seen = new Set<string>();
  const result: VerifiedCommemoration[] = [];
  for (const entry of entries) {
    for (const c of entry.commemorations) {
      const key = c.name.toLowerCase();
      if (commonNames.has(key) && !seen.has(key)) {
        seen.add(key);
        result.push(c);
      }
    }
  }
  return result;
}

function candidateMatchesConsensus(candidateName: string, consensus: VerifiedCommemoration[]): boolean {
  const haystack = candidateName.toLowerCase();
  return consensus.some((c) => haystack.includes(c.name.toLowerCase()));
}

export type VerifySaintOfDayInput = {
  civilDateIso: string;
  julianDateIso: string;
  /** The D1 saint's own name/title (church_saints.name) -- never trusted
   * on its own, only used as the candidate to check against consensus. */
  candidateName: string;
};

/**
 * Never throws -- any lookup failure (including a rejected/unavailable
 * source) resolves to `verified: false` with a reason, per the fail-closed
 * requirement: better to skip a publish than risk the wrong saint.
 */
export async function verifySaintOfDay(input: VerifySaintOfDayInput): Promise<VerificationResult> {
  const monthDay = oldStyleMonthDay(input.julianDateIso);
  const base = { civilDate: input.civilDateIso, julianDate: input.julianDateIso };

  let sourceA: ReferenceSourceEntry | null;
  let sourceB: ReferenceSourceEntry | null;
  try {
    [sourceA, sourceB] = await Promise.all([lookupSourceA(monthDay), lookupSourceB(monthDay)]);
  } catch {
    return { ...base, verified: false, commemorations: [], sources: [], reason: 'source_unavailable' };
  }

  const availableSources = [sourceA, sourceB].filter((s): s is ReferenceSourceEntry => s !== null);
  if (availableSources.length === 0) {
    return { ...base, verified: false, commemorations: [], sources: [], reason: 'no_reference_data' };
  }
  if (availableSources.length < 2) {
    return {
      ...base,
      verified: false,
      commemorations: [],
      sources: availableSources.map((s) => s.source),
      reason: 'insufficient_sources',
    };
  }

  const consensus = consensusCommemorations(availableSources);
  const sources = availableSources.map((s) => s.source);
  if (consensus.length === 0) {
    return { ...base, verified: false, commemorations: [], sources, reason: 'sources_disagree' };
  }

  if (!candidateMatchesConsensus(input.candidateName, consensus)) {
    return { ...base, verified: false, commemorations: consensus, sources, reason: 'candidate_name_mismatch' };
  }

  return { ...base, verified: true, commemorations: consensus, sources, reason: 'consensus_confirmed' };
}
