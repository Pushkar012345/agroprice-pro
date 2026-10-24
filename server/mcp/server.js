// AgroPrice MCP server: exposes the AgroBot tools to any MCP client (Claude Desktop, Claude Code, ...).
//
//   cd server && npm run mcp                  (stdio: the client starts this process itself)
//
// It reuses agent/tools.js and the agent's own tool runner, so argument validation, the read-only
// guarantee, size limits and error handling are exactly what the chat agent gets. There is no second
// copy of any tool logic here.
//
// IMPORTANT for stdio servers: stdout carries the protocol. Nothing else may ever write to it, so all
// logging goes to stderr and dotenv is run in quiet mode.

const path = require('path');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { tools } = require('../agent/tools');
const { executeToolCall } = require('../agent/agent');

const INSTRUCTIONS = [
  'Maharashtra mandi (agricultural market) prices and background knowledge.',
  'Prices are Rupees per quintal (100 kg). Tools are read-only.',
  'Price history in the demo database may be generated sample data: if a result has a "note" about this, tell the user.',
  'Use search_knowledge (when available) for MSP, APMC/e-NAM, how to read mandi prices and storage/selling-timing questions, and cite the passage source.',
].join(' ');

const titleOf = (name) => name.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const asObject = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

function createMcpServer({ repo, name = 'agroprice', version = '1.0.0' } = {}) {
  if (!repo) throw new Error('repo is required');
  // search_knowledge is only listed when a knowledge base is configured: no point offering a dead tool.
  const visible = tools.filter((t) => t.name !== 'search_knowledge' || typeof repo.searchKnowledge === 'function');

  const server = new Server({ name, version }, { capabilities: { tools: {} }, instructions: INSTRUCTIONS });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: visible.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.parameters,
      annotations: { title: titleOf(t.name), readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name: toolName, arguments: args } = request.params;
    // Same path the agent uses: validates arguments, runs the tool, hides internal errors, caps the size.
    // Bad input comes back as isError (so the model can fix its call) rather than as a protocol error.
    const { record, message } = await executeToolCall(
      { id: 'mcp', type: 'function', function: { name: toolName, arguments: JSON.stringify(asObject(args)) } },
      repo,
    );
    return { content: [{ type: 'text', text: message.content }], isError: !record.ok };
  });

  return server;
}

// ---- process entry point (only when run directly, never when required by tests) ----
async function main() {
  // Claude Desktop starts us from an unknown working directory, so load server/.env explicitly.
  require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
  // Check configuration before loading anything heavy, so a missing setting gives a clear message.
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set (put it in server/.env or the MCP client config)');
  const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
  const { Pool } = require('pg');
  const { PrismaPg } = require('@prisma/adapter-pg');
  const { PrismaClient } = require('@prisma/client');
  const { createPrismaRepo } = require('../agent/repo');
  const { createKnowledgeFromEnv } = require('../rag/factory');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }, // cloud Postgres needs SSL
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const knowledge = createKnowledgeFromEnv(prisma);
  const repo = createPrismaRepo(prisma, { knowledge });
  if (!knowledge) console.error('agroprice-mcp: GEMINI_API_KEY not set, search_knowledge is not offered.');

  const server = createMcpServer({ repo });
  const shutdown = async () => {
    try { await server.close(); await prisma.$disconnect(); await pool.end(); } finally { process.exit(0); }
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  process.stdin.once('end', shutdown); // client closed the pipe

  await server.connect(new StdioServerTransport());
  console.error('agroprice-mcp: ready on stdio');
}

if (require.main === module) {
  main().catch((err) => { console.error(`agroprice-mcp failed to start: ${err.message}`); process.exit(1); });
}

module.exports = { createMcpServer, INSTRUCTIONS };