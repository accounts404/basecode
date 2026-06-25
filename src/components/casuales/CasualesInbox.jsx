import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageCircle, Send, Check, Loader2, Phone } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { sendBulkCasualSMS } from '@/functions/sendBulkCasualSMS';

export default function CasualesInbox({ casuals, messages, onRefresh }) {
  const [replying, setReplying] = useState({}); // { casualId: text }
  const [sending, setSending] = useState(null);
  const [openThread, setOpenThread] = useState(null);

  // Build threads: only casuals that have incoming messages
  const threads = casuals
    .map(c => {
      const msgs = (messages[c.id] || []).slice().sort((a, b) =>
        new Date(a.created_date) - new Date(b.created_date)
      );
      const lastMsg = msgs[msgs.length - 1];
      const unread = c.unread_replies || 0;
      return { casual: c, msgs, lastMsg, unread };
    })
    .filter(t => t.msgs.length > 0)
    .sort((a, b) => new Date(b.lastMsg?.created_date || 0) - new Date(a.lastMsg?.created_date || 0));

  const markAsRead = async (casual) => {
    if ((casual.unread_replies || 0) === 0) return;
    await base44.entities.CasualCleaner.update(casual.id, { unread_replies: 0 });
    onRefresh();
  };

  const handleOpenThread = (casualId) => {
    setOpenThread(prev => prev === casualId ? null : casualId);
    const thread = threads.find(t => t.casual.id === casualId);
    if (thread) markAsRead(thread.casual);
  };

  const handleReply = async (casual) => {
    const text = replying[casual.id]?.trim();
    if (!text) return;
    setSending(casual.id);
    try {
      await sendBulkCasualSMS({ casual_ids: [casual.id], message: text });
      setReplying(prev => ({ ...prev, [casual.id]: '' }));
      onRefresh();
    } catch (e) {
      console.error(e);
    }
    setSending(null);
  };

  const totalUnread = threads.reduce((sum, t) => sum + t.unread, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-4">
        <MessageCircle className="w-5 h-5 text-violet-600" />
        <h2 className="font-bold text-slate-800">Bandeja de Mensajes</h2>
        {totalUnread > 0 && (
          <Badge className="bg-red-500 text-white">{totalUnread} sin leer</Badge>
        )}
      </div>

      {threads.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No hay mensajes todavía.</p>
          <p className="text-xs mt-1">Los replies de SMS aparecerán aquí automáticamente.</p>
        </div>
      ) : threads.map(({ casual, msgs, lastMsg, unread }) => (
        <div key={casual.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden ${unread > 0 ? 'border-violet-400' : 'border-slate-200'}`}>
          {/* Thread header */}
          <button
            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 text-left transition-colors"
            onClick={() => handleOpenThread(casual.id)}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${unread > 0 ? 'bg-violet-600' : 'bg-slate-400'}`}>
              {casual.full_name?.charAt(0)?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900 text-sm">{casual.full_name}</span>
                {unread > 0 && <Badge className="bg-red-500 text-white text-[10px] px-1.5 py-0">{unread}</Badge>}
              </div>
              <p className={`text-xs truncate mt-0.5 ${lastMsg?.direction === 'incoming' ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>
                {lastMsg?.direction === 'outgoing' ? '↗ ' : '↙ '}{lastMsg?.content}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <span className="text-[10px] text-slate-400">
                {lastMsg ? format(new Date(lastMsg.created_date), 'd MMM HH:mm', { locale: es }) : ''}
              </span>
              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                <Phone className="w-3 h-3" />{casual.phone_number}
              </span>
            </div>
          </button>

          {/* Thread messages */}
          {openThread === casual.id && (
            <div className="border-t border-slate-100">
              <div className="max-h-64 overflow-y-auto p-4 space-y-2 bg-slate-50">
                {msgs.map(msg => (
                  <div key={msg.id} className={`flex ${msg.direction === 'outgoing' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${
                      msg.direction === 'outgoing'
                        ? 'bg-violet-600 text-white rounded-br-sm'
                        : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'
                    }`}>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      <p className={`text-[10px] mt-0.5 ${msg.direction === 'outgoing' ? 'text-violet-200' : 'text-slate-400'}`}>
                        {format(new Date(msg.created_date), 'd MMM HH:mm', { locale: es })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {/* Reply box */}
              <div className="p-3 flex gap-2 border-t border-slate-100 bg-white">
                <Input
                  value={replying[casual.id] || ''}
                  onChange={e => setReplying(prev => ({ ...prev, [casual.id]: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleReply(casual)}
                  placeholder={`Responder a ${casual.full_name}...`}
                  className="flex-1 text-sm"
                />
                <Button
                  size="sm"
                  onClick={() => handleReply(casual)}
                  disabled={sending === casual.id || !replying[casual.id]?.trim()}
                  className="bg-violet-600 hover:bg-violet-700"
                >
                  {sending === casual.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}