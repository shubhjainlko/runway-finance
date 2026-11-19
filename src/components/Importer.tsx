'use client';

import { useEffect, useRef, useState } from 'react';
import type { DragEvent, FormEvent } from 'react';
import {
  AlertCircle,
  Check,
  CheckCheck,
  ChevronDown,
  CircleCheck,
  Columns3,
  CreditCard,
  Download,
  FileSpreadsheet,
  FolderOpen,
  Landmark,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import type { ColumnMapping, ImportPreview } from '@/lib/model';
import { MAX_CSV_BYTES } from '@/lib/csv';
import type { ScreenProps } from './workspace-types';
import { CategoryTag, dateLabel, errorText, money, Pagination, StatusTag } from './ledger-ui';

const PREVIEW_SIZE = 8;
const fields: { key: keyof ColumnMapping; label: string }[] = [
  { key: 'date', label: 'Transaction date' },
  { key: 'description', label: 'Description' },
  { key: 'amount', label: 'Signed amount' },
  { key: 'debit', label: 'Debit / money out' },
  { key: 'credit', label: 'Credit / money in' },
  { key: 'type', label: 'Debit or credit indicator' },
];
const examples = [
  {
    id: 1,
    name: 'checking-statement.csv',
    title: 'Checking statement',
    subtitle: 'Signed amount column',
    icon: Landmark,
  },
  {
    id: 2,
    name: 'card-statement.csv',
    title: 'Card statement',
    subtitle: 'Separate debit and credit',
    icon: CreditCard,
  },
];

type Session = { csv: string; source: string; preview?: ImportPreview };
type Phase = 'reading' | 'checking' | 'saving' | '';

async function requestPreview(
  csv: string,
  mapping?: ColumnMapping,
  signal?: AbortSignal,
): Promise<ImportPreview> {
  const response = await fetch('/api/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csv, mapping }),
    signal,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result)
    throw new Error(
      result?.error ??
        'Could not preview this statement. Check that Runway is running and try again.',
    );
  return result as ImportPreview;
}

export default function Importer({ mutate, navigate, notify }: ScreenProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [draft, setDraft] = useState<ColumnMapping | null>(null);
  const [phase, setPhase] = useState<Phase>('');
  const [error, setError] = useState('');
  const [complete, setComplete] = useState<{
    source: string;
    inserted: number;
    duplicates: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [page, setPage] = useState(0);
  const [showAllErrors, setShowAllErrors] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const dragDepth = useRef(0);
  useEffect(() => () => request.current?.abort(), []);

  function clear() {
    request.current?.abort();
    setSession(null);
    setComplete(null);
    setPhase('');
    setError('');
    setDraft(null);
    setShowAllErrors(false);
    setPage(0);
    setDragging(false);
    dragDepth.current = 0;
    if (inputRef.current) inputRef.current.value = '';
  }

  async function start(source: string, getText: (signal: AbortSignal) => Promise<string>) {
    clear();
    const controller = new AbortController();
    request.current = controller;
    setPhase('reading');
    try {
      const csv = await getText(controller.signal);
      if (controller.signal.aborted) return;
      if (!csv.trim())
        throw new Error(
          'This file is empty. Choose a statement with a header and at least one transaction.',
        );
      if (new Blob([csv]).size > MAX_CSV_BYTES)
        throw new Error('Choose a CSV up to 2 MiB or split the statement into smaller files.');
      setSession({ source, csv });
      setPhase('checking');
      const preview = await requestPreview(csv, undefined, controller.signal);
      if (controller.signal.aborted) return;
      setSession({ source, csv, preview });
      setDraft(preview.mapping);
    } catch (cause) {
      if (!controller.signal.aborted) setError(errorText(cause));
    } finally {
      if (!controller.signal.aborted) setPhase('');
    }
  }

  function openFile(file?: File) {
    if (!file || phase === 'saving') return;
    void start(file.name, async () => {
      if (file.size > MAX_CSV_BYTES)
        throw new Error('Choose a CSV up to 2 MiB or split the statement into smaller files.');
      if (!/\.(csv|tsv)$/i.test(file.name))
        throw new Error('Choose a file ending in .csv or .tsv. Export spreadsheets as CSV first.');
      return file.text();
    });
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (event.dataTransfer.files.length > 1) {
      setError('Choose one statement at a time.');
      return;
    }
    openFile(event.dataTransfer.files[0]);
  }

  function openExample(id: number, name: string) {
    void start(name, async (signal) => {
      const response = await fetch(`/api/samples?file=${id}`, { signal });
      if (!response.ok) throw new Error('Could not open the sample file. Please try again.');
      return response.text();
    });
  }

  async function applyMapping(event: FormEvent) {
    event.preventDefault();
    if (!session || !draft || phase) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setPhase('checking');
    setError('');
    try {
      const preview = await requestPreview(session.csv, draft, controller.signal);
      if (controller.signal.aborted) return;
      setSession({ ...session, preview });
      setDraft(preview.mapping);
      setPage(0);
      setShowAllErrors(false);
    } catch (cause) {
      if (!controller.signal.aborted) setError(errorText(cause));
    } finally {
      if (!controller.signal.aborted) setPhase('');
    }
  }

  const result = session?.preview;
  const changed = Boolean(
    result && draft && fields.some(({ key }) => draft[key] !== result.mapping[key]),
  );
  const ready = Boolean(
    result && !changed && !phase && result.errors.length === 0 && result.newCount > 0,
  );

  async function confirmImport() {
    if (!ready || !session || !result) return;
    setPhase('saving');
    setError('');
    try {
      const saved = await mutate({
        action: 'import',
        csv: session.csv,
        source: session.source,
        mapping: result.mapping,
      });
      setComplete({
        source: session.source,
        inserted: saved.inserted ?? 0,
        duplicates: saved.duplicates ?? 0,
      });
      notify('Statement imported.');
      setSession(null);
      setDraft(null);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setPhase('');
    }
  }

  return (
    <section className="lr-screen">
      <header className="lr-heading">
        <div>
          <h1>Statement importer</h1>
          <p>Bring bank transactions into your local ledger from a CSV file.</p>
        </div>
      </header>
      <input
        className="lr-visually-hidden"
        type="file"
        ref={inputRef}
        tabIndex={-1}
        aria-label="Upload bank statement CSV"
        accept=".csv,.tsv,text/csv,text/tab-separated-values"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          openFile(file);
          event.currentTarget.value = '';
        }}
      />
      {error && (
        <div role="alert" className="lr-alert lr-error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}
      <div className="lr-import-layout">
        <div className="lr-import-main">
          {complete ? (
            <section className="panel lr-import-success" aria-live="polite">
              <span className="lr-feature-icon">
                <CircleCheck size={27} />
              </span>
              <h2>Import complete</h2>
              <p className="lr-filename">{complete.source}</p>
              <div className="lr-result-stats">
                <div>
                  <strong>{complete.inserted.toLocaleString('en-US')}</strong>
                  <span>Added to ledger</span>
                </div>
                <div>
                  <strong>{complete.duplicates.toLocaleString('en-US')}</strong>
                  <span>Duplicates skipped</span>
                </div>
              </div>
              <div className="lr-actions">
                <button
                  type="button"
                  className="button primary"
                  onClick={() => navigate('transactions')}
                >
                  View transactions
                </button>
                <button type="button" className="button secondary" onClick={clear}>
                  Import another file
                </button>
              </div>
            </section>
          ) : !session && !phase ? (
            <section className="panel lr-upload-card">
              <div className="lr-panel-heading">
                <div>
                  <h2>Upload a statement</h2>
                  <p>Review the detected columns and transactions before importing.</p>
                </div>
              </div>
              <div
                className={`lr-drop${dragging ? ' lr-drag-active' : ''}`}
                onDragEnter={(event) => {
                  event.preventDefault();
                  dragDepth.current++;
                  setDragging(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'copy';
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  dragDepth.current--;
                  if (dragDepth.current <= 0) setDragging(false);
                }}
                onDrop={drop}
              >
                <span className="lr-upload-icon">
                  <Upload size={26} strokeWidth={1.6} />
                </span>
                <strong>{dragging ? 'Drop your file here' : 'Drag and drop your statement'}</strong>
                <span>CSV or TSV · Up to 2 MiB and 10,000 rows</span>
                <button
                  type="button"
                  className="button primary"
                  onClick={() => inputRef.current?.click()}
                >
                  <FolderOpen size={16} />
                  Choose file
                </button>
              </div>
              <div className="lr-file-hint">
                <CheckCheck size={16} />
                <span>Duplicates are checked against your ledger and within each file.</span>
              </div>
            </section>
          ) : (
            <section className="panel lr-review-card" aria-busy={Boolean(phase)}>
              <div className="lr-panel-heading">
                <div>
                  <h2>Review statement</h2>
                  <p className="lr-filename">{session?.source ?? 'Reading file…'}</p>
                </div>
                <button
                  type="button"
                  className="lr-page-btn"
                  title="Remove statement"
                  aria-label="Remove statement"
                  onClick={clear}
                  disabled={phase === 'saving'}
                >
                  <X size={17} />
                </button>
              </div>
              {phase && (
                <div role="status" className="lr-working">
                  <Loader2 size={16} className="lr-spin" />
                  {phase === 'saving'
                    ? 'Importing transactions…'
                    : phase === 'checking'
                      ? 'Checking columns and duplicate transactions…'
                      : 'Reading statement…'}
                </div>
              )}
              {result && draft && (
                <>
                  <dl className="lr-counts">
                    <div>
                      <dt>New transactions</dt>
                      <dd>{result.newCount.toLocaleString('en-US')}</dd>
                    </div>
                    <div>
                      <dt>Duplicates</dt>
                      <dd>{result.duplicateCount.toLocaleString('en-US')}</dd>
                    </div>
                    <div>
                      <dt>Issues</dt>
                      <dd>{result.errors.length.toLocaleString('en-US')}</dd>
                    </div>
                  </dl>
                  <details
                    className="lr-mapping"
                    key={session?.source}
                    open={
                      result.mapping.date < 0 ||
                      result.mapping.description < 0 ||
                      [result.mapping.amount, result.mapping.debit, result.mapping.credit].every(
                        (index) => index < 0,
                      ) ||
                      undefined
                    }
                  >
                    <summary>
                      <Columns3 size={16} />
                      <span>Column mapping</span>
                      <ChevronDown className="lr-chevron" size={16} />
                    </summary>
                    <form onSubmit={applyMapping}>
                      <p>
                        Map a date, description and either a signed amount or debit and credit
                        columns.
                      </p>
                      <div className="lr-columns">
                        {fields.map(({ key, label }) => (
                          <label key={key}>
                            {label}
                            <select
                              aria-label={`Map ${label.toLowerCase()}`}
                              value={draft[key]}
                              onChange={(event) =>
                                setDraft({
                                  ...draft,
                                  [key]: Number(event.target.value),
                                })
                              }
                              disabled={Boolean(phase)}
                            >
                              <option value={-1}>Unused</option>
                              {result.headers.map((name, index) => (
                                <option key={index} value={index}>
                                  {name || `Column ${index + 1}`}
                                </option>
                              ))}
                            </select>
                          </label>
                        ))}
                      </div>
                      <button
                        type="submit"
                        className="button secondary small"
                        disabled={!changed || Boolean(phase)}
                      >
                        Apply mapping
                      </button>
                    </form>
                  </details>
                  {result.errors.length > 0 && (
                    <div className="lr-review-issues" role="alert">
                      <strong>Resolve these issues before importing</strong>
                      <ul>
                        {(showAllErrors ? result.errors : result.errors.slice(0, 5)).map(
                          (issue, i) => (
                            <li key={`${issue.line}-${i}`}>
                              {issue.line > 0 && <>Line {issue.line}. </>}
                              {issue.message}
                            </li>
                          ),
                        )}
                      </ul>
                      {result.errors.length > 5 && (
                        <button
                          type="button"
                          className="lr-text-button"
                          onClick={() => setShowAllErrors(!showAllErrors)}
                        >
                          {showAllErrors
                            ? 'Show fewer issues'
                            : `Show all ${result.errors.length} issues`}
                        </button>
                      )}
                    </div>
                  )}
                  {result.rows.length > 0 && (
                    <>
                      <div
                        className="table-scroll lr-table-scroll"
                        tabIndex={0}
                        role="region"
                        aria-label="Statement preview table"
                      >
                        <table className="lr-table lr-import-table">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Description</th>
                              <th className="lr-preview-category">Category</th>
                              <th className="lr-num">Amount</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.rows
                              .slice(page * PREVIEW_SIZE, (page + 1) * PREVIEW_SIZE)
                              .map((row) => (
                                <tr key={row.line}>
                                  <td className="lr-date">{dateLabel(row.date)}</td>
                                  <td>
                                    <strong className="lr-description">{row.description}</strong>
                                  </td>
                                  <td className="lr-preview-category">
                                    <CategoryTag category={row.category} />
                                  </td>
                                  <td
                                    className={`lr-num lr-amount ${row.amountCents > 0 ? 'lr-positive' : ''}`}
                                  >
                                    {money(row.amountCents, true)}
                                  </td>
                                  <td>
                                    <StatusTag duplicate={row.duplicate} />
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                      <Pagination
                        total={result.rows.length}
                        size={PREVIEW_SIZE}
                        page={page}
                        onChange={setPage}
                        noun="rows"
                      />
                    </>
                  )}
                  {changed && (
                    <p className="lr-note" role="status">
                      Apply the changed mapping to refresh your preview.
                    </p>
                  )}
                  {!changed && !result.errors.length && !result.newCount && (
                    <p className="lr-note" role="status">
                      {result.duplicateCount
                        ? 'Every transaction in this file is already in your ledger.'
                        : 'This file contains no transactions.'}
                    </p>
                  )}
                  <div className="lr-import-footer">
                    <button
                      type="button"
                      className="button secondary"
                      onClick={clear}
                      disabled={phase === 'saving'}
                    >
                      Choose another file
                    </button>
                    <button
                      type="button"
                      className="button primary"
                      onClick={confirmImport}
                      disabled={!ready}
                    >
                      <Check size={16} />
                      Import {result.newCount.toLocaleString('en-US')}{' '}
                      {result.newCount === 1 ? 'transaction' : 'transactions'}
                    </button>
                  </div>
                </>
              )}
              {!result && !phase && (
                <div className="lr-import-footer">
                  <button type="button" className="button secondary" onClick={clear}>
                    Choose another file
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
        <aside className="panel lr-sample-card">
          <div className="lr-panel-heading">
            <div>
              <h2>Sample statements</h2>
              <p>Explore two common bank export formats.</p>
            </div>
          </div>
          {examples.map(({ id, name, title, subtitle, icon: Icon }) => (
            <div className="lr-sample" key={id}>
              <div className="lr-sample-top">
                <span className="lr-sample-icon">
                  <Icon size={18} strokeWidth={1.65} />
                </span>
                <div>
                  <h3>{title}</h3>
                  <p>{subtitle}</p>
                </div>
              </div>
              <div className="lr-sample-actions">
                <button
                  type="button"
                  className="lr-text-button"
                  disabled={Boolean(phase)}
                  onClick={() => openExample(id, name)}
                  aria-label={`Preview ${title.toLowerCase()}`}
                >
                  <FileSpreadsheet size={14} />
                  Preview file
                </button>
                <a
                  href={`/api/samples?file=${id}`}
                  download={name}
                  aria-label={`Download ${title.toLowerCase()}`}
                >
                  <Download size={14} />
                  Download
                </a>
              </div>
            </div>
          ))}
        </aside>
      </div>
    </section>
  );
}
