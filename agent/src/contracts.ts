import { z } from 'zod';

export const targetSchema = z.object({
  source: z.string().max(300), test: z.string().max(300), behaviors: z.array(z.string().max(500)).min(1).max(10),
}).strict();
export const analysisSchema = z.object({
  decision: z.enum(['generate', 'update', 'skip', 'needs_review']),
  reason: z.string().min(1).max(4000),
  evidence: z.array(z.string().max(500)).max(15),
  targets: z.array(targetSchema).max(10),
}).strict();
export const candidateSchema = z.object({
  decision: z.enum(['propose', 'needs_review']),
  reason: z.string().min(1).max(4000),
  files: z.array(z.object({ path: z.string(), content: z.string().max(100_000) }).strict()).max(10),
}).strict();
export type Analysis = z.infer<typeof analysisSchema>;
export type Candidate = z.infer<typeof candidateSchema>;
export type Status = 'VERIFIED' | 'SKIPPED' | 'NEEDS_REVIEW' | 'BASELINE_FAILED' | 'FAILED' | 'LIMIT_EXCEEDED' | 'CONFIG_ERROR';
export type Metric = { total: number; covered: number; pct: number };
export type Coverage = Record<'lines' | 'statements' | 'functions' | 'branches', Metric>;
export type SuiteResult = {
  name: string; command: string; exitCode: number; output: string;
  tests?: { passed: number; failed: number; pending: number; total: number };
  coverage?: Coverage;
};
export type Verification = { passed: boolean; results: SuiteResult[] };
const metricSchema = z.object({ total: z.number().nonnegative(), covered: z.number().nonnegative(), pct: z.number().min(0).max(100) });
export const verificationSchema = z.object({
  passed: z.boolean(), results: z.array(z.object({
    name: z.string().max(100), command: z.string().max(1000), exitCode: z.number().int(), output: z.string().max(16000),
    tests: z.object({ passed: z.number().nonnegative(), failed: z.number().nonnegative(), pending: z.number().nonnegative(), total: z.number().nonnegative() }).optional(),
    coverage: z.object({ lines: metricSchema, statements: metricSchema, functions: metricSchema, branches: metricSchema }).optional(),
  })).max(6),
});
export type Report = {
  version: 1; status: Status; base: string; head: string; mode: string;
  model: string; skills: string[]; reason: string; analysis?: Analysis;
  baseline?: Verification; attempts: Verification[]; files: string[];
  modifiedExistingTests: string[]; requests: number; inputTokens: number; outputTokens: number;
  durationMs: number;
};
export const reportSchema = z.object({
  version: z.literal(1), status: z.enum(['VERIFIED', 'SKIPPED', 'NEEDS_REVIEW', 'BASELINE_FAILED', 'FAILED', 'LIMIT_EXCEEDED', 'CONFIG_ERROR']),
  base: z.string().regex(/^[a-f0-9]{40}$/), head: z.string().regex(/^[a-f0-9]{40}$/),
  mode: z.enum(['pr', 'coverage']), model: z.string().max(100),
  skills: z.array(z.enum(['analyze-changes', 'backend-unit-tests', 'frontend-unit-tests'])).max(3),
  reason: z.string().max(6000), analysis: analysisSchema.optional(), baseline: verificationSchema.optional(),
  attempts: z.array(verificationSchema).max(3), files: z.array(z.string().max(300)).max(10),
  modifiedExistingTests: z.array(z.string().max(300)).max(10),
  requests: z.number().int().nonnegative().max(12), inputTokens: z.number().nonnegative(),
  outputTokens: z.number().nonnegative(), durationMs: z.number().nonnegative(),
}).strict();
export class AgentError extends Error {
  status: Status;
  constructor(status: Status, message: string) { super(message); this.status = status; }
}
