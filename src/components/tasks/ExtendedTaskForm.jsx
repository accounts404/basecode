import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Calendar as CalendarIcon, 
  Save, 
  X, 
  Trash2, 
  AlertCircle,
  Plus,
  Minus,
  Users,
  Building2,
  CalendarClock,
  Info
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import ClientSearchCombobox from '@/components/work/ClientSearchCombobox';
import ServiceSearchCombobox from '@/components/tasks/ServiceSearchCombobox';

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Baja - Info general', color: 'bg-slate-100 text-slate-800' },
  { value: 'medium', label: 'Media - Normal', color: 'bg-blue-100 text-blue-800' },
  { value: 'high', label: 'Alta - Importante', color: 'bg-orange-100 text-orange-800' },
  { value: 'urgent', label: 'Urgente - Acción inmediata', color: 'bg-red-100 text-red-800' },
];

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'in_progress', label: 'En Progreso' },
  { value: 'completed', label: 'Completado' },
  { value: 'cancelled', label: 'Cancelado' },
];

const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'Sin recurrencia' },
  { value: 'daily', label: 'Diariamente' },
  { value: 'weekly', label: 'Semanalmente' },
  { value: 'biweekly', label: 'Cada 2 semanas' },
  { value: 'monthly', label: 'Mensualmente' },
  { value: 'linked_to_service', label: 'Vinculada a servicio (avanzado)' },
];

const CATEGORY_OPTIONS = [
  { value: 'operational', label: 'Operacional', description: 'Tareas operativas del día a día', icon: '⚙️' },
  { value: 'client_care', label: 'Atención al Cliente', description: 'Seguimiento y cuidado de clientes', icon: '👥' },
  { value: 'cleaner_support', label: 'Soporte Limpiadores', description: 'Asuntos relacionados con el equipo', icon: '🧹' },
  { value: 'fleet_logistics', label: 'Logística de Flota', description: 'Vehículos y logística', icon: '🚗' },
  { value: 'financial_admin', label: 'Admin Financiera', description: 'Facturación y pagos', icon: '💰' },
  { value: 'general_admin', label: 'Admin General', description: 'Tareas administrativas generales', icon: '📋' },
];

const DAYS_OF_WEEK = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
  { value: 0, label: 'Domingo' },
];

export default function ExtendedTaskForm({ task, users, clients, schedules, currentUser, onSave, onDelete, onCancel }) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    due_date: format(new Date(), 'yyyy-MM-dd'),
    priority: 'medium',
    status: 'pending',
    recurrence_type: 'none',
    recurring_day_of_week: null,
    recurring_day_of_month: null,
    assignee_user_ids: [],
    related_client_id: null,
    related_client_name: null,
    related_schedule_id: null,
    task_category: 'general_admin',
    checklist_items: [],
  });

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());

  useEffect(() => {
    if (task) {
      setFormData({
        title: task.title || '',
        description: task.description || '',
        due_date: task.due_date || format(new Date(), 'yyyy-MM-dd'),
        priority: task.priority || 'medium',
        status: task.status || 'pending',
        recurrence_type: task.recurrence_type || 'none',
        recurring_day_of_week: task.recurring_day_of_week || null,
        recurring_day_of_month: task.recurring_day_of_month || null,
        assignee_user_ids: task.assignee_user_ids || [],
        related_client_id: task.related_client_id || null,
        related_client_name: task.related_client_name || null,
        related_schedule_id: task.related_schedule_id || null,
        task_category: task.task_category || 'general_admin',
        checklist_items: task.checklist_items || [],
      });
      setSelectedDate(new Date(task.due_date));
    }
  }, [task]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAssigneeToggle = (userId) => {
    setFormData(prev => ({
      ...prev,
      assignee_user_ids: prev.assignee_user_ids.includes(userId)
        ? prev.assignee_user_ids.filter(id => id !== userId)
        : [...prev.assignee_user_ids, userId]
    }));
  };

  const handleDateSelect = (date) => {
    setSelectedDate(date);
    setFormData(prev => ({ ...prev, due_date: format(date, 'yyyy-MM-dd') }));
  };

  const handleClientSelect = (client) => {
    setFormData(prev => ({ 
      ...prev, 
      related_client_id: client?.id || null,
      related_client_name: client?.name || null
    }));
  };

  const handleScheduleSelect = (schedule) => {
    setFormData(prev => ({
      ...prev,
      related_schedule_id: schedule?.id || null,
      related_client_id: schedule?.client_id || prev.related_client_id,
      related_client_name: schedule?.client_name || prev.related_client_name,
      // Si se vincula a un servicio con recurrencia, ofrecer usar esa recurrencia
      recurrence_type: schedule?.recurrence_rule && schedule.recurrence_rule !== 'none' 
        ? 'linked_to_service' 
        : prev.recurrence_type
    }));
  };

  const handleAddChecklistItem = () => {
    setFormData(prev => ({
      ...prev,
      checklist_items: [...prev.checklist_items, { description: '', completed: false }]
    }));
  };

  const handleRemoveChecklistItem = (index) => {
    setFormData(prev => ({
      ...prev,
      checklist_items: prev.checklist_items.filter((_, i) => i !== index)
    }));
  };

  const handleChecklistItemChange = (index, value) => {
    setFormData(prev => ({
      ...prev,
      checklist_items: prev.checklist_items.map((item, i) => 
        i === index ? { ...item, description: value } : item
      )
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.title.trim()) {
      setError('El título es obligatorio');
      return;
    }

    if (!formData.due_date) {
      setError('La fecha límite es obligatoria');
      return;
    }

    // Validaciones de recurrencia
    if (formData.recurrence_type === 'weekly' && !formData.recurring_day_of_week) {
      setError('Debes seleccionar un día de la semana para tareas semanales');
      return;
    }

    if (formData.recurrence_type === 'monthly' && !formData.recurring_day_of_month) {
      setError('Debes especificar un día del mes para tareas mensuales');
      return;
    }

    if (formData.recurrence_type === 'linked_to_service' && !formData.related_schedule_id) {
      setError('Debes seleccionar un servicio para vincular la recurrencia');
      return;
    }

    setSaving(true);
    try {
      // Limpiar checklist items vacíos
      const cleanedData = {
        ...formData,
        checklist_items: formData.checklist_items.filter(item => item.description.trim() !== '')
      };

      await onSave(cleanedData);
    } catch (error) {
      console.error('Error saving task:', error);
      setError(error.message || 'Error al guardar la tarea');
    } finally {
      setSaving(false);
    }
  };

  const selectedClient = clients.find(c => c.id === formData.related_client_id);
  const selectedSchedule = schedules.find(s => s.id === formData.related_schedule_id);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Información Básica */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-slate-900">Información Básica</h3>
        
        <div className="space-y-2">
          <Label htmlFor="title">Título *</Label>
          <Input
            id="title"
            name="title"
            value={formData.title}
            onChange={handleInputChange}
            placeholder="Ej: Confirmar servicio con Cliente X"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Descripción</Label>
          <Textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            placeholder="Detalles adicionales sobre la tarea..."
            rows={3}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="priority">Prioridad</Label>
            <Select
              value={formData.priority}
              onValueChange={(value) => setFormData(prev => ({ ...prev, priority: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    <span className={`px-2 py-1 rounded ${option.color}`}>
                      {option.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Estado</Label>
            <Select
              value={formData.status}
              onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="task_category">Categoría</Label>
          <Select
            value={formData.task_category}
            onValueChange={(value) => setFormData(prev => ({ ...prev, task_category: value }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  <div className="flex items-center gap-2">
                    <span>{option.icon}</span>
                    <div>
                      <p className="font-medium">{option.label}</p>
                      <p className="text-xs text-slate-500">{option.description}</p>
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Fecha y Recurrencia */}
      <div className="space-y-4 border-t pt-4">
        <h3 className="text-lg font-semibold text-slate-900">Fecha y Recurrencia</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Fecha Límite *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(selectedDate, "d 'de' MMMM, yyyy", { locale: es })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={handleDateSelect}
                  initialFocus
                  locale={es}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label htmlFor="recurrence_type">Tipo de Recurrencia</Label>
            <Select
              value={formData.recurrence_type}
              onValueChange={(value) => setFormData(prev => ({ ...prev, recurrence_type: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECURRENCE_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Opciones específicas de recurrencia */}
        {formData.recurrence_type === 'weekly' && (
          <div className="space-y-2">
            <Label>Día de la Semana *</Label>
            <Select
              value={formData.recurring_day_of_week?.toString() || ''}
              onValueChange={(value) => setFormData(prev => ({ ...prev, recurring_day_of_week: parseInt(value) }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un día..." />
              </SelectTrigger>
              <SelectContent>
                {DAYS_OF_WEEK.map(day => (
                  <SelectItem key={day.value} value={day.value.toString()}>
                    {day.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">
              Ejemplo: Si eliges "Jueves", la tarea se repetirá todos los jueves
            </p>
          </div>
        )}

        {formData.recurrence_type === 'biweekly' && (
          <div className="space-y-2">
            <Label>Día de la Semana (Opcional)</Label>
            <Select
              value={formData.recurring_day_of_week?.toString() || ''}
              onValueChange={(value) => setFormData(prev => ({ ...prev, recurring_day_of_week: value ? parseInt(value) : null }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Usar día de la fecha límite" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>Usar día de la fecha límite</SelectItem>
                {DAYS_OF_WEEK.map(day => (
                  <SelectItem key={day.value} value={day.value.toString()}>
                    {day.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {formData.recurrence_type === 'monthly' && (
          <div className="space-y-2">
            <Label htmlFor="recurring_day_of_month">Día del Mes (1-31) *</Label>
            <Input
              id="recurring_day_of_month"
              type="number"
              min="1"
              max="31"
              value={formData.recurring_day_of_month || ''}
              onChange={(e) => setFormData(prev => ({ 
                ...prev, 
                recurring_day_of_month: e.target.value ? parseInt(e.target.value) : null 
              }))}
              placeholder="Ej: 15 para el día 15 de cada mes"
            />
            <p className="text-xs text-slate-500">
              La tarea se repetirá el mismo día de cada mes
            </p>
          </div>
        )}

        {formData.recurrence_type === 'linked_to_service' && (
          <Alert className="bg-purple-50 border-purple-200">
            <Info className="h-4 w-4 text-purple-600" />
            <AlertDescription className="text-purple-800">
              <strong>Modo Avanzado:</strong> Esta tarea seguirá automáticamente el patrón de recurrencia del servicio que selecciones abajo. 
              Si el servicio se repite semanalmente, la tarea también lo hará.
            </AlertDescription>
          </Alert>
        )}

        {formData.recurrence_type !== 'none' && formData.recurrence_type !== 'linked_to_service' && !task?.id && (
          <Alert className="bg-blue-50 border-blue-200">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              Al guardar, se generarán automáticamente tareas para los próximos 6 meses siguiendo este patrón.
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Asignación */}
      <div className="space-y-4 border-t pt-4">
        <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <Users className="w-5 h-5" />
          Asignar Administradores
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {users.map(user => (
            <div
              key={user.id}
              className={`flex items-center space-x-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                formData.assignee_user_ids.includes(user.id)
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
              onClick={() => handleAssigneeToggle(user.id)}
            >
              <Checkbox
                checked={formData.assignee_user_ids.includes(user.id)}
                onCheckedChange={() => handleAssigneeToggle(user.id)}
              />
              <Avatar className="w-8 h-8">
                <AvatarImage src={user.profile_photo_url} />
                <AvatarFallback>
                  {user.full_name?.charAt(0)?.toUpperCase() || '?'}
                </AvatarFallback>
              </Avatar>
              <span className="font-medium text-slate-900">{user.full_name}</span>
            </div>
          ))}
        </div>

        {formData.assignee_user_ids.length === 0 && (
          <Alert className="bg-amber-50 border-amber-200">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              Esta tarea no tiene asignados. Considera asignarla a alguien para mejor seguimiento.
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Vinculación con Cliente/Servicio */}
      <div className="space-y-4 border-t pt-4">
        <h3 className="text-lg font-semibold text-slate-900">Vinculación (Opcional)</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Cliente Relacionado
            </Label>
            <ClientSearchCombobox
              clients={clients}
              selectedClient={selectedClient}
              onClientSelect={handleClientSelect}
              placeholder="Buscar cliente..."
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4" />
              Servicio Relacionado
            </Label>
            <ServiceSearchCombobox
              schedules={schedules}
              selectedSchedule={selectedSchedule}
              onScheduleSelect={handleScheduleSelect}
              placeholder="Buscar servicio..."
            />
          </div>
        </div>

        {formData.related_schedule_id && selectedSchedule && (
          <Alert className="bg-green-50 border-green-200">
            <Info className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              <strong>Servicio vinculado:</strong> {selectedSchedule.client_name} - {format(new Date(selectedSchedule.start_time), "PPP 'a las' HH:mm", { locale: es })}
              {selectedSchedule.recurrence_rule && selectedSchedule.recurrence_rule !== 'none' && (
                <span className="block mt-1">
                  Este servicio tiene recurrencia <strong>{selectedSchedule.recurrence_rule}</strong>. 
                  Puedes usar "Vinculada a servicio" para que la tarea siga el mismo patrón.
                </span>
              )}
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Checklist */}
      <div className="space-y-4 border-t pt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Checklist (Opcional)</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddChecklistItem}
          >
            <Plus className="w-4 h-4 mr-2" />
            Añadir Item
          </Button>
        </div>

        {formData.checklist_items.length > 0 && (
          <div className="space-y-2">
            {formData.checklist_items.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  value={item.description}
                  onChange={(e) => handleChecklistItemChange(index, e.target.value)}
                  placeholder={`Item ${index + 1}...`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveChecklistItem(index)}
                >
                  <Minus className="w-4 h-4 text-red-600" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Botones de Acción */}
      <div className="flex justify-between items-center pt-6 border-t">
        <div>
          {onDelete && task?.id && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => onDelete(task.id)}
              disabled={saving}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Eliminar
            </Button>
          )}
        </div>

        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={saving}
          >
            <X className="w-4 h-4 mr-2" />
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                {task?.id ? 'Guardar Cambios' : 'Crear Tarea'}
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}