'use client';

import { useMemo, useState } from 'react';
import {
  Activity,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  ChevronDown,
  CircleAlert,
  Flame,
  Minus,
  PiggyBank,
  Repeat2,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import {
  detectAnomalies,
  detectSubscriptions,
  latestMonth,
  monthSeries,
  spendingByCategory,
} from '../lib/analytics';
import type { Transaction } from '../lib/model';
import { CashFlowChart, metricMoney, monthLabel, Sparkline, SpendingChart } from './Charts';
import { CategoryIcon, CategoryTag, money } from './ledger-ui';
import './dashboard.css';

type OverviewPage = 'transactions' | 'insights' | 'forecast' | 'import';
export interface OverviewProps {
  transactions: Transaction[];
  onNavigate: (page: OverviewPage) => void;
  isDemo?: boolean;
}

const rateFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const fullDate = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const transactionDate = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const rate = (value: number) => rateFormat.format(value);
const parseDate = (iso: string) => new Date(`${iso}T12:00:00Z`);

interface MetricProps {
  label: string;
  definition: string;
  icon: LucideIcon;
  value: string;
  exactValue?: string;
  series: number[];
  change: number | null;
  inverse?: boolean;
  featured?: boolean;
  points?: boolean;
}

function MetricCard({
  label,
  definition,
  icon: Icon,
  value,
  exactValue,
  series,
  change,
  inverse = false,
  featured = false,
  points = false,
}: MetricProps) {
  const rounded = change === null ? null : Number(change.toFixed(1));
  const Sign =
    rounded === null || rounded === 0 ? Minus : rounded > 0 ? ArrowUpRight : ArrowDownLeft;
  const direction =
    rounded === null || rounded === 0
      ? 'steady'
      : rounded > 0 !== inverse
        ? 'positive'
        : 'negative';
  const changeText = rounded === null ? null : `${rate(Math.abs(rounded))}${points ? ' pts' : '%'}`;
  return (
    <article
      className={`ov-metric${featured ? ' ov-metric-featured' : ''}`}
      title={definition}
      aria-label={`${label}, ${exactValue ?? value}. ${definition}`}
    >
      <div className="ov-metric-head">
        <span className="ov-metric-icon">
          <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
        </span>
        <span>{label}</span>
      </div>
      <strong
        className={`ov-metric-value${value.length > 9 ? ' ov-long-value' : ''}`}
        title={exactValue}
      >
        {value}
      </strong>
      <div className="ov-metric-bottom">
        <div
          className="ov-change"
          aria-label={
            rounded === null
              ? 'No comparable prior month'
              : `${rounded > 0 ? 'Up' : rounded < 0 ? 'Down' : 'Unchanged by'} ${changeText} versus last month`
          }
        >
          {changeText && (
            <span className={`ov-change-value ov-${direction}`}>
              <Sign size={13} strokeWidth={2.2} aria-hidden="true" />
              {changeText}
            </span>
          )}
          <span className="ov-change-caption">
            {changeText ? 'vs last month' : 'No comparison'}
          </span>
        </div>
        {series.length > 0 && <Sparkline values={series} inverse={inverse} light={featured} />}
      </div>
    </article>
  );
}

function difference(current: number, previous: number) {
  return previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100;
}

export default function Overview({ transactions, onNavigate }: OverviewProps) {
  const [selectedMonth, setMonth] = useState('');
  const [count, setCount] = useState(6);
  const months = useMemo(() => {
    const recorded = new Set(transactions.map((t) => t.date.slice(0, 7)));
    if (!recorded.size) recorded.add(latestMonth(transactions));
    return [...recorded].sort().reverse();
  }, [transactions]);
  const month = months.includes(selectedMonth) ? selectedMonth : months[0];
  const history = useMemo(() => monthSeries(transactions, month, 6), [transactions, month]);
  const chartHistory = useMemo(
    () => (count === 6 ? history : monthSeries(transactions, month, count)),
    [count, history, month, transactions],
  );
  const current = history[history.length - 1],
    previous = history[history.length - 2];
  const monthlyTransactions = useMemo(
    () =>
      transactions
        .filter((t) => t.date.slice(0, 7) === month)
        .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id),
    [transactions, month],
  );
  const entries = useMemo(() => spendingByCategory(transactions, month), [transactions, month]);
  const insightData = useMemo(() => {
    const throughMonth = transactions.filter((t) => t.date.slice(0, 7) <= month);
    const recurring = detectSubscriptions(throughMonth);
    const unusual = detectAnomalies(throughMonth)
      .filter((a) => a.transaction.date.slice(0, 7) === month)
      .sort((a, b) => b.ratio - a.ratio);
    return { recurring, unusual };
  }, [transactions, month]);
  const priorActivity = Boolean(previous.incomeCents || previous.expenseCents);
  const metricHistory = (field: 'netCents' | 'incomeCents' | 'expenseCents' | 'savingsRate') =>
    transactions.length > 0
      ? history
          .filter(
            (p) =>
              p.month >= months[months.length - 1] &&
              (field !== 'savingsRate' || p.incomeCents > 0),
          )
          .map((p) => p[field])
      : [];
  const recurringCount = insightData.recurring.length,
    unusualCount = insightData.unusual.length;
  const largestOutlier = insightData.unusual[0];

  return (
    <div className="runway-overview">
      <header className="ov-heading">
        <div>
          <h1>Financial overview</h1>
          <p>
            {transactions.length ? (
              <>
                {monthlyTransactions.length.toLocaleString('en-US')}{' '}
                {monthlyTransactions.length === 1 ? 'transaction' : 'transactions'} this period{' '}
                <span aria-hidden="true">·</span> USD
              </>
            ) : (
              'Import a statement to see your monthly cash flow.'
            )}
          </p>
        </div>
        <div className="ov-heading-actions">
          <label className="ov-select ov-month-select">
            <CalendarDays size={16} aria-hidden="true" />
            <span className="ov-sr">Reporting month</span>
            <select value={month} onChange={(event) => setMonth(event.target.value)}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </label>
          <button type="button" className="ov-import-button" onClick={() => onNavigate('import')}>
            <Upload size={16} aria-hidden="true" />
            Import statement
          </button>
        </div>
      </header>

      <section className="ov-metrics" aria-label="Monthly financial metrics">
        <MetricCard
          label="Net cash flow"
          definition="Income less expenses for the reporting month."
          icon={ArrowLeftRight}
          value={metricMoney(current.netCents)}
          exactValue={money(current.netCents)}
          series={metricHistory('netCents')}
          change={priorActivity ? difference(current.netCents, previous.netCents) : null}
          featured
        />
        <MetricCard
          label="Monthly income"
          definition="Total incoming transactions for the reporting month."
          icon={Banknote}
          value={metricMoney(current.incomeCents)}
          exactValue={money(current.incomeCents)}
          series={metricHistory('incomeCents')}
          change={priorActivity ? difference(current.incomeCents, previous.incomeCents) : null}
        />
        <MetricCard
          label="Monthly burn rate"
          definition="Total outgoing transactions for the reporting month."
          icon={Flame}
          value={metricMoney(current.expenseCents)}
          exactValue={money(current.expenseCents)}
          series={metricHistory('expenseCents')}
          change={priorActivity ? difference(current.expenseCents, previous.expenseCents) : null}
          inverse
        />
        <MetricCard
          label="Savings rate"
          definition="Net cash flow divided by income for the reporting month."
          icon={PiggyBank}
          value={current.incomeCents ? `${rate(current.savingsRate)}%` : '—'}
          series={metricHistory('savingsRate')}
          change={
            current.incomeCents && previous.incomeCents
              ? current.savingsRate - previous.savingsRate
              : null
          }
          points
        />
      </section>

      <div className="ov-dashboard-grid">
        <CashFlowChart key={month} series={chartHistory} count={count} onCountChange={setCount} />
        <SpendingChart key={`spend-${month}`} entries={entries} month={month} />

        <section
          className="ov-panel ov-transactions-panel"
          aria-labelledby="overview-transactions-title"
        >
          <div className="ov-panel-head">
            <h2 id="overview-transactions-title">Recent transactions</h2>
            <button
              type="button"
              className="ov-text-link"
              onClick={() => onNavigate('transactions')}
            >
              View all<span className="ov-sr"> transactions</span>
            </button>
          </div>
          {monthlyTransactions.length ? (
            <div className="ov-table-wrap">
              <table className="ov-transactions">
                <thead>
                  <tr>
                    <th scope="col">Description</th>
                    <th scope="col" className="ov-tx-category">
                      Category
                    </th>
                    <th scope="col" className="ov-tx-date">
                      Date
                    </th>
                    <th scope="col">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyTransactions.slice(0, 5).map((t) => (
                    <tr key={t.id}>
                      <td>
                        <div className="ov-merchant">
                          <CategoryIcon category={t.category} />
                          <div className="ov-merchant-copy">
                            <span title={t.description}>{t.description}</span>
                            <small>
                              {transactionDate.format(parseDate(t.date))}
                              <span className="ov-tx-small-category"> · {t.category}</span>
                            </small>
                          </div>
                        </div>
                      </td>
                      <td className="ov-tx-category">
                        <CategoryTag category={t.category} />
                      </td>
                      <td className="ov-tx-date">
                        <time dateTime={t.date} title={fullDate.format(parseDate(t.date))}>
                          {transactionDate.format(parseDate(t.date))}
                        </time>
                      </td>
                      <td
                        className={t.amountCents > 0 ? 'ov-incoming' : undefined}
                        title={money(t.amountCents, true)}
                      >
                        {money(t.amountCents, true)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="ov-empty-table">No transactions recorded this month.</p>
          )}
        </section>

        <section className="ov-panel ov-insights-panel" aria-labelledby="overview-insights-title">
          <div className="ov-panel-head">
            <h2 id="overview-insights-title">Insights</h2>
            <button type="button" className="ov-text-link" onClick={() => onNavigate('insights')}>
              View all<span className="ov-sr"> insights</span>
            </button>
          </div>
          <div className="ov-insight-list">
            <div className="ov-insight">
              <span className="ov-insight-icon">
                <Repeat2 size={18} aria-hidden="true" />
              </span>
              <div>
                <h3>Recurring charges</h3>
                <p>
                  {recurringCount
                    ? `${recurringCount} recurring ${recurringCount === 1 ? 'merchant' : 'merchants'} detected.`
                    : 'No recurring pattern detected yet.'}
                </p>
              </div>
              <strong className="ov-insight-count">{recurringCount}</strong>
            </div>
            <div className="ov-insight">
              <span className={`ov-insight-icon ${unusualCount ? 'ov-alert-icon' : ''}`}>
                {unusualCount ? (
                  <CircleAlert size={18} aria-hidden="true" />
                ) : (
                  <Activity size={18} aria-hidden="true" />
                )}
              </span>
              <div>
                <h3>Unusual spending</h3>
                <p>
                  {unusualCount
                    ? `${unusualCount} ${unusualCount === 1 ? 'charge exceeds its' : 'charges exceed their'} category average.`
                    : 'No unusual spending this month.'}
                </p>
              </div>
              <strong className={`ov-insight-count ${unusualCount ? 'ov-alert-count' : ''}`}>
                {unusualCount}
              </strong>
            </div>
            {largestOutlier && (
              <div className="ov-outlier">
                <div>
                  <span>Largest outlier</span>
                  <strong title={largestOutlier.transaction.description}>
                    {largestOutlier.transaction.description}
                  </strong>
                </div>
                <b>{rate(largestOutlier.ratio)}× usual</b>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
