import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Clock } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function TopClients({ entries }) {
  const getTopClients = () => {
    const clientTotals = entries.reduce((acc, entry) => {
      const clientName = entry.client_name;
      if (!acc[clientName]) {
        acc[clientName] = { name: clientName, hours: 0 };
      }
      acc[clientName].hours += entry.hours || 0;
      return acc;
    }, {});
    
    return Object.values(clientTotals)
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 5);
  };

  const topClients = getTopClients();

  return (
    <Card className="shadow-lg border-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5 text-green-600" />
          Top Clientes por Horas
        </CardTitle>
      </CardHeader>
      <CardContent>
        {topClients.length === 0 ? (
          <p className="text-slate-500 text-center py-10">No hay datos suficientes.</p>
        ) : (
          <div className="space-y-4">
            {topClients.map((client, index) => (
              <div key={client.name} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                   <Avatar className="w-10 h-10">
                    <AvatarFallback className="bg-green-100 text-green-700 font-semibold">
                      {client.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-slate-900">{client.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 font-semibold text-slate-900">
                    <Clock className="w-4 h-4 text-slate-400" />
                    {client.hours.toFixed(2)}h
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}