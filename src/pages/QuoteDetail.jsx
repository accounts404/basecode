import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import { ArrowLeft, Save, UserPlus, Building, Clock, FileText, Calculator, Sparkles, PlusCircle, Edit, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

const ClientForm = ({ client, onSubmit, onCancel }) => {
    const [formData, setFormData] = useState({ name: '', email: '', phone: '', address: '' });

    useEffect(() => {
        if (client) {
            setFormData({
                name: client.name || '',
                email: client.email || '',
                phone: client.mobile_number || '',
                address: client.address || ''
            });
        } else {
            setFormData({ name: '', email: '', phone: '', address: '' });
        }
    }, [client]);

    const handleChange = (field, value) => setFormData(p => ({ ...p, [field]: value }));
    const handleSubmit = e => { e.preventDefault(); onSubmit(formData); };

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2"><Label className="text-base">Nombre</Label><Input value={formData.name} onChange={e => handleChange('name', e.target.value)} required className="h-12 text-base" /></div>
                <div className="space-y-2"><Label className="text-base">Email</Label><Input type="email" value={formData.email} onChange={e => handleChange('email', e.target.value)} required className="h-12 text-base" /></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2"><Label className="text-base">Teléfono</Label><Input value={formData.phone} onChange={e => handleChange('phone', e.target.value)} className="h-12 text-base" /></div>
                <div className="space-y-2"><Label className="text-base">Dirección</Label><Input value={formData.address} onChange={e => handleChange('address', e.target.value)} className="h-12 text-base" /></div>
            </div>
            <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={onCancel} className="h-12 px-6 text-base">Cancelar</Button>
                <Button type="submit" className="h-12 px-6 text-base">{client ? 'Actualizar Cliente' : 'Guardar Cliente'}</Button>
            </div>
        </form>
    );
};

const cleaningAreas = [
    { id: 'hours_dusting', label: 'Dusting' },
    { id: 'hours_kitchen', label: 'Kitchen' },
    { id: 'hours_bathrooms', label: 'Bathrooms' },
    { id: 'hours_vacuum_mopping', label: 'Vacuum & Mopping' },
];

const commercialAreas = [
    { id: 'hours_dusting', label: 'Dusting' },
    { id: 'hours_kitchen', label: 'Kitchen' },
    { id: 'hours_bathrooms', label: 'Bathrooms' },
    { id: 'hours_vacuum_mopping', label: 'Vacuum & Mopping' },
    { id: 'hours_warehouse', label: 'Warehouse' },
];

export default function QuoteDetailPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const [quote, setQuote] = useState(null);
    const [clients, setClients] = useState([]);
    const [serviceRates, setServiceRates] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isClientFormOpen, setIsClientFormOpen] = useState(false);
    const [editingClient, setEditingClient] = useState(null);
    const [selectedInitialRateId, setSelectedInitialRateId] = useState('');
    const [selectedRegularRateId, setSelectedRegularRateId] = useState('');
    const [selectedCommercialRateId, setSelectedCommercialRateId] = useState('');
    const [currentUser, setCurrentUser] = useState(null);

    const [showCriticalErrorDialog, setShowCriticalErrorDialog] = useState(false);
    const [criticalErrorTitle, setCriticalErrorTitle] = useState("");
    const [criticalErrorMessage, setCriticalErrorMessage] = useState("");

    const getQuoteId = useCallback(() => new URLSearchParams(location.search).get('id'), [location.search]);

    const handleCriticalError = useCallback((error, contextMessage = "Ocurrió un error inesperado.") => {
        console.error("Critical error:", error);
        let title = "Error de Conexión o Autenticación";
        let message = "No pudimos conectar con el servidor o su sesión ha expirado. Por favor, intente de nuevo más tarde.";

        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
            message = "Su sesión ha expirado o no tiene permisos. Por favor, inicie sesión nuevamente.";
        } else if (error.message && (error.message.includes("Failed to fetch") || error.message.includes("NetworkError") || error.message.includes("ERR_CONNECTION_REFUSED"))) {
            message = "No se pudo conectar al servidor. Verifique su conexión a internet.";
        } else {
            title = "Error del Sistema";
            message = contextMessage + " Detalles: " + (error.message || "Error desconocido.");
        }
        setCriticalErrorTitle(title);
        setCriticalErrorMessage(message);
        setShowCriticalErrorDialog(true);
    }, []);

    const loadInitialData = useCallback(async () => {
        setIsLoading(true);
        const quoteId = getQuoteId();
        try {
            const [clientsData, ratesData, settingsData, userData] = await Promise.all([
                base44.entities.Client.list(null, 1000),
                base44.entities.ServiceRate.list(),
                base44.entities.SystemSetting.list(),
                base44.auth.me()
            ]);
            const settings = settingsData[0] || {};
            setClients(clientsData);
            setServiceRates(ratesData);
            setCurrentUser(userData);

            if (quoteId) {
                const quoteData = await base44.entities.Quote.get(quoteId);
                setQuote(quoteData);
            } else {
                setQuote({
                    client_id: '',
                    service_address: '',
                    status: 'borrador',
                    quote_date: new Date().toISOString().split('T')[0],
                    notes: '',
                    additional_hours_initial: 0,
                    additional_hours_regular: 0,
                    additional_hours_commercial: 0,
                    ...cleaningAreas.reduce((acc, area) => ({
                        ...acc,
                        [`${area.id}_initial`]: 0,
                        [`${area.id}_regular`]: 0,
                    }), {}),
                    ...commercialAreas.reduce((acc, area) => ({
                        ...acc,
                        [`${area.id}_commercial`]: 0,
                    }), {}),
                    total_hours_initial: 0,
                    total_hours_regular: 0,
                    total_hours_commercial: 0,
                    cost_steam_vacuum: 0,
                    rooms_for_steam_vacuum: 0,
                    price_per_room_steam_vacuum: settings.price_per_room_steam_vacuum || 0,
                    cost_oven: 0,
                    cost_windows_cleaning: 0,
                    selected_services: [],
                    total_price_min: 0,
                    total_price_max: 0,
                });
            }
        } catch (error) {
            handleCriticalError(error, "Error al cargar los datos iniciales.");
        } finally {
            setIsLoading(false);
        }
    }, [getQuoteId, handleCriticalError]);

    useEffect(() => { loadInitialData(); }, [loadInitialData]);

    useEffect(() => {
        if (serviceRates.length > 0) {
            if (!selectedInitialRateId) {
                const firstInitial = serviceRates.find(rate => rate.is_active && rate.service_type === 'initial');
                if (firstInitial) {
                    setSelectedInitialRateId(firstInitial.id);
                }
            }
            if (!selectedRegularRateId) {
                const firstRegular = serviceRates.find(rate => rate.is_active && rate.service_type === 'regular');
                if (firstRegular) {
                    setSelectedRegularRateId(firstRegular.id);
                }
            }
            if (!selectedCommercialRateId) {
                const firstCommercial = serviceRates.find(rate => rate.is_active && rate.service_type === 'commercial');
                if (firstCommercial) {
                    setSelectedCommercialRateId(firstCommercial.id);
                }
            }
        }
    }, [serviceRates, selectedInitialRateId, selectedRegularRateId, selectedCommercialRateId]);


    const handleQuoteChange = (field, rawValue) => {
        setQuote(prev => {
            const updatedState = { ...prev };
            if (['rooms_for_steam_vacuum', 'price_per_room_steam_vacuum', 'cost_oven', 'cost_windows_cleaning', 'additional_hours_initial', 'additional_hours_regular', 'additional_hours_commercial'].includes(field) || field.startsWith('hours_')) {
                updatedState[field] = rawValue === '' ? 0 : (parseFloat(rawValue) || 0);
            } else {
                updatedState[field] = rawValue;
            }

            if (field === 'client_id') {
                const client = clients.find(c => c.id === rawValue);
                if (client) updatedState.service_address = client.address;
            }

            if (field.includes('_initial')) {
                const totalInitial = cleaningAreas.reduce((sum, area) => {
                    const hours = Number(updatedState[`${area.id}_initial`]) || 0;
                    return sum + hours;
                }, 0);
                updatedState.total_hours_initial = totalInitial;
            }

            if (field.includes('_regular')) {
                const totalRegular = cleaningAreas.reduce((sum, area) => {
                    const hours = Number(updatedState[`${area.id}_regular`]) || 0;
                    return sum + hours;
                }, 0);
                updatedState.total_hours_regular = totalRegular;
            }

            if (field.includes('_commercial')) {
                const totalCommercial = commercialAreas.reduce((sum, area) => {
                    const hours = Number(updatedState[`${area.id}_commercial`]) || 0;
                    return sum + hours;
                }, 0);
                updatedState.total_hours_commercial = totalCommercial;
            }

            if (field === 'rooms_for_steam_vacuum' || field === 'price_per_room_steam_vacuum') {
                const rooms = field === 'rooms_for_steam_vacuum' ? (parseFloat(rawValue) || 0) : (updatedState.rooms_for_steam_vacuum || 0);
                const price = field === 'price_per_room_steam_vacuum' ? (parseFloat(rawValue) || 0) : (updatedState.price_per_room_steam_vacuum || 0);
                updatedState.cost_steam_vacuum = rooms * price;
            }

            if (field.startsWith('hours_') ||
                ['rooms_for_steam_vacuum', 'price_per_room_steam_vacuum', 'cost_oven', 'cost_windows_cleaning', 'additional_hours_initial', 'additional_hours_regular', 'additional_hours_commercial'].includes(field)) {
                updatedState.selected_services = [];
                updatedState.total_price_min = 0;
                updatedState.total_price_max = 0;
            }

            return updatedState;
        });
    };

    const handleToggleService = useCallback((rate, isSelected, calculatedPriceMin, calculatedPriceMax) => {
        setQuote(prev => {
            let newSelectedServices = [...(prev.selected_services || [])];

            if (isSelected) {
                newSelectedServices = newSelectedServices.filter(s =>
                    !(s.service_name === rate.service_name && s.service_type === rate.service_type)
                );
                toast.info(`Servicio '${rate.service_name}' deseleccionado.`);
            } else {
                // Para servicios regulares, permitir múltiples selecciones
                // Para inicial y comercial, solo permitir uno a la vez
                if (rate.service_type !== 'regular') {
                    newSelectedServices = newSelectedServices.filter(s => s.service_type !== rate.service_type);
                }

                newSelectedServices.push({
                    service_name: rate.service_name,
                    service_type: rate.service_type,
                    price_min: calculatedPriceMin,
                    price_max: calculatedPriceMax
                });
                toast.info(`Servicio '${rate.service_name}' seleccionado.`);
            }

            const total_price_min = newSelectedServices.reduce((sum, s) => sum + s.price_min, 0);
            const total_price_max = newSelectedServices.reduce((sum, s) => sum + s.price_max, 0);

            return {
                ...prev,
                selected_services: newSelectedServices,
                total_price_min,
                total_price_max
            };
        });
    }, []);

    const handleClientFormSubmit = async (clientData) => {
        const canModifyClients = currentUser?.role === 'admin';
        
        if (!canModifyClients) {
            toast.error("No tienes permisos para modificar información de clientes.");
            return;
        }

        try {
            if (editingClient) {
                const updatedClient = await base44.entities.Client.update(editingClient.id, {
                    name: clientData.name,
                    email: clientData.email,
                    mobile_number: clientData.phone,
                    address: clientData.address
                });
                toast.success("Cliente actualizado con éxito.");
                setClients(prev => prev.map(c => c.id === updatedClient.id ? updatedClient : c));
                if (quote.client_id === updatedClient.id) {
                    setQuote(prevQuote => ({
                        ...prevQuote,
                        service_address: updatedClient.address
                    }));
                }
            } else {
                const newClient = await base44.entities.Client.create({
                    name: clientData.name,
                    email: clientData.email,
                    mobile_number: clientData.phone,
                    address: clientData.address
                });
                toast.success("Nuevo cliente creado.");
                setClients(prev => [...prev, newClient]);
                handleQuoteChange('client_id', newClient.id);
            }
            setIsClientFormOpen(false);
            setEditingClient(null);
        } catch (error) {
            console.error("Error saving client:", error);
            toast.error("Error al guardar el cliente.");
        }
    };
    
    const handleOpenClientForm = (clientToEdit = null) => {
        const canModifyClients = currentUser?.role === 'admin';
        
        if (!canModifyClients) {
            toast.error("No tienes permisos para modificar información de clientes.", {
                description: "Solo administradores pueden editar clientes."
            });
            return;
        }

        setEditingClient(clientToEdit);
        setIsClientFormOpen(true);
    };

    const handleSaveQuote = async () => {
        setIsSaving(true);

        if (!quote.client_id || !quote.service_address) {
            toast.error("Por favor, selecciona un cliente y añade una dirección de servicio.");
            setIsSaving(false);
            return;
        }
        
        const isUpdate = quote.id && typeof quote.id === 'string' && quote.id.length > 15;

        try {
            const client = clients.find(c => c.id === quote.client_id);
            
            const dataToSave = {
                client_id: quote.client_id,
                client_name: client?.name || 'N/A',
                service_address: quote.service_address,
                quote_date: quote.quote_date,
                status: quote.status,
                notes: quote.notes || '',
                
                hours_dusting_initial: Number(quote.hours_dusting_initial) || 0,
                hours_kitchen_initial: Number(quote.hours_kitchen_initial) || 0,
                hours_bathrooms_initial: Number(quote.hours_bathrooms_initial) || 0,
                hours_vacuum_mopping_initial: Number(quote.hours_vacuum_mopping_initial) || 0,
                
                hours_dusting_regular: Number(quote.hours_dusting_regular) || 0,
                hours_kitchen_regular: Number(quote.hours_kitchen_regular) || 0,
                hours_bathrooms_regular: Number(quote.hours_bathrooms_regular) || 0,
                hours_vacuum_mopping_regular: Number(quote.hours_vacuum_mopping_regular) || 0,

                hours_dusting_commercial: Number(quote.hours_dusting_commercial) || 0,
                hours_kitchen_commercial: Number(quote.hours_kitchen_commercial) || 0,
                hours_bathrooms_commercial: Number(quote.hours_bathrooms_commercial) || 0,
                hours_vacuum_mopping_commercial: Number(quote.hours_vacuum_mopping_commercial) || 0,
                hours_warehouse_commercial: Number(quote.hours_warehouse_commercial) || 0,
                
                additional_hours_initial: Number(quote.additional_hours_initial || 0),
                additional_hours_regular: Number(quote.additional_hours_regular || 0),
                additional_hours_commercial: Number(quote.additional_hours_commercial || 0),
                cost_steam_vacuum: Number(quote.cost_steam_vacuum || 0),
                rooms_for_steam_vacuum: Number(quote.rooms_for_steam_vacuum || 0),
                price_per_room_steam_vacuum: Number(quote.price_per_room_steam_vacuum || 0),
                cost_oven: Number(quote.cost_oven || 0),
                cost_windows_cleaning: Number(quote.cost_windows_cleaning || 0),
                total_hours_initial: Number(quote.total_hours_initial || 0),
                total_hours_regular: Number(quote.total_hours_regular || 0),
                total_hours_commercial: Number(quote.total_hours_commercial || 0),
                
                selected_services: (quote.selected_services || []).map(s => ({
                   service_name: s.service_name,
                   service_type: s.service_type,
                   price_min: Number(s.price_min || 0),
                   price_max: Number(s.price_max || 0),
                })),
                total_price_min: Number(quote.total_price_min || 0),
                total_price_max: Number(quote.total_price_max || 0),
            };

            let savedQuote;
            if (isUpdate) {
                const originalQuote = await base44.entities.Quote.get(quote.id);
                const originalStatus = originalQuote.status;
                savedQuote = await base44.entities.Quote.update(quote.id, dataToSave);
                toast.success("Cotización actualizada con éxito.");
                
                if (savedQuote.status === 'aprobado' && originalStatus !== 'aprobado') {
                    if (!savedQuote.selected_services || savedQuote.selected_services.length === 0) {
                        toast.error("Por favor, selecciona al menos un servicio antes de aprobar la cotización.");
                        setIsSaving(false);
                        return;
                    }
                    const finalTotalPriceMin = savedQuote.total_price_min + (savedQuote.cost_steam_vacuum || 0) + (savedQuote.cost_oven || 0) + (savedQuote.cost_windows_cleaning || 0);
                    const finalTotalPriceMax = savedQuote.total_price_max + (savedQuote.cost_steam_vacuum || 0) + (savedQuote.cost_oven || 0) + (savedQuote.cost_windows_cleaning || 0);
                    await base44.entities.ZenMaidTransfer.create({ quote_id: savedQuote.id, client_id: savedQuote.client_id, client_name: savedQuote.client_name, service_address: savedQuote.service_address, status: 'pending', selected_services: savedQuote.selected_services, total_price_min: finalTotalPriceMin, total_price_max: finalTotalPriceMax });
                    toast.info("Cotización enviada a la cola de ZenMaid para agendar.");
                }
            } else {
                savedQuote = await base44.entities.Quote.create(dataToSave);
                toast.success("Cotización creada con éxito.");

                if (savedQuote.status === 'aprobado') {
                    if (!savedQuote.selected_services || savedQuote.selected_services.length === 0) {
                        toast.error("Por favor, selecciona al menos un servicio antes de aprobar la cotización.");
                        setIsSaving(false);
                        return;
                    }
                    const finalTotalPriceMin = savedQuote.total_price_min + (savedQuote.cost_steam_vacuum || 0) + (savedQuote.cost_oven || 0) + (savedQuote.cost_windows_cleaning || 0);
                    const finalTotalPriceMax = savedQuote.total_price_max + (savedQuote.cost_steam_vacuum || 0) + (savedQuote.cost_oven || 0) + (savedQuote.cost_windows_cleaning || 0);
                    await base44.entities.ZenMaidTransfer.create({ quote_id: savedQuote.id, client_id: savedQuote.client_id, client_name: savedQuote.client_name, service_address: savedQuote.service_address, status: 'pending', selected_services: savedQuote.selected_services, total_price_min: finalTotalPriceMin, total_price_max: finalTotalPriceMax });
                    toast.info("Cotización enviada a la cola de ZenMaid para agendar.");
                }
            }
            
            navigate(createPageUrl('Cotizaciones'));

        } catch (error) {
            if (error.response && (error.response.status === 401 || error.response.status === 403)) {
                handleCriticalError(error, "Error al guardar la cotización. Su sesión puede haber expirado.");
            } else if (error.message && (error.message.includes("Failed to fetch") || error.message.includes("NetworkError") || error.message.includes("ERR_CONNECTION_REFUSED"))) {
                handleCriticalError(error, "Error de red al guardar la cotización.");
            } else {
                console.error("Error saving quote:", error);
                toast.error("Error al guardar la cotización.");
            }
        } finally {
            setIsSaving(false);
        }
    };

    const getGoogleMapsLink = (address) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

    const getHourDisplayValue = (value) => {
        return (value === 0 || value === null || value === undefined) ? '' : value.toString();
    };

    if (isLoading || !quote) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <Skeleton className="h-12 w-12 rounded-full" />
                    <p className="text-gray-600">Cargando cotización...</p>
                </div>
            </div>
        );
    }

    const activeInitialRates = serviceRates.filter(rate => rate.is_active && rate.service_type === 'initial');
    const activeRegularRates = serviceRates.filter(rate => rate.is_active && rate.service_type === 'regular');
    const activeCommercialRates = serviceRates.filter(rate => rate.is_active && rate.service_type === 'commercial');
    const selectedInitialRate = activeInitialRates.find(r => r.id === selectedInitialRateId);
    const selectedRegularRate = activeRegularRates.find(r => r.id === selectedRegularRateId);
    const selectedCommercialRate = activeCommercialRates.find(r => r.id === selectedCommercialRateId);

    const selectedClient = clients.find(c => c.id === quote.client_id);

    const canModifyClients = currentUser?.role === 'admin';

    return (
        <>
            <Toaster richColors position="top-right" />

            <div className="p-4 md:p-6 lg:p-8 space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <h1 className="text-3xl md:text-2xl font-bold text-gray-800">
                        {quote.id ? `Cotización #${quote.id.slice(0, 8)}` : "Nueva Cotización"}
                    </h1>
                    <div className="flex gap-3 w-full md:w-auto">
                        <Button variant="outline" asChild className="h-12 px-6 text-base flex-1 md:flex-none"><Link to={createPageUrl('Cotizaciones')}><ArrowLeft className="w-5 h-5 mr-2" /> Volver</Link></Button>
                        <Button onClick={handleSaveQuote} disabled={isSaving} className="h-12 px-6 text-base flex-1 md:flex-none"><Save className="w-5 h-5 mr-2" /> {isSaving ? 'Guardando...' : 'Guardar'}</Button>
                    </div>
                </div>

                {quote.status === 'rechazado' && (
                    <Alert variant="destructive" className="bg-red-50 border-red-200">
                        <XCircle className="h-4 w-4" />
                        <AlertDescription className="text-red-800">
                           <span className="font-semibold">Cotización Rechazada:</span> {quote.rejection_reason || 'No se especificó un motivo.'}
                           {quote.rejection_type && <Badge variant="destructive" className="ml-2 bg-red-200 text-red-900">{quote.rejection_type}</Badge>}
                        </AlertDescription>
                    </Alert>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                    <div className="lg:col-span-3 space-y-6">
                        <Card>
                            <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><FileText className="w-6 h-6" />Información de la Cotización</CardTitle></CardHeader>
                            <CardContent className="space-y-5">
                                <div className="flex items-end gap-3">
                                    <div className="flex-grow space-y-2">
                                        <Label className="text-base">Cliente</Label>
                                        <Select value={quote.client_id || ''} onValueChange={v => handleQuoteChange('client_id', v)}>
                                            <SelectTrigger className="h-12 text-base"><SelectValue placeholder="Selecciona un cliente" /></SelectTrigger>
                                            <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id} className="text-base py-3">{c.name}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                    {canModifyClients && (
                                        <Button variant="outline" onClick={() => handleOpenClientForm()} className="h-12 w-12 flex-shrink-0"><UserPlus className="w-5 h-5" /></Button>
                                    )}
                                </div>

                                {selectedClient && (
                                    <div className="bg-blue-50 p-5 rounded-lg border border-blue-200">
                                        <div className="flex justify-between items-start mb-4">
                                            <h4 className="font-semibold text-blue-900 text-base">Información del Cliente</h4>
                                            {canModifyClients && (
                                                <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => handleOpenClientForm(selectedClient)}>
                                                    <Edit className="w-5 h-5 text-blue-600"/>
                                                </Button>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-base">
                                            <div>
                                                <span className="font-medium text-blue-800">Nombre:</span>
                                                <p className="text-blue-700 mt-1">{selectedClient.name}</p>
                                            </div>
                                            <div>
                                                <span className="font-medium text-blue-800">Email:</span>
                                                <p className="text-blue-700 mt-1">{selectedClient.email}</p>
                                            </div>
                                            <div>
                                                <span className="font-medium text-blue-800">Teléfono:</span>
                                                <p className="text-blue-700 mt-1">{selectedClient.mobile_number || 'No especificado'}</p>
                                            </div>
                                            <div>
                                                <span className="font-medium text-blue-800">Dirección:</span>
                                                <p className="text-blue-700 mt-1">{selectedClient.address || 'No especificada'}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <Label className="text-base">Dirección del Servicio</Label>
                                    <div className="flex items-center gap-3">
                                        <Input value={quote.service_address || ''} onChange={e => handleQuoteChange('service_address', e.target.value)} placeholder="Ingresa la dirección del servicio" className="h-12 text-base" />
                                        {quote.service_address && (
                                            <a href={getGoogleMapsLink(quote.service_address)} target="_blank" rel="noopener noreferrer">
                                                <Button variant="outline" size="icon" className="h-12 w-12 flex-shrink-0"><Building className="w-5 h-5" /></Button>
                                            </a>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-base">Notas del Servicio</Label>
                                    <Textarea
                                        value={quote.notes || ''}
                                        onChange={e => handleQuoteChange('notes', e.target.value)}
                                        placeholder="Notas adicionales sobre el servicio, requisitos especiales, acceso, etc..."
                                        rows={5}
                                        className="text-base resize-none"
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-lg">
                                    <Clock className="w-6 h-6" />
                                    Estimación de Horas - Servicios Iniciales
                                </CardTitle>
                                <CardDescription className="text-base">Spring Cleaning, One Off, Primera Limpieza</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-5">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {cleaningAreas.map(area => (
                                        <div key={`${area.id}_initial`} className="space-y-2">
                                            <Label className="text-base">{area.label}</Label>
                                            <Input
                                                type="number"
                                                step="0.5"
                                                min="0"
                                                placeholder="0"
                                                inputMode="decimal"
                                                value={getHourDisplayValue(quote[`${area.id}_initial`])}
                                                onChange={e => handleQuoteChange(`${area.id}_initial`, e.target.value)}
                                                className="h-12 text-base text-center"
                                            />
                                        </div>
                                    ))}
                                </div>
                                <div className="border-t pt-4">
                                    <div className="space-y-2">
                                        <Label className="text-base font-medium text-orange-700">Horas Adicionales (para precio máximo)</Label>
                                        <Input
                                            type="number"
                                            step="0.5"
                                            min="0"
                                            placeholder="0"
                                            inputMode="decimal"
                                            value={getHourDisplayValue(quote.additional_hours_initial)}
                                            onChange={e => handleQuoteChange('additional_hours_initial', e.target.value)}
                                            className="border-orange-200 focus:border-orange-400 h-12 text-base text-center"
                                        />
                                        <p className="text-sm text-gray-500">Horas extra que podrían ser necesarias</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-lg">
                                    <Clock className="w-6 h-6" />
                                    Estimación de Horas - Servicios Regulares
                                </CardTitle>
                                <CardDescription className="text-base">Semanal, Quincenal, Cada 3 semanas</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-5">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {cleaningAreas.map(area => (
                                        <div key={`${area.id}_regular`} className="space-y-2">
                                            <Label className="text-base">{area.label}</Label>
                                            <Input
                                                type="number"
                                                step="0.5"
                                                min="0"
                                                placeholder="0"
                                                inputMode="decimal"
                                                value={getHourDisplayValue(quote[`${area.id}_regular`])}
                                                onChange={e => handleQuoteChange(`${area.id}_regular`, e.target.value)}
                                                className="h-12 text-base text-center"
                                            />
                                        </div>
                                    ))}
                                </div>
                                <div className="border-t pt-4">
                                    <div className="space-y-2">
                                        <Label className="text-base font-medium text-blue-700">Horas Adicionales (para precio máximo)</Label>
                                        <Input
                                            type="number"
                                            step="0.5"
                                            min="0"
                                            placeholder="0"
                                            inputMode="decimal"
                                            value={getHourDisplayValue(quote.additional_hours_regular)}
                                            onChange={e => handleQuoteChange('additional_hours_regular', e.target.value)}
                                            className="border-blue-200 focus:border-blue-400 h-12 text-base text-center"
                                        />
                                        <p className="text-sm text-gray-500">Horas extra que podrían ser necesarias</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-lg">
                                    <Clock className="w-6 h-6" />
                                    Estimación de Horas - Servicios Comerciales
                                </CardTitle>
                                <CardDescription className="text-base">Oficinas, Locales, Negocios</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-5">
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                                    {commercialAreas.map(area => (
                                        <div key={`${area.id}_commercial`} className="space-y-2">
                                            <Label className="text-base">{area.label}</Label>
                                            <Input
                                                type="number"
                                                step="0.5"
                                                min="0"
                                                placeholder="0"
                                                inputMode="decimal"
                                                value={getHourDisplayValue(quote[`${area.id}_commercial`])}
                                                onChange={e => handleQuoteChange(`${area.id}_commercial`, e.target.value)}
                                                className="h-12 text-base text-center"
                                            />
                                        </div>
                                    ))}
                                </div>
                                <div className="border-t pt-4">
                                    <div className="space-y-2">
                                        <Label className="text-base font-medium text-purple-700">Horas Adicionales (para precio máximo)</Label>
                                        <Input
                                            type="number"
                                            step="0.5"
                                            min="0"
                                            placeholder="0"
                                            inputMode="decimal"
                                            value={getHourDisplayValue(quote.additional_hours_commercial)}
                                            onChange={e => handleQuoteChange('additional_hours_commercial', e.target.value)}
                                            className="border-purple-200 focus:border-purple-400 h-12 text-base text-center"
                                        />
                                        <p className="text-sm text-gray-500">Horas extra que podrían ser necesarias</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><PlusCircle className="w-6 h-6 text-orange-600" />Servicios Adicionales</CardTitle></CardHeader>
                            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div className="space-y-2">
                                    <Label className="text-base">Cuartos (Steam Vacuum)</Label>
                                    <Input
                                        type="number"
                                        step="1"
                                        min="0"
                                        placeholder="0"
                                        inputMode="numeric"
                                        value={getHourDisplayValue(quote.rooms_for_steam_vacuum)}
                                        onChange={e => handleQuoteChange('rooms_for_steam_vacuum', e.target.value)}
                                        className="h-12 text-base text-center"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-base">Precio/Cuarto (Steam)</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder="0.00"
                                        inputMode="decimal"
                                        value={getHourDisplayValue(quote.price_per_room_steam_vacuum)}
                                        onChange={e => handleQuoteChange('price_per_room_steam_vacuum', e.target.value)}
                                        className="h-12 text-base text-center"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-base">Costo Horno ($)</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder="0.00"
                                        inputMode="decimal"
                                        value={getHourDisplayValue(quote.cost_oven)}
                                        onChange={e => handleQuoteChange('cost_oven', e.target.value)}
                                        className="h-12 text-base text-center"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-base">Costo Windows Cleaning ($)</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder="0.00"
                                        inputMode="decimal"
                                        value={getHourDisplayValue(quote.cost_windows_cleaning)}
                                        onChange={e => handleQuoteChange('cost_windows_cleaning', e.target.value)}
                                        className="h-12 text-base text-center"
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="lg:col-span-2 space-y-6">
                        <div className="space-y-4">
                            <Card className="bg-gradient-to-br from-orange-50 to-red-50 border-orange-200">
                                <CardHeader><CardTitle className="flex items-center gap-2 text-orange-800"><Calculator className="w-5 h-5" />Horas Servicios Iniciales</CardTitle></CardHeader>
                                <CardContent className="text-center">
                                    <p className="text-3xl font-bold text-orange-700">{(quote.total_hours_initial || 0).toFixed(1)}</p>
                                    <p className="text-orange-600 text-sm">Spring Cleaning, One Off, Primera Limpieza</p>
                                </CardContent>
                            </Card>

                            <Card className="bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200">
                                <CardHeader><CardTitle className="flex items-center gap-2 text-blue-800"><Calculator className="w-5 h-5" />Horas Servicios Regulares</CardTitle></CardHeader>
                                <CardContent className="text-center">
                                    <p className="text-3xl font-bold text-blue-700">{(quote.total_hours_regular || 0).toFixed(1)}</p>
                                    <p className="text-blue-600 text-sm">Semanal, Quincenal, Cada 3 semanas</p>
                                </CardContent>
                            </Card>

                            <Card className="bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200">
                                <CardHeader><CardTitle className="flex items-center gap-2 text-purple-800"><Calculator className="w-5 h-5" />Horas Servicios Comerciales</CardTitle></CardHeader>
                                <CardContent className="text-center">
                                    <p className="text-3xl font-bold text-purple-700">{(quote.total_hours_commercial || 0).toFixed(1)}</p>
                                    <p className="text-purple-600 text-sm">Oficinas, Locales, Negocios</p>
                                </CardContent>
                            </Card>
                        </div>

                        {((quote.total_hours_initial || 0) > 0 || (quote.total_hours_regular || 0) > 0 || (quote.total_hours_commercial || 0) > 0 || (quote.cost_steam_vacuum + quote.cost_oven + quote.cost_windows_cleaning) > 0) ? (
                            <>
                                {((quote.total_hours_initial || 0) > 0) && activeInitialRates.length > 0 && (
                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="flex items-center gap-2 text-orange-700"><Sparkles className="w-5 h-5" />Servicios Iniciales</CardTitle>
                                            <CardDescription>Spring Cleaning, One Off, Primera Limpieza</CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            <Select value={selectedInitialRateId} onValueChange={setSelectedInitialRateId}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecciona un tipo de servicio" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {activeInitialRates.map(rate => (
                                                        <SelectItem key={rate.id} value={rate.id}>
                                                            {rate.service_name} (${rate.hourly_rate.toFixed(2)}/hr)
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>

                                            {selectedInitialRate && (() => {
                                                const totalHours = quote.total_hours_initial || 0;
                                                const additionalHours = quote.additional_hours_initial || 0;
                                                const hourlyRate = selectedInitialRate.hourly_rate || 0;

                                                const finalMinValue = totalHours * hourlyRate;
                                                const finalMaxValue = (totalHours + additionalHours) * hourlyRate;
                                                const isSelected = quote.selected_services?.some(s => s.service_name === selectedInitialRate.service_name && s.service_type === selectedInitialRate.service_type);

                                                return (
                                                    <div className="border border-orange-200 bg-orange-50/50 rounded-lg p-4 space-y-3">
                                                        <div className="text-center">
                                                            <h4 className="font-bold text-lg text-orange-800">{selectedInitialRate.service_name}</h4>
                                                            <p className="text-sm text-orange-600">
                                                                ${hourlyRate.toFixed(2)}/hora &times; {totalHours.toFixed(1)} horas
                                                                {additionalHours > 0 && (
                                                                    <span className="block text-xs text-orange-500">
                                                                        + hasta {additionalHours.toFixed(1)} horas adicionales
                                                                    </span>
                                                                )}
                                                            </p>
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-3 text-center">
                                                            <div className="bg-orange-100 p-2 rounded">
                                                                <p className="text-xs text-orange-700">Precio Mín. Final</p>
                                                                <p className="text-xl font-bold text-orange-800">${finalMinValue.toFixed(2)}</p>
                                                            </div>
                                                            <div className="bg-pink-100 p-2 rounded">
                                                                <p className="text-xs text-pink-700">Precio Máx. Final</p>
                                                                <p className="text-xl font-bold text-pink-800">${finalMaxValue.toFixed(2)}</p>
                                                            </div>
                                                        </div>

                                                        {additionalHours > 0 && (
                                                            <p className="text-xs text-center text-gray-500">
                                                                Horas adicionales: +${(additionalHours * hourlyRate).toFixed(2)}
                                                            </p>
                                                        )}

                                                        <Button
                                                            onClick={() => handleToggleService(selectedInitialRate, isSelected, finalMinValue, finalMaxValue)}
                                                            variant={isSelected ? "default" : "outline"}
                                                            className={`w-full h-12 text-base ${isSelected ? 'bg-orange-600 hover:bg-orange-700' : ''}`}
                                                        >
                                                            {isSelected ? 'Deseleccionar Servicio' : 'Seleccionar este Servicio'}
                                                        </Button>
                                                    </div>
                                                );
                                            })()}
                                        </CardContent>
                                    </Card>
                                )}

                                {((quote.total_hours_regular || 0) > 0) && activeRegularRates.length > 0 && (
                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="flex items-center gap-2 text-blue-700"><Sparkles className="w-5 h-5" />Servicios Regulares</CardTitle>
                                            <CardDescription>Selecciona uno o más servicios regulares (Semanal, Quincenal, Cada 3 semanas)</CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            {activeRegularRates.map(rate => {
                                                const totalHours = quote.total_hours_regular || 0;
                                                const additionalHours = quote.additional_hours_regular || 0;
                                                const hourlyRate = rate.hourly_rate || 0;

                                                const finalMinValue = totalHours * hourlyRate;
                                                const finalMaxValue = (totalHours + additionalHours) * hourlyRate;
                                                const isSelected = quote.selected_services?.some(s => s.service_name === rate.service_name && s.service_type === rate.service_type);

                                                return (
                                                    <div key={rate.id} className={`border ${isSelected ? 'border-blue-400 bg-blue-50' : 'border-blue-200 bg-blue-50/50'} rounded-lg p-4 space-y-3`}>
                                                        <div className="text-center">
                                                            <h4 className="font-bold text-lg text-blue-800">{rate.service_name}</h4>
                                                            <p className="text-sm text-blue-600">
                                                                ${hourlyRate.toFixed(2)}/hora &times; {totalHours.toFixed(1)} horas
                                                                {additionalHours > 0 && (
                                                                    <span className="block text-xs text-blue-500">
                                                                        + hasta {additionalHours.toFixed(1)} horas adicionales
                                                                    </span>
                                                                )}
                                                            </p>
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-3 text-center">
                                                            <div className="bg-blue-100 p-2 rounded">
                                                                <p className="text-xs text-blue-700">Precio Mín. Final</p>
                                                                <p className="text-xl font-bold text-blue-800">${finalMinValue.toFixed(2)}</p>
                                                            </div>
                                                            <div className="bg-pink-100 p-2 rounded">
                                                                <p className="text-xs text-pink-700">Precio Máx. Final</p>
                                                                <p className="text-xl font-bold text-pink-800">${finalMaxValue.toFixed(2)}</p>
                                                            </div>
                                                        </div>

                                                        {additionalHours > 0 && (
                                                            <p className="text-xs text-center text-gray-500">
                                                                Horas adicionales: +${(additionalHours * hourlyRate).toFixed(2)}
                                                            </p>
                                                        )}

                                                        <Button
                                                            onClick={() => handleToggleService(rate, isSelected, finalMinValue, finalMaxValue)}
                                                            variant={isSelected ? "default" : "outline"}
                                                            className={`w-full h-12 text-base ${isSelected ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                                                        >
                                                            {isSelected ? 'Deseleccionar' : 'Seleccionar'}
                                                        </Button>
                                                    </div>
                                                );
                                            })}
                                        </CardContent>
                                    </Card>
                                )}

                                {((quote.total_hours_commercial || 0) > 0) && activeCommercialRates.length > 0 && (
                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="flex items-center gap-2 text-purple-700"><Sparkles className="w-5 h-5" />Servicios Comerciales</CardTitle>
                                            <CardDescription>Oficinas, Locales, Negocios</CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            <Select value={selectedCommercialRateId} onValueChange={setSelectedCommercialRateId}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecciona un tipo de servicio" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {activeCommercialRates.map(rate => (
                                                        <SelectItem key={rate.id} value={rate.id}>
                                                            {rate.service_name} (${rate.hourly_rate.toFixed(2)}/hr)
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>

                                            {selectedCommercialRate && (() => {
                                                const totalHours = quote.total_hours_commercial || 0;
                                                const additionalHours = quote.additional_hours_commercial || 0;
                                                const hourlyRate = selectedCommercialRate.hourly_rate || 0;

                                                const finalMinValue = totalHours * hourlyRate;
                                                const finalMaxValue = (totalHours + additionalHours) * hourlyRate;
                                                const isSelected = quote.selected_services?.some(s => s.service_name === selectedCommercialRate.service_name && s.service_type === selectedCommercialRate.service_type);

                                                return (
                                                    <div className="border border-purple-200 bg-purple-50/50 rounded-lg p-4 space-y-3">
                                                        <div className="text-center">
                                                            <h4 className="font-bold text-lg text-purple-800">{selectedCommercialRate.service_name}</h4>
                                                            <p className="text-sm text-purple-600">
                                                                ${hourlyRate.toFixed(2)}/hora &times; {totalHours.toFixed(1)} horas
                                                                {additionalHours > 0 && (
                                                                    <span className="block text-xs text-purple-500">
                                                                        + hasta {additionalHours.toFixed(1)} horas adicionales
                                                                    </span>
                                                                )}
                                                            </p>
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-3 text-center">
                                                            <div className="bg-purple-100 p-2 rounded">
                                                                <p className="text-xs text-purple-700">Precio Mín. Final</p>
                                                                <p className="text-xl font-bold text-purple-800">${finalMinValue.toFixed(2)}</p>
                                                            </div>
                                                            <div className="bg-pink-100 p-2 rounded">
                                                                <p className="text-xs text-pink-700">Precio Máx. Final</p>
                                                                <p className="text-xl font-bold text-pink-800">${finalMaxValue.toFixed(2)}</p>
                                                            </div>
                                                        </div>

                                                        {additionalHours > 0 && (
                                                            <p className="text-xs text-center text-gray-500">
                                                                Horas adicionales: +${(additionalHours * hourlyRate).toFixed(2)}
                                                            </p>
                                                        )}

                                                        <Button
                                                            onClick={() => handleToggleService(selectedCommercialRate, isSelected, finalMinValue, finalMaxValue)}
                                                            variant={isSelected ? "default" : "outline"}
                                                            className={`w-full h-12 text-base ${isSelected ? 'bg-purple-600 hover:bg-purple-700' : ''}`}
                                                        >
                                                            {isSelected ? 'Deseleccionar Servicio' : 'Seleccionar este Servicio'}
                                                        </Button>
                                                    </div>
                                                );
                                            })()}
                                        </CardContent>
                                    </Card>
                                )}

                                <Card className="bg-gray-50">
                                    <CardHeader>
                                        <CardTitle className="text-base">Resumen de la Cotización</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        {quote.selected_services?.length > 0 ? (
                                            <ul className="space-y-2">
                                                {quote.selected_services.map(s => (
                                                    <li key={`${s.service_name}-${s.service_type}`} className="flex justify-between items-center text-sm border-b pb-2">
                                                        <span className="font-medium">{s.service_name} <Badge variant="secondary" className="ml-1">{s.service_type === 'initial' ? 'Inicial' : s.service_type === 'regular' ? 'Regular' : 'Comercial'}</Badge></span>
                                                        <span className="font-mono">${s.price_min.toFixed(2)} - ${s.price_max.toFixed(2)}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p className="text-sm text-gray-500 text-center py-4">Selecciona uno o más servicios para ver el resumen.</p>
                                        )}

                                        {(quote.cost_steam_vacuum > 0 || quote.cost_oven > 0 || quote.cost_windows_cleaning > 0) && (
                                            <div className="text-sm space-y-1 border-t pt-4">
                                                <p className="font-semibold mb-2">Costos Adicionales:</p>
                                                {(quote.cost_steam_vacuum || 0) > 0 && <div className="flex justify-between"><span>Steam Vacuum:</span><span className="font-medium">+ ${(quote.cost_steam_vacuum).toFixed(2)}</span></div>}
                                                {(quote.cost_oven || 0) > 0 && <div className="flex justify-between"><span>Horno:</span><span className="font-medium">+ ${(quote.cost_oven).toFixed(2)}</span></div>}
                                                {(quote.cost_windows_cleaning || 0) > 0 && <div className="flex justify-between"><span>Windows:</span><span className="font-medium">+ ${(quote.cost_windows_cleaning).toFixed(2)}</span></div>}
                                            </div>
                                        )}

                                        <div className="border-t pt-4 space-y-3">
                                            {(() => {
                                                const selectedInitialServices = quote.selected_services?.filter(s => s.service_type === 'initial') || [];
                                                const selectedRegularServices = quote.selected_services?.filter(s => s.service_type === 'regular') || [];
                                                const selectedCommercialServices = quote.selected_services?.filter(s => s.service_type === 'commercial') || [];

                                                const hasInitial = selectedInitialServices.length > 0;
                                                const hasRegular = selectedRegularServices.length > 0;
                                                const hasCommercial = selectedCommercialServices.length > 0;

                                                const additionalCosts = (quote.cost_steam_vacuum || 0) + (quote.cost_oven || 0) + (quote.cost_windows_cleaning || 0);

                                                const initialMin = selectedInitialServices.reduce((sum, s) => sum + s.price_min, 0);
                                                const initialMax = selectedInitialServices.reduce((sum, s) => sum + s.price_max, 0);
                                                const regularMin = selectedRegularServices.reduce((sum, s) => sum + s.price_min, 0);
                                                const regularMax = selectedRegularServices.reduce((sum, s) => sum + s.price_max, 0);
                                                const commercialMin = selectedCommercialServices.reduce((sum, s) => sum + s.price_min, 0);
                                                const commercialMax = selectedCommercialServices.reduce((sum, s) => sum + s.price_max, 0);

                                                return (
                                                    <>
                                                        {hasInitial && (
                                                            <div className="flex justify-between items-center p-3 bg-orange-50 rounded-lg">
                                                                <span className="font-bold text-orange-800">Total Inicial (con adicionales):</span>
                                                                <span className="font-bold text-orange-800 text-lg">
                                                                    ${(initialMin + additionalCosts).toFixed(2)} - ${(initialMax + additionalCosts).toFixed(2)}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {hasRegular && (
                                                            <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                                                                <span className="font-bold text-blue-800">Total Regular:</span>
                                                                <span className="font-bold text-blue-800 text-lg">
                                                                    ${regularMin.toFixed(2)} - ${regularMax.toFixed(2)}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {hasCommercial && (
                                                            <div className="flex justify-between items-center p-3 bg-purple-50 rounded-lg">
                                                                <span className="font-bold text-purple-800">Total Comercial:</span>
                                                                <span className="font-bold text-purple-800 text-lg">
                                                                    ${commercialMin.toFixed(2)} - ${commercialMax.toFixed(2)}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </>
                                                )
                                            })()}
                                        </div>
                                    </CardContent>
                                </Card>

                            </>
                        ) : (
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-green-700"><Sparkles className="w-5 h-5" />Cotización por Servicio</CardTitle>
                                    <CardDescription>Selecciona el servicio que el cliente ha escogido.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="text-center py-8 text-gray-500">
                                        <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                        {(activeInitialRates.length === 0 && activeRegularRates.length === 0 && activeCommercialRates.length === 0) ? (
                                            <>
                                                <p className="font-medium">No hay tarifas de servicios configuradas</p>
                                                <p className="text-sm">Ve a Configuración para añadir tarifas</p>
                                                <Link to={createPageUrl('Configuracion')} className="mt-3 inline-block">
                                                    <Button variant="outline" size="sm">Ir a Configuración</Button>
                                                </Link>
                                            </>
                                        ) : (
                                            <>
                                                <p className="font-medium">Ingresa las horas o servicios</p>
                                                <p className="text-sm">Los precios se calcularán automáticamente</p>
                                            </>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            </div>

            {canModifyClients && (
                <Dialog open={isClientFormOpen} onOpenChange={(open) => {
                    if (!open) {
                        setIsClientFormOpen(false);
                        setEditingClient(null);
                    } else {
                        setIsClientFormOpen(true);
                    }
                }}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{editingClient ? 'Editar Cliente' : 'Crear Nuevo Cliente'}</DialogTitle>
                        </DialogHeader>
                        <ClientForm 
                            client={editingClient} 
                            onSubmit={handleClientFormSubmit} 
                            onCancel={() => {
                                setIsClientFormOpen(false);
                                setEditingClient(null);
                            }} 
                        />
                    </DialogContent>
                </Dialog>
            )}

            <Dialog open={showCriticalErrorDialog} onOpenChange={setShowCriticalErrorDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{criticalErrorTitle}</DialogTitle>
                        <DialogDescription>{criticalErrorMessage}</DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end space-x-2">
                        <Button onClick={() => {
                            setShowCriticalErrorDialog(false);
                            navigate(createPageUrl('Cotizaciones'));
                        }}>
                            Entendido
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}