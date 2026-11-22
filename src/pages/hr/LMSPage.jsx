import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BookOpen, PlayCircle, Award, BarChart2, 
  Search, Filter, Clock, CheckCircle, 
  TrendingUp, Play, Star, FileText, Plus, X, Upload, HelpCircle, Check, AlertCircle, Trash2
} from 'lucide-react';
import { supabase } from '@/supabaseClient';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';

const LMSPage = () => {
  const { user } = useSupabaseAuth();
  const userRole = (
    user?.user_metadata?.type ||
    user?.user_metadata?.role ||
    user?.app_metadata?.roles?.[0] ||
    ''
  ).toLowerCase();

  const canManageCourses = ['admin', 'administrador', 'rh', 'rrhh', 'sistemas'].includes(userRole);
  const [courses, setCourses] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard'); // dashboard, catalog, paths, certifications

  // Modal State for adding courses & questions
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCourse, setNewCourse] = useState({
    title: '',
    category: 'Venta en Ruta',
    duration: '2h 00m',
    format: 'Video',
    targetRole: 'Todos',
    isMandatory: false,
    url: '',
    questions: [
      { id: 1, question: '¿Cuál es la regla principal de seguridad en ruta?', options: ['Uso de cinturón y respetar límites', 'Conducir rápido', 'Ignorar señales'], correct: 0 }
    ]
  });

  // Quiz Modal State
  const [showQuizModal, setShowQuizModal] = useState(false);
  const [selectedCourseQuiz, setSelectedCourseQuiz] = useState(null);
  const [userAnswers, setUserAnswers] = useState({});
  const [quizResult, setQuizResult] = useState(null);

  useEffect(() => {
    fetchLMSData();
  }, []);

  const fetchLMSData = async () => {
    try {
      setLoading(true);
      const { data: coursesData, error: coursesError } = await supabase
        .from('hr_courses')
        .select('*');

      const { data: enrollmentsData, error: enrollmentsError } = await supabase
        .from('hr_enrollments')
        .select('*');

      if (coursesError || enrollmentsError || !coursesData || coursesData.length === 0) {
        throw new Error('No data or error fetching');
      }

      setCourses(coursesData);
      setEnrollments(enrollmentsData);
      setIsDemoMode(false);
    } catch (error) {
      console.warn('Falling back to demo mode:', error);
      setIsDemoMode(true);
      setCourses(demoCourses);
      setEnrollments(demoEnrollments);
    } finally {
      setLoading(false);
    }
  };

  const demoCourses = [
    { id: 1, title: 'Liderazgo Estratégico', category: 'Soft Skills', duration: '4h 30m', format: 'Video', rating: 4.8, image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&q=80&w=300&h=200' },
    { id: 2, title: 'Normativa NOM-035', category: 'Compliance', duration: '2h 00m', format: 'SCORM', rating: 4.5, image: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&q=80&w=300&h=200' },
    { id: 3, title: 'Análisis de Datos con Python', category: 'Technical', duration: '12h', format: 'Video', rating: 4.9, image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=300&h=200' },
    { id: 4, title: 'Seguridad Industrial Avanzada', category: 'Operations', duration: '5h', format: 'SCORM', rating: 4.7, image: 'https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?auto=format&fit=crop&q=80&w=300&h=200' },
  ];

  const demoEnrollments = [
    { id: 1, courseId: 1, progress: 75, status: 'in_progress', lastAccessed: '2026-07-25' },
    { id: 2, courseId: 2, progress: 100, status: 'completed', completedAt: '2026-07-15', certificateType: 'DC-3' },
  ];

  const mockQuizData = {
    1: [
      { id: 1, question: '¿Cuál es el primer paso para una delegación efectiva?', options: ['Asignar la tarea sin explicación', 'Definir el objetivo claro y el resultado esperado', 'Esperar a que el equipo pregunte'], correct: 1 },
      { id: 2, question: '¿Qué caracteriza a un líder transformacional?', options: ['Control estricto de horarios', 'Inspirar y motivar al equipo hacia una visión compartida', 'Evitar cambios en el proceso'], correct: 1 }
    ],
    2: [
      { id: 1, question: '¿Cuál es el objetivo principal de la NOM-035?', options: ['Aumentar ventas', 'Identificar y prevenir factores de riesgo psicosocial', 'Regular camiones'], correct: 1 }
    ]
  };

  const handleAddQuestionToNewCourse = () => {
    setNewCourse(prev => ({
      ...prev,
      questions: [
        ...prev.questions,
        { id: Date.now(), question: 'Nueva pregunta de evaluación', options: ['Opción A (Correcta)', 'Opción B', 'Opción C'], correct: 0 }
      ]
    }));
  };

  const handleRemoveQuestionFromNewCourse = (qId) => {
    setNewCourse(prev => ({
      ...prev,
      questions: prev.questions.filter(q => q.id !== qId)
    }));
  };

  const handleStartQuiz = (course) => {
    setSelectedCourseQuiz(course);
    setUserAnswers({});
    setQuizResult(null);
    setShowQuizModal(true);
  };

  const handleSubmitQuiz = (e) => {
    e.preventDefault();
    const questions = selectedCourseQuiz.questions || mockQuizData[selectedCourseQuiz?.id] || mockQuizData[1];
    let correctCount = 0;

    questions.forEach(q => {
      if (userAnswers[q.id] === q.correct) {
        correctCount++;
      }
    });

    const score = Math.round((correctCount / questions.length) * 100);
    const passed = score >= 70;

    setQuizResult({
      score,
      passed,
      correctCount,
      total: questions.length
    });

    if (passed) {
      setEnrollments(prev => prev.map(e => e.courseId === selectedCourseQuiz?.id ? { ...e, progress: 100, status: 'completed' } : e));
    }
  };

  const handleCreateCourse = async (e) => {
    e.preventDefault();
    if (!newCourse.title.trim()) return;

    const courseObj = {
      id: Date.now(),
      title: newCourse.title,
      category: newCourse.category,
      duration: newCourse.duration,
      format: newCourse.format,
      rating: 5.0,
      image: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&q=80&w=300&h=200',
      questions: newCourse.questions
    };

    try {
      await supabase.from('hr_courses').insert(courseObj);
    } catch (err) {
      console.warn('Saved locally');
    }

    setCourses(prev => [courseObj, ...prev]);
    setShowAddModal(false);
    setNewCourse({
      title: '',
      category: 'Venta en Ruta',
      duration: '2h 00m',
      format: 'Video',
      targetRole: 'Todos',
      isMandatory: false,
      url: '',
      questions: [
        { id: 1, question: '¿Cuál es la regla principal de seguridad en ruta?', options: ['Uso de cinturón y respetar límites', 'Conducir rápido', 'Ignorar señales'], correct: 0 }
      ]
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#1a1c2e] text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a1c2e] text-slate-200 p-3 sm:p-6 font-sans w-full max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Universidad Corporativa LMS</h1>
          <p className="text-slate-400 text-xs sm:text-sm">Capacitación, evaluaciones y certificaciones 100% responsivo en MySQL</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          {isDemoMode && (
            <div className="bg-orange-500/20 text-orange-400 px-3 py-1.5 rounded-full border border-orange-500/30 flex items-center text-xs">
              <span className="w-2 h-2 rounded-full bg-orange-500 mr-2 animate-pulse"></span>
              Modo Demo
            </div>
          )}
          {canManageCourses && (
            <button 
              onClick={() => setShowAddModal(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all flex items-center gap-2 shadow-lg shadow-blue-600/30"
            >
              <Plus size={16} /> Cargar Curso
            </button>
          )}
        </div>
      </header>

      {/* Tabs */}
      <div className="flex overflow-x-auto space-x-2 mb-6 border-b border-slate-700/50 pb-px scrollbar-none">
        {[
          { id: 'dashboard', label: 'Mi Progreso', icon: BarChart2 },
          { id: 'paths', label: 'Rutas de Aprendizaje', icon: TrendingUp },
          { id: 'catalog', label: 'Catálogo Cursos', icon: BookOpen },
          { id: 'certifications', label: 'Certificaciones (DC-3)', icon: Award }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center space-x-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-t-lg whitespace-nowrap text-xs sm:text-sm transition-all duration-300 ${
              activeTab === tab.id 
                ? 'bg-[#2a2c44] text-blue-400 border-t-2 border-blue-500 font-semibold' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#2a2c44]/50'
            }`}
          >
            <tab.icon size={16} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <motion.div 
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              <div className="bg-[#2a2c44] p-4 sm:p-6 rounded-xl border border-slate-700/50 shadow-lg">
                <div className="flex justify-between items-start mb-2 sm:mb-4">
                  <div className="p-2 sm:p-3 bg-blue-500/20 rounded-lg text-blue-400">
                    <Clock size={20} />
                  </div>
                  <span className="text-xl sm:text-2xl font-bold text-white">24h</span>
                </div>
                <h3 className="text-slate-400 text-xs sm:text-sm">Horas de Aprendizaje</h3>
              </div>
              <div className="bg-[#2a2c44] p-4 sm:p-6 rounded-xl border border-slate-700/50 shadow-lg">
                <div className="flex justify-between items-start mb-2 sm:mb-4">
                  <div className="p-2 sm:p-3 bg-green-500/20 rounded-lg text-green-400">
                    <CheckCircle size={20} />
                  </div>
                  <span className="text-xl sm:text-2xl font-bold text-white">5</span>
                </div>
                <h3 className="text-slate-400 text-xs sm:text-sm">Cursos Completados</h3>
              </div>
              <div className="bg-[#2a2c44] p-4 sm:p-6 rounded-xl border border-slate-700/50 shadow-lg">
                <div className="flex justify-between items-start mb-2 sm:mb-4">
                  <div className="p-2 sm:p-3 bg-purple-500/20 rounded-lg text-purple-400">
                    <Award size={20} />
                  </div>
                  <span className="text-xl sm:text-2xl font-bold text-white">2</span>
                </div>
                <h3 className="text-slate-400 text-xs sm:text-sm">Certificaciones DC-3</h3>
              </div>
              <div className="bg-[#2a2c44] p-4 sm:p-6 rounded-xl border border-slate-700/50 shadow-lg">
                <div className="flex justify-between items-start mb-2 sm:mb-4">
                  <div className="p-2 sm:p-3 bg-orange-500/20 rounded-lg text-orange-400">
                    <TrendingUp size={20} />
                  </div>
                  <span className="text-xl sm:text-2xl font-bold text-white">85%</span>
                </div>
                <h3 className="text-slate-400 text-xs sm:text-sm">Cumplimiento Meta</h3>
              </div>
            </div>

            <div className="bg-[#2a2c44] p-4 sm:p-6 rounded-xl border border-slate-700/50">
              <h2 className="text-lg sm:text-xl font-semibold text-white mb-4">Continuar Aprendiendo</h2>
              <div className="space-y-4">
                {demoEnrollments.filter(e => e.status === 'in_progress').map(enrollment => {
                  const course = courses.find(c => c.id === enrollment.courseId) || demoCourses[0];
                  return (
                    <div key={enrollment.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#1a1c2e] rounded-xl border border-slate-700/50 gap-4">
                      <div className="flex items-center space-x-4">
                        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg overflow-hidden shrink-0">
                          <img src={course?.image} alt={course?.title} className="w-full h-full object-cover" />
                        </div>
                        <div>
                          <h4 className="text-white font-medium text-sm sm:text-base">{course?.title}</h4>
                          <p className="text-xs text-slate-400">{course?.category}</p>
                        </div>
                      </div>
                      <div className="w-full sm:w-1/3 flex items-center space-x-3">
                        <div className="w-full bg-slate-700 rounded-full h-2">
                          <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${enrollment.progress}%` }}></div>
                        </div>
                        <span className="text-xs sm:text-sm font-medium text-slate-300">{enrollment.progress}%</span>
                      </div>
                      <button 
                        onClick={() => handleStartQuiz(course)}
                        className="w-full sm:w-auto px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl transition-colors text-xs sm:text-sm font-medium flex items-center justify-center gap-2"
                      >
                        <HelpCircle size={16} />
                        Tomar Evaluación
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'catalog' && (
          <div>
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
              <div className="relative w-full sm:w-96">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Buscar cursos..." 
                  className="w-full bg-[#2a2c44] border border-slate-700 rounded-xl py-2 pl-10 pr-4 text-white text-xs sm:text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {courses.map(course => (
                <div key={course.id} className="bg-[#2a2c44] rounded-xl overflow-hidden border border-slate-700/50 hover:border-blue-500/50 transition-all flex flex-col">
                  <div className="relative h-40 overflow-hidden">
                    <img src={course.image} alt={course.title} className="w-full h-full object-cover" />
                    <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] text-white flex items-center">
                      {course.format}
                    </div>
                  </div>
                  <div className="p-4 flex-grow flex flex-col space-y-2">
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] font-medium text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded-full">{course.category}</span>
                      <div className="flex items-center text-yellow-400 text-xs">
                        <Star size={12} fill="currentColor" className="mr-1" />
                        {course.rating || 5.0}
                      </div>
                    </div>
                    <h3 className="text-sm font-semibold text-white line-clamp-2">{course.title}</h3>
                    <div className="flex justify-between items-center text-slate-400 text-xs mt-auto pt-2">
                      <span className="flex items-center"><Clock size={12} className="mr-1" /> {course.duration}</span>
                      <button 
                        onClick={() => handleStartQuiz(course)}
                        className="text-xs text-purple-400 hover:text-purple-300 font-medium flex items-center gap-1"
                      >
                        <HelpCircle size={12} /> Evaluación
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'certifications' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#2a2c44] border border-slate-700/50 rounded-xl p-4 sm:p-6">
              <div className="flex items-center mb-4 sm:mb-6">
                <div className="p-3 bg-purple-500/20 text-purple-400 rounded-lg mr-4">
                  <FileText size={24} />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-white">Constancias DC-3</h2>
                  <p className="text-xs sm:text-sm text-slate-400">Cumplimiento STPS</p>
                </div>
              </div>
              
              <div className="space-y-3">
                {demoEnrollments.filter(e => e.certificateType === 'DC-3').map(cert => {
                  const course = courses.find(c => c.id === cert.courseId) || demoCourses[1];
                  return (
                    <div key={cert.id} className="bg-[#1a1c2e] border border-slate-700 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                      <div>
                        <h4 className="text-white font-medium text-sm">{course?.title}</h4>
                        <p className="text-xs text-slate-400">Emitida: {cert.completedAt}</p>
                      </div>
                      <button className="text-blue-400 hover:text-blue-300 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg flex items-center text-xs transition-colors">
                        Descargar PDF
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* Modal: Cargar Nuevo Curso con Configuración de Preguntas */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#2a2c44] border border-slate-700 rounded-2xl p-4 sm:p-6 max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl space-y-4 my-auto"
            >
              <div className="flex justify-between items-center border-b border-slate-700/50 pb-3 sticky top-0 bg-[#2a2c44] z-10">
                <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <Upload className="text-blue-400 h-5 w-5" /> Configurar Curso y Preguntas
                </h3>
                <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleCreateCourse} className="space-y-4 text-xs sm:text-sm">
                <div>
                  <label className="text-slate-300 block mb-1">Título del Curso</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Ej. Manejo Seguro en Autoventa 2026"
                    value={newCourse.title}
                    onChange={(e) => setNewCourse({...newCourse, title: e.target.value})}
                    className="w-full bg-[#1a1c2e] border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-slate-300 block mb-1">Categoría</label>
                    <select 
                      value={newCourse.category}
                      onChange={(e) => setNewCourse({...newCourse, category: e.target.value})}
                      className="w-full bg-[#1a1c2e] border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none"
                    >
                      <option value="Venta en Ruta">Venta en Ruta</option>
                      <option value="Compliance">Compliance / NOM-035</option>
                      <option value="Soft Skills">Soft Skills / Liderazgo</option>
                      <option value="Technical">Técnico / Operativo</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-300 block mb-1">Formato</label>
                    <select 
                      value={newCourse.format}
                      onChange={(e) => setNewCourse({...newCourse, format: e.target.value})}
                      className="w-full bg-[#1a1c2e] border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none"
                    >
                      <option value="Video">Video MP4</option>
                      <option value="SCORM">SCORM 1.2 / 2004</option>
                      <option value="PDF">Documento PDF</option>
                    </select>
                  </div>
                </div>

                {/* Carga de Archivo / Video / Recurso */}
                <div className="space-y-2 bg-[#1a1c2e] p-3.5 rounded-xl border border-slate-700/60">
                  <label className="text-slate-200 font-medium block text-xs sm:text-sm flex items-center gap-1.5">
                    <Upload className="text-blue-400 h-4 w-4" /> Seleccionar o Pegar Recurso del Curso ({newCourse.format})
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input 
                      type="file" 
                      accept={newCourse.format === 'PDF' ? '.pdf' : newCourse.format === 'SCORM' ? '.zip' : 'video/*'}
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                          setNewCourse({...newCourse, url: URL.createObjectURL(file), fileName: file.name});
                        }
                      }}
                      className="w-full text-xs text-slate-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-600/20 file:text-blue-300 hover:file:bg-blue-600/30 cursor-pointer"
                    />
                    <input 
                      type="url"
                      placeholder="O pega URL (ej. https://servidor.com/video.mp4)"
                      value={newCourse.url}
                      onChange={(e) => setNewCourse({...newCourse, url: e.target.value})}
                      className="w-full bg-[#2a2c44] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none"
                    />
                  </div>
                  {newCourse.fileName && (
                    <p className="text-[11px] text-emerald-400 font-medium pt-1">
                      ✓ Archivo seleccionado: {newCourse.fileName}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-slate-300 block mb-1">Duración Estimada</label>
                    <input 
                      type="text" 
                      placeholder="Ej. 2h 30m"
                      value={newCourse.duration}
                      onChange={(e) => setNewCourse({...newCourse, duration: e.target.value})}
                      className="w-full bg-[#1a1c2e] border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-slate-300 block mb-1">Asignar A (Audiencia)</label>
                    <select 
                      value={newCourse.targetRole}
                      onChange={(e) => setNewCourse({...newCourse, targetRole: e.target.value})}
                      className="w-full bg-[#1a1c2e] border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none"
                    >
                      <option value="Todos">Todos los Empleados</option>
                      <option value="Vendedores">Fuerza de Ventas (SFA / Autoventa)</option>
                      <option value="Supervisores">Supervisores y Gerencia</option>
                      <option value="Almacenistas">Almacén y Operaciones</option>
                    </select>
                  </div>
                </div>

                {/* Preguntas de la Evaluación */}
                <div className="border-t border-slate-700/50 pt-3 space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="font-semibold text-purple-300 flex items-center gap-1.5">
                      <HelpCircle size={16} /> Preguntas del Cuestionario ({newCourse.questions.length})
                    </h4>
                    <button 
                      type="button" 
                      onClick={handleAddQuestionToNewCourse}
                      className="text-xs bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 px-2.5 py-1 rounded-lg border border-purple-500/30 flex items-center gap-1 transition-all"
                    >
                      <Plus size={14} /> Agregar Pregunta
                    </button>
                  </div>

                  <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                    {newCourse.questions.map((q, idx) => (
                      <div key={q.id} className="bg-[#1a1c2e] p-3 rounded-xl border border-slate-700/50 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-purple-400 font-medium">Pregunta #{idx + 1}</span>
                          {newCourse.questions.length > 1 && (
                            <button 
                              type="button" 
                              onClick={() => handleRemoveQuestionFromNewCourse(q.id)}
                              className="text-slate-500 hover:text-rose-400"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                        <input 
                          type="text"
                          value={q.question}
                          onChange={(e) => {
                            const val = e.target.value;
                            setNewCourse(prev => ({
                              ...prev,
                              questions: prev.questions.map(item => item.id === q.id ? { ...item, question: val } : item)
                            }));
                          }}
                          placeholder="Escribe el texto de la pregunta..."
                          className="w-full bg-[#2a2c44] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-700/50">
                  <button 
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 rounded-xl text-slate-400 hover:bg-slate-800 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-xl font-medium transition-all shadow-lg shadow-blue-600/30"
                  >
                    Guardar y Asignar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Evaluacion Responsiva */}
      <AnimatePresence>
        {showQuizModal && selectedCourseQuiz && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#2a2c44] border border-purple-500/30 rounded-2xl p-4 sm:p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl space-y-4 my-auto"
            >
              <div className="flex justify-between items-center border-b border-slate-700/50 pb-3 sticky top-0 bg-[#2a2c44] z-10">
                <div>
                  <span className="text-[10px] sm:text-xs font-semibold text-purple-400 uppercase tracking-wider">Evaluación</span>
                  <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    <HelpCircle className="text-purple-400 h-5 w-5" /> {selectedCourseQuiz.title}
                  </h3>
                </div>
                <button onClick={() => setShowQuizModal(false)} className="text-slate-400 hover:text-white">
                  <X size={20} />
                </button>
              </div>

              {!quizResult ? (
                <form onSubmit={handleSubmitQuiz} className="space-y-4 text-xs sm:text-sm">
                  {(selectedCourseQuiz.questions || mockQuizData[selectedCourseQuiz.id] || mockQuizData[1]).map((q, idx) => (
                    <div key={q.id} className="space-y-2 bg-[#1a1c2e] p-3 sm:p-4 rounded-xl border border-slate-700/50">
                      <p className="font-semibold text-white">{idx + 1}. {q.question}</p>
                      <div className="space-y-1 pt-1">
                        {q.options.map((opt, optIdx) => (
                          <label key={optIdx} className="flex items-center gap-2.5 text-slate-300 hover:text-white cursor-pointer p-2 rounded-lg hover:bg-slate-800/60 transition-colors">
                            <input 
                              type="radio" 
                              name={`q_${q.id}`} 
                              checked={userAnswers[q.id] === optIdx}
                              onChange={() => setUserAnswers({...userAnswers, [q.id]: optIdx})}
                              className="text-purple-500 focus:ring-0"
                            />
                            <span>{opt}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}

                  <div className="flex justify-end gap-3 pt-4 border-t border-slate-700/50">
                    <button 
                      type="button"
                      onClick={() => setShowQuizModal(false)}
                      className="px-4 py-2 rounded-xl text-slate-400 hover:bg-slate-800 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-xl font-medium transition-all shadow-lg shadow-purple-600/30"
                    >
                      Enviar Respuestas
                    </button>
                  </div>
                </form>
              ) : (
                <div className="text-center py-4 space-y-4">
                  <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center ${quizResult.passed ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'}`}>
                    {quizResult.passed ? <Check size={32} /> : <AlertCircle size={32} />}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">
                      {quizResult.passed ? '¡Felicidades! Aprobaste' : 'Calificación Insuficiente'}
                    </h3>
                    <p className="text-slate-400 text-xs sm:text-sm mt-1">
                      Puntaje: <span className="text-white font-bold">{quizResult.score}%</span> ({quizResult.correctCount} de {quizResult.total} aciertos)
                    </p>
                  </div>
                  <button 
                    onClick={() => setShowQuizModal(false)}
                    className="bg-purple-600 text-white px-6 py-2 rounded-xl text-xs sm:text-sm font-medium hover:bg-purple-500 transition-all"
                  >
                    Cerrar Evaluación
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LMSPage;
