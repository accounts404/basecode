import React, { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { History, Camera, ImageOff, AlertTriangle, FileText, User, Loader2, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CreateFileSignedUrl } from "@/integrations/Core";

const visitStatusConfig = {
  pending: { label: "Pendiente", color: "bg-slate-100 text-slate-600" },
  in_progress: { label: "En curso", color: "bg-blue-100 text-blue-700" },
  completed: { label: "Completada", color: "bg-green-100 text-green-700" },
  skipped: { label: "Omitida", color: "bg-amber-100 text-amber-700" },
};

const fmtDate = (date) => {
  if (!date) return "—";
  try {
    return format(new Date(`${date}T12:00:00`), "d MMM yyyy", { locale: es });
  } catch {
    return date;
  }
};

// Historial de revisiones anteriores de un cliente. Solo lectura: no edita nada.
export default function ClientSupervisionHistory({ history, loading }) {
  const reviews = Array.isArray(history) ? history : [];
  const [expanded, setExpanded] = useState(false);
  const [signed, setSigned] = useState({});
  const [failed, setFailed] = useState({});
  const [preview, setPreview] = useState(null);

  const photoSignature = reviews
    .flatMap((r, ri) => (r.photos || []).map((p, pi) => `${ri}-${pi}:${p.url}`))
    .join("|");

  // Firmar las fotos privadas en cuanto llegan las revisiones
  useEffect(() => {
    const pending = [];
    reviews.forEach((r, ri) => {
      (r.photos || []).forEach((p, pi) => {
        const key = `${ri}-${pi}`;
        if (p.url && !/^https?:\/\//.test(p.url) && !signed[key] && !failed[key]) {
          pending.push({ key, uri: p.url });
        }
      });
    });
    if (pending.length === 0) return;

    let cancelled = false;
    (async () => {
      const fetched = {};
      const errors = {};
      await Promise.all(
        pending.map(async ({ key, uri }) => {
          try {
            const res = await CreateFileSignedUrl({ file_uri: uri, expires_in: 3600 });
            if (res?.signed_url) fetched[key] = res.signed_url;
            else errors[key] = true;
          } catch (e) {
            console.warn("No se pudo firmar la foto del historial:", e);
            errors[key] = true;
          }
        })
      );
      if (cancelled) return;
      if (Object.keys(fetched).length > 0) setSigned((prev) => ({ ...prev, ...fetched }));
      if (Object.keys(errors).length > 0) setFailed((prev) => ({ ...prev, ...errors }));
    })();
  }, [photoSignature, signed, failed]);

  const photoSrc = (ri, pi, url) => {
    const key = `${ri}-${pi}`;
    if (signed[key]) return signed[key];
    return url && /^https?:\/\//.test(url) ? url : null;
  };

  return (
    <>
      <div className="w-full border rounded-lg px-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-between gap-2 py-2 text-xs font-semibold text-slate-700"
        >
            <span className="flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-purple-500" /> Revisiones anteriores
              {loading ? (
                <span className="text-[10px] font-normal text-slate-400">cargando...</span>
              ) : reviews.length > 0 ? (
                <Badge className="bg-purple-100 text-purple-700 text-[10px]">{reviews.length}</Badge>
              ) : (
                <span className="text-[10px] font-normal text-slate-400">ninguna</span>
              )}
            </span>
          <ChevronDown className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
        {expanded && (
          <div className="space-y-2 pb-2">
            {!loading && reviews.length === 0 && (
              <p className="text-xs text-slate-500 italic">
                Sin revisiones anteriores registradas para este cliente.
              </p>
            )}

            {reviews.map((review, ri) => {
              const cfg = visitStatusConfig[review.visit_status] || visitStatusConfig.pending;
              return (
                <div key={`${review.supervision_id}-${ri}`} className="border border-slate-200 rounded-md p-2 space-y-1.5 bg-slate-50/60">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800">{fmtDate(review.date)}</p>
                      <p className="text-[10px] text-slate-500 flex items-center gap-1">
                        <User className="w-3 h-3" /> {review.supervisor_name}
                      </p>
                    </div>
                    <Badge className={`text-[10px] ${cfg.color}`}>{cfg.label}</Badge>
                  </div>

                  {review.notes && (
                    <div className="bg-white rounded-md border border-slate-200 p-2">
                      <p className="text-[10px] font-semibold text-slate-500 flex items-center gap-1 mb-0.5">
                        <FileText className="w-3 h-3" /> Observaciones
                      </p>
                      <p className="text-xs text-slate-700 whitespace-pre-wrap">{review.notes}</p>
                    </div>
                  )}

                  {review.incidents && (
                    <div className="bg-red-50 rounded-md border border-red-200 p-2">
                      <p className="text-[10px] font-semibold text-red-600 flex items-center gap-1 mb-0.5">
                        <AlertTriangle className="w-3 h-3" /> Incidencias
                      </p>
                      <p className="text-xs text-red-800 whitespace-pre-wrap">{review.incidents}</p>
                    </div>
                  )}

                  {(review.photos || []).length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-slate-500 flex items-center gap-1 mb-1">
                        <Camera className="w-3 h-3" /> Fotos ({review.photos.length})
                      </p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(review.photos || []).map((photo, pi) => {
                          const src = photoSrc(ri, pi, photo.url);
                          const opening = !src && !!photo.url && !/^https?:\/\//.test(photo.url) && !failed[`${ri}-${pi}`];
                          return (
                            <button
                              key={pi}
                              type="button"
                              onClick={() => src && setPreview({ url: src, comment: photo.comment })}
                              className="relative rounded-md overflow-hidden border border-slate-200 bg-white"
                              title={photo.comment || "Ver foto"}
                            >
                              {src ? (
                                <img
                                  src={src}
                                  alt={photo.comment || `Foto ${pi + 1}`}
                                  className="w-full h-16 object-cover hover:opacity-80 transition-opacity"
                                />
                              ) : (
                                <div className="w-full h-16 flex items-center justify-center text-slate-400">
                                  {opening ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageOff className="w-4 h-4" />}
                                </div>
                              )}
                              {photo.comment && (
                                <p className="text-[9px] text-slate-600 px-1 pb-0.5 truncate text-left">{photo.comment}</p>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <DialogContent className="max-w-3xl p-2">
          {preview && (
            <div className="space-y-2">
              <img
                src={preview.url}
                alt={preview.comment || "Foto de revisión anterior"}
                className="w-full max-h-[70vh] object-contain rounded"
              />
              {preview.comment && <p className="text-xs text-slate-600 px-2 pb-1">{preview.comment}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}