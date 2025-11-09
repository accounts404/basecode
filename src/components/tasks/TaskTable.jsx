import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  MoreVertical, 
  Edit, 
  Trash2, 
  CheckCircle2,
  Clock,
  AlertTriangle,
  Calendar,
  User,
  Building2,
  CalendarClock,
  Eye,
  MessageSquare
} from 'lucide-react';
import { format, isBefore, isToday, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';

const PRIORITY_CONFIG = {
  low: { label: 'Baja', color: 'bg-slate-100 text-slate-800', icon: '🟢' },
  medium: { label: 'Media', color: 'bg-blue-100 text-blue-800', icon: '🔵' },
  high: { label: 'Alta', color: 'bg-orange-100 text-orange-800', icon: '🟠' },
  urgent: { label: 'Urgente', color: 'bg-red-100 text-red-800 animate-pulse', icon: '🔴' },
};

const STATUS_CONFIG = {
  pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  in_progress: { label: 'En Progreso', color: 'bg-blue-100 text-blue-800', icon: Clock },
  completed: { label: 'Completado', color: 'bg-green-100 text-green-800', icon: CheckCircle2 },
  cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-800', icon: AlertTriangle },
};

const CATEGORY_CONFIG = {
  operational: { label: 'Operacional', color: 'bg-blue-100 text-blue-800', icon: '⚙️' },
  client_care: { label: 'Cliente', color: 'bg-green-100 text-green-800', icon: '👥' },
  cleaner_support: { label: 'Limpiadores', color: 'bg-purple-100 text-purple-800', icon: '🧹' },
  fleet_logistics: { label: 'Flota', color: 'bg-orange-100 text-orange-800', icon: '🚗' },
  financial_admin: { label: 'Financiero', color: 'bg-yellow-100 text-yellow-800', icon: '💰' },
  general_admin: { label: 'General', color: 'bg-slate-100 text-slate-800', icon: '📋' },
};

export default function TaskTable({ 
  tasks, 
  users, 
  clients, 
  schedules, 
  onEditTask,
  onViewDetail,
  onDeleteTask, 
  onToggleStatus 
}) {
  const [sortConfig, setSortConfig] = useState({ key: 'due_date', direction: 'asc' });

  const handleSort = (key) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const sortedTasks = React.useMemo(() => {
    const sorted = [...tasks];
    sorted.sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];

      // Handle date sorting
      if (sortConfig.key === 'due_date') {
        aVal = new Date(aVal);
        bVal = new Date(bVal);
      }

      // Handle priority sorting (custom order)
      if (sortConfig.key === 'priority') {
        const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
        aVal = priorityOrder[aVal] || 0;
        bVal = priorityOrder[bVal] || 0;
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [tasks, sortConfig]);

  const getAssigneeNames = (assigneeIds) => {
    if (!assigneeIds || assigneeIds.length === 0) return 'Sin asignar';
    return assigneeIds
      .map(id => {
        const user = users.find(u => u.id === id);
        return user?.full_name || 'Desconocido';
      })
      .join(', ');
  };

  const getClientName = (clientId) => {
    if (!clientId) return null;
    const client = clients.find(c => c.id === clientId);
    return client?.name;
  };

  const isOverdue = (dueDate, status) => {
    if (!dueDate || status === 'completed' || status === 'cancelled') return false;
    return isBefore(new Date(dueDate), startOfDay(new Date()));
  };

  const handleQuickComplete = async (taskId) => {
    await onToggleStatus(taskId, 'completed');
  };

  if (tasks.length === 0) {
    return (
      <div className="text-center py-12">
        <Calendar className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <p className="text-slate-600 font-medium">No hay tareas que coincidan con los filtros</p>
        <p className="text-slate-500 text-sm mt-2">
          Intenta ajustar los filtros o crea una nueva tarea
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead className="w-12"></TableHead>
            <TableHead 
              className="cursor-pointer hover:bg-slate-100"
              onClick={() => handleSort('title')}
            >
              Título
            </TableHead>
            <TableHead 
              className="cursor-pointer hover:bg-slate-100"
              onClick={() => handleSort('due_date')}
            >
              Fecha Límite
            </TableHead>
            <TableHead>Asignados</TableHead>
            <TableHead>Contexto</TableHead>
            <TableHead 
              className="cursor-pointer hover:bg-slate-100"
              onClick={() => handleSort('priority')}
            >
              Prioridad
            </TableHead>
            <TableHead 
              className="cursor-pointer hover:bg-slate-100"
              onClick={() => handleSort('status')}
            >
              Estado
            </TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedTasks.map(task => {
            const priorityConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
            const statusConfig = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
            const categoryConfig = CATEGORY_CONFIG[task.task_category];
            const overdue = isOverdue(task.due_date, task.status);
            const StatusIcon = statusConfig.icon;
            const clientName = getClientName(task.related_client_id);
            const hasComments = task.comments && task.comments.length > 0;
            const hasChecklist = task.checklist_items && task.checklist_items.length > 0;

            return (
              <TableRow 
                key={task.id} 
                className={`hover:bg-slate-50 cursor-pointer ${overdue ? 'bg-red-50' : ''}`}
                onClick={() => onViewDetail(task)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {task.status !== 'completed' && task.status !== 'cancelled' && (
                    <Checkbox
                      checked={false}
                      onCheckedChange={() => handleQuickComplete(task.id)}
                      title="Marcar como completada"
                    />
                  )}
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <p className="font-medium text-slate-900">{task.title}</p>
                    {task.description && (
                      <p className="text-sm text-slate-500 line-clamp-1">
                        {task.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      {task.recurrence_type && task.recurrence_type !== 'none' && (
                        <Badge variant="outline" className="text-xs">
                          🔁 Recurrente
                        </Badge>
                      )}
                      {hasComments && (
                        <Badge variant="outline" className="text-xs flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" />
                          {task.comments.length}
                        </Badge>
                      )}
                      {hasChecklist && (
                        <Badge variant="outline" className="text-xs">
                          ✓ {task.checklist_items.filter(i => i.completed).length}/{task.checklist_items.length}
                        </Badge>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <div>
                      <p className={`text-sm ${overdue ? 'text-red-600 font-bold' : isToday(new Date(task.due_date)) ? 'text-blue-600 font-semibold' : ''}`}>
                        {format(new Date(task.due_date), "d 'de' MMM", { locale: es })}
                      </p>
                      {overdue && (
                        <p className="text-xs text-red-500 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Atrasada
                        </p>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {task.assignee_user_ids && task.assignee_user_ids.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-2">
                        {task.assignee_user_ids.slice(0, 3).map(userId => {
                          const user = users.find(u => u.id === userId);
                          return user ? (
                            <Avatar key={userId} className="w-8 h-8 border-2 border-white">
                              <AvatarImage src={user.profile_photo_url} />
                              <AvatarFallback className="text-xs">
                                {user.full_name?.charAt(0)?.toUpperCase() || '?'}
                              </AvatarFallback>
                            </Avatar>
                          ) : null;
                        })}
                      </div>
                      {task.assignee_user_ids.length > 3 && (
                        <span className="text-xs text-slate-500">
                          +{task.assignee_user_ids.length - 3}
                        </span>
                      )}
                    </div>
                  ) : (
                    <Badge variant="outline" className="text-xs text-slate-500">
                      Sin asignar
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    {clientName && (
                      <div className="flex items-center gap-1 text-sm">
                        <Building2 className="w-3 h-3 text-slate-400" />
                        <span className="truncate">{clientName}</span>
                      </div>
                    )}
                    {task.related_schedule_id && (
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <CalendarClock className="w-3 h-3" />
                        <span>Servicio vinculado</span>
                      </div>
                    )}
                    {!clientName && !task.related_schedule_id && (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={priorityConfig.color}>
                    <span className="mr-1">{priorityConfig.icon}</span>
                    {priorityConfig.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge className={statusConfig.color}>
                    <StatusIcon className="w-3 h-3 mr-1" />
                    {statusConfig.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  {categoryConfig && (
                    <Badge variant="outline" className={categoryConfig.color}>
                      <span className="mr-1">{categoryConfig.icon}</span>
                      {categoryConfig.label}
                    </Badge>
                  )}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onViewDetail(task)}>
                        <Eye className="w-4 h-4 mr-2" />
                        Ver Detalles
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onEditTask(task)}>
                        <Edit className="w-4 h-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      {task.status !== 'completed' && (
                        <DropdownMenuItem onClick={() => onToggleStatus(task.id, 'completed')}>
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          Marcar Completada
                        </DropdownMenuItem>
                      )}
                      {task.status === 'completed' && (
                        <DropdownMenuItem onClick={() => onToggleStatus(task.id, 'pending')}>
                          <Clock className="w-4 h-4 mr-2" />
                          Reabrir Tarea
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => onDeleteTask(task.id)}
                        className="text-red-600"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}