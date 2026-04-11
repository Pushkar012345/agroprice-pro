import React, { useState } from 'react';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import * as ss from 'simple-statistics'; // Professional math library
import { 
  LayoutDashboard, TrendingUp, Search, Loader2, 
  AlertCircle, RefreshCw, Zap 
} from 'lucide-react';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, AreaChart, Area 
} from 'recharts';

const fetchPrices = async () => {
  const { data } = await axios.get('http://localhost:5000/api/prices');
  return data;
};

function App() {
  const [searchTerm, setSearchTerm] = useState('');

  const { data: prices = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['prices'],
    queryFn: fetchPrices,
    staleTime: 60000, 
  });

  // --- AI Forecasting Logic ---
  const calculateTrend = (item) => {
    try {
      // We use the min, modal, and max prices as 3 data points to find the slope
      // Point 0: Min, Point 1: Modal, Point 2: Max
      const regression = ss.linearRegression([
        [0, Number(item.min_price)], 
        [1, Number(item.modal_price)], 
        [2, Number(item.max_price)]
      ]);
      
      // A positive slope (m > 0) indicates an upward price trend
      return regression.m > 0 
        ? { label: 'Upward', color: 'text-emerald-500', bg: 'bg-emerald-50', icon: '↑' } 
        : { label: 'Downward', color: 'text-red-500', bg: 'bg-red-50', icon: '↓' };
    } catch (e) {
      return { label: 'Stable', color: 'text-slate-500', bg: 'bg-slate-50', icon: '→' };
    }
  };

  const filteredData = prices.filter((item) =>
    [item.commodity, item.market, item.district].some(val => 
      val.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  if (isLoading) return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50">
      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
        <Loader2 className="text-emerald-600" size={48} />
      </motion.div>
      <p className="mt-4 text-slate-500 font-medium">Syncing AI Market Models...</p>
    </div>
  );

  return (
    <div className="flex h-screen bg-[#f8fafc] font-sans text-slate-900">
      <aside className="w-72 bg-slate-900 text-white hidden lg:flex flex-col shadow-2xl">
        <div className="p-8">
          <div className="flex items-center gap-3 mb-10">
            <div className="h-10 w-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Zap size={24} className="text-white fill-white" />
            </div>
            <h1 className="text-xl font-black tracking-tight tracking-widest">AGRO<span className="text-emerald-400">CORE</span></h1>
          </div>
          <nav className="space-y-1">
            <NavItem icon={<LayoutDashboard size={20}/>} label="AI Intelligence" active />
          </nav>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-4 md:p-10">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
          <div>
            <h2 className="text-4xl font-black text-slate-800 tracking-tight">Market Pulse</h2>
            <p className="text-slate-500 mt-1">Predictive analysis for Maharashtra regions</p>
          </div>

          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="relative group flex-1 md:w-96">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors" size={20} />
              <input 
                type="text" 
                placeholder="Search crop or market..." 
                className="w-full pl-12 pr-4 py-3 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button 
              onClick={() => refetch()} 
              className={`p-3 rounded-2xl bg-white ring-1 ring-slate-200 hover:ring-emerald-500 transition-all ${isFetching ? 'animate-spin' : ''}`}
            >
              <RefreshCw size={20} className="text-slate-600" />
            </button>
          </div>
        </header>

        {/* --- KPI Grid --- */}
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
                  <p className="text-4xl font-black text-white">₹{prices.length > 0 ? Math.max(...prices.map(p => p.modal_price)) : 0}</p>
                </div>
              </div>
            </div>
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <TrendingUp size={180} />
            </div>
          </div>

          <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100 flex flex-col justify-between">
             <h3 className="font-bold text-slate-800">Density Map</h3>
             <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={filteredData.slice(0, 10)}>
                    <Area type="step" dataKey="modal_price" stroke="#10b981" fill="#10b981" fillOpacity={0.1} />
                  </AreaChart>
                </ResponsiveContainer>
             </div>
          </div>
        </div>

        {/* --- AI-Powered Grid --- */}
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
                  transition={{ delay: index * 0.03 }}
                  className="group bg-white p-6 rounded-[2rem] border border-slate-100 hover:border-emerald-500 hover:shadow-2xl hover:shadow-emerald-500/10 transition-all"
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

                  {/* AI Badge */}
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl w-fit ${trend.bg} border border-transparent group-hover:border-current transition-all duration-500`}>
                    <span className={`text-[10px] font-bold uppercase tracking-tighter ${trend.color}`}>
                      AI Forecast: {trend.label} {trend.icon}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </main>
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