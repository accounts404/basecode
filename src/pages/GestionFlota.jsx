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
import { Car, Users, Plus, Edit, Trash2, Calendar, AlertTriangle, Loader2, KeySquare } from 'lucide-react';
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

    const loadInitialData = async () => {
        setLoading(true);
        try {
            const [vehiclesData, usersData] = await Promise.all([
                Vehicle.list('-created_date'),
                User.list()
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
        return <div className="p-6 text-center">Cargando datos iniciales...</div>;
    }

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-slate-900">Gestión de Flota y Equipos</h1>
                <p className="text-slate-600">Administra vehículos y asignaciones diarias de equipos</p>
            </div>

            <Tabs defaultValue="assignments" className="space-y-6">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="assignments" className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        Asignaciones de Equipos
                    </TabsTrigger>
                    <TabsTrigger value="vehicles" className="flex items-center gap-2">
                        <Car className="w-4 h-4" />
                        Vehículos
                    </TabsTrigger>
                </TabsList>

                {/* --- Pestaña de Asignaciones --- */}
                <TabsContent value="assignments" className="space-y-6">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <Button variant="outline" onClick={() => setSelectedDate(format(subDays(parseISO(selectedDate), 1), 'yyyy-MM-dd'))}>←</Button>
                            <Input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="w-48"
                            />
                            <Button variant="outline" onClick={() => setSelectedDate(format(addDays(parseISO(selectedDate), 1), 'yyyy-MM-dd'))}>→</Button>
                            <Button variant="outline" onClick={() => setSelectedDate(format(new Date(), 'yyyy-MM-dd'))}>Hoy</Button>
                        </div>
                    </div>

                    <div className="mb-4">
                        <h2 className="text-xl font-semibold text-slate-900">
                            Equipos para {format(parseISO(selectedDate), "EEEE, d 'de' MMMM", { locale: es })}
                        </h2>
                    </div>

                    {loadingTeams ? (
                        <div className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600" /><p className="mt-2 text-slate-600">Buscando equipos en el horario...</p></div>
                    ) : dailyTeams.length > 0 ? (
                        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                            {dailyTeams.map((team) => {
                                const teamAssignment = assignments.find(a => {
                                    const sortedA = [...(a.team_member_ids || [])].sort().join(',');
                                    const sortedT = [...team.memberIds].sort().join(',');
                                    return sortedA === sortedT;
                                });

                                const hasVehicleAssigned = teamAssignment && teamAssignment.vehicle_id;
                                
                                return (
                                    <Card 
                                        key={team.id} 
                                        className={`hover:shadow-lg transition-shadow ${
                                            hasVehicleAssigned 
                                                ? 'bg-green-50 border-green-200 shadow-md' 
                                                : 'bg-white'
                                        }`}
                                    >
                                        <CardHeader>
                                            <div className="flex items-center justify-between">
                                                <CardTitle className="text-lg">Equipo del Día</CardTitle>
                                                {hasVehicleAssigned && (
                                                    <Badge className="bg-green-100 text-green-800 border-green-300">
                                                        Vehículo Asignado
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap gap-2 pt-2">
                                                {team.memberIds.map(id => (
                                                    <Badge 
                                                        key={id} 
                                                        variant={hasVehicleAssigned ? "default" : "secondary"}
                                                        className={hasVehicleAssigned ? "bg-green-600 text-white" : ""}
                                                    >
                                                        {userMap.get(id) || 'Desconocido'}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            <div>
                                                <Label className={`font-semibold ${hasVehicleAssigned ? 'text-green-800' : 'text-slate-700'}`}>
                                                    Vehículo Asignado
                                                </Label>
                                                <Select
                                                    value={teamAssignment?.vehicle_id || 'none'}
                                                    onValueChange={(value) => handleVehicleAssignment(team.memberIds, value)}
                                                >
                                                    <SelectTrigger className={hasVehicleAssigned ? 'border-green-300 bg-white' : ''}>
                                                        <SelectValue placeholder="Asignar un vehículo..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value={'none'}>Sin Asignar</SelectItem>
                                                        {vehicles.filter(v => v.status === 'active').map(vehicle => {
                                                            const available = isVehicleAvailable(vehicle.id, team.memberIds);
                                                            return (
                                                                <SelectItem key={vehicle.id} value={vehicle.id} disabled={!available}>
                                                                    {`${vehicle.make} ${vehicle.model} (${vehicle.license_plate})${!available ? ' (Asignado a otro equipo)' : ''}`}
                                                                </SelectItem>
                                                            );
                                                        })}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            {/* NUEVO: Selector de Conductor Principal */}
                                            {hasVehicleAssigned && (
                                                <div>
                                                    <Label className="font-semibold text-blue-800">
                                                        Conductor Principal
                                                    </Label>
                                                    <Select
                                                        value={teamAssignment?.main_driver_id || team.memberIds[0]}
                                                        onValueChange={(value) => handleDriverAssignment(team.memberIds, value)}
                                                    >
                                                        <SelectTrigger className="border-blue-300 bg-white">
                                                            <SelectValue placeholder="Seleccionar conductor..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {team.memberIds.map(memberId => (
                                                                <SelectItem key={memberId} value={memberId}>
                                                                    {userMap.get(memberId) || 'Desconocido'}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <p className="text-xs text-blue-600 mt-1">
                                                        👤 {userMap.get(teamAssignment?.main_driver_id || team.memberIds[0])} será el conductor principal
                                                    </p>
                                                </div>
                                            )}

                                            <div>
                                                <h4 className={`font-semibold mb-2 text-sm ${hasVehicleAssigned ? 'text-green-800' : 'text-slate-700'}`}>
                                                    Servicios del Día ({team.services.length})
                                                </h4>
                                                <ul className="text-xs text-slate-600 list-disc list-inside max-h-24 overflow-y-auto">
                                                    {team.services.sort((a,b) => {
                                                        const dateA = parseISOAsUTC(a.start_time);
                                                        const dateB = parseISOAsUTC(b.start_time);
                                                        return dateA.getTime() - dateB.getTime();
                                                    }).map((service, index) => {
                                                        const startTime = parseISOAsUTC(service.start_time);
                                                        return (
                                                            <li key={index}>
                                                                <span className="font-mono">{formatTimeUTC(startTime)}</span> - {service.client_name}
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            </div>
                                            
                                            {/* NUEVA SECCIÓN: LLAVES REQUERIDAS */}
                                            <div>
                                                <h4 className="font-semibold mb-2 text-sm flex items-center gap-2 text-slate-700">
                                                    <KeySquare className="w-4 h-4 text-orange-600" />
                                                    Llaves Requeridas ({team.requiredKeys.length})
                                                </h4>
                                                {team.requiredKeys.length > 0 ? (
                                                    <div className="flex flex-wrap gap-2">
                                                        {team.requiredKeys.map((key, index) => (
                                                            <Badge key={index} variant="outline" className="bg-orange-50 border-orange-200 text-orange-800">
                                                                {key.identifier} <span className="text-orange-600 ml-1">({key.client_name.split(' ')[0]})</span>
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-xs text-slate-500">No se requieren llaves para los servicios de este equipo.</p>
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-12">
                            <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-slate-900 mb-2">No se encontraron equipos</h3>
                            <p className="text-slate-500">No hay servicios con limpiadores asignados en el horario para este día.</p>
                        </div>
                    )}
                </TabsContent>

                {/* --- Pestaña de Vehículos (sin cambios funcionales) --- */}
                <TabsContent value="vehicles" className="space-y-6">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-semibold text-slate-900">Flota de Vehículos</h2>
                        <Button onClick={() => { setEditingVehicle(null); setShowVehicleForm(true); }} className="bg-green-600 hover:bg-green-700">
                            <Plus className="w-4 h-4 mr-2" />
                            Nuevo Vehículo
                        </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {vehicles.map(vehicle => (
                            <Card key={vehicle.id} className="hover:shadow-lg transition-shadow">
                                <CardHeader>
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-green-100 rounded-lg">
                                                <Car className="w-6 h-6 text-green-600" />
                                            </div>
                                            <div>
                                                <CardTitle className="text-lg">{vehicle.make} {vehicle.model}</CardTitle>
                                                <p className="text-sm text-slate-600">{vehicle.year} • {vehicle.color}</p>
                                            </div>
                                        </div>
                                        <Badge className={getStatusColor(vehicle.status)}>{getStatusLabel(vehicle.status)}</Badge>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3">
                                        <div className="text-center p-3 bg-slate-50 rounded-lg">
                                            <p className="font-mono text-lg font-bold text-slate-900">{vehicle.license_plate}</p>
                                            <p className="text-xs text-slate-600">Matrícula</p>
                                        </div>
                                        {vehicle.photos && vehicle.photos.length > 0 && (
                                            <div className="grid grid-cols-2 gap-2">
                                                <img src={vehicle.photos[0].url} alt="Foto vehículo" className="w-full h-20 object-cover rounded-lg" />
                                                {vehicle.photos.length > 1 && <div className="w-full h-20 bg-slate-100 flex items-center justify-center rounded-lg">+{vehicle.photos.length - 1}</div>}
                                            </div>
                                        )}
                                        <div className="flex gap-2 mt-4">
                                            <Button variant="outline" size="sm" onClick={() => handleEditVehicle(vehicle)} className="flex-1">
                                                <Edit className="w-3 h-3 mr-1" />Editar
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={() => handleDeleteVehicle(vehicle.id)} className="text-red-600 hover:text-red-700">
                                                <Trash2 className="w-3 h-3" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
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
                        {/* Campos del formulario simplificados */}
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
    );
}