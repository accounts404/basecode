import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, User, DollarSign, Clock, Briefcase } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function TopPerformer({ entries }) {
  const performanceData = entries.reduce((acc, entry) => {
    const cleanerName = entry.cleaner_name;
    if (!acc[cleanerName]) {
      acc[cleanerName] = { name: cleanerName, total: 0, horas: 0, trabajos: 0 };
    }
    acc[cleanerName].total += entry.total_amount || 0;
    acc[cleanerName].horas += entry.hours || 0;
    acc[cleanerName].trabajos += 1;
    return acc;
  }, {});

  const topPerformer = Object.values(performanceData).sort((a, b) => b.total - a.total)[0];

  if (!topPerformer) {
    return (
      <Card className="shadow-lg border-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" />
            Limpiador Destacado
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-10">
          <p className="text-slate-500">No hay datos suficientes.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg border-0 bg-gradient-to-br from-amber-50 to-yellow-100">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-700">
          <Trophy className="w-6 h-6" />
          Limpiador de la Quincena
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center text-center">
        <Avatar className="w-20 h-20 mb-4 border-4 border-amber-300">
          <AvatarFallback className="bg-amber-200 text-amber-700 text-2xl font-bold">
            {topPerformer.name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <h3 className="text-2xl font-bold text-slate-900">{topPerformer.name}</h3>
        
        <div className="mt-6 w-full space-y-3">
          <div className="flex justify-between items-center bg-white/50 p-3 rounded-lg">
            <span className="flex items-center gap-2 text-slate-600"><DollarSign className="w-4 h-4" /> Ingresos</span>
            <span className="font-bold text-slate-900">${topPerformer.total.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center bg-white/50 p-3 rounded-lg">
            <span className="flex items-center gap-2 text-slate-600"><Clock className="w-4 h-4" /> Horas</span>
            <span className="font-bold text-slate-900">{topPerformer.horas.toFixed(2)}h</span>
          </div>
          <div className="flex justify-between items-center bg-white/50 p-3 rounded-lg">
            <span className="flex items-center gap-2 text-slate-600"><Briefcase className="w-4 h-4" /> Trabajos</span>
            <span className="font-bold text-slate-900">{topPerformer.trabajos}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}