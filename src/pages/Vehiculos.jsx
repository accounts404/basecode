import React, { useState, useEffect } from 'react';
import { Vehicle } from '@/entities/Vehicle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Car, Plus, Edit, Trash2 } from 'lucide-react';
import PhotoUploader from '../components/horario/PhotoUploader';

export default function VehiculosPage() {
    const [vehicles, setVehicles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingVehicle, setEditingVehicle] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');

    const [formData, setFormData] = useState({
        make: '',
        model: '',
        year: new Date().getFullYear(),
        license_plate: '',
        color: '',
        status: 'active',
        photos: []
    });

    useEffect(() => {
        loadVehicles();
    }, []);

    const loadVehicles = async () => {
        try {
            const data = await Vehicle.list('-created_date');
            setVehicles(data);
        } catch (error) {
            console.error('Error loading vehicles:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        try {
            const processedFormData = {
                ...formData,
                year: formData.year ? parseInt(formData.year) : new Date().getFullYear(),
            };

            if (editingVehicle) {
                await Vehicle.update(editingVehicle.id, processedFormData);
            } else {
                await Vehicle.create(processedFormData);
            }
            loadVehicles();
            handleCloseForm();
        } catch (error) {
            console.error('Error saving vehicle:', error);
            alert('Error al guardar el vehículo. Verifique los datos e intente de nuevo.');
        }
    };

    const handleDelete = async (id) => {
        if (confirm('¿Estás seguro de que deseas eliminar este vehículo?')) {
            try {
                await Vehicle.delete(id);
                loadVehicles();
            } catch (error) {
                console.error('Error deleting vehicle:', error);
                alert('Error al eliminar el vehículo');
            }
        }
    };

    const handleEdit = (vehicle) => {
        setEditingVehicle(vehicle);
        setFormData({
            make: vehicle.make || '',
            model: vehicle.model || '',
            year: vehicle.year || new Date().getFullYear(),
            license_plate: vehicle.license_plate || '',
            color: vehicle.color || '',
            status: vehicle.status || 'active',
            photos: vehicle.photos || []
        });
        setShowForm(true);
    };

    const handleCloseForm = () => {
        setShowForm(false);
        setEditingVehicle(null);
        setFormData({
            make: '',
            model: '',
            year: new Date().getFullYear(),
            license_plate: '',
            color: '',
            status: 'active',
            photos: []
        });
    };

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

    const filteredVehicles = vehicles.filter(vehicle => {
        const matchesSearch = !searchTerm || 
            vehicle.make?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            vehicle.model?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            vehicle.license_plate?.toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesStatus = filterStatus === 'all' || vehicle.status === filterStatus;
        
        return matchesSearch && matchesStatus;
    });

    if (loading) {
        return (
            <div className="p-6 max-w-7xl mx-auto">
                <div className="text-center">Cargando vehículos...</div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Gestión de Vehículos</h1>
                    <p className="text-gray-600">Administra la flota de vehículos de la empresa</p>
                </div>
                <Button onClick={() => setShowForm(true)} className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Nuevo Vehículo
                </Button>
            </div>

            {/* Filtros y Búsqueda */}
            <div className="flex gap-4 mb-6">
                <div className="flex-1">
                    <Input
                        placeholder="Buscar por marca, modelo o matrícula..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-48">
                        <SelectValue placeholder="Filtrar por estado" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos los Estados</SelectItem>
                        <SelectItem value="active">Activos</SelectItem>
                        <SelectItem value="maintenance">Mantenimiento</SelectItem>
                        <SelectItem value="out_of_service">Fuera de Servicio</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Lista de Vehículos */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredVehicles.map(vehicle => {
                    return (
                        <Card key={vehicle.id} className="hover:shadow-lg transition-shadow">
                            <CardHeader>
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-3">
                                        {vehicle.photos && vehicle.photos.length > 0 ? (
                                            <img src={vehicle.photos[0].url} alt={`${vehicle.make} ${vehicle.model}`} className="w-16 h-16 object-cover rounded-lg"/>
                                        ) : (
                                            <div className="p-2 bg-blue-100 rounded-lg">
                                                <Car className="w-8 h-8 text-blue-600" />
                                            </div>
                                        )}
                                        <div>
                                            <CardTitle className="text-lg">
                                                {vehicle.make} {vehicle.model} ({vehicle.year})
                                            </CardTitle>
                                            <p className="text-sm text-gray-600 font-mono">
                                                {vehicle.license_plate}
                                            </p>
                                        </div>
                                    </div>
                                    <Badge className={getStatusColor(vehicle.status)}>
                                        {getStatusLabel(vehicle.status)}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    <div className="flex flex-wrap gap-4 text-sm">
                                        {vehicle.color && (
                                            <div>
                                                <span className="text-gray-500">Color:</span>
                                                <p className="font-medium">{vehicle.color}</p>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex gap-2 mt-4">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleEdit(vehicle)}
                                            className="flex-1"
                                        >
                                            <Edit className="w-3 h-3 mr-1" />
                                            Editar
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleDelete(vehicle.id)}
                                            className="text-red-600 hover:text-red-700"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {filteredVehicles.length === 0 && (
                <div className="text-center py-12">
                    <Car className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No hay vehículos</h3>
                    <p className="text-gray-500 mb-4">
                        {searchTerm || filterStatus !== 'all' 
                            ? 'No se encontraron vehículos con los filtros aplicados'
                            : 'Aún no se han registrado vehículos'
                        }
                    </p>
                </div>
            )}

            {/* Formulario de Vehículo */}
            <Dialog open={showForm} onOpenChange={setShowForm}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {editingVehicle ? 'Editar Vehículo' : 'Nuevo Vehículo'}
                        </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSave} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="make">Marca *</Label>
                                <Input
                                    id="make"
                                    value={formData.make}
                                    onChange={(e) => setFormData({...formData, make: e.target.value})}
                                    placeholder="Ej: Toyota"
                                    required
                                />
                            </div>
                            <div>
                                <Label htmlFor="model">Modelo *</Label>
                                <Input
                                    id="model"
                                    value={formData.model}
                                    onChange={(e) => setFormData({...formData, model: e.target.value})}
                                    placeholder="Ej: RAV4"
                                    required
                                />
                            </div>
                            <div>
                                <Label htmlFor="year">Año</Label>
                                <Input
                                    id="year"
                                    type="number"
                                    value={formData.year}
                                    onChange={(e) => setFormData({...formData, year: e.target.value})}
                                    min="1900"
                                    max={new Date().getFullYear() + 1}
                                />
                            </div>
                            <div>
                                <Label htmlFor="license_plate">Matrícula/Placa *</Label>
                                <Input
                                    id="license_plate"
                                    value={formData.license_plate}
                                    onChange={(e) => setFormData({...formData, license_plate: e.target.value.toUpperCase()})}
                                    placeholder="ABC123"
                                    required
                                />
                            </div>
                            <div>
                                <Label htmlFor="color">Color</Label>
                                <Input
                                    id="color"
                                    value={formData.color}
                                    onChange={(e) => setFormData({...formData, color: e.target.value})}
                                    placeholder="Ej: Blanco, Negro, Azul"
                                />
                            </div>
                            <div>
                                <Label htmlFor="status">Estado</Label>
                                <Select value={formData.status} onValueChange={(value) => setFormData({...formData, status: value})}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="active">Activo</SelectItem>
                                        <SelectItem value="maintenance">Mantenimiento</SelectItem>
                                        <SelectItem value="out_of_service">Fuera de Servicio</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        
                        <div>
                            <Label>Fotos del Vehículo</Label>
                            <PhotoUploader
                                uploadedUrls={formData.photos}
                                onUrlsChange={(photos) => setFormData({...formData, photos})}
                            />
                        </div>

                        <div className="flex justify-end gap-4">
                            <Button type="button" variant="outline" onClick={handleCloseForm}>
                                Cancelar
                            </Button>
                            <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                                {editingVehicle ? 'Actualizar Vehículo' : 'Crear Vehículo'}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}