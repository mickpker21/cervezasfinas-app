import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/supabaseClient';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Users,
  Phone,
  Mail,
  Briefcase,
  Building2,
  ChevronUp,
  UserCircle2,
  Loader2,
} from 'lucide-react';

const ROLE_LABELS = {
  admin: 'Administrador',
  administrador: 'Administrador',
  supervisor: 'Supervisor',
  analista: 'Analista',
  instalador: 'Instalador',
  rrhh: 'Recursos Humanos',
  autoventa: 'Autoventa',
  almacen: 'Almacén',
  coortrade: 'CoorTrade',
  coorcon: 'CoorCon',
};

const GRADIENT_PALETTES = [
  'from-emerald-500 to-teal-600',
  'from-blue-500 to-indigo-600',
  'from-purple-500 to-violet-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-cyan-500 to-sky-600',
  'from-fuchsia-500 to-purple-600',
  'from-lime-500 to-green-600',
];

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function getInitials(name) {
  if (!name) return '??';
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

export default function DirectoryPage() {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');

  useEffect(() => {
    const fetchProfiles = async () => {
      setLoading(true);
      try {
        // Fetch all profiles with the supervisor info via reports_to self-join
        const { data, error } = await supabase
          .from('profiles')
          .select(`
            id,
            name,
            email,
            role,
            phone,
            job_title,
            department,
            photo_url,
            employee_id,
            start_date,
            reports_to,
            route
          `)
          .order('name', { ascending: true });

        if (error) throw error;

        // Fetch hr_employees linked data to enrich the directory
        const { data: hrData } = await supabase
          .from('hr_employees')
          .select('active_profile_id, employee_number, first_name, last_name, hire_date, status, department, job_title')
          .not('active_profile_id', 'is', null);

        // Build hr lookup map by active_profile_id
        const hrMap = new Map();
        (hrData || []).forEach(hr => hrMap.set(hr.active_profile_id, hr));

        // Build a lookup map for supervisor names
        const profileMap = new Map();
        (data || []).forEach(p => profileMap.set(p.id, p));

        // Enrich each profile with supervisor name + hr_employees data
        const enriched = (data || []).map(p => {
          const hr = hrMap.get(p.id);
          return {
            ...p,
            // Use the full name from hr_employees if profile name is missing/generic
            name: p.name || (hr ? [hr.first_name, hr.last_name].filter(Boolean).join(' ') : null) || p.email,
            supervisor_name: p.reports_to ? (profileMap.get(p.reports_to)?.name || null) : null,
            supervisor_job_title: p.reports_to ? (profileMap.get(p.reports_to)?.job_title || null) : null,
            // hr_employees enrichment
            hr_employee_number: hr?.employee_number || null,
            hr_hire_date: hr?.hire_date || p.start_date || null,
            hr_status: hr?.status || null,
            hr_department: hr?.department || p.department || null,
            hr_job_title: hr?.job_title || p.job_title || null,
          };
        });

        setProfiles(enriched);
      } catch (e) {
        console.error('[DirectoryPage] Error loading profiles:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchProfiles();
  }, []);


  const departments = useMemo(() => {
    const set = new Set();
    profiles.forEach(p => {
      if (p.department) set.add(p.department);
    });
    return Array.from(set).sort();
  }, [profiles]);

  const filtered = useMemo(() => {
    // Exclude "DEMO" users
    let result = profiles.filter(p => !(p.name || '').toUpperCase().includes('DEMO'));

    if (departmentFilter && departmentFilter !== 'all') {
      result = result.filter(p => p.department === departmentFilter);
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.job_title || '').toLowerCase().includes(q) ||
        (p.department || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q) ||
        (p.employee_id || '').toLowerCase().includes(q)
      );
    }

    return result;
  }, [profiles, searchTerm, departmentFilter]);

  return (
    <>
      <Helmet>
        <title>Directorio de Empleados - Cervezas Finas</title>
        <meta name="description" content="Directorio corporativo de empleados" />
      </Helmet>

      <div className="min-h-screen pb-20">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-4 mb-2">
            <div className="p-3 bg-cyan-500/10 rounded-2xl border border-cyan-500/20">
              <Users className="w-7 h-7 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-white tracking-tight">Directorio</h1>
              <p className="text-slate-400 text-sm">Directorio corporativo de colaboradores</p>
            </div>
          </div>
        </motion.div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col sm:flex-row gap-3 mb-6"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
            <Input
              placeholder="Buscar por nombre, puesto, departamento..."
              className="bg-slate-800/50 border-white/10 text-white pl-10 h-11 rounded-xl"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectTrigger className="w-full sm:w-56 bg-slate-800/50 border-white/10 text-white h-11 rounded-xl">
              <SelectValue placeholder="Departamento" />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-white/10 text-white">
              <SelectItem value="all">Todos los departamentos</SelectItem>
              {departments.map(d => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </motion.div>

        {/* Stats Bar */}
        {!loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="flex items-center gap-4 mb-6 text-xs"
          >
            <span className="text-slate-500">
              {filtered.length} colaborador{filtered.length !== 1 ? 'es' : ''}
              {departmentFilter !== 'all' ? ` en ${departmentFilter}` : ''}
            </span>
            {departments.length > 0 && (
              <span className="text-slate-600">{departments.length} departamentos</span>
            )}
          </motion.div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="w-10 h-10 text-cyan-500 animate-spin" />
            <p className="text-slate-400 text-sm">Cargando directorio...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="p-5 bg-slate-800/50 rounded-full">
              <Users className="w-12 h-12 text-slate-600" />
            </div>
            <p className="text-slate-500">No se encontraron colaboradores.</p>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          >
            <AnimatePresence>
              {filtered.map((person, idx) => {
                const gradient = GRADIENT_PALETTES[hashString(person.id || person.email || '') % GRADIENT_PALETTES.length];
                const initials = getInitials(person.name);
                const roleLabel = ROLE_LABELS[(person.role || '').toLowerCase()] || person.role || '';

                return (
                  <motion.div
                    key={person.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: Math.min(idx * 0.03, 0.5) }}
                  >
                    <Card className="group relative overflow-hidden bg-slate-900/60 border-white/[0.06] hover:border-cyan-500/30 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-900/10 hover:-translate-y-0.5 rounded-2xl">
                      {/* Top accent bar */}
                      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${gradient} opacity-60 group-hover:opacity-100 transition-opacity`} />

                      <CardContent className="p-5 pt-6">
                        {/* Avatar + Name */}
                        <div className="flex items-start gap-3 mb-4">
                          {person.photo_url ? (
                            <img
                              src={person.photo_url}
                              alt={person.name}
                              className="w-12 h-12 rounded-xl object-cover border border-white/10 flex-shrink-0"
                              onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                            />
                          ) : null}
                          <div
                            className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-lg ${person.photo_url ? 'hidden' : ''}`}
                            style={person.photo_url ? { display: 'none' } : {}}
                          >
                            {initials}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <h3 className="font-bold text-white text-sm leading-tight truncate">{person.name || 'Sin nombre'}</h3>
                              {person.hr_status === 'BAJA' && (
                                <span className="text-[8px] bg-red-900/40 text-red-400 border border-red-800/40 px-1.5 py-0.5 rounded-full font-bold flex-shrink-0">BAJA</span>
                              )}
                            </div>
                            <span className={`inline-block mt-1.5 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${(person.hr_job_title || person.job_title) ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' : 'bg-white/5 text-slate-500 border-white/5'}`}>
                              {person.hr_job_title || person.job_title || 'Sin puesto'}
                            </span>
                          </div>
                        </div>

                        {/* Details */}
                        <div className="space-y-2">
                          {(person.hr_department || person.department) && (
                            <div className="flex items-center gap-2 text-xs text-slate-400">
                              <Building2 className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                              <span className="truncate">{person.hr_department || person.department}</span>
                            </div>
                          )}

                          {person.email && (
                            <div className="flex items-center gap-2 text-xs text-slate-400">
                              <Mail className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                              <a
                                href={`mailto:${person.email}`}
                                className="truncate hover:text-cyan-400 transition-colors"
                              >
                                {person.email}
                              </a>
                            </div>
                          )}

                          {person.phone && (
                            <div className="flex items-center gap-2 text-xs text-slate-400">
                              <Phone className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                              <a
                                href={`tel:${person.phone}`}
                                className="hover:text-cyan-400 transition-colors"
                              >
                                {person.phone}
                              </a>
                            </div>
                          )}

                          {(person.hr_employee_number || person.employee_id) && (
                            <div className="flex items-center gap-2 text-xs text-slate-400">
                              <Briefcase className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                              <span className="font-mono text-[10px]">
                                {person.hr_employee_number ? `#${person.hr_employee_number}` : `ID: ${person.employee_id}`}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Supervisor */}
                        {person.supervisor_name && (
                          <div className="mt-3 pt-3 border-t border-white/5">
                            <div className="flex items-center gap-2">
                              <ChevronUp className="w-3 h-3 text-amber-500 flex-shrink-0" />
                              <div className="min-w-0">
                                <p className="text-[9px] text-slate-500 uppercase font-bold tracking-widest">Reporta a</p>
                                <p className="text-xs text-amber-400/90 font-semibold truncate">{person.supervisor_name}</p>
                                {person.supervisor_job_title && (
                                  <p className="text-[10px] text-slate-500 truncate">{person.supervisor_job_title}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </>
  );
}
