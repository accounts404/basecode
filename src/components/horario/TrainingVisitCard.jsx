import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Circle, Play, CheckCircle, SkipForward, MapPin, Camera,
  ImageOff, Loader2, X, Trash2, GraduationCap, BookOpen,
} from "lucide-react";
import { UploadPrivateFile, CreateFileSignedUrl } from "@/integrations/Core";
import SupervisionClientInfo from "./SupervisionClientInfo";
import { TRAINING_AREAS } from "./trainingHelpers";

const visitStatusConfig = {
  pending: { label: "Pendiente", color: "bg-slate-100 text-slate-700", icon: Circle },
  in_progress: { label: "En curso", color: "bg-blue-100 text-blue-700", icon: Play },
  completed: { label: "Completada", color: "bg-green-100 text-green-700", icon: CheckCircle },
  skipped: { label: "Omitida", color: "bg-amber-100 text-amber-700", icon: SkipForward },
};

const parseISOAsUTC = (iso) => {
  if (!iso) return null;
  return new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
};
const formatTime = (iso) => {
  if (!iso) return "—";
  const d = parseISOAsUTC(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

export default function TrainingVisitCard({
  visit,
  index,
  client,
  enrichment,
  enrichmentLoading,
  canEdit,
  isAdmin,
  blockCompleted,
  onAction,
  onLocalPatch,
}) {
  const [trainerNotes, setTrainerNotes] = useState(visit.trainer_notes || "");
  const [instructions, setInstructions] = useState(visit.training_instructions || "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [signed, setSigned] = useState({});

  useEffect(() => {
    setTrainerNotes(visit.trainer_notes || "");
    setInstructions(visit.training_instructions || "");
  }, [visit.client_id, visit.trainer_notes, visit.training_instructions]);

  const photos = visit.photos || [];
  const photoSignature = photos.map((p) => p.url).join("|");

  // Firmar las fotos privadas para poder mostrarlas
  useEffect(() => {
    const pending = photos
      .map((p, pi) => ({ key: `${pi}`, uri: p.url }))
      .filter(({ key, uri }) => uri && !/^https?:\/\//.test(uri) && !signed[key]);
    if (pending.length === 0) return;
    let cancelled = false;
    (async () => {
      const fetched = {};
      await Promise.all(
        pending.map(async ({ key, uri }) => {
          try {
            const res = await CreateFileSignedUrl({ file_uri: uri, expires_in: 3600 });
            if (res?.signed_url) fetched[key] = res.signed_url;
          } catch (e) {
            console.warn("No se pudo firmar la foto:", e);
          }
        })
      );
      if (!cancelled && Object.keys(fetched).length > 0) {
        setSigned((prev) => ({ ...prev, ...fetched }));
      }
    })();
    return () => { cancelled = true; };
  }, [photoSignature]);

  const run = async (action, extra = {}) => {
    setSaving(true);
    setError("");
    try {
      await onAction(action, { client_id: visit.client_id, ...extra });
    } catch (e) {
      setError(e.message || "No se pudo guardar el cambio.");
    } finally {
      setSaving(false);
    }
  };

  const handleAreasToggle = (key) => {
    const current = visit.areas_covered || [];
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    onLocalPatch(visit.client_id, { areas_covered: next });
    run("set_areas", { areas_covered: next });
  };

  const handlePhotoUpload = async (files) => {
    const list = Array.from(files || []).filter(Boolean);
    if (!list.length) return;
    setUploading(true);
    setError("");
    try {
      for (const file of list) {
        const { file_uri } = await UploadPrivateFile({ file });
        await onAction("add_photo", { client_id: visit.client_id, photo_url: file_uri });
      }
    } catch (e) {
      setError(e.message || "Error al subir la foto.");
    } finally {
      setUploading(false);
    }
  };

  const cfg = visitStatusConfig[visit.visit_status] || visitStatusConfig.pending;
  const StatusIcon = cfg.icon;
  const borderColor =
    visit.visit_status === "completed" ? "#16a34a" : visit.visit_status === "in_progress" ? "#2563eb" : "#cbd5e1";

  return (
    <Card className="overflow-hidden border-l-4" style={{ borderLeftColor: borderColor }}>
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
            {isAdmin && !blockCompleted && (
              <button
                onClick={() => run("remove_visit")}
                disabled={saving}
                className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded p-1 transition-colors disabled:opacity-40"
                title="Quitar esta casa del entrenamiento"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Ficha del cliente: accesos, mascotas, notas por área y fotos */}
        <SupervisionClientInfo client={client} enrichment={enrichment} loading={enrichmentLoading} />

        {/* Qué debe enseñarle aquí (lo escribe el administrador) */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-1.5">
          <p className="text-[11px] font-semibold text-amber-800 flex items-center gap-1">
            <BookOpen className="w-3.5 h-3.5" /> Qué debe enseñarle en esta casa
          </p>
          {isAdmin ? (
            <>
              <Textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                onBlur={() => {
                  if ((visit.training_instructions || "") !== instructions) {
                    run("save_instructions", { training_instructions: instructions });
                  }
                }}
                placeholder="Indicaciones del administrador para esta casa..."
                rows={2}
                className="text-sm bg-white"
              />
              <p className="text-[10px] text-amber-700">Se guarda al salir del campo.</p>
            </>
          ) : (
            <p className="text-xs text-amber-900 whitespace-pre-wrap">
              {visit.training_instructions || "Sin indicaciones del administrador para esta casa."}
            </p>
          )}
        </div>

        {/* Áreas enseñadas */}
        {canEdit && (
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Áreas enseñadas</Label>
            <div className="flex flex-wrap gap-1.5">
              {TRAINING_AREAS.map((area) => {
                const active = (visit.areas_covered || []).includes(area.key);
                return (
                  <button
                    key={area.key}
                    type="button"
                    onClick={() => handleAreasToggle(area.key)}
                    disabled={saving}
                    className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                      active
                        ? "bg-teal-600 text-white border-teal-600"
                        : "bg-white text-slate-600 border-slate-300 hover:border-teal-400"
                    }`}
                  >
                    {area.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Tiempos reales */}
        {(visit.started_at || visit.completed_at) && (
          <div className="flex items-center gap-3 text-xs text-slate-500">
            {visit.started_at && (
              <span className="flex items-center gap-1"><Play className="w-3 h-3" /> Inicio: {formatTime(visit.started_at)}</span>
            )}
            {visit.completed_at && (
              <span className="flex items-center gap-1 text-green-600"><CheckCircle className="w-3 h-3" /> Fin: {formatTime(visit.completed_at)}</span>
            )}
          </div>
        )}

        {/* Acciones de visita */}
        {canEdit && visit.visit_status !== "completed" && visit.visit_status !== "skipped" && (
          <div className="flex gap-2">
            {visit.visit_status === "pending" && (
              <Button size="sm" variant="outline" onClick={() => run("start_visit")} disabled={saving}>
                <Play className="w-3.5 h-3.5 mr-1" /> Iniciar
              </Button>
            )}
            {visit.visit_status === "in_progress" && (
              <Button size="sm" onClick={() => run("complete_visit")} disabled={saving} className="bg-green-600 hover:bg-green-700">
                <CheckCircle className="w-3.5 h-3.5 mr-1" /> Completar
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => run("skip_visit")} disabled={saving} className="text-amber-600">
              <SkipForward className="w-3.5 h-3.5 mr-1" /> Omitir
            </Button>
          </div>
        )}
        {canEdit && visit.visit_status === "skipped" && (
          <Button size="sm" variant="ghost" onClick={() => run("reopen_visit")} disabled={saving} className="text-slate-600">
            Reabrir visita
          </Button>
        )}

        {/* Notas del entrenador: cómo le fue con el aprendiz */}
        {canEdit && visit.visit_status !== "skipped" && (
          <div className="space-y-1">
            <Label className="text-xs text-slate-600 flex items-center gap-1">
              <GraduationCap className="w-3.5 h-3.5" /> Cómo le fue con el aprendiz
            </Label>
            <Textarea
              value={trainerNotes}
              onChange={(e) => setTrainerNotes(e.target.value)}
              onBlur={() => {
                if ((visit.trainer_notes || "") !== trainerNotes) {
                  run("save_trainer_notes", { trainer_notes: trainerNotes });
                }
              }}
              placeholder="Qué aprendió, qué le costó, qué debe practicar..."
              rows={2}
              className="text-sm"
            />
            <p className="text-[10px] text-slate-400">Se guarda al salir del campo.</p>
          </div>
        )}

        {/* Fotos */}
        {canEdit && visit.visit_status !== "skipped" && (
          <div>
            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 border border-teal-200 bg-teal-50 hover:bg-teal-100 rounded-md px-2.5 py-1.5 cursor-pointer">
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
              {uploading ? "Subiendo..." : "Agregar foto"}
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                disabled={uploading}
                onChange={(e) => { handlePhotoUpload(e.target.files); e.target.value = ""; }}
              />
            </label>
          </div>
        )}

        {photos.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {photos.map((p, pi) => {
              const src = signed[`${pi}`] || (p.url && /^https?:\/\//.test(p.url) ? p.url : null);
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
                      onClick={() => run("remove_photo", { photo_url: p.url })}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Eliminar foto"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                  {canEdit ? (
                    <input
                      defaultValue={p.comment || ""}
                      onBlur={(e) => {
                        if ((p.comment || "") !== e.target.value) {
                          run("photo_comment", { photo_url: p.url, comment: e.target.value });
                        }
                      }}
                      placeholder="Comentario"
                      className="w-full text-[11px] px-1 py-0.5 border-0 bg-white/90 focus:outline-none"
                    />
                  ) : (
                    p.comment && <p className="text-xs text-slate-600 p-1 bg-white/80">{p.comment}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}