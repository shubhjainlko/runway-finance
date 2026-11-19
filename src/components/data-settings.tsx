'use client';

import {
  Database,
  FileSpreadsheet,
  FlaskConical,
  HardDrive,
  LockKeyhole,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useRef, useState } from 'react';
import type { ScreenProps } from './workspace-types';

const number = new Intl.NumberFormat('en-US');

export function DataSettings({ workspace, mutate, navigate, notify }: ScreenProps) {
  const [busy, setBusy] = useState<'load' | 'reset' | null>(null);
  const [error, setError] = useState('');
  const confirm = useRef<HTMLDialogElement>(null);
  const { mode, transactions, rules } = workspace;
  const count = mode === 'preview' ? 0 : transactions.length;

  async function act(action: 'load' | 'reset') {
    if (busy) return;
    setBusy(action);
    setError('');
    try {
      const result = await mutate({ action });
      if (action === 'reset') {
        confirm.current?.close();
        notify('Workspace reset. Your ledger is empty.');
      } else
        notify(
          result.inserted
            ? 'Loaded ' + number.format(result.inserted) + ' sample transactions.'
            : 'Your workspace already contains all sample transactions.',
        );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'This action could not be completed.');
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="settings-screen">
      <div className="page-heading">
        <div>
          <h1>Workspace data</h1>
          <p>Manage the records stored on this device.</p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="panel data-facts">
          <div className="settings-title">
            <span className="settings-icon">
              <HardDrive size={20} />
            </span>
            <h2>Local database</h2>
          </div>
          <dl>
            <div>
              <dt>Storage</dt>
              <dd>SQLite · USD</dd>
            </div>
            <div>
              <dt>Saved transactions</dt>
              <dd>{number.format(count)}</dd>
            </div>
            <div>
              <dt>Custom rules</dt>
              <dd>{number.format(rules.length)}</dd>
            </div>
            <div>
              <dt>Workspace state</dt>
              <dd>
                {mode === 'preview' ? 'Sample preview' : mode === 'empty' ? 'Empty' : 'Active'}
              </dd>
            </div>
          </dl>
          <div className="settings-note">
            <LockKeyhole size={15} />
            <span>Statements are processed by your local Runway server.</span>
          </div>
        </section>
        <div className="settings-actions">
          <section className="panel settings-card">
            <div className="settings-title">
              <span className="settings-icon">
                <FlaskConical size={20} />
              </span>
              <h2>Sample data</h2>
            </div>
            <p>
              {mode === 'preview'
                ? 'You’re exploring a read-only example. Load its checking and card statements to edit transactions and try category rules.'
                : 'Add the example checking and card statements to your ledger. Repeat loads skip existing transactions.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="button primary"
                disabled={!!busy}
                onClick={() => void act('load')}
              >
                <Database size={16} />
                {busy === 'load' ? 'Loading…' : 'Load sample data'}
              </button>
              <button type="button" className="button secondary" onClick={() => navigate('import')}>
                <FileSpreadsheet size={16} />
                Import a statement
              </button>
            </div>
          </section>
          <section className="panel settings-card">
            <div className="settings-title">
              <span className="settings-icon neutral">
                <RotateCcw size={19} />
              </span>
              <h2>Reset workspace</h2>
            </div>
            <p>
              Clear saved transactions and custom rules. Your original CSV files stay on your
              device.
            </p>
            <button
              type="button"
              className="button danger"
              disabled={!!busy || (mode === 'empty' && !rules.length)}
              onClick={() => {
                setError('');
                confirm.current?.showModal();
              }}
            >
              <Trash2 size={15} />
              Reset data
            </button>
          </section>
        </div>
      </div>
      {error && !confirm.current?.open && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <dialog
        ref={confirm}
        className="confirm-dialog"
        aria-labelledby="reset-title"
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <span className="settings-icon danger-icon">
          <Trash2 size={20} />
        </span>
        <h2 id="reset-title">Reset this workspace?</h2>
        <p>
          {mode === 'preview'
            ? 'This closes the sample preview and opens an empty ledger.'
            : 'This permanently removes ' +
              number.format(count) +
              (count === 1 ? ' transaction and ' : ' transactions and ') +
              number.format(rules.length) +
              (rules.length === 1 ? ' custom rule' : ' custom rules') +
              ' from this device.'}
        </p>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="button secondary"
            autoFocus
            disabled={!!busy}
            onClick={() => confirm.current?.close()}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button destructive"
            disabled={!!busy}
            onClick={() => void act('reset')}
          >
            {busy === 'reset' ? 'Resetting…' : 'Reset workspace'}
          </button>
        </div>
      </dialog>
    </div>
  );
}
