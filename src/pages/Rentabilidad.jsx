import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Client } from '@/entities/Client';
import { WorkEntry } from '@/entities/WorkEntry';
import { FixedCost } from '@/entities/FixedCost';
import { PricingThreshold } from '@/entities/PricingThreshold';
import { Schedule } from '@/entities/Schedule';
import { User } from '@/entities/User';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, RefreshCw } from 'lucide-react';
import RentabilityAnalysisTab from '../components/rentabilidad/RentabilityAnalysisTab';
import PricingFrequencyTab from '../components/rentabilidad/PricingFrequencyTab';
import SuperannuationTab from '../components/rentabilidad/SuperannuationTab';
import { extractDateOnly } from '@/components/utils/priceCalculations';

const isExcludedMonth = (dateString) => {
  if (!dateString) return false;
  const dateOnly = extractDateOnly(dateString);
  return dateOnly && (dateOnly.startsWith('2025-08') || dateOnly.startsWith('2025-09'));
};

export default function RentabilidadPage() {
    const [clients, setClients] = useState([]);
    const [allWorkEntries, setAllWorkEntries] = useState([]);
    const [allSchedules, setAllSchedules] = useState([]);
    const [allFixedCosts, setAllFixedCosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [sortColumn, setSortColumn] = useState('realMargin');
    const [sortDirection, setSortDirection] = useState('desc');
    const [pricingThresholds, setPricingThresholds] = useState([]);
    const [trainingClientId, setTrainingClientId] = useState(null);

    const queryClient = useQueryClient();

    const loadAllRecords = async (entity, sortField = '-created_date', maxLimit = 10000) => {
        const BATCH_SIZE = 500;
        let allRecords = [];
        let skip = 0;
        let hasMore = true;

        while (hasMore && allRecords.length < maxLimit) {
            const batch = await entity.list(sortField, BATCH_SIZE, skip);
            const batchArray = Array.isArray(batch) ? batch : [];
            allRecords = [...allRecords, ...batchArray];
            if (batchArray.length < BATCH_SIZE) {
                hasMore = false;
            } else {
                skip += BATCH_SIZE;
            }
        }

        return allRecords.slice(0, maxLimit);
    };

    const { data: rentabilidadData, isLoading: isLoadingQuery, isFetching, isError: isQueryError } = useQuery({
        queryKey: ['rentabilidadGlobal'],
        queryFn: async () => {
            const [clientsData, workEntriesData, thresholdsData, schedulesData, fixedCostsData] = await Promise.all([
                loadAllRecords(Client, '-created_date'),
                loadAllRecords(WorkEntry, '-work_date'),
                loadAllRecords(PricingThreshold, '-created_date'),
                loadAllRecords(Schedule, '-start_time'),
                loadAllRecords(FixedCost, '-created_date'),
            ]);

            const filteredWorkEntries = (workEntriesData || []).filter(e => !isExcludedMonth(e.work_date));
            const filteredSchedules = (schedulesData || []).filter(s => !isExcludedMonth(s.start_time));
            const trainingClient = (clientsData || []).find(c => c.name === 'TRAINING' || c.client_type === 'training');

            return {
                clientsData: clientsData || [],
                filteredWorkEntries,
                thresholdsData: thresholdsData || [],
                filteredSchedules,
                fixedCostsData: fixedCostsData || [],
                trainingClientId: trainingClient?.id || null,
            };
        },
        staleTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
    });

    useEffect(() => {
        if (rentabilidadData) {
            setClients(rentabilidadData.clientsData);
            setAllWorkEntries(rentabilidadData.filteredWorkEntries);
            setPricingThresholds(rentabilidadData.thresholdsData);
            setAllSchedules(rentabilidadData.filteredSchedules);
            setAllFixedCosts(rentabilidadData.fixedCostsData);
            setTrainingClientId(rentabilidadData.trainingClientId);
        }
    }, [rentabilidadData]);

    useEffect(() => {
        // Solo mostrar loading si NO hay datos en caché todavía
        setLoading(isLoadingQuery && !rentabilidadData);
        if (isQueryError) setError("No se pudieron cargar los datos.");
    }, [isLoadingQuery, isQueryError, rentabilidadData]);

    const loadAllInitialData = () => {
        queryClient.invalidateQueries({ queryKey: ['rentabilidadGlobal'] });
    };

    useEffect(() => {
        // no-op: reemplazado por useQuery
    }, []);

    const handleSort = (column) => {
        if (sortColumn === column) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection('desc');
        }
    };

    const handleThresholdsSaved = () => {
        loadAllInitialData();
    };

    if (error) return <div className="p-8 text-red-700 text-center font-medium">{error}</div>;

    if (loading) return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 p-6 md:p-10">
            <div className="max-w-[1920px] mx-auto">
                <div className="mb-10 flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl bg-slate-200 animate-pulse" />
                    <div className="space-y-2">
                        <div className="h-8 w-72 bg-slate-200 rounded-lg animate-pulse" />
                        <div className="h-4 w-96 bg-slate-100 rounded animate-pulse" />
                    </div>
                </div>
                <div className="h-12 w-full max-w-3xl bg-slate-200 rounded-lg animate-pulse mb-6" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="h-28 bg-slate-200 rounded-xl animate-pulse" />
                    ))}
                </div>
                <div className="h-96 bg-slate-200 rounded-xl animate-pulse" />
            </div>
        </div>
    );

    const clientsForPricingAnalysis = clients.filter(c => c.id !== trainingClientId);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 p-6 md:p-10">
            <div className="max-w-[1920px] mx-auto">
                <div className="mb-10">
                    <div className="flex items-center gap-4 mb-3">
                        <div className="p-3 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl shadow-lg">
                            <Activity className="w-7 h-7 text-white" />
                        </div>
                        <div>
                            <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Análisis de Rentabilidad</h1>
                            <div className="flex items-center gap-3 mt-1">
                                <p className="text-slate-600 text-lg font-light">Evaluación financiera detallada por cliente y período</p>
                                {isFetching && !isLoadingQuery && (
                                    <span className="flex items-center gap-1 text-xs text-slate-400">
                                        <RefreshCw className="w-3 h-3 animate-spin" />
                                        Actualizando...
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <Tabs defaultValue="monthly" className="space-y-6">
                    <TabsList className="grid w-full max-w-3xl grid-cols-3">
                        <TabsTrigger value="monthly">Análisis Mensual</TabsTrigger>
                        <TabsTrigger value="pricing">Precios por Frecuencia</TabsTrigger>
                        <TabsTrigger value="superannuation">Superannuation</TabsTrigger>
                    </TabsList>

                    <TabsContent value="monthly" className="space-y-6">
                        <RentabilityAnalysisTab 
                            clients={clients}
                            allWorkEntries={allWorkEntries}
                            allSchedules={allSchedules}
                            allFixedCosts={allFixedCosts}
                            trainingClientId={trainingClientId}
                            sortColumn={sortColumn}
                            sortDirection={sortDirection}
                            handleSort={handleSort}
                        />
                    </TabsContent>

                    <TabsContent value="pricing" className="space-y-6">
                        <PricingFrequencyTab 
                            clients={clientsForPricingAnalysis}
                            pricingThresholds={pricingThresholds}
                            onThresholdsSaved={handleThresholdsSaved}
                        />
                    </TabsContent>

                    <TabsContent value="superannuation" className="space-y-6">
                        <SuperannuationTab allWorkEntries={allWorkEntries} allSchedules={allSchedules} />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}