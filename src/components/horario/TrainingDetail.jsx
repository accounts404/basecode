import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  GraduationCap, Clock, Pencil, CheckCircle, RotateCcw, Ban, UserCheck,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import TrainingVisitCard from "./TrainingVisitCard";
import { computeTrainingWorkEntryFields } from "./trainingHelpers";

const statusConfig = {
  scheduled: { label: "Programado", color: "bg-slate-100 text-slate-700" },
  in_progress: { label: "En curso", color: "bg-blue-100 text-blue-700" },
  completed: { label: "Completado", color: "bg-green-100 text-green-700" },
  cancelled: { label: "Cancelado", color: "bg-red-100 text-red-700" },
};

export default function TrainingDetail({ training, currentUser, users = [], onUpdate, onEditBlock }) {
  const [local, setLocal] = useState(training);
  const [clientInfos, setClientInfos] = useState({});
  const [enrichment, setEnrichment] = useState({});
  const [enrichmentLoading, setEnrichmentLoading] = useState(false);
  const [error, setError] = useState("");
  const [blockSaving, setBlockSaving] = useState(false);

  const isAdmin = currentUser?.role === "admin";
  const isTrainer = currentUser?.id === local?.trainer_id;
  const canEdit = isAdmin || isTrainer;
  const blockCompleted = local?.status === "completed";

  const visits = local?.visits || [];
  const clientIdsKey = visits.map((v) => v.client_id).filter(Boolean).sort().join(",");
  const trainingDate = local?.date || (local?.start_time ? local.start_time.slice(0, 10) : "");

  // Ficha operativa de cada casa
  useEffect(() => {
    if (!clientIdsKey) {
      setClientInfos({});
      return;
    }
    let cancelled = false;
    (async () => {
      const infos = {};
      await Promise.all(
        clientIdsKey.split(",").map(async (id) => {
          try {
            infos[id] = await base44.entities.Client.get(id);
          } catch {
            infos[id] = null;
          }
        })
      );
      if (!cancelled) setClientInfos(infos);
    })();
    return () => { cancelled = true; };
  }, [clientIdsKey]);

  // Equipo, horario y tiempo restante de cada casa (reutiliza la función de supervisión)
  useEffect(() => {
    if (!clientIdsKey || !trainingDate) {
      setEnrichment({});
      return;
    }
    let cancelled = false;
    setEnrichmentLoading(true);
    (async () => {
      try {
        const { data } = await base44.functions.invoke("getSupervisionVisitEnrichment", {
          date: trainingDate,
          client_ids: clientIdsKey.split(","),
        });
        if (!cancelled) setEnrichment(data?.visits || {});
      } catch (e) {
        console.warn("No se pudo enriquecer las visitas:", e);
        if (!cancelled) setEnrichment({});
      } finally {
        if (!cancelled) setEnrichmentLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientIdsKey, trainingDate]);

  const handleAction = async (action, extra = {}) => {
    try {
      const { data } = await base44.functions.invoke("updateTrainingVisit", {
        training_id: local.id,
        action,
        ...extra,
      });
      if (data?.training) {
        setLocal(data.training);
        if (onUpdate) onUpdate(data.training);
      }
      return data?.training;
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || "No se pudo guardar el cambio.";
      throw new Error(msg);
    }
  };

  const handleLocalPatch = (clientId, patch) => {
    setLocal((prev) => ({
      ...prev,
      visits: (prev.visits || []).map((v) => (v.client_id === clientId ? { ...v, ...patch } : v)),
    }));
  };

  // Cerrar/reabrir el bloque: al completarlo se paga al entrenador (costo de la empresa)
  const handleBlockStatus = async (newStatus) => {
    setBlockSaving(true);
    setError("");
    try {
      const t = local;
      let workEntryId = t.work_entry_id;
      const extra = {};

      if (newStatus === "completed") {
        const trainerUser = users.find((u) => u.id === t.trainer_id);
        const fields = computeTrainingWorkEntryFields(t, trainerUser);
        if (t.work_entry_id) {
          const we = await base44.entities.WorkEntry.get(t.work_entry_id).catch(() => null);
          if (we && !we.invoiced) {
            await base44.entities.WorkEntry.update(we.id, {
              hours: fields.hours,
              total_amount: fields.total_amount,
              hourly_rate: fields.hourly_rate,
              work_date: fields.work_date,
              period: fields.period,
            });
          } else if (!we) {
            const created = await base44.entities.WorkEntry.create(fields);
            workEntryId = created.id;
            extra.work_entry_id = created.id;
          }
        } else {
          const created = await base44.entities.WorkEntry.create(fields);
          workEntryId = created.id;
          extra.work_entry_id = created.id;
        }
      } else if (t.work_entry_id) {
        const we = await base44.entities.WorkEntry.get(t.work_entry_id).catch(() => null);
        if (we && !we.invoiced) {
          await base44.entities.WorkEntry.delete(we.id);
          workEntryId = null;
          extra.work_entry_id = null;
        }
      }

      await base44.entities.Training.update(t.id, { status: newStatus, ...extra });
      const updated = { ...t, status: newStatus, work_entry_id: workEntryId };
      setLocal(updated);
      if (onUpdate) onUpdate(updated);
    } catch (e) {
      setError(e.message || "Error al cambiar el estado del bloque.");
    } finally {
      setBlockSaving(false);
    }
  };

  const cfg = statusConfig[local?.status] || statusConfig.scheduled;
  const completedCount = visits.filter((v) => v.visit_status === "completed").length;
  const hours = (() => {
    if (!local?.start_time || !local?.end_time) return 0;
    return parseFloat(((new Date(local.end_time) - new Date(local.start_time)) / (1000 * 60 * 60)).toFixed(2));
  })();

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Cabecera del bloque */}
      <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-4 space-y-2">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-teal-600 flex-shrink-0" />
              <span className="text-sm font-semibold text-teal-800">
                Entrenando a {local?.trainee_name || "Aprendiz"}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1 flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5" /> Entrenador: {local?.trainer_name || "—"}
            </p>
            <p className="text-xs text-slate-600 mt-0.5 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {trainingDate ? format(new Date(`${trainingDate}T12:00:00`), "d MMM yyyy", { locale: es }) : "—"}
              {" · "}
              {(local?.start_time || "").slice(11, 16)}–{(local?.end_time || "").slice(11, 16)} ({hours} h)
            </p>
            <p className="text-xs text-slate-600 mt-0.5">
              {completedCount}/{visits.length} casas completadas
            </p>
          </div>
          <Badge className={cfg.color}>{cfg.label}</Badge>
        </div>

        {local?.notes && (
          <p className="text-xs text-slate-700 bg-white rounded-lg border border-teal-100 p-2 whitespace-pre-wrap">
            {local.notes}
          </p>
        )}

        {isAdmin && (
          <div className="flex flex-wrap gap-2 pt-1">
            {onEditBlock && (
              <Button size="sm" variant="outline" onClick={() => onEditBlock(local)} disabled={blockSaving}>
                <Pencil className="w-3.5 h-3.5 mr-1" /> Editar bloque
              </Button>
            )}
            {local?.status !== "completed" && local?.status !== "cancelled" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBlockStatus("completed")}
                disabled={blockSaving}
                className="border-green-300 text-green-700 hover:bg-green-50"
              >
                <CheckCircle className="w-3.5 h-3.5 mr-1" /> Completar bloque
              </Button>
            )}
            {local?.status === "completed" && (
              <Button size="sm" variant="outline" onClick={() => handleBlockStatus("scheduled")} disabled={blockSaving}>
                <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reabrir bloque
              </Button>
            )}
            {local?.status !== "cancelled" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBlockStatus("cancelled")}
                disabled={blockSaving}
                className="border-red-200 text-red-600 hover:bg-red-50"
              >
                <Ban className="w-3.5 h-3.5 mr-1" /> Cancelar
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Casas del recorrido */}
      <div className="space-y-3">
        {visits.length === 0 && (
          <p className="text-xs text-slate-500 italic">Este bloque no tiene casas asignadas.</p>
        )}
        {visits.map((visit, index) => (
          <TrainingVisitCard
            key={visit.client_id || index}
            visit={visit}
            index={index}
            client={clientInfos[visit.client_id]}
            enrichment={enrichment[visit.client_id]}
            enrichmentLoading={enrichmentLoading}
            canEdit={canEdit}
            isAdmin={isAdmin}
            blockCompleted={blockCompleted}
            onAction={handleAction}
            onLocalPatch={handleLocalPatch}
          />
        ))}
      </div>

      {!canEdit && (
        <p className="text-xs text-slate-500">
          Solo el entrenador asignado o un administrador pueden registrar cambios en este bloque.
        </p>
      )}
    </div>
  );
}