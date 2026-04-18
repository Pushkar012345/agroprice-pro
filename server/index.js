require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const app = express();

// ── Trust proxy (required for Render/Vercel deployment) ──
app.set('trust proxy', 1);

// ── CORS ──
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:4173',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const clean = origin.replace(/\/$/, '');
    const allowed = allowedOrigins.map(o => o.replace(/\/$/, ''));
    if (allowed.includes(clean)) {
      callback(null, true);
    } else {
      console.error(`CORS blocked: ${origin}`);
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  methods: ['GET', 'POST'],
  credentials: true,
}));

// ── Rate Limiting ──
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait and try again.' },
}));

app.use(express.json());

const mapPrice = (p) => ({
  ...p,
  modal_price: p.modalPrice,
  min_price: p.minPrice,
  max_price: p.maxPrice,
});

// 1. Get ALL prices
app.get('/api/prices', async (req, res) => {
  try {
    const prices = await prisma.marketPrice.findMany();
    res.json(prices.map(mapPrice));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Get price history
app.get('/api/prices/:id/history', async (req, res) => {
  try {
    const history = await prisma.priceHistory.findMany({
      where: { marketPriceId: parseInt(req.params.id) },
      orderBy: { recordedAt: 'asc' },
    });
    res.json(history.map(h => ({
      ...h,
      modal_price: h.modalPrice,
      min_price: h.minPrice,
      max_price: h.maxPrice,
      date: new Date(h.recordedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Price Alert Simulator
app.get('/api/prices/:id/alert-simulate', async (req, res) => {
  try {
    const id          = parseInt(req.params.id);
    const targetPrice = parseFloat(req.query.targetPrice);
    const direction   = req.query.direction || 'above';

    if (isNaN(id) || isNaN(targetPrice)) {
      return res.status(400).json({ error: 'Invalid id or targetPrice' });
    }

    const history = await prisma.priceHistory.findMany({
      where: { marketPriceId: id },
      orderBy: { recordedAt: 'asc' },
    });

    if (history.length === 0) {
      return res.json({
        hitCount: 0, totalDays: 0, hitRate: 0,
        avgDaysToTrigger: null, confidence: 0,
        note: 'No history data available for this commodity.',
      });
    }

    const prices    = history.map(h => h.modalPrice);
    const triggered = prices.filter(p => direction === 'above' ? p >= targetPrice : p <= targetPrice);
    const hitCount  = triggered.length;
    const totalDays = prices.length;
    const hitRate   = Math.round((hitCount / totalDays) * 100);

    const daysToTriggerList = [];
    for (let start = 0; start < prices.length; start++) {
      for (let d = start; d < prices.length; d++) {
        const hit = direction === 'above' ? prices[d] >= targetPrice : prices[d] <= targetPrice;
        if (hit) { daysToTriggerList.push(d - start + 1); break; }
      }
    }
    const avgDaysToTrigger = daysToTriggerList.length > 0
      ? Math.round(daysToTriggerList.reduce((a, b) => a + b, 0) / daysToTriggerList.length)
      : null;

    const recentPrices = prices.slice(-7);
    const recentHits   = recentPrices.filter(p => direction === 'above' ? p >= targetPrice : p <= targetPrice).length;
    const recentRate   = recentPrices.length > 0 ? recentHits / recentPrices.length : 0;
    const confidence   = Math.round((hitRate * 0.6) + (recentRate * 100 * 0.4));

    let note = '';
    if (hitRate === 0) {
      note = `Price has never crossed Rs.${targetPrice} in ${totalDays} days of history.`;
    } else if (hitRate >= 80) {
      note = `Price crosses this threshold very frequently. Consider tightening your target.`;
    } else if (avgDaysToTrigger !== null) {
      note = `On average, price reaches your target within ${avgDaysToTrigger} day(s).`;
    }

    res.json({ hitCount, totalDays, hitRate, avgDaysToTrigger, confidence, note });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Filter by district
app.get('/api/prices/:district', async (req, res) => {
  try {
    const prices = await prisma.marketPrice.findMany({
      where: { district: { equals: req.params.district, mode: 'insensitive' } }
    });
    res.json(prices.map(mapPrice));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Sync live Maharashtra prices
app.get('/api/sync', rateLimit({ windowMs: 60 * 60 * 1000, max: 10, message: { error: 'Sync limit reached.' } }), async (req, res) => {
  try {
    const url = `https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070?api-key=${process.env.DATA_GOV_API_KEY}&format=json&filters%5Bstate%5D=Maharashtra&limit=100`;
    const { data } = await axios.get(url);

    if (!data.records || data.records.length === 0) {
      return res.json({ message: 'No records returned from API' });
    }

    let count = 0;
    for (const record of data.records) {
      const modal = parseFloat(record.modal_price);
      const min   = parseFloat(record.min_price);
      const max   = parseFloat(record.max_price);
      if (!record.commodity || !record.market || isNaN(modal)) continue;
      await prisma.marketPrice.create({
        data: {
          commodity:  record.commodity,
          market:     record.market,
          district:   record.district || 'Maharashtra',
          modalPrice: modal,
          minPrice:   isNaN(min) ? modal : min,
          maxPrice:   isNaN(max) ? modal : max,
        }
      });
      count++;
    }
    res.json({ message: `Synced ${count} live records from data.gov.in` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. AgroBot Chat (Groq)
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.post('/api/chat', rateLimit({ windowMs: 60 * 1000, max: 15, message: { error: 'Chat rate limit reached.' } }), async (req, res) => {
  try {
    const { messages, systemPrompt } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array required' });
    }
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1000,
      messages: [
        { role: 'system', content: systemPrompt || 'You are AgroBot, an agricultural assistant for Maharashtra.' },
        ...messages,
      ],
    });
    res.json({ reply: completion.choices[0].message.content });
  } catch (err) {
    console.error('AgroBot error:', err?.message);
    res.status(500).json({ error: 'Chat failed. Check your GROQ_API_KEY.' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));