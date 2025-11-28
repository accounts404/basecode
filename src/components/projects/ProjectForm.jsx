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
import { Calendar as CalendarIcon, Palette, Trash2, FolderPlus, Save } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const PROJECT_COLORS = [
    { value: "#3b82f6", label: "Azul" },
    { value: "#10b981", label: "Verde" },
    { value: "#f59e0b", label: "Naranja" },
    { value: "#ef4444", label: "Rojo" },
    { value: "#8b5cf6", label: "Violeta" },
    { value: "#ec4899", label: "Rosa" },
    { value: "#06b6d4", label: "Cyan" },
    { value: "#84cc16", label: "Lima" },
    { value: "#6366f1", label: "Índigo" },
    { value: "#64748b", label: "Gris" }
];

const STATUS_OPTIONS = [
    { value: "active", label: "Activo" },
    { value: "on_hold", label: "En Pausa" },
    { value: "completed", label: "Completado" },
    { value: "cancelled", label: "Cancelado" }
];

const PRIORITY_OPTIONS = [
    { value: "low", label: "Baja" },
    { value: "medium", label: "Media" },
    { value: "high", label: "Alta" },
    { value: "urgent", label: "Urgente" }
];

export default function ProjectForm({ project, onSave, onCancel, onDelete }) {
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        status: "active",
        priority: "medium",
        start_date: null,
        end_date: null,
        color: "#3b82f6"
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (project) {
            setFormData({
                name: project.name || "",
                description: project.description || "",
                status: project.status || "active",
                priority: project.priority || "medium",
                start_date: project.start_date ? new Date(project.start_date + 'T00:00:00') : null,
                end_date: project.end_date ? new Date(project.end_date + 'T00:00:00') : null,
                color: project.color || "#3b82f6"
            });
        } else {
            setFormData({
                name: "",
                description: "",
                status: "active",
                priority: "medium",
                start_date: null,
                end_date: null,
                color: "#3b82f6"
            });
        }
    }, [project]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);

        if (!formData.name.trim()) {
            setError("El nombre del proyecto es obligatorio");
            return;
        }

        setSaving(true);
        try {
            const formatDate = (date) => {
                if (!date) return null;
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };

            const projectData = {
                ...formData,
                start_date: formatDate(formData.start_date),
                end_date: formatDate(formData.end_date)
            };

            await onSave(projectData);
        } catch (err) {
            setError(err.message || "Error al guardar el proyecto");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!project?.id) return;
        const confirmed = window.confirm("¿Estás seguro de eliminar este proyecto? Las tareas asociadas NO serán eliminadas.");
        if (confirmed) {
            try {
                await onDelete(project.id);
            } catch (err) {
                setError(err.message || "Error al eliminar el proyecto");
            }
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <div className="space-y-2">
                <Label htmlFor="name">Nombre del Proyecto *</Label>
                <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ej: Lanzamiento Nueva Funcionalidad"
                    className="text-lg"
                    required
                />
            </div>

            <div className="space-y-2">
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Describe el objetivo y alcance del proyecto..."
                    className="h-24"
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                    <Label>Estado</Label>
                    <Select
                        value={formData.status}
                        onValueChange={(value) => setFormData({ ...formData, status: value })}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {STATUS_OPTIONS.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label>Prioridad</Label>
                    <Select
                        value={formData.priority}
                        onValueChange={(value) => setFormData({ ...formData, priority: value })}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {PRIORITY_OPTIONS.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                        <Palette className="w-4 h-4" />
                        Color
                    </Label>
                    <Select
                        value={formData.color}
                        onValueChange={(value) => setFormData({ ...formData, color: value })}
                    >
                        <SelectTrigger>
                            <SelectValue>
                                <div className="flex items-center gap-2">
                                    <div 
                                        className="w-4 h-4 rounded-full" 
                                        style={{ backgroundColor: formData.color }}
                                    />
                                    {PROJECT_COLORS.find(c => c.value === formData.color)?.label || 'Color'}
                                </div>
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            {PROJECT_COLORS.map(color => (
                                <SelectItem key={color.value} value={color.value}>
                                    <div className="flex items-center gap-2">
                                        <div 
                                            className="w-4 h-4 rounded-full" 
                                            style={{ backgroundColor: color.value }}
                                        />
                                        {color.label}
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Fecha de Inicio</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start text-left">
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {formData.start_date 
                                    ? format(formData.start_date, 'PPP', { locale: es }) 
                                    : 'Sin fecha de inicio'}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                            <Calendar
                                mode="single"
                                selected={formData.start_date}
                                onSelect={(date) => setFormData({ ...formData, start_date: date })}
                                locale={es}
                            />
                        </PopoverContent>
                    </Popover>
                </div>

                <div className="space-y-2">
                    <Label>Fecha de Fin Prevista</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start text-left">
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {formData.end_date 
                                    ? format(formData.end_date, 'PPP', { locale: es }) 
                                    : 'Sin fecha de fin'}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                            <Calendar
                                mode="single"
                                selected={formData.end_date}
                                onSelect={(date) => setFormData({ ...formData, end_date: date })}
                                locale={es}
                            />
                        </PopoverContent>
                    </Popover>
                </div>
            </div>

            <div className="flex justify-between pt-4 border-t">
                <div>
                    {project?.id && onDelete && (
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={handleDelete}
                            disabled={saving}
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Eliminar Proyecto
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
                            <>
                                {project?.id ? <Save className="w-4 h-4 mr-2" /> : <FolderPlus className="w-4 h-4 mr-2" />}
                                {project?.id ? 'Actualizar' : 'Crear Proyecto'}
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </form>
    );
}