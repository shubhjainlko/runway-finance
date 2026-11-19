import { InputError } from './model';
import type { ColumnMapping, CsvRow, LedgerEntry, ParsedCsv, ParseIssue } from './model';

export const MAX_CSV_BYTES = 2 * 1024 * 1024;
export const MAX_CSV_ROWS = 10_000;
const MAX_COLUMNS = 128;
const MAX_FIELD_LENGTH = 16_384;
const MAX_DESCRIPTION_LENGTH = 400;

const headerAliases: Record<keyof ColumnMapping, readonly string[]> = {
  date: [
    'date',
    'transaction date',
    'posting date',
    'posted date',
    'post date',
    'booking date',
    'value date',
    'txn date',
    'trans date',
  ],
  description: [
    'description',
    'transaction description',
    'merchant',
    'merchant name',
    'payee',
    'narration',
    'particulars',
    'details',
    'transaction details',
    'memo',
    'name',
  ],
  amount: [
    'amount',
    'transaction amount',
    'net amount',
    'signed amount',
    'total',
    'amount usd',
    'usd amount',
  ],
  debit: [
    'debit',
    'debits',
    'debit amount',
    'debit usd',
    'withdrawal',
    'withdrawals',
    'withdrawal amount',
    'withdrawal amt',
    'money out',
    'paid out',
    'outflow',
    'charge',
    'charges',
  ],
  credit: [
    'credit',
    'credits',
    'credit amount',
    'credit usd',
    'deposit',
    'deposits',
    'deposit amount',
    'deposit amt',
    'money in',
    'paid in',
    'inflow',
  ],
  type: [
    'type',
    'transaction type',
    'debit credit',
    'credit debit',
    'dr cr',
    'direction',
    'transaction direction',
  ],
};

const mappingKeys = Object.keys(headerAliases) as (keyof ColumnMapping)[];

function cleanHeader(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function detectColumns(headers: string[]): ColumnMapping {
  const normalized = headers.map(cleanHeader);
  const result: ColumnMapping = {
    date: -1,
    description: -1,
    amount: -1,
    debit: -1,
    credit: -1,
    type: -1,
  };
  for (const key of mappingKeys) {
    for (const alias of headerAliases[key]) {
      const index = normalized.indexOf(alias);
      if (index !== -1) {
        result[key] = index;
        break;
      }
    }
  }
  return result;
}

function chooseDelimiter(text: string) {
  const counts = new Map([
    [',', 0],
    [';', 0],
    ['\t', 0],
  ]);
  let quoted = false;
  let hasContents = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      hasContents = true;
      if (quoted && text[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted && (char === '\r' || char === '\n')) {
      if (hasContents) break;
    } else if (!quoted && counts.has(char)) {
      counts.set(char, counts.get(char)! + 1);
      hasContents = true;
    } else if (char.trim()) {
      hasContents = true;
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

interface RecordLine {
  cells: string[];
  line: number;
}

/** Handles RFC-style escaped quotes, embedded newlines and either line ending. */
function readRecords(text: string): RecordLine[] {
  const delimiter = chooseDelimiter(text);
  const output: RecordLine[] = [];
  let cells: string[] = [];
  let value = '';
  let state: 'plain' | 'quoted' | 'afterQuote' = 'plain';
  let line = 1;
  let startLine = 1;

  function endField() {
    cells.push(value);
    if (cells.length > MAX_COLUMNS)
      throw new InputError('The CSV exceeds 128 columns on line ' + startLine + '.');
    value = '';
    state = 'plain';
  }

  function endRecord() {
    endField();
    if (cells.some((cell) => cell.trim() !== '')) output.push({ cells, line: startLine });
    if (output.length > MAX_CSV_ROWS + 1)
      throw new InputError('Import at most 10,000 records per statement.');
    cells = [];
  }

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const newline = char === '\r' || char === '\n';
    if (state === 'quoted') {
      if (char === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          state = 'afterQuote';
        }
      } else if (newline) {
        if (char === '\r' && text[i + 1] === '\n') i++;
        value += '\n';
        line++;
      } else {
        value += char;
      }
    } else if (char === delimiter) {
      endField();
    } else if (newline) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      endRecord();
      line++;
      startLine = line;
    } else if (char === '"' && state === 'plain' && value.trim() === '') {
      state = 'quoted';
      value = '';
    } else if (state === 'afterQuote' && (char === ' ' || char === '\t')) {
      continue;
    } else if (char === '"' || state === 'afterQuote') {
      throw new InputError('Unexpected character near a quotation mark on line ' + line + '.');
    } else {
      value += char;
    }
    if (value.length > MAX_FIELD_LENGTH)
      throw new InputError('A field on line ' + startLine + ' exceeds 16,384 characters.');
  }
  if (state === 'quoted')
    throw new InputError(
      'Unclosed quotation mark in the record starting on line ' + startLine + '.',
    );
  endRecord();
  return output;
}

function validateMapping(headers: string[], mapping: ColumnMapping) {
  if (mapping.date < 0 || mapping.description < 0)
    return 'Map the date and description columns to preview your statement.';
  if (mapping.amount < 0 && mapping.debit < 0 && mapping.credit < 0)
    return 'Map a signed amount column or the debit and credit columns.';
  const used = [mapping.date, mapping.description];
  if (mapping.amount >= 0) {
    used.push(mapping.amount);
    if (mapping.type >= 0) used.push(mapping.type);
  } else {
    if (mapping.debit >= 0) used.push(mapping.debit);
    if (mapping.credit >= 0) used.push(mapping.credit);
  }
  if (new Set(used).size !== used.length)
    return 'Choose a different source column for each mapped field.';
  if (used.some((i) => i >= headers.length)) return 'A selected column is outside this statement.';
  return null;
}

const monthNames = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];
const fullMonths = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];
const numericDate = /^(\d{1,2})([-/.])(\d{1,2})\2(\d{2}|\d{4})$/;

function preferDayFirst(records: RecordLine[], dateColumn: number) {
  let dayEvidence = false;
  let monthEvidence = false;
  for (const { cells } of records) {
    const match = numericDate.exec((cells[dateColumn] ?? '').trim());
    if (match) {
      if (Number(match[1]) > 12) dayEvidence = true;
      if (Number(match[3]) > 12) monthEvidence = true;
    }
  }
  return dayEvidence && !monthEvidence;
}

function calendarDate(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1900 ||
    year > 9998 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new InputError('Invalid calendar date.');
  }
  return date.toISOString().slice(0, 10);
}

function parseDate(raw: string, dayFirst: boolean) {
  const value = raw.trim();
  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(value);
  if (iso) return calendarDate(+iso[1], +iso[2], +iso[3]);
  const numeric = numericDate.exec(value);
  if (numeric) {
    const first = +numeric[1];
    const second = +numeric[3];
    const useDay = first > 12 || (second <= 12 && dayFirst);
    let year = +numeric[4];
    if (numeric[4].length === 2) year += year >= 70 ? 1900 : 2000;
    return calendarDate(year, useDay ? second : first, useDay ? first : second);
  }
  const words = value.replace(/[,.-]/g, ' ').trim().split(/\s+/);
  if (words.length === 3 && /^\d{4}$/.test(words[2])) {
    const monthToken = /^\d{1,2}$/.test(words[0]) ? words[1] : words[0];
    const dayToken = monthToken === words[0] ? words[1] : words[0];
    const name = monthToken.toLowerCase();
    const month = Math.max(fullMonths.indexOf(name), monthNames.indexOf(name)) + 1;
    if (month && /^\d{1,2}$/.test(dayToken)) {
      return calendarDate(+words[2], month, +dayToken);
    }
  }
  throw new InputError('Unrecognized date. Use YYYY-MM-DD or a consistent bank date format.');
}

/**
 * Read USD decimal notation without performing floating-point multiplication
 * on a fractional dollar value. Non-USD currency symbols are rejected.
 */
export function parseAmountCents(raw: string) {
  let value = raw.trim();
  let sign = 1;
  let signed = false;
  if (value.startsWith('(') && value.endsWith(')')) {
    sign = -1;
    signed = true;
    value = value.slice(1, -1).trim();
  }
  const suffix = /\s*(CR|DR)\s*$/i.exec(value);
  if (suffix) {
    if (signed) throw new InputError('Amount contains conflicting sign markers.');
    sign = suffix[1].toUpperCase() === 'DR' ? -1 : 1;
    signed = true;
    value = value.slice(0, suffix.index).trim();
  }
  // A currency marker may appear on either side of the sign.
  value = value
    .replace(/^(?:USD\s*|\$)\s*/i, '')
    .replace(/\s*USD$/i, '')
    .trim();
  const leadingSign = /^[+-]/.test(value);
  const trailingMinus = value.endsWith('-');
  if (leadingSign || trailingMinus) {
    if (signed || (leadingSign && trailingMinus))
      throw new InputError('Amount contains conflicting sign markers.');
    sign = value[0] === '-' || trailingMinus ? -1 : 1;
    value = (trailingMinus ? value.slice(0, -1) : value.slice(1)).trim();
    value = value.replace(/^(?:USD\s*|\$)\s*/i, '');
  }
  const parts = /^((?:\d{1,3}(?:,\d{3})+|\d+)?)(?:\.(\d{1,2}))?$/.exec(value);
  if (!parts || (!parts[1] && !parts[2]))
    throw new InputError('Invalid USD amount. Use a number with at most two decimal places.');
  const whole = Number(parts[1].replace(/,/g, '') || 0);
  const cents = whole * 100 + Number((parts[2] ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > 999_999_999_99)
    throw new InputError('Amount exceeds the supported range.');
  return cents === 0 ? 0 : sign * cents;
}

const debitTypes = new Set([
  'debit',
  'd',
  'dr',
  'withdrawal',
  'purchase',
  'sale',
  'charge',
  'outflow',
  'expense',
  'debit card',
]);
const creditTypes = new Set([
  'credit',
  'c',
  'cr',
  'deposit',
  'refund',
  'inflow',
  'income',
  'credit card refund',
]);

function amountFor(cells: string[], mapping: ColumnMapping) {
  if (mapping.amount !== -1) {
    const amount = parseAmountCents(cells[mapping.amount]);
    const type = (cells[mapping.type] ?? '').trim().toLowerCase();
    if (!type || !amount) return amount;
    if (debitTypes.has(type)) return -Math.abs(amount);
    if (creditTypes.has(type)) return Math.abs(amount);
    // A general-purpose Type column may contain payment rails (e.g. ACH).
    // Signed amounts remain authoritative for unrecognized descriptions.
    return amount;
  }
  const debit = (cells[mapping.debit] ?? '').trim();
  const credit = (cells[mapping.credit] ?? '').trim();
  if (!debit && !credit) throw new InputError('Missing debit or credit amount.');
  const outflow = debit ? Math.abs(parseAmountCents(debit)) : 0;
  const inflow = credit ? Math.abs(parseAmountCents(credit)) : 0;
  if (outflow && inflow) throw new InputError('Both debit and credit contain nonzero amounts.');
  return inflow - outflow;
}

export function normalizeDescription(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
}

export function parseCsv(text: string, overrides: Partial<ColumnMapping> = {}): ParsedCsv {
  if (typeof text !== 'string') throw new InputError('Provide the text of a CSV statement.');
  if (text.length > MAX_CSV_BYTES || new TextEncoder().encode(text).byteLength > MAX_CSV_BYTES) {
    throw new InputError('The CSV exceeds the 2 MiB size limit.');
  }
  if (text.includes('\u0000')) throw new InputError('Use a UTF-8 text CSV file.');
  const [first, ...records] = readRecords(text.replace(/^\uFEFF/, ''));
  const headers = first?.cells.map((h) => h.trim()) ?? [];
  const mapping = detectColumns(headers);
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides))
    throw new InputError('Invalid column mapping.');
  for (const [key, index] of Object.entries(overrides)) {
    if (
      !mappingKeys.includes(key as keyof ColumnMapping) ||
      !Number.isInteger(index) ||
      index < -1 ||
      index >= headers.length
    ) {
      throw new InputError('Invalid column mapping index.');
    }
    mapping[key as keyof ColumnMapping] = index;
  }
  const rows: CsvRow[] = [];
  const errors: ParseIssue[] = [];
  const mappingIssue = !first ? 'The file is empty.' : validateMapping(headers, mapping);
  if (mappingIssue)
    return { headers, mapping, rows, errors: [{ line: first?.line ?? 1, message: mappingIssue }] };
  if (!records.length)
    errors.push({ line: first.line, message: 'This statement has a header but no transactions.' });
  const dayFirst = preferDayFirst(records, mapping.date);
  for (const { cells, line } of records) {
    try {
      if (cells.length !== headers.length)
        throw new InputError(
          'Column count differs from the header. Quote fields containing the delimiter.',
        );
      const date = parseDate(cells[mapping.date], dayFirst);
      const description = normalizeDescription(cells[mapping.description]);
      if (
        !description ||
        description.length > MAX_DESCRIPTION_LENGTH ||
        /[\u0000-\u001F\u007F]/u.test(description)
      ) {
        throw new InputError('A description of 1–400 printable characters is required.');
      }
      rows.push({ line, date, description, amountCents: amountFor(cells, mapping) });
    } catch (error) {
      if (!(error instanceof InputError)) throw error;
      errors.push({ line, message: error.message });
    }
  }
  return { headers, mapping, rows, errors };
}

export function fingerprint(row: LedgerEntry): string {
  return JSON.stringify([
    row.date,
    normalizeDescription(row.description).toLowerCase(),
    row.amountCents,
  ]);
}

/** Flags records already stored or already seen earlier in this file. */
export function detectDuplicates(
  rows: LedgerEntry[],
  existingKeys: Iterable<string> = [],
): boolean[] {
  const seen = new Set(existingKeys);
  return rows.map((row) => {
    const key = fingerprint(row);
    const duplicate = seen.has(key);
    seen.add(key);
    return duplicate;
  });
}
