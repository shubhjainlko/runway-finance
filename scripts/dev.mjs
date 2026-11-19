import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cli = require.resolve('next/dist/bin/next');
// Local preview runners use both hostname spellings. Passing an explicit
// port to Next already requests that exact port.
const args = process.argv
  .slice(2)
  .filter((arg) => arg !== '--strictPort')
  .map((arg) => (arg === '--host' ? '--hostname' : arg));
if (!args.includes('--hostname') && !args.includes('-H')) {
  args.push('--hostname', '127.0.0.1');
}
process.argv = [process.execPath, cli, 'dev', ...args];
require(cli);
