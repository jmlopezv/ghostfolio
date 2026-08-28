/**
 * Sector resolution for peer grouping.
 *
 * The sector-tailwind signal compares a name against its peers' trailing
 * 3-month returns, so the quality of that statistic depends entirely on how the
 * peer group is defined. Until now the group came from COMPANY_CATALOG's
 * curated theme taxonomy — 40 categories over 215 named companies, with groups
 * as small as one or two ('etf-datacenter-reits' 1, 'biotech' 2). A median over
 * two names is not a market signal.
 *
 * `SymbolProfile.sectors` is a better source and is already populated for ~91%
 * of tracked stocks by the data provider, covering non-US listings the curated
 * catalog never reached and filling itself in for newly imported symbols. Its
 * ~11 buckets produce peer groups of 60-90, which is enough for a median to
 * mean something.
 *
 * The curated category is kept as the fallback and as a secondary theme label —
 * it encodes intent ('quantum-computing') that no sector taxonomy expresses.
 */

interface SectorWeight {
  name: string;
  weight: number;
}

/**
 * The dominant sector from a `SymbolProfile.sectors` value, or null.
 *
 * Typed as `unknown` because Prisma hands this back as an untyped `JsonValue`,
 * and it is external data: a profile fetched before sector support existed
 * stores `[]`, and a provider change could alter the shape without warning.
 * Everything is therefore checked rather than asserted.
 *
 * A stock carries exactly one sector at weight 1. An ETF carries several with
 * fractional weights, so the heaviest is taken — a crude but honest answer to
 * "what does this mostly track".
 */
export function primarySector(sectors: unknown): string | null {
  if (!Array.isArray(sectors) || sectors.length === 0) {
    return null;
  }

  const valid = sectors.filter((entry): entry is SectorWeight => {
    return (
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as SectorWeight).name === 'string' &&
      (entry as SectorWeight).name.length > 0
    );
  });

  if (valid.length === 0) {
    return null;
  }

  return valid.reduce((best, entry) => {
    const bestWeight = typeof best.weight === 'number' ? best.weight : 0;
    const entryWeight = typeof entry.weight === 'number' ? entry.weight : 0;

    return entryWeight > bestWeight ? entry : best;
  }).name;
}

/**
 * The peer group a symbol belongs to: its sector when known, otherwise its
 * curated catalog category.
 *
 * The fallback is not merely defensive. It keeps names that have a curated
 * category but no provider sector inside a peer group rather than dropping them
 * out of the tailwind calculation entirely, which is what returning null does.
 */
export function peerGroupFor({
  category,
  sector
}: {
  category: string | null;
  sector: string | null;
}): string | null {
  return sector ?? category ?? null;
}
