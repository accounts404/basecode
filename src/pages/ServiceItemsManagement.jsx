import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Edit, Trash2, List, GripVertical } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const AREAS = {
  dusting_wiping_tidy: 'Dusting / Wiping / Tidy Up',
  kitchen_pantry: 'Kitchen and Pantry',
  bathrooms: 'Bathrooms',
  laundry: 'Laundry',
  floors: 'Floors',
  other_areas: 'Other Areas'
};

export default function ServiceItemsManagement() {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [activeArea, setActiveArea] = useState('dusting_wiping_tidy');
  
  const [formData, setFormData] = useState({
    area_name: 'dusting_wiping_tidy',
    item_name: '',
    item_description: '',
    service_type: 'both',
    is_active: true
  });

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    setIsLoading(true);
    try {
      const data = await base44.entities.ServiceAreaItem.list('sort_order', 1000);
      setItems(data);
    } catch (error) {
      console.error('Error loading items:', error);
      toast.error('Error al cargar los items');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.item_name.trim()) {
      toast.error('El nombre del item es requerido');
      return;
    }

    try {
      const dataToSave = {
        ...formData,
        area_display_name: AREAS[formData.area_name]
      };

      if (editingItem) {
        await base44.entities.ServiceAreaItem.update(editingItem.id, dataToSave);
        toast.success('Item actualizado con éxito');
      } else {
        await base44.entities.ServiceAreaItem.create(dataToSave);
        toast.success('Item creado con éxito');
      }

      setShowDialog(false);
      setEditingItem(null);
      resetForm();
      loadItems();
    } catch (error) {
      console.error('Error saving item:', error);
      toast.error('Error al guardar el item');
    }
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({
      area_name: item.area_name,
      item_name: item.item_name,
      item_description: item.item_description || '',
      service_type: item.service_type,
      is_active: item.is_active
    });
    setShowDialog(true);
  };

  const handleDelete = async (itemId) => {
    if (!confirm('¿Estás seguro de eliminar este item?')) return;

    try {
      await base44.entities.ServiceAreaItem.delete(itemId);
      toast.success('Item eliminado con éxito');
      loadItems();
    } catch (error) {
      console.error('Error deleting item:', error);
      toast.error('Error al eliminar el item');
    }
  };

  const toggleActive = async (item) => {
    try {
      await base44.entities.ServiceAreaItem.update(item.id, {
        is_active: !item.is_active
      });
      toast.success(`Item ${!item.is_active ? 'activado' : 'desactivado'}`);
      loadItems();
    } catch (error) {
      console.error('Error toggling active:', error);
      toast.error('Error al cambiar el estado');
    }
  };

  const resetForm = () => {
    setFormData({
      area_name: activeArea,
      item_name: '',
      item_description: '',
      service_type: 'both',
      is_active: true
    });
  };

  const handleNewItem = () => {
    resetForm();
    setEditingItem(null);
    setShowDialog(true);
  };

  const getItemsByArea = (areaName) => {
    return items
      .filter(item => item.area_name === areaName)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  };

  const handleDragEnd = async (result, areaName) => {
    if (!result.destination) return;
    const { source, destination } = result;
    if (source.index === destination.index) return;

    const areaItems = getItemsByArea(areaName);
    const reordered = Array.from(areaItems);
    const [moved] = reordered.splice(source.index, 1);
    reordered.splice(destination.index, 0, moved);

    // Actualizar estado local inmediatamente
    const updatedItems = items.map(item => {
      const idx = reordered.findIndex(r => r.id === item.id);
      if (idx !== -1) return { ...item, sort_order: idx };
      return item;
    });
    setItems(updatedItems);

    // Persistir en backend
    try {
      await Promise.all(
        reordered.map((item, idx) =>
          base44.entities.ServiceAreaItem.update(item.id, { sort_order: idx })
        )
      );
    } catch (error) {
      console.error('Error saving order:', error);
      toast.error('Error al guardar el orden');
      loadItems();
    }
  };

  const renderItemsTable = (areaName) => {
    const areaItems = getItemsByArea(areaName);

    return (
      <DragDropContext onDragEnd={(result) => handleDragEnd(result, areaName)}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead>Tipo Servicio</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <Droppable droppableId={areaName}>
            {(provided) => (
              <TableBody ref={provided.innerRef} {...provided.droppableProps}>
                {areaItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-gray-500">
                      No hay items en esta área
                    </TableCell>
                  </TableRow>
                ) : (
                  areaItems.map((item, index) => (
                    <Draggable key={item.id} draggableId={item.id} index={index}>
                      {(provided, snapshot) => (
                        <TableRow
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={snapshot.isDragging ? 'bg-blue-50 shadow-lg opacity-90' : ''}
                        >
                          <TableCell className="w-10 px-2">
                            <div
                              {...provided.dragHandleProps}
                              className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 flex items-center justify-center"
                            >
                              <GripVertical className="w-4 h-4" />
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">{item.item_name}</TableCell>
                          <TableCell className="text-sm text-gray-600 max-w-md">
                            {item.item_description || '-'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {item.service_type === 'initial' ? 'Inicial' :
                               item.service_type === 'regular' ? 'Regular' :
                               item.service_type === 'commercial' ? 'Comercial' : 'Ambos'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={item.is_active}
                                onCheckedChange={() => toggleActive(item)}
                              />
                              <span className="text-xs text-gray-600">
                                {item.is_active ? 'Activo' : 'Inactivo'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEdit(item)}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(item.id)}
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Draggable>
                  ))
                )}
                {provided.placeholder}
              </TableBody>
            )}
          </Droppable>
        </Table>
      </DragDropContext>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 p-6">
        <div className="max-w-7xl mx-auto">
          <Card>
            <CardContent className="p-10 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
              <p className="text-gray-500 mt-4">Cargando items...</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg">
                <List className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-slate-900">Gestión de Items de Servicio</h1>
                <p className="text-slate-600 mt-1">Administra los items disponibles para itemizar cotizaciones</p>
              </div>
            </div>
            <Button onClick={handleNewItem} size="lg" className="shadow-md">
              <Plus className="w-5 h-5 mr-2" /> Nuevo Item
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-slate-900">{items.length}</div>
              <div className="text-xs text-slate-600">Total Items</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-green-600">{items.filter(i => i.is_active).length}</div>
              <div className="text-xs text-slate-600">Items Activos</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-gray-600">{items.filter(i => !i.is_active).length}</div>
              <div className="text-xs text-slate-600">Items Inactivos</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-blue-600">{Object.keys(AREAS).length}</div>
              <div className="text-xs text-slate-600">Áreas Disponibles</div>
            </CardContent>
          </Card>
        </div>

        {/* Items por Área */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Items por Área</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={activeArea} onValueChange={setActiveArea}>
              <TabsList className="grid w-full grid-cols-6">
                {Object.entries(AREAS).map(([key, label]) => (
                  <TabsTrigger key={key} value={key} className="text-xs">
                    {label.split('/')[0].trim()}
                  </TabsTrigger>
                ))}
              </TabsList>

              {Object.entries(AREAS).map(([key, label]) => (
                <TabsContent key={key} value={key} className="mt-4">
                  <div className="mb-4">
                    <h3 className="font-semibold text-lg">{label}</h3>
                    <p className="text-sm text-gray-600">
                      {getItemsByArea(key).length} items en esta área
                    </p>
                  </div>
                  {renderItemsTable(key)}
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>

        {/* Dialog para Crear/Editar */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingItem ? 'Editar Item' : 'Nuevo Item'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label>Área</Label>
                <Select
                  value={formData.area_name}
                  onValueChange={(value) => setFormData({ ...formData, area_name: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(AREAS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Nombre del Item *</Label>
                <Input
                  value={formData.item_name}
                  onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                  placeholder="ej: Limpiar ventanas"
                />
              </div>

              <div>
                <Label>Descripción</Label>
                <Textarea
                  value={formData.item_description}
                  onChange={(e) => setFormData({ ...formData, item_description: e.target.value })}
                  placeholder="Descripción detallada del item..."
                  rows={3}
                />
              </div>

              <div>
                <Label>Tipo de Servicio</Label>
                <Select
                  value={formData.service_type}
                  onValueChange={(value) => setFormData({ ...formData, service_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Ambos (Initial & Regular)</SelectItem>
                    <SelectItem value="initial">Solo Initial</SelectItem>
                    <SelectItem value="regular">Solo Regular</SelectItem>
                    <SelectItem value="commercial">Solo Commercial</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label>Item activo</Label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave}>
                {editingItem ? 'Guardar Cambios' : 'Crear Item'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}