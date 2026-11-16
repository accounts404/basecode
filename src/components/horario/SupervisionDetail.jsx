import React, { useState, useEffect, useMemo, useRef } from "react";
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
  RotateCcw, Lock,
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

  // Firmas estables derivadas: cambian solo cuando cambian los client_ids o las fotos,
  // NO en cada tecla al editar notas/incidencias. Evita re-ejecutar efectos pesados por keystroke.
  const clientIdsKey = (localSupervision?.visits || [])
    .map((v) => v.client_id)
    .filter(Boolean)
    .sort()
    .join(",");
  const photoSignature = (localSupervision?.visits || [])
    .flatMap((v, vi) => (v.photos || []).map((p, pi) => `${vi}-${pi}:${p.url}`))
    .join("|");

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
  }, [clientIdsKey]);

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
  }, [clientIdsKey, localSupervision?.date, localSupervision?.start_time]);

  // Generar signed URLs para fotos privadas (solo cuando cambia el set de fotos, no en cada tecla)
  useEffect(() => {
    if (!localSupervision?.visits) return;
    const allPhotos = [];
    localSupervision.visits.forEach((v, vi) => {
      (v.photos || []).forEach((p, pi) => {
        if (p.url && !/^https?:\/\//.test(p.url)) {
          allPhotos.push({ vi, pi, uri: p.url });
        }
      });
    });
    if (allPhotos.length === 0) return;
    let cancelled = false;
    (async () => {
      const fetched = {};
      await Promise.all(
        allPhotos.map(async ({ vi, pi, uri }) => {
          const key = `${vi}-${pi}`;
          try {
            const res = await CreateFileSignedUrl({ file_uri: uri, expires_in: 3600 });
            fetched[key] = res.signed_url;
          } catch (e) {
            console.warn("No se pudo firmar la URL de la foto:", e);
          }
        })
      );
      if (cancelled || Object.keys(fetched).length === 0) return;
      setSignedUrls((prev) => {
        const next = { ...prev };
        let changed = false;
        Object.entries(fetched).forEach(([k, url]) => {
          if (!next[k]) {
            next[k] = url;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [photoSignature]);

  // Marca las visitas con texto sin guardar, para no pisarlo al sincronizar
  const dirtyNotesRef = useRef(new Set());
  const [workEntryInvoiced, setWorkEntryInvoiced] = useState(false);

  // Fusiona lo que llega del servidor conservando el texto que se está escribiendo
  const mergeRemote = (prev, remote) => {
    if (!prev) return remote;
    const visits = (remote.visits || []).map((rv) => {
      const pv = (prev.visits || []).find((v) => v.client_id === rv.client_id);
      if (pv && dirtyNotesRef.current.has(rv.client_id)) {
        return { ...rv, notes: pv.notes ?? "", incidents: pv.incidents ?? "" };
      }
      return rv;
    });
    return { ...prev, ...remote, visits };
  };

  // Sincronización en vivo: si otra persona cambia el bloque, esta pantalla se actualiza sola.
  useEffect(() => {
    const supId = localSupervision?.id;
    if (!supId) return;
    const unsubscribe = base44.entities.Supervision.subscribe((event) => {
      const remote = event?.data;
      if (!remote || remote.id !== supId || event.type === "delete") return;
      setLocalSupervision((prev) => mergeRemote(prev, remote));
    });
    return unsubscribe;
  }, [localSupervision?.id]);

  // Si el pago del bloque ya está facturado, las visitas quedan bloqueadas
  useEffect(() => {
    let cancelled = false;
    const weId = localSupervision?.work_entry_id;
    if (!weId) {
      setWorkEntryInvoiced(false);
      return;
    }
    base44.entities.WorkEntry.get(weId)
      .then((we) => { if (!cancelled) setWorkEntryInvoiced(!!we?.invoiced); })
      .catch(() => { if (!cancelled) setWorkEntryInvoiced(false); });
    return () => { cancelled = true; };
  }, [localSupervision?.work_entry_id]);

  // Guarda UN solo cambio en el servidor: nunca manda la lista completa de visitas.
  const callVisitAction = async (action, extra = {}) => {
    try {
      const { data } = await base44.functions.invoke("updateSupervisionVisit", {
        supervision_id: localSupervision.id,
        action,
        ...extra,
      });
      if (data?.supervision) {
        if (extra.client_id) dirtyNotesRef.current.delete(extra.client_id);
        setLocalSupervision((prev) => mergeRemote(prev, data.supervision));
        if (onUpdate) onUpdate(data.supervision);
      }
      return data?.supervision;
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || "No se pudo guardar el cambio.";
      throw new Error(msg);
    }
  };

  // Visitas quitadas que todavía se pueden restaurar
  const removedVisits = useMemo(() => {
    const log = localSupervision?.visits_log || [];
    const restored = new Set(log.filter((l) => l.action === "restored").map((l) => l.log_id));
    return log.filter((l) => l.action === "removed" && !restored.has(l.id)).reverse();
  }, [localSupervision?.visits_log]);

  // Quitar o restaurar clientes de un bloque es exclusivo del administrador
  const canRemoveVisits = isAdmin && localSupervision?.status !== "completed" && !workEntryInvoiced;

  const visitByIndex = (index) => (localSupervision.visits || [])[index];

  const handleStartVisit = async (index) => {
    const visit = visitByIndex(index);
    if (!visit?.client_id) return;
    setSavingVisitId(index);
    setError("");
    try {
      await callVisitAction(visit.visit_status === "skipped" ? "reopen_visit" : "start_visit", { client_id: visit.client_id });
    } catch (e) {
      setError(e.message || "Error al iniciar la visita.");
    } finally {
      setSavingVisitId(null);
    }
  };

  const handleCompleteVisit = async (index) => {
    const visit = visitByIndex(index);
    if (!visit?.client_id) return;
    setSavingVisitId(index);
    setError("");
    try {
      await callVisitAction("complete_visit", { client_id: visit.client_id });
    } catch (e) {
      setError(e.message || "Error al completar la visita.");
    } finally {
      setSavingVisitId(null);
    }
  };

  const handleSkipVisit = async (index) => {
    const visit = visitByIndex(index);
    if (!visit?.client_id) return;
    setSavingVisitId(index);
    setError("");
    try {
      await callVisitAction("skip_visit", { client_id: visit.client_id });
    } catch (e) {
      setError(e.message || "Error al omitir la visita.");
    } finally {
      setSavingVisitId(null);
    }
  };

  const handleNotesChange = (index, field, value) => {
    const visit = visitByIndex(index);
    if (visit?.client_id) dirtyNotesRef.current.add(visit.client_id);
    // Update funcional: lee del estado previo para no perder caracteres al escribir rápido.
    setLocalSupervision((prev) => {
      const newVisits = [...(prev.visits || [])];
      newVisits[index] = { ...newVisits[index], [field]: value };
      return { ...prev, visits: newVisits };
    });
  };

  const handleBlurNotes = async (index) => {
    const visit = visitByIndex(index);
    if (!visit?.client_id) return;
    setSavingVisitId(`notes-${index}`);
    try {
      await callVisitAction("save_visit_text", {
        client_id: visit.client_id,
        notes: visit.notes || "",
        incidents: visit.incidents || "",
      });
    } catch (e) {
      setError("No se guardaron las notas: " + (e.message || ""));
    } finally {
      setSavingVisitId(null);
    }
  };

  const handlePhotoUpload = async (index, files) => {
    const list = Array.from(files || []).filter(Boolean);
    const visit = visitByIndex(index);
    if (!list.length || !visit?.client_id) return;
    setPhotoUploadingVisitId(index);
    setError("");
    try {
      // Una por una: cada foto se agrega sobre lo que ya está guardado, sin pisarse.
      for (const file of list) {
        const { file_uri } = await UploadPrivateFile({ file });
        await callVisitAction("add_photo", { client_id: visit.client_id, photo_url: file_uri });
      }
    } catch (e) {
      setError(e.message || "Error al subir la foto.");
    } finally {
      setPhotoUploadingVisitId(null);
    }
  };

  const handlePhotoComment = (vi, pi, comment) => {
    setLocalSupervision((prev) => {
      const newVisits = [...(prev.visits || [])];
      const photos = [...(newVisits[vi].photos || [])];
      photos[pi] = { ...photos[pi], comment };
      newVisits[vi] = { ...newVisits[vi], photos };
      return { ...prev, visits: newVisits };
    });
  };

  const handlePhotoCommentBlur = async (vi, photoUrl) => {
    const visit = visitByIndex(vi);
    const photo = (visit?.photos || []).find((p) => p.url === photoUrl);
    if (!visit?.client_id || !photo) return;
    setSavingVisitId(`photo-${vi}`);
    try {
      await callVisitAction("photo_comment", {
        client_id: visit.client_id,
        photo_url: photoUrl,
        comment: photo.comment || "",
      });
    } catch (e) {
      setError("No se guardó el comentario: " + (e.message || ""));
    } finally {
      setSavingVisitId(null);
    }
  };

  const handleRemovePhoto = async (vi, pi) => {
    const visit = visitByIndex(vi);
    const photoUrl = visit?.photos?.[pi]?.url;
    if (!visit?.client_id || !photoUrl) return;
    setError("");
    try {
      await callVisitAction("remove_photo", { client_id: visit.client_id, photo_url: photoUrl });
      setSignedUrls((prev) => {
        const next = { ...prev };
        delete next[`${vi}-${pi}`];
        return next;
      });
    } catch (e) {
      setError(e.message || "Error al eliminar la foto.");
    }
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
    setVisitMutating(true);
    setError("");
    try {
      await callVisitAction("add_visit", {
        client_id: clientId,
        client_name: c?.name || "Cliente",
        client_address: c?.address || "",
      });
      setClientInfos((prev) => ({ ...prev, [clientId]: c }));
      setClientSearch("");
    } catch (e) {
      setError(e.message || "Error al agregar cliente.");
    } finally {
      setVisitMutating(false);
    }
  };

  const handleRemoveVisit = async (index) => {
    const visit = visitByIndex(index);
    if (!visit?.client_id) return;
    if (!isAdmin) {
      setError("Solo un administrador puede quitar clientes de un bloque de supervisión.");
      return;
    }
    if (!canRemoveVisits) {
      setError("Este bloque ya está completado o facturado: no se pueden quitar visitas.");
      return;
    }
    if (!window.confirm("¿Quitar este cliente de la supervisión? Podrás restaurarlo después.")) return;
    setVisitMutating(true);
    setError("");
    try {
      await callVisitAction("remove_visit", { client_id: visit.client_id });
    } catch (e) {
      setError(e.message || "Error al quitar cliente.");
    } finally {
      setVisitMutating(false);
    }
  };

  const handleRestoreVisit = async (logEntryId) => {
    setVisitMutating(true);
    setError("");
    try {
      await callVisitAction("restore_visit", { log_id: logEntryId });
    } catch (e) {
      setError(e.message || "Error al restaurar la visita.");
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
                    {canRemoveVisits && (
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
                          handlePhotoUpload(index, e.target.files);
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

      {isAdmin && !canRemoveVisits && (
        <p className="text-xs text-slate-500 flex items-center gap-1">
          <Lock className="w-3 h-3" />
          {workEntryInvoiced
            ? "El pago de este bloque está facturado: las visitas ya no se pueden quitar."
            : "Bloque completado: las visitas ya no se pueden quitar."}
        </p>
      )}

      {isAdmin && removedVisits.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
          <p className="text-xs font-semibold text-amber-800 flex items-center gap-1">
            <RotateCcw className="w-3.5 h-3.5" /> Clientes quitados de este bloque ({removedVisits.length})
          </p>
          {removedVisits.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between gap-2 bg-white rounded-lg border border-amber-200 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">
                  {entry.client_name || entry.visit_snapshot?.client_name || "Cliente"}
                </p>
                <p className="text-xs text-slate-500">
                  Quitado el {entry.at ? format(new Date(entry.at), "d MMM yyyy HH:mm", { locale: es }) : "—"} por {entry.by_name || "—"}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleRestoreVisit(entry.id)}
                disabled={visitMutating}
                className="border-amber-300 text-amber-800 hover:bg-amber-100"
              >
                Restaurar
              </Button>
            </div>
          ))}
        </div>
      )}

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