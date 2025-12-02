import React, { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
    MoreVertical,
    Eye,
    Edit,
    Trash2,
    CheckCircle,
    Circle,
    Clock,
    XCircle,
    AlertTriangle,
    TrendingUp,
    TrendingDown,
    Briefcase,
    Users,
    DollarSign,
    Car,
    Settings,
    FileText,
    FolderOpen
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Checkbox } from '@/components/ui/checkbox';
import CompleteTaskDialog from './CompleteTaskDialog';

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
    operational: { label: 'Operacional', icon: Settings },
    client_care: { label: 'Atención al Cliente', icon: Users },
    cleaner_support: { label: 'Apoyo a Limpiadores', icon: Users },
    fleet_logistics: { label: 'Logística de Flota', icon: Car },
    financial_admin: { label: 'Admin. Financiera', icon: DollarSign },
    general_admin: { label: 'Admin. General', icon: FileText },
};

export default function TaskTable({ 
    tasks, 
    users,
    projects = [], 
    onViewTask, 
    onEditTask, 
    onDeleteTask, 
    onQuickComplete, 
    onStatusChange,
    onCompleteWithNotes,
    currentUser 
}) {
    const [sortColumn, setSortColumn] = useState('due_date');
    const [sortDirection, setSortDirection] = useState('asc');
    const [taskToComplete, setTaskToComplete] = useState(null);

    const handleSort = (column) => {
        if (sortColumn === column) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection('asc');
        }
    };

    const getSortIcon = (column) => {
        if (sortColumn !== column) return null;
        return sortDirection === 'asc' ? 
            <TrendingUp className="w-4 h-4 inline ml-1" /> : 
            <TrendingDown className="w-4 h-4 inline ml-1" />;
    };

    const sortedTasks = [...tasks].sort((a, b) => {
        let aValue = a[sortColumn];
        let bValue = b[sortColumn];

        if (sortColumn === 'due_date') {
            aValue = new Date(aValue).getTime();
            bValue = new Date(bValue).getTime();
        } else if (typeof aValue === 'string') {
            aValue = aValue?.toLowerCase() || '';
            bValue = bValue?.toLowerCase() || '';
        }

        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    const isOverdue = (task) => {
        if (task.status === 'completed' || task.status === 'cancelled') return false;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dueDate = new Date(task.due_date);
        dueDate.setHours(0, 0, 0, 0);
        return dueDate < today;
    };

    const getAssigneeAvatars = (assigneeIds) => {
        if (!assigneeIds || assigneeIds.length === 0) return null;
        
        const assignedUsers = users.filter(u => assigneeIds.includes(u.id));
        
        return (
            <div className="flex -space-x-2">
                {assignedUsers.slice(0, 3).map((user) => (
                    <Avatar key={user.id} className="w-8 h-8 border-2 border-white">
                        <AvatarFallback className="text-xs bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                            {user.full_name?.charAt(0)?.toUpperCase() || 'U'}
                        </AvatarFallback>
                    </Avatar>
                ))}
                {assignedUsers.length > 3 && (
                    <div className="w-8 h-8 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-xs font-semibold text-slate-600">
                        +{assignedUsers.length - 3}
                    </div>
                )}
            </div>
        );
    };

    const handleCompleteClick = (task) => {
        setTaskToComplete(task);
    };

    const handleCompleteTask = async (taskId, completionNotes) => {
        await onCompleteWithNotes(taskId, completionNotes);
        setTaskToComplete(null);
    };

    if (tasks.length === 0) {
        return (
            <div className="text-center py-12 text-slate-500">
                <FileText className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                <p className="text-lg font-semibold">No hay tareas que mostrar</p>
                <p className="text-sm">Las tareas aparecerán aquí cuando se cumplan los criterios de filtrado</p>
            </div>
        );
    }

    return (
        <>
            <div className="rounded-lg border border-slate-200 overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-slate-50">
                            <TableHead className="w-12"></TableHead>
                            <TableHead 
                                className="cursor-pointer hover:bg-slate-100 font-bold"
                                onClick={() => handleSort('title')}
                            >
                                Tarea {getSortIcon('title')}
                            </TableHead>
                            <TableHead 
                                className="cursor-pointer hover:bg-slate-100 font-bold"
                                onClick={() => handleSort('due_date')}
                            >
                                Fecha {getSortIcon('due_date')}
                            </TableHead>
                            <TableHead className="font-bold">Asignado a</TableHead>
                            <TableHead className="font-bold">Contexto</TableHead>
                            <TableHead 
                                className="cursor-pointer hover:bg-slate-100 font-bold"
                                onClick={() => handleSort('priority')}
                            >
                                Prioridad {getSortIcon('priority')}
                            </TableHead>
                            <TableHead 
                                className="cursor-pointer hover:bg-slate-100 font-bold"
                                onClick={() => handleSort('status')}
                            >
                                Estado {getSortIcon('status')}
                            </TableHead>
                            <TableHead className="font-bold">Categoría</TableHead>
                            <TableHead className="w-12"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedTasks.map((task) => {
                            const StatusIcon = statusConfig[task.status]?.icon || Circle;
                            const CategoryIcon = categoryConfig[task.task_category]?.icon || FileText;
                            const overdue = isOverdue(task);

                            return (
                                <TableRow 
                                    key={task.id}
                                    className={`hover:bg-slate-50 ${overdue ? 'bg-red-50' : ''}`}
                                >
                                    <TableCell>
                                        <Checkbox
                                            checked={task.status === 'completed'}
                                            onCheckedChange={(checked) => {
                                                if (checked) {
                                                    handleCompleteClick(task);
                                                }
                                            }}
                                            disabled={task.status === 'completed'}
                                            className="w-5 h-5"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-start gap-2">
                                            {overdue && <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-1" />}
                                            <div>
                                                <button 
                                                    onClick={() => onViewTask(task)}
                                                    className="font-semibold text-slate-900 hover:text-blue-600 text-left"
                                                >
                                                    {task.title}
                                                </button>
                                                {task.description && (
                                                    <p className="text-sm text-slate-600 line-clamp-1 mt-1">
                                                        {task.description}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="text-sm">
                                            {format(new Date(task.due_date), 'd MMM yyyy', { locale: es })}
                                        </div>
                                        {overdue && (
                                            <Badge variant="outline" className="mt-1 text-xs border-red-300 text-red-700">
                                                Vencida
                                            </Badge>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {getAssigneeAvatars(task.assignee_user_ids)}
                                    </TableCell>
                                    <TableCell>
                                        <div className="space-y-1">
                                            {task.project_id && (() => {
                                                const project = projects.find(p => p.id === task.project_id);
                                                return project ? (
                                                    <Badge 
                                                        variant="outline" 
                                                        className="text-xs"
                                                        style={{ 
                                                            borderColor: project.color,
                                                            color: project.color,
                                                            backgroundColor: `${project.color}10`
                                                        }}
                                                    >
                                                        <FolderOpen className="w-3 h-3 mr-1" />
                                                        {project.name}
                                                    </Badge>
                                                ) : null;
                                            })()}
                                            {task.related_client_name && (
                                                <Badge variant="outline" className="text-xs">
                                                    <Users className="w-3 h-3 mr-1" />
                                                    {task.related_client_name}
                                                </Badge>
                                            )}
                                            {task.related_schedule_id && (
                                                <Badge variant="outline" className="text-xs">
                                                    <Briefcase className="w-3 h-3 mr-1" />
                                                    Servicio
                                                </Badge>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge className={priorityConfig[task.priority]?.color}>
                                            {priorityConfig[task.priority]?.label}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Badge className={statusConfig[task.status]?.color}>
                                            <StatusIcon className="w-3 h-3 mr-1" />
                                            {statusConfig[task.status]?.label}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1 text-sm text-slate-600">
                                            <CategoryIcon className="w-4 h-4" />
                                            <span className="hidden xl:inline">
                                                {categoryConfig[task.task_category]?.label || 'N/A'}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="sm">
                                                    <MoreVertical className="w-4 h-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-48">
                                                <DropdownMenuItem onClick={() => onViewTask(task)}>
                                                    <Eye className="w-4 h-4 mr-2" />
                                                    Ver Detalles
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => onEditTask(task)}>
                                                    <Edit className="w-4 h-4 mr-2" />
                                                    Editar
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                {task.status !== 'completed' && (
                                                    <DropdownMenuItem 
                                                        onClick={() => handleCompleteClick(task)}
                                                        className="text-green-600"
                                                    >
                                                        <CheckCircle className="w-4 h-4 mr-2" />
                                                        Completar
                                                    </DropdownMenuItem>
                                                )}
                                                {task.status === 'pending' && (
                                                    <DropdownMenuItem onClick={() => onStatusChange(task.id, 'in_progress')}>
                                                        <Clock className="w-4 h-4 mr-2" />
                                                        En Progreso
                                                    </DropdownMenuItem>
                                                )}
                                                {task.status !== 'cancelled' && (
                                                    <DropdownMenuItem 
                                                        onClick={() => onStatusChange(task.id, 'cancelled')}
                                                        className="text-red-600"
                                                    >
                                                        <XCircle className="w-4 h-4 mr-2" />
                                                        Cancelar
                                                    </DropdownMenuItem>
                                                )}
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem 
                                                    onClick={() => onDeleteTask(task)}
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