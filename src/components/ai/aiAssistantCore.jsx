import { base44 } from "@/api/base44Client";
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from "date-fns";
import { es } from "date-fns/locale";

// ─── Utilidades de fecha (sin conversión UTC) ────────────────────────────────
export function parseLocalDT(dt) {
  if (!dt) return null;
  const cleaned = dt.replace(/Z$/, '').replace(/[+-]\d{2}:\d{2}$/, '');
  return new Date(cleaned);
}
export function fmtDT(dt) {
  const d = parseLocalDT(dt);
  if (!d || isNaN(d)) return '?';
  return format(d, "dd/MM/yyyy HH:mm");
}
export function fmtTime(dt) {
  const d = parseLocalDT(dt);
  if (!d || isNaN(d)) return '?';
  return format(d, "HH:mm");
}

// ─── Paginación automática ───────────────────────────────────────────────────
export async function fetchAll(entity, filter, sort, limit = null) {
  const PAGE = 500;
  let all = [];
  let skip = 0;
  while (true) {
    const batch = filter
      ? await entity.filter(filter, sort, PAGE, skip)
      : await entity.list(sort, PAGE, skip);
    all = all.concat(batch);
    if (batch.length < PAGE) break;
    if (limit && all.length >= limit) break;
    skip += PAGE;
  }
  return limit ? all.slice(0, limit) : all;
}

// ─── Caché sessionStorage (10 minutos) ──────────────────────────────────────
const CACHE_KEY = 'redoak_ia_data';
const CACHE_TTL_MS = 10 * 60 * 1000;

export function getCachedData() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, loadedAt } = JSON.parse(raw);
    if (Date.now() - loadedAt > CACHE_TTL_MS) return null;
    return { data, loadedAt };
  } catch { return null; }
}

export function setCachedData(data) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, loadedAt: Date.now() }));
  } catch {}
}

export function clearCachedData() {
  try { sessionStorage.removeItem(CACHE_KEY); } catch {}
}

// ─── Carga de datos con ventana de tiempo (Fix #1: Stop Overfetching) ────────
export async function loadAllData() {
  const now = new Date();
  const minDateStr = format(subMonths(now, 1), 'yyyy-MM-dd');   // 1 mes atrás
  const maxDateStr = format(addMonths(now, 1), 'yyyy-MM-dd');   // 1 mes adelante

  const [clients, allClients, users, schedules, workEntries, feedback, invoices] = await Promise.all([
    fetchAll(base44.entities.Client, { active: true }, '-created_date'),
    fetchAll(base44.entities.Client, null, '-created_date'),
    base44.entities.User.list('-created_date', 100),
    // Solo servicios en la ventana: mes pasado → mes próximo
    fetchAll(base44.entities.Schedule, { start_time: { $gte: minDateStr, $lte: maxDateStr } }, 'start_time'),
    // Solo work entries del último mes
    fetchAll(base44.entities.WorkEntry, { work_date: { $gte: minDateStr } }, '-work_date'),
    // Feedback reciente: máximo 60 registros
    fetchAll(base44.entities.ClientFeedback, null, '-feedback_date', 60),
    // Facturas recientes
    fetchAll(base44.entities.Invoice, { period_start: { $gte: minDateStr } }, '-created_date'),
  ]);

  const cleanerMap = {};
  users.forEach(u => { cleanerMap[u.id] = u.full_name; });

  const data = { clients, allClients, users, schedules, workEntries, feedback, invoices, cleanerMap };
  setCachedData(data);
  return data;
}

// ─── Stats para el header ────────────────────────────────────────────────────
export function buildDataStats(data) {
  return `✅ ${data.schedules.length} servicios · ${data.workEntries.length} work entries · ${data.clients.length} clientes activos`;
}

// ─── Contexto base (Fix #2: Prompt Diet — KPIs y anomalías, no listas brutas) ─
export function buildBaseContext(data) {
  const { clients, users, schedules, workEntries, feedback, invoices, cleanerMap } = data;
  const now = new Date();
  const todayStr = format(now, 'yyyy-MM-dd');
  const tomorrowStr = format(new Date(now.getTime() + 86400000), 'yyyy-MM-dd');
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');

  const getLocalDate = (s) => (s.start_time || '').replace(/T.*/, '').replace(/Z.*/, '').slice(0, 10);
  const cleaners = users.filter(u => u.role !== 'admin');

  // ── Alertas del día (anomalías operativas)
  const todaySchedules = schedules.filter(s => getLocalDate(s) === todayStr);
  const tomorrowSchedules = schedules.filter(s => getLocalDate(s) === tomorrowStr);
  const unassignedToday = todaySchedules.filter(s => !s.cleaner_ids || s.cleaner_ids.length === 0);
  const unassignedTomorrow = tomorrowSchedules.filter(s => !s.cleaner_ids || s.cleaner_ids.length === 0);
  const pendingInvoices = invoices.filter(i => i.status === 'draft').length;
  const recentComplaints = feedback.filter(f => f.feedback_type === 'complaint' && f.feedback_date >= monthStart);

  // ── KPIs del mes
  const monthWork = workEntries.filter(w => (w.work_date || '') >= monthStart);
  const monthRevenue = monthWork.reduce((s, w) => s + (w.total_amount || 0), 0);
  const monthHours = monthWork.reduce((s, w) => s + (w.hours || 0), 0);

  // ── Horario de hoy y mañana (compacto)
  const fmtS = (s) => {
    const n = (s.cleaner_ids || []).map(id => cleanerMap[id] || id).join(', ');
    return `  • ${fmtDT(s.start_time)}-${fmtTime(s.end_time)} | ${s.client_name || '?'} | ${s.status} | [${n || '⚠️ SIN ASIGNAR'}]`;
  };

  // ── Rendimiento de limpiadores este mes
  const cleanerStats = cleaners.map(c => {
    const ent = monthWork.filter(w => w.cleaner_id === c.id);
    const hrs = ent.reduce((s, w) => s + (w.hours || 0), 0);
    const amt = ent.reduce((s, w) => s + (w.total_amount || 0), 0);
    return `  • ${c.full_name}: ${ent.length} servicios, ${hrs.toFixed(1)}h, $${amt.toFixed(2)}`;
  }).join('\n');

  // ── Clientes activos (resumen conciso)
  const clientSummary = clients.map(c =>
    `  • ${c.name}: $${c.current_service_price || 0} (${c.service_frequency || '?'}) ${c.service_hours || '?'}h`
  ).join('\n');

  return `=== ASISTENTE OPERATIVO — REDOAK CLEANING SOLUTIONS ===
📆 Hoy: ${format(now, "EEEE d 'de' MMMM yyyy", { locale: es })}
Ventana de datos: último mes hasta próximo mes.

⚠️ ALERTAS DEL DÍA:
${unassignedToday.length > 0 ? `- 🚨 ${unassignedToday.length} servicio(s) HOY sin limpiadores asignados:\n${unassignedToday.map(s => `    → ${s.client_name} ${fmtDT(s.start_time)}`).join('\n')}` : '- ✅ Todos los servicios de hoy tienen limpiadores.'}
${unassignedTomorrow.length > 0 ? `- ⚠️ ${unassignedTomorrow.length} servicio(s) MAÑANA sin asignar.` : ''}
- Facturas en borrador pendientes de envío: ${pendingInvoices}
- Quejas este mes: ${recentComplaints.length}

📊 KPIs DEL MES:
- Ingresos estimados (work entries): $${monthRevenue.toFixed(2)} AUD
- Horas trabajadas: ${monthHours.toFixed(1)}h
- Servicios completados: ${schedules.filter(s => s.status === 'completed' && getLocalDate(s) >= monthStart).length}

📅 HORARIO HOY (${todaySchedules.length} servicios):
${todaySchedules.map(fmtS).join('\n') || '  (Sin servicios hoy)'}

📅 HORARIO MAÑANA (${tomorrowSchedules.length} servicios):
${tomorrowSchedules.map(fmtS).join('\n') || '  (Sin servicios mañana)'}

📅 PRÓXIMOS SERVICIOS (siguientes 15 después de mañana):
${schedules.filter(s => getLocalDate(s) > tomorrowStr).slice(0, 15).map(fmtS).join('\n') || '  (Ninguno)'}

🧹 RENDIMIENTO LIMPIADORES ESTE MES:
${cleanerStats || '  (Sin datos)'}

👥 CLIENTES ACTIVOS (${clients.length}):
${clientSummary}

💬 FEEDBACK RECIENTE (${feedback.length} registros, mostrando últimos 15):
${feedback.slice(0, 15).map(f => `  • ${f.feedback_date} ${f.client_name}: ${f.feedback_type} — "${f.description?.slice(0, 100) || ''}"`).join('\n')}

💰 FACTURAS (${invoices.length} en período):
${invoices.slice(0, 10).map(i => `  • ${i.invoice_number || '—'}: ${i.cleaner_name} $${i.total_amount || 0} (${i.status}) ${i.period || ''}`).join('\n')}`;
}

// ─── Contexto detallado por entidad (Fix #3: Fuzzy token matching) ────────────
export function buildDetailedContext(query, data) {
  const { clients, allClients, schedules, workEntries, feedback, cleanerMap, users } = data;
  const allC = allClients || clients;

  // Tokenizar la pregunta: palabras de más de 3 letras
  const queryTokens = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);

  const matchedClients = allC.filter(c => {
    if (!c.name) return false;
    const name = c.name.toLowerCase();
    return queryTokens.some(token => name.includes(token));
  });

  const matchedCleaners = users.filter(u => {
    if (!u.full_name) return false;
    const name = u.full_name.toLowerCase();
    return queryTokens.some(token => name.includes(token));
  });

  let extra = '';

  for (const client of matchedClients) {
    const cSched = schedules.filter(s => s.client_id === client.id || s.client_name === client.name)
      .sort((a, b) => (b.start_time || '').localeCompare(a.start_time || ''));
    const cWork = workEntries.filter(w => w.client_id === client.id || w.client_name === client.name)
      .sort((a, b) => (b.work_date || '').localeCompare(a.work_date || ''));
    const cFeed = feedback.filter(f => f.client_id === client.id || f.client_name === client.name);

    extra += `\n=== DETALLE CLIENTE "${client.name}" ===
- Tipo: ${client.client_type || 'domestic'} | Activo: ${client.active !== false ? 'Sí' : 'No'}
- Dirección: ${client.address || 'N/A'} | Tel: ${client.mobile_number || 'N/A'} | Email: ${client.email || 'N/A'}
- Precio: $${client.current_service_price || 0} | Freq: ${client.service_frequency || 'N/A'} | Horas: ${client.service_hours || 'N/A'}
- Pago: ${client.payment_method || 'N/A'} | GST: ${client.gst_type || 'N/A'}
- Notas admin: ${client.admin_notes || 'N/A'}
${client.price_history?.length ? `- Historial precios: ${client.price_history.map(p => `$${p.previous_price}→$${p.new_price} (${p.effective_date})`).join(' | ')}` : ''}

SERVICIOS (${cSched.length} total):
${cSched.map(s => {
      const n = (s.cleaner_ids || []).map(id => cleanerMap[id] || id).join(', ');
      return `  • ${fmtDT(s.start_time)}-${fmtTime(s.end_time)} | ${s.status} | [${n}]`;
    }).join('\n') || '  Sin servicios.'}

WORK ENTRIES (${cWork.length} total):
${cWork.map(w => `  • ${w.work_date}: ${w.hours}h x $${w.hourly_rate || 0} = $${w.total_amount || 0} (${w.cleaner_name || '?'})`).join('\n') || '  Sin entradas.'}

FEEDBACK (${cFeed.length}):
${cFeed.map(f => `  • ${f.feedback_date}: ${f.feedback_type} | "${f.description || ''}" | Acción: ${f.action_taken || 'N/A'}`).join('\n') || '  Sin feedback.'}
`;
  }

  for (const cleaner of matchedCleaners) {
    const cSched = schedules.filter(s => (s.cleaner_ids || []).includes(cleaner.id))
      .sort((a, b) => (b.start_time || '').localeCompare(a.start_time || ''));
    const cWork = workEntries.filter(w => w.cleaner_id === cleaner.id)
      .sort((a, b) => (b.work_date || '').localeCompare(a.work_date || ''));
    const cFeed = feedback.filter(f => (f.affected_cleaner_ids || []).includes(cleaner.id));

    extra += `\n=== DETALLE LIMPIADOR "${cleaner.full_name}" ===
- Email: ${cleaner.email || 'N/A'} | Rol: ${cleaner.role}

SERVICIOS (${cSched.length} total):
${cSched.map(s => `  • ${fmtDT(s.start_time)} | ${s.client_name || '?'} | ${s.status}`).join('\n') || '  Sin servicios.'}

WORK ENTRIES (${cWork.length} total):
${cWork.map(w => `  • ${w.work_date}: ${w.client_name || '?'} ${w.hours}h x $${w.hourly_rate || 0} = $${w.total_amount || 0}`).join('\n') || '  Sin entradas.'}

FEEDBACK (${cFeed.length}):
${cFeed.map(f => `  • ${f.feedback_date}: ${f.client_name} - ${f.feedback_type} - "${f.description?.slice(0, 80) || ''}"`).join('\n') || '  Sin feedback.'}
`;
  }

  return extra;
}

// ─── Enviar mensaje al LLM (Fix #4: System Directives mejoradas) ─────────────
export async function sendAIMessage({ text, messages, allData, activeConvId, setMessages, setLoading, setSavingMsg, setActiveConvId, setConversations }) {
  if (!text.trim() || !allData) return;

  const userMsg = { role: "user", content: text, timestamp: new Date().toISOString() };
  const newMessages = [...messages, userMsg];
  setMessages(newMessages);
  setLoading(true);

  try {
    const baseCtx = buildBaseContext(allData);
    const detailCtx = buildDetailedContext(text, allData);

    const systemPrompt = `Eres el Asistente de Operaciones de RedOak Cleaning Solutions (Melbourne, Australia).
Tu trabajo es analizar datos operativos y dar respuestas directas, profesionales y proactivas al administrador.

REGLAS ESTRICTAS:
1. Responde SIEMPRE en español.
2. NUNCA inventes información. Si no tenés el dato en el contexto, decí explícitamente "No tengo esa información en mi memoria actual".
3. Usa tablas Markdown cuando listes horarios, finanzas o comparaciones (más de 3 ítems).
4. Sé breve y directo. Sin saludos ni frases de relleno.
5. Los precios son en AUD ($).
6. Si notás anomalías (servicios sin asignar, quejas recientes, facturas vencidas), avisale proactivamente al usuario aunque no te lo hayan preguntado.
7. Cuando analices datos, siempre incluí números específicos.

${baseCtx}
${detailCtx}

HISTORIAL RECIENTE:
${messages.slice(-8).map(m => `${m.role === 'user' ? 'Admin' : 'Asistente'}: ${m.content.slice(0, 600)}`).join('\n')}`;

    const response = await base44.integrations.Core.InvokeLLM({
      prompt: `${systemPrompt}\n\nAdmin: ${text}`,
      model: "gemini_3_1_pro",
    });

    const assistantMsg = { role: "assistant", content: response, timestamp: new Date().toISOString() };
    const finalMessages = [...newMessages, assistantMsg];
    setMessages(finalMessages);

    setSavingMsg(true);
    const title = text.slice(0, 60) + (text.length > 60 ? '...' : '');
    if (activeConvId) {
      const updated = await base44.entities.AIConversation.update(activeConvId, {
        messages: finalMessages,
        last_message_at: new Date().toISOString(),
      });
      setConversations(prev => prev.map(c => c.id === activeConvId ? { ...c, messages: finalMessages, last_message_at: updated.last_message_at } : c));
    } else {
      const created = await base44.entities.AIConversation.create({
        title,
        messages: finalMessages,
        last_message_at: new Date().toISOString(),
      });
      setActiveConvId(created.id);
      setConversations(prev => [created, ...prev]);
    }
  } catch (err) {
    console.error("Error calling AI:", err);
    const errMsg = { role: "assistant", content: "❌ Error al procesar tu consulta. Intentá de nuevo.", timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, errMsg]);
  } finally {
    setLoading(false);
    setSavingMsg(false);
  }
}