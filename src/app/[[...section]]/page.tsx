import { notFound } from 'next/navigation';
import { WorkspaceView } from '@/components/Workspace';
import { PAGES, type Page } from '@/components/workspace-types';

type Params = Promise<{ section?: string[] }>;

export default async function PageView({ params }: { params: Params }) {
  const { section = [] } = await params;
  const page = section[0] ?? 'overview';
  if (section.length > 1 || !PAGES.includes(page as Page)) notFound();
  return <WorkspaceView page={page as Page} />;
}
