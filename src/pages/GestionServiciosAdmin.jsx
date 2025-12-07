import React, { useState, useEffect } from 'react';
import { Schedule } from '@/entities/Schedule';
import { Client } from '@/entities/Client';
import { User } from '@/entities/User';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Search, Edit, Trash2, Calendar as CalendarIcon, Clock, Users, AlertTriangle, Loader2, Filter } from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';

import CrearServicioForm from '../components/horario/CrearServicioForm';

const parseISOAsUTC = (isoString) => {
    if (!isoString) return null;
    // Ensure the string ends with 'Z' for UTC interpretation by Date constructor
    const correctedIsoString = isoString.endsWith('Z') ? isoString : `${isoString}Z`;
    return new Date(correctedIsoString);
};

const formatTimeUTC = (isoString) => {
    if (!isoString) return '';
    const date = parseISOAsUTC(isoString);
    if (!date || isNaN(date.getTime())) return ''; // Check for invalid date
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
};

export default function GestionServiciosAdminPage() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [searching, setSearching] = useState(false);
    const [error, setError] = useState(null);
    
    // Datos
    const [outOfRangeSchedules, setOutOfRangeSchedules] = useState([]);
    const [users, setUsers] = useState([]);
    
    // Filtro por mes (por defecto mes actual)
    const currentMonth = format(new Date(), 'yyyy-MM');
    const [selectedMonth, setSelectedMonth] = useState(currentMonth);
    
    // Modal de edición
    const [editingService, setEditingService] = useState(null);
    const [showEditModal, setShowEditModal] = useState(false);
    
    // Modal de eliminación
    const [deletingService, setDeletingService] = useState(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    useEffect(() => {
        loadInitialData();
    }, []);

    // Cargar automáticamente cuando cambia el mes
    useEffect(() => {
        if (user) {
            handleSearch();
        }
    }, [selectedMonth, user]);

    const loadInitialData = async () => {
        setLoading(true);
        setError(null);
        try {
            const currentUser = await User.me();
            
            if (currentUser.role !== 'admin') {
                setError('Acceso denegado. Esta página es solo para administradores.');
                setLoading(false);
                return;
            }
            
            setUser(currentUser);
            
            // CRÍTICO: Usar base44 directamente con límite alto
            const { base44 } = await import('@/api/base44Client');
            const allUsers = await base44.entities.User.list('-created_date', 500);
            setUsers(allUsers || []);
            
        } catch (err) {
            console.error('Error cargando datos iniciales:', err);
            setError('Error al cargar datos: ' + (err.message || 'Error desconocido'));
        } finally {
            setLoading(false);
        }
    };

    // Función para detectar si un servicio está fuera del horario visible (6 AM - 9 PM)
    const isOutOfVisibleHours = (service) => {
        if (!service.start_time) return false;
        const serviceDate = parseISOAsUTC(service.start_time);
        if (!serviceDate || isNaN(serviceDate.getTime())) return false; // Handle invalid date
        const hour = serviceDate.getUTCHours();
        // Fuera de rango: antes de 6 AM (UTC) o después de 9 PM (21:00 UTC)
        return hour < 6 || hour >= 21;
    };

    const handleSearch = async () => {
        setSearching(true);
        setError(null);
        try {
            // Construir rango de fechas del mes seleccionado, en UTC
            const [year, month] = selectedMonth.split('-').map(Number);
            // Months are 0-indexed in Date constructor, so month - 1
            const monthDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
            const startDate = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth(), 1, 0, 0, 0, 0));
            const endDate = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0, 23, 59, 59, 999));
            
            const startDateStr = startDate.toISOString();
            const endDateStr = endDate.toISOString();
            
            const filterQuery = {
                start_time: {
                    $gte: startDateStr,
                    $lte: endDateStr
                }
            };
            
            // Obtener todos los schedules del mes con paginación
            const { base44 } = await import('@/api/base44Client');
            const schedules = await base44.entities.Schedule.filter(filterQuery, '-start_time', 5000);
            
            // Filtrar solo los que están fuera del horario visible
            const outOfRange = (schedules || []).filter(isOutOfVisibleHours);
            
            setOutOfRangeSchedules(outOfRange);
            
        } catch (err) {
            console.error('Error buscando servicios:', err);
            setError('Error al buscar servicios: ' + (err.message || 'Error desconocido'));
        } finally {
            setSearching(false);
        }
    };

    const handleEditService = (service) => {
        setEditingService(service);
        setShowEditModal(true);
    };

    const handleSaveService = async (serviceData, updateScope) => {
        try {
            await Schedule.update(editingService.id, serviceData);
            setShowEditModal(false);
            setEditingService(null);
            
            // Recargar búsqueda para reflejar cambios
            await handleSearch();
        } catch (err) {
            console.error('Error guardando servicio:', err);
            setError('Error al guardar el servicio: ' + (err.message || 'Error desconocido'));
            throw err;
        }
    };

    const handleDeleteClick = (service) => {
        setDeletingService(service);
        setShowDeleteModal(true);
    };

    const handleConfirmDelete = async () => {
        if (!deletingService) return;
        
        try {
            await Schedule.delete(deletingService.id);
            setShowDeleteModal(false);
            setDeletingService(null);
            
            // Recargar búsqueda para reflejar cambios
            await handleSearch();
        } catch (err) {
            console.error('Error eliminando servicio:', err);
            setError('Error al eliminar el servicio: ' + (err.message || 'Error desconocido'));
        }
    };
    
    const statusConfig = {
        scheduled: { label: 'Programado', color: 'bg-blue-100 text-blue-800' },
        in_progress: { label: 'En Progreso', color: 'bg-yellow-100 text-yellow-800' },
        completed: { label: 'Completado', color: 'bg-green-100 text-green-800' },
        cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-800' }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
                <div className="text-center space-y-4">
                    <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto" />
                    <p className="text-slate-600">Cargando datos...</p>
                </div>
            </div>
        );
    }

    if (error && !user) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
                <Alert variant="destructive" className="max-w-md">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6 md:p-8">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-2">
                            <Search className="w-8 h-8 text-blue-600" />
                            Servicios Fuera de Rango
                        </h1>
                        <p className="text-slate-600 mt-2">
                            Encuentra servicios programados entre 9 PM y 6 AM (UTC) que no son visibles en el calendario normal.
                        </p>
                    </div>
                </div>

                {error && (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {/* Filtro por Mes */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Filter className="w-5 h-5" />
                            Seleccionar Mes
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex gap-4 items-end">
                            <div className="flex-1">
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Mes a Revisar
                                </label>
                                <Input
                                    type="month"
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                    className="max-w-xs"
                                />
                            </div>
                            <Button
                                onClick={handleSearch}
                                disabled={searching}
                                className="bg-blue-600 hover:bg-blue-700"
                            >
                                {searching ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Buscando...
                                    </>
                                ) : (
                                    <>
                                        <Search className="w-4 h-4 mr-2" />
                                        Buscar
                                    </>
                                )}
                            </Button>
                        </div>
                        <p className="text-sm text-slate-500">
                            Se mostrarán solo los servicios programados entre 9:00 PM y 6:00 AM (UTC).
                        </p>
                    </CardContent>
                </Card>

                {/* Results */}
                <Card className="shadow-xl">
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                            <span>Servicios Fuera de Rango Horario</span>
                            <Badge variant="outline" className="text-lg">
                                {outOfRangeSchedules.length} servicio{outOfRangeSchedules.length !== 1 ? 's' : ''}
                            </Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {searching ? (
                            <div className="text-center py-12">
                                <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
                                <p className="text-slate-600">Buscando servicios...</p>
                            </div>
                        ) : outOfRangeSchedules.length > 0 ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Cliente</TableHead>
                                        <TableHead>Fecha</TableHead>
                                        <TableHead>Hora</TableHead>
                                        <TableHead>Limpiadores</TableHead>
                                        <TableHead>Estado</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {outOfRangeSchedules.map((service) => {
                                        const serviceDate = parseISOAsUTC(service.start_time);
                                        const cleanerNames = users
                                            .filter(u => service.cleaner_ids?.includes(u.id))
                                            .map(u => u.invoice_name || u.full_name)
                                            .join(', ');
                                        
                                        return (
                                            <TableRow key={service.id}>
                                                <TableCell className="font-medium">{service.client_name || 'Sin cliente'}</TableCell>
                                                <TableCell>
                                                    {serviceDate && !isNaN(serviceDate.getTime()) ? format(serviceDate, "d MMM yyyy", { locale: es }) : 'N/A'}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className="bg-orange-50 border-orange-300">
                                                        {formatTimeUTC(service.start_time)}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-sm text-slate-600">
                                                    {cleanerNames || 'Sin asignar'}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={
                                                        service.status === 'completed' ? 'default' :
                                                        service.status === 'in_progress' ? 'secondary' :
                                                        service.status === 'cancelled' ? 'destructive' : 'outline'
                                                    }>
                                                        {service.status === 'completed' ? 'Completado' :
                                                         service.status === 'in_progress' ? 'En progreso' :
                                                         service.status === 'cancelled' ? 'Cancelado' : 'Programado'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleEditService(service)}
                                                        >
                                                            <Edit className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => {
                                                                setDeletingService(service);
                                                                setShowDeleteModal(true);
                                                            }}
                                                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        ) : (
                            <div className="text-center py-12">
                                <Search className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                                <p className="text-slate-600 font-medium">No se encontraron servicios fuera de rango</p>
                                <p className="text-slate-500 text-sm mt-2">
                                    Todos los servicios de {format(new Date(selectedMonth + '-01'), 'MMMM yyyy', { locale: es })} están dentro del horario visible (6 AM - 9 PM UTC)
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>

            {/* Modal de Edición */}
            <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Editar Servicio</DialogTitle>
                    </DialogHeader>
                    {editingService && (
                        <CrearServicioForm
                            schedule={editingService}
                            onSave={handleSaveService}
                            onCancel={() => {
                                setShowEditModal(false);
                                setEditingService(null);
                            }}
                            onDelete={null} // Asumimos que la eliminación se gestiona por separado o no está disponible en este formulario
                            users={users}
                            isReadOnly={false}
                        />
                    )}
                </DialogContent>
            </Dialog>

            {/* Modal de Confirmación de Eliminación */}
            <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirmar Eliminación</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <p className="text-slate-600">
                            ¿Estás seguro de que deseas eliminar este servicio?
                        </p>
                        {deletingService && (
                            <div className="mt-4 p-4 bg-slate-50 rounded-lg">
                                <p className="font-medium">{deletingService.client_name}</p>
                                <p className="text-sm text-slate-600">
                                    {deletingService.start_time ? 
                                        format(parseISO(deletingService.start_time), "dd MMM yyyy 'a las' HH:mm", { locale: es }) : 
                                        'Fecha no disponible'
                                    }
                                </p>
                            </div>
                        )}
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button
                            variant="outline"
                            onClick={() => {
                                setShowDeleteModal(false);
                                setDeletingService(null);
                            }}
                        >
                            Cancelar
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleConfirmDelete}
                        >
                            Eliminar
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    </div>
    );
}