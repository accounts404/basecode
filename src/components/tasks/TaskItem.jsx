import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckSquare, Square, Clock, AlertCircle, Flag, RotateCcw } from "lucide-react";

export default function TaskItem({ task, onClick, onToggleStatus }) {
    const getPriorityColor = (priority) => {
        switch (priority) {
            case 'urgent': return 'bg-red-100 text-red-800 border-red-200';
            case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
            case 'medium': return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'low': return 'bg-slate-100 text-slate-600 border-slate-200';
            default: return 'bg-slate-100 text-slate-600 border-slate-200';
        }
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'completed': return <CheckSquare className="w-5 h-5 text-green-600" />;
            case 'in_progress': return <AlertCircle className="w-5 h-5 text-blue-600 animate-pulse" />;
            case 'cancelled': return <Square className="w-5 h-5 text-slate-400" />;
            default: return <Square className="w-5 h-5 text-slate-400" />;
        }
    };

    const getPriorityLabel = (priority) => {
        switch (priority) {
            case 'urgent': return 'Urgente';
            case 'high': return 'Alta';
            case 'medium': return 'Media';
            case 'low': return 'Baja';
            default: 'Media';
        }
    };

    const handleToggleComplete = (e) => {
        e.stopPropagation(); // Prevent triggering the card click
        const newStatus = task.status === 'completed' ? 'pending' : 'completed';
        onToggleStatus(task.id, newStatus);
    };

    const isCompleted = task.status === 'completed';
    const isCancelled = task.status === 'cancelled';

    return (
        <Card 
            className={`cursor-pointer transition-all duration-200 hover:shadow-md hover:border-blue-300 ${
                isCompleted ? 'bg-green-50/70 border-green-200' : 
                isCancelled ? 'bg-slate-100 border-slate-300 opacity-70' : 
                'bg-white'
            }`}
            onClick={() => onClick(task)}
        >
            <CardContent className="p-2">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="p-1 h-8 w-8 flex-shrink-0 hover:bg-slate-200 rounded-full"
                            onClick={handleToggleComplete}
                        >
                            {getStatusIcon(task.status)}
                        </Button>
                        
                        <div className="flex-1 min-w-0">
                            <h3 className={`font-medium text-sm truncate ${
                                isCompleted ? 'line-through text-slate-500' : 
                                isCancelled ? 'line-through text-slate-400' : 
                                'text-slate-800'
                            }`}>
                                {task.title}
                            </h3>
                            
                            <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className={`text-xs px-1.5 py-0.5 ${getPriorityColor(task.priority)}`}>
                                    <Flag className="w-3 h-3 mr-1" />
                                    {getPriorityLabel(task.priority)}
                                </Badge>
                                
                                {task.recurrence_type !== 'none' && (
                                    <Badge variant="outline" className="text-xs px-1.5 py-0.5 text-purple-600 bg-purple-50 border-purple-200">
                                        <RotateCcw className="w-3 h-3 mr-1" />
                                        Recurrente
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}