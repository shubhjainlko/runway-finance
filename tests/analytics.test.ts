import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  detectAnomalies,
  detectSubscriptions,
  forecastCashFlow,
  monthSeries,
  spendingByCategory,
} from '../src/lib/analytics';
import { categorize } from '../src/lib/categories';
import type { Category, Rule, Transaction } from '../src/lib/model';

function entry(
  id: number,
  date: string,
  amountCents: number,
  category: Category,
  description = 'Example merchant',
): Transaction {
  return { id, date, amountCents, category, description, source: 'test.csv' };
}

const quarter = ['2025-10', '2025-11', '2025-12'].flatMap((month, index) => [
  entry(index * 2 + 1, month + '-01', 200000, 'Income'),
  entry(index * 2 + 2, month + '-04', -100000, 'Housing'),
]);

test('dashboard totals use signed cash flow, fill missing months and group only expenses by category', () => {
  const ledger = [
    entry(1, '2026-01-10', -100, 'Housing'),
    entry(2, '2026-03-01', 20000, 'Income'),
    entry(3, '2026-03-04', -1500, 'Dining'),
    entry(4, '2026-03-05', -500, 'Dining'),
    entry(5, '2026-03-06', -9000, 'Shopping'),
    entry(6, '2026-04-01', 10000, 'Income'),
  ];
  assert.deepEqual(monthSeries(ledger, '2026-03', 3), [
    { month: '2026-01', incomeCents: 0, expenseCents: 100, netCents: -100, savingsRate: 0 },
    { month: '2026-02', incomeCents: 0, expenseCents: 0, netCents: 0, savingsRate: 0 },
    { month: '2026-03', incomeCents: 20000, expenseCents: 11000, netCents: 9000, savingsRate: 45 },
  ]);
  assert.deepEqual(spendingByCategory(ledger, '2026-03'), [
    { category: 'Shopping', amountCents: 9000 },
    { category: 'Dining', amountCents: 2000 },
  ]);
});

test('forecasts the next six months from the observed balance including a year rollover', () => {
  const points = forecastCashFlow(quarter);
  assert.deepEqual(
    points.map((point) => point.month),
    ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'],
  );
  assert.deepEqual(
    points.map((point) => point.baselineCents),
    [400000, 500000, 600000, 700000, 800000, 900000],
  );
  assert.deepEqual(
    points.map((point) => point.projectedCents),
    points.map((point) => point.baselineCents),
  );
});

test('adds recurring savings, changes income per month and applies a one-time expense just once', () => {
  const points = forecastCashFlow(quarter, {
    extraSavingsCents: 10000,
    oneTimeExpenseCents: 5000,
    incomeChangePercent: -10,
  });
  // The ledger ends at $3,000. Each scenario month then adds $1,800 - $900.
  assert.deepEqual(
    points.map((point) => point.projectedCents),
    [385000, 475000, 565000, 655000, 745000, 835000],
  );
  assert.deepEqual(
    points.map((point) => point.baselineCents),
    [400000, 500000, 600000, 700000, 800000, 900000],
  );
});

test('uses only recent activity for monthly averages while keeping the entire ledger in the opening balance', () => {
  const oldIncome = entry(7, '2025-05-10', 900000, 'Income');
  const unsorted = [
    quarter[2],
    oldIncome,
    quarter[5],
    quarter[0],
    quarter[1],
    quarter[4],
    quarter[3],
  ];
  const points = forecastCashFlow(unsorted);
  assert.equal(points[0].baselineCents, 1300000);
  assert.equal(points[5].baselineCents, 1800000);
});

test('counts missing calendar months and rounds income, expenses and adjusted income to cents', () => {
  const history = [
    entry(1, '2025-10-02', 101, 'Income'),
    entry(2, '2025-10-05', -4, 'Other'),
    entry(3, '2025-12-02', 201, 'Income'),
  ];
  // $3.02 / 3 -> $1.01 income; $0.04 / 3 -> $0.01 expense. Current balance is $2.98.
  const points = forecastCashFlow(history, { incomeChangePercent: 50 });
  assert.equal(points[0].baselineCents, 398);
  assert.equal(points[5].baselineCents, 898);
  assert.equal(points[0].projectedCents, 449);
  assert.equal(points[5].projectedCents, 1204);
});

test('preserves negative projected balances and caps extra savings at the actual monthly spend', () => {
  const history = [
    entry(1, '2026-06-01', 10000, 'Income'),
    entry(2, '2026-06-12', -12000, 'Housing'),
  ];
  const points = forecastCashFlow(history, { extraSavingsCents: 50000 });
  assert.equal(points[0].baselineCents, -4000);
  assert.equal(points[5].baselineCents, -14000);
  assert.equal(points[0].projectedCents, 8000);
  assert.equal(points[5].projectedCents, 58000);
  assert.deepEqual(forecastCashFlow([]), []);
});

test('rejects invalid or unsafe forecast inputs and supports a complete income loss', () => {
  assert.throws(() => forecastCashFlow(quarter, { oneTimeExpenseCents: 2.5 }));
  assert.throws(() => forecastCashFlow(quarter, { extraSavingsCents: -50 }));
  assert.throws(() => forecastCashFlow(quarter, { incomeChangePercent: -101 }));
  assert.throws(() => forecastCashFlow(quarter, { incomeChangePercent: Infinity }));
  const points = forecastCashFlow(quarter, { incomeChangePercent: -100 });
  assert.deepEqual(
    points.map((point) => point.projectedCents),
    [200000, 100000, 0, -100000, -200000, -300000],
  );
});

test('honors newer custom merchant rules, case-insensitive matching, and a default fallback', () => {
  const rules: Rule[] = [
    { id: 8, keyword: 'north books', category: 'Shopping' },
    { id: 1, keyword: 'north', category: 'Travel' },
  ];
  assert.equal(categorize('NORTH BOOKS #28', -599, rules), 'Shopping');
  assert.equal(categorize('North Station', -499, rules), 'Travel');
  assert.equal(categorize('NETFLIX.COM', -1599), 'Subscriptions');
  assert.equal(categorize('Some Unrecognizable Shop', -251), 'Other');
});

test('identifies regular negative charges, including months with different day counts', () => {
  const ledger = [
    ...['2026-01-31', '2026-02-28', '2026-03-31'].map((date, index) =>
      entry(index, date, -1599, 'Subscriptions', 'Cloud Media'),
    ),
    ...['2026-03-12', '2026-03-19', '2026-03-26'].map((date, index) =>
      entry(index + 3, date, -599, 'Subscriptions', 'Weekly Digest'),
    ),
    ...['2026-01-02', '2026-02-02', '2026-03-02'].map((date, index) =>
      entry(index + 6, date, 10000, 'Income', 'Recurring Income'),
    ),
    entry(9, '2026-02-05', -800, 'Shopping', 'One Visit'),
  ];
  const subscriptions = detectSubscriptions(ledger);
  assert.equal(subscriptions.length, 2);
  const monthly = subscriptions.find((item) => item.merchant === 'Cloud Media');
  assert.ok(monthly);
  assert.equal(monthly.cadence, 'Monthly');
  assert.equal(monthly.amountCents, 1599);
  assert.equal(monthly.occurrences, 3);
  assert.equal(monthly.lastDate, '2026-03-31');
  assert.equal(monthly.nextDate, '2026-04-30');
  assert.equal(subscriptions.find((item) => item.merchant === 'Weekly Digest')?.cadence, 'Weekly');
});

test('lapsed, irregular or substantially variable merchant charges do not count as active subscriptions', () => {
  const ledger = [
    ...['2025-06-01', '2025-07-01', '2025-08-01'].map((date, i) =>
      entry(i + 1, date, -2000, 'Subscriptions', 'Canceled Media'),
    ),
    ...['2026-01-02', '2026-02-16', '2026-03-21'].map((date, i) =>
      entry(i + 4, date, -2000, 'Other', 'Irregular Visits'),
    ),
    ...['2026-01-01', '2026-02-01', '2026-03-01'].map((date, i) =>
      entry(i + 7, date, -(i + 1) * 5000, 'Shopping', 'General Store'),
    ),
  ];
  assert.deepEqual(detectSubscriptions(ledger), []);
});

test('compares outliers with other expenses in the same category and excludes deposits', () => {
  const ledger = [
    entry(1, '2026-03-01', -1000, 'Dining'),
    entry(2, '2026-03-02', -2000, 'Dining'),
    entry(3, '2026-03-03', -3000, 'Dining'),
    entry(4, '2026-03-04', -10000, 'Dining'),
    entry(5, '2026-03-05', -900000, 'Travel'),
    entry(6, '2026-03-06', 200000, 'Dining'),
  ];
  const anomalies = detectAnomalies(ledger);
  assert.deepEqual(
    anomalies.map((item) => item.transaction.id),
    [4],
  );
  assert.equal(anomalies[0].averageCents, 2000);
  assert.equal(anomalies[0].ratio, 5);
});

test('requires three peer expenses, a twofold ratio and a $25 difference before flagging', () => {
  const charges = (amounts: number[]) =>
    amounts.map((cents, index) => entry(index + 1, '2026-03-0' + (index + 1), -cents, 'Travel'));
  assert.deepEqual(detectAnomalies(charges([2500, 2500, 8000])), []);
  assert.deepEqual(detectAnomalies(charges([500, 500, 500, 1600])), []);
  assert.deepEqual(detectAnomalies(charges([5000, 5000, 5000, 8900])), []);
  assert.deepEqual(
    detectAnomalies(charges([2500, 2500, 2500, 5000])).map((item) => item.transaction.id),
    [4],
  );
});
