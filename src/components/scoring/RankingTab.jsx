import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Crown, Medal, Award, Trophy, ClipboardList, Clock, Car, MessageSquare, Eye, RefreshCw } from "lucide-react";
import SimplePagination from "@/components/ui/simple-pagination";

// Puntos máximos por categoría (deben sumar 100)
const MAX_PTS = {
  performance: 50,
  punctuality: 10,
  vehicles:    18,
  feedback:    22,
};

const VEHICLE_TOTAL_POSSIBLE = 18;

// Convierte score 0-100 a puntos ponderados
function toPts(score, category) {
  return Math.round(score * MAX_PTS[category] / 100);
}

function MiniBar({ pts, max, colorClass }) {
  const pct = max > 0 ? (pts / max) * 100 : 0;
  return (
    <div className="h-1.5 w-14 bg-slate-200 rounded-full overflow-hidden inline-block align-middle">
      <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

function AreaScore({ icon: Icon, pts, max, colorClass, label }) {
  return (
    <span className="flex items-center gap-1 text-xs text-slate-500" title={label}>
      <Icon className={`w-3 h-3 ${colorClass}`} />
      <span className={`font-medium ${pts === 0 ? 'text-slate-300' : ''}`}>{pts}<span className="text-slate-300">/{max}</span></span>
      <MiniBar pts={pts} max={max} colorClass={colorClass.replace("text-", "bg-")} />
    </span>
  );
}

export default function RankingTab({ monthPeriod, limpiadores, monthlyScores, onViewHistory, onRankingComputed }) {
  const [loading, setLoading] = useState(true);
  const [rankings, setRankings] = useState([]);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  useEffect(() => {
    if (limpiadores.length > 0) loadAndCompute();
  }, [monthPeriod, limpiadores]);

  const loadAndCompute = async () => {
    setLoading(true);
    try {
      const [perfReviews, punctRecords, vehicleRecords, feedbacks] = await Promise.all([
        base44.entities.PerformanceReview.filter({ month_period: monthPeriod }),
        base44.entities.PunctualityRecord.filter({ month_period: monthPeriod }),
        base44.entities.VehicleChecklistRecord.filter({ month_period: monthPeriod }),
        base44.entities.ClientFeedback.filter({ month_period: monthPeriod }),
      ]);

      const ranked = limpiadores.map(cleaner => {
        // --- Performance (max 50 pts) — 0 si no hay datos ---
        const myPerf = perfReviews.filter(r => r.cleaner_id === cleaner.id);
        const perfScore = myPerf.length > 0
          ? Math.round(myPerf.reduce((s, r) => s + (r.overall_score || 0), 0) / myPerf.length)
          : 0;
        const perfPts = toPts(perfScore, 'performance');

        // --- Puntualidad (max 10 pts) — 0 si no hay datos ---
        const myPunct = punctRecords.filter(r => r.cleaner_id === cleaner.id);
        const punctScore = myPunct.length > 0
          ? Math.max(0, Math.min(100, 100 + myPunct.reduce((s, r) => s + (r.points_impact || 0), 0)))
          : 0;
        const punctPts = toPts(punctScore, 'punctuality');

        // --- Vehículos (max 18 pts) — 0 si no hay datos ---
        const myVehicle = vehicleRecords.filter(r => (r.team_member_ids || []).includes(cleaner.id));
        let vehicleScore = 0;
        if (myVehicle.length > 0) {
          const avgDeduction = myVehicle.reduce((s, r) => s + (r.total_deduction || 0), 0) / myVehicle.length;
          vehicleScore = Math.max(0, Math.min(100,
            Math.round(((VEHICLE_TOTAL_POSSIBLE - avgDeduction) / VEHICLE_TOTAL_POSSIBLE) * 100)
          ));
        }
        const vehiclePts = toPts(vehicleScore, 'vehicles');

        // --- Feedback (max 22 pts) — 0 si no hay datos ---
        const myFeedback = feedbacks.filter(r => (r.affected_cleaner_ids || []).includes(cleaner.id));
        const feedbackScore = myFeedback.length > 0
          ? Math.max(0, Math.min(100, 100 + myFeedback.reduce((s, r) => s + (r.points_impact || 0), 0)))
          : 0;
        const feedbackPts = toPts(feedbackScore, 'feedback');

        const totalPts = perfPts + punctPts + vehiclePts + feedbackPts;

        return {
          cleaner,
          perfPts, punctPts, vehiclePts, feedbackPts,
          totalPts,
          perfCount: myPerf.length,
          punctCount: myPunct.length,
          vehicleCount: myVehicle.length,
          feedbackCount: myFeedback.length,
        };
      });

      ranked.sort((a, b) => b.composite - a.composite);
      const withRanks = ranked.map((r, i) => ({ ...r, rank: i + 1 }));
      setRankings(withRanks);
      if (onRankingComputed) onRankingComputed(withRanks);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const totalPages = Math.ceil(rankings.length / PAGE_SIZE);
  const paged = rankings.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2" />
        <p className="text-sm text-slate-500">Calculando ranking...</p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Medal className="w-5 h-5" /> Ranking Mensual
            </CardTitle>
            <div className="flex gap-3 mt-2 flex-wrap">
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">
                <ClipboardList className="w-3 h-3" /> Performance 50%
              </span>
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded-full">
                <Clock className="w-3 h-3" /> Puntualidad 10%
              </span>
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-orange-50 text-orange-700 rounded-full">
                <Car className="w-3 h-3" /> Vehículos 18%
              </span>
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full">
                <MessageSquare className="w-3 h-3" /> Feedback 22%
              </span>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={loadAndCompute}>
            <RefreshCw className="w-4 h-4 mr-1" /> Recalcular
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {paged.map(({ cleaner, rank, composite, perfScore, punctScore, vehicleScore, feedbackScore }) => {
            const rankIcon = rank === 1 ? <Crown className="w-6 h-6 text-yellow-500" /> :
                             rank === 2 ? <Medal className="w-6 h-6 text-gray-400" /> :
                             rank === 3 ? <Award className="w-6 h-6 text-amber-600" /> :
                             <div className="w-6 h-6 flex items-center justify-center bg-slate-200 rounded-full text-sm font-bold text-slate-600">{rank}</div>;

            const monthlyScore = monthlyScores?.find(s => s.cleaner_id === cleaner.id);
            const scoreColor = composite >= 90 ? "text-green-700" : composite >= 75 ? "text-blue-700" : composite >= 60 ? "text-yellow-700" : "text-red-700";

            return (
              <div key={cleaner.id} className={`p-4 rounded-lg border ${
                rank === 1 ? 'bg-yellow-50 border-yellow-200' :
                rank === 2 ? 'bg-gray-50 border-gray-200' :
                rank === 3 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'
              }`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {rankIcon}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{cleaner.invoice_name || cleaner.full_name}</p>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <AreaScore icon={ClipboardList} score={perfScore}    colorClass="text-blue-500"   label="Performance" />
                        <AreaScore icon={Clock}         score={punctScore}   colorClass="text-green-500"  label="Puntualidad" />
                        <AreaScore icon={Car}           score={vehicleScore} colorClass="text-orange-500" label="Vehículos" />
                        <AreaScore icon={MessageSquare} score={feedbackScore} colorClass="text-purple-500" label="Feedback" />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <p className={`text-2xl font-bold ${scoreColor}`}>{composite}</p>
                      <p className="text-xs text-slate-400">/ 100</p>
                    </div>
                    {monthlyScore && onViewHistory && (
                      <Button variant="outline" size="sm" onClick={() => onViewHistory(monthlyScore)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {rankings.length === 0 && (
            <div className="text-center py-8 text-slate-500">
              <Trophy className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No hay datos para calcular el ranking este mes.</p>
              <p className="text-sm mt-1">Registra evaluaciones, puntualidad, vehículos o feedback para ver el ranking.</p>
            </div>
          )}

          <SimplePagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
            totalItems={rankings.length}
            pageSize={PAGE_SIZE}
          />
        </div>
      </CardContent>
    </Card>
  );
}