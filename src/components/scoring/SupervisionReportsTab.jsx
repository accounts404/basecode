import React, { useState, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, MapPin } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import SimplePagination from "@/components/ui/simple-pagination";

const PAGE_SIZE = 15;

const visitStatusConfig = {
  pending: { label: "Pendiente", color: "bg-slate-100 text-slate-700" },
  in_progress: { label: "En curso", color: "bg-blue-100 text-blue-700" },
  completed: { label: "Completada", color: "bg-green-100 text-green-700" },
  skipped: { label: "Omitida", color: "bg-amber-100 text-amber-700" },
};

export default function SupervisionReportsTab({
  supervisions,
  schedules,
  limpiadores,
  selectedCleanerId,
  selectedClientId,
  filterDateFrom,
  filterDateTo,
}) {
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [selectedCleanerId, selectedClientId, filterDateFrom, filterDateTo]);

  // Map (date|client_id) → Set of cleaner_ids from schedules
  const scheduleMap = useMemo(() => {
    const map = {};
    (schedules || []).forEach((s) => {
      if (!s.start_time || !s.client_id) return;
      const date = s.start_time.slice(0, 10);
      const key = `${date}|${s.client_id}`;
      if (!map[key]) map[key] = new Set();
      (s.cleaner_ids || []).forEach((id) => map[key].add(id));
    });
    return map;
  }, [schedules]);

  // Expand supervision visits into rows
  const rows = useMemo(() => {
    const expanded = [];
    (supervisions || []).forEach((sup) => {
      (sup.visits || []).forEach((visit) => {
        const date = sup.date || (sup.start_time ? sup.start_time.slice(0, 10) : "");
        const key = `${date}|${visit.client_id}`;
        const cleanerIds = scheduleMap[key] ? Array.from(scheduleMap[key]) : [];
        const cleanerNames = cleanerIds
          .map((id) => {
            const l = limpiadores.find((x) => x.id === id);
            return l ? l.invoice_name || l.full_name : null;
          })
          .filter(Boolean);
        expanded.push({
          id: `${sup.id}-${visit.client_id}`,
          date,
          supervisorName: sup.supervisor_name || "—",
          clientId: visit.client_id,
          clientName: visit.client_name || "—",
          clientAddress: visit.client_address || "",
          visitStatus: visit.visit_status || "pending",
          notes: visit.notes || "",
          incidents: visit.incidents || "",
          startedAt: visit.started_at,
          completedAt: visit.completed_at,
          cleanerIds,
          cleanerNames,
        });
      });
    });
    return expanded;
  }, [supervisions, scheduleMap, limpiadores]);

  const filtered = useMemo(() => {
    return rows
      .filter((r) => {
        if (selectedCleanerId !== "all" && !r.cleanerIds.includes(selectedCleanerId)) return false;
        if (selectedClientId !== "all" && r.clientId !== selectedClientId) return false;
        if (filterDateFrom && r.date < filterDateFrom) return false;
        if (filterDateTo && r.date > filterDateTo) return false;
        return true;
      })
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [rows, selectedCleanerId, selectedClientId, filterDateFrom, filterDateTo]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (filtered.length === 0) {
    return (
      <Card className="border-0 shadow-md">
        <CardContent className="p-0">
          <div className="text-center py-10 text-slate-400">
            <Shield className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>No hay reportes de supervisión con los filtros actuales.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-md">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Fecha</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Cliente</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Supervisor</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Limpiadores del servicio</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Estado</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 max-w-[200px]">Observaciones</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 max-w-[200px]">Incidencias</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((r, i) => {
                const cfg = visitStatusConfig[r.visitStatus] || visitStatusConfig.pending;
                return (
                  <tr key={r.id} className={`border-b border-slate-100 hover:bg-purple-50 transition-colors ${i % 2 === 0 ? "" : "bg-slate-50/50"}`}>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {r.date ? format(parseISO(r.date), "d MMM yyyy", { locale: es }) : "—"}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {r.clientName}
                      {r.clientAddress && (
                        <p className="text-xs text-slate-400 truncate flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {r.clientAddress}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{r.supervisorName}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">
                      {r.cleanerNames.length > 0 ? (
                        r.cleanerNames.join(", ")
                      ) : (
                        <span className="text-slate-300 italic">Sin servicio asignado</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge className={cfg.color}>{cfg.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs max-w-[200px] truncate">{r.notes || "—"}</td>
                    <td className="px-4 py-3 text-xs max-w-[200px] truncate">
                      {r.incidents ? <span className="text-red-600">{r.incidents}</span> : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-slate-100">
          <SimplePagination currentPage={page} totalPages={totalPages} onPageChange={setPage} totalItems={filtered.length} pageSize={PAGE_SIZE} />
        </div>
      </CardContent>
    </Card>
  );
}