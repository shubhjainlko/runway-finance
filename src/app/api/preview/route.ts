import { previewImport } from '@/lib/db';
import { failure, json, mappingField, readJson, stringField } from '@/lib/http';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    return json(previewImport(stringField(body, 'csv'), mappingField(body)));
  } catch (error) {
    return failure(error);
  }
}
