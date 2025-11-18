import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
    ListChecks, 
    Clock, 
    CheckCircle,
    AlertTriangle,
    TrendingUp,
    Users
} from "lucide-react";
import { format, differenceInDays, parseISO, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { es } from "date-fns/locale";

export default function AdminTasksReport({ tasks, cleaners }) {
    // Obtener todos los usuarios admin
    const admins = useMemo(() => {
        // En el contexto de esta app, necesitamos obtener los admins
        // Como no tenemos acceso directo, los identificaremos por las tareas
        const adminIds = new Set();
        tasks.forEach(task => {
            if (task.created_by_user_id) adminIds.add(task.created_by_user_id);
            if (task.assignee_user_ids) {
                task.assignee_user_ids.forEach(id => adminIds.add(id));
            }
        });
        return Array.from(adminIds);
    }, [tasks]);

    // Análisis general de tareas
    const taskStats = useMemo(() => {
        const today = new Date();
        const monthStart = startOfMonth(today);
        const monthEnd = endOfMonth(today);

        const thisMonthTasks = tasks.filter(t => 
            t.created_date && 
            isWithinInterval(new Date(t.created_date), { start: monthStart, end: monthEnd })
        );

        const pending = tasks.filter(t => t.status === 'pending');
        const inProgress = tasks.filter(t => t.status === 'in_progress');
        const completed = tasks.filter(t => t.status === 'completed');
        const overdue = tasks.filter(t => {
            if (t.status === 'completed' || !t.due_date) return false;
            return differenceInDays(new Date(t.due_date), today) < 0;
        });

        // Tiempo promedio de resolución (solo completadas este mes)
        const completedThisMonth = thisMonthTasks.filter(t => t.status === 'completed' && t.completed_at);
        let avgResolutionTime = 0;
        if (completedThisMonth.length > 0) {
            const totalDays = completedThisMonth.reduce((sum, task) => {
                if (task.created_date && task.completed_at) {
                    return sum + differenceInDays(
                        new Date(task.completed_at),
                        new Date(task.created_date)
                    );
                }
                return sum;
            }, 0);
            avgResolutionTime = Math.round(totalDays / completedThisMonth.length);
        }

        return {
            total: tasks.length,
            pending: pending.length,
            inProgress: inProgress.length,
            completed: completed.length,
            overdue: overdue.length,
            createdThisMonth: thisMonthTasks.length,
            completedThisMonth: completedThisMonth.length,
            avgResolutionTime
        };
    }, [tasks]);

    // Análisis por categoría
    const categoryAnalysis = useMemo(() => {
        const categories = {};
        
        tasks.forEach(task => {
            const category = task.task_category || 'sin_categoria';
            if (!categories[category]) {
                categories[category] = {
                    total: 0,
                    pending: 0,
                    inProgress: 0,
                    completed: 0,
                    overdue: 0
                };
            }
            
            categories[category].total++;
            
            if (task.status === 'pending') categories[category].pending++;
            if (task.status === 'in_progress') categories[category].inProgress++;
            if (task.status === 'completed') categories[category].completed++;
            
            if (task.status !== 'completed' && task.due_date) {
                if (differenceInDays(new Date(task.due_date), new Date()) < 0) {
                    categories[category].overdue++;
                }
            }
        });

        return Object.entries(categories).map(([key, value]) => ({
            category: key,
            label: getCategoryLabel(key),
            ...value,
            completionRate: value.total > 0 ? Math.round((value.completed / value.total) * 100) : 0
        })).sort((a, b) => b.total - a.total);
    }, [tasks]);

    // Análisis por admin (creador y asignados)
    const adminAnalysis = useMemo(() => {
        const adminStats = {};

        tasks.forEach(task => {
            // Tareas creadas
            if (task.created_by_user_id) {
                if (!adminStats[task.created_by_user_id]) {
                    adminStats[task.created_by_user_id] = {
                        userId: task.created_by_user_id,
                        userName: task.created_by_user_name || 'Admin',
                        created: 0,
                        assigned: 0,
                        completed: 0,
                        overdue: 0
                    };
                }
                adminStats[task.created_by_user_id].created++;
            }

            // Tareas asignadas
            if (task.assignee_user_ids) {
                task.assignee_user_ids.forEach(userId => {
                    if (!adminStats[userId]) {
                        adminStats[userId] = {
                            userId,
                            userName: 'Admin',
                            created: 0,
                            assigned: 0,
                            completed: 0,
                            overdue: 0
                        };
                    }
                    adminStats[userId].assigned++;
                    
                    if (task.status === 'completed') {
                        adminStats[userId].completed++;
                    }
                    
                    if (task.status !== 'completed' && task.due_date) {
                        if (differenceInDays(new Date(task.due_date), new Date()) < 0) {
                            adminStats[userId].overdue++;
                        }
                    }
                });
            }
        });

        return Object.values(adminStats).map(admin => ({
            ...admin,
            completionRate: admin.assigned > 0 
                ? Math.round((admin.completed / admin.assigned) * 100) 
                : 0
        })).sort((a, b) => b.assigned - a.assigned);
    }, [tasks]);

    // Tareas recurrentes
    const recurringTasks = useMemo(() => {
        return tasks.filter(t => t.recurrence_type && t.recurrence_type !== 'none');
    }, [tasks]);

    function getCategoryLabel(category) {
        const labels = {
            operational: 'Operacional',
            client_care: 'Atención al Cliente',
            cleaner_support: 'Soporte Limpiadores',
            fleet_logistics: 'Logística/Flota',
            financial_admin: 'Admin. Financiera',
            general_admin: 'Admin. General',
            sin_categoria: 'Sin Categoría'
        };
        return labels[category] || category;
    }

    return (
        <div className="space-y-6">
            {/* KPIs Generales */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500">Tareas Totales</p>
                                <p className="text-2xl font-bold text-slate-900">{taskStats.total}</p>
                            </div>
                            <ListChecks className="w-8 h-8 text-blue-600" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500">Pendientes</p>
                                <p className="text-2xl font-bold text-slate-900">{taskStats.pending}</p>
                            </div>
                            <Clock className="w-8 h-8 text-yellow-600" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500">En Progreso</p>
                                <p className="text-2xl font-bold text-slate-900">{taskStats.inProgress}</p>
                            </div>
                            <TrendingUp className="w-8 h-8 text-purple-600" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500">Completadas</p>
                                <p className="text-2xl font-bold text-slate-900">{taskStats.completed}</p>
                            </div>
                            <CheckCircle className="w-8 h-8 text-green-600" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500">Atrasadas</p>
                                <p className="text-2xl font-bold text-slate-900">{taskStats.overdue}</p>
                            </div>
                            <AlertTriangle className="w-8 h-8 text-red-600" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Métricas del Mes Actual */}
            <Card>
                <CardHeader>
                    <CardTitle>Desempeño del Mes Actual</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-4 bg-blue-50 rounded-lg">
                            <p className="text-sm text-slate-600 mb-1">Tareas Creadas</p>
                            <p className="text-3xl font-bold text-blue-700">{taskStats.createdThisMonth}</p>
                        </div>
                        <div className="p-4 bg-green-50 rounded-lg">
                            <p className="text-sm text-slate-600 mb-1">Tareas Completadas</p>
                            <p className="text-3xl font-bold text-green-700">{taskStats.completedThisMonth}</p>
                        </div>
                        <div className="p-4 bg-purple-50 rounded-lg">
                            <p className="text-sm text-slate-600 mb-1">Tiempo Promedio Resolución</p>
                            <p className="text-3xl font-bold text-purple-700">
                                {taskStats.avgResolutionTime}
                                <span className="text-lg ml-1">días</span>
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Análisis por Categoría */}
            <Card>
                <CardHeader>
                    <CardTitle>Análisis por Categoría</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {categoryAnalysis.map(cat => (
                            <div key={cat.category} className="p-4 border rounded-lg">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="font-semibold text-slate-900">{cat.label}</h4>
                                    <Badge className="bg-blue-100 text-blue-800">
                                        {cat.total} tareas
                                    </Badge>
                                </div>
                                <div className="grid grid-cols-5 gap-2 text-sm">
                                    <div>
                                        <p className="text-slate-500 text-xs">Pendiente</p>
                                        <p className="font-medium text-yellow-700">{cat.pending}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-500 text-xs">En Progreso</p>
                                        <p className="font-medium text-purple-700">{cat.inProgress}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-500 text-xs">Completada</p>
                                        <p className="font-medium text-green-700">{cat.completed}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-500 text-xs">Atrasada</p>
                                        <p className="font-medium text-red-700">{cat.overdue}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-500 text-xs">% Completitud</p>
                                        <p className="font-medium">{cat.completionRate}%</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Análisis por Administrador */}
            <Card>
                <CardHeader>
                    <CardTitle>Carga de Trabajo por Administrador</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b">
                                    <th className="text-left p-3 text-sm font-semibold text-slate-700">Administrador</th>
                                    <th className="text-center p-3 text-sm font-semibold text-slate-700">Creadas</th>
                                    <th className="text-center p-3 text-sm font-semibold text-slate-700">Asignadas</th>
                                    <th className="text-center p-3 text-sm font-semibold text-slate-700">Completadas</th>
                                    <th className="text-center p-3 text-sm font-semibold text-slate-700">Atrasadas</th>
                                    <th className="text-center p-3 text-sm font-semibold text-slate-700">% Completitud</th>
                                </tr>
                            </thead>
                            <tbody>
                                {adminAnalysis.map(admin => (
                                    <tr key={admin.userId} className="border-b hover:bg-slate-50">
                                        <td className="p-3 font-medium">{admin.userName}</td>
                                        <td className="p-3 text-center">{admin.created}</td>
                                        <td className="p-3 text-center font-medium">{admin.assigned}</td>
                                        <td className="p-3 text-center text-green-700">{admin.completed}</td>
                                        <td className="p-3 text-center text-red-700">{admin.overdue}</td>
                                        <td className="p-3 text-center">
                                            <Badge 
                                                className={
                                                    admin.completionRate >= 80 ? "bg-green-100 text-green-800" :
                                                    admin.completionRate >= 60 ? "bg-yellow-100 text-yellow-800" :
                                                    "bg-red-100 text-red-800"
                                                }
                                            >
                                                {admin.completionRate}%
                                            </Badge>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {adminAnalysis.length === 0 && (
                        <div className="text-center py-12">
                            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                            <p className="text-slate-500">No hay datos de administradores</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Tareas Recurrentes */}
            {recurringTasks.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Clock className="w-5 h-5" />
                            Tareas Recurrentes ({recurringTasks.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-slate-600">
                            Hay {recurringTasks.length} tarea(s) configurada(s) con recurrencia automática.
                        </p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}