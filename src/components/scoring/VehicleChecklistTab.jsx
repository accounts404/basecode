import React, { useState, useEffect } from "react";
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
import { Car, Plus, Users, AlertTriangle, CheckCircle, FileText, Calendar, X } from "lucide-react";
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
            <p className="text-sm text-red-600 mt-1">Penalización: -{item.points_if_fail} puntos</p>
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
  const [checklist, setChecklist] = useState(DEFAULT_CHECKLIST.map(i => ({ ...i, passed: true, notes: "" })));
  const [generalNotes, setGeneralNotes] = useState("");
  const [saving, setSaving] = useState(false);
  // Observation dialog
  const [pendingFailIndex, setPendingFailIndex] = useState(null);
  // Report
  const [reportFrom, setReportFrom] = useState(format(new Date(monthPeriod + "-01"), "yyyy-MM-dd"));
  const [reportTo, setReportTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [reportRecords, setReportRecords] = useState([]);
  const [loadingReport, setLoadingReport] = useState(false);

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

  const totalDeduction = checklist.reduce((sum, item) => !item.passed ? sum + item.points_if_fail : sum, 0);

  const openDialog = async () => {
    setChecklist(DEFAULT_CHECKLIST.map(i => ({ ...i, passed: true, notes: "" })));
    setGeneralNotes("");
    setSelectedAssignment(null);
    setPendingFailIndex(null);
    try {
      const assignments = await base44.entities.DailyTeamAssignment.filter({ date: selectedDate });
      if (assignments.length > 0) setSelectedAssignment(assignments[0]);
    } catch (e) {}
    setShowDialog(true);
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
      const vehicle = selectedAssignment?.vehicle_id ? vehicles.find(v => v.id === selectedAssignment.vehicle_id) : null;
      const teamIds = selectedAssignment?.team_member_ids || [];
      const teamNames = selectedAssignment?.team_members_names || [];

      await base44.entities.VehicleChecklistRecord.create({
        date: selectedDate,
        month_period: monthPeriod,
        team_assignment_id: selectedAssignment?.id || null,
        vehicle_id: selectedAssignment?.vehicle_id || null,
        vehicle_info: vehicle
          ? `${vehicle.make} ${vehicle.model} ${vehicle.license_plate}`
          : selectedAssignment?.vehicle_info || "Vehículo no especificado",
        team_member_ids: teamIds,
        team_member_names: teamNames,
        checklist_items: checklist,
        total_deduction: totalDeduction,
        points_per_member: teamIds.length > 0 ? Math.round(totalDeduction / teamIds.length) : totalDeduction,
        general_notes: generalNotes,
        reviewed_by_admin: user.id,
        reviewed_by_admin_name: user.full_name
      });

      // Aplicar deducciones al ranking de cada miembro
      if (totalDeduction > 0 && teamIds.length > 0) {
        const ptsPerMember = Math.ceil(totalDeduction / teamIds.length);
        const failedItems = checklist.filter(i => !i.passed)
          .map(i => `${i.item}${i.notes ? ` (${i.notes})` : ""}`).join("; ");

        for (const cleanerId of teamIds) {
          const monthlyScore = monthlyScores.find(s => s.cleaner_id === cleanerId);
          if (monthlyScore) {
            await base44.entities.ScoreAdjustment.create({
              monthly_score_id: monthlyScore.id,
              cleaner_id: cleanerId,
              month_period: monthPeriod,
              adjustment_type: "deduction",
              category: "Mantenimiento de Vehículo",
              points_impact: -ptsPerMember,
              notes: `Revisión vehicular ${format(parseISO(selectedDate), "d MMM", { locale: es })}. Fallas: ${failedItems}`,
              admin_id: user.id,
              admin_name: user.full_name,
              date_applied: new Date().toISOString()
            });
            const newScore = Math.max(0, monthlyScore.current_score - ptsPerMember);
            await base44.entities.MonthlyCleanerScore.update(monthlyScore.id, { current_score: newScore });
          }
        }
      }

      setShowDialog(false);
      await loadData();
      if (onScoreApplied) onScoreApplied();
    } catch (e) {
      console.error(e);
      alert("Error guardando el checklist");
    }
    setSaving(false);
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
            {/* Info del equipo/vehículo */}
            {selectedAssignment ? (
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 text-sm">
                <div className="flex items-center gap-2 mb-1">
                  <Car className="w-4 h-4 text-blue-700" />
                  <p className="font-semibold text-blue-800">{selectedAssignment.vehicle_info || "Vehículo no asignado"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600" />
                  <p className="text-blue-700">{selectedAssignment.team_members_names?.join(", ") || "Sin miembros"}</p>
                </div>
              </div>
            ) : (
              <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-sm text-amber-800">
                ⚠️ No hay asignación de equipo para esta fecha. Las deducciones no se aplicarán automáticamente al ranking.
              </div>
            )}

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
                    <Badge className={item.passed ? "bg-slate-100 text-slate-500" : "bg-red-100 text-red-800"}>
                      {item.passed ? `${item.points_if_fail} pts` : `-${item.points_if_fail} pts`}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>

            {/* Resumen deducciones */}
            {totalDeduction > 0 ? (
              <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-red-800">Total deducción</span>
                  <span className="text-2xl font-bold text-red-700">-{totalDeduction} pts</span>
                </div>
                {selectedAssignment?.team_member_ids?.length > 0 && (
                  <p className="text-sm text-red-600 mt-1">
                    -{Math.ceil(totalDeduction / selectedAssignment.team_member_ids.length)} pts por cada miembro del equipo
                  </p>
                )}
              </div>
            ) : (
              <div className="bg-green-50 p-4 rounded-lg border border-green-200 text-center">
                <p className="font-semibold text-green-800">✅ ¡Vehículo en perfectas condiciones! Sin deducciones.</p>
              </div>
            )}

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