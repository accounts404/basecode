import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Save, Loader2 } from 'lucide-react';
import PhotoUploader from '../horario/PhotoUploader';
import ServicePriceManager from './ServicePriceManager';
import FamilyAndPetsManager from './FamilyAndPetsManager';
import ClientHistory from './ClientHistory';
import StructuredServiceNotes from './StructuredServiceNotes';
import AddressAutocomplete from './AddressAutocomplete';

export default function ClientForm({ client, onSave, onCancel }) {
    const [saving, setSaving] = useState(false);
    
    const [formData, setFormData] = useState({
        name: '',
        sms_name: '',
        client_type: 'domestic',
        mobile_number: '',
        secondary_mobile_number: '',
        address: '',
        email: '',
        active: true,
        service_frequency: 'weekly',
        current_service_price: '',
        service_hours: '',
        gst_type: 'inclusive',
        pets: [],
        family_details: {
            spouse_name: '',
            children: [],
            family_notes: '',
            emergency_contact: ''
        },
        has_access: false,
        access_type: '',
        access_identifier: '',
        access_instructions: '',
        access_photos: [],
        default_service_notes: '',
        default_photo_urls: [],
        structured_service_notes: {},
        price_history: [],
        windows_cleaning_services: [],
        steam_vacuum_services: []
    });

    useEffect(() => {
        if (client) {
            setFormData({
                name: client.name || '',
                sms_name: client.sms_name || '',
                client_type: client.client_type || 'domestic',
                mobile_number: client.mobile_number || '',
                secondary_mobile_number: client.secondary_mobile_number || '',
                address: client.address || '',
                email: client.email || '',
                active: client.active !== undefined ? client.active : true,
                service_frequency: client.service_frequency || 'weekly',
                current_service_price: client.current_service_price || '',
                service_hours: client.service_hours || '',
                gst_type: client.gst_type || 'inclusive',
                pets: client.pets || [],
                family_details: client.family_details || {
                    spouse_name: '',
                    children: [],
                    family_notes: '',
                    emergency_contact: ''
                },
                has_access: client.has_access || false,
                access_type: client.access_type || '',
                access_identifier: client.access_identifier || '',
                access_instructions: client.access_instructions || '',
                access_photos: client.access_photos || [],
                default_service_notes: client.default_service_notes || '',
                default_photo_urls: client.default_photo_urls || [],
                structured_service_notes: client.structured_service_notes || {},
                price_history: client.price_history || [],
                windows_cleaning_services: client.windows_cleaning_services || [],
                steam_vacuum_services: client.steam_vacuum_services || []
            });
        }
    }, [client]);

    const handleStructuredNotesUpdate = (updatedNotes) => {
        console.log('[ClientForm] Actualizando notas estructuradas:', updatedNotes);
        setFormData(prevData => ({
            ...prevData,
            structured_service_notes: updatedNotes
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await onSave(formData);
        } catch (error) {
            console.error('Error guardando cliente:', error);
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <Tabs defaultValue="basic" className="space-y-4">
                <TabsList className="grid w-full grid-cols-5">
                    <TabsTrigger value="basic">Información Básica</TabsTrigger>
                    <TabsTrigger value="service">Servicio</TabsTrigger>
                    <TabsTrigger value="service_notes">Notas de Servicio</TabsTrigger>
                    <TabsTrigger value="family_pets">Familia y Mascotas</TabsTrigger>
                    <TabsTrigger value="access">Acceso</TabsTrigger>
                </TabsList>

                <TabsContent value="basic" className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="name">Nombre</Label>
                            <Input 
                                id="name" 
                                value={formData.name} 
                                onChange={(e) => setFormData({...formData, name: e.target.value})} 
                                required 
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="sms_name">Nombre para SMS</Label>
                            <Input 
                                id="sms_name" 
                                value={formData.sms_name} 
                                onChange={(e) => setFormData({...formData, sms_name: e.target.value})} 
                                placeholder="Nombre corto para mensajes (opcional)"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="client_type">Tipo de Cliente</Label>
                            <Select value={formData.client_type} onValueChange={(value) => setFormData({...formData, client_type: value})}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar tipo..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="domestic">Doméstico</SelectItem>
                                    <SelectItem value="commercial">Comercial</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="address">Dirección</Label>
                            <Input 
                                id="address" 
                                value={formData.address} 
                                onChange={(e) => setFormData({...formData, address: e.target.value})} 
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input 
                                id="email" 
                                type="email" 
                                value={formData.email} 
                                onChange={(e) => setFormData({...formData, email: e.target.value})} 
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="mobile_number">Teléfono Principal</Label>
                            <Input 
                                id="mobile_number" 
                                value={formData.mobile_number} 
                                onChange={(e) => setFormData({...formData, mobile_number: e.target.value})} 
                                placeholder="ej: 0412345678"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="secondary_mobile_number">Teléfono Secundario</Label>
                            <Input 
                                id="secondary_mobile_number" 
                                value={formData.secondary_mobile_number} 
                                onChange={(e) => setFormData({...formData, secondary_mobile_number: e.target.value})} 
                                placeholder="ej: 0498765432 (opcional)"
                            />
                        </div>
                        <div className="flex items-center space-x-2 self-end pb-2">
                            <Checkbox 
                                id="active" 
                                checked={formData.active} 
                                onCheckedChange={(checked) => setFormData({...formData, active: checked})}
                            />
                            <Label htmlFor="active">Cliente Activo</Label>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="service" className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="service_frequency">Frecuencia de Servicio</Label>
                            <Select value={formData.service_frequency} onValueChange={(value) => setFormData({...formData, service_frequency: value})}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar frecuencia..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="one_off">Servicio Único</SelectItem>
                                    <SelectItem value="weekly">Semanal</SelectItem>
                                    <SelectItem value="fortnightly">Quincenal</SelectItem>
                                    <SelectItem value="every_3_weeks">Cada 3 semanas</SelectItem>
                                    <SelectItem value="monthly">Mensual</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="gst_type">Tipo de GST</Label>
                            <Select value={formData.gst_type} onValueChange={(value) => setFormData({...formData, gst_type: value})}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar GST..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="inclusive">GST Incluido</SelectItem>
                                    <SelectItem value="exclusive">GST Adicional</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="current_service_price">Precio del Servicio</Label>
                            <Input 
                                id="current_service_price" 
                                type="number" 
                                step="0.01"
                                value={formData.current_service_price} 
                                onChange={(e) => setFormData({...formData, current_service_price: parseFloat(e.target.value) || 0})} 
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="service_hours">Horas del Servicio</Label>
                            <Input 
                                id="service_hours" 
                                type="number" 
                                step="0.25"
                                value={formData.service_hours} 
                                onChange={(e) => setFormData({...formData, service_hours: parseFloat(e.target.value) || 0})} 
                            />
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="service_notes" className="space-y-6">
                    <div className="space-y-6">
                        <div>
                            <Label htmlFor="default_service_notes" className="text-base font-semibold">
                                Notas Generales del Servicio
                            </Label>
                            <p className="text-sm text-slate-600 mb-3">
                                Estas notas aparecerán en todos los servicios de este cliente automáticamente.
                            </p>
                            <Textarea
                                id="default_service_notes"
                                value={formData.default_service_notes}
                                onChange={(e) => setFormData({...formData, default_service_notes: e.target.value})}
                                placeholder="Ej: Usar productos sin químicos, evitar hacer ruido después de las 8PM, llave está bajo la maceta..."
                                rows={4}
                            />
                        </div>

                        <Separator />

                        <div>
                            <StructuredServiceNotes
                                structuredNotes={formData.structured_service_notes}
                                onUpdate={handleStructuredNotesUpdate}
                                isReadOnly={false}
                            />
                        </div>

                        <Separator />

                        <div>
                            <Label className="text-base font-semibold">Fotos por Defecto del Cliente</Label>
                            <p className="text-sm text-slate-600 mb-3">
                                Estas fotos se copiarán automáticamente a todos los nuevos servicios de este cliente.
                            </p>
                            <PhotoUploader
                                uploadedUrls={formData.default_photo_urls}
                                onUrlsChange={(urls) => setFormData({...formData, default_photo_urls: urls})}
                            />
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="family_pets" className="space-y-6">
                    <FamilyAndPetsManager
                        client={formData}
                        onUpdate={(updates) => setFormData(prev => ({ ...prev, ...updates }))}
                    />
                </TabsContent>

                <TabsContent value="access" className="space-y-6">
                    <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-lg space-y-4">
                        <h3 className="font-semibold text-amber-900">Gestión de Acceso</h3>
                        <div className="flex items-center space-x-2">
                            <Checkbox 
                                id="has_access" 
                                checked={formData.has_access} 
                                onCheckedChange={(checked) => setFormData({...formData, has_access: checked})}
                            />
                            <Label htmlFor="has_access">La empresa gestiona el acceso a esta propiedad</Label>
                        </div>
                        {formData.has_access && (
                            <div className="space-y-4 pl-6 pt-2">
                                <div className="space-y-2">
                                    <Label htmlFor="access_type">Tipo de Acceso</Label>
                                    <Select value={formData.access_type} onValueChange={(value) => setFormData({...formData, access_type: value})}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Seleccionar tipo de acceso..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="key">Llave Física</SelectItem>
                                            <SelectItem value="smart_lock">Cerradura Inteligente</SelectItem>
                                            <SelectItem value="lockbox">Caja de Seguridad</SelectItem>
                                            <SelectItem value="other">Otro</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="access_identifier">Identificador de Acceso</Label>
                                    <Input 
                                        id="access_identifier" 
                                        value={formData.access_identifier} 
                                        onChange={(e) => setFormData({...formData, access_identifier: e.target.value})}
                                        placeholder="Ej: K15, Código: 1234#"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="access_instructions">Instrucciones de Acceso</Label>
                                    <Textarea
                                        id="access_instructions" 
                                        value={formData.access_instructions} 
                                        onChange={(e) => setFormData({...formData, access_instructions: e.target.value})}
                                        placeholder="Instrucciones detalladas..."
                                        rows={3}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Fotos de Ayuda para el Acceso</Label>
                                    <PhotoUploader
                                        uploadedUrls={formData.access_photos}
                                        onUrlsChange={(urls) => setFormData({...formData, access_photos: urls})}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </TabsContent>
            </Tabs>

            <div className="flex justify-between pt-6">
                <Button type="button" variant="outline" onClick={onCancel}>
                    Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                    {saving ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Guardando...
                        </>
                    ) : (
                        <>
                            <Save className="w-4 h-4 mr-2" />
                            {client ? 'Actualizar Cliente' : 'Crear Cliente'}
                        </>
                    )}
                </Button>
            </div>
        </form>
    );
}