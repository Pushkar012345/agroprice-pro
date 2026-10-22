// Tools the AgroBot agent can call. Each tool has:
//   - a JSON schema (what the model sees)
//   - a validator (never trust model-generated arguments)
//   - a run() that reads from the repo and returns plain JSON
// All tools are READ-ONLY.

const MAX_ROWS = 10;

class ToolInputError extends Error {}

// ── tiny validators ──
const str = (v, name, { required = true, max = 60 } = {}) => {
  if (v === undefined || v === null || v === '') {
    if (required) throw new ToolInputError(`"${name}" is required`);
    return undefined;
  }
  if (typeof v !== 'string') throw new ToolInputError(`"${name}" must be a string`);
  const t = v.trim();
  if (t.length > max) throw new ToolInputError(`"${name}" is too long`);
  return t;
};
const int = (v, name, { min, max, def }) => {
  if (v === undefined || v === null) return def;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ToolInputError(`"${name}" must be an integer between ${min} and ${max}`);
  }
  return n;
};
const num = (v, name, { min, max }) => {
  const n = Number(v);
  if (v === undefined || v === null || !Number.isFinite(n) || n < min || n > max) {
    throw new ToolInputError(`"${name}" must be a number between ${min} and ${max}`);
  }
  return n;
};
const oneOf = (v, name, options, def) => {
  if (v === undefined || v === null) return def;
  if (!options.includes(v)) throw new ToolInputError(`"${name}" must be one of: ${options.join(', ')}`);
  return v;
};

const round = (n) => Math.round(n);
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

const HISTORY_NOTE =
  process.env.HISTORY_SOURCE === 'live'
    ? undefined
    : 'Demo data: price history in this app is generated for illustration, not real mandi history. Mention this when giving trend-based advice.';

const slim = (p) => ({
  id: p.id,
  commodity: p.commodity,
  market: p.market,
  district: p.district,
  modalPrice: p.modalPrice,
  minPrice: p.minPrice,
  maxPrice: p.maxPrice,
});

// Same alert logic as GET /api/prices/:id/alert-simulate, as a pure function.
function computeAlert(prices, targetPrice, direction) {
  if (prices.length === 0) return { hitCount: 0, totalDays: 0, hitRate: 0, confidence: 0, note: 'No history data available.' };
  const hit = (p) => (direction === 'above' ? p >= targetPrice : p <= targetPrice);
  const hitCount = prices.filter(hit).length;
  const totalDays = prices.length;
  const hitRate = Math.round((hitCount / totalDays) * 100);
  const recent = prices.slice(-7);
  const recentRate = recent.filter(hit).length / recent.length;
  const confidence = Math.round(hitRate * 0.6 + recentRate * 100 * 0.4);
  return { hitCount, totalDays, hitRate, confidence };
}

const tools = [
  {
    name: 'search_prices',
    description:
      'List current mandi prices (Rs per quintal) for a commodity, optionally limited to one district. Use for "what is the price of X".',
    parameters: {
      type: 'object',
      properties: {
        commodity: { type: 'string', description: 'Crop name, e.g. Onion, Cotton, Tur Dal' },
        district: { type: 'string', description: 'Optional Maharashtra district, e.g. Pune' },
      },
      required: ['commodity'],
    },
    validate: (a) => ({
      commodity: str(a.commodity, 'commodity'),
      district: str(a.district, 'district', { required: false }),
    }),
    async run(args, repo) {
      const rows = await repo.findPrices(args);
      if (rows.length === 0) return { found: false, message: `No prices found for ${args.commodity}${args.district ? ' in ' + args.district : ''}.` };
      const sorted = [...rows].sort((a, b) => b.modalPrice - a.modalPrice);
      return { found: true, total: rows.length, shown: Math.min(rows.length, MAX_ROWS), prices: sorted.slice(0, MAX_ROWS).map(slim) };
    },
  },
  {
    name: 'best_markets',
    description:
      'Rank markets for a commodity by modal price. goal "sell" = highest prices first (best for a farmer selling); goal "buy" = lowest first.',
    parameters: {
      type: 'object',
      properties: {
        commodity: { type: 'string' },
        goal: { type: 'string', enum: ['sell', 'buy'], description: 'Default sell' },
        top_n: { type: 'integer', description: 'How many markets, 1-10, default 3' },
      },
      required: ['commodity'],
    },
    validate: (a) => ({
      commodity: str(a.commodity, 'commodity'),
      goal: oneOf(a.goal, 'goal', ['sell', 'buy'], 'sell'),
      top_n: int(a.top_n, 'top_n', { min: 1, max: MAX_ROWS, def: 3 }),
    }),
    async run(args, repo) {
      const rows = await repo.findPrices({ commodity: args.commodity });
      if (rows.length === 0) return { found: false, message: `No prices found for ${args.commodity}.` };
      const dir = args.goal === 'sell' ? -1 : 1;
      const ranked = [...rows].sort((a, b) => dir * (a.modalPrice - b.modalPrice)).slice(0, args.top_n);
      return { found: true, goal: args.goal, markets: ranked.map(slim) };
    },
  },
  {
    name: 'price_trend',
    description:
      'Summarise how a commodity price moved over recent days (first, last, average, min, max, % change). Optionally for one market.',
    parameters: {
      type: 'object',
      properties: {
        commodity: { type: 'string' },
        market: { type: 'string', description: 'Optional market name, e.g. Lasalgaon' },
        days: { type: 'integer', description: 'Window in days, 3-30, default 14' },
      },
      required: ['commodity'],
    },
    validate: (a) => ({
      commodity: str(a.commodity, 'commodity'),
      market: str(a.market, 'market', { required: false }),
      days: int(a.days, 'days', { min: 3, max: 30, def: 14 }),
    }),
    async run(args, repo) {
      const rows = await repo.findPrices({ commodity: args.commodity, market: args.market });
      if (rows.length === 0) return { found: false, message: 'No matching market found.' };
      const since = new Date(Date.now() - args.days * 24 * 60 * 60 * 1000);
      const history = await repo.findHistory(rows.map((r) => r.id), since);
      const byMarket = new Map();
      for (const h of history) {
        if (!byMarket.has(h.marketPriceId)) byMarket.set(h.marketPriceId, []);
        byMarket.get(h.marketPriceId).push(h.modalPrice);
      }
      const trends = [];
      for (const r of rows) {
        const prices = byMarket.get(r.id);
        if (!prices || prices.length < 2) continue;
        const first = prices[0];
        const last = prices[prices.length - 1];
        trends.push({
          market: r.market,
          district: r.district,
          days: prices.length,
          first, last,
          average: round(avg(prices)),
          min: Math.min(...prices),
          max: Math.max(...prices),
          changePercent: Math.round(((last - first) / first) * 1000) / 10,
        });
      }
      if (trends.length === 0) return { found: false, message: 'No price history for this selection.' };
      trends.sort((a, b) => b.changePercent - a.changePercent);
      return { found: true, trends: trends.slice(0, MAX_ROWS), note: HISTORY_NOTE };
    },
  },
  {
    name: 'compare_districts',
    description: 'Compare a commodity across 2-3 districts (average, lowest and highest modal price, number of markets).',
    parameters: {
      type: 'object',
      properties: {
        commodity: { type: 'string' },
        districts: { type: 'array', items: { type: 'string' }, description: '2 or 3 district names' },
      },
      required: ['commodity', 'districts'],
    },
    validate: (a) => {
      if (!Array.isArray(a.districts) || a.districts.length < 2 || a.districts.length > 3) {
        throw new ToolInputError('"districts" must be a list of 2 or 3 names');
      }
      return { commodity: str(a.commodity, 'commodity'), districts: a.districts.map((d) => str(d, 'district')) };
    },
    async run(args, repo) {
      const out = [];
      for (const district of args.districts) {
        const rows = await repo.findPrices({ commodity: args.commodity, district });
        if (rows.length === 0) { out.push({ district, found: false }); continue; }
        const modals = rows.map((r) => r.modalPrice);
        out.push({
          district, found: true, markets: rows.length,
          averageModal: round(avg(modals)), lowestModal: Math.min(...modals), highestModal: Math.max(...modals),
        });
      }
      return { commodity: args.commodity, districts: out };
    },
  },
  {
    name: 'search_knowledge',
    description:
      'Look up background knowledge: MSP, APMC mandis and e-NAM, how to read mandi prices (min/max/modal, quintal), storage and selling-timing guidance. NOT for live prices or trends: use the price tools for those.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The question or topic, in plain words, e.g. "does onion have MSP"' },
        top_k: { type: 'integer', description: 'How many passages, 1-5, default 3' },
      },
      required: ['query'],
    },
    validate: (a) => ({
      query: str(a.query, 'query', { max: 300 }),
      top_k: int(a.top_k, 'top_k', { min: 1, max: 5, def: 3 }),
    }),
    async run(args, repo) {
      if (!repo.searchKnowledge) return { found: false, message: 'The knowledge base is not available right now.' };
      const hits = await repo.searchKnowledge(args.query, { topK: args.top_k });
      if (hits.length === 0) return { found: false, message: 'No relevant passage in the knowledge base.' };
      return {
        found: true,
        passages: hits.map((h) => ({
          source: h.source,
          title: h.title,
          url: h.url || undefined,
          text: h.content,
          score: Math.round(h.score * 100) / 100,
        })),
      };
    },
  },
  {
    name: 'simulate_alert',
    description:
      'Check how often, in the history window, a market price crossed a target. Use when someone asks if a target price is realistic.',
    parameters: {
      type: 'object',
      properties: {
        commodity: { type: 'string' },
        market: { type: 'string', description: 'Market name' },
        target_price: { type: 'number', description: 'Rs per quintal' },
        direction: { type: 'string', enum: ['above', 'below'] },
      },
      required: ['commodity', 'market', 'target_price'],
    },
    validate: (a) => ({
      commodity: str(a.commodity, 'commodity'),
      market: str(a.market, 'market'),
      target_price: num(a.target_price, 'target_price', { min: 1, max: 1000000 }),
      direction: oneOf(a.direction, 'direction', ['above', 'below'], 'above'),
    }),
    async run(args, repo) {
      const rows = await repo.findPrices({ commodity: args.commodity, market: args.market });
      if (rows.length === 0) return { found: false, message: 'No matching market found.' };
      const target = rows[0];
      const history = await repo.findHistory([target.id]);
      const result = computeAlert(history.map((h) => h.modalPrice), args.target_price, args.direction);
      return { found: true, market: target.market, commodity: target.commodity, currentModal: target.modalPrice, targetPrice: args.target_price, direction: args.direction, ...result, note: HISTORY_NOTE };
    },
  },
];

const toolsByName = Object.fromEntries(tools.map((t) => [t.name, t]));

// What gets sent to the model (no validate/run functions).
const toolSchemas = tools.map((t) => ({
  type: 'function',
  function: { name: t.name, description: t.description, parameters: t.parameters },
}));

module.exports = { tools, toolsByName, toolSchemas, ToolInputError, computeAlert };