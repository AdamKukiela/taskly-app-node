import { parseArgs } from 'node:util';
import { z } from 'zod';
import { Gemini } from './model.ts';

const { values } = parseArgs({ options: { model: { type: 'string', default: process.env.GEMINI_MODEL || 'gemini-3.6-flash' } } });
try {
  const provider = new Gemini(values.model, process.env.GEMINI_API_KEY ?? '');
  const result = await provider.generate(z.object({ ready: z.boolean() }).strict(), 'Return ready=true as JSON.', {});
  if (!result.ready) throw new Error('Model did not confirm readiness');
  console.log(`Ready: ${values.model}; structured JSON verified; requests=${provider.requests}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Preflight failed');
  process.exitCode = 1;
}
