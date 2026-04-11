import React, { useState } from 'react';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import * as ss from 'simple-statistics';
import {
  LayoutDashboard, TrendingUp, Search, Loader2,
  RefreshCw, Zap, X, MapPin, BarChart2, Download, CloudDownload
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

function App() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeDistrict, setActiveDistrict] = useState('All');
  const [selectedItem, setSelectedItem] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);

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
    const rows = filteredData.map(p => [
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
        ? { label: 'Upward', color: 'text-emerald-500', bg: 'bg-emerald-50', icon: '↑' }
        : { label: 'Downward', color: 'text-red-500', bg: 'bg-red-50', icon: '↓' };
    } catch {
      return { label: 'Stable', color: 'text-slate-500', bg: 'bg-slate-50', icon: '→' };
    }
  };

  const filteredData = prices.filter((item) => {
    const matchesSearch = [item.commodity, item.market, item.district].some(val =>
      val.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const matchesDistrict = activeDistrict === 'All' || item.district === activeDistrict;
    return matchesSearch && matchesDistrict;
  });

  if (isLoading) return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50">
      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
        <Loader2 className="text-emerald-600" size={48} />
      </motion.div>
      <p className="mt-4 text-slate-500 font-medium">Syncing AI Market Models...</p>
    </div>
  );

  return (
    <div className="flex h-screen bg-[#f8fafc] font-sans text-slate-900">

      {/* Sidebar */}
      <aside className="w-72 bg-slate-900 text-white hidden lg:flex flex-col shadow-2xl overflow-y-auto">
        <div className="p-8">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-10">
            <div className="h-10 w-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Zap size={24} className="text-white fill-white" />
            </div>
            <h1 className="text-xl font-black tracking-widest">AGRO<span className="text-emerald-400">CORE</span></h1>
          </div>

          {/* Nav */}
          <nav className="space-y-1 mb-6">
            <NavItem icon={<LayoutDashboard size={20} />} label="AI Intelligence" active />
          </nav>

          {/* Sync Button */}
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

          {/* Sync status message */}
          <AnimatePresence>
            {syncMsg && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`text-[11px] font-semibold px-3 py-2 rounded-xl mb-4 ${
                  syncMsg.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-red-500/10 text-red-400'
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

      {/* Main */}
      <main className="flex-1 overflow-y-auto p-4 md:p-10">
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
          <div>
            <h2 className="text-4xl font-black text-slate-800 tracking-tight">Market Pulse</h2>
            <p className="text-slate-500 mt-1">
              {activeDistrict === 'All' ? 'Predictive analysis for Maharashtra regions' : `Showing markets in ${activeDistrict}`}
            </p>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative group flex-1 md:w-80">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors" size={20} />
              <input
                type="text"
                placeholder="Search crop or market..."
                className="w-full pl-12 pr-4 py-3 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Export CSV */}
            <button
              onClick={handleExportCSV}
              title="Export to CSV"
              className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white ring-1 ring-slate-200 hover:ring-emerald-500 hover:text-emerald-600 transition-all text-slate-600 font-semibold text-sm"
            >
              <Download size={18} />
              <span className="hidden md:inline">Export</span>
            </button>

            {/* Refresh */}
            <button
              onClick={() => refetch()}
              className={`p-3 rounded-2xl bg-white ring-1 ring-slate-200 hover:ring-emerald-500 transition-all ${isFetching ? 'animate-spin' : ''}`}
            >
              <RefreshCw size={20} className="text-slate-600" />
            </button>
          </div>
        </header>

        {/* KPI Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
          <div className="lg:col-span-2 bg-slate-900 rounded-[2rem] p-8 text-white relative overflow-hidden shadow-2xl">
            <div className="relative z-10">
              <span className="bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase border border-emerald-500/30">Neural Engine Active</span>
              <h3 className="text-3xl font-bold mt-6">Average Market Confidence</h3>
              <div className="flex gap-12 mt-8">
                <div>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Analyzed Markets</p>
                  <p className="text-4xl font-black text-emerald-400">{filteredData.length}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Global Peak</p>
                  <p className="text-4xl font-black text-white">
                    ₹{filteredData.length > 0 ? Math.max(...filteredData.map(p => p.modal_price)) : 0}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Avg Price</p>
                  <p className="text-4xl font-black text-emerald-300">
                    ₹{filteredData.length > 0 ? Math.round(filteredData.reduce((s, p) => s + p.modal_price, 0) / filteredData.length) : 0}
                  </p>
                </div>
              </div>
            </div>
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <TrendingUp size={180} />
            </div>
          </div>

          <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100 flex flex-col justify-between">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-800">Price Density</h3>
              <span className="text-[10px] text-slate-400 font-semibold">{activeDistrict}</span>
            </div>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={filteredData.slice(0, 15)}>
                  <Area type="monotone" dataKey="modal_price" stroke="#10b981" fill="#10b981" fillOpacity={0.1} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          <AnimatePresence>
            {filteredData.map((item, index) => {
              const trend = calculateTrend(item);
              return (
                <motion.div
                  key={item.id || index}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: index * 0.02 }}
                  onClick={() => setSelectedItem(item)}
                  className="group bg-white p-6 rounded-[2rem] border border-slate-100 hover:border-emerald-500 hover:shadow-2xl hover:shadow-emerald-500/10 transition-all cursor-pointer"
                >
                  <div className="flex justify-between items-start mb-6">
                    <div className="h-12 w-12 bg-slate-50 rounded-2xl flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-all duration-300">
                      <TrendingUp size={20} />
                    </div>
                    <span className="text-[10px] font-black text-slate-400 uppercase bg-slate-50 px-3 py-1 rounded-full group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors">
                      {item.district}
                    </span>
                  </div>
                  <h4 className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">{item.commodity}</h4>
                  <p className="text-xl font-bold text-slate-800 mb-4">{item.market}</p>
                  <div className="flex items-baseline gap-1 mb-4">
                    <span className="text-3xl font-black text-slate-900">₹{item.modal_price}</span>
                    <span className="text-xs font-bold text-slate-400">/q</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl w-fit ${trend.bg}`}>
                      <span className={`text-[10px] font-bold uppercase tracking-tighter ${trend.color}`}>
                        AI Forecast: {trend.label} {trend.icon}
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

      {/* History Modal */}
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
              className="bg-white rounded-[2rem] p-8 w-full max-w-2xl shadow-2xl"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-50 px-3 py-1 rounded-full">
                    {selectedItem.district}
                  </span>
                  <h3 className="text-2xl font-black text-slate-800 mt-2">{selectedItem.commodity}</h3>
                  <p className="text-slate-500 font-medium">{selectedItem.market} · 30-Day Price History</p>
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
                    className="p-2 rounded-xl hover:bg-emerald-50 text-slate-400 hover:text-emerald-500 transition-colors"
                    title="Export history to CSV"
                  >
                    <Download size={18} />
                  </button>
                  <button onClick={() => setSelectedItem(null)} className="p-2 rounded-xl hover:bg-slate-100 transition-colors">
                    <X size={20} className="text-slate-500" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-6">
                {[
                  { label: 'Modal Price', value: selectedItem.modal_price, color: 'text-slate-900' },
                  { label: 'Min Price', value: selectedItem.min_price, color: 'text-emerald-600' },
                  { label: 'Max Price', value: selectedItem.max_price, color: 'text-red-500' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-slate-50 rounded-2xl p-4 text-center">
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
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={4} />
                      <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={v => `₹${v}`} />
                      <Tooltip
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                        formatter={(val) => [`₹${val}`, '']}
                      />
                      <Legend />
                      <Area type="monotone" dataKey="modal_price" name="Modal" stroke="#10b981" fill="url(#modalGrad)" strokeWidth={2} dot={false} />
                      <Area type="monotone" dataKey="min_price" name="Min" stroke="#6366f1" fill="none" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                      <Area type="monotone" dataKey="max_price" name="Max" stroke="#f43f5e" fill="none" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
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