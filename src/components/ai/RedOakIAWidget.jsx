import React, { useState, useRef, useEffect } from "react";
import { Bot, Send, Loader2, X, Minus, MessageSquare, Trash, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import ReactMarkdown from "react-markdown";
import { format } from "date-fns";
import { base44 } from "@/api/base44Client";
import { loadAllData, buildDataStats, getCachedData, clearCachedData } from "./aiAssistantCore";
import { sendAIMessage } from "./aiAssistantCore";

export default function RedOakIAWidget() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingMsg, setSavingMsg] = useState(false);
  const [allData, setAllData] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataStats, setDataStats] = useState("");
  const [loadedAt, setLoadedAt] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [showConvList, setShowConvList] = useState(false);
  const messagesEndRef = useRef(null);

  const doLoadData = (forceRefresh = false) => {
    if (!forceRefresh) {
      const cached = getCachedData();
      if (cached) {
        setAllData(cached.data);
        setDataStats(buildDataStats(cached.data));
        setLoadedAt(cached.loadedAt);
        return;
      }
    } else {
      clearCachedData();
    }
    setDataLoading(true);
    loadAllData().then(data => {
      setAllData(data);
      setDataStats(buildDataStats(data));
      setLoadedAt(Date.now());
      setDataLoading(false);
    }).catch(() => {
      setDataStats("Error cargando datos");
      setDataLoading(false);
    });
  };

  // Load data once when widget first opens
  useEffect(() => {
    if (open && !allData && !dataLoading) {
      doLoadData(false);
    }
    if (open && conversations.length === 0) {
      base44.entities.AIConversation.list('-last_message_at', 50).then(setConversations);
    }
  }, [open]);

  useEffect(() => {
    if (open && !minimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading]);

  const handleSend = () => {
    if (!input.trim() || loading || !allData) return;
    const text = input;
    setInput("");
    sendAIMessage({
      text,
      messages,
      allData,
      activeConvId,
      setMessages,
      setLoading,
      setSavingMsg,
      setActiveConvId,
      setConversations,
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const openConversation = (conv) => {
    setActiveConvId(conv.id);
    setMessages(conv.messages || []);
    setShowConvList(false);
  };

  const startNew = () => {
    setActiveConvId(null);
    setMessages([]);
    setShowConvList(false);
  };

  const deleteConv = async (convId, e) => {
    e.stopPropagation();
    await base44.entities.AIConversation.delete(convId);
    setConversations(prev => prev.filter(c => c.id !== convId));
    if (activeConvId === convId) startNew();
  };

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => { setOpen(true); setMinimized(false); }}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl shadow-2xl text-white font-semibold text-sm transition-all hover:scale-105 active:scale-95"
          style={{ background: "linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%)" }}
        >
          <Bot className="w-5 h-5" />
          RedOak IA
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 transition-all duration-200 ${
            minimized ? 'w-72 h-14' : 'w-96 h-[560px]'
          }`}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 rounded-t-2xl cursor-pointer select-none"
            style={{ background: "linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%)" }}
            onClick={() => setMinimized(m => !m)}
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-white font-bold text-sm leading-tight">RedOak IA</p>
                <p className="text-blue-100 text-xs leading-tight truncate max-w-[200px]">
                  {dataLoading ? "⏳ Cargando datos..." : dataStats || (loadedAt ? `Datos de hace ${Math.round((Date.now() - loadedAt) / 60000)} min` : "")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => doLoadData(true)}
                className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors"
                title="Actualizar datos"
                disabled={dataLoading}
              >
                <RefreshCw className={`w-4 h-4 ${dataLoading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setShowConvList(s => !s)}
                className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors"
                title="Conversaciones"
              >
                <MessageSquare className="w-4 h-4" />
              </button>
              <button
                onClick={() => setMinimized(m => !m)}
                className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors"
              >
                <Minus className="w-4 h-4" />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {!minimized && (
            <>
              {/* Conversation list overlay */}
              {showConvList && (
                <div className="absolute top-14 left-0 right-0 bottom-0 bg-white rounded-b-2xl z-10 flex flex-col">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                    <span className="text-xs font-semibold text-slate-600">Conversaciones guardadas</span>
                    <button
                      onClick={startNew}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      <Plus className="w-3 h-3" /> Nueva
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {conversations.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center p-4">Sin conversaciones aún</p>
                    ) : conversations.map(conv => (
                      <div
                        key={conv.id}
                        onClick={() => openConversation(conv)}
                        className={`group flex items-start gap-2 px-3 py-2.5 cursor-pointer hover:bg-slate-50 border-b border-slate-50 ${activeConvId === conv.id ? 'bg-blue-50' : ''}`}
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-700 truncate">{conv.title || 'Sin título'}</p>
                          <p className="text-xs text-slate-400">
                            {conv.messages?.length || 0} msgs · {conv.last_message_at ? format(new Date(conv.last_message_at), 'dd/MM HH:mm') : ''}
                          </p>
                        </div>
                        <button
                          onClick={(e) => deleteConv(conv.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-500 text-slate-400"
                        >
                          <Trash className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mb-3">
                      <Bot className="w-6 h-6 text-white" />
                    </div>
                    <p className="text-sm font-semibold text-slate-800">¿En qué puedo ayudarte?</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {dataLoading ? "Cargando datos del sistema..." : "Preguntá sobre clientes, servicios, limpiadores o cualquier dato del negocio."}
                    </p>
                  </div>
                ) : (
                  messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-50 border border-slate-200 text-slate-800'
                      }`}>
                        {msg.role === 'user' ? (
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        ) : (
                          <div className="prose prose-xs max-w-none prose-headings:text-slate-900 prose-p:text-slate-700 prose-li:text-slate-700 prose-strong:text-slate-900 prose-p:my-1 prose-headings:my-1">
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Analizando...
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="border-t border-slate-100 p-3">
                <div className="flex gap-2 items-end">
                  <Textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Preguntá cualquier cosa..."
                    className="resize-none min-h-[36px] max-h-[80px] text-xs"
                    rows={1}
                    disabled={loading || dataLoading}
                  />
                  <Button
                    onClick={handleSend}
                    disabled={!input.trim() || loading || dataLoading || !allData}
                    className="h-9 w-9 p-0 bg-blue-600 hover:bg-blue-700 flex-shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}