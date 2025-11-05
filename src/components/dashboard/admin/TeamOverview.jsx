import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Users, Star } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function TeamOverview({ topPerformer, activeCleaners }) {
  return (
    <Card className="shadow-xl border-0 bg-white">
      <CardHeader>
        <CardTitle className="flex items-center gap-3 text-xl">
          <div className="p-2 rounded-xl bg-yellow-100"><Trophy className="w-6 h-6 text-yellow-600" /></div>
          Resumen del Equipo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 p-6">
        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
          <div>
            <p className="text-sm text-slate-600 font-medium">Limpiadores Activos</p>
            <p className="text-3xl font-bold text-slate-900">{activeCleaners}</p>
          </div>
          <Users className="w-8 h-8 text-slate-400" />
        </div>
        
        <div className="p-4 bg-gradient-to-r from-yellow-50 to-amber-50 border border-amber-200 rounded-lg">
          <h4 className="font-semibold text-amber-900 mb-3 flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-500" />
            Top Performer del Mes
          </h4>
          {topPerformer ? (
            <div className="flex items-center gap-4">
              <Avatar className="w-12 h-12">
                <AvatarImage src={topPerformer.photoUrl} />
                <AvatarFallback className="bg-amber-500 text-white font-bold">
                  {topPerformer.name?.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-bold text-slate-800 text-lg">{topPerformer.name}</p>
                <p className="text-sm text-amber-700 font-semibold">{topPerformer.score} Puntos</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Aún no hay datos de puntuación para este mes.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}