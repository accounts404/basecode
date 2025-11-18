import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { RefreshCw, TrendingUp, Users, Car, ListChecks } from "lucide-react";
import CleanerPerformanceReport from "@/components/reports/CleanerPerformanceReport";
import ClientProfitabilityReport from "@/components/reports/ClientProfitabilityReport";
import FleetManagementReport from "@/components/reports/FleetManagementReport";
import AdminTasksReport from "@/components/reports/AdminTasksReport";

export default function ReportesAvanzadosPage() {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState("cleaners");
    
    // Estados de datos
    const [cleaners, setCleaners] = useState([]);
    const [schedules, setSchedules] = useState([]);
    const [workEntries, setWorkEntries] = useState([]);
    const [clients, setClients] = useState([]);
    const [vehicles, setVehicles] = useState([]);
    const [teamAssignments, setTeamAssignments] = useState([]);
    const [serviceReports, setServiceReports] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [scores, setScores] = useState([]);

    useEffect(() => {
        loadAllData();
    }, []);

    const loadAllData = async () => {
        try {
            setLoading(true);
            
            const [
                usersData,
                schedulesData,
                workEntriesData,
                clientsData,
                vehiclesData,
                teamAssignmentsData,
                serviceReportsData,
                tasksData,
                scoresData
            ] = await Promise.all([
                base44.entities.User.list(),
                base44.entities.Schedule.list(),
                base44.entities.WorkEntry.list(),
                base44.entities.Client.list(),
                base44.entities.Vehicle.list(),
                base44.entities.DailyTeamAssignment.list(),
                base44.entities.ServiceReport.list(),
                base44.entities.Task.list(),
                base44.entities.MonthlyCleanerScore.list()
            ]);

            setCleaners(Array.isArray(usersData) ? usersData.filter(u => u.role !== 'admin') : []);
            setSchedules(Array.isArray(schedulesData) ? schedulesData : []);
            setWorkEntries(Array.isArray(workEntriesData) ? workEntriesData : []);
            setClients(Array.isArray(clientsData) ? clientsData : []);
            setVehicles(Array.isArray(vehiclesData) ? vehiclesData : []);
            setTeamAssignments(Array.isArray(teamAssignmentsData) ? teamAssignmentsData : []);
            setServiceReports(Array.isArray(serviceReportsData) ? serviceReportsData : []);
            setTasks(Array.isArray(tasksData) ? tasksData : []);
            setScores(Array.isArray(scoresData) ? scoresData : []);

        } catch (error) {
            console.error('[ReportesAvanzados] Error cargando datos:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        await loadAllData();
        setRefreshing(false);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="text-slate-600">Cargando reportes avanzados...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                            <TrendingUp className="w-8 h-8 text-blue-600" />
                            Reportes Avanzados
                        </h1>
                        <p className="text-slate-600 mt-2">
                            Análisis profundo de operaciones, rentabilidad y desempeño
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="flex items-center gap-2"
                    >
                        <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                        Actualizar
                    </Button>
                </div>

                {/* Tabs de Reportes */}
                <Card className="border-2 border-blue-200">
                    <CardContent className="pt-6">
                        <Tabs value={activeTab} onValueChange={setActiveTab}>
                            <TabsList className="grid w-full grid-cols-4 mb-6">
                                <TabsTrigger value="cleaners" className="flex items-center gap-2">
                                    <Users className="w-4 h-4" />
                                    Rendimiento Limpiadores
                                </TabsTrigger>
                                <TabsTrigger value="clients" className="flex items-center gap-2">
                                    <TrendingUp className="w-4 h-4" />
                                    Rentabilidad Clientes
                                </TabsTrigger>
                                <TabsTrigger value="fleet" className="flex items-center gap-2">
                                    <Car className="w-4 h-4" />
                                    Gestión de Flota
                                </TabsTrigger>
                                <TabsTrigger value="tasks" className="flex items-center gap-2">
                                    <ListChecks className="w-4 h-4" />
                                    Gestión Administrativa
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="cleaners">
                                <CleanerPerformanceReport
                                    cleaners={cleaners}
                                    schedules={schedules}
                                    workEntries={workEntries}
                                    serviceReports={serviceReports}
                                    teamAssignments={teamAssignments}
                                    scores={scores}
                                />
                            </TabsContent>

                            <TabsContent value="clients">
                                <ClientProfitabilityReport
                                    clients={clients}
                                    schedules={schedules}
                                    workEntries={workEntries}
                                />
                            </TabsContent>

                            <TabsContent value="fleet">
                                <FleetManagementReport
                                    vehicles={vehicles}
                                    teamAssignments={teamAssignments}
                                    cleaners={cleaners}
                                />
                            </TabsContent>

                            <TabsContent value="tasks">
                                <AdminTasksReport
                                    tasks={tasks}
                                    cleaners={cleaners}
                                />
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}