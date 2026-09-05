-- Collapse OhlcBar/MarketData onto one row per (dataSource, symbol, calendar day),
-- stored at UTC midnight.
--
-- Why: `run-import-index-universe.cjs` inserted `new Date(timestamp * 1000)` — the raw
-- Yahoo epoch, i.e. the MARKET-OPEN instant (13:30 UTC for US names, 07:00/08:00 for
-- European ones) — while `OhlcBarService.upsertMany` and the nightly gather store
-- `T00:00:00.000Z`. The unique constraint is on the full timestamp, so `skipDuplicates`
-- could not see the two as the same day and both rows persisted.
--
-- Why it matters: the indicator and ranking layers index by ARRAY POSITION
-- (`closes[len - 1 - 63]` for a 3-month return, `slice(-200)` for an SMA200). A second
-- row for one day shifts every window. Measured before this migration: 527 of 866 YAHOO
-- symbols carried ~20 surplus rows per year (~8%), so "63 trading days back" landed
-- anywhere from 2026-06-04 to 2026-07-07 across the universe — a 33-day spread on what
-- is supposed to be one shared window, biasing the cross-sectional RS percentile by an
-- artifact of which script last touched a symbol.
--
-- Every timestamp in both tables falls between 00:00 and 14:30 UTC, and the columns are
-- `timestamp without time zone`, so `date_trunc('day', ...)` maps each row onto its own
-- calendar day with no timezone shift.

-- 1. Drop the surplus row where the same day already has a midnight row. Verified before
--    writing this: every duplicated day has exactly one midnight row and at most two rows
--    in total, so this leaves precisely one row per day. The midnight row is the one the
--    trusted gather wrote; where the two disagreed on price (77 days in OhlcBar, 98 in
--    MarketData) it was rounding, and the gather is authoritative.
DELETE FROM "OhlcBar" o
WHERE o.date <> date_trunc('day', o.date)
  AND EXISTS (
    SELECT 1 FROM "OhlcBar" m
    WHERE m."dataSource" = o."dataSource"
      AND m.symbol = o.symbol
      AND m.date = date_trunc('day', o.date)
  );

DELETE FROM "MarketData" o
WHERE o.date <> date_trunc('day', o.date)
  AND EXISTS (
    SELECT 1 FROM "MarketData" m
    WHERE m."dataSource" = o."dataSource"
      AND m.symbol = o.symbol
      AND m.date = date_trunc('day', o.date)
  );

-- 2. Normalise the survivors. The DELETE above removed exactly the rows that would have
--    collided, so this cannot violate the (dataSource, date, symbol) unique constraint.
UPDATE "OhlcBar" SET date = date_trunc('day', date) WHERE date <> date_trunc('day', date);

UPDATE "MarketData" SET date = date_trunc('day', date) WHERE date <> date_trunc('day', date);

-- 3. Make a recurrence impossible rather than merely unlikely. With every row at midnight
--    the existing (dataSource, date, symbol) unique constraint IS day-granular, so this
--    check is what keeps it that way: a writer that forgets to normalise now fails loudly
--    instead of silently duplicating a day.
ALTER TABLE "OhlcBar"
  ADD CONSTRAINT "OhlcBar_date_is_utc_midnight" CHECK (date = date_trunc('day', date));

ALTER TABLE "MarketData"
  ADD CONSTRAINT "MarketData_date_is_utc_midnight" CHECK (date = date_trunc('day', date));
