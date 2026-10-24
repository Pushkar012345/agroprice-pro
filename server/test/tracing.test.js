const test = require('node:test');
const assert = require('node:assert/strict');
const { runAgent } = require('../agent/agent');
const { createKnowledge } = require('../rag/knowledge');
const { createMemoryStore } = require('../rag/store');
const {
  noopTracer, safeTracer, createLangfuseTracer, createTracerFromEnv, runWithTrace, costFor,
} = require('../observability/tracing');
const { repo, fakeGroq, toolCall, text } = require('./helpers');

const ask = (content) => [{ role: 'user', content }];

// A tracer that records everything, shaped like the real interface.
function recordingTracer() {
  const rec = { traces: [], observations: [] };
  const mk = (kind) => (d) => {
    const o = { kind, ...d, ended: null };
    rec.observations.push(o);
    return { end: (e) => { o.ended = e; } };
  };
  return {
    rec,
    enabled: true,
    trace(d) {
      const t = { ...d, ended: null };
      rec.traces.push(t);
      return { generation: mk('generation'), span: mk('span'), end: (e) => { t.ended = e; } };
    },
    flush: async () => {},
    shutdown: async () => {},
  };
}

// Adds Groq-style token usage to a fake client (non-stream: res.usage, stream: final x_groq chunk).
function withUsage(groq, usage = { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }) {
  const create = groq.chat.completions.create.bind(groq.chat.completions);
  groq.chat.completions.create = async (params) => {
    const res = await create(params);
    if (!params.stream) return { ...res, usage };
    return (async function* () { yield* res; yield { choices: [{ delta: {} }], x_groq: { usage } }; })();
  };
  return groq;
}

test('one trace per question, a generation per model call, a span per tool call', async () => {
  const tracer = recordingTracer();
  const groq = withUsage(fakeGroq([toolCall('best_markets', { commodity: 'Onion', top_n: 1 }), text('Sell at Rahuri.')]));
  const out = await runAgent({ groq, repo, tracer, messages: ask('Best market for onion?') });

  const { traces, observations } = tracer.rec;
  assert.equal(traces.length, 1);
  assert.equal(traces[0].name, 'agrobot-chat');
  assert.equal(traces[0].input, 'Best market for onion?');
  assert.equal(traces[0].ended.output, out.reply);
  assert.deepEqual(traces[0].ended.metadata.tools, ['best_markets']);
  assert.equal(traces[0].ended.metadata.steps, 2);

  const gens = observations.filter((o) => o.kind === 'generation');
  assert.deepEqual(gens.map((g) => g.name), ['llm-step-1', 'llm-step-2']);
  assert.equal(gens[0].ended.usage.input, 100);
  assert.equal(gens[0].ended.usage.total, 120);
  assert.equal(gens[0].tools, undefined, 'tool schema is not logged as generation input');
  assert.ok(gens[1].input.some((m) => m.role === 'tool'), 'second call input includes the tool result');
  assert.equal(gens[0].input.length, 2, 'first call input was snapshotted, not mutated later');

  const spans = observations.filter((o) => o.kind === 'span');
  assert.equal(spans.length, 1);
  assert.equal(spans[0].name, 'tool:best_markets');
  assert.match(spans[0].ended.output, /Rahuri/);
  assert.equal(spans[0].ended.metadata.ok, true);
});

test('streaming runs report token usage too', async () => {
  const tracer = recordingTracer();
  const groq = withUsage(fakeGroq([text('Hello there.')]));
  await runAgent({ groq, repo, tracer, messages: ask('hi'), onEvent: () => {} });
  const gen = tracer.rec.observations.find((o) => o.kind === 'generation');
  assert.equal(gen.ended.usage.output, 20);
  assert.equal(tracer.rec.traces[0].tags.includes('stream'), true);
});

test('a failing tool is a WARNING span, an unknown tool does not crash the trace', async () => {
  const tracer = recordingTracer();
  const groq = fakeGroq([toolCall('best_markets', { top_n: 1 }), text('I need a crop name.')]); // missing commodity
  await runAgent({ groq, repo, tracer, messages: ask('best market?') });
  const span = tracer.rec.observations.find((o) => o.kind === 'span');
  assert.equal(span.ended.level, 'WARNING');
  assert.match(span.ended.statusMessage, /commodity/);
});

test('model errors end the generation as ERROR and still propagate', async () => {
  const tracer = recordingTracer();
  const groq = fakeGroq([Object.assign(new Error('boom'), { status: 500 })]);
  await assert.rejects(runAgent({ groq, repo, tracer, messages: ask('hi') }), /boom/);
  const gen = tracer.rec.observations.find((o) => o.kind === 'generation');
  assert.equal(gen.ended.level, 'ERROR');
  assert.equal(gen.ended.statusMessage, 'boom');
  assert.equal(tracer.rec.traces[0].ended.metadata.error, 'boom');
});

test('a retry after tool_use_failed is flagged on the generation', async () => {
  const tracer = recordingTracer();
  const err = Object.assign(new Error('400 Failed to call a function'), { status: 400, error: { error: { code: 'tool_use_failed' } } });
  const groq = fakeGroq([err, text('Recovered.')]);
  await runAgent({ groq, repo, tracer, messages: ask('hi') });
  const gens = tracer.rec.observations.filter((o) => o.kind === 'generation');
  assert.equal(gens.length, 1);
  assert.equal(gens[0].ended.level, 'WARNING');
});

test('invalid input is rejected before any trace is created', async () => {
  const tracer = recordingTracer();
  await assert.rejects(runAgent({ groq: fakeGroq([]), repo, tracer, messages: [] }), /user message/);
  assert.equal(tracer.rec.traces.length, 0);
});

test('a broken tracing backend never breaks a chat', async () => {
  const exploding = { enabled: true, trace() { throw new Error('langfuse down'); }, flush: async () => { throw new Error('x'); } };
  const logged = [];
  const tracer = safeTracer(exploding, { log: (m) => logged.push(m) });
  const groq = fakeGroq([toolCall('best_markets', { commodity: 'Onion' }), text('ok')]);
  const out = await runAgent({ groq, repo, tracer, messages: ask('best?') });
  assert.equal(out.reply, 'ok');
  await tracer.flush(); // must not throw
  assert.equal(logged.length, 1, 'warns once, not on every call');

  // Errors thrown while ending an observation are swallowed as well.
  const badEnd = safeTracer({ enabled: true, trace: () => ({ generation: () => ({ end() { throw new Error('e'); } }), span: () => ({ end() { throw new Error('e'); } }), end() { throw new Error('e'); } }) }, { log() {} });
  const out2 = await runAgent({ groq: fakeGroq([toolCall('best_markets', { commodity: 'Onion' }), text('fine')]), repo, tracer: badEnd, messages: ask('best?') });
  assert.equal(out2.reply, 'fine');
});

test('RAG retrieval adds spans to the active trace, with scores and the threshold result', async () => {
  const vec = (t) => (t.includes('msp') ? [1, 0] : [0, 1]);
  const store = createMemoryStore();
  await store.upsertSource('msp-basics', [{ title: 'MSP', chunkIndex: 0, content: 'msp text', embedding: [1, 0] }]);
  const knowledge = createKnowledge({ embedder: { embedQuery: async (t) => vec(t) }, store, minScore: 0.5 });

  const tracer = recordingTracer();
  const trace = tracer.trace({ name: 't' });
  const hits = await runWithTrace(trace, () => knowledge.search('what is msp'));
  assert.equal(hits.length, 1);

  const names = tracer.rec.observations.map((o) => o.name);
  assert.deepEqual(names, ['rag.embed_query', 'rag.vector_search', 'rag.keyword_search', 'rag.fuse', 'rag.threshold_filter']);
  const search = tracer.rec.observations[1];
  assert.deepEqual(search.ended.output, [{ source: 'msp-basics', chunk: 0, score: 1 }]);
  assert.deepEqual(tracer.rec.observations[4].ended.output, { retrieved: 1, kept: 1 });

  // Outside any trace the same call works and records nothing.
  assert.equal((await knowledge.search('what is msp')).length, 1);
  assert.equal(tracer.rec.observations.length, 5);
});

test('createTracerFromEnv: no keys -> no-op, keys -> enabled Langfuse tracer', () => {
  assert.equal(createTracerFromEnv({}), noopTracer);
  assert.equal(createTracerFromEnv({ LANGFUSE_PUBLIC_KEY: 'pk' }), noopTracer, 'needs both keys');
  const t = createTracerFromEnv({ LANGFUSE_PUBLIC_KEY: 'pk-lf-x', LANGFUSE_SECRET_KEY: 'sk-lf-x', LANGFUSE_BASE_URL: 'http://localhost:1' }, { log() {} });
  assert.equal(t.enabled, true);
  return t.shutdown();
});

test('Langfuse tracer maps our events onto the SDK, with usage and optional cost', async () => {
  const calls = [];
  const obs = (kind) => (d) => { calls.push([kind, d]); return { end: (e) => calls.push([`${kind}.end`, e]) }; };
  const client = {
    trace: (d) => { calls.push(['trace', d]); return { generation: obs('generation'), span: obs('span'), update: (u) => calls.push(['trace.update', u]) }; },
    flushAsync: async () => calls.push(['flush']),
    shutdownAsync: async () => calls.push(['shutdown']),
  };
  const tracer = createLangfuseTracer({ client, inPerM: 1, outPerM: 2, log() {} });
  const t = tracer.trace({ name: 'chat', input: 'q', tags: ['a'] });
  const g = t.generation({ name: 'llm', model: 'm', input: [], modelParameters: { temperature: 0.2 } });
  g.end({ output: 'x', usage: { input: 1_000_000, output: 500_000, total: 1_500_000 } });
  t.end({ output: 'done', metadata: { steps: 1 } });
  await tracer.flush();

  const end = calls.find(([k]) => k === 'generation.end')[1];
  assert.equal(end.usage.unit, 'TOKENS');
  assert.equal(end.usage.totalCost, 2); // 1M*$1 + 0.5M*$2
  assert.deepEqual(calls.find(([k]) => k === 'trace.update')[1], { output: 'done', metadata: { steps: 1 } });
  assert.ok(calls.some(([k]) => k === 'flush'));
});

test('costFor needs both prices', () => {
  assert.equal(costFor({ input: 1, output: 1 }, { inPerM: NaN, outPerM: 1 }), undefined);
  assert.equal(costFor(undefined, { inPerM: 1, outPerM: 1 }), undefined);
  assert.deepEqual(costFor({ input: 2_000_000, output: 0 }, { inPerM: 0.5, outPerM: 3 }), { inputCost: 1, outputCost: 0, totalCost: 1 });
});