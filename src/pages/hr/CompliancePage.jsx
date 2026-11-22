import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  ShieldAlert, 
  Activity, 
  Users, 
  Search, 
  AlertTriangle,
  CheckCircle,
  Clock,
  Database,
  Lock
} from 'lucide-react';

// Mock supabase client to trigger DEMO MODE if real supabase is not configured
const supabase = {
  from: () => ({ select: () => Promise.reject(new Error("Demo Mode Trigger")) })
};

const CompliancePage = () => {
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // States for different sections
  const [ehsIncidents, setEhsIncidents] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Attempt to fetch from Supabase
        const { data: logs, error: logsError } = await supabase.from('hr_compliance_logs').select('*');
        const { data: incidents, error: incidentsError } = await supabase.from('hr_ehs_incidents').select('*');
        
        if (logsError || incidentsError) throw new Error("Database error");
        
        setAuditLogs(logs || []);
        setEhsIncidents(incidents || []);
      } catch (error) {
        // Fallback to DEMO MODE
        setIsDemoMode(true);
        setEhsIncidents([
          { id: 1, type: 'Minor Injury', location: 'Plant A', date: '2026-07-20', status: 'Resolved', severity: 'low' },
          { id: 2, type: 'Near Miss', location: 'Warehouse B', date: '2026-07-22', status: 'Investigating', severity: 'medium' },
          { id: 3, type: 'NOM-035 Stress Alert', location: 'Office', date: '2026-07-25', status: 'Action Required', severity: 'high' }
        ]);
        setAuditLogs([
          { id: 1, user: 'admin_01', action: 'Modified Salary Band', module: 'Payroll', timestamp: '2026-07-26 09:12:00', risk: 'high' },
          { id: 2, user: 'hr_manager', action: 'Approved Leave', module: 'Time & Attendance', timestamp: '2026-07-26 10:05:30', risk: 'low' },
          { id: 3, user: 'sys_auto', action: 'Union Dues Deducted', module: 'Union Control', timestamp: '2026-07-26 11:00:00', risk: 'low' }
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'high': return 'text-red-500 bg-red-500/10 border-red-500/20';
      case 'medium': return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
      case 'low': return 'text-green-500 bg-green-500/10 border-green-500/20';
      default: return 'text-gray-500 bg-gray-500/10 border-gray-500/20';
    }
  };

  return (
    <div className="min-h-screen bg-[#1a1c2e] text-white p-6 font-sans">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <ShieldAlert className="w-8 h-8 text-blue-400" />
            Compliance, Governance & Audit
          </h1>
          <p className="text-gray-400 mt-2">Enterprise Risk & Regulatory Management</p>
        </div>
        {isDemoMode && (
          <div className="flex items-center gap-2 px-4 py-2 bg-orange-500/20 border border-orange-500/50 rounded-full text-orange-400 font-medium shadow-[0_0_15px_rgba(249,115,22,0.2)]">
            <Database className="w-4 h-4 animate-pulse" />
            DEMO MODE
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* NOM-035 & EHS Panel */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 bg-[#2a2c44] rounded-xl border border-gray-700 p-6 shadow-2xl"
        >
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Activity className="w-5 h-5 text-green-400" />
              EHS & NOM-035 Incidents
            </h2>
            <button className="text-sm text-blue-400 hover:text-blue-300 transition-colors">View Full Report</button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400">
                  <th className="pb-3 font-medium">Type</th>
                  <th className="pb-3 font-medium">Location</th>
                  <th className="pb-3 font-medium">Date</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Risk Level</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="5" className="py-8 text-center text-gray-500">Loading data...</td></tr>
                ) : (
                  ehsIncidents.map((incident) => (
                    <tr key={incident.id} className="border-b border-gray-700/50 hover:bg-white/5 transition-colors">
                      <td className="py-4 font-medium">{incident.type}</td>
                      <td className="py-4 text-gray-300">{incident.location}</td>
                      <td className="py-4 text-gray-300">{incident.date}</td>
                      <td className="py-4">
                        <span className="flex items-center gap-1.5 text-sm">
                          {incident.status === 'Resolved' ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Clock className="w-4 h-4 text-yellow-400" />}
                          {incident.status}
                        </span>
                      </td>
                      <td className="py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getSeverityColor(incident.severity)}`}>
                          {incident.severity.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Union Control Panel */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-[#2a2c44] rounded-xl border border-gray-700 p-6 shadow-2xl flex flex-col"
        >
          <h2 className="text-xl font-semibold flex items-center gap-2 mb-6">
            <Users className="w-5 h-5 text-purple-400" />
            Union Control
          </h2>
          
          <div className="space-y-4 flex-grow">
            <div className="bg-[#1a1c2e] p-4 rounded-lg border border-gray-700/50">
              <div className="text-gray-400 text-sm mb-1">Active Collective Contract</div>
              <div className="text-lg font-semibold text-white">SNTIA-2025-2027</div>
              <div className="text-xs text-green-400 mt-2 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Valid up to Dec 2027
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#1a1c2e] p-4 rounded-lg border border-gray-700/50 text-center">
                <div className="text-2xl font-bold text-blue-400">842</div>
                <div className="text-xs text-gray-400 mt-1">Unionized Workers</div>
              </div>
              <div className="bg-[#1a1c2e] p-4 rounded-lg border border-gray-700/50 text-center">
                <div className="text-2xl font-bold text-purple-400">$45.2K</div>
                <div className="text-xs text-gray-400 mt-1">Monthly Dues (MXN)</div>
              </div>
            </div>
          </div>
          <button className="w-full mt-6 py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 rounded-lg border border-purple-500/30 transition-colors text-sm font-medium">
            Manage Agreements
          </button>
        </motion.div>

        {/* Audit Logs & SoD */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-3 bg-[#2a2c44] rounded-xl border border-gray-700 p-6 shadow-2xl"
        >
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Lock className="w-5 h-5 text-red-400" />
              System Audit Logs & SoD Exceptions
            </h2>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search logs..." 
                className="pl-9 pr-4 py-2 bg-[#1a1c2e] border border-gray-600 rounded-lg text-sm focus:outline-none focus:border-blue-500 transition-colors text-white"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400">
                  <th className="pb-3 font-medium">Timestamp</th>
                  <th className="pb-3 font-medium">User/Actor</th>
                  <th className="pb-3 font-medium">Action Performed</th>
                  <th className="pb-3 font-medium">Module</th>
                  <th className="pb-3 font-medium">SoD Risk</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="5" className="py-8 text-center text-gray-500">Loading audit trail...</td></tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id} className="border-b border-gray-700/50 hover:bg-white/5 transition-colors text-sm">
                      <td className="py-3 text-gray-400 font-mono">{log.timestamp}</td>
                      <td className="py-3 font-medium text-blue-300">{log.user}</td>
                      <td className="py-3 text-gray-200">{log.action}</td>
                      <td className="py-3 text-gray-400">{log.module}</td>
                      <td className="py-3">
                        {log.risk === 'high' ? (
                          <span className="flex items-center gap-1.5 text-red-400 bg-red-400/10 px-2 py-1 rounded-md w-fit border border-red-400/20">
                            <AlertTriangle className="w-3 h-3" /> SoD Violation
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-gray-500 px-2 py-1">
                            Normal
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default CompliancePage;
