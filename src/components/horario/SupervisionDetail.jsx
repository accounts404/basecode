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
  Camera, AlertCircle, FileText, KeySquare, ImageOff, Loader2, X,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { UploadPrivateFile, CreateFileSignedUrl } from "@/integrations/Core";

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

export default function SupervisionDetail({ supervision, currentUser, onClose, onUpdate, onEditBlock }) {
  const [localSupervision, setLocalSupervision] = useState(supervision);
  const [clientInfos, setClientInfos] = useState({});
  const [loadingClients, setLoadingClients] = useState(true);
  const [savingVisitId, setSavingVisitId] = useState(null);
  const [photoUploadingVisitId, setPhotoUploadingVisitId] = useState(null);
  const [signedUrls, setSignedUrls] = useState({});
  const [error, setError] = useState("");
  const [blockStatusSaving, setBlockStatusSaving] = useState(false);

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

  // Generar signed URLs para fotos privadas
  const refreshSignedUrls = useCallback(async () => {
    if (!localSupervision?.visits) return;
    const allPhotos = [];
    localSupervision.visits.forEach((v, vi) => {
      (v.photos || []).forEach((p, pi) => {
        if (p.url && p.url.startsWith("private://")) {
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
      await base44.entities.Supervision.update(localSupervision.id, { status: newStatus });
      setLocalSupervision((prev) => ({ ...prev, status: newStatus }));
      if (onUpdate) onUpdate({ ...localSupervision, status: newStatus });
    } catch (e) {
      setError(e.message || "Error al cambiar el estado del bloque.");
    } finally {
      setBlockStatusSaving(false);
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
        {isAdmin && localSupervision?.status !== "cancelled" && (
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
            <Button size="sm" variant="outline" onClick={() => handleBlockStatusChange("cancelled")} disabled={blockStatusSaving} className="border-red-200 text-red-600 hover:bg-red-50">
              Cancelar bloque
            </Button>
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
                  <Badge className={cfg.color}>{cfg.label}</Badge>
                </div>

                {/* Info operativa del cliente (visible para el supervisor) */}
                {loadingClients ? (
                  <p className="text-xs text-slate-400">Cargando información del cliente...</p>
                ) : client ? (
                  <div className="bg-slate-50 rounded-lg p-3 space-y-2 text-xs">
                    {client.address && (
                      <div className="flex items-start gap-1.5 text-slate-700">
                        <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-slate-400" />
                        <span>{client.address}</span>
                      </div>
                    )}
                    {client.has_access && client.access_identifier && (
                      <div className="flex items-start gap-1.5 text-slate-700">
                        <KeySquare className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-amber-500" />
                        <span><strong>Acceso:</strong> {client.access_identifier} {client.access_type ? `(${client.access_type})` : ""}</span>
                      </div>
                    )}
                    {(client.default_notes || client.notes_public || client.service_notes) && (
                      <div className="flex items-start gap-1.5 text-slate-700">
                        <FileText className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-slate-400" />
                        <span className="whitespace-pre-wrap">{client.default_notes || client.notes_public || client.service_notes}</span>
                      </div>
                    )}
                  </div>
                ) : null}

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
                        const src = signedUrls[key] || (p.url && !p.url.startsWith("private://") ? p.url : null);
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