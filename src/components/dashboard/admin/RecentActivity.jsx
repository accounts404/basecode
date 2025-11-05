import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Users, Building2, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const activityLabels = {
  domestic: "Doméstico", commercial: "Comercial", windows: "Ventanas",
  steam_vacuum: "Vapor/Aspirado", entrenamiento: "Entrenamiento", otros: "Otros",
  gasolina: "Gasolina", inspecciones: "Inspecciones"
};

const activityColors = {
  domestic: "bg-blue-100 text-blue-800", commercial: "bg-green-100 text-green-800",
  windows: "bg-purple-100 text-purple-800", steam_vacuum: "bg-indigo-100 text-indigo-800",
  entrenamiento: "bg-amber-100 text-amber-800", otros: "bg-slate-100 text-slate-800",
  gasolina: "bg-red-100 text-red-800", inspecciones: "bg-cyan-100 text-cyan-800"
};

export default function RecentActivity({ workEntries }) {
  const recentEntries = workEntries.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).slice(0, 5);

  return (
    <Card className="shadow-xl border-0 bg-white">
      <CardHeader>
        <CardTitle className="flex items-center gap-3 text-xl">
          <div className="p-2 rounded-xl bg-blue-100"><Clock className="w-6 h-6 text-blue-600" /></div>
          Actividad Reciente
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {recentEntries.length === 0 ? (
          <div className="p-12 text-center text-slate-500">No hay actividad reciente para mostrar.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentEntries.map((entry) => (
              <div key={entry.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-slate-100 rounded-lg"><Building2 className="w-5 h-5 text-slate-600" /></div>
                  <div>
                    <p className="font-semibold text-slate-800">{entry.client_name}</p>
                    <div className="text-sm text-slate-500 flex items-center gap-4 mt-1">
                      <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> {entry.cleaner_name}</span>
                      <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {format(new Date(entry.work_date), "d MMM", { locale: es })}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-lg text-green-600">${(entry.total_amount || 0).toFixed(2)}</p>
                  <Badge className={`mt-1 text-xs ${activityColors[entry.activity] || activityColors.otros}`}>
                    {activityLabels[entry.activity] || "Otro"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}