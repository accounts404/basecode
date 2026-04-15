import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Crown, Medal, Award, Trophy, User, ChevronDown, ChevronUp,
  RefreshCw, AlertCircle, TrendingDown, TrendingUp, Minus, Eye,
  UserCheck, UserX, Sparkles, BarChart3
} from "lucide-react";
import SimplePagination from "@/components/ui/simple-pagination";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

/* ─── helpers ─────────────────────────────────────────── */
function scoreColor(s) {
  if (s >= 95) return { text: "text-emerald-700", bg: "bg-emerald-500", light: "bg-emerald-50 border-emerald-200", badge: "bg-emerald-100 text-emerald-800" };
  if (s >= 85) return { text: "text-blue-700",    bg: "bg-blue-500",    light: "bg-blue-50 border-blue-200",       badge: "bg-blue-100 text-blue-800" };
  if (s >= 70) return { text: "text-amber-700",   bg: "bg-amber-500",   light: "bg-amber-50 border-amber-200",     badge: "bg-amber-100 text-amber-800" };
  return         { text: "text-red-700",           bg: "bg-red-400",     light: "bg-red-50 border-red-200",         badge: "bg-red-100 text-red-800" };
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

/* ─── Adjustment Detail Row ─────────────────────────── */
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

/* ─── Cleaner Row ───────────────────────────────────── */
function CleanerRow({ entry, adjustments, onViewHistory, monthlyScores }) {
  const [expanded, setExpanded] = useState(false);
  const { cleaner, score, rank, isParticipating } = entry;
  const col = scoreColor(score);

  const myAdj = adjustments
    .filter(a => a.cleaner_id === cleaner.id)
    .sort((a, b) => new Date(b.date_applied || b.created_date) - new Date(a.date_applied || a.created_date));

  const deductionTotal = myAdj.filter(a => a.adjustment_type === "deduction")
    .reduce((s, a) => s + Math.abs(a.points_impact || 0), 0);
  const bonusTotal = myAdj.filter(a => a.adjustment_type === "bonus")
    .reduce((s, a) => s + Math.abs(a.points_impact || 0), 0);

  const monthlyScore = monthlyScores?.find(s => s.cleaner_id === cleaner.id);

  const rowBg = rank === 1 ? "bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-200"
              : rank === 2 ? "bg-gradient-to-r from-slate-50 to-gray-50 border-slate-200"
              : rank === 3 ? "bg-gradient-to-r from-orange-50 to-amber-50 border-orange-200"
              : "bg-white border-slate-200";

  return (
    <div className={`rounded-xl border transition-all ${rowBg} overflow-hidden`}>
      <div className="p-4">
        <div className="flex items-center gap-3">
          <RankBadge rank={rank} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <p className="font-semibold text-slate-800 truncate">{cleaner.invoice_name || cleaner.full_name}</p>
              {rank <= 3 && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-800 text-white">
                  #{rank}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 mt-1.5 mb-2">
              <ScoreBar score={score} />
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
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right">
              <p className={`text-3xl font-black tabular-nums ${col.text}`}>{Math.round(score)}</p>
              <p className="text-xs text-slate-400 -mt-0.5">/ 100</p>
            </div>
            {monthlyScore && onViewHistory && (
              <Button variant="outline" size="sm" onClick={() => onViewHistory(monthlyScore)}
                      className="h-8 px-2 text-xs text-slate-500">
                <Eye className="w-3.5 h-3.5" />
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
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  /* cleaners WITH a MonthlyCleanerScore (is_participating) */
  const participating = useMemo(() => {
    return limpiadores
      .map(cleaner => {
        const ms = monthlyScores.find(s => s.cleaner_id === cleaner.id && s.is_participating !== false);
        if (!ms) return null;
        return { cleaner, score: ms.current_score ?? 100, isParticipating: true };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .map((e, i) => ({ ...e, rank: i + 1 }));
  }, [limpiadores, monthlyScores]);

  /* cleaners WITHOUT a MonthlyCleanerScore */
  const notRegistered = useMemo(() => {
    const participatingIds = new Set(participating.map(e => e.cleaner.id));
    return limpiadores.filter(c => !participatingIds.has(c.id));
  }, [limpiadores, participating]);

  const totalPages = Math.ceil(participating.length / PAGE_SIZE);
  const paged = participating.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  /* summary stats */
  const avgScore = participating.length > 0
    ? Math.round(participating.reduce((s, e) => s + e.score, 0) / participating.length)
    : null;
  const topScore = participating.length > 0 ? participating[0].score : null;

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3" />
        <p className="text-sm text-slate-500">Cargando ranking...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Header Card ── */}
      <Card className="border-0 shadow-sm bg-gradient-to-r from-slate-800 to-slate-700 text-white">
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-yellow-400/20 border border-yellow-400/30 flex items-center justify-center">
                <Trophy className="w-6 h-6 text-yellow-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Ranking Mensual</h2>
                <p className="text-sm text-slate-300">
                  {participating.length} participante{participating.length !== 1 ? "s" : ""} activos
                  {notRegistered.length > 0 && ` · ${notRegistered.length} sin activar`}
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
                  <p className="text-2xl font-black text-yellow-400 tabular-nums">{Math.round(topScore)}</p>
                  <p className="text-xs text-slate-400">Puntaje líder</p>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={loadAdjustments}
                className="border-slate-500 text-slate-300 hover:bg-slate-600 hover:text-white"
              >
                <RefreshCw className="w-4 h-4 mr-1" /> Actualizar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Ranking List ── */}
      {participating.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-200">
          <CardContent className="py-14 text-center">
            <Trophy className="w-14 h-14 mx-auto mb-4 text-slate-300" />
            <p className="text-lg font-semibold text-slate-500">No hay participantes activos este mes</p>
            <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">
              Para que un limpiador aparezca en el ranking, debe tener un registro de <strong>MonthlyCleanerScore</strong> con participación activa.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {paged.map(entry => (
            <CleanerRow
              key={entry.cleaner.id}
              entry={entry}
              adjustments={adjustments}
              onViewHistory={onViewHistory}
              monthlyScores={monthlyScores}
            />
          ))}

          <SimplePagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
            totalItems={participating.length}
            pageSize={PAGE_SIZE}
          />
        </div>
      )}

      {/* ── Not Registered Section ── */}
      {notRegistered.length > 0 && (
        <Card className="border border-amber-200 bg-amber-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-semibold text-amber-800">
                Limpiadores sin participación activa este mes ({notRegistered.length})
              </span>
            </div>
            <p className="text-xs text-amber-700 mb-3">
              Estos limpiadores no tienen un registro de puntuación mensual activo. Para incluirlos en el ranking,
              activa su participación desde la sección de <strong>Configuración del Ranking</strong>.
            </p>
            <div className="flex flex-wrap gap-2">
              {notRegistered.map(c => (
                <div key={c.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-200 rounded-full text-xs text-slate-600">
                  <User className="w-3 h-3 text-amber-500" />
                  {c.invoice_name || c.full_name}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Legend ── */}
      <div className="flex flex-wrap gap-3 pt-1">
        {[
          { range: "95–100", label: "Excelente", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
          { range: "85–94",  label: "Muy bueno", cls: "bg-blue-100 text-blue-700 border-blue-200" },
          { range: "70–84",  label: "Regular",   cls: "bg-amber-100 text-amber-700 border-amber-200" },
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
}