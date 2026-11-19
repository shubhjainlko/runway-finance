'use client';

import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowRight,
  Check,
  CornerDownRight,
  ListFilter,
  ListTree,
  Search,
  Trash2,
} from 'lucide-react';
import { CATEGORIES } from '@/lib/model';
import type { Category } from '@/lib/model';
import { normalizeKeyword } from '@/lib/categories';
import type { ScreenProps } from './workspace-types';
import { CategoryTag, dateLabel, errorText, money, PreviewNotice } from './ledger-ui';

export default function Rules({ workspace, mutate, notify }: ScreenProps) {
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState<Category | ''>('');
  const [removing, setRemoving] = useState<number | null>(null);
  const [pending, setPending] = useState<'save' | 'remove' | ''>('');
  const [error, setError] = useState('');
  const readOnly = workspace.mode === 'preview';
  const normalized = normalizeKeyword(keyword);
  const activeRules = useMemo(
    () => [...workspace.rules].sort((a, b) => b.id - a.id),
    [workspace.rules],
  );
  const matches = useMemo(
    () =>
      normalized
        ? workspace.transactions
            .filter((row) => normalizeKeyword(row.description).includes(normalized))
            .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
        : [],
    [normalized, workspace.transactions],
  );
  const changes = category ? matches.filter((row) => row.category !== category).length : 0;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!normalized || !category || readOnly || pending) return;
    setPending('save');
    setError('');
    try {
      const result = await mutate({
        action: 'rule',
        keyword: keyword.trim(),
        category,
      });
      const count = result.updated ?? 0;
      notify(`Rule saved. Updated ${count} ${count === 1 ? 'transaction' : 'transactions'}.`);
      setKeyword('');
      setCategory('');
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setPending('');
    }
  }
  async function remove(id: number) {
    if (readOnly || pending) return;
    setPending('remove');
    setError('');
    try {
      await mutate({ action: 'deleteRule', id });
      setRemoving(null);
      notify('Rule removed. Existing transactions keep their categories.');
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setPending('');
    }
  }

  return (
    <section className="lr-screen">
      <header className="lr-heading">
        <div>
          <h1>Categorization rules</h1>
          <p>Assign categories automatically when a transaction description contains a keyword.</p>
        </div>
      </header>
      {readOnly && <PreviewNotice mutate={mutate} notify={notify} />}
      {error && (
        <div className="lr-alert lr-error" role="alert">
          {error}
        </div>
      )}
      <div className="lr-rule-layout">
        <section className="panel lr-rule-form-card">
          <div className="lr-panel-heading">
            <div>
              <h2>Create a rule</h2>
              <p>Apply a category to past matches and future imports.</p>
            </div>
          </div>
          <form className="lr-rule-form" onSubmit={save}>
            <label>
              Description contains
              <input
                name="keyword"
                type="text"
                maxLength={100}
                placeholder="e.g. Whole Foods"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                autoComplete="off"
                required
                disabled={Boolean(pending)}
              />
            </label>
            <label>
              Assign category
              <select
                name="category"
                value={category}
                onChange={(event) => setCategory(event.target.value as Category | '')}
                required
                disabled={Boolean(pending)}
              >
                <option value="" disabled>
                  Choose a category
                </option>
                {CATEGORIES.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <div className="lr-rule-footer">
              <span>
                {normalized && category
                  ? `${changes.toLocaleString('en-US')} ${changes === 1 ? 'transaction will change category' : 'transactions will change category'}.`
                  : 'Keywords are case-insensitive.'}
              </span>
              <button
                type="submit"
                className="button primary"
                disabled={!normalized || !category || readOnly || Boolean(pending)}
              >
                <Check size={15} />
                {pending === 'save' ? 'Saving…' : 'Save and apply'}
              </button>
            </div>
          </form>
        </section>
        <section className="panel lr-rule-preview" aria-label="Rule preview">
          <div className="lr-panel-heading">
            <div>
              <h2>Match preview</h2>
              <p aria-live="polite">
                {normalized
                  ? `${matches.length.toLocaleString('en-US')} matching ${matches.length === 1 ? 'transaction' : 'transactions'} in your ledger.`
                  : 'Matches appear in date order.'}
              </p>
            </div>
            <span className="lr-sample-icon">
              <Search size={17} />
            </span>
          </div>
          {matches.length ? (
            <>
              <ul className="lr-match-list">
                {matches.slice(0, 4).map((row) => (
                  <li key={row.id}>
                    <div>
                      <strong>{row.description}</strong>
                      <small>
                        {dateLabel(row.date)} · {money(row.amountCents, true)}
                      </small>
                    </div>
                    <div className="lr-match-target">
                      <CategoryTag category={row.category} />
                      {category && row.category !== category && (
                        <>
                          <ArrowRight size={13} aria-label="becomes" />
                          <CategoryTag category={category} />
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {matches.length > 4 && (
                <p className="lr-match-more">Showing the four most recent matches.</p>
              )}
            </>
          ) : (
            <div className="lr-match-empty">
              <CornerDownRight size={22} strokeWidth={1.5} />
              <span>
                {normalized
                  ? 'No descriptions match this keyword yet. The rule can still apply to future imports.'
                  : 'Enter a keyword to preview matches.'}
              </span>
            </div>
          )}
        </section>
      </div>
      <section className="panel lr-rule-list">
        <div className="lr-panel-heading">
          <div>
            <h2>
              Custom rules <span className="lr-count-badge">{activeRules.length}</span>
            </h2>
            <p>The newest matching rule takes priority over older and built-in rules.</p>
          </div>
        </div>
        {activeRules.length ? (
          <ul className="lr-saved-rules">
            {activeRules.map((rule) => (
              <li key={rule.id}>
                <div className="lr-saved-main">
                  <span className="lr-sample-icon">
                    <ListFilter size={16} />
                  </span>
                  <div>
                    <span className="lr-small-label">Description contains</span>
                    <strong>{rule.keyword}</strong>
                  </div>
                  <span className="lr-rule-arrow">
                    <ArrowRight size={15} aria-label="assigns" />
                  </span>
                  <CategoryTag category={rule.category} />
                  <button
                    type="button"
                    className="lr-delete"
                    aria-label={`Remove rule for ${rule.keyword}`}
                    title="Remove rule"
                    disabled={Boolean(pending)}
                    onClick={() => {
                      setRemoving(removing === rule.id ? null : rule.id);
                      setError('');
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                {removing === rule.id && (
                  <div className="lr-delete-confirm">
                    <p>Remove this rule? Existing transactions keep their current categories.</p>
                    <div className="lr-actions">
                      <button
                        type="button"
                        className="button secondary small"
                        onClick={() => setRemoving(null)}
                        disabled={Boolean(pending)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="button danger small"
                        disabled={Boolean(pending)}
                        onClick={() => remove(rule.id)}
                      >
                        {pending === 'remove' ? 'Removing…' : 'Remove rule'}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="lr-empty lr-rule-empty">
            <span className="lr-feature-icon">
              <ListTree size={22} />
            </span>
            <div>
              <h3>No custom rules yet</h3>
              <p>
                Built-in categories already apply during import. Create a rule above to customize
                them.
              </p>
            </div>
          </div>
        )}
      </section>
    </section>
  );
}
