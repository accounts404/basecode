import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Crown, Medal, Award, Trophy, User, ChevronDown, ChevronUp, RefreshCw, AlertCircle } from "lucide-react";
import SimplePagination from "@/components/ui/simple-pagination";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

function ScoreBar({ score }) {
  const color = score >= 90 ? "bg-green-500" : score >= 75 ? "bg-blue-500" : score >= 55 ? "bg-yellow-500" : "bg-red-400";
  return (
    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
    </div>
  );
}

function ScoreBadge({ score }) {
  const cls = score >= 90 ? "bg-green-100 text-green-800" : score >= 75 ? "bg-blue-100 text-blue-800" : score >= 55 ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800";
  return <Badge className={`${cls} text-sm font-bold px-3 py-1`}>{Math.round(score)} pts</Badge>;
}

function CleanerRow({ entry, rank, adjustments, onViewHistory, monthlyScores }) {
  const [expanded, setExpanded] = useState(false);
  const { cleaner, score, isParticipating } = entry;

  const myAdjustments = adjustments.filter(a => a.cleaner_id === cleaner.id)
    .sort((a, b) => new Date(b.date_applied || b.created_date) - new Date(a.date_applied || a.created_date));

  const deductions = myAdjustments.filter(a => a.adjustment_type === "deduction");
  const bonuses = myAdjustments.filter(a => a.adjustment_type === "bonus");
  const totalDeductions = deductions.reduce((s, a) => s + Math.abs(a.points_impact || 0), 0);
  const totalBonuses = bonuses.reduce((s, a) => s + Math.abs(a.points_impact || 0), 0);

  const rankIcon = rank === 1 ? <Crown className="w-6 h-6 text-yellow-500" /> :
                   rank === 2 ? <Medal className="w-6 h-6 text-gray-400" /> :
                   rank === 3 ? <Award className="w-6 h-6 text-amber-600" /> :
                   <div className="w-6 h-6 flex items-center justify-center bg-slate-200 rounded-full text-sm font-bold text-slate-600">{rank}</div>;

  const rowBg = rank === 1 ? "bg-yellow-50 border-yellow-200" :
                rank === 2 ? "bg-gray-50 border-gray-200" :
                rank === 3 ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200";

  const monthlyScore = monthlyScores?.find(s => s.cleaner_id === cleaner.id);

  return (
    <div className={`rounded-lg border ${rowBg} overflow-hidden`}>
      <div className="p-4">
        <div className="flex items-center gap-3">
          {rankIcon}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold truncate">{cleaner.invoice_name || cleaner.full_name}</p>
              {!isParticipating && <Badge variant="outline" className="text-xs text-slate-400">No participa</Badge>}
            </div>
            <div className="mt-2">
              <ScoreBar score={score} />
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 flex-wrap">
              <span className="text-slate-400">Base: 100</span>
              {totalDeductions > 0 && <span className="text-red-600 font-medium">-{totalDeductions} deducciones</span>}
              {totalBonuses > 0 && <span className="text-green-600 font-medium">+{totalBonuses} bonos</span>}
              {myAdjustments.length > 0 && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="flex items-center gap-1 text-blue-600 hover:underline"
                >
                  {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {myAdjustments.length} ajuste(s)
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <ScoreBadge score={score} />
            {monthlyScore && onViewHistory && (
              <Button variant="outline" size="sm" onClick={() => onViewHistory(monthlyScore)} className="text-xs h-8">
                Ver historial
              </Button>
            )}
          </div>
        </div>

        {/* Ajustes expandidos */}
        {expanded && myAdjustments.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
            {myAdjustments.map(adj => (
              <div key={adj.id} className="flex items-start justify-between text-xs bg-white rounded px-2 py-1.5 border border-slate-100">
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-slate-700">{adj.category}</span>
                  {adj.notes && <p className="text-slate-400 truncate mt-0.5">{adj.notes}</p>}
                  {adj.date_applied && (
                    <p className="text-slate-300 mt-0.5">
                      {format(parseISO(adj.date_applied), "d MMM yyyy", { locale: es })}
                      {adj.admin_name ? ` · ${adj.admin_name}` : ""}
                    </p>
                  )}
                </div>
                <span className={`ml-3 font-bold flex-shrink-0 ${adj.adjustment_type === "deduction" ? "text-red-600" : "text-green-600"}`}>
                  {adj.adjustment_type === "deduction" ? "" : "+"}{adj.points_impact}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function RankingTab({ monthPeriod, limpiadores, monthlyScores, onViewHistory, onRankingComputed }) {
  const [loading, setLoading] = useState(true);
  const [adjustments, setAdjustments] = useState([]);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  useEffect(() => {
    if (limpiadores.length > 0) loadAdjustments();
  }, [monthPeriod, limpiadores]);

  const loadAdjustments = async () => {
    setLoading(true);
    try {
      const adjs = await base44.entities.ScoreAdjustment.filter({ month_period: monthPeriod });
      setAdjustments(adjs);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  // Build rankings from MonthlyCleanerScore + all limpiadores
  const rankings = useMemo(() => {
    return limpiadores.map(cleaner => {
      const monthlyScore = monthlyScores.find(s => s.cleaner_id === cleaner.id);
      const score = monthlyScore ? (monthlyScore.current_score ?? 100) : 100;
      const isParticipating = monthlyScore ? (monthlyScore.is_participating !== false) : false;
      return { cleaner, score, isParticipating, monthlyScore };
    })
    .filter(e => e.isParticipating)  // only show participating cleaners
    .sort((a, b) => b.score - a.score)
    .map((e, i) => ({ ...e, rank: i + 1 }));
  }, [limpiadores, monthlyScores]);

  // Also include non-participating as a separate section
  const nonParticipating = useMemo(() => {
    return limpiadores.filter(c => !monthlyScores.some(s => s.cleaner_id === c.id && s.is_participating !== false));
  }, [limpiadores, monthlyScores]);

  const totalPages = Math.ceil(rankings.length / PAGE_SIZE);
  const paged = rankings.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2" />
        <p className="text-sm text-slate-500">Cargando ranking...</p>
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
            <p className="text-xs text-slate-500 mt-1">
              Puntaje basado en <span className="font-medium">MonthlyCleanerScore</span> — actualizado automáticamente por cada pestaña al registrar eventos.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={loadAdjustments}>
            <RefreshCw className="w-4 h-4 mr-1" /> Actualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {rankings.length === 0 ? (
          <div className="text-center py-10 text-slate-500">
            <Trophy className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="font-medium">No hay participantes en el ranking este mes.</p>
            <p className="text-sm mt-1 text-slate-400">Activá la participación de los limpiadores para que aparezcan aquí.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {paged.map(entry => (
              <CleanerRow
                key={entry.cleaner.id}
                entry={entry}
                rank={entry.rank}
                adjustments={adjustments}
                onViewHistory={onViewHistory}
                monthlyScores={monthlyScores}
              />
            ))}

            <SimplePagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
              totalItems={rankings.length}
              pageSize={PAGE_SIZE}
            />
          </div>
        )}

        {/* Non-participating cleaners */}
        {nonParticipating.length > 0 && (
          <div className="mt-6 pt-4 border-t border-slate-100">
            <div className="flex items-center gap-2 mb-3 text-slate-400">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm font-medium">Sin participación activa este mes ({nonParticipating.length})</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {nonParticipating.map(c => (
                <Badge key={c.id} variant="outline" className="text-slate-400 flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {c.invoice_name || c.full_name}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}