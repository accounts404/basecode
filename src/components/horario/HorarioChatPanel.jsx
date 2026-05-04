import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { MessageSquare, X, Send, Loader2, Bot, ChevronDown } from "lucide-react";
import ReactMarkdown from "react-markdown";

export default function HorarioChatPanel() {
    const [isOpen, setIsOpen] = useState(false);
    const [conversation, setConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        if (isOpen && !conversation) {
            initConversation();
        }
    }, [isOpen]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const initConversation = async () => {
        const conv = await base44.agents.createConversation({
            agent_name: "horario_asistente",
            metadata: { name: "Consulta de Horario" }
        });
        setConversation(conv);
        setMessages(conv.messages || []);

        base44.agents.subscribeToConversation(conv.id, (data) => {
            setMessages([...(data.messages || [])]);
        });
    };

    const handleSend = async () => {
        if (!input.trim() || sending || !conversation) return;
        const text = input.trim();
        setInput("");
        setSending(true);
        try {
            await base44.agents.addMessage(conversation, { role: "user", content: text });
        } finally {
            setSending(false);
            inputRef.current?.focus();
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const visibleMessages = messages.filter(m => m.role === "user" || m.role === "assistant");
    const lastMsg = messages[messages.length - 1];
    const isStreaming = lastMsg?.role === "assistant" && lastMsg?.status === "streaming";

    return (
        <>
            {/* Floating button */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-full shadow-xl transition-all duration-200 hover:scale-105"
                >
                    <Bot className="w-5 h-5" />
                    <span className="text-sm font-semibold">Asistente Horario</span>
                </button>
            )}

            {/* Chat panel */}
            {isOpen && (
                <div className="fixed bottom-6 right-6 z-50 w-96 max-w-[calc(100vw-2rem)] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
                    style={{ height: "520px" }}>
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-blue-600 text-white flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <Bot className="w-5 h-5" />
                            <div>
                                <p className="text-sm font-bold leading-tight">Asistente de Horario</p>
                                <p className="text-xs text-blue-200">Australia/Melbourne</p>
                            </div>
                        </div>
                        <button onClick={() => setIsOpen(false)} className="hover:bg-blue-700 rounded-lg p-1 transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
                        {!conversation && (
                            <div className="flex items-center justify-center h-full">
                                <div className="text-center text-slate-400">
                                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                                    <p className="text-xs">Iniciando asistente...</p>
                                </div>
                            </div>
                        )}

                        {conversation && visibleMessages.length === 0 && (
                            <div className="text-center py-6">
                                <Bot className="w-10 h-10 text-blue-300 mx-auto mb-3" />
                                <p className="text-sm font-medium text-slate-600">¡Hola! Soy tu asistente de horarios.</p>
                                <p className="text-xs text-slate-400 mt-1 mb-4">Pregúntame sobre servicios, limpiadores o disponibilidad.</p>
                                <div className="space-y-2">
                                    {["¿Qué servicios hay hoy?", "¿Cuántos servicios hay esta semana?", "¿Qué limpiadores trabajan mañana?"].map(q => (
                                        <button key={q} onClick={() => { setInput(q); inputRef.current?.focus(); }}
                                            className="block w-full text-left text-xs bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 rounded-lg px-3 py-2 text-slate-600 transition-colors">
                                            {q}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {visibleMessages.map((msg, i) => (
                            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                                {msg.role === "assistant" && (
                                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center mr-2 flex-shrink-0 mt-0.5">
                                        <Bot className="w-3.5 h-3.5 text-blue-600" />
                                    </div>
                                )}
                                <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                                    msg.role === "user"
                                        ? "bg-blue-600 text-white rounded-br-sm"
                                        : "bg-white border border-slate-200 text-slate-800 rounded-bl-sm shadow-sm"
                                }`}>
                                    {msg.role === "assistant" ? (
                                        <ReactMarkdown
                                            className="prose prose-xs max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 prose-table:text-xs"
                                            components={{
                                                table: ({children}) => <div className="overflow-x-auto"><table className="text-xs border-collapse w-full">{children}</table></div>,
                                                th: ({children}) => <th className="border border-slate-200 px-2 py-1 bg-slate-50 font-semibold text-left">{children}</th>,
                                                td: ({children}) => <td className="border border-slate-200 px-2 py-1">{children}</td>,
                                                p: ({children}) => <p className="my-1 leading-relaxed text-xs">{children}</p>,
                                                ul: ({children}) => <ul className="my-1 ml-3 list-disc text-xs">{children}</ul>,
                                                li: ({children}) => <li className="my-0.5">{children}</li>,
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

                        {isStreaming && (
                            <div className="flex justify-start">
                                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center mr-2 flex-shrink-0">
                                    <Bot className="w-3.5 h-3.5 text-blue-600" />
                                </div>
                                <div className="bg-white border border-slate-200 rounded-xl rounded-bl-sm px-3 py-2 shadow-sm">
                                    <div className="flex gap-1">
                                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{animationDelay:'0ms'}}/>
                                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{animationDelay:'150ms'}}/>
                                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{animationDelay:'300ms'}}/>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="flex-shrink-0 p-3 bg-white border-t border-slate-200">
                        <div className="flex gap-2">
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Pregunta sobre el horario..."
                                rows={1}
                                className="flex-1 resize-none border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent"
                                style={{ maxHeight: "80px" }}
                                disabled={!conversation || sending}
                            />
                            <Button
                                onClick={handleSend}
                                disabled={!input.trim() || sending || !conversation}
                                size="sm"
                                className="bg-blue-600 hover:bg-blue-700 rounded-xl px-3 self-end"
                            >
                                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            </Button>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1.5 text-center">Enter para enviar · Shift+Enter nueva línea</p>
                    </div>
                </div>
            )}
        </>
    );
}