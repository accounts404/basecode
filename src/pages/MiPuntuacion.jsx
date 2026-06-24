import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Trophy, Crown, Medal, Award, TrendingUp, TrendingDown,
  Car, Star, MessageSquare, ChevronDown, ChevronUp,
  Loader2, Info, CheckCircle, AlertCircle, ThumbsUp, ThumbsDown,
  ClipboardList, Calendar, ChevronLeft, ChevronRight, Sparkles,
  Clock, Phone, User, MapPin, Image
} from "lucide-react";
import { format, parseISO, subMonths, addMonths } from "date-fns";
import { es } from "date-fns/locale";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// --- Helpers ---
function getScoreLevel(score, max = 118) {
  const pct = (score / max) * 100;
  if (pct >= 95) return { label: "Excelente", color: "emerald", gradient: "from-emerald-500 to-green-600", text: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200", bar: "bg-emerald-500" };
  if (pct >= 85) return { label: "Muy Bueno", color: "blue", gradient: "from-blue-500 to-blue-600", text: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200", bar: "bg-blue-500" };
  if (pct >= 70) return { label: "Regular", color: "amber", gradient: "from-amber-500 to-orange-500", text: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", bar: "bg-amber-500" };
  return { label: "Bajo", color: "red", gradient: "from-red-500 to-red-600", text: "text-red-600", bg: "bg-red-50", border: "border-red-200", bar: "bg-red-400" };
}

function getNextLevelInfo(score, max = 118) {
  const pct = (score / max) * 100;
  if (pct >= 95) return null;
  if (pct >= 85) return { pointsNeeded: Math.ceil((0.95 * max) - score), nextLevel: "Excelente" };
  if (pct >= 70) return { pointsNeeded: Math.ceil((0.85 * max) - score), nextLevel: "Muy Bueno" };
  return { pointsNeeded: Math.ceil((0.70 * max) - score), nextLevel: "Regular" };
}

function getPunctualityLabel(data) {
  if (data.absence) return "Ausencia sin aviso";
  if (!data.uniform_ok) return "Uniforme incompleto";
  if (!data.presentation_ok) return "Presentación personal";
  if (data.minutes_late > 0) return `Llegó ${data.minutes_late} min tarde`;
  return "Registro de puntualidad";
}

function ScoreRing({ score, max = 118 }) {
  const pct = Math.max(0, Math.min(100, (score / max) * 100));
  const level = getScoreLevel(score, max);
  const r = 52;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <div className="relative w-40 h-40 mx-auto">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="10" />
        <circle
          cx="60" cy="60" r={r} fill="none"
          stroke="white" strokeWidth="10"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 1s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-black text-white leading-none tabular-nums">{Math.round(score)}</span>
        <span className="text-xs text-white/70 mt-1">de {max} pts</span>
        <span className="text-xs font-bold text-white/90 mt-0.5 uppercase tracking-wider">{level.label}</span>
      </div>
    </div>
  );
}

function RankBadge({ rank, total }) {
  if (!rank) return null;
  if (rank === 1) return (
    <div className="flex items-center gap-1.5 bg-yellow-400/20 rounded-full px-3 py-1.5">
      <Crown className="w-4 h-4 text-yellow-300" />
      <span className="text-yellow-200 text-sm font-bold">1° lugar de {total}</span>
    </div>
  );
  if (rank === 2) return (
    <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1.5">
      <Medal className="w-4 h-4 text-slate-300" />
      <span className="text-white/80 text-sm font-bold">2° lugar de {total}</span>
    </div>
  );
  if (rank === 3) return (
    <div className="flex items-center gap-1.5 bg-orange-400/20 rounded-full px-3 py-1.5">
      <Award className="w-4 h-4 text-orange-300" />
      <span className="text-orange-200 text-sm font-bold">3° lugar de {total}</span>
    </div>
  );
  return (
    <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1.5">
      <Trophy className="w-4 h-4 text-white/60" />
      <span className="text-white/70 text-sm font-bold">#{rank} de {total}</span>
    </div>
  );
}

// --- Timeline de eventos unificada ---
function UnifiedTimeline({ userId, monthPeriod }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [adjs, perfs, vehs, feedbacks, puncts] = await Promise.all([
          base44.entities.ScoreAdjustment.filter({ cleaner_id: userId, month_period: monthPeriod }),
          base44.entities.PerformanceReview.filter({ cleaner_id: userId, month_period: monthPeriod }),
          base44.entities.VehicleChecklistRecord.filter({ month_period: monthPeriod }),
          base44.entities.ClientFeedback.filter({ month_period: monthPeriod }),
          base44.entities.PunctualityRecord.filter({ cleaner_id: userId, month_period: monthPeriod }),
        ]);

        const myVehs = vehs.filter(r => (r.team_member_ids || []).includes(userId));
        const myFeedbacks = feedbacks.filter(f => (f.affected_cleaner_ids || []).includes(userId));

        const timeline = [];

        // Performance reviews
        perfs.forEach(r => {
          timeline.push({ id: `perf-${r.id}`, type: "performance", date: r.review_date, score: r.overall_score, data: r });
        });

        // Vehicle checklists
        myVehs.forEach(r => {
          const TOTAL_POSSIBLE = 18;
          const earned = (r.checklist_items || []).reduce((s, i) => i.passed ? s + (i.points || i.points_if_fail || 0) : s, 0);
          const failedItems = (r.checklist_items || []).filter(i => !i.passed);
          timeline.push({ id: `veh-${r.id}`, type: "vehicle", date: r.date, score: earned, max: TOTAL_POSSIBLE, failedItems, data: r });
        });

        // Feedbacks de clientes
        myFeedbacks.forEach(f => {
          timeline.push({ id: `fb-${f.id}`, type: "feedback", date: f.feedback_date, feedbackType: f.feedback_type, points: f.points_impact, data: f });
        });

        // Registros de Puntualidad
        puncts.forEach(p => {
          timeline.push({ id: `punct-${p.id}`, type: "punctuality", date: p.date, points: p.points_impact, data: p });
        });

        // Ajustes manuales (excluir los auto-generados)
        const autoCategories = ["Revisión Vehicular (Promedio Mensual)", "Evaluación de Performance"];
        const manualAdjs = adjs.filter(a =>
          !autoCategories.includes(a.category) && !a.category?.includes("Feedback de Cliente")
        );
        manualAdjs.forEach(a => {
          timeline.push({ id: `adj-${a.id}`, type: "adjustment", date: a.date_applied || a.created_date, points: a.points_impact, category: a.category, notes: a.notes, adjType: a.adjustment_type, data: a });
        });

        timeline.sort((a, b) => new Date(b.date) - new Date(a.date));
        setItems(timeline);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, [userId, monthPeriod]);

  if (loading) return (
    <div className="flex justify-center py-12">
      <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
    </div>
  );

  if (items.length === 0) return (
    <div className="text-center py-12 text-slate-400">
      <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-30" />
      <p className="text-sm font-medium">No hay eventos registrados este mes</p>
      <p className="text-xs mt-1 opacity-70">Aquí aparecerán tus evaluaciones y feedback</p>
    </div>
  );

  const renderItem = (item) => {
    const isExp = expanded === item.id;
    const dateStr = (() => {
      try { return format(parseISO(item.date), "d 'de' MMMM", { locale: es }); }
      catch { return item.date; }
    })();

    // PUNTUALIDAD
    if (item.type === "punctuality") {
      const isNegative = (item.points || 0) < 0;
      const label = getPunctualityLabel(item.data);
      return (
        <div key={item.id} className="relative">
          <div className="absolute left-5 top-0 bottom-0 w-px bg-slate-100" />
          <div className="relative flex gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 z-10 border-2 ${isNegative ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
              <Clock className={`w-4 h-4 ${isNegative ? "text-red-600" : "text-green-600"}`} />
            </div>
            <div className="flex-1 pb-4">
              <div className={`bg-white rounded-2xl border shadow-sm p-3.5 ${isNegative ? "border-red-100" : "border-green-100"}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> {dateStr}
                  </span>
                  {item.points !== 0 && (
                    <span className={`text-sm font-black ${isNegative ? "text-red-600" : "text-green-600"}`}>
                      {item.points > 0 ? "+" : ""}{item.points} pts
                    </span>
                  )}
                </div>
                <p className="font-semibold text-slate-800 text-sm">⏰ {label}</p>
                {item.data.notes && (
                  <p className="text-xs text-slate-600 mt-1 italic">{item.data.notes}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // PERFORMANCE
    if (item.type === "performance") {
      const score = item.score || 0;
      const level = getScoreLevel(score, 100);
      return (
        <div key={item.id} className="relative">
          <div className="absolute left-5 top-0 bottom-0 w-px bg-slate-100" />
          <div className="relative flex gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${level.bg} border-2 ${level.border}`}>
              <Star className={`w-4 h-4 ${level.text}`} />
            </div>
            <div className="flex-1 pb-4">
              <button className="w-full text-left" onClick={() => setExpanded(isExp ? null : item.id)}>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3.5 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> {dateStr}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-black ${level.text}`}>{score % 1 === 0 ? score : score.toFixed(1)}/100</span>
                      {isExp ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                    </div>
                  </div>
                  <p className="font-semibold text-slate-800 text-sm">Evaluación de Calidad</p>
                  {item.data.client_name && <p className="text-xs text-slate-500 mt-0.5">🏠 {item.data.client_name}</p>}
                  <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${level.bar} transition-all duration-700`} style={{ width: `${(score / 100) * 100}%` }} />
                  </div>
                </div>
              </button>

              {isExp && (
                <div className="mt-2 space-y-2">
                  {(item.data.area_scores || []).filter(a => a.included).map(area => {
                    const pct = area.max_points > 0 ? (area.score / area.max_points) * 100 : 100;
                    const areaLevel = getScoreLevel(pct, 100);
                    const failedItems = (area.config_items || []).filter(it => area.checklist?.[it.key] === false);
                    const passedItems = (area.config_items || []).filter(it => area.checklist?.[it.key] !== false);
                    return (
                      <div key={area.area_key} className="bg-white rounded-2xl border border-slate-100 p-3">
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-sm font-semibold text-slate-700">{area.area_name}</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${areaLevel.bg} ${areaLevel.text}`}>{area.score}/{area.max_points} pts</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
                          <div className={`h-full rounded-full ${areaLevel.bar} transition-all duration-700`} style={{ width: `${pct}%` }} />
                        </div>
                        {failedItems.length > 0 && (
                          <div className="mb-2">
                            <p className="text-xs font-semibold text-red-600 mb-1 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" /> No cumplido:
                            </p>
                            <div className="space-y-1">
                              {failedItems.map(it => (
                                <p key={it.key} className="text-xs text-red-700 flex items-center gap-1.5 bg-red-50 rounded-lg px-2 py-1.5">
                                  <AlertCircle className="w-3 h-3 shrink-0 text-red-500" /> {it.label}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}
                        {passedItems.length > 0 && (
                          <div className="mb-2">
                            <p className="text-xs font-semibold text-green-600 mb-1 flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" /> Cumplido:
                            </p>
                            <div className="space-y-0.5">
                              {passedItems.map(it => (
                                <p key={it.key} className="text-xs text-green-700 flex items-center gap-1.5 px-2 py-0.5">
                                  <CheckCircle className="w-3 h-3 shrink-0 text-green-500" /> {it.label}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}
                        {area.notes && (
                          <div className="bg-blue-50 rounded-lg px-3 py-2 mb-2 mt-1">
                            <p className="text-xs text-blue-800"><span className="font-semibold">💬 Comentario:</span> {area.notes}</p>
                          </div>
                        )}
                        {area.photos?.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1"><Image className="w-3 h-3" /> Fotos del área:</p>
                            <div className="grid grid-cols-3 gap-1.5">
                              {area.photos.map((ph, i) => (
                                <a key={i} href={ph.url} target="_blank" rel="noopener noreferrer" className="block">
                                  <img src={ph.url} alt={ph.comment || "foto"} className="w-full h-16 object-cover rounded-lg border border-slate-200" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {(item.data.area_scores || []).filter(a => !a.included).length > 0 && (
                    <div className="bg-slate-50 rounded-2xl border border-slate-100 p-3">
                      <p className="text-xs font-semibold text-slate-400 mb-1.5">Áreas no realizadas:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(item.data.area_scores || []).filter(a => !a.included).map(area => (
                          <span key={area.area_key} className="text-xs bg-slate-200 text-slate-500 px-2 py-1 rounded-full">{area.area_name}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {item.data.general_notes && (
                    <div className="bg-amber-50 rounded-2xl border border-amber-100 p-3">
                      <p className="text-xs font-semibold text-amber-700 mb-1">📝 Notas del evaluador:</p>
                      <p className="text-sm text-amber-800">{item.data.general_notes}</p>
                    </div>
                  )}
                  {item.data.photos?.length > 0 && (
                    <div className="bg-white rounded-2xl border border-slate-100 p-3">
                      <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1"><Image className="w-3 h-3" /> Fotos de evidencia</p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {item.data.photos.map((ph, i) => (
                          <a key={i} href={ph.url} target="_blank" rel="noopener noreferrer" className="block">
                            <img src={ph.url} alt={ph.comment || "foto"} className="w-full h-16 object-cover rounded-lg border border-slate-200" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    // VEHICLE
    if (item.type === "vehicle") {
      const allOk = item.failedItems.length === 0;
      return (
        <div key={item.id} className="relative">
          <div className="absolute left-5 top-0 bottom-0 w-px bg-slate-100" />
          <div className="relative flex gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${allOk ? "bg-green-50 border-2 border-green-200" : "bg-amber-50 border-2 border-amber-200"}`}>
              <Car className={`w-4 h-4 ${allOk ? "text-green-600" : "text-amber-600"}`} />
            </div>
            <div className="flex-1 pb-4">
              <button className="w-full text-left" onClick={() => setExpanded(isExp ? null : item.id)}>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3.5 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> {dateStr}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-black ${allOk ? "text-green-600" : "text-amber-600"}`}>{item.score}/{item.max}</span>
                      {isExp ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                    </div>
                  </div>
                  <p className="font-semibold text-slate-800 text-sm">Revisión de Vehículo</p>
                  <p className="text-xs text-slate-500 mt-0.5">{item.data.vehicle_info || "Vehículo asignado"}</p>
                  {allOk
                    ? <p className="text-xs text-green-600 flex items-center gap-1 mt-1.5"><CheckCircle className="w-3 h-3" /> Todo en orden ✓</p>
                    : <p className="text-xs text-amber-600 mt-1.5">{item.failedItems.length} observación(es) — toca para ver detalles</p>
                  }
                </div>
              </button>
              {isExp && (
                <div className="mt-2 space-y-2">
                  {item.failedItems.length > 0 && (
                    <div className="bg-red-50 rounded-2xl border border-red-100 p-3 space-y-2">
                      <p className="text-xs font-bold text-red-700 flex items-center gap-1 mb-1">
                        <AlertCircle className="w-3 h-3" /> Observaciones con puntos descontados:
                      </p>
                      {item.failedItems.map((fi, idx) => (
                        <div key={idx} className="bg-white rounded-xl p-2.5 border border-red-100">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-medium text-slate-700">{fi.item}</p>
                            <Badge className="bg-red-100 text-red-800 text-xs ml-2 shrink-0">-{fi.points || fi.points_if_fail} pts</Badge>
                          </div>
                          {fi.notes && (
                            <p className="text-xs text-red-700 bg-red-50 rounded-lg px-2 py-1.5 mt-1">{fi.notes}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {(item.data.checklist_items || []).filter(i => i.passed).length > 0 && (
                    <div className="bg-green-50 rounded-2xl border border-green-100 p-3">
                      <p className="text-xs font-bold text-green-700 mb-2 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Ítems aprobados:</p>
                      <div className="space-y-1">
                        {(item.data.checklist_items || []).filter(i => i.passed).map((ci, idx) => (
                          <p key={idx} className="text-xs text-green-700 flex items-center gap-1.5">
                            <CheckCircle className="w-3 h-3 shrink-0" /> {ci.item}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                  {item.data.notes && (
                    <div className="bg-amber-50 rounded-2xl border border-amber-100 p-3">
                      <p className="text-xs font-semibold text-amber-700 mb-1">📝 Notas del inspector:</p>
                      <p className="text-sm text-amber-800">{item.data.notes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    // FEEDBACK
    if (item.type === "feedback") {
      const isCompliment = item.feedbackType === "compliment";
      const isComplaint = item.feedbackType === "complaint";
      const pts = item.points || 0;
      return (
        <div key={item.id} className="relative">
          <div className="absolute left-5 top-0 bottom-0 w-px bg-slate-100" />
          <div className="relative flex gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 z-10 border-2 ${isCompliment ? "bg-green-50 border-green-200" : isComplaint ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-200"}`}>
              {isCompliment ? <ThumbsUp className="w-4 h-4 text-green-600" /> : isComplaint ? <ThumbsDown className="w-4 h-4 text-red-600" /> : <MessageSquare className="w-4 h-4 text-slate-500" />}
            </div>
            <div className="flex-1 pb-4">
              <button className="w-full text-left" onClick={() => setExpanded(isExp ? null : item.id)}>
                <div className={`bg-white rounded-2xl border shadow-sm p-3.5 hover:shadow-md transition-shadow ${isCompliment ? "border-green-100" : isComplaint ? "border-red-100" : "border-slate-100"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> {dateStr}
                    </span>
                    <div className="flex items-center gap-2">
                      {pts !== 0 && (
                        <span className={`text-sm font-black ${pts > 0 ? "text-green-600" : "text-red-600"}`}>
                          {pts > 0 ? "+" : ""}{pts} pts
                        </span>
                      )}
                      {isExp ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                    </div>
                  </div>
                  <p className="font-semibold text-slate-800 text-sm">
                    {isCompliment ? "💚 Elogio de cliente" : isComplaint ? "⚠️ Queja de cliente" : "💬 Feedback de cliente"}
                  </p>
                  {item.data.client_name && <p className="text-xs text-slate-500 mt-0.5">🏠 {item.data.client_name}</p>}
                  {item.data.description && (
                    <p className="text-xs text-slate-600 mt-1.5 italic line-clamp-2">"{item.data.description}"</p>
                  )}
                </div>
              </button>
              {isExp && (
                <div className="mt-2 space-y-2">
                  {item.data.description && (
                    <div className={`rounded-2xl border p-3 ${isCompliment ? "bg-green-50 border-green-100" : isComplaint ? "bg-red-50 border-red-100" : "bg-slate-50 border-slate-100"}`}>
                      <p className="text-xs font-semibold text-slate-600 mb-1">Comentario completo:</p>
                      <p className="text-sm text-slate-700 italic">"{item.data.description}"</p>
                    </div>
                  )}
                  <div className="bg-white rounded-2xl border border-slate-100 p-3 space-y-2">
                    {item.data.client_name && (
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span><span className="font-semibold">Cliente:</span> {item.data.client_name}</span>
                      </div>
                    )}
                    {item.data.reported_by && (
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span><span className="font-semibold">Reportado por:</span> {item.data.reported_by}</span>
                      </div>
                    )}
                    {item.data.admin_notes && (
                      <div className="bg-amber-50 rounded-xl p-2.5 border border-amber-100 mt-1">
                        <p className="text-xs font-semibold text-amber-700 mb-0.5">Nota del admin:</p>
                        <p className="text-xs text-amber-800">{item.data.admin_notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    // AJUSTE MANUAL
    if (item.type === "adjustment") {
      const isBonus = item.adjType === "bonus";
      return (
        <div key={item.id} className="relative">
          <div className="absolute left-5 top-0 bottom-0 w-px bg-slate-100" />
          <div className="relative flex gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${isBonus ? "bg-emerald-50 border-2 border-emerald-200" : "bg-red-50 border-2 border-red-200"}`}>
              {isBonus ? <TrendingUp className="w-4 h-4 text-emerald-600" /> : <TrendingDown className="w-4 h-4 text-red-600" />}
            </div>
            <div className="flex-1 pb-4">
              <div className={`bg-white rounded-2xl border shadow-sm p-3.5 ${isBonus ? "border-emerald-100" : "border-red-100"}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> {dateStr}
                  </span>
                  <span className={`text-sm font-black ${isBonus ? "text-emerald-600" : "text-red-600"}`}>
                    {item.points >= 0 ? "+" : ""}{item.points} pts
                  </span>
                </div>
                <p className="font-semibold text-slate-800 text-sm">
                  {isBonus ? "⭐ " : "⚠️ "}{item.category}
                </p>
                {item.notes && (
                  <div className={`mt-2 rounded-xl px-3 py-2 ${isBonus ? "bg-emerald-50" : "bg-red-50"}`}>
                    <p className={`text-xs ${isBonus ? "text-emerald-700" : "text-red-700"}`}>{item.notes}</p>
                  </div>
                )}
                {item.data.admin_name && (
                  <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                    <User className="w-3 h-3" /> Registrado por: {item.data.admin_name}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  return <div className="space-y-0 pt-2">{items.map(renderItem)}</div>;
}

// --- Main Page ---
export default function MiPuntuacionPage() {
  const [user, setUser] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [monthlyScore, setMonthlyScore] = useState(null);
  const [allScores, setAllScores] = useState([]);
  const [adjs, setAdjs] = useState([]);
  const [perfReviews, setPerfReviews] = useState([]);
  const [vehicleRecs, setVehicleRecs] = useState([]);
  const [historicalScores, setHistoricalScores] = useState([]);
  const [loading, setLoading] = useState(true);

  const currentMonth = format(new Date(), "yyyy-MM");
  const canGoForward = selectedMonth < currentMonth;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const me = await base44.auth.me();
        setUser(me);
        await Promise.all([
          loadMonthData(me.id, selectedMonth),
          loadHistoricalData(me.id),
        ]);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, []);

  const loadMonthData = async (userId, month) => {
    const [allScoresRaw, adjustments, perf, veh] = await Promise.all([
      base44.entities.MonthlyCleanerScore.filter({ month_period: month }),
      base44.entities.ScoreAdjustment.filter({ cleaner_id: userId, month_period: month }),
      base44.entities.PerformanceReview.filter({ cleaner_id: userId, month_period: month }),
      base44.entities.VehicleChecklistRecord.filter({ month_period: month }),
    ]);
    const myScore = allScoresRaw.find(s => s.cleaner_id === userId) || null;
    const participatingScores = allScoresRaw.filter(s => s.is_participating);
    setMonthlyScore(myScore);
    setAllScores(participatingScores);
    setAdjs(adjustments);
    setPerfReviews(perf);
    setVehicleRecs(veh.filter(r => (r.team_member_ids || []).includes(userId)));
  };

  const loadHistoricalData = async (userId) => {
    const hist = await base44.entities.MonthlyCleanerScore.filter({ cleaner_id: userId });
    const sorted = hist
      .sort((a, b) => a.month_period.localeCompare(b.month_period))
      .slice(-6);
    setHistoricalScores(sorted.map(h => ({
      month: format(new Date(h.month_period + "-02"), "MMM", { locale: es }),
      score: h.current_score,
    })));
  };

  const navigateMonth = async (dir) => {
    if (!user) return;
    const current = new Date(selectedMonth + "-02");
    const next = dir === "prev" ? subMonths(current, 1) : addMonths(current, 1);
    const newMonth = format(next, "yyyy-MM");
    if (newMonth > currentMonth) return;
    setSelectedMonth(newMonth);
    setLoading(true);
    await loadMonthData(user.id, newMonth);
    setLoading(false);
  };

  const scoreData = useMemo(() => {
    if (!user || !monthlyScore) return null;

    const perfAvg = perfReviews.length > 0
      ? perfReviews.reduce((s, r) => s + (r.overall_score || 100), 0) / perfReviews.length
      : 100;

    const TOTAL_POSSIBLE = 18;
    const vehAvgRaw = vehicleRecs.length > 0
      ? vehicleRecs.reduce((s, r) => {
          const earned = (r.checklist_items || []).reduce((ss, i) => i.passed ? ss + (i.points || i.points_if_fail || 0) : ss, 0);
          return s + earned;
        }, 0) / vehicleRecs.length
      : TOTAL_POSSIBLE;

    const relevantAdjs = adjs.filter(a =>
      a.category !== "Revisión Vehicular (Promedio Mensual)" &&
      a.category !== "Evaluación de Performance"
    );
    const adjScore = relevantAdjs.reduce((s, a) => s + (a.points_impact || 0), 0);

    // Fuente de verdad: current_score de la BD (no recalculado)
    const totalScore = monthlyScore.current_score;

    const ranked = [...allScores].sort((a, b) => b.current_score - a.current_score);
    const myRank = ranked.findIndex(s => s.cleaner_id === user.id) + 1;

    return { perfAvg, vehAvg: vehAvgRaw, adjScore, totalScore, rank: myRank > 0 ? myRank : null, total: allScores.length };
  }, [user, monthlyScore, perfReviews, vehicleRecs, adjs, allScores]);

  if (loading && !user) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
      </div>
    );
  }

  const monthLabel = format(new Date(selectedMonth + "-02"), "MMMM yyyy", { locale: es });
  const isCurrentMonth = selectedMonth === currentMonth;
  const isParticipating = monthlyScore?.is_participating === true;
  const totalScore = scoreData?.totalScore ?? 0;
  const level = getScoreLevel(totalScore, 118);
  const nextLevel = getNextLevelInfo(totalScore, 118);

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* Hero Header */}
      <div className={`bg-gradient-to-br ${level.gradient} px-4 pt-8 pb-10`}>
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => navigateMonth("prev")} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors">
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <p className="text-white font-bold capitalize text-base">{monthLabel}</p>
          <button
            onClick={() => navigateMonth("next")}
            disabled={!canGoForward}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${canGoForward ? "bg-white/20 hover:bg-white/30" : "opacity-30 cursor-not-allowed"}`}
          >
            <ChevronRight className="w-5 h-5 text-white" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-white/60" /></div>
        ) : (
          <>
            {isParticipating ? (
              <>
                <ScoreRing score={totalScore} max={118} />
                {scoreData?.rank && (
                  <div className="flex justify-center mt-4">
                    <RankBadge rank={scoreData.rank} total={scoreData.total} />
                  </div>
                )}
                {nextLevel && (
                  <div className="flex justify-center mt-3">
                    <div className="bg-black/10 rounded-full px-4 py-1.5 inline-block text-center">
                      <p className="text-xs text-white/90">
                        Te faltan <span className="font-bold">{nextLevel.pointsNeeded} pts</span> para el nivel {nextLevel.nextLevel}
                      </p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center py-6">
                <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mb-3">
                  <Info className="w-10 h-10 text-white/70" />
                </div>
                <p className="text-white font-bold text-lg capitalize">{monthLabel}</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Banner no participante */}
      {!loading && !isParticipating && (
        <div className="px-4 mt-4">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
            <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
              <Info className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="font-semibold text-amber-800 text-sm">No participas en el ranking este mes</p>
              <p className="text-xs text-amber-600 mt-0.5">Puedes ver tus evaluaciones y actividad, pero tu puntuación no cuenta para el ranking mensual. Contacta al administrador para más información.</p>
            </div>
          </div>
        </div>
      )}

      {/* Mini Cards */}
      {!loading && scoreData && isParticipating && (
        <div className="px-4 -mt-4">
          <div className="bg-white rounded-3xl shadow-lg p-4 space-y-3 border border-slate-100">
            {/* Calidad */}
            <div className="bg-blue-50 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center">
                    <Star className="w-4 h-4 text-blue-600" />
                  </div>
                  <span className="text-sm font-semibold text-slate-700">Calidad de Limpieza</span>
                </div>
                <span className="text-xl font-black text-blue-600">
                  {scoreData.perfAvg % 1 === 0 ? scoreData.perfAvg : Number(scoreData.perfAvg).toFixed(1)}
                  <span className="text-sm font-normal text-slate-400">/100</span>
                </span>
              </div>
              <div className="h-2 bg-blue-200 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-700" style={{ width: `${Math.min(100, (scoreData.perfAvg / 100) * 100)}%` }} />
              </div>
            </div>

            {/* Vehículo */}
            <div className="bg-slate-50 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-slate-200 rounded-xl flex items-center justify-center">
                    <Car className="w-4 h-4 text-slate-600" />
                  </div>
                  <span className="text-sm font-semibold text-slate-700">Revisión de Vehículo</span>
                </div>
                <span className="text-xl font-black text-slate-700">
                  {scoreData.vehAvg % 1 === 0 ? scoreData.vehAvg : Number(scoreData.vehAvg).toFixed(1)}
                  <span className="text-sm font-normal text-slate-400">/18</span>
                </span>
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-slate-500 rounded-full transition-all duration-700" style={{ width: `${Math.min(100, (scoreData.vehAvg / 18) * 100)}%` }} />
              </div>
            </div>

            {/* Otros Ajustes */}
            <div className={`rounded-2xl p-4 ${scoreData.adjScore >= 0 ? "bg-emerald-50" : "bg-red-50"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${scoreData.adjScore >= 0 ? "bg-emerald-100" : "bg-red-100"}`}>
                    {scoreData.adjScore >= 0
                      ? <TrendingUp className="w-4 h-4 text-emerald-600" />
                      : <TrendingDown className="w-4 h-4 text-red-600" />
                    }
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-slate-700">Otros Ajustes</span>
                    <p className={`text-xs ${scoreData.adjScore >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {scoreData.adjScore === 0 ? "Sin ajustes este mes" : scoreData.adjScore > 0 ? "Ajustes positivos" : "Ajustes negativos"}
                    </p>
                  </div>
                </div>
                <span className={`text-2xl font-black ${scoreData.adjScore >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {scoreData.adjScore >= 0 ? "+" : ""}{scoreData.adjScore}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Gráfico Histórico */}
      {!loading && historicalScores.length > 1 && (
        <div className="px-4 mt-6">
          <Card className="border border-slate-100 shadow-sm rounded-3xl">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm text-slate-700 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-500" /> Histórico de Puntuación
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-4">
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={historicalScores} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} domain={[0, 118]} />
                  <Tooltip
                    contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                    formatter={(value) => [`${value} pts`, "Puntaje"]}
                  />
                  <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: "#3b82f6", strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Timeline */}
      {!loading && user && (
        <div className="px-4 mt-6">
          <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            Actividad de {isCurrentMonth ? "este mes" : monthLabel}
          </h3>
          <UnifiedTimeline userId={user.id} monthPeriod={selectedMonth} />
        </div>
      )}
    </div>
  );
}