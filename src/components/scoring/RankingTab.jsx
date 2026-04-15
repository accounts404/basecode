import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Crown, Medal, Award, Trophy, User, ChevronDown, ChevronUp,
  RefreshCw, TrendingDown, TrendingUp, Minus, Eye, BarChart3,
  UserX, Settings
} from "lucide-react";
import SimplePagination from "@/components/ui/simple-pagination";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

/* Weights for scoring components */
const WEIGHTS = {
  performance: 0.50,   // 50%
  punctuality: 0.10,   // 10%
  vehicles: 0.18,      // 18%
  feedback: 0.22       // 22%
};

/* ─── helpers ─────────────────────────────────────────── */
function scoreColor(s) {
  if (s >= 95) return { text: "text-emerald-700", bg: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800" };
  if (s >= 85) return { text: "text-blue-700",    bg: "bg-blue-500",    badge: "bg-blue-100 text-blue-800" };
  if (s >= 70) return { text: "text-amber-700",   bg: "bg-amber-500",   badge: "bg-amber-100 text-amber-800" };
  return         { text: "text-red-700",           bg: "bg-red-400",     badge: "bg-red-100 text-red-800" };
}

function ScoreBar({ score }) {
  const col = scoreColor(score);
  return (
    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${col.bg}`}
           style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
    </div>
  );
}

function RankBadge({ rank }) {
  if (rank === 1) return <div className="flex items-center justify-center w-10 h-10 rounded-full bg-yellow-100 border-2 border-yellow-300 flex-shrink-0"><Crown className="w-5 h-5 text-yellow-500" /></div>;
  if (rank === 2) return <div className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 border-2 border-slate-300 flex-shrink-0"><Medal className="w-5 h-5 text-slate-500" /></div>;
  if (rank === 3) return <div className="flex items-center justify-center w-10 h-10 rounded-full bg-orange-100 border-2 border-orange-300 flex-shrink-0"><Award className="w-5 h-5 text-amber-600" /></div>;
  return <div className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-50 border border-slate-200 flex-shrink-0 text-sm font-bold text-slate-500">{rank}</div>;
}

function AdjRow({ adj }) {
  const isDeduction = adj.adjustment_type === "deduction";
  return (
    <div className="flex items-start justify-between gap-2 text-xs py-1.5 px-2 rounded-md bg-white border border-slate-100">
      <div className="flex-1 min-w-0">
        <span className="font-medium text-slate-700">{adj.category}</span>
        {adj.notes && <p className="text-slate-400 truncate mt-0.5">{adj.notes}</p>}
        <p className="text-slate-300 mt-0.5">
          {adj.date_applied ? format(parseISO(adj.date_applied), "d MMM yyyy", { locale: es }) : ""}
          {adj.admin_name ? ` · ${adj.admin_name}` : ""}
        </p>
      </div>
      <span className={`font-bold flex-shrink-0 ml-2 ${isDeduction ? "text-red-600" : "text-emerald-600"}`}>
        {isDeduction ? "" : "+"}{adj.points_impact}
      </span>
    </div>
  );
}

function CleanerRow({ entry, rank, adjustments, onViewHistory, monthlyScores, onToggleParticipation, isManageMode, componentScores }) {
  const [expanded, setExpanded] = useState(false);
  const [toggling, setToggling] = useState(false);
  const { cleaner, score, isParticipating } = entry;
  const col = scoreColor(score);
  
  const perf = componentScores?.performance?.[cleaner.id] || 100;
  const punct = componentScores?.punctuality?.[cleaner.id] || 100;
  const vehicles = componentScores?.vehicles?.[cleaner.id] || 100;
  const feedback = componentScores?.feedback?.[cleaner.id] || 100;

  const myAdj = adjustments
    .filter(a => a.cleaner_id === cleaner.id)
    .sort((a, b) => new Date(b.date_applied || b.created_date) - new Date(a.date_applied || a.created_date));

  const deductionTotal = myAdj.filter(a => a.adjustment_type === "deduction")
    .reduce((s, a) => s + Math.abs(a.points_impact || 0), 0);
  const bonusTotal = myAdj.filter(a => a.adjustment_type === "bonus")
    .reduce((s, a) => s + Math.abs(a.points_impact || 0), 0);

  const monthlyScore = monthlyScores?.find(s => s.cleaner_id === cleaner.id);

  const rowBg = !isParticipating
    ? "bg-slate-50 border-slate-200 opacity-70"
    : rank === 1 ? "bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-200"
    : rank === 2 ? "bg-gradient-to-r from-slate-50 to-gray-50 border-slate-200"
    : rank === 3 ? "bg-gradient-to-r from-orange-50 to-amber-50 border-orange-200"
    : "bg-white border-slate-200";

  const handleToggle = async () => {
    if (!monthlyScore) return;
    setToggling(true);
    await onToggleParticipation(monthlyScore, !isParticipating);
    setToggling(false);
  };

  return (
    <div className={`rounded-xl border transition-all ${rowBg} overflow-hidden`}>
      <div className="p-4">
        <div className="flex items-center gap-3">
          {isParticipating
            ? <RankBadge rank={rank} />
            : <div className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex-shrink-0"><UserX className="w-4 h-4 text-slate-400" /></div>
          }

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <p className={`font-semibold truncate ${isParticipating ? "text-slate-800" : "text-slate-500"}`}>
                {cleaner.invoice_name || cleaner.full_name}
              </p>
              {!isParticipating && <Badge variant="outline" className="text-xs text-slate-400 border-slate-300">Excluido</Badge>}
            </div>

            {isParticipating && (
              <>
                <div className="flex items-center gap-2 mt-1.5 mb-2">
                  <ScoreBar score={score} />
                </div>
                
                {/* Component Scores Breakdown */}
                <div className="grid grid-cols-4 gap-2 mt-2 mb-2 text-xs">
                  <div className="bg-slate-50 rounded p-2 text-center">
                    <p className="font-bold text-slate-700">{perf}</p>
                    <p className="text-slate-500">Performance (50%)</p>
                  </div>
                  <div className="bg-slate-50 rounded p-2 text-center">
                    <p className="font-bold text-slate-700">{punct}</p>
                    <p className="text-slate-500">Puntualidad (10%)</p>
                  </div>
                  <div className="bg-slate-50 rounded p-2 text-center">
                    <p className="font-bold text-slate-700">{vehicles}</p>
                    <p className="text-slate-500">Vehículos (18%)</p>
                  </div>
                  <div className="bg-slate-50 rounded p-2 text-center">
                    <p className="font-bold text-slate-700">{feedback}</p>
                    <p className="text-slate-500">Feedback (22%)</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 text-xs flex-wrap">
                  <span className="text-slate-400">Base 100</span>
                  {deductionTotal > 0 && (
                    <span className="flex items-center gap-0.5 text-red-600 font-medium">
                      <TrendingDown className="w-3 h-3" /> -{deductionTotal} pts
                    </span>
                  )}
                  {bonusTotal > 0 && (
                    <span className="flex items-center gap-0.5 text-emerald-600 font-medium">
                      <TrendingUp className="w-3 h-3" /> +{bonusTotal} pts
                    </span>
                  )}
                  {deductionTotal === 0 && bonusTotal === 0 && (
                    <span className="flex items-center gap-0.5 text-slate-400">
                      <Minus className="w-3 h-3" /> Sin ajustes
                    </span>
                  )}
                  {myAdj.length > 0 && (
                    <button
                      onClick={() => setExpanded(!expanded)}
                      className="flex items-center gap-1 text-blue-600 hover:underline"
                    >
                      {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {myAdj.length} ajuste{myAdj.length !== 1 ? "s" : ""}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {isParticipating && (
              <div className="text-right">
                <p className={`text-3xl font-black tabular-nums ${col.text}`}>{Math.round(score)}</p>
                <p className="text-xs text-slate-400 -mt-0.5">/ 100</p>
              </div>
            )}
            {monthlyScore && onViewHistory && isParticipating && (
              <Button variant="outline" size="sm" onClick={() => onViewHistory(monthlyScore)}
                      className="h-8 px-2 text-xs text-slate-500">
                <Eye className="w-3.5 h-3.5" />
              </Button>
            )}
            {isManageMode && (
              <Button
                variant={isParticipating ? "outline" : "default"}
                size="sm"
                onClick={handleToggle}
                disabled={toggling}
                className={`h-8 text-xs ${isParticipating ? "border-red-200 text-red-600 hover:bg-red-50" : "bg-green-600 hover:bg-green-700 text-white"}`}
              >
                {toggling ? "..." : isParticipating ? "Excluir" : "Incluir"}
              </Button>
            )}
          </div>
        </div>

        {expanded && myAdj.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
            {myAdj.map(adj => <AdjRow key={adj.id} adj={adj} />)}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main Component ────────────────────────────────── */
export default function RankingTab({ monthPeriod, limpiadores, monthlyScores, onViewHistory, onScoresChanged }) {
  const [loading, setLoading] = useState(true);
  const [adjustments, setAdjustments] = useState([]);
  const [page, setPage] = useState(1);
  const [isManageMode, setIsManageMode] = useState(false);
  const [tab, setTab] = useState("monthly");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [customAdjustments, setCustomAdjustments] = useState([]);
  const [customLoading, setCustomLoading] = useState(false);
  const [customPage, setCustomPage] = useState(1);
  const [performanceScores, setPerformanceScores] = useState({});
  const [punctualityScores, setPunctualityScores] = useState({});
  const [vehicleScores, setVehicleScores] = useState({});
  const [feedbackScores, setFeedbackScores] = useState({});
  const PAGE_SIZE = 30;

  useEffect(() => {
    if (limpiadores.length > 0) {
      loadAdjustments();
      loadComponentScores();
    }
  }, [monthPeriod, limpiadores]);

  const loadComponentScores = async () => {
    try {
      const perfReviews = await base44.entities.PerformanceReview?.list() || [];
      const punctRecords = await base44.entities.PunctualityRecord?.list() || [];
      const vehicleRecords = await base44.entities.VehicleChecklistRecord?.list() || [];
      const feedbackRecords = await base44.entities.ClientFeedback?.list() || [];

      // Calculate average scores per cleaner per month
      const perfByMonth = {};
      perfReviews.forEach(p => {
        if (p.month_period === monthPeriod) {
          if (!perfByMonth[p.cleaner_id]) perfByMonth[p.cleaner_id] = [];
          perfByMonth[p.cleaner_id].push(p.overall_score || 100);
        }
      });

      const punctByMonth = {};
      punctRecords.forEach(p => {
        if (p.month_period === monthPeriod) {
          if (!punctByMonth[p.cleaner_id]) punctByMonth[p.cleaner_id] = [];
          punctByMonth[p.cleaner_id].push(p.score || 100);
        }
      });

      const vehicleByMonth = {};
      vehicleRecords.forEach(v => {
        if (v.month_period === monthPeriod) {
          if (!vehicleByMonth[v.cleaner_id]) vehicleByMonth[v.cleaner_id] = [];
          vehicleByMonth[v.cleaner_id].push(v.overall_score || 100);
        }
      });

      const feedbackByMonth = {};
      feedbackRecords.forEach(f => {
        if (f.month_period === monthPeriod) {
          if (!feedbackByMonth[f.cleaner_id]) feedbackByMonth[f.cleaner_id] = [];
          feedbackByMonth[f.cleaner_id].push(f.score || 100);
        }
      });

      setPerformanceScores(
        Object.fromEntries(
          Object.entries(perfByMonth).map(([id, scores]) => [
            id,
            scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b) / scores.length) : 100
          ])
        )
      );

      setPunctualityScores(
        Object.fromEntries(
          Object.entries(punctByMonth).map(([id, scores]) => [
            id,
            scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b) / scores.length) : 100
          ])
        )
      );

      setVehicleScores(
        Object.fromEntries(
          Object.entries(vehicleByMonth).map(([id, scores]) => [
            id,
            scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b) / scores.length) : 100
          ])
        )
      );

      setFeedbackScores(
        Object.fromEntries(
          Object.entries(feedbackByMonth).map(([id, scores]) => [
            id,
            scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b) / scores.length) : 100
          ])
        )
      );
    } catch (e) {
      console.error('Error loading component scores:', e);
    }
  };

  const loadAdjustments = async () => {
    setLoading(true);
    try {
      const adjs = await base44.entities.ScoreAdjustment.filter({ month_period: monthPeriod });
      setAdjustments(adjs);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const calculateWeightedScore = (cleanerId) => {
    const perf = performanceScores[cleanerId] || 100;
    const punct = punctualityScores[cleanerId] || 100;
    const vehicles = vehicleScores[cleanerId] || 100;
    const feedback = feedbackScores[cleanerId] || 100;
    
    return (
      perf * WEIGHTS.performance +
      punct * WEIGHTS.punctuality +
      vehicles * WEIGHTS.vehicles +
      feedback * WEIGHTS.feedback
    );
  };

  const loadCustomRanking = async () => {
    if (!dateFrom || !dateTo) {
      alert("Por favor selecciona ambas fechas");
      return;
    }
    setCustomLoading(true);
    try {
      const adjs = await base44.entities.ScoreAdjustment.list();
      const filtered = adjs.filter(a => {
        const adjDate = a.date_applied ? a.date_applied.split('T')[0] : '';
        return adjDate >= dateFrom && adjDate <= dateTo;
      });
      setCustomAdjustments(filtered);
      setCustomPage(1);
    } catch (e) { console.error(e); }
    setCustomLoading(false);
  };

  const handleToggleParticipation = async (monthlyScore, newValue) => {
    await base44.entities.MonthlyCleanerScore.update(monthlyScore.id, { is_participating: newValue });
    if (onScoresChanged) onScoresChanged();
  };

  // All limpiadores, ranked by score — participating first, excluded at bottom
  const allEntries = useMemo(() => {
    const entries = limpiadores.map(cleaner => {
      const ms = monthlyScores.find(s => s.cleaner_id === cleaner.id);
      const score = ms ? (ms.current_score ?? 100) : 100;
      const isParticipating = ms ? (ms.is_participating !== false) : true;
      return { cleaner, score, isParticipating };
    });

    const active = entries.filter(e => e.isParticipating)
      .sort((a, b) => b.score - a.score)
      .map((e, i) => ({ ...e, rank: i + 1 }));

    const excluded = entries.filter(e => !e.isParticipating)
      .sort((a, b) => (a.cleaner.invoice_name || a.cleaner.full_name).localeCompare(b.cleaner.invoice_name || b.cleaner.full_name))
      .map(e => ({ ...e, rank: null }));

    return [...active, ...excluded];
  }, [limpiadores, monthlyScores]);

  const participating = allEntries.filter(e => e.isParticipating);
  const excluded = allEntries.filter(e => !e.isParticipating);

  const avgScore = participating.length > 0
    ? Math.round(participating.reduce((s, e) => s + e.score, 0) / participating.length)
    : null;
  const topScore = participating.length > 0 ? Math.round(participating[0].score) : null;

  const totalPages = Math.ceil(allEntries.length / PAGE_SIZE);
  const paged = allEntries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const renderRankingContent = (entries, isCustom = false) => {
    const componentScores = {
      performance: performanceScores,
      punctuality: punctualityScores,
      vehicles: vehicleScores,
      feedback: feedbackScores
    };
    const participating = entries.filter(e => e.isParticipating);
    const excluded = entries.filter(e => !e.isParticipating);
    const avgScore = participating.length > 0 ? Math.round(participating.reduce((s, e) => s + e.score, 0) / participating.length) : null;
    const topScore = participating.length > 0 ? Math.round(participating[0].score) : null;
    const currentPage = isCustom ? customPage : page;
    const setCurrentPage = isCustom ? setCustomPage : setPage;
    const totalPages = Math.ceil(entries.length / PAGE_SIZE);
    const paged = entries.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    return (
      <div className="space-y-4">
        {/* ── Header ── */}
        <div className="rounded-xl bg-gradient-to-r from-slate-800 to-slate-700 text-white p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-yellow-400/20 border border-yellow-400/30 flex items-center justify-center flex-shrink-0">
                <Trophy className="w-6 h-6 text-yellow-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Ranking {isCustom ? "Personalizado" : "Mensual"}</h2>
                <p className="text-sm text-slate-300">
                  {participating.length} en competencia
                  {excluded.length > 0 && ` · ${excluded.length} excluido${excluded.length !== 1 ? "s" : ""}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {avgScore !== null && (
                <div className="text-center">
                  <p className="text-2xl font-black text-white tabular-nums">{avgScore}</p>
                  <p className="text-xs text-slate-400">Promedio</p>
                </div>
              )}
              {topScore !== null && (
                <div className="text-center">
                  <p className="text-2xl font-black text-yellow-400 tabular-nums">{topScore}</p>
                  <p className="text-xs text-slate-400">Líder</p>
                </div>
              )}
              {!isCustom && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsManageMode(!isManageMode)}
                    className={`border-slate-500 hover:bg-slate-600 hover:text-white ${isManageMode ? "bg-slate-600 text-white" : "text-slate-300"}`}
                  >
                    <Settings className="w-4 h-4 mr-1" />
                    {isManageMode ? "Listo" : "Gestionar"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadAdjustments}
                    className="border-slate-500 text-slate-300 hover:bg-slate-600 hover:text-white"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          {isManageMode && !isCustom && (
            <div className="mt-3 pt-3 border-t border-slate-600 text-xs text-slate-300">
              💡 Usa los botones <strong>"Excluir"</strong> para quitar limpiadores del ranking sin borrar sus datos. Los excluidos se muestran al final y no compiten por el premio.
            </div>
          )}
        </div>

        {/* ── Ranking List ── */}
        {entries.length === 0 ? (
          <Card>
            <CardContent className="py-14 text-center">
              <Trophy className="w-14 h-14 mx-auto mb-4 text-slate-300" />
              <p className="text-slate-500">No hay datos para mostrar</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2.5">
            {paged.map(entry => (
              <CleanerRow
                key={entry.cleaner.id}
                entry={entry}
                rank={entry.rank}
                adjustments={isCustom ? customAdjustments : adjustments}
                onViewHistory={onViewHistory}
                monthlyScores={monthlyScores}
                onToggleParticipation={handleToggleParticipation}
                isManageMode={!isCustom && isManageMode}
                componentScores={componentScores}
              />
            ))}

            <SimplePagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              totalItems={entries.length}
              pageSize={PAGE_SIZE}
            />
          </div>
        )}

        {/* ── Legend ── */}
        <div className="flex flex-wrap gap-3 pt-1">
          {[
            { range: "95–100", label: "Excelente",  cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
            { range: "85–94",  label: "Muy bueno",  cls: "bg-blue-100 text-blue-700 border-blue-200" },
            { range: "70–84",  label: "Regular",    cls: "bg-amber-100 text-amber-700 border-amber-200" },
            { range: "0–69",   label: "Bajo",       cls: "bg-red-100 text-red-700 border-red-200" },
          ].map(l => (
            <div key={l.range} className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${l.cls}`}>
              <BarChart3 className="w-3 h-3" />
              <span className="font-medium">{l.range}</span>
              <span className="opacity-70">{l.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const computeCustomRanking = useMemo(() => {
    const cleanerAdjustments = {};
    customAdjustments.forEach(adj => {
      if (!cleanerAdjustments[adj.cleaner_id]) {
        cleanerAdjustments[adj.cleaner_id] = 0;
      }
      cleanerAdjustments[adj.cleaner_id] += adj.points_impact || 0;
    });

    const entries = limpiadores.map(cleaner => {
      const score = 100 + (cleanerAdjustments[cleaner.id] || 0);
      return { cleaner, score, isParticipating: true };
    });

    const sorted = entries.sort((a, b) => b.score - a.score)
      .map((e, i) => ({ ...e, rank: i + 1 }));

    return sorted;
  }, [customAdjustments, limpiadores]);

  if (loading && tab === "monthly") {
    return (
      <div className="text-center py-16">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3" />
        <p className="text-sm text-slate-500">Cargando ranking...</p>
      </div>
    );
  }

  return (
    <Tabs value={tab} onValueChange={setTab} className="w-full">
      <TabsList className="grid w-full grid-cols-2 mb-4">
        <TabsTrigger value="monthly">Ranking Mensual</TabsTrigger>
        <TabsTrigger value="custom">Ranking por Fechas</TabsTrigger>
      </TabsList>

      <TabsContent value="monthly" className="space-y-4">
        {renderRankingContent(allEntries, false)}
      </TabsContent>

      <TabsContent value="custom" className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs mb-1.5 block">Desde</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Hasta</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="flex items-end">
              <Button onClick={loadCustomRanking} disabled={customLoading} className="w-full h-8 text-xs">
                {customLoading ? "Cargando..." : "Generar Ranking"}
              </Button>
            </div>
          </div>
        </div>

        {customAdjustments.length > 0 && renderRankingContent(computeCustomRanking, true)}
        {customAdjustments.length === 0 && dateFrom && dateTo && (
          <Card>
            <CardContent className="py-14 text-center">
              <Trophy className="w-14 h-14 mx-auto mb-4 text-slate-300" />
              <p className="text-slate-500">No hay ajustes en este rango de fechas</p>
            </CardContent>
          </Card>
        )}
      </TabsContent>
    </Tabs>
  );
}