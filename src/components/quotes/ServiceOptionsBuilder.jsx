import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Plus, Trash2, Package, ChevronDown, ChevronRight, CheckCircle, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
  const [allItems, setAllItems] = useState([]);
  const [activeArea, setActiveArea] = useState('dusting_wiping_tidy');
  const [isCreating, setIsCreating] = useState(false);

  const areas = [
    { id: 'dusting_wiping_tidy', name: 'Dusting / Wiping / Tidy Up' },
    { id: 'kitchen_pantry', name: 'Kitchen and Pantry' },
    { id: 'bathrooms', name: 'Bathrooms' },
    { id: 'laundry', name: 'Laundry' },
    { id: 'floors', name: 'Floors' },
    { id: 'other_areas', name: 'Other Areas' }
  ];

  useEffect(() => {
    if (open && quote?.service_options) {
      const existingOptions = quote.service_options.filter(opt => opt.service_type === serviceType);
      setOptions(existingOptions.length > 0 ? existingOptions : []);
      loadItems();
    }
  }, [open, quote, serviceType]);

  const loadItems = async () => {
    try {
      const itemsData = await base44.entities.ServiceAreaItem.list();
      setAllItems(itemsData.filter(item => item.is_active));
    } catch (error) {
      console.error('Error loading items:', error);
    }
  };

  const getItemsForArea = (areaId) => {
    return allItems.filter(item => 
      item.area_name === areaId && 
      (item.service_type === serviceType || item.service_type === 'both')
    );
  };

  const createNewOption = () => {
    const areaSelections = {};
    areas.forEach(area => {
      areaSelections[area.id] = {
        selection_type: null,
        selected_items: []
      };
    });

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
      area_selections: areaSelections,
      selected_areas_items: []
    };
    setEditingOption(newOption);
    setIsCreating(true);
  };

  const saveOption = () => {
    if (!editingOption?.option_name.trim()) {
      alert('Por favor ingresa un nombre para la opción');
      return;
    }

    // Build selected_areas_items from area_selections
    const selected_areas_items = areas
      .map(area => {
        const selection = editingOption.area_selections[area.id];
        if (!selection || selection.selection_type === 'not_included' || !selection.selection_type) return null;
        
        const areaItems = getItemsForArea(area.id);
        
        return {
          area_name: area.id,
          area_display_name: area.name,
          selection_type: selection.selection_type,
          selected_items: selection.selection_type === 'full' 
            ? areaItems.map(item => ({ item_name: item.item_name, item_description: item.item_description }))
            : selection.selected_items
        };
      })
      .filter(area => area !== null && (area.selection_type === 'full' || area.selected_items.length > 0));

    const optionToSave = {
      ...editingOption,
      selected_areas_items
    };

    if (isCreating) {
      setOptions([...options, optionToSave]);
    } else {
      setOptions(options.map(opt => 
        opt.option_id === optionToSave.option_id ? optionToSave : opt
      ));
    }
    
    setEditingOption(null);
    setIsCreating(false);
  };

  const deleteOption = (optionId) => {
    setOptions(options.filter(o => o.option_id !== optionId));
  };

  const handleSelectionTypeChange = (areaId, type) => {
    setEditingOption(prev => ({
      ...prev,
      area_selections: {
        ...prev.area_selections,
        [areaId]: {
          selection_type: type,
          selected_items: (type === 'full' || type === 'not_included') ? [] : (prev.area_selections[areaId]?.selected_items || [])
        }
      }
    }));
  };

  const handleItemToggle = (areaId, item) => {
    setEditingOption(prev => {
      const current = prev.area_selections[areaId] || { selection_type: 'custom', selected_items: [] };
      const isSelected = current.selected_items.some(i => i.item_name === item.item_name);
      
      return {
        ...prev,
        area_selections: {
          ...prev.area_selections,
          [areaId]: {
            ...current,
            selected_items: isSelected
              ? current.selected_items.filter(i => i.item_name !== item.item_name)
              : [...current.selected_items, { item_name: item.item_name, item_description: item.item_description }]
          }
        }
      };
    });
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

            <ScrollArea className="flex-1 border rounded-lg p-3" style={{ maxHeight: '500px' }}>
              {options.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No hay opciones creadas aún</p>
                  <p className="text-sm">Haz clic en "Nueva Opción" para comenzar</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {options.map((option) => (
                    <Card key={option.option_id} className="cursor-pointer hover:bg-accent/50" onClick={() => {
                      // Initialize area_selections from selected_areas_items when editing
                      const areaSelections = {};
                      areas.forEach(area => {
                        areaSelections[area.id] = {
                          selection_type: null,
                          selected_items: []
                        };
                      });
                      
                      option.selected_areas_items?.forEach(area => {
                        areaSelections[area.area_name] = {
                          selection_type: area.selection_type,
                          selected_items: area.selected_items || []
                        };
                      });

                      setEditingOption({ ...option, area_selections: areaSelections });
                      setIsCreating(false);
                    }}>
                      <CardHeader className="p-3">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <CardTitle className="text-sm">{option.option_name}</CardTitle>
                            <p className="text-xs text-muted-foreground mt-1">
                              {option.selected_areas_items?.reduce((acc, area) => acc + (area.selected_items?.length || 0), 0) || 0} items incluidos
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

                  {/* Frequency Selection */}
                  {serviceType !== 'initial' && (
                    <div>
                      <Label className="text-sm mb-2 block">Selecciona Frecuencias</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.keys(frequencyLabels).map(freq => {
                          const isEnabled = editingOption.pricing[freq]?.enabled !== false;
                          return (
                            <div key={freq} className="flex items-center space-x-2 p-2 border rounded-lg hover:bg-gray-50">
                              <Checkbox
                                id={`freq-${freq}`}
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
                              <Label htmlFor={`freq-${freq}`} className="cursor-pointer text-sm font-medium">
                                {frequencyLabels[freq]}
                              </Label>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Pricing Section */}
                  <div>
                    <Label className="text-sm mb-2 block">Precios por Frecuencia</Label>
                    <div className="space-y-2">
                      {serviceType === 'initial' ? (
                        <div className="border rounded-lg p-3">
                          <Label className="text-xs font-semibold mb-2 block">One-Off Service</Label>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs text-muted-foreground">Precio Mínimo (AUD)</Label>
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
                              <Label className="text-xs text-muted-foreground">Precio Máximo (AUD)</Label>
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
                        </div>
                      ) : (
                        Object.keys(frequencyLabels).map(freq => {
                          const isEnabled = editingOption.pricing[freq]?.enabled !== false;
                          if (!isEnabled) return null;
                          
                          return (
                            <div key={freq} className="border rounded-lg p-3">
                              <Label className="text-xs font-semibold mb-2 block">{frequencyLabels[freq]}</Label>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <Label className="text-xs text-muted-foreground">Precio Mínimo (AUD)</Label>
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
                                  <Label className="text-xs text-muted-foreground">Precio Máximo (AUD)</Label>
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
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* Items Selection with Tabs */}
                <div className="flex flex-col">
                  <Label className="mb-2">Selecciona Áreas e Items para Incluir</Label>
                  <div className="border rounded-lg">
                    <Tabs value={activeArea} onValueChange={setActiveArea}>
                      <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6 mb-3">
                        {areas.map(area => (
                          <TabsTrigger key={area.id} value={area.id} className="text-xs">
                            {area.name.split(' ')[0]}
                          </TabsTrigger>
                        ))}
                      </TabsList>

                      {areas.map(area => {
                        const areaItems = getItemsForArea(area.id);
                        const currentSelection = editingOption.area_selections?.[area.id] || { selection_type: null, selected_items: [] };

                        return (
                          <TabsContent key={area.id} value={area.id} className="space-y-3 mt-0 p-3">
                            <div className="space-y-2">
                              <h4 className="text-sm font-semibold">{area.name}</h4>
                              
                              <RadioGroup 
                                value={currentSelection.selection_type || ''} 
                                onValueChange={(value) => handleSelectionTypeChange(area.id, value)}
                              >
                                <div className="flex items-center space-x-2 p-2 border rounded-lg hover:bg-gray-50">
                                  <RadioGroupItem value="full" id={`${area.id}-full`} />
                                  <Label htmlFor={`${area.id}-full`} className="flex-1 cursor-pointer text-sm">
                                    <div className="font-semibold">Servicio Completo</div>
                                    <div className="text-xs text-gray-500">Incluir todos los items</div>
                                  </Label>
                                  <CheckCircle className="w-4 h-4 text-green-600" />
                                </div>

                                <div className="flex items-center space-x-2 p-2 border rounded-lg hover:bg-gray-50">
                                  <RadioGroupItem value="custom" id={`${area.id}-custom`} />
                                  <Label htmlFor={`${area.id}-custom`} className="flex-1 cursor-pointer text-sm">
                                    <div className="font-semibold">Personalizado</div>
                                    <div className="text-xs text-gray-500">Seleccionar items específicos</div>
                                  </Label>
                                  <Package className="w-4 h-4 text-blue-600" />
                                </div>

                                <div className="flex items-center space-x-2 p-2 border rounded-lg hover:bg-gray-50">
                                  <RadioGroupItem value="not_included" id={`${area.id}-not-included`} />
                                  <Label htmlFor={`${area.id}-not-included`} className="flex-1 cursor-pointer text-sm">
                                    <div className="font-semibold">No Incluido</div>
                                    <div className="text-xs text-gray-500">Esta área no se limpiará</div>
                                  </Label>
                                  <X className="w-4 h-4 text-red-600" />
                                </div>
                              </RadioGroup>

                              {currentSelection.selection_type === 'custom' && (
                                <div className="border rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto bg-gray-50">
                                  <h5 className="font-semibold text-sm mb-2">Selecciona los items:</h5>
                                  {areaItems.map(item => {
                                    const isSelected = currentSelection.selected_items.some(i => i.item_name === item.item_name);
                                    return (
                                      <div key={item.id} className="flex items-start space-x-2 p-2 hover:bg-white rounded">
                                        <Checkbox 
                                          checked={isSelected}
                                          onCheckedChange={() => handleItemToggle(area.id, item)}
                                          id={`item-${item.id}`}
                                        />
                                        <Label htmlFor={`item-${item.id}`} className="flex-1 cursor-pointer">
                                          <div className="font-medium text-sm">{item.item_name}</div>
                                          {item.item_description && (
                                            <div className="text-xs text-gray-500">{item.item_description}</div>
                                          )}
                                        </Label>
                                      </div>
                                    );
                                  })}
                                  {areaItems.length === 0 && (
                                    <p className="text-xs text-gray-500 text-center py-2">
                                      No hay items configurados para esta área
                                    </p>
                                  )}
                                </div>
                              )}

                              {currentSelection.selection_type === 'full' && (
                                <div className="border rounded-lg p-3 bg-green-50 max-h-48 overflow-y-auto">
                                  <h5 className="font-semibold text-sm mb-2 text-green-800">Todos los items incluidos:</h5>
                                  <ul className="space-y-1">
                                    {areaItems.map(item => (
                                      <li key={item.id} className="flex items-start gap-2">
                                        <CheckCircle className="w-3 h-3 text-green-600 mt-0.5 flex-shrink-0" />
                                        <div className="text-sm">
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
                                <div className="border rounded-lg p-3 bg-red-50">
                                  <div className="flex items-center gap-2 text-red-800">
                                    <X className="w-4 h-4" />
                                    <h5 className="font-semibold text-sm">Esta área no se incluirá</h5>
                                  </div>
                                </div>
                              )}
                            </div>
                          </TabsContent>
                        );
                      })}
                    </Tabs>
                  </div>
                </div>

                <Button onClick={saveOption} className="w-full">
                  {isCreating ? 'Crear Opción' : 'Guardar Cambios'}
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