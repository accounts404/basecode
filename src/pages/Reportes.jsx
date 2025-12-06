import React, { useState, useEffect } from "react";
import { WorkEntry } from "@/entities/WorkEntry";
import { User } from "@/entities/User";
import { Schedule } from "@/entities/Schedule";
import { Client } from "@/entities/Client";
import { BarChart3, Trophy, PieChart, Users, DollarSign, Clock, TrendingUp } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay } from "date-fns";
import { es } from "date-fns/locale";

import PeriodSelector from "../components/reports/PeriodSelector";
import CleanerPerformance from "../components/reports/CleanerPerformance";
import ActivityBreakdown from "../components/reports/ActivityBreakdown";
import TopPerformer from "../components/reports/TopPerformer";
import TopClients from "../components/reports/TopClients";
import ClientAnalysis from "../components/reports/ClientAnalysis";
import HourlyRateReport from "../components/reports/HourlyRateReport";
import TrainingCostsAnalysis from "../components/reports/TrainingCostsAnalysis";
import ConsolidatedClientAnalysis from "../components/reports/ConsolidatedClientAnalysis";
import ServiceTypeAnalysis from "../components/reports/ServiceTypeAnalysis";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ComparativeAnalysis from "../components/reports/ComparativeAnalysis";

// NUEVA FUNCIÓN: Extrae solo la fecha (YYYY-MM-DD) de un string ISO, ignorando hora y zona horaria
const extractDateOnly = (isoString) => {
  if (!isoString) return null;
  // Tomar solo los primeros 10 caracteres del ISO string (YYYY-MM-DD)
  return isoString.substring(0, 10);
};

// NUEVA FUNCIÓN: Verifica si una fecha está dentro de un rango (solo comparando fechas, no horas)
const isDateInRange = (dateString, rangeStart, rangeEnd) => {
  if (!dateString || !rangeStart || !rangeEnd) return false;
  
  // Extraer solo la fecha (YYYY-MM-DD) del string
  const date = extractDateOnly(dateString);
  
  // Convertir las fechas del rango a formato YYYY-MM-DD
  const startDate = format(rangeStart, 'yyyy-MM-dd');
  const endDate = format(rangeEnd, 'yyyy-MM-dd');
  
  // Comparación simple de strings de fecha
  return date >= startDate && date <= endDate;
};

export default function ReportesPage() {
  const [workEntries, setWorkEntries] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [cleaners, setCleaners] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // CRÍTICO: Usar base44 directamente con límite alto para obtener TODOS los registros
        const { base44 } = await import('@/api/base44Client');
        // Fetch last 2 years of data for historical analysis
        const twoYearsAgo = subMonths(new Date(), 24);
        const [entriesResult, usersResult, schedulesResult, clientsResult] = await Promise.allSettled([
          base44.entities.WorkEntry.list("-work_date", 10000),
          base44.entities.User.list('-created_date', 500),
          base44.entities.Schedule.list("-start_time", 10000),
          base44.entities.Client.list('-created_date', 1000)
        ]);
        
        const allEntriesRaw = entriesResult.status === 'fulfilled' ? entriesResult.value : [];
        const allSchedulesRaw = schedulesResult.status === 'fulfilled' ? schedulesResult.value : [];
        const allClientsRaw = clientsResult.status === 'fulfilled' ? clientsResult.value : [];

        // Filter entries on client side to ensure we have enough history
        const twoYearsAgoStr = format(twoYearsAgo, 'yyyy-MM-dd');
        const allEntries = allEntriesRaw.filter(e => {
            if (!e.work_date) return false;
            const dateOnly = e.work_date.substring(0, 10);
            return dateOnly >= twoYearsAgoStr;
        });

        console.log('[Reportes] 📊 Total WorkEntries cargados:', allEntries.length);
        console.log('[Reportes] 📅 Rango de fechas WorkEntry:', {
            oldest: allEntries.length > 0 ? allEntries[allEntries.length - 1]?.work_date : 'N/A',
            newest: allEntries.length > 0 ? allEntries[0]?.work_date : 'N/A'
        });
        const allSchedules = allSchedulesRaw.filter(s => {
            if (!s.start_time) return false;
            const dateOnly = s.start_time.substring(0, 10);
            return dateOnly >= twoYearsAgoStr;
        });
        setSchedules(allSchedules);

        const allUsers = usersResult.status === 'fulfilled' ? usersResult.value : [];
        const allClients = allClientsRaw.filter(c => c.active !== false);
        
        const cleanerUsers = allUsers.filter(u => u.role !== 'admin');
        setCleaners(cleanerUsers);
        setClients(allClients);

        const entriesWithCleanerInfo = allEntries.map(entry => {
          const cleaner = cleanerUsers.find(c => c.id === entry.cleaner_id);
          return {
            ...entry,
            cleaner_name: cleaner ? (cleaner.invoice_name || cleaner.full_name) : 'Desconocido',
          };
        });
        setWorkEntries(entriesWithCleanerInfo);
      } catch (error) {
        console.error("Error loading report data:", error);
      }
      setLoading(false);
    };

    loadData();
  }, []);
  
  const handlePeriodChange = (period) => {
    setSelectedPeriod(period);
  };

  // MODIFICADO: Filtrar work entries solo por fecha (ignorando hora)
  const filteredEntries = selectedPeriod
    ? workEntries.filter(entry => {
        return isDateInRange(entry.work_date, selectedPeriod.start, selectedPeriod.end);
      })
    : [];

  // MODIFICADO: Filtrar schedules solo por fecha (ignorando hora)
  const filteredSchedules = selectedPeriod
    ? schedules.filter(schedule => {
        return isDateInRange(schedule.start_time, selectedPeriod.start, selectedPeriod.end);
      })
    : [];
    
  const clientFacingEntries = filteredEntries.filter(entry => entry.activity !== 'entrenamiento');
    
  const periodStats = {
    totalRevenue: clientFacingEntries.reduce((sum, entry) => sum + (entry.total_amount || 0), 0),
    totalHours: clientFacingEntries.reduce((sum, entry) => sum + (entry.hours || 0), 0),
    totalJobs: clientFacingEntries.length,
  };

  const uniqueClients = new Set();
  clientFacingEntries.forEach(entry => {
    if (entry.client_id) {
      uniqueClients.add(entry.client_id);
    }
  });
  periodStats.clientsAttended = uniqueClients.size;

  const uniqueServices = new Set();
  clientFacingEntries.forEach(entry => {
    if (entry.client_id && entry.work_date) {
      const serviceKey = `${entry.client_id}|${entry.work_date.split('T')[0]}`;
      uniqueServices.add(serviceKey);
    }
  });
  periodStats.servicesRealized = uniqueServices.size;


  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-10 bg-slate-200 rounded w-1/3"></div>
          <div className="h-12 bg-slate-200 rounded w-full"></div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 h-64 bg-slate-200 rounded-xl"></div>
            <div className="h-64 bg-slate-200 rounded-xl"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6 md:p-8">
      <div className="max-w-screen-2xl mx-auto space-y-8">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
              <BarChart3 className="w-8 h-8 text-blue-600" />
              Reportes Avanzados
            </h1>
            <p className="text-slate-600">Análisis detallado del rendimiento de la empresa.</p>
          </div>
        </div>

        <Tabs defaultValue="period-report" className="w-full">
          <div className="flex justify-between items-center mb-6">
            <TabsList>
              <TabsTrigger value="period-report">Reporte del Período</TabsTrigger>
              <TabsTrigger value="comparative_analysis">Análisis Comparativo</TabsTrigger>
            </TabsList>
          </div>
          
          <TabsContent value="period-report" className="mt-6">
            <div className="mb-6 max-w-sm">
              <PeriodSelector onPeriodChange={handlePeriodChange} />
            </div>
            
            {selectedPeriod ? (
              filteredEntries.length > 0 ? (
                <div className="space-y-8">
                  <div className="bg-white/50 backdrop-blur-sm rounded-2xl p-6 border border-white/20 shadow-lg">
                    <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                      <DollarSign className="w-6 h-6 text-blue-600" />
                      Métricas del Período Seleccionado
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                      <Card className="shadow-lg border-0 bg-blue-50 border-blue-200">
                        <CardHeader>
                          <CardTitle className="text-sm font-medium text-blue-700 flex items-center gap-2"><DollarSign className="w-5 h-5"/> Costo del Período</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-3xl font-bold text-blue-900">${periodStats.totalRevenue.toFixed(2)}</p>
                        </CardContent>
                      </Card>
                      <Card className="shadow-lg border-0 bg-green-50 border-green-200">
                        <CardHeader>
                          <CardTitle className="text-sm font-medium text-green-700 flex items-center gap-2"><Clock className="w-5 h-5"/> Horas Trabajadas</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-3xl font-bold text-green-900">{periodStats.totalHours.toFixed(2)}</p>
                        </CardContent>
                      </Card>
                      <Card className="shadow-lg border-0 bg-purple-50 border-purple-200">
                        <CardHeader>
                          <CardTitle className="text-sm font-medium text-purple-700 flex items-center gap-2"><Users className="w-5 h-5"/> Clientes Atendidos</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-3xl font-bold text-purple-900">{periodStats.clientsAttended}</p>
                        </CardContent>
                      </Card>
                      <Card className="shadow-lg border-0 bg-orange-50 border-orange-200">
                        <CardHeader>
                          <CardTitle className="text-sm font-medium text-orange-700 flex items-center gap-2"><Users className="w-5 h-5"/> Servicios Realizados</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-3xl font-bold text-orange-900">{periodStats.servicesRealized}</p>
                        </CardContent>
                      </Card>
                    </div>
                  </div>

                  <div className="bg-white/50 backdrop-blur-sm rounded-2xl p-6 border border-white/20 shadow-lg">
                    <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                      <PieChart className="w-6 h-6 text-blue-600" />
                      Análisis de Ingresos por Tipo de Servicio
                    </h2>
                    <ServiceTypeAnalysis schedules={filteredSchedules} clients={clients} />
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                    <HourlyRateReport workEntries={filteredEntries} />
                    <TrainingCostsAnalysis entries={filteredEntries} />
                  </div>

                  <div className="bg-white/50 backdrop-blur-sm rounded-2xl p-6 border border-white/20 shadow-lg">
                    <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                      <Users className="w-6 h-6 text-blue-600" />
                      Análisis por Cliente del Período
                    </h2>
                    <ClientAnalysis entries={clientFacingEntries} />
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                    <div className="xl:col-span-2">
                      <CleanerPerformance entries={clientFacingEntries} />
                    </div>
                    <div className="space-y-8">
                      <TopPerformer entries={clientFacingEntries} />
                      <TopClients entries={clientFacingEntries} />
                    </div>
                  </div>

                  <div className="bg-white/50 backdrop-blur-sm rounded-2xl p-6 border border-white/20 shadow-lg">
                    <ActivityBreakdown entries={filteredEntries} />
                  </div>

                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl p-6 border border-green-200 shadow-lg">
                    <h2 className="text-xl font-bold text-green-900 mb-6 flex items-center gap-2">
                      <TrendingUp className="w-6 h-6 text-green-600" />
                      Vista Histórica Consolidada
                    </h2>
                    <ConsolidatedClientAnalysis workEntries={workEntries} />
                  </div>
                </div>
              ) : (
                <Card className="shadow-lg border-0 text-center">
                  <CardContent className="p-12">
                    <BarChart3 className="w-24 h-24 mx-auto text-slate-300" />
                    <p className="mt-4 text-slate-600">No se encontraron datos para el período seleccionado.</p>
                  </CardContent>
                </Card>
              )
            ) : (
              <Card className="shadow-lg border-0 text-center">
                <CardContent className="p-12">
                  <BarChart3 className="w-24 h-24 mx-auto text-slate-300" />
                  <p className="mt-4 text-slate-600">Por favor, selecciona un período para ver los reportes.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
          
          <TabsContent value="comparative_analysis" className="mt-6">
            <ComparativeAnalysis workEntries={workEntries} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}