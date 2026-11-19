export const signedStatement = [
  '\uFEFFDate,Description,Amount',
  '2026-01-30,"Payroll, Horizon Studio","1,250.95"',
  '2026-01-31,"Books ""and"" More",-49.99',
  '',
].join('\r\n');

export const overlappingStatement = [
  'Date,Description,Amount',
  '2026-01-31,"Books ""and"" More",-49.99',
  '2026-02-01,Books and More,-49.99',
].join('\n');

export const splitStatement = [
  'Posting Date,Description,Debit,Credit',
  '2026-03-07,Green Market,45.70,',
  '2026-03-08,Studio Pay,,"2,899.13"',
].join('\n');
