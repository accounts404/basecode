import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, UserPlus } from 'lucide-react';

export default function AcceptedServicesDialog({ open, onOpenChange, quote, onConfirm, onCreateClient }) {
  const [selectedServices, setSelectedServices] = useState([]);
  const [schedulingNotes, setSchedulingNotes] = useState('');

  const handleToggleService = (service) => {
    setSelectedServices(prev => {
      const exists = prev.find(s => 
        s.service_name === service.service_name && 
        s.service_type === service.service_type
      );
      
      if (exists) {
        return prev.filter(s => 
          !(s.service_name === service.service_name && s.service_type === service.service_type)
        );
      } else {
        return [...prev, service];
      }
    });
  };

  const isServiceSelected = (service) => {
    return selectedServices.some(s => 
      s.service_name === service.service_name && 
      s.service_type === service.service_type
    );
  };

  const handleConfirm = () => {
    if (selectedServices.length === 0) {
      return;
    }
    onConfirm(selectedServices, schedulingNotes);
    setSchedulingNotes('');
  };

  const initialServices = quote?.selected_services?.filter(s => s.service_type === 'initial') || [];
  const regularServices = quote?.selected_services?.filter(s => s.service_type === 'regular') || [];
  const commercialServices = quote?.selected_services?.filter(s => s.service_type === 'commercial') || [];

  const hasMultipleServices = (quote?.selected_services?.length || 0) > 1;
  const needsClientCreation = quote && !quote.client_id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Servicios Aceptados por el Cliente</DialogTitle>
          <DialogDescription>
            Selecciona cuáles servicios de la cotización el cliente aceptó. Solo estos se incluirán en ZenMaid.
          </DialogDescription>
        </DialogHeader>

        {needsClientCreation && (
          <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-amber-900 font-semibold mb-2">
                Cliente Temporal - Requiere Crear Cliente
              </p>
              <p className="text-sm text-amber-800 mb-3">
                Esta cotización tiene datos de un cliente nuevo que aún no existe en la base de datos.
                Debes crear el cliente antes de poder agendar.
              </p>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  if (onCreateClient) onCreateClient();
                }}
                className="border-amber-400 text-amber-700 hover:bg-amber-100"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Crear Cliente Ahora
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-6 py-4">
          {!hasMultipleServices && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-blue-900">
                Esta cotización tiene solo un servicio. Se seleccionará automáticamente.
              </p>
            </div>
          )}

          {initialServices.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-orange-200"></div>
                <h3 className="text-sm font-semibold text-orange-700 uppercase">Servicios Iniciales</h3>
                <div className="h-px flex-1 bg-orange-200"></div>
              </div>
              <div className="space-y-2">
                {initialServices.map((service, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 border rounded-lg hover:bg-orange-50 transition-colors">
                    <Checkbox
                      checked={isServiceSelected(service)}
                      onCheckedChange={() => handleToggleService(service)}
                      id={`service-${service.service_type}-${idx}`}
                    />
                    <Label 
                      htmlFor={`service-${service.service_type}-${idx}`} 
                      className="flex-1 cursor-pointer"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{service.service_name}</span>
                        <Badge variant="default" className="bg-orange-600">Inicial</Badge>
                      </div>
                      <div className="text-sm text-gray-600">
                        ${service.price_min} - ${service.price_max}
                      </div>
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {regularServices.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-green-200"></div>
                <h3 className="text-sm font-semibold text-green-700 uppercase">Servicios Regulares</h3>
                <div className="h-px flex-1 bg-green-200"></div>
              </div>
              <div className="space-y-2">
                {regularServices.map((service, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 border rounded-lg hover:bg-green-50 transition-colors">
                    <Checkbox
                      checked={isServiceSelected(service)}
                      onCheckedChange={() => handleToggleService(service)}
                      id={`service-${service.service_type}-${idx}`}
                    />
                    <Label 
                      htmlFor={`service-${service.service_type}-${idx}`} 
                      className="flex-1 cursor-pointer"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{service.service_name}</span>
                        <Badge variant="secondary" className="bg-green-600 text-white">Regular</Badge>
                      </div>
                      <div className="text-sm text-gray-600">
                        ${service.price_min} - ${service.price_max}
                      </div>
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {commercialServices.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-purple-200"></div>
                <h3 className="text-sm font-semibold text-purple-700 uppercase">Servicios Comerciales</h3>
                <div className="h-px flex-1 bg-purple-200"></div>
              </div>
              <div className="space-y-2">
                {commercialServices.map((service, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 border rounded-lg hover:bg-purple-50 transition-colors">
                    <Checkbox
                      checked={isServiceSelected(service)}
                      onCheckedChange={() => handleToggleService(service)}
                      id={`service-${service.service_type}-${idx}`}
                    />
                    <Label 
                      htmlFor={`service-${service.service_type}-${idx}`} 
                      className="flex-1 cursor-pointer"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{service.service_name}</span>
                        <Badge variant="outline" className="border-purple-600 text-purple-700">Comercial</Badge>
                      </div>
                      <div className="text-sm text-gray-600">
                        ${service.price_min} - ${service.price_max}
                      </div>
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2 pt-4 border-t">
          <Label htmlFor="scheduling-notes" className="text-sm font-medium">
            Notas para Agendar (opcional)
          </Label>
          <Textarea
            id="scheduling-notes"
            placeholder="Agrega instrucciones o detalles importantes para quien agendará el servicio..."
            rows={3}
            value={schedulingNotes}
            onChange={(e) => setSchedulingNotes(e.target.value)}
            className="resize-none"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={selectedServices.length === 0}
            className="bg-green-600 hover:bg-green-700"
          >
            Confirmar ({selectedServices.length} {selectedServices.length === 1 ? 'servicio' : 'servicios'})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}