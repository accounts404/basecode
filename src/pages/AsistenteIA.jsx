import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Bot, Send, Loader2, Sparkles, BarChart3, Users, Calendar, TrendingUp, AlertTriangle, ClipboardList, RefreshCw, Plus, MessageSquare, ChevronLeft, ChevronRight, Trash } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { format } from "date-fns";
import { loadAllData, buildDataStats, buildBaseContext, buildDetailedContext, sendAIMessage } from "@/components/ai/aiAssistantCore";

const QUICK_PROMPTS = [
  { icon: BarChart3, label: "Resumen del mes", prompt: "Dame un resumen completo del negocio este mes: cantidad de servicios, ingresos estimados, clientes activos y cualquier dato relevante." },
  { icon: Users, label: "Rendimiento limpiadores", prompt: "Analiza el rendimiento de los limpiadores este mes: horas trabajadas, cantidad de servicios, y quiénes han trabajado más o menos." },
  { icon: AlertTriangle, label: "Quejas y feedback", prompt: "Muéstrame un análisis de las quejas y feedbacks de clientes recientes. ¿Hay patrones o limpiadores que necesiten atención?" },
  { icon: TrendingUp, label: "Análisis rentabilidad", prompt: "Analiza la rentabilidad del negocio: precios promedio por servicio, horas promedio, y qué clientes podrían necesitar ajuste de precios." },
  { icon: Calendar, label: "Servicios próximos", prompt: "¿Cómo se ve la carga de trabajo de esta semana y la próxima? Dame el detalle de cada día con clientes, horarios y limpiadores asignados." },
  { icon: ClipboardList, label: "Clientes sin servicio", prompt: "¿Hay clientes activos que no han tenido servicios en las últimas 2-3 semanas? Podría haber problemas de programación." },
];

const PAGE_SIZE = 20;

export default function AsistenteIA() {
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingMsg, setSavingMsg] = useState(false);
  const [contextLoaded, setContextLoaded] = useState(false);
  const [allData, setAllData] = useState(null);
  const [dataStats, setDataStats] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [page, setPage] = useState(1);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const messagesEndRef = useRef(null);

  useEffect(() => { loadData(); loadConversations(); }, []);

  useEffect(() => {
    if (activeConvId) {
      const conv = conversations.find(c => c.id === activeConvId);
      if (conv) { setMessages(conv.messages || []); setPage(1); }
    } else {
      setMessages([]); setPage(1);
    }
  }, [activeConvId]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(messages.length / PAGE_SIZE));
    if (page === totalPages) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const loadConversations = async () => {
    setLoadingConvs(true);
    const convs = await base44.entities.AIConversation.list('-last_message_at', 100);
    setConversations(convs);
    setLoadingConvs(false);
  };

  const loadData = async () => {
    setContextLoaded(false);
    try {
      const data = await loadAllData();
      setAllData(data);
      setDataStats(buildDataStats(data));
      setContextLoaded(true);
    } catch (err) {
      console.error("Error loading data:", err);
      setDataStats("Error cargando datos");
      setContextLoaded(true);
    }
  };

  const startNewConversation = () => { setActiveConvId(null); setMessages([]); setPage(1); };

  const openConversation = (conv) => {
    setActiveConvId(conv.id);
    setMessages(conv.messages || []);
    setPage(Math.max(1, Math.ceil((conv.messages || []).length / PAGE_SIZE)));
  };

  const deleteConversation = async (convId, e) => {
    e.stopPropagation();
    await base44.entities.AIConversation.delete(convId);
    if (activeConvId === convId) { setActiveConvId(null); setMessages([]); }
    setConversations(prev => prev.filter(c => c.id !== convId));
  };

  const handleSend = (text) => {
    if (!text.trim() || loading || !allData) return;
    setInput("");
    const newTotalPages = Math.max(1, Math.ceil((messages.length + 1) / PAGE_SIZE));
    setPage(newTotalPages);
    sendAIMessage({
      text,
      messages,
      allData,
      activeConvId,
      setMessages: (msgs) => {
        setMessages(msgs);
        setPage(Math.max(1, Math.ceil(msgs.length / PAGE_SIZE)));
      },
      setLoading,
      setSavingMsg,
      setActiveConvId,
      setConversations,
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(input); }
  };

  const totalPages = Math.max(1, Math.ceil(messages.length / PAGE_SIZE));
  const pagedMessages = messages.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="h-[calc(100vh-80px)] flex overflow-hidden">
      {/* Sidebar */}
      <div className={`flex flex-col border-r border-slate-200 bg-slate-50 transition-all duration-200 ${sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'}`}>
        <div className="p-3 border-b border-slate-200 flex items-center justify-between">
          <span className="font-semibold text-sm text-slate-700">Conversaciones</span>
          <Button size="sm" variant="outline" onClick={startNewConversation} className="h-7 text-xs px-2">
            <Plus className="w-3 h-3 mr-1" /> Nueva
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingConvs ? (
            <div className="flex items-center justify-center p-6 text-slate-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Cargando...
            </div>
          ) : conversations.length === 0 ? (
            <p className="text-slate-400 text-xs text-center p-4">No hay conversaciones guardadas</p>
          ) : conversations.map(conv => (
            <div
              key={conv.id}
              onClick={() => openConversation(conv)}
              className={`group flex items-start gap-2 p-3 cursor-pointer hover:bg-slate-100 border-b border-slate-100 transition-colors ${activeConvId === conv.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}`}
            >
              <MessageSquare className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-700 truncate">{conv.title || 'Sin título'}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {conv.messages?.length || 0} mensajes · {conv.last_message_at ? format(new Date(conv.last_message_at), 'dd/MM HH:mm') : ''}
                </p>
              </div>
              <button onClick={(e) => deleteConversation(conv.id, e)} className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-500 text-slate-400 transition-opacity">
                <Trash className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(o => !o)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
              <ChevronLeft className={`w-4 h-4 transition-transform ${sidebarOpen ? '' : 'rotate-180'}`} />
            </button>
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900">Asistente IA</h1>
              <p className="text-xs text-slate-500">
                {contextLoaded ? dataStats : "⏳ Cargando todos los datos..."}
                {savingMsg && ' · 💾 Guardando...'}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadData} disabled={!contextLoaded} title="Actualizar datos">
              <RefreshCw className="w-4 h-4" />
            </Button>
            {activeConvId && (
              <Button variant="outline" size="sm" onClick={startNewConversation}>
                <Plus className="w-4 h-4 mr-1" /> Nueva
              </Button>
            )}
          </div>
        </div>

        {/* Pagination controls (top) */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 py-2 bg-slate-50 border-b border-slate-200 text-sm">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-slate-600 text-xs">Página {page} de {totalPages} · {messages.length} mensajes</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 p-4 min-h-0">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mb-4">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-lg font-semibold text-slate-800 mb-1">¿En qué puedo ayudarte?</h2>
              <p className="text-sm text-slate-500 mb-6 text-center max-w-md">
                Tengo acceso a TODOS los datos: clientes, servicios, limpiadores, facturas y feedback.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full max-w-3xl">
                {QUICK_PROMPTS.map((qp, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(qp.prompt)}
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
            pagedMessages.map((msg, i) => (
              <div key={(page - 1) * PAGE_SIZE + i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 shadow-sm'
                }`}>
                  {msg.timestamp && (
                    <p className={`text-xs mb-1 ${msg.role === 'user' ? 'text-blue-200' : 'text-slate-400'}`}>
                      {format(new Date(msg.timestamp), 'dd/MM HH:mm')}
                    </p>
                  )}
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
        <div className="border-t border-slate-200 p-4 bg-white">
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
              onClick={() => handleSend(input)}
              disabled={!input.trim() || loading || !contextLoaded}
              className="h-11 w-11 p-0 bg-blue-600 hover:bg-blue-700 flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}