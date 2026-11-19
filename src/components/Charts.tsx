'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Bar, BarChart, CartesianGrid, Pie, PieChart, XAxis, YAxis } from 'recharts';
import { ChartNoAxesColumn, ChartPie, ChevronDown } from 'lucide-react';
import type { Category, MonthlyPoint } from '../lib/model';
import { money } from './ledger-ui';

const monthFormat = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const shortMonthFormat = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
const shortMoneyFormat = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const fullDollarFormat = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export function monthLabel(month: string) {
  return monthFormat.format(new Date(`${month}-01T12:00:00Z`));
}

export function metricMoney(cents: number) {
  if (Math.abs(cents) >= 10_000_000) return shortMoneyFormat.format(cents / 100);
  return cents % 100 === 0 ? fullDollarFormat.format(cents / 100) : money(cents);
}

function shortMonth(month: string) {
  return shortMonthFormat.format(new Date(`${month}-01T12:00:00Z`));
}

function tickMoney(cents: number) {
  if (cents >= 100000) return shortMoneyFormat.format(cents / 100).toLowerCase();
  return cents % 100 === 0 ? fullDollarFormat.format(cents / 100) : money(cents);
}

function niceTicks(max: number) {
  const roughStep = Math.max(1, max / 4);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const step = Math.ceil(
    ([1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10].find((m) => m * magnitude >= roughStep) ?? 10) *
      magnitude,
  );
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}

function useElementWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setWidth(Math.floor(element.getBoundingClientRect().width));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

function EmptyChart({
  type,
  title,
  detail,
}: {
  type: 'cash' | 'spending';
  title: string;
  detail: string;
}) {
  const Icon = type === 'cash' ? ChartNoAxesColumn : ChartPie;
  return (
    <div className="ov-empty-chart">
      <Icon size={26} strokeWidth={1.5} aria-hidden="true" />
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

const seriesColors = { income: '#256b53', expenses: '#abd2b8' };

export function CashFlowChart({
  series,
  count,
  onCountChange,
}: {
  series: MonthlyPoint[];
  count: number;
  onCountChange: (count: number) => void;
}) {
  const [visible, setVisible] = useState({ income: true, expenses: true });
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const { ref, width } = useElementWidth();
  const max = Math.max(
    0,
    ...series.flatMap((p) => [
      visible.income ? p.incomeCents : 0,
      visible.expenses ? p.expenseCents : 0,
    ]),
  );
  const hasActivity = series.some((p) => p.incomeCents || p.expenseCents);
  const ticks = niceTicks(max || 400);
  const activeMonth = hovered ?? focused ?? pinned;
  const index = series.findIndex((p) => p.month === activeMonth);
  const active = index < 0 ? undefined : series[index];
  const leftAxis = width < 380 ? 42 : 49;
  const plotEnd = 8;
  const tooltipWidth = 168;
  const tooltipLeft = Math.max(
    0,
    Math.min(
      width - tooltipWidth,
      leftAxis +
        ((index + 0.5) * (width - leftAxis - plotEnd)) / Math.max(1, series.length) -
        tooltipWidth / 2,
    ),
  );

  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, position: number) => {
    if (event.key === 'Escape') {
      setHovered(null);
      setFocused(null);
      setPinned(null);
      return;
    }
    let target: number;
    if (event.key === 'ArrowRight') target = Math.min(series.length - 1, position + 1);
    else if (event.key === 'ArrowLeft') target = Math.max(0, position - 1);
    else if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = series.length - 1;
    else return;
    event.preventDefault();
    setHovered(null);
    buttons.current[target]?.focus();
  };

  return (
    <section className="ov-panel ov-cash-panel" aria-labelledby="overview-cash-title">
      <div className="ov-panel-head">
        <div>
          <h2 id="overview-cash-title">Cash flow</h2>
          <p>Monthly income and expenses</p>
        </div>
        <label className="ov-select ov-small-select">
          <span className="ov-sr">Cash flow chart range</span>
          <select value={count} onChange={(e) => onCountChange(Number(e.target.value))}>
            <option value="3">3 months</option>
            <option value="6">6 months</option>
            <option value="12">12 months</option>
          </select>
          <ChevronDown size={14} aria-hidden="true" />
        </label>
      </div>
      <div className="ov-series-legend" aria-label="Cash flow series">
        {(['income', 'expenses'] as const).map((key) => {
          const other = key === 'income' ? 'expenses' : 'income';
          return (
            <button
              key={key}
              type="button"
              aria-pressed={visible[key]}
              aria-disabled={visible[key] && !visible[other]}
              onClick={() => {
                if (visible[key] && !visible[other]) return;
                setVisible((v) => ({ ...v, [key]: !v[key] }));
              }}
              className={!visible[key] ? 'ov-series-off' : undefined}
            >
              <i style={{ backgroundColor: seriesColors[key] }} aria-hidden="true" />
              {key === 'income' ? 'Income' : 'Expenses'}
            </button>
          );
        })}
      </div>
      <div className="ov-chart-frame" ref={ref}>
        {!hasActivity && (
          <EmptyChart
            type="cash"
            title="No cash flow in this period"
            detail="Imported income and expenses will appear here."
          />
        )}
        {hasActivity && width > 0 && (
          <>
            <div aria-hidden="true" className="ov-bars">
              <BarChart
                width={width}
                height={207}
                data={series}
                margin={{ top: 9, right: plotEnd, left: 0, bottom: 0 }}
                barGap={3}
                barCategoryGap="25%"
                accessibilityLayer={false}
              >
                <CartesianGrid vertical={false} stroke="#e1e7e1" strokeDasharray="3 4" />
                <XAxis
                  dataKey="month"
                  interval={width < 480 && series.length > 6 ? 1 : 0}
                  tickFormatter={shortMonth}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={10}
                  height={27}
                  tick={{ fill: '#626e65', fontSize: 12 }}
                />
                <YAxis
                  domain={[0, ticks[ticks.length - 1]]}
                  ticks={ticks}
                  width={leftAxis}
                  tickFormatter={tickMoney}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={8}
                  tick={{ fill: '#68736b', fontSize: 12 }}
                />
                {visible.income && (
                  <Bar
                    dataKey="incomeCents"
                    name="Income"
                    fill={seriesColors.income}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={33}
                    isAnimationActive={false}
                  />
                )}
                {visible.expenses && (
                  <Bar
                    dataKey="expenseCents"
                    name="Expenses"
                    fill={seriesColors.expenses}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={33}
                    isAnimationActive={false}
                  />
                )}
              </BarChart>
            </div>
            <div
              className="ov-chart-hitareas"
              aria-label="Monthly cash flow details"
              role="group"
              style={{ left: leftAxis, right: plotEnd }}
              onPointerLeave={() => setHovered(null)}
            >
              {series.map((p, i) => (
                <button
                  type="button"
                  key={p.month}
                  ref={(element) => {
                    buttons.current[i] = element;
                  }}
                  aria-label={`${monthLabel(p.month)}, income ${money(p.incomeCents)}, expenses ${money(p.expenseCents)}`}
                  className={p.month === activeMonth ? 'ov-active-month' : undefined}
                  onPointerEnter={(e) => {
                    if (e.pointerType !== 'touch') setHovered(p.month);
                  }}
                  onFocus={() => setFocused(p.month)}
                  onBlur={() => setFocused(null)}
                  onKeyDown={(e) => moveFocus(e, i)}
                  onClick={() => setPinned((v) => (v === p.month ? null : p.month))}
                >
                  <span className="ov-sr">{monthLabel(p.month)}</span>
                </button>
              ))}
            </div>
            {active && (
              <div
                className="ov-chart-tooltip"
                style={{ left: tooltipLeft, width: tooltipWidth }}
                aria-hidden="true"
              >
                <strong>{monthLabel(active.month)}</strong>
                {visible.income && (
                  <div>
                    <span>
                      <i style={{ background: seriesColors.income }} />
                      Income
                    </span>
                    <b>{money(active.incomeCents)}</b>
                  </div>
                )}
                {visible.expenses && (
                  <div>
                    <span>
                      <i style={{ background: seriesColors.expenses }} />
                      Expenses
                    </span>
                    <b>{money(active.expenseCents)}</b>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

type SpendingEntry = { category: Category; amountCents: number };
const categoryColors: Record<Category, string> = {
  Housing: '#23664e',
  Groceries: '#84b38e',
  Dining: '#e1ad71',
  Shopping: '#cf985e',
  Transport: '#7b9ba0',
  Subscriptions: '#abc4b8',
  Utilities: '#a2ba76',
  Health: '#7fa69d',
  Travel: '#a08ba8',
  Entertainment: '#cc9c95',
  Income: '#426a55',
  Other: '#d5ddd0',
};

function chartEntries(entries: SpendingEntry[]) {
  const sorted = entries
    .filter((e) => e.amountCents > 0)
    .sort((a, b) => b.amountCents - a.amountCents);
  if (sorted.length <= 4) return sorted;
  const main = sorted.filter((e) => e.category !== 'Other').slice(0, 3);
  const categories = new Set(main.map((e) => e.category));
  return [
    ...main,
    {
      category: 'Other' as const,
      amountCents: sorted.reduce(
        (sum, e) => sum + (categories.has(e.category) ? 0 : e.amountCents),
        0,
      ),
    },
  ];
}

export function SpendingChart({ entries, month }: { entries: SpendingEntry[]; month: string }) {
  const rows = chartEntries(entries);
  const total = rows.reduce((sum, row) => sum + row.amountCents, 0);
  const [hovered, setHovered] = useState<Category | null>(null);
  const [pinned, setPinned] = useState<Category | null>(null);
  const active = rows.find((row) => row.category === (hovered ?? pinned));
  const showCategory = (category: Category) =>
    setPinned((old) => (old === category ? null : category));
  const slices = rows.map((row) => ({
    ...row,
    fill: categoryColors[row.category],
    fillOpacity: !active || active.category === row.category ? 1 : 0.48,
  }));
  const percent = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 }).format(
      amount / total,
    );

  return (
    <section className="ov-panel ov-spend-panel" aria-labelledby="overview-spend-title">
      <div className="ov-panel-head">
        <div>
          <h2 id="overview-spend-title">Spending breakdown</h2>
          <p>Expenses by category</p>
        </div>
      </div>
      {total === 0 ? (
        <EmptyChart
          type="spending"
          title="No expenses this month"
          detail={`No spending recorded for ${monthLabel(month)}.`}
        />
      ) : (
        <div className="ov-spending-body">
          <div className="ov-ring" aria-hidden="true" onMouseLeave={() => setHovered(null)}>
            <PieChart
              width={172}
              height={172}
              accessibilityLayer={false}
              margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
            >
              <Pie
                data={slices}
                dataKey="amountCents"
                nameKey="category"
                cx={86}
                cy={86}
                outerRadius={81}
                innerRadius={63}
                startAngle={90}
                endAngle={-270}
                stroke="#ffffff"
                strokeWidth={2}
                paddingAngle={rows.length > 1 ? 1 : 0}
                isAnimationActive={false}
                rootTabIndex={-1}
                onMouseEnter={(_, i) => setHovered(rows[i]?.category ?? null)}
                onMouseLeave={() => setHovered(null)}
                onClick={(_, i) => {
                  if (rows[i]) showCategory(rows[i].category);
                }}
              />
            </PieChart>
            <div className="ov-ring-center">
              <span>{active?.category ?? 'Total spent'}</span>
              <strong title={money(active?.amountCents ?? total)}>
                {metricMoney(active?.amountCents ?? total)}
              </strong>
            </div>
          </div>
          <div
            className="ov-ring-legend"
            role="group"
            aria-label={`Spending in ${monthLabel(month)}, total ${money(total)}`}
          >
            {rows.map((row) => (
              <button
                key={row.category}
                type="button"
                aria-pressed={pinned === row.category}
                onClick={() => showCategory(row.category)}
                onMouseEnter={() => setHovered(row.category)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(row.category)}
                onBlur={() => setHovered(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setHovered(null);
                    setPinned(null);
                  }
                }}
                title={`${row.category}: ${money(row.amountCents)}`}
                aria-label={`${row.category}, ${money(row.amountCents)}, ${percent(row.amountCents)} of spending`}
              >
                <i style={{ backgroundColor: categoryColors[row.category] }} />
                <span>{row.category}</span>
                <b>{percent(row.amountCents)}</b>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export function Sparkline({
  values,
  inverse = false,
  light = false,
}: {
  values: number[];
  inverse?: boolean;
  light?: boolean;
}) {
  if (values.length < 2) return null;
  const width = 71,
    height = 26,
    inset = 3;
  const min = Math.min(...values),
    range = Math.max(...values) - min;
  const points = values.map((value, i) => {
    const ratio = range === 0 ? 0.5 : (value - min) / range;
    return [
      inset + (i * (width - 2 * inset)) / (values.length - 1),
      inset + (1 - ratio) * (height - 2 * inset),
    ];
  });
  const last = points[points.length - 1];
  const trend = (values[values.length - 1] - values[0]) * (inverse ? -1 : 1);
  const stroke = light ? '#b1ebbc' : trend < 0 ? '#af864f' : '#5c9671';
  return (
    <svg
      width="71"
      height="26"
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
      focusable="false"
      className="ov-sparkline"
    >
      <polyline
        points={points.map((p) => p.join(',')).join(' ')}
        stroke={stroke}
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last[0]} cy={last[1]} r="2.3" fill={stroke} />
    </svg>
  );
}
