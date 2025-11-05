import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckSquare, Clock, AlertTriangle, Calendar, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import TaskItem from "./TaskItem";

export default function TaskList({ user, tasks, selectedDate, onTaskClick, onToggleTaskStatus }) {
    const [isCollapsed, setIsCollapsed] = useState(true);

    // Filter and sort tasks for the selected date
    const tasksForDate = useMemo(() => {
        // Formatear la fecha seleccionada como YYYY-MM-DD en zona local
        const year = selectedDate.getFullYear();
        const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
        const day = String(selectedDate.getDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${day}`;
        
        return tasks
            .filter(task => task.due_date === dateString)
            .sort((a, b) => {
                // Sort by priority (urgent first), then by status (pending first), then by title
                const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
                const statusOrder = { pending: 0, in_progress: 1, completed: 2, cancelled: 3 };
                
                if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
                    return priorityOrder[a.priority] - priorityOrder[b.priority];
                }
                
                if (statusOrder[a.status] !== statusOrder[b.status]) {
                    return statusOrder[a.status] - statusOrder[b.status];
                }
                
                return a.title.localeCompare(b.title);
            });
    }, [tasks, selectedDate]);

    // Calculate task statistics
    const stats = useMemo(() => {
        return {
            total: tasksForDate.length,
            completed: tasksForDate.filter(t => t.status === 'completed').length,
            pending: tasksForDate.filter(t => t.status === 'pending').length,
            inProgress: tasksForDate.filter(t => t.status === 'in_progress').length,
            urgent: tasksForDate.filter(t => t.priority === 'urgent' && t.status !== 'completed').length
        };
    }, [tasksForDate]);

    // Para no administradores, no mostrar nada en absoluto si no hay tareas.
    if (user?.role !== 'admin') {
        const year = selectedDate.getFullYear();
        const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
        const day = String(selectedDate.getDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${day}`;
        const hasTasksOverallForDate = tasks.some(task => task.due_date === dateString);
        if (!hasTasksOverallForDate) return null;
    }
    
    const hasTasksForDate = tasksForDate.length > 0;

    return (
        <Card className="bg-white border-slate-200">
            {/* Header siempre visible */}
            <CardHeader 
                className="py-3 px-4 cursor-pointer" 
                onClick={() => setIsCollapsed(!isCollapsed)}
            >
                <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                        <CheckSquare className="w-5 h-5 text-blue-600" />
                        Tareas del Día
                        {hasTasksForDate && <Badge variant="secondary">{stats.total}</Badge>}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                        {hasTasksForDate && stats.urgent > 0 && (
                            <Badge className="bg-red-100 text-red-800 flex items-center gap-1 text-xs">
                                <AlertTriangle className="w-3 h-3" />
                                {stats.urgent} Urgente{stats.urgent > 1 ? 's' : ''}
                            </Badge>
                        )}
                        <Button variant="ghost" size="sm" className="p-1 h-auto">
                            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                        </Button>
                    </div>
                </div>
                
                {isCollapsed && hasTasksForDate && (
                     <div className="text-xs text-slate-600 mt-1">
                        {stats.completed} de {stats.total} completadas. {stats.pending + stats.inProgress} pendiente(s).
                    </div>
                )}
            </CardHeader>
            
            {/* El contenido ahora tiene una altura fija y se muestra u oculta con overflow */}
            <div 
                className="transition-all duration-300 ease-in-out overflow-hidden"
                style={{ height: isCollapsed ? '0px' : (hasTasksForDate ? '266px' : '100px') }}
            >
                <CardContent className="pt-0 px-2 pb-2 h-full">
                    {hasTasksForDate ? (
                        <div className="space-y-2 h-full overflow-y-auto pr-2">
                            {tasksForDate.map(task => (
                                <TaskItem
                                    key={task.id}
                                    task={task}
                                    onClick={onTaskClick}
                                    onToggleStatus={onToggleTaskStatus}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center p-4">
                            <Calendar className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                            <p className="text-slate-600 font-medium text-sm">No hay tareas para esta fecha</p>
                        </div>
                    )}
                </CardContent>
            </div>
        </Card>
    );
}