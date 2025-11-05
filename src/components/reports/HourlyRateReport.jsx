import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, User, Clock } from "lucide-react";

export default function HourlyRateReport({ workEntries }) {
    // Exclude training entries for this analysis
    const clientEntries = workEntries.filter(e => e.activity !== 'entrenamiento');

    const totalRevenue = clientEntries.reduce((sum, entry) => sum + (entry.total_amount || 0), 0);
    const totalHours = clientEntries.reduce((sum, entry) => sum + (entry.hours || 0), 0);
    const averageRate = totalHours > 0 ? totalRevenue / totalHours : 0;

    const rateByCleaner = clientEntries.reduce((acc, entry) => {
        const name = entry.cleaner_name;
        if (!acc[name]) {
            acc[name] = { name, total_amount: 0, hours: 0 };
        }
        acc[name].total_amount += entry.total_amount || 0;
        acc[name].hours += entry.hours || 0;
        return acc;
    }, {});

    const cleanerAverages = Object.values(rateByCleaner)
        .map(cleaner => ({
            ...cleaner,
            avgRate: cleaner.hours > 0 ? cleaner.total_amount / cleaner.hours : 0
        }))
        .sort((a, b) => b.avgRate - a.avgRate);

    if (clientEntries.length === 0) {
        return (
            <Card className="shadow-lg border-0">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <DollarSign className="w-5 h-5 text-teal-600" />
                        Análisis de Tarifa por Hora
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-slate-500 p-4 text-center">No hay datos de trabajo de cliente para analizar en este período.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="shadow-lg border-0">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-teal-600" />
                    Análisis de Tarifa por Hora
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="text-center bg-teal-50 p-6 rounded-xl border border-teal-200">
                    <p className="text-sm font-medium text-teal-700">TARIFA PROMEDIO GENERAL</p>
                    <p className="text-4xl font-bold text-teal-900 mt-1">${averageRate.toFixed(2)}</p>
                    <p className="text-xs text-teal-600">por hora</p>
                </div>
                <div>
                    <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                        <User className="w-4 h-4" />
                        Desglose por Limpiador
                    </h4>
                    <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                        {cleanerAverages.map(cleaner => (
                            <div key={cleaner.name} className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-200">
                                <span className="font-medium text-slate-700">{cleaner.name}</span>
                                <div className="text-right">
                                    <p className="font-bold text-slate-900">${cleaner.avgRate.toFixed(2)}</p>
                                    <p className="text-xs text-slate-500 flex items-center justify-end gap-1">
                                        <Clock className="w-3 h-3" />
                                        {cleaner.hours.toFixed(1)}h
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}