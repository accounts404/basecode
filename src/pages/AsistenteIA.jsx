import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Bot, Send, Loader2, Sparkles, Trash2, BarChart3, Users, Calendar, TrendingUp, AlertTriangle, ClipboardList, RefreshCw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";

const QUICK_PROMPTS = [
  { icon: BarChart3, label: "Resumen del mes", prompt: "Dame un resumen completo del negocio este mes: cantidad de servicios, ingresos estimados, clientes activos y cualquier dato relevante." },
  { icon: Users, label: "Rendimiento limpiadores", prompt: "Analiza el rendimiento de los limpiadores este mes: horas trabajadas, cantidad de servicios, y quiénes han trabajado más o menos." },
  { icon: AlertTriangle, label: "Quejas y feedback", prompt: "Muéstrame un análisis de las quejas y feedbacks de clientes recientes. ¿Hay patrones o limpiadores que necesiten atención?" },
  { icon: TrendingUp, label: "Análisis rentabilidad", prompt: "Analiza la rentabilidad del negocio: precios promedio por servicio, horas promedio, y qué clientes podrían necesitar ajuste de precios." },
  { icon: Calendar, label: "Servicios próximos", prompt: "¿Cómo se ve la carga de trabajo de esta semana y la próxima? Dame el detalle de cada día con clientes, horarios y limpiadores asignados." },
  { icon: ClipboardList, label: "Clientes sin servicio", prompt: "¿Hay clientes activos que no han tenido servicios en las últimas 2-3 semanas? Podría haber problemas de programación." },
];

// Treat stored datetimes as Melbourne local time (strip Z to avoid UTC conversion)
function parseLocalDT(dt) {
  if (!dt) return null;
  // Remove Z or +offset so JS doesn't shift to UTC — data is already in Melbourne local time
  const cleaned = dt.replace(/Z$/, '').replace(/[+-]\d{2}:\d{2}$/, '');
  return new Date(cleaned);
}

function fmtDT(dt) {
  const d = parseLocalDT(dt);
  if (!d || isNaN(d)) return '?';
  return format(d, "dd/MM/yyyy HH:mm");
}

function fmtTime(dt) {
  const d = parseLocalDT(dt);
  if (!d || isNaN(d)) return '?';
  return format(d, "HH:mm");
}

function fmtDateOnly(dt) {
  const d = parseLocalDT(dt);
  if (!d || isNaN(d)) return '?';
  return format(d, "dd/MM/yyyy");
}

async function loadAllData() {
  const now = new Date();
  // Date anchors for filtering
  const past90 = new Date(now); past90.setDate(past90.getDate() - 90);
  const future180 = new Date(now); future180.setDate(future180.getDate() + 180);
  const past365 = new Date(now); past365.setDate(past365.getDate() - 365);

  const past90Str = past90.toISOString();
  const future180Str = future180.toISOString();
  const past365Str = past365.toISOString();

  const [
    clients, allClients, users,
    schedUpcoming,   // from today forward
    schedRecent,     // last 90 days
    workRecent,      // last year
    feedback, invoices,
  ] = await Promise.all([
    base44.entities.Client.filter({ active: true }, '-created_date', 500),
    base44.entities.Client.filter({}, '-created_date', 500),
    base44.entities.User.list('-created_date', 100),
    // Upcoming: use today's date string to avoid UTC offset issues
    base44.entities.Schedule.filter({ start_time: { $gte: format(now, 'yyyy-MM-dd') } }, 'start_time', 1000),
    // Recent past: last 90 days
    base44.entities.Schedule.filter({ start_time: { $gte: format(past90, 'yyyy-MM-dd'), $lt: format(now, 'yyyy-MM-dd') } }, '-start_time', 500),
    // Work entries: last year
    base44.entities.WorkEntry.filter({ work_date: { $gte: past365Str.slice(0, 10) } }, '-work_date', 2000),
    base44.entities.ClientFeedback.filter({}, '-feedback_date', 200),
    base44.entities.Invoice.filter({}, '-created_date', 50),
  ]);

  // Deduplicate schedules
  const schedMap = {};
  [...schedUpcoming, ...schedRecent].forEach(s => { schedMap[s.id] = s; });
  const schedules = Object.values(schedMap);

  const cleanerMap = {};
  users.forEach(u => { cleanerMap[u.id] = u.full_name; });

  return { clients, allClients, users, schedules, workEntries: workRecent, feedback, invoices, cleanerMap };
}

function buildBaseContext(data) {
  const { clients, users, schedules, workEntries, feedback, invoices, cleanerMap } = data;
  const now = new Date();
  const today = format(now, 'yyyy-MM-dd');
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');

  const cleaners = users.filter(u => u.role !== 'admin');
  // Use local date (strip time) for comparisons to avoid UTC shift issues
  const getLocalDate = (s) => (s.start_time || '').replace(/T.*/, '').replace(/Z.*/, '').slice(0, 10);
  const thisMonthSchedules = schedules.filter(s => { const d = getLocalDate(s); return d >= monthStart && d <= monthEnd; });
  const upcoming = schedules.filter(s => getLocalDate(s) >= today).sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
  const pastMonth = thisMonthSchedules.filter(s => getLocalDate(s) < today).sort((a, b) => (b.start_time || '').localeCompare(a.start_time || ''));
  const monthWork = workEntries.filter(w => w.work_date >= monthStart);

  const fmtS = (s) => {
    const d = fmtDT(s.start_time);
    const e = fmtTime(s.end_time);
    const n = (s.cleaner_ids || []).map(id => cleanerMap[id] || id).join(', ');
    return `- ${d}-${e} | ${s.client_name || '?'} | ${s.client_address || ''} | ${s.status} | Limpiadores: [${n || 'SIN ASIGNAR'}]`;
  };

  return `=== DATOS REDOAK CLEANING ===
📆 Hoy: ${format(now, "EEEE d 'de' MMMM yyyy", { locale: es })}
Datos cargados: ${schedules.length} servicios, ${workEntries.length} work entries, ${clients.length} clientes activos

🔴 SERVICIOS PRÓXIMOS (${upcoming.length}):
${upcoming.map(fmtS).join('\n') || 'Ninguno.'}

📅 SERVICIOS PASADOS ESTE MES (${pastMonth.length}):
${pastMonth.slice(0, 40).map(fmtS).join('\n')}

👥 CLIENTES ACTIVOS (${clients.length}):
${clients.map(c => `- ${c.name}: $${c.current_service_price || 0} (${c.service_frequency || '?'}) | ${c.service_hours || '?'}h | ${c.address || ''} | Pago: ${c.payment_method || '?'} | GST: ${c.gst_type || '?'}`).join('\n')}

🧹 LIMPIADORES (${cleaners.length}):
${cleaners.map(c => {
    const ent = monthWork.filter(w => w.cleaner_id === c.id);
    const hrs = ent.reduce((s, w) => s + (w.hours || 0), 0);
    const amt = ent.reduce((s, w) => s + (w.total_amount || 0), 0);
    return `- ${c.full_name}: ${ent.length} entries, ${hrs.toFixed(1)}h, $${amt.toFixed(2)} este mes`;
  }).join('\n')}

💬 FEEDBACK (${feedback.length} total):
${feedback.slice(0, 20).map(f => `- ${f.feedback_date} ${f.client_name}: ${f.feedback_type} - "${f.description?.slice(0, 80) || ''}"`).join('\n')}

💰 FACTURAS (${invoices.length}):
${invoices.slice(0, 15).map(i => `- ${i.invoice_number}: ${i.cleaner_name} $${i.total_amount || 0} (${i.status}) ${i.period || ''}`).join('\n')}`;
}

function buildDetailedContext(query, data) {
  const { clients, allClients, schedules, workEntries, feedback, invoices, cleanerMap, users } = data;
  const q = query.toLowerCase();
  const allC = allClients || clients;

  const matchedClients = allC.filter(c => c.name && q.includes(c.name.toLowerCase()));
  const matchedCleaners = users.filter(u => u.full_name && q.includes(u.full_name.toLowerCase()));

  let extra = '';

  for (const client of matchedClients) {
    const cSched = schedules.filter(s => s.client_id === client.id || s.client_name === client.name).sort((a, b) => (b.start_time || '').localeCompare(a.start_time || ''));
    const cWork = workEntries.filter(w => w.client_id === client.id || w.client_name === client.name).sort((a, b) => (b.work_date || '').localeCompare(a.work_date || ''));
    const cFeed = feedback.filter(f => f.client_id === client.id || f.client_name === client.name);

    extra += `\n=== DETALLE CLIENTE "${client.name}" ===
- Tipo: ${client.client_type || 'domestic'} | Activo: ${client.active !== false ? 'Sí' : 'No'}
- Dirección: ${client.address || 'N/A'} | Tel: ${client.mobile_number || 'N/A'} | Email: ${client.email || 'N/A'}
- Precio: $${client.current_service_price || 0} | Freq: ${client.service_frequency || 'N/A'} | Horas: ${client.service_hours || 'N/A'}
- Pago: ${client.payment_method || 'N/A'} | GST: ${client.gst_type || 'N/A'}
- Inicio: ${client.start_date || 'N/A'} | Fin: ${client.end_date || 'N/A'}
- Propiedad: ${client.property_type || 'N/A'} ${client.property_stories || ''} | Hab: ${client.num_bedrooms || '?'} | Baños: ${client.num_bathrooms || '?'}
- Acceso: ${client.has_access ? `${client.access_type || ''} - ${client.access_instructions || ''}` : 'No'}
- Notas admin: ${client.admin_notes || 'N/A'}
- Notas servicio: ${client.default_service_notes || 'N/A'}
${client.pets?.length ? `- Mascotas: ${client.pets.map(p => `${p.name} (${p.type})`).join(', ')}` : ''}
${client.price_history?.length ? `- Historial precios: ${client.price_history.map(p => `$${p.previous_price}→$${p.new_price} (${p.effective_date})`).join(' | ')}` : ''}

SERVICIOS (${cSched.length} total):
${cSched.map(s => {
      const d = fmtDT(s.start_time);
      const e = fmtTime(s.end_time);
      const n = (s.cleaner_ids || []).map(id => cleanerMap[id] || id).join(', ');
      return `- ${d}-${e} | ${s.status} | [${n}] | ${s.service_specific_notes || ''}`;
    }).join('\n') || 'Sin servicios.'}

WORK ENTRIES (${cWork.length} total):
${cWork.map(w => `- ${w.work_date}: ${w.hours}h x $${w.hourly_rate || 0} = $${w.total_amount || 0} (${w.cleaner_name || '?'}) ${w.activity || ''}`).join('\n') || 'Sin entradas.'}

FEEDBACK (${cFeed.length}):
${cFeed.map(f => `- ${f.feedback_date}: ${f.feedback_type} | ${f.severity || ''} | "${f.description || ''}" | Acción: ${f.action_taken || 'N/A'}`).join('\n') || 'Sin feedback.'}
`;
  }

  for (const cleaner of matchedCleaners) {
    const cSched = schedules.filter(s => (s.cleaner_ids || []).includes(cleaner.id)).sort((a, b) => (b.start_time || '').localeCompare(a.start_time || ''));
    const cWork = workEntries.filter(w => w.cleaner_id === cleaner.id).sort((a, b) => (b.work_date || '').localeCompare(a.work_date || ''));
    const cFeed = feedback.filter(f => (f.affected_cleaner_ids || []).includes(cleaner.id));

    extra += `\n=== DETALLE LIMPIADOR "${cleaner.full_name}" ===
- Email: ${cleaner.email || 'N/A'} | Rol: ${cleaner.role}

SERVICIOS (${cSched.length} total):
${cSched.slice(0, 80).map(s => {
      return `- ${fmtDT(s.start_time)} | ${s.client_name || '?'} | ${s.status}`;
    }).join('\n') || 'Sin servicios.'}

WORK ENTRIES (${cWork.length} total):
${cWork.slice(0, 80).map(w => `- ${w.work_date}: ${w.client_name || '?'} ${w.hours}h x $${w.hourly_rate || 0} = $${w.total_amount || 0}`).join('\n') || 'Sin entradas.'}

FEEDBACK (${cFeed.length}):
${cFeed.map(f => `- ${f.feedback_date}: ${f.client_name} - ${f.feedback_type} - "${f.description?.slice(0, 80) || ''}"`).join('\n') || 'Sin feedback.'}
`;
  }

  return extra;
}

export default function AsistenteIA() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [contextLoaded, setContextLoaded] = useState(false);
  const [allData, setAllData] = useState(null);
  const [dataStats, setDataStats] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const loadData = async () => {
    setContextLoaded(false);
    try {
      const data = await loadAllData();
      setAllData(data);
      setDataStats(`${data.schedules.length} servicios · ${data.workEntries.length} work entries · ${data.clients.length} clientes`);
      setContextLoaded(true);
    } catch (err) {
      console.error("Error loading data:", err);
      setDataStats("Error cargando datos");
      setContextLoaded(true);
    }
  };

  const sendMessage = async (text) => {
    if (!text.trim() || loading || !allData) return;

    const userMsg = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const baseCtx = buildBaseContext(allData);
      const detailCtx = buildDetailedContext(text, allData);

      const systemPrompt = `Eres el asistente IA de RedOak Cleaning Solutions, empresa de limpieza en Melbourne, Australia.
Ayudas al administrador analizando datos, dando informes, identificando problemas y sugiriendo mejoras.

REGLAS:
- Responde SIEMPRE en español
- Sé conciso pero completo, usa markdown (headers, listas, negritas)
- Incluye números específicos cuando analices datos
- Los precios son en AUD
- Si mencionan un cliente o limpiador, tienes TODOS sus datos históricos abajo
- Enfócate en insights accionables

${baseCtx}
${detailCtx}

HISTORIAL:
${messages.map(m => `${m.role === 'user' ? 'Admin' : 'Asistente'}: ${m.content}`).join('\n')}`;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `${systemPrompt}\n\nAdmin: ${text}`,
        model: "gemini_3_1_pro",
      });

      setMessages(prev => [...prev, { role: "assistant", content: response }]);
    } catch (err) {
      console.error("Error calling AI:", err);
      setMessages(prev => [...prev, { role: "assistant", content: "❌ Error al procesar tu consulta. Intentá de nuevo." }]);
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
              {contextLoaded ? `✅ ${dataStats} · Gemini Pro` : "⏳ Cargando todos los datos..."}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={!contextLoaded}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          {messages.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setMessages([])}>
              <Trash2 className="w-4 h-4 mr-1" /> Nueva
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-slate-800 mb-1">¿En qué puedo ayudarte?</h2>
            <p className="text-sm text-slate-500 mb-6 text-center max-w-md">
              Tengo acceso a TODOS los datos: clientes, servicios (pasados y futuros), limpiadores, facturas y feedback. Preguntá por cualquier cliente o tema.
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
                msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 shadow-sm'
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
                Analizando datos...
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 items-end">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Preguntá sobre cualquier cliente, limpiador, servicio..."
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