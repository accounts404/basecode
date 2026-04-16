import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Trophy, Crown, Medal, Award, TrendingUp, TrendingDown, 
  Car, Star, Clock, MessageSquare, ChevronDown, ChevronUp,
  Loader2, Info, CheckCircle, AlertCircle, BarChart3, 
  ClipboardList, User
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

// ── helpers ──────────────────────────────────────────────
function scoreColor(s, max = 118) {
  const pct = (s / max) * 100;
  if (pct >= 95) return { text: "text-emerald-700", bg: "bg-emerald-500", light: "bg-emerald-50 border-emerald-200", badge: "bg-emerald-100 text-emerald-800" };
  if (pct >= 85) return { text: "text-blue-700", bg: "bg-blue-500", light: "bg-blue-50 border-blue-200", badge: "bg-blue-100 text-blue-800" };
  if (pct >= 70) return { text: "text-amber-700", bg: "bg-amber-500", light: "bg-amber-50 border-amber-200", badge: "bg-amber-100 text-amber-800" };
  return { text: "text-red-700", bg: "bg-red-400", light: "bg-red-50 border-red-200", badge: "bg-red-100 text-red-800" };
}

function RankIcon({ rank }) {
  if (rank === 1) return <Crown className="w-8 h-8 text-yellow-500" />;
  if (rank === 2) return <Medal className="w-8 h-8 text-slate-400" />;
  if (rank === 3) return <Award className="w-8 h-8 text-amber-600" />;
  return <div className="w-8 h-8 flex items-center justify-center bg-slate-200 rounded-full text-base font-bold text-slate-600">#{rank}</div>;
}

function ScoreBar({ value, max, colorClass }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-700 ${colorClass}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Performance Reviews ───────────────────────────────────
function PerformanceSection({ userId, monthPeriod }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await base44.entities.PerformanceReview.filter({
          cleaner_id: userId,
          month_period: monthPeriod,
        });
        setReviews(data.sort((a, b) => new Date(b.review_date) - new Date(a.review_date)));
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, [userId, monthPeriod]);

  const avg = reviews.length > 0
    ? reviews.reduce((s, r) => s + (r.overall_score || 0), 0) / reviews.length
    : null;

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;

  if (reviews.length === 0) {
    return (
      <div className="text-center py-10 text-slate-400">
        <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No hay evaluaciones de performance este mes.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Promedio general */}
      <div className={`rounded-xl border p-4 ${avg >= 90 ? "bg-green-50 border-green-200" : avg >= 75 ? "bg-blue-50 border-blue-200" : "bg-amber-50 border-amber-200"}`}>
        <div className="flex items-center justify-between mb-2">
          <p className="font-semibold text-slate-700">Promedio del mes</p>
          <span className={`text-2xl font-black ${avg >= 90 ? "text-green-700" : avg >= 75 ? "text-blue-700" : "text-amber-700"}`}>
            {avg % 1 === 0 ? avg : avg.toFixed(2)}<span className="text-base font-normal text-slate-400">/100</span>
          </span>
        </div>
        <ScoreBar value={avg} max={100} colorClass={avg >= 90 ? "bg-green-500" : avg >= 75 ? "bg-blue-500" : "bg-amber-500"} />
        <p className="text-xs text-slate-500 mt-2">{reviews.length} evaluación(es) realizadas este mes</p>
      </div>

      {/* Detalle por evaluación */}
      <div className="space-y-2">
        {reviews.map((r) => {
          const isExp = expanded === r.id;
          const score = r.overall_score || 0;
          const scoreClass = score >= 90 ? "text-green-700 bg-green-50" : score >= 75 ? "text-blue-700 bg-blue-50" : "text-amber-700 bg-amber-50";

          return (
            <div key={r.id} className="border border-slate-200 rounded-xl overflow-hidden">
              <button
                className="w-full text-left p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                onClick={() => setExpanded(isExp ? null : r.id)}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center ${scoreClass} border`}>
                    <span className="text-lg font-black leading-none">{score % 1 === 0 ? score : score.toFixed(1)}</span>
                    <span className="text-xs opacity-70">/100</span>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">
                      {format(parseISO(r.review_date), "d 'de' MMMM yyyy", { locale: es })}
                    </p>
                    {r.client_name && <p className="text-xs text-slate-500">🏠 {r.client_name}</p>}
                    {r.reviewed_by_admin_name && <p className="text-xs text-slate-400">Evaluado por: {r.reviewed_by_admin_name}</p>}
                  </div>
                </div>
                {isExp ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>

              {isExp && (
                <div className="px-4 pb-4 border-t border-slate-100 bg-slate-50 space-y-3 pt-3">
                  {/* Áreas */}
                  {(r.area_scores || []).filter(a => a.included).map(area => {
                    const areaPct = area.max_points > 0 ? (area.score / area.max_points) * 100 : 100;
                    return (
                      <div key={area.area_key} className="bg-white rounded-lg p-3 border border-slate-200">
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-sm font-medium text-slate-700">{area.area_name}</span>
                          <span className="text-xs font-bold text-slate-600">{area.score}/{area.max_points} pts</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${areaPct === 100 ? "bg-green-400" : areaPct >= 70 ? "bg-amber-400" : "bg-red-400"}`}
                            style={{ width: `${areaPct}%` }}
                          />
                        </div>
                        {/* Items fallidos */}
                        {area.checklist && area.config_items && (
                          <div className="mt-2 space-y-0.5">
                            {area.config_items.filter(item => area.checklist[item.key] === false).map(item => (
                              <p key={item.key} className="text-xs text-red-600 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3 shrink-0" /> {item.label}
                              </p>
                            ))}
                          </div>
                        )}
                        {area.notes && <p className="text-xs text-slate-400 italic mt-1.5">💬 {area.notes}</p>}
                      </div>
                    );
                  })}
                  {r.general_notes && (
                    <p className="text-xs text-slate-500 italic bg-white rounded-lg p-2 border border-slate-200">📝 {r.general_notes}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Vehicle Checklists ────────────────────────────────────
function VehicleSection({ userId, monthPeriod }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const all = await base44.entities.VehicleChecklistRecord.filter({ month_period: monthPeriod });
        const mine = all.filter(r => (r.team_member_ids || []).includes(userId));
        setRecords(mine.sort((a, b) => b.date.localeCompare(a.date)));
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, [userId, monthPeriod]);

  const TOTAL_POSSIBLE = 18;
  const avgEarned = records.length > 0
    ? records.reduce((s, r) => {
        const earned = (r.checklist_items || []).reduce((ss, i) => i.passed ? ss + (i.points || i.points_if_fail || 0) : ss, 0);
        return s + earned;
      }, 0) / records.length
    : null;

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;

  if (records.length === 0) {
    return (
      <div className="text-center py-10 text-slate-400">
        <Car className="w-10 h-10 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No hay revisiones de vehículo este mes.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Promedio del mes */}
      {avgEarned !== null && (
        <div className={`rounded-xl border p-4 ${avgEarned >= 16 ? "bg-green-50 border-green-200" : avgEarned >= 14 ? "bg-blue-50 border-blue-200" : "bg-amber-50 border-amber-200"}`}>
          <div className="flex items-center justify-between mb-2">
            <p className="font-semibold text-slate-700">Promedio vehículo del mes</p>
            <span className={`text-2xl font-black ${avgEarned >= 16 ? "text-green-700" : avgEarned >= 14 ? "text-blue-700" : "text-amber-700"}`}>
              {avgEarned % 1 === 0 ? avgEarned : avgEarned.toFixed(2)}<span className="text-base font-normal text-slate-400">/{TOTAL_POSSIBLE}</span>
            </span>
          </div>
          <ScoreBar value={avgEarned} max={TOTAL_POSSIBLE} colorClass={avgEarned >= 16 ? "bg-green-500" : avgEarned >= 14 ? "bg-blue-500" : "bg-amber-500"} />
          <p className="text-xs text-slate-500 mt-2">{records.length} revisión(es) este mes</p>
        </div>
      )}

      {/* Detalle por revisión */}
      <div className="space-y-2">
        {records.map(r => {
          const isExp = expanded === r.id;
          const earned = (r.checklist_items || []).reduce((s, i) => i.passed ? s + (i.points || i.points_if_fail || 0) : s, 0);
          const failedItems = (r.checklist_items || []).filter(i => !i.passed);
          const allOk = failedItems.length === 0;

          return (
            <div key={r.id} className="border border-slate-200 rounded-xl overflow-hidden">
              <button
                className="w-full text-left p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                onClick={() => setExpanded(isExp ? null : r.id)}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center border ${allOk ? "bg-green-50 text-green-700 border-green-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                    <span className="text-lg font-black leading-none">{earned}</span>
                    <span className="text-xs opacity-70">/{TOTAL_POSSIBLE}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">
                      {format(parseISO(r.date), "d 'de' MMMM yyyy", { locale: es })}
                    </p>
                    <p className="text-xs text-slate-500">{r.vehicle_info || "Vehículo no especificado"}</p>
                    {allOk ? (
                      <p className="text-xs text-green-600 flex items-center gap-1 mt-0.5"><CheckCircle className="w-3 h-3" /> Todo OK</p>
                    ) : (
                      <p className="text-xs text-amber-600 mt-0.5">{failedItems.length} item(s) con observación</p>
                    )}
                  </div>
                </div>
                {isExp ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>

              {isExp && failedItems.length > 0 && (
                <div className="px-4 pb-4 border-t border-slate-100 bg-slate-50 pt-3 space-y-2">
                  <p className="text-xs font-bold text-red-700 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Items con observación:
                  </p>
                  {failedItems.map((item, idx) => (
                    <div key={idx} className="bg-white rounded-lg p-3 border border-red-100">
                      <div className="flex justify-between items-start">
                        <p className="text-sm font-medium text-slate-800">{item.item}</p>
                        <Badge className="bg-red-100 text-red-800 text-xs ml-2 shrink-0">-{item.points || item.points_if_fail} pts</Badge>
                      </div>
                      {item.notes && <p className="text-xs text-slate-500 italic mt-1">💬 {item.notes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Score Adjustments (Puntualidad + Feedback + otros) ────
function AdjustmentsSection({ userId, monthPeriod }) {
  const [adjustments, setAdjustments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await base44.entities.ScoreAdjustment.filter({
          cleaner_id: userId,
          month_period: monthPeriod,
        });
        setAdjustments(data.sort((a, b) => new Date(b.date_applied || b.created_date) - new Date(a.date_applied || a.created_date)));
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, [userId, monthPeriod]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;

  if (adjustments.length === 0) {
    return (
      <div className="text-center py-10 text-slate-400">
        <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No hay ajustes registrados este mes.</p>
        <p className="text-xs mt-1">¡Tu puntaje base se mantiene sin cambios!</p>
      </div>
    );
  }

  const bonusTotal = adjustments.filter(a => a.adjustment_type === "bonus").reduce((s, a) => s + Math.abs(a.points_impact || 0), 0);
  const deductionTotal = adjustments.filter(a => a.adjustment_type === "deduction").reduce((s, a) => s + Math.abs(a.points_impact || 0), 0);

  const grouped = adjustments.reduce((acc, adj) => {
    const cat = adj.category || "Otros";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(adj);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
          <p className="text-xs text-emerald-600 font-medium mb-0.5">Bonificaciones</p>
          <p className="text-2xl font-black text-emerald-700">+{bonusTotal}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
          <p className="text-xs text-red-600 font-medium mb-0.5">Deducciones</p>
          <p className="text-2xl font-black text-red-700">-{deductionTotal}</p>
        </div>
      </div>

      {/* Por categoría */}
      <div className="space-y-3">
        {Object.entries(grouped).map(([category, adjs]) => {
          const catTotal = adjs.reduce((s, a) => s + (a.points_impact || 0), 0);
          const isBonus = catTotal >= 0;
          return (
            <div key={category} className={`rounded-xl border overflow-hidden ${isBonus ? "border-emerald-200" : "border-red-200"}`}>
              <div className={`px-4 py-2.5 flex items-center justify-between ${isBonus ? "bg-emerald-50" : "bg-red-50"}`}>
                <p className={`font-semibold text-sm ${isBonus ? "text-emerald-800" : "text-red-800"}`}>{category}</p>
                <span className={`font-bold text-sm ${isBonus ? "text-emerald-700" : "text-red-700"}`}>
                  {catTotal >= 0 ? "+" : ""}{catTotal}
                </span>
              </div>
              <div className="bg-white divide-y divide-slate-100">
                {adjs.map(adj => (
                  <div key={adj.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {adj.notes && <p className="text-sm text-slate-700">{adj.notes}</p>}
                        <p className="text-xs text-slate-400 mt-0.5">
                          {adj.date_applied ? format(parseISO(adj.date_applied), "d MMM yyyy", { locale: es }) : ""}
                          {adj.admin_name ? ` · ${adj.admin_name}` : ""}
                        </p>
                      </div>
                      <div className={`flex items-center gap-1 shrink-0 ${adj.adjustment_type === "bonus" ? "text-emerald-600" : "text-red-600"}`}>
                        {adj.adjustment_type === "bonus" ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                        <span className="font-bold text-sm">{adj.points_impact >= 0 ? "+" : ""}{adj.points_impact}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Mi Posición (solo muestra puesto, sin puntajes de otros) ──
function MyRankingSection({ userId, monthPeriod, myTotalScore }) {
  const [rank, setRank] = useState(null);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const allScores = await base44.entities.MonthlyCleanerScore.filter({ month_period: monthPeriod, is_participating: true });
        // Solo necesitamos saber cuántos hay y cuál es el puesto basado en current_score
        const sorted = [...allScores].sort((a, b) => b.current_score - a.current_score);
        const myRank = sorted.findIndex(s => s.cleaner_id === userId) + 1;
        setRank(myRank > 0 ? myRank : null);
        setTotal(allScores.length);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, [userId, monthPeriod]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;

  const rankLabel = rank === 1 ? "¡Primer lugar! 🏆" : rank === 2 ? "¡Segundo lugar! 🥈" : rank === 3 ? "¡Tercer lugar! 🥉" : null;

  return (
    <div className="space-y-4">
      {/* Puesto */}
      <div className={`rounded-2xl border-2 p-6 text-center ${
        rank === 1 ? "bg-yellow-50 border-yellow-300" :
        rank === 2 ? "bg-slate-50 border-slate-300" :
        rank === 3 ? "bg-orange-50 border-orange-300" :
        "bg-blue-50 border-blue-200"
      }`}>
        <div className="flex justify-center mb-3">
          <RankIcon rank={rank} />
        </div>
        <p className="text-5xl font-black text-slate-800 mb-1">#{rank}</p>
        <p className="text-sm text-slate-500">de {total} participantes</p>
        {rankLabel && <p className="text-base font-bold text-slate-700 mt-2">{rankLabel}</p>}
      </div>

      {/* Puntaje propio */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 text-center">
        <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Tu puntaje</p>
        <p className="text-5xl font-black text-slate-800 tabular-nums">{Math.round(myTotalScore)}</p>
        <p className="text-sm text-slate-400 mt-1">de 118 puntos posibles</p>
        <div className="mt-3 h-3 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              myTotalScore >= 112 ? "bg-emerald-500" :
              myTotalScore >= 100 ? "bg-blue-500" :
              myTotalScore >= 82 ? "bg-amber-500" : "bg-red-400"
            }`}
            style={{ width: `${Math.max(0, Math.min(100, (myTotalScore / 118) * 100))}%` }}
          />
        </div>
      </div>


    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────
export default function MiPuntuacionPage() {
  const [user, setUser] = useState(null);
  const [monthPeriod] = useState(format(new Date(), "yyyy-MM"));
  const [monthlyScore, setMonthlyScore] = useState(null);
  const [allScores, setAllScores] = useState([]);
  const [adjs, setAdjs] = useState([]);
  const [perfReviews, setPerfReviews] = useState([]);
  const [vehicleRecs, setVehicleRecs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const me = await base44.auth.me();
        setUser(me);

        const [scores, adjustments, perf, veh] = await Promise.all([
          base44.entities.MonthlyCleanerScore.filter({ month_period: monthPeriod, is_participating: true }),
          base44.entities.ScoreAdjustment.filter({ cleaner_id: me.id, month_period: monthPeriod }),
          base44.entities.PerformanceReview.filter({ cleaner_id: me.id, month_period: monthPeriod }),
          base44.entities.VehicleChecklistRecord.filter({ month_period: monthPeriod }),
        ]);

        const myScore = scores.find(s => s.cleaner_id === me.id) || null;
        setMonthlyScore(myScore);
        setAllScores(scores);
        setAdjs(adjustments);
        setPerfReviews(perf);
        setVehicleRecs(veh.filter(r => (r.team_member_ids || []).includes(me.id)));
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, [monthPeriod]);

  // ── Cálculo del score total ──────────────────────────────
  const scoreData = useMemo(() => {
    if (!user || !monthlyScore) return null;

    const perfAvg = perfReviews.length > 0
      ? perfReviews.reduce((s, r) => s + (r.overall_score || 100), 0) / perfReviews.length
      : 100;

    const TOTAL_POSSIBLE = 18;
    const vehAvg = vehicleRecs.length > 0
      ? vehicleRecs.reduce((s, r) => {
          const earned = (r.checklist_items || []).reduce((ss, i) => i.passed ? ss + (i.points || i.points_if_fail || 0) : ss, 0);
          return s + earned;
        }, 0) / vehicleRecs.length
      : TOTAL_POSSIBLE;

    const vehicleAdj = adjs.find(a => a.category === "Revisión Vehicular (Promedio Mensual)")?.points_impact || 0;
    const relevantAdjs = adjs.filter(a =>
      a.category !== "Revisión Vehicular (Promedio Mensual)" &&
      a.category !== "Evaluación de Performance"
    );
    const adjScore = relevantAdjs.reduce((s, a) => s + (a.points_impact || 0), 0);

    const totalScore = perfAvg + vehAvg + vehicleAdj + adjScore;

    // Rank
    const vehicleAdjMap = {};
    const perfMap = {};
    const allAdjsMap = {};
    // We'll use the simple approach: compare against allScores current_score
    const ranked = [...allScores].sort((a, b) => b.current_score - a.current_score);
    const myRank = ranked.findIndex(s => s.cleaner_id === user.id) + 1;

    return {
      perfAvg,
      vehAvg: vehAvg + vehicleAdj,
      adjScore,
      totalScore,
      rank: myRank > 0 ? myRank : null,
      total: allScores.length,
    };
  }, [user, monthlyScore, perfReviews, vehicleRecs, adjs, allScores]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!monthlyScore) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 flex items-center justify-center">
        <div className="max-w-sm w-full text-center">
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Info className="w-10 h-10 text-slate-400" />
          </div>
          <h2 className="text-xl font-bold text-slate-700 mb-2">No participas este mes</h2>
          <p className="text-slate-500 text-sm">
            No estás incluido en el ranking de puntuación de{" "}
            <strong>{format(new Date(monthPeriod + "-02"), "MMMM yyyy", { locale: es })}</strong>.
          </p>
          <p className="text-slate-400 text-xs mt-3">Contacta al administrador para más información.</p>
        </div>
      </div>
    );
  }

  const monthLabel = format(new Date(monthPeriod + "-02"), "MMMM yyyy", { locale: es });
  const totalScore = Math.round(scoreData?.totalScore ?? 0);
  const col = scoreColor(totalScore, 118);

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* ── Hero Header ── */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 text-white px-4 pt-6 pb-8">
        <p className="text-xs text-slate-400 uppercase tracking-widest mb-1 capitalize">{monthLabel}</p>
        <h1 className="text-2xl font-black mb-4 flex items-center gap-2">
          <Trophy className="w-6 h-6 text-yellow-400" /> Mi Puntuación
        </h1>

        {/* Score + Rank pills */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="bg-white/10 rounded-2xl p-4 text-center">
            <p className="text-xs text-slate-300 mb-1">Puntaje total</p>
            <p className={`text-5xl font-black tabular-nums ${col.text}`} style={{ color: "white" }}>{totalScore}</p>
            <p className="text-xs text-slate-400 mt-0.5">/ 118 pts</p>
          </div>
          <div className="bg-white/10 rounded-2xl p-4 text-center flex flex-col items-center justify-center">
            <p className="text-xs text-slate-300 mb-2">Tu posición</p>
            {scoreData?.rank ? (
              <>
                <RankIcon rank={scoreData.rank} />
                <p className="text-xs text-slate-400 mt-1.5">de {scoreData.total} participantes</p>
              </>
            ) : (
              <p className="text-slate-400 text-sm">Sin ranking</p>
            )}
          </div>
        </div>

        {/* Breakdown pills */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white/10 rounded-xl p-2.5 text-center">
            <p className="text-xs text-slate-400 mb-0.5">Performance</p>
            <p className="text-base font-bold">
              {scoreData?.perfAvg % 1 === 0 ? scoreData?.perfAvg : scoreData?.perfAvg?.toFixed(1) ?? "—"}
              <span className="text-xs font-normal text-slate-400">/100</span>
            </p>
          </div>
          <div className="bg-white/10 rounded-xl p-2.5 text-center">
            <p className="text-xs text-slate-400 mb-0.5">Vehículo</p>
            <p className="text-base font-bold">
              {scoreData?.vehAvg % 1 === 0 ? scoreData?.vehAvg : scoreData?.vehAvg?.toFixed(1) ?? "—"}
              <span className="text-xs font-normal text-slate-400">/18</span>
            </p>
          </div>
          <div className="bg-white/10 rounded-xl p-2.5 text-center">
            <p className="text-xs text-slate-400 mb-0.5">Ajustes</p>
            <p className={`text-base font-bold ${scoreData?.adjScore >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {scoreData?.adjScore >= 0 ? "+" : ""}{scoreData?.adjScore ?? 0}
            </p>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="px-4 -mt-3">
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid grid-cols-4 w-full rounded-none h-auto p-1 bg-slate-100 gap-1">
              <TabsTrigger value="overview" className="flex flex-col items-center gap-0.5 py-2 text-xs rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <Trophy className="w-4 h-4" />
                <span>Ranking</span>
              </TabsTrigger>
              <TabsTrigger value="performance" className="flex flex-col items-center gap-0.5 py-2 text-xs rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <Star className="w-4 h-4" />
                <span>Calidad</span>
              </TabsTrigger>
              <TabsTrigger value="vehicle" className="flex flex-col items-center gap-0.5 py-2 text-xs rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <Car className="w-4 h-4" />
                <span>Vehículo</span>
              </TabsTrigger>
              <TabsTrigger value="adjustments" className="flex flex-col items-center gap-0.5 py-2 text-xs rounded-xl data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <BarChart3 className="w-4 h-4" />
                <span>Ajustes</span>
              </TabsTrigger>
            </TabsList>

            <div className="p-4">
              <TabsContent value="overview" className="mt-0">
                <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-yellow-500" /> Mi posición — {monthLabel}
                </h3>
                <MyRankingSection userId={user?.id} monthPeriod={monthPeriod} myTotalScore={scoreData?.totalScore ?? 0} />
              </TabsContent>

              <TabsContent value="performance" className="mt-0">
                <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
                  <Star className="w-4 h-4 text-blue-500" /> Evaluaciones de limpieza
                </h3>
                <PerformanceSection userId={user?.id} monthPeriod={monthPeriod} />
              </TabsContent>

              <TabsContent value="vehicle" className="mt-0">
                <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
                  <Car className="w-4 h-4 text-slate-600" /> Revisiones de vehículo
                </h3>
                <VehicleSection userId={user?.id} monthPeriod={monthPeriod} />
              </TabsContent>

              <TabsContent value="adjustments" className="mt-0">
                <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-purple-500" /> Bonificaciones y Deducciones
                </h3>
                <AdjustmentsSection userId={user?.id} monthPeriod={monthPeriod} />
              </TabsContent>
            </div>
          </Tabs>
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-2 justify-center">
          {[
            { range: "112–118", label: "Excelente", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
            { range: "100–111", label: "Muy bueno", cls: "bg-blue-100 text-blue-700 border-blue-200" },
            { range: "82–99", label: "Regular", cls: "bg-amber-100 text-amber-700 border-amber-200" },
            { range: "0–81", label: "Bajo", cls: "bg-red-100 text-red-700 border-red-200" },
          ].map(l => (
            <div key={l.range} className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border ${l.cls}`}>
              <span className="font-medium">{l.range}</span>
              <span className="opacity-70">{l.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}