export const CATEGORIES = [
  'Income',
  'Housing',
  'Groceries',
  'Dining',
  'Shopping',
  'Transport',
  'Subscriptions',
  'Utilities',
  'Health',
  'Travel',
  'Entertainment',
  'Other',
] as const;

export type Category = (typeof CATEGORIES)[number];

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}

export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InputError';
  }
}

export interface LedgerEntry {
  date: string;
  description: string;
  /** Signed USD cents, with outflows represented by negative numbers. */
  amountCents: number;
}

export interface Transaction extends LedgerEntry {
  id: number;
  category: Category;
  source: string;
}

export interface Rule {
  id: number;
  keyword: string;
  category: Category;
}

export interface Workspace {
  transactions: Transaction[];
  rules: Rule[];
  mode: 'preview' | 'live' | 'empty';
}

/** A zero-based CSV column index. An unused field has index -1. */
export interface ColumnMapping {
  date: number;
  description: number;
  amount: number;
  debit: number;
  credit: number;
  type: number;
}

export interface CsvRow extends LedgerEntry {
  /** Physical line number in the source, including the header. */
  line: number;
}

export interface ParseIssue {
  line: number;
  message: string;
}

export interface ParsedCsv {
  headers: string[];
  mapping: ColumnMapping;
  rows: CsvRow[];
  errors: ParseIssue[];
}

export interface PreviewRow extends CsvRow {
  category: Category;
  duplicate: boolean;
}

export interface ImportPreview extends ParsedCsv {
  rows: PreviewRow[];
  newCount: number;
  duplicateCount: number;
}

export interface MonthlyPoint {
  month: string;
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  /** Percentage, e.g. 25 for 25%. Zero when there is no income. */
  savingsRate: number;
}

export interface Subscription {
  merchant: string;
  category: Category;
  amountCents: number;
  cadence: 'Weekly' | 'Monthly' | 'Annual';
  lastDate: string;
  nextDate: string;
  occurrences: number;
}

export interface Anomaly {
  transaction: Transaction;
  averageCents: number;
  ratio: number;
}

export interface ForecastOptions {
  /** A reduction in monthly expenditure, capped at typical monthly expense. */
  extraSavingsCents: number;
  /** Additional expense in the first projected month. */
  oneTimeExpenseCents: number;
  incomeChangePercent: number;
}

export interface ForecastPoint {
  month: string;
  baselineCents: number;
  projectedCents: number;
}
