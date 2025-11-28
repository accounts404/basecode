import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
    FolderOpen, 
    Calendar, 
    CheckCircle2, 
    Clock, 
    MoreVertical,
    Edit,
    Trash2,
    ListChecks
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const STATUS_CONFIG = {
    active: { label: "Activo", className: "bg-green-100 text-green-800" },
    on_hold: { label: "En Pausa", className: "bg-yellow-100 text-yellow-800" },
    completed: { label: "Completado", className: "bg-blue-100 text-blue-800" },
    cancelled: { label: "Cancelado", className: "bg-red-100 text-red-800" }
};

const PRIORITY_CONFIG = {
    low: { label: "Baja", className: "bg-slate-100 text-slate-700" },
    medium: { label: "Media", className: "bg-blue-100 text-blue-700" },
    high: { label: "Alta", className: "bg-orange-100 text-orange-700" },
    urgent: { label: "Urgente", className: "bg-red-100 text-red-700" }
};

export default function ProjectCard({ 
    project, 
    taskStats, 
    isSelected, 
    onClick, 
    onEdit, 
    onDelete 
}) {
    const statusConfig = STATUS_CONFIG[project.status] || STATUS_CONFIG.active;
    const priorityConfig = PRIORITY_CONFIG[project.priority] || PRIORITY_CONFIG.medium;
    
    const totalTasks = taskStats?.total || 0;
    const completedTasks = taskStats?.completed || 0;
    const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return (
        <Card 
            className={`cursor-pointer transition-all hover:shadow-md ${
                isSelected 
                    ? 'ring-2 ring-offset-2 shadow-lg' 
                    : 'hover:border-slate-300'
            }`}
            style={{ 
                borderLeftWidth: '4px', 
                borderLeftColor: project.color || '#3b82f6',
                ...(isSelected && { ringColor: project.color || '#3b82f6' })
            }}
            onClick={() => onClick(project)}
        >
            <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        <FolderOpen 
                            className="w-5 h-5 flex-shrink-0" 
                            style={{ color: project.color || '#3b82f6' }}
                        />
                        <CardTitle className="text-base truncate">{project.name}</CardTitle>
                    </div>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreVertical className="w-4 h-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(project); }}>
                                <Edit className="w-4 h-4 mr-2" />
                                Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                                onClick={(e) => { e.stopPropagation(); onDelete(project); }}
                                className="text-red-600"
                            >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Eliminar
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {project.description && (
                    <p className="text-sm text-slate-600 line-clamp-2">{project.description}</p>
                )}

                <div className="flex flex-wrap gap-2">
                    <Badge className={statusConfig.className}>{statusConfig.label}</Badge>
                    <Badge className={priorityConfig.className}>{priorityConfig.label}</Badge>
                </div>

                {project.end_date && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Calendar className="w-3 h-3" />
                        <span>Vence: {format(new Date(project.end_date + 'T00:00:00'), 'd MMM yyyy', { locale: es })}</span>
                    </div>
                )}

                <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1 text-slate-600">
                            <ListChecks className="w-3 h-3" />
                            {completedTasks}/{totalTasks} tareas
                        </span>
                        <span className="font-medium" style={{ color: project.color || '#3b82f6' }}>
                            {progressPercent}%
                        </span>
                    </div>
                    <Progress 
                        value={progressPercent} 
                        className="h-1.5"
                        style={{ 
                            '--progress-foreground': project.color || '#3b82f6' 
                        }}
                    />
                </div>

                {taskStats?.pending > 0 && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Clock className="w-3 h-3" />
                        <span>{taskStats.pending} pendientes</span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}