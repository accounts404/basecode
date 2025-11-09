import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Search, X, Filter, UserCheck } from 'lucide-react';
import ClientSearchCombobox from '@/components/work/ClientSearchCombobox';

const CATEGORIES = [
  { value: 'operational', label: 'Operacional', color: 'bg-blue-100 text-blue-800' },
  { value: 'client_care', label: 'Atención al Cliente', color: 'bg-green-100 text-green-800' },
  { value: 'cleaner_support', label: 'Soporte Limpiadores', color: 'bg-purple-100 text-purple-800' },
  { value: 'fleet_logistics', label: 'Logística de Flota', color: 'bg-orange-100 text-orange-800' },
  { value: 'financial_admin', label: 'Admin Financiera', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'general_admin', label: 'Admin General', color: 'bg-slate-100 text-slate-800' },
];

const STATUSES = [
  { value: 'pending', label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'in_progress', label: 'En Progreso', color: 'bg-blue-100 text-blue-800' },
  { value: 'completed', label: 'Completado', color: 'bg-green-100 text-green-800' },
  { value: 'cancelled', label: 'Cancelado', color: 'bg-red-100 text-red-800' },
];

const PRIORITIES = [
  { value: 'low', label: 'Baja', color: 'bg-slate-100 text-slate-800' },
  { value: 'medium', label: 'Media', color: 'bg-blue-100 text-blue-800' },
  { value: 'high', label: 'Alta', color: 'bg-orange-100 text-orange-800' },
  { value: 'urgent', label: 'Urgente', color: 'bg-red-100 text-red-800' },
];

const DATE_RANGES = [
  { value: 'all', label: 'Todas las fechas' },
  { value: 'overdue', label: 'Atrasadas' },
  { value: 'today', label: 'Hoy' },
  { value: 'week', label: 'Esta semana' },
  { value: 'month', label: 'Este mes' },
];

export default function TaskFilters({ filters, onFiltersChange, users, clients, schedules }) {
  const handleAssigneeToggle = (userId) => {
    const newAssignees = filters.assignees.includes(userId)
      ? filters.assignees.filter(id => id !== userId)
      : [...filters.assignees, userId];
    onFiltersChange({ ...filters, assignees: newAssignees });
  };

  const handleCategoryToggle = (category) => {
    const newCategories = filters.categories.includes(category)
      ? filters.categories.filter(c => c !== category)
      : [...filters.categories, category];
    onFiltersChange({ ...filters, categories: newCategories });
  };

  const handleStatusToggle = (status) => {
    const newStatuses = filters.statuses.includes(status)
      ? filters.statuses.filter(s => s !== status)
      : [...filters.statuses, status];
    onFiltersChange({ ...filters, statuses: newStatuses });
  };

  const handlePriorityToggle = (priority) => {
    const newPriorities = filters.priorities.includes(priority)
      ? filters.priorities.filter(p => p !== priority)
      : [...filters.priorities, priority];
    onFiltersChange({ ...filters, priorities: newPriorities });
  };

  const handleClientSelect = (client) => {
    onFiltersChange({ ...filters, clientId: client?.id || null });
  };

  const handleReset = () => {
    onFiltersChange({
      assignees: [],
      clientId: null,
      scheduleId: null,
      categories: [],
      statuses: ['pending', 'in_progress'],
      priorities: [],
      dateRange: 'all',
      searchTerm: ''
    });
  };

  const selectedClient = clients.find(c => c.id === filters.clientId);
  const activeFilterCount = 
    filters.assignees.length +
    (filters.clientId ? 1 : 0) +
    filters.categories.length +
    (filters.statuses.length !== 2 ? 1 : 0) +
    filters.priorities.length +
    (filters.dateRange !== 'all' ? 1 : 0);

  return (
    <div className="space-y-4">
      {/* Búsqueda */}
      <div className="flex gap-3 items-center">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input
            placeholder="Buscar tareas por título o descripción..."
            value={filters.searchTerm}
            onChange={(e) => onFiltersChange({ ...filters, searchTerm: e.target.value })}
            className="pl-10"
          />
        </div>
        {activeFilterCount > 0 && (
          <Button variant="outline" onClick={handleReset} className="flex items-center gap-2">
            <X className="w-4 h-4" />
            Limpiar {activeFilterCount} filtro{activeFilterCount !== 1 ? 's' : ''}
          </Button>
        )}
      </div>

      {/* Filtros principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Asignados */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="justify-start">
              <UserCheck className="w-4 h-4 mr-2" />
              Asignados {filters.assignees.length > 0 && `(${filters.assignees.length})`}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="space-y-3">
              <h4 className="font-semibold text-sm">Filtrar por asignado</h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {users.map(user => (
                  <div key={user.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`assignee-${user.id}`}
                      checked={filters.assignees.includes(user.id)}
                      onCheckedChange={() => handleAssigneeToggle(user.id)}
                    />
                    <label
                      htmlFor={`assignee-${user.id}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {user.full_name}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Cliente */}
        <div>
          <ClientSearchCombobox
            clients={clients}
            selectedClient={selectedClient}
            onClientSelect={handleClientSelect}
            placeholder="Filtrar por cliente..."
          />
        </div>

        {/* Rango de fecha */}
        <Select value={filters.dateRange} onValueChange={(value) => onFiltersChange({ ...filters, dateRange: value })}>
          <SelectTrigger>
            <SelectValue placeholder="Rango de fecha" />
          </SelectTrigger>
          <SelectContent>
            {DATE_RANGES.map(range => (
              <SelectItem key={range.value} value={range.value}>
                {range.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Más filtros */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="justify-start">
              <Filter className="w-4 h-4 mr-2" />
              Más Filtros
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-96">
            <div className="space-y-4">
              {/* Categorías */}
              <div>
                <h4 className="font-semibold text-sm mb-3">Categorías</h4>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map(cat => (
                    <Badge
                      key={cat.value}
                      variant={filters.categories.includes(cat.value) ? 'default' : 'outline'}
                      className={`cursor-pointer ${filters.categories.includes(cat.value) ? cat.color : ''}`}
                      onClick={() => handleCategoryToggle(cat.value)}
                    >
                      {cat.label}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Estados */}
              <div>
                <h4 className="font-semibold text-sm mb-3">Estados</h4>
                <div className="flex flex-wrap gap-2">
                  {STATUSES.map(status => (
                    <Badge
                      key={status.value}
                      variant={filters.statuses.includes(status.value) ? 'default' : 'outline'}
                      className={`cursor-pointer ${filters.statuses.includes(status.value) ? status.color : ''}`}
                      onClick={() => handleStatusToggle(status.value)}
                    >
                      {status.label}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Prioridades */}
              <div>
                <h4 className="font-semibold text-sm mb-3">Prioridades</h4>
                <div className="flex flex-wrap gap-2">
                  {PRIORITIES.map(priority => (
                    <Badge
                      key={priority.value}
                      variant={filters.priorities.includes(priority.value) ? 'default' : 'outline'}
                      className={`cursor-pointer ${filters.priorities.includes(priority.value) ? priority.color : ''}`}
                      onClick={() => handlePriorityToggle(priority.value)}
                    >
                      {priority.label}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Filtros activos */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.assignees.map(assigneeId => {
            const user = users.find(u => u.id === assigneeId);
            return user ? (
              <Badge key={assigneeId} variant="secondary" className="flex items-center gap-1">
                {user.full_name}
                <X 
                  className="w-3 h-3 cursor-pointer" 
                  onClick={() => handleAssigneeToggle(assigneeId)}
                />
              </Badge>
            ) : null;
          })}
          
          {filters.clientId && selectedClient && (
            <Badge variant="secondary" className="flex items-center gap-1">
              Cliente: {selectedClient.name}
              <X 
                className="w-3 h-3 cursor-pointer" 
                onClick={() => handleClientSelect(null)}
              />
            </Badge>
          )}

          {filters.categories.map(cat => {
            const category = CATEGORIES.find(c => c.value === cat);
            return category ? (
              <Badge key={cat} variant="secondary" className="flex items-center gap-1">
                {category.label}
                <X 
                  className="w-3 h-3 cursor-pointer" 
                  onClick={() => handleCategoryToggle(cat)}
                />
              </Badge>
            ) : null;
          })}

          {filters.priorities.map(pri => {
            const priority = PRIORITIES.find(p => p.value === pri);
            return priority ? (
              <Badge key={pri} variant="secondary" className="flex items-center gap-1">
                Prioridad: {priority.label}
                <X 
                  className="w-3 h-3 cursor-pointer" 
                  onClick={() => handlePriorityToggle(pri)}
                />
              </Badge>
            ) : null;
          })}

          {filters.dateRange !== 'all' && (
            <Badge variant="secondary" className="flex items-center gap-1">
              {DATE_RANGES.find(r => r.value === filters.dateRange)?.label}
              <X 
                className="w-3 h-3 cursor-pointer" 
                onClick={() => onFiltersChange({ ...filters, dateRange: 'all' })}
              />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}