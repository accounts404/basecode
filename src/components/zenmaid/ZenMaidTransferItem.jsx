import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar, Check, User, MapPin, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function ZenMaidTransferItem({ transfer, clientInfo, onComplete }) {
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
            <div><span className="font-medium">Email:</span> {clientInfo.email || 'N/A'}</div>
            <div><span className="font-medium">Teléfono:</span> {clientInfo.mobile_number || 'N/A'}</div>
            <div className="col-span-1 sm:col-span-2">
              <span className="font-medium">Dir. Cliente:</span> {clientInfo.address || 'N/A'}
            </div>
            <div className="col-span-1 sm:col-span-2">
              <span className="font-medium flex items-center gap-1">
                <MapPin className="w-3 h-3"/>Dir. Servicio:
              </span> {transfer.service_address}
            </div>
          </div>
          
          <div className="flex flex-wrap gap-1 mt-2">
            {transfer.selected_services?.map(s => 
              <Badge key={s.service_name} variant="secondary" className="text-xs">
                {s.service_name}
              </Badge>
            )}
          </div>
          
          {transfer.total_price_min && transfer.total_price_max && (
            <p className="text-sm font-semibold text-teal-700 mt-2">
              ${transfer.total_price_min} - ${transfer.total_price_max}
            </p>
          )}
        </div>
        
        <Link to={createPageUrl(`QuoteDetail?id=${transfer.quote_id}`)} target="_blank">
          <Button variant="outline" size="icon" className="h-8 w-8">
            <ExternalLink className="w-4 h-4" />
          </Button>
        </Link>
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