// Test fixture: the real MCP server over real stdio, backed by the in-memory test repo.
// Spawned by test/mcp.test.js (kept outside test/ so the test runner does not execute it directly).
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { createMcpServer } = require('../mcp/server');
const { repo } = require('../test/helpers');

createMcpServer({ repo }).connect(new StdioServerTransport()).catch((e) => { console.error(e.message); process.exit(1); });