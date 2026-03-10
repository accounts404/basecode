import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ClipboardList, TrendingUp, User, Home, ChevronDown, ChevronUp, CalendarDays, Search, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import SimplePagination from "@/components/ui/simple-pagination";

// 5 áreas de limpieza con puntos distribuidos sobre 100
const AREAS = [
  { key: "bathrooms",          name: "Baños",                   max: 25, color: "blue" },
  { key: "kitchen_and_pantry", name: "Cocina y Despensa",       max: 25, color: "orange" },
  { key: "floors",             name: "Pisos",                   max: 20, color: "green" },
  { key: "dusting_wiping",     name: "Dusting / Limpieza General", max: 15, color: "purple" },
  { key: "other_areas",        name: "Otras Áreas",             max: 15, color: "slate" },
];

const AREA_COLORS = {
  blue:   { bg: "bg-blue-50",   border: "border-blue-200",  text: "text-blue-700",   bar: "bg-blue-500" },
  orange: { bg: "bg-orange-50", border: "border-orange-200",text: "text-orange-700", bar: "bg-orange-500" },
  green:  { bg: "bg-green-50",  border: "border-green-200", text: "text-green-700",  bar: "bg-green-500" },
  purple: { bg: "bg-purple-50", border: "border-purple-200",text: "text-purple-700", bar: "bg-purple-500" },
  slate:  { bg: "bg-slate-50",  border: "border-slate-200", text: "text-slate-700",  bar: "bg-slate-500" },
};

function ScoreBar({ score, max, color }) {
  const pct = max > 0 ? Math.round((score / max) * 100) : 0;
  const colors = AREA_COLORS[color];
  return (
    <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-300 ${colors.bar}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function ScoreBadge({ score }) {
  const cls = score >= 90 ? "bg-green-100 text-green-800"
    : score >= 75 ? "bg-blue-100 text-blue-800"
    : score >= 60 ? "bg-yellow-100 text-yellow-800"
    : "bg-red-100 text-red-800";
  return <Badge className={cls}>{Math.round(score)} / 100</Badge>;
}

// Card resumen de un limpiador
function CleanerCard({ cleaner, reviews, onNew }) {
  const [expanded, setExpanded] = useState(false);
  const cleanerReviews = reviews.filter(r => r.cleaner_id === cleaner.id);
  const avg = cleanerReviews.length > 0
    ? cleanerReviews.reduce((s, r) => s + (r.overall_score || 0), 0) / cleanerReviews.length
    : null;

  // Promedio por área
  const areaAverages = AREAS.map(area => {
    const vals = cleanerReviews.map(r => {
      const a = (r.area_scores || []).find(s => s.area_key === area.key);
      return a ? a.score : null;
    }).filter(v => v !== null);
    return { ...area, avg: vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null };
  });

  return (
    <Card className="border-0 shadow-md">
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <User className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-800 truncate">{cleaner.invoice_name || cleaner.full_name}</p>
            <p className="text-xs text-slate-500">{cleanerReviews.length} evaluación(es) este mes</p>
          </div>
          {avg !== null && <ScoreBadge score={avg} />}
        </div>

        {cleanerReviews.length > 0 && (
          <>
            <div className="space-y-2 mb-3">
              {areaAverages.filter(a => a.avg !== null).map(area => (
                <div key={area.key}>
                  <div className="flex justify-between text-xs text-slate-600 mb-0.5">
                    <span>{area.name}</span>
                    <span>{Math.round(area.avg)}/{area.max}</span>
                  </div>
                  <ScoreBar score={area.avg} max={area.max} color={area.color} />
                </div>
              ))}
            </div>

            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-blue-600 hover:underline flex items-center gap-1 mb-3"
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {expanded ? "Ocultar historial" : `Ver ${cleanerReviews.length} evaluación(es)`}
            </button>

            {expanded && (
              <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
                {[...cleanerReviews].sort((a, b) => new Date(b.review_date) - new Date(a.review_date)).map(r => (
                  <div key={r.id} className="bg-slate-50 rounded-lg p-2 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{format(parseISO(r.review_date), "d MMM yyyy", { locale: es })}</span>
                      <ScoreBadge score={r.overall_score || 0} />
                    </div>
                    {r.client_name && <p className="text-slate-500 mt-0.5">🏠 {r.client_name}</p>}
                    {r.general_notes && <p className="text-slate-500 italic mt-0.5">"{r.general_notes}"</p>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <Button size="sm" variant="outline" className="w-full" onClick={() => onNew(cleaner)}>
          <Plus className="w-4 h-4 mr-1" /> Evaluar
        </Button>
      </CardContent>
    </Card>
  );
}

const INITIAL_AREA_SCORES = () =>
  AREAS.map(a => ({ area_key: a.key, area_name: a.name, max_points: a.max, score: a.max, notes: "" }));

export default function PerformanceTab({ monthPeriod, limpiadores, monthlyScores, user, onScoreApplied }) {
  const [reviews, setReviews] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [selectedCleaner, setSelectedCleaner] = useState(null);
  const [reviewDate, setReviewDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [areaScores, setAreaScores] = useState(INITIAL_AREA_SCORES());
  const [generalNotes, setGeneralNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const HISTORY_PAGE_SIZE = 10;

  useEffect(() => { loadData(); }, [monthPeriod]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [data, cls] = await Promise.all([
        base44.entities.PerformanceReview.filter({ month_period: monthPeriod }),
        base44.entities.Client.filter({ active: true }),
      ]);
      setReviews(data);
      setClients(cls.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const openDialog = (cleaner = null) => {
    setSelectedCleaner(cleaner);
    setReviewDate(format(new Date(), "yyyy-MM-dd"));
    setSelectedClientId("");
    setClientSearch("");
    setShowClientDropdown(false);
    setAreaScores(INITIAL_AREA_SCORES());
    setGeneralNotes("");
    setShowDialog(true);
  };

  const filteredClients = clientSearch.length > 0
    ? clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase())).slice(0, 8)
    : [];

  const selectClient = (client) => {
    setSelectedClientId(client.id);
    setClientSearch(client.name);
    setShowClientDropdown(false);
  };

  const totalScore = areaScores.reduce((s, a) => s + a.score, 0);

  const updateAreaScore = (key, score) => {
    setAreaScores(prev => prev.map(a => a.area_key === key ? { ...a, score } : a));
  };

  const updateAreaNotes = (key, notes) => {
    setAreaScores(prev => prev.map(a => a.area_key === key ? { ...a, notes } : a));
  };

  // Impacto en puntuación del ranking: la diferencia con respecto al 100 ideal
  const calcPointsImpact = (total) => {
    const deduction = 100 - total;
    return deduction > 0 ? -deduction : 0;
  };

  const handleSave = async () => {
    if (!selectedCleaner) { alert("Por favor selecciona un limpiador."); return; }
    setSaving(true);
    try {
      const client = clients.find(c => c.id === selectedClientId);
      const impact = calcPointsImpact(totalScore);
      const monthlyScore = monthlyScores.find(s => s.cleaner_id === selectedCleaner.id);
      let adjustmentId = null;

      if (monthlyScore && impact !== 0) {
        const adj = await base44.entities.ScoreAdjustment.create({
          monthly_score_id: monthlyScore.id,
          cleaner_id: selectedCleaner.id,
          month_period: monthPeriod,
          adjustment_type: "deduction",
          category: "Evaluación de Performance",
          points_impact: impact,
          notes: `Puntaje: ${totalScore}/100${client ? ` · Cliente: ${client.name}` : ""}${generalNotes ? ` · ${generalNotes}` : ""}`,
          admin_id: user.id,
          admin_name: user.full_name,
          date_applied: new Date().toISOString()
        });
        adjustmentId = adj.id;
        const newScore = Math.max(0, monthlyScore.current_score + impact);
        await base44.entities.MonthlyCleanerScore.update(monthlyScore.id, { current_score: newScore });
      }

      await base44.entities.PerformanceReview.create({
        cleaner_id: selectedCleaner.id,
        cleaner_name: selectedCleaner.invoice_name || selectedCleaner.full_name,
        review_date: reviewDate,
        month_period: monthPeriod,
        client_id: selectedClientId || null,
        client_name: client?.name || "",
        reviewed_by_admin: user.id,
        reviewed_by_admin_name: user.full_name,
        area_scores: areaScores,
        overall_score: totalScore,
        general_notes: generalNotes,
        points_impact: impact,
        score_adjustment_id: adjustmentId
      });

      setShowDialog(false);
      await loadData();
      if (onScoreApplied) onScoreApplied();
    } catch (e) {
      console.error(e);
      alert("Error guardando la evaluación");
    }
    setSaving(false);
  };

  const participatingCleaners = limpiadores.filter(c =>
    monthlyScores.some(s => s.cleaner_id === c.id && s.is_participating)
  );

  const allReviewsSorted = [...reviews].sort((a, b) => new Date(b.review_date) - new Date(a.review_date));
  const totalHistoryPages = Math.ceil(allReviewsSorted.length / HISTORY_PAGE_SIZE);
  const pagedHistory = allReviewsSorted.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Evaluaciones de Performance por Casa</h3>
          <p className="text-sm text-slate-500">Evalúa cada área de limpieza sobre 100 puntos por limpiador</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className="bg-blue-100 text-blue-800">{reviews.length} evaluaciones este mes</Badge>
          <Button onClick={() => openDialog(null)}>
            <Plus className="w-4 h-4 mr-1" /> Nueva Evaluación
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" /></div>
      ) : (
        <>
          {/* Grid de limpiadores */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {participatingCleaners.map(cleaner => (
              <CleanerCard
                key={cleaner.id}
                cleaner={cleaner}
                reviews={reviews}
                onNew={openDialog}
              />
            ))}
            {participatingCleaners.length === 0 && (
              <div className="col-span-3 text-center py-12 text-slate-500">
                <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p>No hay limpiadores participando este mes.</p>
              </div>
            )}
          </div>

          {/* Historial global */}
          {reviews.length > 0 && (
            <Card className="border-0 shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="w-4 h-4" /> Historial de Evaluaciones
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {pagedHistory.map(r => (
                    <div key={r.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{r.cleaner_name}</p>
                        <p className="text-xs text-slate-500">
                          {format(parseISO(r.review_date), "d MMM yyyy", { locale: es })}
                          {r.client_name ? ` · 🏠 ${r.client_name}` : ""}
                          {" · "}{r.reviewed_by_admin_name}
                        </p>
                        {r.general_notes && (
                          <p className="text-xs text-slate-400 italic mt-0.5">"{r.general_notes}"</p>
                        )}
                      </div>
                      <div className="text-right flex flex-col items-end gap-1">
                        <ScoreBadge score={r.overall_score || 0} />
                        {r.points_impact !== 0 && (
                          <span className="text-xs text-red-600 font-medium">{r.points_impact} pts ranking</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <SimplePagination
                  currentPage={historyPage}
                  totalPages={totalHistoryPages}
                  onPageChange={setHistoryPage}
                  totalItems={allReviewsSorted.length}
                  pageSize={HISTORY_PAGE_SIZE}
                />
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Dialog nueva evaluación */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5" />
              Nueva Evaluación de Performance
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Limpiador */}
            <div>
              <Label className="font-semibold flex items-center gap-1 mb-1">
                <User className="w-4 h-4" /> Limpiador
              </Label>
              <Select
                value={selectedCleaner?.id || ""}
                onValueChange={(id) => {
                  const c = limpiadores.find(l => l.id === id);
                  setSelectedCleaner(c || null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar limpiador..." />
                </SelectTrigger>
                <SelectContent>
                  {limpiadores.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.invoice_name || l.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Fecha y Cliente */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="font-semibold flex items-center gap-1 mb-1">
                  <CalendarDays className="w-4 h-4" /> Fecha del Servicio
                </Label>
                <Input
                  type="date"
                  value={reviewDate}
                  onChange={e => setReviewDate(e.target.value)}
                />
              </div>
              <div>
                <Label className="font-semibold flex items-center gap-1 mb-1">
                  <Home className="w-4 h-4" /> Cliente / Casa
                </Label>
                <div className="relative">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      value={clientSearch}
                      onChange={e => {
                        setClientSearch(e.target.value);
                        setSelectedClientId("");
                        setShowClientDropdown(true);
                      }}
                      onFocus={() => setShowClientDropdown(true)}
                      placeholder="Buscar cliente..."
                      className="pl-9 pr-8"
                    />
                    {clientSearch && (
                      <button
                        onClick={() => { setClientSearch(""); setSelectedClientId(""); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {showClientDropdown && filteredClients.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {filteredClients.map(c => (
                        <button
                          key={c.id}
                          onClick={() => selectClient(c)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-0"
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Áreas de evaluación */}
            <div>
              <Label className="text-base font-semibold mb-3 block">Evaluación por Área</Label>
              <div className="space-y-4">
                {AREAS.map(area => {
                  const aScore = areaScores.find(a => a.area_key === area.key);
                  const colors = AREA_COLORS[area.color];
                  const pct = Math.round((aScore.score / area.max) * 100);

                  return (
                    <div key={area.key} className={`p-4 rounded-lg border ${colors.bg} ${colors.border}`}>
                      <div className="flex items-center justify-between mb-2">
                        <Label className={`font-semibold ${colors.text}`}>{area.name}</Label>
                        <span className={`text-xl font-bold ${colors.text}`}>
                          {aScore.score} <span className="text-sm font-normal text-slate-500">/ {area.max} pts</span>
                        </span>
                      </div>

                      <Slider
                        value={[aScore.score]}
                        min={0}
                        max={area.max}
                        step={1}
                        onValueChange={([v]) => updateAreaScore(area.key, v)}
                        className="mb-2"
                      />

                      <div className="flex justify-between text-xs text-slate-500 mb-2">
                        <span>0</span>
                        <span className={pct < 60 ? "text-red-500 font-medium" : pct < 80 ? "text-yellow-600 font-medium" : "text-green-600 font-medium"}>
                          {pct}%
                        </span>
                        <span>{area.max}</span>
                      </div>

                      <Textarea
                        value={aScore.notes}
                        onChange={e => updateAreaNotes(area.key, e.target.value)}
                        placeholder={`¿Qué no está haciendo bien en ${area.name.toLowerCase()}? (opcional)`}
                        rows={2}
                        className="text-sm mt-1"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Resumen de puntaje */}
            <div className={`p-4 rounded-lg border ${totalScore >= 90 ? "bg-green-50 border-green-200" : totalScore >= 75 ? "bg-blue-50 border-blue-200" : totalScore >= 60 ? "bg-yellow-50 border-yellow-200" : "bg-red-50 border-red-200"}`}>
              <div className="flex justify-between items-center">
                <span className="font-semibold">Puntaje Total</span>
                <span className="text-3xl font-bold">{totalScore} <span className="text-base font-normal text-slate-500">/ 100</span></span>
              </div>
              {calcPointsImpact(totalScore) < 0 && (
                <p className="text-sm text-red-600 mt-1">
                  Impacto en ranking: {calcPointsImpact(totalScore)} pts
                </p>
              )}
              {totalScore === 100 && (
                <p className="text-sm text-green-600 mt-1">✅ ¡Evaluación perfecta! Sin impacto en ranking.</p>
              )}
            </div>

            {/* Notas generales */}
            <div>
              <Label>Notas generales</Label>
              <Textarea
                value={generalNotes}
                onChange={e => setGeneralNotes(e.target.value)}
                placeholder="Observaciones generales del desempeño en esta visita..."
                rows={2}
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Guardando..." : "Guardar Evaluación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}