const test = require('node:test');
const assert = require('node:assert/strict');
const { runAgent, normalizeCitations } = require('../agent/agent');
const { repo, fakeGroq, toolCall, text } = require('./helpers');

const ask = (content) => [{ role: 'user', content }];
async function collect(groq, r = repo, extra = {}) {
  const events = [];
  const out = await runAgent({ groq, repo: r, messages: ask('hi'), onEvent: (e) => events.push(e), ...extra });
  return { events, out };
}

test('stream: plain answer arrives as tokens that add up to the reply', async () => {
  const { events, out } = await collect(fakeGroq([text('Hello farmer, onion is stable today.')]));
  const tokens = events.filter((e) => e.type === 'token');
  assert.ok(tokens.length > 1, 'more than one token event');
  assert.equal(tokens.map((t) => t.text).join(''), 'Hello farmer, onion is stable today.');
  assert.equal(out.reply, 'Hello farmer, onion is stable today.');
});

test('stream: tool call fragments are reassembled and tool events are emitted in order', async () => {
  const groq = fakeGroq([toolCall('search_prices', { commodity: 'Onion' }), text('Best is Rahuri.')]);
  const { events, out } = await collect(groq);
  const kinds = events.map((e) => e.type).filter((t) => t !== 'token');
  assert.deepEqual(kinds, ['tool_start', 'tool_end']);
  const end = events.find((e) => e.type === 'tool_end');
  assert.equal(end.name, 'search_prices');
  assert.equal(end.ok, true);
  assert.equal(out.toolCalls[0].args.commodity, 'Onion', 'split JSON arguments were joined correctly');
  // The tool result went back to the model on the next request.
  assert.match(groq.requests[1].messages.at(-1).content, /Rahuri/);
  assert.ok(groq.requests.every((r) => r.stream === true));
});

test('stream: text before a tool call triggers reset so the UI drops the preamble', async () => {
  const pre = { ...toolCall('search_prices', { commodity: 'Onion' }), content: 'Let me check...' };
  const { events } = await collect(fakeGroq([pre, text('Done.')]));
  const i = events.findIndex((e) => e.type === 'reset');
  assert.ok(i > -1);
  assert.ok(events.slice(0, i).some((e) => e.type === 'token'));
  assert.ok(events.slice(i).some((e) => e.type === 'tool_start'));
});

test('stream: knowledge tool reports its sources to the client', async () => {
  const r = { ...repo, searchKnowledge: async () => [{ source: 'msp-basics', title: 'MSP', content: 'x', score: 0.9 }] };
  const groq = fakeGroq([toolCall('search_knowledge', { query: 'msp' }), text('See [msp-basics].')]);
  const { events } = await collect(groq, r);
  assert.deepEqual(events.find((e) => e.type === 'tool_end').sources, ['msp-basics']);
});

test('stream: a stopped client cancels the run before any tool executes', async () => {
  let calls = 0;
  const r = { ...repo, findPrices: async () => { calls++; return []; } };
  const groq = fakeGroq([toolCall('search_prices', { commodity: 'Onion' }), text('never')]);
  const { out } = await collect(groq, r, { isCancelled: () => true });
  assert.equal(out.cancelled, true);
  assert.equal(calls, 0);
  assert.equal(groq.requests.length, 1);
});

test('stream: malformed tool call is retried once with a reset event', async () => {
  const err = Object.assign(new Error('x'), { status: 400, error: { code: 'tool_use_failed' } });
  const { events, out } = await collect(fakeGroq([err, text('ok')]));
  assert.ok(events.some((e) => e.type === 'reset'));
  assert.equal(out.reply, 'ok');
});

test('stream: step limit still forces a final streamed answer', async () => {
  const groq = fakeGroq([toolCall('search_prices', { commodity: 'Onion' }), toolCall('search_prices', { commodity: 'Cotton' }), text('final')]);
  const { out } = await collect(groq, repo, { maxSteps: 2 });
  assert.equal(out.hitStepLimit, true);
  assert.equal(groq.requests.at(-1).tool_choice, 'none');
  assert.equal(out.reply, 'final');
});

test('normalizeCitations fixes spaces and unicode hyphens, leaves other brackets alone', () => {
  assert.equal(normalizeCitations('See [ msp\u2011basics ] and [apmc-and-enam].'), 'See [msp-basics] and [apmc-and-enam].');
  assert.equal(normalizeCitations('Range [1, 2] stays.'), 'Range [1, 2] stays.');
});

test('non-stream path also normalises citations in the reply', async () => {
  const out = await runAgent({ groq: fakeGroq([text('Answer [ msp\u2011basics ].')]), repo, messages: ask('q') });
  assert.equal(out.reply, 'Answer [msp-basics].');
});