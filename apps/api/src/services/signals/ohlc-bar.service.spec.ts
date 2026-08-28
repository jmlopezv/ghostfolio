import { refreshRangeFor } from './ohlc-bar.service';

describe('refreshRangeFor', () => {
  // A Friday close, gathered the following Monday evening.
  const now = new Date('2026-08-25T22:05:00.000Z');

  it('asks for the full range when nothing is stored', () => {
    expect(refreshRangeFor({ latestDate: undefined, now })).toBe('5y');
  });

  it('asks for a short range on the ordinary one-session gap', () => {
    expect(refreshRangeFor({ latestDate: '2026-08-24', now })).toBe('1mo');
  });

  it('still asks for a short range across a weekend', () => {
    // Friday's bar read on Monday is a 3-day calendar gap but no missing data.
    expect(refreshRangeFor({ latestDate: '2026-08-21', now })).toBe('1mo');
  });

  it('widens to 3mo once the gap outgrows a long weekend', () => {
    expect(refreshRangeFor({ latestDate: '2026-08-10', now })).toBe('3mo');
    expect(refreshRangeFor({ latestDate: '2026-06-27', now })).toBe('3mo');
  });

  it('falls back to the full range when history is genuinely missing', () => {
    expect(refreshRangeFor({ latestDate: '2026-01-05', now })).toBe('5y');
  });

  it('treats the boundaries as inclusive', () => {
    // 5 days -> short, 6 -> medium; 60 -> medium, 61 -> full.
    expect(refreshRangeFor({ latestDate: '2026-08-20', now })).toBe('1mo');
    expect(refreshRangeFor({ latestDate: '2026-08-19', now })).toBe('3mo');
    expect(refreshRangeFor({ latestDate: '2026-06-26', now })).toBe('3mo');
    expect(refreshRangeFor({ latestDate: '2026-06-25', now })).toBe('5y');
  });

  it('repairs rather than trusts a bar dated in the future', () => {
    // Not a small gap — bad data, and only a full refetch can correct it.
    expect(refreshRangeFor({ latestDate: '2026-09-01', now })).toBe('5y');
  });
});
