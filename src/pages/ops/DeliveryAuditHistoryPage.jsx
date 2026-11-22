import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { 
  ClipboardCheck, 
  Search, 
  Calendar as CalendarIcon, 
  Download, 
  FileText, 
  Filter,
  User,
  Eye,
  RefreshCw
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/supabaseClient';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { fetchCustomAuditTemplates, fetchCustomAuditResponses } from '@/lib/mysqlCustomAudits';

export default function DeliveryAuditHistoryPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [unifiedAudits, setUnifiedAudits] = useState([]);
  const [templates, setTemplates] = useState([]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterType, setFilterType] = useState('ALL'); // 'ALL' | 'CLASSIC' | template_id

  const fetchAllData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Classic Audits (Supabase)
      const { data: classicData, error: classicError } = await supabase
        .from('delivery_audits')
        .select(`*, auditor:auditor_id (name)`)
        .order('created_at', { ascending: false });

      if (classicError) throw classicError;

      // 2. Fetch Dynamic Templates & Responses (MySQL)
      const templatesData = await fetchCustomAuditTemplates(true);
      const responsesData = await fetchCustomAuditResponses();

      setTemplates(templatesData || []);

      const templatesMap = {};
      (templatesData || []).forEach(t => {
        templatesMap[t.id] = t.title;
      });

      // 3. Unify Data
      const unified = [];

      // Process Classic
      (classicData || []).forEach(a => {
        unified.push({
          id: a.id,
          source: 'CLASSIC',
          type_id: 'CLASSIC',
          type_label: 'Auditoría de Reparto Clásica',
          target_name: a.repartidor_nombre || 'Sin Nombre',
          route: a.ruta || 'N/A',
          auditor_name: a.auditor?.name || 'Sistema',
          date: a.fecha, // YYYY-MM-DD
          time: `${a.hora_inicio || ''} - ${a.hora_termino || ''}`,
          pdf_url: a.pdf_url,
          created_at: new Date(a.created_at).getTime()
        });
      });

      // Process Dynamic
      (responsesData || []).forEach(a => {
        const d = new Date(a.created_at);
        unified.push({
          id: a.id,
          source: 'DYNAMIC',
          type_id: a.template_id,
          type_label: templatesMap[a.template_id] || 'Auditoría Personalizada',
          target_name: a.target_name || 'Sin Nombre',
          route: 'N/A',
          auditor_name: 'Auditor ID: ' + (a.auditor_id ? a.auditor_id.substring(0,6) : 'N/A'),
          date: format(d, 'yyyy-MM-dd'),
          time: format(d, 'HH:mm'),
          pdf_url: null, // No PDF generation yet for dynamic
          created_at: d.getTime()
        });
      });

      // Sort combined by created_at DESC
      unified.sort((a, b) => b.created_at - a.created_at);
      setUnifiedAudits(unified);

    } catch (err) {
      console.error(err);
      toast({ title: "Error", description: "No se pudieron cargar las auditorías.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const filteredAudits = unifiedAudits.filter(audit => {
    const matchesSearch = 
      audit.target_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      audit.route.toLowerCase().includes(searchTerm.toLowerCase()) ||
      audit.type_label.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesDate = filterMonth ? audit.date.startsWith(filterMonth) : true;
    
    const matchesType = filterType === 'ALL' ? true : audit.type_id === filterType;
    
    return matchesSearch && matchesDate && matchesType;
  });

  return (
    <div className="max-w-6xl mx-auto pb-20">
      <Helmet><title>Historial de Auditorías | Cervezas Finas</title></Helmet>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 px-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-500/20 rounded-2xl">
            <ClipboardCheck className="w-8 h-8 text-blue-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Historial de Auditorías</h1>
            <p className="text-slate-400">Consulta todos los tipos de auditorías realizadas</p>
          </div>
        </div>
        <Button 
          onClick={fetchAllData} 
          variant="outline" 
          className="border-white/10 text-slate-400 hover:bg-white/5"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6 px-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
          <Input 
            placeholder="Buscar persona o ruta..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10 bg-slate-900/50 border-white/10 text-white"
          />
        </div>
        
        <div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="bg-slate-900/50 border-white/10 text-white">
              <SelectValue placeholder="Tipo de Auditoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas las Auditorías</SelectItem>
              <SelectItem value="CLASSIC">Auditoría de Reparto Clásica</SelectItem>
              {templates.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="relative">
          <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
          <Input 
            type="month"
            value={filterMonth}
            onChange={e => setFilterMonth(e.target.value)}
            className="pl-10 bg-slate-900/50 border-white/10 text-white"
          />
        </div>

        <div className="flex items-center gap-2 text-slate-400 text-sm bg-slate-900/50 px-4 py-2 rounded-lg border border-white/10 h-10">
          <Filter size={16} />
          {filteredAudits.length} resultados
        </div>
      </div>

      {/* Lista de Auditorías */}
      <div className="space-y-4 px-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
            <p className="text-slate-500 animate-pulse">Cargando registros...</p>
          </div>
        ) : filteredAudits.length === 0 ? (
          <Card className="bg-slate-900/50 border-dashed border-white/10">
            <CardContent className="py-20 text-center">
              <FileText className="w-12 h-12 text-slate-700 mx-auto mb-4" />
              <p className="text-slate-500">No se encontraron auditorías con los filtros aplicados.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAudits.map((audit) => (
              <motion.div
                key={audit.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="bg-slate-900/50 border-white/10 hover:border-blue-500/30 transition-all overflow-hidden group">
                  <div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-start">
                    <div>
                      <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${audit.source === 'CLASSIC' ? 'text-blue-400' : 'text-purple-400'}`}>
                        {audit.type_label}
                      </p>
                      <h3 className="text-sm font-bold text-white line-clamp-1">{audit.target_name}</h3>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
                        {audit.date ? format(new Date(audit.date + 'T00:00:00'), 'dd MMM yyyy', { locale: es }) : 'N/A'}
                      </p>
                      <p className="text-[10px] text-slate-600 italic">{audit.time}</p>
                    </div>
                  </div>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <User className="w-3.5 h-3.5 text-slate-600" />
                      Auditor: <span className="text-slate-200 truncate">{audit.auditor_name}</span>
                    </div>
                    
                    {audit.source === 'CLASSIC' && audit.route !== 'N/A' && (
                        <div className="text-xs text-slate-400">
                            Ruta: <span className="text-slate-200">{audit.route}</span>
                        </div>
                    )}

                    <div className="flex gap-2 pt-2">
                      {audit.pdf_url ? (
                        <Button 
                          asChild
                          className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold h-9 rounded-xl"
                        >
                          <a href={audit.pdf_url} target="_blank" rel="noopener noreferrer">
                            <Download className="w-3.5 h-3.5 mr-2" /> PDF
                          </a>
                        </Button>
                      ) : (
                        <Button disabled className="flex-1 bg-slate-800 text-slate-600 text-xs h-9 rounded-xl">
                          Sin PDF
                        </Button>
                      )}
                      <Button variant="outline" className="border-white/10 text-slate-400 hover:bg-white/5 h-9 w-10 p-0 rounded-xl" title="Ver Detalles">
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
