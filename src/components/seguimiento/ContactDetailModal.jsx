import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Phone, Mail, Eye, MessageSquare, CheckCircle, XCircle, Plus } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

const interactionLabels = {
  visit: { label: 'Visita', icon: Eye, color: 'bg-blue-100 text-blue-800', dot: 'bg-blue-500' },
  call: { label: 'Llamada', icon: Phone, color: 'bg-green-100 text-green-800', dot: 'bg-green-500' },
  message: { label: 'Mensaje', icon: MessageSquare, color: 'bg-purple-100 text-purple-800', dot: 'bg-purple-500' },
  email: { label: 'Email', icon: Mail, color: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  other: { label: 'Otro', icon: Eye, color: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400' },
};

const frequencyLabels = {
  weekly: 'Semanal', fortnightly: 'Quincenal', every_3_weeks: 'Cada 3 sem.',
  monthly: 'Mensual', one_off: 'Único',
};

function TimelineItem({ log, onReply, onNoReply }) {
  const config = interactionLabels[log.interaction_type] || interactionLabels.other;
  const Icon = config.icon;
  const pendingReply = (log.interaction_type === 'message' || log.interaction_type === 'email') && !log.replied;

  return (
    <div className="flex gap-3">
      {/* Dot + line */}
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${config.color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="w-0.5 bg-slate-200 flex-1 mt-1 min-h-[16px]" />
      </div>

      {/* Content */}
      <div className="flex-1 pb-4">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <Badge className={`text-xs ${config.color}`}>{config.label}</Badge>
          <span className="text-xs text-slate-400">
            {format(parseISO(log.interaction_date), "d 'de' MMMM yyyy", { locale: es })}
          </span>
          {log.logged_by && (
            <span className="text-xs text-slate-400">· por {log.logged_by}</span>
          )}
        </div>

        {log.comments && (
          <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-700 mb-2 border border-slate-100">
            {log.comments}
          </div>
        )}

        {/* Conversación (mensaje/email) */}
        {log.conversation_text && (
          <div className="mb-2 space-y-1">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Conversación</p>
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-slate-700 whitespace-pre-wrap">
              {log.conversation_text}
            </div>
          </div>
        )}

        {/* Fotos de visita */}
        {log.visit_photos?.length > 0 && (
          <div className="mb-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Fotos</p>
            <div className="flex gap-2 flex-wrap">
              {log.visit_photos.map((photo, i) => (
                <a key={i} href={photo.url} target="_blank" rel="noopener noreferrer">
                  <img
                    src={photo.url}
                    alt={photo.comment || `Foto ${i + 1}`}
                    className="w-20 h-20 object-cover rounded-lg border border-slate-200 hover:opacity-80 transition-opacity"
                  />
                  {photo.comment && <p className="text-xs text-slate-500 mt-0.5 w-20 truncate">{photo.comment}</p>}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Respuesta del cliente */}
        {log.replied && log.reply_comments && (
          <div className="bg-green-50 border border-green-100 rounded-lg p-3 mb-2">
            <p className="text-xs font-semibold text-green-700 mb-1">↩ Respuesta del cliente</p>
            <p className="text-sm text-green-800 whitespace-pre-wrap">{log.reply_comments}</p>
            {log.reply_date && (
              <p className="text-xs text-green-500 mt-1">
                {format(parseISO(log.reply_date), "d 'de' MMMM yyyy", { locale: es })}
              </p>
            )}
          </div>
        )}

        {log.replied && !log.reply_comments && (
          <p className="text-xs text-slate-400 italic">✓ Cerrado sin respuesta</p>
        )}

        {pendingReply && (
          <div className="flex gap-2 mt-1">
            <Button size="sm" variant="outline" className="h-6 text-xs text-green-700 border-green-300 hover:bg-green-50"
              onClick={() => onReply(log)}>
              <CheckCircle className="w-3 h-3 mr-1" /> Respondió
            </Button>
            <Button size="sm" variant="outline" className="h-6 text-xs text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => onNoReply(log)}>
              <XCircle className="w-3 h-3 mr-1" /> Sin respuesta
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ContactDetailModal({ client, logs, onClose, onNewContact, onReply, onNoReply }) {
  if (!client) return null;
  const clientLogs = logs.filter(l => l.client_id === client.id);

  return (
    <Dialog open={!!client} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-9 h-9 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">
              {client.name?.charAt(0).toUpperCase()}
            </div>
            <div>
              <p>{client.name}</p>
              <p className="text-xs font-normal text-slate-500">
                {frequencyLabels[client.service_frequency] || client.service_frequency}
                {client.assigned_to && ` · Responsable: ${client.assigned_to}`}
              </p>
            </div>
          </DialogTitle>
          <DialogDescription className="flex gap-4 flex-wrap mt-1">
            {client.mobile_number && (
              <span className="flex items-center gap-1 text-xs"><Phone className="w-3 h-3" />{client.mobile_number}</span>
            )}
            {client.email && (
              <span className="flex items-center gap-1 text-xs"><Mail className="w-3 h-3" />{client.email}</span>
            )}
            {client.address && <span className="text-xs">{client.address}</span>}
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-slate-700">
              Línea de tiempo ({clientLogs.length} contacto{clientLogs.length !== 1 ? 's' : ''})
            </p>
            <Button size="sm" onClick={() => { onClose(); onNewContact(client); }} className="bg-blue-600 hover:bg-blue-700 h-7 text-xs">
              <Plus className="w-3 h-3 mr-1" /> Nuevo contacto
            </Button>
          </div>

          {clientLogs.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Sin contactos registrados todavía.</p>
            </div>
          ) : (
            <div className="mt-2">
              {clientLogs.map(log => (
                <TimelineItem key={log.id} log={log} onReply={onReply} onNoReply={onNoReply} />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}