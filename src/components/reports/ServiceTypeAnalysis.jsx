import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { DollarSign, ChevronDown } from 'lucide-react';
import { format, parse, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

const extractDateOnly = (isoString) => {
  if (!isoString) return null;
  return isoString.substring(0, 10);
};

const formatDateOnly = (dateString) => {
  if (!dateString) return '';
  const date = parse(dateString, 'yyyy-MM-dd', new Date());
  return format(date, "d MMM yyyy", { locale: es });
};

const calculateGST = (price, gstType) => {
  const numPrice = parseFloat(price) || 0;

  switch (gstType) {
    case 'inclusive':
      const baseInclusive = numPrice / 1.1;
      return {
        base: baseInclusive,
        gst: numPrice - baseInclusive,
        total: numPrice
      };
    case 'exclusive':
      const gstExclusive = numPrice * 0.1;
      return {
        base: numPrice,
        gst: gstExclusive,
        total: numPrice + gstExclusive
      };
    case 'no_tax':
      return {
        base: numPrice,
        gst: 0,
        total: numPrice
      };
    default:
      return {
        base: numPrice,
        gst: 0,
        total: numPrice
      };
  }
};

// CRÍTICO: Función que respeta snapshots inmutables y price_history
const getPriceForSchedule = (schedule, client) => {
    // PRIORIDAD 1: Si tiene reconciliation_items, usar esos
    if (schedule.reconciliation_items && schedule.reconciliation_items.length > 0) {
        let tempRawBreakdown = {};
        let totalRawReconciledAmount = 0;

        schedule.reconciliation_items.forEach(item => {
            const type = item.type || 'other_extra';
            const amount = parseFloat(item.amount) || 0;
            tempRawBreakdown[type] = (tempRawBreakdown[type] || 0) + amount;
            if (type !== 'discount') {
                totalRawReconciledAmount += amount;
            }
        });
        
        return { 
            rawAmount: totalRawReconciledAmount, 
            breakdown: tempRawBreakdown,
            gstType: schedule.billed_gst_type_snapshot || client?.gst_type || 'inclusive'
        };
    }
    
    // PRIORIDAD 2: Si está facturado con snapshot (INMUTABLE)
    if (schedule.xero_invoiced && schedule.billed_price_snapshot !== undefined && schedule.billed_price_snapshot !== null) {
        return {
            rawAmount: schedule.billed_price_snapshot,
            breakdown: { base_service: schedule.billed_price_snapshot },
            gstType: schedule.billed_gst_type_snapshot || 'inclusive'
        };
    }
    
    // PRIORIDAD 3: Precio vigente en fecha del servicio
    if (client) {
        const serviceDate = schedule.start_time;
        if (!client.price_history || client.price_history.length === 0) {
            return {
                rawAmount: client.current_service_price || 0,
                breakdown: { base_service: client.current_service_price || 0 },
                gstType: client.gst_type || 'inclusive'
            };
        }
        
        const serviceDateStr = format(parseISO(serviceDate), 'yyyy-MM-dd');
        const sortedHistory = [...client.price_history].sort((a, b) => new Date(b.effective_date) - new Date(a.effective_date));
        
        for (const historyEntry of sortedHistory) {
            if (historyEntry.effective_date <= serviceDateStr) {
                return {
                    rawAmount: historyEntry.new_price || client.current_service_price || 0,
                    breakdown: { base_service: historyEntry.new_price || client.current_service_price || 0 },
                    gstType: historyEntry.gst_type || client.gst_type || 'inclusive'
                };
            }
        }
        
        const oldestEntry = sortedHistory[sortedHistory.length - 1];
        if (oldestEntry) {
            return {
                rawAmount: oldestEntry.previous_price || oldestEntry.new_price || client.current_service_price || 0,
                breakdown: { base_service: oldestEntry.previous_price || oldestEntry.new_price || client.current_service_price || 0 },
                gstType: oldestEntry.gst_type || client.gst_type || 'inclusive'
            };
        }
    }
    
    return {
        rawAmount: client?.current_service_price || 0,
        breakdown: { base_service: client?.current_service_price || 0 },
        gstType: client?.gst_type || 'inclusive'
    };
};

export default function ServiceTypeAnalysis({ schedules = [], clients = [] }) {
    const clientsMap = useMemo(() => {
        if (!Array.isArray(clients)) {
            console.warn('ServiceTypeAnalysis: clients no es un array:', clients);
            return new Map();
        }
        return new Map(clients.map(c => [c.id, c]));
    }, [clients]);

    const analysisData = useMemo(() => {
        if (!Array.isArray(schedules) || schedules.length === 0) {
            return { chartData: [], pieData: [], detailedData: [], totalRevenue: 0 };
        }

        const invoicedSchedules = schedules.filter(s => s.xero_invoiced === true);

        const clientTypeLabels = {
            domestic: 'Doméstico',
            commercial: 'Comercial',
            training: 'Entrenamiento'
        };

        const serviceTypeLabels = {
            base_service: 'Servicio Base',
            windows_cleaning: 'Limpieza de Ventanas',
            steam_vacuum: 'Steam Vacuum',
            spring_cleaning: 'Spring Cleaning',
            vacancy_cleaning: 'Vacancy Cleaning',
            oven_cleaning: 'Limpieza de Horno',
            fridge_cleaning: 'Limpieza de Nevera',
            first_cleaning: 'Primera Limpieza',
            one_off_service: 'One Off Service',
            carpet_cleaning: 'Limpieza de Alfombras',
            other_extra: 'Otros Extras',
            discount: 'Descuento'
        };

        const detailedBreakdown = {};

        invoicedSchedules.forEach(schedule => {
            const client = clientsMap.get(schedule.client_id);
            if (!client) return;

            const clientType = client.client_type || 'domestic';
            const clientTypeLabel = clientTypeLabels[clientType] || clientType;
            const serviceDateOnly = extractDateOnly(schedule.start_time);

            // NUEVA LÓGICA: Usar getPriceForSchedule para respetar snapshots
            const priceData = getPriceForSchedule(schedule, client);

            // Procesar cada tipo de servicio en el breakdown
            for (const serviceType in priceData.breakdown) {
                const serviceTypeLabel = serviceTypeLabels[serviceType] || serviceType;
                const key = `${clientType}|${serviceType}`;

                const rawAmount = priceData.breakdown[serviceType];
                const { base } = calculateGST(rawAmount, priceData.gstType);

                if (!detailedBreakdown[key]) {
                    detailedBreakdown[key] = {
                        clientType,
                        clientTypeLabel,
                        serviceType,
                        serviceTypeLabel,
                        revenue: 0,
                        count: 0,
                        services: []
                    };
                }

                detailedBreakdown[key].revenue += base;
                detailedBreakdown[key].count += 1;

                detailedBreakdown[key].services.push({
                    scheduleId: schedule.id,
                    clientName: client.name,
                    serviceDate: serviceDateOnly,
                    itemDescription: serviceTypeLabel,
                    amount: base,
                    rawAmount: rawAmount,
                    gstType: priceData.gstType
                });
            }
        });

        const detailedData = Object.values(detailedBreakdown).map(item => ({
            ...item,
            revenue: parseFloat(item.revenue.toFixed(2))
        })).sort((a, b) => b.revenue - a.revenue);

        const clientTypeBreakdown = {};
        detailedData.forEach(item => {
            if (!clientTypeBreakdown[item.clientType]) {
                clientTypeBreakdown[item.clientType] = {
                    name: item.clientTypeLabel,
                    revenue: 0
                };
            }
            clientTypeBreakdown[item.clientType].revenue += item.revenue;
        });

        const chartData = Object.values(clientTypeBreakdown);

        const pieData = detailedData.map(item => ({
            name: `${item.clientTypeLabel} - ${item.serviceTypeLabel}`,
            value: item.revenue
        }));

        const totalRevenue = detailedData.reduce((sum, item) => sum + item.revenue, 0);

        return { chartData, pieData, detailedData, totalRevenue };
    }, [schedules, clientsMap]);

    if (analysisData.detailedData.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <DollarSign className="w-5 h-5" />
                        Análisis de Ingresos por Tipo de Servicio
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-center text-slate-500 py-8">
                        No hay servicios facturados en el período seleccionado
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5" />
                    Análisis de Ingresos por Tipo de Servicio (Facturados)
                </CardTitle>
                <p className="text-sm text-slate-600 mt-1">
                    Basado en montos reconciliados de servicios facturados • Total: ${analysisData.totalRevenue.toFixed(2)} AUD
                </p>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    <div>
                        <h4 className="text-sm font-semibold mb-4">Ingresos por Tipo de Cliente</h4>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={analysisData.chartData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip 
                                    formatter={(value) => `$${value.toFixed(2)} AUD`}
                                    contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', border: '1px solid #e2e8f0' }}
                                />
                                <Legend />
                                <Bar dataKey="revenue" name="Ingresos (Base sin GST)" fill="#3b82f6" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    <div>
                        <h4 className="text-sm font-semibold mb-4">Distribución Detallada por Tipo de Servicio</h4>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart 
                                data={analysisData.detailedData.slice(0, 10)} 
                                layout="vertical"
                                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" />
                                <YAxis 
                                    type="category" 
                                    dataKey="serviceTypeLabel" 
                                    width={150}
                                    tick={{ fontSize: 12 }}
                                />
                                <Tooltip 
                                    formatter={(value) => `$${value.toFixed(2)} AUD`}
                                    contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', border: '1px solid #e2e8f0' }}
                                />
                                <Legend />
                                <Bar 
                                    dataKey="revenue" 
                                    name="Ingresos (sin GST)" 
                                    fill="#10b981"
                                    label={{ position: 'right', formatter: (value) => `$${value.toFixed(0)}` }}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                        {analysisData.detailedData.length > 10 && (
                            <p className="text-xs text-slate-500 mt-2 text-center">
                                Mostrando top 10 tipos de servicio. Ver tabla completa abajo.
                            </p>
                        )}
                    </div>
                </div>

                <div className="mt-6">
                    <h4 className="text-sm font-semibold mb-3">Resumen Detallado</h4>
                    <div className="overflow-x-auto">
                        <Accordion type="multiple" className="w-full">
                            {analysisData.detailedData.map((item, index) => (
                                <AccordionItem key={index} value={`item-${index}`} className="border rounded-lg mb-2">
                                    <AccordionTrigger className="px-4 py-3 hover:bg-slate-50">
                                        <div className="w-full grid grid-cols-5 gap-4 text-sm">
                                            <div className="text-left font-medium">{item.clientTypeLabel}</div>
                                            <div className="text-left">{item.serviceTypeLabel}</div>
                                            <div className="text-right">{item.count}</div>
                                            <div className="text-right font-semibold text-blue-700">
                                                ${item.revenue.toFixed(2)}
                                            </div>
                                            <div className="text-right">
                                                {((item.revenue / analysisData.totalRevenue) * 100).toFixed(1)}%
                                            </div>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="px-4 py-3 bg-slate-50">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="border-b">
                                                        <th className="text-left py-2 px-2">Fecha</th>
                                                        <th className="text-left py-2 px-2">Cliente</th>
                                                        <th className="text-left py-2 px-2">Descripción</th>
                                                        <th className="text-right py-2 px-2">Monto (sin GST)</th>
                                                        <th className="text-right py-2 px-2">Monto Total</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {item.services.map((service, idx) => (
                                                        <tr key={idx} className="border-b hover:bg-white">
                                                            <td className="py-2 px-2">
                                                                {formatDateOnly(service.serviceDate)}
                                                            </td>
                                                            <td className="py-2 px-2">{service.clientName}</td>
                                                            <td className="py-2 px-2 text-slate-600">{service.itemDescription}</td>
                                                            <td className="text-right py-2 px-2 font-medium">
                                                                ${service.amount.toFixed(2)}
                                                            </td>
                                                            <td className="text-right py-2 px-2 text-slate-600">
                                                                ${service.rawAmount.toFixed(2)}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot>
                                                    <tr className="font-bold bg-blue-50">
                                                        <td colSpan="3" className="py-2 px-2 text-right">Subtotal:</td>
                                                        <td className="text-right py-2 px-2 text-blue-700">
                                                            ${item.revenue.toFixed(2)}
                                                        </td>
                                                        <td className="text-right py-2 px-2 text-slate-600">
                                                            ${item.services.reduce((sum, s) => sum + s.rawAmount, 0).toFixed(2)}
                                                        </td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            ))}
                        </Accordion>
                    </div>

                    <div className="grid grid-cols-5 gap-4 text-xs font-semibold text-slate-600 uppercase tracking-wider px-4 py-2 bg-slate-100 rounded-t-lg mt-4">
                        <div>Tipo de Cliente</div>
                        <div>Tipo de Servicio</div>
                        <div className="text-right">Cantidad</div>
                        <div className="text-right">Ingresos (sin GST)</div>
                        <div className="text-right">% del Total</div>
                    </div>

                    <div className="grid grid-cols-5 gap-4 text-sm font-bold bg-blue-100 px-4 py-3 rounded-b-lg border-t-2 border-blue-300">
                        <div className="col-span-2">Total General</div>
                        <div className="text-right">
                            {analysisData.detailedData.reduce((sum, item) => sum + item.count, 0)}
                        </div>
                        <div className="text-right text-blue-700">
                            ${analysisData.totalRevenue.toFixed(2)}
                        </div>
                        <div className="text-right">100%</div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}