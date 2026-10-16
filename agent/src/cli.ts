import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { run } from './runner.ts';

const { values } = parseArgs({ options: {
  repo: { type: 'string', default: '..' }, mode: { type: 'string', default: 'pr' },
  base: { type: 'string', default: 'HEAD' }, head: { type: 'string', default: 'HEAD' },
  targets: { type: 'string', default: '' }, output: { type: 'string', default: 'results' },
} });
if (values.mode !== 'pr' && values.mode !== 'coverage') throw new Error('mode must be pr or coverage');
const report = await run({ repo: resolve(values.repo), mode: values.mode, base: values.base,
  head: values.head, targets: values.targets.split(',').filter(Boolean), output: resolve(values.output) });
console.log(`${report.status}: ${report.reason}`);
process.exitCode = ['VERIFIED', 'SKIPPED'].includes(report.status) ? 0 : 1;
