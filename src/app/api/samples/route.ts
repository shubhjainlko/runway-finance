import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { failure, json } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const index = new URL(request.url).searchParams.get('file');
  const name =
    index === '1' ? 'checking-statement.csv' : index === '2' ? 'card-statement.csv' : null;
  if (!name) return json({ error: 'Select sample file 1 or 2.' }, 400);
  try {
    const csv = await readFile(join(process.cwd(), 'sample-data', name), 'utf8');
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="' + name + '"',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return failure(error);
  }
}
