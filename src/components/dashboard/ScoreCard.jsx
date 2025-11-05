import React, { useState, useEffect, useCallback } from "react";
import { MonthlyCleanerScore } from "@/entities/MonthlyCleanerScore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, TrendingUp, Crown, Medal, Award, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function ScoreCard({ userId }) {
    const [scoreData, setScoreData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isParticipant, setIsParticipant] = useState(false);

    const loadScoreData = useCallback(async () => {
        setLoading(true);
        try {
            const currentMonth = format(new Date(), 'yyyy-MM');
            
            // Check for participation first
            const userScores = await MonthlyCleanerScore.filter({
                cleaner_id: userId,
                month_period: currentMonth,
                is_participating: true
            });

            if (userScores.length === 0) {
                setIsParticipant(false);
                setLoading(false);
                return;
            }

            setIsParticipant(true);
            const userScore = userScores[0];
            setScoreData(userScore);

            // Load all scores to calculate ranking
            const allScores = await MonthlyCleanerScore.filter({
                month_period: currentMonth,
                is_participating: true
            });

            const sortedScores = allScores.sort((a, b) => b.current_score - a.current_score);
            const userRank = sortedScores.findIndex(score => score.cleaner_id === userId) + 1;

            setScoreData(prev => ({
                ...prev,
                current_rank: userRank > 0 ? userRank : null,
                total_participants: allScores.length
            }));
        } catch (error) {
            console.error('Error cargando datos de puntuación:', error);
            setIsParticipant(false);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        loadScoreData();
    }, [loadScoreData]);

    const getRankIcon = (rank) => {
        if (rank === 1) return <Crown className="w-6 h-6 text-yellow-500" />;
        if (rank === 2) return <Medal className="w-6 h-6 text-gray-400" />;
        if (rank === 3) return <Award className="w-6 h-6 text-amber-600" />;
        return <TrendingUp className="w-6 h-6 text-blue-600" />;
    };

    const getRankColor = (rank) => {
        if (rank === 1) return "from-yellow-50 to-amber-50 border-yellow-200 text-yellow-900";
        if (rank === 2) return "from-gray-50 to-slate-50 border-gray-200 text-gray-900";
        if (rank === 3) return "from-amber-50 to-orange-50 border-amber-200 text-amber-900";
        return "from-blue-50 to-indigo-50 border-blue-200 text-blue-900";
    };

    if (loading) {
        return (
            <Card className="h-40 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </Card>
        );
    }

    if (!isParticipant) {
        return null; // Don't render anything if not a participant
    }

    return (
        <Link to={createPageUrl("MiPuntuacion")} className="block">
            <Card className={`bg-gradient-to-r ${getRankColor(scoreData.current_rank)} hover:shadow-lg transition-all duration-300 cursor-pointer`}>
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            {getRankIcon(scoreData.current_rank)}
                            <span className="text-lg">Mi Puntuación</span>
                        </div>
                        <div className="text-right">
                            <div className="text-2xl font-bold">
                                {scoreData.current_rank ? `#${scoreData.current_rank}` : '-'}
                            </div>
                            <div className="text-sm opacity-75">posición</div>
                        </div>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-3xl font-bold mb-1">
                                {scoreData.current_score}
                            </div>
                            <div className="text-sm opacity-75">
                                puntos de 100
                            </div>
                        </div>
                        <div className="flex flex-col items-end">
                            {scoreData.current_rank === 1 && (
                                <div className="text-xs font-semibold px-2 py-1 bg-white/30 rounded-full mb-2">
                                    🏆 ¡Líder!
                                </div>
                            )}
                            {scoreData.current_rank <= 3 && scoreData.current_rank > 1 && (
                                <div className="text-xs font-semibold px-2 py-1 bg-white/30 rounded-full mb-2">
                                    🥇 Top 3
                                </div>
                            )}
                            <div className="w-20 bg-white/30 rounded-full h-2 overflow-hidden">
                                <div 
                                    className="bg-white h-full transition-all duration-500"
                                    style={{ width: `${Math.max(0, scoreData.current_score)}%` }}
                                />
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
}