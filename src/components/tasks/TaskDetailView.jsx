import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Calendar,
  User,
  Building2,
  CalendarClock,
  MessageSquare,
  Edit,
  Trash2,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Send,
  History,
  ListChecks
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

const PRIORITY_CONFIG = {
  low: { label: 'Baja', color: 'bg-slate-100 text-slate-800' },
  medium: { label: 'Media', color: 'bg-blue-100 text-blue-800' },
  high: { label: 'Alta', color: 'bg-orange-100 text-orange-800' },
  urgent: { label: 'Urgente', color: 'bg-red-100 text-red-800' },
};

const STATUS_CONFIG = {
  pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  in_progress: { label: 'En Progreso', color: 'bg-blue-100 text-blue-800', icon: Clock },
  completed: { label: 'Completado', color: 'bg-green-100 text-green-800', icon: CheckCircle2 },
  cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-800', icon: AlertTriangle },
};

const CATEGORY_CONFIG = {
  operational: { label: 'Operacional', icon: '⚙️' },
  client_care: { label: 'Atención al Cliente', icon: '👥' },
  cleaner_support: { label: 'Soporte Limpiadores', icon: '🧹' },
  fleet_logistics: { label: 'Logística de Flota', icon: '🚗' },
  financial_admin: { label: 'Admin Financiera', icon: '💰' },
  general_admin: { label: 'Admin General', icon: '📋' },
};

export default function TaskDetailView({
  task,
  users,
  clients,
  schedules,
  currentUser,
  onEdit,
  onDelete,
  onAddComment,
  onToggleChecklistItem,
  onToggleStatus
}) {
  const [commentText, setCommentText] = useState('');
  const [sendingComment, setSendingComment] = useState(false);

  const priorityConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
  const statusConfig = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
  const categoryConfig = CATEGORY_CONFIG[task.task_category];
  const StatusIcon = statusConfig.icon;

  const assignedUsers = task.assignee_user_ids?.map(id => users.find(u => u.id === id)).filter(Boolean) || [];
  const relatedClient = task.related_client_id ? clients.find(c => c.id === task.related_client_id) : null;
  const relatedSchedule = task.related_schedule_id ? schedules.find(s => s.id === task.related_schedule_id) : null;

  const handleSendComment = async () => {
    if (!commentText.trim()) return;
    
    setSendingComment(true);
    try {
      await onAddComment(task.id, commentText);
      setCommentText('');
    } catch (error) {
      console.error('Error sending comment:', error);
    } finally {
      setSendingComment(false);
    }
  };

  const checklistProgress = task.checklist_items ? {
    completed: task.checklist_items.filter(i => i.completed).length,
    total: task.checklist_items.length
  } : null;

  return (
    <div className="space-y-6 py-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-2xl font-bold text-slate-900 flex-1">
            {task.title}
          </h2>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={onEdit}>
              <Edit className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={onDelete} className="text-red-600">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge className={priorityConfig.color}>
            {priorityConfig.label}
          </Badge>
          <Badge className={statusConfig.color}>
            <StatusIcon className="w-3 h-3 mr-1" />
            {statusConfig.label}
          </Badge>
          {categoryConfig && (
            <Badge variant="outline">
              {categoryConfig.icon} {categoryConfig.label}
            </Badge>
          )}
        </div>
      </div>

      {/* Descripción */}
      {task.description && (
        <div className="bg-slate-50 p-4 rounded-lg">
          <p className="text-slate-700 whitespace-pre-wrap">{task.description}</p>
        </div>
      )}

      {/* Información Principal */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="font-medium">Fecha límite:</span>
            <span className="text-slate-700">
              {format(new Date(task.due_date), "d 'de' MMMM, yyyy", { locale: es })}
            </span>
          </div>

          {task.created_by_user_name && (
            <div className="flex items-center gap-2 text-sm">
              <User className="w-4 h-4 text-slate-400" />
              <span className="font-medium">Creada por:</span>
              <span className="text-slate-700">{task.created_by_user_name}</span>
            </div>
          )}

          {task.completed_at && (
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span className="font-medium">Completada:</span>
              <span className="text-slate-700">
                {format(new Date(task.completed_at), "d 'de' MMM 'a las' HH:mm", { locale: es })}
              </span>
            </div>
          )}
        </div>

        <div className="space-y-3">
          {relatedClient && (
            <div className="flex items-center gap-2 text-sm">
              <Building2 className="w-4 h-4 text-slate-400" />
              <span className="font-medium">Cliente:</span>
              <span className="text-slate-700">{relatedClient.name}</span>
            </div>
          )}

          {relatedSchedule && (
            <div className="flex items-center gap-2 text-sm">
              <CalendarClock className="w-4 h-4 text-slate-400" />
              <span className="font-medium">Servicio:</span>
              <span className="text-slate-700">
                {relatedSchedule.client_name} - {format(new Date(relatedSchedule.start_time), "d MMM", { locale: es })}
              </span>
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* Asignados */}
      <div className="space-y-3">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
          <User className="w-5 h-5" />
          Asignados
        </h3>
        {assignedUsers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {assignedUsers.map(user => (
              <div key={user.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                <Avatar className="w-10 h-10">
                  <AvatarImage src={user.profile_photo_url} />
                  <AvatarFallback>
                    {user.full_name?.charAt(0)?.toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-slate-900">{user.full_name}</p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-500 italic">Sin asignados</p>
        )}
      </div>

      {/* Checklist */}
      {task.checklist_items && task.checklist_items.length > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <ListChecks className="w-5 h-5" />
                Checklist
              </h3>
              {checklistProgress && (
                <Badge variant="outline">
                  {checklistProgress.completed}/{checklistProgress.total} completados
                </Badge>
              )}
            </div>
            <div className="space-y-2">
              {task.checklist_items.map((item, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <Checkbox
                    checked={item.completed}
                    onCheckedChange={() => onToggleChecklistItem(task.id, index)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <p className={`${item.completed ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                      {item.description}
                    </p>
                    {item.completed && item.completed_at && (
                      <p className="text-xs text-slate-400 mt-1">
                        ✓ {formatDistanceToNow(new Date(item.completed_at), { addSuffix: true, locale: es })}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Comentarios */}
      <Separator />
      <div className="space-y-4">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          Comentarios {task.comments?.length > 0 && `(${task.comments.length})`}
        </h3>

        {/* Añadir comentario */}
        <div className="space-y-2">
          <Textarea
            placeholder="Escribe un comentario..."
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            rows={3}
          />
          <div className="flex justify-end">
            <Button
              onClick={handleSendComment}
              disabled={!commentText.trim() || sendingComment}
              size="sm"
            >
              <Send className="w-4 h-4 mr-2" />
              {sendingComment ? 'Enviando...' : 'Comentar'}
            </Button>
          </div>
        </div>

        {/* Lista de comentarios */}
        <div className="space-y-3">
          {task.comments && task.comments.length > 0 ? (
            task.comments.map((comment, index) => (
              <div key={index} className="bg-white border rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback>
                      {comment.user_name?.charAt(0)?.toUpperCase() || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{comment.user_name}</span>
                      <span className="text-xs text-slate-500">
                        {formatDistanceToNow(new Date(comment.timestamp), { addSuffix: true, locale: es })}
                      </span>
                    </div>
                    <p className="text-slate-700 whitespace-pre-wrap">{comment.text}</p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-slate-500 italic text-center py-4">
              No hay comentarios aún. ¡Sé el primero en comentar!
            </p>
          )}
        </div>
      </div>

      {/* Historial de Actividad */}
      {task.activity_log && task.activity_log.length > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <History className="w-5 h-5" />
              Historial de Actividad
            </h3>
            <div className="space-y-2">
              {task.activity_log.slice().reverse().map((log, index) => (
                <div key={index} className="flex items-start gap-3 text-sm">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mt-2"></div>
                  <div className="flex-1">
                    <p className="text-slate-700">
                      <span className="font-semibold">{log.user_name}</span> {log.details || log.action}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true, locale: es })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Acciones */}
      <Separator />
      <div className="flex gap-3">
        {task.status !== 'completed' && (
          <Button
            onClick={() => onToggleStatus(task.id, 'completed')}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Marcar como Completada
          </Button>
        )}
        {task.status === 'completed' && (
          <Button
            onClick={() => onToggleStatus(task.id, 'in_progress')}
            className="flex-1 bg-blue-600 hover:bg-blue-700"
          >
            <Clock className="w-4 h-4 mr-2" />
            Reabrir Tarea
          </Button>
        )}
      </div>
    </div>
  );
}