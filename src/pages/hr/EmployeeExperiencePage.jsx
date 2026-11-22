import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Heart, Activity, DollarSign, Newspaper, Award, Calendar, ChevronRight, CheckCircle, AlertCircle, Bot, Send, X, Plus } from 'lucide-react';
import { supabase } from '@/supabaseClient';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

// --- Mock Data ---
const mockNews = [
  { id: 1, type: 'news', title: 'New Remote Work Policy Update', date: 'Today, 09:00 AM', author: 'HR Dept' },
  { id: 2, type: 'recognition', title: 'Sarah Jenkins promoted to Sr. Dev', date: 'Yesterday', author: 'Engineering' },
  { id: 3, type: 'news', title: 'Q3 Townhall Meeting Next Week', date: 'Jul 24', author: 'Leadership' }
];

const mockWellbeing = {
  physical: { score: 85, label: 'Excellent', trend: '+5%' },
  mental: { score: 72, label: 'Good', trend: '-2%' },
  financial: { score: 90, label: 'Excellent', trend: '+10%' }
};

const mockQuickActions = [
  { id: 1, title: 'Request Time Off', icon: Calendar, color: 'text-blue-400', bg: 'bg-blue-400/10' },
  { id: 2, title: 'Submit Expense', icon: DollarSign, color: 'text-green-400', bg: 'bg-green-400/10' },
  { id: 3, title: 'View Paystub', icon: Activity, color: 'text-purple-400', bg: 'bg-purple-400/10' },
  { id: 4, title: 'Benefits Enrollment', icon: Heart, color: 'text-pink-400', bg: 'bg-pink-400/10' }
];

const EmployeeExperiencePage = () => {
  const [isDemoMode, setIsDemoMode] = useState(true);
  const [news, setNews] = useState([]);
  const [wellbeing, setWellbeing] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Chatbot State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: 'Hi! I am your AI HR Assistant. How can I help you today?' }
  ]);
  const [chatInput, setChatInput] = useState('');

  useEffect(() => {
    const fetchEXPData = async () => {
      setLoading(true);
      try {
        // Attempt to load from Supabase - simulated approach
        // const { data: newsData, error: newsError } = await supabase.from('hr_news').select('*');
        // if (newsError) throw newsError;
        
        // Simulating a failure to force MODO DEMO
        throw new Error('Supabase not connected');
      } catch (err) {
        setIsDemoMode(true);
        setNews(mockNews);
        setWellbeing(mockWellbeing);
      } finally {
        setLoading(false);
      }
    };
    
    fetchEXPData();
  }, []);

  const handleChatSubmit = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    
    const newUserMsg = { role: 'user', text: chatInput };
    setChatMessages([...chatMessages, newUserMsg]);
    setChatInput('');
    
    // Simulate AI response
    setTimeout(() => {
      setChatMessages(prev => [...prev, { role: 'assistant', text: 'Thanks for reaching out! In demo mode, I provide simulated responses. Please check the HR portal for full details on policies.' }]);
    }, 1000);
  };

  if (loading) {
    return <div className="min-h-screen bg-[#1a1c2e] flex items-center justify-center text-white">Loading EXP Platform...</div>;
  }

  return (
    <div className="min-h-screen bg-[#1a1c2e] text-white p-6 relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-purple-600/20 rounded-full blur-[100px]"></div>
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
              Employee Experience Hub
            </h1>
            <p className="text-gray-400 mt-2">Welcome back! Here's everything you need for work and wellbeing.</p>
          </div>
          <div className="flex items-center gap-4">
            {isDemoMode && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2 bg-orange-500/20 text-orange-400 px-4 py-2 rounded-full border border-orange-500/30 shadow-[0_0_15px_rgba(249,115,22,0.2)]"
              >
                <AlertCircle size={16} />
                <span className="text-sm font-semibold tracking-wide">MODO DEMO</span>
              </motion.div>
            )}
            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 p-1 cursor-pointer hover:scale-105 transition-transform">
              <img src="https://i.pravatar.cc/150?img=32" alt="Profile" className="h-full w-full rounded-full object-cover" />
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Column */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Quick Actions */}
            <section>
              <h2 className="text-xl font-semibold mb-4 text-gray-200">Quick Actions</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {mockQuickActions.map((action, idx) => (
                  <motion.button
                    key={action.id}
                    whileHover={{ scale: 1.05, y: -2 }}
                    whileTap={{ scale: 0.95 }}
                    className={`flex flex-col items-center justify-center p-4 rounded-2xl bg-[#2a2c44] border border-white/5 hover:border-white/10 transition-colors shadow-lg hover:shadow-xl group`}
                  >
                    <div className={`p-3 rounded-xl ${action.bg} ${action.color} mb-3 group-hover:scale-110 transition-transform`}>
                      <action.icon size={24} />
                    </div>
                    <span className="text-sm font-medium text-gray-300 text-center">{action.title}</span>
                  </motion.button>
                ))}
              </div>
            </section>

            {/* Corporate Feed */}
            <section className="bg-[#2a2c44] rounded-2xl p-6 border border-white/5 shadow-xl relative overflow-hidden">
               <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl pointer-events-none"></div>
              
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-gray-200 flex items-center gap-2">
                  <Newspaper size={20} className="text-blue-400" />
                  Corporate Feed
                </h2>
                <button className="text-sm text-blue-400 hover:text-blue-300 transition-colors">View All</button>
              </div>

              <div className="space-y-4">
                {news.map((item, i) => (
                  <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    key={item.id} 
                    className="flex gap-4 p-4 rounded-xl hover:bg-white/5 transition-colors cursor-pointer border border-transparent hover:border-white/5"
                  >
                    <div className="mt-1">
                      {item.type === 'recognition' ? (
                        <div className="p-2 bg-yellow-500/20 text-yellow-500 rounded-lg"><Award size={20} /></div>
                      ) : (
                        <div className="p-2 bg-blue-500/20 text-blue-500 rounded-lg"><Newspaper size={20} /></div>
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-200">{item.title}</h3>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                        <span>{item.author}</span>
                        <span className="w-1 h-1 rounded-full bg-gray-600"></span>
                        <span>{item.date}</span>
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-gray-500 self-center" />
                  </motion.div>
                ))}
              </div>
            </section>
          </div>

          {/* Right Sidebar Column */}
          <div className="space-y-6">
            
            {/* Wellbeing Dashboard */}
            <section className="bg-[#2a2c44] rounded-2xl p-6 border border-white/5 shadow-xl">
              <div className="flex items-center gap-2 mb-6">
                <Heart size={20} className="text-pink-400" />
                <h2 className="text-xl font-semibold text-gray-200">Wellbeing</h2>
              </div>

              <div className="space-y-5">
                {/* Physical */}
                <div>
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-sm text-gray-400">Physical Health</span>
                    <span className="text-xs text-green-400 font-medium">{wellbeing.physical.trend}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }} animate={{ width: `${wellbeing.physical.score}%` }} 
                        transition={{ duration: 1, ease: "easeOut" }}
                        className="h-full bg-gradient-to-r from-green-400 to-emerald-500"
                      />
                    </div>
                    <span className="text-sm font-semibold text-gray-200">{wellbeing.physical.score}</span>
                  </div>
                </div>
                
                {/* Mental */}
                <div>
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-sm text-gray-400">Mental Balance</span>
                    <span className="text-xs text-red-400 font-medium">{wellbeing.mental.trend}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }} animate={{ width: `${wellbeing.mental.score}%` }} 
                        transition={{ duration: 1, ease: "easeOut" }}
                        className="h-full bg-gradient-to-r from-blue-400 to-indigo-500"
                      />
                    </div>
                    <span className="text-sm font-semibold text-gray-200">{wellbeing.mental.score}</span>
                  </div>
                </div>

                {/* Financial */}
                <div>
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-sm text-gray-400">Financial Wellness</span>
                    <span className="text-xs text-green-400 font-medium">{wellbeing.financial.trend}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }} animate={{ width: `${wellbeing.financial.score}%` }} 
                        transition={{ duration: 1, ease: "easeOut" }}
                        className="h-full bg-gradient-to-r from-purple-400 to-pink-500"
                      />
                    </div>
                    <span className="text-sm font-semibold text-gray-200">{wellbeing.financial.score}</span>
                  </div>
                </div>
              </div>

              <button className="w-full mt-6 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-medium transition-colors text-gray-300 border border-white/5 hover:border-white/10">
                View Detailed Report
              </button>
            </section>
            
            {/* AI Assistant Banner */}
            <motion.div 
              whileHover={{ scale: 1.02 }}
              onClick={() => setIsChatOpen(true)}
              className="bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl p-6 shadow-xl shadow-purple-900/20 cursor-pointer relative overflow-hidden group"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl transform translate-x-8 -translate-y-8 group-hover:bg-white/20 transition-colors"></div>
              <div className="relative z-10 flex items-center gap-4">
                <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                  <Bot size={28} className="text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-lg">AI HR Assistant</h3>
                  <p className="text-blue-100 text-sm mt-1">Got questions? I'm here 24/7</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Floating Chatbot UI */}
      <AnimatePresence>
        {isChatOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="fixed bottom-6 right-6 w-96 max-w-[calc(100vw-3rem)] bg-[#2a2c44] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 flex flex-col"
            style={{ height: '500px' }}
          >
            {/* Chat Header */}
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-4 flex justify-between items-center text-white shadow-md">
              <div className="flex items-center gap-2">
                <Bot size={20} />
                <span className="font-semibold">HR Assistant AI</span>
              </div>
              <button onClick={() => setIsChatOpen(false)} className="hover:bg-white/20 p-1 rounded-lg transition-colors">
                <X size={18} />
              </button>
            </div>
            
            {/* Chat Messages */}
            <div className="flex-1 p-4 overflow-y-auto space-y-4 flex flex-col">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white/10 text-gray-200 rounded-bl-none'}`}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
            
            {/* Chat Input */}
            <div className="p-3 border-t border-white/10 bg-[#1a1c2e]">
              <form onSubmit={handleChatSubmit} className="flex items-center gap-2">
                <input 
                  type="text" 
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask about policies, time off..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
                <button type="submit" className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-full transition-colors flex-shrink-0">
                  <Send size={16} className="ml-1" />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default EmployeeExperiencePage;
