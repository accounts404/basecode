import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Star, Plus, ClipboardList, TrendingUp, User } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const SCORE_LABELS = { 1: "Muy Malo", 2: "Malo", 3: "Regular", 4: "Bueno", 5: "Excelente" };
const SCORE_COLORS = { 1: "text-red-600", 2: "text-orange-500", 3: "text-yellow-500", 4: "text-blue-500", 5: "text-green-600" };

const CRITERIA = [
  { key: "quality_score", label: "Calidad de Limpieza", description: "¿El trabajo quedó bien hecho según estándares?" },
  { key: "instructions_followed", label: "Seguimiento de Instrucciones", description: "¿Siguió las notas e instrucciones del cliente?" },
  { key: "teamwork", label: "Trabajo en Equipo", description: "¿Cooperó bien con el resto del equipo?" },
  { key: "problem_reporting", label: "Reporte de Problemas", description: "¿Reportó incidencias de forma correcta y oportuna?" },
  { key: "productivity", label: "Productividad", description: "¿Completó los servicios dentro del tiempo asignado?" },
  { key: "initiative", label: "Iniciativa y Actitud", description: "¿Fue más allá de lo requerido? ¿Actitud positiva?" },
];

function StarRating({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className={`text-2xl transition-colors ${star <= value ? "text-yellow-400" : "text-slate-300"} hover:text-yellow-400`}
        >
          ★
        </button>
      ))}
      {value > 0 && (
        <span className={`ml-2 text-sm font-medium self-center ${SCORE_COLORS[value]}`}>
          {SCORE_LABELS[value]}
        </span>
      )}
    </div>
  );
}

export default function PerformanceTab({ monthPeriod, limpiadores, monthlyScores, user, onScoreApplied }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [selectedCleaner, setSelectedCleaner] = useState(null);
  const [scores, setScores] = useState({ quality_score: 0, instructions_followed: 0, teamwork: 0, problem_reporting: 0, productivity: 0, initiative: 0 });
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadReviews();
  }, [monthPeriod]);

  const loadReviews = async () => {
    setLoading(true);
    try {
      const data = await base44.entities.PerformanceReview.filter({ month_period: monthPeriod });
      setReviews(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const openDialog = (cleaner) => {
    setSelectedCleaner(cleaner);
    setScores({ quality_score: 0, instructions_followed: 0, teamwork: 0, problem_reporting: 0, productivity: 0, initiative: 0 });
    setNotes("");
    setShowDialog(true);
  };

  const calculateAverage = () => {
    const vals = Object.values(scores).filter(v => v > 0);
    if (vals.length === 0) return 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  const calculatePointsImpact = (avg) => {
    if (avg >= 4.5) return 10;
    if (avg >= 4.0) return 5;
    if (avg >= 3.5) return 0;
    if (avg >= 2.5) return -5;
    return -10;
  };

  const handleSave = async () => {
    const filledCount = Object.values(scores).filter(v => v > 0).length;
    if (filledCount < 3) {
      alert("Por favor evalúa al menos 3 criterios.");
      return;
    }
    setSaving(true);
    try {
      const avg = calculateAverage();
      const impact = calculatePointsImpact(avg);

      const monthlyScore = monthlyScores.find(s => s.cleaner_id === selectedCleaner.id);
      let adjustmentId = null;

      if (monthlyScore && impact !== 0) {
        const adj = await base44.entities.ScoreAdjustment.create({
          monthly_score_id: monthlyScore.id,
          cleaner_id: selectedCleaner.id,
          month_period: monthPeriod,
          adjustment_type: impact > 0 ? "bonus" : "deduction",
          category: "Evaluación de Performance",
          points_impact: impact,
          notes: `Promedio: ${avg.toFixed(1)}/5 - ${notes || "Sin notas adicionales"}`,
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
        review_date: format(new Date(), "yyyy-MM-dd"),
        month_period: monthPeriod,
        reviewed_by_admin: user.id,
        reviewed_by_admin_name: user.full_name,
        ...scores,
        overall_average: avg,
        notes,
        points_impact: impact,
        score_adjustment_id: adjustmentId
      });

      setShowDialog(false);
      await loadReviews();
      if (onScoreApplied) onScoreApplied();
    } catch (e) {
      console.error(e);
      alert("Error guardando la evaluación");
    }
    setSaving(false);
  };

  const participatingCleaners = limpiadores.filter(c => monthlyScores.some(s => s.cleaner_id === c.id && s.is_participating));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Evaluaciones de Performance</h3>
          <p className="text-sm text-slate-500">Evalúa el desempeño general de cada limpiador en base a 6 criterios</p>
        </div>
        <Badge className="bg-blue-100 text-blue-800">{reviews.length} evaluaciones este mes</Badge>
      </div>

      {/* Grid de limpiadores */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {participatingCleaners.map(cleaner => {
          const cleanerReviews = reviews.filter(r => r.cleaner_id === cleaner.id);
          const lastReview = cleanerReviews.sort((a, b) => new Date(b.review_date) - new Date(a.review_date))[0];
          const avgScore = cleanerReviews.length > 0
            ? cleanerReviews.reduce((s, r) => s + r.overall_average, 0) / cleanerReviews.length
            : null;

          return (
            <Card key={cleaner.id} className="border-0 shadow-md">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <User className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{cleaner.invoice_name || cleaner.full_name}</p>
                    <p className="text-xs text-slate-500">{cleanerReviews.length} evaluaciones</p>
                  </div>
                  {avgScore !== null && (
                    <div className={`text-lg font-bold ${avgScore >= 4 ? "text-green-600" : avgScore >= 3 ? "text-yellow-600" : "text-red-600"}`}>
                      {avgScore.toFixed(1)}★
                    </div>
                  )}
                </div>

                {lastReview && (
                  <div className="text-xs text-slate-500 mb-3 bg-slate-50 p-2 rounded">
                    Última evaluación: {format(new Date(lastReview.review_date), "d MMM", { locale: es })} —{" "}
                    <span className={lastReview.points_impact > 0 ? "text-green-600" : lastReview.points_impact < 0 ? "text-red-600" : "text-slate-600"}>
                      {lastReview.points_impact > 0 ? "+" : ""}{lastReview.points_impact} pts
                    </span>
                  </div>
                )}

                <Button size="sm" className="w-full" onClick={() => openDialog(cleaner)}>
                  <Plus className="w-4 h-4 mr-1" /> Nueva Evaluación
                </Button>
              </CardContent>
            </Card>
          );
        })}

        {participatingCleaners.length === 0 && (
          <div className="col-span-3 text-center py-12 text-slate-500">
            <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>No hay limpiadores participando este mes.</p>
          </div>
        )}
      </div>

      {/* Historial de evaluaciones */}
      {reviews.length > 0 && (
        <Card className="border-0 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="w-4 h-4" /> Historial de Evaluaciones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {reviews.sort((a, b) => new Date(b.review_date) - new Date(a.review_date)).slice(0, 10).map(r => (
                <div key={r.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <p className="font-medium text-sm">{r.cleaner_name}</p>
                    <p className="text-xs text-slate-500">{format(new Date(r.review_date), "d MMM yyyy", { locale: es })} · Por: {r.reviewed_by_admin_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{r.overall_average?.toFixed(1)}★ / 5</p>
                    <Badge className={r.points_impact > 0 ? "bg-green-100 text-green-800" : r.points_impact < 0 ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700"}>
                      {r.points_impact > 0 ? "+" : ""}{r.points_impact} pts
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog de evaluación */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Evaluación de Performance — {selectedCleaner?.invoice_name || selectedCleaner?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {CRITERIA.map(c => (
              <div key={c.key} className="space-y-1">
                <Label className="font-semibold">{c.label}</Label>
                <p className="text-xs text-slate-500">{c.description}</p>
                <StarRating value={scores[c.key]} onChange={(v) => setScores(prev => ({ ...prev, [c.key]: v }))} />
              </div>
            ))}

            {calculateAverage() > 0 && (
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-blue-800">Promedio General</span>
                  <span className="text-2xl font-bold text-blue-900">{calculateAverage().toFixed(1)}★</span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-sm text-blue-700">Impacto en puntuación</span>
                  <span className={`font-bold ${calculatePointsImpact(calculateAverage()) > 0 ? "text-green-600" : calculatePointsImpact(calculateAverage()) < 0 ? "text-red-600" : "text-slate-600"}`}>
                    {calculatePointsImpact(calculateAverage()) > 0 ? "+" : ""}{calculatePointsImpact(calculateAverage())} pts
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label>Notas adicionales (opcional)</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observaciones sobre el desempeño..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Guardando..." : "Guardar Evaluación"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}