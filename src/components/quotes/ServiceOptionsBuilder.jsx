import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, Package, ChevronDown, ChevronRight } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const frequencyLabels = {
  weekly: 'Semanal',
  fortnightly: 'Quincenal',
  every_3_weeks: 'Cada 3 Semanas',
  monthly: 'Mensual'
};

export default function ServiceOptionsBuilder({ 
  open, 
  onClose, 
  quote, 
  serviceType,
  onSave 
}) {
  const [options, setOptions] = useState([]);
  const [editingOption, setEditingOption] = useState(null);
  const [openAreas, setOpenAreas] = useState({});

  useEffect(() => {
    if (open && quote?.service_options) {
      const existingOptions = quote.service_options.filter(opt => opt.service_type === serviceType);
      setOptions(existingOptions.length > 0 ? existingOptions : []);
    }
  }, [open, quote, serviceType]);

  const areas = [
    { id: 'dusting_wiping_tidy', name: 'Dusting / Wiping / Tidy Up' },
    { id: 'kitchen_pantry', name: 'Kitchen and Pantry' },
    { id: 'bathrooms', name: 'Bathrooms' },
    { id: 'laundry', name: 'Laundry' },
    { id: 'floors', name: 'Floors' },
    { id: 'other_areas', name: 'Other Areas' }
  ];

  const getItemsForArea = (areaId) => {
    return allItems.filter(item => 
      item.area_name === areaId && 
      (item.service_type === serviceType || item.service_type === 'both')
    );
  };

  const createNewOption = () => {
    const newOption = {
      option_id: `${serviceType}_${Date.now()}`,
      option_name: '',
      service_type: serviceType,
      pricing: serviceType === 'initial' 
        ? { one_off: { price_min: 0, price_max: 0, enabled: true } }
        : {
            weekly: { price_min: 0, price_max: 0, enabled: true },
            fortnightly: { price_min: 0, price_max: 0, enabled: true },
            every_3_weeks: { price_min: 0, price_max: 0, enabled: true },
            monthly: { price_min: 0, price_max: 0, enabled: true }
          },
      selected_areas_items: []
    };
    setEditingOption(newOption);
  };

  const saveOption = () => {
    if (!editingOption?.option_name.trim()) {
      alert('Por favor ingresa un nombre para la opción');
      return;
    }

    const existingIndex = options.findIndex(o => o.option_id === editingOption.option_id);
    if (existingIndex >= 0) {
      const updated = [...options];
      updated[existingIndex] = editingOption;
      setOptions(updated);
    } else {
      setOptions([...options, editingOption]);
    }
    setEditingOption(null);
  };

  const deleteOption = (optionId) => {
    setOptions(options.filter(o => o.option_id !== optionId));
  };

  const toggleItemInOption = (areaId, areaName, itemId, itemName, itemDescription) => {
    const newAreas = [...(editingOption.selected_areas_items || [])];
    const areaIndex = newAreas.findIndex(a => a.area_id === areaId);

    if (areaIndex === -1) {
      // Add area with this item
      newAreas.push({
        area_id: areaId,
        area_name: areaName,
        items: [{ item_id: itemId, item_name: itemName, item_description: itemDescription }]
      });
    } else {
      const itemIndex = newAreas[areaIndex].items.findIndex(i => i.item_id === itemId);
      if (itemIndex === -1) {
        // Add item to existing area
        newAreas[areaIndex].items.push({ item_id: itemId, item_name: itemName, item_description: itemDescription });
      } else {
        // Remove item
        newAreas[areaIndex].items.splice(itemIndex, 1);
        // Remove area if no items left
        if (newAreas[areaIndex].items.length === 0) {
          newAreas.splice(areaIndex, 1);
        }
      }
    }

    setEditingOption({ ...editingOption, selected_areas_items: newAreas });
  };

  const isItemSelected = (areaId, itemId) => {
    const area = editingOption?.selected_areas_items?.find(a => a.area_id === areaId);
    return area?.items?.some(i => i.item_id === itemId) || false;
  };

  const handleSaveAll = () => {
    onSave(options);
    onClose();
  };

  const serviceTypeLabel = {
    initial: 'Inicial',
    regular: 'Regular',
    commercial: 'Comercial'
  }[serviceType];

  const itemizedAreas = getItemizedAreas();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Crear Opciones de Servicio - {serviceTypeLabel}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 flex-1 overflow-hidden">
          {/* Left: Options List */}
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold">Opciones Creadas ({options.length})</h3>
              <Button onClick={createNewOption} size="sm">
                <Plus className="w-4 h-4 mr-1" />
                Nueva Opción
              </Button>
            </div>

            <ScrollArea className="flex-1 border rounded-lg p-3">
              {options.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No hay opciones creadas aún</p>
                  <p className="text-sm">Haz clic en "Nueva Opción" para comenzar</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {options.map((option) => (
                    <Card key={option.option_id} className="cursor-pointer hover:bg-accent/50" onClick={() => setEditingOption({ ...option })}>
                      <CardHeader className="p-3">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <CardTitle className="text-sm">{option.option_name}</CardTitle>
                            <p className="text-xs text-muted-foreground mt-1">
                              {option.selected_areas_items?.reduce((acc, area) => acc + area.items.length, 0) || 0} items incluidos
                            </p>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteOption(option.option_id);
                            }}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Right: Option Editor */}
          <div className="flex flex-col gap-3 border-l pl-4">
            {editingOption ? (
              <>
                <div className="space-y-3">
                  <div>
                    <Label>Nombre de la Opción</Label>
                    <Input
                      value={editingOption.option_name}
                      onChange={(e) => setEditingOption({ ...editingOption, option_name: e.target.value })}
                      placeholder="Ej: Full Home Cleaning, Essential Package"
                    />
                  </div>

                  {/* Pricing Section */}
                  <Card>
                    <CardHeader className="p-3">
                      <CardTitle className="text-sm">Precios por Frecuencia</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0 space-y-3">
                      {serviceType === 'initial' ? (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Precio Mínimo (AUD)</Label>
                            <Input
                              type="number"
                              value={editingOption.pricing.one_off?.price_min || 0}
                              onChange={(e) => setEditingOption({
                                ...editingOption,
                                pricing: {
                                  one_off: { 
                                    ...editingOption.pricing.one_off,
                                    price_min: parseFloat(e.target.value) || 0 
                                  }
                                }
                              })}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Precio Máximo (AUD)</Label>
                            <Input
                              type="number"
                              value={editingOption.pricing.one_off?.price_max || 0}
                              onChange={(e) => setEditingOption({
                                ...editingOption,
                                pricing: {
                                  one_off: { 
                                    ...editingOption.pricing.one_off,
                                    price_max: parseFloat(e.target.value) || 0 
                                  }
                                }
                              })}
                            />
                          </div>
                        </div>
                      ) : (
                        Object.keys(frequencyLabels).map(freq => {
                          const isEnabled = editingOption.pricing[freq]?.enabled !== false;
                          return (
                            <div key={freq} className="border rounded-lg p-2">
                              <div className="flex items-center justify-between mb-2">
                                <Label className="text-xs font-semibold">{frequencyLabels[freq]}</Label>
                                <div className="flex items-center gap-2">
                                  <Checkbox
                                    checked={isEnabled}
                                    onCheckedChange={(checked) => setEditingOption({
                                      ...editingOption,
                                      pricing: {
                                        ...editingOption.pricing,
                                        [freq]: {
                                          ...editingOption.pricing[freq],
                                          enabled: checked
                                        }
                                      }
                                    })}
                                  />
                                  <Label className="text-xs text-muted-foreground">Incluir</Label>
                                </div>
                              </div>
                              {isEnabled && (
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Mín</Label>
                                    <Input
                                      type="number"
                                      value={editingOption.pricing[freq]?.price_min || 0}
                                      onChange={(e) => setEditingOption({
                                        ...editingOption,
                                        pricing: {
                                          ...editingOption.pricing,
                                          [freq]: {
                                            ...editingOption.pricing[freq],
                                            price_min: parseFloat(e.target.value) || 0
                                          }
                                        }
                                      })}
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Máx</Label>
                                    <Input
                                      type="number"
                                      value={editingOption.pricing[freq]?.price_max || 0}
                                      onChange={(e) => setEditingOption({
                                        ...editingOption,
                                        pricing: {
                                          ...editingOption.pricing,
                                          [freq]: {
                                            ...editingOption.pricing[freq],
                                            price_max: parseFloat(e.target.value) || 0
                                          }
                                        }
                                      })}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Items Selection */}
                <div className="flex-1 overflow-hidden flex flex-col">
                  <Label className="mb-2">Selecciona Items para Incluir</Label>
                  <ScrollArea className="flex-1 border rounded-lg p-3">
                    {itemizedAreas.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No hay items itemizados aún. Primero debes itemizar en la página de itemización.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {itemizedAreas.map(area => (
                          <Collapsible 
                            key={area.area_id}
                            open={openAreas[area.area_id]}
                            onOpenChange={(open) => setOpenAreas({ ...openAreas, [area.area_id]: open })}
                          >
                            <Card>
                              <CollapsibleTrigger asChild>
                                <CardHeader className="p-3 cursor-pointer hover:bg-accent/50">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      {openAreas[area.area_id] ? (
                                        <ChevronDown className="w-4 h-4" />
                                      ) : (
                                        <ChevronRight className="w-4 h-4" />
                                      )}
                                      <h4 className="font-semibold text-sm">{area.area_name}</h4>
                                    </div>
                                    <Badge variant="outline" className="text-xs">
                                      {area.items?.length || 0} items
                                    </Badge>
                                  </div>
                                </CardHeader>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <CardContent className="p-3 pt-0">
                                  <div className="space-y-2">
                                    {area.items?.map(item => (
                                      <div key={item.item_id} className="flex items-start gap-2 p-2 hover:bg-accent/30 rounded">
                                        <Checkbox
                                          checked={isItemSelected(area.area_id, item.item_id)}
                                          onCheckedChange={() => toggleItemInOption(
                                            area.area_id, 
                                            area.area_name, 
                                            item.item_id, 
                                            item.item_name,
                                            item.item_description
                                          )}
                                        />
                                        <div className="flex-1">
                                          <Label className="text-sm font-medium cursor-pointer">
                                            {item.item_name}
                                          </Label>
                                          {item.item_description && (
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                              {item.item_description}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </CardContent>
                              </CollapsibleContent>
                            </Card>
                          </Collapsible>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </div>

                <Button onClick={saveOption} className="w-full">
                  Guardar Opción
                </Button>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Package className="w-16 h-16 mx-auto mb-3 opacity-30" />
                  <p>Selecciona o crea una opción para editar</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSaveAll}>Guardar Todas las Opciones</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}