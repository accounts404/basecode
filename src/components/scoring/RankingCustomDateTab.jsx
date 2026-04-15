import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Crown, Medal, Award, Trophy, User, ChevronDown, ChevronUp,
  RefreshCw, TrendingDown, TrendingUp, Minus, Eye, BarChart3,
  Calendar
} from "lucide-react";
import SimplePagination from "@/components/ui/simple-pagination";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

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

function CleanerRowCustom({ entry, rank }) {
  const { cleaner, score } = entry;
  const col = scoreColor(score);

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
              <p className="font-semibold truncate text-slate-800">
                {cleaner.invoice_name || cleaner.full_name}
              </p>
            </div>
            <div className="flex items-center gap-2 mt-1.5 mb-2">
              <ScoreBar score={score} />
            </div>
            <div className="flex items-center gap-3 text-xs flex-wrap">
              <span className="text-slate-400">Promedio: {score.toFixed(1)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="text-right">
              <p className={`text-3xl font-black tabular-nums ${col.text}`}>{Math.round(score)}</p>
              <p className="text-xs text-slate-400 -mt-0.5">/ 100</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Component ────────────────────────────────── */
export default function RankingCustomDateTab({ limpiadores, onViewHistory }) {
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [monthlyScores, setMonthlyScores] = useState([]);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const handleLoadRanking = async () => {
    if (!dateFrom || !dateTo) {
      alert("Por favor selecciona ambas fechas");
      return;
    }

    setLoading(true);
    try {
      const allScores = await base44.entities.MonthlyCleanerScore.list();
      
      // Filter scores by date range
      const filtered = allScores.filter(score => {
        const month = score.month_period; // YYYY-MM format
        return month >= dateFrom.substring(0, 7) && month <= dateTo.substring(0, 7);
      });

      setMonthlyScores(filtered);
      setPage(1);
    } catch (e) {
      console.error(e);
      alert("Error al cargar el ranking");
    }
    setLoading(false);
  };

  // Calculate average scores per cleaner for date range
  const rankedCleaners = useMemo(() => {
    if (monthlyScores.length === 0) return [];

    const scoresByCleanerId = {};
    
    monthlyScores.forEach(score => {
      if (!scoresByCleanerId[score.cleaner_id]) {
        scoresByCleanerId[score.cleaner_id] = { scores: [], cleaner: null };
      }
      scoresByCleanerId[score.cleaner_id].scores.push(score.current_score || 100);
    });

    const entries = Object.entries(scoresByCleanerId)
      .map(([cleanerId, data]) => {
        const cleaner = limpiadores.find(l => l.id === cleanerId);
        const avgScore = data.scores.length > 0 
          ? data.scores.reduce((a, b) => a + b) / data.scores.length 
          : 100;
        return { cleaner, score: avgScore, count: data.scores.length };
      })
      .filter(e => e.cleaner)
      .sort((a, b) => b.score - a.score)
      .map((e, i) => ({ ...e, rank: i + 1 }));

    return entries;
  }, [monthlyScores, limpiadores]);

  const avgScore = rankedCleaners.length > 0
    ? Math.round(rankedCleaners.reduce((s, e) => s + e.score, 0) / rankedCleaners.length)
    : null;
  const topScore = rankedCleaners.length > 0 ? Math.round(rankedCleaners[0].score) : null;

  const totalPages = Math.ceil(rankedCleaners.length / PAGE_SIZE);
  const paged = rankedCleaners.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* ── Filters ── */}
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-5">
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div>
            <Label className="text-xs mb-1 block">Desde</Label>
            <Input 
              type="date" 
              value={dateFrom} 
              onChange={e => setDateFrom(e.target.value)} 
              className="h-9 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs mb-1 block">Hasta</Label>
            <Input 
              type="date" 
              value={dateTo} 
              onChange={e => setDateTo(e.target.value)} 
              className="h-9 text-sm"
            />
          </div>
          <Button 
            onClick={handleLoadRanking}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {loading ? "Cargando..." : "Generar Ranking"}
          </Button>
        </div>
      </div>

      {/* ── Header ── */}
      {monthlyScores.length > 0 && (
        <div className="rounded-xl bg-gradient-to-r from-blue-800 to-blue-700 text-white p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-blue-400/20 border border-blue-400/30 flex items-center justify-center flex-shrink-0">
                <Calendar className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Ranking Personalizado</h2>
                <p className="text-sm text-blue-200">
                  {rankedCleaners.length} limpiadores · {monthlyScores.length} período{monthlyScores.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {avgScore !== null && (
                <div className="text-center">
                  <p className="text-2xl font-black text-white tabular-nums">{avgScore}</p>
                  <p className="text-xs text-blue-200">Promedio</p>
                </div>
              )}
              {topScore !== null && (
                <div className="text-center">
                  <p className="text-2xl font-black text-blue-300 tabular-nums">{topScore}</p>
                  <p className="text-xs text-blue-200">Máximo</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Ranking List ── */}
      {monthlyScores.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <Calendar className="w-14 h-14 mx-auto mb-4 text-slate-300" />
            <p className="text-slate-500">Selecciona un rango de fechas para generar el ranking</p>
          </CardContent>
        </Card>
      ) : rankedCleaners.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <Trophy className="w-14 h-14 mx-auto mb-4 text-slate-300" />
            <p className="text-slate-500">No hay datos para el período seleccionado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {paged.map(entry => (
            <CleanerRowCustom
              key={entry.cleaner.id}
              entry={entry}
              rank={entry.rank}
            />
          ))}

          <SimplePagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
            totalItems={rankedCleaners.length}
            pageSize={PAGE_SIZE}
          />
        </div>
      )}

      {/* ── Legend ── */}
      {monthlyScores.length > 0 && (
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
      )}
    </div>
  );
}