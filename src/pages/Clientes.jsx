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
import { PlusCircle, Edit, Trash2, Search, X, AlertTriangle, KeySquare, Eye, EyeOff, FileSignature, History } from 'lucide-react';
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
    // Removed: viewingHistoryClientId state as history will be on a separate page

    // Define a default formData structure for easy reset
    const defaultFormData = useMemo(() => ({
        name: '',
        sms_name: '',
        client_type: 'domestic',
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
        // New fields for billing
        has_special_billing_instructions: false,
        special_billing_instructions: '',
        admin_notes: '',
        // New fields for Family and Pets
        family_members: [],
        pets: [],
        // New fields for additional services
        fridge_cleaning_services: [],
        spring_cleaning_services: [],
        oven_cleaning_services: [],
        // Property details
        property_type: '', // e.g., 'house', 'townhouse', 'unit', 'apartment'
        property_stories: '', // NEW: 'single_storey', 'double_storey', 'triple_storey', 'other'
        num_bedrooms: '', // Number of bedrooms
        num_bathrooms: '', // Number of bathrooms (can be half, e.g., 2.5)
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
            ...defaultFormData, // Start with defaults
            ...client, // Overlay with client data
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
            // New fields for billing
            has_special_billing_instructions: client.has_special_billing_instructions || false,
            special_billing_instructions: client.special_billing_instructions || '',
            admin_notes: client.admin_notes || '',
            family_members: client.family_members || [],
            pets: client.pets || [],
            secondary_mobile_number: client.secondary_mobile_number || '',
            fridge_cleaning_services: client.fridge_cleaning_services || [],
            spring_cleaning_services: client.spring_cleaning_services || [],
            oven_cleaning_services: client.oven_cleaning_services || [],
            // Property details
            property_type: client.property_type || '',
            property_stories: client.property_stories || '', // NEW
            num_bedrooms: client.num_bedrooms !== undefined && client.num_bedrooms !== null ? client.num_bedrooms : '',
            num_bathrooms: client.num_bathrooms !== undefined && client.num_bathrooms !== null ? client.num_bathrooms : '',
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
            
            return matchesSearch && matchesActiveFilter;
        });
    }, [clients, searchTerm, showInactive]);

    // Removed: viewingHistoryClient memo as history will be on a separate page

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6 md:p-8">
            <div className="w-full">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-3xl font-bold">Gestión de Clientes</h1>
                    <Button onClick={handleCreate}><PlusCircle className="mr-2 h-4 w-4" /> Nuevo Cliente</Button>
                </div>

                <div className="mb-6 flex flex-col sm:flex-row gap-4">
                    <div className="relative flex-1">
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
                    <Button
                        variant="outline"
                        onClick={() => setShowInactive(!showInactive)}
                        className="flex items-center gap-2"
                    >
                        {showInactive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        {showInactive ? 'Ocultar Inactivos' : 'Mostrar Inactivos'}
                    </Button>
                </div>

                <div className="bg-white rounded-lg shadow-md overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="min-w-[150px]">Nombre</TableHead>
                                <TableHead className="min-w-[200px]">Dirección</TableHead>
                                <TableHead>Frecuencia</TableHead>
                                <TableHead>Precio</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead>Acceso</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan="7" className="text-center py-8">Cargando clientes...</TableCell></TableRow>
                            ) : filteredClients.length > 0 ? (
                                filteredClients.map(client => (
                                    <TableRow key={client.id} className="hover:bg-gray-50">
                                        <TableCell className="font-medium">
                                            <div className="flex items-center gap-2">
                                                <span>{client.name}</span>
                                                {client.has_special_billing_instructions && (
                                                    <FileSignature className="w-4 h-4 text-orange-500" title="Instrucciones especiales de facturación" />
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>{client.address}</TableCell>
                                        <TableCell>{client.service_frequency}</TableCell>
                                        <TableCell>${client.current_service_price?.toFixed(2) || '0.00'}</TableCell>
                                        <TableCell>
                                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${client.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                {client.active ? 'Activo' : 'Inactivo'}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            {client.has_access && (
                                                <div className="flex items-center gap-2 text-amber-600" title={`Acceso: ${client.access_identifier}`}>
                                                    <KeySquare className="w-5 h-5" />
                                                    <span className="font-semibold">{client.access_type === 'key' ? 'Llave' : client.access_identifier}</span>
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                onClick={() => {
                                                    const url = `${createPageUrl('HistorialClientes')}?client_id=${client.id}`;
                                                    window.location.href = url;
                                                }}
                                                title="Ver Historial"
                                            >
                                                <History className="h-4 w-4 text-blue-600" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => handleEdit(client)}><Edit className="h-4 w-4" /></Button>
                                            <Button variant="ghost" size="icon" onClick={() => setDeletingClient(client)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow><TableCell colSpan="7" className="text-center h-24">No se encontraron clientes.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>

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
                                                <SelectItem value="operational_cost">Costo Operativo</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        {formData.client_type === 'operational_cost' && (
                                            <p className="text-xs text-slate-600 bg-orange-50 px-3 py-2 rounded border border-orange-200">
                                                ⚠️ Este cliente será tratado como gasto operativo. Sus costos se distribuirán entre los clientes reales en el análisis de rentabilidad.
                                            </p>
                                        )}
                                    </div>
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