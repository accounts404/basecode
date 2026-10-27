import React, { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Users, Clock, KeySquare, PawPrint, FileText, Camera, MapPin, Navigation,
  Play, CheckCircle, Timer, AlertCircle,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

// Parsear ISO (sin Z) como hora local del navegador
const parseLocal = (iso) => {
  if (!iso) return null;
  const clean = iso.endsWith("Z") ? iso.slice(0, -1) : iso;
  return new Date(clean);
};

const fmtTime = (iso) => {
  const d = parseLocal(iso);
  return d ? format(d, "HH:mm", { locale: es }) : "--:--";
};

const fmtElapsed = (seconds) => {
  if (seconds <= 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const AREA_LABELS = {
  dusting_wiping_tidyup: "🧹 Dusting / Wiping / Tidy Up",
  kitchen_and_pantry: "🍳 Kitchen and Pantry",
  bathrooms: "🚿 Bathrooms",
  laundry: "🧺 Laundry",
  floors: "🧽 Floors",
  other_areas: "🏠 Other Areas",
};

function PhotoGrid({ photos }) {
  if (!photos || photos.length === 0) return null;
  return (
    <div className="grid grid-cols-3 gap-1.5 mt-2">
      {photos.map((p, i) => (
        <a key={i} href={p.url} target="_blank" rel="noopener noreferrer">
          <img src={p.url} alt={p.comment || `Foto ${i + 1}`} className="w-full h-16 object-cover rounded-md border border-slate-200 hover:opacity-80 transition-opacity" />
          {p.comment && <p className="text-[10px] text-slate-500 truncate">{p.comment}</p>}
        </a>
      ))}
    </div>
  );
}

export default function SupervisionClientInfo({ client, enrichment, loading }) {
  const [now, setNow] = useState(new Date());
  const cleaners = enrichment?.cleaners || [];
  const allClockedOut = cleaners.length > 0 && cleaners.every((c) => c.clock_out_time);
  const anyStarted = cleaners.some((c) => c.clock_in_time);

  // Tick cada segundo solo si el servicio sigue activo (no todos finalizaron)
  const hasLiveCountdown = anyStarted && !!enrichment?.end_time && !allClockedOut;
  useEffect(() => {
    if (!hasLiveCountdown) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [hasLiveCountdown]);

  const endDt = enrichment?.end_time ? parseLocal(enrichment.end_time) : null;
  const startDt = enrichment?.start_time ? parseLocal(enrichment.start_time) : null;
  const remaining = endDt ? Math.max(0, Math.floor((endDt.getTime() - now.getTime()) / 1000)) : null;
  const total = startDt && endDt ? Math.floor((endDt.getTime() - startDt.getTime()) / 1000) : null;
  const overtime = remaining === 0 && !allClockedOut && cleaners.some((c) => c.clock_in_time);

  const structuredNotes = client?.structured_service_notes;
  const hasStructured = structuredNotes && Object.keys(structuredNotes).length > 0;

  return (
    <div className="space-y-2">
      {/* ── Equipo del servicio + tiempo restante ── */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-1.5 text-indigo-800 font-semibold text-xs">
          <Users className="w-3.5 h-3.5" /> Equipo del servicio
        </div>
        {loading ? (
          <p className="text-xs text-slate-400">Cargando equipo y horario...</p>
        ) : cleaners.length === 0 ? (
          <p className="text-xs text-slate-500 italic">No hay servicio asignado para este cliente el día de la supervisión.</p>
        ) : (
          <>
            <div className="space-y-1.5">
              {cleaners.map((c) => {
                const clockIn = c.clock_in_time ? parseLocal(c.clock_in_time) : null;
                const clockOut = c.clock_out_time ? parseLocal(c.clock_out_time) : null;
                const cEnd = c.end_time ? parseLocal(c.end_time) : null;
                const cStart = c.start_time ? parseLocal(c.start_time) : null;
                let statusLabel, statusColor;
                if (clockOut) {
                  statusLabel = "Finalizado";
                  statusColor = "bg-green-100 text-green-700";
                } else if (clockIn) {
                  const elapsed = Math.max(0, Math.floor((now.getTime() - clockIn.getTime()) / 1000));
                  statusLabel = `En servicio · ${fmtElapsed(elapsed)}`;
                  statusColor = "bg-blue-100 text-blue-700";
                } else {
                  statusLabel = "Pendiente";
                  statusColor = "bg-slate-100 text-slate-600";
                }
                const remainingCleaner = cEnd && !clockOut ? Math.max(0, Math.floor((cEnd.getTime() - now.getTime()) / 1000)) : null;
                return (
                  <div key={c.id} className="flex items-center justify-between gap-2 bg-white/60 rounded-md px-2 py-1.5">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-800 truncate">{c.name}</p>
                      <p className="text-[10px] text-slate-500">
                        {clockIn ? (
                          <>
                            {fmtTime(c.start_time)} - {fmtTime(c.end_time)}
                            <span className="ml-1">· entró {fmtTime(c.clock_in_time)}</span>
                          </>
                        ) : (
                          <>Inicia {fmtTime(c.start_time)}</>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {remainingCleaner !== null && !clockOut && clockIn && (
                        <span className="text-[10px] text-indigo-600 font-medium">falta {fmtElapsed(remainingCleaner)}</span>
                      )}
                      <Badge className={`text-[10px] ${statusColor}`}>{statusLabel}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Tiempo restante general del servicio (solo si algún limpiador ya empezó) */}
            {anyStarted && remaining !== null && total !== null && (
              <div className={`flex items-center justify-between pt-1.5 border-t border-indigo-200 ${overtime ? "text-red-600" : "text-indigo-700"}`}>
                <span className="text-xs flex items-center gap-1">
                  <Timer className="w-3.5 h-3.5" />
                  {allClockedOut ? "Servicio finalizado" : overtime ? "Tiempo excedido" : "Tiempo restante"}
                </span>
                <span className="text-sm font-mono font-bold">
                  {allClockedOut ? "✓" : fmtElapsed(remaining)}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Información detallada del cliente (colapsable) ── */}
      <Accordion type="single" collapsible className="w-full">
        {/* Acceso / Llaves */}
        {client?.has_access && (
          <AccordionItem value="access" className="border rounded-lg mb-1.5 px-2">
            <AccordionTrigger className="text-xs font-semibold text-slate-700 hover:no-underline py-2">
              <span className="flex items-center gap-1.5">
                <KeySquare className="w-3.5 h-3.5 text-amber-500" /> Acceso / Llaves
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-1.5 text-xs pb-2">
              {client.access_type && (
                <div><span className="text-slate-500">Tipo:</span> <span className="font-medium capitalize">{client.access_type}</span></div>
              )}
              {client.access_identifier && (
                <div><span className="text-slate-500">Identificador:</span> <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded ml-1">{client.access_identifier}</span></div>
              )}
              {client.access_instructions && (
                <div className="bg-slate-50 rounded-md p-2"><span className="text-slate-500 block mb-0.5">Instrucciones:</span><p className="whitespace-pre-wrap">{client.access_instructions}</p></div>
              )}
              <PhotoGrid photos={client.access_photos} />
            </AccordionContent>
          </AccordionItem>
        )}

        {/* Mascotas */}
        {client?.pets && client.pets.length > 0 && (
          <AccordionItem value="pets" className="border rounded-lg mb-1.5 px-2">
            <AccordionTrigger className="text-xs font-semibold text-slate-700 hover:no-underline py-2">
              <span className="flex items-center gap-1.5">
                <PawPrint className="w-3.5 h-3.5 text-orange-500" /> Mascotas ({client.pets.length})
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-1.5 pb-2">
              {client.pets.map((pet, i) => (
                <div key={i} className="bg-orange-50 border border-orange-200 rounded-md p-2">
                  <p className="text-xs font-bold text-orange-900">{pet.name} <span className="font-normal text-orange-700">· {pet.type}{pet.breed ? ` - ${pet.breed}` : ""}</span></p>
                  {pet.temperament && <p className="text-[11px] text-orange-800"><strong>Temperamento:</strong> {pet.temperament}</p>}
                  {pet.special_instructions && <p className="text-[11px] text-orange-800"><strong>Instrucciones:</strong> {pet.special_instructions}</p>}
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>
        )}

        {/* Instrucciones por área */}
        {hasStructured && (
          <AccordionItem value="areas" className="border rounded-lg mb-1.5 px-2">
            <AccordionTrigger className="text-xs font-semibold text-slate-700 hover:no-underline py-2">
              <span className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-indigo-500" /> Instrucciones por Área
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-2">
              <Accordion type="multiple" className="w-full">
                {Object.entries(AREA_LABELS).map(([key, label]) => {
                  const area = structuredNotes[key];
                  if (!area || (!area.notes && !(area.photos && area.photos.length > 0))) return null;
                  return (
                    <AccordionItem key={key} value={key} className="border-0">
                      <AccordionTrigger className="text-xs py-1.5 hover:no-underline">{label}</AccordionTrigger>
                      <AccordionContent className="text-xs pb-2">
                        {area.notes && <p className="whitespace-pre-wrap text-slate-700 mb-1">{area.notes}</p>}
                        <PhotoGrid photos={area.photos} />
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* Notas generales + fotos de referencia */}
        {(client?.default_service_notes || (client?.default_photo_urls && client.default_photo_urls.length > 0)) && (
          <AccordionItem value="notes" className="border rounded-lg mb-1.5 px-2">
            <AccordionTrigger className="text-xs font-semibold text-slate-700 hover:no-underline py-2">
              <span className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-blue-500" /> Notas generales y fotos
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-2 pb-2">
              {client.default_service_notes && (
                <p className="text-xs whitespace-pre-wrap text-slate-700 bg-slate-50 rounded-md p-2">{client.default_service_notes}</p>
              )}
              <PhotoGrid photos={client.default_photo_urls} />
            </AccordionContent>
          </AccordionItem>
        )}

        {/* Notas específicas del servicio */}
        {enrichment?.service_specific_notes && (
          <AccordionItem value="service-notes" className="border rounded-lg mb-1.5 px-2">
            <AccordionTrigger className="text-xs font-semibold text-slate-700 hover:no-underline py-2">
              <span className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-purple-500" /> Notas de este servicio
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-2">
              <p className="text-xs whitespace-pre-wrap text-slate-700 bg-purple-50 border border-purple-200 rounded-md p-2">{enrichment.service_specific_notes}</p>
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>
    </div>
  );
}