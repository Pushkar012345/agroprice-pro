const test = require('node:test');
const assert = require('node:assert/strict');
const { AIMessage, AIMessageChunk } = require('@langchain/core/messages');
const { runAgentGraph } = require('../agent/graph');
const { repo } = require('./helpers');

// Scripted fake chat model: plays back AIMessages; stream() splits them into chunks.
function fakeModel(script) {
  const requests = [];
  let i = 0;
  const next = (msgs, tools) => {
    requests.push({ n: msgs.length, tools, last: msgs.at(-1) });
    return script[Math.min(i++, script.length - 1)];
  };
  const make = (tools) => ({
    async invoke(msgs) { return next(msgs, tools); },
    async *stream(msgs) {
      const m = next(msgs, tools);
      for (const piece of (m.content || '').match(/[\s\S]{1,5}/g) || []) yield new AIMessageChunk({ content: piece });
      for (const [index, tc] of (m.tool_calls || []).entries()) {
        const a = JSON.stringify(tc.args);
        const half = Math.ceil(a.length / 2);
        yield new AIMessageChunk({ content: '', tool_call_chunks: [{ name: tc.name, args: a.slice(0, half), id: tc.id, index }] });
        yield new AIMessageChunk({ content: '', tool_call_chunks: [{ args: a.slice(half), index }] });
      }
    },
  });
  return { requests, ...make(false), bindTools: () => make(true) };
}

const call = (name, args, id = 'call_1') => new AIMessage({ content: '', tool_calls: [{ name, args, id, type: 'tool_call' }] });
const say = (content) => new AIMessage({ content });
const ask = (content) => [{ role: 'user', content }];

test('graph: calls a tool, feeds result back, then answers', async () => {
  const model = fakeModel([call('best_markets', { commodity: 'Onion', top_n: 1 }), say('Sell at Rahuri: Rs 2500.')]);
  const out = await runAgentGraph({ model, repo, messages: ask('Best market for onion?') });
  assert.equal(out.reply, 'Sell at Rahuri: Rs 2500.');
  assert.equal(out.steps, 2);
  assert.deepEqual(out.toolCalls.map((t) => [t.name, t.ok]), [['best_markets', true]]);
  assert.match(model.requests[1].last.content, /Rahuri/);
});

test('graph: plain question needs no tools', async () => {
  const out = await runAgentGraph({ model: fakeModel([say('Hello!')]), repo, messages: ask('hi') });
  assert.equal(out.toolCalls.length, 0);
  assert.equal(out.steps, 1);
});

test('graph: invalid tool args go back to the model, not executed', async () => {
  const model = fakeModel([call('best_markets', { commodity: 'Onion', top_n: 999 }), say('Retrying.')]);
  const out = await runAgentGraph({ model, repo, messages: ask('top 999') });
  assert.equal(out.toolCalls[0].ok, false);
  assert.match(model.requests[1].last.content, /top_n/);
});

test('graph: unknown tool is rejected safely', async () => {
  const model = fakeModel([call('drop_tables', {}), say('Sorry.')]);
  const out = await runAgentGraph({ model, repo, messages: ask('x') });
  assert.equal(out.toolCalls[0].ok, false);
});

test('graph: step limit forces a final answer without tools', async () => {
  const model = fakeModel([call('search_prices', { commodity: 'Onion' }), call('search_prices', { commodity: 'Onion' }), say('Final from data.')]);
  const out = await runAgentGraph({ model, repo, messages: ask('loop'), maxSteps: 2 });
  assert.equal(out.hitStepLimit, true);
  assert.equal(out.reply, 'Final from data.');
  assert.equal(model.requests.at(-1).tools, false); // last call used the model WITHOUT tools
});

test('graph: streams tokens and tool events; reassembles split tool args', async () => {
  const model = fakeModel([call('best_markets', { commodity: 'Onion', top_n: 1 }), say('Sell at Rahuri.')]);
  const events = [];
  const out = await runAgentGraph({ model, repo, messages: ask('best?'), onEvent: (e) => events.push(e) });
  const types = events.map((e) => e.type);
  assert.deepEqual(types.filter((t) => t !== 'token'), ['tool_start', 'tool_end']);
  assert.equal(events.filter((e) => e.type === 'token').map((e) => e.text).join(''), 'Sell at Rahuri.');
  assert.equal(out.toolCalls[0].ok, true);
});

test('graph: cancellation stops early', async () => {
  const model = fakeModel([say('a long answer that never finishes')]);
  const out = await runAgentGraph({ model, repo, messages: ask('hi'), onEvent: () => {}, isCancelled: () => true });
  assert.equal(out.cancelled, true);
});

test('graph: requires a user message', async () => {
  await assert.rejects(() => runAgentGraph({ model: fakeModel([say('x')]), repo, messages: [] }), /user message/);
});