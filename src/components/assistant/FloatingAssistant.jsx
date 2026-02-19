import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bot, X, Send, Minimize2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';

const TypingIndicator = () => (
  <div className="flex gap-2 justify-start">
    <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center flex-shrink-0">
      <span className="text-white text-[10px] font-bold">RO</span>
    </div>
    <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-3 py-2 shadow-sm">
      <div className="flex gap-1 items-center h-3">
        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  </div>
);

const MessageBubble = ({ message }) => {
  const isUser = message.role === 'user';
  if (!message.content && !message.tool_calls?.length) return null;
  if (message.role === 'tool') return null;

  return (
    <div className={cn("flex gap-2", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="text-white text-[10px] font-bold">RO</span>
        </div>
      )}
      {message.content && (
        <div className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm",
          isUser
            ? "bg-blue-600 text-white rounded-br-sm"
            : "bg-white border border-slate-200 rounded-bl-sm text-slate-800"
        )}>
          {isUser ? (
            <p className="leading-relaxed">{message.content}</p>
          ) : (
            <ReactMarkdown
              className="prose prose-xs prose-slate max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 text-sm"
              components={{
                p: ({ children }) => <p className="my-0.5 leading-relaxed">{children}</p>,
                ul: ({ children }) => <ul className="my-0.5 ml-3 list-disc space-y-0">{children}</ul>,
                ol: ({ children }) => <ol className="my-0.5 ml-3 list-decimal space-y-0">{children}</ol>,
                li: ({ children }) => <li className="my-0 text-xs">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                h1: ({ children }) => <p className="font-bold">{children}</p>,
                h2: ({ children }) => <p className="font-bold">{children}</p>,
                h3: ({ children }) => <p className="font-semibold">{children}</p>,
                code: ({ inline, children }) => inline
                  ? <code className="px-1 rounded bg-slate-100 text-xs font-mono">{children}</code>
                  : <pre className="bg-slate-800 text-slate-100 rounded p-2 text-xs overflow-x-auto my-1"><code>{children}</code></pre>,
              }}
            >
              {message.content}
            </ReactMarkdown>
          )}
        </div>
      )}
    </div>
  );
};

const QUICK_SUGGESTIONS_ADMIN = [
  "¿Qué servicios hay hoy?",
  "Resumen del día",
  "Reportes pendientes",
];

const QUICK_SUGGESTIONS_CLEANER = [
  "¿Qué tengo hoy?",
  "Instrucciones de acceso",
  "¿Hay mascotas hoy?",
];

export default function FloatingAssistant({ user }) {
  const [open, setOpen] = useState(false);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const unsubscribeRef = useRef(null);

  const isAdmin = user?.role === 'admin';
  const agentName = isAdmin ? 'admin_assistant' : 'cleaner_assistant';
  const suggestions = isAdmin ? QUICK_SUGGESTIONS_ADMIN : QUICK_SUGGESTIONS_CLEANER;

  useEffect(() => {
    if (open && !conversation) {
      initConversation();
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [messages, open]);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  const initConversation = async () => {
    setInitializing(true);
    try {
      const conv = await base44.agents.createConversation({
        agent_name: agentName,
        metadata: { name: 'Chat rápido' }
      });
      setConversation(conv);
      setMessages(conv.messages || []);

      if (unsubscribeRef.current) unsubscribeRef.current();
      unsubscribeRef.current = base44.agents.subscribeToConversation(conv.id, (data) => {
        setMessages([...(data.messages || [])]);
      });
    } catch (e) {
      console.error('Error init conversation:', e);
    } finally {
      setInitializing(false);
    }
  };

  const sendMessage = async (text) => {
    const msg = text || input.trim();
    if (!msg || sending || !conversation) return;
    setInput('');
    setSending(true);
    try {
      await base44.agents.addMessage(conversation, { role: 'user', content: msg });
    } catch (e) {
      console.error('Error sending:', e);
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleClose = () => {
    setOpen(false);
  };

  const visibleMessages = messages.filter(m => m.role === 'user' || m.role === 'assistant');
  const isTyping = visibleMessages.length > 0 && visibleMessages[visibleMessages.length - 1]?.role === 'user' && (sending || true) && messages[messages.length - 1]?.role === 'user';

  return (
    <>
      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-20 right-4 z-50 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
          style={{ height: '480px', maxHeight: 'calc(100vh - 100px)' }}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-white font-semibold text-sm leading-tight">Asistente RedOak</p>
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-300" />
                  <p className="text-blue-100 text-xs">{isAdmin ? 'Modo Admin' : 'Tu asistente'}</p>
                </div>
              </div>
            </div>
            <button onClick={handleClose} className="p-1 rounded-lg hover:bg-white/20 transition-colors">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50">
            {initializing ? (
              <div className="flex items-center justify-center h-full">
                <div className="flex flex-col items-center gap-2">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <p className="text-xs text-slate-400">Iniciando...</p>
                </div>
              </div>
            ) : visibleMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 px-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <p className="text-slate-600 text-sm text-center font-medium">
                  {isAdmin ? '¿Qué necesitas saber?' : '¿En qué te ayudo?'}
                </p>
                <div className="flex flex-col gap-1.5 w-full">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(s)}
                      className="text-left text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-all"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {visibleMessages.map((msg, idx) => (
                  <MessageBubble key={idx} message={msg} />
                ))}
                {isTyping && <TypingIndicator />}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-slate-200 bg-white flex-shrink-0">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Escribe tu pregunta..."
                className="text-sm rounded-xl border-slate-200 h-9"
                disabled={sending || initializing || !conversation}
              />
              <Button
                onClick={() => sendMessage()}
                disabled={!input.trim() || sending || initializing || !conversation}
                size="sm"
                className="rounded-xl h-9 w-9 p-0 bg-blue-600 hover:bg-blue-700 flex-shrink-0"
              >
                {sending ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "fixed bottom-4 right-4 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-200",
          open
            ? "bg-slate-700 hover:bg-slate-800 scale-90"
            : "bg-gradient-to-br from-blue-600 to-blue-700 hover:scale-110 hover:shadow-xl"
        )}
      >
        {open ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <>
            <Bot className="w-6 h-6 text-white" />
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-white" />
          </>
        )}
      </button>
    </>
  );
}