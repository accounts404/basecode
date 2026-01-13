import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, Package, ChevronDown, ChevronRight, CheckCircle, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';

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
  const [activeArea, setActiveArea] = useState('dusting_wiping_tidy');
  const [allItems, setAllItems] = useState([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);

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
    const areasWithSelection = areas.map(area => ({
      area_id: area.id,
      area_name: area.name,
      selection_type: null,
      selected_items: []
    }));

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
      selected_areas_items: areasWithSelection
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

  const handleSelectionTypeChange = (areaId, type) => {
    const newAreas = [...(editingOption.selected_areas_items || [])];
    const areaIndex = newAreas.findIndex(a => a.area_id === areaId);
    const area = areas.find(a => a.id === areaId);

    if (areaIndex === -1) {
      newAreas.push({
        area_id: areaId,
        area_name: area.name,
        selection_type: type,
        selected_items: []
      });
    } else {
      newAreas[areaIndex] = {
        ...newAreas[areaIndex],
        selection_type: type,
        selected_items: (type === 'full' || type === 'not_included') ? [] : newAreas[areaIndex].selected_items
      };
    }

    setEditingOption({ ...editingOption, selected_areas_items: newAreas });
  };

  const handleItemToggle = (areaId, item) => {
    const newAreas = [...(editingOption.selected_areas_items || [])];
    const areaIndex = newAreas.findIndex(a => a.area_id === areaId);
    
    if (areaIndex === -1) return;

    const currentArea = newAreas[areaIndex];
    const isSelected = currentArea.selected_items?.some(i => i.item_name === item.item_name);

    newAreas[areaIndex] = {
      ...currentArea,
      selected_items: isSelected
        ? currentArea.selected_items.filter(i => i.item_name !== item.item_name)
        : [...(currentArea.selected_items || []), { item_name: item.item_name, item_description: item.item_description }]
    };

    setEditingOption({ ...editingOption, selected_areas_items: newAreas });
  };

  const getCurrentSelectionForArea = (areaId) => {
    const area = editingOption?.selected_areas_items?.find(a => a.area_id === areaId);
    return area || { selection_type: null, selected_items: [] };
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
                  <Card>
                    <CardHeader className="p-3">
                      <CardTitle className="text-sm">Seleccionar Items por Área</CardTitle>
                      <CardDescription className="text-xs">
                        Elige "Servicio Completo" para incluir todos los items, "Personalizado" para seleccionar específicos, o "No Incluido" si no se limpiará
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <Tabs value={activeArea} onValueChange={setActiveArea}>
                        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6 mb-3">
                          {areas.map(area => (
                            <TabsTrigger key={area.id} value={area.id} className="text-xs">
                              {area.name.split(' ')[0]}
                            </TabsTrigger>
                          ))}
                        </TabsList>

                        <ScrollArea className="h-[400px]">
                          {areas.map(area => {
                            const areaItems = getItemsForArea(area.id);
                            const currentSelection = getCurrentSelectionForArea(area.id);

                            return (
                              <TabsContent key={area.id} value={area.id} className="space-y-3 mt-0">
                                <div>
                                  <h3 className="text-sm font-semibold mb-2">{area.name}</h3>
                                  <Badge variant="outline" className="text-xs">{areaItems.length} items disponibles</Badge>
                                </div>

                                <RadioGroup 
                                  value={currentSelection.selection_type || ''} 
                                  onValueChange={(value) => handleSelectionTypeChange(area.id, value)}
                                >
                                  <div className="flex items-center space-x-2 p-2 border rounded-lg hover:bg-gray-50">
                                    <RadioGroupItem value="full" id={`${area.id}-full`} />
                                    <Label htmlFor={`${area.id}-full`} className="flex-1 cursor-pointer text-xs">
                                      <div>
                                        <div className="font-semibold">Servicio Completo</div>
                                        <div className="text-xs text-gray-500">Incluir todos los items de esta área</div>
                                      </div>
                                    </Label>
                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                  </div>

                                  <div className="flex items-center space-x-2 p-2 border rounded-lg hover:bg-gray-50">
                                    <RadioGroupItem value="custom" id={`${area.id}-custom`} />
                                    <Label htmlFor={`${area.id}-custom`} className="flex-1 cursor-pointer text-xs">
                                      <div>
                                        <div className="font-semibold">Personalizado</div>
                                        <div className="text-xs text-gray-500">Seleccionar items específicos</div>
                                      </div>
                                    </Label>
                                    <Package className="w-4 h-4 text-blue-600" />
                                  </div>

                                  <div className="flex items-center space-x-2 p-2 border rounded-lg hover:bg-gray-50">
                                    <RadioGroupItem value="not_included" id={`${area.id}-not-included`} />
                                    <Label htmlFor={`${area.id}-not-included`} className="flex-1 cursor-pointer text-xs">
                                      <div>
                                        <div className="font-semibold">No Incluido</div>
                                        <div className="text-xs text-gray-500">Esta área no se limpiará</div>
                                      </div>
                                    </Label>
                                    <X className="w-4 h-4 text-red-600" />
                                  </div>
                                </RadioGroup>

                                {currentSelection.selection_type === 'custom' && (
                                  <div className="border rounded-lg p-2 space-y-2 max-h-64 overflow-y-auto">
                                    <h4 className="font-semibold text-xs mb-2">Selecciona los items a incluir:</h4>
                                    {areaItems.map(item => {
                                      const isSelected = currentSelection.selected_items?.some(i => i.item_name === item.item_name);
                                      return (
                                        <div key={item.id} className="flex items-start space-x-2 p-2 hover:bg-gray-50 rounded">
                                          <Checkbox 
                                            checked={isSelected}
                                            onCheckedChange={() => handleItemToggle(area.id, item)}
                                            id={`item-${item.id}`}
                                          />
                                          <Label htmlFor={`item-${item.id}`} className="flex-1 cursor-pointer text-xs">
                                            <div className="font-medium">{item.item_name}</div>
                                            {item.item_description && (
                                              <div className="text-xs text-gray-500">{item.item_description}</div>
                                            )}
                                          </Label>
                                        </div>
                                      );
                                    })}
                                    {areaItems.length === 0 && (
                                      <p className="text-gray-500 text-center py-2 text-xs">
                                        No hay items configurados para este tipo de servicio.
                                      </p>
                                    )}
                                  </div>
                                )}

                                {currentSelection.selection_type === 'full' && (
                                  <div className="border rounded-lg p-2 bg-green-50">
                                    <h4 className="font-semibold text-xs mb-2 text-green-800">Todos los items incluidos:</h4>
                                    <ul className="space-y-1">
                                      {areaItems.map(item => (
                                        <li key={item.id} className="flex items-start gap-2 text-xs">
                                          <CheckCircle className="w-3 h-3 text-green-600 mt-0.5 flex-shrink-0" />
                                          <div>
                                            <div className="font-medium">{item.item_name}</div>
                                            {item.item_description && (
                                              <div className="text-xs text-gray-600">{item.item_description}</div>
                                            )}
                                          </div>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                {currentSelection.selection_type === 'not_included' && (
                                  <div className="border rounded-lg p-2 bg-red-50">
                                    <div className="flex items-center gap-2 text-red-800 text-xs">
                                      <X className="w-4 h-4" />
                                      <h4 className="font-semibold">Esta área no se incluirá en el servicio</h4>
                                    </div>
                                  </div>
                                )}
                              </TabsContent>
                            );
                          })}
                        </ScrollArea>
                      </Tabs>
                    </CardContent>
                  </Card>
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