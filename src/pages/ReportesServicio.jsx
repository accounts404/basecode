import React, { useState, useEffect, useCallback } from 'react';
import { ServiceReport } from '@/entities/ServiceReport';
import { User } from '@/entities/User';
import { Client } from '@/entities/Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, Calendar, Users, CheckCircle, X, MessageSquare, Image, Clock, Filter, Search, User as UserIcon, Calendar as CalendarIcon } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';

const priorityConfig = {
    low: { label: '🟢 Baja', color: 'bg-green-100 text-green-800' },
    medium: { label: '🟡 Media', color: 'bg-yellow-100 text-yellow-800' },
    high: { label: '🟠 Alta', color: 'bg-orange-100 text-orange-800' },
    urgent: { label: '🔴 Urgente', color: 'bg-red-100 text-red-800' }
};

const statusConfig = {
    pending: { label: '⏳ Pendiente', color: 'bg-blue-100 text-blue-800', count: 0 },
    in_review: { label: '👀 En Revisión', color: 'bg-purple-100 text-purple-800', count: 0 },
    resolved: { label: '✅ Resuelto', color: 'bg-green-100 text-green-800', count: 0 },
    dismissed: { label: '❌ Descartado', color: 'bg-gray-100 text-gray-800', count: 0 }
};

export default function ReportesServicioPage() {
    const [reports, setReports] = useState([]);
    const [filteredReports, setFilteredReports] = useState([]);
    const [cleaners, setCleaners] = useState([]);
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Filtros
    const [priorityFilter, setPriorityFilter] = useState('all');
    const [cleanerFilter, setCleanerFilter] = useState('all');
    const [clientFilter, setClientFilter] = useState('all');
    const [clientSearch, setClientSearch] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    
    // Estado activo de la pestaña
    const [activeTab, setActiveTab] = useState('pending');
    
    // Modal de gestión
    const [selectedReport, setSelectedReport] = useState(null);
    const [adminNotes, setAdminNotes] = useState('');
    const [resolutionAction, setResolutionAction] = useState('');
    const [updating, setUpdating] = useState(false);

    useEffect(() => {
        loadInitialData();
    }, []);

    const loadInitialData = async () => {
        setLoading(true);
        try {
            // Cargar reportes, limpiadores y clientes en paralelo
            const [reportsResult, cleanersResult, clientsResult] = await Promise.allSettled([
                ServiceReport.list('-created_date'),
                User.filter({ role: 'user' }),
                Client.list()
            ]);

            const allReports = reportsResult.status === 'fulfilled' ? reportsResult.value || [] : [];
            const allCleaners = cleanersResult.status === 'fulfilled' ? cleanersResult.value || [] : [];
            const allClients = clientsResult.status === 'fulfilled' ? clientsResult.value || [] : [];

            setReports(allReports);
            setCleaners(allCleaners);
            setClients(allClients);

            // Establecer rango de fechas por defecto: último mes
            const lastMonth = subMonths(new Date(), 1);
            setDateFrom(format(startOfMonth(lastMonth), 'yyyy-MM-dd'));
            setDateTo(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
        } catch (error) {
            console.error('Error cargando datos iniciales:', error);
            setReports([]);
            setCleaners([]);
            setClients([]);
        }
        setLoading(false);
    };

    const applyFilters = useCallback(() => {
        let filtered = [...reports];

        // Filtro por rango de fechas
        if (dateFrom) {
            const fromDate = startOfDay(new Date(dateFrom));
            filtered = filtered.filter(report => new Date(report.service_date) >= fromDate);
        }
        if (dateTo) {
            const toDate = endOfDay(new Date(dateTo));
            filtered = filtered.filter(report => new Date(report.service_date) <= toDate);
        }

        // Filtro por prioridad
        if (priorityFilter !== 'all') {
            filtered = filtered.filter(report => report.priority === priorityFilter);
        }

        // Filtro por limpiador
        if (cleanerFilter !== 'all') {
            filtered = filtered.filter(report => report.cleaner_id === cleanerFilter);
        }

        // Filtro por cliente
        if (clientFilter !== 'all') {
            filtered = filtered.filter(report => report.client_name?.toLowerCase().includes(clientFilter.toLowerCase()));
        }

        // Búsqueda por nombre de cliente
        if (clientSearch.trim()) {
            const searchTerm = clientSearch.toLowerCase().trim();
            filtered = filtered.filter(report => 
                report.client_name?.toLowerCase().includes(searchTerm)
            );
        }

        setFilteredReports(filtered);
    }, [reports, priorityFilter, cleanerFilter, clientFilter, clientSearch, dateFrom, dateTo]);

    useEffect(() => {
        applyFilters();
    }, [applyFilters]);

    const handleUpdateReport = async (reportId, newStatus) => {
        setUpdating(true);
        try {
            const updateData = {
                status: newStatus,
                admin_notes: adminNotes,
                resolution_action: resolutionAction
            };

            if (newStatus === 'resolved') {
                updateData.resolution_date = new Date().toISOString();
            }

            await ServiceReport.update(reportId, updateData);
            await loadInitialData(); // Recargar datos
            setSelectedReport(null);
            setAdminNotes('');
            setResolutionAction('');
        } catch (error) {
            console.error('Error actualizando reporte:', error);
            alert('Error al actualizar el reporte.');
        }
        setUpdating(false);
    };

    const openReportDetails = (report) => {
        setSelectedReport(report);
        setAdminNotes(report.admin_notes || '');
        setResolutionAction(report.resolution_action || '');
    };

    const getReportsByStatus = (status) => {
        return filteredReports.filter(report => report.status === status);
    };

    const getStatusCounts = () => {
        const counts = {
            pending: getReportsByStatus('pending').length,
            in_review: getReportsByStatus('in_review').length,
            resolved: getReportsByStatus('resolved').length,
            dismissed: getReportsByStatus('dismissed').length
        };
        return counts;
    };

    const clearAllFilters = () => {
        setPriorityFilter('all');
        setCleanerFilter('all');
        setClientFilter('all');
        setClientSearch('');
        setDateFrom('');
        setDateTo('');
    };

    // Renderizar la lista de reportes para cada pestaña
    const renderReportsForStatus = (status) => {
        const reportsForStatus = getReportsByStatus(status);
        
        if (reportsForStatus.length === 0) {
            return (
                <Card>
                    <CardContent className="text-center py-12">
                        <MessageSquare className="w-16 h-16 text-slate-400 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-slate-900 mb-2">
                            No hay reportes {statusConfig[status].label.toLowerCase()}
                        </h3>
                        <p className="text-slate-600">
                            No se encontraron reportes con los filtros aplicados.
                        </p>
                    </CardContent>
                </Card>
            );
        }

        return (
            <div className="grid gap-6">
                {reportsForStatus.map((report) => (
                    <Card key={report.id} className="shadow-lg border-0 hover:shadow-xl transition-shadow">
                        <CardContent className="p-6">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <h3 className="text-xl font-bold text-slate-900">
                                            {report.client_name}
                                        </h3>
                                        <Badge className={priorityConfig[report.priority]?.color}>
                                            {priorityConfig[report.priority]?.label}
                                        </Badge>
                                        <Badge className={statusConfig[report.status]?.color}>
                                            {statusConfig[report.status]?.label}
                                        </Badge>
                                    </div>
                                    
                                    <div className="text-sm text-slate-600 mb-3 space-y-1">
                                        <div className="flex items-center gap-2">
                                            <Users className="w-4 h-4" />
                                            <span>{report.cleaner_name}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Calendar className="w-4 h-4" />
                                            <span>{format(new Date(report.service_date), "d 'de' MMM, yyyy", { locale: es })}</span>
                                        </div>
                                    </div>

                                    <div className="bg-slate-50 p-4 rounded-lg">
                                        <p className="text-slate-800 whitespace-pre-wrap">
                                            {report.report_notes}
                                        </p>
                                    </div>

                                    {report.report_photos && report.report_photos.length > 0 && (
                                        <div className="mt-3">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Image className="w-4 h-4 text-slate-500" />
                                                <span className="text-sm text-slate-600">{report.report_photos.length} foto(s) adjunta(s)</span>
                                            </div>
                                            <div className="flex gap-2">
                                                {report.report_photos.slice(0, 3).map((photo, index) => (
                                                    <a key={index} href={photo.url} target="_blank" rel="noopener noreferrer">
                                                        <img 
                                                            src={photo.url} 
                                                            alt={`Foto ${index + 1}`}
                                                            className="w-16 h-16 object-cover rounded-lg border hover:opacity-75 transition-opacity"
                                                        />
                                                    </a>
                                                ))}
                                                {report.report_photos.length > 3 && (
                                                    <div className="w-16 h-16 bg-slate-200 rounded-lg border flex items-center justify-center text-slate-600 text-sm">
                                                        +{report.report_photos.length - 3}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="ml-6 text-right">
                                    <p className="text-xs text-slate-500 mb-2">
                                        Reportado el {format(new Date(report.created_date), "d MMM 'a las' HH:mm", { locale: es })}
                                    </p>
                                    <Button 
                                        onClick={() => openReportDetails(report)}
                                        className="bg-blue-600 hover:bg-blue-700"
                                    >
                                        Gestionar
                                    </Button>
                                </div>
                            </div>

                            {report.admin_notes && (
                                <div className="mt-4 border-t pt-4">
                                    <div className="bg-blue-50 p-4 rounded-lg">
                                        <p className="text-sm font-semibold text-blue-900 mb-1">Notas del Administrador:</p>
                                        <p className="text-blue-800 text-sm whitespace-pre-wrap">{report.admin_notes}</p>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 p-6">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="text-slate-600 mt-4">Cargando reportes...</p>
                    </div>
                </div>
            </div>
        );
    }

    const statusCounts = getStatusCounts();

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-slate-900 mb-2">
                        Reportes de Servicio
                    </h1>
                    <p className="text-slate-600">
                        Gestiona los reportes de problemas enviados por los limpiadores durante los servicios.
                    </p>
                </div>

                {/* Filtros Avanzados */}
                <Card className="mb-8">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Filter className="w-5 h-5 text-blue-600" />
                            Filtros de Búsqueda
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Rango de Fechas */}
                        <div>
                            <Label className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                                <CalendarIcon className="w-4 h-4" />
                                Rango de Fechas del Servicio
                            </Label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <Label htmlFor="dateFrom" className="text-xs text-slate-500">Desde</Label>
                                    <Input
                                        id="dateFrom"
                                        type="date"
                                        value={dateFrom}
                                        onChange={(e) => setDateFrom(e.target.value)}
                                        className="w-full"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="dateTo" className="text-xs text-slate-500">Hasta</Label>
                                    <Input
                                        id="dateTo"
                                        type="date"
                                        value={dateTo}
                                        onChange={(e) => setDateTo(e.target.value)}
                                        className="w-full"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Filtros por Selector */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Filtro por Limpiador */}
                            <div>
                                <Label className="text-xs text-slate-500 mb-2 flex items-center gap-1">
                                    <UserIcon className="w-3 h-3" />
                                    Limpiador
                                </Label>
                                <Select value={cleanerFilter} onValueChange={setCleanerFilter}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Todos los limpiadores" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todos los Limpiadores</SelectItem>
                                        {cleaners.map((cleaner) => (
                                            <SelectItem key={cleaner.id} value={cleaner.id}>
                                                {cleaner.full_name || cleaner.email}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Filtro por Prioridad */}
                            <div>
                                <Label className="text-xs text-slate-500 mb-2">Prioridad</Label>
                                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Todas las prioridades" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todas las Prioridades</SelectItem>
                                        <SelectItem value="urgent">🔴 Urgente</SelectItem>
                                        <SelectItem value="high">🟠 Alta</SelectItem>
                                        <SelectItem value="medium">🟡 Media</SelectItem>
                                        <SelectItem value="low">🟢 Baja</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Búsqueda por Cliente */}
                            <div>
                                <Label className="text-xs text-slate-500 mb-2 flex items-center gap-1">
                                    <Search className="w-3 h-3" />
                                    Buscar Cliente
                                </Label>
                                <Input
                                    type="text"
                                    placeholder="Nombre del cliente..."
                                    value={clientSearch}
                                    onChange={(e) => setClientSearch(e.target.value)}
                                    className="w-full"
                                />
                            </div>
                        </div>

                        {/* Botón para Limpiar Filtros */}
                        <div className="flex justify-between items-center">
                            <div className="text-sm text-slate-600">
                                {filteredReports.length} reporte(s) encontrado(s)
                            </div>
                            <Button 
                                variant="outline" 
                                onClick={clearAllFilters}
                                className="text-slate-600 hover:text-slate-800"
                            >
                                Limpiar Filtros
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Pestañas por Estado */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="pending" className="relative">
                            ⏳ Pendientes
                            {statusCounts.pending > 0 && (
                                <Badge className="ml-2 bg-blue-600 text-white text-xs">
                                    {statusCounts.pending}
                                </Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="in_review" className="relative">
                            👀 En Revisión
                            {statusCounts.in_review > 0 && (
                                <Badge className="ml-2 bg-purple-600 text-white text-xs">
                                    {statusCounts.in_review}
                                </Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="resolved" className="relative">
                            ✅ Resueltas
                            {statusCounts.resolved > 0 && (
                                <Badge className="ml-2 bg-green-600 text-white text-xs">
                                    {statusCounts.resolved}
                                </Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="dismissed" className="relative">
                            ❌ Descartadas
                            {statusCounts.dismissed > 0 && (
                                <Badge className="ml-2 bg-gray-600 text-white text-xs">
                                    {statusCounts.dismissed}
                                </Badge>
                            )}
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="pending">
                        {renderReportsForStatus('pending')}
                    </TabsContent>

                    <TabsContent value="in_review">
                        {renderReportsForStatus('in_review')}
                    </TabsContent>

                    <TabsContent value="resolved">
                        {renderReportsForStatus('resolved')}
                    </TabsContent>

                    <TabsContent value="dismissed">
                        {renderReportsForStatus('dismissed')}
                    </TabsContent>
                </Tabs>

                {/* Modal de gestión de reporte */}
                {selectedReport && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                            <CardHeader>
                                <CardTitle className="flex items-center justify-between">
                                    <span>Gestionar Reporte - {selectedReport.client_name}</span>
                                    <Button variant="ghost" size="sm" onClick={() => setSelectedReport(null)}>
                                        <X className="w-4 h-4" />
                                    </Button>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="space-y-2">
                                    <Label>Cambiar Estado</Label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <Button 
                                            variant={selectedReport.status === 'in_review' ? 'default' : 'outline'}
                                            onClick={() => handleUpdateReport(selectedReport.id, 'in_review')}
                                            disabled={updating}
                                            className="justify-start"
                                        >
                                            👀 En Revisión
                                        </Button>
                                        <Button 
                                            variant={selectedReport.status === 'resolved' ? 'default' : 'outline'}
                                            onClick={() => handleUpdateReport(selectedReport.id, 'resolved')}
                                            disabled={updating}
                                            className="justify-start"
                                        >
                                            ✅ Resolver
                                        </Button>
                                        <Button 
                                            variant={selectedReport.status === 'dismissed' ? 'default' : 'outline'}
                                            onClick={() => handleUpdateReport(selectedReport.id, 'dismissed')}
                                            disabled={updating}
                                            className="justify-start"
                                        >
                                            ❌ Descartar
                                        </Button>
                                        <Button 
                                            variant={selectedReport.status === 'pending' ? 'default' : 'outline'}
                                            onClick={() => handleUpdateReport(selectedReport.id, 'pending')}
                                            disabled={updating}
                                            className="justify-start"
                                        >
                                            ⏳ Pendiente
                                        </Button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="admin_notes">Notas del Administrador</Label>
                                    <Textarea 
                                        id="admin_notes"
                                        value={adminNotes}
                                        onChange={(e) => setAdminNotes(e.target.value)}
                                        placeholder="Agrega notas internas sobre este reporte..."
                                        rows={4}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="resolution_action">Acción de Resolución</Label>
                                    <Textarea 
                                        id="resolution_action"
                                        value={resolutionAction}
                                        onChange={(e) => setResolutionAction(e.target.value)}
                                        placeholder="Describe qué acción se tomó para resolver este reporte..."
                                        rows={3}
                                    />
                                </div>

                                <div className="flex justify-end gap-3">
                                    <Button 
                                        variant="outline" 
                                        onClick={() => setSelectedReport(null)}
                                        disabled={updating}
                                    >
                                        Cancelar
                                    </Button>
                                    <Button 
                                        onClick={() => handleUpdateReport(selectedReport.id, selectedReport.status)}
                                        disabled={updating}
                                        className="bg-blue-600 hover:bg-blue-700"
                                    >
                                        {updating ? 'Guardando...' : 'Guardar Cambios'}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>
        </div>
    );
}