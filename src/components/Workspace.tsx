'use client';

import {
  Activity,
  ArrowUpFromLine,
  ChartNoAxesColumn,
  ChevronRight,
  Database,
  FlaskConical,
  LayoutDashboard,
  ListFilter,
  LoaderCircle,
  Menu,
  PanelLeft,
  Rows3,
  Settings2,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Workspace } from '@/lib/model';
import {
  pagePath,
  type Mutation,
  type MutationResult,
  type Page,
  type ScreenProps,
} from './workspace-types';
import Overview from './Overview';
import Importer from './Importer';
import Ledger from './Ledger';
import Rules from './Rules';
import Insights from './Insights';
import Forecast from './Forecast';
import { DataSettings } from './data-settings';

const screenNames: Record<Page, string> = {
  overview: 'Overview',
  transactions: 'Transactions',
  import: 'Import statements',
  rules: 'Category rules',
  insights: 'Insights',
  forecast: 'Cash-flow forecast',
  settings: 'Workspace data',
};
const navGroups: { title: string; items: [Page, LucideIcon][] }[] = [
  {
    title: 'Workspace',
    items: [
      ['overview', LayoutDashboard],
      ['transactions', Rows3],
      ['import', ArrowUpFromLine],
    ],
  },
  {
    title: 'Analysis',
    items: [
      ['insights', Activity],
      ['forecast', ChartNoAxesColumn],
      ['rules', ListFilter],
    ],
  },
];
const WorkspaceContext = createContext<ScreenProps | null>(null);
const syncChannel = 'runway-local-workspace-v1';

function Logo() {
  return (
    <Link href="/" className="brand" aria-label="Runway overview">
      <span className="brand-symbol" aria-hidden="true">
        <svg viewBox="0 0 64 64" fill="currentColor">
          <path d="M10 43 34 17h11L21 43zM26 43l16-17h10L36 43zM41 43l8-9h9l-8 9z" />
        </svg>
      </span>
      <span>Runway</span>
    </Link>
  );
}

function Sidebar({
  current,
  workspace,
  onClose,
  load,
  loading,
}: {
  current: Page;
  workspace: Workspace;
  onClose?: () => void;
  load: () => void;
  loading: boolean;
}) {
  const navLink = (page: Page, Icon: LucideIcon) => (
    <Link
      key={page}
      href={pagePath(page)}
      onClick={onClose}
      aria-current={current === page ? 'page' : undefined}
      className={'nav-link' + (current === page ? ' active' : '')}
    >
      <Icon size={18} strokeWidth={1.7} aria-hidden="true" />
      <span>{screenNames[page]}</span>
    </Link>
  );
  return (
    <div className="sidebar-inner">
      <div className="brand-row">
        <Logo />
        {onClose && (
          <button className="icon-button" onClick={onClose} aria-label="Close navigation">
            <X size={20} />
          </button>
        )}
      </div>
      <nav aria-label={onClose ? 'Mobile workspace' : 'Workspace'} className="primary-nav">
        {navGroups.map((group) => (
          <section key={group.title} className="nav-group">
            <h2 className="sidebar-label">{group.title}</h2>
            {group.items.map(([page, Icon]) => navLink(page, Icon))}
          </section>
        ))}
      </nav>
      <div className="sidebar-footer">
        {navLink('settings', Settings2)}
        <div className="sidebar-database">
          <div className="database-heading">
            <span className="db-icon">
              <Database size={17} strokeWidth={1.7} />
            </span>
            <div>
              <strong>{workspace.mode === 'preview' ? 'Demo workspace' : 'Local workspace'}</strong>
              <span>
                {workspace.mode === 'preview'
                  ? 'Read-only sample data'
                  : workspace.transactions.length.toLocaleString('en-US') + ' transactions'}
              </span>
            </div>
          </div>
          {workspace.mode !== 'live' && (
            <button type="button" className="sample-load" disabled={loading} onClick={load}>
              {loading ? <LoaderCircle size={14} className="spin" /> : <FlaskConical size={14} />}
              Load sample data
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function WorkspaceShell({
  initial,
  children,
}: {
  initial: Workspace;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const current = (pathname.split('/')[1] || 'overview') as Page;
  const [workspace, setWorkspace] = useState(initial);
  const [loadingSamples, setLoadingSamples] = useState(false);
  const [toast, setToast] = useState('');
  const [refreshError, setRefreshError] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revision = useRef(0);
  const pending = useRef(0);
  const broadcast = useRef<BroadcastChannel | null>(null);

  const notify = useCallback((message: string) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(message);
    timer.current = setTimeout(() => setToast(''), 5200);
  }, []);

  const refresh = useCallback(async () => {
    if (pending.current) return;
    const ticket = ++revision.current;
    try {
      const response = await fetch('/api/workspace', { cache: 'no-store' });
      if (!response.ok) throw new Error('Refresh failed');
      const state: Workspace = await response.json();
      if (ticket === revision.current) {
        setWorkspace(state);
        setRefreshError(false);
      }
    } catch {
      if (ticket === revision.current) setRefreshError(true);
    }
  }, []);

  useEffect(() => {
    const channel =
      typeof BroadcastChannel === 'function' ? new BroadcastChannel(syncChannel) : null;
    broadcast.current = channel;
    if (channel) channel.onmessage = () => void refresh();
    const onFocus = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      channel?.close();
      broadcast.current = null;
      document.removeEventListener('visibilitychange', onFocus);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [refresh]);

  useEffect(() => {
    document.title = (screenNames[current] || 'Workspace') + ' | Runway';
    dialog.current?.close();
  }, [current]);

  const mutate = useCallback(
    async (payload: Mutation): Promise<MutationResult> => {
      ++revision.current;
      ++pending.current;
      try {
        const response = await fetch('/api/workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'The change could not be saved.');
        setWorkspace(result.workspace);
        setRefreshError(false);
        broadcast.current?.postMessage('changed');
        return {
          inserted: result.inserted,
          duplicates: result.duplicates,
          updated: result.updated,
        };
      } finally {
        pending.current--;
        if (pending.current === 0) void refresh();
      }
    },
    [refresh],
  );

  const navigate = useCallback(
    (page: Page) => {
      router.push(pagePath(page));
    },
    [router],
  );
  async function loadSamples() {
    if (loadingSamples) return;
    setLoadingSamples(true);
    try {
      const result = await mutate({ action: 'load' });
      notify(
        result.inserted
          ? 'Loaded ' + result.inserted + ' sample transactions.'
          : 'All sample transactions are already in your workspace.',
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Sample data could not be loaded.');
    } finally {
      setLoadingSamples(false);
    }
  }
  const sideProps = { current, workspace, load: loadSamples, loading: loadingSamples };

  return (
    <WorkspaceContext.Provider value={{ workspace, navigate, mutate, notify }}>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <div className="app-frame">
        <aside className="desktop-sidebar">
          <Sidebar {...sideProps} />
        </aside>
        <div className="main-column">
          <header className="topbar">
            <div className="topbar-path">
              <button
                className="icon-button menu-open"
                aria-label="Open navigation"
                onClick={() => dialog.current?.showModal()}
              >
                <Menu size={20} />
              </button>
              <PanelLeft
                className="breadcrumb-icon"
                size={17}
                strokeWidth={1.7}
                aria-hidden="true"
              />
              <span className="crumb-parent">Workspace</span>
              <ChevronRight size={14} className="crumb-divider" aria-hidden="true" />
              <span className="crumb-current">{screenNames[current] || 'Workspace'}</span>
            </div>
            <div className="topbar-status">
              {workspace.mode === 'preview' && (
                <Link className="preview-indicator" href="/settings">
                  <FlaskConical size={13} />
                  <span>Sample preview</span>
                </Link>
              )}
              <span className="local-indicator">
                <span className="status-dot" />
                <span>Local only</span>
              </span>
            </div>
          </header>
          <main id="main-content" tabIndex={-1} className="main-content">
            {refreshError && (
              <div className="connection-message" role="status">
                The local server couldn’t refresh your data.{' '}
                <button onClick={() => void refresh()}>Retry</button>
              </div>
            )}
            {children}
          </main>
        </div>
      </div>
      <dialog
        ref={dialog}
        className="mobile-drawer"
        aria-label="Workspace navigation"
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current.close();
        }}
      >
        <Sidebar {...sideProps} onClose={() => dialog.current?.close()} />
      </dialog>
      {toast && (
        <div className="app-toast" role="status">
          <span>{toast}</span>
          <button type="button" aria-label="Dismiss notification" onClick={() => setToast('')}>
            <X size={15} />
          </button>
        </div>
      )}
    </WorkspaceContext.Provider>
  );
}

export function WorkspaceView({ page }: { page: Page }) {
  const props = useContext(WorkspaceContext);
  if (!props) throw new Error('Workspace is unavailable.');
  switch (page) {
    case 'overview':
      return (
        <Overview
          transactions={props.workspace.transactions}
          isDemo={props.workspace.mode === 'preview'}
          onNavigate={props.navigate}
        />
      );
    case 'transactions':
      return <Ledger {...props} />;
    case 'import':
      return <Importer {...props} />;
    case 'rules':
      return <Rules {...props} />;
    case 'insights':
      return <Insights {...props} />;
    case 'forecast':
      return <Forecast {...props} />;
    case 'settings':
      return <DataSettings {...props} />;
  }
}
