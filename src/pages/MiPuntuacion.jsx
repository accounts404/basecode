import React, { useState, useEffect, useCallback } from "react";
import { User } from "@/entities/User";
import { MonthlyCleanerScore } from "@/entities/MonthlyCleanerScore";
import { ScoreAdjustment } from "@/entities/ScoreAdjustment";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trophy, TrendingUp, TrendingDown, Calendar, History, Medal, Crown, Award, Info, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function MiPuntuacionPage() {
    const [user, setUser] = useState(null);
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [monthlyScore, setMonthlyScore] = useState(null);
    const [adjustments, setAdjustments] = useState([]);
    const [allScores, setAllScores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentRank, setCurrentRank] = useState(null);

    const categoryLabels = {
        // ... (your existing category labels)
    };

    const loadUserData = useCallback(async () => {
        setLoading(true);
        try {
            const userData = await User.me();
            setUser(userData);

            // Cargar puntuación del mes seleccionado
            const scores = await MonthlyCleanerScore.filter({
                cleaner_id: userData.id,
                month_period: selectedMonth,
                is_participating: true // Ensure we only get data if participating
            });

            if (scores.length > 0) {
                setMonthlyScore(scores[0]);
                
                // Cargar ajustes del mes
                const monthAdjustments = await ScoreAdjustment.filter({
                    cleaner_id: userData.id,
                    month_period: selectedMonth
                });
                setAdjustments(monthAdjustments.sort((a, b) => new Date(b.date_applied) - new Date(a.date_applied)));
            } else {
                setMonthlyScore(null);
                setAdjustments([]);
            }

            // Cargar todos los scores del mes para calcular ranking
            const allMonthScores = await MonthlyCleanerScore.filter({
                month_period: selectedMonth,
                is_participating: true
            });
            setAllScores(allMonthScores);

            // Calcular ranking actual
            if (scores.length > 0) {
                const sortedScores = allMonthScores.sort((a, b) => b.current_score - a.current_score);
                const rank = sortedScores.findIndex(s => s.cleaner_id === userData.id) + 1;
                setCurrentRank(rank > 0 ? rank : null);
            } else {
                setCurrentRank(null);
            }

        } catch (error) {
            console.error('Error cargando datos:', error);
        } finally {
            setLoading(false);
        }
    }, [selectedMonth]);

    useEffect(() => {
        loadUserData();
    }, [loadUserData]);

    const getRankIcon = (rank) => {
        if (rank === 1) return <Crown className="w-6 h-6 text-yellow-500" />;
        if (rank === 2) return <Medal className="w-6 h-6 text-gray-400" />;
        if (rank === 3) return <Award className="w-6 h-6 text-amber-600" />;
        return <div className="w-6 h-6 flex items-center justify-center bg-slate-200 rounded-full text-sm font-bold">{rank}</div>;
    };

    const getRankColor = (rank) => {
        if (rank === 1) return "bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-200 text-yellow-900";
        if (rank === 2) return "bg-gradient-to-r from-gray-50 to-slate-50 border-gray-200 text-gray-900";
        if (rank === 3) return "bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200 text-amber-900";
        return "bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 text-blue-900";
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
            </div>
        );
    }

    if (!monthlyScore) {
        return (
            <div className="p-6 md:p-10 space-y-6 bg-slate-50 min-h-screen">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-3 text-slate-800">
                            <Trophy className="w-7 h-7" />
                            Mi Puntuación
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-center py-16">
                        <Info className="w-16 h-16 mx-auto mb-6 text-slate-400" />
                        <h3 className="text-2xl font-bold text-slate-700 mb-2">
                            No Estás Participando Este Mes
                        </h3>
                        <p className="text-slate-600 max-w-md mx-auto">
                            Actualmente no formas parte del sistema de puntuación para el período de{' '}
                            <strong className="text-slate-700">{format(new Date(selectedMonth + '-02'), 'MMMM yyyy', { locale: es })}</strong>.
                        </p>
                        <div className="mt-8">
                            <Label className="text-slate-600">Puedes consultar otro mes:</Label>
                            <Input
                                type="month"
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(e.target.value)}
                                className="w-48 mx-auto mt-2 p-2 border-slate-300"
                            />
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
            {/* Header */}
            <Card className={getRankColor(currentRank)}>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <Trophy className="w-8 h-8" />
                            <div>
                                <CardTitle className="text-2xl">Mi Puntuación</CardTitle>
                                <p className="opacity-80">
                                    {format(new Date(selectedMonth + '-01'), 'MMMM yyyy', { locale: es })}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <Label>Ver mes:</Label>
                            <Input
                                type="month"
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(e.target.value)}
                                className="w-40"
                            />
                        </div>
                    </div>
                </CardHeader>
            </Card>

            {/* Puntuación y Ranking */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="text-center">
                    <CardHeader>
                        <CardTitle className="flex items-center justify-center gap-2">
                            <TrendingUp className="w-6 h-6 text-blue-600" />
                            Mi Puntuación Actual
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-6xl font-bold text-blue-900 mb-2">
                            {monthlyScore.current_score}
                        </div>
                        <p className="text-blue-600 text-lg">de 100 puntos</p>
                        <div className="mt-4 bg-blue-100 rounded-full h-4 overflow-hidden">
                            <div 
                                className="bg-blue-600 h-full transition-all duration-500"
                                style={{ width: `${Math.max(0, monthlyScore.current_score)}%` }}
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card className="text-center">
                    <CardHeader>
                        <CardTitle className="flex items-center justify-center gap-2">
                            {getRankIcon(currentRank)}
                            Mi Posición en el Ranking
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-6xl font-bold mb-2" style={{
                            color: currentRank === 1 ? '#d97706' : 
                                   currentRank === 2 ? '#6b7280' : 
                                   currentRank === 3 ? '#f59e0b' : '#3b82f6'
                        }}>
                            #{currentRank}
                        </div>
                        <p className="text-lg text-slate-600">
                            en el ranking
                        </p>
                        {currentRank === 1 && (
                            <Badge className="mt-4 bg-yellow-500 text-white">
                                🏆 ¡Primer Lugar!
                            </Badge>
                        )}
                        {currentRank <= 3 && currentRank > 1 && (
                            <Badge className="mt-4 bg-orange-500 text-white">
                                🥇 Top 3
                            </Badge>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Historial de Ajustes */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <History className="w-5 h-5" />
                        Historial de Puntos - {format(new Date(selectedMonth + '-01'), 'MMMM yyyy', { locale: es })}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {adjustments.length > 0 ? (
                        <div className="space-y-3">
                            {adjustments.map((adjustment) => (
                                <div key={adjustment.id} className={`p-4 rounded-lg border ${
                                    adjustment.adjustment_type === 'bonus' ? 
                                    'bg-green-50 border-green-200' : 
                                    'bg-red-50 border-red-200'
                                }`}>
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-2">
                                                {adjustment.adjustment_type === 'bonus' ? 
                                                    <TrendingUp className="w-5 h-5 text-green-600" /> :
                                                    <TrendingDown className="w-5 h-5 text-red-600" />
                                                }
                                                <p className="font-semibold">
                                                    {categoryLabels[adjustment.category] || adjustment.category}
                                                </p>
                                                <Badge variant={adjustment.adjustment_type === 'bonus' ? 'default' : 'destructive'}>
                                                    {adjustment.points_impact > 0 ? '+' : ''}{adjustment.points_impact} pts
                                                </Badge>
                                            </div>
                                            {adjustment.notes && (
                                                <p className="text-sm text-slate-600 mb-2">
                                                    {adjustment.notes}
                                                </p>
                                            )}
                                            <p className="text-xs text-slate-500">
                                                {format(new Date(adjustment.date_applied), "d MMM yyyy 'a las' HH:mm", { locale: es })}
                                                {adjustment.admin_name && ` • Por: ${adjustment.admin_name}`}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-slate-500">
                            <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <p>No hay ajustes registrados para este mes</p>
                            <p className="text-sm">¡Sigue así! Tu puntuación inicial se mantiene.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}