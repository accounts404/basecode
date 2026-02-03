import React, { useState, useEffect } from 'react';
import { Client } from '@/entities/Client';
import { WorkEntry } from '@/entities/WorkEntry';
import { FixedCost } from '@/entities/FixedCost';
import { PricingThreshold } from '@/entities/PricingThreshold';
import { Schedule } from '@/entities/Schedule';
import { User } from '@/entities/User';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity } from 'lucide-react';
import RentabilityAnalysisTab from '../components/rentabilidad/RentabilityAnalysisTab';
import PricingFrequencyTab from '../components/rentabilidad/PricingFrequencyTab';
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
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [sortColumn, setSortColumn] = useState('realMargin');
    const [sortDirection, setSortDirection] = useState('desc');
    const [pricingThresholds, setPricingThresholds] = useState([]);
    const [trainingClientId, setTrainingClientId] = useState(null);

    const loadAllRecords = async (entity, sortField = '-created_date') => {
        const BATCH_SIZE = 5000;
        let allRecords = [];
        let skip = 0;
        let hasMore = true;

        while (hasMore) {
            const batch = await entity.list(sortField, BATCH_SIZE, skip);
            const batchArray = Array.isArray(batch) ? batch : [];
            
            allRecords = [...allRecords, ...batchArray];
            
            if (batchArray.length < BATCH_SIZE) {
                hasMore = false;
            } else {
                skip += BATCH_SIZE;
            }
        }

        return allRecords;
    };

    const loadAllInitialData = async () => {
        setLoading(true);
        setError('');
        try {
            const [clientsData, workEntriesData, thresholdsData, schedulesData, fixedCostsData, usersData] = await Promise.all([
                loadAllRecords(Client, '-created_date'),
                loadAllRecords(WorkEntry, '-work_date'),
                loadAllRecords(PricingThreshold, '-created_date'),
                loadAllRecords(Schedule, '-start_time'),
                loadAllRecords(FixedCost, '-created_date'),
                loadAllRecords(User, '-created_date'),
            ]);
            
            const filteredWorkEntries = (workEntriesData || []).filter(e => !isExcludedMonth(e.work_date));
            const filteredSchedules = (schedulesData || []).filter(s => !isExcludedMonth(s.start_time));
            
            setClients(clientsData || []);
            setAllWorkEntries(filteredWorkEntries);
            setPricingThresholds(thresholdsData || []);
            setAllSchedules(filteredSchedules);
            setAllFixedCosts(fixedCostsData || []);
            setUsers(usersData || []);
            
            const trainingClient = (clientsData || []).find(c => c.name === 'TRAINING' || c.client_type === 'training');
            if (trainingClient) {
                setTrainingClientId(trainingClient.id);
            }
        } catch (err) {
            console.error("Error loading initial data:", err);
            setError("No se pudieron cargar los datos.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAllInitialData();
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

    if (loading) return <div className="p-8 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700"></div></div>;
    if (error) return <div className="p-8 text-red-700 text-center font-medium">{error}</div>;

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
                            <p className="text-slate-600 mt-1 text-lg font-light">Evaluación financiera detallada por cliente y período</p>
                        </div>
                    </div>
                </div>

                <Tabs defaultValue="monthly" className="space-y-6">
                    <TabsList className="grid w-full max-w-2xl grid-cols-2">
                        <TabsTrigger value="monthly">Análisis Mensual</TabsTrigger>
                        <TabsTrigger value="pricing">Precios por Frecuencia</TabsTrigger>
                    </TabsList>

                    <TabsContent value="monthly" className="space-y-6">
                        <RentabilityAnalysisTab 
                            clients={clients}
                            allWorkEntries={allWorkEntries}
                            allSchedules={allSchedules}
                            allFixedCosts={allFixedCosts}
                            users={users}
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
                </Tabs>
            </div>
        </div>
    );
}