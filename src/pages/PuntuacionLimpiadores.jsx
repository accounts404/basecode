import React, { useState, useEffect, useCallback } from "react";
import { User } from "@/entities/User";
import { Client } from "@/entities/Client";
import { WorkEntry } from "@/entities/WorkEntry";
import { MonthlyCleanerScore } from "@/entities/MonthlyCleanerScore";
import { ScoreAdjustment } from "@/entities/ScoreAdjustment";
import { SemiAnnualBonus } from "@/entities/SemiAnnualBonus";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, TrendingUp, TrendingDown, Users, Calendar, Plus, History, Medal, Crown, Award, Gift, Star, CheckCircle, Eye, ClipboardList, Clock, Car, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import CategorySelector from "../components/scoring/CategorySelector";
import CleanerScoreHistoryDialog from "../components/scoring/CleanerScoreHistoryDialog";
import PerformanceTab from "../components/scoring/PerformanceTab";
import PunctualityTab from "../components/scoring/PunctualityTab";
import VehicleChecklistTab from "../components/scoring/VehicleChecklistTab";
import ClientFeedbackTab from "../components/scoring/ClientFeedbackTab";

export default function PuntuacionLimpiadoresPage() {
    const [user, setUser] = useState(null);
    const [limpiadores, setLimpiadores] = useState([]);
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [monthlyScores, setMonthlyScores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAdjustDialog, setShowAdjustDialog] = useState(false);
    const [showConfigDialog, setShowConfigDialog] = useState(false);
    const [showBonusDialog, setShowBonusDialog] = useState(false);
    const [showSemestralDialog, setShowSemestralDialog] = useState(false);
    const [selectedCleaner, setSelectedCleaner] = useState(null);
    const [adjustmentData, setAdjustmentData] = useState({
        type: 'deduction',
        category: '',
        points: '',
        notes: ''
    });
    const [participantConfig, setParticipantConfig] = useState({});
    const [bonusData, setBonusData] = useState({
        amount: '',
        description: ''
    });
    const [semestralData, setSemestralData] = useState({
        period_start: '',
        period_end: '',
        amount: '',
        description: ''
    });
    const [semestralRanking, setSemestralRanking] = useState([]);
    const [redOakClientId, setRedOakClientId] = useState(null);
    const [showHistoryDialog, setShowHistoryDialog] = useState(false); // NEW: State for history dialog
    const [cleanerForHistory, setCleanerForHistory] = useState(null); // NEW: State for cleaner whose history is being viewed

    // Cargar cliente RedOak para bonificaciones
    useEffect(() => {
        const loadRedOakClient = async () => {
            try {
                const clients = await Client.list();
                const redOakClient = clients.find(c =>
                    c.name.toLowerCase().includes('redoak') ||
                    c.name.toLowerCase().includes('red oak')
                );
                if (redOakClient) {
                    setRedOakClientId(redOakClient.id);
                }
            } catch (error) {
                console.error('Error cargando cliente RedOak:', error);
            }
        };
        loadRedOakClient();
    }, []);

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

    const loadMonthlyScores = useCallback(async () => {
        try {
            const scores = await MonthlyCleanerScore.filter({ month_period: selectedMonth });
            setMonthlyScores(scores);

            // Configurar participantes actuales
            const config = {};
            scores.forEach(score => {
                config[score.cleaner_id] = score.is_participating;
            });
            setParticipantConfig(config);
        } catch (error) {
            console.error('Error cargando puntuaciones:', error);
            setMonthlyScores([]);
        }
    }, [selectedMonth]);

    const loadInitialData = useCallback(async () => {
        setLoading(true);
        try {
            const userData = await User.me();
            setUser(userData);

            // Cargar todos los limpiadores activos
            const allUsers = await loadAllRecords(User, '-created_date');
            const cleaners = allUsers.filter(u => u.role !== 'admin' && u.active !== false);
            setLimpiadores(cleaners);

            // Cargar puntuaciones del mes seleccionado
            await loadMonthlyScores();
        } catch (error) {
            console.error('Error cargando datos:', error);
        } finally {
            setLoading(false);
        }
    }, [loadMonthlyScores]);

    useEffect(() => {
        loadInitialData();
    }, [loadInitialData]);

    const getCurrentRanking = () => {
        return monthlyScores
            .filter(score => score.is_participating)
            .sort((a, b) => b.current_score - a.current_score)
            .map((score, index) => ({ ...score, current_rank: index + 1 }));
    };

    const handleConfigureParticipants = () => {
        setShowConfigDialog(true);
    };

    const handleSaveParticipants = async () => {
        try {
            const updates = [];

            for (const cleaner of limpiadores) {
                const isParticipating = participantConfig[cleaner.id] || false;
                const existingScore = monthlyScores.find(s => s.cleaner_id === cleaner.id);

                if (isParticipating && !existingScore) {
                    // Crear nueva entrada
                    updates.push(MonthlyCleanerScore.create({
                        cleaner_id: cleaner.id,
                        cleaner_name: cleaner.invoice_name || cleaner.full_name,
                        month_period: selectedMonth,
                        initial_score: 100,
                        current_score: 100,
                        is_participating: true,
                        created_by_admin: user.id
                    }));
                } else if (existingScore && existingScore.is_participating !== isParticipating) {
                    // Actualizar participación
                    updates.push(MonthlyCleanerScore.update(existingScore.id, {
                        is_participating: isParticipating
                    }));
                }
            }

            await Promise.all(updates);
            await loadMonthlyScores();
            setShowConfigDialog(false);
        } catch (error) {
            console.error('Error guardando participantes:', error);
        }
    };

    const handleScoreAdjustment = (cleaner) => {
        setSelectedCleaner(cleaner);
        setAdjustmentData({
            type: 'deduction',
            category: '',
            points: '',
            notes: ''
        });
        setShowAdjustDialog(true);
    };

    const handleSaveAdjustment = async () => {
        if (!selectedCleaner || !adjustmentData.category || !adjustmentData.points) {
            alert('Por favor completa todos los campos requeridos');
            return;
        }

        try {
            const monthlyScore = monthlyScores.find(s => s.cleaner_id === selectedCleaner.cleaner_id);
            const pointsValue = parseInt(adjustmentData.points, 10);
            const pointsImpact = adjustmentData.type === 'deduction' ? -Math.abs(pointsValue) : Math.abs(pointsValue);

            // Crear el ajuste
            await ScoreAdjustment.create({
                monthly_score_id: monthlyScore.id,
                cleaner_id: selectedCleaner.cleaner_id,
                month_period: selectedMonth,
                adjustment_type: adjustmentData.type,
                category: adjustmentData.category,
                points_impact: pointsImpact,
                notes: adjustmentData.notes,
                admin_id: user.id,
                admin_name: user.full_name,
                date_applied: new Date().toISOString()
            });

            // Actualizar puntuación
            const newScore = Math.max(0, monthlyScore.current_score + pointsImpact);
            await MonthlyCleanerScore.update(monthlyScore.id, {
                current_score: newScore
            });

            setShowAdjustDialog(false);
            await loadMonthlyScores();
        } catch (error) {
            console.error('Error aplicando ajuste:', error);
            alert('Error al aplicar el ajuste');
        }
    };

    const handleFinishMonth = () => {
        const ranking = getCurrentRanking();
        if (ranking.length === 0) {
            alert('No hay participantes en este mes');
            return;
        }

        const winner = ranking[0];
        setSelectedCleaner(winner);
        setBonusData({
            amount: '',
            description: ''
        });
        setShowBonusDialog(true);
    };

    const handleSaveMonthlyBonus = async () => {
        if (!bonusData.amount || !bonusData.description) {
            alert('Por favor completa todos los campos de la bonificación');
            return;
        }

        if (!redOakClientId) {
            alert('Error: No se encontró el cliente RedOak Cleaning Solutions');
            return;
        }

        try {
            const bonusAmount = parseFloat(bonusData.amount);

            // Crear WorkEntry para la bonificación
            const workEntry = await WorkEntry.create({
                cleaner_id: selectedCleaner.cleaner_id,
                cleaner_name: selectedCleaner.cleaner_name,
                client_id: redOakClientId,
                client_name: "RedOak Cleaning Solutions",
                work_date: new Date().toISOString().split('T')[0],
                hours: 1,
                activity: "otros",
                other_activity: `Bonificación Mensual - ${bonusData.description}`,
                hourly_rate: bonusAmount,
                total_amount: bonusAmount
            });

            // Actualizar MonthlyCleanerScore con la bonificación
            const monthlyScore = monthlyScores.find(s => s.cleaner_id === selectedCleaner.cleaner_id);
            await MonthlyCleanerScore.update(monthlyScore.id, {
                status: 'closed',
                final_rank: selectedCleaner.current_rank,
                monthly_bonus_amount: bonusAmount,
                monthly_bonus_description: bonusData.description,
                monthly_bonus_work_entry_id: workEntry.id,
                monthly_bonus_date_awarded: new Date().toISOString(),
                closed_by_admin: user.id,
                closed_date: new Date().toISOString()
            });

            setShowBonusDialog(false);
            await loadMonthlyScores();
            alert(`¡Bonificación de $${bonusAmount} AUD otorgada exitosamente a ${selectedCleaner.cleaner_name}!`);
        } catch (error) {
            console.error('Error otorgando bonificación mensual:', error);
            alert('Error al otorgar la bonificación');
        }
    };

    const handleSemestralBonus = () => {
        setSemestralData({
            period_start: '',
            period_end: '',
            amount: '',
            description: ''
        });
        setSemestralRanking([]);
        setShowSemestralDialog(true);
    };

    const calculateSemestralRanking = async () => {
        if (!semestralData.period_start || !semestralData.period_end) {
            alert('Por favor selecciona las fechas del período semestral');
            return;
        }

        try {
            // Obtener todos los scores mensuales en el rango
            const allScores = await MonthlyCleanerScore.list();
            const periodScores = allScores.filter(score => {
                const scoreMonth = score.month_period;
                return scoreMonth >= semestralData.period_start.substring(0, 7) &&
                       scoreMonth <= semestralData.period_end.substring(0, 7) &&
                       score.is_participating;
            });

            // Calcular promedios por limpiador
            const cleanerAverages = {};
            periodScores.forEach(score => {
                if (!cleanerAverages[score.cleaner_id]) {
                    cleanerAverages[score.cleaner_id] = {
                        cleaner_id: score.cleaner_id,
                        cleaner_name: score.cleaner_name,
                        scores: [],
                        total: 0,
                        count: 0
                    };
                }
                cleanerAverages[score.cleaner_id].scores.push(score.current_score);
                cleanerAverages[score.cleaner_id].total += score.current_score;
                cleanerAverages[score.cleaner_id].count += 1;
            });

            // Calcular ranking semestral
            const ranking = Object.values(cleanerAverages)
                .map(cleaner => ({
                    ...cleaner,
                    average_score: cleaner.total / cleaner.count
                }))
                .sort((a, b) => b.average_score - a.average_score)
                .map((cleaner, index) => ({
                    ...cleaner,
                    rank: index + 1
                }));

            setSemestralRanking(ranking);
        } catch (error) {
            console.error('Error calculando ranking semestral:', error);
            alert('Error al calcular el ranking semestral');
        }
    };

    const handleSaveSemestralBonus = async () => {
        if (semestralRanking.length === 0) {
            alert('Primero calcula el ranking semestral');
            return;
        }

        if (!semestralData.amount || !semestralData.description) {
            alert('Por favor completa todos los campos de la bonificación');
            return;
        }

        if (!redOakClientId) {
            alert('Error: No se encontró el cliente RedOak Cleaning Solutions');
            return;
        }

        try {
            const winner = semestralRanking[0];
            const bonusAmount = parseFloat(semestralData.amount);

            // Crear WorkEntry para la bonificación semestral
            const workEntry = await WorkEntry.create({
                cleaner_id: winner.cleaner_id,
                cleaner_name: winner.cleaner_name,
                client_id: redOakClientId,
                client_name: "RedOak Cleaning Solutions",
                work_date: new Date().toISOString().split('T')[0],
                hours: 1,
                activity: "otros",
                other_activity: `Bonificación Semestral - ${semestralData.description}`,
                hourly_rate: bonusAmount,
                total_amount: bonusAmount
            });

            // Crear registro de bonificación semestral
            await SemiAnnualBonus.create({
                period_label: `${format(new Date(semestralData.period_start), 'MMM yyyy', { locale: es })} - ${format(new Date(semestralData.period_end), 'MMM yyyy', { locale: es })}`,
                period_start: semestralData.period_start,
                period_end: semestralData.period_end,
                winner_cleaner_id: winner.cleaner_id,
                winner_cleaner_name: winner.cleaner_name,
                winner_average_score: winner.average_score,
                bonus_amount: bonusAmount,
                bonus_description: semestralData.description,
                bonus_work_entry_id: workEntry.id,
                date_awarded: new Date().toISOString(),
                awarded_by_admin: user.id,
                participating_cleaners: semestralRanking
            });

            setShowSemestralDialog(false);
            alert(`¡Bonificación semestral de $${bonusAmount} AUD otorgada exitosamente a ${winner.cleaner_name}!`);
        } catch (error) {
            console.error('Error otorgando bonificación semestral:', error);
            alert('Error al otorgar la bonificación semestral');
        }
    };

    const handleViewHistory = (cleaner) => { // NEW: Function to open history dialog
        setCleanerForHistory(cleaner);
        setShowHistoryDialog(true);
    };

    const ranking = getCurrentRanking();
    const currentMonthScore = monthlyScores.find(s => s.month_period === selectedMonth);
    const isMonthClosed = currentMonthScore && currentMonthScore.status === 'closed';

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
            {/* Header */}
            <Card className="bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-200">
                <CardHeader>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex items-center gap-3">
                            <Trophy className="w-8 h-8 text-yellow-600" />
                            <div>
                                <CardTitle className="text-2xl text-yellow-900">Sistema de Puntuación</CardTitle>
                                <p className="text-yellow-700">Gestiona el ranking mensual de limpiadores</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                            <div className="flex items-center gap-2">
                                <Label>Mes:</Label>
                                <Input
                                    type="month"
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                    className="w-40"
                                />
                            </div>
                            <Button onClick={handleConfigureParticipants} className="bg-yellow-600 hover:bg-yellow-700">
                                <Users className="w-4 h-4 mr-2" />
                                Participantes
                            </Button>
                            <Button onClick={handleSemestralBonus} variant="outline" className="border-purple-300 text-purple-700 hover:bg-purple-50">
                                <Star className="w-4 h-4 mr-2" />
                                Bono Semestral
                            </Button>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="p-4 text-center">
                        <Users className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                        <p className="text-2xl font-bold text-blue-900">{ranking.length}</p>
                        <p className="text-sm text-blue-600">Participantes</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 text-center">
                        <Crown className="w-8 h-8 text-yellow-600 mx-auto mb-2" />
                        <p className="text-2xl font-bold text-yellow-900">{ranking[0]?.current_score || 0}</p>
                        <p className="text-sm text-yellow-600">Puntuación Líder</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 text-center">
                        <TrendingUp className="w-8 h-8 text-green-600 mx-auto mb-2" />
                        <p className="text-2xl font-bold text-green-900">
                            {Math.round(ranking.reduce((sum, r) => sum + r.current_score, 0) / ranking.length) || 0}
                        </p>
                        <p className="text-sm text-green-600">Promedio</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 text-center">
                        <Calendar className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                        <p className="text-2xl font-bold text-purple-900">
                            {format(new Date(selectedMonth + '-01'), 'MMM yyyy', { locale: es })}
                        </p>
                        <p className="text-sm text-purple-600">Período Activo</p>
                    </CardContent>
                </Card>
            </div>

            {/* TABS PRINCIPALES */}
            <Tabs defaultValue="ranking">
                <TabsList className="grid w-full grid-cols-5 h-12">
                    <TabsTrigger value="ranking" className="flex items-center gap-1 text-xs md:text-sm">
                        <Trophy className="w-4 h-4" /><span className="hidden sm:inline">Ranking</span>
                    </TabsTrigger>
                    <TabsTrigger value="performance" className="flex items-center gap-1 text-xs md:text-sm">
                        <ClipboardList className="w-4 h-4" /><span className="hidden sm:inline">Performance</span>
                    </TabsTrigger>
                    <TabsTrigger value="punctuality" className="flex items-center gap-1 text-xs md:text-sm">
                        <Clock className="w-4 h-4" /><span className="hidden sm:inline">Puntualidad</span>
                    </TabsTrigger>
                    <TabsTrigger value="vehicle" className="flex items-center gap-1 text-xs md:text-sm">
                        <Car className="w-4 h-4" /><span className="hidden sm:inline">Vehículos</span>
                    </TabsTrigger>
                    <TabsTrigger value="feedback" className="flex items-center gap-1 text-xs md:text-sm">
                        <MessageSquare className="w-4 h-4" /><span className="hidden sm:inline">Feedback</span>
                    </TabsTrigger>
                </TabsList>

                {/* TAB 1: RANKING */}
                <TabsContent value="ranking" className="mt-4">
                    <Card>
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <CardTitle className="flex items-center gap-2">
                                    <Medal className="w-5 h-5" />
                                    Ranking Actual
                                    {isMonthClosed && (
                                        <Badge className="bg-green-100 text-green-800 ml-2">
                                            <CheckCircle className="w-3 h-3 mr-1" />
                                            Mes Cerrado
                                        </Badge>
                                    )}
                                </CardTitle>
                                {!isMonthClosed && ranking.length > 0 && (
                                    <Button onClick={handleFinishMonth} className="bg-green-600 hover:bg-green-700">
                                        <Gift className="w-4 h-4 mr-2" />
                                        Finalizar Mes
                                    </Button>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {ranking.map((cleaner, index) => {
                                    const rankIcon = index === 0 ? <Crown className="w-6 h-6 text-yellow-500" /> :
                                                   index === 1 ? <Medal className="w-6 h-6 text-gray-400" /> :
                                                   index === 2 ? <Award className="w-6 h-6 text-amber-600" /> :
                                                   <div className="w-6 h-6 flex items-center justify-center bg-slate-200 rounded-full text-sm font-bold">{index + 1}</div>;
                                    return (
                                        <div key={cleaner.id} className={`flex items-center justify-between p-4 rounded-lg border ${
                                            index === 0 ? 'bg-yellow-50 border-yellow-200' :
                                            index === 1 ? 'bg-gray-50 border-gray-200' :
                                            index === 2 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'
                                        }`}>
                                            <div className="flex items-center gap-4">
                                                {rankIcon}
                                                <div>
                                                    <p className="font-semibold">{cleaner.cleaner_name}</p>
                                                    <p className="text-sm text-slate-600">Puesto #{index + 1}</p>
                                                    {cleaner.monthly_bonus_amount && (
                                                        <Badge className="bg-green-100 text-green-800 text-xs mt-1">
                                                            Bono: ${cleaner.monthly_bonus_amount} AUD
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <div className="text-right">
                                                    <p className="text-2xl font-bold">{cleaner.current_score}</p>
                                                    <p className="text-sm text-slate-600">puntos</p>
                                                </div>
                                                {!isMonthClosed && (
                                                    <div className="flex gap-2">
                                                        <Button variant="outline" size="sm" onClick={() => handleViewHistory(cleaner)}>
                                                            <Eye className="w-4 h-4" />
                                                        </Button>
                                                        <Button variant="outline" size="sm" onClick={() => handleScoreAdjustment(cleaner)}>
                                                            <Plus className="w-4 h-4 mr-1" /> Ajustar
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                                {ranking.length === 0 && (
                                    <div className="text-center py-8 text-slate-500">
                                        <Trophy className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                        <p>No hay participantes configurados para este mes</p>
                                        <p className="text-sm">Haz clic en "Participantes" para comenzar</p>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* TAB 2: PERFORMANCE */}
                <TabsContent value="performance" className="mt-4">
                    <PerformanceTab
                        monthPeriod={selectedMonth}
                        limpiadores={limpiadores}
                        monthlyScores={monthlyScores}
                        user={user}
                        onScoreApplied={loadMonthlyScores}
                    />
                </TabsContent>

                {/* TAB 3: PUNTUALIDAD */}
                <TabsContent value="punctuality" className="mt-4">
                    <PunctualityTab
                        monthPeriod={selectedMonth}
                        limpiadores={limpiadores}
                        monthlyScores={monthlyScores}
                        user={user}
                        onScoreApplied={loadMonthlyScores}
                    />
                </TabsContent>

                {/* TAB 4: VEHÍCULOS */}
                <TabsContent value="vehicle" className="mt-4">
                    <VehicleChecklistTab
                        monthPeriod={selectedMonth}
                        limpiadores={limpiadores}
                        monthlyScores={monthlyScores}
                        user={user}
                        onScoreApplied={loadMonthlyScores}
                    />
                </TabsContent>

                {/* TAB 5: FEEDBACK */}
                <TabsContent value="feedback" className="mt-4">
                    <ClientFeedbackTab
                        monthPeriod={selectedMonth}
                        limpiadores={limpiadores}
                        monthlyScores={monthlyScores}
                        user={user}
                        onScoreApplied={loadMonthlyScores}
                    />
                </TabsContent>
            </Tabs>

            {/* Dialog - Configurar Participantes */}
            <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Configurar Participantes - {format(new Date(selectedMonth + '-01'), 'MMMM yyyy', { locale: es })}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 max-h-96 overflow-y-auto">
                        {limpiadores.map(cleaner => (
                            <div key={cleaner.id} className="flex items-center justify-between p-3 border rounded-lg">
                                <div>
                                    <p className="font-medium">{cleaner.invoice_name || cleaner.full_name}</p>
                                    <p className="text-sm text-slate-600">{cleaner.email}</p>
                                </div>
                                <Switch
                                    checked={participantConfig[cleaner.id] || false}
                                    onCheckedChange={(checked) =>
                                        setParticipantConfig(prev => ({
                                            ...prev,
                                            [cleaner.id]: checked
                                        }))
                                    }
                                />
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="outline" onClick={() => setShowConfigDialog(false)}>
                            Cancelar
                        </Button>
                        <Button onClick={handleSaveParticipants}>
                            Guardar Configuración
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Dialog - Ajuste de Puntos */}
            <Dialog open={showAdjustDialog} onOpenChange={setShowAdjustDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Ajustar Puntos - {selectedCleaner?.cleaner_name}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label>Tipo de Ajuste</Label>
                            <Select value={adjustmentData.type} onValueChange={(value) =>
                                setAdjustmentData(prev => ({ ...prev, type: value, category: '' }))
                            }>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="deduction">Deducción (-)</SelectItem>
                                    <SelectItem value="bonus">Bonificación (+)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <CategorySelector
                            selectedCategory={adjustmentData.category}
                            onCategoryChange={(category) =>
                                setAdjustmentData(prev => ({ ...prev, category }))
                            }
                            adjustmentType={adjustmentData.type}
                            userId={user?.id}
                        />

                        <div>
                            <Label>Puntos</Label>
                            <Input
                                type="number"
                                value={adjustmentData.points}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    const newPoints = value === '' ? '' : parseInt(value, 10);
                                    setAdjustmentData(prev => ({ ...prev, points: newPoints }));
                                }}
                                onFocus={(e) => e.target.select()}
                                placeholder="Ingresa los puntos"
                            />
                        </div>

                        <div>
                            <Label>Notas</Label>
                            <Textarea
                                value={adjustmentData.notes}
                                onChange={(e) => setAdjustmentData(prev => ({ ...prev, notes: e.target.value }))}
                                placeholder="Describe el motivo del ajuste..."
                                rows={3}
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="outline" onClick={() => setShowAdjustDialog(false)}>
                            Cancelar
                        </Button>
                        <Button onClick={handleSaveAdjustment}>
                            Aplicar Ajuste
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Dialog - Bonificación Mensual */}
            <Dialog open={showBonusDialog} onOpenChange={setShowBonusDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>🏆 Otorgar Bonificación Mensual</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                            <h3 className="font-semibold text-yellow-900">Ganador del Mes:</h3>
                            <p className="text-2xl font-bold text-yellow-800">{selectedCleaner?.cleaner_name}</p>
                            <p className="text-yellow-700">Puntuación: {selectedCleaner?.current_score} puntos</p>
                        </div>

                        <div>
                            <Label>Monto de la Bonificación (AUD)</Label>
                            <Input
                                type="number"
                                step="0.01"
                                value={bonusData.amount}
                                onChange={(e) => setBonusData(prev => ({ ...prev, amount: e.target.value }))}
                                placeholder="50.00"
                            />
                        </div>

                        <div>
                            <Label>Descripción</Label>
                            <Input
                                value={bonusData.description}
                                onChange={(e) => setBonusData(prev => ({ ...prev, description: e.target.value }))}
                                placeholder="Tarjeta de regalo, efectivo, etc."
                            />
                        </div>

                        <div className="bg-blue-50 p-3 rounded text-sm text-blue-800">
                            💡 Esta bonificación se agregará como una entrada de trabajo y aparecerá en la próxima factura del limpiador.
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowBonusDialog(false)}>
                            Cancelar
                        </Button>
                        <Button onClick={handleSaveMonthlyBonus} className="bg-green-600 hover:bg-green-700">
                            <Gift className="w-4 h-4 mr-2" />
                            Otorgar Bonificación
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Dialog - Bonificación Semestral */}
            <Dialog open={showSemestralDialog} onOpenChange={setShowSemestralDialog}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>⭐ Bonificación Semestral</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Fecha Inicio del Semestre</Label>
                                <Input
                                    type="date"
                                    value={semestralData.period_start}
                                    onChange={(e) => setSemestralData(prev => ({ ...prev, period_start: e.target.value }))}
                                />
                            </div>
                            <div>
                                <Label>Fecha Fin del Semestre</Label>
                                <Input
                                    type="date"
                                    value={semestralData.period_end}
                                    onChange={(e) => setSemestralData(prev => ({ ...prev, period_end: e.target.value }))}
                                />
                            </div>
                        </div>

                        <Button onClick={calculateSemestralRanking} className="w-full">
                            Calcular Ranking Semestral
                        </Button>

                        {semestralRanking.length > 0 && (
                            <>
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Ranking Semestral</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-2">
                                            {semestralRanking.slice(0, 5).map((cleaner, index) => (
                                                <div key={cleaner.cleaner_id} className={`flex justify-between items-center p-3 rounded ${
                                                    index === 0 ? 'bg-yellow-50 border border-yellow-200' : 'bg-slate-50'
                                                }`}>
                                                    <div className="flex items-center gap-2">
                                                        {index === 0 ? <Crown className="w-5 h-5 text-yellow-500" /> : `#${index + 1}`}
                                                        <span className="font-medium">{cleaner.cleaner_name}</span>
                                                    </div>
                                                    <span className="font-bold">{cleaner.average_score.toFixed(1)} pts promedio</span>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label>Monto de la Bonificación (AUD)</Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={semestralData.amount}
                                            onChange={(e) => setSemestralData(prev => ({ ...prev, amount: e.target.value }))}
                                            placeholder="200.00"
                                        />
                                    </div>
                                    <div>
                                        <Label>Descripción</Label>
                                        <Input
                                            value={semestralData.description}
                                            onChange={(e) => setSemestralData(prev => ({ ...prev, description: e.target.value }))}
                                            placeholder="Bono semestral de rendimiento"
                                        />
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowSemestralDialog(false)}>
                            Cancelar
                        </Button>
                        {semestralRanking.length > 0 && (
                            <Button onClick={handleSaveSemestralBonus} className="bg-purple-600 hover:bg-purple-700">
                                <Star className="w-4 h-4 mr-2" />
                                Otorgar Bonificación Semestral
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* NEW: Dialog - Historial de Puntuación del Limpiador */}
            <CleanerScoreHistoryDialog
                isOpen={showHistoryDialog}
                onClose={() => setShowHistoryDialog(false)}
                cleaner={cleanerForHistory}
                initialMonth={selectedMonth}
            />
        </div>
    );
}