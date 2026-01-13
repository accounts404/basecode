import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Save, Send, CheckCircle, Package, Loader2, Plus, Edit2, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { generateQuotePDF } from '../components/utils/quotePdfGenerator';
import { format } from 'date-fns';

const areas = [
  { id: 'dusting_wiping_tidy', name: 'Dusting / Wiping / Tidy Up' },
  { id: 'kitchen_pantry', name: 'Kitchen and Pantry' },
  { id: 'bathrooms', name: 'Bathrooms' },
  { id: 'laundry', name: 'Laundry' },
  { id: 'floors', name: 'Floors' },
  { id: 'other_areas', name: 'Other Areas' }
];

export default function QuoteItemizationPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [quote, setQuote] = useState(null);
  const [client, setClient] = useState(null);
  const [allItems, setAllItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [activeServiceType, setActiveServiceType] = useState('initial');
  const [activeArea, setActiveArea] = useState('dusting_wiping_tidy');
  
  const [areaSelectionsInitial, setAreaSelectionsInitial] = useState({});
  const [areaSelectionsRegular, setAreaSelectionsRegular] = useState({});
  const [areaSelectionsCommercial, setAreaSelectionsCommercial] = useState({});
  
  const [areaNotesInitial, setAreaNotesInitial] = useState({});
  const [areaNotesRegular, setAreaNotesRegular] = useState({});
  const [areaNotesCommercial, setAreaNotesCommercial] = useState({});
  
  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [itemFormData, setItemFormData] = useState({
    area_name: '',
    area_display_name: '',
    item_name: '',
    item_description: '',
    service_type: 'both'
  });

  const getQuoteId = useCallback(() => new URLSearchParams(location.search).get('id'), [location.search]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (quote) {
      if (hasInitialServices()) {
        setActiveServiceType('initial');
      } else if (hasRegularServices()) {
        setActiveServiceType('regular');
      } else if (hasCommercialServices()) {
        setActiveServiceType('commercial');
      }
    }
  }, [quote]);  

  const loadData = async () => {
    setIsLoading(true);
    const quoteId = getQuoteId();
    
    if (!quoteId) {
      toast.error("No se especificó cotización");
      navigate(createPageUrl('Cotizaciones'));
      return;
    }

    try {
      const [quoteData, itemsData] = await Promise.all([
        base44.entities.Quote.get(quoteId),
        base44.entities.ServiceAreaItem.list()
      ]);

      setQuote(quoteData);
      setAllItems(itemsData.filter(item => item.is_active));

      if (quoteData.client_id) {
        const clientData = await base44.entities.Client.get(quoteData.client_id);
        setClient(clientData);
      }

      if (quoteData.selected_areas_items_initial && quoteData.selected_areas_items_initial.length > 0) {
        const selections = {};
        const notes = {};
        quoteData.selected_areas_items_initial.forEach(area => {
          selections[area.area_name] = {
            selection_type: area.selection_type,
            selected_items: area.selected_items || []
          };
          if (area.area_notes) {
            notes[area.area_name] = area.area_notes;
          }
        });
        setAreaSelectionsInitial(selections);
        setAreaNotesInitial(notes);
      }

      if (quoteData.selected_areas_items_regular && quoteData.selected_areas_items_regular.length > 0) {
        const selections = {};
        const notes = {};
        quoteData.selected_areas_items_regular.forEach(area => {
          selections[area.area_name] = {
            selection_type: area.selection_type,
            selected_items: area.selected_items || []
          };
          if (area.area_notes) {
            notes[area.area_name] = area.area_notes;
          }
        });
        setAreaSelectionsRegular(selections);
        setAreaNotesRegular(notes);
      }

      if (quoteData.selected_areas_items_commercial && quoteData.selected_areas_items_commercial.length > 0) {
        const selections = {};
        const notes = {};
        quoteData.selected_areas_items_commercial.forEach(area => {
          selections[area.area_name] = {
            selection_type: area.selection_type,
            selected_items: area.selected_items || []
          };
          if (area.area_notes) {
            notes[area.area_name] = area.area_notes;
          }
        });
        setAreaSelectionsCommercial(selections);
        setAreaNotesCommercial(notes);
      }

    } catch (error) {
      console.error("Error loading itemization data:", error);
      toast.error("Error al cargar datos de itemización");
    } finally {
      setIsLoading(false);
    }
  };

  const hasInitialServices = () => quote?.selected_services?.some(s => s.service_type === 'initial');
  const hasRegularServices = () => quote?.selected_services?.some(s => s.service_type === 'regular');
  const hasCommercialServices = () => quote?.selected_services?.some(s => s.service_type === 'commercial');

  const getInitialServices = () => quote?.selected_services?.filter(s => s.service_type === 'initial') || [];
  const getRegularServices = () => quote?.selected_services?.filter(s => s.service_type === 'regular') || [];
  const getCommercialServices = () => quote?.selected_services?.filter(s => s.service_type === 'commercial') || [];

  const getItemsForArea = (areaId, serviceType) => {
    return allItems.filter(item => 
      item.area_name === areaId && 
      (item.service_type === serviceType || item.service_type === 'both')
    );
  };

  const handleSelectionTypeChange = (areaId, type, serviceType) => {
    const setter = serviceType === 'initial' ? setAreaSelectionsInitial : 
                   serviceType === 'regular' ? setAreaSelectionsRegular :
                   setAreaSelectionsCommercial;
    setter(prev => ({
      ...prev,
      [areaId]: {
        selection_type: type,
        selected_items: (type === 'full' || type === 'not_included') ? [] : (prev[areaId]?.selected_items || [])
      }
    }));
  };

  const handleItemToggle = (areaId, item, serviceType) => {
    const setter = serviceType === 'initial' ? setAreaSelectionsInitial : 
                   serviceType === 'regular' ? setAreaSelectionsRegular :
                   setAreaSelectionsCommercial;
    setter(prev => {
      const current = prev[areaId] || { selection_type: 'custom', selected_items: [] };
      const isSelected = current.selected_items.some(i => i.item_name === item.item_name);
      
      return {
        ...prev,
        [areaId]: {
          ...current,
          selected_items: isSelected
            ? current.selected_items.filter(i => i.item_name !== item.item_name)
            : [...current.selected_items, { item_name: item.item_name, item_description: item.item_description }]
        }
      };
    });
  };

  const handleOpenItemDialog = (areaId, item = null) => {
    const area = areas.find(a => a.id === areaId);
    
    if (item) {
      setEditingItem(item);
      setItemFormData({
        area_name: item.area_name,
        area_display_name: item.area_display_name,
        item_name: item.item_name,
        item_description: item.item_description || '',
        service_type: item.service_type
      });
    } else {
      setEditingItem(null);
      setItemFormData({
        area_name: areaId,
        area_display_name: area.name,
        item_name: '',
        item_description: '',
        service_type: 'both'
      });
    }
    setIsItemDialogOpen(true);
  };

  const handleSaveItem = async () => {
    if (!itemFormData.item_name.trim()) {
      toast.error("El nombre del item es requerido");
      return;
    }

    try {
      if (editingItem) {
        await base44.entities.ServiceAreaItem.update(editingItem.id, itemFormData);
        toast.success("Item actualizado exitosamente");
      } else {
        await base44.entities.ServiceAreaItem.create(itemFormData);
        toast.success("Item creado exitosamente");
      }
      
      setIsItemDialogOpen(false);
      setEditingItem(null);
      loadData();
    } catch (error) {
      console.error("Error saving item:", error);
      toast.error("Error al guardar el item");
    }
  };

  const handleDeleteItem = async () => {
    if (!itemToDelete) return;

    try {
      await base44.entities.ServiceAreaItem.update(itemToDelete.id, { is_active: false });
      toast.success("Item eliminado exitosamente");
      setItemToDelete(null);
      loadData();
    } catch (error) {
      console.error("Error deleting item:", error);
      toast.error("Error al eliminar el item");
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const dataToUpdate = {};

      if (hasInitialServices()) {
        const selected_areas_items_initial = areas.map(area => {
          const selection = areaSelectionsInitial[area.id];
          if (!selection || selection.selection_type === 'not_included') return null;
          
          const areaItems = getItemsForArea(area.id, 'initial');
          
          return {
            area_name: area.id,
            area_display_name: area.name,
            selection_type: selection.selection_type,
            selected_items: selection.selection_type === 'full' 
              ? areaItems.map(item => ({ item_name: item.item_name, item_description: item.item_description }))
              : selection.selected_items,
            area_notes: areaNotesInitial[area.id] || ''
          };
        }).filter(area => area !== null && area.selection_type !== 'not_included' && (area.selection_type === 'full' || area.selected_items.length > 0));
        
        dataToUpdate.selected_areas_items_initial = selected_areas_items_initial;
      }

      if (hasRegularServices()) {
        const selected_areas_items_regular = areas.map(area => {
          const selection = areaSelectionsRegular[area.id];
          if (!selection || selection.selection_type === 'not_included') return null;
          
          const areaItems = getItemsForArea(area.id, 'regular');
          
          return {
            area_name: area.id,
            area_display_name: area.name,
            selection_type: selection.selection_type,
            selected_items: selection.selection_type === 'full' 
              ? areaItems.map(item => ({ item_name: item.item_name, item_description: item.item_description }))
              : selection.selected_items,
            area_notes: areaNotesRegular[area.id] || ''
          };
        }).filter(area => area !== null && area.selection_type !== 'not_included' && (area.selection_type === 'full' || area.selected_items.length > 0));
        
        dataToUpdate.selected_areas_items_regular = selected_areas_items_regular;
      }

      if (hasCommercialServices()) {
        const selected_areas_items_commercial = areas.map(area => {
          const selection = areaSelectionsCommercial[area.id];
          if (!selection || selection.selection_type === 'not_included') return null;
          
          const areaItems = getItemsForArea(area.id, 'commercial');
          
          return {
            area_name: area.id,
            area_display_name: area.name,
            selection_type: selection.selection_type,
            selected_items: selection.selection_type === 'full' 
              ? areaItems.map(item => ({ item_name: item.item_name, item_description: item.item_description }))
              : selection.selected_items,
            area_notes: areaNotesCommercial[area.id] || ''
          };
        }).filter(area => area !== null && area.selection_type !== 'not_included' && (area.selection_type === 'full' || area.selected_items.length > 0));
        
        dataToUpdate.selected_areas_items_commercial = selected_areas_items_commercial;
      }

      const hasInitialItems = dataToUpdate.selected_areas_items_initial && dataToUpdate.selected_areas_items_initial.length > 0;
      const hasRegularItems = dataToUpdate.selected_areas_items_regular && dataToUpdate.selected_areas_items_regular.length > 0;
      const hasCommercialItems = dataToUpdate.selected_areas_items_commercial && dataToUpdate.selected_areas_items_commercial.length > 0;
      
      dataToUpdate.itemization_completed = 
        (hasInitialServices() ? hasInitialItems : true) && 
        (hasRegularServices() ? hasRegularItems : true) &&
        (hasCommercialServices() ? hasCommercialItems : true);

      await base44.entities.Quote.update(quote.id, dataToUpdate);
      toast.success("Itemización guardada exitosamente");
      
      const updatedQuote = await base44.entities.Quote.get(quote.id);
      setQuote(updatedQuote);
    } catch (error) {
      console.error("Error saving itemization:", error);
      toast.error("Error al guardar la itemización");
    } finally {
      setIsSaving(false);
    }
  };

  const handleFinalizeSend = async () => {
    const hasInitialSelections = hasInitialServices() && Object.values(areaSelectionsInitial).some(sel => 
      sel && sel.selection_type !== 'not_included' && (sel.selection_type === 'full' || sel.selected_items.length > 0)
    );

    const hasRegularSelections = hasRegularServices() && Object.values(areaSelectionsRegular).some(sel => 
      sel && sel.selection_type !== 'not_included' && (sel.selection_type === 'full' || sel.selected_items.length > 0)
    );

    const hasCommercialSelections = hasCommercialServices() && Object.values(areaSelectionsCommercial).some(sel => 
      sel && sel.selection_type !== 'not_included' && (sel.selection_type === 'full' || sel.selected_items.length > 0)
    );

    if (hasInitialServices() && !hasInitialSelections) {
      toast.error("Por favor, selecciona al menos un área para los servicios iniciales");
      return;
    }

    if (hasRegularServices() && !hasRegularSelections) {
      toast.error("Por favor, selecciona al menos un área para los servicios regulares");
      return;
    }

    if (hasCommercialServices() && !hasCommercialSelections) {
      toast.error("Por favor, selecciona al menos un área para los servicios comerciales");
      return;
    }

    if (!client || !client.email) {
      toast.error("El cliente no tiene un email registrado");
      return;
    }

    setIsSending(true);
    
    try {
      await handleSave();

      const pdfToastId = toast.loading("Generando PDF de la cotización...");

      const systemSettings = await base44.entities.SystemSetting.list();
      const settings = systemSettings[0] || {};

      const updatedQuote = await base44.entities.Quote.get(quote.id);

      const pdfDoc = await generateQuotePDF({
        quote: updatedQuote,
        client,
        systemSettings: settings
      });

      const pdfBlob = pdfDoc.output('blob', { compress: true });
      
      const clientNameClean = client.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      const dateStr = format(new Date(), 'dd-MM-yyyy');
      const filename = `${clientNameClean}_Quote_${dateStr}.pdf`;
      
      const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' });

      const fileSizeMB = pdfFile.size / (1024 * 1024);
      toast.loading(`Subiendo PDF (${fileSizeMB.toFixed(2)} MB)...`, { id: pdfToastId });

      let fileUrl = null;
      let uploadAttempts = 0;
      const maxAttempts = 3;

      while (uploadAttempts < maxAttempts && !fileUrl) {
        try {
          uploadAttempts++;
          if (uploadAttempts > 1) {
            toast.loading(`Reintentando subir PDF (intento ${uploadAttempts}/${maxAttempts})...`, { id: pdfToastId });
          }
          
          const { file_url } = await base44.integrations.Core.UploadFile({ file: pdfFile });
          fileUrl = file_url;
          
        } catch (uploadError) {
          console.error(`Upload attempt ${uploadAttempts} failed:`, uploadError);
          
          if (uploadAttempts >= maxAttempts) {
            throw new Error(`No se pudo subir el PDF después de ${maxAttempts} intentos. Por favor, intenta nuevamente.`);
          }
          
          await new Promise(resolve => setTimeout(resolve, 1000 * uploadAttempts));
        }
      }

      if (!fileUrl) {
        throw new Error("No se pudo obtener la URL del PDF");
      }

      toast.loading("Guardando cotización...", { id: pdfToastId });
      await base44.entities.Quote.update(quote.id, {
        status: 'enviada',
        sent_date: new Date().toISOString().split('T')[0],
        quote_pdf_url: fileUrl,
        itemization_completed: true
      });

      toast.success("Cotización finalizada y PDF generado exitosamente", { id: pdfToastId });
      navigate(createPageUrl('Cotizaciones'));
      
    } catch (error) {
      console.error("Error finalizando cotización:", error);
      const errorMessage = error.message || "Error al finalizar la cotización";
      toast.error(errorMessage);
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading || !quote) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </div>
    );
  }

  const renderServiceTypeSection = (serviceType) => {
    const isInitial = serviceType === 'initial';
    const isRegular = serviceType === 'regular';
    const isCommercial = serviceType === 'commercial';
    
    const services = isInitial ? getInitialServices() : 
                     isRegular ? getRegularServices() : 
                     getCommercialServices();
    
    const areaSelections = isInitial ? areaSelectionsInitial : 
                           isRegular ? areaSelectionsRegular :
                           areaSelectionsCommercial;
    
    const totalMin = services.reduce((sum, s) => sum + s.price_min, 0);
    const totalMax = services.reduce((sum, s) => sum + s.price_max, 0);
    
    const finalTotalMin = isInitial ? totalMin + (quote.cost_steam_vacuum || 0) + (quote.cost_oven || 0) + (quote.cost_windows_cleaning || 0) : totalMin;
    const finalTotalMax = isInitial ? totalMax + (quote.cost_steam_vacuum || 0) + (quote.cost_oven || 0) + (quote.cost_windows_cleaning || 0) : totalMax;

    const sectionColor = isInitial ? "from-orange-50 to-red-50" : 
                         isRegular ? "from-blue-50 to-green-50" :
                         "from-purple-50 to-indigo-50";
    
    const sectionTitle = isInitial ? 'Servicios Iniciales - Spring Cleaning, One Off' :
                         isRegular ? 'Servicios Regulares - Semanal, Quincenal' :
                         'Servicios Comerciales - Oficinas, Negocios';

    return (
      <div className="space-y-6">
        <Card className={`bg-gradient-to-r ${sectionColor}`}>
          <CardHeader>
            <CardTitle className="text-lg">{sectionTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-semibold text-gray-700 mb-2">Servicios:</h4>
                <ul className="space-y-1">
                  {services.map((service, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <Badge variant={isInitial ? 'default' : isRegular ? 'secondary' : 'outline'}>
                        {service.service_name}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-gray-700 mb-2">Precios:</h4>
                <div className="space-y-1">
                  {services.map((service, idx) => (
                    <div key={idx} className="text-sm">
                      <span className="text-gray-600">{service.service_name}:</span>
                      <span className="font-semibold ml-2">${service.price_min} - ${service.price_max}</span>
                    </div>
                  ))}
                  {isInitial && (quote.cost_steam_vacuum > 0 || quote.cost_oven > 0 || quote.cost_windows_cleaning > 0) && (
                    <div className="border-t pt-2 mt-2 text-sm">
                      <p className="font-semibold mb-1">Servicios Adicionales:</p>
                      {quote.cost_steam_vacuum > 0 && <div>Steam Vacuum: +${quote.cost_steam_vacuum}</div>}
                      {quote.cost_oven > 0 && <div>Horno: +${quote.cost_oven}</div>}
                      {quote.cost_windows_cleaning > 0 && <div>Ventanas: +${quote.cost_windows_cleaning}</div>}
                    </div>
                  )}
                  <div className="border-t pt-2 mt-2">
                    <span className="text-gray-700 font-bold">Total:</span>
                    <span className={`font-bold ml-2 text-lg ${
                        isInitial ? 'text-orange-700' : 
                        isRegular ? 'text-green-700' :
                        'text-purple-700'
                    }`}>
                      ${finalTotalMin} - ${finalTotalMax}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Seleccionar Items por Área</CardTitle>
            <CardDescription>
              Elige "Servicio Completo" para incluir todos los items, "Personalizado" para seleccionar específicos, o "No Incluido" si no se limpiará
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeArea} onValueChange={setActiveArea}>
              <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6">
                {areas.map(area => (
                  <TabsTrigger key={area.id} value={area.id} className="text-xs">
                    {area.name.split(' ')[0]}
                  </TabsTrigger>
                ))}
              </TabsList>

              {areas.map(area => {
                const areaItems = getItemsForArea(area.id, serviceType);
                const currentSelection = areaSelections[area.id] || { selection_type: null, selected_items: [] };

                return (
                  <TabsContent key={area.id} value={area.id} className="space-y-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold">{area.name}</h3>
                        <Badge variant="outline">{areaItems.length} items disponibles</Badge>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleOpenItemDialog(area.id)}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Nuevo Item
                      </Button>
                    </div>

                    <RadioGroup 
                      value={currentSelection.selection_type || ''} 
                      onValueChange={(value) => handleSelectionTypeChange(area.id, value, serviceType)}
                    >
                      <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-gray-50">
                        <RadioGroupItem value="full" id={`${area.id}-${serviceType}-full`} />
                        <Label htmlFor={`${area.id}-${serviceType}-full`} className="flex-1 cursor-pointer">
                          <div>
                            <div className="font-semibold">Servicio Completo</div>
                            <div className="text-sm text-gray-500">Incluir todos los items de esta área</div>
                          </div>
                        </Label>
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      </div>

                      <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-gray-50">
                        <RadioGroupItem value="custom" id={`${area.id}-${serviceType}-custom`} />
                        <Label htmlFor={`${area.id}-${serviceType}-custom`} className="flex-1 cursor-pointer">
                          <div>
                            <div className="font-semibold">Personalizado</div>
                            <div className="text-sm text-gray-500">Seleccionar items específicos</div>
                          </div>
                        </Label>
                        <Package className="w-5 h-5 text-blue-600" />
                      </div>

                      <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-gray-50">
                        <RadioGroupItem value="not_included" id={`${area.id}-${serviceType}-not-included`} />
                        <Label htmlFor={`${area.id}-${serviceType}-not-included`} className="flex-1 cursor-pointer">
                          <div>
                            <div className="font-semibold">No Incluido</div>
                            <div className="text-sm text-gray-500">Esta área no se limpiará</div>
                          </div>
                        </Label>
                        <X className="w-5 h-5 text-red-600" />
                      </div>
                    </RadioGroup>

                    {currentSelection.selection_type === 'custom' && (
                      <div className="space-y-3">
                        <div className="border rounded-lg p-4 space-y-2 max-h-96 overflow-y-auto">
                          <h4 className="font-semibold mb-3">Selecciona los items a incluir:</h4>
                          {areaItems.map(item => {
                            const isSelected = currentSelection.selected_items.some(i => i.item_name === item.item_name);
                            return (
                              <div key={item.id} className="flex items-start space-x-2 p-2 hover:bg-gray-50 rounded group">
                                <Checkbox 
                                  checked={isSelected}
                                  onCheckedChange={() => handleItemToggle(area.id, item, serviceType)}
                                  id={`item-${item.id}-${serviceType}`}
                                />
                                <Label htmlFor={`item-${item.id}-${serviceType}`} className="flex-1 cursor-pointer">
                                  <div className="font-medium">{item.item_name}</div>
                                  {item.item_description && (
                                    <div className="text-sm text-gray-500">{item.item_description}</div>
                                  )}
                                </Label>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => handleOpenItemDialog(area.id, item)}
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-red-600"
                                    onClick={() => setItemToDelete(item)}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                          {areaItems.length === 0 && (
                            <p className="text-gray-500 text-center py-4">
                              No hay items configurados. Usa "Nuevo Item" para agregar.
                            </p>
                          )}
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor={`notes-${area.id}-${serviceType}`} className="text-sm font-medium">
                            Notas para esta área (opcional)
                          </Label>
                          <Textarea
                            id={`notes-${area.id}-${serviceType}`}
                            placeholder="Agrega notas específicas para esta área..."
                            rows={3}
                            value={
                              serviceType === 'initial' ? (areaNotesInitial[area.id] || '') :
                              serviceType === 'regular' ? (areaNotesRegular[area.id] || '') :
                              (areaNotesCommercial[area.id] || '')
                            }
                            onChange={(e) => {
                              const setter = serviceType === 'initial' ? setAreaNotesInitial :
                                           serviceType === 'regular' ? setAreaNotesRegular :
                                           setAreaNotesCommercial;
                              setter(prev => ({ ...prev, [area.id]: e.target.value }));
                            }}
                            className="resize-none"
                          />
                        </div>
                      </div>
                    )}

                    {currentSelection.selection_type === 'full' && (
                      <div className="space-y-3">
                        <div className="border rounded-lg p-4 bg-green-50">
                          <h4 className="font-semibold mb-3 text-green-800">Todos los items incluidos:</h4>
                          <ul className="space-y-2">
                            {areaItems.map(item => (
                              <li key={item.id} className="flex items-start gap-2 group">
                                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                                <div className="flex-1">
                                  <div className="font-medium">{item.item_name}</div>
                                  {item.item_description && (
                                    <div className="text-sm text-gray-600">{item.item_description}</div>
                                  )}
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => handleOpenItemDialog(area.id, item)}
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-red-600"
                                    onClick={() => setItemToDelete(item)}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor={`notes-${area.id}-${serviceType}`} className="text-sm font-medium">
                            Notas para esta área (opcional)
                          </Label>
                          <Textarea
                            id={`notes-${area.id}-${serviceType}`}
                            placeholder="Agrega notas específicas para esta área..."
                            rows={3}
                            value={
                              serviceType === 'initial' ? (areaNotesInitial[area.id] || '') :
                              serviceType === 'regular' ? (areaNotesRegular[area.id] || '') :
                              (areaNotesCommercial[area.id] || '')
                            }
                            onChange={(e) => {
                              const setter = serviceType === 'initial' ? setAreaNotesInitial :
                                           serviceType === 'regular' ? setAreaNotesRegular :
                                           setAreaNotesCommercial;
                              setter(prev => ({ ...prev, [area.id]: e.target.value }));
                            }}
                            className="resize-none"
                          />
                        </div>
                      </div>
                    )}

                    {currentSelection.selection_type === 'not_included' && (
                      <div className="space-y-3">
                        <div className="border rounded-lg p-4 bg-red-50">
                          <div className="flex items-center gap-2 text-red-800">
                            <X className="w-5 h-5" />
                            <h4 className="font-semibold">Esta área no se incluirá en el servicio</h4>
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor={`notes-${area.id}-${serviceType}`} className="text-sm font-medium">
                            Notas para esta área (opcional)
                          </Label>
                          <Textarea
                            id={`notes-${area.id}-${serviceType}`}
                            placeholder="Agrega notas específicas para esta área..."
                            rows={3}
                            value={
                              serviceType === 'initial' ? (areaNotesInitial[area.id] || '') :
                              serviceType === 'regular' ? (areaNotesRegular[area.id] || '') :
                              (areaNotesCommercial[area.id] || '')
                            }
                            onChange={(e) => {
                              const setter = serviceType === 'initial' ? setAreaNotesInitial :
                                           serviceType === 'regular' ? setAreaNotesRegular :
                                           setAreaNotesCommercial;
                              setter(prev => ({ ...prev, [area.id]: e.target.value }));
                            }}
                            className="resize-none"
                          />
                        </div>
                      </div>
                    )}
                  </TabsContent>
                );
              })}
            </Tabs>
          </CardContent>
        </Card>
      </div>
    );
  };

  const activeServiceTypesCount = [
    hasInitialServices(),
    hasRegularServices(),
    hasCommercialServices()
  ].filter(Boolean).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Itemizar Cotización #{quote.id.slice(-6)}</h1>
          <p className="text-gray-600 mt-1">{client?.name} - {quote.service_address}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to={createPageUrl('Cotizaciones')}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Volver
            </Link>
          </Button>
          <Button onClick={handleSave} disabled={isSaving} variant="outline">
            <Save className="w-4 h-4 mr-2" /> Guardar
          </Button>
          <Button onClick={handleFinalizeSend} disabled={isSending || isSaving} className="bg-green-600 hover:bg-green-700">
            <Send className="w-4 h-4 mr-2" /> Finalizar y Enviar
          </Button>
        </div>
      </div>

      {(hasInitialServices() || hasRegularServices() || hasCommercialServices()) && (
        <Tabs value={activeServiceType} onValueChange={setActiveServiceType}>
          <TabsList className={`grid w-full ${
            activeServiceTypesCount === 1 ? 'grid-cols-1' :
            activeServiceTypesCount === 2 ? 'grid-cols-2' :
            'grid-cols-3'
          }`}>
            {hasInitialServices() && (
              <TabsTrigger value="initial">⭐ Servicios Iniciales</TabsTrigger>
            )}
            {hasRegularServices() && (
              <TabsTrigger value="regular">🔄 Servicios Regulares</TabsTrigger>
            )}
            {hasCommercialServices() && (
              <TabsTrigger value="commercial">🏢 Servicios Comerciales</TabsTrigger>
            )}
          </TabsList>
          
          {hasInitialServices() && (
            <TabsContent value="initial">
              {renderServiceTypeSection('initial')}
            </TabsContent>
          )}
          
          {hasRegularServices() && (
            <TabsContent value="regular">
              {renderServiceTypeSection('regular')}
            </TabsContent>
          )}

          {hasCommercialServices() && (
            <TabsContent value="commercial">
              {renderServiceTypeSection('commercial')}
            </TabsContent>
          )}
        </Tabs>
      )}

      <Dialog open={isItemDialogOpen} onOpenChange={setIsItemDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Editar Item' : 'Nuevo Item'}</DialogTitle>
            <DialogDescription>
              {editingItem ? 'Modifica los detalles del item' : 'Agrega un nuevo item a esta área'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="item_name">Nombre del Item *</Label>
              <Input
                id="item_name"
                value={itemFormData.item_name}
                onChange={(e) => setItemFormData({ ...itemFormData, item_name: e.target.value })}
                placeholder="Ej: Limpiar superficies"
              />
            </div>
            <div>
              <Label htmlFor="item_description">Descripción</Label>
              <Textarea
                id="item_description"
                value={itemFormData.item_description}
                onChange={(e) => setItemFormData({ ...itemFormData, item_description: e.target.value })}
                placeholder="Describe qué incluye este item..."
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="service_type">Tipo de Servicio</Label>
              <Select
                value={itemFormData.service_type}
                onValueChange={(value) => setItemFormData({ ...itemFormData, service_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Inicial y Regular</SelectItem>
                  <SelectItem value="initial">Solo Inicial</SelectItem>
                  <SelectItem value="regular">Solo Regular</SelectItem>
                  <SelectItem value="commercial">Solo Comercial</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsItemDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveItem}>
              {editingItem ? 'Actualizar' : 'Crear'} Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!itemToDelete} onOpenChange={() => setItemToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este item?</AlertDialogTitle>
            <AlertDialogDescription>
              El item "{itemToDelete?.item_name}" será desactivado y no aparecerá en futuras cotizaciones.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteItem} className="bg-red-600 hover:bg-red-700">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}