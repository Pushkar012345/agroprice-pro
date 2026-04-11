import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import * as ss from 'simple-statistics';
import {
  LayoutDashboard, TrendingUp, Search, Loader2,
  RefreshCw, Zap, X, MapPin, BarChart2, Download, CloudDownload,
  ArrowUpDown, Flame, TrendingDown, Minus, SlidersHorizontal,
  Sun, Moon
} from 'lucide-react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, Legend
} from 'recharts';

const API = 'http://localhost:5000';

const fetchPrices = async () => {
  const { data } = await axios.get(`${API}/api/prices`);
  return data;
};

const fetchHistory = async (id) => {
  const { data } = await axios.get(`${API}/api/prices/${id}/history`);
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

function App() {
  const [searchTerm, setSearchTerm]         = useState('');
  const [activeDistrict, setActiveDistrict] = useState('All');
  const [selectedItem, setSelectedItem]     = useState(null);
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

  // Apply / remove `dark` class on root element
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

      {/* ── Sidebar ── */}
      <aside className="w-72 bg-slate-900 dark:bg-slate-950 dark:border-r dark:border-slate-800 text-white hidden lg:flex flex-col shadow-2xl overflow-y-auto">
        <div className="p-8">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-10">
            <div className="h-10 w-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Zap size={24} className="text-white fill-white" />
            </div>
            <h1 className="text-xl font-black tracking-widest">AGRO<span className="text-emerald-400">CORE</span></h1>
          </div>

          <nav className="space-y-1 mb-6">
            <NavItem icon={<LayoutDashboard size={20} />} label="AI Intelligence" active />
          </nav>

          {/* Sync */}
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

          {/* District Filter */}
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
            <h2 className="text-4xl font-black text-slate-800 dark:text-white tracking-tight">Market Pulse</h2>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              {activeDistrict === 'All' ? 'Predictive analysis for Maharashtra regions' : `Showing markets in ${activeDistrict}`}
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

            {/* ── Dark / Light Toggle ── */}
            <button
              onClick={() => setIsDark(d => !d)}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="relative p-3 rounded-2xl bg-white dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 hover:ring-emerald-500 transition-all overflow-hidden"
            >
              <AnimatePresence mode="wait" initial={false}>
                {isDark ? (
                  <motion.div
                    key="sun"
                    initial={{ rotate: -90, opacity: 0 }}
                    animate={{ rotate: 0,   opacity: 1 }}
                    exit={{   rotate:  90,  opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Sun size={20} className="text-amber-400" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="moon"
                    initial={{ rotate: 90,  opacity: 0 }}
                    animate={{ rotate: 0,   opacity: 1 }}
                    exit={{   rotate: -90,  opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Moon size={20} className="text-slate-600" />
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          </div>
        </header>

        {/* ── Sort & Filter Bar ── */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-3 mb-8 p-4 bg-white dark:bg-slate-800 rounded-2xl ring-1 ring-slate-100 dark:ring-slate-700 shadow-sm"
        >
          <div className="flex items-center gap-2 text-slate-400 pr-3 border-r border-slate-100 dark:border-slate-700">
            <SlidersHorizontal size={16} />
            <span className="text-xs font-bold uppercase tracking-widest">Filters</span>
          </div>

          {/* Category pills */}
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

          {/* Sort buttons */}
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

          {/* Result count + clear */}
          <div className="w-full flex items-center gap-2 pt-2 border-t border-slate-50 dark:border-slate-700 mt-1">
            <span className="text-[11px] text-slate-400 font-semibold">
              Showing <span className="text-emerald-500 font-black">{processedData.length}</span> of {prices.length} markets
            </span>
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="ml-auto flex items-center gap-1 text-[11px] text-red-400 hover:text-red-500 font-bold transition-colors"
              >
                <X size={12} /> Clear all filters
              </button>
            )}
          </div>
        </motion.div>

        {/* ── KPI Grid ── */}
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <div className="h-16 w-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-4">
              <Search size={28} className="text-slate-400" />
            </div>
            <p className="text-slate-700 dark:text-slate-200 font-bold text-lg">No markets found</p>
            <p className="text-slate-400 text-sm mt-1">Try adjusting your filters or search term</p>
            <button
              onClick={clearAllFilters}
              className="mt-4 px-5 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-bold hover:bg-emerald-600 transition-colors"
            >
              Clear all filters
            </button>
          </motion.div>
        )}

        {/* ── Cards Grid ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          <AnimatePresence>
            {processedData.map((item, index) => {
              const trend      = calculateTrend(item);
              const volatility = getVolatility(item);
              return (
                <motion.div
                  key={item.id || index}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: index * 0.02 }}
                  onClick={() => setSelectedItem(item)}
                  className="group bg-white dark:bg-slate-800 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 hover:shadow-2xl hover:shadow-emerald-500/10 transition-all cursor-pointer"
                >
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

                  {/* Volatility bar */}
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
                    <span className="text-[10px] text-slate-400 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <BarChart2 size={12} /> View chart
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </main>

      {/* ── History Modal ── */}
      <AnimatePresence>
        {selectedItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedItem(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
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
                        contentStyle={{
                          borderRadius: '12px',
                          border: 'none',
                          boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                          background: isDark ? '#1e293b' : '#fff',
                          color: isDark ? '#f1f5f9' : '#0f172a',
                        }}
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
