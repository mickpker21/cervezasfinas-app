import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Server, 
  ShieldCheck, 
  Activity, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  RefreshCw, 
  Database,
  Lock,
  Key,
  Users,
  Search,
  Filter,
  AlertTriangle
} from 'lucide-react';

import { supabase } from '@/supabaseClient';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

const DEMO_INTEGRATIONS = [
  { id: 1, name: 'SAP ERP', type: 'ERP', status: 'connected', lastSync: '10 mins ago', latency: '45ms' },
  { id: 2, name: 'IMSS IDSE', type: 'Government', status: 'error', lastSync: '1 hour ago', latency: '-' },
  { id: 3, name: 'SAT (CFDI)', type: 'Government', status: 'connected', lastSync: '2 mins ago', latency: '120ms' },
  { id: 4, name: 'Biometric Clocks', type: 'Hardware', status: 'pending', lastSync: '-', latency: '-' },
  { id: 5, name: 'HSBC Corporate', type: 'Banking', status: 'connected', lastSync: '5 mins ago', latency: '85ms' },
];

const DEMO_LOGS = [
  { id: 101, event: 'webhook.received', source: 'SAP ERP', timestamp: '2026-07-26 10:15:22', status: 'success' },
  { id: 102, event: 'auth.mfa_failed', source: 'Internal Portal', timestamp: '2026-07-26 10:14:05', status: 'warning' },
  { id: 103, event: 'api.timeout', source: 'IMSS IDSE', timestamp: '2026-07-26 10:05:11', status: 'error' },
  { id: 104, event: 'data.sync', source: 'Biometric Clocks', timestamp: '2026-07-26 09:50:00', status: 'success' },
];

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState([]);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('gateway');

  useEffect(() => {
    fetchIntegrations();
  }, []);

  const fetchIntegrations = async () => {
    try {
      setLoading(true);
      if (!supabase) throw new Error("Supabase client not initialized");
      
      const { data, error } = await supabase.from('hr_integrations').select('*');
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        setIntegrations(data);
        setIsDemoMode(false);
      } else {
        throw new Error("No data");
      }
    } catch (error) {
      console.warn("Supabase fetch failed, falling back to DEMO MODE:", error);
      setIntegrations(DEMO_INTEGRATIONS);
      setIsDemoMode(true);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'connected': return <CheckCircle2 className="w-5 h-5 text-green-400" />;
      case 'error': return <XCircle className="w-5 h-5 text-red-400" />;
      case 'pending': return <Clock className="w-5 h-5 text-yellow-400" />;
      default: return <AlertTriangle className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'connected': return 'bg-green-400/10 text-green-400 border-green-400/20';
      case 'error': return 'bg-red-400/10 text-red-400 border-red-400/20';
      case 'pending': return 'bg-yellow-400/10 text-yellow-400 border-yellow-400/20';
      default: return 'bg-gray-400/10 text-gray-400 border-gray-400/20';
    }
  };

  return (
    <div className="min-h-screen bg-[#1a1c2e] text-slate-200 p-6 font-sans">
      {/* Header */}
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Server className="w-8 h-8 text-indigo-400" />
            Global Integrations & Security
          </h1>
          <p className="text-slate-400 mt-1">Manage external APIs, webhooks, and enterprise security policies.</p>
        </div>
        <div className="flex items-center gap-4">
          {isDemoMode && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-orange-500/20 text-orange-400 border border-orange-500/30 px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-2"
            >
              <AlertTriangle className="w-4 h-4" />
              DEMO MODE
            </motion.div>
          )}
          <button 
            onClick={fetchIntegrations}
            className="flex items-center gap-2 bg-[#2a2c44] hover:bg-[#323554] border border-slate-700 px-4 py-2 rounded-lg text-sm transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-slate-800 pb-2 overflow-x-auto">
        {[
          { id: 'gateway', label: 'API Gateway', icon: Database },
          { id: 'events', label: 'Event Monitor', icon: Activity },
          { id: 'security', label: 'Security Panel', icon: ShieldCheck },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id 
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#2a2c44]'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {activeTab === 'gateway' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {loading ? (
              <div className="col-span-full py-12 flex justify-center text-slate-500">Loading integrations...</div>
            ) : (
              integrations.map((integration) => (
                <div key={integration.id} className="bg-[#2a2c44] border border-slate-700/50 rounded-xl p-5 hover:border-slate-600 transition-colors group">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[#1a1c2e] flex items-center justify-center border border-slate-700">
                        <Server className="w-5 h-5 text-indigo-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-white">{integration.name}</h3>
                        <span className="text-xs text-slate-400">{integration.type}</span>
                      </div>
                    </div>
                    <div className={`px-2.5 py-1 rounded-full text-xs font-medium border flex items-center gap-1.5 ${getStatusColor(integration.status)}`}>
                      {getStatusIcon(integration.status)}
                      <span className="capitalize">{integration.status}</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mt-6">
                    <div className="bg-[#1a1c2e] rounded-lg p-3 border border-slate-700/50">
                      <div className="text-xs text-slate-500 mb-1">Last Sync</div>
                      <div className="text-sm text-slate-300 font-medium">{integration.lastSync}</div>
                    </div>
                    <div className="bg-[#1a1c2e] rounded-lg p-3 border border-slate-700/50">
                      <div className="text-xs text-slate-500 mb-1">Latency</div>
                      <div className="text-sm text-slate-300 font-medium">{integration.latency}</div>
                    </div>
                  </div>
                  
                  <div className="mt-5 flex gap-2">
                    <button className="flex-1 bg-[#1a1c2e] hover:bg-indigo-500/10 text-indigo-300 border border-slate-700 hover:border-indigo-500/30 py-2 rounded-lg text-xs font-medium transition-colors">
                      Configure
                    </button>
                    <button className="flex-1 bg-[#1a1c2e] hover:bg-slate-700 text-slate-300 border border-slate-700 py-2 rounded-lg text-xs font-medium transition-colors">
                      View Logs
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'events' && (
          <div className="bg-[#2a2c44] border border-slate-700/50 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-700/50 flex flex-wrap gap-4 justify-between items-center bg-[#1e2035]">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-400" />
                <h2 className="font-semibold text-white">Live Event Stream</h2>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input 
                    type="text" 
                    placeholder="Search events..." 
                    className="bg-[#1a1c2e] border border-slate-700 text-sm rounded-lg pl-9 pr-4 py-1.5 focus:outline-none focus:border-indigo-500 text-slate-200"
                  />
                </div>
                <button className="p-1.5 bg-[#1a1c2e] border border-slate-700 rounded-lg text-slate-400 hover:text-white">
                  <Filter className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#1a1c2e]/50 text-slate-400">
                  <tr>
                    <th className="px-6 py-3 font-medium">Timestamp</th>
                    <th className="px-6 py-3 font-medium">Event Type</th>
                    <th className="px-6 py-3 font-medium">Source</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {DEMO_LOGS.map((log) => (
                    <tr key={log.id} className="hover:bg-[#1a1c2e]/30 transition-colors">
                      <td className="px-6 py-4 text-slate-400 font-mono text-xs">{log.timestamp}</td>
                      <td className="px-6 py-4 text-slate-200">{log.event}</td>
                      <td className="px-6 py-4 text-slate-300">{log.source}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          log.status === 'success' ? 'bg-green-500/10 text-green-400' :
                          log.status === 'error' ? 'bg-red-500/10 text-red-400' :
                          'bg-yellow-500/10 text-yellow-400'
                        }`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="text-indigo-400 hover:text-indigo-300 text-xs">Details</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-[#2a2c44] border border-slate-700/50 rounded-xl p-6">
              <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center mb-4 border border-blue-500/20">
                <Users className="w-6 h-6 text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">RBAC Management</h3>
              <p className="text-sm text-slate-400 mb-6">Configure role-based access control for the HR modules and API endpoints.</p>
              <button className="w-full bg-[#1a1c2e] hover:bg-[#323554] border border-slate-700 py-2.5 rounded-lg text-sm font-medium transition-colors">
                Manage Roles
              </button>
            </div>
            
            <div className="bg-[#2a2c44] border border-slate-700/50 rounded-xl p-6">
              <div className="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center mb-4 border border-purple-500/20">
                <Key className="w-6 h-6 text-purple-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">MFA Policies</h3>
              <p className="text-sm text-slate-400 mb-6">Enforce multi-factor authentication for sensitive payroll and employee data.</p>
              <div className="flex items-center justify-between bg-[#1a1c2e] p-3 rounded-lg border border-slate-700">
                <span className="text-sm text-slate-300">Require MFA</span>
                <div className="w-10 h-5 bg-indigo-500 rounded-full relative cursor-pointer">
                  <div className="w-4 h-4 bg-white rounded-full absolute top-0.5 right-0.5 shadow-sm"></div>
                </div>
              </div>
            </div>
            
            <div className="bg-[#2a2c44] border border-slate-700/50 rounded-xl p-6">
              <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center mb-4 border border-emerald-500/20">
                <Lock className="w-6 h-6 text-emerald-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Access Audit</h3>
              <p className="text-sm text-slate-400 mb-6">Review comprehensive logs of all administrative and API access attempts.</p>
              <button className="w-full bg-[#1a1c2e] hover:bg-[#323554] border border-slate-700 py-2.5 rounded-lg text-sm font-medium transition-colors">
                View Audit Trail
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
