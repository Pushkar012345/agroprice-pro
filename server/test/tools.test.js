const test = require('node:test');
const assert = require('node:assert/strict');
const { toolsByName, ToolInputError } = require('../agent/tools');
const { repo } = require('./helpers');

const run = (name, raw) => {
  const t = toolsByName[name];
  return t.run(t.validate(raw), repo);
};

test('search_prices: case-insensitive, sorted high to low', async () => {
  const r = await run('search_prices', { commodity: 'onion' });
  assert.equal(r.found, true);
  assert.equal(r.total, 4);
  assert.equal(r.prices[0].market, 'Rahuri');
});

test('search_prices: district filter', async () => {
  const r = await run('search_prices', { commodity: 'Onion', district: 'pune' });
  assert.equal(r.prices.length, 1);
  assert.equal(r.prices[0].market, 'Pune');
});

test('search_prices: unknown crop returns found:false, not made-up data', async () => {
  const r = await run('search_prices', { commodity: 'Dragonfruit' });
  assert.equal(r.found, false);
});

test('best_markets: sell = highest first, buy = lowest first', async () => {
  const sell = await run('best_markets', { commodity: 'Onion', top_n: 2 });
  assert.deepEqual(sell.markets.map((m) => m.market), ['Rahuri', 'Lasalgaon']);
  const buy = await run('best_markets', { commodity: 'Onion', goal: 'buy', top_n: 1 });
  assert.equal(buy.markets[0].market, 'Pune');
});

test('price_trend: computes change over the window', async () => {
  const r = await run('price_trend', { commodity: 'Onion', market: 'Lasalgaon', days: 14 });
  assert.equal(r.found, true);
  const t = r.trends[0];
  assert.equal(t.first, 2000);
  assert.equal(t.last, 2450);
  assert.equal(t.changePercent, 22.5);
  assert.ok(r.note, 'demo-data note present by default');
});

test('compare_districts: averages per district', async () => {
  const r = await run('compare_districts', { commodity: 'Onion', districts: ['Nashik', 'Latur', 'Nowhere'] });
  assert.equal(r.districts[0].averageModal, 2450);
  assert.equal(r.districts[1].averageModal, 2200);
  assert.equal(r.districts[2].found, false);
});

test('simulate_alert: hit rate and confidence', async () => {
  const r = await run('simulate_alert', { commodity: 'Onion', market: 'Lasalgaon', target_price: 2300, direction: 'above' });
  // history 2000..2450 step 50 -> values >= 2300: 2300,2350,2400,2450 = 4 of 10
  assert.equal(r.hitCount, 4);
  assert.equal(r.hitRate, 40);
  assert.ok(r.confidence > 0);
});

test('validation rejects bad input', () => {
  assert.throws(() => toolsByName.search_prices.validate({}), ToolInputError);
  assert.throws(() => toolsByName.best_markets.validate({ commodity: 'Onion', top_n: 99 }), ToolInputError);
  assert.throws(() => toolsByName.best_markets.validate({ commodity: 'Onion', goal: 'steal' }), ToolInputError);
  assert.throws(() => toolsByName.compare_districts.validate({ commodity: 'Onion', districts: ['Pune'] }), ToolInputError);
  assert.throws(() => toolsByName.simulate_alert.validate({ commodity: 'Onion', market: 'Pune', target_price: 'abc' }), ToolInputError);
  assert.throws(() => toolsByName.search_prices.validate({ commodity: 'x'.repeat(500) }), ToolInputError);
});