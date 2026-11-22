import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Filter, 
  Calendar as CalendarIcon, 
  Clock, 
  Users, 
  X, 
  Info, 
  Cake, 
  Star, 
  Plane, 
  MapPin,
  List
} from 'lucide-react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  isSameMonth, 
  isSameDay, 
  addDays, 
  parseISO, 
  isToday,
  isWeekend
} from 'date-fns';
import { es } from 'date-fns/locale';

const MEXICAN_HOLIDAYS = [
  { date: '2024-01-01', name: 'Año Nuevo' },
  { date: '2024-02-05', name: 'Día de la Constitución' },
  { date: '2024-03-18', name: 'Natalicio de Juárez' },
  { date: '2024-05-01', name: 'Día del Trabajo' },
  { date: '2024-09-16', name: 'Independencia de México' },
  { date: '2024-11-18', name: 'Revolución Mexicana' },
  { date: '2024-12-25', name: 'Navidad' },
  { date: '2025-01-01', name: 'Año Nuevo' },
  { date: '2025-02-03', name: 'Día de la Constitución' },
  { date: '2025-03-17', name: 'Natalicio de Juárez' },
  { date: '2025-05-01', name: 'Día del Trabajo' },
  { date: '2025-09-16', name: 'Independencia de México' },
  { date: '2025-11-17', name: 'Revolución Mexicana' },
  { date: '2025-12-25', name: 'Navidad' },
];

const EVENT_TYPES = {
  VACATION: { id: 'vacation', label: 'Vacaciones', color: 'bg-green-500', icon: Plane },
  TRAINING: { id: 'training', label: 'Capacitaciones', color: 'bg-blue-500', icon: Users },
  BIRTHDAY: { id: 'birthday', label: 'Cumpleaños', color: 'bg-yellow-500', icon: Cake },
  ANNIVERSARY: { id: 'anniversary', label: 'Aniversarios', color: 'bg-orange-500', icon: Star },
  DEADLINE: { id: 'deadline', label: 'Fechas límite', color: 'bg-red-500', icon: Clock },
  EVALUATION: { id: 'evaluation', label: 'Evaluaciones', color: 'bg-purple-500', icon: CalendarIcon },
  HOLIDAY: { id: 'holiday', label: 'Festivos', color: 'bg-gray-400', icon: MapPin },
  OTHER: { id: 'other', label: 'Otros', color: 'bg-emerald-500', icon: Info },
};

export default function CorporateCalendarPage() {
  const { session } = useSupabaseAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('calendar'); // 'calendar' or 'list'
  const [filters, setFilters] = useState(Object.keys(EVENT_TYPES));
  const [showEventModal, setShowEventModal] = useState(false);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      let allEvents = [];

      // 1. Fetch Birthdays from profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, birth_date, date_of_birth');
      
      if (profiles) {
        profiles.forEach(p => {
          const bday = p.birth_date || p.date_of_birth;
          if (bday) {
            // Generate events for current and next year
            const currentYear = new Date().getFullYear();
            const years = [currentYear - 1, currentYear, currentYear + 1];
            years.forEach(year => {
              const dateStr = `${year}-${bday.substring(5, 10)}`;
              allEvents.push({
                id: `bday-${p.id}-${year}`,
                title: `Cumpleaños de ${p.full_name}`,
                date: dateStr,
                type: 'birthday',
                description: `¡Celebra el cumpleaños de ${p.full_name}!`,
                allDay: true
              });
            });
          }
        });
      }

      // 2. Fetch Anniversaries from hr_employees
      const { data: employees, error: empError } = await supabase
        .from('hr_employees')
        .select('id, profile_id, hire_date, profiles(full_name)');
      
      if (!empError && employees) {
        employees.forEach(emp => {
          if (emp.hire_date) {
            const currentYear = new Date().getFullYear();
            const hireYear = new Date(emp.hire_date).getFullYear();
            const years = [currentYear - 1, currentYear, currentYear + 1];
            
            years.forEach(year => {
              if (year > hireYear) {
                const dateStr = `${year}-${emp.hire_date.substring(5, 10)}`;
                const annivYears = year - hireYear;
                allEvents.push({
                  id: `anniv-${emp.id}-${year}`,
                  title: `Aniversario de ${emp.profiles?.full_name || 'Empleado'}`,
                  date: dateStr,
                  type: 'anniversary',
                  description: `¡Cumple ${annivYears} año(s) en la empresa!`,
                  allDay: true
                });
              }
            });
          }
        });
      }

      // 3. Fetch Vacations from hr_time_off_requests
      const { data: timeOff, error: toError } = await supabase
        .from('hr_time_off_requests')
        .select('id, start_date, end_date, status, profiles(full_name)')
        .eq('status', 'APROBADO');

      if (!toError && timeOff) {
        timeOff.forEach(req => {
          if (req.start_date && req.end_date) {
            // Add an event for each day of vacation
            let currentDay = parseISO(req.start_date);
            const endDay = parseISO(req.end_date);
            
            while (currentDay <= endDay) {
              allEvents.push({
                id: `vac-${req.id}-${format(currentDay, 'yyyy-MM-dd')}`,
                title: `Vacaciones - ${req.profiles?.full_name || 'Empleado'}`,
                date: format(currentDay, 'yyyy-MM-dd'),
                type: 'vacation',
                description: `Vacaciones aprobadas`,
                allDay: true
              });
              currentDay = addDays(currentDay, 1);
            }
          }
        });
      }

      // 4. Manual events from hr_calendar_events
      try {
        const { data: manualEvents, error: manualError } = await supabase
          .from('hr_calendar_events')
          .select('*');
        
        if (!manualError && manualEvents) {
          manualEvents.forEach(evt => {
            allEvents.push({
              id: evt.id,
              title: evt.title,
              date: evt.date || evt.start_date, // Simplify for this demo
              type: evt.type || 'other',
              description: evt.description,
              allDay: evt.all_day || false
            });
          });
        }
      } catch (e) {
        console.log('hr_calendar_events table might not exist yet', e);
      }

      // 5. Hardcoded Holidays
      MEXICAN_HOLIDAYS.forEach(hol => {
        allEvents.push({
          id: `hol-${hol.date}`,
          title: hol.name,
          date: hol.date,
          type: 'holiday',
          description: 'Día festivo oficial',
          allDay: true
        });
      });

      setEvents(allEvents);
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const goToToday = () => setCurrentDate(new Date());

  const handleDateClick = (day) => {
    setSelectedDate(day);
    setIsSidePanelOpen(true);
  };

  const toggleFilter = (type) => {
    if (filters.includes(type)) {
      setFilters(filters.filter(f => f !== type));
    } else {
      setFilters([...filters, type]);
    }
  };

  // Calendar rendering logic
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const dateFormat = 'd';
  const rows = [];
  let days = [];
  let day = startDate;
  let formattedDate = '';

  const filteredEvents = useMemo(() => {
    return events.filter(e => filters.includes(e.type));
  }, [events, filters]);

  while (day <= endDate) {
    for (let i = 0; i < 7; i++) {
      formattedDate = format(day, dateFormat);
      const cloneDay = day;
      const dateStr = format(day, 'yyyy-MM-dd');
      
      const dayEvents = filteredEvents.filter(e => e.date && e.date.startsWith(dateStr));
      
      const isCurrentMonth = isSameMonth(day, monthStart);
      const isTodayDate = isToday(day);
      const isWknd = isWeekend(day);
      const isSelected = selectedDate && isSameDay(day, selectedDate);

      days.push(
        <div
          key={day}
          onClick={() => handleDateClick(cloneDay)}
          className={`relative min-h-[100px] border border-[#2a2c44] p-2 transition-all cursor-pointer group
            ${!isCurrentMonth ? 'text-white/30 bg-[#151726]' : 'text-white bg-[#1a1c2e]'}
            ${isWknd && isCurrentMonth ? 'bg-[#1e2035]' : ''}
            ${isTodayDate ? 'border-emerald-500/50 shadow-[inset_0_0_10px_rgba(16,185,129,0.2)]' : ''}
            ${isSelected ? 'bg-[#2a2c44]' : 'hover:bg-[#2a2c44]'}
          `}
        >
          <div className="flex justify-between items-start">
            <span className={`text-sm font-medium ${isTodayDate ? 'bg-emerald-500 text-white w-6 h-6 rounded-full flex items-center justify-center' : ''}`}>
              {formattedDate}
            </span>
            {dayEvents.length > 0 && (
              <Badge variant="outline" className="text-[10px] h-4 px-1 bg-[#1a1c2e]/50 border-white/10 text-white/70">
                {dayEvents.length}
              </Badge>
            )}
          </div>
          
          <div className="mt-2 flex flex-col gap-1 overflow-hidden">
            {dayEvents.slice(0, 3).map((evt, idx) => {
              const typeInfo = EVENT_TYPES[evt.type.toUpperCase()] || EVENT_TYPES.OTHER;
              return (
                <div key={idx} className="flex items-center gap-1 text-[10px] truncate">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${typeInfo.color}`}></div>
                  <span className="truncate text-white/80">{evt.title}</span>
                </div>
              );
            })}
            {dayEvents.length > 3 && (
              <div className="text-[10px] text-white/50 pl-2.5">
                +{dayEvents.length - 3} más
              </div>
            )}
          </div>
        </div>
      );
      day = addDays(day, 1);
    }
    rows.push(
      <div className="grid grid-cols-7" key={day}>
        {days}
      </div>
    );
    days = [];
  }

  // Next 30 days events for list view
  const upcomingEvents = useMemo(() => {
    const today = new Date();
    const next30Days = addDays(today, 30);
    return filteredEvents
      .filter(e => {
        if (!e.date) return false;
        const eDate = parseISO(e.date);
        return eDate >= today && eDate <= next30Days;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [filteredEvents]);

  const selectedDayEvents = useMemo(() => {
    if (!selectedDate) return [];
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    return filteredEvents.filter(e => e.date && e.date.startsWith(dateStr));
  }, [selectedDate, filteredEvents]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a1c2e] p-8 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-white/60">Cargando calendario...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a1c2e] text-white p-6 pb-24 lg:pb-6 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-teal-900/20 to-transparent pointer-events-none" />
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#2a2c44]/50 p-6 rounded-2xl border border-white/5 backdrop-blur-sm">
          <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-cyan-400">
              Calendario Corporativo
            </h1>
            <p className="text-white/60 mt-1 flex items-center gap-2">
              <CalendarIcon className="w-4 h-4" />
              Eventos, vacaciones y fechas importantes
            </p>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="flex bg-[#1a1c2e] p-1 rounded-lg border border-white/10">
              <button 
                onClick={() => setActiveTab('calendar')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'calendar' ? 'bg-[#2a2c44] text-white' : 'text-white/60 hover:text-white'}`}
              >
                <CalendarIcon className="w-4 h-4 inline mr-2" />
                Mes
              </button>
              <button 
                onClick={() => setActiveTab('list')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'list' ? 'bg-[#2a2c44] text-white' : 'text-white/60 hover:text-white'}`}
              >
                <List className="w-4 h-4 inline mr-2" />
                Agenda
              </button>
            </div>
            <Button 
              className="bg-emerald-500 hover:bg-emerald-600 text-white border-0"
              onClick={() => setShowEventModal(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Nuevo
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          {Object.entries(EVENT_TYPES).map(([key, value]) => {
            const isActive = filters.includes(value.id);
            const Icon = value.icon;
            return (
              <button
                key={key}
                onClick={() => toggleFilter(value.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                  isActive 
                    ? `bg-[#2a2c44] border-white/20 text-white` 
                    : `bg-transparent border-white/5 text-white/40 hover:border-white/10`
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${isActive ? value.color : 'bg-gray-600'}`} />
                {value.label}
              </button>
            );
          })}
        </div>

        {activeTab === 'calendar' ? (
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Calendar Main View */}
            <Card className="flex-1 bg-[#2a2c44]/40 border-white/5 shadow-2xl backdrop-blur-md overflow-hidden rounded-xl">
              <CardHeader className="border-b border-white/5 pb-4 bg-[#2a2c44]/60">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-semibold capitalize text-white">
                    {format(currentDate, 'MMMM yyyy', { locale: es })}
                  </h2>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={goToToday} className="bg-transparent border-white/10 hover:bg-white/5 text-white">
                      Hoy
                    </Button>
                    <div className="flex border border-white/10 rounded-md overflow-hidden">
                      <button onClick={prevMonth} className="p-2 hover:bg-white/5 transition-colors text-white">
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <button onClick={nextMonth} className="p-2 border-l border-white/10 hover:bg-white/5 transition-colors text-white">
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="grid grid-cols-7 bg-[#1e2035] border-b border-white/5 text-xs font-medium text-white/50 text-center py-3 uppercase tracking-wider">
                  <div>Lun</div><div>Mar</div><div>Mié</div><div>Jue</div><div>Vie</div><div>Sáb</div><div>Dom</div>
                </div>
                <div className="flex flex-col">
                  {rows}
                </div>
              </CardContent>
            </Card>

            {/* Side Panel (Desktop inline, Mobile modal) */}
            <AnimatePresence>
              {(isSidePanelOpen && selectedDate) && (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="w-full lg:w-80 shrink-0"
                >
                  <Card className="bg-[#2a2c44] border-white/10 sticky top-6">
                    <CardHeader className="pb-3 border-b border-white/5 flex flex-row items-center justify-between">
                      <CardTitle className="text-lg text-white">
                        {format(selectedDate, "d 'de' MMMM", { locale: es })}
                      </CardTitle>
                      <button onClick={() => setIsSidePanelOpen(false)} className="text-white/50 hover:text-white">
                        <X className="w-5 h-5" />
                      </button>
                    </CardHeader>
                    <CardContent className="p-4 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
                      {selectedDayEvents.length === 0 ? (
                        <div className="text-center py-8 text-white/40">
                          <CalendarIcon className="w-8 h-8 mx-auto mb-2 opacity-20" />
                          <p>No hay eventos este día</p>
                        </div>
                      ) : (
                        selectedDayEvents.map(evt => {
                          const typeKey = Object.keys(EVENT_TYPES).find(key => EVENT_TYPES[key].id === evt.type) || 'OTHER';
                          const typeInfo = EVENT_TYPES[typeKey];
                          const Icon = typeInfo.icon;
                          
                          return (
                            <div key={evt.id} className="p-3 rounded-lg bg-[#1a1c2e] border border-white/5 relative overflow-hidden group hover:border-white/10 transition-colors">
                              <div className={`absolute top-0 left-0 w-1 h-full ${typeInfo.color}`} />
                              <div className="flex gap-3 items-start pl-2">
                                <div className={`p-2 rounded-md bg-[#2a2c44] text-white/70`}>
                                  <Icon className="w-4 h-4" />
                                </div>
                                <div>
                                  <h4 className="font-medium text-white text-sm">{evt.title}</h4>
                                  {evt.description && <p className="text-xs text-white/50 mt-1">{evt.description}</p>}
                                  <div className="flex items-center gap-2 mt-2">
                                    <Badge variant="outline" className={`text-[10px] border-none bg-white/5 text-white/60 capitalize`}>
                                      {typeInfo.label}
                                    </Badge>
                                    {evt.allDay ? (
                                      <span className="text-[10px] text-white/40">Todo el día</span>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          /* List View (Agenda) */
          <Card className="bg-[#2a2c44]/40 border-white/5 shadow-2xl backdrop-blur-md">
            <CardHeader className="border-b border-white/5">
              <CardTitle className="text-white">Próximos Eventos (30 días)</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {upcomingEvents.length === 0 ? (
                <div className="text-center py-12">
                  <CalendarIcon className="w-12 h-12 mx-auto text-white/20 mb-4" />
                  <p className="text-white/60">No hay eventos próximos en los siguientes 30 días.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {upcomingEvents.map(evt => {
                    const typeKey = Object.keys(EVENT_TYPES).find(key => EVENT_TYPES[key].id === evt.type) || 'OTHER';
                    const typeInfo = EVENT_TYPES[typeKey];
                    const Icon = typeInfo.icon;
                    const eventDate = parseISO(evt.date);
                    const isPast = eventDate < new Date().setHours(0,0,0,0);
                    
                    return (
                      <div key={evt.id} className={`flex items-start gap-4 p-4 rounded-xl border border-white/5 bg-[#1a1c2e]/50 ${isPast ? 'opacity-50' : ''}`}>
                        <div className="flex flex-col items-center justify-center min-w-[60px] p-2 bg-[#2a2c44] rounded-lg text-center">
                          <span className="text-xs text-white/50 uppercase font-semibold">{format(eventDate, 'MMM', { locale: es })}</span>
                          <span className="text-xl font-bold text-white">{format(eventDate, 'dd')}</span>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-lg font-medium text-white">{evt.title}</h4>
                            <div className={`w-2 h-2 rounded-full ${typeInfo.color}`} title={typeInfo.label} />
                          </div>
                          {evt.description && <p className="text-sm text-white/60">{evt.description}</p>}
                        </div>
                        <Badge variant="outline" className="bg-[#2a2c44] border-white/10 text-white/70 hidden md:flex items-center gap-1">
                          <Icon className="w-3 h-3" />
                          {typeInfo.label}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Modal Agregar Evento (Placeholder / UI Only) */}
      <AnimatePresence>
        {showEventModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-[#2a2c44] rounded-2xl shadow-2xl border border-white/10 overflow-hidden"
            >
              <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#1a1c2e]/50">
                <h3 className="text-lg font-semibold text-white">Nuevo Evento</h3>
                <button onClick={() => setShowEventModal(false)} className="text-white/50 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-xs text-white/60 mb-1 block">Título del evento</label>
                  <input type="text" className="w-full bg-[#1a1c2e] border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-emerald-500" placeholder="Ej. Reunión General" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-white/60 mb-1 block">Fecha de inicio</label>
                    <input type="date" className="w-full bg-[#1a1c2e] border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-emerald-500" />
                  </div>
                  <div>
                    <label className="text-xs text-white/60 mb-1 block">Fecha fin (opcional)</label>
                    <input type="date" className="w-full bg-[#1a1c2e] border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-emerald-500" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-white/60 mb-1 block">Tipo de evento</label>
                  <select className="w-full bg-[#1a1c2e] border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-emerald-500">
                    <option value="training">Capacitación</option>
                    <option value="deadline">Fecha límite</option>
                    <option value="evaluation">Evaluación</option>
                    <option value="other">Otro</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-white/60 mb-1 block">Descripción</label>
                  <textarea rows={3} className="w-full bg-[#1a1c2e] border border-white/10 rounded-lg p-2.5 text-white focus:outline-none focus:border-emerald-500" placeholder="Detalles del evento..."></textarea>
                </div>
              </div>
              <div className="p-4 border-t border-white/5 bg-[#1a1c2e]/50 flex justify-end gap-3">
                <Button variant="ghost" onClick={() => setShowEventModal(false)} className="text-white hover:bg-white/5">
                  Cancelar
                </Button>
                <Button className="bg-emerald-500 hover:bg-emerald-600 text-white border-0">
                  Guardar Evento
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
