import React from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  Calendar,
  User,
  Building2,
  MoreVertical,
  Edit
} from 'lucide-react';
import { format, isBefore, isToday, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';

const COLUMNS = [
  { 
    id: 'pending', 
    title: 'Pendiente', 
    color: 'bg-yellow-100', 
    icon: Clock,
    iconColor: 'text-yellow-600'
  },
  { 
    id: 'in_progress', 
    title: 'En Progreso', 
    color: 'bg-blue-100', 
    icon: Clock,
    iconColor: 'text-blue-600'
  },
  { 
    id: 'completed', 
    title: 'Completado', 
    color: 'bg-green-100', 
    icon: CheckCircle2,
    iconColor: 'text-green-600'
  },
];

const PRIORITY_CONFIG = {
  low: { label: 'Baja', color: 'bg-slate-100 text-slate-800', borderColor: 'border-slate-300' },
  medium: { label: 'Media', color: 'bg-blue-100 text-blue-800', borderColor: 'border-blue-300' },
  high: { label: 'Alta', color: 'bg-orange-100 text-orange-800', borderColor: 'border-orange-300' },
  urgent: { label: 'Urgente', color: 'bg-red-100 text-red-800 font-bold', borderColor: 'border-red-400' },
};

export default function TaskKanbanView({ tasks, users, clients, onEditTask, onToggleStatus }) {
  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const taskId = result.draggableId;
    const newStatus = result.destination.droppableId;

    if (result.source.droppableId !== newStatus) {
      onToggleStatus(taskId, newStatus);
    }
  };

  const getTasksByStatus = (status) => {
    return tasks.filter(task => task.status === status);
  };

  const isOverdue = (dueDate) => {
    if (!dueDate) return false;
    return isBefore(new Date(dueDate), startOfDay(new Date()));
  };

  const TaskCard = ({ task, index }) => {
    const priorityConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
    const overdue = isOverdue(task.due_date) && task.status !== 'completed';
    const clientName = clients.find(c => c.id === task.related_client_id)?.name;

    return (
      <Draggable draggableId={task.id} index={index}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            className={`mb-3 ${snapshot.isDragging ? 'opacity-50' : ''}`}
          >
            <Card 
              className={`hover:shadow-md transition-shadow cursor-pointer border-l-4 ${priorityConfig.borderColor} ${
                overdue ? 'bg-red-50' : ''
              }`}
              onClick={() => onEditTask(task)}
            >
              <CardContent className="p-4 space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-semibold text-slate-900 line-clamp-2 flex-1">
                    {task.title}
                  </h4>
                  <Badge className={`${priorityConfig.color} flex-shrink-0`}>
                    {priorityConfig.label}
                  </Badge>
                </div>

                {/* Descripción */}
                {task.description && (
                  <p className="text-sm text-slate-600 line-clamp-2">
                    {task.description}
                  </p>
                )}

                {/* Fecha */}
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  <span className={overdue ? 'text-red-600 font-semibold' : isToday(new Date(task.due_date)) ? 'text-blue-600 font-semibold' : 'text-slate-600'}>
                    {format(new Date(task.due_date), "d 'de' MMM", { locale: es })}
                  </span>
                  {overdue && (
                    <Badge variant="destructive" className="text-xs">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      Atrasada
                    </Badge>
                  )}
                </div>

                {/* Cliente */}
                {clientName && (
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Building2 className="w-4 h-4 text-slate-400" />
                    <span className="truncate">{clientName}</span>
                  </div>
                )}

                {/* Asignados */}
                {task.assignee_user_ids && task.assignee_user_ids.length > 0 && (
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-slate-400" />
                    <div className="flex -space-x-2">
                      {task.assignee_user_ids.slice(0, 3).map(userId => {
                        const user = users.find(u => u.id === userId);
                        return user ? (
                          <Avatar key={userId} className="w-6 h-6 border-2 border-white">
                            <AvatarImage src={user.profile_photo_url} />
                            <AvatarFallback className="text-xs">
                              {user.full_name?.charAt(0)?.toUpperCase() || '?'}
                            </AvatarFallback>
                          </Avatar>
                        ) : null;
                      })}
                      {task.assignee_user_ids.length > 3 && (
                        <div className="w-6 h-6 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center">
                          <span className="text-xs font-semibold text-slate-600">
                            +{task.assignee_user_ids.length - 3}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Checklist progress */}
                {task.checklist_items && task.checklist_items.length > 0 && (
                  <div className="text-xs text-slate-600">
                    ✓ {task.checklist_items.filter(i => i.completed).length}/{task.checklist_items.length} completados
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </Draggable>
    );
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {COLUMNS.map(column => {
          const columnTasks = getTasksByStatus(column.id);
          const ColumnIcon = column.icon;

          return (
            <div key={column.id} className="flex flex-col h-full">
              <div className={`${column.color} rounded-t-lg p-4 flex items-center justify-between`}>
                <div className="flex items-center gap-2">
                  <ColumnIcon className={`w-5 h-5 ${column.iconColor}`} />
                  <h3 className="font-semibold text-slate-900">{column.title}</h3>
                  <Badge variant="secondary">{columnTasks.length}</Badge>
                </div>
              </div>

              <Droppable droppableId={column.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex-1 p-4 bg-slate-50 rounded-b-lg min-h-[500px] ${
                      snapshot.isDraggingOver ? 'bg-slate-100' : ''
                    }`}
                  >
                    {columnTasks.map((task, index) => (
                      <TaskCard key={task.id} task={task} index={index} />
                    ))}
                    {provided.placeholder}

                    {columnTasks.length === 0 && (
                      <div className="text-center py-8 text-slate-400">
                        <p className="text-sm">No hay tareas</p>
                      </div>
                    )}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}