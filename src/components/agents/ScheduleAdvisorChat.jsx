import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { X, Send, Bot, Loader2, ChevronDown } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";

export default function ScheduleAdvisorChat() {
  const [open, setOpen] = useState(false);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    if (open && !conversation) {
      initConversation();
    }
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  const initConversation = async () => {
    setLoading(true);
    const conv = await base44.agents.createConversation({
      agent_name: "schedule_advisor",
      metadata: { name: "Asesor de Horarios" },
    });
    setConversation(conv);

    base44.agents.subscribeToConversation(conv.id, (data) => {
      setMessages(data.messages || []);
    });

    // Mensaje de bienvenida automático
    await base44.agents.addMessage(conv, {
      role: "user",
      content: "Hola! Estoy planificando el horario. ¿Qué podés ver sobre la cobertura actual?",
    });

    setLoading(false);
  };

  const sendMessage = async () => {
    if (!input.trim() || sending || !conversation) return;
    const text = input.trim();
    setInput("");
    setSending(true);
    await base44.agents.addMessage(conversation, { role: "user", content: text });
    setSending(false);
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const isTyping = messages.length > 0 && messages[messages.length - 1]?.role === "user" && !sending === false;
  const lastMsg = messages[messages.length - 1];
  const agentIsWriting = lastMsg?.role === "assistant" && !lastMsg?.content;

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
              {loading && (
                <div className="flex items-center gap-2 text-slate-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Iniciando asesor...
                </div>
              )}

              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "assistant" && (
                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mr-2 mt-0.5"
                      style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}>
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
                        className="prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 prose-p:my-1 prose-ul:my-1 prose-li:my-0"
                        components={{
                          p: ({ children }) => <p className="my-1 leading-snug">{children}</p>,
                          ul: ({ children }) => <ul className="my-1 ml-3 list-disc">{children}</ul>,
                          li: ({ children }) => <li className="my-0">{children}</li>,
                        }}
                      >
                        {msg.content || "..."}
                      </ReactMarkdown>
                    ) : (
                      <p>{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {(sending || agentIsWriting) && (
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}>
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-2 shadow-sm">
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
                placeholder="Preguntá sobre el horario..."
                className="flex-1 text-sm bg-slate-100 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-orange-300 resize-none"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || sending}
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