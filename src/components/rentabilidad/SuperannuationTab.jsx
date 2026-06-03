import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, DollarSign, AlertCircle, ChevronDown, ChevronUp, Users, CheckCircle2, XCircle, Calendar } from 'lucide-react';
import { format, parseISO, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';

const SUPER_RATE = 0.12;

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

const EXCLUDED_ACTIVITIES = ['gasolina', 'inspecciones'];

function formatMonth(monthKey) {
    try {
        return format(parseISO(monthKey + '-01'), 'MMMM yyyy', { locale: es });
    } catch {
        return monthKey;
    }
}

// Calcula ingresos por mes desde schedules facturados
function buildRevenueByMonth(allSchedules) {
    const byMonth = {};
    allSchedules.forEach(s => {
        if (!s.xero_invoiced && s.status !== 'completed') return;
        const dateStr = s.billed_at || s.start_time;
        if (!dateStr) return;
        const monthKey = dateStr.substring(0, 7);

        let revenue = 0;
        if (s.reconciliation_items && s.reconciliation_items.length > 0) {
            revenue = s.reconciliation_items.reduce((sum, item) => sum + (item.amount || 0), 0);
        } else if (s.billed_price_snapshot) {
            revenue = s.billed_price_snapshot;
        }

        byMonth[monthKey] = (byMonth[monthKey] || 0) + revenue;
    });
    return byMonth;
}

export default function SuperannuationTab({ allWorkEntries, allSchedules }) {
    const [expandedMonth, setExpandedMonth] = useState(null);
    const [expandedView, setExpandedView] = useState('activity'); // 'activity' | 'cleaners'
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const revenueByMonth = useMemo(() => buildRevenueByMonth(allSchedules || []), [allSchedules]);

    // Filtrar entries según rango de fechas seleccionado
    const filteredEntries = useMemo(() => {
        return allWorkEntries.filter(entry => {
            if (!entry.work_date) return false;
            if (EXCLUDED_ACTIVITIES.includes(entry.activity)) return false;
            if (dateFrom && entry.work_date < dateFrom) return false;
            if (dateTo && entry.work_date > dateTo + '-31') return false;
            return true;
        });
    }, [allWorkEntries, dateFrom, dateTo]);

    // Agrupar por mes
    const monthlyData = useMemo(() => {
        const byMonth = {};

        filteredEntries.forEach(entry => {
            const monthKey = entry.work_date.substring(0, 7);
            if (!byMonth[monthKey]) {
                byMonth[monthKey] = {
                    monthKey,
                    totalLabor: 0,
                    superAmount: 0,
                    byActivity: {},
                    byCleaner: {},
                };
            }
            const amount = entry.total_amount || (entry.hours * entry.hourly_rate) || 0;
            byMonth[monthKey].totalLabor += amount;

            // Por actividad
            const act = entry.activity || 'otros';
            byMonth[monthKey].byActivity[act] = (byMonth[monthKey].byActivity[act] || 0) + amount;

            // Por limpiador
            const cleanerKey = entry.cleaner_id || 'unknown';
            const cleanerName = entry.cleaner_name || 'Desconocido';
            if (!byMonth[monthKey].byCleaner[cleanerKey]) {
                byMonth[monthKey].byCleaner[cleanerKey] = { name: cleanerName, amount: 0 };
            }
            byMonth[monthKey].byCleaner[cleanerKey].amount += amount;
        });

        Object.values(byMonth).forEach(m => {
            m.superAmount = m.totalLabor * SUPER_RATE;
            m.revenue = revenueByMonth[m.monthKey] || 0;
            m.canAfford = m.revenue > 0 ? m.superAmount <= (m.revenue - m.totalLabor) : false;
            m.superPctRevenue = m.revenue > 0 ? (m.superAmount / m.revenue) * 100 : null;
        });

        return Object.values(byMonth).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
    }, [filteredEntries, revenueByMonth]);

    // Totales globales
    const totals = useMemo(() => {
        const totalLabor = monthlyData.reduce((s, m) => s + m.totalLabor, 0);
        const totalRevenue = monthlyData.reduce((s, m) => s + m.revenue, 0);
        const totalSuper = totalLabor * SUPER_RATE;
        return { totalLabor, totalRevenue, totalSuper };
    }, [monthlyData]);

    // Proyección anual: promedio últimos 3 meses disponibles
    const annualProjection = useMemo(() => {
        const last3 = monthlyData.slice(0, 3);
        if (last3.length === 0) return null;
        const avgSuper = last3.reduce((s, m) => s + m.superAmount, 0) / last3.length;
        return { monthly: avgSuper, annual: avgSuper * 12 };
    }, [monthlyData]);

    // Desglose por limpiador (global, sobre rango filtrado)
    const byCleanerGlobal = useMemo(() => {
        const map = {};
        filteredEntries.forEach(entry => {
            const key = entry.cleaner_id || 'unknown';
            const name = entry.cleaner_name || 'Desconocido';
            if (!map[key]) map[key] = { name, amount: 0 };
            const amount = entry.total_amount || (entry.hours * entry.hourly_rate) || 0;
            map[key].amount += amount;
        });
        return Object.values(map)
            .map(c => ({ ...c, superAmount: c.amount * SUPER_RATE }))
            .sort((a, b) => b.amount - a.amount);
    }, [filteredEntries]);

    return (
        <div className="space-y-6">
            {/* Info banner */}
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                    <p className="font-semibold text-amber-800">Estimación futura — Superannuation al 12%</p>
                    <p className="text-amber-700 text-sm mt-1">
                        Proyección de cuánto costaría pagar el 12% de superannuation sobre el costo laboral.
                        <strong> No se está pagando actualmente.</strong>
                    </p>
                </div>
            </div>

            {/* Filtro de rango */}
            <Card>
                <CardContent className="pt-4 pb-4">
                    <div className="flex flex-wrap items-center gap-4">
                        <Calendar className="w-4 h-4 text-slate-500" />
                        <span className="text-sm font-medium text-slate-600">Filtrar por período:</span>
                        <div className="flex items-center gap-2">
                            <label className="text-xs text-slate-500">Desde</label>
                            <input
                                type="month"
                                value={dateFrom}
                                onChange={e => setDateFrom(e.target.value)}
                                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="text-xs text-slate-500">Hasta</label>
                            <input
                                type="month"
                                value={dateTo}
                                onChange={e => setDateTo(e.target.value)}
                                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                            />
                        </div>
                        {(dateFrom || dateTo) && (
                            <button
                                onClick={() => { setDateFrom(''); setDateTo(''); }}
                                className="text-xs text-slate-400 hover:text-slate-600 underline"
                            >
                                Limpiar filtro
                            </button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border-slate-200">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-100 rounded-lg">
                                <DollarSign className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500">Costo Laboral Total</p>
                                <p className="text-2xl font-bold text-slate-900">${totals.totalLabor.toFixed(0)}</p>
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
                                <p className="text-2xl font-bold text-orange-700">${totals.totalSuper.toFixed(0)}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-slate-200">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-green-100 rounded-lg">
                                <DollarSign className="w-5 h-5 text-green-600" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500">Ingresos Totales (facturado)</p>
                                <p className="text-2xl font-bold text-slate-900">${totals.totalRevenue.toFixed(0)}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {annualProjection && (
                    <Card className="border-purple-200 bg-purple-50">
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-purple-100 rounded-lg">
                                    <TrendingUp className="w-5 h-5 text-purple-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-purple-600">Proyección Anual (avg 3m)</p>
                                    <p className="text-2xl font-bold text-purple-700">${annualProjection.annual.toFixed(0)}</p>
                                    <p className="text-xs text-purple-500">${annualProjection.monthly.toFixed(0)}/mes</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Desglose por limpiador */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Users className="w-5 h-5 text-slate-500" />
                        Super por Limpiador (período seleccionado)
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200">
                                    <th className="text-left py-2 px-4 font-semibold text-slate-600">Limpiador</th>
                                    <th className="text-right py-2 px-4 font-semibold text-slate-600">Costo Laboral</th>
                                    <th className="text-right py-2 px-4 font-semibold text-orange-600">Super 12%</th>
                                    <th className="text-right py-2 px-4 font-semibold text-slate-600">Total con Super</th>
                                </tr>
                            </thead>
                            <tbody>
                                {byCleanerGlobal.map(c => (
                                    <tr key={c.name} className="border-b border-slate-100 hover:bg-slate-50">
                                        <td className="py-2 px-4 font-medium text-slate-800">{c.name}</td>
                                        <td className="py-2 px-4 text-right text-slate-700">${c.amount.toFixed(2)}</td>
                                        <td className="py-2 px-4 text-right font-semibold text-orange-600">${c.superAmount.toFixed(2)}</td>
                                        <td className="py-2 px-4 text-right font-bold text-slate-900">${(c.amount + c.superAmount).toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 border-slate-300 bg-slate-50">
                                    <td className="py-3 px-4 font-bold text-slate-900">TOTAL</td>
                                    <td className="py-3 px-4 text-right font-bold">${totals.totalLabor.toFixed(2)}</td>
                                    <td className="py-3 px-4 text-right font-bold text-orange-600">${totals.totalSuper.toFixed(2)}</td>
                                    <td className="py-3 px-4 text-right font-bold">${(totals.totalLabor + totals.totalSuper).toFixed(2)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Monthly breakdown con indicador ¿puedo pagarlo? */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Detalle por Mes — ¿Puedo pagarlo?</CardTitle>
                    <p className="text-sm text-slate-500 mt-1">Verde = el margen del mes cubre el super. Rojo = no alcanza. Gris = sin datos de ingresos.</p>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200">
                                    <th className="text-left py-3 px-4 font-semibold text-slate-600">Mes</th>
                                    <th className="text-right py-3 px-4 font-semibold text-slate-600">Ingresos</th>
                                    <th className="text-right py-3 px-4 font-semibold text-slate-600">Costo Laboral</th>
                                    <th className="text-right py-3 px-4 font-semibold text-orange-600">Super 12%</th>
                                    <th className="text-right py-3 px-4 font-semibold text-slate-600">Super % ingreso</th>
                                    <th className="text-center py-3 px-4 font-semibold text-slate-600">¿Alcanza?</th>
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
                                            <td className="py-3 px-4 text-right text-slate-600">
                                                {month.revenue > 0 ? `$${month.revenue.toFixed(0)}` : <span className="text-slate-300">—</span>}
                                            </td>
                                            <td className="py-3 px-4 text-right text-slate-700">
                                                ${month.totalLabor.toFixed(0)}
                                            </td>
                                            <td className="py-3 px-4 text-right font-semibold text-orange-600">
                                                ${month.superAmount.toFixed(0)}
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                {month.superPctRevenue !== null
                                                    ? <Badge variant="outline" className="text-orange-600 border-orange-200">{month.superPctRevenue.toFixed(1)}%</Badge>
                                                    : <span className="text-slate-300 text-xs">sin datos</span>
                                                }
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                {month.revenue === 0
                                                    ? <span className="text-slate-300 text-xs">—</span>
                                                    : month.canAfford
                                                        ? <CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" />
                                                        : <XCircle className="w-5 h-5 text-red-400 mx-auto" />
                                                }
                                            </td>
                                            <td className="py-3 px-4 text-slate-400">
                                                {expandedMonth === month.monthKey
                                                    ? <ChevronUp className="w-4 h-4" />
                                                    : <ChevronDown className="w-4 h-4" />}
                                            </td>
                                        </tr>

                                        {/* Expandido */}
                                        {expandedMonth === month.monthKey && (
                                            <tr>
                                                <td colSpan={7} className="bg-slate-50 px-6 py-4">
                                                    {/* Toggle actividad / limpiadores */}
                                                    <div className="flex gap-2 mb-3">
                                                        <button
                                                            onClick={e => { e.stopPropagation(); setExpandedView('activity'); }}
                                                            className={`text-xs px-3 py-1 rounded-full border ${expandedView === 'activity' ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-300 text-slate-600'}`}
                                                        >
                                                            Por actividad
                                                        </button>
                                                        <button
                                                            onClick={e => { e.stopPropagation(); setExpandedView('cleaners'); }}
                                                            className={`text-xs px-3 py-1 rounded-full border ${expandedView === 'cleaners' ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-300 text-slate-600'}`}
                                                        >
                                                            Por limpiador
                                                        </button>
                                                    </div>

                                                    {expandedView === 'activity' && (
                                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                            {Object.entries(month.byActivity).map(([act, amount]) => (
                                                                <div key={act} className="bg-white border border-slate-200 rounded-lg p-3">
                                                                    <p className="text-xs text-slate-500">{activityLabels[act] || act}</p>
                                                                    <p className="font-semibold text-slate-800">${amount.toFixed(2)}</p>
                                                                    <p className="text-xs text-orange-500">+${(amount * SUPER_RATE).toFixed(2)} super</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {expandedView === 'cleaners' && (
                                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                            {Object.values(month.byCleaner).sort((a, b) => b.amount - a.amount).map(c => (
                                                                <div key={c.name} className="bg-white border border-slate-200 rounded-lg p-3">
                                                                    <p className="text-xs text-slate-500 truncate">{c.name}</p>
                                                                    <p className="font-semibold text-slate-800">${c.amount.toFixed(2)}</p>
                                                                    <p className="text-xs text-orange-500">+${(c.amount * SUPER_RATE).toFixed(2)} super</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 border-slate-300 bg-slate-50">
                                    <td className="py-4 px-4 font-bold text-slate-900">TOTAL</td>
                                    <td className="py-4 px-4 text-right font-bold">${totals.totalRevenue.toFixed(0)}</td>
                                    <td className="py-4 px-4 text-right font-bold">${totals.totalLabor.toFixed(0)}</td>
                                    <td className="py-4 px-4 text-right font-bold text-orange-600">${totals.totalSuper.toFixed(0)}</td>
                                    <td colSpan={3}></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}