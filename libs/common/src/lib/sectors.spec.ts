import { peerGroupFor, primarySector } from '@ghostfolio/common/sectors';

describe('primarySector', () => {
  it('reads the sector off a stock profile', () => {
    // The exact shape SymbolProfile.sectors stores: one sector at weight 1.
    expect(primarySector([{ name: 'Industrials', weight: 1 }])).toBe(
      'Industrials'
    );
  });

  it('takes the heaviest sector when several are present', () => {
    // An ETF spreads across sectors; the dominant one is the honest answer to
    // "what does this mostly track".
    expect(
      primarySector([
        { name: 'Technology', weight: 0.31 },
        { name: 'Financial Services', weight: 0.44 },
        { name: 'Energy', weight: 0.25 }
      ])
    ).toBe('Financial Services');
  });

  it('returns null for a profile gathered before sectors existed', () => {
    expect(primarySector([])).toBeNull();
    expect(primarySector(null)).toBeNull();
    expect(primarySector(undefined)).toBeNull();
  });

  it('survives a shape the provider never promised', () => {
    // Prisma hands this back as an untyped JsonValue, so it is external data.
    // A malformed entry must not throw inside the metrics refresh.
    expect(primarySector('Technology')).toBeNull();
    expect(primarySector([{ weight: 1 }])).toBeNull();
    expect(primarySector([{ name: '', weight: 1 }])).toBeNull();
    expect(primarySector([null, { name: 'Energy', weight: 1 }])).toBe('Energy');
  });

  it('still resolves when weights are missing', () => {
    // Absent weight is treated as 0 rather than discarding the entry, so a
    // single unweighted sector is better than no sector at all.
    expect(primarySector([{ name: 'Utilities' } as never])).toBe('Utilities');
  });
});

describe('peerGroupFor', () => {
  it('prefers the provider sector over the curated category', () => {
    // Sector is the better grouping because it is coarser: the curated
    // taxonomy produces peer groups of one or two names.
    expect(
      peerGroupFor({ category: 'semiconductors', sector: 'Technology' })
    ).toBe('Technology');
  });

  it('falls back to the curated category when no sector is known', () => {
    // Keeps the name inside a peer group rather than dropping it out of the
    // tailwind calculation entirely.
    expect(peerGroupFor({ category: 'quantum-computing', sector: null })).toBe(
      'quantum-computing'
    );
  });

  it('returns null only when neither is known', () => {
    expect(peerGroupFor({ category: null, sector: null })).toBeNull();
  });
});
