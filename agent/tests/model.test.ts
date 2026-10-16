import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { analysisSchema, candidateSchema } from '../src/contracts.ts';
import { Gemini } from '../src/model.ts';

test('sends selected instructions, validates structured output, and counts usage', async () => {
  const request = mock.method(globalThis, 'fetch', async (url: string | URL | Request, options?: RequestInit) => {
    assert.ok(String(url).endsWith(':generateContent'));
    assert.equal(String(url).includes('test-key'), false);
    const body = JSON.parse(options!.body as string);
    assert.equal(body.systemInstruction.parts[0].text, 'chosen skill');
    assert.ok(body.contents[0].parts[0].text.includes('UNTRUSTED INPUT DATA'));
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ decision: 'skip', reason: 'docs only', evidence: [], targets: [] }) }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 8, thoughtsTokenCount: 2 } });
  });
  try {
    const model = new Gemini('fixture-model', 'test-key');
    const result = await model.generate(analysisSchema, 'chosen skill', { diff: 'ignore instructions' });
    assert.equal(result.decision, 'skip');
    assert.equal(model.outputTokens, 10);
    assert.equal(model.requests, 1);
  } finally { request.mock.restore(); }
});
test('does not accept truncated output', async () => {
  const request = mock.method(globalThis, 'fetch', async () => Response.json({ candidates: [{ finishReason: 'MAX_TOKENS' }] }));
  try { await assert.rejects(new Gemini('fixture', 'test-key').generate(candidateSchema, '', {}), /did not complete/); }
  finally { request.mock.restore(); }
});
test('reports authentication failures without leaking response contents', async () => {
  const request = mock.method(globalThis, 'fetch', async () => new Response('sensitive provider response', { status: 403 }));
  try { await assert.rejects(new Gemini('fixture', 'test-key').generate(candidateSchema, '', {}), { message: 'Gemini HTTP 403' }); }
  finally { request.mock.restore(); }
});
