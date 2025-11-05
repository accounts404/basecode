import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { DollarSign, Clock, Users, Briefcase, BarChart, TrendingUp } from 'lucide-react';

const kpiConfig = [
    {
        key: 'totalCost',
        label: 'Costo Total',
        icon: DollarSign,
        format: (value) => `$${(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    },
    {
        key: 'totalHours',
        label: 'Horas Totales',
        icon: Clock,
        format: (value) => `${(value || 0).toFixed(1)}h`,
    },
    {
        key: 'servicesRealized',
        label: 'Servicios Realizados',
        icon: Briefcase,
        format: (value) => (value || 0).toLocaleString('en-US'),
    },
    {
        key: 'clientsAttended',
        label: 'Clientes Atendidos',
        icon: Users,
        format: (value) => (value || 0).toLocaleString('en-US'),
    },
    {
        key: 'avgHourlyRate',
        label: 'Costo Promedio / Hora',
        icon: TrendingUp,
        format: (value) => `$${(value || 0).toFixed(2)}`,
        isDerived: true, // This is a calculated metric
    },
];

export default function MonthlyComparisonTable({ data }) {
    if (!data || data.length === 0) {
        return null;
    }

    const monthCount = data.length; // Number of months for average calculation

    const totals = data.reduce((acc, monthData) => {
        acc.totalCost += monthData.totalCost;
        acc.totalHours += monthData.totalHours;
        acc.servicesRealized += monthData.servicesRealized;
        return acc;
    }, { totalCost: 0, totalHours: 0, servicesRealized: 0 });

    totals.avgHourlyRate = totals.totalHours > 0 ? totals.totalCost / totals.totalHours : 0;

    // Calculate averages by dividing totals by month count
    const averages = {
        totalCost: totals.totalCost / monthCount,
        totalHours: totals.totalHours / monthCount,
        servicesRealized: totals.servicesRealized / monthCount,
        avgHourlyRate: totals.avgHourlyRate, // This is already an average rate
    };

    return (
        <Card className="shadow-lg border-0">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <BarChart className="w-5 h-5 text-blue-600" />
                    Tabla de Comparación Mensual
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="min-w-[200px] sticky left-0 bg-slate-50 z-10">Métrica</TableHead>
                                {data.map(month => (
                                    <TableHead key={month.month} className="text-right">
                                        {format(parseISO(`${month.month}-02`), 'MMMM yyyy', { locale: es })}
                                    </TableHead>
                                ))}
                                <TableHead className="text-right font-bold bg-slate-100">Total</TableHead>
                                <TableHead className="text-right font-bold bg-blue-50">Promedio</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {kpiConfig.map(kpi => (
                                <TableRow key={kpi.key} className="hover:bg-slate-50">
                                    <TableCell className="font-medium sticky left-0 bg-white hover:bg-slate-50 z-10 flex items-center gap-2">
                                        <kpi.icon className="w-4 h-4 text-slate-500" />
                                        {kpi.label}
                                    </TableCell>
                                    {data.map(monthData => {
                                        let value;
                                        if (kpi.isDerived && kpi.key === 'avgHourlyRate') {
                                            value = monthData.totalHours > 0 ? monthData.totalCost / monthData.totalHours : 0;
                                        } else {
                                            value = monthData[kpi.key];
                                        }
                                        return (
                                            <TableCell key={`${kpi.key}-${monthData.month}`} className="text-right">
                                                {kpi.format(value)}
                                            </TableCell>
                                        );
                                    })}
                                    <TableCell className="text-right font-bold bg-slate-50">
                                        {kpi.key === 'clientsAttended' ? 'N/A' : kpi.format(totals[kpi.key])}
                                    </TableCell>
                                    <TableCell className="text-right font-bold bg-blue-50">
                                        {kpi.key === 'clientsAttended' ? 'N/A' : kpi.format(averages[kpi.key])}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
                 <p className="text-xs text-slate-500 mt-4">
                    * Las columnas "Total" y "Promedio" para "Clientes Atendidos" muestran N/A, ya que un mismo cliente puede aparecer en múltiples meses.
                </p>
            </CardContent>
        </Card>
    );
}