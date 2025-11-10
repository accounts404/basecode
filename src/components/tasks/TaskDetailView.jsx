import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Circle,
    Clock,
    CheckCircle,
    XCircle,
    Calendar,
    User,
    Users,
    Briefcase,
    Edit,
    Trash2,
    MessageSquare,
    Send,
    History,
    FileText,
    AlertCircle,
    CheckSquare
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const priorityConfig = {
    low: { label: 'Baja', color: 'bg-blue-100 text-blue-800 border-blue-200' },
    medium: { label: 'Media', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    high: { label: 'Alta', color: 'bg-orange-100 text-orange-800 border-orange-200' },
    urgent: { label: 'Urgente', color: 'bg-red-100 text-red-800 border-red-200' },
};

const statusConfig = {
    pending: { label: 'Pendiente', color: 'bg-slate-100 text-slate-800 border-slate-200', icon: Circle },
    in_progress: { label: 'En Progreso', color: 'bg-blue-100 text-blue-800 border-blue-200', icon: Clock },
    completed: { label: 'Completada', color: 'bg-green-100 text-green-800 border-green-200', icon: CheckCircle },
    cancelled: { label: 'Cancelada', color: 'bg-red-100 text-red-800 border-red-200', icon: XCircle },
};

const categoryConfig = {
    operational: { label: 'Operacional' },
    client_care: { label: 'Atención al Cliente' },
    cleaner_support: { label: 'Apoyo a Limpiadores' },
    fleet_logistics: { label: 'Logística de Flota' },
    financial_admin: { label: 'Admin. Financiera' },
    general_admin: { label: 'Admin. General' },
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
    onStatusChange,
}) {
    const [newComment, setNewComment] = useState('');

    const StatusIcon = statusConfig[task.status]?.icon || Circle;
    const createdByUser = users.find(u => u.id === task.created_by_user_id);
    const assignedUsers = users.filter(u => task.assignee_user_ids?.includes(u.id));
    const relatedClient = clients?.find(c => c.id === task.related_client_id);
    const relatedSchedule = schedules?.find(s => s.id === task.related_schedule_id);

    const handleAddComment = () => {
        if (!newComment.trim()) return;
        onAddComment(task.id, newComment);
        setNewComment('');
    };

    const checklistProgress = task.checklist_items 
        ? {
            completed: task.checklist_items.filter(item => item.completed).length,
            total: task.checklist_items.length
        }
        : null;

    return (
        <div className="space-y-6">
            {/* Header con título y acciones */}
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                    <h2 className="text-2xl font-bold text-slate-900 mb-2">{task.title}</h2>
                    <div className="flex flex-wrap gap-2">
                        <Badge className={statusConfig[task.status]?.color}>
                            <StatusIcon className="w-3 h-3 mr-1" />
                            {statusConfig[task.status]?.label}
                        </Badge>
                        <Badge className={priorityConfig[task.priority]?.color}>
                            {priorityConfig[task.priority]?.label}
                        </Badge>
                        {task.task_category && (
                            <Badge variant="outline">
                                {categoryConfig[task.task_category]?.label}
                            </Badge>
                        )}
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => onEdit(task)}>
                        <Edit className="w-4 h-4 mr-2" />
                        Editar
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => onDelete(task)} className="text-red-600 hover:bg-red-50">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Eliminar
                    </Button>
                </div>
            </div>

            {/* Descripción */}
            {task.description && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <FileText className="w-4 h-4" />
                            Descripción
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-slate-700 whitespace-pre-wrap">{task.description}</p>
                    </CardContent>
                </Card>
            )}

            {/* Información de completado */}
            {task.status === 'completed' && task.completion_notes && (
                <Card className="border-green-200 bg-green-50">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2 text-green-800">
                            <CheckSquare className="w-5 h-5" />
                            Tarea Completada
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div>
                            <p className="text-sm font-semibold text-green-900 mb-1">Completada por:</p>
                            <p className="text-sm text-green-800">
                                {task.completed_by_user_name || 'Usuario desconocido'}
                            </p>
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-green-900 mb-1">Fecha de completado:</p>
                            <p className="text-sm text-green-800">
                                {task.completed_at 
                                    ? format(new Date(task.completed_at), "d 'de' MMMM 'de' yyyy 'a las' HH:mm", { locale: es })
                                    : 'Fecha no disponible'
                                }
                            </p>
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-green-900 mb-2">Notas de completado:</p>
                            <div className="bg-white rounded-lg p-3 border border-green-200">
                                <p className="text-sm text-slate-700 whitespace-pre-wrap">
                                    {task.completion_notes}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Detalles */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Detalles</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-sm font-semibold text-slate-600 mb-1 flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                Fecha de vencimiento
                            </p>
                            <p className="text-slate-900">
                                {format(new Date(task.due_date), "d 'de' MMMM 'de' yyyy", { locale: es })}
                            </p>
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-slate-600 mb-1 flex items-center gap-1">
                                <User className="w-4 h-4" />
                                Creada por
                            </p>
                            <p className="text-slate-900">{createdByUser?.full_name || 'Usuario desconocido'}</p>
                        </div>
                    </div>

                    {assignedUsers.length > 0 && (
                        <div>
                            <p className="text-sm font-semibold text-slate-600 mb-2 flex items-center gap-1">
                                <Users className="w-4 h-4" />
                                Asignada a
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {assignedUsers.map(user => (
                                    <div key={user.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                                        <Avatar className="w-6 h-6">
                                            <AvatarFallback className="text-xs bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                                                {user.full_name?.charAt(0)?.toUpperCase() || 'U'}
                                            </AvatarFallback>
                                        </Avatar>
                                        <span className="text-sm text-slate-900">{user.full_name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {(relatedClient || relatedSchedule) && (
                        <>
                            <Separator />
                            <div className="space-y-3">
                                {relatedClient && (
                                    <div>
                                        <p className="text-sm font-semibold text-slate-600 mb-1 flex items-center gap-1">
                                            <Briefcase className="w-4 h-4" />
                                            Cliente relacionado
                                        </p>
                                        <Badge variant="outline" className="text-sm">
                                            {relatedClient.name}
                                        </Badge>
                                    </div>
                                )}
                                {relatedSchedule && (
                                    <div>
                                        <p className="text-sm font-semibold text-slate-600 mb-1">Servicio relacionado</p>
                                        <Badge variant="outline" className="text-sm">
                                            {relatedSchedule.client_name} - {format(new Date(relatedSchedule.start_time), "d MMM yyyy", { locale: es })}
                                        </Badge>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Checklist */}
            {task.checklist_items && task.checklist_items.length > 0 && (
                <Card>
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-base flex items-center gap-2">
                                <CheckCircle className="w-4 h-4" />
                                Checklist
                            </CardTitle>
                            {checklistProgress && (
                                <Badge variant="outline">
                                    {checklistProgress.completed}/{checklistProgress.total}
                                </Badge>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {task.checklist_items.map((item, index) => (
                            <div
                                key={index}
                                className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors"
                            >
                                <Checkbox
                                    checked={item.completed}
                                    onCheckedChange={() => onToggleChecklistItem(task.id, index)}
                                    disabled={task.status === 'completed'}
                                />
                                <div className="flex-1">
                                    <p className={`text-sm ${item.completed ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                                        {item.description}
                                    </p>
                                    {item.completed && item.completed_by && (
                                        <p className="text-xs text-slate-500 mt-1">
                                            Completado por {item.completed_by}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            {/* Comentarios */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <MessageSquare className="w-4 h-4" />
                        Comentarios
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {task.comments && task.comments.length > 0 ? (
                        <div className="space-y-3">
                            {task.comments.map((comment, index) => (
                                <div key={index} className="bg-slate-50 rounded-lg p-3">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Avatar className="w-6 h-6">
                                            <AvatarFallback className="text-xs bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                                                {comment.user_name?.charAt(0)?.toUpperCase() || 'U'}
                                            </AvatarFallback>
                                        </Avatar>
                                        <span className="text-sm font-semibold text-slate-900">{comment.user_name}</span>
                                        <span className="text-xs text-slate-500">
                                            {format(new Date(comment.timestamp), "d MMM, HH:mm", { locale: es })}
                                        </span>
                                    </div>
                                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{comment.text}</p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-slate-500 text-center py-4">No hay comentarios aún</p>
                    )}

                    <div className="flex gap-2">
                        <Textarea
                            placeholder="Escribe un comentario..."
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            rows={2}
                            className="resize-none"
                        />
                        <Button onClick={handleAddComment} disabled={!newComment.trim()}>
                            <Send className="w-4 h-4" />
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Historial de actividad */}
            {task.activity_log && task.activity_log.length > 0 && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <History className="w-4 h-4" />
                            Historial de Actividad
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {task.activity_log.map((log, index) => (
                                <div key={index} className="flex gap-3 text-sm">
                                    <div className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500 mt-2"></div>
                                    <div className="flex-1">
                                        <p className="text-slate-900">
                                            <span className="font-semibold">{log.user_name}</span> {log.action}
                                        </p>
                                        {log.details && (
                                            <p className="text-slate-600 text-xs mt-1">{log.details}</p>
                                        )}
                                        <p className="text-slate-500 text-xs mt-1">
                                            {format(new Date(log.timestamp), "d MMM yyyy, HH:mm", { locale: es })}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}