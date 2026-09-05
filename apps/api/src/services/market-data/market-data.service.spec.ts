import { AssetProfileIdentifier } from '@ghostfolio/common/interfaces';

import { DataSource } from '@prisma/client';

import { identifierFilter } from './market-data.service';

/**
 * `identifierFilter` replaced a one-OR-branch-per-pair filter, so what these
 * cover is that the rewrite still selects the SAME SET of pairs — the property
 * a faster query is worthless without.
 *
 * Set membership is asserted by expanding the grouped form back into pairs and
 * comparing against the input, which is exactly the equivalence claimed.
 */
function expand(
  filter: ReturnType<typeof identifierFilter>
): { dataSource: DataSource; symbol: string }[] {
  return filter.flatMap(({ dataSource, symbol }) => {
    return symbol.in.map((s) => {
      return { dataSource, symbol: s };
    });
  });
}

function sorted(pairs: { dataSource: DataSource; symbol: string }[]) {
  return [...pairs]
    .map(({ dataSource, symbol }) => {
      return `${dataSource}:${symbol}`;
    })
    .sort();
}

describe('identifierFilter', () => {
  it('selects exactly the pairs it was given', () => {
    const identifiers: AssetProfileIdentifier[] = [
      { dataSource: DataSource.YAHOO, symbol: 'AAPL' },
      { dataSource: DataSource.YAHOO, symbol: 'MSFT' },
      { dataSource: DataSource.MANUAL, symbol: 'FUND-A' }
    ];

    expect(sorted(expand(identifierFilter(identifiers)))).toEqual(
      sorted(identifiers)
    );
  });

  it('collapses to one branch per data source, not one per symbol', () => {
    const identifiers: AssetProfileIdentifier[] = [
      ...Array.from({ length: 500 }, (_, index) => {
        return { dataSource: DataSource.YAHOO, symbol: `SYM${index}` };
      }),
      { dataSource: DataSource.MANUAL, symbol: 'FUND-A' }
    ];

    // The whole point: 501 pairs must not become 501 OR branches.
    expect(identifierFilter(identifiers)).toHaveLength(2);
    expect(sorted(expand(identifierFilter(identifiers)))).toEqual(
      sorted(identifiers)
    );
  });

  it('never mixes a symbol into another data source', () => {
    // A symbol present under two sources must stay bound to each, or the
    // filter would silently widen and pull in rows the caller never asked for.
    const identifiers: AssetProfileIdentifier[] = [
      { dataSource: DataSource.YAHOO, symbol: 'GOLD' },
      { dataSource: DataSource.MANUAL, symbol: 'SILVER' }
    ];

    const filter = identifierFilter(identifiers);

    const yahoo = filter.find(({ dataSource }) => {
      return dataSource === DataSource.YAHOO;
    });
    const manual = filter.find(({ dataSource }) => {
      return dataSource === DataSource.MANUAL;
    });

    expect(yahoo.symbol.in).toEqual(['GOLD']);
    expect(manual.symbol.in).toEqual(['SILVER']);
  });

  it('keeps duplicates harmless', () => {
    const filter = identifierFilter([
      { dataSource: DataSource.YAHOO, symbol: 'AAPL' },
      { dataSource: DataSource.YAHOO, symbol: 'AAPL' }
    ]);

    // `IN (a, a)` matches the same rows as `IN (a)`, so this only needs to not
    // fabricate a second data source.
    expect(filter).toHaveLength(1);
    expect(filter[0].symbol.in).toEqual(['AAPL', 'AAPL']);
  });

  it('returns no branches for no identifiers', () => {
    // Prisma treats `OR: []` as matching nothing (verified against Postgres),
    // which is what the replaced form produced for empty input too — so an
    // empty ask keeps yielding an empty result rather than the whole table.
    expect(identifierFilter([])).toEqual([]);
  });
});
