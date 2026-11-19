# Runway

Runway is a single-user, local-first personal finance workspace. Import bank statements, review monthly cash flow, categorize spending, and model the next six months. Transactions and rules live in a SQLite file on the machine running the app. The interface, charts, and fonts are served locally.

## Run locally

Install **Node.js 24 LTS** and npm. Unzip the project, then run these commands in the folder containing `package.json`. They work in PowerShell, Command Prompt, and a macOS or Linux terminal.

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:3000**. Keep that terminal open while using Runway. Press **Ctrl+C** to stop. The first install downloads the project dependencies. No account, API key, database server, or environment file is required.

To build and run the production server, stop the development server first.

```sh
npm run build
npm start
```

The production server uses the same address and database. For reproducible dependency installation from the included lockfile, use `npm ci`.

## First session

1. Open **Overview**. The first visit displays a read-only sample ledger. The month selector sets the reporting period for the metrics and recent activity. The chart range and legend control the cash-flow graph. Hover, focus, or tap the chart to inspect values.
2. Choose **Load sample data** to save editable sample records, or **Import statements** to start your own ledger directly. Importing into the initial preview saves only the rows you confirm. Loading samples into an active ledger adds any missing sample transactions.
3. In **Import statements**, drop a file or choose it from disk. Check column mapping, inspect the preview, and resolve any listed issues before confirming. The two bundled example files can also be previewed and downloaded from this screen.
4. In **Transactions**, search, filter, select rows, and apply a category to the selection. In **Category rules**, add a keyword and choose its category. Saving applies the rule to matching saved descriptions and future imports.
5. Open **Insights** for recurring charges and unusual expenses. Open **Cash-flow forecast** to compare a baseline with a scenario. Moving a slider updates the forecast without changing the ledger.
6. **Workspace data → Reset data** asks for confirmation, then clears transactions and custom rules. The workspace stays empty across restarts. The original CSVs remain available.

## Input files

| File | Format |
| --- | --- |
| `sample-data/checking-statement.csv` | Checking account with a signed amount column |
| `sample-data/card-statement.csv` | Card activity with separate debit and credit columns |

Use UTF-8 CSV or TSV. Runway detects commas, semicolons, or tabs and supports quoted fields, escaped quotes, a byte-order mark, and multiline descriptions. Each file may contain up to **10,000 data rows** and **2 MiB**. Choose a date, a description, and either a signed amount or debit/credit columns. A recognized transaction-type column can supply the direction of an amount. Preview the signs before importing. The application represents one **USD** ledger and stores signed integer cents.

ISO dates such as `2026-10-31` are unambiguous. Numeric slash dates default to month-first. The parser uses day-first ordering if the statement supplies unambiguous day-first evidence. Convert ambiguous day-first dates to ISO before importing. Keep a consistent date convention within each statement.

A duplicate has the same calendar date, normalized description, and signed amount, irrespective of its filename. The database enforces this key, including imports from overlapping files or simultaneous requests. Two genuinely separate payments with exactly those same fields share a key. Include a distinct bank reference in the description when they need to remain separate.

## Calculations

| Measure | Calculation |
| --- | --- |
| Net cash flow | Income less the absolute value of expenses in the selected month |
| Monthly burn rate | Total cash outflows in the selected month |
| Savings rate | Net cash flow divided by income, expressed as a percentage |
| Forecast opening balance | Sum of the signed amounts in the imported ledger |
| Monthly forecast baseline | Mean monthly income and expenses over the latest three calendar months of recorded history, or the shorter available span. Empty months within the span count as zero. |
| Extra monthly savings | A recurring reduction in projected spending, capped at average monthly expenses |
| Income change | Percentage adjustment applied to average monthly income |
| One-time expense | An extra outflow in the first forecast month that carries through to subsequent balances |

The forecast runs for the six months following the last dated transaction. Its opening balance reflects only the imported history. A partially imported month contributes its recorded totals. Transfers between accounts and credit-card repayments appear as recorded inflows or outflows if imported. Choose input statements accordingly when interpreting the totals.

Recurring detection looks for at least three recent payments to a normalized merchant with similar amounts and weekly, monthly, or annual intervals. **Subscriptions only** narrows the list by category. Expected dates are estimates relative to the latest data in the ledger. An expense is flagged when it is at least twice the mean of three or more other expenses in its category and at least $25 above that mean. Recategorizing updates these comparisons.

Built-in keyword patterns classify common merchants. Custom rules use a case-insensitive literal substring and take priority, with the newest matching rule first. Saving a new rule can change an earlier manual category on matching rows. Removing a rule preserves the categories already assigned.

## Storage and backup

Run from the project root. On first use, Runway creates `data/runway.sqlite`. To back up, stop all Runway processes and copy the `data` folder. Restore by putting the backed-up folder back in that location while the app is stopped. The local database and imported data are excluded from source control.

To choose a different file, create `.env.local` in the project root, then restart Runway. A relative path is resolved from the project root.

```dotenv
RUNWAY_DB_PATH=./data/personal.sqlite
NEXT_TELEMETRY_DISABLED=1
```

The default launch commands bind to loopback. Runway uses the local operating-system account as its access boundary. SQLite files and backups are ordinary files on your disk. Use the device's file permissions and disk encryption for sensitive data.

## Verify

```sh
npm test
npm run typecheck
npm run build
```

Tests use temporary or in-memory databases. They cover CSV parsing and column detection, duplicate identification and concurrent imports, category rules, recurring payments, anomalies, forecasting math, and the API import/reset workflow.

## Project layout

```text
sample-data/             Two fictional bank exports
src/app/                 Next.js App Router pages and API routes
src/components/          Dashboard, importer, ledger, rules, insights, forecast
src/lib/                 CSV parser, categorizer, SQLite store, analytics
src/proxy.ts             Loopback hostname checks
tests/                   Unit and integration tests
```

Built with Next.js, TypeScript, Tailwind CSS, Recharts, and better-sqlite3. If npm reports a native module error after changing Node versions, switch to Node.js 24 LTS and run `npm ci` again. On a platform without a matching better-sqlite3 prebuilt binary, npm needs Python and a C++ toolchain to compile it.
