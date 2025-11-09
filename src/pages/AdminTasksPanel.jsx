import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  Plus, 
  ListChecks, 
  LayoutGrid, 
  Calendar,
  AlertCircle,
  TrendingUp,
  Clock,
  CheckCircle2,
  Users,
  RefreshCw,
  Shield,
  Eye,
  UserCheck
} from 'lucide-react';
import TaskFilters from '@/components/tasks/TaskFilters';
import TaskTable from '@/components/tasks/TaskTable';
import ExtendedTaskForm from '@/components/tasks/ExtendedTaskForm';
import TaskKanbanView from '@/components/tasks/TaskKanbanView';
import TaskDetailView from '@/components/tasks/TaskDetailView';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { startOfDay, endOfDay, isAfter, isBefore, isToday } from 'date-fns';
import { useToast } from '@/components/ui/use-toast';
import { Toaster } from '@/components/ui/toaster';

export default function AdminTasksPanel() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showTaskDetail, setShowTaskDetail] = useState(false);
  const [taskForDetail, setTaskForDetail] = useState(null);
  const [activeView, setActiveView] = useState('table');
  const [error, setError] = useState('');
  const [viewAllTasks, setViewAllTasks] = useState(false); // Toggle para super admin
  const { toast } = useToast();
  
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
      
      // CRITICAL: Verify user is admin FIRST
      const currentUser = await base44.auth.me();
      
      // PROTECTION: Redirect non-admins immediately
      if (!currentUser || currentUser.role !== 'admin') {
        console.warn('[AdminTasksPanel] ⛔ Acceso denegado - Usuario no es administrador');
        navigate(createPageUrl('Horario'), { replace: true });
        return;
      }

      setUser(currentUser);

      const [allTasks, allUsers, allClients, allSchedules] = await Promise.all([
        base44.entities.Task.list(),
        base44.entities.User.list(),
        base44.entities.Client.list(),
        base44.entities.Schedule.list()
      ]);

      setTasks(Array.isArray(allTasks) ? allTasks : []);
      setUsers(Array.isArray(allUsers) ? allUsers.filter(u => u.role === 'admin') : []);
      setClients(Array.isArray(allClients) ? allClients : []);
      setSchedules(Array.isArray(allSchedules) ? allSchedules : []);

      // NUEVO: Si es super admin (creador de la app), activar viewAllTasks por defecto
      const isSuperAdmin = currentUser.created_by === null || currentUser.created_by === currentUser.email;
      setViewAllTasks(isSuperAdmin);

    } catch (error) {
      console.error('[AdminTasksPanel] Error loading data:', error);
      setError('Error al cargar datos. Por favor, recarga la página.');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadInitialData();
    setRefreshing(false);
    toast({
      title: "✅ Actualizado",
      description: "Tareas y datos actualizados correctamente",
      duration: 2000,
    });
  };

  const handleCreateTask = () => {
    setSelectedTask(null);
    setShowTaskForm(true);
  };

  const handleEditTask = (task) => {
    setSelectedTask(task);
    setShowTaskForm(true);
  };

  const handleViewTaskDetail = (task) => {
    setTaskForDetail(task);
    setShowTaskDetail(true);
  };

  const logActivity = (taskId, action, details, userId, userName) => {
    return {
      user_id: userId,
      user_name: userName,
      timestamp: new Date().toISOString(),
      action: action,
      details: details
    };
  };

  const handleSaveTask = async (taskData) => {
    try {
      let savedTask;
      const activity = [];

      if (selectedTask?.id) {
        // Log changes
        const oldTask = selectedTask;
        if (oldTask.status !== taskData.status) {
          activity.push(logActivity(
            selectedTask.id,
            'status_changed',
            `Estado cambiado de "${oldTask.status}" a "${taskData.status}"`,
            user.id,
            user.full_name
          ));
        }
        if (oldTask.priority !== taskData.priority) {
          activity.push(logActivity(
            selectedTask.id,
            'priority_changed',
            `Prioridad cambiada de "${oldTask.priority}" a "${taskData.priority}"`,
            user.id,
            user.full_name
          ));
        }
        if (JSON.stringify(oldTask.assignee_user_ids) !== JSON.stringify(taskData.assignee_user_ids)) {
          activity.push(logActivity(
            selectedTask.id,
            'assignees_changed',
            'Asignados actualizados',
            user.id,
            user.full_name
          ));
        }

        // Add completion tracking
        if (taskData.status === 'completed' && oldTask.status !== 'completed') {
          taskData.completed_at = new Date().toISOString();
          taskData.completed_by_user_id = user.id;
        }

        // Append to existing activity log
        const existingLog = selectedTask.activity_log || [];
        taskData.activity_log = [...existingLog, ...activity];

        await base44.entities.Task.update(selectedTask.id, taskData);
        savedTask = { ...selectedTask, ...taskData };

      } else {
        // New task
        const newTask = {
          ...taskData,
          created_by_user_id: user.id,
          created_by_user_name: user.full_name,
          activity_log: [
            logActivity(
              null,
              'task_created',
              'Tarea creada',
              user.id,
              user.full_name
            )
          ]
        };
        
        savedTask = await base44.entities.Task.create(newTask);

        // Si la tarea es recurrente, generar las instancias futuras
        if (taskData.recurrence_type && taskData.recurrence_type !== 'none' && taskData.recurrence_type !== 'linked_to_service') {
          try {
            await base44.functions.invoke('generateRecurringTasks', savedTask);
            toast({
              title: "✅ Tareas Recurrentes Generadas",
              description: "Se crearon automáticamente las tareas para los próximos 6 meses",
              duration: 3000,
            });
          } catch (recError) {
            console.error('Error generando tareas recurrentes:', recError);
          }
        }

        // Notificar a los asignados
        if (taskData.assignee_user_ids && taskData.assignee_user_ids.length > 0) {
          try {
            await base44.functions.invoke('notifyTaskAssignment', {
              taskId: savedTask.id,
              assigneeIds: taskData.assignee_user_ids,
              createdBy: user.full_name
            });

            // Create in-app notifications
            await base44.functions.invoke('createTaskNotifications', {
              taskId: savedTask.id,
              assigneeIds: taskData.assignee_user_ids,
              notificationType: 'assignment',
              message: `${user.full_name} te asignó la tarea: "${taskData.title}"`
            });

            toast({
              title: "📧 Notificaciones Enviadas",
              description: `Se notificó a ${taskData.assignee_user_ids.length} administrador(es)`,
              duration: 2000,
            });
          } catch (notifyError) {
            console.error('Error enviando notificaciones:', notifyError);
          }
        }
      }

      await loadInitialData();
      setShowTaskForm(false);
      setSelectedTask(null);

      toast({
        title: "✅ Tarea Guardada",
        description: selectedTask?.id ? "Tarea actualizada correctamente" : "Nueva tarea creada exitosamente",
        duration: 2000,
      });

    } catch (error) {
      console.error('Error saving task:', error);
      setError('Error al guardar la tarea.');
      toast({
        variant: "destructive",
        title: "❌ Error",
        description: "No se pudo guardar la tarea",
        duration: 3000,
      });
      throw error;
    }
  };

  const handleDeleteTask = async (taskId) => {
    try {
      await base44.entities.Task.delete(taskId);
      await loadInitialData();
      setShowTaskForm(false);
      setSelectedTask(null);
      setShowTaskDetail(false);
      setTaskForDetail(null);

      toast({
        title: "🗑️ Tarea Eliminada",
        description: "La tarea fue eliminada correctamente",
        duration: 2000,
      });
    } catch (error) {
      console.error('Error deleting task:', error);
      setError('Error al eliminar la tarea.');
      toast({
        variant: "destructive",
        title: "❌ Error",
        description: "No se pudo eliminar la tarea",
        duration: 3000,
      });
      throw error;
    }
  };

  const handleToggleTaskStatus = async (taskId, newStatus) => {
    try {
      const task = tasks.find(t => t.id === taskId);
      const oldStatus = task?.status;
      
      const updateData = {
        status: newStatus,
        activity_log: [
          ...(task.activity_log || []),
          logActivity(
            taskId,
            'status_changed',
            `Estado cambiado de "${oldStatus}" a "${newStatus}"`,
            user.id,
            user.full_name
          )
        ]
      };

      // Add completion tracking
      if (newStatus === 'completed' && oldStatus !== 'completed') {
        updateData.completed_at = new Date().toISOString();
        updateData.completed_by_user_id = user.id;
      }

      await base44.entities.Task.update(taskId, updateData);
      
      // Notificar cambio de estado
      if (task && task.assignee_user_ids && task.assignee_user_ids.length > 0) {
        try {
          await base44.functions.invoke('notifyTaskStatusChange', {
            taskId: taskId,
            oldStatus: oldStatus,
            newStatus: newStatus,
            taskTitle: task.title
          });

          // Create in-app notifications
          await base44.functions.invoke('createTaskNotifications', {
            taskId: taskId,
            assigneeIds: task.assignee_user_ids.filter(id => id !== user.id),
            notificationType: 'status_change',
            message: `${user.full_name} cambió el estado a "${newStatus}" en: "${task.title}"`
          });
        } catch (notifyError) {
          console.error('Error enviando notificación de cambio:', notifyError);
        }
      }
      
      await loadInitialData();

      toast({
        title: "✅ Estado Actualizado",
        description: `Tarea marcada como "${newStatus}"`,
        duration: 2000,
      });
    } catch (error) {
      console.error('Error updating task status:', error);
      setError('Error al actualizar el estado de la tarea.');
      toast({
        variant: "destructive",
        title: "❌ Error",
        description: "No se pudo actualizar el estado",
        duration: 3000,
      });
    }
  };

  const handleAddComment = async (taskId, commentText) => {
    try {
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      const newComment = {
        user_id: user.id,
        user_name: user.full_name,
        timestamp: new Date().toISOString(),
        text: commentText
      };

      const updatedComments = [...(task.comments || []), newComment];
      const updatedActivity = [
        ...(task.activity_log || []),
        logActivity(taskId, 'comment_added', 'Comentario añadido', user.id, user.full_name)
      ];

      await base44.entities.Task.update(taskId, {
        comments: updatedComments,
        activity_log: updatedActivity
      });

      // Notificar a otros asignados
      if (task.assignee_user_ids && task.assignee_user_ids.length > 0) {
        const othersAssigned = task.assignee_user_ids.filter(id => id !== user.id);
        if (othersAssigned.length > 0) {
          await base44.functions.invoke('createTaskNotifications', {
            taskId: taskId,
            assigneeIds: othersAssigned,
            notificationType: 'comment_added',
            message: `${user.full_name} comentó en: "${task.title}"`
          });
        }
      }

      await loadInitialData();

      toast({
        title: "💬 Comentario Añadido",
        description: "Tu comentario se agregó correctamente",
        duration: 2000,
      });
    } catch (error) {
      console.error('Error adding comment:', error);
      toast({
        variant: "destructive",
        title: "❌ Error",
        description: "No se pudo añadir el comentario",
        duration: 3000,
      });
    }
  };

  const handleToggleChecklistItem = async (taskId, itemIndex) => {
    try {
      const task = tasks.find(t => t.id === taskId);
      if (!task || !task.checklist_items) return;

      const updatedChecklist = task.checklist_items.map((item, idx) => {
        if (idx === itemIndex) {
          return {
            ...item,
            completed: !item.completed,
            completed_by: !item.completed ? user.id : null,
            completed_at: !item.completed ? new Date().toISOString() : null
          };
        }
        return item;
      });

      await base44.entities.Task.update(taskId, {
        checklist_items: updatedChecklist
      });

      await loadInitialData();
    } catch (error) {
      console.error('Error toggling checklist item:', error);
    }
  };

  // NUEVO: Determinar si el usuario es super admin (puede ver todas las tareas)
  const isSuperAdmin = useMemo(() => {
    if (!user) return false;
    // El super admin es quien creó la app (created_by es null o es su propio email)
    return user.created_by === null || user.created_by === user.email;
  }, [user]);

  // MODIFICADO: Filtrado base con permisos
  const tasksWithPermissions = useMemo(() => {
    if (!user) return [];
    
    // Si es super admin Y tiene activado "Ver todas", mostrar todo
    if (isSuperAdmin && viewAllTasks) {
      return tasks;
    }
    
    // Si no, solo mostrar:
    // 1. Tareas asignadas al usuario actual
    // 2. Tareas creadas por el usuario actual
    return tasks.filter(task => {
      const isAssigned = task.assignee_user_ids && task.assignee_user_ids.includes(user.id);
      const isCreator = task.created_by_user_id === user.id;
      return isAssigned || isCreator;
    });
  }, [tasks, user, isSuperAdmin, viewAllTasks]);

  // Filtrado de tareas con permisos aplicados
  const filteredTasks = useMemo(() => {
    let filtered = [...tasksWithPermissions];

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
  }, [tasksWithPermissions, filters]);

  // MODIFICADO: Estadísticas sobre tareas con permisos
  const stats = useMemo(() => {
    const today = new Date();
    return {
      total: tasksWithPermissions.length,
      pending: tasksWithPermissions.filter(t => t.status === 'pending').length,
      inProgress: tasksWithPermissions.filter(t => t.status === 'in_progress').length,
      completed: tasksWithPermissions.filter(t => t.status === 'completed').length,
      overdue: tasksWithPermissions.filter(t => {
        if (!t.due_date || t.status === 'completed') return false;
        return isBefore(new Date(t.due_date), startOfDay(today));
      }).length,
      urgent: tasksWithPermissions.filter(t => t.priority === 'urgent' && t.status !== 'completed').length,
      myTasks: tasksWithPermissions.filter(t => 
        t.assignee_user_ids && 
        t.assignee_user_ids.includes(user?.id) && 
        t.status !== 'completed'
      ).length
    };
  }, [tasksWithPermissions, user]);

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

  // CRITICAL PROTECTION: Double-check user role before rendering
  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-2 border-red-200">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                <Shield className="w-10 h-10 text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-800">Acceso Denegado</h2>
              <p className="text-slate-600">
                ⚠️ Solo los administradores pueden acceder al panel de gestión de tareas.
              </p>
              <p className="text-sm text-slate-500">
                Esta funcionalidad está exclusivamente diseñada para el equipo administrativo.
              </p>
              <Button 
                onClick={() => navigate(createPageUrl('Horario'))}
                className="mt-4"
              >
                Volver al Horario
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-6">
      <Toaster />
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header with Admin Badge */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                <ListChecks className="w-8 h-8 text-blue-600" />
                Panel de Gestión de Tareas
              </h1>
              <Badge className="bg-blue-600 text-white">
                <Shield className="w-3 h-3 mr-1" />
                Admin
              </Badge>
            </div>
            <p className="text-slate-600 mt-1">
              {isSuperAdmin && viewAllTasks 
                ? 'Visualizando todas las tareas del equipo administrativo' 
                : 'Visualizando tus tareas asignadas y creadas'}
            </p>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            {/* NUEVO: Toggle para super admin */}
            {isSuperAdmin && (
              <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-lg border-2 border-blue-200">
                <Label htmlFor="view-all" className="text-sm font-medium cursor-pointer flex items-center gap-2">
                  <Eye className="w-4 h-4 text-blue-600" />
                  Ver todas las tareas
                </Label>
                <Switch
                  id="view-all"
                  checked={viewAllTasks}
                  onCheckedChange={setViewAllTasks}
                />
              </div>
            )}
            <Button
              variant="outline"
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
            <Button 
              onClick={handleCreateTask}
              size="lg"
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-5 h-5 mr-2" />
              Nueva Tarea
            </Button>
          </div>
        </div>

        {/* NUEVO: Info de permisos */}
        {!isSuperAdmin && (
          <Alert className="bg-blue-50 border-blue-200">
            <UserCheck className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              <strong>Vista personalizada:</strong> Solo ves las tareas que te fueron asignadas o que tú creaste.
              {tasks.length > tasksWithPermissions.length && (
                <span className="block mt-1 text-sm">
                  Hay {tasks.length - tasksWithPermissions.length} tarea(s) adicional(es) del equipo que no están asignadas a ti.
                </span>
              )}
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Estadísticas */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => setFilters(prev => ({ ...prev, statuses: [], dateRange: 'all' }))}>
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

          <Card className="bg-gradient-to-br from-yellow-500 to-yellow-600 text-white cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => setFilters(prev => ({ ...prev, statuses: ['pending'], dateRange: 'all' }))}>
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

          <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => setFilters(prev => ({ ...prev, statuses: ['in_progress'], dateRange: 'all' }))}>
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

          <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => setFilters(prev => ({ ...prev, statuses: ['completed'], dateRange: 'all' }))}>
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

          <Card className="bg-gradient-to-br from-red-500 to-red-600 text-white cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => setFilters(prev => ({ ...prev, dateRange: 'overdue', statuses: ['pending', 'in_progress'] }))}>
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

          <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => setFilters(prev => ({ ...prev, priorities: ['urgent'], statuses: ['pending', 'in_progress'] }))}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-90">Urgentes</p>
                  <p className="text-3xl font-bold">{stats.urgent}</p>
                </div>
                <AlertCircle className="w-8 h-8 opacity-80 animate-pulse" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-indigo-500 to-indigo-600 text-white cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => setFilters(prev => ({ ...prev, assignees: [user.id], statuses: ['pending', 'in_progress'] }))}>
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
                onViewDetail={handleViewTaskDetail}
                onDeleteTask={handleDeleteTask}
                onToggleStatus={handleToggleTaskStatus}
              />
            ) : (
              <TaskKanbanView
                tasks={filteredTasks}
                users={users}
                clients={clients}
                onEditTask={handleEditTask}
                onViewDetail={handleViewTaskDetail}
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
            <DialogTitle className="flex items-center gap-2">
              {selectedTask?.id ? (
                <>
                  <ListChecks className="w-5 h-5 text-blue-600" />
                  Editar Tarea
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5 text-blue-600" />
                  Nueva Tarea
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          <ExtendedTaskForm
            task={selectedTask}
            users={users}
            clients={clients}
            schedules={schedules}
            currentUser={user}
            onSave={handleSaveTask}
            onDelete={selectedTask?.id ? handleDeleteTask : null}
            onCancel={() => {
              setShowTaskForm(false);
              setSelectedTask(null);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Sheet para ver detalles de tarea */}
      <Sheet open={showTaskDetail} onOpenChange={setShowTaskDetail}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Detalles de la Tarea</SheetTitle>
          </SheetHeader>
          {taskForDetail && (
            <TaskDetailView
              task={taskForDetail}
              users={users}
              clients={clients}
              schedules={schedules}
              currentUser={user}
              onEdit={() => {
                setShowTaskDetail(false);
                handleEditTask(taskForDetail);
              }}
              onDelete={async () => {
                await handleDeleteTask(taskForDetail.id);
                setShowTaskDetail(false);
              }}
              onAddComment={handleAddComment}
              onToggleChecklistItem={handleToggleChecklistItem}
              onToggleStatus={handleToggleTaskStatus}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}