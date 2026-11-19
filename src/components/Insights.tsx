'use client';

import { useMemo, useState } from 'react';
import {
  Activity,
  CalendarDays,
  CircleDollarSign,
  Repeat2,
  ScanSearch,
  TrendingUp,
} from 'lucide-react';
import { detectAnomalies, detectSubscriptions } from '@/lib/analytics';
import { CategoryIcon, dateLabel, money, Pagination } from './ledger-ui';
import type { ScreenProps } from './workspace-types';
import './analysis-views.css';

const pageSize = 8;
const ratioFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

export default function Insights({ workspace, navigate }: ScreenProps) {
  const { transactions } = workspace;
  const [servicesOnly, setServicesOnly] = useState(false);
  const [chargePage, setChargePage] = useState(0);
  const [anomalyPage, setAnomalyPage] = useState(0);
  const summary = useMemo(() => {
    const charges = detectSubscriptions(transactions);
    const anomalies = detectAnomalies(transactions);
    const monthlyCost = Math.round(
      charges.reduce((total, charge) => {
        const frequency =
          charge.cadence === 'Annual' ? 1 / 12 : charge.cadence === 'Weekly' ? 52 / 12 : 1;
        return total + charge.amountCents * frequency;
      }, 0),
    );
    const excess = anomalies.reduce(
      (total, anomaly) => total + Math.abs(anomaly.transaction.amountCents) - anomaly.averageCents,
      0,
    );
    const through = transactions.reduce(
      (last, transaction) => (last > transaction.date ? last : transaction.date),
      '',
    );
    return { charges, anomalies, monthlyCost, excess, through };
  }, [transactions]);
  const charges = servicesOnly
    ? summary.charges.filter((charge) => charge.category === 'Subscriptions')
    : summary.charges;
  const activeChargePage = Math.min(
    chargePage,
    Math.max(0, Math.ceil(charges.length / pageSize) - 1),
  );
  const activeAnomalyPage = Math.min(
    anomalyPage,
    Math.max(0, Math.ceil(summary.anomalies.length / pageSize) - 1),
  );
  const strongest = summary.anomalies[0];

  return (
    <section className="fi-page">
      <header className="page-heading fi-page-heading">
        <div>
          <h1>Spending insights</h1>
          <p>Review recurring payments and expenses that stand out in your ledger.</p>
        </div>
        {summary.through && (
          <span className="fi-date-range">
            <CalendarDays size={16} aria-hidden="true" />
            Through {dateLabel(summary.through)}
          </span>
        )}
      </header>
      {!transactions.length ? (
        <div className="panel fi-empty-panel">
          <span className="fi-large-icon">
            <ScanSearch size={26} />
          </span>
          <h2>Find patterns in your spending</h2>
          <p>Import a statement to check for repeating payments and unusually large expenses.</p>
          <button className="button primary" onClick={() => navigate('import')}>
            Import statement
          </button>
        </div>
      ) : (
        <>
          <div className="fi-summary-grid">
            <article className="panel fi-insight-metric">
              <span className="fi-title-icon">
                <Repeat2 size={18} />
              </span>
              <h2>Monthly recurring cost</h2>
              <strong>{money(summary.monthlyCost)}</strong>
              <p>
                Monthly equivalent of {summary.charges.length} recurring{' '}
                {summary.charges.length === 1 ? 'payment' : 'payments'}
              </p>
            </article>
            <article className="panel fi-insight-metric">
              <span className="fi-title-icon fi-icon-amber">
                <CircleDollarSign size={18} />
              </span>
              <h2>Above typical spend</h2>
              <strong>{money(summary.excess)}</strong>
              <p>
                Combined excess across {summary.anomalies.length} flagged{' '}
                {summary.anomalies.length === 1 ? 'expense' : 'expenses'}
              </p>
            </article>
            <article className="panel fi-insight-metric">
              <span className="fi-title-icon fi-icon-grey">
                <TrendingUp size={18} />
              </span>
              <h2>Largest deviation</h2>
              <strong>{strongest ? `${ratioFormat.format(strongest.ratio)}×` : '—'}</strong>
              <p>
                {strongest
                  ? `${strongest.transaction.description} vs. other ${strongest.transaction.category.toLowerCase()} expenses`
                  : 'No unusual expenses detected'}
              </p>
            </article>
          </div>
          <article className="panel fi-insight-panel">
            <div className="fi-insight-head">
              <div>
                <div className="fi-card-title">
                  <h2>Recurring payments</h2>
                  <span className="fi-count">{charges.length}</span>
                </div>
                <p>Merchants charging a similar amount on a regular schedule.</p>
              </div>
              <label className="fi-check">
                <input
                  type="checkbox"
                  checked={servicesOnly}
                  onChange={(event) => {
                    setServicesOnly(event.currentTarget.checked);
                    setChargePage(0);
                  }}
                />
                Subscriptions only
              </label>
            </div>
            {charges.length ? (
              <>
                <div
                  className="fi-table-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label="Detected recurring payments"
                >
                  <table className="fi-table fi-insight-table">
                    <thead>
                      <tr>
                        <th scope="col">Merchant</th>
                        <th scope="col">Frequency</th>
                        <th scope="col">Last charge</th>
                        <th scope="col">Next expected</th>
                        <th scope="col">Typical amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {charges
                        .slice(activeChargePage * pageSize, (activeChargePage + 1) * pageSize)
                        .map((charge) => (
                          <tr key={charge.merchant + charge.cadence}>
                            <th scope="row">
                              <div className="fi-merchant">
                                <CategoryIcon category={charge.category} />
                                <span>
                                  <strong>{charge.merchant}</strong>
                                  <small>{charge.category}</small>
                                </span>
                              </div>
                            </th>
                            <td data-label="Frequency">
                              <span className="fi-cadence">
                                <Repeat2 size={13} />
                                {charge.cadence}
                              </span>
                            </td>
                            <td data-label="Last charge">{dateLabel(charge.lastDate)}</td>
                            <td data-label="Next expected">{dateLabel(charge.nextDate)}</td>
                            <td data-label="Typical amount" className="fi-emphasis">
                              {money(charge.amountCents)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {charges.length > pageSize && (
                  <Pagination
                    page={activeChargePage}
                    total={charges.length}
                    size={pageSize}
                    onChange={setChargePage}
                    noun="recurring payments"
                  />
                )}
              </>
            ) : (
              <div className="fi-inline-empty">
                <Repeat2 size={21} aria-hidden="true" />
                <div>
                  <h3>
                    {servicesOnly
                      ? 'No recurring subscription charges'
                      : 'No recurring payments detected'}
                  </h3>
                  <p>
                    {servicesOnly
                      ? 'Clear the filter to include recurring payments from all categories.'
                      : 'A merchant needs at least three similar charges at a regular interval.'}
                  </p>
                </div>
              </div>
            )}
          </article>
          <article className="panel fi-insight-panel">
            <div className="fi-insight-head">
              <div>
                <div className="fi-card-title">
                  <h2>Unusual spending</h2>
                  <span className="fi-count fi-count-amber">{summary.anomalies.length}</span>
                </div>
                <p>
                  Expenses at least twice their category average and at least $25 above it. Each
                  comparison uses three or more other expenses.
                </p>
              </div>
            </div>
            {summary.anomalies.length ? (
              <>
                <div
                  className="fi-table-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label="Flagged transactions with category comparisons"
                >
                  <table className="fi-table fi-insight-table">
                    <thead>
                      <tr>
                        <th scope="col">Transaction</th>
                        <th scope="col">Date</th>
                        <th scope="col">Category average</th>
                        <th scope="col">Actual expense</th>
                        <th scope="col">Ratio to average</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.anomalies
                        .slice(activeAnomalyPage * pageSize, (activeAnomalyPage + 1) * pageSize)
                        .map(({ transaction, averageCents, ratio }) => (
                          <tr key={transaction.id}>
                            <th scope="row">
                              <div className="fi-merchant">
                                <CategoryIcon category={transaction.category} />
                                <span>
                                  <strong>{transaction.description}</strong>
                                  <small>{transaction.category}</small>
                                </span>
                              </div>
                            </th>
                            <td data-label="Date">{dateLabel(transaction.date)}</td>
                            <td data-label="Category average">{money(averageCents)}</td>
                            <td data-label="Actual expense" className="fi-emphasis">
                              {money(Math.abs(transaction.amountCents))}
                            </td>
                            <td data-label="Ratio to average">
                              <span className="fi-anomaly-ratio">{ratioFormat.format(ratio)}×</span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {summary.anomalies.length > pageSize && (
                  <Pagination
                    page={activeAnomalyPage}
                    total={summary.anomalies.length}
                    size={pageSize}
                    onChange={setAnomalyPage}
                    noun="flagged expenses"
                  />
                )}
              </>
            ) : (
              <div className="fi-inline-empty">
                <Activity size={21} aria-hidden="true" />
                <div>
                  <h3>No unusually large expenses detected</h3>
                  <p>Your recorded spending has no transactions that meet both thresholds.</p>
                </div>
              </div>
            )}
          </article>
        </>
      )}
    </section>
  );
}
