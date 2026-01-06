import React, { useState, useEffect, useMemo } from "react";
import { Client } from "@/entities/Client";
import { WorkEntry } from "@/entities/WorkEntry";
import { Schedule } from "@/entities/Schedule";
import { FixedCost } from "@/entities/FixedCost";
import { User } from "@/entities/User";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
    TrendingUp, 
    DollarSign, 
    Calendar,
    Search,
    AlertCircle,
    Calculator
} from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";

const calculateGSTBase = (price, gstType) => {
    if (!price) return 0;
    if (gstType === 'inclusive') {
        return price / 1.1;
    }
    return price;
};

export default function AumentoClientesDosPage() {
    const [clients, setClients] = useState([]);
    const [workEntries, setWorkEntries] = useState([]);
    const [schedules, setSchedules] = useState([]);
    const [fixedCosts, setFixedCosts] = useState([]);
    const [user, setUser] = useState(null);
    
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    
    const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
    const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
    const [targetProfit, setTargetProfit] = useState(30);
    
    const [modifiedHours, setModifiedHours] = useState({});

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            setError("");
            
            const [currentUser, clientsData, workEntriesData, schedulesData, fixedCostsData] = await Promise.all([
                User.me(),
                Client.list(),
                WorkEntry.list(),
                Schedule.list(),
                FixedCost.list()
            ]);
            
            // Filtrar agosto y septiembre 2025
            const filteredWorkEntries = workEntriesData.filter(we => {
                if (!we.work_date) return true;
                const weDate = new Date(we.work_date);
                const year = weDate.getFullYear();
                const month = weDate.getMonth();
                return !(year === 2025 && (month === 7 || month === 8));
            });
            
            const filteredSchedules = schedulesData.filter(s => {
                if (!s.start_time) return true;
                const sDate = new Date(s.start_time);
                const year = sDate.getFullYear();
                const month = sDate.getMonth();
                return !(year === 2025 && (month === 7 || month === 8));
            });
            
            setUser(currentUser);
            setClients(clientsData.filter(c => c.active !== false));
            setWorkEntries(filteredWorkEntries);
            setSchedules(filteredSchedules);
            setFixedCosts(fixedCostsData);
            
        } catch (err) {
            console.error("Error cargando datos:", err);
            setError("Error al cargar los datos");
        } finally {
            setLoading(false);
        }
    };

    const analyzedClients = useMemo(() => {
        if (!startDate || !endDate) return [];
        
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        // Calcular total de gastos fijos del período
        const totalFixedCosts = fixedCosts
            .filter(fc => {
                if (!fc.period) return false;
                const fcDate = new Date(fc.period);
                return fcDate >= start && fcDate <= end;
            })
            .reduce((sum, fc) => sum + (fc.amount || 0), 0);
        
        // Calcular total de horas trabajadas en el período para distribuir gastos fijos
        const totalHoursWorked = workEntries
            .filter(we => {
                if (!we.work_date || we.invoiced === false) return false;
                const weDate = new Date(we.work_date);
                return weDate >= start && weDate <= end;
            })
            .reduce((sum, we) => sum + (we.hours || 0), 0);
        
        const costPerHour = totalHoursWorked > 0 ? totalFixedCosts / totalHoursWorked : 0;
        
        return clients
            .filter(client => client.active !== false)
            .map(client => {
                const clientSchedules = schedules.filter(s => 
                    s.client_id === client.id && 
                    s.xero_invoiced === true &&
                    s.start_time &&
                    new Date(s.start_time) >= start &&
                    new Date(s.start_time) <= end
                );
                
                const clientWorkEntries = workEntries.filter(we =>
                    we.client_id === client.id &&
                    we.work_date &&
                    new Date(we.work_date) >= start &&
                    new Date(we.work_date) <= end &&
                    we.invoiced !== false
                );
                
                const totalLaborCost = clientWorkEntries.reduce((sum, we) => 
                    sum + (we.total_amount || 0), 0
                );
                
                const totalHoursForClient = clientWorkEntries.reduce((sum, we) => 
                    sum + (we.hours || 0), 0
                );
                
                // Calcular porcentaje de horas del cliente sobre el total
                const clientHourShare = totalHoursWorked > 0 ? totalHoursForClient / totalHoursWorked : 0;
                
                // Asignar gastos fijos proporcionalmente
                const distributedFixedCost = totalFixedCosts * clientHourShare;
                const fixedCostPerHour = totalHoursForClient > 0 ? distributedFixedCost / totalHoursForClient : 0;
                
                const laborCostPerHour = totalHoursForClient > 0 ? totalLaborCost / totalHoursForClient : 0;
                const totalCostPerHour = laborCostPerHour + fixedCostPerHour;
                
                const currentPrice = calculateGSTBase(
                    client.current_service_price || 0, 
                    client.gst_type || 'inclusive'
                );
                
                const currentHours = client.service_hours || 0;
                const currentPricePerHour = currentHours > 0 ? currentPrice / currentHours : 0;
                
                // Obtener horas modificadas o usar las actuales
                const newHours = modifiedHours[client.id] !== undefined 
                    ? parseFloat(modifiedHours[client.id]) || currentHours
                    : currentHours;
                
                // Calcular nuevo precio por hora con rentabilidad objetivo
                const targetMultiplier = 1 + (targetProfit / 100);
                const newPricePerHour = totalCostPerHour * targetMultiplier;
                const newTotalPrice = newPricePerHour * newHours;
                const priceIncrease = newTotalPrice - currentPrice;
                const percentageIncrease = currentPrice > 0 ? (priceIncrease / currentPrice) * 100 : 0;
                
                return {
                    id: client.id,
                    name: client.name,
                    currentPrice,
                    currentHours,
                    currentPricePerHour,
                    laborCostPerHour,
                    fixedCostPerHour,
                    totalCostPerHour,
                    serviceCount: clientSchedules.length,
                    newHours,
                    newPricePerHour,
                    newTotalPrice,
                    priceIncrease,
                    percentageIncrease,
                    gstType: client.gst_type || 'inclusive'
                };
            })
            .filter(c => c.serviceCount > 0)
            .sort((a, b) => b.priceIncrease - a.priceIncrease);
    }, [clients, workEntries, schedules, fixedCosts, startDate, endDate, targetProfit, modifiedHours]);

    const filteredClients = useMemo(() => {
        if (!searchQuery) return analyzedClients;
        const query = searchQuery.toLowerCase();
        return analyzedClients.filter(c => 
            c.name.toLowerCase().includes(query)
        );
    }, [analyzedClients, searchQuery]);

    const handleHoursChange = (clientId, value) => {
        setModifiedHours(prev => ({
            ...prev,
            [clientId]: value
        }));
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="text-slate-600">Cargando análisis...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                        <Calculator className="w-8 h-8 text-blue-600" />
                        Análisis de Rentabilidad por Cliente
                    </h1>
                    <p className="text-slate-600 mt-2">
                        Simula cambios en horas de servicio para optimizar rentabilidad
                    </p>
                </div>

                {error && (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {/* Configuración */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Calendar className="w-5 h-5" />
                            Configuración del Análisis
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div>
                                <Label>Fecha Inicio</Label>
                                <Input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                />
                            </div>
                            <div>
                                <Label>Fecha Fin</Label>
                                <Input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                />
                            </div>
                            <div>
                                <Label>Rentabilidad Objetivo (%)</Label>
                                <Input
                                    type="number"
                                    value={targetProfit}
                                    onChange={(e) => setTargetProfit(parseFloat(e.target.value) || 0)}
                                    min="0"
                                    max="100"
                                />
                            </div>
                            <div className="flex items-end">
                                <Button onClick={loadData} className="w-full">
                                    Actualizar
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Búsqueda */}
                <Card>
                    <CardContent className="pt-6">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                            <Input
                                placeholder="Buscar cliente..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Resumen */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-blue-100 rounded-lg">
                                    <DollarSign className="w-6 h-6 text-blue-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-slate-600">Total Clientes</p>
                                    <p className="text-2xl font-bold text-slate-900">
                                        {filteredClients.length}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-green-100 rounded-lg">
                                    <TrendingUp className="w-6 h-6 text-green-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-slate-600">Aumento Promedio</p>
                                    <p className="text-2xl font-bold text-slate-900">
                                        {filteredClients.length > 0
                                            ? `${(filteredClients.reduce((sum, c) => sum + c.percentageIncrease, 0) / filteredClients.length).toFixed(1)}%`
                                            : "0%"
                                        }
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-purple-100 rounded-lg">
                                    <Calculator className="w-6 h-6 text-purple-600" />
                                </div>
                                <div>
                                    <p className="text-sm text-slate-600">Aumento Total</p>
                                    <p className="text-2xl font-bold text-slate-900">
                                        ${filteredClients.reduce((sum, c) => sum + c.priceIncrease, 0).toFixed(2)}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Tabla de Clientes */}
                <Card>
                    <CardHeader>
                        <CardTitle>Análisis Detallado</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-left py-3 px-2 font-semibold text-slate-700">Cliente</th>
                                        <th className="text-right py-3 px-2 font-semibold text-slate-700">Precio Actual</th>
                                        <th className="text-right py-3 px-2 font-semibold text-slate-700">Horas Actuales</th>
                                        <th className="text-right py-3 px-2 font-semibold text-slate-700">$/Hora Actual</th>
                                        <th className="text-right py-3 px-2 font-semibold text-slate-700">Costo Labor/h</th>
                                        <th className="text-right py-3 px-2 font-semibold text-slate-700">Gastos Fijos/h</th>
                                        <th className="text-right py-3 px-2 font-semibold text-slate-700">Costo Total/h</th>
                                        <th className="text-right py-3 px-2 font-semibold text-slate-700 bg-blue-50">Nuevas Horas</th>
                                        <th className="text-right py-3 px-2 font-semibold text-slate-700 bg-green-50">Nuevo $/Hora</th>
                                        <th className="text-right py-3 px-2 font-semibold text-slate-700 bg-green-50">Nuevo Precio</th>
                                        <th className="text-right py-3 px-2 font-semibold text-slate-700 bg-amber-50">Aumento</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredClients.map((client) => (
                                        <tr key={client.id} className="border-b hover:bg-slate-50">
                                            <td className="py-3 px-2 font-medium">{client.name}</td>
                                            <td className="text-right py-3 px-2">${client.currentPrice.toFixed(2)}</td>
                                            <td className="text-right py-3 px-2">{client.currentHours.toFixed(2)}h</td>
                                            <td className="text-right py-3 px-2">${client.currentPricePerHour.toFixed(2)}</td>
                                            <td className="text-right py-3 px-2 text-red-600">${client.laborCostPerHour.toFixed(2)}</td>
                                            <td className="text-right py-3 px-2 text-orange-600">${client.fixedCostPerHour.toFixed(2)}</td>
                                            <td className="text-right py-3 px-2 font-semibold text-red-700">${client.totalCostPerHour.toFixed(2)}</td>
                                            <td className="text-right py-3 px-2 bg-blue-50">
                                                <Input
                                                    type="number"
                                                    step="0.25"
                                                    min="0.5"
                                                    value={modifiedHours[client.id] ?? client.currentHours}
                                                    onChange={(e) => handleHoursChange(client.id, e.target.value)}
                                                    className="w-20 text-right"
                                                />
                                            </td>
                                            <td className="text-right py-3 px-2 font-semibold bg-green-50 text-green-700">
                                                ${client.newPricePerHour.toFixed(2)}
                                            </td>
                                            <td className="text-right py-3 px-2 font-semibold bg-green-50 text-green-700">
                                                ${client.newTotalPrice.toFixed(2)}
                                            </td>
                                            <td className="text-right py-3 px-2 bg-amber-50">
                                                <div className="flex flex-col items-end">
                                                    <span className={`font-semibold ${client.priceIncrease >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                        ${client.priceIncrease.toFixed(2)}
                                                    </span>
                                                    <Badge variant={client.percentageIncrease >= 0 ? "default" : "destructive"} className="mt-1">
                                                        {client.percentageIncrease >= 0 ? '+' : ''}{client.percentageIncrease.toFixed(1)}%
                                                    </Badge>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {filteredClients.length === 0 && (
                                <div className="text-center py-12 text-slate-500">
                                    No se encontraron clientes con servicios en el período seleccionado
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}