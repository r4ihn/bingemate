import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { LOG_DIR } from './io.js';
import { toCsv } from './csv.js';

type Reject = Record<string, unknown>;

/**
 * Per-step audit trail. Everything goes to the console and to processed/logs/etl.log; rows a step
 * drops or blanks are written to processed/logs/<step>.rejects.csv; counts land in summary.json.
 */
export class StepLog {
  private readonly stats: Record<string, number> = {};
  private readonly logged = new Set<string>();
  private readonly warnings: string[] = [];
  private readonly rejects: Reject[] = [];

  constructor(readonly step: string) {
    mkdirSync(LOG_DIR, { recursive: true });
    this.write('INFO', 'start');
  }

  info(message: string): void {
    this.write('INFO', message);
  }

  warn(message: string): void {
    this.warnings.push(message);
    this.write('WARN', message);
  }

  /** Record a named count (rows in, rows out, rows fixed, rows dropped). */
  count(label: string, n: number): void {
    this.stats[label] = n;
    this.logged.add(label);
    this.write('STAT', `${label} = ${n}`);
  }

  /** Increment a counter by one. */
  bump(label: string): void {
    this.stats[label] = (this.stats[label] ?? 0) + 1;
  }

  /** Keep the row that was dropped or blanked, with the reason, for the reject file. */
  reject(reason: string, row: Reject): void {
    this.rejects.push({ reason, ...row });
    this.bump(`rejected: ${reason}`);
  }

  finish(): void {
    for (const [label, n] of Object.entries(this.stats)) {
      if (!this.logged.has(label)) this.write('STAT', `${label} = ${n}`);
    }
    if (this.rejects.length > 0) {
      const columns = [...new Set(this.rejects.flatMap((r) => Object.keys(r)))];
      writeFileSync(`${LOG_DIR}${this.step}.rejects.csv`, toCsv(columns, this.rejects));
      this.write('INFO', `wrote ${this.rejects.length} rejects to ${this.step}.rejects.csv`);
    }
    const summaryPath = `${LOG_DIR}summary.json`;
    const summary = existsSync(summaryPath)
      ? (JSON.parse(readFileSync(summaryPath, 'utf8')) as Record<string, unknown>)
      : {};
    summary[this.step] = {
      finishedAt: new Date().toISOString(),
      stats: this.stats,
      warnings: this.warnings,
    };
    writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n');
    this.write('INFO', 'done');
  }

  private write(level: string, message: string): void {
    const line = `${new Date().toISOString()} ${level.padEnd(4)} [${this.step}] ${message}`;
    console.log(line);
    appendFileSync(`${LOG_DIR}etl.log`, line + '\n');
  }
}
