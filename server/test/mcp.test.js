const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { createMcpServer, INSTRUCTIONS } = require('../mcp/server');
const { toolSchemas } = require('../agent/tools');
const { repo } = require('./helpers');

const knowledgeRepo = {
  ...repo,
  searchKnowledge: async () => [{ source: 'msp-basics', title: 'MSP', content: 'Onion has no MSP.', score: 0.8 }],
};

// A real MCP client talking to our server through a linked in-memory transport pair.
async function connect(r = repo) {
  const server = createMcpServer({ repo: r });
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return { client, server, close: async () => { await client.close(); await server.close(); } };
}
const json = (res) => JSON.parse(res.content[0].text);

test('mcp: lists the price tools with their schemas, all marked read-only', async () => {
  const { client, close } = await connect();
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ['best_markets', 'compare_districts', 'price_trend', 'search_prices', 'simulate_alert']);
  for (const t of tools) {
    assert.equal(t.inputSchema.type, 'object');
    assert.equal(t.annotations.readOnlyHint, true);
    assert.equal(t.annotations.destructiveHint, false);
    assert.ok(t.description.length > 20);
  }
  await close();
});

test('mcp: tool definitions are the agent\'s own, not a copy', async () => {
  const { client, close } = await connect(knowledgeRepo);
  const { tools } = await client.listTools();
  assert.equal(tools.length, toolSchemas.length);
  for (const s of toolSchemas) {
    const t = tools.find((x) => x.name === s.function.name);
    assert.deepEqual(t.inputSchema, s.function.parameters);
    assert.equal(t.description, s.function.description);
  }
  await close();
});

test('mcp: search_knowledge is offered only when a knowledge base exists', async () => {
  const without = await connect(repo);
  assert.ok(!(await without.client.listTools()).tools.some((t) => t.name === 'search_knowledge'));
  await without.close();
  const withKb = await connect(knowledgeRepo);
  assert.ok((await withKb.client.listTools()).tools.some((t) => t.name === 'search_knowledge'));
  const res = await withKb.client.callTool({ name: 'search_knowledge', arguments: { query: 'does onion have MSP' } });
  assert.equal(res.isError, false);
  assert.equal(json(res).passages[0].source, 'msp-basics');
  await withKb.close();
});

test('mcp: calling a tool returns the same data the agent would see', async () => {
  const { client, close } = await connect();
  const res = await client.callTool({ name: 'best_markets', arguments: { commodity: 'Onion', top_n: 1 } });
  assert.equal(res.isError, false);
  assert.equal(res.content[0].type, 'text');
  assert.match(res.content[0].text, /Rahuri/);
  await close();
});

test('mcp: bad arguments come back as isError with a fixable message, not a protocol error', async () => {
  const { client, close } = await connect();
  const missing = await client.callTool({ name: 'best_markets', arguments: { top_n: 1 } });
  assert.equal(missing.isError, true);
  assert.match(json(missing).error, /commodity/);
  const range = await client.callTool({ name: 'best_markets', arguments: { commodity: 'Onion', top_n: 999 } });
  assert.equal(range.isError, true);
  assert.match(json(range).error, /top_n/);
  await close();
});

test('mcp: unknown tool, missing or non-object arguments are all handled', async () => {
  const { client, close } = await connect();
  const unknown = await client.callTool({ name: 'delete_everything', arguments: {} });
  assert.equal(unknown.isError, true);
  assert.match(json(unknown).error, /unknown tool/);
  const none = await client.callTool({ name: 'search_prices' });                       // no arguments at all
  assert.equal(none.isError, true);
  const array = await client.callTool({ name: 'search_prices', arguments: { commodity: ['x'] } });
  assert.equal(array.isError, true);
  await close();
});

test('mcp: an internal failure is reported as a generic error, never the raw message', async () => {
  const broken = { ...repo, findPrices: async () => { throw new Error('connection to db.internal.example:5432 refused, password=hunter2'); } };
  const { client, close } = await connect(broken);
  const res = await client.callTool({ name: 'search_prices', arguments: { commodity: 'Onion' } });
  assert.equal(res.isError, true);
  assert.equal(json(res).error, 'tool failed internally');
  assert.doesNotMatch(res.content[0].text, /hunter2|internal\.example/);
  await close();
});

test('mcp: server tells the client what the data is', async () => {
  const { client, close } = await connect();
  assert.equal(client.getInstructions(), INSTRUCTIONS);
  assert.match(INSTRUCTIONS, /quintal/);
  assert.equal(client.getServerVersion().name, 'agroprice');
  await close();
});

test('mcp: createMcpServer needs a repo', () => {
  assert.throws(() => createMcpServer({}), /repo is required/);
});

// ---- over real stdio, in a child process ----
test('mcp over real stdio: initialize, list and call work end to end', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(__dirname, '..', 'fixtures', 'mcp-stdio-fixture.js')],
    stderr: 'pipe',
  });
  const client = new Client({ name: 'stdio-test', version: '1.0.0' });
  try {
    await client.connect(transport);
    assert.equal((await client.listTools()).tools.length, 5);
    const res = await client.callTool({ name: 'search_prices', arguments: { commodity: 'Cotton' } });
    assert.equal(res.isError, false);
    assert.match(res.content[0].text, /Amravati/);
  } finally {
    await client.close();
  }
});

test('mcp: loading the server module writes nothing to stdout (stdout is the protocol channel)', () => {
  const out = spawnSync(process.execPath, ['-e', "require('./mcp/server')"], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
  assert.equal(out.status, 0);
  assert.equal(out.stdout, '');
});

test('mcp: starting without DATABASE_URL fails fast on stderr, not stdout', () => {
  // An empty value (not a deleted one) is what keeps the server from loading DATABASE_URL out of
  // server/.env: dotenv never overrides a variable that already exists in the environment.
  const env = { ...process.env, DATABASE_URL: '' };
  const out = spawnSync(process.execPath, [path.join(__dirname, '..', 'mcp', 'server.js')], { env, encoding: 'utf8', timeout: 15000 });
  assert.equal(out.status, 1);
  assert.equal(out.stdout, '');
  assert.match(out.stderr, /DATABASE_URL is not set/);
});