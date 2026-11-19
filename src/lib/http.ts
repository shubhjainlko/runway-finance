import { InputError, isCategory, type Category, type ColumnMapping } from './model';

export const privateHeaders = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const maxBodyBytes = 12 * 1024 * 1024 + 1024;
type Fields = Record<string, unknown>;

class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: privateHeaders });
}

export function failure(error: unknown) {
  if (error instanceof RequestError) return json({ error: error.message }, error.status);
  if (error instanceof InputError) return json({ error: error.message }, 422);
  // Bank descriptions and raw statements must stay out of application logs.
  console.error('Runway could not complete a database or file operation.');
  return json(
    {
      error:
        'The operation could not finish. Check that your local database and sample files are accessible, then retry.',
    },
    500,
  );
}

export async function readJson(request: Request): Promise<Fields> {
  const origin = request.headers.get('origin');
  if (
    request.headers.get('sec-fetch-site') === 'cross-site' ||
    (origin &&
      origin !== new URL(request.url).origin &&
      !sameHost(origin, request.headers.get('host')))
  ) {
    throw new RequestError(403, 'This action must come from your Runway workspace.');
  }
  if (
    request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
  ) {
    throw new RequestError(415, 'Send the request as application/json.');
  }
  if (Number(request.headers.get('content-length') ?? 0) > maxBodyBytes)
    throw new RequestError(413, 'Request is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError(400, 'A JSON body is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > maxBodyBytes) {
        await reader.cancel();
        throw new RequestError(413, 'Request is too large.');
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
  } catch {
    throw new RequestError(400, 'Invalid JSON.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new RequestError(400, 'Expected a JSON object.');
  return body as Fields;
}

function sameHost(origin: string, host: string | null) {
  try {
    const url = new URL(origin);
    return /^https?:$/.test(url.protocol) && url.host === host;
  } catch {
    return false;
  }
}

export function stringField(body: Fields, name: string): string {
  const value = body[name];
  if (typeof value !== 'string' || !value.trim())
    throw new InputError('A valid ' + name + ' is required.');
  return value;
}

export function categoryField(body: Fields): Category {
  if (!isCategory(body.category)) throw new InputError('Choose a listed category.');
  return body.category;
}

export function positiveId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new InputError('Invalid record ID.');
  return value;
}

export function mappingField(body: Fields): Partial<ColumnMapping> | undefined {
  const value = body.mapping;
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new InputError('Invalid column mapping.');
  const fields = ['date', 'description', 'amount', 'debit', 'credit', 'type'];
  for (const [key, index] of Object.entries(value)) {
    if (!fields.includes(key) || !Number.isSafeInteger(index) || index < -1)
      throw new InputError('Invalid column mapping.');
  }
  return value as Partial<ColumnMapping>;
}
