import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Client } from '@/entities/Client';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlusCircle, Edit, Trash2, Search, X, AlertTriangle, KeySquare, Eye, EyeOff, FileSignature, History, FileText, Upload, ExternalLink, Users, UserCheck, UserX, Star, Filter, Phone, MapPin, DollarSign, Calendar, Clock, TrendingDown } from 'lucide-react';
import { differenceInMonths, differenceInDays, parseISO } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import PhotoUploader from '../components/horario/PhotoUploader';
import ServicePriceManager from '../components/clients/ServicePriceManager';
import FamilyAndPetsManager from '../components/clients/FamilyAndPetsManager';
import ClientHistory from '../components/clients/ClientHistory';
import StructuredServiceNotes from '../components/clients/StructuredServiceNotes';
import { createPageUrl } from '@/utils';

export default function ClientesPage() {
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingClient, setEditingClient] = useState(null);
    const [deletingClient, setDeletingClient] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [showInactive, setShowInactive] = useState(false);
    const [showPrices, setShowPrices] = useState(false);
    const [filterFrecuencia, setFilterFrecuencia] = useState('');
    const [filterEstado, setFilterEstado] = useState('');
    const [filterAcceso, setFilterAcceso] = useState('');
    const [filterTipo, setFilterTipo] = useState('');
    // Removed: viewingHistoryClientId state as history will be on a separate page

    // Define a default formData structure for easy reset
    const FUNDED_CLIENT_TYPES = ['ndis_client', 'dva_client', 'age_care_client', 'work_cover_client'];

    const CLIENT_TYPE_LABELS = {
        domestic: 'Doméstico',
        commercial: 'Comercial',
        training: 'Entrenamiento',
        ndis_client: 'NDIS Client',
        dva_client: 'DVA Client',
        age_care_client: 'Age Care Client',
        work_cover_client: 'Work Cover Client',
    };

    const defaultFormData = useMemo(() => ({
        name: '',
        sms_name: '',
        client_type: 'domestic',
        funding_document_url: '',
        funding_document_start_date: '',
        funding_document_end_date: '',
        mobile_number: '',
        secondary_mobile_number: '',
        address: '',
        email: '',
        active: true,
        service_frequency: 'weekly',
        current_service_price: 0,
        service_hours: 0,
        gst_type: 'inclusive',
        payment_method: 'bank_transfer',
        default_service_notes: '',
        structured_service_notes: {},
        default_photo_urls: [],
        has_access: false,
        access_type: 'key',
        access_identifier: '',
        access_instructions: '',
        access_photos: [],
        has_special_billing_instructions: false,
        special_billing_instructions: '',
        admin_notes: '',
        family_members: [],
        pets: [],
        fridge_cleaning_services: [],
        spring_cleaning_services: [],
        oven_cleaning_services: [],
        property_type: '',
        property_stories: '',
        num_bedrooms: '',
        num_bathrooms: '',
        start_date: '',
        end_date: '',
    }), []);

    const [formData, setFormData] = useState(defaultFormData);

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

    const fetchClients = useCallback(async () => {
        setLoading(true);
        try {
            const clientsData = await loadAllRecords(Client, '-created_date');
            setClients(clientsData);
        } catch (error) {
            console.error("Error fetching clients:", error);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchClients();
    }, [fetchClients]);

    // Memoize handleEdit to make it stable for useEffect dependencies
    const handleEdit = useCallback((client) => {
        setEditingClient(client);
        // Merge existing client data with defaultFormData to ensure all fields are present
        setFormData({
        ...defaultFormData,
        ...client,
        sms_name: client.sms_name || '',
        current_service_price: client.current_service_price || 0,
        service_hours: client.service_hours || 0,
        gst_type: client.gst_type || 'inclusive',
        payment_method: client.payment_method || 'bank_transfer',
        default_service_notes: client.default_service_notes || '',
        structured_service_notes: client.structured_service_notes || {},
        default_photo_urls: client.default_photo_urls || [],
        has_access: client.has_access || false,
        access_type: client.access_type || 'key',
        access_identifier: client.access_identifier || '',
        access_instructions: client.access_instructions || '',
        access_photos: client.access_photos || [],
        has_special_billing_instructions: client.has_special_billing_instructions || false,
        special_billing_instructions: client.special_billing_instructions || '',
        admin_notes: client.admin_notes || '',
        family_members: client.family_members || [],
        pets: client.pets || [],
        secondary_mobile_number: client.secondary_mobile_number || '',
        fridge_cleaning_services: client.fridge_cleaning_services || [],
        spring_cleaning_services: client.spring_cleaning_services || [],
        oven_cleaning_services: client.oven_cleaning_services || [],
        property_type: client.property_type || '',
        property_stories: client.property_stories || '',
        num_bedrooms: client.num_bedrooms !== undefined && client.num_bedrooms !== null ? client.num_bedrooms : '',
        num_bathrooms: client.num_bathrooms !== undefined && client.num_bathrooms !== null ? client.num_bathrooms : '',
        funding_document_url: client.funding_document_url || '',
        funding_document_start_date: client.funding_document_start_date || '',
        funding_document_end_date: client.funding_document_end_date || '',
        start_date: client.start_date || '',
        end_date: client.end_date || '',
        });
        setShowForm(true);
    }, [defaultFormData]);

    // Effect to handle opening client edit form from URL parameter
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const editClientId = urlParams.get('edit');

        if (editClientId && clients.length > 0 && !showForm) {
            const clientToEdit = clients.find(c => c.id === editClientId);
            if (clientToEdit) {
                handleEdit(clientToEdit);
                // Clean the URL parameter to prevent re-opening on refresh
                window.history.replaceState({}, '', window.location.pathname);
            }
        }
    }, [clients, showForm, handleEdit]); // Add handleEdit to dependencies as it's now memoized

    const handleCreate = () => {
        setEditingClient(null);
        setFormData(defaultFormData);
        setShowForm(true);
    };

    const handleDelete = async () => {
        if (!deletingClient) return;
        try {
            await Client.delete(deletingClient.id);
            fetchClients();
            setDeletingClient(null);
        } catch (error) {
            console.error("Error deleting client:", error);
        }
    };

    const handleSaveClient = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            // Limpiar campos numéricos vacíos
            const cleanedFormData = {
                ...formData,
                num_bedrooms: formData.num_bedrooms === '' ? null : formData.num_bedrooms,
                num_bathrooms: formData.num_bathrooms === '' ? null : formData.num_bathrooms,
            };

            if (editingClient) {
                console.log('[Clientes] Actualizando cliente con notas estructuradas:', cleanedFormData.structured_service_notes ? 'Sí' : 'No');
                await Client.update(editingClient.id, cleanedFormData);
                console.log('[Clientes] Cliente actualizado exitosamente, incluyendo notas estructuradas.');
                
                // Si cambió el nombre, actualizar en cascada
                if (editingClient.name !== cleanedFormData.name) {
                    console.log('[Clientes] Nombre cambió, actualizando registros relacionados...');
                    await base44.functions.invoke('updateClientNameCascade', {
                        client_id: editingClient.id,
                        new_name: cleanedFormData.name
                    });
                    console.log('[Clientes] Nombre actualizado en cascada.');
                }
            } else {
                console.log('[Clientes] Creando nuevo cliente con notas estructuradas:', cleanedFormData.structured_service_notes ? 'Sí' : 'No');
                await Client.create(cleanedFormData);
                console.log('[Clientes] Nuevo cliente creado exitosamente, incluyendo notas estructuradas.');
            }
            fetchClients();
            setShowForm(false);
            setEditingClient(null);
            setFormData(defaultFormData);
        } catch (error) {
            console.error("Error saving client:", error);
            throw error;
        } finally {
            setLoading(false);
        }
    };

    const filteredClients = useMemo(() => {
        return clients.filter(client => {
            const matchesSearch = (client.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                                 (client.address?.toLowerCase() || '').includes(searchTerm.toLowerCase());
            const matchesActiveFilter = showInactive ? true : (client.active !== false);
            const matchesFrecuencia = !filterFrecuencia || client.service_frequency === filterFrecuencia;
            const matchesEstado = !filterEstado || (filterEstado === 'active' ? client.active !== false : client.active === false);
            const matchesAcceso = !filterAcceso || (filterAcceso === 'yes' ? client.has_access : !client.has_access);
            const matchesTipo = !filterTipo || client.client_type === filterTipo;
            return matchesSearch && matchesActiveFilter && matchesFrecuencia && matchesEstado && matchesAcceso && matchesTipo;
        });
    }, [clients, searchTerm, showInactive, filterFrecuencia, filterEstado, filterAcceso, filterTipo]);

    // Removed: viewingHistoryClient memo as history will be on a separate page

    // Calcular antigüedad de un cliente en texto legible
    const getClientSeniority = (client) => {
        const ref = client.start_date ? parseISO(client.start_date) : (client.created_date ? new Date(client.created_date) : null);
        if (!ref) return '—';
        const end = (client.active === false && client.end_date) ? parseISO(client.end_date) : new Date();
        const months = differenceInMonths(end, ref);
        if (months < 1) {
            const days = differenceInDays(end, ref);
            return `${days}d`;
        }
        if (months < 12) return `${months}m`;
        const years = Math.floor(months / 12);
        const rem = months % 12;
        return rem > 0 ? `${years}a ${rem}m` : `${years}a`;
    };

    // Calcular promedio de permanencia por tipo (solo clientes inactivos con fecha de inicio)
    const avgByType = useMemo(() => {
        const result = {};
        clients.forEach(client => {
            if (client.active !== false) return; // solo inactivos
            const ref = client.start_date ? parseISO(client.start_date) : (client.created_date ? new Date(client.created_date) : null);
            if (!ref) return;
            const end = client.end_date ? parseISO(client.end_date) : new Date();
            const months = differenceInMonths(end, ref);
            const type = client.client_type || 'domestic';
            if (!result[type]) result[type] = { total: 0, count: 0 };
            result[type].total += months;
            result[type].count += 1;
        });
        return Object.entries(result).map(([type, { total, count }]) => ({
            type,
            label: CLIENT_TYPE_LABELS[type] || type,
            avg: count > 0 ? Math.round(total / count) : 0,
            count,
        })).sort((a, b) => b.avg - a.avg);
    }, [clients]);

    const activeCount = clients.filter(c => c.active !== false).length;
    const inactiveCount = clients.filter(c => c.active === false).length;
    const specialCount = clients.filter(c => FUNDED_CLIENT_TYPES.includes(c.client_type)).length;
    const accessCount = clients.filter(c => c.has_access).length;

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6 md:p-8">
            <div className="w-full">
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                            <Users className="w-8 h-8 text-blue-600" />
                            Gestión de Clientes
                        </h1>
                        <p className="text-slate-500 mt-1">Administra la cartera de clientes activos e inactivos</p>
                    </div>
                    <Button onClick={handleCreate} className="gap-2">
                        <PlusCircle className="h-4 w-4" /> Nuevo Cliente
                    </Button>
                </div>

                {/* Promedio de permanencia por tipo */}
                {avgByType.length > 0 && (
                    <div className="mb-6">
                        <div className="flex items-center gap-2 mb-3">
                            <TrendingDown className="w-4 h-4 text-slate-500" />
                            <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Promedio de permanencia por tipo (clientes inactivos)</h2>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {avgByType.map(({ type, label, avg, count }) => (
                                <Card key={type} className="border-0 shadow-sm bg-white">
                                    <CardContent className="p-3">
                                        <p className="text-xs text-slate-500 mb-1">{label}</p>
                                        <p className="text-xl font-bold text-slate-800">
                                            {avg >= 12 ? `${Math.floor(avg/12)}a ${avg%12>0?avg%12+'m':''}` : `${avg}m`}
                                        </p>
                                        <p className="text-xs text-slate-400">{count} cliente{count !== 1 ? 's' : ''}</p>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>
                )}

                {/* KPI Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <Card className="border-0 shadow-sm bg-white">
                        <CardContent className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center"><Users className="w-5 h-5 text-blue-600" /></div>
                            <div><p className="text-2xl font-bold text-slate-900">{clients.length}</p><p className="text-xs text-slate-500">Total clientes</p></div>
                        </CardContent>
                    </Card>
                    <Card className="border-0 shadow-sm bg-white">
                        <CardContent className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center"><UserCheck className="w-5 h-5 text-green-600" /></div>
                            <div><p className="text-2xl font-bold text-slate-900">{activeCount}</p><p className="text-xs text-slate-500">Activos</p></div>
                        </CardContent>
                    </Card>
                    <Card className="border-0 shadow-sm bg-white">
                        <CardContent className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center"><KeySquare className="w-5 h-5 text-amber-600" /></div>
                            <div><p className="text-2xl font-bold text-slate-900">{accessCount}</p><p className="text-xs text-slate-500">Con acceso</p></div>
                        </CardContent>
                    </Card>
                    <Card className="border-0 shadow-sm bg-white">
                        <CardContent className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center"><Star className="w-5 h-5 text-purple-600" /></div>
                            <div><p className="text-2xl font-bold text-slate-900">{specialCount}</p><p className="text-xs text-slate-500">Government Clients</p></div>
                        </CardContent>
                    </Card>
                </div>

                {/* Search & Filters */}
                <Card className="border-0 shadow-sm mb-6">
                    <CardContent className="p-4 space-y-3">
                        <div className="flex flex-col sm:flex-row gap-3">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                    type="text"
                                    placeholder="Buscar por nombre o dirección..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-9 h-10"
                                />
                                {searchTerm && (
                                    <Button variant="ghost" size="sm" onClick={() => setSearchTerm("")} className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 p-0">
                                        <X className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                            <Button variant="outline" onClick={() => setShowInactive(!showInactive)} className="gap-2 h-10">
                                {showInactive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                {showInactive ? 'Ocultar Inactivos' : 'Mostrar Inactivos'}
                            </Button>
                        </div>
                        <div className="flex flex-wrap gap-2 items-center">
                            <Filter className="h-4 w-4 text-slate-400 flex-shrink-0" />
                            <Select value={filterFrecuencia} onValueChange={setFilterFrecuencia}>
                                <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue placeholder="Frecuencia" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={null}>Todas</SelectItem>
                                    <SelectItem value="weekly">Semanal</SelectItem>
                                    <SelectItem value="fortnightly">Quincenal</SelectItem>
                                    <SelectItem value="every_3_weeks">Cada 3 semanas</SelectItem>
                                    <SelectItem value="monthly">Mensual</SelectItem>
                                    <SelectItem value="one_off">Servicio Único</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={filterEstado} onValueChange={setFilterEstado}>
                                <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="Estado" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={null}>Todos</SelectItem>
                                    <SelectItem value="active">Activo</SelectItem>
                                    <SelectItem value="inactive">Inactivo</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={filterAcceso} onValueChange={setFilterAcceso}>
                                <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="Acceso" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={null}>Todos</SelectItem>
                                    <SelectItem value="yes">Con acceso</SelectItem>
                                    <SelectItem value="no">Sin acceso</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={filterTipo} onValueChange={setFilterTipo}>
                                <SelectTrigger className="w-[170px] h-8 text-xs"><SelectValue placeholder="Tipo de cliente" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={null}>Todos los tipos</SelectItem>
                                    <SelectItem value="domestic">Doméstico</SelectItem>
                                    <SelectItem value="commercial">Comercial</SelectItem>
                                    <SelectItem value="training">Entrenamiento</SelectItem>
                                    <SelectItem value="ndis_client">NDIS Client</SelectItem>
                                    <SelectItem value="dva_client">DVA Client</SelectItem>
                                    <SelectItem value="age_care_client">Age Care Client</SelectItem>
                                    <SelectItem value="work_cover_client">Work Cover Client</SelectItem>
                                </SelectContent>
                            </Select>
                            {(filterFrecuencia || filterEstado || filterAcceso || filterTipo) && (
                                <Button variant="ghost" size="sm" onClick={() => { setFilterFrecuencia(''); setFilterEstado(''); setFilterAcceso(''); setFilterTipo(''); }} className="h-8 text-xs text-slate-500 hover:text-slate-800">
                                    <X className="h-3 w-3 mr-1" /> Limpiar
                                </Button>
                            )}
                            <span className="text-sm text-slate-500 ml-auto font-medium">{filteredClients.length} cliente{filteredClients.length !== 1 ? 's' : ''}</span>
                        </div>
                    </CardContent>
                </Card>

                {/* Table */}
                <Card className="border-0 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-slate-50 hover:bg-slate-50">
                                <TableHead className="min-w-[180px] font-semibold text-slate-700">Cliente</TableHead>
                                <TableHead className="min-w-[200px] font-semibold text-slate-700">Dirección</TableHead>
                                <TableHead className="font-semibold text-slate-700">Tipo</TableHead>
                                <TableHead className="font-semibold text-slate-700">Frecuencia</TableHead>
                                <TableHead className="font-semibold text-slate-700">
                                    <div className="flex items-center gap-1.5">
                                        Precio
                                        <button onClick={() => setShowPrices(!showPrices)} className="text-slate-400 hover:text-slate-700 transition-colors" title={showPrices ? 'Ocultar precios' : 'Mostrar precios'}>
                                            {showPrices ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                        </button>
                                    </div>
                                </TableHead>
                                <TableHead className="font-semibold text-slate-700">Antigüedad</TableHead>
                                <TableHead className="font-semibold text-slate-700">Estado</TableHead>
                                <TableHead className="font-semibold text-slate-700">Acceso</TableHead>
                                <TableHead className="text-right font-semibold text-slate-700">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan="8" className="text-center py-12">
                                    <div className="flex items-center justify-center gap-2 text-slate-500">
                                        <div className="w-4 h-4 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
                                        Cargando clientes...
                                    </div>
                                </TableCell></TableRow>
                            ) : filteredClients.length > 0 ? (
                                filteredClients.map(client => (
                                    <TableRow key={client.id} className={`hover:bg-blue-50/40 transition-colors border-b border-slate-100 ${
                                        client.active === false ? 'opacity-60' : ''
                                    }`}>
                                        <TableCell className="py-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                                    {client.name?.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-slate-900 text-sm leading-tight">{client.name}</p>
                                                    {client.mobile_number && <p className="text-xs text-slate-400">{client.mobile_number}</p>}
                                                </div>
                                                {client.has_special_billing_instructions && (
                                                    <FileSignature className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" title="Instrucciones especiales de facturación" />
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-3">
                                            <p className="text-sm text-slate-600 max-w-[220px] truncate">{client.address || '—'}</p>
                                        </TableCell>
                                        <TableCell className="py-3">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                                FUNDED_CLIENT_TYPES.includes(client.client_type)
                                                    ? 'bg-purple-100 text-purple-800'
                                                    : client.client_type === 'commercial'
                                                    ? 'bg-blue-100 text-blue-800'
                                                    : 'bg-slate-100 text-slate-700'
                                            }`}>
                                                {CLIENT_TYPE_LABELS[client.client_type] || '—'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="py-3">
                                            <span className="text-sm text-slate-600">
                                                {{ weekly: 'Semanal', fortnightly: 'Quincenal', every_3_weeks: 'Cada 3 sem.', monthly: 'Mensual', one_off: 'Único' }[client.service_frequency] || '—'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="py-3">
                                            <span className={`text-sm font-semibold ${ showPrices ? 'text-green-700' : 'text-slate-400' }`}>
                                                {showPrices ? `$${client.current_service_price?.toFixed(2) || '0.00'}` : '••••'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="py-3">
                                            <div className="flex items-center gap-1 text-slate-600">
                                                <Clock className="w-3 h-3 flex-shrink-0" />
                                                <span className="text-xs font-medium">{getClientSeniority(client)}</span>
                                            </div>
                                            {client.start_date && (
                                                <p className="text-xs text-slate-400 mt-0.5">{client.start_date}</p>
                                            )}
                                        </TableCell>
                                        <TableCell className="py-3">
                                             <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                                 client.active !== false ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'
                                             }`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${ client.active !== false ? 'bg-green-500' : 'bg-red-500' }`} />
                                                {client.active !== false ? 'Activo' : 'Inactivo'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="py-3">
                                            {client.has_access ? (
                                                <div className="flex items-center gap-1.5 text-amber-600">
                                                    <KeySquare className="w-4 h-4" />
                                                    <span className="text-xs font-medium">{client.access_type === 'key' ? 'Llave' : client.access_identifier || 'Sí'}</span>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-slate-400">—</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="py-3 text-right">
                                            <div className="flex items-center justify-end gap-0.5">
                                                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-blue-50 hover:text-blue-700"
                                                    onClick={() => { window.location.href = `${createPageUrl('HistorialClientes')}?client_id=${client.id}`; }}
                                                    title="Ver Historial">
                                                    <History className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-slate-100" onClick={() => handleEdit(client)}>
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-red-50 hover:text-red-600" onClick={() => setDeletingClient(client)}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan="8" className="text-center py-16">
                                        <Users className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                                        <p className="text-slate-500 font-medium">No se encontraron clientes</p>
                                        <p className="text-slate-400 text-sm mt-1">Intenta ajustar los filtros o busca con otros términos</p>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                    </div>
                </Card>

                {/* Modal de Edición/Creación - SIN historial */}
                <Dialog open={showForm} onOpenChange={setShowForm}>
                    <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>
                                {editingClient ? `Editar Cliente: ${editingClient.name}` : 'Nuevo Cliente'}
                            </DialogTitle>
                            <DialogDescription>
                                {editingClient ? 'Modifica los detalles del cliente en tu cartera.' : 'Añade un nuevo cliente a tu cartera de servicios.'}
                            </DialogDescription>
                        </DialogHeader>

                        <Tabs defaultValue="basic" className="space-y-4">
                            <TabsList className="grid w-full grid-cols-4">
                                <TabsTrigger value="basic">Información Básica</TabsTrigger>
                                <TabsTrigger value="service">Servicio</TabsTrigger>
                                <TabsTrigger value="family-pets">Información Familiar</TabsTrigger>
                                <TabsTrigger value="access">Acceso</TabsTrigger>
                            </TabsList>

                            <form onSubmit={handleSaveClient}>
                                {/* Basic Information Tab */}
                                <TabsContent value="basic" className="space-y-6 p-1">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-2">
                                           <div className="space-y-2">
                                               <Label htmlFor="start_date">Fecha de Inicio como Cliente</Label>
                                               <Input
                                                   id="start_date"
                                                   type="date"
                                                   value={formData.start_date || ''}
                                                   onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                                               />
                                               <p className="text-xs text-slate-500">Si no se indica, se usará la fecha de creación del registro.</p>
                                           </div>
                                           <div className="space-y-2">
                                               <Label htmlFor="end_date">Fecha de Baja (si aplica)</Label>
                                               <Input
                                                   id="end_date"
                                                   type="date"
                                                   value={formData.end_date || ''}
                                                   onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                                               />
                                               <p className="text-xs text-slate-500">Completa si el cliente ya no está activo.</p>
                                           </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="name">Nombre</Label>
                                            <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="sms_name">Nombre para SMS</Label>
                                            <Input 
                                                id="sms_name" 
                                                value={formData.sms_name || ''} 
                                                onChange={(e) => setFormData({ ...formData, sms_name: e.target.value })} 
                                                placeholder="Nombre corto para mensajes (opcional)"
                                            />
                                            <p className="text-xs text-slate-500">
                                                Nombre más corto para usar en SMS. Si se deja vacío, se usará el nombre completo.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                           <Label htmlFor="client_type">Tipo de Cliente</Label>
                                           <Select value={formData.client_type} onValueChange={(value) => setFormData({ ...formData, client_type: value })}>
                                               <SelectTrigger><SelectValue placeholder="Seleccionar tipo..."/></SelectTrigger>
                                               <SelectContent>
                                                   <SelectItem value="domestic">Doméstico</SelectItem>
                                                   <SelectItem value="commercial">Comercial</SelectItem>
                                                   <SelectItem value="training">Entrenamiento</SelectItem>
                                                   <SelectItem value="ndis_client">NDIS Client</SelectItem>
                                                   <SelectItem value="dva_client">DVA Client</SelectItem>
                                                   <SelectItem value="age_care_client">Age Care Client</SelectItem>
                                                   <SelectItem value="work_cover_client">Work Cover Client</SelectItem>
                                               </SelectContent>
                                           </Select>
                                       </div>

                                       {/* Funding document section for special client types */}
                                       {FUNDED_CLIENT_TYPES.includes(formData.client_type) && (
                                           <div className="bg-purple-50 border-l-4 border-purple-400 p-4 rounded-r-lg space-y-4">
                                               <h3 className="font-semibold text-purple-900 flex items-center gap-2">
                                                   <FileText className="w-5 h-5" />
                                                   Documento Soporte ({CLIENT_TYPE_LABELS[formData.client_type]})
                                               </h3>
                                               <p className="text-xs text-purple-700">Adjunta la carta o documento de autorización del financiamiento y especifica el período de vigencia.</p>
                                               <div className="space-y-2">
                                                   <Label>Documento PDF (carta de autorización)</Label>
                                                   {formData.funding_document_url ? (
                                                       <div className="flex items-center gap-3 bg-white border border-purple-200 rounded-lg p-3">
                                                           <FileText className="w-5 h-5 text-purple-600 flex-shrink-0" />
                                                           <span className="text-sm text-slate-700 truncate flex-1">Documento adjunto</span>
                                                           <a href={formData.funding_document_url} target="_blank" rel="noopener noreferrer">
                                                               <Button type="button" variant="outline" size="sm" className="flex items-center gap-1">
                                                                   <ExternalLink className="w-3 h-3" /> Ver
                                                               </Button>
                                                           </a>
                                                           <Button
                                                               type="button"
                                                               variant="ghost"
                                                               size="sm"
                                                               onClick={() => setFormData(prev => ({ ...prev, funding_document_url: '' }))}
                                                               className="text-red-500 hover:text-red-700"
                                                           >
                                                               <X className="w-4 h-4" />
                                                           </Button>
                                                       </div>
                                                   ) : (
                                                       <div>
                                                           <label className="flex items-center gap-2 cursor-pointer bg-white border-2 border-dashed border-purple-300 rounded-lg p-4 hover:border-purple-500 transition-colors">
                                                               <Upload className="w-5 h-5 text-purple-500" />
                                                               <span className="text-sm text-purple-700">Haz clic para subir PDF</span>
                                                               <input
                                                                   type="file"
                                                                   accept=".pdf,application/pdf"
                                                                   className="hidden"
                                                                   onChange={async (e) => {
                                                                       const file = e.target.files?.[0];
                                                                       if (!file) return;
                                                                       try {
                                                                           const { file_url } = await base44.integrations.Core.UploadFile({ file });
                                                                           setFormData(prev => ({ ...prev, funding_document_url: file_url }));
                                                                       } catch (err) {
                                                                           console.error('Error subiendo PDF:', err);
                                                                           alert('Error al subir el documento. Intenta de nuevo.');
                                                                       }
                                                                   }}
                                                               />
                                                           </label>
                                                       </div>
                                                   )}
                                               </div>
                                               <div className="grid grid-cols-2 gap-4">
                                                   <div className="space-y-2">
                                                       <Label htmlFor="funding_start">Fecha de Inicio</Label>
                                                       <Input
                                                           id="funding_start"
                                                           type="date"
                                                           value={formData.funding_document_start_date}
                                                           onChange={(e) => setFormData(prev => ({ ...prev, funding_document_start_date: e.target.value }))}
                                                       />
                                                   </div>
                                                   <div className="space-y-2">
                                                       <Label htmlFor="funding_end">Fecha de Vencimiento</Label>
                                                       <Input
                                                           id="funding_end"
                                                           type="date"
                                                           value={formData.funding_document_end_date}
                                                           onChange={(e) => setFormData(prev => ({ ...prev, funding_document_end_date: e.target.value }))}
                                                       />
                                                   </div>
                                               </div>
                                               {formData.funding_document_end_date && new Date(formData.funding_document_end_date) < new Date() && (
                                                   <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
                                                       <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                                                       <span>⚠️ El documento de soporte está <strong>vencido</strong>. Por favor actualiza la documentación.</span>
                                                   </div>
                                               )}
                                           </div>
                                       )}
                                    <div className="space-y-2">
                                        <Label htmlFor="address">Dirección</Label>
                                        <Input id="address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
                                    </div>

                                    {/* Property Details */}
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                        <div className="space-y-2">
                                            <Label htmlFor="property_type">Tipo de Propiedad</Label>
                                            <Select value={formData.property_type} onValueChange={(value) => setFormData({ ...formData, property_type: value })}>
                                                <SelectTrigger><SelectValue placeholder="Seleccionar tipo..."/></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="house">Casa</SelectItem>
                                                    <SelectItem value="townhouse">Townhouse</SelectItem>
                                                    <SelectItem value="unit">Unit</SelectItem>
                                                    <SelectItem value="apartment">Apartamento</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="property_stories">Plantas</Label>
                                            <Select value={formData.property_stories} onValueChange={(value) => setFormData({ ...formData, property_stories: value })}>
                                                <SelectTrigger><SelectValue placeholder="Seleccionar..."/></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="single_storey">Una Planta</SelectItem>
                                                    <SelectItem value="double_storey">Dos Plantas</SelectItem>
                                                    <SelectItem value="triple_storey">Tres Plantas</SelectItem>
                                                    <SelectItem value="other">Otros</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="num_bedrooms">Habitaciones</Label>
                                            <Input
                                                id="num_bedrooms"
                                                type="number"
                                                min="0"
                                                value={formData.num_bedrooms}
                                                onChange={(e) => setFormData({ ...formData, num_bedrooms: e.target.value === '' ? '' : parseInt(e.target.value) })}
                                                placeholder="0"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="num_bathrooms">Baños</Label>
                                            <Input
                                                id="num_bathrooms"
                                                type="number"
                                                min="0"
                                                step="0.5"
                                                value={formData.num_bathrooms}
                                                onChange={(e) => setFormData({ ...formData, num_bathrooms: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                                                placeholder="0"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="email">Email</Label>
                                        <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="mobile_number">Teléfono Principal</Label>
                                        <Input 
                                            id="mobile_number" 
                                            value={formData.mobile_number} 
                                            onChange={(e) => setFormData({ ...formData, mobile_number: e.target.value })} 
                                            placeholder="ej: 0412345678"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="secondary_mobile_number">Teléfono Secundario</Label>
                                        <Input 
                                            id="secondary_mobile_number" 
                                            value={formData.secondary_mobile_number} 
                                            onChange={(e) => setFormData({ ...formData, secondary_mobile_number: e.target.value })} 
                                            placeholder="ej: 0498765432 (opcional)"
                                        />
                                        <p className="text-xs text-slate-500">
                                            Los mensajes SMS se enviarán a ambos números si se proporciona.
                                        </p>
                                    </div>
                                    <div className="flex items-center space-x-2 self-end pb-2">
                                        <Checkbox 
                                            id="active" 
                                            checked={formData.active} 
                                            onCheckedChange={(checked) => setFormData(prev => ({...prev, active: checked}))}
                                        />
                                        <Label htmlFor="active">Cliente Activo</Label>
                                    </div>
                                </TabsContent>

                                {/* Service Tab */}
                                <TabsContent value="service" className="space-y-6 p-1">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <Label htmlFor="service_frequency">Frecuencia de Servicio</Label>
                                            <Select value={formData.service_frequency} onValueChange={(value) => setFormData({ ...formData, service_frequency: value })}>
                                                <SelectTrigger><SelectValue placeholder="Seleccionar frecuencia..."/></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="weekly">Semanal</SelectItem>
                                                    <SelectItem value="fortnightly">Quincenal</SelectItem>
                                                    <SelectItem value="every_3_weeks">Cada 3 semanas</SelectItem>
                                                    <SelectItem value="monthly">Mensual</SelectItem>
                                                    <SelectItem value="one_off">Servicio Único</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="payment_method">Método de Pago</Label>
                                            <Select value={formData.payment_method} onValueChange={(value) => setFormData({ ...formData, payment_method: value })}>
                                                <SelectTrigger><SelectValue placeholder="Seleccionar método..."/></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="bank_transfer">Transferencia Bancaria</SelectItem>
                                                    <SelectItem value="cash">Efectivo</SelectItem>
                                                    <SelectItem value="credit_card">Tarjeta de Crédito</SelectItem>
                                                    <SelectItem value="gocardless">GoCardless</SelectItem>
                                                    <SelectItem value="stripe">Stripe</SelectItem>
                                                    <SelectItem value="other">Otro</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    {/* Special Billing Instructions */}
                                    <div className="bg-orange-50 border-l-4 border-orange-400 p-4 rounded-r-lg space-y-4">
                                        <h3 className="font-semibold text-orange-900 flex items-center gap-2"><FileSignature className="w-5 h-5"/> Facturación Especial</h3>
                                        <div className="flex items-center space-x-2">
                                            <Checkbox 
                                                id="has_special_billing_instructions" 
                                                checked={formData.has_special_billing_instructions} 
                                                onCheckedChange={(checked) => setFormData(prev => ({...prev, has_special_billing_instructions: checked}))}
                                            />
                                            <Label htmlFor="has_special_billing_instructions" className="font-normal">Este cliente tiene instrucciones especiales de facturación</Label>
                                        </div>
                                        {formData.has_special_billing_instructions && (
                                            <div className="space-y-2 pl-6 pt-2">
                                                <Label htmlFor="special_billing_instructions">Instrucciones de Facturación</Label>
                                                <Textarea
                                                    id="special_billing_instructions"
                                                    value={formData.special_billing_instructions}
                                                    onChange={(e) => setFormData({ ...formData, special_billing_instructions: e.target.value })}
                                                    placeholder="Ej: Enviar factura a un email diferente, no incluir ciertos detalles, facturar a una entidad corporativa, etc."
                                                    rows={4}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Admin Notes */}
                                    <div className="space-y-2">
                                        <Label htmlFor="admin_notes">Notas Administrativas</Label>
                                        <Textarea
                                            id="admin_notes"
                                            value={formData.admin_notes}
                                            onChange={(e) => setFormData({ ...formData, admin_notes: e.target.value })}
                                            placeholder="Notas internas solo visibles para administradores..."
                                            rows={3}
                                        />
                                        <p className="text-xs text-slate-500">
                                            Estas notas son privadas y solo las pueden ver los administradores.
                                        </p>
                                    </div>

                                    {editingClient && (
                                        <ServicePriceManager
                                            client={formData} /* Pass full formData */
                                            onUpdate={(updates) => setFormData(prev => ({...prev, ...updates}))}
                                        />
                                    )}

                                    {/* NEW: Structured Service Notes Section */}
                                    <div className="mt-8">
                                        <StructuredServiceNotes
                                            structuredNotes={formData.structured_service_notes || {}}
                                            onUpdate={(updatedNotes) => setFormData(prev => ({
                                                ...prev,
                                                structured_service_notes: updatedNotes
                                            }))}
                                            isReadOnly={false}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="default_service_notes">Notas Generales por Defecto</Label>
                                        <Textarea 
                                            id="default_service_notes" 
                                            placeholder="Notas generales que no encajan en áreas específicas..."
                                            value={formData.default_service_notes} 
                                            onChange={(e) => setFormData({ ...formData, default_service_notes: e.target.value })}
                                            rows={4}
                                        />
                                        <p className="text-xs text-slate-500">
                                            Estas notas generales se combinarán con las notas estructuradas por áreas en cada servicio.
                                        </p>
                                    </div>
                                </TabsContent>

                                {/* Family and Pets Tab (NEW) */}
                                <TabsContent value="family-pets" className="space-y-4 p-1">
                                    <FamilyAndPetsManager
                                        client={formData}
                                        onUpdate={(updates) => setFormData(prev => ({ ...prev, ...updates }))}
                                    />
                                </TabsContent>

                                {/* Access Management Tab */}
                                <TabsContent value="access" className="space-y-6 p-1">
                                    <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-lg space-y-4">
                                        <h3 className="font-semibold text-amber-900 flex items-center gap-2"><KeySquare className="w-5 h-5"/> Gestión de Acceso</h3>
                                        <div className="flex items-center space-x-2">
                                            <Checkbox 
                                                id="has_access" 
                                                checked={formData.has_access} 
                                                onCheckedChange={(checked) => setFormData(prev => ({...prev, has_access: checked}))}
                                            />
                                            <Label htmlFor="has_access" className="font-normal">La empresa gestiona el acceso a esta propiedad</Label>
                                        </div>
                                        {formData.has_access && (
                                            <div className="space-y-4 pl-6 pt-2">
                                                <div className="space-y-2">
                                                    <Label htmlFor="access_type">Tipo de Acceso</Label>
                                                    <Select value={formData.access_type} onValueChange={(value) => setFormData({ ...formData, access_type: value })}>
                                                        <SelectTrigger><SelectValue placeholder="Seleccionar tipo de acceso..."/></SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="key">Llave Física</SelectItem>
                                                            <SelectItem value="smart_lock">Cerradura Inteligente</SelectItem>
                                                            <SelectItem value="lockbox">Caja de Seguridad (Lockbox)</SelectItem>
                                                            <SelectItem value="other">Otro</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="access_identifier">Identificador / Código de Acceso</Label>
                                                    <Input 
                                                        id="access_identifier" 
                                                        value={formData.access_identifier} 
                                                        onChange={(e) => setFormData({ ...formData, access_identifier: e.target.value })}
                                                        placeholder="Ej: K15, Código: 1234#, Combinación: 5555"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="access_instructions">Instrucciones de Acceso</Label>
                                                    <Textarea
                                                        id="access_instructions" 
                                                        value={formData.access_instructions} 
                                                        onChange={(e) => setFormData({ ...formData, access_instructions: e.target.value })}
                                                        placeholder="Ej: El lockbox está detrás de la maceta grande en el porche. Girar a la derecha."
                                                        rows={3}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>Fotos de Ayuda para el Acceso</Label>
                                                    <PhotoUploader
                                                        uploadedUrls={formData.access_photos}
                                                        onUrlsChange={(urls) => setFormData(prev => ({...prev, access_photos: urls}))}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </TabsContent>
                                
                                <div className="flex justify-between pt-6">
                                    <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditingClient(null); setFormData(defaultFormData); }}>
                                        Cancelar
                                    </Button>
                                    <Button type="submit" disabled={loading}>
                                        {loading ? 'Guardando...' : (editingClient ? 'Actualizar Cliente' : 'Crear Cliente')}
                                    </Button>
                                </div>
                            </form>
                        </Tabs>
                    </DialogContent>
                </Dialog>

                {/* Removed: Panel Lateral para Historial (Sheet) as history is now on a separate page */}
                {/* <Sheet open={!!viewingHistoryClientId} onOpenChange={(open) => !open && setViewingHistoryClientId(null)}>
                    <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
                        <SheetHeader>
                            <SheetTitle className="flex items-center gap-2">
                                <History className="w-5 h-5 text-blue-600" />
                                Historial de Cliente
                            </SheetTitle>
                            <SheetDescription>
                                {viewingHistoryClient ? (
                                    <>
                                        <span className="font-semibold text-slate-900">{viewingHistoryClient.name}</span>
                                        <span className="text-slate-500"> • {viewingHistoryClient.address}</span>
                                    </>
                                ) : (
                                    <span className="text-slate-500">Cargando información del cliente...</span>
                                )}
                            </DialogDescription>
                        </SheetHeader>
                        
                        <div className="mt-6">
                            {viewingHistoryClientId ? (
                                <ClientHistory clientId={viewingHistoryClientId} />
                            ) : (
                                <div className="flex items-center justify-center py-12">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                    <span className="ml-3 text-slate-600">Cargando historial...</span>
                                </div>
                            )}
                        </div>
                    </SheetContent>
                </Sheet> */}

                {/* Dialog de Confirmación de Eliminación */}
                <Dialog open={!!deletingClient} onOpenChange={() => setDeletingClient(null)}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 text-red-600"><AlertTriangle />Confirmar Eliminación</DialogTitle>
                            <DialogDescription>
                                ¿Estás seguro de que quieres eliminar al cliente <strong>{deletingClient?.name}</strong>? Esta acción no se puede deshacer.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setDeletingClient(null)}>Cancelar</Button>
                            <Button variant="destructive" onClick={handleDelete}>Sí, Eliminar</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}