import type { Metadata } from 'next';
import '@fontsource-variable/dm-sans/wght.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './globals.css';
import { WorkspaceShell } from '@/components/Workspace';
import { getWorkspace } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const metadata: Metadata = {
  title: 'Runway | Personal Finance',
  description: 'Your local workspace for transactions, spending insights, and cash-flow planning.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Browser extensions can add attributes to the document element before
    // React starts. The application subtree still receives hydration checks.
    <html lang="en" suppressHydrationWarning>
      <body>
        <WorkspaceShell initial={getWorkspace()}>{children}</WorkspaceShell>
      </body>
    </html>
  );
}
