import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    LineChart, Line, ReferenceLine, Legend
} from 'recharts';
import { TrendingUp, TrendingDown, ChevronRight, Search, X, DollarSign, Clock, Percent } from 'lucide-react';
import { Input } from '@/components/ui/input';

// Helper: color de margen
const marginColor = (margin) => {
    if (margin >= 40) return 'text-emerald-700';
    if (margin >= 25) return 'text-blue-700';
    if (margin >= 10) return 'text-amber-700';
    return 'text-red-700';
};
const marginBg = (margin) => {
    if (margin >= 40) return 'bg-emerald-50 border-emerald-200';
    if (margin >= 25) return 'bg-blue-50 border-blue-200';
    if (margin >= 10) return 'bg-amber-50 border-amber-200';
    return 'bg-red-50 border-red-200';
};
const marginBadgeClass = (margin) => {
    if (margin >= 40) return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    if (margin >= 25) return 'bg-blue-100 text-blue-800 border-blue-300';
    if (margin >= 10) return 'bg-amber-100 text-amber-800 border-amber-300';
    return 'bg-red-100 text-red-800 border-red-300';
};

const SORT_OPTIONS = [
    { value: 'margin_desc', label: 'Mayor margen' },
    { value: 'margin_asc', label: 'Menor margen' },
    { value: 'revenue_desc', label: 'Mayor ingreso' },
    { value: 'name_asc', label: 'Nombre A-Z' },
];

export default function ClientProfitabilityPanel({ clientProfitability }) {
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState('margin_desc');
    const [selectedClient, setSelectedClient] = useState(null);

    const filtered = useMemo(() => {
        let list = [...clientProfitability];
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(c => c.name.toLowerCase().includes(q));
        }
        if (sortBy === 'margin_desc') list.sort((a, b) => b.margin - a.margin);
        else if (sortBy === 'margin_asc') list.sort((a, b) => a.margin - b.margin);
        else if (sortBy === 'revenue_desc') list.sort((a, b) => b.revenue - a.revenue);
        else if (sortBy === 'name_asc') list.sort((a, b) => a.name.localeCompare(b.name));
        return list;
    }, [clientProfitability, search, sortBy]);

    const avgMargin = clientProfitability.length > 0
        ? clientProfitability.reduce((s, c) => s + c.margin, 0) / clientProfitability.length
        : 0;

    return (
        <>
            <Card className="shadow-xl border-0">
                <CardHeader className="bg-gradient-to-r from-slate-50 to-emerald-50 border-b">
                    <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
                        <CardTitle className="flex items-center gap-2 text-xl">
                            <Percent className="w-6 h-6 text-emerald-600" />
                            Rentabilidad por Cliente
                            <Badge variant="outline" className="ml-2 text-xs font-normal">
                                Promedio: <span className={`ml-1 font-bold ${marginColor(avgMargin)}`}>{avgMargin.toFixed(1)}%</span>
                            </Badge>
                        </CardTitle>
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <Input
                                    placeholder="Buscar cliente..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    className="pl-9 h-8 w-48 text-sm"
                                />
                                {search && (
                                    <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                                        <X className="w-3 h-3 text-slate-400" />
                                    </button>
                                )}
                            </div>
                            <select
                                value={sortBy}
                                onChange={e => setSortBy(e.target.value)}
                                className="h-8 text-sm border border-slate-200 rounded-md px-2 bg-white text-slate-700"
                            >
                                {SORT_OPTIONS.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-4">
                    {filtered.length === 0 ? (
                        <div className="text-center py-12 text-slate-400">
                            <Percent className="w-10 h-10 mx-auto mb-2 opacity-40" />
                            <p>Sin datos de rentabilidad disponibles</p>
                        </div>
                    ) : (
                        <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                            {filtered.map((client) => (
                                <button
                                    key={client.id}
                                    onClick={() => setSelectedClient(client)}
                                    className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-all hover:shadow-md ${marginBg(client.margin)}`}
                                >
                                    {/* Margen real grande */}
                                    <div className="flex-shrink-0 w-16 text-center">
                                        <span className={`text-xl font-bold ${marginColor(client.margin)}`}>
                                            {client.margin.toFixed(0)}%
                                        </span>
                                        <p className="text-xs text-slate-500 mt-0.5">real</p>
                                    </div>

                                    {/* Info cliente */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <p className="font-semibold text-slate-900 truncate">{client.name}</p>
                                            <Badge variant="outline" className={`text-xs flex-shrink-0 ${marginBadgeClass(client.margin)}`}>
                                                {client.margin >= 40 ? 'Excelente' : client.margin >= 25 ? 'Bueno' : client.margin >= 10 ? 'Regular' : 'Crítico'}
                                            </Badge>
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                                            <span>Ingreso: <span className="font-medium text-slate-700">${client.revenue.toFixed(0)}</span></span>
                                            <span>Labor: <span className="font-medium text-slate-700">${client.laborCost.toFixed(0)}</span></span>
                                            {client.distributedFixedCost > 0 && (
                                                <span>Fijos: <span className="font-medium text-orange-600">${client.distributedFixedCost.toFixed(0)}</span></span>
                                            )}
                                            <span className="text-slate-400">{client.hours.toFixed(1)}h</span>
                                        </div>
                                    </div>

                                    {/* Trend */}
                                    <div className="flex-shrink-0 flex items-center gap-1 text-sm">
                                        {client.trend > 0 ? (
                                            <span className="flex items-center gap-0.5 text-emerald-600">
                                                <TrendingUp className="w-4 h-4" />+{client.trend.toFixed(1)}pp
                                            </span>
                                        ) : client.trend < 0 ? (
                                            <span className="flex items-center gap-0.5 text-red-600">
                                                <TrendingDown className="w-4 h-4" />{client.trend.toFixed(1)}pp
                                            </span>
                                        ) : (
                                            <span className="text-slate-400 text-xs">sin hist.</span>
                                        )}
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                </button>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Modal de detalle del cliente */}
            {selectedClient && (
                <ClientDetailModal client={selectedClient} onClose={() => setSelectedClient(null)} avgMargin={avgMargin} />
            )}
        </>
    );
}

function ClientDetailModal({ client, onClose, avgMargin }) {
    const chartData = client.history.map(h => ({
        mes: h.month,
        'Mi margen': parseFloat(h.margin.toFixed(1)),
        'Promedio negocio': parseFloat(avgMargin.toFixed(1)),
        ingreso: parseFloat(h.revenue.toFixed(0)),
        costo: parseFloat(h.laborCost.toFixed(0)),
    }));

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-3">
                        <div className={`px-3 py-1 rounded-lg text-lg font-bold ${marginBg(client.margin)} ${marginColor(client.margin)}`}>
                            {client.margin.toFixed(1)}%
                        </div>
                        <span className="text-slate-900">{client.name}</span>
                        <Badge variant="outline" className={`${marginBadgeClass(client.margin)} ml-auto`}>
                            {client.margin >= 40 ? 'Excelente' : client.margin >= 25 ? 'Bueno' : client.margin >= 10 ? 'Regular' : 'Crítico'}
                        </Badge>
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-5 mt-2">
                    {/* KPIs */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-emerald-50 rounded-xl p-3 text-center border border-emerald-200">
                            <DollarSign className="w-4 h-4 mx-auto mb-1 text-emerald-600" />
                            <p className="text-xs text-emerald-700 mb-0.5">Ingreso</p>
                            <p className="text-lg font-bold text-emerald-900">${client.revenue.toFixed(0)}</p>
                        </div>
                        <div className="bg-rose-50 rounded-xl p-3 text-center border border-rose-200">
                            <Clock className="w-4 h-4 mx-auto mb-1 text-rose-600" />
                            <p className="text-xs text-rose-700 mb-0.5">Costo laboral</p>
                            <p className="text-lg font-bold text-rose-900">${client.laborCost.toFixed(0)}</p>
                        </div>
                        <div className="bg-orange-50 rounded-xl p-3 text-center border border-orange-200">
                            <Percent className="w-4 h-4 mx-auto mb-1 text-orange-600" />
                            <p className="text-xs text-orange-700 mb-0.5">Gastos fijos dist.</p>
                            <p className="text-lg font-bold text-orange-900">${(client.distributedFixedCost || 0).toFixed(0)}</p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-3 text-center border">
                            <Clock className="w-4 h-4 mx-auto mb-1 text-slate-500" />
                            <p className="text-xs text-slate-500 mb-0.5">Horas</p>
                            <p className="text-lg font-bold text-slate-900">{client.hours.toFixed(1)}h</p>
                        </div>
                    </div>

                    {/* Comparación margen bruto vs real */}
                    {client.grossMargin !== undefined && (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-blue-50 rounded-xl p-3 text-center border border-blue-200">
                                <p className="text-xs text-blue-700 mb-0.5">Margen bruto (sin fijos)</p>
                                <p className={`text-2xl font-bold ${client.grossMargin >= 0 ? 'text-blue-800' : 'text-rose-800'}`}>{client.grossMargin.toFixed(1)}%</p>
                            </div>
                            <div className={`rounded-xl p-3 text-center border ${marginBg(client.margin)}`}>
                                <p className={`text-xs mb-0.5 ${marginColor(client.margin)}`}>Margen real (con fijos)</p>
                                <p className={`text-2xl font-bold ${marginColor(client.margin)}`}>{client.margin.toFixed(1)}%</p>
                            </div>
                        </div>
                    )}

                    {/* Gráfico evolución margen */}
                    {chartData.length >= 2 ? (
                        <div>
                            <h4 className="text-sm font-semibold text-slate-700 mb-3">Evolución del Margen (últimos 6 meses)</h4>
                            <ResponsiveContainer width="100%" height={220}>
                                <LineChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                                    <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
                                    <Tooltip
                                        formatter={(value, name) => [`${value}%`, name]}
                                        contentStyle={{ fontSize: 12, borderRadius: 8 }}
                                    />
                                    <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                                    <ReferenceLine y={avgMargin} stroke="#94a3b8" strokeDasharray="4 4" />
                                    <Line
                                        type="monotone"
                                        dataKey="Mi margen"
                                        stroke="#10b981"
                                        strokeWidth={2.5}
                                        dot={{ r: 4, fill: '#10b981' }}
                                        activeDot={{ r: 6 }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="Promedio negocio"
                                        stroke="#94a3b8"
                                        strokeWidth={1.5}
                                        strokeDasharray="5 5"
                                        dot={false}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="bg-slate-50 rounded-xl p-6 text-center text-slate-400">
                            <p className="text-sm">Historial insuficiente para gráfico (mínimo 2 meses)</p>
                        </div>
                    )}

                    {/* Gráfico ingreso vs costo */}
                    {chartData.length >= 1 && (
                        <div>
                            <h4 className="text-sm font-semibold text-slate-700 mb-3">Ingreso vs Costo Laboral</h4>
                            <ResponsiveContainer width="100%" height={180}>
                                <BarChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                                    <YAxis tickFormatter={v => `$${v}`} tick={{ fontSize: 11 }} />
                                    <Tooltip
                                        formatter={(v, name) => [`$${v}`, name]}
                                        contentStyle={{ fontSize: 12, borderRadius: 8 }}
                                    />
                                    <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                                    <Bar dataKey="ingreso" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Ingreso" />
                                    <Bar dataKey="costo" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Costo laboral" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {/* Historial mensual tabla */}
                    {client.history.length > 0 && (
                        <div>
                            <h4 className="text-sm font-semibold text-slate-700 mb-2">Histórico mensual</h4>
                            <div className="overflow-x-auto rounded-xl border">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 border-b">
                                            <th className="text-left px-3 py-2 text-slate-600 font-medium">Mes</th>
                                            <th className="text-right px-3 py-2 text-slate-600 font-medium">Ingreso</th>
                                            <th className="text-right px-3 py-2 text-slate-600 font-medium">Labor</th>
                                            <th className="text-right px-3 py-2 text-orange-600 font-medium">Fijos</th>
                                            <th className="text-right px-3 py-2 text-blue-600 font-medium">Bruto</th>
                                            <th className="text-right px-3 py-2 text-slate-600 font-medium">Real</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[...client.history].reverse().map((h, i) => (
                                            <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                                                <td className="px-3 py-2 text-slate-700 font-medium">{h.month}</td>
                                                <td className="px-3 py-2 text-right text-emerald-700 font-medium">${h.revenue.toFixed(0)}</td>
                                                <td className="px-3 py-2 text-right text-rose-600">${h.laborCost.toFixed(0)}</td>
                                                <td className="px-3 py-2 text-right text-orange-600">${(h.fixedCost || 0).toFixed(0)}</td>
                                                <td className={`px-3 py-2 text-right ${h.grossMargin >= 0 ? 'text-blue-700' : 'text-rose-700'}`}>
                                                    {(h.grossMargin || 0).toFixed(1)}%
                                                </td>
                                                <td className={`px-3 py-2 text-right font-bold ${marginColor(h.margin)}`}>
                                                    {h.margin.toFixed(1)}%
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}