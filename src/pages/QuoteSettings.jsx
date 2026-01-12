import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Edit, Trash2, Save, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

export default function QuoteSettingsPage() {
    const navigate = useNavigate();
    const [serviceRates, setServiceRates] = useState([]);
    const [systemSettings, setSystemSettings] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [editingRate, setEditingRate] = useState(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    const [rateForm, setRateForm] = useState({
        service_name: '',
        service_type: 'initial',
        hourly_rate: '',
        description: '',
        is_active: true
    });

    const [steamVacuumPrice, setSteamVacuumPrice] = useState('0');
    const [termsAndConditions, setTermsAndConditions] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [ratesData, settingsData] = await Promise.all([
                base44.entities.ServiceRate.list(),
                base44.entities.SystemSetting.list()
            ]);
            
            setServiceRates(ratesData);
            
            if (settingsData.length > 0) {
                setSystemSettings(settingsData[0]);
                setSteamVacuumPrice(settingsData[0].price_per_room_steam_vacuum?.toString() || '0');
                setTermsAndConditions(settingsData[0].terms_and_conditions || '');
            } else {
                const newSettings = await base44.entities.SystemSetting.create({
                    setting_name: 'quote_calculator',
                    price_per_room_steam_vacuum: 0,
                    terms_and_conditions: ''
                });
                setSystemSettings(newSettings);
                setSteamVacuumPrice('0');
                setTermsAndConditions('');
            }
        } catch (error) {
            console.error("Error loading data:", error);
            toast.error("Error al cargar la configuración.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpenDialog = (rate = null) => {
        if (rate) {
            setEditingRate(rate);
            setRateForm({
                service_name: rate.service_name,
                service_type: rate.service_type,
                hourly_rate: rate.hourly_rate.toString(),
                description: rate.description || '',
                is_active: rate.is_active
            });
        } else {
            setEditingRate(null);
            setRateForm({
                service_name: '',
                service_type: 'initial',
                hourly_rate: '',
                description: '',
                is_active: true
            });
        }
        setIsDialogOpen(true);
    };

    const handleSaveRate = async () => {
        if (!rateForm.service_name || !rateForm.hourly_rate) {
            toast.error("Por favor completa todos los campos requeridos.");
            return;
        }

        try {
            const data = {
                service_name: rateForm.service_name,
                service_type: rateForm.service_type,
                hourly_rate: parseFloat(rateForm.hourly_rate),
                description: rateForm.description,
                is_active: rateForm.is_active
            };

            if (editingRate) {
                await base44.entities.ServiceRate.update(editingRate.id, data);
                toast.success("Tarifa actualizada con éxito.");
            } else {
                await base44.entities.ServiceRate.create(data);
                toast.success("Tarifa creada con éxito.");
            }

            setIsDialogOpen(false);
            loadData();
        } catch (error) {
            console.error("Error saving rate:", error);
            toast.error("Error al guardar la tarifa.");
        }
    };

    const handleDeleteRate = async (rateId) => {
        try {
            await base44.entities.ServiceRate.delete(rateId);
            toast.success("Tarifa eliminada con éxito.");
            loadData();
        } catch (error) {
            console.error("Error deleting rate:", error);
            toast.error("Error al eliminar la tarifa.");
        }
    };

    const handleSaveSteamVacuumPrice = async () => {
        if (!systemSettings) return;

        try {
            await base44.entities.SystemSetting.update(systemSettings.id, {
                price_per_room_steam_vacuum: parseFloat(steamVacuumPrice) || 0
            });
            toast.success("Precio de Steam Vacuum actualizado.");
            loadData();
        } catch (error) {
            console.error("Error updating steam vacuum price:", error);
            toast.error("Error al actualizar el precio.");
        }
    };

    const handleSaveTermsAndConditions = async () => {
        if (!systemSettings) return;

        try {
            await base44.entities.SystemSetting.update(systemSettings.id, {
                terms_and_conditions: termsAndConditions
            });
            toast.success("Políticas actualizadas exitosamente.");
            loadData();
        } catch (error) {
            console.error("Error updating terms:", error);
            toast.error("Error al actualizar las políticas.");
        }
    };

    const serviceTypeLabels = {
        initial: 'Inicial (Spring Cleaning, One-Off)',
        regular: 'Regular (Semanal, Quincenal)',
        commercial: 'Comercial (Oficinas, Negocios)'
    };

    const ratesByType = {
        initial: serviceRates.filter(r => r.service_type === 'initial'),
        regular: serviceRates.filter(r => r.service_type === 'regular'),
        commercial: serviceRates.filter(r => r.service_type === 'commercial')
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p className="text-gray-600">Cargando configuración...</p>
            </div>
        );
    }

    return (
        <>
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 p-6 md:p-8">
                <div className="max-w-6xl mx-auto space-y-6">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg">
                                    <Settings className="w-8 h-8 text-white" />
                                </div>
                                <div>
                                    <h1 className="text-3xl font-bold text-slate-900">Configuración de Cotizaciones</h1>
                                    <p className="text-slate-600 mt-1">Gestiona tarifas de servicio y precios</p>
                                </div>
                            </div>
                            <Button variant="outline" onClick={() => navigate(createPageUrl('Cotizaciones'))}>
                                <ArrowLeft className="w-4 h-4 mr-2" /> Volver
                            </Button>
                        </div>
                    </div>

                    <Tabs defaultValue="rates" className="w-full">
                        <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="rates">Tarifas de Servicio</TabsTrigger>
                            <TabsTrigger value="extras">Servicios Adicionales</TabsTrigger>
                            <TabsTrigger value="policies">Políticas y Términos</TabsTrigger>
                        </TabsList>

                        <TabsContent value="rates" className="space-y-6">
                            <Card>
                                <CardHeader>
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <CardTitle>Tarifas de Servicio</CardTitle>
                                            <CardDescription>Configura las tarifas por hora para cada tipo de servicio</CardDescription>
                                        </div>
                                        <Button onClick={() => handleOpenDialog()}>
                                            <Plus className="w-4 h-4 mr-2" /> Nueva Tarifa
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    {['initial', 'regular', 'commercial'].map(type => (
                                        <div key={type} className="space-y-3">
                                            <h3 className="font-semibold text-lg text-slate-800">{serviceTypeLabels[type]}</h3>
                                            {ratesByType[type].length > 0 ? (
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>Nombre del Servicio</TableHead>
                                                            <TableHead>Tarifa por Hora</TableHead>
                                                            <TableHead>Estado</TableHead>
                                                            <TableHead className="text-right">Acciones</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {ratesByType[type].map(rate => (
                                                            <TableRow key={rate.id}>
                                                                <TableCell>
                                                                    <div>
                                                                        <p className="font-medium">{rate.service_name}</p>
                                                                        {rate.description && (
                                                                            <p className="text-xs text-gray-500">{rate.description}</p>
                                                                        )}
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell className="font-semibold text-green-700">
                                                                    ${rate.hourly_rate.toFixed(2)}/hora
                                                                </TableCell>
                                                                <TableCell>
                                                                    <Badge variant={rate.is_active ? "default" : "secondary"}>
                                                                        {rate.is_active ? 'Activo' : 'Inactivo'}
                                                                    </Badge>
                                                                </TableCell>
                                                                <TableCell className="text-right">
                                                                    <div className="flex gap-1 justify-end">
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            onClick={() => handleOpenDialog(rate)}
                                                                        >
                                                                            <Edit className="w-4 h-4" />
                                                                        </Button>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            onClick={() => handleDeleteRate(rate.id)}
                                                                            className="text-red-500 hover:bg-red-50"
                                                                        >
                                                                            <Trash2 className="w-4 h-4" />
                                                                        </Button>
                                                                    </div>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            ) : (
                                                <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed">
                                                    <p className="text-gray-500">No hay tarifas configuradas para este tipo de servicio.</p>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="extras" className="space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Servicios Adicionales</CardTitle>
                                    <CardDescription>Configura precios para servicios extra</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex items-end gap-3">
                                        <div className="flex-1 space-y-1">
                                            <Label>Precio por Habitación - Steam Vacuum</Label>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                placeholder="0.00"
                                                value={steamVacuumPrice}
                                                onChange={(e) => setSteamVacuumPrice(e.target.value)}
                                            />
                                            <p className="text-xs text-gray-500">Precio que se cobra por cada habitación de steam vacuum</p>
                                        </div>
                                        <Button onClick={handleSaveSteamVacuumPrice}>
                                            <Save className="w-4 h-4 mr-2" /> Guardar
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="policies" className="space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Políticas y Términos</CardTitle>
                                    <CardDescription>Configura los términos y condiciones que aparecerán en los PDFs de las cotizaciones</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>Términos y Condiciones</Label>
                                        <Textarea
                                            value={termsAndConditions}
                                            onChange={(e) => setTermsAndConditions(e.target.value)}
                                            placeholder="Ingresa aquí los términos y condiciones que se mostrarán en el PDF de la cotización..."
                                            rows={20}
                                            className="font-mono text-sm"
                                        />
                                        <p className="text-xs text-gray-500">
                                            Este texto aparecerá en la sección "Terms and Conditions" del PDF de cotización.
                                            Puedes usar saltos de línea para organizar el contenido.
                                        </p>
                                    </div>
                                    <div className="flex justify-end">
                                        <Button onClick={handleSaveTermsAndConditions}>
                                            <Save className="w-4 h-4 mr-2" /> Guardar Políticas
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editingRate ? 'Editar Tarifa' : 'Nueva Tarifa'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <Label>Nombre del Servicio*</Label>
                            <Input
                                placeholder="Ej: Spring Cleaning Standard"
                                value={rateForm.service_name}
                                onChange={(e) => setRateForm(prev => ({ ...prev, service_name: e.target.value }))}
                            />
                        </div>

                        <div className="space-y-1">
                            <Label>Tipo de Servicio*</Label>
                            <Select
                                value={rateForm.service_type}
                                onValueChange={(value) => setRateForm(prev => ({ ...prev, service_type: value }))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="initial">Inicial (Spring Cleaning, One-Off)</SelectItem>
                                    <SelectItem value="regular">Regular (Semanal, Quincenal)</SelectItem>
                                    <SelectItem value="commercial">Comercial (Oficinas)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1">
                            <Label>Tarifa por Hora (AUD)*</Label>
                            <Input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="0.00"
                                value={rateForm.hourly_rate}
                                onChange={(e) => setRateForm(prev => ({ ...prev, hourly_rate: e.target.value }))}
                            />
                        </div>

                        <div className="space-y-1">
                            <Label>Descripción (opcional)</Label>
                            <Input
                                placeholder="Detalles adicionales..."
                                value={rateForm.description}
                                onChange={(e) => setRateForm(prev => ({ ...prev, description: e.target.value }))}
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="is_active"
                                checked={rateForm.is_active}
                                onChange={(e) => setRateForm(prev => ({ ...prev, is_active: e.target.checked }))}
                                className="w-4 h-4"
                            />
                            <Label htmlFor="is_active" className="cursor-pointer">Tarifa activa</Label>
                        </div>

                        <div className="flex justify-end gap-2 pt-4">
                            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                                Cancelar
                            </Button>
                            <Button onClick={handleSaveRate}>
                                <Save className="w-4 h-4 mr-2" /> Guardar
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}