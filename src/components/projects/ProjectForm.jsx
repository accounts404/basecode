import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { 
  FolderPlus, 
  Palette,
  Save,
  X,
  Archive,
  RotateCcw
} from 'lucide-react';

const colorOptions = [
  { value: '#3b82f6', label: 'Azul' },
  { value: '#10b981', label: 'Verde' },
  { value: '#f59e0b', label: 'Amarillo' },
  { value: '#ef4444', label: 'Rojo' },
  { value: '#8b5cf6', label: 'Púrpura' },
  { value: '#ec4899', label: 'Rosa' },
  { value: '#06b6d4', label: 'Cyan' },
  { value: '#84cc16', label: 'Lima' },
  { value: '#f97316', label: 'Naranja' },
  { value: '#6366f1', label: 'Indigo' },
];

export default function ProjectForm({ 
  project, 
  onSave, 
  onCancel, 
  onArchive,
  onRestore,
  saving = false 
}) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#3b82f6',
    status: 'active'
  });

  useEffect(() => {
    if (project) {
      setFormData({
        name: project.name || '',
        description: project.description || '',
        color: project.color || '#3b82f6',
        status: project.status || 'active'
      });
    }
  }, [project]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    onSave(formData);
  };

  const isEditing = !!project?.id;
  const isArchived = project?.status === 'archived';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nombre del Proyecto *</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
          placeholder="Ej: Cambios Diciembre, Clientes por Bookear..."
          className="text-lg"
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descripción (opcional)</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          placeholder="Describe el propósito de este proyecto..."
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Palette className="w-4 h-4" />
          Color
        </Label>
        <div className="flex flex-wrap gap-2">
          {colorOptions.map(color => (
            <button
              key={color.value}
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, color: color.value }))}
              className={`w-8 h-8 rounded-full transition-all ${
                formData.color === color.value 
                  ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' 
                  : 'hover:scale-105'
              }`}
              style={{ backgroundColor: color.value }}
              title={color.label}
            />
          ))}
        </div>
      </div>

      {/* Preview */}
      <div className="p-4 bg-slate-50 rounded-lg border">
        <p className="text-sm text-slate-500 mb-2">Vista previa:</p>
        <div className="flex items-center gap-2">
          <div 
            className="w-4 h-4 rounded-full" 
            style={{ backgroundColor: formData.color }}
          />
          <span className="font-medium text-slate-900">
            {formData.name || 'Nombre del proyecto'}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t">
        <div>
          {isEditing && !isArchived && onArchive && (
            <Button 
              type="button" 
              variant="ghost" 
              onClick={onArchive}
              className="text-slate-500 hover:text-slate-700"
            >
              <Archive className="w-4 h-4 mr-2" />
              Archivar
            </Button>
          )}
          {isEditing && isArchived && onRestore && (
            <Button 
              type="button" 
              variant="ghost" 
              onClick={onRestore}
              className="text-green-600 hover:text-green-700"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Restaurar
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            <X className="w-4 h-4 mr-2" />
            Cancelar
          </Button>
          <Button 
            type="submit" 
            disabled={saving || !formData.name.trim()}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {saving ? (
              <>Guardando...</>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                {isEditing ? 'Guardar Cambios' : 'Crear Proyecto'}
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}