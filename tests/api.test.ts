import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { ImportPreview, Workspace } from '../src/lib/model';
import { signedStatement } from './fixtures';

function request(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost:3000' + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', ...headers },
    body: JSON.stringify(body),
  });
}

test('route handlers preview, commit, reject invalid input, deduplicate and reset against isolated SQLite', async () => {
  // Node runs test files in independent processes. Never open the user's database.
  process.env.RUNWAY_DB_PATH = ':memory:';
  const workspace = await import('../src/app/api/workspace/route');
  const preview = await import('../src/app/api/preview/route');
  const samples = await import('../src/app/api/samples/route');

  const initial = await workspace.GET();
  const readWorkspace = async () => (await workspace.GET()).json() as Promise<Workspace>;
  assert.equal(initial.headers.get('cache-control'), 'no-store');
  assert.equal(((await initial.json()) as Workspace).mode, 'preview');
  const previewResult = await preview.POST(request('/api/preview', { csv: signedStatement }));
  assert.equal(previewResult.status, 200);
  assert.equal(((await previewResult.json()) as ImportPreview).newCount, 2);

  const post = (body: unknown, headers?: Record<string, string>) =>
    workspace.POST(request('/api/workspace', body, headers));
  const blocked = await post({ action: 'load' }, { 'sec-fetch-site': 'cross-site' });
  assert.equal(blocked.status, 403);
  assert.equal((await readWorkspace()).mode, 'preview');
  const commit = { action: 'import', csv: signedStatement, source: 'activity.csv' };
  const saved = await post(commit);
  const first = (await saved.json()) as {
    inserted: number;
    duplicates: number;
    workspace: Workspace;
  };
  assert.equal(saved.status, 200);
  assert.equal(first.inserted, 2);
  assert.equal(first.duplicates, 0);
  assert.equal(first.workspace.transactions.length, 2);

  const invalid = await post({
    action: 'bulk',
    ids: [first.workspace.transactions[0].id],
    category: 'Unknown option',
  });
  assert.equal(invalid.status, 422);
  assert.deepEqual(await readWorkspace(), first.workspace);
  const again = await post({ ...commit, source: 'same-content.csv' });
  const result = (await again.json()) as { inserted: number; duplicates: number };
  assert.deepEqual([result.inserted, result.duplicates], [0, 2]);

  for (const index of [1, 2]) {
    const file = await samples.GET(new Request('http://localhost:3000/api/samples?file=' + index));
    assert.equal(file.status, 200);
    assert.match(file.headers.get('content-type') ?? '', /^text\/csv/);
    const sample = await preview.POST(request('/api/preview', { csv: await file.text() }));
    const parsed = (await sample.json()) as ImportPreview;
    assert.deepEqual(parsed.errors, []);
    assert.ok(parsed.newCount > 0);
  }

  const cleared = await post({ action: 'reset' });
  assert.equal(cleared.status, 200);
  assert.deepEqual(await readWorkspace(), { mode: 'empty', transactions: [], rules: [] });
});
