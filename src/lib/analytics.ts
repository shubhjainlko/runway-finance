import { normalizeKeyword } from './categories';
import { InputError } from './model';
import type {
  Anomaly,
  Category,
  ForecastOptions,
  ForecastPoint,
  MonthlyPoint,
  Subscription,
  Transaction,
} from './model';

export type { Anomaly, ForecastOptions, ForecastPoint, MonthlyPoint, Subscription } from './model';

function monthNumber(month: string): number {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new InputError('Use a calendar month in YYYY-MM format.');
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1;
}

export function offsetMonth(month: string, offset: number) {
  const serial = monthNumber(month) + offset;
  return (
    String(Math.floor(serial / 12)).padStart(4, '0') +
    '-' +
    String((serial % 12) + 1).padStart(2, '0')
  );
}

export function latestMonth(transactions: readonly Transaction[]): string {
  let last = '';
  for (const row of transactions) if (row.date > last) last = row.date;
  return (last || new Date().toISOString()).slice(0, 7);
}

export function monthSeries(
  transactions: readonly Transaction[],
  endMonth = latestMonth(transactions),
  count = 6,
): MonthlyPoint[] {
  if (!Number.isInteger(count) || count < 1 || count > 1200)
    throw new InputError('Choose between 1 and 1,200 months.');
  const points: MonthlyPoint[] = Array.from({ length: count }, (_, index) => ({
    month: offsetMonth(endMonth, index - count + 1),
    incomeCents: 0,
    expenseCents: 0,
    netCents: 0,
    savingsRate: 0,
  }));
  const byMonth = new Map(points.map((point) => [point.month, point]));
  for (const row of transactions) {
    const point = byMonth.get(row.date.slice(0, 7));
    if (!point) continue;
    if (row.amountCents >= 0) point.incomeCents += row.amountCents;
    else point.expenseCents -= row.amountCents;
  }
  for (const point of points) {
    point.netCents = point.incomeCents - point.expenseCents;
    point.savingsRate = point.incomeCents ? (point.netCents / point.incomeCents) * 100 : 0;
  }
  return points;
}

export function spendingByCategory(transactions: readonly Transaction[], month?: string) {
  const totals = new Map<Category, number>();
  for (const row of transactions) {
    if (row.amountCents < 0 && (!month || row.date.slice(0, 7) === month)) {
      totals.set(row.category, (totals.get(row.category) ?? 0) - row.amountCents);
    }
  }
  return [...totals]
    .map(([category, amountCents]) => ({ category, amountCents }))
    .sort((a, b) => b.amountCents - a.amountCents || a.category.localeCompare(b.category));
}

/** Includes months with no entries between the first and last dated records. */
export function forecastBaseline(transactions: readonly Transaction[]) {
  const asOfMonth = latestMonth(transactions);
  let first = asOfMonth;
  let startBalanceCents = 0;
  for (const row of transactions) {
    const month = row.date.slice(0, 7);
    if (month < first) first = month;
    startBalanceCents += row.amountCents;
  }
  const monthsUsed = transactions.length
    ? Math.min(3, monthNumber(asOfMonth) - monthNumber(first) + 1)
    : 0;
  const history = monthsUsed ? monthSeries(transactions, asOfMonth, monthsUsed) : [];
  const monthlyIncomeCents = monthsUsed
    ? Math.round(history.reduce((sum, point) => sum + point.incomeCents, 0) / monthsUsed)
    : 0;
  const monthlyExpenseCents = monthsUsed
    ? Math.round(history.reduce((sum, point) => sum + point.expenseCents, 0) / monthsUsed)
    : 0;
  return { asOfMonth, monthsUsed, startBalanceCents, monthlyIncomeCents, monthlyExpenseCents };
}

export function forecastCashFlow(
  transactions: readonly Transaction[],
  options: Partial<ForecastOptions> = {},
): ForecastPoint[] {
  const { extraSavingsCents = 0, oneTimeExpenseCents = 0, incomeChangePercent = 0 } = options;
  if (
    !Number.isSafeInteger(extraSavingsCents) ||
    extraSavingsCents < 0 ||
    !Number.isSafeInteger(oneTimeExpenseCents) ||
    oneTimeExpenseCents < 0 ||
    !Number.isFinite(incomeChangePercent) ||
    incomeChangePercent < -100
  ) {
    throw new InputError('Use nonnegative whole cents and an income change of at least −100%.');
  }
  if (!transactions.length) return [];
  const { asOfMonth, startBalanceCents, monthlyIncomeCents, monthlyExpenseCents } =
    forecastBaseline(transactions);
  const baselineNet = monthlyIncomeCents - monthlyExpenseCents;
  const scenarioIncome = Math.round((monthlyIncomeCents * (100 + incomeChangePercent)) / 100);
  const scenarioExpense = Math.max(0, monthlyExpenseCents - extraSavingsCents);
  const scenarioNet = scenarioIncome - scenarioExpense;
  return Array.from({ length: 6 }, (_, index) => {
    const step = index + 1;
    const baselineCents = startBalanceCents + step * baselineNet;
    const projectedCents = startBalanceCents + step * scenarioNet - oneTimeExpenseCents;
    if (!Number.isSafeInteger(baselineCents) || !Number.isSafeInteger(projectedCents)) {
      throw new InputError('The projected balance exceeds the supported range.');
    }
    return { month: offsetMonth(asOfMonth, step), baselineCents, projectedCents };
  });
}

const DAY_MS = 86_400_000;
type Cadence = Subscription['cadence'];
const intervalDays: Record<Cadence, [number, number, number]> = {
  Weekly: [5, 9, 7],
  Monthly: [25, 36, 30.44],
  Annual: [352, 378, 365.24],
};

function daysBetween(a: string, b: string) {
  return (Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY_MS;
}

function cleanMerchant(value: string) {
  return (
    value
      .replace(
        /^(?:pos purchase|debit card purchase|card purchase|recurring payment|pos)\s*[:* -]\s*/i,
        '',
      )
      .replace(/\s+(?:ref(?:erence)?|txn|order|confirmation)\s*[:#-]?\s*[\w-]*\d[\w-]*$/i, '')
      .replace(/\s+#\d{4,}$/u, '')
      .trim() || value
  );
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function followsCadence(earlier: string, later: string, cadence: Cadence) {
  const [min, max] = intervalDays[cadence];
  const interval = daysBetween(earlier, later);
  if (interval < min || interval > max) return false;
  if (cadence === 'Weekly') return true;
  const elapsedMonths = monthNumber(later.slice(0, 7)) - monthNumber(earlier.slice(0, 7));
  return elapsedMonths === (cadence === 'Monthly' ? 1 : 12);
}

function nextPaymentDate(series: Transaction[], cadence: Cadence) {
  const last = series[series.length - 1].date;
  if (cadence === 'Weekly')
    return new Date(Date.parse(last + 'T00:00:00Z') + 7 * DAY_MS).toISOString().slice(0, 10);
  const nextMonth = offsetMonth(last.slice(0, 7), cadence === 'Monthly' ? 1 : 12);
  const lastDay = (date: string) =>
    new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7), 0)).getUTCDate();
  const endOfMonth = series.every((row) => +row.date.slice(8) === lastDay(row.date));
  const normalDay = Math.round(median(series.map((row) => +row.date.slice(8))));
  const day = endOfMonth ? lastDay(nextMonth) : Math.min(lastDay(nextMonth), normalDay);
  return nextMonth + '-' + String(day).padStart(2, '0');
}

function findRecurring(group: Transaction[], latest: string): Subscription | undefined {
  if (group.length < 3) return;
  group.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const last = group[group.length - 1];
  const previous = group[group.length - 2];
  const cadence = (Object.keys(intervalDays) as Cadence[]).find((c) =>
    followsCadence(previous.date, last.date, c),
  );
  if (!cadence || daysBetween(last.date, latest) > 1.5 * intervalDays[cadence][2]) return;
  // Restrict detection to the most recent consecutive run. An old subscription
  // should disappear after it lapses, and a merchant can change its price.
  let start = group.length - 1;
  const lastAmount = -last.amountCents;
  const near = (amount: number, reference: number) =>
    Math.abs(amount - reference) <= Math.max(100, reference * 0.08);
  while (
    start > 0 &&
    followsCadence(group[start - 1].date, group[start].date, cadence) &&
    near(-group[start - 1].amountCents, lastAmount)
  )
    start--;
  if (group.length - start < 3) return;
  const series = group.slice(start);
  const typical = Math.round(median(series.map((row) => -row.amountCents)));
  if (!series.every((row) => near(-row.amountCents, typical))) return;
  return {
    merchant: cleanMerchant(last.description),
    category: last.category,
    amountCents: typical,
    cadence,
    lastDate: last.date,
    nextDate: nextPaymentDate(series, cadence),
    occurrences: series.length,
  };
}

export function detectSubscriptions(transactions: readonly Transaction[]): Subscription[] {
  const groups = new Map<string, Transaction[]>();
  let latest = '';
  for (const row of transactions) {
    if (row.date > latest) latest = row.date;
    if (row.amountCents >= 0) continue;
    const key = normalizeKeyword(cleanMerchant(row.description));
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  const results: Subscription[] = [];
  for (const group of groups.values()) {
    const result = findRecurring(group, latest);
    if (result) results.push(result);
  }
  return results.sort(
    (a, b) =>
      Number(b.category === 'Subscriptions') - Number(a.category === 'Subscriptions') ||
      b.amountCents - a.amountCents ||
      a.merchant.localeCompare(b.merchant),
  );
}

/** Leave-one-out peers prevent an unusually expensive transaction from inflating its own baseline. */
export function detectAnomalies(transactions: readonly Transaction[]): Anomaly[] {
  const totals = new Map<Category, { cents: number; count: number }>();
  for (const row of transactions) {
    if (row.amountCents >= 0) continue;
    const total = totals.get(row.category) ?? { cents: 0, count: 0 };
    total.cents -= row.amountCents;
    total.count++;
    totals.set(row.category, total);
  }
  const anomalies: Anomaly[] = [];
  for (const row of transactions) {
    if (row.amountCents >= 0) continue;
    const totalsForCategory = totals.get(row.category)!;
    if (totalsForCategory.count < 4) continue;
    const amount = -row.amountCents;
    const average = (totalsForCategory.cents - amount) / (totalsForCategory.count - 1);
    if (amount >= 2 * average && amount - average >= 2_500) {
      anomalies.push({
        transaction: row,
        averageCents: Math.round(average),
        ratio: amount / average,
      });
    }
  }
  return anomalies.sort(
    (a, b) => b.ratio - a.ratio || b.transaction.date.localeCompare(a.transaction.date),
  );
}
