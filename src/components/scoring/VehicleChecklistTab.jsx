import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Car, Plus, Users, AlertTriangle, CheckCircle, FileText, Calendar, X, ChevronDown } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

const DEFAULT_CHECKLIST = [
  { item: "Both caddies clean", points: 1 },
  { item: "Vacuum empty", points: 1 },
  { item: "Dyson brush cleaned", points: 1 },
  { item: "Rubbish or food residue removed", points: 2 },
  { item: "Report of any missing equipment", points: 3 },
  { item: "Report any damaged equipment", points: 3 },
  { item: "Personal belongings left behind", points: 1 },
  { item: "Reporting if the car had any small accident", points: 5 },
  { item: "Reporting any mechanical anomaly on the car", points: 1 },
];
const TOTAL_POSSIBLE = DEFAULT_CHECKLIST.reduce((s, i) => s + i.points, 0);

// Dialog para observaciones cuando falla un item
function ObservationDialog({ item, onConfirm, onCancel }) {
  const [notes, setNotes] = useState("");
  return (
    <Dialog open onOpenChange={onCancel}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="w-5 h-5" /> Item fallido
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="font-semibold text-red-800">{item.item}</p>
            <p className="text-sm text-red-600 mt-1">Puntos que se pierden: -{item.points || item.points_if_fail}</p>
          </div>
          <div>
            <Label className="font-semibold">Observaciones <span className="text-red-500">*</span></Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Describe qué se encontró, condición del item, acciones a tomar..."
              rows={3}
              className="mt-1"
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancelar (marcar como OK)</Button>
          <Button
            onClick={() => onConfirm(notes)}
            disabled={!notes.trim()}
            className="bg-red-600 hover:bg-red-700"
          >
            Confirmar Falla
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Vista de un registro en el reporte
function RecordCard({ record }) {
  const failedItems = record.checklist_items?.filter(i => !i.passed) || [];
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-semibold text-slate-800">
              {format(parseISO(record.date), "EEEE d 'de' MMMM yyyy", { locale: es })}
            </p>
            <p className="text-sm text-slate-500">{record.vehicle_info || "Vehículo no especificado"}</p>
            {record.team_member_names?.length > 0 && (
              <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                <Users className="w-3 h-3" /> {record.team_member_names.join(", ")}
              </p>
            )}
          </div>
          <div className="text-right flex flex-col items-end gap-1">
            {record.total_deduction === 0 ? (
              <Badge className="bg-green-100 text-green-800">✅ Todo OK</Badge>
            ) : (
              <Badge className="bg-red-100 text-red-800">-{record.total_deduction} pts</Badge>
            )}
            {failedItems.length > 0 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-blue-600 hover:underline"
              >
                {expanded ? "Ocultar" : `Ver ${failedItems.length} falla(s)`}
              </button>
            )}
          </div>
        </div>

        {expanded && failedItems.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
            <p className="text-xs font-bold text-red-700 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Items fallidos:
            </p>
            {failedItems.map((item, idx) => (
              <div key={idx} className="bg-red-50 border border-red-100 rounded p-2">
                <div className="flex justify-between items-start">
                  <p className="text-sm font-medium text-red-800">{item.item}</p>
                  <Badge className="bg-red-200 text-red-900 text-xs ml-2 shrink-0">-{item.points_if_fail} pts</Badge>
                </div>
                {item.notes && (
                  <p className="text-xs text-slate-600 mt-1 italic">💬 {item.notes}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {record.general_notes && (
          <p className="text-xs text-slate-500 mt-2 italic border-t pt-2">📝 {record.general_notes}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function VehicleChecklistTab({ monthPeriod, limpiadores, monthlyScores, user, onScoreApplied }) {
  const [records, setRecords] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [dailyAssignments, setDailyAssignments] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [checklist, setChecklist] = useState(DEFAULT_CHECKLIST.map(i => ({ ...i, passed: true, notes: "", points_if_fail: i.points })));
  const [generalNotes, setGeneralNotes] = useState("");
  const [saving, setSaving] = useState(false);
  // Observation dialog
  const [pendingFailIndex, setPendingFailIndex] = useState(null);
  // Report
  const [reportFrom, setReportFrom] = useState(format(new Date(monthPeriod + "-01"), "yyyy-MM-dd"));
  const [reportTo, setReportTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [reportRecords, setReportRecords] = useState([]);
  const [loadingReport, setLoadingReport] = useState(false);
  const [applyingMonthly, setApplyingMonthly] = useState(false);

  // Calcular promedio mensual por limpiador a partir de las revisiones del mes
  const cleanerMonthlyAverages = useMemo(() => {
    const map = {}; // cleanerId -> { totalEarned, count, totalPossible }
    records.forEach(record => {
      const earned = (record.checklist_items || []).reduce((s, i) => i.passed ? s + (i.points || i.points_if_fail || 0) : s, 0);
      const possible = (record.checklist_items || []).reduce((s, i) => s + (i.points || i.points_if_fail || 0), 0);
      (record.team_member_ids || []).forEach(id => {
        if (!map[id]) map[id] = { totalEarned: 0, totalPossible: 0, count: 0 };
        map[id].totalEarned += earned;
        map[id].totalPossible += possible || TOTAL_POSSIBLE;
        map[id].count++;
      });
    });
    // Convertir a puntos sobre TOTAL_POSSIBLE promediados
    return Object.entries(map).map(([cleanerId, data]) => ({
      cleanerId,
      avgEarned: Math.round(data.totalEarned / data.count),
      avgDeduction: Math.round((data.totalPossible / data.count) - (data.totalEarned / data.count)),
      reviewCount: data.count,
    }));
  }, [records]);

  useEffect(() => { loadData(); }, [monthPeriod]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [recs, veh] = await Promise.all([
        base44.entities.VehicleChecklistRecord.filter({ month_period: monthPeriod }),
        base44.entities.Vehicle.list()
      ]);
      setRecords(recs);
      setVehicles(veh);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const totalEarned = checklist.reduce((sum, item) => item.passed ? sum + (item.points || item.points_if_fail) : sum, 0);
  const totalPossible = checklist.reduce((sum, item) => sum + (item.points || item.points_if_fail), 0);
  const totalDeduction = totalPossible - totalEarned; // puntos perdidos por items no completados

  const openDialog = async () => {
    setChecklist(DEFAULT_CHECKLIST.map(i => ({ ...i, passed: true, notes: "", points_if_fail: i.points })));
    setGeneralNotes("");
    setSelectedAssignment(null);
    setSelectedVehicleId("");
    setSelectedMemberIds([]);
    setPendingFailIndex(null);
    try {
      const assignments = await base44.entities.DailyTeamAssignment.filter({ date: selectedDate });
      setDailyAssignments(assignments);
      // No pre-seleccionar nada — el usuario elige el vehículo primero
    } catch (e) { setDailyAssignments([]); }
    setShowDialog(true);
  };

  // Cuando el usuario selecciona un vehículo, autocompletar el equipo desde la asignación de ese vehículo
  const handleVehicleChange = (vehicleId) => {
    setSelectedVehicleId(vehicleId);
    const match = dailyAssignments.find(a => a.vehicle_id === vehicleId);
    if (match) {
      setSelectedAssignment(match);
      setSelectedMemberIds(match.team_member_ids || []);
    } else {
      setSelectedAssignment(null);
      setSelectedMemberIds([]);
    }
  };

  // Cuando el usuario desmarca → abrir dialog de observaciones
  const handleCheckChange = (index, checked) => {
    if (!checked) {
      // Desmarcar: pedir observación
      setPendingFailIndex(index);
    } else {
      // Marcar como OK: limpiar notas
      setChecklist(prev => prev.map((item, i) => i === index ? { ...item, passed: true, notes: "" } : item));
    }
  };

  const handleObservationConfirm = (notes) => {
    setChecklist(prev => prev.map((item, i) =>
      i === pendingFailIndex ? { ...item, passed: false, notes } : item
    ));
    setPendingFailIndex(null);
  };

  const handleObservationCancel = () => {
    // El usuario canceló → el item queda marcado como OK
    setPendingFailIndex(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const vehicle = selectedVehicleId ? vehicles.find(v => v.id === selectedVehicleId) : null;
      const teamIds = selectedMemberIds;
      const teamNames = teamIds.map(id => {
        const l = limpiadores.find(l => l.id === id);
        return l ? l.full_name : id;
      });

      await base44.entities.VehicleChecklistRecord.create({
        date: selectedDate,
        month_period: monthPeriod,
        team_assignment_id: selectedAssignment?.id || null,
        vehicle_id: selectedVehicleId || null,
        vehicle_info: vehicle
          ? `${vehicle.make} ${vehicle.model} ${vehicle.license_plate}`
          : "Vehículo no especificado",
        team_member_ids: teamIds,
        team_member_names: teamNames,
        checklist_items: checklist,
        total_deduction: totalDeduction,
        points_per_member: teamIds.length > 0 ? Math.round(totalDeduction / teamIds.length) : totalDeduction,
        general_notes: generalNotes,
        reviewed_by_admin: user.id,
        reviewed_by_admin_name: user.full_name
      });

      // NO aplicar puntajes individuales ahora — se aplican como promedio mensual al cerrar el mes

      setShowDialog(false);
      await loadData();
      if (onScoreApplied) onScoreApplied();
    } catch (e) {
      console.error(e);
      alert("Error guardando el checklist");
    }
    setSaving(false);
  };

  const applyMonthlyAverages = async () => {
    setApplyingMonthly(true);
    try {
      for (const { cleanerId, avgEarned, avgDeduction, reviewCount } of cleanerMonthlyAverages) {
        const monthlyScore = monthlyScores.find(s => s.cleaner_id === cleanerId);
        if (!monthlyScore) continue;

        // Verificar si ya se aplicó este mes (evitar duplicados)
        const existing = await base44.entities.ScoreAdjustment.filter({
          cleaner_id: cleanerId,
          month_period: monthPeriod,
          category: "Revisión Vehicular (Promedio Mensual)"
        });
        if (existing.length > 0) continue; // ya aplicado

        const impact = avgDeduction > 0 ? -avgDeduction : 0;
        await base44.entities.ScoreAdjustment.create({
          monthly_score_id: monthlyScore.id,
          cleaner_id: cleanerId,
          month_period: monthPeriod,
          adjustment_type: impact < 0 ? "deduction" : "bonus",
          category: "Revisión Vehicular (Promedio Mensual)",
          points_impact: impact !== 0 ? impact : avgEarned,
          notes: `Promedio de ${reviewCount} revisión(es) en el mes. Puntaje promedio: ${avgEarned}/${TOTAL_POSSIBLE} pts`,
          admin_id: user.id,
          admin_name: user.full_name,
          date_applied: new Date().toISOString()
        });
        const newScore = Math.max(0, monthlyScore.current_score + (impact !== 0 ? impact : 0));
        await base44.entities.MonthlyCleanerScore.update(monthlyScore.id, { current_score: newScore });
      }
      alert("✅ Promedios mensuales aplicados al ranking.");
      if (onScoreApplied) onScoreApplied();
    } catch (e) {
      console.error(e);
      alert("Error aplicando promedios");
    }
    setApplyingMonthly(false);
  };

  const loadReport = async () => {
    setLoadingReport(true);
    try {
      const all = await base44.entities.VehicleChecklistRecord.list("-date", 500);
      const filtered = all.filter(r => r.date >= reportFrom && r.date <= reportTo);
      setReportRecords(filtered.sort((a, b) => b.date.localeCompare(a.date)));
    } catch (e) { console.error(e); }
    setLoadingReport(false);
  };

  const reportFailedItems = reportRecords.flatMap(r =>
    (r.checklist_items || []).filter(i => !i.passed).map(i => ({ ...i, date: r.date, vehicle: r.vehicle_info, team: r.team_member_names }))
  );

  // Agrupar fallas por item para el resumen del reporte
  const failSummary = reportFailedItems.reduce((acc, fi) => {
    acc[fi.item] = acc[fi.item] || { count: 0, occurrences: [] };
    acc[fi.item].count++;
    acc[fi.item].occurrences.push(fi);
    return acc;
  }, {});

  const sortedFailSummary = Object.entries(failSummary).sort((a, b) => b[1].count - a[1].count);

  return (
    <div className="space-y-4">
      <Tabs defaultValue="revisiones">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="revisiones" className="flex items-center gap-2">
            <Car className="w-4 h-4" /> Revisiones del Mes
          </TabsTrigger>
          <TabsTrigger value="reporte" className="flex items-center gap-2">
            <FileText className="w-4 h-4" /> Reporte por Fechas
          </TabsTrigger>
        </TabsList>

        {/* ===== TAB: REVISIONES DEL MES ===== */}
        <TabsContent value="revisiones" className="mt-4 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold text-slate-800">Revisiones de Vehículos</h3>
              <p className="text-sm text-slate-500">Checklist de revisión diaria</p>
            </div>
            <div className="flex items-center gap-3">
              <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-44" />
              <Button onClick={openDialog}>
                <Plus className="w-4 h-4 mr-1" /> Nueva Revisión
              </Button>
            </div>
          </div>

          {/* Resumen promedios por limpiador */}
          {cleanerMonthlyAverages.length > 0 && (
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-semibold text-blue-800 flex items-center gap-2">
                    <Users className="w-4 h-4" /> Promedio del mes por limpiador
                  </p>
                  <Button size="sm" onClick={applyMonthlyAverages} disabled={applyingMonthly} className="bg-blue-600 hover:bg-blue-700">
                    {applyingMonthly ? "Aplicando..." : "Aplicar al Ranking"}
                  </Button>
                </div>
                <div className="space-y-2">
                  {cleanerMonthlyAverages.map(({ cleanerId, avgEarned, avgDeduction, reviewCount }) => {
                    const nombre = limpiadores.find(l => l.id === cleanerId)?.full_name || cleanerId;
                    return (
                      <div key={cleanerId} className="flex items-center justify-between bg-white rounded-lg p-2 border border-blue-100">
                        <div>
                          <p className="font-medium text-sm text-slate-800">{nombre}</p>
                          <p className="text-xs text-slate-500">{reviewCount} revisión(es)</p>
                        </div>
                        <div className="text-right">
                          <span className={`font-bold text-base ${avgDeduction === 0 ? "text-green-700" : "text-orange-700"}`}>
                            {avgEarned}/{TOTAL_POSSIBLE} pts
                          </span>
                          {avgDeduction > 0 && (
                            <p className="text-xs text-red-600">-{avgDeduction} pts promedio</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-blue-600 mt-2">* El botón aplica el promedio al ranking global (solo una vez por mes).</p>
              </CardContent>
            </Card>
          )}

          {loading ? (
            <div className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" /></div>
          ) : records.length > 0 ? (
            <div className="space-y-3">
              {records.sort((a, b) => b.date.localeCompare(a.date)).map(record => (
                <RecordCard key={record.id} record={record} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500">
              <Car className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>No hay revisiones registradas este mes.</p>
            </div>
          )}
        </TabsContent>

        {/* ===== TAB: REPORTE ===== */}
        <TabsContent value="reporte" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="w-4 h-4" /> Filtrar por fechas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 flex-wrap">
                <div>
                  <Label className="text-xs">Desde</Label>
                  <Input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)} className="w-40" />
                </div>
                <div>
                  <Label className="text-xs">Hasta</Label>
                  <Input type="date" value={reportTo} onChange={e => setReportTo(e.target.value)} className="w-40" />
                </div>
                <Button onClick={loadReport} disabled={loadingReport} className="self-end">
                  {loadingReport ? "Cargando..." : "Generar Reporte"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {reportRecords.length > 0 && (
            <>
              {/* Resumen de fallas */}
              <Card className="border-orange-200 bg-orange-50">
                <CardHeader>
                  <CardTitle className="text-base text-orange-800 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> Resumen de Fallas Recurrentes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {sortedFailSummary.length === 0 ? (
                    <div className="text-center py-4 text-green-700 flex items-center justify-center gap-2">
                      <CheckCircle className="w-5 h-5" /> ¡Sin fallas en el período seleccionado!
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {sortedFailSummary.map(([itemName, data]) => (
                        <div key={itemName} className="bg-white rounded-lg border border-orange-200 p-3">
                          <div className="flex justify-between items-center mb-2">
                            <p className="font-semibold text-slate-800">{itemName}</p>
                            <Badge className="bg-red-100 text-red-800">{data.count} {data.count === 1 ? "vez" : "veces"}</Badge>
                          </div>
                          <div className="space-y-1">
                            {data.occurrences.map((occ, idx) => (
                              <div key={idx} className="text-xs text-slate-600 border-l-2 border-red-300 pl-2">
                                <span className="font-medium">{format(parseISO(occ.date), "d MMM yyyy", { locale: es })}</span>
                                {occ.team?.length > 0 && <span className="text-slate-400"> · {occ.team.join(", ")}</span>}
                                {occ.notes && <p className="italic text-slate-500 mt-0.5">💬 {occ.notes}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Detalle por fecha */}
              <div>
                <h4 className="font-semibold text-slate-700 mb-3">Detalle por fecha ({reportRecords.length} registros)</h4>
                <div className="space-y-3">
                  {reportRecords.map(record => <RecordCard key={record.id} record={record} />)}
                </div>
              </div>
            </>
          )}

          {reportRecords.length === 0 && !loadingReport && (
            <div className="text-center py-12 text-slate-400">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>Selecciona un rango de fechas y haz clic en "Generar Reporte"</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ===== DIALOG: Nueva Revisión ===== */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Car className="w-5 h-5" /> Revisión — {format(parseISO(selectedDate), "d 'de' MMMM yyyy", { locale: es })}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Selección de Vehículo */}
            <div>
              <Label className="font-semibold flex items-center gap-1 mb-1">
                <Car className="w-4 h-4" /> Vehículo
              </Label>
              <Select value={selectedVehicleId} onValueChange={handleVehicleChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar vehículo..." />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map(v => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.make} {v.model} — {v.license_plate}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Selección de Equipo */}
            <div>
              <Label className="font-semibold flex items-center gap-1 mb-1">
                <Users className="w-4 h-4" /> Miembros del Equipo
              </Label>
              <div className="border rounded-lg p-3 bg-slate-50 space-y-2 max-h-40 overflow-y-auto">
                {limpiadores.map(l => (
                  <label key={l.id} className="flex items-center gap-2 cursor-pointer hover:bg-white rounded p-1 transition-colors">
                    <Checkbox
                      checked={selectedMemberIds.includes(l.id)}
                      onCheckedChange={(checked) => {
                        setSelectedMemberIds(prev =>
                          checked ? [...prev, l.id] : prev.filter(id => id !== l.id)
                        );
                      }}
                    />
                    <span className="text-sm">{l.display_name || l.full_name}</span>
                  </label>
                ))}
              </div>
              {selectedMemberIds.length > 0 && (
                <p className="text-xs text-slate-500 mt-1">
                  {selectedMemberIds.length} miembro(s) — cada uno recibe el puntaje completo ({TOTAL_POSSIBLE} pts posibles)
                </p>
              )}
            </div>

            {/* Checklist */}
            <div className="space-y-2">
              <Label className="text-base font-semibold">Checklist de Revisión</Label>
              {checklist.map((item, index) => (
                <div
                  key={index}
                  className={`flex items-start justify-between p-3 rounded-lg border transition-colors ${
                    item.passed ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
                  }`}
                >
                  <div className="flex items-start gap-3 flex-1">
                    <Checkbox
                      checked={item.passed}
                      onCheckedChange={(v) => handleCheckChange(index, v)}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{item.item}</p>
                      {!item.passed && item.notes && (
                        <p className="text-xs text-red-600 italic mt-1">💬 {item.notes}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    <Badge className={item.passed ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                      {item.passed ? `+${item.points || item.points_if_fail} pts` : `-${item.points || item.points_if_fail} pts`}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>

            {/* Resumen de puntaje */}
            <div className={`p-4 rounded-lg border ${totalEarned === totalPossible ? "bg-green-50 border-green-200" : totalDeduction > 0 ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-200"}`}>
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-800">Puntaje obtenido</span>
                <span className={`text-2xl font-bold ${totalEarned === totalPossible ? "text-green-700" : "text-red-700"}`}>
                  {totalEarned} / {totalPossible} pts
                </span>
              </div>
              {totalDeduction > 0 && (
              <p className="text-sm text-red-600 mt-1">
                -{totalDeduction} pts perdidos por {checklist.filter(i => !i.passed).length} item(s) no completado(s) · cada miembro recibe {totalEarned}/{totalPossible} pts en esta revisión
              </p>
              )}
              {totalEarned === totalPossible && (
                <p className="text-sm text-green-700 mt-1">✅ ¡Todos los items completados!</p>
              )}
            </div>

            <div>
              <Label>Notas generales</Label>
              <Textarea
                value={generalNotes}
                onChange={e => setGeneralNotes(e.target.value)}
                placeholder="Observaciones adicionales sobre el estado del vehículo..."
                rows={2}
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Guardando..." : "Guardar Revisión"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== DIALOG: Observaciones al fallar un item ===== */}
      {pendingFailIndex !== null && (
        <ObservationDialog
          item={checklist[pendingFailIndex]}
          onConfirm={handleObservationConfirm}
          onCancel={handleObservationCancel}
        />
      )}
    </div>
  );
}