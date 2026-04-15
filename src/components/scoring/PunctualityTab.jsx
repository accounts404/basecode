import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Plus, AlertTriangle, CheckCircle, User, Shirt } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

// incidentType: "punctuality" | "presentation"
const calcPunctualityPoints = (minutes, absence) => {
  if (absence) return -15;
  if (minutes > 15) return -5;
  if (minutes > 5) return -2;
  return 0;
};

const calcPresentationPoints = (uniform, presentation) => {
  let pts = 0;
  if (!uniform) pts -= 3;
  if (!presentation) pts -= 2;
  return pts;
};

export default function PunctualityTab({ monthPeriod, limpiadores, monthlyScores, user, onScoreApplied }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCleaner, setFilterCleaner] = useState("all");
  const [showDialog, setShowDialog] = useState(false);
  const [incidentType, setIncidentType] = useState("punctuality"); // "punctuality" | "presentation"
  const [selectedCleaner, setSelectedCleaner] = useState(null); // objeto completo del limpiador
  const [formData, setFormData] = useState({
    date: format(new Date(), "yyyy-MM-dd"),
    scheduled_time: "",
    actual_clock_in: "",
    uniform_ok: true,
    presentation_ok: true,
    absence: false,
    notes: ""
  });
  const [customPoints, setCustomPoints] = useState({
    uniform_pts: 3,
    presentation_pts: 2,
    absence_pts: 15,
    late_5_pts: 2,
    late_15_pts: 5,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadRecords();
  }, [monthPeriod]);

  const loadRecords = async () => {
    setLoading(true);
    try {
      const data = await base44.entities.PunctualityRecord.filter({ month_period: monthPeriod });
      setRecords(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const minutesLate = () => {
    if (formData.absence) return 0;
    if (!formData.scheduled_time || !formData.actual_clock_in) return 0;
    const [sh, sm] = formData.scheduled_time.split(":").map(Number);
    const [ah, am] = formData.actual_clock_in.split(":").map(Number);
    return Math.max(0, (ah * 60 + am) - (sh * 60 + sm));
  };

  const previewPoints = () => {
    if (incidentType === "punctuality") {
      if (formData.absence) return -customPoints.absence_pts;
      const mins = minutesLate();
      if (mins > 15) return -customPoints.late_15_pts;
      if (mins > 5) return -customPoints.late_5_pts;
      return 0;
    } else {
      let pts = 0;
      if (!formData.uniform_ok) pts -= customPoints.uniform_pts;
      if (!formData.presentation_ok) pts -= customPoints.presentation_pts;
      return pts;
    }
  };

  const openDialog = (type) => {
    setIncidentType(type);
    setSelectedCleaner(null);
    setFormData({ date: format(new Date(), "yyyy-MM-dd"), scheduled_time: "", actual_clock_in: "", uniform_ok: true, presentation_ok: true, absence: false, notes: "" });
    setCustomPoints({ uniform_pts: 3, presentation_pts: 2, absence_pts: 15, late_5_pts: 2, late_15_pts: 5 });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!selectedCleaner) { alert("Selecciona un limpiador"); return; }
    setSaving(true);
    try {
      const cleaner = selectedCleaner;
      const mins = minutesLate();
      const impact = previewPoints();
      const monthlyScore = monthlyScores.find(s => s.cleaner_id === selectedCleaner.id);

      let adjustmentId = null;
      if (monthlyScore && impact !== 0) {
        let reason = "";
        if (incidentType === "punctuality") {
          reason = formData.absence ? "Ausencia no notificada" : `Retraso de ${mins} min`;
        } else {
          const parts = [];
          if (!formData.uniform_ok) parts.push("Uniforme incompleto");
          if (!formData.presentation_ok) parts.push("Mala presentación personal");
          reason = parts.join(" + ");
        }

        const adj = await base44.entities.ScoreAdjustment.create({
          monthly_score_id: monthlyScore.id,
          cleaner_id: selectedCleaner.id,
          month_period: monthPeriod,
          adjustment_type: "deduction",
          category: incidentType === "punctuality" ? "Puntualidad" : "Uniforme y Presentación",
          points_impact: impact,
          notes: `${reason}. ${formData.notes || ""}`.trim(),
          admin_id: user.id,
          admin_name: user.full_name,
          date_applied: new Date().toISOString()
        });
        adjustmentId = adj.id;
        const newScore = Math.max(0, monthlyScore.current_score + impact);
        await base44.entities.MonthlyCleanerScore.update(monthlyScore.id, { current_score: newScore });
      }

      await base44.entities.PunctualityRecord.create({
        cleaner_id: selectedCleaner.id,
        cleaner_name: cleaner.invoice_name || cleaner.full_name,
        date: formData.date,
        month_period: monthPeriod,
        incident_type: incidentType,
        scheduled_time: incidentType === "punctuality" ? formData.scheduled_time : null,
        actual_clock_in: incidentType === "punctuality" ? formData.actual_clock_in : null,
        minutes_late: incidentType === "punctuality" ? mins : 0,
        uniform_ok: incidentType === "presentation" ? formData.uniform_ok : true,
        presentation_ok: incidentType === "presentation" ? formData.presentation_ok : true,
        absence: incidentType === "punctuality" ? formData.absence : false,
        notes: formData.notes,
        points_impact: impact,
        registered_by_admin: user.id,
        score_adjustment_id: adjustmentId
      });

      setShowDialog(false);
      await loadRecords();
      if (onScoreApplied) onScoreApplied();
    } catch (e) {
      console.error(e);
      alert("Error guardando el registro");
    }
    setSaving(false);
  };

  const participatingCleaners = limpiadores.filter(c => monthlyScores.some(s => s.cleaner_id === c.id && s.is_participating));

  const visibleCleaners = filterCleaner === "all"
    ? participatingCleaners
    : participatingCleaners.filter(c => c.id === filterCleaner);

  // Stats por limpiador
  const statsByCleaner = {};
  records.forEach(r => {
    if (!statsByCleaner[r.cleaner_id]) statsByCleaner[r.cleaner_id] = { total: 0, issues: 0, totalPts: 0 };
    statsByCleaner[r.cleaner_id].total++;
    if (r.points_impact < 0) statsByCleaner[r.cleaner_id].issues++;
    statsByCleaner[r.cleaner_id].totalPts += r.points_impact;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Puntualidad y Presentación Personal</h3>
          <p className="text-sm text-slate-500">Registra retrasos, ausencias e incumplimientos de presentación</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={filterCleaner} onValueChange={setFilterCleaner}>
            <SelectTrigger className="w-48">
              <User className="w-4 h-4 mr-1 text-slate-400" />
              <SelectValue placeholder="Todos los limpiadores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los limpiadores</SelectItem>
              {participatingCleaners.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.invoice_name || c.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => openDialog("presentation")} className="border-purple-300 text-purple-700 hover:bg-purple-50">
            <Shirt className="w-4 h-4 mr-1" /> Uniforme / Presentación
          </Button>
          <Button onClick={() => openDialog("punctuality")}>
            <Clock className="w-4 h-4 mr-1" /> Llegada Tarde / Ausencia
          </Button>
        </div>
      </div>

      {/* Tabla de penalizaciones */}
      <Card className="border-0 shadow-sm bg-amber-50 border-amber-200">
        <CardContent className="p-4">
          <p className="text-sm font-semibold text-amber-800 mb-2">Tabla de Penalizaciones:</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            {[
              { label: "Retraso 6-15 min", pts: -2 },
              { label: "Retraso +15 min", pts: -5 },
              { label: "Uniforme incompleto", pts: -3 },
              { label: "Mala presentación", pts: -2 },
              { label: "Ausencia sin avisar", pts: -15 },
            ].map(p => (
              <div key={p.label} className="bg-white rounded p-2 text-center border border-amber-200">
                <p className="text-red-600 font-bold">{p.pts} pts</p>
                <p className="text-slate-600">{p.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Cards de limpiadores */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleCleaners.map(cleaner => {
          const stats = statsByCleaner[cleaner.id];
          const cleanerRecords = records.filter(r => r.cleaner_id === cleaner.id).sort((a, b) => new Date(b.date) - new Date(a.date));

          return (
            <Card key={cleaner.id} className="border-0 shadow-md">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                    <Clock className="w-5 h-5 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{cleaner.invoice_name || cleaner.full_name}</p>
                    <p className="text-xs text-slate-500">{stats ? stats.total : 0} registros · {stats ? stats.issues : 0} incidencias</p>
                  </div>
                  {stats && (
                    <div className={`text-lg font-bold ${stats.totalPts < 0 ? "text-red-600" : "text-green-600"}`}>
                      {stats.totalPts > 0 ? "+" : ""}{stats.totalPts}
                    </div>
                  )}
                </div>

                {(filterCleaner === "all" ? cleanerRecords.slice(0, 2) : cleanerRecords).map(r => (
                  <div key={r.id} className={`text-xs p-2 rounded mb-1 ${r.points_impact < 0 ? "bg-red-50 border border-red-200" : "bg-green-50 border border-green-200"}`}>
                    <div className="flex justify-between">
                      <span>{format(new Date(r.date), "d MMM", { locale: es })} — {r.absence ? "Ausencia" : r.minutes_late > 0 ? `${r.minutes_late} min tarde` : !r.uniform_ok ? "Sin uniforme" : "OK"}</span>
                      <span className={r.points_impact < 0 ? "text-red-600 font-bold" : "text-green-600 font-bold"}>{r.points_impact}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}

        {visibleCleaners.length === 0 && (
          <div className="col-span-3 text-center py-12 text-slate-500">
            <Clock className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>No hay limpiadores participando este mes.</p>
          </div>
        )}
      </div>

      {/* Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {incidentType === "punctuality"
                ? <><Clock className="w-5 h-5 text-orange-500" /> Registrar Llegada Tarde / Ausencia</>
                : <><Shirt className="w-5 h-5 text-purple-500" /> Registrar Uniforme / Presentación Personal</>
              }
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="font-semibold flex items-center gap-1 mb-1">
                <User className="w-4 h-4" /> Limpiador *
              </Label>
              <Select
                value={selectedCleaner?.id || ""}
                onValueChange={(id) => setSelectedCleaner(limpiadores.find(l => l.id === id) || null)}
              >
                <SelectTrigger><SelectValue placeholder="Seleccionar limpiador..." /></SelectTrigger>
                <SelectContent>
                  {limpiadores.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.invoice_name || c.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Fecha *</Label>
              <Input type="date" value={formData.date} onChange={e => setFormData(p => ({ ...p, date: e.target.value }))} />
            </div>

            {incidentType === "punctuality" && (
              <>
                <div className={`flex items-center justify-between p-3 rounded-lg border ${formData.absence ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-200"}`}>
                  <Label className="font-semibold">Ausencia sin notificar</Label>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-500">-</span>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={customPoints.absence_pts}
                        onChange={e => setCustomPoints(p => ({ ...p, absence_pts: Math.max(1, Number(e.target.value)) }))}
                        className="w-16 h-7 text-sm text-center"
                      />
                      <span className="text-xs text-slate-500">pts</span>
                    </div>
                    <Switch checked={formData.absence} onCheckedChange={v => setFormData(p => ({ ...p, absence: v }))} />
                  </div>
                </div>

                {!formData.absence && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Hora programada</Label>
                        <Input type="time" value={formData.scheduled_time} onChange={e => setFormData(p => ({ ...p, scheduled_time: e.target.value }))} />
                      </div>
                      <div>
                        <Label>Hora real de llegada</Label>
                        <Input type="time" value={formData.actual_clock_in} onChange={e => setFormData(p => ({ ...p, actual_clock_in: e.target.value }))} />
                      </div>
                    </div>
                    {minutesLate() > 0 && (
                      <div className="text-sm bg-orange-50 p-2 rounded border border-orange-200 text-orange-800">
                        ⏱ Retraso: {minutesLate()} minutos
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                        <p className="text-xs text-slate-500 mb-1">Puntos por retraso 6-15 min</p>
                        <div className="flex items-center gap-1">
                          <span className="text-sm text-slate-500">-</span>
                          <Input
                            type="number"
                            min={1}
                            max={100}
                            value={customPoints.late_5_pts}
                            onChange={e => setCustomPoints(p => ({ ...p, late_5_pts: Math.max(1, Number(e.target.value)) }))}
                            className="w-full h-8 text-sm text-center"
                          />
                          <span className="text-sm text-slate-500">pts</span>
                        </div>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                        <p className="text-xs text-slate-500 mb-1">Puntos por retraso +15 min</p>
                        <div className="flex items-center gap-1">
                          <span className="text-sm text-slate-500">-</span>
                          <Input
                            type="number"
                            min={1}
                            max={100}
                            value={customPoints.late_15_pts}
                            onChange={e => setCustomPoints(p => ({ ...p, late_15_pts: Math.max(1, Number(e.target.value)) }))}
                            className="w-full h-8 text-sm text-center"
                          />
                          <span className="text-sm text-slate-500">pts</span>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            {incidentType === "presentation" && (
              <div className="space-y-3">
                <div className={`flex items-center justify-between p-3 rounded-lg border ${formData.uniform_ok ? "bg-slate-50 border-slate-200" : "bg-red-50 border-red-200"}`}>
                  <div>
                    <Label className="font-semibold">Uniforme completo</Label>
                    <p className="text-xs text-slate-500">Puntos si incompleto:</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-500">-</span>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={customPoints.uniform_pts}
                        onChange={e => setCustomPoints(p => ({ ...p, uniform_pts: Math.max(1, Number(e.target.value)) }))}
                        className="w-16 h-7 text-sm text-center"
                      />
                      <span className="text-xs text-slate-500">pts</span>
                    </div>
                    <Switch checked={formData.uniform_ok} onCheckedChange={v => setFormData(p => ({ ...p, uniform_ok: v }))} />
                  </div>
                </div>
                <div className={`flex items-center justify-between p-3 rounded-lg border ${formData.presentation_ok ? "bg-slate-50 border-slate-200" : "bg-red-50 border-red-200"}`}>
                  <div>
                    <Label className="font-semibold">Presentación personal adecuada</Label>
                    <p className="text-xs text-slate-500">Puntos si inadecuada:</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-500">-</span>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={customPoints.presentation_pts}
                        onChange={e => setCustomPoints(p => ({ ...p, presentation_pts: Math.max(1, Number(e.target.value)) }))}
                        className="w-16 h-7 text-sm text-center"
                      />
                      <span className="text-xs text-slate-500">pts</span>
                    </div>
                    <Switch checked={formData.presentation_ok} onCheckedChange={v => setFormData(p => ({ ...p, presentation_ok: v }))} />
                  </div>
                </div>
              </div>
            )}

            <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
              <p className="text-sm font-semibold text-blue-800">
                Impacto estimado: <span className={previewPoints() < 0 ? "text-red-600" : "text-green-600"}>{previewPoints()} puntos</span>
              </p>
            </div>

            <div>
              <Label>Notas adicionales</Label>
              <Textarea value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} placeholder="Detalles del incidente..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Guardando..." : "Registrar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}