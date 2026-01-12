import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, Loader2 } from 'lucide-react';

export default function QuickClientForm({ quote, onSave, onCancel }) {
    const [saving, setSaving] = useState(false);
    
    const [formData, setFormData] = useState({
        name: quote.client_name || '',
        mobile_number: quote.client_phone || '',
        address: quote.service_address || '',
        email: quote.client_email || '',
        active: true,
        client_type: 'domestic',
        service_frequency: quote.service_frequency || 'weekly',
        property_type: quote.property_type || '',
        property_stories: quote.property_stories || '',
        num_bedrooms: quote.num_bedrooms || '',
        num_bathrooms: quote.num_bathrooms || '',
        gst_type: 'inclusive'
    });

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
            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg">
                <p className="text-sm text-blue-900">
                    Complete la información básica del cliente. Podrá agregar más detalles después desde la página de Clientes.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <Label htmlFor="name">Nombre *</Label>
                    <Input 
                        id="name" 
                        value={formData.name} 
                        onChange={(e) => setFormData({...formData, name: e.target.value})} 
                        required 
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

                <div className="space-y-2 md:col-span-2">
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
                    <Label htmlFor="property_type">Tipo de Propiedad</Label>
                    <Select value={formData.property_type} onValueChange={(value) => setFormData({...formData, property_type: value})}>
                        <SelectTrigger>
                            <SelectValue placeholder="Seleccionar tipo..." />
                        </SelectTrigger>
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
                    <Select value={formData.property_stories} onValueChange={(value) => setFormData({...formData, property_stories: value})}>
                        <SelectTrigger>
                            <SelectValue placeholder="Seleccionar..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="single_storey">Una Planta</SelectItem>
                            <SelectItem value="double_storey">Dos Plantas</SelectItem>
                            <SelectItem value="triple_storey">Tres Plantas</SelectItem>
                            <SelectItem value="other">Otro</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="num_bedrooms">Habitaciones</Label>
                    <Input 
                        id="num_bedrooms" 
                        type="number" 
                        value={formData.num_bedrooms} 
                        onChange={(e) => setFormData({...formData, num_bedrooms: parseInt(e.target.value) || ''})} 
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="num_bathrooms">Baños</Label>
                    <Input 
                        id="num_bathrooms" 
                        type="number" 
                        step="0.5"
                        value={formData.num_bathrooms} 
                        onChange={(e) => setFormData({...formData, num_bathrooms: parseFloat(e.target.value) || ''})} 
                    />
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
            </div>

            <div className="flex justify-between pt-6">
                <Button type="button" variant="outline" onClick={onCancel}>
                    Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                    {saving ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Creando Cliente...
                        </>
                    ) : (
                        <>
                            <Save className="w-4 h-4 mr-2" />
                            Crear Cliente
                        </>
                    )}
                </Button>
            </div>
        </form>
    );
}