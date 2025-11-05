import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Crown, TrendingUp, Clock, DollarSign } from "lucide-react";

export default function TopClients({ workEntries = [] }) {
  const getTopClients = () => {
    // CORRECCIÓN: Verificar que workEntries existe y es un array
    if (!workEntries || !Array.isArray(workEntries)) {
      return [];
    }

    const clientData = {};

    // 1. Agregamos datos y rastreamos fechas de servicio únicas para cada cliente
    // Solo procesamos entradas que NO sean de entrenamiento (aunque ya deberían estar filtradas)
    workEntries
      .filter(entry => entry.activity !== 'entrenamiento')
      .forEach(entry => {
        const clientName = entry.client_name;
        if (!clientName) return; // Omitir entradas sin nombre de cliente

        if (!clientData[clientName]) {
          clientData[clientName] = {
            total: 0,
            hours: 0,
            serviceDates: new Set()
          };
        }
        
        clientData[clientName].total += entry.total_amount || 0;
        clientData[clientName].hours += entry.hours || 0;
        
        // La clave de un servicio único es cliente + fecha
        if (entry.work_date) {
          const dateKey = entry.work_date.split('T')[0];
          clientData[clientName].serviceDates.add(dateKey);
        }
      });
    
    // 2. Transformamos los datos agregados al formato final, contando los servicios únicos
    const clientTotalsList = Object.entries(clientData).map(([clientName, data]) => {
      return [
        clientName,
        {
          total: data.total,
          hours: data.hours,
          services: data.serviceDates.size // Contamos el número de fechas únicas
        }
      ];
    });

    // 3. Ordenamos por el total de HORAS y tomamos los 5 mejores
    return clientTotalsList
      .sort(([,a], [,b]) => b.hours - a.hours) // Changed sorting to 'hours'
      .slice(0, 5);
  };

  const topClients = getTopClients();
  const totalCost = topClients.reduce((sum, [, data]) => sum + data.total, 0); // Renamed totalRevenue to totalCost

  return (
    <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm">
      <CardHeader className="border-b border-slate-100/80 pb-4 bg-gradient-to-r from-slate-50 to-green-50/30">
        <CardTitle className="flex items-center gap-3 text-xl">
          <div className="p-2 rounded-xl bg-green-100">
            <Crown className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <h3 className="text-slate-900 font-bold">Top Clientes</h3>
            <p className="text-sm text-slate-600 font-normal">
              Los 5 clientes con mayor volumen de horas
            </p>
          </div>
          <div className="ml-auto">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-100">
              <DollarSign className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-700">${totalCost.toFixed(0)}</span>
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        {topClients.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
              <Users className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-600 mb-2">Sin datos disponibles</h3>
            <p className="text-slate-500">No hay información de clientes para este período</p>
          </div>
        ) : (
          <div className="space-y-4">
            {topClients.map(([clientName, data], index) => {
              const colors = [
                'from-yellow-400 to-yellow-600', // Gold
                'from-slate-400 to-slate-600',   // Silver
                'from-amber-600 to-amber-800',   // Bronze
                'from-blue-400 to-blue-600',     // Blue
                'from-purple-400 to-purple-600'  // Purple
              ];
              
              const bgColors = [
                'bg-yellow-50 border-yellow-200',
                'bg-slate-50 border-slate-200',
                'bg-amber-50 border-amber-200',
                'bg-blue-50 border-blue-200',
                'bg-purple-50 border-purple-200'
              ];

              const textColors = [
                'text-yellow-700',
                'text-slate-700',
                'text-amber-700',
                'text-blue-700',
                'text-purple-700'
              ];

              return (
                <div key={clientName} className={`p-4 rounded-xl border-2 ${bgColors[index]} hover:shadow-md transition-all duration-200`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${colors[index]} flex items-center justify-center shadow-lg`}>
                        <span className="text-white text-xl font-bold">
                          {index === 0 ? '👑' : `#${index + 1}`}
                        </span>
                      </div>
                      <div>
                        <h4 className={`font-bold text-lg ${textColors[index]}`}>{clientName}</h4>
                        <div className="flex items-center gap-4 mt-1">
                          <div className="flex items-center gap-1 text-sm text-slate-600">
                            <Clock className="w-4 h-4" />
                            <span className="font-medium">{data.hours.toFixed(1)}h</span>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {data.services} servicio{data.services !== 1 ? 's' : ''}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold text-2xl ${textColors[index]}`}>
                        ${data.total.toFixed(2)}
                      </p>
                      <p className="text-xs text-slate-500 font-medium">
                        Costo del servicio
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}