import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

export default function ServiceOptionsManager({ 
  quote, 
  serviceType, 
  itemizedAreas, 
  onSave,
  onClose 
}) {
  const [options, setOptions] = useState([]);
  const [editingOption, setEditingOption] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    if (quote.service_options) {
      const typeOptions = quote.service_options.filter(opt => opt.service_type === serviceType);
      setOptions(typeOptions);
    }
  }, [quote, serviceType]);

  const handleCreateOption = () => {
    const newOption = {
      option_id: `${serviceType}_${Date.now()}`,
      option_name: '',
      service_type: serviceType,
      selected_areas_items: [],
      pricing: serviceType === 'initial' 
        ? { one_off_min: 0, one_off_max: 0 }
        : { 
            weekly_min: 0, weekly_max: 0,
            fortnightly_min: 0, fortnightly_max: 0,
            every_3_weeks_min: 0, every_3_weeks_max: 0,
            monthly_min: 0, monthly_max: 0
          }
    };
    setEditingOption(newOption);
    setIsDialogOpen(true);
  };

  const handleEditOption = (option) => {
    setEditingOption({ ...option });
    setIsDialogOpen(true);
  };

  const handleDeleteOption = (optionId) => {
    setOptions(options.filter(opt => opt.option_id !== optionId));
    toast.success("Opción eliminada");
  };

  const handleSaveOption = () => {
    if (!editingOption.option_name.trim()) {
      toast.error("El nombre de la opción es requerido");
      return;
    }

    if (editingOption.selected_areas_items.length === 0) {
      toast.error("Selecciona al menos un área con items");
      return;
    }

    const existingIndex = options.findIndex(opt => opt.option_id === editingOption.option_id);
    if (existingIndex >= 0) {
      const updated = [...options];
      updated[existingIndex] = editingOption;
      setOptions(updated);
    } else {
      setOptions([...options, editingOption]);
    }

    setIsDialogOpen(false);
    setEditingOption(null);
    toast.success("Opción guardada");
  };

  const handleToggleArea = (area) => {
    if (!editingOption) return;

    const exists = editingOption.selected_areas_items.some(a => a.area_name === area.area_name);
    
    if (exists) {
      setEditingOption({
        ...editingOption,
        selected_areas_items: editingOption.selected_areas_items.filter(a => a.area_name !== area.area_name)
      });
    } else {
      setEditingOption({
        ...editingOption,
        selected_areas_items: [...editingOption.selected_areas_items, area]
      });
    }
  };

  const handleSaveAll = () => {
    onSave(options);
  };

  const getServiceTypeLabel = () => {
    if (serviceType === 'initial') return 'Inicial';
    if (serviceType === 'regular') return 'Regular';
    return 'Comercial';
  };

  const renderPricingFields = () => {
    if (!editingOption) return null;

    if (serviceType === 'initial') {
      return (
        <div className="space-y-3">
          <h4 className="font-semibold text-sm">Precio One-Off</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Precio Mínimo</Label>
              <Input
                type="number"
                value={editingOption.pricing.one_off_min || ''}
                onChange={(e) => setEditingOption({
                  ...editingOption,
                  pricing: { ...editingOption.pricing, one_off_min: parseFloat(e.target.value) || 0 }
                })}
                placeholder="$"
              />
            </div>
            <div>
              <Label>Precio Máximo</Label>
              <Input
                type="number"
                value={editingOption.pricing.one_off_max || ''}
                onChange={(e) => setEditingOption({
                  ...editingOption,
                  pricing: { ...editingOption.pricing, one_off_max: parseFloat(e.target.value) || 0 }
                })}
                placeholder="$"
              />
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="space-y-3">
          <h4 className="font-semibold text-sm">Precio Semanal (Weekly)</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Mínimo</Label>
              <Input
                type="number"
                value={editingOption.pricing.weekly_min || ''}
                onChange={(e) => setEditingOption({
                  ...editingOption,
                  pricing: { ...editingOption.pricing, weekly_min: parseFloat(e.target.value) || 0 }
                })}
                placeholder="$"
              />
            </div>
            <div>
              <Label>Máximo</Label>
              <Input
                type="number"
                value={editingOption.pricing.weekly_max || ''}
                onChange={(e) => setEditingOption({
                  ...editingOption,
                  pricing: { ...editingOption.pricing, weekly_max: parseFloat(e.target.value) || 0 }
                })}
                placeholder="$"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="font-semibold text-sm">Precio Quincenal (Fortnightly)</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Mínimo</Label>
              <Input
                type="number"
                value={editingOption.pricing.fortnightly_min || ''}
                onChange={(e) => setEditingOption({
                  ...editingOption,
                  pricing: { ...editingOption.pricing, fortnightly_min: parseFloat(e.target.value) || 0 }
                })}
                placeholder="$"
              />
            </div>
            <div>
              <Label>Máximo</Label>
              <Input
                type="number"
                value={editingOption.pricing.fortnightly_max || ''}
                onChange={(e) => setEditingOption({
                  ...editingOption,
                  pricing: { ...editingOption.pricing, fortnightly_max: parseFloat(e.target.value) || 0 }
                })}
                placeholder="$"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="font-semibold text-sm">Precio Cada 3 Semanas</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Mínimo</Label>
              <Input
                type="number"
                value={editingOption.pricing.every_3_weeks_min || ''}
                onChange={(e) => setEditingOption({
                  ...editingOption,
                  pricing: { ...editingOption.pricing, every_3_weeks_min: parseFloat(e.target.value) || 0 }
                })}
                placeholder="$"
              />
            </div>
            <div>
              <Label>Máximo</Label>
              <Input
                type="number"
                value={editingOption.pricing.every_3_weeks_max || ''}
                onChange={(e) => setEditingOption({
                  ...editingOption,
                  pricing: { ...editingOption.pricing, every_3_weeks_max: parseFloat(e.target.value) || 0 }
                })}
                placeholder="$"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="font-semibold text-sm">Precio Mensual (Monthly)</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Mínimo</Label>
              <Input
                type="number"
                value={editingOption.pricing.monthly_min || ''}
                onChange={(e) => setEditingOption({
                  ...editingOption,
                  pricing: { ...editingOption.pricing, monthly_min: parseFloat(e.target.value) || 0 }
                })}
                placeholder="$"
              />
            </div>
            <div>
              <Label>Máximo</Label>
              <Input
                type="number"
                value={editingOption.pricing.monthly_max || ''}
                onChange={(e) => setEditingOption({
                  ...editingOption,
                  pricing: { ...editingOption.pricing, monthly_max: parseFloat(e.target.value) || 0 }
                })}
                placeholder="$"
              />
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Opciones de Servicio - {getServiceTypeLabel()}</h2>
          <p className="text-gray-600">Crea múltiples opciones con diferentes items y precios</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
            <X className="w-4 h-4 mr-2" /> Cancelar
          </Button>
          <Button onClick={handleSaveAll} className="bg-green-600 hover:bg-green-700">
            <Save className="w-4 h-4 mr-2" /> Guardar Todo
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        {options.map((option, index) => (
          <Card key={option.option_id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{option.option_name}</CardTitle>
                  <CardDescription>
                    {option.selected_areas_items.length} áreas incluidas
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => handleEditOption(option)}>
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDeleteOption(option.option_id)}>
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <h4 className="font-semibold text-sm mb-2">Áreas incluidas:</h4>
                  <div className="flex flex-wrap gap-2">
                    {option.selected_areas_items.map((area, idx) => (
                      <Badge key={idx} variant="secondary">
                        {area.area_display_name}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Separator />
                <div>
                  <h4 className="font-semibold text-sm mb-2">Precios:</h4>
                  <div className="text-sm space-y-1">
                    {serviceType === 'initial' ? (
                      <div>One-Off: ${option.pricing.one_off_min} - ${option.pricing.one_off_max}</div>
                    ) : (
                      <>
                        <div>Semanal: ${option.pricing.weekly_min} - ${option.pricing.weekly_max}</div>
                        <div>Quincenal: ${option.pricing.fortnightly_min} - ${option.pricing.fortnightly_max}</div>
                        <div>Cada 3 semanas: ${option.pricing.every_3_weeks_min} - ${option.pricing.every_3_weeks_max}</div>
                        <div>Mensual: ${option.pricing.monthly_min} - ${option.pricing.monthly_max}</div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Button onClick={handleCreateOption} className="w-full">
        <Plus className="w-4 h-4 mr-2" /> Crear Nueva Opción
      </Button>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingOption?.option_name ? 'Editar Opción' : 'Nueva Opción'}
            </DialogTitle>
            <DialogDescription>
              Define el nombre, items incluidos y precios para esta opción
            </DialogDescription>
          </DialogHeader>

          {editingOption && (
            <div className="space-y-6">
              <div>
                <Label>Nombre de la Opción *</Label>
                <Input
                  value={editingOption.option_name}
                  onChange={(e) => setEditingOption({ ...editingOption, option_name: e.target.value })}
                  placeholder="Ej: Full Home Cleaning, Essential Cleaning"
                />
              </div>

              <Separator />

              <div>
                <h3 className="font-semibold mb-3">Selecciona las áreas a incluir</h3>
                <div className="space-y-3 border rounded-lg p-4 max-h-60 overflow-y-auto">
                  {itemizedAreas.map((area, idx) => {
                    const isSelected = editingOption.selected_areas_items.some(a => a.area_name === area.area_name);
                    return (
                      <div key={idx} className="flex items-start space-x-3 p-2 hover:bg-gray-50 rounded">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => handleToggleArea(area)}
                        />
                        <div className="flex-1">
                          <div className="font-medium">{area.area_display_name}</div>
                          <div className="text-sm text-gray-500">
                            {area.selection_type === 'full' 
                              ? 'Todos los items' 
                              : `${area.selected_items.length} items seleccionados`}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <Separator />

              {renderPricingFields()}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveOption}>
              Guardar Opción
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}