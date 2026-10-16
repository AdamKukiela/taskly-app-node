import { publish } from './publish.ts';

await publish(process.argv[2] ?? 'results');
