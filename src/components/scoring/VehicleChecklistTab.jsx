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
import { Car, Plus, ClipboardCheck, Users, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const DEFAULT_CHECKLIST = [
  { item: "Interior limpio y ordenado", points_if_fail: 3 },
  { item: "Sin basura ni residuos de limpieza", points_if_fail: 2 },
  { item: "Equipos y materiales ordenados en el maletero", points_if_fail: 2 },
  { item: "Combustible en nivel aceptable (>25%)", points_if_fail: 3 },
  { item: "Sin daños nuevos (golpes, rayones)", points_if_fail: 5 },
  { item: "Parabrisas y espejos limpios", points_if_fail: 1 },
  { item: "Documentos del vehículo en la guantera", points_if_fail: 1 },
  { item: "Kit de emergencia/seguridad presente", points_if_fail: 2 },
];

export default function VehicleChecklistTab({ monthPeriod, limpiadores, monthlyScores, user, onScoreApplied }) {
  const [records, setRecords] = useState([]);
  const [teamAssignments, setTeamAssignments] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [checklist, setChecklist] = useState(DEFAULT_CHECKLIST.map(i => ({ ...i, passed: true, notes: "" })));
  const [generalNotes, setGeneralNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, [monthPeriod]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [recs, assignments, veh] = await Promise.all([
        base44.entities.VehicleChecklistRecord.filter({ month_period: monthPeriod }),
        base44.entities.DailyTeamAssignment.list("-date", 100),
        base44.entities.Vehicle.list()
      ]);
      setRecords(recs);
      setTeamAssignments(assignments);
      setVehicles(veh);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const totalDeduction = checklist.reduce((sum, item) => !item.passed ? sum + item.points_if_fail : sum, 0);

  const openDialog = async () => {
    setChecklist(DEFAULT_CHECKLIST.map(i => ({ ...i, passed: true, notes: "" })));
    setGeneralNotes("");
    setSelectedAssignment(null);

    // Intentar cargar la asignación del equipo para la fecha seleccionada
    try {
      const assignments = await base44.entities.DailyTeamAssignment.filter({ date: selectedDate });
      if (assignments.length > 0) setSelectedAssignment(assignments[0]);
    } catch (e) {}

    setShowDialog(true);
  };

  const toggleItem = (index, passed) => {
    setChecklist(prev => prev.map((item, i) => i === index ? { ...item, passed } : item));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const vehicle = selectedAssignment?.vehicle_id ? vehicles.find(v => v.id === selectedAssignment.vehicle_id) : null;
      const teamIds = selectedAssignment?.team_member_ids || [];
      const teamNames = selectedAssignment?.team_members_names || [];

      // Crear el registro del checklist
      await base44.entities.VehicleChecklistRecord.create({
        date: selectedDate,
        month_period: monthPeriod,
        team_assignment_id: selectedAssignment?.id || null,
        vehicle_id: selectedAssignment?.vehicle_id || null,
        vehicle_info: vehicle ? `${vehicle.make} ${vehicle.model} ${vehicle.license_plate}` : selectedAssignment?.vehicle_info || "Vehículo no especificado",
        team_member_ids: teamIds,
        team_member_names: teamNames,
        checklist_items: checklist,
        total_deduction: totalDeduction,
        points_per_member: teamIds.length > 0 ? Math.round(totalDeduction / teamIds.length) : totalDeduction,
        general_notes: generalNotes,
        reviewed_by_admin: user.id,
        reviewed_by_admin_name: user.full_name
      });

      // Aplicar deducciones a cada miembro del equipo
      if (totalDeduction > 0 && teamIds.length > 0) {
        const ptsPerMember = Math.ceil(totalDeduction / teamIds.length);
        for (const cleanerId of teamIds) {
          const monthlyScore = monthlyScores.find(s => s.cleaner_id === cleanerId);
          const cleaner = limpiadores.find(c => c.id === cleanerId);
          if (monthlyScore && cleaner) {
            const failedItems = checklist.filter(i => !i.passed).map(i => i.item).join(", ");
            await base44.entities.ScoreAdjustment.create({
              monthly_score_id: monthlyScore.id,
              cleaner_id: cleanerId,
              month_period: monthPeriod,
              adjustment_type: "deduction",
              category: "Mantenimiento de Vehículo",
              points_impact: -ptsPerMember,
              notes: `Revisión vehicular ${format(new Date(selectedDate), "d MMM", { locale: es })}. Items fallidos: ${failedItems}`,
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Mantenimiento de Equipo y Vehículos</h3>
          <p className="text-sm text-slate-500">Checklist de revisión al final de cada turno</p>
        </div>
        <div className="flex items-center gap-3">
          <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-44" />
          <Button onClick={openDialog}>
            <Plus className="w-4 h-4 mr-1" /> Nueva Revisión
          </Button>
        </div>
      </div>

      {/* Resumen de registros del mes */}
      {records.length > 0 ? (
        <div className="space-y-3">
          {records.sort((a, b) => new Date(b.date) - new Date(a.date)).map(record => (
            <Card key={record.id} className="border-0 shadow-md">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${record.total_deduction === 0 ? "bg-green-100" : "bg-red-100"}`}>
                      <Car className={`w-5 h-5 ${record.total_deduction === 0 ? "text-green-600" : "text-red-600"}`} />
                    </div>
                    <div>
                      <p className="font-semibold">{format(new Date(record.date), "EEEE d MMM yyyy", { locale: es })}</p>
                      <p className="text-sm text-slate-500">{record.vehicle_info || "Vehículo"}</p>
                      {record.team_member_names?.length > 0 && (
                        <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                          <Users className="w-3 h-3" /> {record.team_member_names.join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    {record.total_deduction === 0 ? (
                      <Badge className="bg-green-100 text-green-800">✅ Todo OK</Badge>
                    ) : (
                      <Badge className="bg-red-100 text-red-800">-{record.total_deduction} pts totales</Badge>
                    )}
                    {record.team_member_ids?.length > 0 && record.total_deduction > 0 && (
                      <p className="text-xs text-slate-500 mt-1">-{record.points_per_member} pts por miembro</p>
                    )}
                  </div>
                </div>

                {record.checklist_items?.filter(i => !i.passed).length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <p className="text-xs font-semibold text-red-700 mb-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Items fallidos:
                    </p>
                    <div className="space-y-1">
                      {record.checklist_items.filter(i => !i.passed).map((item, idx) => (
                        <p key={idx} className="text-xs text-red-600">• {item.item} (-{item.points_if_fail} pts)</p>
                      ))}
                    </div>
                  </div>
                )}

                {record.general_notes && (
                  <p className="text-xs text-slate-500 mt-2 italic">{record.general_notes}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-slate-500">
          <Car className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>No hay revisiones de vehículos registradas este mes.</p>
        </div>
      )}

      {/* Dialog de checklist */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Car className="w-5 h-5" /> Revisión de Vehículo — {format(new Date(selectedDate), "d MMM yyyy", { locale: es })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {selectedAssignment && (
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 text-sm">
                <p className="font-semibold text-blue-800">Equipo del día:</p>
                <p className="text-blue-700">{selectedAssignment.team_members_names?.join(", ") || "Sin miembros registrados"}</p>
                <p className="text-blue-600">Vehículo: {selectedAssignment.vehicle_info || "Sin asignar"}</p>
              </div>
            )}

            <div className="space-y-3">
              <Label className="text-base font-semibold">Checklist de Revisión:</Label>
              {checklist.map((item, index) => (
                <div key={index} className={`flex items-center justify-between p-3 rounded-lg border ${item.passed ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={item.passed}
                      onCheckedChange={(v) => toggleItem(index, v)}
                    />
                    <div>
                      <p className="text-sm font-medium">{item.item}</p>
                      {!item.passed && <p className="text-xs text-red-600">Penalización: -{item.points_if_fail} pts</p>}
                    </div>
                  </div>
                  {!item.passed && (
                    <Badge className="bg-red-100 text-red-800 ml-2">-{item.points_if_fail}</Badge>
                  )}
                </div>
              ))}
            </div>

            {totalDeduction > 0 && (
              <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-red-800">Total de deducción</span>
                  <span className="text-2xl font-bold text-red-700">-{totalDeduction} pts</span>
                </div>
                {selectedAssignment?.team_member_ids?.length > 0 && (
                  <p className="text-sm text-red-600 mt-1">
                    -{Math.ceil(totalDeduction / selectedAssignment.team_member_ids.length)} pts por cada miembro del equipo ({selectedAssignment.team_member_ids.length} personas)
                  </p>
                )}
              </div>
            )}

            {totalDeduction === 0 && (
              <div className="bg-green-50 p-4 rounded-lg border border-green-200 text-center">
                <p className="font-semibold text-green-800">✅ ¡Vehículo en perfecto estado! Sin deducciones.</p>
              </div>
            )}

            <div>
              <Label>Notas generales</Label>
              <Textarea value={generalNotes} onChange={e => setGeneralNotes(e.target.value)} placeholder="Observaciones adicionales sobre el estado del vehículo..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Guardando..." : "Guardar Revisión"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}