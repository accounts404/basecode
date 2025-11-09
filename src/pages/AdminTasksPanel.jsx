import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Plus, 
  ListChecks, 
  LayoutGrid, 
  Calendar,
  AlertCircle,
  TrendingUp,
  Clock,
  CheckCircle2,
  Users
} from 'lucide-react';
import TaskFilters from '@/components/tasks/TaskFilters';
import TaskTable from '@/components/tasks/TaskTable';
import ExtendedTaskForm from '@/components/tasks/ExtendedTaskForm';
import TaskKanbanView from '@/components/tasks/TaskKanbanView';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { startOfDay, endOfDay, isAfter, isBefore, isToday } from 'date-fns';

export default function AdminTasksPanel() {
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [activeView, setActiveView] = useState('table');
  const [error, setError] = useState('');
  
  // Estados de filtros
  const [filters, setFilters] = useState({
    assignees: [],
    clientId: null,
    scheduleId: null,
    categories: [],
    statuses: ['pending', 'in_progress'],
    priorities: [],
    dateRange: 'all',
    searchTerm: ''
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [currentUser, allTasks, allUsers, allClients, allSchedules] = await Promise.all([
        base44.auth.me(),
        base44.entities.Task.list(),
        base44.entities.User.list(),
        base44.entities.Client.list(),
        base44.entities.Schedule.list()
      ]);

      setUser(currentUser);
      setTasks(Array.isArray(allTasks) ? allTasks : []);
      setUsers(Array.isArray(allUsers) ? allUsers.filter(u => u.role === 'admin') : []);
      setClients(Array.isArray(allClients) ? allClients : []);
      setSchedules(Array.isArray(allSchedules) ? allSchedules : []);
    } catch (error) {
      console.error('Error loading data:', error);
      setError('Error al cargar datos. Por favor, recarga la página.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTask = () => {
    setSelectedTask(null);
    setShowTaskForm(true);
  };

  const handleEditTask = (task) => {
    setSelectedTask(task);
    setShowTaskForm(true);
  };

  const handleSaveTask = async (taskData) => {
    try {
      if (selectedTask?.id) {
        await base44.entities.Task.update(selectedTask.id, taskData);
      } else {
        const newTask = {
          ...taskData,
          created_by_user_id: user.id
        };
        
        const createdTask = await base44.entities.Task.create(newTask);

        // Si la tarea es recurrente, generar las instancias futuras
        if (taskData.recurrence_type && taskData.recurrence_type !== 'none') {
          try {
            await base44.functions.invoke('generateRecurringTasks', createdTask);
          } catch (recError) {
            console.error('Error generando tareas recurrentes:', recError);
          }
        }

        // Notificar a los asignados
        if (taskData.assignee_user_ids && taskData.assignee_user_ids.length > 0) {
          try {
            await base44.functions.invoke('notifyTaskAssignment', {
              taskId: createdTask.id,
              assigneeIds: taskData.assignee_user_ids,
              createdBy: user.full_name
            });
          } catch (notifyError) {
            console.error('Error enviando notificaciones:', notifyError);
          }
        }
      }

      await loadInitialData();
      setShowTaskForm(false);
      setSelectedTask(null);
    } catch (error) {
      console.error('Error saving task:', error);
      setError('Error al guardar la tarea.');
      throw error;
    }
  };

  const handleDeleteTask = async (taskId) => {
    try {
      await base44.entities.Task.delete(taskId);
      await loadInitialData();
      setShowTaskForm(false);
      setSelectedTask(null);
    } catch (error) {
      console.error('Error deleting task:', error);
      setError('Error al eliminar la tarea.');
      throw error;
    }
  };

  const handleToggleTaskStatus = async (taskId, newStatus) => {
    try {
      const task = tasks.find(t => t.id === taskId);
      const oldStatus = task?.status;
      
      await base44.entities.Task.update(taskId, { status: newStatus });
      
      // Notificar cambio de estado
      if (task && task.assignee_user_ids && task.assignee_user_ids.length > 0) {
        try {
          await base44.functions.invoke('notifyTaskStatusChange', {
            taskId: taskId,
            oldStatus: oldStatus,
            newStatus: newStatus,
            taskTitle: task.title
          });
        } catch (notifyError) {
          console.error('Error enviando notificación de cambio:', notifyError);
        }
      }
      
      await loadInitialData();
    } catch (error) {
      console.error('Error updating task status:', error);
      setError('Error al actualizar el estado de la tarea.');
    }
  };

  // Filtrado de tareas
  const filteredTasks = useMemo(() => {
    let filtered = [...tasks];

    // Filtro por término de búsqueda
    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(task => 
        task.title?.toLowerCase().includes(term) ||
        task.description?.toLowerCase().includes(term)
      );
    }

    // Filtro por asignados
    if (filters.assignees.length > 0) {
      filtered = filtered.filter(task => 
        task.assignee_user_ids && 
        filters.assignees.some(assigneeId => task.assignee_user_ids.includes(assigneeId))
      );
    }

    // Filtro por cliente
    if (filters.clientId) {
      filtered = filtered.filter(task => task.related_client_id === filters.clientId);
    }

    // Filtro por servicio
    if (filters.scheduleId) {
      filtered = filtered.filter(task => task.related_schedule_id === filters.scheduleId);
    }

    // Filtro por categorías
    if (filters.categories.length > 0) {
      filtered = filtered.filter(task => filters.categories.includes(task.task_category));
    }

    // Filtro por estados
    if (filters.statuses.length > 0) {
      filtered = filtered.filter(task => filters.statuses.includes(task.status));
    }

    // Filtro por prioridades
    if (filters.priorities.length > 0) {
      filtered = filtered.filter(task => filters.priorities.includes(task.priority));
    }

    // Filtro por rango de fecha
    if (filters.dateRange !== 'all') {
      const today = new Date();
      filtered = filtered.filter(task => {
        if (!task.due_date) return false;
        const dueDate = new Date(task.due_date);
        
        switch (filters.dateRange) {
          case 'overdue':
            return isBefore(dueDate, startOfDay(today)) && task.status !== 'completed';
          case 'today':
            return isToday(dueDate);
          case 'week':
            const weekEnd = new Date(today);
            weekEnd.setDate(weekEnd.getDate() + 7);
            return isAfter(dueDate, startOfDay(today)) && isBefore(dueDate, endOfDay(weekEnd));
          case 'month':
            const monthEnd = new Date(today);
            monthEnd.setMonth(monthEnd.getMonth() + 1);
            return isAfter(dueDate, startOfDay(today)) && isBefore(dueDate, endOfDay(monthEnd));
          default:
            return true;
        }
      });
    }

    return filtered;
  }, [tasks, filters]);

  // Estadísticas
  const stats = useMemo(() => {
    const today = new Date();
    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      inProgress: tasks.filter(t => t.status === 'in_progress').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      overdue: tasks.filter(t => {
        if (!t.due_date || t.status === 'completed') return false;
        return isBefore(new Date(t.due_date), startOfDay(today));
      }).length,
      urgent: tasks.filter(t => t.priority === 'urgent' && t.status !== 'completed').length,
      myTasks: tasks.filter(t => 
        t.assignee_user_ids && 
        t.assignee_user_ids.includes(user?.id) && 
        t.status !== 'completed'
      ).length
    };
  }, [tasks, user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-slate-600">Cargando panel de tareas...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <AlertCircle className="w-16 h-16 text-red-400 mx-auto" />
              <h2 className="text-xl font-bold text-slate-800">Acceso Denegado</h2>
              <p className="text-slate-600">
                Solo los administradores pueden acceder al panel de gestión de tareas.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
              <ListChecks className="w-8 h-8 text-blue-600" />
              Panel de Gestión de Tareas
            </h1>
            <p className="text-slate-600 mt-1">
              Coordina y administra todas las tareas del equipo
            </p>
          </div>
          <Button 
            onClick={handleCreateTask}
            size="lg"
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-5 h-5 mr-2" />
            Nueva Tarea
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Estadísticas */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-90">Total</p>
                  <p className="text-3xl font-bold">{stats.total}</p>
                </div>
                <ListChecks className="w-8 h-8 opacity-80" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-yellow-500 to-yellow-600 text-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-90">Pendientes</p>
                  <p className="text-3xl font-bold">{stats.pending}</p>
                </div>
                <Clock className="w-8 h-8 opacity-80" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-90">En Progreso</p>
                  <p className="text-3xl font-bold">{stats.inProgress}</p>
                </div>
                <TrendingUp className="w-8 h-8 opacity-80" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-90">Completadas</p>
                  <p className="text-3xl font-bold">{stats.completed}</p>
                </div>
                <CheckCircle2 className="w-8 h-8 opacity-80" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-red-500 to-red-600 text-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-90">Atrasadas</p>
                  <p className="text-3xl font-bold">{stats.overdue}</p>
                </div>
                <AlertCircle className="w-8 h-8 opacity-80" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-90">Urgentes</p>
                  <p className="text-3xl font-bold">{stats.urgent}</p>
                </div>
                <AlertCircle className="w-8 h-8 opacity-80" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-indigo-500 to-indigo-600 text-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-90">Mis Tareas</p>
                  <p className="text-3xl font-bold">{stats.myTasks}</p>
                </div>
                <Users className="w-8 h-8 opacity-80" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filtros */}
        <Card>
          <CardContent className="pt-6">
            <TaskFilters
              filters={filters}
              onFiltersChange={setFilters}
              users={users}
              clients={clients}
              schedules={schedules}
            />
          </CardContent>
        </Card>

        {/* Contenido Principal con Tabs */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                {activeView === 'table' && <ListChecks className="w-5 h-5" />}
                {activeView === 'kanban' && <LayoutGrid className="w-5 h-5" />}
                {filteredTasks.length} Tarea{filteredTasks.length !== 1 ? 's' : ''}
              </CardTitle>
              <Tabs value={activeView} onValueChange={setActiveView}>
                <TabsList>
                  <TabsTrigger value="table">
                    <ListChecks className="w-4 h-4 mr-2" />
                    Tabla
                  </TabsTrigger>
                  <TabsTrigger value="kanban">
                    <LayoutGrid className="w-4 h-4 mr-2" />
                    Kanban
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            {activeView === 'table' ? (
              <TaskTable
                tasks={filteredTasks}
                users={users}
                clients={clients}
                schedules={schedules}
                onEditTask={handleEditTask}
                onDeleteTask={handleDeleteTask}
                onToggleStatus={handleToggleTaskStatus}
              />
            ) : (
              <TaskKanbanView
                tasks={filteredTasks}
                users={users}
                clients={clients}
                onEditTask={handleEditTask}
                onToggleStatus={handleToggleTaskStatus}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog para crear/editar tarea */}
      <Dialog open={showTaskForm} onOpenChange={setShowTaskForm}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedTask?.id ? 'Editar Tarea' : 'Nueva Tarea'}
            </DialogTitle>
          </DialogHeader>
          <ExtendedTaskForm
            task={selectedTask}
            users={users}
            clients={clients}
            schedules={schedules}
            onSave={handleSaveTask}
            onDelete={selectedTask?.id ? handleDeleteTask : null}
            onCancel={() => {
              setShowTaskForm(false);
              setSelectedTask(null);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}