import React, { useState, useEffect, useMemo } from 'react';
import { Client } from '@/entities/Client';
import { Schedule } from '@/entities/Schedule';
import { ServiceReport } from '@/entities/ServiceReport';
import { User } from '@/entities/User';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
    History, 
    Calendar, 
    DollarSign, 
    Users, 
    ExternalLink, 
    AlertTriangle,
    Clock,
    CheckCircle,
    XCircle,
    FileText,
    MapPin,
    ChevronDown,
    ChevronUp,
    Camera,
    Search,
    X,
    Eye,
    EyeOff
} from 'lucide-react';
import { format, parseISO, isFuture, isPast } from 'date-fns';
import { es } from 'date-fns/locale';
import { createPageUrl } from '@/utils';
import { getPriceForSchedule, calculateGST } from '@/components/utils/priceCalculations';

// Helper para interpretar fechas ISO en hora local (sin forzar UTC)
const parseISOAsLocal = (isoString) => {
    if (!isoString) return null;
    // Remover la 'Z' si existe para interpretar en hora local del navegador
    const cleanString = isoString.endsWith('Z') ? isoString.slice(0, -1) : isoString;
    return new Date(cleanString);
};

export default function HistorialClientes() {
    const [clients, setClients] = useState([]);
    const [selectedClientId, setSelectedClientId] = useState(null);
    const [schedules, setSchedules] = useState([]);
    const [serviceReports, setServiceReports] = useState([]);
    const [cleaners, setCleaners] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedServices, setExpandedServices] = useState(new Set());
    const [searchTerm, setSearchTerm] = useState('');
    const [showPrices, setShowPrices] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        // Verificar si hay un cliente pre-seleccionado en la URL
        const urlParams = new URLSearchParams(window.location.search);
        const clientId = urlParams.get('client_id');
        if (clientId) {
            setSelectedClientId(clientId);
        }
    }, [clients]);

    useEffect(() => {
        if (selectedClientId) {
            loadClientSchedules(selectedClientId);
        }
    }, [selectedClientId]);

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

    const loadData = async () => {
        setLoading(true);
        try {
            const [clientsData, cleanersData, reportsData] = await Promise.all([
                loadAllRecords(Client, '-created_date'),
                loadAllRecords(User, '-created_date'),
                loadAllRecords(ServiceReport, '-created_date')
            ]);
            setClients(clientsData || []);
            setCleaners(cleanersData || []);
            setServiceReports(reportsData || []);
        } catch (error) {
            console.error('Error cargando datos:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadClientSchedules = async (clientId) => {
        setLoading(true);
        try {
            const BATCH_SIZE = 5000;
            let allSchedules = [];
            let skip = 0;
            let hasMore = true;

            while (hasMore) {
                const batch = await Schedule.filter({ client_id: clientId }, '-start_time', BATCH_SIZE, skip);
                const batchArray = Array.isArray(batch) ? batch : [];
                
                allSchedules = [...allSchedules, ...batchArray];
                
                if (batchArray.length < BATCH_SIZE) {
                    hasMore = false;
                } else {
                    skip += BATCH_SIZE;
                }
            }

            setSchedules(allSchedules || []);
        } catch (error) {
            console.error('Error cargando horarios del cliente:', error);
        } finally {
            setLoading(false);
        }
    };

    const selectedClient = useMemo(() => {
        return clients.find(c => c.id === selectedClientId);
    }, [clients, selectedClientId]);

    const filteredClients = useMemo(() => {
        if (!searchTerm.trim()) return clients;
        const lowerSearch = searchTerm.toLowerCase();
        return clients.filter(client => 
            (client.name?.toLowerCase() || '').includes(lowerSearch) ||
            (client.address?.toLowerCase() || '').includes(lowerSearch)
        );
    }, [clients, searchTerm]);

    const calculateServiceAmount = (service, client) => {
        // Usar la función unificada que respeta snapshots de precio y GST
        const priceData = getPriceForSchedule(service, client);
        const { total } = calculateGST(priceData.rawAmount, priceData.gstType);
        return total;
    };

    const pastServices = useMemo(() => {
        return schedules
            .filter(s => isPast(parseISOAsLocal(s.start_time)))
            .sort((a, b) => parseISOAsLocal(b.start_time) - parseISOAsLocal(a.start_time));
    }, [schedules]);

    const futureServices = useMemo(() => {
        return schedules
            .filter(s => !isPast(parseISOAsLocal(s.start_time)))
            .sort((a, b) => parseISOAsLocal(a.start_time) - parseISOAsLocal(b.start_time));
    }, [schedules]);

    const getServiceReports = (scheduleId) => {
        return serviceReports.filter(r => r.schedule_id === scheduleId);
    };

    const toggleServiceExpansion = (serviceId) => {
        const newExpanded = new Set(expandedServices);
        if (newExpanded.has(serviceId)) {
            newExpanded.delete(serviceId);
        } else {
            newExpanded.add(serviceId);
        }
        setExpandedServices(newExpanded);
    };

    const getCleanerNames = (cleanerIds) => {
        if (!cleanerIds || cleanerIds.length === 0) return 'Sin asignar';
        return cleanerIds
            .map(id => {
                const cleaner = cleaners.find(c => c.id === id);
                return cleaner?.invoice_name || cleaner?.full_name || cleaner?.display_name || 'Desconocido';
            })
            .join(', ');
    };

    const getStatusBadge = (status) => {
        const statusConfig = {
            completed: { label: 'Completado', className: 'bg-green-100 text-green-800' },
            cancelled: { label: 'Cancelado', className: 'bg-red-100 text-red-800' },
            scheduled: { label: 'Programado', className: 'bg-blue-100 text-blue-800' },
            in_progress: { label: 'En Progreso', className: 'bg-orange-100 text-orange-800' }
        };
        const config = statusConfig[status] || { label: status, className: 'bg-gray-100 text-gray-800' };
        return <Badge className={config.className}>{config.label}</Badge>;
    };

    const ServiceRow = ({ service, client }) => {
        const isExpanded = expandedServices.has(service.id);
        const reports = getServiceReports(service.id);
        const amount = calculateServiceAmount(service, client);

        return (
            <>
                <TableRow className="hover:bg-gray-50 cursor-pointer" onClick={() => toggleServiceExpansion(service.id)}>
                    <TableCell>
                        <div className="flex items-center gap-2">
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            <div>
                                <div className="font-medium">
                                    {format(parseISOAsLocal(service.start_time), 'dd MMM yyyy', { locale: es })}
                                </div>
                                <div className="text-sm text-slate-500">
                                    {format(parseISOAsLocal(service.start_time), 'HH:mm', { locale: es })} - {format(parseISOAsLocal(service.end_time), 'HH:mm', { locale: es })}
                                </div>
                            </div>
                        </div>
                    </TableCell>
                    <TableCell>
                        <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-slate-500" />
                            {getCleanerNames(service.cleaner_ids)}
                        </div>
                    </TableCell>
                    <TableCell>
                        <div className="flex items-center gap-2">
                            <DollarSign className="w-4 h-4 text-green-600" />
                            <span className="font-semibold">${amount.toFixed(2)}</span>
                        </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(service.status)}</TableCell>
                    <TableCell>
                        {reports.length > 0 && (
                            <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                                <AlertTriangle className="w-3 h-3" />
                                {reports.length} Reporte{reports.length > 1 ? 's' : ''}
                            </Badge>
                        )}
                    </TableCell>
                    <TableCell>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                                e.stopPropagation();
                                window.open(`${createPageUrl('Horario')}?focus=${service.id}`, '_blank');
                            }}
                        >
                            <ExternalLink className="w-4 h-4" />
                        </Button>
                    </TableCell>
                </TableRow>

                {isExpanded && (
                    <TableRow>
                        <TableCell colSpan={6} className="bg-slate-50">
                            <div className="p-4 space-y-4">
                                {/* Detalles de Limpiadores */}
                                {service.cleaner_schedules && service.cleaner_schedules.length > 0 && (
                                    <Card>
                                        <CardHeader className="pb-3">
                                            <CardTitle className="text-sm flex items-center gap-2">
                                                <Users className="w-4 h-4 text-blue-600" />
                                                Horarios de Limpiadores
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="space-y-2">
                                                {service.cleaner_schedules.map((cs, idx) => {
                                                    const cleaner = cleaners.find(c => c.id === cs.cleaner_id);
                                                    return (
                                                        <div key={idx} className="flex items-center justify-between bg-white p-2 rounded border">
                                                            <span className="font-medium">
                                                                {cleaner?.invoice_name || cleaner?.full_name || 'Desconocido'}
                                                            </span>
                                                            <span className="text-sm text-slate-600">
                                                                {cs.start_time && cs.end_time ? 
                                                                    `${format(parseISOAsLocal(cs.start_time), 'HH:mm')} - ${format(parseISOAsLocal(cs.end_time), 'HH:mm')}` 
                                                                    : 'Horario no definido'}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </CardContent>
                                    </Card>
                                )}

                                {/* Clock-in/out Data */}
                                {service.clock_in_data && service.clock_in_data.length > 0 && (
                                    <Card>
                                        <CardHeader className="pb-3">
                                            <CardTitle className="text-sm flex items-center gap-2">
                                                <Clock className="w-4 h-4 text-purple-600" />
                                                Registro de Asistencia
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="space-y-2">
                                                {service.clock_in_data.map((clock, idx) => {
                                                    const cleaner = cleaners.find(c => c.id === clock.cleaner_id);
                                                    return (
                                                        <div key={idx} className="bg-white p-3 rounded border">
                                                            <div className="font-medium mb-2">
                                                                {cleaner?.invoice_name || cleaner?.full_name || 'Desconocido'}
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-2 text-sm">
                                                                <div>
                                                                    <span className="text-slate-500">Entrada:</span>{' '}
                                                                    {clock.clock_in_time ? format(parseISOAsLocal(clock.clock_in_time), 'HH:mm') : 'N/A'}
                                                                </div>
                                                                <div>
                                                                    <span className="text-slate-500">Salida:</span>{' '}
                                                                    {clock.clock_out_time ? format(parseISOAsLocal(clock.clock_out_time), 'HH:mm') : 'N/A'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </CardContent>
                                    </Card>
                                )}

                                {/* Notas del Servicio */}
                                {service.notes_public && (
                                    <Card>
                                        <CardHeader className="pb-3">
                                            <CardTitle className="text-sm flex items-center gap-2">
                                                <FileText className="w-4 h-4 text-slate-600" />
                                                Notas del Servicio
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <p className="text-sm text-slate-700 whitespace-pre-wrap bg-white p-3 rounded border">
                                                {service.notes_public}
                                            </p>
                                        </CardContent>
                                    </Card>
                                )}

                                {/* Fotos del Servicio */}
                                {service.photo_urls && service.photo_urls.length > 0 && (
                                    <Card>
                                        <CardHeader className="pb-3">
                                            <CardTitle className="text-sm flex items-center gap-2">
                                                <Camera className="w-4 h-4 text-indigo-600" />
                                                Fotos del Servicio
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                                {service.photo_urls.map((photo, idx) => (
                                                    <div key={idx} className="space-y-1">
                                                        <a 
                                                            href={photo.url} 
                                                            target="_blank" 
                                                            rel="noopener noreferrer"
                                                            className="block rounded-lg overflow-hidden border hover:shadow-lg transition-shadow"
                                                        >
                                                            <img
                                                                src={photo.url}
                                                                alt={photo.comment || `Foto ${idx + 1}`}
                                                                className="w-full h-24 object-cover"
                                                            />
                                                        </a>
                                                        {photo.comment && (
                                                            <p className="text-xs text-slate-600 bg-white p-1 rounded border">
                                                                {photo.comment}
                                                            </p>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </CardContent>
                                    </Card>
                                )}

                                {/* Elementos de Reconciliación */}
                                {service.reconciliation_items && service.reconciliation_items.length > 0 && (
                                    <Card>
                                        <CardHeader className="pb-3">
                                            <CardTitle className="text-sm flex items-center gap-2">
                                                <DollarSign className="w-4 h-4 text-green-600" />
                                                Desglose de Facturación
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="space-y-2">
                                                {service.reconciliation_items.map((item, idx) => (
                                                    <div key={idx} className="flex justify-between items-center bg-white p-2 rounded border">
                                                        <span className="text-sm">{item.description || item.type}</span>
                                                        <span className={`font-semibold ${item.type === 'discount' ? 'text-red-600' : 'text-green-600'}`}>
                                                            {item.type === 'discount' ? '-' : ''}${parseFloat(item.amount).toFixed(2)}
                                                        </span>
                                                    </div>
                                                ))}
                                                <div className="flex justify-between items-center bg-blue-50 p-2 rounded border border-blue-200 font-bold">
                                                    <span>Total al Cliente</span>
                                                    <span className="text-blue-900">${amount.toFixed(2)}</span>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                )}

                                {/* Reportes de Servicio */}
                                {reports.length > 0 && (
                                    <Card className="border-red-200">
                                        <CardHeader className="pb-3 bg-red-50">
                                            <CardTitle className="text-sm flex items-center gap-2 text-red-900">
                                                <AlertTriangle className="w-4 h-4" />
                                                Reportes de Incidencias ({reports.length})
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="pt-4">
                                            <div className="space-y-3">
                                                {reports.map((report, idx) => (
                                                    <div key={idx} className="bg-white p-3 rounded border border-red-200">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <Badge variant="destructive">{report.priority || 'Media'}</Badge>
                                                            <span className="text-xs text-slate-500">
                                                                Por {report.cleaner_name}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm text-slate-700 mb-2">{report.report_notes}</p>
                                                        {report.report_photos && report.report_photos.length > 0 && (
                                                            <div className="grid grid-cols-3 gap-2 mt-2">
                                                                {report.report_photos.map((photo, photoIdx) => (
                                                                    <a 
                                                                        key={photoIdx}
                                                                        href={photo.url} 
                                                                        target="_blank" 
                                                                        rel="noopener noreferrer"
                                                                        className="block rounded overflow-hidden border"
                                                                    >
                                                                        <img
                                                                            src={photo.url}
                                                                            alt={`Reporte ${photoIdx + 1}`}
                                                                            className="w-full h-16 object-cover"
                                                                        />
                                                                    </a>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </CardContent>
                                    </Card>
                                )}
                            </div>
                        </TableCell>
                    </TableRow>
                )}
            </>
        );
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6 md:p-8">
            <div className="max-w-7xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-blue-100 rounded-lg">
                            <History className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-slate-900">Historial de Clientes</h1>
                            <p className="text-slate-600">Consulta el historial completo de servicios por cliente</p>
                        </div>
                    </div>
                </div>

                {/* Buscador de Cliente */}
                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle className="text-lg">Buscar Cliente</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                            <Input
                                type="text"
                                placeholder="Buscar por nombre o dirección..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                            />
                            {searchTerm && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setSearchTerm("")}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0 hover:bg-slate-100"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            )}
                        </div>

                        {searchTerm && (
                            <div className="max-h-96 overflow-y-auto border rounded-lg bg-white">
                                {filteredClients.length === 0 ? (
                                    <div className="text-center py-8 text-slate-500">
                                        <p>No se encontraron clientes</p>
                                    </div>
                                ) : (
                                    <div className="divide-y">
                                        {filteredClients.map((client) => (
                                            <button
                                                key={client.id}
                                                onClick={() => {
                                                    setSelectedClientId(client.id);
                                                    setSearchTerm('');
                                                }}
                                                className={`w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors ${
                                                    selectedClientId === client.id ? 'bg-blue-100' : ''
                                                }`}
                                            >
                                                <div className="font-medium text-slate-900">{client.name}</div>
                                                <div className="text-sm text-slate-600 flex items-center gap-1 mt-1">
                                                    <MapPin className="w-3 h-3" />
                                                    {client.address}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {selectedClient && !searchTerm && (
                            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="font-semibold text-blue-900">{selectedClient.name}</div>
                                        <div className="text-sm text-blue-700 flex items-center gap-1 mt-1">
                                            <MapPin className="w-3 h-3" />
                                            {selectedClient.address}
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setSelectedClientId(null)}
                                        className="hover:bg-blue-100"
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Contenido del Historial */}
                {selectedClient ? (
                    <div className="space-y-6">
                        {/* Información del Cliente */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center justify-between">
                                    <span>{selectedClient.name}</span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => window.location.href = `${createPageUrl('Clientes')}?edit=${selectedClient.id}`}
                                    >
                                        Ver Perfil Completo
                                    </Button>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="flex items-center gap-2">
                                        <MapPin className="w-4 h-4 text-slate-500" />
                                        <span className="text-sm">{selectedClient.address}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Calendar className="w-4 h-4 text-slate-500" />
                                        <span className="text-sm">Frecuencia: {selectedClient.service_frequency}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <DollarSign className="w-4 h-4 text-slate-500" />
                                        <span className="text-sm">
                                            Precio: {showPrices ? `$${selectedClient.current_service_price?.toFixed(2) || '0.00'}` : '••••••'}
                                        </span>
                                        <button
                                            onClick={() => setShowPrices(!showPrices)}
                                            className="text-slate-400 hover:text-slate-700 transition-colors"
                                            title={showPrices ? 'Ocultar precios' : 'Mostrar precios'}
                                        >
                                            {showPrices ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Tabs de Servicios */}
                        <Tabs defaultValue="past" className="w-full">
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="past" className="flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4" />
                                    Servicios Pasados ({pastServices.length})
                                </TabsTrigger>
                                <TabsTrigger value="future" className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4" />
                                    Servicios Futuros ({futureServices.length})
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="past" className="mt-6">
                                <Card>
                                    <CardContent className="p-0">
                                        {loading ? (
                                            <div className="text-center py-12">
                                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                                                <p className="mt-3 text-slate-600">Cargando servicios...</p>
                                            </div>
                                        ) : pastServices.length === 0 ? (
                                            <div className="text-center py-12 text-slate-500">
                                                <History className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                                                <p>No hay servicios pasados registrados</p>
                                            </div>
                                        ) : (
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Fecha y Hora</TableHead>
                                                        <TableHead>Limpiadores</TableHead>
                                                        <TableHead>Monto Facturado</TableHead>
                                                        <TableHead>Estado</TableHead>
                                                        <TableHead>Reportes</TableHead>
                                                        <TableHead>Acciones</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {pastServices.map((service) => (
                                                        <ServiceRow key={service.id} service={service} client={selectedClient} />
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        )}
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            <TabsContent value="future" className="mt-6">
                                <Card>
                                    <CardContent className="p-0">
                                        {loading ? (
                                            <div className="text-center py-12">
                                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                                                <p className="mt-3 text-slate-600">Cargando servicios...</p>
                                            </div>
                                        ) : futureServices.length === 0 ? (
                                            <div className="text-center py-12 text-slate-500">
                                                <Calendar className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                                                <p>No hay servicios futuros programados</p>
                                            </div>
                                        ) : (
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Fecha y Hora</TableHead>
                                                        <TableHead>Limpiadores</TableHead>
                                                        <TableHead>Precio Estimado</TableHead>
                                                        <TableHead>Estado</TableHead>
                                                        <TableHead>Reportes</TableHead>
                                                        <TableHead>Acciones</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {futureServices.map((service) => (
                                                        <ServiceRow key={service.id} service={service} client={selectedClient} />
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        )}
                                    </CardContent>
                                </Card>
                            </TabsContent>
                        </Tabs>
                    </div>
                ) : (
                    <Card>
                        <CardContent className="py-12 text-center text-slate-500">
                            <History className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                            <p className="text-lg">Selecciona un cliente para ver su historial</p>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}