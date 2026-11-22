import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Settings, 
  Workflow, 
  BarChart, 
  Database, 
  Layout, 
  Plus, 
  Save, 
  Play, 
  AlertTriangle,
  ServerCrash
} from 'lucide-react';

import { supabase } from '@/mysqlClient';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

const ConfigStudioPage = () => {
  const [activeTab, setActiveTab] = useState('workflow');
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkConnection = async () => {
      try {
        if (!supabase) throw new Error("No supabase client");
        const { error } = await supabase.from('employees').select('id').limit(1);
        if (error) throw error;
        setIsDemoMode(false);
      } catch (err) {
        console.warn('Supabase connection failed, switching to demo mode', err);
        setIsDemoMode(true);
      } finally {
        setLoading(false);
      }
    };
    checkConnection();
  }, []);

  const renderWorkflowDesigner = () => (
    <div className="flex h-full gap-4">
      <div className="w-64 bg-[#1f2137] p-4 rounded-xl border border-white/5 flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-2">Nodes</h3>
        {['Trigger', 'Condition', 'Action', 'Approval', 'Notification'].map((node) => (
          <div key={node} className="p-3 bg-[#2a2c44] rounded-lg border border-white/10 cursor-grab hover:border-indigo-500 transition-colors flex items-center gap-2">
            <Layout className="w-4 h-4 text-indigo-400" />
            <span className="text-sm text-gray-300">{node}</span>
          </div>
        ))}
      </div>
      <div className="flex-1 bg-[#1f2137] rounded-xl border border-white/5 p-6 relative overflow-hidden flex items-center justify-center">
        {/* Mock canvas */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L3N2Zz4=')] [mask-image:linear-gradient(to_bottom,white,transparent)]" />
        
        <div className="relative z-10 flex flex-col items-center gap-6 w-full max-w-2xl">
           <motion.div 
             initial={{ opacity: 0, y: -20 }}
             animate={{ opacity: 1, y: 0 }}
             className="w-56 p-4 bg-[#2a2c44] border-2 border-green-500/50 rounded-xl flex items-center justify-center shadow-lg"
           >
             <span className="font-medium text-green-400">Employee Onboarding</span>
           </motion.div>
           <div className="w-0.5 h-10 bg-indigo-500/50 relative">
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-indigo-400" />
           </div>
           <motion.div 
             initial={{ opacity: 0, y: -20 }}
             animate={{ opacity: 1, y: 0 }}
             transition={{ delay: 0.1 }}
             className="w-56 p-4 bg-[#2a2c44] border-2 border-indigo-500/50 rounded-xl flex items-center justify-center shadow-lg"
           >
             <span className="font-medium text-indigo-400">Manager Approval</span>
           </motion.div>
           <div className="w-0.5 h-10 bg-indigo-500/50 relative">
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-indigo-400" />
           </div>
           <motion.div 
             initial={{ opacity: 0, y: -20 }}
             animate={{ opacity: 1, y: 0 }}
             transition={{ delay: 0.2 }}
             className="w-56 p-4 bg-[#2a2c44] border-2 border-dashed border-gray-500 rounded-xl flex items-center justify-center shadow-lg cursor-pointer hover:border-gray-300 hover:bg-white/5 transition-all"
           >
             <Plus className="w-5 h-5 text-gray-400" />
           </motion.div>
        </div>
      </div>
      <div className="w-72 bg-[#1f2137] p-4 rounded-xl border border-white/5">
         <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-4">Properties</h3>
         <div className="space-y-4">
           <div>
             <label className="block text-xs text-gray-400 mb-1">Node Name</label>
             <input type="text" value="Manager Approval" readOnly className="w-full bg-[#2a2c44] border border-white/10 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors" />
           </div>
           <div>
             <label className="block text-xs text-gray-400 mb-1">Assignee Role</label>
             <select className="w-full bg-[#2a2c44] border border-white/10 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors">
               <option>Direct Manager</option>
               <option>HR Admin</option>
               <option>Department Head</option>
             </select>
           </div>
           <div className="pt-4 border-t border-white/10">
              <button className="w-full py-2 bg-indigo-600/20 text-indigo-400 rounded-lg text-sm font-medium hover:bg-indigo-600/30 transition-colors">
                Configure Logic
              </button>
           </div>
         </div>
      </div>
    </div>
  );

  const renderReportBuilder = () => (
    <div className="h-full flex flex-col gap-6">
      <div className="flex gap-4">
        {['Headcount Analytics', 'Payroll Summary', 'Performance Distribution'].map(report => (
          <div key={report} className="flex-1 p-5 bg-[#2a2c44] rounded-xl border border-white/5 hover:border-indigo-500/50 cursor-pointer transition-all shadow-md">
            <BarChart className="w-6 h-6 text-indigo-400 mb-3" />
            <h4 className="font-medium text-white">{report}</h4>
            <p className="text-xs text-gray-400 mt-1">Last modified 2 days ago</p>
          </div>
        ))}
      </div>
      <div className="flex-1 bg-[#1f2137] rounded-xl border border-white/5 p-6 flex flex-col shadow-inner">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold text-white">Report Canvas</h3>
          <div className="flex gap-3">
            <button className="px-4 py-2 bg-[#2a2c44] hover:bg-white/10 text-white rounded-lg text-sm transition-colors border border-white/10 font-medium">Preview</button>
            <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm transition-colors font-medium">Save Layout</button>
          </div>
        </div>
        <div className="flex-1 border-2 border-dashed border-white/10 rounded-xl flex items-center justify-center bg-[#2a2c44]/30 hover:bg-[#2a2c44]/50 transition-colors">
          <div className="text-center">
            <Layout className="w-12 h-12 text-gray-500/50 mx-auto mb-4" />
            <p className="text-gray-400 font-medium">Drag and drop charts and tables here</p>
            <p className="text-gray-500 text-sm mt-1">Select from the data sources panel</p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderCatalogs = () => (
    <div className="h-full bg-[#1f2137] rounded-xl border border-white/5 p-6 flex flex-col shadow-inner">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-semibold text-white">System Catalogs & Policies</h3>
          <p className="text-sm text-gray-400 mt-1">Manage core HR reference data and rules</p>
        </div>
        <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-lg shadow-indigo-900/20">
          <Plus className="w-4 h-4" /> Add Entry
        </button>
      </div>
      
      <div className="flex-1 overflow-x-auto bg-[#2a2c44] rounded-lg border border-white/5">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-white/10 bg-[#1f2137]/50">
              <th className="p-4 text-sm font-semibold text-gray-400 tracking-wide uppercase">Catalog Name</th>
              <th className="p-4 text-sm font-semibold text-gray-400 tracking-wide uppercase">Total Entries</th>
              <th className="p-4 text-sm font-semibold text-gray-400 tracking-wide uppercase">Status</th>
              <th className="p-4 text-sm font-semibold text-gray-400 tracking-wide uppercase">Last Updated</th>
              <th className="p-4 text-sm font-semibold text-gray-400 tracking-wide uppercase"></th>
            </tr>
          </thead>
          <tbody>
            {[
              { name: 'Departments', entries: 12, status: 'Active', updated: 'Today, 10:00 AM' },
              { name: 'Job Titles', entries: 45, status: 'Active', updated: 'Yesterday' },
              { name: 'Leave Types', entries: 8, status: 'Active', updated: 'Last Week' },
              { name: 'Policy Rules', entries: 24, status: 'Active', updated: 'Oct 15, 2025' },
              { name: 'Location Codes', entries: 5, status: 'Active', updated: 'Sep 30, 2025' }
            ].map((cat, i) => (
              <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer group">
                <td className="p-4 text-sm text-white font-medium group-hover:text-indigo-300 transition-colors">{cat.name}</td>
                <td className="p-4 text-sm text-gray-300">{cat.entries}</td>
                <td className="p-4 text-sm">
                  <span className="px-2.5 py-1 bg-green-500/10 text-green-400 rounded-full text-xs font-medium border border-green-500/20">{cat.status}</span>
                </td>
                <td className="p-4 text-sm text-gray-400">{cat.updated}</td>
                <td className="p-4 text-sm text-right">
                  <button className="text-gray-400 hover:text-white transition-colors">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#1a1c2e] text-slate-200 p-8 font-sans">
      <div className="max-w-[1600px] mx-auto h-[calc(100vh-4rem)] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
              <div className="p-2 bg-indigo-500/10 rounded-lg">
                <Settings className="w-7 h-7 text-indigo-500" />
              </div>
              Config Studio
            </h1>
            <p className="text-slate-400 mt-2 text-sm">Enterprise Administration & Workflow Management</p>
          </div>
          
          <div className="flex items-center gap-4">
            {isDemoMode && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2 bg-orange-500/10 text-orange-400 px-4 py-2 rounded-full border border-orange-500/30 shadow-lg shadow-orange-900/10"
              >
                <ServerCrash className="w-4 h-4" />
                <span className="text-sm font-semibold tracking-wide">DEMO MODE</span>
              </motion.div>
            )}
            <button className="flex items-center gap-2 bg-[#2a2c44] hover:bg-[#343756] border border-white/10 px-5 py-2.5 rounded-xl transition-colors shadow-sm">
              <Play className="w-4 h-4 text-green-400" />
              <span className="text-sm font-medium">Deploy Changes</span>
            </button>
            <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 px-5 py-2.5 rounded-xl transition-colors shadow-lg shadow-indigo-900/20">
              <Save className="w-4 h-4" />
              <span className="text-sm font-medium">Save Draft</span>
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col gap-6">
          {/* Tabs */}
          <div className="flex gap-2 p-1.5 bg-[#1f2137] rounded-xl w-fit border border-white/5 shadow-inner">
            {[
              { id: 'workflow', icon: Workflow, label: 'Workflow Designer' },
              { id: 'reports', icon: BarChart, label: 'Report Builder' },
              { id: 'catalogs', icon: Database, label: 'Catalogs & Policies' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.id 
                    ? 'bg-[#2a2c44] text-white shadow-md border border-white/10' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-indigo-400' : ''}`} />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Studio Area */}
          <motion.div 
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-1 bg-transparent rounded-2xl overflow-hidden"
          >
            {activeTab === 'workflow' && renderWorkflowDesigner()}
            {activeTab === 'reports' && renderReportBuilder()}
            {activeTab === 'catalogs' && renderCatalogs()}
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default ConfigStudioPage;
