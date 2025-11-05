import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Users, DollarSign, Clock, BarChart, Download, Search, X, TrendingUp } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format, parse } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorkEntry } from "@/entities/WorkEntry";

// NUEVA FUNCIÓN: Extrae solo la fecha (YYYY-MM-DD) de un string ISO
const extractDateOnly = (isoString) => {
  if (!isoString) return null;
  return isoString.substring(0, 10);
};

// NUEVA FUNCIÓN: Formatea una fecha YYYY-MM-DD sin conversión de zona horaria
const formatDateOnly = (dateString) => {
  if (!dateString) return '';
  // Use parse to explicitly define the date format and avoid timezone issues with new Date()
  const date = parse(dateString, 'yyyy-MM-dd', new Date());
  return format(date, "d MMM yyyy", { locale: es });
};

const activityLabels = {
  domestic: "Doméstico",
  commercial: "Comercial",
  windows: "Ventanas",
  steam_vacuum: "Vapor/Aspirado",
  entrenamiento: "Entrenamiento",
  otros: "Otros"
};

const activityColors = {
  domestic: "bg-blue-100 text-blue-800",
  commercial: "bg-green-100 text-green-800",
  windows: "bg-purple-100 text-purple-800",
  steam_vacuum: "bg-orange-100 text-orange-800",
  entrenamiento: "bg-pink-100 text-pink-800",
  otros: "bg-gray-100 text-gray-800"
};

export default function ConsolidatedClientAnalysis() {
  const [searchTerm, setSearchTerm] = useState("");
  const [allEntries, setAllEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistoricalData();
  }, []);

  const loadHistoricalData = async () => {
    try {
      // Load ALL work entries from April 1st, 2025 onwards
      const startDate = new Date('2025-04-01');
      const allWorkEntries = await WorkEntry.list("-work_date");
      
      // Filter entries from April 1st, 2025 onwards and exclude training
      const historicalEntries = allWorkEntries.filter(entry => {
        const workDate = new Date(entry.work_date);
        return workDate >= startDate && entry.activity !== 'entrenamiento';
      });

      setAllEntries(historicalEntries);
    } catch (error) {
      console.error("Error loading historical data:", error);
      setAllEntries([]);
    } finally {
      setLoading(false);
    }
  };

  // Calculate client data from all historical entries
  const clientData = allEntries.reduce((acc, entry) => {
    const clientName = entry.client_name;
    if (!clientName) return acc;

    if (!acc[clientName]) {
      acc[clientName] = {
        totalAmount: 0,
        totalHours: 0,
        serviceDates: new Set()
      };
    }
    acc[clientName].totalAmount += entry.total_amount || 0;
    acc[clientName].totalHours += entry.hours || 0;
    if (entry.work_date) {
        // Use extractDateOnly to ensure only the date part is added to the set
        acc[clientName].serviceDates.add(extractDateOnly(entry.work_date));
    }
    return acc;
  }, {});

  // Calculate averages, service counts, and sort ALL clients
  const allClients = Object.entries(clientData).map(([name, data]) => ({
    name,
    totalAmount: data.totalAmount,
    totalHours: data.totalHours,
    serviceCount: data.serviceDates.size,
    averageHourlyRate: data.totalHours > 0 ? data.totalAmount / data.totalHours : 0
  }))
  .sort((a, b) => b.totalHours - a.totalHours);

  // Get top 20 for initial display
  const topClients = allClients.slice(0, 20);

  // Filter logic: if searching, search in ALL clients; if not, show top 20
  const displayedClients = searchTerm.trim() 
    ? allClients.filter(client =>
        client.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : topClients;

  const handleDownloadCSV = () => {
    const headers = [
      "Nombre del Cliente",
      "Total Horas Históricas",
      "Costo Promedio por Hora (AUD)",
      "Costo Total Histórico (AUD)",
      "Cantidad de Servicios Históricos"
    ];

    const rows = topClients.map(client =>
      [
        `"${client.name.replace(/"/g, '""')}"`,
        client.totalHours.toFixed(2),
        client.averageHourlyRate.toFixed(2),
        client.totalAmount.toFixed(2),
        client.serviceCount
      ].join(',')
    );

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `analisis_consolidado_clientes_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  
  if (loading) {
    return (
      <Card className="shadow-lg border-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-600" />
            Análisis de Cliente Consolidado
          </CardTitle>
        </CardHeader>
        <CardContent className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-4" />
          <p className="text-slate-600">Cargando datos históricos...</p>
        </CardContent>
      </Card>
    );
  }

  if (allEntries.length === 0) {
      return (
          <Card className="shadow-lg border-0">
              <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-green-600" />
                      Análisis de Cliente Consolidado
                  </CardTitle>
              </CardHeader>
              <CardContent className="p-12 text-center">
                   <BarChart className="w-24 h-24 mx-auto text-slate-300" />
                   <h3 className="mt-4 text-lg font-semibold text-slate-700">No hay datos históricos</h3>
                   <p className="text-slate-500">No se encontraron trabajos desde abril 2025.</p>
              </CardContent>
          </Card>
      )
  }

  return (
    <Card className="shadow-lg border-0 bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
      <CardHeader>
        <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-600" />
              Análisis de Cliente Consolidado
            </CardTitle>
            <Button variant="outline" size="sm" onClick={handleDownloadCSV} disabled={topClients.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                Descargar Top 20 Histórico (CSV)
            </Button>
        </div>
        <p className="text-green-800 mt-1">
          Datos consolidados desde abril 2025 hasta la fecha. Total de {allClients.length} clientes históricos.
        </p>
        
        <div className="mt-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-green-500 pointer-events-none" />
          <Input
            placeholder={`Buscar entre ${allClients.length} clientes históricos...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-11 border-green-300 focus:border-green-500 focus:ring-green-500 bg-white"
          />
          {searchTerm && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSearchTerm("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

      </CardHeader>
      <CardContent className="p-0">
        <Accordion type="single" collapsible className="w-full">
            {displayedClients.map((client) => {
              const originalIndex = allClients.findIndex(c => c.name === client.name);
              return (
                <AccordionItem key={client.name} value={client.name} className="border-b last:border-b-0">
                    <AccordionTrigger className="p-4 hover:bg-green-50/50 transition-colors w-full">
                        <div className="flex items-center gap-4 w-full">
                           <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                              originalIndex === 0 ? 'bg-yellow-500' :
                              originalIndex === 1 ? 'bg-gray-400' :
                              originalIndex === 2 ? 'bg-amber-600' : 'bg-green-500'
                            }`}>
                              {originalIndex + 1}
                            </div>
                            <span className="font-bold text-slate-900 flex-1 text-left">{client.name}</span>
                            <div className="hidden md:flex items-center gap-6 text-sm text-slate-700">
                                <div className="text-center w-28">
                                    <p className="font-semibold text-lg">{client.totalHours.toFixed(1)}h</p>
                                    <p className="text-xs text-slate-500">Total Histórico</p>
                                </div>
                                <div className="text-center w-28">
                                    <p className="font-semibold text-lg">${client.averageHourlyRate.toFixed(2)}</p>
                                    <p className="text-xs text-slate-500">Costo/h Promedio</p>
                                </div>
                                <div className="text-center w-28">
                                    <p className="font-semibold text-lg text-green-600">${client.totalAmount.toFixed(2)}</p>
                                    <p className="text-xs text-slate-500">Costo Total</p>
                                </div>
                                <div className="text-center w-28">
                                    <p className="font-semibold text-lg">{client.serviceCount}</p>
                                    <p className="text-xs text-slate-500">Servicios</p>
                                </div>
                            </div>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent>
                        <div className="bg-gradient-to-br from-slate-50 to-green-50/30 p-6 border-t">
                             {/* Responsive stats for mobile */}
                            <div className="grid grid-cols-2 md:hidden gap-4 mb-6">
                                <div className="bg-white p-3 rounded-lg text-center border">
                                    <p className="text-xs text-slate-500">Total Histórico</p>
                                    <p className="font-semibold text-lg">{client.totalHours.toFixed(1)}h</p>
                                </div>
                                <div className="bg-white p-3 rounded-lg text-center border">
                                    <p className="text-xs text-slate-500">Costo/h Promedio</p>
                                    <p className="font-semibold text-lg">${client.averageHourlyRate.toFixed(2)}</p>
                                </div>
                                <div className="bg-white p-3 rounded-lg text-center border">
                                    <p className="text-xs text-slate-500">Costo Total</p>
                                    <p className="font-semibold text-lg text-green-600">${client.totalAmount.toFixed(2)}</p>
                                </div>
                                <div className="bg-white p-3 rounded-lg text-center border">
                                    <p className="text-xs text-slate-500">Servicios</p>
                                    <p className="font-semibold text-lg">{client.serviceCount}</p>
                                </div>
                            </div>

                            <h4 className="text-lg font-semibold text-slate-900 mb-4">
                                Historial Completo de Trabajos para {client.name}
                            </h4>
                            <div className="overflow-x-auto rounded-lg border bg-white">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Fecha</TableHead>
                                            <TableHead>Limpiador</TableHead>
                                            <TableHead>Actividad</TableHead>
                                            <TableHead className="text-right">Horas</TableHead>
                                            <TableHead className="text-right">Costo</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {allEntries
                                            .filter(entry => entry.client_name === client.name)
                                            .sort((a, b) => new Date(b.work_date) - new Date(a.work_date))
                                            .map((entry) => (
                                                <TableRow key={entry.id}>
                                                <TableCell>{formatDateOnly(extractDateOnly(entry.work_date))}</TableCell>
                                                <TableCell>{entry.cleaner_name}</TableCell>
                                                <TableCell>
                                                    <Badge className={`${activityColors[entry.activity] || activityColors['otros']} border-0`}>
                                                    {activityLabels[entry.activity] || entry.activity}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">{(entry.hours || 0).toFixed(2)}h</TableCell>
                                                <TableCell className="text-right font-semibold">${(entry.total_amount || 0).toFixed(2)}</TableCell>
                                                </TableRow>
                                            ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    </AccordionContent>
                </AccordionItem>
              );
            })}
        </Accordion>
      </CardContent>
    </Card>
  );
}