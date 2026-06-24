import { base44 } from "@/api/base44Client";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";

// --- UTILIDADES DE FECHA (sin conversión UTC para Melbourne) ---
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

// --- PAGINACIÓN AUTOMÁTICA ---
export async function fetchAll(entity, filter, sort) {
  const PAGE = 1000;
  let all = [];
  let skip = 0;
  while (true) {
    const batch = filter
      ? await entity.filter(filter, sort, PAGE, skip)
      : await entity.list(sort, PAGE, skip);
    all = all.concat(batch);
    if (batch.length < PAGE) break;
    skip += PAGE;
  }
  return all;
}

// --- CACHÉ EN sessionStorage (10 minutos) ---
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

// --- 1. CARGA DE DATOS CON VENTANA DE TIEMPO (-3M / +2M) ---
export async function loadAllData() {
  // Ventana hacia atrás: 3 meses
  const pastDate = new Date();
  pastDate.setMonth(pastDate.getMonth() - 3);
  const minDateStr = format(pastDate, 'yyyy-MM-dd');

  // Ventana hacia adelante: 2 meses
  const futureDate = new Date();
  futureDate.setMonth(futureDate.getMonth() + 2);
  const maxDateStr = format(futureDate, 'yyyy-MM-dd');

  const [clients, allClients, users, schedules, workEntries, feedback, invoices] = await Promise.all([
    fetchAll(base44.entities.Client, { active: true }, '-created_date'),
    fetchAll(base44.entities.Client, null, '-created_date'),
    base44.entities.User.list('-created_date', 100),
    fetchAll(base44.entities.Schedule, { start_time: { $gte: minDateStr, $lte: maxDateStr } }, 'start_time'),
    fetchAll(base44.entities.WorkEntry, { work_date: { $gte: minDateStr } }, '-work_date'),
    fetchAll(base44.entities.ClientFeedback, { created_date: { $gte: minDateStr } }, '-created_date'),
    fetchAll(base44.entities.Invoice, { created_date: { $gte: minDateStr } }, '-created_date'),
  ]);

  // Mapas de resolución rápida: id → nombre
  const cleanerMap = {};
  users.forEach(u => { cleanerMap[u.id] = u.full_name; });

  const clientMap = {};
  allClients.forEach(c => { clientMap[c.id] = c.name; });

  const data = { clients, allClients, users, schedules, workEntries, feedback, invoices, cleanerMap, clientMap };
  setCachedData(data);
  return data;
}

// --- STATS PARA EL HEADER ---
export function buildDataStats(data) {
  const allSched = data.schedules;
  const minDate = allSched.length ? allSched.reduce((m, s) => s.start_time < m ? s.start_time : m, allSched[0].start_time).slice(0, 10) : '?';
  const maxDate = allSched.length ? allSched.reduce((m, s) => s.start_time > m ? s.start_time : m, allSched[0].start_time).slice(0, 10) : '?';
  return `✅ ${data.schedules.length} servicios (${minDate} → ${maxDate}) · ${data.workEntries.length} work entries · ${data.clients.length} clientes`;
}

// --- 2. PROMPT DIET: ALERTAS + 20 PRÓXIMOS SERVICIOS ---
export function buildBaseContext(data) {
  const { clients, users, schedules, workEntries, feedback, invoices, cleanerMap, clientMap } = data;
  const now = new Date();
  const nowLocal = parseLocalDT(new Date().toISOString());
  const todayStr = format(nowLocal, 'yyyy-MM-dd');
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');

  const cleaners = users.filter(u => u.role !== 'admin');

  // Calcular anomalías del día
  const unassignedSchedules = schedules.filter(s =>
    s.start_time.startsWith(todayStr) && (!s.cleaner_ids || s.cleaner_ids.length === 0)
  );
  const pendingInvoices = invoices.filter(inv => inv.status === 'draft').length;

  let context = `=== RESUMEN OPERATIVO REDOAK ===\n`;
  context += `📆 Fecha actual: ${format(nowLocal, "EEEE d 'de' MMMM yyyy", { locale: es })}\n`;
  context += `Datos cargados: ${schedules.length} servicios · ${workEntries.length} work entries · ${clients.length} clientes activos\n\n`;

  // Bloque de alertas
  context += `⚠️ ALERTAS DEL DÍA:\n`;
  if (unassignedSchedules.length > 0) {
    context += `- 🔴 CRÍTICO: Hay ${unassignedSchedules.length} servicios HOY sin limpiadores asignados.\n`;
  } else {
    context += `- ✅ Todos los servicios de hoy tienen personal asignado.\n`;
  }
  if (pendingInvoices > 0) {
    context += `- 📝 Facturas en borrador (pendientes de envío): ${pendingInvoices}\n`;
  }
  context += `\n`;

  // Próximos 20 servicios: hoy/mañana detallado, resto resumido
  const upcomingSchedules = schedules
    .filter(s => s.start_time >= todayStr)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .slice(0, 20);

  context += `📅 PRÓXIMOS SERVICIOS (Máx 20):\n`;
  upcomingSchedules.forEach(s => {
    const startLocal = parseLocalDT(s.start_time);
    const diffHours = (startLocal.getTime() - nowLocal.getTime()) / (1000 * 60 * 60);
    const isTodayOrTomorrow = diffHours < 48 && diffHours >= -24;

    const clientName = clientMap[s.client_id] || s.client_name || 'Cliente Desconocido';

    if (isTodayOrTomorrow) {
      let durationStr = "N/A";
      if (s.start_time && s.end_time) {
        const hours = (parseLocalDT(s.end_time).getTime() - startLocal.getTime()) / 3600000;
        durationStr = `${hours.toFixed(1)}h`;
      }
      const cleanersStr = s.cleaner_ids?.map(id => cleanerMap[id] || id).join(', ') || 'NINGUNO';
      context += `- [${fmtDT(s.start_time)}] Cliente: ${clientName} | Personal: ${cleanersStr} | Duración: ${durationStr} | Estado: ${s.status} | Notas: ${s.notes_public || s.service_specific_notes || 'N/A'}\n`;
    } else {
      context += `- [${s.start_time.split('T')[0]}] Cliente: ${clientName} | Personal: ${s.cleaner_ids?.length || 0} asignados | Estado: ${s.status}\n`;
    }
  });

  // Limpiadores con métricas del mes
  const monthWork = workEntries.filter(w => w.work_date >= monthStart);
  context += `\n🧹 LIMPIADORES (${cleaners.length}):\n`;
  cleaners.forEach(c => {
    const ent = monthWork.filter(w => w.cleaner_id === c.id);
    const hrs = ent.reduce((s, w) => s + (w.hours || 0), 0);
    const amt = ent.reduce((s, w) => s + (w.total_amount || 0), 0);
    context += `- ${c.full_name}: ${ent.length} entries, ${hrs.toFixed(1)}h, $${amt.toFixed(2)} este mes\n`;
  });

  // Clientes activos
  context += `\n👥 CLIENTES ACTIVOS (${clients.length}):\n`;
  context += clients.map(c =>
    `- ${c.name}: $${c.current_service_price || 0} (${c.service_frequency || '?'}) | ${c.service_hours || '?'}h | ${c.address || ''} | Pago: ${c.payment_method || '?'} | GST: ${c.gst_type || '?'}`
  ).join('\n');

  // Feedback reciente
  context += `\n\n💬 FEEDBACK RECIENTE (${feedback.length} total, últimos 15):\n`;
  context += feedback.slice(0, 15).map(f =>
    `- ${f.feedback_date} ${f.client_name}: ${f.feedback_type} - "${f.description?.slice(0, 80) || ''}"`
  ).join('\n');

  // Facturas
  context += `\n\n💰 FACTURAS (${invoices.length} total, últimas 10):\n`;
  context += invoices.slice(0, 10).map(i =>
    `- ${i.invoice_number}: ${i.cleaner_name} $${i.total_amount || 0} (${i.status}) ${i.period || ''}`
  ).join('\n');

  return context;
}

// --- 3. FUZZY SEARCH (tokens > 4 letras, max 3 matches, cuerpo detallado intacto) ---
export function buildDetailedContext(query, data) {
  const { clients, allClients, schedules, workEntries, feedback, cleanerMap, users } = data;
  const q = query.toLowerCase();
  const allC = allClients || clients;

  // Fuzzy matching por tokens
  const queryTokens = q.split(/\s+/).filter(word => word.length > 4);

  let matchedClients, matchedCleaners;

  if (queryTokens.length === 0) {
    // Fallback al comportamiento original si la consulta es muy corta
    matchedClients = allC.filter(c => c.name && q.includes(c.name.toLowerCase()));
    matchedCleaners = users.filter(u => u.full_name && q.includes(u.full_name.toLowerCase()));
  } else {
    matchedClients = allC.filter(c => {
      if (!c.name) return false;
      const clientName = c.name.toLowerCase();
      return queryTokens.some(token => clientName.includes(token));
    }).slice(0, 3);

    matchedCleaners = users.filter(u => {
      if (!u.full_name) return false;
      const cleanerName = u.full_name.toLowerCase();
      return queryTokens.some(token => cleanerName.includes(token));
    }).slice(0, 3);
  }

  let extra = '';

  // Detalle completo por cliente (intacto)
  for (const client of matchedClients) {
    const cSched = schedules.filter(s => s.client_id === client.id || s.client_name === client.name).sort((a, b) => (b.start_time || '').localeCompare(a.start_time || ''));
    const cWork = workEntries.filter(w => w.client_id === client.id || w.client_name === client.name).sort((a, b) => (b.work_date || '').localeCompare(a.work_date || ''));
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
      const cleanersStr = (s.cleaner_ids || []).map(id => cleanerMap[id] || id).join(', ');
      return `- ${fmtDT(s.start_time)}-${fmtTime(s.end_time)} | ${s.status} | [${cleanersStr}]`;
    }).join('\n') || 'Sin servicios.'}

WORK ENTRIES (${cWork.length} total):
${cWork.map(w => `- ${w.work_date}: ${w.hours}h x $${w.hourly_rate || 0} = $${w.total_amount || 0} (${w.cleaner_name || '?'})`).join('\n') || 'Sin entradas.'}

FEEDBACK (${cFeed.length}):
${cFeed.map(f => `- ${f.feedback_date}: ${f.feedback_type} | "${f.description || ''}" | Acción: ${f.action_taken || 'N/A'}`).join('\n') || 'Sin feedback.'}
`;
  }

  // Detalle completo por limpiador (intacto)
  for (const cleaner of matchedCleaners) {
    const cSched = schedules.filter(s => (s.cleaner_ids || []).includes(cleaner.id)).sort((a, b) => (b.start_time || '').localeCompare(a.start_time || ''));
    const cWork = workEntries.filter(w => w.cleaner_id === cleaner.id).sort((a, b) => (b.work_date || '').localeCompare(a.work_date || ''));
    const cFeed = feedback.filter(f => (f.affected_cleaner_ids || []).includes(cleaner.id));

    extra += `\n=== DETALLE LIMPIADOR "${cleaner.full_name}" ===
- Email: ${cleaner.email || 'N/A'} | Rol: ${cleaner.role}

SERVICIOS (${cSched.length} total):
${cSched.slice(0, 80).map(s => `- ${fmtDT(s.start_time)} | ${s.client_name || '?'} | ${s.status}`).join('\n') || 'Sin servicios.'}

WORK ENTRIES (${cWork.length} total):
${cWork.slice(0, 80).map(w => `- ${w.work_date}: ${w.client_name || '?'} ${w.hours}h x $${w.hourly_rate || 0} = $${w.total_amount || 0}`).join('\n') || 'Sin entradas.'}

FEEDBACK (${cFeed.length}):
${cFeed.map(f => `- ${f.feedback_date}: ${f.client_name} - ${f.feedback_type} - "${f.description?.slice(0, 80) || ''}"`).join('\n') || 'Sin feedback.'}
`;
  }

  return extra;
}

// --- 4. SYSTEM PROMPT FUSIONADO ---
export const getSystemPrompt = () => `Eres el Asistente de Operaciones con IA de RedOak Cleaning Solutions (Melbourne).
Tu objetivo es analizar los datos operativos y brindar respuestas útiles al administrador.

REGLAS DE COMPORTAMIENTO Y FORMATO:
1. Responde siempre en español, con un tono profesional, proactivo y claro.
2. Todos los valores monetarios deben interpretarse y mostrarse en Dólares Australianos (AUD).
3. Enfócate en dar "insights" accionables y resume la información de forma inteligente.
4. NUNCA inventes información. Si te piden un dato específico que no está en el contexto provisto, responde: "No tengo esa información en mi memoria actual".
5. Usa tablas Markdown SIEMPRE que listes horarios de servicios, finanzas, facturas o comparaciones.
6. Sé conciso pero completo en tus análisis. Sin saludos robóticos.
7. Si notas anomalías en el contexto (como servicios sin asignar o quejas recientes), avísale al usuario proactivamente al inicio de tu respuesta.
8. Los precios son en AUD. Si mencionan un cliente o limpiador, tienes TODOS sus datos históricos en el contexto.`;

// --- ENVÍO DE MENSAJES AL LLM ---
export async function sendAIMessage({ text, messages, allData, activeConvId, setMessages, setLoading, setSavingMsg, setActiveConvId, setConversations }) {
  if (!text.trim() || !allData) return;

  const userMsg = { role: "user", content: text, timestamp: new Date().toISOString() };
  const newMessages = [...messages, userMsg];
  setMessages(newMessages);
  setLoading(true);

  try {
    const baseCtx = buildBaseContext(allData);
    const detailCtx = buildDetailedContext(text, allData);

    const systemPrompt = `${getSystemPrompt()}

${baseCtx}
${detailCtx}

HISTORIAL:
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