import type { Category, ColumnMapping, Workspace } from '@/lib/model';

export const PAGES = [
  'overview',
  'transactions',
  'import',
  'rules',
  'insights',
  'forecast',
  'settings',
] as const;
export type Page = (typeof PAGES)[number];
export const pagePath = (page: Page) => (page === 'overview' ? '/' : '/' + page);
export type Mutation =
  | { action: 'import'; csv: string; source: string; mapping?: Partial<ColumnMapping> }
  | { action: 'bulk'; ids: number[]; category: Category }
  | { action: 'rule'; keyword: string; category: Category }
  | { action: 'deleteRule'; id: number }
  | { action: 'load' }
  | { action: 'reset' };
export interface MutationResult {
  inserted?: number;
  duplicates?: number;
  updated?: number;
}
export interface ScreenProps {
  workspace: Workspace;
  navigate: (page: Page) => void;
  mutate: (payload: Mutation) => Promise<MutationResult>;
  notify: (message: string) => void;
}
