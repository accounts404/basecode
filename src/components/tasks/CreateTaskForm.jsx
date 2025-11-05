import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar as CalendarIcon, AlertCircle, CheckSquare, Clock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function CreateTaskForm({ task, onSave, onCancel, onDelete }) {
    const [formData, setFormData] = useState({
        title: "",
        description: "",
        due_date: new Date(),
        priority: "medium",
        status: "pending",
        recurrence_type: "none"
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (task) {
            setFormData({
                title: task.title || "",
                description: task.description || "",
                due_date: task.due_date ? new Date(task.due_date + 'T00:00:00') : new Date(),
                priority: task.priority || "medium",
                status: task.status || "pending",
                recurrence_type: task.recurrence_type || "none"
            });
        } else {
            // Reset form for new task
            setFormData({
                title: "",
                description: "",
                due_date: new Date(),
                priority: "medium",
                status: "pending",
                recurrence_type: "none"
            });
        }
    }, [task]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);

        if (!formData.title.trim()) {
            setError("El título de la tarea es obligatorio");
            return;
        }

        setSaving(true);
        try {
            // Formatear la fecha en zona horaria local como YYYY-MM-DD
            const year = formData.due_date.getFullYear();
            const month = String(formData.due_date.getMonth() + 1).padStart(2, '0');
            const day = String(formData.due_date.getDate()).padStart(2, '0');
            const localDateString = `${year}-${month}-${day}`;
            
            const taskData = {
                ...formData,
                due_date: localDateString
            };
            
            await onSave(taskData);
        } catch (err) {
            setError(err.message || "Error al guardar la tarea");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!task?.id) return;
        
        const confirmed = window.confirm("¿Estás seguro de que deseas eliminar esta tarea?");
        if (confirmed) {
            try {
                await onDelete(task.id);
            } catch (err) {
                setError(err.message || "Error al eliminar la tarea");
            }
        }
    };

    const priorityOptions = [
        { value: "low", label: "Baja", color: "text-slate-600" },
        { value: "medium", label: "Media", color: "text-blue-600" },
        { value: "high", label: "Alta", color: "text-orange-600" },
        { value: "urgent", label: "Urgente", color: "text-red-600" }
    ];

    const statusOptions = [
        { value: "pending", label: "Pendiente", icon: Clock },
        { value: "in_progress", label: "En Progreso", icon: AlertCircle },
        { value: "completed", label: "Completada", icon: CheckSquare },
        { value: "cancelled", label: "Cancelada", icon: AlertCircle }
    ];

    const recurrenceOptions = [
        { value: "none", label: "Sin recurrencia" },
        { value: "daily", label: "Diario" },
        { value: "weekly", label: "Semanal" },
        { value: "biweekly", label: "Cada 2 semanas" },
        { value: "monthly", label: "Mensual" }
    ];

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <div className="space-y-2">
                <Label htmlFor="title">Título de la Tarea *</Label>
                <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                    placeholder="¿Qué necesitas recordar?"
                    className="text-lg"
                    required
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    placeholder="Detalles adicionales sobre la tarea..."
                    className="h-24"
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Fecha</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start text-left">
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {formData.due_date ? format(formData.due_date, 'PPP', { locale: es }) : 'Seleccionar fecha'}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                            <Calendar
                                mode="single"
                                selected={formData.due_date}
                                onSelect={(date) => setFormData({...formData, due_date: date})}
                                locale={es}
                            />
                        </PopoverContent>
                    </Popover>
                </div>

                <div className="space-y-2">
                    <Label>Prioridad</Label>
                    <Select
                        value={formData.priority}
                        onValueChange={(value) => setFormData({...formData, priority: value})}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Seleccionar prioridad" />
                        </SelectTrigger>
                        <SelectContent>
                            {priorityOptions.map(option => (
                                <SelectItem key={option.value} value={option.value}>
                                    <span className={option.color}>{option.label}</span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {task && (
                    <div className="space-y-2">
                        <Label>Estado</Label>
                        <Select
                            value={formData.status}
                            onValueChange={(value) => setFormData({...formData, status: value})}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Seleccionar estado" />
                            </SelectTrigger>
                            <SelectContent>
                                {statusOptions.map(option => {
                                    const Icon = option.icon;
                                    return (
                                        <SelectItem key={option.value} value={option.value}>
                                            <div className="flex items-center gap-2">
                                                <Icon className="w-4 h-4" />
                                                {option.label}
                                            </div>
                                        </SelectItem>
                                    );
                                })}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                <div className="space-y-2">
                    <Label>Recurrencia</Label>
                    <Select
                        value={formData.recurrence_type}
                        onValueChange={(value) => setFormData({...formData, recurrence_type: value})}
                        disabled={!!task} // Disable recurrence editing for existing tasks
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Seleccionar recurrencia" />
                        </SelectTrigger>
                        <SelectContent>
                            {recurrenceOptions.map(option => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {formData.recurrence_type !== 'none' && !task && (
                <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                        Se crearán tareas recurrentes por los próximos 6 meses basándose en la frecuencia seleccionada.
                    </AlertDescription>
                </Alert>
            )}

            <div className="flex justify-between pt-4">
                <div>
                    {task && onDelete && (
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={handleDelete}
                            disabled={saving}
                        >
                            Eliminar Tarea
                        </Button>
                    )}
                </div>
                
                <div className="flex gap-3">
                    <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
                        Cancelar
                    </Button>
                    <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                        {saving ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                                Guardando...
                            </>
                        ) : (
                            task ? 'Actualizar Tarea' : 'Crear Tarea'
                        )}
                    </Button>
                </div>
            </div>
        </form>
    );
}