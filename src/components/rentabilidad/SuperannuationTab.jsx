import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, DollarSign, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

const SUPER_RATE = 0.12;

export default function SuperannuationTab({ allWorkEntries }) {
    const [expandedMonth, setExpandedMonth] = useState(null);

    // Agrupar WorkEntries por mes y calcular labor cost + super
    const monthlyData = useMemo(() => {
        const byMonth = {};

        allWorkEntries.forEach(entry => {
            if (!entry.work_date) return;
            // Excluir training y actividades que no son pago real a limpiadores
            const excludedActivities = ['gasolina', 'inspecciones'];
            if (excludedActivities.includes(entry.activity)) return;

            const monthKey = entry.work_date.substring(0, 7); // YYYY-MM
            if (!byMonth[monthKey]) {
                byMonth[monthKey] = {
                    monthKey,
                    totalLabor: 0,
                    superAmount: 0,
                    entries: [],
                    byActivity: {},
                };
            }

            const amount = entry.total_amount || (entry.hours * entry.hourly_rate) || 0;
            byMonth[monthKey].totalLabor += amount;
            byMonth[monthKey].entries.push(entry);

            // Agrupar por actividad
            const act = entry.activity || 'otros';
            if (!byMonth[monthKey].byActivity[act]) {
                byMonth[monthKey].byActivity[act] = 0;
            }
            byMonth[monthKey].byActivity[act] += amount;
        });

        // Calcular super por mes
        Object.values(byMonth).forEach(m => {
            m.superAmount = m.totalLabor * SUPER_RATE;
        });

        return Object.values(byMonth).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
    }, [allWorkEntries]);

    const totals = useMemo(() => {
        const totalLabor = monthlyData.reduce((s, m) => s + m.totalLabor, 0);
        return {
            totalLabor,
            totalSuper: totalLabor * SUPER_RATE,
        };
    }, [monthlyData]);

    const formatMonth = (monthKey) => {
        try {
            return format(parseISO(monthKey + '-01'), 'MMMM yyyy', { locale: es });
        } catch {
            return monthKey;
        }
    };

    const activityLabels = {
        domestic: 'Doméstico',
        commercial: 'Comercial',
        training: 'Entrenamiento',
        windows: 'Ventanas',
        steam_vacuum: 'Steam/Aspirado',
        entrenamiento: 'Entrenamiento',
        otros: 'Otros',
        other: 'Otros',
    };

    return (
        <div className="space-y-6">
            {/* Info banner */}
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                    <p className="font-semibold text-amber-800">Estimación futura — Superannuation al 12%</p>
                    <p className="text-amber-700 text-sm mt-1">
                        Este módulo calcula cuánto representaría pagar el 12% de superannuation sobre el costo laboral de los limpiadores.
                        <strong> No se está pagando actualmente</strong>, es solo una proyección para planificación financiera.
                    </p>
                </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="border-slate-200">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-100 rounded-lg">
                                <DollarSign className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500">Costo Laboral Total</p>
                                <p className="text-2xl font-bold text-slate-900">${totals.totalLabor.toFixed(2)}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-orange-200 bg-orange-50">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-orange-100 rounded-lg">
                                <TrendingUp className="w-5 h-5 text-orange-600" />
                            </div>
                            <div>
                                <p className="text-sm text-orange-600">Super Estimado (12%)</p>
                                <p className="text-2xl font-bold text-orange-700">${totals.totalSuper.toFixed(2)}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-slate-200">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-slate-100 rounded-lg">
                                <DollarSign className="w-5 h-5 text-slate-600" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500">Costo Total con Super</p>
                                <p className="text-2xl font-bold text-slate-900">${(totals.totalLabor + totals.totalSuper).toFixed(2)}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Monthly breakdown */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Detalle por Mes</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200">
                                    <th className="text-left py-3 px-4 font-semibold text-slate-600">Mes</th>
                                    <th className="text-right py-3 px-4 font-semibold text-slate-600">Costo Laboral</th>
                                    <th className="text-right py-3 px-4 font-semibold text-orange-600">Super 12%</th>
                                    <th className="text-right py-3 px-4 font-semibold text-slate-600">Total con Super</th>
                                    <th className="text-right py-3 px-4 font-semibold text-slate-500">% del labor</th>
                                    <th className="py-3 px-4"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {monthlyData.map(month => (
                                    <React.Fragment key={month.monthKey}>
                                        <tr
                                            className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                                            onClick={() => setExpandedMonth(expandedMonth === month.monthKey ? null : month.monthKey)}
                                        >
                                            <td className="py-3 px-4 font-medium text-slate-800 capitalize">
                                                {formatMonth(month.monthKey)}
                                            </td>
                                            <td className="py-3 px-4 text-right text-slate-700">
                                                ${month.totalLabor.toFixed(2)}
                                            </td>
                                            <td className="py-3 px-4 text-right font-semibold text-orange-600">
                                                ${month.superAmount.toFixed(2)}
                                            </td>
                                            <td className="py-3 px-4 text-right font-bold text-slate-900">
                                                ${(month.totalLabor + month.superAmount).toFixed(2)}
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                <Badge variant="outline" className="text-orange-600 border-orange-200">
                                                    12%
                                                </Badge>
                                            </td>
                                            <td className="py-3 px-4 text-slate-400">
                                                {expandedMonth === month.monthKey
                                                    ? <ChevronUp className="w-4 h-4" />
                                                    : <ChevronDown className="w-4 h-4" />}
                                            </td>
                                        </tr>

                                        {/* Expandido: desglose por actividad */}
                                        {expandedMonth === month.monthKey && (
                                            <tr>
                                                <td colSpan={6} className="bg-slate-50 px-8 py-4">
                                                    <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Desglose por actividad</p>
                                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                        {Object.entries(month.byActivity).map(([act, amount]) => (
                                                            <div key={act} className="bg-white border border-slate-200 rounded-lg p-3">
                                                                <p className="text-xs text-slate-500">{activityLabels[act] || act}</p>
                                                                <p className="font-semibold text-slate-800">${amount.toFixed(2)}</p>
                                                                <p className="text-xs text-orange-500">+${(amount * SUPER_RATE).toFixed(2)} super</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>

                            {/* Totals row */}
                            <tfoot>
                                <tr className="border-t-2 border-slate-300 bg-slate-50">
                                    <td className="py-4 px-4 font-bold text-slate-900">TOTAL</td>
                                    <td className="py-4 px-4 text-right font-bold text-slate-900">${totals.totalLabor.toFixed(2)}</td>
                                    <td className="py-4 px-4 text-right font-bold text-orange-600">${totals.totalSuper.toFixed(2)}</td>
                                    <td className="py-4 px-4 text-right font-bold text-slate-900">${(totals.totalLabor + totals.totalSuper).toFixed(2)}</td>
                                    <td colSpan={2}></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}