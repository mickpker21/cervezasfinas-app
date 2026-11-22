import React, { useEffect, useState } from 'react';
import { supabase } from '@/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertTriangle, TrendingDown } from 'lucide-react';
import { startOfMonth, endOfMonth } from 'date-fns';

export default function PreguntasCriticas() {
  const [criticalQuestions, setCriticalQuestions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const startOfM = startOfMonth(new Date()).toISOString();
        const endOfM = endOfMonth(new Date()).toISOString();

        const { data: audits } = await supabase
          .from('control_interno_audits')
          .select('tipo, respuestas')
          .gte('created_at', startOfM)
          .lte('created_at', endOfM);

        if (!audits) return;

        const questionStats = {};

        audits.forEach(audit => {
          if (!audit.respuestas) return;
          Object.entries(audit.respuestas).forEach(([q, ans]) => {
            if (!questionStats[q]) {
              questionStats[q] = { question: q, total: 0, noCount: 0, tipo: audit.tipo };
            }
            questionStats[q].total++;
            // 'ans' could be boolean false or string 'NO'
            if (ans === 'NO' || ans === false || (typeof ans === 'string' && ans.toUpperCase() === 'NO')) {
              questionStats[q].noCount++;
            }
          });
        });

        const sorted = Object.values(questionStats)
          .filter(q => q.total >= 3 && q.noCount > 0) // Minimun sample size of 3
          .map(q => ({ ...q, failureRate: (q.noCount / q.total) * 100 }))
          .sort((a, b) => b.failureRate - a.failureRate)
          .slice(0, 5);

        setCriticalQuestions(sorted);
      } catch (err) {
        console.error("Error loading critical questions", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  return (
    <Card className="bg-slate-900/40 border-white/5 backdrop-blur-lg shadow-xl mt-6 rounded-3xl overflow-hidden">
      <CardHeader className="border-b border-white/5 pb-4 bg-rose-500/5">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-white flex items-center gap-2 font-bold">
              <AlertTriangle className="h-5 w-5 text-rose-400" />
              Top 5 Preguntas Críticas
            </CardTitle>
            <CardDescription className="text-slate-500 uppercase tracking-widest text-[10px] mt-1">
              Las reglas que más se incumplen este mes
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4 p-0">
        {loading ? (
          <div className="flex justify-center p-8">
            <div className="animate-spin h-6 w-6 border-b-2 border-rose-500 rounded-full" />
          </div>
        ) : criticalQuestions.length === 0 ? (
          <div className="text-center p-8 text-slate-500">
            <TrendingDown className="h-8 w-8 mx-auto mb-2 opacity-20" />
            <p>No hay suficientes datos de desviaciones este mes.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {criticalQuestions.map((q, idx) => (
              <div key={idx} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                <div className="flex-1 pr-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-slate-500">#{idx + 1}</span>
                    <span className="text-[10px] uppercase bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-white/5">{q.tipo}</span>
                  </div>
                  <h4 className="text-sm font-medium text-slate-200 line-clamp-2">{q.question}</h4>
                  <p className="text-xs text-slate-500 mt-1">Falló en {q.noCount} de {q.total} auditorías</p>
                </div>
                <div className="text-right">
                  <div className="text-xl font-black text-rose-400">
                    {Math.round(q.failureRate)}%
                  </div>
                  <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Incumplimiento</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
