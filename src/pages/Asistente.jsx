import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Bot, Sparkles, RefreshCw, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import MessageBubble from '@/components/assistant/MessageBubble';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const ADMIN_SUGGESTIONS = [
  "¿Cuáles clientes tienen el servicio de hoy?",
  "¿Qué limpiadores no han facturado esta quincena?",
  "¿Cuántas horas trabajó cada limpiador esta semana?",
  "¿Cuáles clientes tienen precio por debajo del umbral mínimo?",
  "¿Qué servicios están pendientes de conciliar?",
  "Dame un resumen de los reportes de servicio pendientes",
];

const CLEANER_SUGGESTIONS = [
  "¿Qué tengo hoy?",
  "¿Con quién trabajo hoy?",
  "¿Qué llaves o accesos necesito para mis clientes de hoy?",
  "¿Qué se debe hacer en la cocina de mi primer cliente?",
  "¿Hay mascotas en las casas de hoy?",
  "¿Cuál es mi puntuación este mes?",
];

export default function AsistentePage() {
  const [user, setUser] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const isAdmin = user?.role === 'admin';
  const agentName = isAdmin ? 'admin_assistant' : 'cleaner_assistant';
  const suggestions = isAdmin ? ADMIN_SUGGESTIONS : CLEANER_SUGGESTIONS;

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (user) initConversation();
  }, [user]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadUser = async () => {
    try {
      const u = await base44.auth.me();
      setUser(u);
    } catch (e) {
      console.error('Error loading user:', e);
    }
  };

  const initConversation = async () => {
    setLoading(true);
    try {
      const conv = await base44.agents.createConversation({
        agent_name: agentName,
        metadata: {
          name: `Sesión ${format(new Date(), "d MMM yyyy HH:mm", { locale: es })}`,
        }
      });
      setConversation(conv);
      setMessages(conv.messages || []);

      const unsubscribe = base44.agents.subscribeToConversation(conv.id, (data) => {
        setMessages([...(data.messages || [])]);
      });

      return () => unsubscribe();
    } catch (e) {
      console.error('Error creating conversation:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleNewChat = async () => {
    setMessages([]);
    setConversation(null);
    await initConversation();
  };

  const sendMessage = async (text) => {
    const messageText = text || input.trim();
    if (!messageText || sending || !conversation) return;

    setInput('');
    setSending(true);

    try {
      await base44.agents.addMessage(conversation, {
        role: 'user',
        content: messageText,
      });
    } catch (e) {
      console.error('Error sending message:', e);
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const visibleMessages = messages.filter(m => m.role === 'user' || m.role === 'assistant');
  const isTyping = sending || (messages.length > 0 && messages[messages.length - 1]?.role === 'user');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-lg">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <p className="text-slate-500 text-sm">Iniciando asistente...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-sm">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-slate-900 text-base leading-tight">
              Asistente RedOak
            </h1>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <p className="text-xs text-slate-500">
                {isAdmin ? 'Modo Administrador · Acceso completo' : 'Modo Limpiador · Tu información personal'}
              </p>
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleNewChat}
          className="gap-1.5 text-slate-600 text-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Nueva conversación
        </Button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {visibleMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 pb-20">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center mx-auto mb-4 shadow-lg">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-1">
                {isAdmin ? '¿En qué te ayudo hoy?' : '¡Hola! ¿En qué te ayudo?'}
              </h2>
              <p className="text-slate-500 text-sm max-w-sm">
                {isAdmin
                  ? 'Puedo consultar clientes, limpiadores, horarios, rentabilidad y todo lo que necesites.'
                  : 'Puedo decirte qué tienes hoy, instrucciones de servicio, accesos y mucho más.'}
              </p>
            </div>

            {/* Suggestions */}
            <div className="w-full max-w-lg grid grid-cols-1 sm:grid-cols-2 gap-2">
              {suggestions.map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(suggestion)}
                  className="text-left px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-all shadow-sm"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {visibleMessages.map((message, idx) => (
              <MessageBubble key={idx} message={message} />
            ))}

            {/* Typing indicator */}
            {isTyping && visibleMessages[visibleMessages.length - 1]?.role === 'user' && (
              <div className="flex gap-3 justify-start">
                <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <span className="text-white text-xs font-bold">RO</span>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                  <div className="flex gap-1 items-center h-4">
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-white border-t border-slate-200 px-4 py-3 shadow-lg">
        {visibleMessages.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-2 scrollbar-hide">
            {suggestions.slice(0, 3).map((s, i) => (
              <button
                key={i}
                onClick={() => sendMessage(s)}
                disabled={sending}
                className="flex-shrink-0 text-xs px-3 py-1.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 rounded-full transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isAdmin ? "Pregunta sobre clientes, horarios, facturas..." : "Pregunta sobre tu horario, instrucciones, accesos..."}
            className="flex-1 rounded-xl border-slate-200 focus:border-blue-400 focus:ring-blue-400"
            disabled={sending || !conversation}
          />
          <Button
            onClick={() => sendMessage()}
            disabled={!input.trim() || sending || !conversation}
            className="rounded-xl bg-blue-600 hover:bg-blue-700 px-4"
          >
            {sending ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-slate-400 text-center mt-2">
          El asistente puede cometer errores. Verifica información importante.
        </p>
      </div>
    </div>
  );
}