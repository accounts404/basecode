import React from "react";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, Clock, User, Camera, AlertTriangle, FileText } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

const VISIT_STATUS_LABEL = {
  pending: "Pendiente",
  in_progress: "En progreso",
  completed: "Completada",
  skipped: "Omitida",
};

const VISIT_STATUS_COLOR = {
  pending: "bg-slate-100 text-slate-700",
  in_progress: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  skipped: "bg-amber-100 text-amber-800",
};

// Renderiza de forma compacta y solo lectura los datos/observaciones de una
// visita de supervisión vinculada a una evaluación de performance.
export default function SupervisionDataPanel({ data, compact = false }) {
  if (!data) return null;

  const visitStatus = data.visit_status || "pending";
  const statusLabel = VISIT_STATUS_LABEL[visitStatus] || visitStatus;
  const statusColor = VISIT_STATUS_COLOR[visitStatus] || "bg-slate-100 text-slate-700";

  const formatDate = (d) => (d ? format(parseISO(d), "d MMM yyyy", { locale: es }) : null);
  const formatTime = (d) => (d ? format(parseISO(d), "HH:mm", { locale: es }) : null);

  return (
    <div className={`rounded-xl border border-indigo-200 bg-indigo-50/60 ${compact ? "p-3" : "p-4"} space-y-2`}>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-indigo-700 font-semibold text-sm">
          <ClipboardCheck className="w-4 h-4" />
          Supervisión vinculada
        </div>
        <Badge className={statusColor}>{statusLabel}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {data.supervisor_name && (
          <div className="flex items-center gap-1.5 text-slate-700">
            <User className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-medium">{data.supervisor_name}</span>
          </div>
        )}
        {data.date && (
          <div className="flex items-center gap-1.5 text-slate-700">
            <ClipboardCheck className="w-3.5 h-3.5 text-slate-400" />
            <span>{formatDate(data.date)}</span>
          </div>
        )}
        {data.started_at && (
          <div className="flex items-center gap-1.5 text-slate-700">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Inicio {formatTime(data.started_at)}</span>
          </div>
        )}
        {data.completed_at && (
          <div className="flex items-center gap-1.5 text-slate-700">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Fin {formatTime(data.completed_at)}</span>
          </div>
        )}
        {data.photo_count > 0 && (
          <div className="flex items-center gap-1.5 text-slate-700">
            <Camera className="w-3.5 h-3.5 text-slate-400" />
            <span>{data.photo_count} foto(s)</span>
          </div>
        )}
      </div>

      {data.notes && (
        <div className="bg-white/70 rounded-lg p-2.5">
          <p className="text-xs font-semibold text-indigo-700 mb-0.5 flex items-center gap-1">
            <FileText className="w-3.5 h-3.5" /> Observaciones
          </p>
          <p className="text-xs text-slate-700 whitespace-pre-wrap">{data.notes}</p>
        </div>
      )}

      {data.incidents && (
        <div className="bg-red-50 rounded-lg p-2.5 border border-red-100">
          <p className="text-xs font-semibold text-red-700 mb-0.5 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Incidencias
          </p>
          <p className="text-xs text-red-800 whitespace-pre-wrap">{data.incidents}</p>
        </div>
      )}
    </div>
  );
}