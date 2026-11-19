'use client';

import { useId, useMemo, useState } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import {
  Banknote,
  CalendarDays,
  ChartNoAxesCombined,
  CircleDollarSign,
  RotateCcw,
  SlidersHorizontal,
  Wallet,
} from 'lucide-react';
import { forecastBaseline, forecastCashFlow, offsetMonth } from '@/lib/analytics';
import { InputError } from '@/lib/model';
import { money } from './ledger-ui';
import type { ScreenProps } from './workspace-types';
import './analysis-views.css';

const wholeDollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const shortMonth = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
const monthYear = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function controlMoney(dollars: number) {
  return Number.isInteger(dollars)
    ? wholeDollars.format(dollars)
    : money(Math.round(dollars * 100));
}

function displayMonth(month: string, short = false) {
  return (short ? shortMonth : monthYear).format(new Date(month + '-01T00:00:00Z'));
}

type BalancePoint = { month: string; baselineCents: number; projectedCents: number };

function valueAxis(points: BalancePoint[]) {
  const values = points.flatMap((point) => [point.baselineCents, point.projectedCents]);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const padding = Math.max(1, high === low ? Math.abs(low) * 0.08 || 100 : (high - low) * 0.06);
  const desired = Math.max(1, (high - low + 2 * padding) / 4);
  const order = 10 ** Math.floor(Math.log10(desired));
  const step = Math.max(
    1,
    Math.round(([1, 2, 2.5, 5, 10].find((x) => x * order >= desired) ?? 10) * order),
  );
  const min = Math.floor((low - padding) / step) * step;
  const max = Math.ceil((high + padding) / step) * step;
  const ticks = Array.from(
    { length: Math.round((max - min) / step) + 1 },
    (_, index) => max - index * step,
  );
  const largestDollars = Math.max(Math.abs(min), Math.abs(max)) / 100;
  const [unit, suffix] = (
    [
      [1_000_000_000_000, 't'],
      [1_000_000_000, 'b'],
      [1_000_000, 'm'],
      [1_000, 'k'],
      [1, ''],
    ] as const
  ).find(([scale]) => largestDollars >= scale && step / (scale * 100) >= 0.0000001) ?? [1, ''];
  const precision = Math.max(0, Math.min(8, Math.ceil(-Math.log10(step / (100 * unit))) + 1));
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: precision,
  });
  return {
    y: (value: number) => (100 * (max - value)) / (max - min),
    ticks,
    label: (value: number) => formatter.format(value / (100 * unit)) + suffix,
  };
}

function ProjectionChart({ points }: { points: BalancePoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const [tabStop, setTabStop] = useState(0);
  const fill = useId().replace(/:/g, '');
  const axis = valueAxis(points);
  const x = (index: number) => (100 * index) / (points.length - 1);
  const vertices = (key: 'baselineCents' | 'projectedCents') =>
    points.map((point, index) => `${x(index)},${axis.y(point[key])}`).join(' ');
  const selected = active !== null ? points[active] : undefined;

  function changePoint(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next =
      event.key === 'ArrowRight'
        ? Math.min(points.length - 1, index + 1)
        : event.key === 'ArrowLeft'
          ? Math.max(0, index - 1)
          : event.key === 'End'
            ? points.length - 1
            : event.key === 'Home'
              ? 0
              : null;
    if (next !== null) {
      event.preventDefault();
      const buttons = event.currentTarget.parentElement?.querySelectorAll('button');
      buttons?.[next]?.focus();
    }
    if (event.key === 'Escape') setActive(null);
  }

  return (
    <figure
      className="fi-chart"
      style={{
        gridTemplateColumns: `${Math.max(4, ...axis.ticks.map((tick) => axis.label(tick).length)) + 1.5}ch minmax(0, 1fr)`,
      }}
      aria-label="Balance projection. Use the left and right arrow keys or hover over a month to inspect the baseline and scenario."
    >
      <div className="fi-chart-y" aria-hidden="true">
        {axis.ticks.map((tick) => (
          <span key={tick} style={{ top: `${axis.y(tick)}%` }}>
            {axis.label(tick)}
          </span>
        ))}
      </div>
      <div className="fi-plot" onPointerLeave={() => setActive(null)}>
        {axis.ticks.map((tick) => (
          <div
            key={tick}
            className={tick === 0 ? 'fi-grid fi-grid-zero' : 'fi-grid'}
            style={{ top: `${axis.y(tick)}%` }}
          />
        ))}
        <svg
          className="fi-plot-lines"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#36a077" stopOpacity=".22" />
              <stop offset="100%" stopColor="#83caae" stopOpacity=".025" />
            </linearGradient>
          </defs>
          <polygon points={`0,100 ${vertices('projectedCents')} 100,100`} fill={`url(#${fill})`} />
          <polyline
            points={vertices('projectedCents')}
            fill="none"
            stroke="#166653"
            strokeWidth="2.8"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            points={vertices('baselineCents')}
            fill="none"
            stroke="#717e78"
            strokeWidth="1.7"
            strokeDasharray="4 5"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {points.map((point, index) => (
          <span
            key={point.month}
            className={active === index ? 'fi-dot fi-dot-active' : 'fi-dot'}
            style={{ left: `${x(index)}%`, top: `${axis.y(point.projectedCents)}%` }}
          />
        ))}
        {active !== null && selected && (
          <>
            <span aria-hidden="true" className="fi-crosshair" style={{ left: `${x(active)}%` }} />
            <div
              className={`fi-tooltip ${active < 2 ? 'at-start' : active > points.length - 3 ? 'at-end' : ''}`}
              style={{
                left: `${x(active)}%`,
                ...(axis.y(selected.projectedCents) < 46 ? { bottom: 9 } : { top: 8 }),
              }}
              aria-hidden="true"
            >
              <strong>
                {displayMonth(selected.month)}
                {active === 0 ? ' · Opening balance' : ''}
              </strong>
              <span>
                Baseline <b>{money(selected.baselineCents)}</b>
              </span>
              <span>
                Scenario <b>{money(selected.projectedCents)}</b>
              </span>
            </div>
          </>
        )}
        <div
          className="fi-chart-hits"
          style={{ gridTemplateColumns: `.5fr repeat(${points.length - 2}, 1fr) .5fr` }}
        >
          {points.map((point, index) => (
            <button
              key={point.month}
              type="button"
              tabIndex={index === tabStop ? 0 : -1}
              aria-label={`${displayMonth(point.month)}. Baseline ${money(point.baselineCents)}. Scenario ${money(point.projectedCents)}.`}
              onPointerEnter={() => setActive(index)}
              onClick={() => setActive(index)}
              onFocus={() => {
                setActive(index);
                setTabStop(index);
              }}
              onBlur={() => setActive(null)}
              onKeyDown={(event) => changePoint(event, index)}
            />
          ))}
        </div>
      </div>
      <div className="fi-chart-x" aria-hidden="true">
        {points.map((point, index) => (
          <span key={point.month} style={{ left: `${x(index)}%` }}>
            {displayMonth(point.month, true)}
          </span>
        ))}
      </div>
    </figure>
  );
}

function RangeControl({
  label,
  icon,
  min,
  max,
  step,
  value,
  format,
  hint,
  onChange,
  disabled = false,
}: {
  label: string;
  icon: ReactNode;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (value: number) => string;
  hint: string;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="fi-control">
      <div className="fi-control-title">
        <label htmlFor={id}>
          {icon}
          {label}
        </label>
        <output htmlFor={id}>{format(value)}</output>
      </div>
      <p id={id + '-hint'}>{hint}</p>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={
          { '--filled': `${max > min ? (100 * (value - min)) / (max - min) : 0}%` } as CSSProperties
        }
        aria-valuetext={format(value)}
        aria-describedby={id + '-hint'}
        disabled={disabled || max <= min}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <div className="fi-range-limits" aria-hidden="true">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}

function moneyRange(maxCents: number) {
  const stepCents =
    maxCents >= 1_000_000
      ? 5_000
      : maxCents >= 200_000
        ? 2_500
        : maxCents >= 50_000
          ? 500
          : maxCents >= 5_000
            ? 100
            : maxCents >= 500
              ? 25
              : 1;
  return { max: (Math.floor(maxCents / stepCents) * stepCents) / 100, step: stepCents / 100 };
}

function nextNiceAmount(value: number) {
  const unit = 10 ** Math.floor(Math.log10(value));
  return ([1, 2, 5, 10].find((n) => n * unit >= value) ?? 10) * unit;
}

export default function Forecast({ workspace, navigate }: ScreenProps) {
  const { transactions } = workspace;
  const [savings, setSavings] = useState(0);
  const [expense, setExpense] = useState(0);
  const [incomeChange, setIncomeChange] = useState(0);
  const history = useMemo(() => forecastBaseline(transactions), [transactions]);
  const savingRange = moneyRange(history.monthlyExpenseCents);
  const expenseRange = moneyRange(
    nextNiceAmount(
      Math.max(100_000, history.monthlyIncomeCents * 2, history.monthlyExpenseCents * 2),
    ),
  );
  const extraSavings = Math.min(savings, savingRange.max);
  const oneTimeExpense = Math.min(expense, expenseRange.max);
  const incomePercent = history.monthlyIncomeCents ? incomeChange : 0;
  const { projections, error } = useMemo(() => {
    try {
      return {
        projections: forecastCashFlow(transactions, {
          extraSavingsCents: Math.round(extraSavings * 100),
          oneTimeExpenseCents: Math.round(oneTimeExpense * 100),
          incomeChangePercent: incomePercent,
        }),
        error: '',
      };
    } catch (cause) {
      if (!(cause instanceof InputError)) throw cause;
      return { projections: [], error: cause.message };
    }
  }, [transactions, extraSavings, oneTimeExpense, incomePercent]);
  const endpoint = projections.at(-1);
  const adjusted = extraSavings > 0 || oneTimeExpense > 0 || incomePercent !== 0;
  const delta = endpoint ? endpoint.projectedCents - endpoint.baselineCents : 0;

  function resetScenario() {
    setSavings(0);
    setExpense(0);
    setIncomeChange(0);
  }

  return (
    <section className="fi-page">
      <header className="page-heading fi-page-heading">
        <div>
          <h1>Cash-flow forecast</h1>
          <p>Explore how changes today affect your balance over the next six months.</p>
        </div>
        {endpoint && (
          <span className="fi-date-range">
            <CalendarDays size={16} aria-hidden="true" />
            {displayMonth(projections[0].month)} – {displayMonth(endpoint.month)}
          </span>
        )}
      </header>
      {error ? (
        <div className="panel fi-empty-panel">
          <span className="fi-large-icon">
            <ChartNoAxesCombined size={26} />
          </span>
          <h2>Forecast exceeds the supported range</h2>
          <p>{error}</p>
          <button
            className="button secondary"
            onClick={adjusted ? resetScenario : () => navigate('transactions')}
          >
            {adjusted ? 'Reset scenario' : 'Review transactions'}
          </button>
        </div>
      ) : !endpoint ? (
        <div className="panel fi-empty-panel">
          <span className="fi-large-icon">
            <ChartNoAxesCombined size={26} />
          </span>
          <h2>Start your forecast</h2>
          <p>
            Import a statement to project six months of cash flow from your income and spending.
          </p>
          <button className="button primary" onClick={() => navigate('import')}>
            Import statement
          </button>
        </div>
      ) : (
        <>
          <div className="fi-forecast-grid">
            <article className="panel fi-projection-panel">
              <div className="fi-card-title">
                <span className="fi-title-icon">
                  <ChartNoAxesCombined size={18} />
                </span>
                <h2>Balance projection</h2>
              </div>
              <div className="fi-forecast-quote">
                <span>Projected balance in {displayMonth(endpoint.month)}</span>
                <strong data-testid="projected-balance">{money(endpoint.projectedCents)}</strong>
                <p className={delta < 0 ? 'fi-loss' : delta > 0 ? 'fi-gain' : ''}>
                  {delta
                    ? `${money(Math.abs(delta))} ${delta > 0 ? 'above' : 'below'} baseline`
                    : 'Matches the baseline projection'}
                </p>
              </div>
              <div className="fi-legend">
                <span>
                  <i className="fi-line-base" />
                  Baseline
                </span>
                <span>
                  <i className="fi-line-plan" />
                  Your scenario
                </span>
              </div>
              <ProjectionChart
                points={[
                  {
                    month: history.asOfMonth,
                    baselineCents: history.startBalanceCents,
                    projectedCents: history.startBalanceCents,
                  },
                  ...projections,
                ]}
              />
              <div className="fi-opening">
                <span>
                  Opening balance <b>{money(history.startBalanceCents)}</b>
                </span>
                <span>Net of all recorded transactions</span>
              </div>
            </article>
            <article className="panel fi-settings">
              <div className="fi-panel-head">
                <div className="fi-card-title">
                  <span className="fi-title-icon">
                    <SlidersHorizontal size={17} />
                  </span>
                  <h2>Scenario controls</h2>
                </div>
                <button
                  className="fi-reset"
                  onClick={resetScenario}
                  disabled={!adjusted}
                  aria-label="Reset scenario"
                >
                  <RotateCcw size={14} />
                  Reset
                </button>
              </div>
              <RangeControl
                label="Extra monthly savings"
                icon={<Wallet size={16} />}
                min={0}
                {...savingRange}
                value={extraSavings}
                format={controlMoney}
                onChange={setSavings}
                hint={
                  savingRange.max
                    ? 'Reduce spending by this amount each month.'
                    : 'Your baseline has no spending to reduce.'
                }
              />
              <RangeControl
                label="One-time expense"
                icon={<CircleDollarSign size={16} />}
                min={0}
                {...expenseRange}
                value={oneTimeExpense}
                format={controlMoney}
                onChange={setExpense}
                hint={`Deduct one payment in ${displayMonth(projections[0].month)}.`}
              />
              <RangeControl
                label="Income change"
                icon={<Banknote size={16} />}
                min={-100}
                max={100}
                step={1}
                value={incomePercent}
                disabled={!history.monthlyIncomeCents}
                format={(value) => `${value > 0 ? '+' : ''}${value}%`}
                onChange={setIncomeChange}
                hint={
                  history.monthlyIncomeCents
                    ? 'Adjust your baseline monthly income.'
                    : 'Your baseline has no income to adjust.'
                }
              />
            </article>
          </div>
          <article className="panel fi-breakdown">
            <div className="fi-breakdown-head">
              <h2>Monthly breakdown</h2>
              <p>
                The baseline uses average income of {money(history.monthlyIncomeCents)} and spending
                of {money(history.monthlyExpenseCents)} per month
                {history.monthsUsed === 1
                  ? ` from ${displayMonth(history.asOfMonth)}.`
                  : ` from ${displayMonth(offsetMonth(history.asOfMonth, 1 - history.monthsUsed))} through ${displayMonth(history.asOfMonth)}.`}
              </p>
            </div>
            <div
              className="fi-table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Forecast balances by month"
            >
              <table className="fi-table fi-breakdown-table">
                <thead>
                  <tr>
                    <th scope="col">Month</th>
                    <th scope="col">Baseline balance</th>
                    <th scope="col">Scenario balance</th>
                    <th scope="col">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {projections.map((point) => {
                    const difference = point.projectedCents - point.baselineCents;
                    return (
                      <tr key={point.month}>
                        <th scope="row">{displayMonth(point.month)}</th>
                        <td>{money(point.baselineCents)}</td>
                        <td className="fi-emphasis">{money(point.projectedCents)}</td>
                        <td
                          className={
                            difference > 0 ? 'fi-gain' : difference < 0 ? 'fi-loss' : 'fi-quiet'
                          }
                        >
                          {money(difference, true)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>
        </>
      )}
    </section>
  );
}
