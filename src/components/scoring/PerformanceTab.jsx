import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, ClipboardList, TrendingUp, User, Home, ChevronDown, ChevronUp, CalendarDays, Search, X, Camera, Trash2, CheckCircle2, AlertCircle, BarChart2, Settings, Pencil } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import SimplePagination from "@/components/ui/simple-pagination";
import ChecklistConfigModal, { loadChecklistConfig } from "@/components/scoring/ChecklistConfigModal";
import PerformanceReportsTab from "@/components/scoring/PerformanceReportsTab";

const AREAS = [
  { key: "bathrooms",          name: "Baños",                      max: 25, color: "blue" },
  { key: "kitchen_and_pantry", name: "Cocina y Despensa",          max: 25, color: "orange" },
  { key: "floors",             name: "Pisos",                      max: 20, color: "green" },
  { key: "dusting_wiping",     name: "Dusting / Limpieza General", max: 15, color: "purple" },
  { key: "other_areas",        name: "Otras Áreas",                max: 15, color: "slate" },
];

// AREA_CHECKLISTS is now dynamic — loaded from ChecklistConfigModal config (localStorage)
// Helper: get active items for an area from config
function getActiveItemsForArea(areaKey, checklistConfig) {
  const areaConfig = checklistConfig?.[areaKey];
  if (!areaConfig) return [];
  return areaConfig.items.filter(i => i.enabled !== false);
}

const AREA_COLORS = {
  blue:   { bg: "bg-blue-50",   border: "border-blue-200",   text: "text-blue-700",   bar: "bg-blue-500",   badgeBg: "bg-blue-100",   badgeText: "text-blue-800" },
  orange: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", bar: "bg-orange-500", badgeBg: "bg-orange-100", badgeText: "text-orange-800" },
  green:  { bg: "bg-green-50",  border: "border-green-200",  text: "text-green-700",  bar: "bg-green-500",  badgeBg: "bg-green-100",  badgeText: "text-green-800" },
  purple: { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", bar: "bg-purple-500", badgeBg: "bg-purple-100", badgeText: "text-purple-800" },
  slate:  { bg: "bg-slate-50",  border: "border-slate-200",  text: "text-slate-700",  bar: "bg-slate-500",  badgeBg: "bg-slate-100",  badgeText: "text-slate-800" },
};

function ScoreBadge({ score }) {
  const cls = score >= 90 ? "bg-green-100 text-green-800"
    : score >= 75 ? "bg-blue-100 text-blue-800"
    : score >= 60 ? "bg-yellow-100 text-yellow-800"
    : "bg-red-100 text-red-800";
  const displayScore = score % 1 === 0 ? score : score.toFixed(2);
  return <Badge className={cls}>{displayScore} / 100</Badge>;
}

// Calcula el puntaje general normalizado a 100 basado en las áreas incluidas SIN APROXIMAR
function computeOverallScore(areaStates) {
  const includedAreas = areaStates.filter(a => a.included);
  if (includedAreas.length === 0) return 100;
  const totalMax = includedAreas.reduce((sum, a) => sum + getAreaMax(a), 0);
  const totalEarned = includedAreas.reduce((sum, a) => {
    const earned = getAreaEarned(a);
    if (earned === null) return 0;
    // Para sumar correctamente, necesitamos los puntos exactos sin redondeo
    return sum + earned;
  }, 0);
  return totalMax > 0 ? (totalEarned / totalMax) * 100 : 100;
}

// Returns the normalized weight of each item so all items in the area always sum to areaMax
function getAreaItemWeights(areaState) {
  const area = AREAS.find(a => a.key === areaState.area_key);
  const areaMax = area?.max || 0;
  // areaState.config_items holds the active items from config
  const configItems = areaState.config_items || [];

  const rawTotal = configItems.reduce((s, i) => s + i.points, 0);
  if (rawTotal === 0 || areaMax === 0) return { defaultWeights: {} };

  const defaultWeights = {};
  configItems.forEach(i => { defaultWeights[i.key] = (i.points / rawTotal) * areaMax; });

  return { defaultWeights };
}

function getAreaEarned(areaState) {
  if (!areaState.included) return null;
  const configItems = areaState.config_items || [];
  const { defaultWeights } = getAreaItemWeights(areaState);

  return Math.round(
    configItems.reduce((s, item) => s + (areaState.checklist[item.key] ? (defaultWeights[item.key] || 0) : 0), 0)
  );
}

function getAreaMax(areaState) {
  const area = AREAS.find(a => a.key === areaState.area_key);
  return area?.max || 0;
}

const initAreaStates = (checklistConfig) => {
  const cfg = checklistConfig || loadChecklistConfig();
  return AREAS.map(a => {
    const activeItems = getActiveItemsForArea(a.key, cfg);
    return {
      area_key: a.key,
      included: true,
      notes: "",
      photos: [],
      config_items: activeItems, // active items from saved config
      checklist: Object.fromEntries(activeItems.map(item => [item.key, true])),
      new_item_label: "",
      new_item_points: "",
    };
  });
};

// Card resumen de un limpiador
function CleanerCard({ cleaner, reviews, onNew }) {
  const [expanded, setExpanded] = useState(false);
  const cleanerReviews = reviews.filter(r => r.cleaner_id === cleaner.id);
  const avg = cleanerReviews.length > 0
    ? cleanerReviews.reduce((s, r) => s + (r.overall_score || 0), 0) / cleanerReviews.length
    : null;

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

export default function PerformanceTab({ monthPeriod, limpiadores, monthlyScores, user, onScoreApplied }) {
  const [reviews, setReviews] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [selectedCleaner, setSelectedCleaner] = useState(null);
  const [reviewDate, setReviewDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [areaStates, setAreaStates] = useState(() => initAreaStates());
  const [generalNotes, setGeneralNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingReview, setEditingReview] = useState(null); // null = new, object = editing
  const [deletingId, setDeletingId] = useState(null);
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
    setEditingReview(null);
    setSelectedCleaner(cleaner);
    setReviewDate(format(new Date(), "yyyy-MM-dd"));
    setSelectedClientId("");
    setClientSearch("");
    setShowClientDropdown(false);
    setAreaStates(initAreaStates()); // always reads latest config from localStorage
    setGeneralNotes("");
    setShowDialog(true);
  };

  const openEditDialog = (review) => {
    setEditingReview(review);
    setSelectedCleaner(limpiadores.find(l => l.id === review.cleaner_id) || { id: review.cleaner_id, full_name: review.cleaner_name });
    setReviewDate(review.review_date);
    const client = clients.find(c => c.id === review.client_id);
    setSelectedClientId(review.client_id || "");
    setClientSearch(review.client_name || "");
    setShowClientDropdown(false);
    setGeneralNotes(review.general_notes || "");
    // Restore area states from saved review
    const cfg = loadChecklistConfig();
    const restored = initAreaStates(cfg).map(state => {
      const saved = (review.area_scores || []).find(a => a.area_key === state.area_key);
      if (!saved) return state;
      return {
        ...state,
        included: saved.included !== undefined ? saved.included : true,
        notes: saved.notes || "",
        photos: saved.photos || [],
        // Use saved config_items if present (preserves the checklist items as they were when evaluated)
        config_items: (saved.config_items && saved.config_items.length > 0) ? saved.config_items : state.config_items,
        checklist: saved.checklist || state.checklist,
      };
    });
    setAreaStates(restored);
    setShowDialog(true);
  };

  const handleConfigSaved = (newConfig) => {
    setShowConfigModal(false);
    if (newConfig) {
      // Refresh area states with new config if dialog is open
      setAreaStates(initAreaStates(newConfig));
    }
  };

  const filteredClients = clientSearch.length > 0
    ? clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase())).slice(0, 8)
    : [];

  const selectClient = (client) => {
    setSelectedClientId(client.id);
    setClientSearch(client.name);
    setShowClientDropdown(false);
  };

  const toggleAreaIncluded = (areaKey) => {
    setAreaStates(prev => prev.map(a =>
      a.area_key === areaKey ? { ...a, included: !a.included } : a
    ));
  };

  const toggleChecklistItem = (areaKey, itemKey) => {
    setAreaStates(prev => prev.map(a =>
      a.area_key === areaKey
        ? { ...a, checklist: { ...a.checklist, [itemKey]: !a.checklist[itemKey] } }
        : a
    ));
  };

  const updateAreaNotes = (areaKey, notes) => {
    setAreaStates(prev => prev.map(a => a.area_key === areaKey ? { ...a, notes } : a));
  };

  const addAreaPhoto = async (areaKey, file) => {
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setAreaStates(prev => prev.map(a =>
        a.area_key === areaKey ? { ...a, photos: [...(a.photos || []), { url: file_url, comment: "" }] } : a
      ));
    } catch (e) {
      console.error("Error subiendo foto:", e);
      alert("Error al subir la foto");
    }
  };

  const removeAreaPhoto = (areaKey, idx) => {
    setAreaStates(prev => prev.map(a =>
      a.area_key === areaKey ? { ...a, photos: a.photos.filter((_, i) => i !== idx) } : a
    ));
  };



  const overallScore = computeOverallScore(areaStates);
  const includedCount = areaStates.filter(a => a.included).length;

  const calcPointsImpact = (total) => {
    const deduction = 100 - total;
    return deduction > 0 ? -deduction : 0;
  };

  // Recalcula y aplica UN ÚNICO ajuste de performance para el limpiador basado en el promedio de todas sus evaluaciones del mes
  const applyAveragePerformanceScore = async (cleanerId, allReviewsForCleaner, monthlyScore) => {
    if (!monthlyScore) return;

    // Traer TODOS los ajustes del limpiador este mes y filtrar en JS por categoría
    const allAdjs = await base44.entities.ScoreAdjustment.filter({
      cleaner_id: cleanerId,
      month_period: monthPeriod,
    });

    const performanceAdjs = allAdjs.filter(a => a.category === "Evaluación de Performance");
    const otherAdjs = allAdjs.filter(a => a.category !== "Evaluación de Performance");

    // Eliminar todos los ajustes de performance anteriores
    for (const adj of performanceAdjs) {
      await base44.entities.ScoreAdjustment.delete(adj.id);
    }

    // Calcular el impacto de otros ajustes (puntualidad, vehículo, feedback, etc.)
    const otherImpact = otherAdjs.reduce((sum, a) => sum + (a.points_impact || 0), 0);

    if (allReviewsForCleaner.length === 0) {
      await base44.entities.MonthlyCleanerScore.update(monthlyScore.id, {
        current_score: Math.max(0, Math.min(100, 100 + otherImpact)),
      });
      return;
    }

    // Calcular promedio de todas las evaluaciones y su impacto SIN APROXIMAR
    const avgScore = allReviewsForCleaner.reduce((s, r) => s + (r.overall_score || 0), 0) / allReviewsForCleaner.length;
    const avgImpact = calcPointsImpact(avgScore);

    // Crear UN SOLO ajuste nuevo con el promedio
    if (avgImpact !== 0) {
      await base44.entities.ScoreAdjustment.create({
        monthly_score_id: monthlyScore.id,
        cleaner_id: cleanerId,
        month_period: monthPeriod,
        adjustment_type: "deduction",
        category: "Evaluación de Performance",
        points_impact: avgImpact,
        notes: `Promedio de ${allReviewsForCleaner.length} evaluación(es): ${avgScore % 1 === 0 ? avgScore : avgScore.toFixed(2)}/100`,
        admin_id: user.id,
        admin_name: user.full_name,
        date_applied: new Date().toISOString(),
      });
    }

    // Score final = 100 + todos los otros ajustes + el nuevo ajuste de performance
    const newScore = Math.max(0, Math.min(100, 100 + otherImpact + avgImpact));
    await base44.entities.MonthlyCleanerScore.update(monthlyScore.id, { current_score: newScore });
  };

  const handleSave = async () => {
    if (!selectedCleaner) { alert("Por favor selecciona un limpiador."); return; }
    setSaving(true);
    try {
      const client = clients.find(c => c.id === selectedClientId);

      // Build area_scores for saving
      const areaScoresForSave = areaStates.map(state => {
        const area = AREAS.find(a => a.key === state.area_key);
        const earned = getAreaEarned(state);
        return {
          area_key: state.area_key,
          area_name: area?.name || state.area_key,
          max_points: area?.max || 0,
          score: earned !== null ? earned : 0,
          included: state.included,
          checklist: state.checklist,
          config_items: state.config_items || [],
          notes: state.notes,
          photos: state.photos || [],
        };
      });

      if (editingReview) {
        await base44.entities.PerformanceReview.update(editingReview.id, {
          review_date: reviewDate,
          client_id: selectedClientId || null,
          client_name: client?.name || editingReview.client_name || "",
          area_scores: areaScoresForSave,
          overall_score: overallScore,
          general_notes: generalNotes,
        });
      } else {
        await base44.entities.PerformanceReview.create({
          cleaner_id: selectedCleaner.id,
          cleaner_name: selectedCleaner.invoice_name || selectedCleaner.full_name,
          review_date: reviewDate,
          month_period: monthPeriod,
          client_id: selectedClientId || null,
          client_name: client?.name || "",
          reviewed_by_admin: user.id,
          reviewed_by_admin_name: user.full_name,
          area_scores: areaScoresForSave,
          overall_score: overallScore,
          general_notes: generalNotes,
        });
      }

      // Reload reviews to get updated list, then recalculate average
      const updatedReviews = await base44.entities.PerformanceReview.filter({ month_period: monthPeriod });
      const cleanerReviews = updatedReviews.filter(r => r.cleaner_id === selectedCleaner.id);
      const monthlyScore = monthlyScores.find(s => s.cleaner_id === selectedCleaner.id);
      await applyAveragePerformanceScore(selectedCleaner.id, cleanerReviews, monthlyScore);

      setShowDialog(false);
      setEditingReview(null);
      setReviews(updatedReviews);
      if (onScoreApplied) onScoreApplied();
    } catch (e) {
      console.error(e);
      alert("Error guardando la evaluación");
    }
    setSaving(false);
  };

  const handleDelete = async (review) => {
    if (!confirm(`¿Eliminar la evaluación de ${review.cleaner_name} del ${format(parseISO(review.review_date), "d MMM yyyy", { locale: es })}?`)) return;
    setDeletingId(review.id);
    try {
      await base44.entities.PerformanceReview.delete(review.id);
      const updatedReviews = await base44.entities.PerformanceReview.filter({ month_period: monthPeriod });
      const cleanerReviews = updatedReviews.filter(r => r.cleaner_id === review.cleaner_id);
      const monthlyScore = monthlyScores.find(s => s.cleaner_id === review.cleaner_id);
      await applyAveragePerformanceScore(review.cleaner_id, cleanerReviews, monthlyScore);
      setReviews(updatedReviews);
      if (onScoreApplied) onScoreApplied();
    } catch (e) {
      console.error(e);
      alert("Error eliminando la evaluación");
    }
    setDeletingId(null);
  };

  const participatingCleaners = limpiadores.filter(c =>
    monthlyScores.some(s => s.cleaner_id === c.id && s.is_participating)
  );

  // Coverage stats — use ALL limpiadores (active), not just participating
  const allActiveLimpiadores = limpiadores;
  const reviewCountByCleaner = {};
  reviews.forEach(r => {
    reviewCountByCleaner[r.cleaner_id] = (reviewCountByCleaner[r.cleaner_id] || 0) + 1;
  });
  const maxReviews = Math.max(0, ...Object.values(reviewCountByCleaner));
  const reviewedCleaners = allActiveLimpiadores.filter(c => reviewCountByCleaner[c.id] > 0)
    .sort((a, b) => (reviewCountByCleaner[b.id] || 0) - (reviewCountByCleaner[a.id] || 0));
  const notReviewedCleaners = allActiveLimpiadores.filter(c => !reviewCountByCleaner[c.id]);

  const allReviewsSorted = [...reviews].sort((a, b) => new Date(b.review_date) - new Date(a.review_date));
  const totalHistoryPages = Math.ceil(allReviewsSorted.length / HISTORY_PAGE_SIZE);
  const pagedHistory = allReviewsSorted.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Evaluaciones de Performance por Casa</h3>
          <p className="text-sm text-slate-500">Evalúa por área con checklist — las áreas no realizadas se excluyen del cálculo</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className="bg-blue-100 text-blue-800">{reviews.length} evaluaciones este mes</Badge>
          <Button variant="outline" onClick={() => setShowConfigModal(true)}>
            <Settings className="w-4 h-4 mr-1" /> Configurar Checklist
          </Button>
          <Button onClick={() => openDialog(null)}>
            <Plus className="w-4 h-4 mr-1" /> Nueva Evaluación
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" /></div>
      ) : (
        <Tabs defaultValue="coverage">
          <TabsList className="mb-4">
            <TabsTrigger value="coverage" className="flex items-center gap-1.5">
              <BarChart2 className="w-4 h-4" /> Estado de Revisiones
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4" /> Historial
            </TabsTrigger>
            <TabsTrigger value="reports" className="flex items-center gap-1.5">
              <Search className="w-4 h-4" /> Reportes
            </TabsTrigger>
          </TabsList>

          {/* ─── TAB: COVERAGE ─── */}
          <TabsContent value="coverage" className="space-y-4">
            {/* Summary pills */}
            <div className="flex gap-3 flex-wrap">
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-sm font-semibold text-green-700">{reviewedCleaners.length} revisados</span>
              </div>
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 text-red-500" />
                <span className="text-sm font-semibold text-red-600">{notReviewedCleaners.length} sin revisar</span>
              </div>
              {maxReviews > 0 && (
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                  <BarChart2 className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-semibold text-blue-700">Máx. {maxReviews} revisión(es)</span>
                </div>
              )}
            </div>

            {/* Pending */}
            {notReviewedCleaners.length > 0 && (
              <Card className="border-0 shadow-md">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2 text-red-600">
                    <AlertCircle className="w-4 h-4" /> Sin revisión este mes ({notReviewedCleaners.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {notReviewedCleaners.map(c => (
                      <div key={c.id} className="flex items-center justify-between bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center">
                            <User className="w-3.5 h-3.5 text-red-500" />
                          </div>
                          <span className="text-sm font-medium text-slate-700">{c.invoice_name || c.full_name}</span>
                        </div>
                        <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => openDialog(c)}>
                          <Plus className="w-3 h-3 mr-1" /> Evaluar
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Reviewed */}
            {reviewedCleaners.length > 0 && (
              <Card className="border-0 shadow-md">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2 text-green-600">
                    <CheckCircle2 className="w-4 h-4" /> Revisados este mes ({reviewedCleaners.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {reviewedCleaners.map(c => {
                      const count = reviewCountByCleaner[c.id] || 0;
                      const cleanerReviews = reviews.filter(r => r.cleaner_id === c.id);
                      const avg = cleanerReviews.reduce((s, r) => s + (r.overall_score || 0), 0) / cleanerReviews.length;
                      const barWidth = maxReviews > 0 ? Math.round((count / maxReviews) * 100) : 100;
                      return (
                        <div key={c.id} className="bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center">
                                <User className="w-3.5 h-3.5 text-green-600" />
                              </div>
                              <span className="text-sm font-medium text-slate-700">{c.invoice_name || c.full_name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-500">{count}x</span>
                              <ScoreBadge score={avg} />
                            </div>
                          </div>
                          {/* Mini bar showing review count relative to max */}
                          <div className="h-1.5 bg-green-100 rounded-full overflow-hidden">
                            <div className="h-full bg-green-400 rounded-full transition-all" style={{ width: `${barWidth}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {allActiveLimpiadores.length === 0 && (
              <div className="text-center py-10 text-slate-400">
                <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No hay limpiadores activos.</p>
              </div>
            )}
          </TabsContent>

          {/* ─── TAB: HISTORY ─── */}
          <TabsContent value="history">
            {reviews.length > 0 ? (
              <Card className="border-0 shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingUp className="w-4 h-4" /> Historial de Evaluaciones
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {pagedHistory.map(r => (
                      <div key={r.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg gap-3">
                        <div className="flex-1 min-w-0">
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
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className="text-right flex flex-col items-end gap-1">
                            <ScoreBadge score={r.overall_score || 0} />
                            {r.points_impact !== 0 && (
                              <span className="text-xs text-red-600 font-medium">{r.points_impact} pts ranking</span>
                            )}
                          </div>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-blue-600" onClick={() => openEditDialog(r)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-red-600" disabled={deletingId === r.id} onClick={() => handleDelete(r)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
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
            ) : (
              <div className="text-center py-12 text-slate-500">
                <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p>No hay evaluaciones este mes.</p>
              </div>
            )}
          </TabsContent>

          {/* ─── TAB: REPORTS ─── */}
          <TabsContent value="reports">
            <PerformanceReportsTab limpiadores={limpiadores} />
          </TabsContent>
        </Tabs>
      )}

      <ChecklistConfigModal open={showConfigModal} onClose={handleConfigSaved} />

      {/* Dialog nueva evaluación */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5" />
              {editingReview ? "Editar Evaluación de Performance" : "Nueva Evaluación de Performance"}
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
                onValueChange={(id) => setSelectedCleaner(limpiadores.find(l => l.id === id) || null)}
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
                <Input type="date" value={reviewDate} onChange={e => setReviewDate(e.target.value)} />
              </div>
              <div>
                <Label className="font-semibold flex items-center gap-1 mb-1">
                  <Home className="w-4 h-4" /> Cliente / Casa
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    value={clientSearch}
                    onChange={e => { setClientSearch(e.target.value); setSelectedClientId(""); setShowClientDropdown(true); }}
                    onFocus={() => setShowClientDropdown(true)}
                    placeholder="Buscar cliente..."
                    className="pl-9 pr-8"
                  />
                  {clientSearch && (
                    <button onClick={() => { setClientSearch(""); setSelectedClientId(""); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  {showClientDropdown && filteredClients.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {filteredClients.map(c => (
                        <button key={c.id} onClick={() => selectClient(c)} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-0">
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
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-semibold">Evaluación por Área</Label>
                <span className="text-xs text-slate-500">{includedCount} de {AREAS.length} áreas incluidas</span>
              </div>

              <div className="space-y-3">
                {AREAS.map(area => {
                  const state = areaStates.find(a => a.area_key === area.key);
                  if (!state) return null;
                  const colors = AREA_COLORS[area.color];
                  const configItems = state.config_items || [];
                  const earned = getAreaEarned(state);
                  const allChecked = configItems.every(i => state.checklist[i.key]);
                  const anyChecked = configItems.some(i => state.checklist[i.key]);
                  const { defaultWeights } = getAreaItemWeights(state);

                  return (
                    <div key={area.key} className={`rounded-lg border transition-all ${state.included ? `${colors.bg} ${colors.border}` : "bg-slate-50 border-slate-200 opacity-60"}`}>
                      {/* Header del área */}
                      <div className="flex items-center justify-between p-3">
                        <div className="flex items-center gap-3">
                          <Switch
                            checked={state.included}
                            onCheckedChange={() => toggleAreaIncluded(area.key)}
                          />
                          <div>
                            <span className={`font-semibold text-sm ${state.included ? colors.text : "text-slate-500"}`}>
                              {area.name}
                            </span>
                            {!state.included && (
                              <span className="ml-2 text-xs text-slate-400">(no se realizó en este servicio)</span>
                            )}
                          </div>
                        </div>
                        {state.included && (
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-bold ${colors.text}`}>
                              {earned} / {getAreaMax(state)} pts
                            </span>
                            <Badge className={`text-xs ${allChecked ? "bg-green-100 text-green-800" : anyChecked ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"}`}>
                              {getAreaMax(state) > 0 ? Math.round((earned / getAreaMax(state)) * 100) : 0}%
                            </Badge>
                          </div>
                        )}
                      </div>

                      {/* Checklist items */}
                      {state.included && (
                        <div className="px-3 pb-3 space-y-2 border-t border-opacity-30" style={{ borderColor: "currentColor" }}>
                          <div className="pt-2 space-y-1.5">
                            {configItems.map(item => (
                              <div key={item.key} className="flex items-center justify-between gap-3">
                                <label className="flex items-center gap-2 cursor-pointer flex-1">
                                  <Checkbox
                                    checked={!!state.checklist[item.key]}
                                    onCheckedChange={() => toggleChecklistItem(area.key, item.key)}
                                  />
                                  <span className={`text-sm ${state.checklist[item.key] ? "text-slate-700" : "text-slate-400 line-through"}`}>
                                    {item.label}
                                  </span>
                                </label>
                                <span className={`text-xs font-medium flex-shrink-0 ${state.checklist[item.key] ? colors.text : "text-slate-300"}`}>
                                  {state.checklist[item.key] ? `+${Math.round(defaultWeights[item.key] || 0)}` : `0/${Math.round(defaultWeights[item.key] || 0)}`} pts
                                </span>
                              </div>
                            ))}
                          </div>
                          <Textarea
                            value={state.notes}
                            onChange={e => updateAreaNotes(area.key, e.target.value)}
                            placeholder={`Observaciones de ${area.name.toLowerCase()}... (opcional)`}
                            rows={1}
                            className="text-sm mt-2"
                          />
                          {/* Fotos del área */}
                          <div className="mt-2">
                            {(state.photos || []).length > 0 && (
                              <div className="flex flex-wrap gap-2 mb-2">
                                {state.photos.map((photo, idx) => (
                                  <div key={idx} className="relative group">
                                    <img src={photo.url} alt={`foto-${idx}`} className="w-16 h-16 object-cover rounded-md border border-slate-200" />
                                    <button
                                      type="button"
                                      onClick={() => removeAreaPhoto(area.key, idx)}
                                      className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                      <X className="w-2.5 h-2.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                            <label className={`inline-flex items-center gap-1.5 text-xs cursor-pointer px-2 py-1 rounded border border-dashed ${colors.border} ${colors.text} hover:opacity-80 transition-opacity`}>
                              <Camera className="w-3.5 h-3.5" />
                              Adjuntar foto
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={e => { if (e.target.files?.[0]) addAreaPhoto(area.key, e.target.files[0]); e.target.value = ""; }}
                              />
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Resumen de puntaje */}
            <div className={`p-4 rounded-lg border ${overallScore >= 90 ? "bg-green-50 border-green-200" : overallScore >= 75 ? "bg-blue-50 border-blue-200" : overallScore >= 60 ? "bg-yellow-50 border-yellow-200" : "bg-red-50 border-red-200"}`}>
              <div className="flex justify-between items-center">
                <div>
                  <span className="font-semibold">Puntaje Total</span>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Normalizado sobre {includedCount} área{includedCount !== 1 ? "s" : ""} incluida{includedCount !== 1 ? "s" : ""}
                  </p>
                </div>
                <span className="text-3xl font-bold">{overallScore % 1 === 0 ? overallScore : overallScore.toFixed(2)} <span className="text-base font-normal text-slate-500">/ 100</span></span>
              </div>
              {calcPointsImpact(overallScore) < 0 && (
                <p className="text-sm text-red-600 mt-1">Impacto en ranking: {calcPointsImpact(overallScore) % 1 === 0 ? Math.round(calcPointsImpact(overallScore)) : calcPointsImpact(overallScore).toFixed(2)} pts</p>
              )}
              {overallScore === 100 && (
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