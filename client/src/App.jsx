import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import * as ss from 'simple-statistics';
import {
  LayoutDashboard, TrendingUp, Search, Loader2,
  RefreshCw, Zap, X, MapPin, BarChart2, Download, CloudDownload,
  ArrowUpDown, Flame, TrendingDown, Minus, SlidersHorizontal,
  Sun, Moon, GitCompare, Bell, BellOff, ChevronUp, ChevronDown,
  CheckCircle2, AlertTriangle, Info, MessageSquare, Send, Bot, User
} from 'lucide-react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, Legend,
  ReferenceLine
} from 'recharts';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const fetchPrices = async () => {
  const { data } = await axios.get(`${API}/api/prices`);
  return data;
};

const fetchHistory = async (id) => {
  const { data } = await axios.get(`${API}/api/prices/${id}/history`);
  return data;
};

const fetchAlertSimulation = async ({ id, targetPrice, direction }) => {
  const { data } = await axios.get(`${API}/api/prices/${id}/alert-simulate`, {
    params: { targetPrice, direction },
  });
  return data;
};

const DISTRICTS = ['All', 'Nashik', 'Pune', 'Amravati', 'Latur', 'Nagpur', 'Kolhapur', 'Solapur', 'Aurangabad', 'Ahmednagar', 'Jalgaon', 'Satara'];

const COMMODITY_CATEGORIES = {
  Vegetables: ['Onion', 'Tomato', 'Potato', 'Cabbage', 'Cauliflower', 'Garlic', 'Ginger', 'Chilli'],
  Fruits:     ['Grapes', 'Orange', 'Banana', 'Pomegranate', 'Strawberry'],
  Grains:     ['Wheat', 'Maize', 'Rice', 'Jowar', 'Bajra'],
  CashCrops:  ['Cotton', 'Soybean', 'Tur Dal', 'Sugarcane'],
};

const SORT_OPTIONS = [
  { value: 'default',        label: 'Default',       icon: <ArrowUpDown size={14} /> },
  { value: 'price_high',     label: 'Highest Price',  icon: <Flame size={14} /> },
  { value: 'price_low',      label: 'Lowest Price',   icon: <TrendingDown size={14} /> },
  { value: 'most_volatile',  label: 'Most Volatile',  icon: <BarChart2 size={14} /> },
  { value: 'least_volatile', label: 'Most Stable',    icon: <Minus size={14} /> },
];

const CATEGORY_OPTIONS = [
  { value: 'all',        label: 'All Crops' },
  { value: 'Vegetables', label: '🥦 Vegetables' },
  { value: 'Fruits',     label: '🍊 Fruits' },
  { value: 'Grains',     label: '🌾 Grains' },
  { value: 'CashCrops',  label: '🌿 Cash Crops' },
];

const COMPARE_COLORS = ['#10b981', '#6366f1', '#f43f5e'];

// ─────────────────────────────────────────────
// CompareItemHistory
// ─────────────────────────────────────────────
function CompareItemHistory({ item, onData }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ['history', item.id],
    queryFn: () => fetchHistory(item.id),
  });
  useEffect(() => {
    if (!isLoading) onData(item.id, data);
  }, [data, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// ─────────────────────────────────────────────
// ComparisonModal
// ─────────────────────────────────────────────
function ComparisonModal({ items, onClose, isDark }) {
  const [histories, setHistories] = useState({});

  const handleHistoryData = (id, data) =>
    setHistories(prev => ({ ...prev, [id]: data }));

  const isLoading = items.some(item => !(item.id in histories));

  const maxLen = Math.max(...items.map(item => (histories[item.id] || []).length));
  const chartData = Array.from({ length: maxLen }, (_, i) => {
    const point = {};
    items.forEach((item, ci) => {
      const h = histories[item.id];
      if (h && h[i]) {
        point[`price_${ci}`] = h[i].modal_price;
        point['date'] = h[i].date;
      }
    });
    return point;
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={e => e.stopPropagation()}
        className="bg-white dark:bg-slate-800 rounded-[2rem] p-8 w-full max-w-3xl shadow-2xl border border-transparent dark:border-slate-700 max-h-[90vh] overflow-y-auto"
      >
        {items.map(item => (
          <CompareItemHistory key={item.id} item={item} onData={handleHistoryData} />
        ))}

        <div className="flex justify-between items-start mb-6">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1 rounded-full">
              Price Comparison
            </span>
            <h3 className="text-2xl font-black text-slate-800 dark:text-white mt-2">
              {items.map(i => i.commodity).join(' vs ')}
            </h3>
            <p className="text-slate-500 dark:text-slate-400 font-medium mt-1">
              30-Day historical price overlay
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <X size={20} className="text-slate-500 dark:text-slate-400" />
          </button>
        </div>

        <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
          {items.map((item, ci) => (
            <div key={item.id} className="bg-slate-50 dark:bg-slate-700 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: COMPARE_COLORS[ci] }} />
                <span className="font-black text-slate-800 dark:text-white text-sm truncate">{item.commodity}</span>
              </div>
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest mb-0.5">{item.district}</p>
              <p className="text-[11px] text-slate-400 mb-3 truncate">{item.market}</p>
              {[
                { label: 'Modal',  value: item.modal_price,               color: 'text-slate-900 dark:text-white' },
                { label: 'Min',    value: item.min_price,                  color: 'text-emerald-600' },
                { label: 'Max',    value: item.max_price,                  color: 'text-red-500' },
                { label: 'Spread', value: item.max_price - item.min_price, color: 'text-slate-500 dark:text-slate-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-slate-600 last:border-0">
                  <span className="text-[11px] text-slate-400 font-semibold">{label}</span>
                  <span className={`text-sm font-black ${color}`}>₹{value}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="h-64">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="animate-spin text-emerald-500" size={32} />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  {items.map((_, ci) => (
                    <linearGradient key={ci} id={`compareGrad${ci}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={COMPARE_COLORS[ci]} stopOpacity={0.15} />
                      <stop offset="95%" stopColor={COMPARE_COLORS[ci]} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#f1f5f9'} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: isDark ? '#64748b' : '#94a3b8' }} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={{ fontSize: 10, fill: isDark ? '#64748b' : '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={v => `₹${v}`} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', background: isDark ? '#1e293b' : '#fff', color: isDark ? '#f1f5f9' : '#0f172a' }}
                  formatter={(val) => [`₹${val}`, '']}
                />
                <Legend />
                {items.map((item, ci) => (
                  <Area key={ci} type="monotone" dataKey={`price_${ci}`} name={item.commodity}
                    stroke={COMPARE_COLORS[ci]} fill={`url(#compareGrad${ci})`} strokeWidth={2} dot={false} connectNulls />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// PriceAlertModal
// ─────────────────────────────────────────────
function PriceAlertModal({ item, onClose, isDark }) {
  const [targetPrice, setTargetPrice] = useState(item.modal_price);
  const [direction, setDirection]     = useState('above'); // 'above' | 'below'
  const [simulated, setSimulated]     = useState(false);

  // Fetch history to drive the simulator chart
  const { data: history = [], isLoading: histLoading } = useQuery({
    queryKey: ['history', item.id],
    queryFn: () => fetchHistory(item.id),
  });

  // Fetch simulation from server (hit-days analysis)
  const {
    data: simulation,
    isLoading: simLoading,
    refetch: runSim,
    isFetching: simFetching,
  } = useQuery({
    queryKey: ['alert-sim', item.id, targetPrice, direction],
    queryFn: () => fetchAlertSimulation({ id: item.id, targetPrice, direction }),
    enabled: simulated,
    staleTime: 0,
  });

  const handleRun = () => {
    setSimulated(true);
    if (simulated) runSim();
  };

  // Mark history days that would have triggered
  const chartData = history.map(h => ({
    ...h,
    triggered: direction === 'above'
      ? h.modal_price >= targetPrice
      : h.modal_price <= targetPrice,
  }));

  const hitCount    = chartData.filter(d => d.triggered).length;
  const hitPct      = history.length > 0 ? Math.round((hitCount / history.length) * 100) : 0;
  const priceGap    = Math.abs(item.modal_price - targetPrice);
  const gapPct      = item.modal_price > 0 ? ((priceGap / item.modal_price) * 100).toFixed(1) : 0;
  const wouldFire   = direction === 'above'
    ? item.modal_price >= targetPrice
    : item.modal_price <= targetPrice;

  // Smart insight
  const getInsight = () => {
    if (history.length === 0) return null;
    if (wouldFire) return { type: 'success', text: `Alert would fire RIGHT NOW — current price ₹${item.modal_price} is ${direction} your target.` };
    if (hitPct >= 70) return { type: 'warning', text: `High probability — price crossed your target on ${hitPct}% of recent days.` };
    if (hitPct === 0) return { type: 'info', text: `Price has never crossed ₹${targetPrice} in the last 30 days. This is a stretch target.` };
    return { type: 'info', text: `Price crossed your target on ${hitPct}% of days (${hitCount}/${history.length} days).` };
  };

  const insight = history.length > 0 ? getInsight() : null;

  const insightStyles = {
    success: { bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400', icon: <CheckCircle2 size={14} /> },
    warning: { bg: 'bg-amber-50 dark:bg-amber-500/10',     text: 'text-amber-700 dark:text-amber-400',     icon: <AlertTriangle size={14} /> },
    info:    { bg: 'bg-blue-50 dark:bg-blue-500/10',       text: 'text-blue-700 dark:text-blue-400',        icon: <Info size={14} /> },
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={e => e.stopPropagation()}
        className="bg-white dark:bg-slate-800 rounded-[2rem] p-8 w-full max-w-2xl shadow-2xl border border-transparent dark:border-slate-700 max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-500 bg-amber-50 dark:bg-amber-500/10 px-3 py-1 rounded-full">
              Price Alert Simulator
            </span>
            <h3 className="text-2xl font-black text-slate-800 dark:text-white mt-2">{item.commodity}</h3>
            <p className="text-slate-500 dark:text-slate-400 font-medium">{item.market} · {item.district}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <X size={20} className="text-slate-500 dark:text-slate-400" />
          </button>
        </div>

        {/* Current price reference */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Current Modal', value: item.modal_price, color: 'text-slate-900 dark:text-white' },
            { label: 'Min (30d)',     value: history.length > 0 ? Math.min(...history.map(h => h.modal_price)) : item.min_price, color: 'text-emerald-600' },
            { label: 'Max (30d)',     value: history.length > 0 ? Math.max(...history.map(h => h.modal_price)) : item.max_price, color: 'text-red-500' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-slate-50 dark:bg-slate-700 rounded-2xl p-4 text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</p>
              <p className={`text-2xl font-black ${color}`}>₹{typeof value === 'number' ? Math.round(value) : value}</p>
            </div>
          ))}
        </div>

        {/* Alert configuration */}
        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-2xl p-5 mb-5">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Configure Alert</p>

          {/* Direction toggle */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setDirection('above')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all ${
                direction === 'above'
                  ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                  : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-600'
              }`}
            >
              <ChevronUp size={16} /> Alert when price goes ABOVE
            </button>
            <button
              onClick={() => setDirection('below')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all ${
                direction === 'below'
                  ? 'bg-red-500 text-white shadow-md shadow-red-500/20'
                  : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-600'
              }`}
            >
              <ChevronDown size={16} /> Alert when price goes BELOW
            </button>
          </div>

          {/* Target price slider + input */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Target Price</label>
              <div className="flex items-center gap-1">
                <span className="text-slate-400 text-sm font-bold">₹</span>
                <input
                  type="number"
                  value={targetPrice}
                  min={1}
                  onChange={e => setTargetPrice(Number(e.target.value))}
                  className="w-24 text-right text-lg font-black text-slate-900 dark:text-white bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-2 py-1 outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
            <input
              type="range"
              min={Math.max(1, Math.round(item.modal_price * 0.3))}
              max={Math.round(item.modal_price * 2)}
              step={10}
              value={targetPrice}
              onChange={e => setTargetPrice(Number(e.target.value))}
              className="w-full accent-emerald-500"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
              <span>₹{Math.max(1, Math.round(item.modal_price * 0.3))}</span>
              <span className="text-slate-500 dark:text-slate-400 font-semibold">
                {targetPrice > item.modal_price ? `+${gapPct}% above current` : targetPrice < item.modal_price ? `${gapPct}% below current` : 'At current price'}
              </span>
              <span>₹{Math.round(item.modal_price * 2)}</span>
            </div>
          </div>
        </div>

        {/* Insight banner */}
        {insight && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex items-start gap-3 px-4 py-3 rounded-xl mb-5 ${insightStyles[insight.type].bg}`}
          >
            <span className={`mt-0.5 flex-shrink-0 ${insightStyles[insight.type].text}`}>
              {insightStyles[insight.type].icon}
            </span>
            <p className={`text-xs font-semibold leading-relaxed ${insightStyles[insight.type].text}`}>
              {insight.text}
            </p>
          </motion.div>
        )}

        {/* Chart with reference line */}
        <div className="h-52 mb-5">
          {histLoading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="animate-spin text-emerald-500" size={28} />
            </div>
          ) : history.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <BarChart2 size={32} className="mb-2 opacity-40" />
              <p className="text-sm font-semibold">No history data available</p>
              <p className="text-xs mt-1">Simulator uses live price data when history loads</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="alertGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#f1f5f9'} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: isDark ? '#64748b' : '#94a3b8' }} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={{ fontSize: 10, fill: isDark ? '#64748b' : '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={v => `₹${v}`} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', background: isDark ? '#1e293b' : '#fff', color: isDark ? '#f1f5f9' : '#0f172a' }}
                  formatter={(val, name) => name === 'modal_price' ? [`₹${val}`, 'Modal Price'] : [val, name]}
                />
                {/* Target reference line */}
                <ReferenceLine
                  y={targetPrice}
                  stroke={direction === 'above' ? '#10b981' : '#f43f5e'}
                  strokeDasharray="6 3"
                  strokeWidth={2}
                  label={{
                    value: `Target ₹${targetPrice}`,
                    fill: direction === 'above' ? '#10b981' : '#f43f5e',
                    fontSize: 11,
                    fontWeight: 700,
                    position: 'insideTopRight',
                  }}
                />
                <Area type="monotone" dataKey="modal_price" name="modal_price" stroke="#10b981" fill="url(#alertGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Stats row */}
        {history.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="bg-slate-50 dark:bg-slate-700 rounded-2xl p-4 text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Would fire today</p>
              <p className={`text-xl font-black ${wouldFire ? 'text-emerald-500' : 'text-slate-400'}`}>
                {wouldFire ? 'YES' : 'NO'}
              </p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-700 rounded-2xl p-4 text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Hit rate (30d)</p>
              <p className={`text-xl font-black ${hitPct >= 50 ? 'text-emerald-500' : hitPct >= 20 ? 'text-amber-500' : 'text-slate-500'}`}>
                {hitPct}%
              </p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-700 rounded-2xl p-4 text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Days triggered</p>
              <p className="text-xl font-black text-slate-800 dark:text-white">{hitCount}/{history.length}</p>
            </div>
          </div>
        )}

        {/* Server-side simulation result */}
        <AnimatePresence>
          {simulation && !simFetching && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="bg-slate-900 dark:bg-slate-700 rounded-2xl p-5 mb-5"
            >
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-3">AI Simulation Result</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-slate-400 text-xs font-semibold mb-1">Avg days to trigger</p>
                  <p className="text-2xl font-black text-white">{simulation.avgDaysToTrigger ?? '—'} <span className="text-sm text-slate-400">days</span></p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs font-semibold mb-1">Confidence</p>
                  <p className="text-2xl font-black text-emerald-400">{simulation.confidence ?? '—'}%</p>
                </div>
              </div>
              {simulation.note && (
                <p className="text-slate-400 text-xs mt-3 leading-relaxed">{simulation.note}</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action row */}
        <div className="flex gap-3">
          <button
            onClick={handleRun}
            disabled={simLoading || simFetching}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-bold text-sm transition-all"
          >
            {simLoading || simFetching
              ? <><Loader2 size={16} className="animate-spin" /> Simulating...</>
              : <><Bell size={16} /> Run Simulation</>
            }
          </button>
          <button
            onClick={onClose}
            className="px-5 py-3 rounded-2xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 font-bold text-sm transition-all"
          >
            Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// AgroBot Chatbot
// ─────────────────────────────────────────────
function AgroBot({ prices, isDark }) {
  const [open, setOpen]         = useState(false);
  const [input, setInput]       = useState('');
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "👋 Hi! I'm AgroBot. Ask me about crop prices, best markets, price trends, or farming advice for Maharashtra." }
  ]);
  const [loading, setLoading] = useState(false);
  const bottomRef = React.useRef(null);

  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const buildSystemPrompt = () => {
    const summary = prices.slice(0, 60).map(p =>
      `${p.commodity} at ${p.market} (${p.district}): Modal Rs.${p.modal_price}, Min Rs.${p.min_price}, Max Rs.${p.max_price}`
    ).join('\n');
    return `You are AgroBot, an expert agricultural market assistant for Maharashtra, India.
You have access to live mandi price data. Use it to answer questions accurately.

LIVE PRICE DATA:
${summary}

Guidelines:
- Prices are in Rs. per quintal
- Be concise and practical (3-5 lines max unless detailed analysis asked)
- When suggesting best markets, cite actual prices
- If a crop is not in the data, say so honestly
- Help with: current prices, best market to sell/buy, price trends, farming advice`;
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const newMessages = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    try {
      const response = await fetch(`${API}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt: buildSystemPrompt(),
          messages: newMessages.map(m => ({ role: m.role, content: m.content }))
        })
      });
      const data = await response.json();
      const reply = data?.reply || 'Sorry, could not get a response.';
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };

  const suggestions = ['Best market for Onion?', 'Highest price crop today?', 'Compare Pune vs Nashik', 'Should I sell Cotton now?'];

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-emerald-500 hover:bg-emerald-600 shadow-2xl shadow-emerald-500/40 flex items-center justify-center transition-all duration-200 hover:scale-110"
      >
        {open ? <X size={22} className="text-white" /> : <MessageSquare size={22} className="text-white" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`fixed z-50 shadow-2xl border flex flex-col overflow-hidden
              bottom-0 right-0 left-0 rounded-t-3xl
              sm:bottom-24 sm:right-6 sm:left-auto sm:w-[360px] sm:rounded-3xl
              ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}
            style={{ height: '520px' }}
          >
            {/* Header */}
            <div className="bg-emerald-500 px-5 py-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                <Bot size={20} className="text-white" />
              </div>
              <div>
                <p className="text-white font-bold text-sm">AgroBot</p>
                <p className="text-emerald-100 text-xs">AI Market Assistant • Maharashtra</p>
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
                <span className="text-emerald-100 text-xs">Live</span>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center ${msg.role === 'user' ? 'bg-emerald-500' : isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                    {msg.role === 'user' ? <User size={14} className="text-white" /> : <Bot size={14} className={isDark ? 'text-emerald-400' : 'text-emerald-600'} />}
                  </div>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${msg.role === 'user' ? 'bg-emerald-500 text-white rounded-tr-sm' : isDark ? 'bg-slate-800 text-slate-100 rounded-tl-sm' : 'bg-slate-100 text-slate-800 rounded-tl-sm'}`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex gap-2">
                  <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                    <Bot size={14} className={isDark ? 'text-emerald-400' : 'text-emerald-600'} />
                  </div>
                  <div className={`rounded-2xl rounded-tl-sm px-4 py-3 ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                    <div className="flex gap-1 items-center">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Suggestions */}
            {messages.length === 1 && (
              <div className="px-4 pb-2 flex flex-wrap gap-2">
                {suggestions.map(s => (
                  <button key={s} onClick={() => setInput(s)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${isDark ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className={`px-4 py-3 border-t ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
              <div className={`flex items-center gap-2 rounded-2xl px-4 py-2 ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Ask about prices, markets..."
                  className={`flex-1 bg-transparent text-sm outline-none ${isDark ? 'text-slate-100 placeholder-slate-500' : 'text-slate-800 placeholder-slate-400'}`}
                />
                <button onClick={send} disabled={!input.trim() || loading}
                  className="w-8 h-8 rounded-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 flex items-center justify-center transition-colors flex-shrink-0">
                  <Send size={14} className="text-white" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ─────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────
function App() {
  const [searchTerm, setSearchTerm]         = useState('');
  const [activeDistrict, setActiveDistrict] = useState('All');
  const [selectedItem, setSelectedItem]     = useState(null);
  const [alertItem, setAlertItem]           = useState(null);
  const [isSyncing, setIsSyncing]           = useState(false);
  const [syncMsg, setSyncMsg]               = useState(null);
  const [sortBy, setSortBy]                 = useState('default');
  const [activeCategory, setActiveCategory] = useState('all');
  const [isDark, setIsDark]                 = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('agro-theme') === 'dark';
    }
    return false;
  });

  // Compare state
  const [compareMode, setCompareMode]       = useState(false);
  const [compareItems, setCompareItems]     = useState([]);
  const [showComparison, setShowComparison] = useState(false);

  // Mobile sidebar
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem('agro-theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('agro-theme', 'light');
    }
  }, [isDark]);

  const { data: prices = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['prices'],
    queryFn: fetchPrices,
    staleTime: 60000,
  });

  const { data: history = [], isLoading: historyLoading } = useQuery({
    queryKey: ['history', selectedItem?.id],
    queryFn: () => fetchHistory(selectedItem.id),
    enabled: !!selectedItem,
  });

  const toggleCompare = (item) => {
    setCompareItems(prev => {
      const exists = prev.find(i => i.id === item.id);
      if (exists) return prev.filter(i => i.id !== item.id);
      if (prev.length >= 3) return prev;
      return [...prev, item];
    });
  };

  const isInCompare = (item) => compareItems.some(i => i.id === item.id);

  const exitCompareMode = () => {
    setCompareMode(false);
    setCompareItems([]);
    setShowComparison(false);
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncMsg(null);
    try {
      const { data } = await axios.get(`${API}/api/sync`);
      setSyncMsg({ type: 'success', text: data.message });
      refetch();
    } catch (err) {
      setSyncMsg({ type: 'error', text: 'Sync failed. Try again.' });
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncMsg(null), 4000);
    }
  };

  const handleExportCSV = () => {
    const headers = ['Commodity', 'Market', 'District', 'Modal Price', 'Min Price', 'Max Price'];
    const rows = processedData.map(p => [
      p.commodity, p.market, p.district, p.modal_price, p.min_price, p.max_price
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agrocore-${activeDistrict}-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const calculateTrend = (item) => {
    try {
      const regression = ss.linearRegression([
        [0, Number(item.min_price)],
        [1, Number(item.modal_price)],
        [2, Number(item.max_price)],
      ]);
      return regression.m > 0
        ? { label: 'Upward',   color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10', icon: '↑' }
        : { label: 'Downward', color: 'text-red-500',     bg: 'bg-red-50 dark:bg-red-500/10',         icon: '↓' };
    } catch {
      return { label: 'Stable', color: 'text-slate-500', bg: 'bg-slate-50 dark:bg-slate-700', icon: '→' };
    }
  };

  const getVolatility = (item) => item.max_price - item.min_price;

  const filteredData = prices.filter((item) => {
    const matchesSearch   = [item.commodity, item.market, item.district].some(val =>
      val.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const matchesDistrict = activeDistrict === 'All' || item.district === activeDistrict;
    const matchesCategory = activeCategory === 'all' ||
      (COMMODITY_CATEGORIES[activeCategory] || []).includes(item.commodity);
    return matchesSearch && matchesDistrict && matchesCategory;
  });

  const processedData = [...filteredData].sort((a, b) => {
    switch (sortBy) {
      case 'price_high':     return b.modal_price - a.modal_price;
      case 'price_low':      return a.modal_price - b.modal_price;
      case 'most_volatile':  return getVolatility(b) - getVolatility(a);
      case 'least_volatile': return getVolatility(a) - getVolatility(b);
      default:               return 0;
    }
  });

  const hasActiveFilters = activeCategory !== 'all' || sortBy !== 'default' || activeDistrict !== 'All' || searchTerm;
  const clearAllFilters = () => {
    setActiveCategory('all');
    setSortBy('default');
    setActiveDistrict('All');
    setSearchTerm('');
  };

  const handleCardClick = useCallback((item) => {
    if (compareMode) {
      toggleCompare(item);
    } else {
      setSelectedItem(item);
    }
  }, [compareMode]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950">
      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
        <Loader2 className="text-emerald-600" size={48} />
      </motion.div>
      <p className="mt-4 text-slate-500 dark:text-slate-400 font-medium">Syncing AI Market Models...</p>
    </div>
  );

  return (
    <div className="flex h-screen bg-[#f8fafc] dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 transition-colors duration-300">

      {/* ── Mobile Sidebar Overlay ── */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside className={`w-72 bg-slate-900 dark:bg-slate-950 dark:border-r dark:border-slate-800 text-white flex flex-col shadow-2xl overflow-y-auto
        fixed inset-y-0 left-0 z-50 transition-transform duration-300 lg:relative lg:translate-x-0
        ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="p-8">
          <div className="flex items-center gap-3 mb-10">
            <div className="h-10 w-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Zap size={24} className="text-white fill-white" />
            </div>
            <h1 className="text-xl font-black tracking-widest">AGRO<span className="text-emerald-400">CORE</span></h1>
            <button
              onClick={() => setMobileSidebarOpen(false)}
              className="ml-auto lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700"
            >
              <X size={18} />
            </button>
          </div>

          <nav className="space-y-1 mb-6">
            <NavItem icon={<LayoutDashboard size={20} />} label="AI Intelligence" active />
          </nav>

          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 mb-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all font-bold text-sm disabled:opacity-50"
          >
            {isSyncing
              ? <><Loader2 size={16} className="animate-spin" /> Syncing...</>
              : <><CloudDownload size={16} /> Sync Live Data</>
            }
          </button>

          <AnimatePresence>
            {syncMsg && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`text-[11px] font-semibold px-3 py-2 rounded-xl mb-4 ${
                  syncMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                }`}
              >
                {syncMsg.text}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-4">
            <div className="flex items-center gap-2 mb-4">
              <MapPin size={14} className="text-emerald-400" />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Filter by District</p>
            </div>
            <div className="space-y-1">
              {DISTRICTS.map(district => (
                <button
                  key={district}
                  onClick={() => setActiveDistrict(district)}
                  className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    activeDistrict === district
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {district}
                  {district !== 'All' && (
                    <span className="float-right text-[10px] opacity-60">
                      {prices.filter(p => p.district === district).length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 overflow-y-auto p-4 md:p-10">

        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-6">
          <div>
            <div className="flex items-center gap-3">
              {/* Hamburger - mobile only */}
              <button
                onClick={() => setMobileSidebarOpen(true)}
                className="lg:hidden p-2 rounded-xl bg-white dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 text-slate-600 dark:text-slate-300"
              >
                <SlidersHorizontal size={20} />
              </button>
              <h2 className="text-3xl md:text-4xl font-black text-slate-800 dark:text-white tracking-tight">Market Pulse</h2>
            </div>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              {compareMode
                ? `Compare mode — select up to 3 commodities (${compareItems.length}/3 selected)`
                : activeDistrict === 'All' ? 'Predictive analysis for Maharashtra regions' : `Showing markets in ${activeDistrict}`
              }
            </p>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            {/* Search */}
            <div className="relative group flex-1 md:w-80">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors" size={20} />
              <input
                type="text"
                value={searchTerm}
                placeholder="Search crop or market..."
                className="w-full pl-12 pr-4 py-3 rounded-2xl bg-white dark:bg-slate-800 dark:text-white dark:placeholder-slate-500 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Compare Toggle */}
            <button
              onClick={() => compareMode ? exitCompareMode() : setCompareMode(true)}
              title={compareMode ? 'Exit compare mode' : 'Compare commodities'}
              className={`flex items-center gap-2 px-4 py-3 rounded-2xl ring-1 transition-all font-semibold text-sm ${
                compareMode
                  ? 'bg-emerald-500 text-white ring-emerald-500 shadow-lg shadow-emerald-500/30'
                  : 'bg-white dark:bg-slate-800 ring-slate-200 dark:ring-slate-700 hover:ring-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 text-slate-600 dark:text-slate-300'
              }`}
            >
              <GitCompare size={18} />
              <span className="hidden md:inline">{compareMode ? 'Exit Compare' : 'Compare'}</span>
              {compareItems.length > 0 && (
                <span className="bg-white/30 text-white text-xs font-black px-1.5 py-0.5 rounded-lg leading-none">
                  {compareItems.length}
                </span>
              )}
            </button>

            {/* Export */}
            <button
              onClick={handleExportCSV}
              title="Export to CSV"
              className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 hover:ring-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all text-slate-600 dark:text-slate-300 font-semibold text-sm"
            >
              <Download size={18} />
              <span className="hidden md:inline">Export</span>
            </button>

            {/* Refresh */}
            <button
              onClick={() => refetch()}
              className={`p-3 rounded-2xl bg-white dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 hover:ring-emerald-500 transition-all ${isFetching ? 'animate-spin' : ''}`}
            >
              <RefreshCw size={20} className="text-slate-600 dark:text-slate-300" />
            </button>

            {/* Dark / Light Toggle */}
            <button
              onClick={() => setIsDark(d => !d)}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="relative p-3 rounded-2xl bg-white dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 hover:ring-emerald-500 transition-all overflow-hidden"
            >
              <AnimatePresence mode="wait" initial={false}>
                {isDark ? (
                  <motion.div key="sun" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }}>
                    <Sun size={20} className="text-amber-400" />
                  </motion.div>
                ) : (
                  <motion.div key="moon" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.2 }}>
                    <Moon size={20} className="text-slate-600" />
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          </div>
        </header>

        {/* Sort & Filter Bar */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-3 mb-8 p-4 bg-white dark:bg-slate-800 rounded-2xl ring-1 ring-slate-100 dark:ring-slate-700 shadow-sm"
        >
          <div className="flex items-center gap-2 text-slate-400 pr-3 border-r border-slate-100 dark:border-slate-700">
            <SlidersHorizontal size={16} />
            <span className="text-xs font-bold uppercase tracking-widest">Filters</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {CATEGORY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setActiveCategory(opt.value)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  activeCategory === opt.value
                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                    : 'bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="h-6 w-px bg-slate-100 dark:bg-slate-700 mx-1 hidden sm:block" />

          <div className="flex items-center gap-2 sm:ml-auto flex-wrap">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest hidden sm:block">Sort</span>
            {SORT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setSortBy(opt.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  sortBy === opt.value
                    ? 'bg-slate-900 dark:bg-emerald-500 text-white'
                    : 'bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600'
                }`}
              >
                {opt.icon}
                <span className="hidden sm:inline">{opt.label}</span>
              </button>
            ))}
          </div>

          <div className="w-full flex items-center gap-2 pt-2 border-t border-slate-50 dark:border-slate-700 mt-1">
            <span className="text-[11px] text-slate-400 font-semibold">
              Showing <span className="text-emerald-500 font-black">{processedData.length}</span> of {prices.length} markets
            </span>
            {hasActiveFilters && (
              <button onClick={clearAllFilters} className="ml-auto flex items-center gap-1 text-[11px] text-red-400 hover:text-red-500 font-bold transition-colors">
                <X size={12} /> Clear all filters
              </button>
            )}
          </div>
        </motion.div>

        {/* KPI Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
          <div className="lg:col-span-2 bg-slate-900 dark:bg-slate-800 dark:border dark:border-slate-700 rounded-[2rem] p-8 text-white relative overflow-hidden shadow-2xl">
            <div className="relative z-10">
              <span className="bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase border border-emerald-500/30">Neural Engine Active</span>
              <h3 className="text-3xl font-bold mt-6">Average Market Confidence</h3>
              <div className="flex gap-12 mt-8">
                <div>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Analyzed Markets</p>
                  <p className="text-4xl font-black text-emerald-400">{processedData.length}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Global Peak</p>
                  <p className="text-4xl font-black text-white">
                    ₹{processedData.length > 0 ? Math.max(...processedData.map(p => p.modal_price)) : 0}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Avg Price</p>
                  <p className="text-4xl font-black text-emerald-300">
                    ₹{processedData.length > 0 ? Math.round(processedData.reduce((s, p) => s + p.modal_price, 0) / processedData.length) : 0}
                  </p>
                </div>
              </div>
            </div>
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <TrendingUp size={180} />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 dark:border dark:border-slate-700 rounded-[2rem] p-8 shadow-sm border border-slate-100 flex flex-col justify-between">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-800 dark:text-white">Price Density</h3>
              <span className="text-[10px] text-slate-400 font-semibold">{activeDistrict}</span>
            </div>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={processedData.slice(0, 15)}>
                  <Area type="monotone" dataKey="modal_price" stroke="#10b981" fill="#10b981" fillOpacity={0.1} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Empty state */}
        {processedData.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-24 text-center">
            <div className="h-16 w-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-4">
              <Search size={28} className="text-slate-400" />
            </div>
            <p className="text-slate-700 dark:text-slate-200 font-bold text-lg">No markets found</p>
            <p className="text-slate-400 text-sm mt-1">Try adjusting your filters or search term</p>
            <button onClick={clearAllFilters} className="mt-4 px-5 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-bold hover:bg-emerald-600 transition-colors">
              Clear all filters
            </button>
          </motion.div>
        )}

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          <AnimatePresence>
            {processedData.map((item, index) => {
              const trend      = calculateTrend(item);
              const volatility = getVolatility(item);
              const selected   = isInCompare(item);
              return (
                <motion.div
                  key={item.id || index}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: index * 0.02 }}
                  onClick={() => handleCardClick(item)}
                  className={`relative group bg-white dark:bg-slate-800 p-6 rounded-[2rem] border transition-all cursor-pointer ${
                    compareMode && selected
                      ? 'border-emerald-500 ring-2 ring-emerald-500/30 shadow-lg shadow-emerald-500/10'
                      : 'border-slate-100 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 hover:shadow-2xl hover:shadow-emerald-500/10'
                  }`}
                >
                  {/* Compare checkbox */}
                  {compareMode && (
                    <div className={`absolute top-4 right-4 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all z-10 ${
                      selected ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                    }`}>
                      {selected && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                  )}

                  {/* Alert bell — only visible on hover, not in compare mode */}
                  {!compareMode && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setAlertItem(item); }}
                      className="absolute top-4 right-4 w-8 h-8 rounded-xl bg-slate-50 dark:bg-slate-700 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-amber-50 dark:hover:bg-amber-500/10 hover:text-amber-500 text-slate-400 transition-all z-10"
                      title="Set price alert"
                    >
                      <Bell size={14} />
                    </button>
                  )}

                  <div className="flex justify-between items-start mb-6">
                    <div className="h-12 w-12 bg-slate-50 dark:bg-slate-700 rounded-2xl flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-all duration-300 text-slate-600 dark:text-slate-300">
                      <TrendingUp size={20} />
                    </div>
                    <span className="text-[10px] font-black text-slate-400 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-400 px-3 py-1 rounded-full group-hover:bg-emerald-50 dark:group-hover:bg-emerald-500/10 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                      {item.district}
                    </span>
                  </div>

                  <h4 className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">{item.commodity}</h4>
                  <p className="text-xl font-bold text-slate-800 dark:text-white mb-4">{item.market}</p>
                  <div className="flex items-baseline gap-1 mb-3">
                    <span className="text-3xl font-black text-slate-900 dark:text-white">₹{item.modal_price}</span>
                    <span className="text-xs font-bold text-slate-400">/q</span>
                  </div>

                  <div className="mb-4">
                    <div className="flex justify-between text-[10px] text-slate-400 font-semibold mb-1">
                      <span>₹{item.min_price}</span>
                      <span className="text-slate-300 dark:text-slate-500">spread ₹{volatility}</span>
                      <span>₹{item.max_price}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden relative">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full absolute"
                        style={{
                          left: `${((item.modal_price - item.min_price) / (item.max_price - item.min_price || 1)) * 60}%`,
                          width: '40%',
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl w-fit ${trend.bg}`}>
                      <span className={`text-[10px] font-bold uppercase tracking-tighter ${trend.color}`}>
                        {trend.label} {trend.icon}
                      </span>
                    </div>
                    {!compareMode && (
                      <span className="text-[10px] text-slate-400 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <BarChart2 size={12} /> View chart
                      </span>
                    )}
                    {compareMode && (
                      <span className={`text-[10px] font-bold flex items-center gap-1 transition-opacity ${
                        selected ? 'text-emerald-500 opacity-100' : 'text-slate-400 opacity-60'
                      }`}>
                        <GitCompare size={12} /> {selected ? 'Selected' : 'Select'}
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Compare sticky tray */}
        <AnimatePresence>
          {compareMode && compareItems.length >= 1 && (
            <motion.div
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900 dark:bg-slate-800 rounded-2xl px-5 py-4 shadow-2xl flex items-center gap-4 border border-slate-700 max-w-xl w-[calc(100%-2rem)]"
            >
              <div className="flex items-center gap-2 flex-1 flex-wrap">
                {compareItems.map((item, ci) => (
                  <div key={item.id} className="flex items-center gap-1.5 bg-slate-800 dark:bg-slate-700 px-3 py-1.5 rounded-xl">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COMPARE_COLORS[ci] }} />
                    <span className="text-white font-bold text-xs">{item.commodity}</span>
                    <span className="text-slate-500 text-xs hidden sm:inline">{item.district}</span>
                    <button onClick={(e) => { e.stopPropagation(); toggleCompare(item); }} className="ml-1 text-slate-500 hover:text-red-400 transition-colors">
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                disabled={compareItems.length < 2}
                onClick={() => setShowComparison(true)}
                className="flex-shrink-0 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl transition-colors"
              >
                Compare {compareItems.length}/3
              </button>
            </motion.div>
          )}
        </AnimatePresence>

      </main>

      {/* ── History Modal ── */}
      <AnimatePresence>
        {selectedItem && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedItem(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-800 rounded-[2rem] p-8 w-full max-w-2xl shadow-2xl border border-transparent dark:border-slate-700"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1 rounded-full">
                    {selectedItem.district}
                  </span>
                  <h3 className="text-2xl font-black text-slate-800 dark:text-white mt-2">{selectedItem.commodity}</h3>
                  <p className="text-slate-500 dark:text-slate-400 font-medium">{selectedItem.market} · 30-Day Price History</p>
                </div>
                <div className="flex items-center gap-2">
                  {/* Set Alert button inside history modal */}
                  <button
                    onClick={() => { setSelectedItem(null); setAlertItem(selectedItem); }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors text-xs font-bold"
                    title="Set price alert"
                  >
                    <Bell size={14} /> Set Alert
                  </button>
                  <button
                    onClick={() => {
                      const headers = ['Date', 'Modal Price', 'Min Price', 'Max Price'];
                      const rows = history.map(h => [h.date, h.modal_price, h.min_price, h.max_price]);
                      const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
                      const blob = new Blob([csv], { type: 'text/csv' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${selectedItem.commodity}-${selectedItem.market}-history.csv`;
                      a.click();
                    }}
                    className="p-2 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-slate-400 hover:text-emerald-500 transition-colors"
                    title="Export history to CSV"
                  >
                    <Download size={18} />
                  </button>
                  <button onClick={() => setSelectedItem(null)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                    <X size={20} className="text-slate-500 dark:text-slate-400" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-6">
                {[
                  { label: 'Modal Price', value: selectedItem.modal_price, color: 'text-slate-900 dark:text-white' },
                  { label: 'Min Price',   value: selectedItem.min_price,   color: 'text-emerald-600' },
                  { label: 'Max Price',   value: selectedItem.max_price,   color: 'text-red-500' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-slate-50 dark:bg-slate-700 rounded-2xl p-4 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</p>
                    <p className={`text-2xl font-black ${color}`}>₹{value}</p>
                  </div>
                ))}
              </div>

              <div className="h-56">
                {historyLoading ? (
                  <div className="h-full flex items-center justify-center">
                    <Loader2 className="animate-spin text-emerald-500" size={32} />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={history}>
                      <defs>
                        <linearGradient id="modalGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#10b981" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#f1f5f9'} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: isDark ? '#64748b' : '#94a3b8' }} tickLine={false} axisLine={false} interval={4} />
                      <YAxis tick={{ fontSize: 10, fill: isDark ? '#64748b' : '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={v => `₹${v}`} />
                      <Tooltip
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', background: isDark ? '#1e293b' : '#fff', color: isDark ? '#f1f5f9' : '#0f172a' }}
                        formatter={(val) => [`₹${val}`, '']}
                      />
                      <Legend />
                      <Area type="monotone" dataKey="modal_price" name="Modal" stroke="#10b981" fill="url(#modalGrad)" strokeWidth={2} dot={false} />
                      <Area type="monotone" dataKey="min_price"   name="Min"   stroke="#6366f1" fill="none" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                      <Area type="monotone" dataKey="max_price"   name="Max"   stroke="#f43f5e" fill="none" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Comparison Modal ── */}
      <AnimatePresence>
        {showComparison && compareItems.length >= 2 && (
          <ComparisonModal
            items={compareItems}
            isDark={isDark}
            onClose={() => setShowComparison(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Price Alert Modal ── */}
      <AnimatePresence>
        {alertItem && (
          <PriceAlertModal
            item={alertItem}
            isDark={isDark}
            onClose={() => setAlertItem(null)}
          />
        )}
      </AnimatePresence>

      {/* ── AgroBot Chatbot ── */}
      <AgroBot prices={prices} isDark={isDark} />
    </div>
  );
}

const NavItem = ({ icon, label, active }) => (
  <div className={`flex items-center gap-4 p-4 rounded-2xl cursor-pointer transition-all ${active ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/40' : 'text-slate-500 hover:bg-slate-800 hover:text-white'}`}>
    {icon}
    <span className="font-bold text-sm">{label}</span>
  </div>
);

export default App;
