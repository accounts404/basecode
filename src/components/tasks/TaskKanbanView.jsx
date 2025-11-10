import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DndContext, DragOverlay, useDraggable, useDroppable } from '@hello-pangea/dnd';
import { 
    Clock, 
    CheckCircle, 
    Circle, 
    XCircle, 
    AlertTriangle,
    Calendar,
    Users,
    Eye,
    Edit
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import CompleteTaskDialog from './CompleteTaskDialog';

// Configuración de columnas
const columns = [
    { id: 'pending', title: 'Pendientes', color: 'bg-slate-100 border-slate-300', icon: Circle },
    { id: 'in_progress', title: 'En Progreso', color: 'bg-blue-100 border-blue-300', icon: Clock },
    { id: 'completed', title: 'Completadas', color: 'bg-green-100 border-green-300', icon: CheckCircle },
];

// Configuración de prioridad
const priorityConfig = {
    low: { label: 'Baja', color: 'bg-blue-100 text-blue-800' },
    medium: { label: 'Media', color: 'bg-yellow-100 text-yellow-800' },
    high: { label: 'Alta', color: 'bg-orange-100 text-orange-800' },
    urgent: { label: 'Urgente', color: 'bg-red-100 text-red-800' },
};

export default function TaskKanbanView({ 
    tasks, 
    users, 
    onStatusChange, 
    onViewTask, 
    onEditTask,
    onCompleteWithNotes,
    currentUser 
}) {
    const [activeId, setActiveId] = useState(null);
    const [taskToComplete, setTaskToComplete] = useState(null);

    const handleDragStart = (event) => {
        setActiveId(event.active.id);
    };

    const handleDragEnd = (event) => {
        const { active, over } = event;
        
        if (!over) {
            setActiveId(null);
            return;
        }

        const taskId = active.id;
        const newStatus = over.id;

        const task = tasks.find(t => t.id === taskId);
        if (task && task.status !== newStatus) {
            if (newStatus === 'completed') {
                // Mostrar diálogo para notas de completado
                setTaskToComplete(task);
            } else {
                onStatusChange(taskId, newStatus);
            }
        }

        setActiveId(null);
    };

    const handleCompleteTask = async (taskId, completionNotes) => {
        await onCompleteWithNotes(taskId, completionNotes);
        setTaskToComplete(null);
    };

    const isOverdue = (task) => {
        if (task.status === 'completed' || task.status === 'cancelled') return false;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dueDate = new Date(task.due_date);
        dueDate.setHours(0, 0, 0, 0);
        return dueDate < today;
    };

    const getTasksByStatus = (status) => {
        return tasks.filter(task => task.status === status);
    };

    const getAssigneeAvatars = (assigneeIds) => {
        if (!assigneeIds || assigneeIds.length === 0) return null;
        
        const assignedUsers = users.filter(u => assigneeIds.includes(u.id));
        
        return (
            <div className="flex -space-x-2">
                {assignedUsers.slice(0, 2).map((user) => (
                    <Avatar key={user.id} className="w-6 h-6 border-2 border-white">
                        <AvatarFallback className="text-xs bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                            {user.full_name?.charAt(0)?.toUpperCase() || 'U'}
                        </AvatarFallback>
                    </Avatar>
                ))}
                {assignedUsers.length > 2 && (
                    <div className="w-6 h-6 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-xs font-semibold text-slate-600">
                        +{assignedUsers.length - 2}
                    </div>
                )}
            </div>
        );
    };

    return (
        <>
            <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {columns.map((column) => {
                        const ColumnIcon = column.icon;
                        const columnTasks = getTasksByStatus(column.id);

                        return (
                            <DroppableColumn key={column.id} id={column.id}>
                                <Card className={`${column.color} border-2`}>
                                    <CardHeader className="pb-3">
                                        <CardTitle className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <ColumnIcon className="w-5 h-5" />
                                                <span>{column.title}</span>
                                            </div>
                                            <Badge variant="secondary" className="text-sm">
                                                {columnTasks.length}
                                            </Badge>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        {columnTasks.length === 0 ? (
                                            <div className="text-center py-8 text-slate-400 text-sm">
                                                No hay tareas
                                            </div>
                                        ) : (
                                            columnTasks.map((task) => (
                                                <DraggableTaskCard 
                                                    key={task.id} 
                                                    task={task}
                                                    isOverdue={isOverdue(task)}
                                                    onViewTask={onViewTask}
                                                    onEditTask={onEditTask}
                                                    getAssigneeAvatars={getAssigneeAvatars}
                                                />
                                            ))
                                        )}
                                    </CardContent>
                                </Card>
                            </DroppableColumn>
                        );
                    })}
                </div>

                <DragOverlay>
                    {activeId ? (
                        <TaskCardOverlay task={tasks.find(t => t.id === activeId)} />
                    ) : null}
                </DragOverlay>
            </DndContext>

            {taskToComplete && (
                <CompleteTaskDialog
                    task={taskToComplete}
                    open={!!taskToComplete}
                    onClose={() => setTaskToComplete(null)}
                    onComplete={handleCompleteTask}
                    currentUser={currentUser}
                />
            )}
        </>
    );
}

function DroppableColumn({ id, children }) {
    const { setNodeRef } = useDroppable({ id });

    return <div ref={setNodeRef}>{children}</div>;
}

function DraggableTaskCard({ task, isOverdue, onViewTask, onEditTask, getAssigneeAvatars }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: task.id,
    });

    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        opacity: isDragging ? 0.5 : 1,
    } : undefined;

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            className={`bg-white rounded-lg p-4 shadow-sm border cursor-move hover:shadow-md transition-shadow ${
                isOverdue ? 'border-red-300 bg-red-50' : 'border-slate-200'
            }`}
        >
            <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                    <h4 className="font-semibold text-slate-900 line-clamp-2 flex-1">
                        {task.title}
                    </h4>
                    {isOverdue && <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />}
                </div>

                {task.description && (
                    <p className="text-sm text-slate-600 line-clamp-2">
                        {task.description}
                    </p>
                )}

                <div className="flex items-center justify-between text-xs text-slate-600">
                    <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(task.due_date), 'd MMM', { locale: es })}
                    </div>
                    <Badge className={priorityConfig[task.priority]?.color}>
                        {priorityConfig[task.priority]?.label}
                    </Badge>
                </div>

                <div className="flex items-center justify-between">
                    {getAssigneeAvatars(task.assignee_user_ids)}
                    <div className="flex gap-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                                e.stopPropagation();
                                onViewTask(task);
                            }}
                            className="h-7 w-7 p-0"
                        >
                            <Eye className="w-3 h-3" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                                e.stopPropagation();
                                onEditTask(task);
                            }}
                            className="h-7 w-7 p-0"
                        >
                            <Edit className="w-3 h-3" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function TaskCardOverlay({ task }) {
    if (!task) return null;

    return (
        <div className="bg-white rounded-lg p-4 shadow-xl border-2 border-blue-500 w-64">
            <h4 className="font-semibold text-slate-900">{task.title}</h4>
        </div>
    );
}