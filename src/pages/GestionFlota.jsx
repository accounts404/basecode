import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Vehicle } from '@/entities/Vehicle';
import { DailyTeamAssignment } from '@/entities/DailyTeamAssignment';
import { User } from '@/entities/User';
import { Client } from '@/entities/Client';
import { Schedule } from '@/entities/Schedule';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Car, Users, Plus, Edit, Trash2, Calendar, AlertTriangle, Loader2, KeySquare, ChevronLeft, ChevronRight, Wrench, XCircle, CheckCircle, Truck, UserCheck, Hash } from 'lucide-react';
import { format, addDays, subDays, parseISO, startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';

import PhotoUploader from '../components/horario/PhotoUploader';

// Función para parsear fechas ISO como UTC (igual que en CleanerDayListView)
const parseISOAsUTC = (isoString) => {
    if (!isoString) return null;
    const correctedIsoString = isoString.endsWith('Z') ? isoString : `${isoString}Z`;
    return new Date(correctedIsoString);
};

// Función para formatear hora en UTC (igual que en CleanerDayListView)
const formatTimeUTC = (date) => {
    if (!date) return '';
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
};

export default function GestionFlotaPage() {
    // --- State General ---
    const [vehicles, setVehicles] = useState([]);
    const [users, setUsers] = useState([]);
    const [assignments, setAssignments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));

    // --- State para Vehículos ---
    const [showVehicleForm, setShowVehicleForm] = useState(false);
    const [editingVehicle, setEditingVehicle] = useState(null);
    const [vehicleFormData, setVehicleFormData] = useState({
        make: '', model: '', year: new Date().getFullYear(), license_plate: '', color: '', status: 'active', photos: []
    });

    // --- State para Asignaciones (Equipos del Horario) ---
    const [dailyTeams, setDailyTeams] = useState([]);
    const [loadingTeams, setLoadingTeams] = useState(false);


    // --- Carga de Datos ---
    useEffect(() => {
        loadInitialData();
    }, []);

    const loadAllRecords = async (entity, sortField = '-created_date') => {
        const BATCH_SIZE = 5000;
        let allRecords = [];
        let skip = 0;
        let hasMore = true;

        while (hasMore) {
            const batch = await entity.list(sortField, BATCH_SIZE, skip);
            const batchArray = Array.isArray(batch) ? batch : [];
            
            allRecords = [...allRecords, ...batchArray];
            
            if (batchArray.length < BATCH_SIZE) {
                hasMore = false;
            } else {
                skip += BATCH_SIZE;
            }
        }

        return allRecords;
    };

    const loadInitialData = async () => {
        setLoading(true);
        try {
            const [vehiclesData, usersData] = await Promise.all([
                loadAllRecords(Vehicle, '-created_date'),
                loadAllRecords(User, '-created_date')
            ]);
            setVehicles(vehiclesData);
            setUsers(usersData.filter(u => u.role !== 'admin' && u.active !== false));
        } catch (error) {
            console.error('Error loading initial data:', error);
        } finally {
            setLoading(false);
        }
    };
    
    const userMap = useMemo(() => new Map(users.map(u => [u.id, u.invoice_name || u.full_name])), [users]);

    const fetchTeamsAndAssignmentsForDate = useCallback(async () => {
        if (users.length === 0) return;

        setLoadingTeams(true);
        try {
            // CORREGIDO: Usar solo la parte de fecha (YYYY-MM-DD) para comparación
            const selectedDateString = format(parseISO(selectedDate), 'yyyy-MM-dd');
            console.log('[GestionFlota] Filtrando servicios para la fecha:', selectedDateString);

            // 1. Obtener todas las asignaciones existentes para la fecha
            const existingAssignments = await DailyTeamAssignment.filter({ date: selectedDate });
            setAssignments(existingAssignments);
            
            // 2. Obtener todos los servicios del horario Y TODOS LOS CLIENTES
            // CRÍTICO: Usar base44 directamente con límite alto para obtener TODOS los registros
            const { base44 } = await import('@/api/base44Client');
            const [allSchedules, allClients] = await Promise.all([
                base44.entities.Schedule.list('-start_time', 5000),
                base44.entities.Client.list('-created_date', 1000)
            ]);
            const clientMap = new Map(allClients.map(c => [c.id, c]));

            // CORREGIDO: Filtrar usando solo la parte de fecha del ISO string
            const dailySchedules = allSchedules.filter(s => {
                if (!s.start_time) return false;
                
                // Extraer YYYY-MM-DD del start_time ISO string
                const scheduleStartDateString = s.start_time.slice(0, 10);
                
                // Comparar directamente los strings de fecha
                return scheduleStartDateString === selectedDateString;
            });

            console.log('[GestionFlota] Servicios encontrados para', selectedDateString, ':', dailySchedules.length);

            // 3. Procesar para encontrar equipos únicos y sus llaves requeridas
            const teamsMap = new Map();
            dailySchedules.forEach(schedule => {
                if (schedule.cleaner_ids && schedule.cleaner_ids.length > 0) {
                    const sortedIds = [...schedule.cleaner_ids].sort().join(',');
                    if (!teamsMap.has(sortedIds)) {
                        teamsMap.set(sortedIds, {
                            id: sortedIds,
                            memberIds: schedule.cleaner_ids,
                            services: [],
                            requiredKeys: new Map(),
                        });
                    }
                    
                    // Añadir servicio
                    teamsMap.get(sortedIds).services.push({
                        client_name: schedule.client_name,
                        start_time: schedule.start_time
                    });

                    // Añadir llave requerida si aplica
                    if (schedule.client_id) {
                        const client = clientMap.get(schedule.client_id);
                        if (client && client.has_access && client.access_identifier) {
                            teamsMap.get(sortedIds).requiredKeys.set(client.id, {
                                identifier: client.access_identifier,
                                client_name: client.name,
                            });
                        }
                    }
                }
            });
            
            // Convertir el Map de llaves a un array y establecer los equipos diarios
            const teamsWithKeys = Array.from(teamsMap.values()).map(team => ({
                ...team,
                requiredKeys: Array.from(team.requiredKeys.values())
            }));

            setDailyTeams(teamsWithKeys);

            // 4. NUEVO: LIMPIEZA DE ASIGNACIONES HUÉRFANAS
            // Identificar asignaciones que ya no corresponden a ningún equipo real
            const validTeamIds = new Set(teamsWithKeys.map(t => t.id));
            const orphanedAssignments = existingAssignments.filter(assignment => {
                if (!assignment.team_member_ids || !Array.isArray(assignment.team_member_ids)) return false;
                const assignmentTeamId = [...assignment.team_member_ids].sort().join(',');
                return !validTeamIds.has(assignmentTeamId);
            });

            // Eliminar asignaciones huérfanas
            if (orphanedAssignments.length > 0) {
                console.log(`[GestionFlota] 🧹 Limpiando ${orphanedAssignments.length} asignación(es) huérfana(s)...`);
                await Promise.all(
                    orphanedAssignments.map(assignment => {
                        console.log(`[GestionFlota] Eliminando asignación huérfana para equipo: ${[...(assignment.team_member_ids || [])].sort().join(',')}`);
                        return DailyTeamAssignment.delete(assignment.id);
                    })
                );
                
                // Recargar asignaciones después de la limpieza
                const updatedAssignments = await DailyTeamAssignment.filter({ date: selectedDate });
                setAssignments(updatedAssignments);
                console.log('[GestionFlota] ✅ Limpieza completada. Asignaciones actualizadas.');
            } else {
                console.log('[GestionFlota] ✅ No hay asignaciones huérfanas para limpiar.');
            }

        } catch (error) {
            console.error('Error fetching teams and assignments:', error);
        } finally {
            setLoadingTeams(false);
        }
    }, [selectedDate, users]);
    
    // Hook para cargar equipos y asignaciones cuando cambia la fecha
    useEffect(() => {
        fetchTeamsAndAssignmentsForDate();
    }, [fetchTeamsAndAssignmentsForDate]);

    // --- Funciones de Gestión de Vehículos (sin cambios) ---
    const handleSaveVehicle = async (e) => {
        e.preventDefault();
        try {
            const processedData = {
                ...vehicleFormData,
                year: vehicleFormData.year ? parseInt(vehicleFormData.year) : new Date().getFullYear(),
            };
            if (editingVehicle) {
                await Vehicle.update(editingVehicle.id, processedData);
            } else {
                await Vehicle.create(processedData);
            }
            loadInitialData(); // Recargar todo
            handleCloseVehicleForm();
        } catch (error) {
            console.error('Error saving vehicle:', error);
            alert('Error al guardar el vehículo');
        }
    };

    const handleDeleteVehicle = async (id) => {
        if (confirm('¿Estás seguro de que deseas eliminar este vehículo?')) {
            try {
                await Vehicle.delete(id);
                loadInitialData();
            } catch (error) {
                console.error('Error deleting vehicle:', error);
            }
        }
    };

    const handleEditVehicle = (vehicle) => {
        setEditingVehicle(vehicle);
        setVehicleFormData({
            make: vehicle.make || '',
            model: vehicle.model || '',
            year: vehicle.year || new Date().getFullYear(),
            license_plate: vehicle.license_plate || '',
            color: vehicle.color || '',
            status: vehicle.status || 'active',
            photos: vehicle.photos || []
        });
        setShowVehicleForm(true);
    };

    const handleCloseVehicleForm = () => {
        setShowVehicleForm(false);
        setEditingVehicle(null);
        setVehicleFormData({
            make: '', model: '', year: new Date().getFullYear(), license_plate: '', color: '', status: 'active', photos: []
        });
    };
    
    // --- Nueva Función para Asignar Vehículo a un Equipo ---
    const handleVehicleAssignment = async (teamMemberIds, vehicleId) => {
        const teamIdString = [...teamMemberIds].sort().join(',');
        const existingAssignment = assignments.find(a => {
            const sortedExistingIds = [...(a.team_member_ids || [])].sort().join(',');
            return sortedExistingIds === teamIdString;
        });

        // Map 'none' value to null for backend storage
        const actualVehicleId = vehicleId === 'none' ? null : vehicleId;

        // Find the vehicle only if a valid vehicleId (not 'none' or null) is provided
        const vehicle = actualVehicleId ? vehicles.find(v => v.id === actualVehicleId) : null;
        const vehicleInfoString = vehicle ? `${vehicle.make} ${vehicle.model} (${vehicle.license_plate})` : null;

        const driverId = teamMemberIds[0]; // Asumimos el primero como conductor por defecto
        const teamMemberNames = teamMemberIds.map(id => userMap.get(id));
        const driverName = userMap.get(driverId); // Get driver name for initial assignment

        const assignmentData = {
            date: selectedDate,
            main_driver_id: driverId,
            driver_name: driverName, // Add this for initial creation
            team_member_ids: teamMemberIds,
            vehicle_id: actualVehicleId, // Store null if 'none' was selected
            vehicle_info: vehicleInfoString,
            team_members_names: teamMemberNames,
            status: 'planned'
        };

        try {
            if (existingAssignment) {
                 if (actualVehicleId) { // Update if a specific vehicle is selected
                    await DailyTeamAssignment.update(existingAssignment.id, { 
                        vehicle_id: actualVehicleId,
                        vehicle_info: vehicleInfoString
                    });
                } else { // Delete if 'none' was selected (actualVehicleId is null)
                    await DailyTeamAssignment.delete(existingAssignment.id);
                }
            } else if (actualVehicleId) { // Create new assignment only if a vehicle is selected and no existing assignment
                await DailyTeamAssignment.create(assignmentData);
            }
            fetchTeamsAndAssignmentsForDate(); // Recargar asignaciones
        } catch (error) {
            console.error('Error saving assignment:', error);
            alert('Error al guardar la asignación');
        }
    };
    
    // NUEVA FUNCIÓN: Actualizar conductor principal
    const handleDriverAssignment = async (teamMemberIds, newDriverId) => {
        const teamIdString = [...teamMemberIds].sort().join(',');
        const existingAssignment = assignments.find(a => {
            const sortedExistingIds = [...(a.team_member_ids || [])].sort().join(',');
            return sortedExistingIds === teamIdString;
        });

        if (existingAssignment) {
            const driverName = userMap.get(newDriverId);
            try {
                await DailyTeamAssignment.update(existingAssignment.id, {
                    main_driver_id: newDriverId,
                    driver_name: driverName // Para compatibilidad hacia atrás y display
                });
                console.log(`Conductor principal actualizado a: ${driverName}`);
                fetchTeamsAndAssignmentsForDate();
            } catch (error) {
                console.error('Error updating driver:', error);
                alert('Error al actualizar el conductor');
            }
        } else {
            alert('Primero asigna un vehículo a este equipo para poder seleccionar un conductor principal.');
        }
    };

    // --- Funciones de Utilidad ---
    const getStatusColor = (status) => {
        switch (status) {
            case 'active': return 'bg-green-100 text-green-800';
            case 'maintenance': return 'bg-yellow-100 text-yellow-800';
            case 'out_of_service': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const getStatusLabel = (status) => {
        switch (status) {
            case 'active': return 'Activo';
            case 'maintenance': return 'Mantenimiento';
            case 'out_of_service': return 'Fuera de Servicio';
            default: return status;
        }
    };
    
    const isVehicleAvailable = (vehicleId, currentTeamIds) => {
        const currentTeamString = [...currentTeamIds].sort().join(',');
        const assignment = assignments.find(a => a.vehicle_id === vehicleId);
        if (!assignment) return true; // El vehículo no está asignado a nadie
        
        const assignedTeamString = [...(assignment.team_member_ids || [])].sort().join(',');
        return assignedTeamString === currentTeamString; // Está asignado a este mismo equipo
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
                <div className="flex items-center gap-3 text-slate-600">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                    <span>Cargando datos de flota...</span>
                </div>
            </div>
        );
    }

    const activeVehicles = vehicles.filter(v => v.status === 'active').length;
    const maintenanceVehicles = vehicles.filter(v => v.status === 'maintenance').length;
    const outOfServiceVehicles = vehicles.filter(v => v.status === 'out_of_service').length;
    const assignedToday = assignments.filter(a => a.vehicle_id).length;

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                            <Truck className="w-8 h-8 text-blue-600" />
                            Gestión de Flota
                        </h1>
                        <p className="text-slate-500 mt-1">Vehículos y asignaciones diarias de equipos</p>
                    </div>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <Card className="border-0 shadow-sm bg-white">
                        <CardContent className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center"><Car className="w-5 h-5 text-blue-600" /></div>
                            <div><p className="text-2xl font-bold text-slate-900">{vehicles.length}</p><p className="text-xs text-slate-500">Total vehículos</p></div>
                        </CardContent>
                    </Card>
                    <Card className="border-0 shadow-sm bg-white">
                        <CardContent className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center"><CheckCircle className="w-5 h-5 text-green-600" /></div>
                            <div><p className="text-2xl font-bold text-slate-900">{activeVehicles}</p><p className="text-xs text-slate-500">Activos</p></div>
                        </CardContent>
                    </Card>
                    <Card className="border-0 shadow-sm bg-white">
                        <CardContent className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center"><Wrench className="w-5 h-5 text-amber-600" /></div>
                            <div><p className="text-2xl font-bold text-slate-900">{maintenanceVehicles}</p><p className="text-xs text-slate-500">En mantenimiento</p></div>
                        </CardContent>
                    </Card>
                    <Card className="border-0 shadow-sm bg-white">
                        <CardContent className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center"><Users className="w-5 h-5 text-purple-600" /></div>
                            <div><p className="text-2xl font-bold text-slate-900">{assignedToday}</p><p className="text-xs text-slate-500">Asignados hoy</p></div>
                        </CardContent>
                    </Card>
                </div>

                <Tabs defaultValue="assignments" className="space-y-6">
                    <TabsList className="bg-white border border-slate-200 shadow-sm p-1 h-auto">
                        <TabsTrigger value="assignments" className="flex items-center gap-2 data-[state=active]:bg-blue-600 data-[state=active]:text-white rounded-md px-4 py-2">
                            <Users className="w-4 h-4" />
                            Asignaciones de Equipos
                        </TabsTrigger>
                        <TabsTrigger value="vehicles" className="flex items-center gap-2 data-[state=active]:bg-blue-600 data-[state=active]:text-white rounded-md px-4 py-2">
                            <Car className="w-4 h-4" />
                            Vehículos
                        </TabsTrigger>
                    </TabsList>

                    {/* --- Pestaña de Asignaciones --- */}
                    <TabsContent value="assignments" className="space-y-6">
                        {/* Date Navigator */}
                        <Card className="border-0 shadow-sm">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setSelectedDate(format(subDays(parseISO(selectedDate), 1), 'yyyy-MM-dd'))}>
                                            <ChevronLeft className="w-4 h-4" />
                                        </Button>
                                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                                            <Calendar className="w-4 h-4 text-slate-500" />
                                            <Input
                                                type="date"
                                                value={selectedDate}
                                                onChange={(e) => setSelectedDate(e.target.value)}
                                                className="border-0 bg-transparent p-0 h-auto w-36 text-sm font-medium focus-visible:ring-0"
                                            />
                                        </div>
                                        <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setSelectedDate(format(addDays(parseISO(selectedDate), 1), 'yyyy-MM-dd'))}>
                                            <ChevronRight className="w-4 h-4" />
                                        </Button>
                                        <Button variant="outline" size="sm" onClick={() => setSelectedDate(format(new Date(), 'yyyy-MM-dd'))} className="text-xs">Hoy</Button>
                                    </div>
                                    <p className="text-sm font-semibold text-slate-700 capitalize">
                                        {format(parseISO(selectedDate), "EEEE, d 'de' MMMM yyyy", { locale: es })}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>

                        {loadingTeams ? (
                            <div className="text-center py-16">
                                <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600" />
                                <p className="mt-3 text-slate-600">Buscando equipos en el horario...</p>
                            </div>
                        ) : dailyTeams.length > 0 ? (
                            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
                                {dailyTeams.map((team, idx) => {
                                    const teamAssignment = assignments.find(a => {
                                        const sortedA = [...(a.team_member_ids || [])].sort().join(',');
                                        const sortedT = [...team.memberIds].sort().join(',');
                                        return sortedA === sortedT;
                                    });
                                    const hasVehicleAssigned = teamAssignment && teamAssignment.vehicle_id;
                                    const assignedVehicle = hasVehicleAssigned ? vehicles.find(v => v.id === teamAssignment.vehicle_id) : null;

                                    return (
                                        <Card key={team.id} className={`border-0 shadow-sm overflow-hidden transition-all hover:shadow-md ${ hasVehicleAssigned ? 'ring-2 ring-green-400' : '' }`}>
                                            {/* Color bar top */}
                                            <div className={`h-1.5 w-full ${ hasVehicleAssigned ? 'bg-green-500' : 'bg-slate-300' }`} />
                                            <CardContent className="p-5 space-y-4">
                                                {/* Team header */}
                                                <div className="flex items-start justify-between">
                                                    <div>
                                                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Equipo {idx + 1}</p>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {team.memberIds.map(id => (
                                                                <span key={id} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                                                                    hasVehicleAssigned ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-700'
                                                                }`}>
                                                                    <UserCheck className="w-3 h-3" />
                                                                    {userMap.get(id) || 'Desconocido'}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    {hasVehicleAssigned && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                                                            <CheckCircle className="w-3 h-3" /> Asignado
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Vehicle selector */}
                                                <div className="space-y-1">
                                                    <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Vehículo</Label>
                                                    <Select value={teamAssignment?.vehicle_id || 'none'} onValueChange={(value) => handleVehicleAssignment(team.memberIds, value)}>
                                                        <SelectTrigger className={`h-9 text-sm ${ hasVehicleAssigned ? 'border-green-300 bg-green-50' : 'bg-white' }`}>
                                                            <SelectValue placeholder="Asignar vehículo..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="none">Sin asignar</SelectItem>
                                                            {vehicles.filter(v => v.status === 'active').map(vehicle => {
                                                                const available = isVehicleAvailable(vehicle.id, team.memberIds);
                                                                return (
                                                                    <SelectItem key={vehicle.id} value={vehicle.id} disabled={!available}>
                                                                        {vehicle.make} {vehicle.model} · {vehicle.license_plate}{!available ? ' (otro equipo)' : ''}
                                                                    </SelectItem>
                                                                );
                                                            })}
                                                        </SelectContent>
                                                    </Select>
                                                    {assignedVehicle && (
                                                        <p className="text-xs text-green-700 flex items-center gap-1">
                                                            <Car className="w-3 h-3" /> {assignedVehicle.make} {assignedVehicle.model} — {assignedVehicle.color}
                                                        </p>
                                                    )}
                                                </div>

                                                {/* Driver selector */}
                                                {hasVehicleAssigned && (
                                                    <div className="space-y-1">
                                                        <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Conductor Principal</Label>
                                                        <Select value={teamAssignment?.main_driver_id || team.memberIds[0]} onValueChange={(value) => handleDriverAssignment(team.memberIds, value)}>
                                                            <SelectTrigger className="h-9 text-sm border-blue-200 bg-blue-50">
                                                                <SelectValue placeholder="Seleccionar conductor..." />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {team.memberIds.map(memberId => (
                                                                    <SelectItem key={memberId} value={memberId}>{userMap.get(memberId) || 'Desconocido'}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                )}

                                                {/* Services */}
                                                <div className="space-y-1">
                                                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Servicios del día ({team.services.length})</p>
                                                    <div className="bg-slate-50 rounded-lg p-2.5 max-h-28 overflow-y-auto space-y-1">
                                                        {team.services.sort((a,b) => parseISOAsUTC(a.start_time) - parseISOAsUTC(b.start_time)).map((service, index) => {
                                                            const startTime = parseISOAsUTC(service.start_time);
                                                            return (
                                                                <div key={index} className="flex items-center gap-2 text-xs text-slate-700">
                                                                    <span className="font-mono text-slate-500 w-10 flex-shrink-0">{formatTimeUTC(startTime)}</span>
                                                                    <span className="font-medium">{service.client_name}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                {/* Keys */}
                                                {team.requiredKeys.length > 0 && (
                                                    <div className="space-y-1">
                                                        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1">
                                                            <KeySquare className="w-3.5 h-3.5 text-amber-600" /> Llaves ({team.requiredKeys.length})
                                                        </p>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {team.requiredKeys.map((key, index) => (
                                                                <span key={index} className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-md text-xs font-medium">
                                                                    <KeySquare className="w-3 h-3" />{key.identifier} <span className="text-amber-600">({key.client_name.split(' ')[0]})</span>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </div>
                        ) : (
                            <Card className="border-0 shadow-sm">
                                <CardContent className="py-16 text-center">
                                    <Users className="w-14 h-14 text-slate-200 mx-auto mb-4" />
                                    <h3 className="text-lg font-semibold text-slate-700 mb-1">No hay equipos para este día</h3>
                                    <p className="text-slate-400 text-sm">No hay servicios con limpiadores asignados en el horario.</p>
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>

                    {/* --- Pestaña de Vehículos --- */}
                    <TabsContent value="vehicles" className="space-y-5">
                        <div className="flex justify-between items-center">
                            <p className="text-sm text-slate-500">{vehicles.length} vehículo{vehicles.length !== 1 ? 's' : ''} registrado{vehicles.length !== 1 ? 's' : ''}</p>
                            <Button onClick={() => { setEditingVehicle(null); setShowVehicleForm(true); }} className="gap-2">
                                <Plus className="w-4 h-4" /> Nuevo Vehículo
                            </Button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                            {vehicles.map(vehicle => (
                                <Card key={vehicle.id} className="border-0 shadow-sm hover:shadow-md transition-all overflow-hidden">
                                    <div className={`h-1.5 w-full ${
                                        vehicle.status === 'active' ? 'bg-green-500' :
                                        vehicle.status === 'maintenance' ? 'bg-amber-500' : 'bg-red-400'
                                    }`} />
                                    <CardContent className="p-5">
                                        <div className="flex items-start justify-between mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                                                    vehicle.status === 'active' ? 'bg-green-100' :
                                                    vehicle.status === 'maintenance' ? 'bg-amber-100' : 'bg-red-100'
                                                }`}>
                                                    <Car className={`w-6 h-6 ${
                                                        vehicle.status === 'active' ? 'text-green-600' :
                                                        vehicle.status === 'maintenance' ? 'text-amber-600' : 'text-red-500'
                                                    }`} />
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-slate-900">{vehicle.make} {vehicle.model}</h3>
                                                    <p className="text-sm text-slate-500">{vehicle.year}{vehicle.color ? ` · ${vehicle.color}` : ''}</p>
                                                </div>
                                            </div>
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(vehicle.status)}`}>
                                                {getStatusLabel(vehicle.status)}
                                            </span>
                                        </div>

                                        <div className="bg-slate-50 rounded-xl p-3 text-center mb-4">
                                            <p className="font-mono text-xl font-bold text-slate-900 tracking-widest">{vehicle.license_plate}</p>
                                            <p className="text-xs text-slate-400 mt-0.5">Matrícula</p>
                                        </div>

                                        {vehicle.photos && vehicle.photos.length > 0 && (
                                            <div className="grid grid-cols-2 gap-2 mb-4">
                                                <img src={vehicle.photos[0].url} alt="Foto" className="w-full h-20 object-cover rounded-lg" />
                                                {vehicle.photos.length > 1 && (
                                                    <div className="w-full h-20 bg-slate-100 flex items-center justify-center rounded-lg text-slate-500 text-sm font-medium">+{vehicle.photos.length - 1}</div>
                                                )}
                                            </div>
                                        )}

                                        <div className="flex gap-2">
                                            <Button variant="outline" size="sm" onClick={() => handleEditVehicle(vehicle)} className="flex-1 gap-1">
                                                <Edit className="w-3.5 h-3.5" /> Editar
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={() => handleDeleteVehicle(vehicle.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                            {vehicles.length === 0 && (
                                <div className="col-span-3">
                                    <Card className="border-0 shadow-sm">
                                        <CardContent className="py-16 text-center">
                                            <Car className="w-14 h-14 text-slate-200 mx-auto mb-4" />
                                            <h3 className="text-lg font-semibold text-slate-700 mb-1">No hay vehículos registrados</h3>
                                            <p className="text-slate-400 text-sm mb-4">Agrega el primer vehículo de tu flota</p>
                                            <Button onClick={() => { setEditingVehicle(null); setShowVehicleForm(true); }} className="gap-2">
                                                <Plus className="w-4 h-4" /> Nuevo Vehículo
                                            </Button>
                                        </CardContent>
                                    </Card>
                                </div>
                            )}
                        </div>
                    </TabsContent>
                </Tabs>

                {/* --- Dialog para Formulario de Vehículo --- */}
                <Dialog open={showVehicleForm} onOpenChange={setShowVehicleForm}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{editingVehicle ? 'Editar Vehículo' : 'Nuevo Vehículo'}</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSaveVehicle} className="space-y-6 pt-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                               <div>
                                    <Label htmlFor="make">Marca *</Label>
                                    <Input id="make" value={vehicleFormData.make} onChange={(e) => setVehicleFormData({...vehicleFormData, make: e.target.value})} required />
                                </div>
                                <div>
                                    <Label htmlFor="model">Modelo *</Label>
                                    <Input id="model" value={vehicleFormData.model} onChange={(e) => setVehicleFormData({...vehicleFormData, model: e.target.value})} required />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                 <div>
                                    <Label htmlFor="year">Año</Label>
                                    <Input id="year" type="number" value={vehicleFormData.year} onChange={(e) => setVehicleFormData({...vehicleFormData, year: e.target.value})} />
                                </div>
                                <div>
                                    <Label htmlFor="license_plate">Matrícula *</Label>
                                    <Input id="license_plate" value={vehicleFormData.license_plate} onChange={(e) => setVehicleFormData({...vehicleFormData, license_plate: e.target.value.toUpperCase()})} required />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <Label htmlFor="color">Color</Label>
                                    <Input id="color" value={vehicleFormData.color} onChange={(e) => setVehicleFormData({...vehicleFormData, color: e.target.value})} />
                                </div>
                                <div>
                                    <Label htmlFor="status">Estado</Label>
                                    <Select value={vehicleFormData.status} onValueChange={(value) => setVehicleFormData({...vehicleFormData, status: value})}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="active">Activo</SelectItem>
                                            <SelectItem value="maintenance">En Mantenimiento</SelectItem>
                                            <SelectItem value="out_of_service">Fuera de Servicio</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div>
                                <Label>Fotos del Vehículo</Label>
                                <PhotoUploader uploadedUrls={vehicleFormData.photos} onUrlsChange={(photos) => setVehicleFormData({...vehicleFormData, photos})} />
                            </div>
                            <div className="flex justify-end gap-4">
                                <Button type="button" variant="outline" onClick={handleCloseVehicleForm}>Cancelar</Button>
                                <Button type="submit" className="bg-green-600 hover:bg-green-700">Guardar Vehículo</Button>
                            </div>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}