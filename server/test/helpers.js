// In-memory repo + scripted fake model, so tests need no database or API key.

const day = 24 * 60 * 60 * 1000;
const prices = [
  { id: 1, commodity: 'Onion', market: 'Lasalgaon', district: 'Nashik', modalPrice: 2450, minPrice: 1800, maxPrice: 3100 },
  { id: 2, commodity: 'Onion', market: 'Nilanga', district: 'Latur', modalPrice: 2200, minPrice: 1700, maxPrice: 2800 },
  { id: 3, commodity: 'Onion', market: 'Rahuri', district: 'Ahmednagar', modalPrice: 2500, minPrice: 1900, maxPrice: 3200 },
  { id: 4, commodity: 'Cotton', market: 'Amravati', district: 'Amravati', modalPrice: 7200, minPrice: 6500, maxPrice: 7800 },
  { id: 5, commodity: 'Onion', market: 'Pune', district: 'Pune', modalPrice: 2100, minPrice: 1600, maxPrice: 2600 },
];

// History: market 1 rises 2000 -> 2450 over 10 days; others flat.
const history = [];
for (let i = 0; i < 10; i++) {
  history.push({ marketPriceId: 1, modalPrice: 2000 + i * 50, recordedAt: new Date(Date.now() - (9 - i) * day) });
  history.push({ marketPriceId: 2, modalPrice: 2200, recordedAt: new Date(Date.now() - (9 - i) * day) });
}

const has = (a, b) => a.toLowerCase().includes(b.toLowerCase());

const repo = {
  async findPrices({ commodity, district, market } = {}) {
    return prices.filter((p) =>
      (!commodity || has(p.commodity, commodity)) &&
      (!district || p.district.toLowerCase() === district.toLowerCase()) &&
      (!market || has(p.market, market)));
  },
  async findHistory(ids, since) {
    return history.filter((h) => ids.includes(h.marketPriceId) && (!since || h.recordedAt >= since));
  },
};

// A fake Groq client that plays back scripted responses and records requests.
// Each script item is a message object, or a function/Error to throw.
function fakeGroq(script) {
  const requests = [];
  let i = 0;
  return {
    requests,
    chat: {
      completions: {
        async create(params) {
          requests.push(JSON.parse(JSON.stringify(params)));
          const item = script[Math.min(i++, script.length - 1)];
          if (item instanceof Error) throw item;
          return { choices: [{ message: item }] };
        },
      },
    },
  };
}

const toolCall = (name, args, id = 'call_1') => ({
  role: 'assistant', content: null,
  tool_calls: [{ id, type: 'function', function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) } }],
});
const text = (content) => ({ role: 'assistant', content });

module.exports = { repo, fakeGroq, toolCall, text };