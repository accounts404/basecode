import React, { useState, useEffect, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Shield, Clock, MapPin, CheckCircle, Circle, Play, SkipForward,
  Camera, AlertCircle, FileText, ImageOff, Loader2, X, UserPlus, Trash2,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandItem, CommandGroup, CommandEmpty } from "@/components/ui/command";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { UploadPrivateFile, CreateFileSignedUrl } from "@/integrations/Core";
import SupervisionClientInfo from "./SupervisionClientInfo";
import { computeSupervisionWorkEntryFields } from "./supervisionHelpers";

const parseISOAsUTC = (iso) => {
  if (!iso) return null;
  const s = iso.endsWith("Z") ? iso : `${iso}Z`;
  return new Date(s);
};
const formatTime = (iso) => {
  if (!iso) return "--:--";
  const d = parseISOAsUTC(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

const visitStatusConfig = {
  pending: { label: "Pendiente", color: "bg-slate-100 text-slate-700", icon: Circle },
  in_progress: { label: "En curso", color: "bg-blue-100 text-blue-700", icon: Play },
  completed: { label: "Completada", color: "bg-green-100 text-green-700", icon: CheckCircle },
  skipped: { label: "Omitida", color: "bg-amber-100 text-amber-700", icon: SkipForward },
};

export default function SupervisionDetail({ supervision, currentUser, users = [], onClose, onUpdate, onEditBlock }) {
  const [localSupervision, setLocalSupervision] = useState(supervision);
  const [clientInfos, setClientInfos] = useState({});
  const [loadingClients, setLoadingClients] = useState(true);
  const [savingVisitId, setSavingVisitId] = useState(null);
  const [photoUploadingVisitId, setPhotoUploadingVisitId] = useState(null);
  const [signedUrls, setSignedUrls] = useState({});
  const [error, setError] = useState("");
  const [blockStatusSaving, setBlockStatusSaving] = useState(false);
  const [allClients, setAllClients] = useState([]);
  const [clientsLoaded, setClientsLoaded] = useState(false);
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [visitMutating, setVisitMutating] = useState(false);
  const [visitEnrichment, setVisitEnrichment] = useState({});
  const [enrichmentLoading, setEnrichmentLoading] = useState(false);

  const isAdmin = currentUser?.role === "admin";
  const isSupervisor = currentUser?.id === localSupervision?.supervisor_id;
  const canEdit = isAdmin || isSupervisor;

  // Cargar info operativa de los clientes de las visitas
  useEffect(() => {
    const fetchClients = async () => {
      if (!localSupervision?.visits?.length) {
        setLoadingClients(false);
        return;
      }
      try {
        const infos = {};
        await Promise.all(
          localSupervision.visits.map(async (v) => {
            try {
              const c = await base44.entities.Client.get(v.client_id);
              infos[v.client_id] = c;
            } catch {
              infos[v.client_id] = null;
            }
          })
        );
        setClientInfos(infos);
      } finally {
        setLoadingClients(false);
      }
    };
    fetchClients();
  }, [localSupervision?.visits]);

  // Enriquecer visitas con equipo, horario y tiempo restante (vía backend para resolver nombres de limpiadores)
  useEffect(() => {
    const fetchEnrichment = async () => {
      const visits = localSupervision?.visits || [];
      const supDate = localSupervision?.date || (localSupervision?.start_time ? localSupervision.start_time.slice(0, 10) : "");
      if (!supDate || visits.length === 0) {
        setVisitEnrichment({});
        setEnrichmentLoading(false);
        return;
      }
      setEnrichmentLoading(true);
      try {
        const clientIds = visits.map((v) => v.client_id).filter(Boolean);
        const { data } = await base44.functions.invoke("getSupervisionVisitEnrichment", { date: supDate, client_ids: clientIds });
        setVisitEnrichment(data?.visits || {});
      } catch (e) {
        console.warn("No se pudo enriquecer visitas:", e);
        setVisitEnrichment({});
      } finally {
        setEnrichmentLoading(false);
      }
    };
    fetchEnrichment();
  }, [localSupervision?.visits, localSupervision?.date, localSupervision?.start_time]);

  // Generar signed URLs para fotos privadas
  const refreshSignedUrls = useCallback(async () => {
    if (!localSupervision?.visits) return;
    const allPhotos = [];
    localSupervision.visits.forEach((v, vi) => {
      (v.photos || []).forEach((p, pi) => {
        // Cualquier URL que no sea http(s) es un file_uri privado (formato "mp/private/...")
        // y necesita una URL firmada para poder visualizarse.
        if (p.url && !/^https?:\/\//.test(p.url)) {
          allPhotos.push({ vi, pi, uri: p.url });
        }
      });
    });
    if (allPhotos.length === 0) return;
    const next = { ...signedUrls };
    await Promise.all(
      allPhotos.map(async ({ vi, pi, uri }) => {
        const key = `${vi}-${pi}`;
        if (next[key]) return;
        try {
          const res = await CreateFileSignedUrl({ file_uri: uri, expires_in: 3600 });
          next[key] = res.signed_url;
        } catch (e) {
          console.warn("No se pudo firmar la URL de la foto:", e);
        }
      })
    );
    setSignedUrls(next);
  }, [localSupervision, signedUrls]);

  useEffect(() => {
    refreshSignedUrls();
  }, [refreshSignedUrls]);

  const persistVisits = async (newVisits, extraFields = {}) => {
    const update = { visits: newVisits, ...extraFields };
    await base44.entities.Supervision.update(localSupervision.id, update);
    setLocalSupervision((prev) => ({ ...prev, visits: newVisits, ...extraFields }));
  };

  const updateVisit = (index, changes) => {
    const newVisits = [...(localSupervision.visits || [])];
    newVisits[index] = { ...newVisits[index], ...changes };
    return newVisits;
  };

  const handleStartVisit = async (index) => {
    setSavingVisitId(index);
    setError("");
    try {
      const now = new Date().toISOString();
      const newVisits = updateVisit(index, { visit_status: "in_progress", started_at: now });
      await persistVisits(newVisits);
    } catch (e) {
      setError(e.message || "Error al iniciar la visita.");
    } finally {
      setSavingVisitId(null);
    }
  };

  const handleCompleteVisit = async (index) => {
    setSavingVisitId(index);
    setError("");
    try {
      const now = new Date().toISOString();
      const newVisits = updateVisit(index, {
        visit_status: "completed",
        completed_at: now,
      });
      await persistVisits(newVisits);
    } catch (e) {
      setError(e.message || "Error al completar la visita.");
    } finally {
      setSavingVisitId(null);
    }
  };

  const handleSkipVisit = async (index) => {
    setSavingVisitId(index);
    setError("");
    try {
      const newVisits = updateVisit(index, { visit_status: "skipped" });
      await persistVisits(newVisits);
    } catch (e) {
      setError(e.message || "Error al omitir la visita.");
    } finally {
      setSavingVisitId(null);
    }
  };

  const handleNotesChange = async (index, field, value) => {
    // Actualización local inmediata, persistencia con debounce ligero
    const newVisits = updateVisit(index, { [field]: value });
    setLocalSupervision((prev) => ({ ...prev, visits: newVisits }));
  };

  const handleBlurNotes = async (index, field) => {
    setSavingVisitId(`notes-${index}`);
    try {
      await base44.entities.Supervision.update(localSupervision.id, { visits: localSupervision.visits });
    } catch (e) {
      setError("No se guardaron las notas: " + (e.message || ""));
    } finally {
      setSavingVisitId(null);
    }
  };

  const handlePhotoUpload = async (index, file) => {
    if (!file) return;
    setPhotoUploadingVisitId(index);
    setError("");
    try {
      const { file_uri } = await UploadPrivateFile({ file });
      const newVisits = [...(localSupervision.visits || [])];
      const photos = [...(newVisits[index].photos || []), { url: file_uri, comment: "" }];
      newVisits[index] = { ...newVisits[index], photos };
      await persistVisits(newVisits);
    } catch (e) {
      setError(e.message || "Error al subir la foto.");
    } finally {
      setPhotoUploadingVisitId(null);
    }
  };

  const handlePhotoComment = async (vi, pi, comment) => {
    const newVisits = [...(localSupervision.visits || [])];
    const photos = [...(newVisits[vi].photos || [])];
    photos[pi] = { ...photos[pi], comment };
    newVisits[vi] = { ...newVisits[vi], photos };
    setLocalSupervision((prev) => ({ ...prev, visits: newVisits }));
  };

  const handlePhotoCommentBlur = async (vi) => {
    setSavingVisitId(`photo-${vi}`);
    try {
      await base44.entities.Supervision.update(localSupervision.id, { visits: localSupervision.visits });
    } catch (e) {
      setError("No se guardó el comentario: " + (e.message || ""));
    } finally {
      setSavingVisitId(null);
    }
  };

  const handleRemovePhoto = async (vi, pi) => {
    const newVisits = [...(localSupervision.visits || [])];
    const photos = (newVisits[vi].photos || []).filter((_, i) => i !== pi);
    newVisits[vi] = { ...newVisits[vi], photos };
    await persistVisits(newVisits);
    setSignedUrls((prev) => {
      const next = { ...prev };
      delete next[`${vi}-${pi}`];
      return next;
    });
  };

  const handleBlockStatusChange = async (newStatus) => {
    setBlockStatusSaving(true);
    setError("");
    try {
      const sup = localSupervision;
      const extraUpdate = {};
      let workEntryId = sup.work_entry_id;

      if (newStatus === "completed") {
        // Al completar el bloque: crear (o actualizar) la WorkEntry pagable del supervisor.
        // Las horas/tarifa se calculan del bloque real, así los recortes de horario se reflejan al final.
        const supervisorUser = users.find((u) => u.id === sup.supervisor_id);
        const fields = computeSupervisionWorkEntryFields(sup, supervisorUser);
        if (sup.work_entry_id) {
          const we = await base44.entities.WorkEntry.get(sup.work_entry_id).catch(() => null);
          if (we && !we.invoiced) {
            await base44.entities.WorkEntry.update(we.id, {
              hours: fields.hours,
              total_amount: fields.total_amount,
              hourly_rate: fields.hourly_rate,
              work_date: fields.work_date,
              period: fields.period,
            });
          } else if (!we) {
            // La WorkEntry referenciada fue eliminada (referencia huérfana):
            // crear una nueva y actualizar la referencia en la supervisión.
            const newWe = await base44.entities.WorkEntry.create({ ...fields, supervision_id: sup.id });
            workEntryId = newWe.id;
            extraUpdate.work_entry_id = newWe.id;
          }
        } else {
          const we = await base44.entities.WorkEntry.create({ ...fields, supervision_id: sup.id });
          workEntryId = we.id;
          extraUpdate.work_entry_id = we.id;
        }
      } else if (sup.work_entry_id) {
        // Al salir de "completado" (reabrir/cancelar): eliminar la WorkEntry si no está facturada,
        // para que el pago solo exista mientras el bloque esté realmente terminado.
        const we = await base44.entities.WorkEntry.get(sup.work_entry_id).catch(() => null);
        if (we && !we.invoiced) {
          await base44.entities.WorkEntry.delete(we.id);
          workEntryId = null;
          extraUpdate.work_entry_id = null;
        }
      }

      await base44.entities.Supervision.update(sup.id, { status: newStatus, ...extraUpdate });
      const updated = { ...sup, status: newStatus, work_entry_id: workEntryId };
      setLocalSupervision(updated);
      if (onUpdate) onUpdate(updated);
    } catch (e) {
      setError(e.message || "Error al cambiar el estado del bloque.");
    } finally {
      setBlockStatusSaving(false);
    }
  };

  const loadAllClients = async () => {
    if (clientsLoaded) return;
    setVisitMutating(true);
    try {
      const BATCH = 500;
      let all = [];
      let skip = 0;
      while (true) {
        const batch = await base44.entities.Client.list("-created_date", BATCH, skip);
        const arr = Array.isArray(batch) ? batch : (batch?.items || []);
        all = all.concat(arr);
        if (arr.length < BATCH) break;
        skip += BATCH;
      }
      setAllClients(all.filter((c) => c.active !== false));
      setClientsLoaded(true);
    } catch (e) {
      console.error("Error cargando clientes:", e);
    } finally {
      setVisitMutating(false);
    }
  };

  const filteredAllClients = useMemo(() => {
    const q = clientSearch.toLowerCase().trim();
    if (!q) return allClients;
    return allClients.filter(
      (c) =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.address || "").toLowerCase().includes(q)
    );
  }, [allClients, clientSearch]);

  const handleAddClient = async (clientId) => {
    const exists = (localSupervision?.visits || []).some((v) => v.client_id === clientId);
    if (exists) return;
    const c = allClients.find((cl) => cl.id === clientId);
    const newVisit = {
      client_id: clientId,
      client_name: c?.name || "Cliente",
      client_address: c?.address || "",
      visit_status: "pending",
      started_at: null,
      completed_at: null,
      notes: "",
      incidents: "",
      photos: [],
    };
    const newVisits = [...(localSupervision?.visits || []), newVisit];
    setVisitMutating(true);
    try {
      await persistVisits(newVisits);
      setClientInfos((prev) => ({ ...prev, [clientId]: c }));
      setClientSearch("");
    } catch (e) {
      setError(e.message || "Error al agregar cliente.");
    } finally {
      setVisitMutating(false);
    }
  };

  const handleRemoveVisit = async (index) => {
    if (!window.confirm("¿Quitar este cliente de la supervisión?")) return;
    const newVisits = (localSupervision?.visits || []).filter((_, i) => i !== index);
    setVisitMutating(true);
    try {
      await persistVisits(newVisits);
    } catch (e) {
      setError(e.message || "Error al quitar cliente.");
    } finally {
      setVisitMutating(false);
    }
  };

  const completedCount = (localSupervision?.visits || []).filter((v) => v.visit_status === "completed").length;
  const totalCount = (localSupervision?.visits || []).length;
  const supervisorName = localSupervision?.supervisor_name || "Supervisor";

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Header del bloque */}
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-purple-700">
              <Shield className="w-5 h-5" />
              <span className="font-bold text-base">Bloque de Supervisión</span>
            </div>
            <p className="text-sm text-slate-700 font-medium">{supervisorName}</p>
            <div className="flex items-center gap-3 text-xs text-slate-600">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {formatTime(localSupervision?.start_time)} - {formatTime(localSupervision?.end_time)}
              </span>
              <span>
                {localSupervision?.date && format(new Date(localSupervision.date + "T12:00:00"), "d MMM yyyy", { locale: es })}
              </span>
            </div>
          </div>
          <div className="text-right">
            <Badge className={
              localSupervision?.status === "completed" ? "bg-green-100 text-green-700" :
              localSupervision?.status === "in_progress" ? "bg-blue-100 text-blue-700" :
              localSupervision?.status === "cancelled" ? "bg-red-100 text-red-700" :
              "bg-slate-100 text-slate-700"
            }>
              {localSupervision?.status === "completed" ? "Completado" :
               localSupervision?.status === "in_progress" ? "En curso" :
               localSupervision?.status === "cancelled" ? "Cancelado" : "Programado"}
            </Badge>
            <p className="text-xs text-slate-500 mt-1">{completedCount}/{totalCount} visitas</p>
          </div>
        </div>
        {localSupervision?.notes && (
          <div className="mt-3 pt-3 border-t border-purple-200 text-sm text-slate-700">
            <FileText className="w-3.5 h-3.5 inline mr-1 text-purple-500" />
            {localSupervision.notes}
          </div>
        )}
        {isAdmin && (
          <div className="mt-3 flex gap-2">
            {localSupervision?.status !== "completed" && (
              <Button size="sm" variant="outline" onClick={() => handleBlockStatusChange("completed")} disabled={blockStatusSaving} className="border-green-300 text-green-700 hover:bg-green-50">
                <CheckCircle className="w-3.5 h-3.5 mr-1" /> Marcar bloque completado
              </Button>
            )}
            {localSupervision?.status === "completed" && (
              <Button size="sm" variant="outline" onClick={() => handleBlockStatusChange("scheduled")} disabled={blockStatusSaving}>
                Reabrir bloque
              </Button>
            )}
            {localSupervision?.status !== "cancelled" && (
              <Button size="sm" variant="outline" onClick={() => handleBlockStatusChange("cancelled")} disabled={blockStatusSaving} className="border-red-200 text-red-600 hover:bg-red-50">
                Cancelar bloque
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Lista de visitas */}
      <div className="space-y-3">
        {(localSupervision?.visits || []).map((visit, index) => {
          const client = clientInfos[visit.client_id];
          const cfg = visitStatusConfig[visit.visit_status] || visitStatusConfig.pending;
          const StatusIcon = cfg.icon;
          return (
            <Card key={index} className="overflow-hidden border-l-4" style={{ borderLeftColor: visit.visit_status === "completed" ? "#16a34a" : visit.visit_status === "in_progress" ? "#2563eb" : "#cbd5e1" }}>
              <CardContent className="p-4 space-y-3">
                {/* Cliente + estado */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <StatusIcon className="w-4 h-4 flex-shrink-0 text-slate-600" />
                      <span className="font-semibold text-slate-900 truncate">{visit.client_name}</span>
                    </div>
                    {visit.client_address && (
                      <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {visit.client_address}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={cfg.color}>{cfg.label}</Badge>
                    {canEdit && (
                      <button
                        onClick={() => handleRemoveVisit(index)}
                        disabled={visitMutating}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded p-1 transition-colors disabled:opacity-40"
                        title="Quitar cliente de la supervisión"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Información completa del cliente (acceso/llaves, mascotas, notas por área, fotos) + equipo y tiempo restante */}
                <SupervisionClientInfo
                  client={client}
                  enrichment={visitEnrichment[visit.client_id]}
                  loading={enrichmentLoading}
                />

                {/* Tiempos reales */}
                {(visit.started_at || visit.completed_at) && (
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    {visit.started_at && (
                      <span className="flex items-center gap-1">
                        <Play className="w-3 h-3" /> Inicio: {formatTime(visit.started_at)}
                      </span>
                    )}
                    {visit.completed_at && (
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle className="w-3 h-3" /> Fin: {formatTime(visit.completed_at)}
                      </span>
                    )}
                  </div>
                )}

                {/* Acciones de visita */}
                {canEdit && visit.visit_status !== "completed" && visit.visit_status !== "skipped" && (
                  <div className="flex gap-2">
                    {visit.visit_status === "pending" && (
                      <Button size="sm" variant="outline" onClick={() => handleStartVisit(index)} disabled={savingVisitId === index}>
                        <Play className="w-3.5 h-3.5 mr-1" /> Iniciar visita
                      </Button>
                    )}
                    {visit.visit_status === "in_progress" && (
                      <Button size="sm" onClick={() => handleCompleteVisit(index)} disabled={savingVisitId === index} className="bg-green-600 hover:bg-green-700">
                        <CheckCircle className="w-3.5 h-3.5 mr-1" /> Completar
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => handleSkipVisit(index)} disabled={savingVisitId === index} className="text-amber-600">
                      <SkipForward className="w-3.5 h-3.5 mr-1" /> Omitir
                    </Button>
                  </div>
                )}
                {canEdit && visit.visit_status === "skipped" && (
                  <Button size="sm" variant="ghost" onClick={() => handleStartVisit(index)} disabled={savingVisitId === index} className="text-slate-600">
                    Reabrir visita
                  </Button>
                )}

                {/* Notas e incidencias (editable si no está omitida) */}
                {canEdit && visit.visit_status !== "skipped" && (
                  <div className="grid grid-cols-1 gap-2 pt-1">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-600">Observaciones de la revisión</Label>
                      <Textarea
                        value={visit.notes || ""}
                        onChange={(e) => handleNotesChange(index, "notes", e.target.value)}
                        onBlur={() => handleBlurNotes(index, "notes")}
                        placeholder="Qué revisaste, estado general del trabajo..."
                        rows={2}
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-600">Incidencias detectadas</Label>
                      <Textarea
                        value={visit.incidents || ""}
                        onChange={(e) => handleNotesChange(index, "incidents", e.target.value)}
                        onBlur={() => handleBlurNotes(index, "incidents")}
                        placeholder="Problemas, retrabajos, alertas para administración..."
                        rows={2}
                        className="text-sm"
                      />
                    </div>
                  </div>
                )}

                {/* Notas en solo lectura si está omitida/completada y hay contenido */}
                {!canEdit && (visit.notes || visit.incidents) && (
                  <div className="space-y-1 text-xs text-slate-600">
                    {visit.notes && <p><strong>Observaciones:</strong> {visit.notes}</p>}
                    {visit.incidents && <p className="text-red-600"><strong>Incidencias:</strong> {visit.incidents}</p>}
                  </div>
                )}

                {/* Fotos */}
                <div className="space-y-2">
                  {canEdit && visit.visit_status !== "skipped" && (
                    <div>
                      <Label className="text-xs text-slate-600 flex items-center gap-1">
                        <Camera className="w-3.5 h-3.5" /> Fotos de evidencia
                      </Label>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => {
                          Array.from(e.target.files || []).forEach((f) => handlePhotoUpload(index, f));
                          e.target.value = "";
                        }}
                        className="hidden"
                        id={`photo-input-${index}`}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => document.getElementById(`photo-input-${index}`).click()}
                        disabled={photoUploadingVisitId === index}
                        className="mt-1"
                      >
                        {photoUploadingVisitId === index ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Camera className="w-3.5 h-3.5 mr-1" />}
                        {photoUploadingVisitId === index ? "Subiendo..." : "Subir foto (stored privately)"}
                      </Button>
                    </div>
                  )}
                  {(visit.photos || []).length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {visit.photos.map((p, pi) => {
                        const key = `${index}-${pi}`;
                        const src = signedUrls[key] || (p.url && /^https?:\/\//.test(p.url) ? p.url : null);
                        return (
                          <div key={pi} className="relative group rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                            {src ? (
                              <img src={src} alt={p.comment || "Foto"} className="w-full h-24 object-cover" />
                            ) : (
                              <div className="w-full h-24 flex items-center justify-center text-slate-400">
                                <ImageOff className="w-6 h-6" />
                              </div>
                            )}
                            {canEdit && (
                              <button
                                onClick={() => handleRemovePhoto(index, pi)}
                                className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Eliminar foto"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                            {p.comment && (
                              <p className="text-xs text-slate-600 p-1 bg-white/80 backdrop-blur-sm">{p.comment}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {canEdit && (
        <div className="pt-1">
          <Popover open={addClientOpen} onOpenChange={(o) => { setAddClientOpen(o); if (o) loadAllClients(); }}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="border-purple-200 text-purple-700 hover:bg-purple-50" disabled={visitMutating}>
                <UserPlus className="w-4 h-4 mr-1" /> Agregar cliente
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Buscar cliente por nombre o dirección..."
                  value={clientSearch}
                  onValueChange={setClientSearch}
                />
                <CommandList className="max-h-[300px]">
                  {!clientsLoaded ? (
                    <CommandEmpty>Cargando clientes...</CommandEmpty>
                  ) : filteredAllClients.length === 0 ? (
                    <CommandEmpty>No se encontraron clientes.</CommandEmpty>
                  ) : (
                    <CommandGroup>
                      {filteredAllClients.map((c) => {
                        const already = (localSupervision?.visits || []).some((v) => v.client_id === c.id);
                        return (
                          <CommandItem
                            key={c.id}
                            onSelect={() => { if (!already) handleAddClient(c.id); }}
                            className="flex items-center gap-2"
                          >
                            <div className="flex-1 min-w-0">
                              <p className={`font-medium truncate ${already ? "text-slate-400 line-through" : ""}`}>{c.name}</p>
                              {c.address && (
                                <p className="text-xs text-slate-500 truncate flex items-center gap-1">
                                  <MapPin className="w-3 h-3" /> {c.address}
                                </p>
                              )}
                            </div>
                            {already && <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      )}

      <div className="flex justify-between pt-2">
        <div>
          {isAdmin && onEditBlock && (
            <Button variant="outline" onClick={() => onEditBlock(localSupervision)} className="border-purple-200 text-purple-700 hover:bg-purple-50">
              <Shield className="w-4 h-4 mr-1" /> Editar bloque
            </Button>
          )}
        </div>
        <Button variant="outline" onClick={onClose}>Cerrar</Button>
      </div>
    </div>
  );
}