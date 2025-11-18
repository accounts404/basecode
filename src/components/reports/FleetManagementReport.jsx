import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
    Car, 
    AlertTriangle,
    Calendar,
    Wrench,
    Shield,
    TrendingUp
} from "lucide-react";
import { format, differenceInDays, parseISO, isAfter, isBefore, addDays } from "date-fns";
import { es } from "date-fns/locale";

export default function FleetManagementReport({ vehicles, teamAssignments, cleaners }) {
    // Análisis de uso de vehículos (últimos 30 días)
    const vehicleUsage = useMemo(() => {
        const thirtyDaysAgo = addDays(new Date(), -30);
        
        return vehicles.map(vehicle => {
            // Contar asignaciones del vehículo
            const assignments = teamAssignments.filter(ta => 
                ta.vehicle_id === vehicle.id &&
                ta.date &&
                isAfter(parseISO(ta.date), thirtyDaysAgo)
            );

            // Calcular días únicos de uso
            const uniqueDates = new Set(assignments.map(a => a.date?.slice(0, 10)));
            const daysUsed = uniqueDates.size;

            // Limpiadores que han usado este vehículo
            const cleanerIds = new Set();
            assignments.forEach(a => {
                if (a.team_member_ids) {
                    a.team_member_ids.forEach(id => cleanerIds.add(id));
                }
            });

            // Alertas de mantenimiento
            const alerts = [];
            const today = new Date();

            if (vehicle.registration_expiry) {
                const expiryDate = parseISO(vehicle.registration_expiry);
                const daysUntilExpiry = differenceInDays(expiryDate, today);
                if (daysUntilExpiry < 30 && daysUntilExpiry >= 0) {
                    alerts.push({
                        type: 'warning',
                        message: `Registro vence en ${daysUntilExpiry} días`,
                        priority: daysUntilExpiry < 7 ? 'high' : 'medium'
                    });
                } else if (daysUntilExpiry < 0) {
                    alerts.push({
                        type: 'error',
                        message: `Registro vencido hace ${Math.abs(daysUntilExpiry)} días`,
                        priority: 'critical'
                    });
                }
            }

            if (vehicle.insurance_expiry) {
                const expiryDate = parseISO(vehicle.insurance_expiry);
                const daysUntilExpiry = differenceInDays(expiryDate, today);
                if (daysUntilExpiry < 30 && daysUntilExpiry >= 0) {
                    alerts.push({
                        type: 'warning',
                        message: `Seguro vence en ${daysUntilExpiry} días`,
                        priority: daysUntilExpiry < 7 ? 'high' : 'medium'
                    });
                } else if (daysUntilExpiry < 0) {
                    alerts.push({
                        type: 'error',
                        message: `Seguro vencido hace ${Math.abs(daysUntilExpiry)} días`,
                        priority: 'critical'
                    });
                }
            }

            if (vehicle.next_service_due) {
                const serviceDate = parseISO(vehicle.next_service_due);
                const daysUntilService = differenceInDays(serviceDate, today);
                if (daysUntilService < 14 && daysUntilService >= 0) {
                    alerts.push({
                        type: 'info',
                        message: `Servicio en ${daysUntilService} días`,
                        priority: 'low'
                    });
                } else if (daysUntilService < 0) {
                    alerts.push({
                        type: 'warning',
                        message: `Servicio atrasado ${Math.abs(daysUntilService)} días`,
                        priority: 'medium'
                    });
                }
            }

            return {
                vehicle,
                daysUsed,
                utilizationRate: Math.round((daysUsed / 30) * 100),
                totalAssignments: assignments.length,
                uniqueCleaners: cleanerIds.size,
                alerts,
                hasAlerts: alerts.length > 0,
                criticalAlerts: alerts.filter(a => a.priority === 'critical').length
            };
        });
    }, [vehicles, teamAssignments]);

    // Estadísticas generales
    const stats = useMemo(() => {
        const activeVehicles = vehicleUsage.filter(v => v.vehicle.status === 'active');
        const totalUsage = vehicleUsage.reduce((sum, v) => sum + v.daysUsed, 0);
        const avgUtilization = activeVehicles.length > 0
            ? vehicleUsage.reduce((sum, v) => sum + v.utilizationRate, 0) / activeVehicles.length
            : 0;
        const vehiclesWithAlerts = vehicleUsage.filter(v => v.hasAlerts).length;
        const criticalAlerts = vehicleUsage.reduce((sum, v) => sum + v.criticalAlerts, 0);

        return {
            totalVehicles: vehicles.length,
            activeVehicles: activeVehicles.length,
            avgUtilization: Math.round(avgUtilization),
            vehiclesWithAlerts,
            criticalAlerts
        };
    }, [vehicles, vehicleUsage]);

    // Ordenar por prioridad (críticos primero, luego por uso)
    const sortedVehicles = useMemo(() => {
        return [...vehicleUsage].sort((a, b) => {
            if (a.criticalAlerts !== b.criticalAlerts) {
                return b.criticalAlerts - a.criticalAlerts;
            }
            return b.utilizationRate - a.utilizationRate;
        });
    }, [vehicleUsage]);

    return (
        <div className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500">Total Vehículos</p>
                                <p className="text-2xl font-bold text-slate-900">{stats.totalVehicles}</p>
                            </div>
                            <Car className="w-8 h-8 text-blue-600" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500">Activos</p>
                                <p className="text-2xl font-bold text-slate-900">{stats.activeVehicles}</p>
                            </div>
                            <Car className="w-8 h-8 text-green-600" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500">Uso Promedio</p>
                                <p className="text-2xl font-bold text-slate-900">{stats.avgUtilization}%</p>
                            </div>
                            <TrendingUp className="w-8 h-8 text-purple-600" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500">Con Alertas</p>
                                <p className="text-2xl font-bold text-slate-900">{stats.vehiclesWithAlerts}</p>
                            </div>
                            <AlertTriangle className="w-8 h-8 text-orange-600" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500">Alertas Críticas</p>
                                <p className="text-2xl font-bold text-slate-900">{stats.criticalAlerts}</p>
                            </div>
                            <AlertTriangle className="w-8 h-8 text-red-600" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Alertas Críticas */}
            {stats.criticalAlerts > 0 && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                        <strong>¡Atención!</strong> Hay {stats.criticalAlerts} alerta(s) crítica(s) que requieren acción inmediata.
                    </AlertDescription>
                </Alert>
            )}

            {/* Lista de Vehículos */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sortedVehicles.map(item => (
                    <Card 
                        key={item.vehicle.id}
                        className={
                            item.criticalAlerts > 0 ? "border-2 border-red-500" :
                            item.hasAlerts ? "border-2 border-orange-500" :
                            ""
                        }
                    >
                        <CardHeader className="pb-3">
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <CardTitle className="text-lg flex items-center gap-2">
                                        <Car className="w-5 h-5" />
                                        {item.vehicle.make} {item.vehicle.model}
                                    </CardTitle>
                                    <p className="text-sm text-slate-500 mt-1">
                                        {item.vehicle.license_plate}
                                    </p>
                                </div>
                                <Badge 
                                    className={
                                        item.vehicle.status === 'active' ? "bg-green-100 text-green-800" :
                                        item.vehicle.status === 'maintenance' ? "bg-yellow-100 text-yellow-800" :
                                        "bg-red-100 text-red-800"
                                    }
                                >
                                    {item.vehicle.status === 'active' ? 'Activo' :
                                     item.vehicle.status === 'maintenance' ? 'Mantenimiento' :
                                     'Fuera de Servicio'}
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Uso */}
                            <div>
                                <div className="flex justify-between text-sm mb-2">
                                    <span className="text-slate-600">Uso (últimos 30 días)</span>
                                    <span className="font-medium">{item.utilizationRate}%</span>
                                </div>
                                <div className="w-full bg-slate-200 rounded-full h-2">
                                    <div 
                                        className={`h-2 rounded-full ${
                                            item.utilizationRate >= 70 ? 'bg-green-500' :
                                            item.utilizationRate >= 40 ? 'bg-blue-500' :
                                            'bg-yellow-500'
                                        }`}
                                        style={{ width: `${item.utilizationRate}%` }}
                                    />
                                </div>
                                <p className="text-xs text-slate-500 mt-1">
                                    {item.daysUsed} días usados • {item.totalAssignments} asignaciones
                                </p>
                            </div>

                            {/* Información de Mantenimiento */}
                            <div className="grid grid-cols-3 gap-2 text-xs">
                                {item.vehicle.registration_expiry && (
                                    <div className="flex items-start gap-1">
                                        <Shield className="w-3 h-3 text-slate-400 mt-0.5" />
                                        <div>
                                            <p className="text-slate-500">Registro</p>
                                            <p className="font-medium">
                                                {format(parseISO(item.vehicle.registration_expiry), 'dd/MM/yy')}
                                            </p>
                                        </div>
                                    </div>
                                )}
                                {item.vehicle.insurance_expiry && (
                                    <div className="flex items-start gap-1">
                                        <Shield className="w-3 h-3 text-slate-400 mt-0.5" />
                                        <div>
                                            <p className="text-slate-500">Seguro</p>
                                            <p className="font-medium">
                                                {format(parseISO(item.vehicle.insurance_expiry), 'dd/MM/yy')}
                                            </p>
                                        </div>
                                    </div>
                                )}
                                {item.vehicle.next_service_due && (
                                    <div className="flex items-start gap-1">
                                        <Wrench className="w-3 h-3 text-slate-400 mt-0.5" />
                                        <div>
                                            <p className="text-slate-500">Servicio</p>
                                            <p className="font-medium">
                                                {format(parseISO(item.vehicle.next_service_due), 'dd/MM/yy')}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Alertas */}
                            {item.alerts.length > 0 && (
                                <div className="space-y-1">
                                    {item.alerts.map((alert, idx) => (
                                        <Alert 
                                            key={idx}
                                            variant={alert.priority === 'critical' ? 'destructive' : 'default'}
                                            className="py-2"
                                        >
                                            <AlertTriangle className="h-3 w-3" />
                                            <AlertDescription className="text-xs ml-2">
                                                {alert.message}
                                            </AlertDescription>
                                        </Alert>
                                    ))}
                                </div>
                            )}

                            {/* Notas */}
                            {item.vehicle.notes && (
                                <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded">
                                    {item.vehicle.notes}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>

            {sortedVehicles.length === 0 && (
                <div className="text-center py-12">
                    <Car className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500">No hay vehículos registrados</p>
                </div>
            )}
        </div>
    );
}