import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Phone, Mail, Eye, MessageSquare, CheckCircle, XCircle,
  ThumbsUp, ThumbsDown, Minus, AlertTriangle, Activity, Plus
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

const interactionConfig = {
  visit:   { label: 'Visita',   icon: Eye,           color: 'bg-blue-100 text-blue-800' },
  call:    { label: 'Llamada',  icon: Phone,          color: 'bg-green-100 text-green-800' },
  message: { label: 'Mensaje',  icon: MessageSquare,  color: 'bg-purple-100 text-purple-800' },
  email:   { label: 'Email',    icon: Mail,           color: 'bg-amber-100 text-amber-800' },
  other:   { label: 'Otro',     icon: Activity,       color: 'bg-slate-100 text-slate-700' },
};

const feedbackConfig = {
  complaint:  { label: 'Queja',    icon: ThumbsDown, color: 'bg-red-100 text-red-800',    dot: 'bg-red-500' },
  compliment: { label: 'Elogio',   icon: ThumbsUp,   color: 'bg-green-100 text-green-800', dot: 'bg-green-500' },
  neutral:    { label: 'Neutro',   icon: Minus,      color: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400' },
};

const severityConfig = {
  low:    { label: 'Baja',   className: 'bg-yellow-100 text-yellow-800' },
  medium: { label: 'Media',  className: 'bg-orange-100 text-orange-800' },
  high:   { label: 'Alta',   className: 'bg-red-100 text-red-800' },
};

const channelLabels = {
  sms: 'SMS', call: 'Llamada', email: 'Email', in_person: 'En persona', other: 'Otro',
};

// ── Timeline item igual al de SeguimientoClientes ──
function TimelineItem({ log }) {
  const config = interactionConfig[log.interaction_type] || interactionConfig.other;
  const Icon = config.icon;

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${config.color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="w-0.5 bg-slate-200 flex-1 mt-1 min-h-[16px]" />
      </div>
      <div className="flex-1 pb-4">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <Badge className={`text-xs ${config.color}`}>{config.label}</Badge>
          <span className="text-xs text-slate-400">
            {format(parseISO(log.interaction_date), "d 'de' MMMM yyyy", { locale: es })}
          </span>
          {log.logged_by && <span className="text-xs text-slate-400">· por {log.logged_by}</span>}
          {log.assigned_to && <span className="text-xs text-slate-500 font-medium">· {log.assigned_to}</span>}
        </div>

        {log.comments && (
          <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-700 mb-2 border border-slate-100">
            {log.comments}
          </div>
        )}

        {log.conversation_text && (
          <div className="mb-2 space-y-1">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Conversación</p>
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-slate-700 whitespace-pre-wrap">
              {log.conversation_text}
            </div>
          </div>
        )}

        {log.visit_photos?.length > 0 && (
          <div className="mb-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Fotos</p>
            <div className="flex gap-2 flex-wrap">
              {log.visit_photos.map((photo, i) => (
                <a key={i} href={photo.url} target="_blank" rel="noopener noreferrer">
                  <img src={photo.url} alt={photo.comment || `Foto ${i + 1}`}
                    className="w-20 h-20 object-cover rounded-lg border border-slate-200 hover:opacity-80 transition-opacity" />
                  {photo.comment && <p className="text-xs text-slate-500 mt-0.5 w-20 truncate">{photo.comment}</p>}
                </a>
              ))}
            </div>
          </div>
        )}

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

        {!log.replied && (log.interaction_type === 'message' || log.interaction_type === 'email') && (
          <Badge className="text-xs bg-purple-100 text-purple-700">⏳ Esperando respuesta</Badge>
        )}
      </div>
    </div>
  );
}

// ── Feedback card ──
function FeedbackCard({ fb }) {
  const config = feedbackConfig[fb.feedback_type] || feedbackConfig.neutral;
  const Icon = config.icon;

  return (
    <div className={`rounded-xl border p-4 ${fb.feedback_type === 'complaint' ? 'border-red-200 bg-red-50/40' : fb.feedback_type === 'compliment' ? 'border-green-200 bg-green-50/40' : 'border-slate-200 bg-slate-50/40'}`}>
      <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center ${config.color}`}>
            <Icon className="w-3.5 h-3.5" />
          </div>
          <Badge className={`text-xs ${config.color}`}>{config.label}</Badge>
          {fb.severity && fb.feedback_type === 'complaint' && (
            <Badge className={`text-xs ${severityConfig[fb.severity]?.className}`}>
              {severityConfig[fb.severity]?.label}
            </Badge>
          )}
          {fb.feedback_channel && (
            <span className="text-xs text-slate-500">vía {channelLabels[fb.feedback_channel] || fb.feedback_channel}</span>
          )}
        </div>
        <span className="text-xs text-slate-400">
          {format(parseISO(fb.feedback_date), "d 'de' MMMM yyyy", { locale: es })}
        </span>
      </div>

      <p className="text-sm text-slate-700 mb-2">{fb.description}</p>

      {fb.affected_cleaner_names?.length > 0 && (
        <p className="text-xs text-slate-500 mb-1">
          <span className="font-medium">Limpiadores afectados:</span> {fb.affected_cleaner_names.join(', ')}
        </p>
      )}

      {fb.action_taken && (
        <div className="bg-white rounded-lg border border-slate-200 p-2 mt-2">
          <p className="text-xs font-semibold text-slate-500 mb-0.5">Acción tomada</p>
          <p className="text-xs text-slate-700">{fb.action_taken}</p>
        </div>
      )}

      {fb.points_impact != null && (
        <p className={`text-xs font-medium mt-2 ${fb.points_impact < 0 ? 'text-red-600' : 'text-green-600'}`}>
          {fb.points_impact > 0 ? '+' : ''}{fb.points_impact} puntos de impacto
        </p>
      )}

      {fb.registered_by_admin_name && (
        <p className="text-xs text-slate-400 mt-1">Registrado por {fb.registered_by_admin_name}</p>
      )}
    </div>
  );
}

export default function ClientFollowUpFeedbackTab({ clientId, clientName, onNewContact }) {
  const [followUpLogs, setFollowUpLogs] = useState([]);
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    Promise.all([
      base44.entities.FollowUpLog.filter({ client_id: clientId }, '-interaction_date', 500),
      base44.entities.ClientFeedback.filter({ client_id: clientId }, '-feedback_date', 500),
    ]).then(([logs, fbs]) => {
      setFollowUpLogs(Array.isArray(logs) ? logs : []);
      setFeedbacks(Array.isArray(fbs) ? fbs : []);
      setLoading(false);
    });
  }, [clientId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-7 h-7 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 mt-4">

      {/* ── Seguimiento (Timeline) ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-600" />
              Seguimiento de Contacto ({followUpLogs.length})
            </span>
            {onNewContact && (
              <Button size="sm" onClick={onNewContact} className="bg-blue-600 hover:bg-blue-700 h-7 text-xs">
                <Plus className="w-3 h-3 mr-1" /> Registrar contacto
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {followUpLogs.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Sin contactos registrados para este cliente.</p>
            </div>
          ) : (
            <div className="mt-2">
              {followUpLogs.map(log => <TimelineItem key={log.id} log={log} />)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Feedbacks ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Feedbacks del Cliente ({feedbacks.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {feedbacks.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <ThumbsUp className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Sin feedbacks registrados para este cliente.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Resumen */}
              <div className="flex gap-3 flex-wrap mb-2">
                {['complaint','compliment','neutral'].map(type => {
                  const count = feedbacks.filter(f => f.feedback_type === type).length;
                  if (!count) return null;
                  const cfg = feedbackConfig[type];
                  return (
                    <Badge key={type} className={`text-xs ${cfg.color}`}>
                      {cfg.label}: {count}
                    </Badge>
                  );
                })}
              </div>
              {feedbacks.map(fb => <FeedbackCard key={fb.id} fb={fb} />)}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}