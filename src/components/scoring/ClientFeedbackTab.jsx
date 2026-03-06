import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { MessageSquare, Plus, ThumbsUp, ThumbsDown, AlertTriangle, Star } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const FEEDBACK_TYPES = {
  complaint: { label: "Queja", color: "bg-red-100 text-red-800", icon: ThumbsDown, badgeClass: "bg-red-100 text-red-800" },
  compliment: { label: "Elogio", color: "bg-green-100 text-green-800", icon: ThumbsUp, badgeClass: "bg-green-100 text-green-800" },
  neutral: { label: "Neutral", color: "bg-slate-100 text-slate-800", icon: MessageSquare, badgeClass: "bg-slate-100 text-slate-700" },
};

const SEVERITY_POINTS = {
  complaint: { low: -5, medium: -10, high: -15 },
  compliment: { low: 3, medium: 7, high: 10 },
  neutral: { low: 0, medium: 0, high: 0 },
};

const CHANNELS = { sms: "SMS", call: "Llamada", email: "Email", in_person: "En persona", other: "Otro" };

export default function ClientFeedbackTab({ monthPeriod, limpiadores, monthlyScores, user, onScoreApplied }) {
  const [feedbacks, setFeedbacks] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [formData, setFormData] = useState({
    client_id: "",
    feedback_date: format(new Date(), "yyyy-MM-dd"),
    feedback_type: "complaint",
    feedback_channel: "call",
    severity: "medium",
    description: "",
    action_taken: ""
  });
  const [selectedCleanerIds, setSelectedCleanerIds] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, [monthPeriod]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [fb, cl] = await Promise.all([
        base44.entities.ClientFeedback.filter({ month_period: monthPeriod }),
        base44.entities.Client.filter({ active: true })
      ]);
      setFeedbacks(fb);
      setClients(cl);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const previewPoints = () => SEVERITY_POINTS[formData.feedback_type]?.[formData.severity] || 0;

  const openDialog = () => {
    setFormData({ client_id: "", feedback_date: format(new Date(), "yyyy-MM-dd"), feedback_type: "complaint", feedback_channel: "call", severity: "medium", description: "", action_taken: "" });
    setSelectedCleanerIds([]);
    setShowDialog(true);
  };

  const toggleCleaner = (cleanerId) => {
    setSelectedCleanerIds(prev => prev.includes(cleanerId) ? prev.filter(id => id !== cleanerId) : [...prev, cleanerId]);
  };

  const handleSave = async () => {
    if (!formData.client_id || !formData.description) { alert("Por favor completa los campos requeridos."); return; }
    setSaving(true);
    try {
      const client = clients.find(c => c.id === formData.client_id);
      const impact = previewPoints();
      const affectedNames = selectedCleanerIds.map(id => limpiadores.find(c => c.id === id)?.invoice_name || limpiadores.find(c => c.id === id)?.full_name || "").filter(Boolean);

      await base44.entities.ClientFeedback.create({
        client_id: formData.client_id,
        client_name: client?.name || "",
        feedback_date: formData.feedback_date,
        month_period: monthPeriod,
        feedback_type: formData.feedback_type,
        feedback_channel: formData.feedback_channel,
        severity: formData.severity,
        affected_cleaner_ids: selectedCleanerIds,
        affected_cleaner_names: affectedNames,
        description: formData.description,
        action_taken: formData.action_taken,
        points_impact: impact,
        registered_by_admin: user.id,
        registered_by_admin_name: user.full_name
      });

      // Aplicar puntos a cada limpiador afectado
      if (impact !== 0 && selectedCleanerIds.length > 0) {
        for (const cleanerId of selectedCleanerIds) {
          const monthlyScore = monthlyScores.find(s => s.cleaner_id === cleanerId);
          if (monthlyScore) {
            const typeLabel = FEEDBACK_TYPES[formData.feedback_type].label;
            await base44.entities.ScoreAdjustment.create({
              monthly_score_id: monthlyScore.id,
              cleaner_id: cleanerId,
              month_period: monthPeriod,
              adjustment_type: impact > 0 ? "bonus" : "deduction",
              category: `Feedback de Cliente (${typeLabel})`,
              points_impact: impact,
              notes: `${typeLabel} de ${client?.name} - ${formData.description.slice(0, 100)}`,
              admin_id: user.id,
              admin_name: user.full_name,
              date_applied: new Date().toISOString()
            });
            const newScore = Math.max(0, monthlyScore.current_score + impact);
            await base44.entities.MonthlyCleanerScore.update(monthlyScore.id, { current_score: newScore });
          }
        }
      }

      setShowDialog(false);
      await loadData();
      if (onScoreApplied) onScoreApplied();
    } catch (e) {
      console.error(e);
      alert("Error guardando el feedback");
    }
    setSaving(false);
  };

  const complaints = feedbacks.filter(f => f.feedback_type === "complaint");
  const compliments = feedbacks.filter(f => f.feedback_type === "compliment");
  const participatingCleaners = limpiadores.filter(c => monthlyScores.some(s => s.cleaner_id === c.id && s.is_participating));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Feedback de Clientes</h3>
          <p className="text-sm text-slate-500">Registra quejas y elogios recibidos de clientes</p>
        </div>
        <Button onClick={openDialog}>
          <Plus className="w-4 h-4 mr-1" /> Registrar Feedback
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm bg-red-50">
          <CardContent className="p-4 text-center">
            <ThumbsDown className="w-6 h-6 text-red-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-red-800">{complaints.length}</p>
            <p className="text-sm text-red-600">Quejas</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-green-50">
          <CardContent className="p-4 text-center">
            <ThumbsUp className="w-6 h-6 text-green-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-green-800">{compliments.length}</p>
            <p className="text-sm text-green-600">Elogios</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-blue-50">
          <CardContent className="p-4 text-center">
            <Star className="w-6 h-6 text-blue-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-blue-800">{feedbacks.length}</p>
            <p className="text-sm text-blue-600">Total</p>
          </CardContent>
        </Card>
      </div>

      {/* Lista de feedbacks */}
      {feedbacks.length > 0 ? (
        <div className="space-y-3">
          {feedbacks.sort((a, b) => new Date(b.feedback_date) - new Date(a.feedback_date)).map(fb => {
            const typeInfo = FEEDBACK_TYPES[fb.feedback_type];
            const TypeIcon = typeInfo.icon;
            return (
              <Card key={fb.id} className="border-0 shadow-md">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${typeInfo.color}`}>
                      <TypeIcon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="font-semibold text-slate-800">{fb.client_name}</p>
                        <Badge className={typeInfo.badgeClass}>{typeInfo.label}</Badge>
                        {fb.severity && fb.feedback_type !== "neutral" && (
                          <Badge className={fb.severity === "high" ? "bg-red-200 text-red-900" : fb.severity === "medium" ? "bg-orange-100 text-orange-800" : "bg-yellow-100 text-yellow-800"}>
                            {fb.severity === "high" ? "Alta" : fb.severity === "medium" ? "Media" : "Baja"}
                          </Badge>
                        )}
                        {fb.points_impact !== 0 && (
                          <Badge className={fb.points_impact > 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                            {fb.points_impact > 0 ? "+" : ""}{fb.points_impact} pts por limpiador
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-700 mb-2">{fb.description}</p>
                      {fb.affected_cleaner_names?.length > 0 && (
                        <p className="text-xs text-slate-500">Limpiadores afectados: {fb.affected_cleaner_names.join(", ")}</p>
                      )}
                      {fb.action_taken && (
                        <p className="text-xs text-blue-600 mt-1">Acción: {fb.action_taken}</p>
                      )}
                      <p className="text-xs text-slate-400 mt-1">
                        {format(new Date(fb.feedback_date), "d MMM yyyy", { locale: es })} · {CHANNELS[fb.feedback_channel]} · Por: {fb.registered_by_admin_name}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 text-slate-500">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>No hay feedbacks registrados este mes.</p>
        </div>
      )}

      {/* Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar Feedback de Cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Cliente *</Label>
              <Select value={formData.client_id} onValueChange={v => setFormData(p => ({ ...p, client_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecciona cliente" /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Fecha *</Label>
                <Input type="date" value={formData.feedback_date} onChange={e => setFormData(p => ({ ...p, feedback_date: e.target.value }))} />
              </div>
              <div>
                <Label>Canal</Label>
                <Select value={formData.feedback_channel} onValueChange={v => setFormData(p => ({ ...p, feedback_channel: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CHANNELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo *</Label>
                <Select value={formData.feedback_type} onValueChange={v => setFormData(p => ({ ...p, feedback_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="complaint">Queja</SelectItem>
                    <SelectItem value="compliment">Elogio</SelectItem>
                    <SelectItem value="neutral">Neutral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formData.feedback_type !== "neutral" && (
                <div>
                  <Label>Severidad / Nivel</Label>
                  <Select value={formData.severity} onValueChange={v => setFormData(p => ({ ...p, severity: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Baja ({formData.feedback_type === "complaint" ? "-5" : "+3"} pts)</SelectItem>
                      <SelectItem value="medium">Media ({formData.feedback_type === "complaint" ? "-10" : "+7"} pts)</SelectItem>
                      <SelectItem value="high">Alta ({formData.feedback_type === "complaint" ? "-15" : "+10"} pts)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div>
              <Label>Descripción *</Label>
              <Textarea value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} placeholder="¿Qué dijo el cliente?" rows={3} />
            </div>

            <div>
              <Label>Acción tomada</Label>
              <Textarea value={formData.action_taken} onChange={e => setFormData(p => ({ ...p, action_taken: e.target.value }))} placeholder="¿Cómo se resolvió o se respondió?" rows={2} />
            </div>

            <div>
              <Label className="mb-2 block">Limpiadores involucrados:</Label>
              <div className="max-h-40 overflow-y-auto space-y-2 border rounded-lg p-3">
                {participatingCleaners.map(c => (
                  <div key={c.id} className="flex items-center gap-2">
                    <Checkbox checked={selectedCleanerIds.includes(c.id)} onCheckedChange={() => toggleCleaner(c.id)} />
                    <label className="text-sm cursor-pointer">{c.invoice_name || c.full_name}</label>
                  </div>
                ))}
              </div>
            </div>

            {previewPoints() !== 0 && selectedCleanerIds.length > 0 && (
              <div className={`p-3 rounded-lg border ${previewPoints() > 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                <p className={`text-sm font-semibold ${previewPoints() > 0 ? "text-green-800" : "text-red-800"}`}>
                  Impacto: {previewPoints() > 0 ? "+" : ""}{previewPoints()} pts por cada limpiador seleccionado ({selectedCleanerIds.length} limpiadores)
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Guardando..." : "Registrar Feedback"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}