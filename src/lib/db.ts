import Database from 'better-sqlite3';
import { closeSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { makeCategorizer, normalizeKeyword } from './categories';
import { detectDuplicates, fingerprint, MAX_CSV_ROWS, parseCsv } from './csv';
import { CATEGORIES, InputError, isCategory } from './model';
import type {
  Category,
  ColumnMapping,
  CsvRow,
  ImportPreview,
  Rule,
  Transaction,
  Workspace,
} from './model';

const SAMPLE_NAMES = ['checking-statement.csv', 'card-statement.csv'] as const;
const APP_ID = 0x52554e57; // RUNW
const SCHEMA_VERSION = 1;

function validatedRows(csv: string, mapping?: Partial<ColumnMapping>) {
  const parsed = parseCsv(csv, mapping);
  if (parsed.errors.length) {
    const first = parsed.errors[0];
    throw new InputError('Line ' + first.line + ': ' + first.message);
  }
  return parsed.rows;
}

function readSamples() {
  return SAMPLE_NAMES.map((source) => {
    const csv = readFileSync(join(process.cwd(), 'sample-data', source), 'utf8');
    return { source, rows: validatedRows(csv) };
  });
}

function sampleWorkspace(): Workspace {
  const categoryFor = makeCategorizer();
  const seen = new Set<string>();
  const transactions: Transaction[] = [];
  for (const { source, rows } of readSamples()) {
    for (const row of rows) {
      const key = fingerprint(row);
      if (seen.has(key)) continue;
      seen.add(key);
      const { date, description, amountCents } = row;
      transactions.push({
        id: transactions.length,
        date,
        description,
        amountCents,
        category: categoryFor(description, amountCents),
        source,
      });
    }
  }
  // Preview IDs cannot match an editable row, including across another open tab.
  for (const tx of transactions) tx.id -= transactions.length;
  transactions.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  return { mode: 'preview', transactions, rules: [] };
}

function ensureCategory(value: unknown): Category {
  if (!isCategory(value)) throw new InputError('Choose a recognized category.');
  return value;
}

function cleanSource(value: string) {
  if (typeof value !== 'string') throw new InputError('A source filename is required.');
  const source = value.normalize('NFKC').replace(/\\/g, '/').split('/').pop()?.trim();
  if (!source || source.length > 255 || /[\u0000-\u001F\u007F]/u.test(source)) {
    throw new InputError('Use a printable source filename of up to 255 characters.');
  }
  return source;
}

function initialize(db: Database.Database) {
  db.pragma('busy_timeout = 8000');
  // A second freshly opened process can already hold the file for migration.
  // The default rollback journal remains fully transactional in that case.
  try {
    db.pragma('journal_mode = WAL');
  } catch (error) {
    if (!(error instanceof Database.SqliteError) || error.code !== 'SQLITE_BUSY') throw error;
  }
  db.pragma('synchronous = FULL');
  db.transaction(() => {
    const app = db.pragma('application_id', { simple: true });
    const version = db.pragma('user_version', { simple: true });
    if (app === APP_ID && version === SCHEMA_VERSION) return;
    const existingTable = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' LIMIT 1")
      .get();
    if (app || version || existingTable)
      throw new Error('This database is incompatible with this version of Runway.');
    const categories = CATEGORIES.map((category) => "'" + category + "'").join(', ');
    db.exec(`
      CREATE TABLE workspace (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        activated INTEGER NOT NULL CHECK (activated IN (0, 1))
      );
      INSERT INTO workspace(singleton, activated) VALUES (1, 0);
      CREATE TABLE transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        description TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        category TEXT NOT NULL CHECK (category IN (${categories})),
        source TEXT NOT NULL,
        fingerprint TEXT NOT NULL UNIQUE,
        merchant_key TEXT NOT NULL
      );
      CREATE INDEX transactions_date ON transactions(date DESC, id DESC);
      CREATE TABLE rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        keyword TEXT NOT NULL UNIQUE,
        category TEXT NOT NULL CHECK (category IN (${categories}))
      );
    `);
    db.pragma('application_id = ' + APP_ID);
    db.pragma('user_version = ' + SCHEMA_VERSION);
  }).immediate();
}

export function openLedger(path: string) {
  const filename = path === ':memory:' ? path : resolve(path);
  if (filename !== ':memory:') {
    mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    closeSync(openSync(filename, 'a', 0o600));
  }
  const db = new Database(filename);
  try {
    initialize(db);
  } catch (error) {
    db.close();
    throw error;
  }

  const listRules = db.prepare<[], Rule>(
    'SELECT id, keyword, category FROM rules ORDER BY id DESC',
  );
  const listTransactions = db.prepare<[], Transaction>(
    'SELECT id, date, description, amount_cents AS amountCents, category, source FROM transactions ORDER BY date DESC, id DESC',
  );
  const active = db.prepare<[], { activated: number }>(
    'SELECT activated FROM workspace WHERE singleton = 1',
  );
  const activate = db.prepare('UPDATE workspace SET activated = 1 WHERE singleton = 1');
  const contains = db.prepare('SELECT 1 FROM transactions WHERE fingerprint = ?');
  const insert = db.prepare(
    'INSERT INTO transactions (date, description, amount_cents, category, source, fingerprint, merchant_key) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(fingerprint) DO NOTHING',
  );
  const setCategory = db.prepare('UPDATE transactions SET category = ? WHERE id = ?');
  const existingRule = db.prepare('SELECT 1 FROM rules WHERE keyword = ?');
  const insertRule = db.prepare('INSERT INTO rules (keyword, category) VALUES (?, ?)');
  const reclassify = db.prepare(
    'UPDATE transactions SET category = ? WHERE instr(merchant_key, ?) > 0 AND category <> ?',
  );
  const removeRule = db.prepare('DELETE FROM rules WHERE id = ?');

  const snapshot = db.transaction((): Workspace => {
    if (!active.get()!.activated) return { mode: 'preview', transactions: [], rules: [] };
    const transactions = listTransactions.all();
    return { mode: transactions.length ? 'live' : 'empty', transactions, rules: listRules.all() };
  });

  function getWorkspace() {
    const current = snapshot();
    return current.mode === 'preview' ? sampleWorkspace() : current;
  }

  function previewImport(csv: string, mapping?: Partial<ColumnMapping>): ImportPreview {
    const parsed = parseCsv(csv, mapping);
    return db.transaction(() => {
      const categoryFor = makeCategorizer(listRules.all());
      const keys = new Set(parsed.rows.map(fingerprint));
      const existing = [...keys].filter((key) => !!contains.get(key));
      const duplicates = detectDuplicates(parsed.rows, existing);
      const rows = parsed.rows.map((row, i) => ({
        ...row,
        category: categoryFor(row.description, row.amountCents),
        duplicate: duplicates[i],
      }));
      const duplicateCount = duplicates.filter(Boolean).length;
      return { ...parsed, rows, duplicateCount, newCount: rows.length - duplicateCount };
    })();
  }

  const storeStatements = db.transaction((statements: { source: string; rows: CsvRow[] }[]) => {
    const categoryFor = makeCategorizer(listRules.all());
    let inserted = 0;
    let duplicates = 0;
    for (const { source, rows } of statements) {
      for (const row of rows) {
        const { date, description, amountCents } = row;
        const result = insert.run(
          date,
          description,
          amountCents,
          categoryFor(description, amountCents),
          source,
          fingerprint(row),
          normalizeKeyword(description),
        );
        if (result.changes) inserted++;
        else duplicates++;
      }
    }
    activate.run();
    return { inserted, duplicates };
  });

  function importStatement(csv: string, source: string, mapping?: Partial<ColumnMapping>) {
    const input = { source: cleanSource(source), rows: validatedRows(csv, mapping) };
    return storeStatements.immediate([input]);
  }

  function loadSamples() {
    return storeStatements.immediate(readSamples());
  }

  const reset = db.transaction(() => {
    db.exec('DELETE FROM transactions; DELETE FROM rules;');
    activate.run();
  });

  const setMany = db.transaction((ids: number[], category: Category) => {
    for (const id of ids) {
      if (!setCategory.run(category, id).changes)
        throw new InputError('A selected transaction no longer exists. Refresh the ledger.');
    }
    return ids.length;
  });

  function bulkCategorize(ids: number[], category: Category) {
    ensureCategory(category);
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > MAX_CSV_ROWS ||
      ids.some((id) => !Number.isSafeInteger(id) || id <= 0)
    ) {
      throw new InputError('Select between 1 and 10,000 saved transactions.');
    }
    return setMany.immediate([...new Set(ids)], category);
  }

  const saveRule = db.transaction((keyword: string, category: Category) => {
    if (existingRule.get(keyword)) throw new InputError('A rule for this keyword already exists.');
    const result = insertRule.run(keyword, category);
    const rule: Rule = { id: Number(result.lastInsertRowid), keyword, category };
    const updated = reclassify.run(category, keyword, category).changes;
    activate.run();
    return { rule, updated };
  });

  function addRule(keyword: string, category: Category) {
    ensureCategory(category);
    if (typeof keyword !== 'string') throw new InputError('A rule keyword is required.');
    const normalized = normalizeKeyword(keyword);
    if (!normalized || normalized.length > 100 || /[\u0000-\u001F\u007F]/u.test(normalized)) {
      throw new InputError('Use a keyword of 1–100 printable characters.');
    }
    return saveRule.immediate(normalized, category);
  }

  function deleteRule(id: number) {
    if (!Number.isSafeInteger(id) || id <= 0 || !removeRule.run(id).changes) {
      throw new InputError('The selected rule no longer exists.');
    }
  }

  return {
    getWorkspace,
    previewImport,
    importStatement,
    loadSamples,
    resetData: () => reset.immediate(),
    bulkCategorize,
    addRule,
    deleteRule,
    close: () => db.close(),
  };
}

type Ledger = ReturnType<typeof openLedger>;
const processState = globalThis as typeof globalThis & {
  __runwayDb?: { path: string; ledger: Ledger };
};

function local(): Ledger {
  const path = process.env.RUNWAY_DB_PATH || join(process.cwd(), 'data', 'runway.sqlite');
  if (processState.__runwayDb?.path !== path) {
    processState.__runwayDb?.ledger.close();
    processState.__runwayDb = { path, ledger: openLedger(path) };
  }
  return processState.__runwayDb.ledger;
}

export const getWorkspace = () => local().getWorkspace();
export const previewImport = (csv: string, mapping?: Partial<ColumnMapping>) =>
  local().previewImport(csv, mapping);
export const importStatement = (csv: string, source: string, mapping?: Partial<ColumnMapping>) =>
  local().importStatement(csv, source, mapping);
export const loadSamples = () => local().loadSamples();
export const resetData = () => local().resetData();
export const bulkCategorize = (ids: number[], category: Category) =>
  local().bulkCategorize(ids, category);
export const addRule = (keyword: string, category: Category) => local().addRule(keyword, category);
export const deleteRule = (id: number) => local().deleteRule(id);
