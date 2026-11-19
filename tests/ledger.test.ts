import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { promisify } from 'node:util';
import { detectAnomalies, detectSubscriptions } from '../src/lib/analytics';
import { openLedger } from '../src/lib/db';
import { overlappingStatement, signedStatement, splitStatement } from './fixtures';

function temporaryDatabase(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), 'runway-test-'));
  const path = join(directory, 'ledger.sqlite');
  const openConnections = new Set<ReturnType<typeof openLedger>>();
  t.after(() => {
    for (const connection of openConnections) connection.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    path,
    connect() {
      const connection = openLedger(path);
      openConnections.add(connection);
      return connection;
    },
    disconnect(connection: ReturnType<typeof openLedger>) {
      connection.close();
      openConnections.delete(connection);
    },
  };
}

test('preview is read-only, first import replaces the demo view and re-import survives reopening SQLite', (t) => {
  const file = temporaryDatabase(t);
  const ledger = file.connect();
  assert.equal(ledger.getWorkspace().mode, 'preview');
  const preview = ledger.previewImport(signedStatement);
  assert.equal(preview.newCount, 2);
  assert.equal(preview.duplicateCount, 0);
  assert.deepEqual(preview.errors, []);
  assert.equal(ledger.getWorkspace().mode, 'preview');

  assert.deepEqual(ledger.importStatement(signedStatement, 'checking.csv'), {
    inserted: 2,
    duplicates: 0,
  });
  assert.equal(ledger.getWorkspace().mode, 'live');
  assert.equal(ledger.getWorkspace().transactions.length, 2);
  file.disconnect(ledger);

  const reopened = file.connect();
  assert.deepEqual(reopened.importStatement(signedStatement, 'renamed-file.csv'), {
    inserted: 0,
    duplicates: 2,
  });
  assert.deepEqual(reopened.importStatement(overlappingStatement, 'overlap.csv'), {
    inserted: 1,
    duplicates: 1,
  });
  assert.equal(reopened.getWorkspace().transactions.length, 3);
  assert.equal(
    reopened.getWorkspace().transactions.find((row) => row.amountCents > 0)?.source,
    'checking.csv',
  );
});

test('preview marks duplicates within the upload and both connections recheck at commit time', (t) => {
  const db = temporaryDatabase(t);
  const tabA = db.connect();
  const tabB = db.connect();
  const statement =
    'Date,Description,Amount\n2026-01-07,North Cafe,-3.50\n2026-01-07, NORTH   CAFE ,-3.50';
  const preview = tabA.previewImport(statement);
  assert.equal(preview.newCount, 1);
  assert.equal(preview.duplicateCount, 1);
  assert.deepEqual(
    preview.rows.map((row) => row.duplicate),
    [false, true],
  );
  assert.equal(tabB.previewImport(statement).newCount, 1);
  assert.deepEqual(tabA.importStatement(statement, 'tab-a.csv'), { inserted: 1, duplicates: 1 });
  assert.deepEqual(tabB.importStatement(statement, 'tab-b.csv'), { inserted: 0, duplicates: 2 });
  assert.equal(tabB.getWorkspace().transactions.length, 1);
});

test(
  'two independent processes importing the same statement store each transaction once',
  { timeout: 20000 },
  async (t) => {
    const file = temporaryDatabase(t);
    const initial = file.connect();
    initial.resetData();
    file.disconnect(initial);
    const run = () =>
      promisify(execFile)(
        process.execPath,
        ['--import', 'tsx', join(process.cwd(), 'tests', 'helpers', 'import-worker.ts'), file.path],
        { timeout: 15000 },
      ).then(
        (result) => JSON.parse(result.stdout.trim()) as { inserted: number; duplicates: number },
      );
    const outcomes = await Promise.all([run(), run()]);
    assert.deepEqual(
      outcomes.map((result) => result.inserted).sort((a, b) => a - b),
      [0, 2],
    );
    assert.equal(
      outcomes.reduce((sum, result) => sum + result.duplicates, 0),
      2,
    );
    assert.equal(file.connect().getWorkspace().transactions.length, 2);
  },
);

test('a malformed row aborts even the valid rows in that import and preserves the existing ledger', (t) => {
  const ledger = temporaryDatabase(t).connect();
  ledger.importStatement(signedStatement, 'existing.csv');
  const before = ledger.getWorkspace();
  const invalid =
    'Date,Description,Amount\n2026-03-05,Should Not Appear,-19.25\n2026-02-30,Impossible Day,-4.25';
  assert.equal(ledger.previewImport(invalid).errors.length, 1);
  assert.throws(() => ledger.importStatement(invalid, 'invalid.csv'));
  assert.deepEqual(ledger.getWorkspace(), before);
});

test('a stale selection rolls back the whole bulk edit and cannot target new records after a reset', (t) => {
  const ledger = temporaryDatabase(t).connect();
  ledger.importStatement(signedStatement, 'initial.csv');
  const previous = ledger.getWorkspace();
  const id = previous.transactions[0].id;
  assert.throws(() => ledger.bulkCategorize([id, 999999], 'Health'));
  assert.deepEqual(ledger.getWorkspace(), previous);
  ledger.resetData();
  ledger.importStatement(splitStatement, 'replacement.csv');
  const fresh = ledger.getWorkspace();
  assert.throws(() => ledger.bulkCategorize([id], 'Health'));
  assert.deepEqual(ledger.getWorkspace(), fresh);
});

test('bulk edits and custom rules apply retroactively, persist and classify future imports', (t) => {
  const file = temporaryDatabase(t);
  const ledger = file.connect();
  const statement = [
    'Date,Description,Amount',
    '2026-04-01,Pioneer Supply,-5.20',
    '2026-04-02,Pioneer Downtown,-8.25',
    '2026-04-03,Corner Studio,-12.00',
  ].join('\n');
  ledger.importStatement(statement, 'activity.csv');
  const pioneerIds = ledger
    .getWorkspace()
    .transactions.filter((row) => row.description.startsWith('Pioneer'))
    .map((row) => row.id);
  assert.equal(ledger.bulkCategorize(pioneerIds, 'Shopping'), 2);
  assert.equal(
    ledger.getWorkspace().transactions.filter((row) => row.category === 'Shopping').length,
    2,
  );
  const { rule, updated } = ledger.addRule('pioneer', 'Travel');
  assert.equal(updated, 2);
  assert.equal(rule.category, 'Travel');
  file.disconnect(ledger);

  const reopened = file.connect();
  const future = 'Date,Description,Amount\n2026-04-04,PIONEER Station,-11.21';
  assert.equal(reopened.previewImport(future).rows[0].category, 'Travel');
  reopened.importStatement(future, 'next.csv');
  assert.equal(
    reopened.getWorkspace().transactions.filter((row) => row.category === 'Travel').length,
    3,
  );
  assert.equal(reopened.getWorkspace().rules[0].id, rule.id);
  reopened.deleteRule(rule.id);
  assert.deepEqual(reopened.getWorkspace().rules, []);
});

test('both bundled bank files import and demo loading is additive, repeatable and resettable', (t) => {
  const file = temporaryDatabase(t);
  const ledger = file.connect();
  const sampleDirectory = join(process.cwd(), 'sample-data');
  const samples = readdirSync(sampleDirectory)
    .filter((name) => name.endsWith('.csv'))
    .sort();
  assert.equal(samples.length, 2);
  for (const sample of samples) {
    const content = readFileSync(join(sampleDirectory, sample), 'utf8');
    const preview = ledger.previewImport(content);
    assert.deepEqual(preview.errors, []);
    assert.ok(preview.newCount > 0);
    ledger.importStatement(content, sample);
  }
  ledger.importStatement(splitStatement, 'personal.csv');
  ledger.loadSamples();
  const loaded = ledger.getWorkspace();
  assert.equal(loaded.mode, 'live');
  assert.ok(loaded.transactions.some((row) => row.source === 'personal.csv'));
  ledger.loadSamples();
  assert.deepEqual(ledger.getWorkspace(), loaded);
  ledger.addRule('Green Market', 'Shopping');
  ledger.resetData();
  file.disconnect(ledger);
  const reopened = file.connect();
  assert.deepEqual(reopened.getWorkspace(), { mode: 'empty', transactions: [], rules: [] });
  reopened.loadSamples();
  const demo = reopened.getWorkspace();
  assert.equal(demo.mode, 'live');
  assert.ok(new Set(demo.transactions.map((row) => row.date.slice(0, 7))).size >= 6);
  assert.ok(detectSubscriptions(demo.transactions).length > 0);
  assert.ok(detectAnomalies(demo.transactions).length > 0);
});
