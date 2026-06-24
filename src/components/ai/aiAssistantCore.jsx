import { base44 } from "@/api/base44Client";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";

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

const CACHE_KEY = 'redoak_ia_data';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos

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

export async function loadAllData() {
  const [clients, allClients, users, schedules, workEntries, feedback, invoices] = await Promise.all([
    fetchAll(base44.entities.Client, { active: true }, '-created_date'),
    fetchAll(base44.entities.Client, null, '-created_date'),
    base44.entities.User.list('-created_date', 100),
    fetchAll(base44.entities.Schedule, null, 'start_time'),
    fetchAll(base44.entities.WorkEntry, null, '-work_date'),
    fetchAll(base44.entities.ClientFeedback, null, '-feedback_date'),
    fetchAll(base44.entities.Invoice, null, '-created_date'),
  ]);
  const cleanerMap = {};
  users.forEach(u => { cleanerMap[u.id] = u.full_name; });
  const data = { clients, allClients, users, schedules, workEntries, feedback, invoices, cleanerMap };
  setCachedData(data);
  return data;
}

export function buildDataStats(data) {
  const allSched = data.schedules;
  const minDate = allSched.length ? allSched.reduce((m, s) => s.start_time < m ? s.start_time : m, allSched[0].start_time).slice(0, 10) : '?';
  const maxDate = allSched.length ? allSched.reduce((m, s) => s.start_time > m ? s.start_time : m, allSched[0].start_time).slice(0, 10) : '?';
  return `✅ ${data.schedules.length} servicios (${minDate} → ${maxDate}) · ${data.workEntries.length} work entries · ${data.clients.length} clientes`;
}

export function buildBaseContext(data) {
  const { clients, users, schedules, workEntries, feedback, invoices, cleanerMap } = data;
  const now = new Date();
  const today = format(now, 'yyyy-MM-dd');
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');

  const cleaners = users.filter(u => u.role !== 'admin');
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
Datos cargados: ${schedules.length} servicios totales, ${workEntries.length} work entries, ${clients.length} clientes activos

🔴 SERVICIOS PRÓXIMOS (${upcoming.length} total, mostrando próximos 50):
${upcoming.slice(0, 50).map(fmtS).join('\n') || 'Ninguno.'}

📅 SERVICIOS PASADOS ESTE MES (${pastMonth.length} total, mostrando últimos 40):
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

export function buildDetailedContext(query, data) {
  const { clients, allClients, schedules, workEntries, feedback, cleanerMap, users } = data;
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
- Notas admin: ${client.admin_notes || 'N/A'}
${client.price_history?.length ? `- Historial precios: ${client.price_history.map(p => `$${p.previous_price}→$${p.new_price} (${p.effective_date})`).join(' | ')}` : ''}

SERVICIOS (${cSched.length} total):
${cSched.map(s => {
      const d = fmtDT(s.start_time);
      const e = fmtTime(s.end_time);
      const n = (s.cleaner_ids || []).map(id => cleanerMap[id] || id).join(', ');
      return `- ${d}-${e} | ${s.status} | [${n}]`;
    }).join('\n') || 'Sin servicios.'}

WORK ENTRIES (${cWork.length} total):
${cWork.map(w => `- ${w.work_date}: ${w.hours}h x $${w.hourly_rate || 0} = $${w.total_amount || 0} (${w.cleaner_name || '?'})`).join('\n') || 'Sin entradas.'}

FEEDBACK (${cFeed.length}):
${cFeed.map(f => `- ${f.feedback_date}: ${f.feedback_type} | "${f.description || ''}" | Acción: ${f.action_taken || 'N/A'}`).join('\n') || 'Sin feedback.'}
`;
  }

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

export async function sendAIMessage({ text, messages, allData, activeConvId, setMessages, setLoading, setSavingMsg, setActiveConvId, setConversations }) {
  if (!text.trim() || !allData) return;

  const userMsg = { role: "user", content: text, timestamp: new Date().toISOString() };
  const newMessages = [...messages, userMsg];
  setMessages(newMessages);
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