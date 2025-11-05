
import React, { useState, useMemo, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Trash2, PlusCircle, AlertTriangle, DollarSign, TrendingUp, Calendar, Calculator, Info, Wind, Zap, FileText, CheckCircle, Flame, Snowflake, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const frequencyLabels = {
  weekly: "Semanal",
  fortnightly: "Quincenal",
  every_3_weeks: "Cada 3 semanas",
  monthly: "Mensual",
  one_off: "Servicio único"
};

const gstTypeLabels = {
  inclusive: "GST Incluido",
  exclusive: "GST Exclusivo",
  no_tax: "Sin Impuestos"
};

const calculateGST = (price, gstType) => {
  const numPrice = parseFloat(price) || 0;

  switch (gstType) {
    case 'inclusive':
      const baseInclusive = numPrice / 1.1;
      return {
        base: baseInclusive,
        gst: numPrice - baseInclusive,
        total: numPrice
      };
    case 'exclusive':
      const gstExclusive = numPrice * 0.1;
      return {
        base: numPrice,
        gst: gstExclusive,
        total: numPrice + gstExclusive
      };
    case 'no_tax':
      return {
        base: numPrice,
        gst: 0,
        total: numPrice
      };
    default:
      return {
        base: numPrice,
        gst: 0,
        total: numPrice
      };
  }
};

// Service History Manager Component for Windows/Steam Vacuum
function ServiceHistoryManager({
  title,
  icon,
  services = [],
  onServicesChange,
  clientInitialGstType = "inclusive"
}) {
  const [newService, setNewService] = useState({
    service_date: "",
    amount_charged: "",
    service_description: "",
    gst_type: clientInitialGstType
  });
  const [error, setError] = useState('');

  const sortedServices = useMemo(() => {
    return [...services].sort((a, b) => new Date(b.service_date) - new Date(a.service_date));
  }, [services]);

  const latestService = sortedServices.length > 0 ? sortedServices[0] : null;

  const newServiceGSTBreakdown = useMemo(() => {
    return calculateGST(newService.amount_charged, newService.gst_type);
  }, [newService.amount_charged, newService.gst_type]);

  const handleAddService = () => {
    if (!newService.service_date || !newService.amount_charged || !newService.service_description) {
      setError('Por favor, completa todos los campos obligatorios.');
      return;
    }

    const serviceValue = parseFloat(newService.amount_charged);
    if (serviceValue <= 0) {
      setError('El monto debe ser un número positivo.');
      return;
    }

    const service = {
      service_date: newService.service_date,
      amount_charged: serviceValue,
      service_description: newService.service_description.trim(),
      gst_type: newService.gst_type
    };

    const updatedServices = [...services, service];
    onServicesChange(updatedServices);

    setNewService({
      service_date: "",
      amount_charged: "",
      service_description: "",
      gst_type: clientInitialGstType
    });
    setError('');
  };

  const handleDeleteService = (serviceToDelete) => {
    const updatedServices = services.filter(
      service => !(service.service_date === serviceToDelete.service_date && 
                   service.amount_charged === serviceToDelete.amount_charged &&
                   service.service_description === serviceToDelete.service_description)
    );
    onServicesChange(updatedServices);
  };

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          {icon}
          {title}
        </CardTitle>
        {latestService && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-blue-600" />
              <h5 className="font-semibold text-blue-900">Último Servicio Realizado</h5>
            </div>
            <div className="text-sm space-y-1 text-blue-800">
              <p><span className="font-medium">Fecha:</span> {format(new Date(latestService.service_date), "d MMM yyyy", { locale: es })}</p>
              <p><span className="font-medium">Monto:</span> ${latestService.amount_charged.toFixed(2)} AUD ({gstTypeLabels[latestService.gst_type]})</p>
              <p><span className="font-medium">Trabajo realizado:</span> {latestService.service_description}</p>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add New Service Form */}
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="add-service">
            <AccordionTrigger className="bg-slate-50 hover:bg-slate-100 px-4 rounded-lg">
              <span className="flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-green-600" />
                Registrar Nuevo Servicio
              </span>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`${title.replace(/\s/g, '_')}_service_date`}>Fecha del Servicio</Label>
                    <Input
                      id={`${title.replace(/\s/g, '_')}_service_date`}
                      type="date"
                      value={newService.service_date}
                      onChange={(e) => setNewService(prev => ({ ...prev, service_date: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${title.replace(/\s/g, '_')}_amount_charged`}>Monto Cobrado (AUD)</Label>
                    <Input
                      id={`${title.replace(/\s/g, '_')}_amount_charged`}
                      type="number"
                      step="0.01"
                      min="0"
                      value={newService.amount_charged}
                      onChange={(e) => setNewService(prev => ({ ...prev, amount_charged: e.target.value }))}
                      placeholder="Ej: 250.00"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`${title.replace(/\s/g, '_')}_gst_type`}>Tipo de GST</Label>
                  <Select
                    value={newService.gst_type}
                    onValueChange={(value) => setNewService(prev => ({ ...prev, gst_type: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar tipo de GST" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(gstTypeLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Preview del GST */}
                {newService.amount_charged && parseFloat(newService.amount_charged) > 0 && (
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Calculator className="w-4 h-4 text-blue-600" />
                      <h5 className="font-semibold text-blue-900">Desglose GST</h5>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div className="text-center">
                        <p className="text-blue-700 font-medium">Base</p>
                        <p className="font-bold text-blue-900">${newServiceGSTBreakdown.base.toFixed(2)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-blue-700 font-medium">GST</p>
                        <p className="font-bold text-blue-900">${newServiceGSTBreakdown.gst.toFixed(2)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-blue-700 font-medium">Total</p>
                        <p className="font-bold text-blue-900">${newServiceGSTBreakdown.total.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor={`${title.replace(/\s/g, '_')}_service_description`}>Descripción del Trabajo Realizado</Label>
                  <Textarea
                    id={`${title.replace(/\s/g, '_')}_service_description`}
                    value={newService.service_description}
                    onChange={(e) => setNewService(prev => ({ ...prev, service_description: e.target.value }))}
                    placeholder="Ej: Limpieza de 10 ventanas exteriores e interiores, planta baja y primer piso"
                    rows={3}
                  />
                </div>

                {error && (
                  <div className="text-red-600 text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    {error}
                  </div>
                )}

                <Button onClick={handleAddService} className="w-full">
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Registrar Servicio
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Service History */}
        <div className="mt-8">
          <h4 className="text-md font-semibold mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4 text-purple-600" /> 
            Historial de Servicios Realizados
          </h4>
          {sortedServices.length > 0 ? (
            <div className="space-y-3">
              {sortedServices.map((service, index) => {
                const serviceBreakdown = calculateGST(service.amount_charged, service.gst_type);

                return (
                  <div key={`${service.service_date}-${service.amount_charged}-${index}`} className="bg-slate-50 rounded-lg border p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-4 mb-2">
                          <span className="font-bold text-lg text-slate-800">
                            ${service.amount_charged.toFixed(2)}
                          </span>
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {gstTypeLabels[service.gst_type]}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 mb-2">
                          <strong>Fecha:</strong> {format(new Date(service.service_date), "d MMM, yyyy", { locale: es })}
                        </p>
                        <p className="text-sm text-slate-600 mb-3">
                          <strong>Trabajo realizado:</strong> {service.service_description}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteService(service)}
                        className="text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Desglose GST del servicio */}
                    <div className="grid grid-cols-3 gap-4 pt-3 border-t border-slate-200">
                      <div className="text-center">
                        <p className="text-xs font-medium text-slate-500 uppercase">Base (sin GST)</p>
                        <p className="text-sm font-semibold text-slate-900">${serviceBreakdown.base.toFixed(2)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs font-medium text-slate-500 uppercase">GST (10%)</p>
                        <p className="text-sm font-semibold text-slate-900">${serviceBreakdown.gst.toFixed(2)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs font-medium text-slate-500 uppercase">Total Cliente</p>
                        <p className="text-sm font-semibold text-slate-900">${serviceBreakdown.total.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-center text-slate-500 italic py-4">No hay servicios registrados aún.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Price Configuration Section for Recurrent Services (MODIFICADO)
function PriceConfigurationSection({
  title,
  icon,
  initialData,
  onDataChange,
  showHourlyRate = false,
  serviceHours = "",
  clientInitialGstType = "inclusive"
}) {
  const [currentPrice, setCurrentPrice] = useState(initialData.price);
  const [currentGstType, setCurrentGstType] = useState(initialData.gst_type);
  // FIX: Ensure priceHistory is always an array
  const [priceHistory, setPriceHistory] = useState(initialData.history || []);

  const [newIncrement, setNewIncrement] = useState({
    new_price: "",
    effective_date: "",
    comments: "",
    gst_type: initialData.gst_type || "inclusive"
  });

  const [error, setError] = useState('');

  React.useEffect(() => {
    setCurrentPrice(initialData.price);
    setCurrentGstType(initialData.gst_type);
    // FIX: Ensure priceHistory is always an array when data changes
    setPriceHistory(initialData.history || []);
    setNewIncrement(prev => ({
      ...prev,
      gst_type: initialData.gst_type || "inclusive"
    }));
  }, [initialData]);

  const sortedHistory = useMemo(() => {
    // The state is now guaranteed to be an array, so this is safe
    return [...priceHistory].sort((a, b) => new Date(b.effective_date) - new Date(a.effective_date));
  }, [priceHistory]);

  const currentGSTBreakdown = useMemo(() => {
    return calculateGST(currentPrice, currentGstType);
  }, [currentPrice, currentGstType]);

  const currentHourlyRate = useMemo(() => {
    if (showHourlyRate && serviceHours && parseFloat(serviceHours) > 0) {
      return (currentGSTBreakdown.base / parseFloat(serviceHours)).toFixed(2);
    }
    return 0;
  }, [showHourlyRate, currentGSTBreakdown.base, serviceHours]);

  const newIncrementGSTBreakdown = useMemo(() => {
    return calculateGST(newIncrement.new_price, newIncrement.gst_type);
  }, [newIncrement.new_price, newIncrement.gst_type]);

  const handlePriceChange = (e) => {
    const newPrice = e.target.value;
    setCurrentPrice(newPrice);
    onDataChange({ price: newPrice, gst_type: currentGstType, history: priceHistory });
  };

  const handleGstTypeChange = (value) => {
    setCurrentGstType(value);
    onDataChange({ price: currentPrice, gst_type: value, history: priceHistory });
  };

  const handleAddIncrement = () => {
    if (!newIncrement.new_price || !newIncrement.effective_date) {
      setError('Por favor, completa el nuevo precio y la fecha.');
      return;
    }

    const newPriceValue = parseFloat(newIncrement.new_price);
    const currentPriceValue = parseFloat(currentPrice) || 0;

    if (newPriceValue <= 0) {
      setError('El nuevo precio debe ser un número positivo.');
      return;
    }

    const currentBasePrice = calculateGST(currentPriceValue, currentGstType).base;
    const newIncrementBasePrice = calculateGST(newPriceValue, newIncrement.gst_type).base;

    const percentageIncrease = currentBasePrice > 0 ? ((newIncrementBasePrice - currentBasePrice) / currentBasePrice * 100) : 0;

    const increment = {
      previous_price: currentPriceValue,
      new_price: newPriceValue,
      effective_date: newIncrement.effective_date,
      percentage_increase: Math.round(percentageIncrease * 100) / 100,
      comments: newIncrement.comments.trim(),
      gst_type: newIncrement.gst_type
    };

    const newHistory = [...priceHistory, increment];

    setCurrentPrice(newPriceValue.toString());
    setCurrentGstType(newIncrement.gst_type);
    setPriceHistory(newHistory);

    onDataChange({
      price: newPriceValue.toString(),
      gst_type: newIncrement.gst_type,
      history: newHistory,
    });

    setNewIncrement({
      new_price: "",
      effective_date: "",
      comments: "",
      gst_type: newIncrement.gst_type
    });
    setError('');
  };

  const handleDeleteIncrement = (incrementToDelete) => {
    const updatedHistory = priceHistory.filter(
      inc => !(inc.effective_date === incrementToDelete.effective_date && inc.new_price === incrementToDelete.new_price)
    );

    let newCurrentPriceValue;
    let newGstTypeValue;

    if (updatedHistory.length > 0) {
      const newSortedHistory = [...updatedHistory].sort((a, b) => new Date(b.effective_date) - new Date(a.effective_date));
      const latestIncrement = newSortedHistory[0];

      newCurrentPriceValue = latestIncrement.new_price;
      newGstTypeValue = latestIncrement.gst_type;
    } else {
      if (incrementToDelete && typeof incrementToDelete.previous_price !== 'undefined') {
        newCurrentPriceValue = incrementToDelete.previous_price;
        newGstTypeValue = clientInitialGstType;
      } else {
        newCurrentPriceValue = 0;
        newGstTypeValue = clientInitialGstType;
      }
    }

    setCurrentPrice(newCurrentPriceValue.toString());
    setCurrentGstType(newGstTypeValue);
    setPriceHistory(updatedHistory);

    onDataChange({
      price: newCurrentPriceValue.toString(),
      gst_type: newGstTypeValue,
      history: updatedHistory,
    });
  };

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor={`${title.replace(/\s/g, '_')}_price`}>Precio (AUD)</Label>
            <Input
              id={`${title.replace(/\s/g, '_')}_price`}
              type="number"
              step="0.01"
              min="0"
              value={currentPrice}
              onChange={handlePriceChange}
              placeholder="Ej: 200.00"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${title.replace(/\s/g, '_')}_gst_type`}>Tipo de GST</Label>
            <Select
              value={currentGstType}
              onValueChange={handleGstTypeChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar tipo de GST" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(gstTypeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* GST Breakdown Display */}
        {currentPrice && parseFloat(currentPrice) > 0 && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Info className="w-5 h-5 text-green-600" />
              <h4 className="font-semibold text-green-900">Desglose de GST</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded-lg border border-green-200">
                <p className="text-sm text-green-700 font-medium">Valor Base (Sin GST)</p>
                <p className="text-2xl font-bold text-green-900">${currentGSTBreakdown.base.toFixed(2)}</p>
              </div>
              <div className="bg-white p-4 rounded-lg border border-green-200">
                <p className="text-sm text-green-700 font-medium">GST (10%)</p>
                <p className="text-2xl font-bold text-green-900">${currentGSTBreakdown.gst.toFixed(2)}</p>
              </div>
              <div className="bg-white p-4 rounded-lg border border-green-200">
                <p className="text-sm text-green-700 font-medium">Total al Cliente</p>
                <p className="text-2xl font-bold text-green-900">${currentGSTBreakdown.total.toFixed(2)}</p>
              </div>
            </div>
            {showHourlyRate && serviceHours && parseFloat(serviceHours) > 0 && (
              <div className="mt-4 pt-4 border-t border-green-200">
                <p className="text-sm text-green-700 font-medium">Valor por Hora (Base sin GST)</p>
                <p className="text-xl font-bold text-green-900">${currentHourlyRate}/hora</p>
              </div>
            )}
          </div>
        )}

        {/* Add/Manage Increments - SIN ACCORDION para mejor visibilidad */}
        <div className="border border-slate-200 rounded-lg">
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 rounded-t-lg">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-600" />
              <h3 className="font-semibold text-slate-900">Gestionar Incrementos de Precio</h3>
            </div>
          </div>
          
          <div className="p-4">
            {/* Contenedor con altura máxima y scroll */}
            <div className="max-h-[500px] overflow-y-auto border border-slate-200 rounded-lg bg-slate-50 p-4">
              <div className="space-y-4">
                {/* Formulario de nuevo incremento */}
                <div className="bg-white p-4 rounded-lg border border-slate-300 shadow-sm">
                  <h4 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                    <PlusCircle className="w-4 h-4 text-green-600" />
                    Añadir Nuevo Incremento
                  </h4>
                  
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor={`${title.replace(/\s/g, '_')}_new_price`}>Nuevo Precio (AUD)</Label>
                        <Input
                          id={`${title.replace(/\s/g, '_')}_new_price`}
                          type="number"
                          step="0.01"
                          min="0"
                          value={newIncrement.new_price}
                          onChange={(e) => setNewIncrement(prev => ({ ...prev, new_price: e.target.value }))}
                          placeholder="Ej: 220.00"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`${title.replace(/\s/g, '_')}_effective_date`}>Fecha Efectiva</Label>
                        <Input
                          id={`${title.replace(/\s/g, '_')}_effective_date`}
                          type="date"
                          value={newIncrement.effective_date}
                          onChange={(e) => setNewIncrement(prev => ({ ...prev, effective_date: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`${title.replace(/\s/g, '_')}_increment_gst_type`}>Tipo de GST para Nuevo Precio</Label>
                      <Select
                        value={newIncrement.gst_type}
                        onValueChange={(value) => setNewIncrement(prev => ({ ...prev, gst_type: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar tipo de GST" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(gstTypeLabels).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Preview del nuevo incremento con GST */}
                    {newIncrement.new_price && parseFloat(newIncrement.new_price) > 0 && (
                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Calculator className="w-4 h-4 text-blue-600" />
                          <h5 className="font-semibold text-blue-900">Preview del Nuevo Precio</h5>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-sm">
                          <div className="text-center">
                            <p className="text-blue-700 font-medium">Base</p>
                            <p className="font-bold text-blue-900">${newIncrementGSTBreakdown.base.toFixed(2)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-blue-700 font-medium">GST</p>
                            <p className="font-bold text-blue-900">${newIncrementGSTBreakdown.gst.toFixed(2)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-blue-700 font-medium">Total</p>
                            <p className="font-bold text-blue-900">${newIncrementGSTBreakdown.total.toFixed(2)}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor={`${title.replace(/\s/g, '_')}_comments`}>Comentarios del Incremento</Label>
                      <Textarea
                        id={`${title.replace(/\s/g, '_')}_comments`}
                        value={newIncrement.comments}
                        onChange={(e) => setNewIncrement(prev => ({ ...prev, comments: e.target.value }))}
                        placeholder="Ej: Aumento anual por inflación, servicios adicionales, etc."
                        rows={3}
                      />
                    </div>

                    {error && (
                      <div className="text-red-600 text-sm flex items-center gap-2 bg-red-50 p-3 rounded-lg border border-red-200">
                        <AlertTriangle className="w-4 h-4" />
                        {error}
                      </div>
                    )}

                    <Button onClick={handleAddIncrement} className="w-full bg-green-600 hover:bg-green-700">
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Añadir Incremento
                    </Button>
                  </div>
                </div>

                {/* Historial de Incrementos */}
                <div className="bg-white p-4 rounded-lg border border-slate-300 shadow-sm">
                  <h4 className="text-md font-semibold mb-4 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-purple-600" /> 
                    Historial de Incrementos ({sortedHistory.length})
                  </h4>
                  
                  {sortedHistory.length > 0 ? (
                    <div className="space-y-3">
                      {sortedHistory.map((increment, index) => {
                        const prevBreakdown = calculateGST(increment.previous_price, increment.gst_type || currentGstType);
                        const newBreakdown = calculateGST(increment.new_price, increment.gst_type || currentGstType);

                        return (
                          <div key={`${increment.effective_date}-${increment.new_price}-${index}`} className="bg-slate-50 rounded-lg border p-4">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <TrendingUp className="w-5 h-5 text-green-500" />
                                <div>
                                  <div className="flex items-center gap-4 mb-1">
                                    <span className="font-bold text-lg text-slate-800">
                                      ${increment.previous_price?.toFixed(2)} → ${increment.new_price?.toFixed(2)}
                                    </span>
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                      increment.percentage_increase >= 0
                                        ? 'bg-green-100 text-green-800'
                                        : 'bg-red-100 text-red-800'
                                    }`}>
                                      {increment.percentage_increase >= 0 ? '+' : ''}{increment.percentage_increase?.toFixed(1)}%
                                    </span>
                                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                      {gstTypeLabels[increment.gst_type || currentGstType]}
                                    </span>
                                  </div>
                                  <p className="text-sm text-slate-600 mb-2">
                                    Efectivo desde: {format(new Date(increment.effective_date), "d MMM, yyyy", { locale: es })}
                                  </p>
                                  {increment.comments && (
                                    <p className="text-sm text-slate-500 italic">"{increment.comments}"</p>
                                  )}
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteIncrement(increment)}
                                className="text-red-500 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>

                            {/* Desglose GST del incremento */}
                            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-200">
                              <div className="space-y-2">
                                <p className="text-xs font-medium text-slate-500 uppercase">Precio Anterior</p>
                                <div className="text-sm space-y-1">
                                  <p><span className="font-medium">Base:</span> ${prevBreakdown.base.toFixed(2)}</p>
                                  <p><span className="font-medium">GST:</span> ${prevBreakdown.gst.toFixed(2)}</p>
                                  <p><span className="font-medium">Total:</span> ${prevBreakdown.total.toFixed(2)}</p>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <p className="text-xs font-medium text-slate-500 uppercase">Precio Nuevo</p>
                                <div className="text-sm space-y-1">
                                  <p><span className="font-medium">Base:</span> ${newBreakdown.base.toFixed(2)}</p>
                                  <p><span className="font-medium">GST:</span> ${newBreakdown.gst.toFixed(2)}</p>
                                  <p><span className="font-medium">Total:</span> ${newBreakdown.total.toFixed(2)}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-center text-slate-500 italic py-8 bg-slate-50 rounded-lg border border-slate-200">
                      No hay historial de incrementos.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ServicePriceManager({ client, onUpdate }) {
  // Pass state up via onUpdate instead of local state and onSave/onCancel
  
  const handleRecurrentDataChange = useCallback((data) => {
    onUpdate({
      current_service_price: parseFloat(data.price) || null,
      gst_type: data.gst_type,
      price_history: data.history
    });
  }, [onUpdate]);

  const handleWindowsServicesChange = useCallback((services) => {
    onUpdate({ windows_cleaning_services: services });
  }, [onUpdate]);

  const handleSteamVacuumServicesChange = useCallback((services) => {
    onUpdate({ steam_vacuum_services: services });
  }, [onUpdate]);

  const handleFridgeServicesChange = useCallback((services) => {
    onUpdate({ fridge_cleaning_services: services });
  }, [onUpdate]);

  const handleSpringServicesChange = useCallback((services) => {
    onUpdate({ spring_cleaning_services: services });
  }, [onUpdate]);

  const handleOvenServicesChange = useCallback((services) => {
    onUpdate({ oven_cleaning_services: services });
  }, [onUpdate]);

  return (
    <div className="p-1">
      <div className="space-y-6">

        {/* Recurrent Service Configuration */}
        <Accordion type="single" collapsible defaultValue="recurrent" className="w-full">
          <AccordionItem value="recurrent">
            <AccordionTrigger className="bg-blue-50 hover:bg-blue-100 px-4 rounded-lg text-lg font-semibold text-blue-800">
              <span className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Servicio Recurrente
              </span>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="service_frequency">Frecuencia del Servicio</Label>
                    <Select
                      value={client.service_frequency || ""}
                      onValueChange={(value) => onUpdate({ service_frequency: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar frecuencia" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(frequencyLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="service_hours">Horas por Servicio</Label>
                    <Input
                      id="service_hours"
                      type="number"
                      step="0.25"
                      min="0"
                      value={client.service_hours || ""}
                      onChange={(e) => onUpdate({ service_hours: parseFloat(e.target.value) || null })}
                      placeholder="Ej: 8"
                    />
                  </div>
                </div>
                <PriceConfigurationSection
                  title="Precio y Configuración GST"
                  icon={<Calculator className="w-5 h-5 text-green-600" />}
                  initialData={{
                    price: client.current_service_price,
                    gst_type: client.gst_type,
                    history: client.price_history
                  }}
                  onDataChange={handleRecurrentDataChange}
                  showHourlyRate={true}
                  serviceHours={client.service_hours}
                  clientInitialGstType={client.gst_type || "inclusive"}
                />
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Additional Services Title */}
        <h3 className="text-xl font-bold text-slate-700 pt-4 border-t">Historial de Servicios Adicionales</h3>

        {/* Windows Cleaning Services */}
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="windows">
            <AccordionTrigger className="bg-indigo-50 hover:bg-indigo-100 px-4 rounded-lg text-lg font-semibold text-indigo-800">
              <span className="flex items-center gap-2">
                <Wind className="w-5 h-5" />
                Limpieza de Ventanas
              </span>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <ServiceHistoryManager
                title="Servicios de Limpieza de Ventanas"
                icon={<Wind className="w-5 h-5 text-indigo-600" />}
                services={client.windows_cleaning_services}
                onServicesChange={handleWindowsServicesChange}
                clientInitialGstType={client.gst_type || "inclusive"}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Steam Vacuum Services */}
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="steam_vacuum">
            <AccordionTrigger className="bg-purple-50 hover:bg-purple-100 px-4 rounded-lg text-lg font-semibold text-purple-800">
              <span className="flex items-center gap-2">
                <Zap className="w-5 h-5" />
                Vapor / Aspirado
              </span>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <ServiceHistoryManager
                title="Servicios de Vapor/Aspirado"
                icon={<Zap className="w-5 h-5 text-purple-600" />}
                services={client.steam_vacuum_services}
                onServicesChange={handleSteamVacuumServicesChange}
                clientInitialGstType={client.gst_type || "inclusive"}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Fridge Cleaning Services */}
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="fridge_cleaning">
            <AccordionTrigger className="bg-cyan-50 hover:bg-cyan-100 px-4 rounded-lg text-lg font-semibold text-cyan-800">
              <span className="flex items-center gap-2">
                <Snowflake className="w-5 h-5" />
                Limpieza de Nevera
              </span>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <ServiceHistoryManager
                title="Servicios de Limpieza de Nevera"
                icon={<Snowflake className="w-5 h-5 text-cyan-600" />}
                services={client.fridge_cleaning_services || []}
                onServicesChange={handleFridgeServicesChange}
                clientInitialGstType={client.gst_type || "inclusive"}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        
        {/* Spring Cleaning Services */}
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="spring_cleaning">
            <AccordionTrigger className="bg-emerald-50 hover:bg-emerald-100 px-4 rounded-lg text-lg font-semibold text-emerald-800">
              <span className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                Limpieza de Primavera
              </span>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <ServiceHistoryManager
                title="Servicios de Limpieza de Primavera"
                icon={<Sparkles className="w-5 h-5 text-emerald-600" />}
                services={client.spring_cleaning_services || []}
                onServicesChange={handleSpringServicesChange}
                clientInitialGstType={client.gst_type || "inclusive"}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Oven Cleaning Services */}
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="oven_cleaning">
            <AccordionTrigger className="bg-orange-50 hover:bg-orange-100 px-4 rounded-lg text-lg font-semibold text-orange-800">
              <span className="flex items-center gap-2">
                <Flame className="w-5 h-5" />
                Limpieza de Horno
              </span>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <ServiceHistoryManager
                title="Servicios de Limpieza de Horno"
                icon={<Flame className="w-5 h-5 text-orange-600" />}
                services={client.oven_cleaning_services || []}
                onServicesChange={handleOvenServicesChange}
                clientInitialGstType={client.gst_type || "inclusive"}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>

      </div>

      {/* The save/cancel buttons are now in the parent Clientes.jsx dialog */}
    </div>
  );
}
