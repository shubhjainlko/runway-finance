'use client';

import { useState } from 'react';
import {
  Briefcase,
  Bus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Coffee,
  CreditCard,
  FlaskConical,
  HeartPulse,
  House,
  Package,
  Plane,
  ShoppingBag,
  ShoppingCart,
  Tag,
  Ticket,
  Zap,
} from 'lucide-react';
import type { Category } from '@/lib/model';
import type { ScreenProps } from './workspace-types';
import './ledger.css';

const moneyFormat = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});
const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

export function money(cents: number, signed = false) {
  const formatted = moneyFormat.format(Math.abs(cents) / 100);
  if (cents < 0) return `−${formatted}`;
  return signed && cents > 0 ? `+${formatted}` : formatted;
}

export function dateLabel(date: string) {
  return dateFormat.format(new Date(`${date}T12:00:00Z`));
}

export function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Something interrupted this action. Please try again.';
}

export function CategoryIcon({ category }: { category: Category }) {
  const Icon =
    {
      Income: Briefcase,
      Housing: House,
      Groceries: ShoppingCart,
      Dining: Coffee,
      Shopping: ShoppingBag,
      Transport: Bus,
      Subscriptions: CreditCard,
      Utilities: Zap,
      Health: HeartPulse,
      Travel: Plane,
      Entertainment: Ticket,
      Other: Package,
    }[category] ?? Tag;
  return (
    <span className={`lr-merchant-icon lr-tint-${category.toLowerCase()}`} aria-hidden="true">
      <Icon size={17} strokeWidth={1.65} />
    </span>
  );
}

export function CategoryTag({ category }: { category: Category }) {
  return (
    <span className={`lr-category lr-tint-${category.toLowerCase()}`}>
      <i aria-hidden="true" />
      {category}
    </span>
  );
}

export function PreviewNotice({ mutate, notify }: Pick<ScreenProps, 'mutate' | 'notify'>) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await mutate({ action: 'load' });
      notify(`Loaded ${result.inserted ?? 0} sample transactions.`);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="lr-preview-notice">
      <FlaskConical size={17} aria-hidden="true" />
      <p>
        <strong>Sample preview.</strong> Load the sample transactions to edit them.
      </p>
      <button className="button secondary small" type="button" onClick={load} disabled={loading}>
        {loading ? 'Loading…' : 'Load sample data'}
      </button>
      {error && (
        <span className="lr-inline-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function Pagination({
  page,
  total,
  size,
  onChange,
  noun = 'entries',
}: {
  page: number;
  total: number;
  size: number;
  onChange: (value: number) => void;
  noun?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  const first = total ? page * size + 1 : 0;
  return (
    <div className="lr-pagination">
      <span>
        {first.toLocaleString('en-US')}–{Math.min((page + 1) * size, total).toLocaleString('en-US')}{' '}
        of {total.toLocaleString('en-US')} {noun}
      </span>
      <div>
        <button
          type="button"
          aria-label={`Previous page of ${noun}`}
          className="lr-page-btn"
          disabled={page <= 0}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <span>
          Page {page + 1} of {pages}
        </span>
        <button
          type="button"
          aria-label={`Next page of ${noun}`}
          className="lr-page-btn"
          disabled={page + 1 >= pages}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

export function StatusTag({ duplicate }: { duplicate: boolean }) {
  return (
    <span className={`lr-status ${duplicate ? 'lr-status-duplicate' : 'lr-status-new'}`}>
      {!duplicate && <CheckCircle2 size={12} aria-hidden="true" />}
      {duplicate ? 'Duplicate' : 'New'}
    </span>
  );
}
