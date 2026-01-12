import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar, Check, User, MapPin, ExternalLink, FileText, Home, Bed, Bath } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function ZenMaidTransferItem({ transfer, clientInfo, quote, onComplete }) {
  const [selectedDate, setSelectedDate] = useState('');

  const handleComplete = () => {
    onComplete(transfer.id, selectedDate);
  };

  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <h4 className="font-bold text-gray-900 flex items-center gap-2">
            <User className="w-4 h-4 text-gray-400"/>
            {transfer.client_name}
          </h4>
          
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600">
            <div><span className="font-medium">Email:</span> {clientInfo.email || quote?.client_email || 'N/A'}</div>
            <div><span className="font-medium">Teléfono:</span> {clientInfo.mobile_number || quote?.client_phone || 'N/A'}</div>
            <div className="col-span-1 sm:col-span-2">
              <span className="font-medium">Dir. Cliente:</span> {clientInfo.address || 'N/A'}
            </div>
            <div className="col-span-1 sm:col-span-2">
              <span className="font-medium flex items-center gap-1">
                <MapPin className="w-3 h-3"/>Dir. Servicio:
              </span> {transfer.service_address}
            </div>
          </div>

          {quote && (
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {quote.property_type && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <Home className="w-3 h-3" />
                  {quote.property_type}
                </Badge>
              )}
              {quote.num_bedrooms && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <Bed className="w-3 h-3" />
                  {quote.num_bedrooms} hab
                </Badge>
              )}
              {quote.num_bathrooms && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <Bath className="w-3 h-3" />
                  {quote.num_bathrooms} baños
                </Badge>
              )}
              {quote.service_frequency && (
                <Badge variant="outline">
                  {quote.service_frequency === 'weekly' ? 'Semanal' :
                   quote.service_frequency === 'fortnightly' ? 'Quincenal' :
                   quote.service_frequency === 'every_3_weeks' ? 'Cada 3 sem' :
                   quote.service_frequency === 'monthly' ? 'Mensual' : 'One-off'}
                </Badge>
              )}
            </div>
          )}
          
          <div className="flex flex-wrap gap-1 mt-3">
            {transfer.selected_services?.map(s => 
              <Badge key={s.service_name} className="text-xs bg-teal-100 text-teal-800">
                {s.service_name}
              </Badge>
            )}
          </div>
          
          {transfer.total_price_min && transfer.total_price_max && (
            <p className="text-sm font-semibold text-teal-700 mt-2">
              Precio: ${transfer.total_price_min} - ${transfer.total_price_max}
            </p>
          )}

          {quote?.notes && (
            <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs">
              <span className="font-medium">Notas: </span>
              {quote.notes}
            </div>
          )}

          {transfer.scheduling_notes && (
            <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs">
              <span className="font-medium">📋 Notas para agendar: </span>
              {transfer.scheduling_notes}
            </div>
          )}
        </div>
        
        <div className="flex flex-col gap-2">
          {quote?.quote_pdf_url && (
            <Button 
              variant="outline" 
              size="icon" 
              className="h-8 w-8"
              onClick={() => window.open(quote.quote_pdf_url, '_blank')}
              title="Ver PDF de la cotización"
            >
              <FileText className="w-4 h-4 text-blue-600" />
            </Button>
          )}
          <Link to={createPageUrl(`QuoteDetail?id=${transfer.quote_id}`)} target="_blank">
            <Button variant="outline" size="icon" className="h-8 w-8" title="Ver detalles">
              <ExternalLink className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t">
        <Label htmlFor={`date-${transfer.id}`} className="text-sm font-medium flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Fecha del Servicio
        </Label>
        <div className="flex gap-2 mt-2">
          <Input
            id={`date-${transfer.id}`}
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="flex-1"
          />
          <Button 
            onClick={handleComplete}
            disabled={!selectedDate}
            className="bg-teal-600 hover:bg-teal-700"
          >
            <Check className="w-4 h-4 mr-2" />
            Agendar
          </Button>
        </div>
      </div>
    </Card>
  );
}