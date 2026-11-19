import { openLedger } from '../../src/lib/db';
import { signedStatement } from '../fixtures';

const ledger = openLedger(process.argv[2]);
try {
  const result = ledger.importStatement(signedStatement, 'batch.csv');
  process.stdout.write(JSON.stringify(result));
} finally {
  ledger.close();
}
