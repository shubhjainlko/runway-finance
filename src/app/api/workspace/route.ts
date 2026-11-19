import {
  addRule,
  bulkCategorize,
  deleteRule,
  getWorkspace,
  importStatement,
  loadSamples,
  resetData,
} from '@/lib/db';
import { InputError } from '@/lib/model';
import {
  categoryField,
  failure,
  json,
  mappingField,
  positiveId,
  readJson,
  stringField,
} from '@/lib/http';
import type { MutationResult } from '@/components/workspace-types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET() {
  try {
    return json(getWorkspace());
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    let result: MutationResult = {};
    switch (body.action) {
      case 'import':
        result = importStatement(
          stringField(body, 'csv'),
          stringField(body, 'source'),
          mappingField(body),
        );
        break;
      case 'bulk':
        if (!Array.isArray(body.ids) || body.ids.length < 1 || body.ids.length > 10000)
          throw new InputError('Select between 1 and 10,000 transactions.');
        result = { updated: bulkCategorize(body.ids.map(positiveId), categoryField(body)) };
        break;
      case 'rule':
        result = { updated: addRule(stringField(body, 'keyword'), categoryField(body)).updated };
        break;
      case 'deleteRule':
        deleteRule(positiveId(body.id));
        break;
      case 'load':
        result = loadSamples();
        break;
      case 'reset':
        resetData();
        break;
      default:
        throw new InputError('Unknown workspace action.');
    }
    return json({ ...result, workspace: getWorkspace() });
  } catch (error) {
    return failure(error);
  }
}
