import React, { useState, useMemo, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar, ChevronDown, ChevronUp, Search, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { base44 } from '@/api/base44Client';

// Helper para extraer solo la fecha (YYYY-MM-DD) de un ISO string
const extractDateOnly = (isoString) => {
    if (!isoString) return null;
    return isoString.substring(0, 10);
};

// Helper para verificar si una fecha está en un rango
const isDateInRange = (dateString, rangeStart, rangeEnd) => {
    if (!dateString || !rangeStart || !rangeEnd) return false;
    
    const date = extractDateOnly(dateString);
    const startDate = format(rangeStart, 'yyyy-MM-dd');
    const endDate = format(rangeEnd, 'yyyy-MM-dd');
    
    return date >= startDate && date <= endDate;
};

export default function ClientSummaryReportTab({ monthlySchedules, clients, usersMap }) {
    const [startDate, setStartDate] = useState(() => {
        if (monthlySchedules.length > 0) {
            const dateStr = extractDateOnly(monthlySchedules[0].start_time);
            if (dateStr) {
                const [year, month, day] = dateStr.split('-').map(Number);
                return new Date(year, month - 1, day);
            }
        }
        return new Date();
    });
    const [endDate, setEndDate] = useState(() => {
        if (monthlySchedules.length > 0) {
            const dateStr = extractDateOnly(monthlySchedules[monthlySchedules.length - 1].start_time);
            if (dateStr) {
                const [year, month, day] = dateStr.split('-').map(Number);
                return new Date(year, month - 1, day);
            }
        }
        return new Date();
    });
    const [expandedClients, setExpandedClients] = useState({});
    const [searchTerm, setSearchTerm] = useState('');
    const [reviewedClients, setReviewedClients] = useState({});
    const [currentPeriod, setCurrentPeriod] = useState('');

    // Cargar el estado de revisión guardado
    useEffect(() => {
        const loadReviewedStatus = async () => {
            const period = format(startDate, 'yyyy-MM');
            setCurrentPeriod(period);
            
            try {
                const reviews = await base44.entities.ClientReconciliationReview.filter({
                    period_month: period
                });
                
                const reviewedMap = {};
                reviews.forEach(review => {
                    if (review.reviewed) {
                        reviewedMap[review.client_name] = true;
                    }
                });
                
                setReviewedClients(reviewedMap);
            } catch (error) {
                console.error('Error cargando estado de revisión:', error);
            }
        };
        
        loadReviewedStatus();
    }, [startDate]);

    // Filtrar servicios por rango de fechas y agrupar por cliente
    const clientReport = useMemo(() => {
        const filtered = monthlySchedules.filter(service => {
            return isDateInRange(service.start_time, startDate, endDate);
        });

        // Agrupar por cliente
        const grouped = {};
        filtered.forEach(service => {
            const clientId = service.client_id;
            if (!grouped[clientId]) {
                grouped[clientId] = {
                    clientName: service.client_name,
                    services: [],
                    totalHours: 0,
                    totalAmount: 0,
                    activities: {}
                };
            }
            grouped[clientId].services.push(service);
        });

        // Calcular totales por cliente
        Object.keys(grouped).forEach(clientId => {
            const client = clients.get(clientId);
            const group = grouped[clientId];

            group.services.forEach(service => {
                // Calcular horas
                let hours = 0;
                if (service.cleaner_schedules && Array.isArray(service.cleaner_schedules)) {
                    service.cleaner_schedules.forEach(cs => {
                        const start = new Date(cs.start_time.endsWith('Z') ? cs.start_time : `${cs.start_time}Z`);
                        const end = new Date(cs.end_time.endsWith('Z') ? cs.end_time : `${cs.end_time}Z`);
                        hours += (end - start) / (1000 * 60 * 60);
                    });
                } else {
                    const start = new Date(service.start_time.endsWith('Z') ? service.start_time : `${service.start_time}Z`);
                    const end = new Date(service.end_time.endsWith('Z') ? service.end_time : `${service.end_time}Z`);
                    hours += (end - start) / (1000 * 60 * 60);
                }

                group.totalHours += hours;

                // Calcular monto
                let amount = 0;
                let gstType = client?.gst_type || 'inclusive';

                if (service.reconciliation_items && service.reconciliation_items.length > 0) {
                amount = service.reconciliation_items.reduce((itemTotal, item) => {
                const itemAmount = parseFloat(item.amount) || 0;
                return item.type === 'discount' ? itemTotal - itemAmount : itemTotal + itemAmount;
                }, 0);
                if (service.xero_invoiced && service.billed_gst_type_snapshot) {
                gstType = service.billed_gst_type_snapshot;
                }
                } else {
                if (service.xero_invoiced && service.billed_price_snapshot !== undefined && service.billed_price_snapshot !== null) {
                amount = service.billed_price_snapshot;
                gstType = service.billed_gst_type_snapshot || 'inclusive';
                } else {
                amount = client?.current_service_price || 0;
                }
                }

                // Calcular base sin GST
                let baseAmount = amount;
                if (gstType === 'inclusive') {
                baseAmount = amount / 1.1;
                }

                group.totalAmount += amount;
                if (!group.baseAmount) group.baseAmount = 0;
                group.baseAmount += baseAmount;
            });
        });

        // Convertir a array y ordenar por nombre de cliente
        return Object.values(grouped).sort((a, b) => a.clientName.localeCompare(b.clientName));
        }, [monthlySchedules, clients, startDate, endDate]);

        // Filtrar y ordenar clientes: no revisados primero, revisados al final
        const filteredClientReport = useMemo(() => {
            let filtered = clientReport;

            if (searchTerm.trim()) {
                const term = searchTerm.toLowerCase();
                filtered = clientReport.filter(client => 
                    client.clientName.toLowerCase().includes(term)
                );
            }

            // Ordenar: no revisados primero, revisados al final
            return filtered.sort((a, b) => {
                const aReviewed = reviewedClients[a.clientName] || false;
                const bReviewed = reviewedClients[b.clientName] || false;

                if (aReviewed === bReviewed) {
                    return a.clientName.localeCompare(b.clientName);
                }
                return aReviewed ? 1 : -1;
            });
        }, [clientReport, searchTerm, reviewedClients]);

        const toggleReviewed = async (clientName) => {
            const newValue = !reviewedClients[clientName];

            setReviewedClients(prev => ({
                ...prev,
                [clientName]: newValue
            }));

            try {
                const user = await base44.auth.me();

                // Buscar si ya existe un registro
                const existing = await base44.entities.ClientReconciliationReview.filter({
                    client_name: clientName,
                    period_month: currentPeriod
                });

                if (existing.length > 0) {
                    // Actualizar existente
                    await base44.entities.ClientReconciliationReview.update(existing[0].id, {
                        reviewed: newValue,
                        reviewed_at: new Date().toISOString(),
                        reviewed_by: user.id
                    });
                } else {
                    // Crear nuevo
                    await base44.entities.ClientReconciliationReview.create({
                        client_name: clientName,
                        period_month: currentPeriod,
                        reviewed: newValue,
                        reviewed_at: new Date().toISOString(),
                        reviewed_by: user.id
                    });
                }
            } catch (error) {
                console.error('Error guardando estado de revisión:', error);
            }
        };

    const toggleExpand = (clientId) => {
        setExpandedClients(prev => ({
            ...prev,
            [clientId]: !prev[clientId]
        }));
    };

    const totalStats = useMemo(() => {
        let totalAmount = 0;
        let cashAmount = 0;
        let normalAmount = 0;

        monthlySchedules.forEach(service => {
            if (isDateInRange(service.start_time, startDate, endDate)) {
                const client = clients.get(service.client_id);

                let amount = 0;
                let gstType = client?.gst_type || 'inclusive';

                if (service.reconciliation_items && service.reconciliation_items.length > 0) {
                    amount = service.reconciliation_items.reduce((itemTotal, item) => {
                        const itemAmount = parseFloat(item.amount) || 0;
                        return item.type === 'discount' ? itemTotal - itemAmount : itemTotal + itemAmount;
                    }, 0);
                    if (service.xero_invoiced && service.billed_gst_type_snapshot) {
                        gstType = service.billed_gst_type_snapshot;
                    }
                } else {
                    if (service.xero_invoiced && service.billed_price_snapshot !== undefined && service.billed_price_snapshot !== null) {
                        amount = service.billed_price_snapshot;
                        gstType = service.billed_gst_type_snapshot || 'inclusive';
                    } else {
                        amount = client?.current_service_price || 0;
                    }
                }

                // Calcular base sin GST
                let baseAmount = amount;
                if (gstType === 'inclusive') {
                    baseAmount = amount / 1.1;
                }

                totalAmount += baseAmount;

                if (client?.payment_method === 'cash') {
                    cashAmount += baseAmount;
                } else {
                    normalAmount += baseAmount;
                }
            }
        });

        return {
            totalAmount,
            cashAmount,
            normalAmount,
            totalHours: filteredClientReport.reduce((sum, client) => sum + client.totalHours, 0),
            clientCount: filteredClientReport.length
        };
    }, [filteredClientReport, monthlySchedules, clients, startDate, endDate]);

    return (
        <div className="space-y-6">
            {/* Date Range Selector and Search */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex flex-col md:flex-row items-start md:items-center gap-4 w-full">
                        <div className="relative w-full md:w-[300px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                type="text"
                                placeholder="Buscar cliente..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-700">Desde:</span>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-[200px] justify-start text-left font-medium hover:bg-white">
                                        <Calendar className="mr-2 h-4 w-4 text-blue-600" />
                                        {format(startDate, "dd/MM/yyyy", { locale: es })}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <CalendarComponent 
                                        mode="single" 
                                        selected={startDate} 
                                        onSelect={setStartDate}
                                        initialFocus 
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-700">Hasta:</span>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-[200px] justify-start text-left font-medium hover:bg-white">
                                        <Calendar className="mr-2 h-4 w-4 text-blue-600" />
                                        {format(endDate, "dd/MM/yyyy", { locale: es })}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <CalendarComponent 
                                        mode="single" 
                                        selected={endDate} 
                                        onSelect={setEndDate}
                                        initialFocus 
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="shadow-lg border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-4">
                    <p className="text-sm text-blue-700 font-semibold">Ingresos Totales (sin GST)</p>
                    <p className="text-3xl font-bold text-blue-900 mt-2">${totalStats.totalAmount.toFixed(2)}</p>
                    <div className="mt-3 space-y-1 text-xs">
                        <div className="flex justify-between text-slate-600">
                            <span>• Cash:</span>
                            <span className="font-semibold text-green-700">${totalStats.cashAmount.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                            <span>• Otros:</span>
                            <span className="font-semibold text-blue-700">${totalStats.normalAmount.toFixed(2)}</span>
                        </div>
                    </div>
                </Card>

                <Card className="shadow-lg border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                    <p className="text-sm text-slate-700 font-semibold">Horas Totales</p>
                    <p className="text-3xl font-bold text-slate-900 mt-2">{totalStats.totalHours.toFixed(2)}h</p>
                </Card>

                <Card className="shadow-lg border border-green-200 bg-gradient-to-br from-green-50 to-white p-4">
                    <p className="text-sm text-green-700 font-semibold">Clientes</p>
                    <p className="text-3xl font-bold text-green-900 mt-2">{totalStats.clientCount}</p>
                </Card>
            </div>

            {/* Client Summary Table */}
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-200">
                    <h2 className="text-2xl font-bold text-slate-900">Resumen por Cliente</h2>
                    <p className="text-sm text-slate-600 mt-1">
                        {format(startDate, "d MMM yyyy", { locale: es })} - {format(endDate, "d MMM yyyy", { locale: es })}
                    </p>
                </div>
                
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader className="bg-slate-100">
                            <TableRow>
                                <TableHead className="font-bold text-slate-700 w-12 text-center">✓</TableHead>
                                <TableHead className="font-bold text-slate-700 w-12"></TableHead>
                                <TableHead className="font-bold text-slate-700">Cliente</TableHead>
                                <TableHead className="text-right font-bold text-slate-700">Servicios</TableHead>
                                <TableHead className="text-right font-bold text-slate-700">Horas</TableHead>
                                <TableHead className="text-right font-bold text-slate-700">Tarifa Promedio</TableHead>
                                <TableHead className="text-right font-bold text-slate-700">Base (sin GST)</TableHead>
                                <TableHead className="text-right font-bold text-slate-700">Monto Total</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredClientReport.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan="7" className="text-center py-12">
                                        <div className="flex flex-col items-center gap-3">
                                            <Search className="w-12 h-12 text-slate-300" />
                                            <p className="text-slate-600 font-medium">
                                                {searchTerm ? `No se encontraron clientes con "${searchTerm}"` : 'No hay clientes en este período'}
                                            </p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : filteredClientReport.map((clientGroup, index) => {
                                const avgRate = clientGroup.totalHours > 0 ? clientGroup.totalAmount / clientGroup.totalHours : 0;
                                const isExpanded = expandedClients[index];
                                const isReviewed = reviewedClients[clientGroup.clientName] || false;

                                return (
                                    <React.Fragment key={index}>
                                        {/* Cliente Principal Row */}
                                        <TableRow 
                                            className={`${isReviewed ? 'bg-gradient-to-r from-green-50 to-green-100' : 'bg-gradient-to-r from-slate-50 to-white'} hover:bg-slate-100 cursor-pointer border-b-2 ${isReviewed ? 'border-green-300' : 'border-slate-200'}`}
                                        >
                                            <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                                <Checkbox
                                                    checked={isReviewed}
                                                    onCheckedChange={() => toggleReviewed(clientGroup.clientName)}
                                                    className={isReviewed ? 'border-green-600 data-[state=checked]:bg-green-600' : ''}
                                                />
                                            </TableCell>
                                            <TableCell className="text-center" onClick={() => toggleExpand(index)}>
                                                {isExpanded ? 
                                                    <ChevronUp className="w-5 h-5 text-blue-600" /> : 
                                                    <ChevronDown className="w-5 h-5 text-slate-400" />
                                                }
                                            </TableCell>
                                            <TableCell className={`font-bold ${isReviewed ? 'text-green-900' : 'text-slate-900'}`} onClick={() => toggleExpand(index)}>
                                                <div className="flex items-center gap-2">
                                                    {clientGroup.clientName}
                                                    {isReviewed && <CheckCircle className="w-4 h-4 text-green-600" />}
                                                </div>
                                            </TableCell>
                                            <TableCell className={`text-right font-semibold ${isReviewed ? 'text-green-800' : 'text-slate-700'}`} onClick={() => toggleExpand(index)}>
                                                {clientGroup.services.length}
                                            </TableCell>
                                            <TableCell className={`text-right font-semibold ${isReviewed ? 'text-green-800' : 'text-slate-700'}`} onClick={() => toggleExpand(index)}>
                                                {clientGroup.totalHours.toFixed(2)}h
                                            </TableCell>
                                            <TableCell className={`text-right font-semibold ${isReviewed ? 'text-green-800' : 'text-slate-700'}`} onClick={() => toggleExpand(index)}>
                                                ${avgRate.toFixed(2)}/h
                                            </TableCell>
                                            <TableCell className={`text-right font-semibold ${isReviewed ? 'text-green-700' : 'text-slate-600'}`} onClick={() => toggleExpand(index)}>
                                                ${(clientGroup.baseAmount || 0).toFixed(2)}
                                            </TableCell>
                                            <TableCell className="text-right" onClick={() => toggleExpand(index)}>
                                                <span className={`font-bold text-lg ${isReviewed ? 'text-green-700' : 'text-blue-700'}`}>
                                                    ${clientGroup.totalAmount.toFixed(2)}
                                                </span>
                                            </TableCell>
                                        </TableRow>

                                        {/* Detalles de Servicios */}
                                        {isExpanded && clientGroup.services.map((service, serviceIdx) => {
                                            let serviceHours = 0;
                                            if (service.cleaner_schedules && Array.isArray(service.cleaner_schedules)) {
                                                service.cleaner_schedules.forEach(cs => {
                                                    const start = new Date(cs.start_time.endsWith('Z') ? cs.start_time : `${cs.start_time}Z`);
                                                    const end = new Date(cs.end_time.endsWith('Z') ? cs.end_time : `${cs.end_time}Z`);
                                                    serviceHours += (end - start) / (1000 * 60 * 60);
                                                });
                                            } else {
                                                const start = new Date(service.start_time.endsWith('Z') ? service.start_time : `${service.start_time}Z`);
                                                const end = new Date(service.end_time.endsWith('Z') ? service.end_time : `${service.end_time}Z`);
                                                serviceHours = (end - start) / (1000 * 60 * 60);
                                            }

                                            let serviceAmount = 0;
                                            let serviceGstType = 'inclusive';
                                            
                                            if (service.reconciliation_items && service.reconciliation_items.length > 0) {
                                                serviceAmount = service.reconciliation_items.reduce((itemTotal, item) => {
                                                    const itemAmount = parseFloat(item.amount) || 0;
                                                    return item.type === 'discount' ? itemTotal - itemAmount : itemTotal + itemAmount;
                                                }, 0);
                                                if (service.xero_invoiced && service.billed_gst_type_snapshot) {
                                                    serviceGstType = service.billed_gst_type_snapshot;
                                                } else {
                                                    const client = clients.get(service.client_id);
                                                    serviceGstType = client?.gst_type || 'inclusive';
                                                }
                                            } else {
                                                if (service.xero_invoiced && service.billed_price_snapshot !== undefined && service.billed_price_snapshot !== null) {
                                                    serviceAmount = service.billed_price_snapshot;
                                                    serviceGstType = service.billed_gst_type_snapshot || 'inclusive';
                                                } else {
                                                    const client = clients.get(service.client_id);
                                                    serviceAmount = client?.current_service_price || 0;
                                                    serviceGstType = client?.gst_type || 'inclusive';
                                                }
                                            }

                                            let serviceBaseAmount = serviceAmount;
                                            if (serviceGstType === 'inclusive') {
                                                serviceBaseAmount = serviceAmount / 1.1;
                                            }

                                            const serviceDate = parseISOAsLocal(service.start_time);

                                            return (
                                                <TableRow 
                                                    key={serviceIdx} 
                                                    className={`${isReviewed ? 'bg-green-50/30' : 'bg-white'} hover:bg-blue-50 border-b border-slate-100 text-sm`}
                                                >
                                                    <TableCell></TableCell>
                                                    <TableCell></TableCell>
                                                    <TableCell className="text-slate-600 pl-8">
                                                        <span className="text-xs">
                                                            {format(serviceDate, "d MMM", { locale: es })} @ {format(serviceDate, "HH:mm")}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-right text-slate-600">1</TableCell>
                                                    <TableCell className="text-right text-slate-600">
                                                        {serviceHours.toFixed(2)}h
                                                    </TableCell>
                                                    <TableCell className="text-right text-slate-600">
                                                        ${(serviceAmount / serviceHours).toFixed(2)}/h
                                                    </TableCell>
                                                    <TableCell className="text-right text-slate-600">
                                                        ${serviceBaseAmount.toFixed(2)}
                                                    </TableCell>
                                                    <TableCell className="text-right font-semibold text-blue-600">
                                                        ${serviceAmount.toFixed(2)}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </React.Fragment>
                                    );
                                    })}
                        </TableBody>
                        </Table>
                        </div>
                        </div>
                        </div>
                        );
                        }