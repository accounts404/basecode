import { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Send, Bot, Loader2, ChevronDown } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";

export default function ScheduleAdvisorChat() {
  const [open, setOpen] = useState(false);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const unsubscribeRef = useRef(null);
  const conversationRef = useRef(null);

  // Scroll al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Abrir/cerrar chat
  useEffect(() => {
    if (open && !conversationRef.current) {
      initConversation();
    }
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  const initConversation = async () => {
    setInitializing(true);
    try {
      const conv = await base44.agents.createConversation({
        agent_name: "schedule_advisor",
        metadata: { name: "Asesor de Horarios" },
      });

      conversationRef.current = conv;
      setConversation(conv);

      // Suscribirse a actualizaciones en tiempo real
      unsubscribeRef.current = base44.agents.subscribeToConversation(conv.id, (data) => {
        setMessages(data.messages || []);
      });

      // Mensaje inicial automático
      await base44.agents.addMessage(conv, {
        role: "user",
        content: "Hola! Soy el administrador de RedOak. Dame un resumen rápido del estado del horario de esta semana: servicios sin equipo asignado, cobertura general y cualquier problema que detectes.",
      });
    } catch (err) {
      console.error("[ScheduleAdvisor] Error iniciando conversación:", err);
    } finally {
      setInitializing(false);
    }
  };

  const sendMessage = useCallback(async () => {
    const conv = conversationRef.current;
    if (!input.trim() || sending || !conv) return;

    const text = input.trim();
    setInput("");
    setSending(true);

    try {
      await base44.agents.addMessage(conv, { role: "user", content: text });
    } catch (err) {
      console.error("[ScheduleAdvisor] Error enviando mensaje:", err);
    } finally {
      setSending(false);
    }
  }, [input, sending]);

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // El agente está escribiendo si el último mensaje es del user (esperando respuesta)
  // O si hay un mensaje del assistant con content vacío/null (streaming)
  const lastMsg = messages[messages.length - 1];
  const agentIsTyping =
    sending ||
    (lastMsg?.role === "user") ||
    (lastMsg?.role === "assistant" && !lastMsg?.content);

  // Solo mostrar typing cuando realmente esperamos respuesta
  const showTyping = sending || (messages.length > 0 && lastMsg?.role === "user");

  const isInputDisabled = sending || initializing || !conversation;

  return (
    <>
      {/* Burbuja flotante animada */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: [1, 1.08, 1],
              opacity: 1,
              y: [0, -6, 0],
            }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{
              scale: { duration: 2, repeat: Infinity, repeatType: "loop", ease: "easeInOut" },
              y: { duration: 2, repeat: Infinity, repeatType: "loop", ease: "easeInOut" },
              opacity: { duration: 0.2 },
            }}
            onClick={() => setOpen(true)}
            className="fixed bottom-6 right-6 z-50 w-16 h-16 rounded-full shadow-2xl flex items-center justify-center cursor-pointer"
            style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}
          >
            <Bot className="w-8 h-8 text-white" />
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-green-400 rounded-full border-2 border-white animate-pulse" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Panel de chat */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 40 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="fixed bottom-6 right-6 z-50 w-96 max-w-[calc(100vw-2rem)] h-[520px] flex flex-col rounded-2xl shadow-2xl overflow-hidden"
            style={{ background: "#fff" }}
          >
            {/* Header */}
            <div
              className="flex items-center gap-3 px-4 py-3 text-white flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}
            >
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-sm">Asesor de Horarios</p>
                <p className="text-xs text-orange-100">Solo lectura · RedOak AI</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <ChevronDown className="w-5 h-5" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">

              {/* Estado inicializando */}
              {initializing && (
                <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
                  <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
                  <span>Conectando con el asesor...</span>
                </div>
              )}

              {/* Mensajes — filtramos tool_calls y mensajes sin content */}
              {messages
                .filter(msg => msg.role === "user" || (msg.role === "assistant" && msg.content))
                .map((msg, i) => (
                  <div
                    key={msg.id || i}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.role === "assistant" && (
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mr-2 mt-0.5"
                        style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}
                      >
                        <Bot className="w-4 h-4 text-white" />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                        msg.role === "user"
                          ? "bg-orange-500 text-white rounded-tr-sm"
                          : "bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-sm"
                      }`}
                    >
                      {msg.role === "assistant" ? (
                        <ReactMarkdown
                          className="prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                          components={{
                            p: ({ children }) => <p className="my-1 leading-snug">{children}</p>,
                            ul: ({ children }) => <ul className="my-1 ml-3 list-disc">{children}</ul>,
                            ol: ({ children }) => <ol className="my-1 ml-3 list-decimal">{children}</ol>,
                            li: ({ children }) => <li className="my-0">{children}</li>,
                            strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      ) : (
                        <p>{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))}

              {/* Indicador de escritura del agente */}
              {showTyping && (
                <div className="flex items-center gap-2">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}
                  >
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm">
                    <div className="flex gap-1 items-center h-4">
                      <span className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-2 h-2 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="flex-shrink-0 border-t border-slate-200 bg-white p-3 flex items-center gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                disabled={isInputDisabled}
                placeholder={initializing ? "Iniciando..." : "Preguntá sobre el horario..."}
                className="flex-1 text-sm bg-slate-100 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-50"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || isInputDisabled}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-white disabled:opacity-40 transition-opacity flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}