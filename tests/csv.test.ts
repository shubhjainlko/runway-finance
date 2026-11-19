import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { detectDuplicates, fingerprint, parseCsv } from '../src/lib/csv';
import { signedStatement, splitStatement } from './fixtures';

test('reads a BOM-prefixed CRLF statement with grouped amounts and escaped merchant quotes', () => {
  const parsed = parseCsv(signedStatement);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.headers, ['Date', 'Description', 'Amount']);
  assert.deepEqual(
    [parsed.mapping.date, parsed.mapping.description, parsed.mapping.amount],
    [0, 1, 2],
  );
  assert.deepEqual(
    parsed.rows.map((row) => [row.date, row.description, row.amountCents]),
    [
      ['2026-01-30', 'Payroll, Horizon Studio', 125095],
      ['2026-01-31', 'Books "and" More', -4999],
    ],
  );
});

test('detects separate debit/credit columns and converts magnitudes into signed integer cents', () => {
  const parsed = parseCsv(splitStatement);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.mapping.amount, -1);
  assert.equal(parsed.mapping.debit, 2);
  assert.equal(parsed.mapping.credit, 3);
  assert.deepEqual(
    parsed.rows.map((row) => row.amountCents),
    [-4570, 289913],
  );
});

test('supports a custom mapping when a statement uses unrecognizable headings', () => {
  const csv = 'Whenish,Valueish,Whereish\n2024-02-29,-42.05,Desk Supply';
  const parsed = parseCsv(csv, { date: 0, amount: 1, description: 2 });
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(
    parsed.rows.map((row) => [row.date, row.description, row.amountCents]),
    [['2024-02-29', 'Desk Supply', -4205]],
  );
});

test('keeps a multiline quoted merchant in one transaction', () => {
  const csv = 'Date,Description,Amount\n2026-02-01,"Cafe\nNorth",-4.25\n2026-02-02,Metro,-3.40';
  const parsed = parseCsv(csv);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].description.replace(/\s+/g, ' '), 'Cafe North');
  assert.deepEqual(
    parsed.rows.map((row) => row.amountCents),
    [-425, -340],
  );
});

test('uses American slash dates by default and handles leap years without silent rollover', () => {
  const parsed = parseCsv('Date,Description,Amount\n02/03/2026,Cafe,-1.25\n02/29/2024,Cafe,-1.25');
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(
    parsed.rows.map((row) => row.date),
    ['2026-02-03', '2024-02-29'],
  );

  const invalid = parseCsv('Date,Description,Amount\n2025-02-29,Cafe,-1\n2026-04-31,Metro,-3');
  assert.equal(invalid.rows.length, 0);
  assert.deepEqual(
    invalid.errors.map((error) => error.line),
    [2, 3],
  );
});

test('supports accounting parentheses and explicit debit/credit direction on unsigned amounts', () => {
  assert.deepEqual(
    parseCsv('Date,Description,Amount\n2026-02-01,Market,"($1,234.09)"').rows.map(
      (row) => row.amountCents,
    ),
    [-123409],
  );
  const withType = parseCsv(
    'Date,Description,Amount,Type\n2026-02-01,Market,12.34,Debit\n2026-02-02,Refund,0.01,Credit',
  );
  assert.deepEqual(withType.errors, []);
  assert.deepEqual(
    withType.rows.map((row) => row.amountCents),
    [-1234, 1],
  );
});

test('honors clear day-first evidence across semicolon-delimited rows', () => {
  const parsed = parseCsv(
    'Posting Date;Merchant;Amount\n13/04/2026;Metro;-2.30\n05/04/2026;Cafe;-3.10',
  );
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(
    parsed.rows.map((row) => row.date),
    ['2026-04-13', '2026-04-05'],
  );
});

test('distinguishes abbreviated years and real month names from invalid dates', () => {
  const csv = [
    'Date,Description,Amount',
    '0000-02-03,A,1',
    '0099-02-03,B,1',
    'Marbles 7 2026,C,1',
    'Mar 7 2026,D,1',
    '7 March 2026,E,1',
    '03/07/99,F,1',
  ].join('\n');
  const parsed = parseCsv(csv);
  assert.deepEqual(
    parsed.errors.map((error) => error.line),
    [2, 3, 4],
  );
  assert.deepEqual(
    parsed.rows.map((row) => row.date),
    ['2026-03-07', '2026-03-07', '1999-03-07'],
  );
});

test('uses physical file line numbers after a multiline record and ignores blank lines', () => {
  const parsed = parseCsv(
    'Date,Description,Amount\r\n2026-01-01,"Cafe\r\nNorth",-3.50\r\n\r\n2026-01-02,Metro,broken',
  );
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].line, 2);
  assert.deepEqual(
    parsed.errors.map((error) => error.line),
    [5],
  );
});

test('rejects malformed numeric grouping, unsupported currencies and fractions smaller than one cent', () => {
  const csv =
    'Date,Description,Amount\n2026-01-01,A,"1,25.00"\n2026-01-02,B,€12.34\n2026-01-03,C,2.009';
  const parsed = parseCsv(csv);
  assert.deepEqual(parsed.rows, []);
  assert.deepEqual(
    parsed.errors.map((error) => error.line),
    [2, 3, 4],
  );
});

test('returns actionable mapping errors for empty, header-only and manually remapped statements', () => {
  assert.ok(parseCsv('').errors.length > 0);
  assert.ok(parseCsv('Date,Description,Amount').errors.length > 0);
  const text = 'Date,Description,Amount\n2026-03-01,Shop,-5';
  const duplicateMapping = parseCsv(text, { description: 0 });
  assert.deepEqual(duplicateMapping.rows, []);
  assert.ok(duplicateMapping.errors.length > 0);
  assert.throws(() => parseCsv(text, { amount: 22 }));
});

test('reports a bad amount, missing merchant and simultaneous positive debit and credit', () => {
  const invalid = parseCsv('Date,Description,Amount\n2026-02-01,Desk,12.3.4\n2026-02-02, ,4.50');
  assert.equal(invalid.rows.length, 0);
  assert.deepEqual(
    invalid.errors.map((error) => error.line),
    [2, 3],
  );

  const split = parseCsv('Date,Description,Debit,Credit\n2026-02-01,Market,12.00,9.00');
  assert.equal(split.rows.length, 0);
  assert.deepEqual(
    split.errors.map((error) => error.line),
    [2],
  );
});

test('refuses malformed open quotes instead of swallowing subsequent rows', () => {
  const csv = 'Date,Description,Amount\n2026-01-01,"Cafe,-5\n2026-01-02,Books,-4';
  assert.throws(() => parseCsv(csv));
});

test('duplicate fingerprints ignore case, repeated whitespace, and Unicode compatibility variants', () => {
  const original = { date: '2026-01-07', description: 'Ａcme   Coffee', amountCents: -945 };
  const same = { ...original, description: '  acme COFFEE  ' };
  const dateChanged = { ...original, date: '2026-01-08' };
  const refund = { ...original, amountCents: 945 };
  const amountChanged = { ...original, amountCents: -946 };
  const merchantChanged = { ...original, description: 'Acme Books' };
  assert.equal(fingerprint(original), fingerprint(same));
  assert.equal(
    new Set([original, dateChanged, refund, amountChanged, merchantChanged].map(fingerprint)).size,
    5,
  );
});

test('marks all duplicates, including repeats within the file and previously imported rows', () => {
  const old = { date: '2026-01-07', description: 'Cafe', amountCents: -475 };
  const fresh = { date: '2026-01-08', description: 'Rail Fare', amountCents: -300 };
  const refund = { ...fresh, amountCents: 300 };
  const rows = [old, fresh, { ...fresh, description: 'Rail  FARE' }, old, refund];
  assert.deepEqual(detectDuplicates(rows, [fingerprint(old)]), [true, false, true, true, false]);
  assert.deepEqual(detectDuplicates(rows), [false, false, true, true, false]);
});
