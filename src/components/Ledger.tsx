'use client';

import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ListFilter,
  Search,
  SlidersHorizontal,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import { CATEGORIES } from '@/lib/model';
import { MAX_CSV_ROWS as BULK_LIMIT } from '@/lib/csv';
import type { Category } from '@/lib/model';
import type { ScreenProps } from './workspace-types';
import {
  CategoryIcon,
  CategoryTag,
  dateLabel,
  errorText,
  money,
  Pagination,
  PreviewNotice,
} from './ledger-ui';

const PAGE_SIZE = 20;
type Sort = { field: 'date' | 'amount'; direction: 'asc' | 'desc' };

export default function Ledger({ workspace, navigate, mutate, notify }: ScreenProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [flow, setFlow] = useState('');
  const [sort, setSort] = useState<Sort>({ field: 'date', direction: 'desc' });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [destination, setDestination] = useState<Category | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const readOnly = workspace.mode === 'preview';
  const hasFilter = Boolean(query.trim() || category || flow);
  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    const matches = workspace.transactions.filter((row) => {
      if (category && row.category !== category) return false;
      if (flow === 'in' && row.amountCents <= 0) return false;
      if (flow === 'out' && row.amountCents >= 0) return false;
      return (
        !search ||
        [row.description, row.date, row.source, row.category].some((value) =>
          value.toLowerCase().includes(search),
        )
      );
    });
    return matches.sort((a, b) => {
      const delta =
        sort.field === 'date' ? a.date.localeCompare(b.date) : a.amountCents - b.amountCents;
      return (sort.direction === 'asc' ? delta : -delta) || b.id - a.id;
    });
  }, [workspace.transactions, query, category, flow, sort]);
  const shownPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1));
  const visible = filtered.slice(shownPage * PAGE_SIZE, (shownPage + 1) * PAGE_SIZE);
  const chosen = filtered.filter((row) => selected.has(row.id));
  const allOnPage = visible.length > 0 && visible.every((row) => selected.has(row.id));
  const someOnPage = visible.some((row) => selected.has(row.id));

  function resetSelection() {
    setSelected(new Set());
    setDestination('');
    setError('');
  }
  function resetView() {
    setPage(0);
    resetSelection();
  }
  function clearFilters() {
    setQuery('');
    setCategory('');
    setFlow('');
    resetView();
  }
  function selectRow(id: number) {
    setSelected((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else if (next.size < BULK_LIMIT) next.add(id);
      return next;
    });
  }
  function selectPage() {
    setSelected((old) => {
      const next = new Set(old);
      visible.forEach((row) => {
        if (allOnPage) next.delete(row.id);
        else if (next.size < BULK_LIMIT) next.add(row.id);
      });
      return next;
    });
  }
  function toggleSort(field: Sort['field']) {
    setSort({
      field,
      direction: sort.field === field && sort.direction === 'desc' ? 'asc' : 'desc',
    });
    setPage(0);
  }
  async function applyCategory() {
    if (busy || readOnly || !chosen.length || !destination) return;
    setBusy(true);
    setError('');
    try {
      const result = await mutate({
        action: 'bulk',
        ids: chosen.map((row) => row.id),
        category: destination,
      });
      const count = result.updated ?? chosen.length;
      notify(`Updated ${count} ${count === 1 ? 'transaction' : 'transactions'} to ${destination}.`);
      resetSelection();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  const dateSort =
    sort.field !== 'date' ? 'none' : sort.direction === 'asc' ? 'ascending' : 'descending';
  const amountSort =
    sort.field !== 'amount' ? 'none' : sort.direction === 'asc' ? 'ascending' : 'descending';
  const DateIcon =
    sort.field !== 'date' ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
  const AmountIcon =
    sort.field !== 'amount' ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;

  return (
    <section className="lr-screen">
      <header className="lr-heading">
        <div>
          <h1>Transactions</h1>
          <p>
            {workspace.transactions.length.toLocaleString('en-US')}{' '}
            {workspace.transactions.length === 1 ? 'entry' : 'entries'} in your{' '}
            {readOnly ? 'sample ' : ''}ledger. Select transactions to update their category.
          </p>
        </div>
        <div className="lr-actions">
          <button type="button" className="button secondary" onClick={() => navigate('rules')}>
            <SlidersHorizontal size={15} />
            Manage rules
          </button>
          <button type="button" className="button primary" onClick={() => navigate('import')}>
            <Upload size={15} />
            Import statement
          </button>
        </div>
      </header>
      {readOnly && <PreviewNotice mutate={mutate} notify={notify} />}
      <section className="panel lr-ledger-panel" aria-label="Transaction ledger">
        <div className="lr-filter-bar">
          <label className="lr-search">
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              aria-label="Search transactions"
              placeholder="Search transactions…"
              value={query}
              disabled={busy}
              onChange={(event) => {
                setQuery(event.target.value);
                resetView();
              }}
            />
          </label>
          <div className="lr-filter-selects">
            <select
              aria-label="Filter by category"
              value={category}
              disabled={busy}
              onChange={(event) => {
                setCategory(event.target.value);
                resetView();
              }}
            >
              <option value="">All categories</option>
              {CATEGORIES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <select
              aria-label="Filter by transaction type"
              value={flow}
              disabled={busy}
              onChange={(event) => {
                setFlow(event.target.value);
                resetView();
              }}
            >
              <option value="">All types</option>
              <option value="in">Money in</option>
              <option value="out">Money out</option>
            </select>
          </div>
        </div>
        {chosen.length > 0 && !readOnly && (
          <div className="lr-bulk">
            <div>
              <ListFilter size={16} />
              <strong>{chosen.length.toLocaleString('en-US')} selected</strong>
              {allOnPage && chosen.length < Math.min(filtered.length, BULK_LIMIT) && (
                <button
                  type="button"
                  className="lr-text-button"
                  disabled={busy}
                  onClick={() =>
                    setSelected(new Set(filtered.slice(0, BULK_LIMIT).map((row) => row.id)))
                  }
                >
                  {filtered.length > BULK_LIMIT ? 'Select first' : 'Select all'}{' '}
                  {Math.min(filtered.length, BULK_LIMIT).toLocaleString('en-US')} results
                </button>
              )}
            </div>
            <div>
              <select
                aria-label="New category for selected transactions"
                value={destination}
                onChange={(event) => setDestination(event.target.value as Category | '')}
                disabled={busy}
              >
                <option value="">Choose category</option>
                {CATEGORIES.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <button
                type="button"
                className="button primary small"
                disabled={!destination || busy}
                onClick={applyCategory}
              >
                <Check size={15} />
                {busy ? 'Applying…' : 'Apply'}
              </button>
              <button
                type="button"
                className="lr-page-btn"
                aria-label="Clear selection"
                onClick={resetSelection}
                disabled={busy}
              >
                <X size={15} />
              </button>
            </div>
          </div>
        )}
        {error && (
          <div role="alert" className="lr-alert lr-error">
            {error}
          </div>
        )}
        {filtered.length ? (
          <>
            <div
              className="table-scroll lr-table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Transaction table"
            >
              <table className="lr-table lr-ledger-table">
                <thead>
                  <tr>
                    <th scope="col" className="lr-checkcell">
                      <input
                        type="checkbox"
                        aria-label="Select all transactions on this page"
                        checked={allOnPage}
                        ref={(elem) => {
                          if (elem) elem.indeterminate = someOnPage && !allOnPage;
                        }}
                        onChange={selectPage}
                        disabled={readOnly || busy || (!allOnPage && selected.size >= BULK_LIMIT)}
                      />
                    </th>
                    <th scope="col">Transaction</th>
                    <th scope="col" className="lr-ledger-date" aria-sort={dateSort}>
                      <button type="button" className="lr-sort" onClick={() => toggleSort('date')}>
                        Date <DateIcon size={12} />
                      </button>
                    </th>
                    <th scope="col" className="lr-ledger-category">
                      Category
                    </th>
                    <th scope="col" className="lr-num" aria-sort={amountSort}>
                      <button
                        type="button"
                        className="lr-sort"
                        onClick={() => toggleSort('amount')}
                      >
                        Amount <AmountIcon size={12} />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr
                      key={row.id}
                      className={selected.has(row.id) && !readOnly ? 'lr-selected' : ''}
                    >
                      <td className="lr-checkcell">
                        <input
                          type="checkbox"
                          aria-label={`Select ${row.description}, ${dateLabel(row.date)}, ${money(row.amountCents)}`}
                          checked={selected.has(row.id)}
                          onChange={() => selectRow(row.id)}
                          disabled={
                            readOnly ||
                            busy ||
                            (!selected.has(row.id) && selected.size >= BULK_LIMIT)
                          }
                        />
                      </td>
                      <td>
                        <div className="lr-merchant">
                          <CategoryIcon category={row.category} />
                          <span className="lr-merchant-copy">
                            <strong className="lr-description">{row.description}</strong>
                            <small className="lr-ledger-source">{row.source}</small>
                            <span className="lr-mobile-meta">
                              {dateLabel(row.date)} · {row.category}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className="lr-date lr-ledger-date">{dateLabel(row.date)}</td>
                      <td className="lr-ledger-category">
                        <CategoryTag category={row.category} />
                      </td>
                      <td
                        className={`lr-num lr-amount ${row.amountCents > 0 ? 'lr-positive' : ''}`}
                      >
                        {money(row.amountCents, true)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              total={filtered.length}
              page={shownPage}
              size={PAGE_SIZE}
              onChange={setPage}
              noun="transactions"
            />
          </>
        ) : (
          <div className="lr-empty">
            <span className="lr-feature-icon">
              {hasFilter ? <Search size={24} /> : <Wallet size={24} />}
            </span>
            <h2>{hasFilter ? 'No matching transactions' : 'Your ledger is empty'}</h2>
            <p>
              {hasFilter
                ? 'Try a different search or remove the filters.'
                : 'Import a bank statement to see your transactions here.'}
            </p>
            <button
              type="button"
              className="button secondary"
              onClick={hasFilter ? clearFilters : () => navigate('import')}
            >
              {hasFilter ? 'Clear filters' : 'Import statement'}
            </button>
          </div>
        )}
      </section>
    </section>
  );
}
