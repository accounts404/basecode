import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Bot, Send, Loader2, Sparkles, Trash2, BarChart3, Users, Calendar, TrendingUp, AlertTriangle, ClipboardList } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";

const QUICK_PROMPTS = [
  { icon: BarChart3, label: "Resumen del mes", prompt: "Dame un resumen completo del negocio este mes: cantidad de servicios, ingresos estimados, clientes activos y cualquier dato relevante." },
  { icon: Users, label: "Rendimiento limpiadores", prompt: "Analiza el rendimiento de los limpiadores este mes: horas trabajadas, cantidad de servicios, y quiénes han trabajado más o menos." },
  { icon: AlertTriangle, label: "Quejas y feedback", prompt: "Muéstrame un análisis de las quejas y feedbacks de clientes recientes. ¿Hay patrones o limpiadores que necesiten atención?" },
  { icon: TrendingUp, label: "Análisis rentabilidad", prompt: "Analiza la rentabilidad del negocio: precios promedio por servicio, horas promedio, y qué clientes podrían necesitar ajuste de precios." },
  { icon: Calendar, label: "Servicios próximos", prompt: "¿Cómo se ve la carga de trabajo de esta semana? ¿Hay días con muchos servicios o días con pocos?" },
  { icon: ClipboardList, label: "Clientes sin servicio", prompt: "¿Hay clientes activos que no han tenido servicios en las últimas 2-3 semanas? Podría haber problemas de programación." },
];

async function gatherBusinessContext() {
  const now = new Date();
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');
  const today = format(now, 'yyyy-MM-dd');
  const nextWeek = format(subDays(now, -7), 'yyyy-MM-dd');

  // Fetch all data in parallel - larger limits to not miss data
  const [clients, users, schedulesRecent, schedulesOlder, workEntries, feedback, invoices] = await Promise.all([
    base44.entities.Client.filter({ active: true }, '-created_date', 300),
    base44.entities.User.list('-created_date', 100),
    base44.entities.Schedule.filter({}, '-start_time', 200),
    base44.entities.Schedule.filter({}, 'start_time', 200),
    base44.entities.WorkEntry.filter({}, '-work_date', 200),
    base44.entities.ClientFeedback.filter({}, '-feedback_date', 50),
    base44.entities.Invoice.filter({}, '-created_date', 30),
  ]);

  // Merge and deduplicate schedules
  const allScheduleMap = {};
  [...schedulesRecent, ...schedulesOlder].forEach(s => { allScheduleMap[s.id] = s; });
  const allSchedules = Object.values(allScheduleMap);

  const cleaners = users.filter(u => u.role !== 'admin');
  const cleanerMap = {};
  users.forEach(u => { cleanerMap[u.id] = u.full_name; });
  
  // Split schedules by time relevance
  const upcomingSchedules = allSchedules
    .filter(s => s.start_time && s.start_time.slice(0, 10) >= today)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  
  const thisMonthSchedules = allSchedules
    .filter(s => s.start_time && s.start_time.slice(0, 10) >= monthStart && s.start_time.slice(0, 10) <= monthEnd);

  const pastMonthSchedules = thisMonthSchedules
    .filter(s => s.start_time.slice(0, 10) < today)
    .sort((a, b) => b.start_time.localeCompare(a.start_time));

  const recentWorkEntries = workEntries.filter(w => w.work_date >= monthStart);

  const formatScheduleDetail = (s) => {
    const date = format(new Date(s.start_time), "dd/MM/yyyy HH:mm");
    const endTime = s.end_time ? format(new Date(s.end_time), "HH:mm") : '?';
    const assignedCleaners = (s.cleaner_ids || []).map(id => cleanerMap[id] || id).join(', ');
    return `- ${date}-${endTime} | ${s.client_name || 'Sin nombre'} | ${s.client_address || 'Sin dirección'} | Estado: ${s.status} | Limpiadores: [${assignedCleaners || 'SIN ASIGNAR'}] | ID: ${s.id}`;
  };

  return `
=== DATOS DEL NEGOCIO REDOAK CLEANING ===
📆 Fecha actual: ${format(now, "EEEE d 'de' MMMM yyyy", { locale: es })}

📊 RESUMEN GENERAL:
- Clientes activos: ${clients.length}
- Limpiadores en plantilla: ${cleaners.length}
- Servicios programados este mes: ${thisMonthSchedules.length}
- Servicios completados este mes: ${thisMonthSchedules.filter(s => s.status === 'completed').length}
- Work entries este mes: ${recentWorkEntries.length}

🔴 SERVICIOS PRÓXIMOS (DESDE HOY EN ADELANTE - ${upcomingSchedules.length} servicios):
${upcomingSchedules.length > 0 ? upcomingSchedules.map(formatScheduleDetail).join('\n') : 'No hay servicios próximos programados.'}

📅 SERVICIOS YA REALIZADOS ESTE MES (${pastMonthSchedules.length}):
${pastMonthSchedules.slice(0, 30).map(formatScheduleDetail).join('\n')}

👥 CLIENTES ACTIVOS (${clients.length}):
${clients.map(c => `- ${c.name}: $${c.current_service_price || 0} (${c.service_frequency || 'sin freq'}) | ${c.service_hours || '?'}h | ${c.address || 'sin dirección'} | GST: ${c.gst_type || 'N/A'}`).join('\n')}

🧹 LIMPIADORES - DETALLE ESTE MES:
${cleaners.map(c => {
  const entries = recentWorkEntries.filter(w => w.cleaner_id === c.id);
  const totalHours = entries.reduce((s, w) => s + (w.hours || 0), 0);
  const totalAmount = entries.reduce((s, w) => s + (w.total_amount || 0), 0);
  const servicesCount = thisMonthSchedules.filter(s => (s.cleaner_ids || []).includes(c.id)).length;
  return `- ${c.full_name} (ID: ${c.id}): ${servicesCount} servicios, ${entries.length} work entries, ${totalHours.toFixed(1)}h, $${totalAmount.toFixed(2)}`;
}).join('\n')}

⏰ WORK ENTRIES ESTE MES (${recentWorkEntries.length}):
${recentWorkEntries.slice(0, 50).map(w => `- ${w.work_date} ${w.client_name || 'N/A'}: ${w.hours}h x $${w.hourly_rate || 0} = $${w.total_amount || 0} (${w.cleaner_name || 'N/A'})`).join('\n')}

💬 FEEDBACK RECIENTE:
${feedback.slice(0, 20).map(f => `- ${f.feedback_date} ${f.client_name}: ${f.feedback_type} - "${f.description?.slice(0, 100) || 'Sin descripción'}"`).join('\n')}

💰 FACTURAS RECIENTES:
${invoices.slice(0, 10).map(i => `- ${i.invoice_number}: ${i.cleaner_name} - $${i.total_amount || 0} - ${i.status}`).join('\n')}
`;
}

export default function AsistenteIA() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [contextLoaded, setContextLoaded] = useState(false);
  const [businessContext, setBusinessContext] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadContext();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadContext = async () => {
    try {
      const ctx = await gatherBusinessContext();
      setBusinessContext(ctx);
      setContextLoaded(true);
    } catch (err) {
      console.error("Error loading context:", err);
      setContextLoaded(true);
    }
  };

  const sendMessage = async (text) => {
    if (!text.trim() || loading) return;

    const userMsg = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const systemPrompt = `Eres el asistente de inteligencia artificial de RedOak Cleaning Solutions, una empresa de limpieza en Melbourne, Australia.
Tu rol es ayudar al administrador analizando datos del negocio, dando informes, identificando problemas y sugiriendo mejoras.

REGLAS:
- Responde SIEMPRE en español
- Sé conciso pero completo
- Usa formato markdown con headers, listas y negritas para organizar la información
- Cuando analices datos, incluye números específicos
- Si no tienes suficiente información para responder algo, dilo claramente
- Enfócate en insights accionables, no solo datos crudos
- Los precios son en AUD (dólares australianos)

${businessContext}

HISTORIAL DE CONVERSACIÓN:
${messages.map(m => `${m.role === 'user' ? 'Admin' : 'Asistente'}: ${m.content}`).join('\n')}`;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `${systemPrompt}\n\nAdmin: ${text}`,
        model: "gemini_3_1_pro",
      });

      setMessages(prev => [...prev, { role: "assistant", content: response }]);
    } catch (err) {
      console.error("Error calling AI:", err);
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: "❌ Error al procesar tu consulta. Por favor intentá de nuevo." 
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Asistente IA</h1>
            <p className="text-xs text-slate-500">
              {contextLoaded ? "✅ Datos del negocio cargados · Gemini Pro" : "⏳ Cargando datos..."}
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => { setMessages([]); loadContext(); }}>
            <Trash2 className="w-4 h-4 mr-1" /> Nueva conversación
          </Button>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-slate-800 mb-1">¿En qué puedo ayudarte?</h2>
            <p className="text-sm text-slate-500 mb-6 text-center max-w-md">
              Tengo acceso a los datos de clientes, servicios, limpiadores, facturas y más. Preguntame lo que necesites.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full max-w-3xl">
              {QUICK_PROMPTS.map((qp, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(qp.prompt)}
                  disabled={loading || !contextLoaded}
                  className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-all text-left disabled:opacity-50"
                >
                  <qp.icon className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  <span className="text-sm font-medium text-slate-700">{qp.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                msg.role === 'user' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-white border border-slate-200 shadow-sm'
              }`}>
                {msg.role === 'user' ? (
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  <div className="prose prose-sm max-w-none prose-headings:text-slate-900 prose-p:text-slate-700 prose-li:text-slate-700 prose-strong:text-slate-900">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Analizando...
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="flex gap-2 items-end">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribí tu pregunta sobre el negocio..."
          className="resize-none min-h-[44px] max-h-[120px]"
          rows={1}
          disabled={loading || !contextLoaded}
        />
        <Button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || loading || !contextLoaded}
          className="h-11 w-11 p-0 bg-blue-600 hover:bg-blue-700 flex-shrink-0"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}