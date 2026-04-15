import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  BarChart2, TrendingUp, User, Home, Calendar, Filter, X, Star, AlertCircle,
  CheckCircle2, Clock, Car, MessageSquare, ClipboardList, ChevronDown, ChevronRight,
  ArrowLeft, ExternalLink, ThumbsDown, ThumbsUp, Minus, Eye, Check
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";
import SimplePagination from "@/components/ui/simple-pagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// ── helpers ──────────────────────────────────────────────────────────────────

function ScoreBadge({ score }) {
  const cls = score >= 90 ? "bg-green-100 text-green-800"
    : score >= 75 ? "bg-blue-100 text-blue-800"
    : score >= 60 ? "bg-yellow-100 text-yellow-800"
    : "bg-red-100 text-red-800";
  return <Badge className={cls}>{Math.round(score)}/100</Badge>;
}

function PointsBadge({ points }) {
  if (!points && points !== 0) return <span className="text-slate-400 text-xs">—</span>;
  const neg = points < 0;
  return (
    <Badge className={neg ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}>
      {neg ? "" : "+"}{points} pts
    </Badge>
  );
}

function FeedbackTypeBadge({ type }) {
  if (type === "complaint") return <Badge className="bg-red-100 text-red-700 gap-1"><ThumbsDown className="w-3 h-3" />Queja</Badge>;
  if (type === "compliment") return <Badge className="bg-green-100 text-green-700 gap-1"><ThumbsUp className="w-3 h-3" />Felicitación</Badge>;
  return <Badge className="bg-slate-100 text-slate-600 gap-1"><Minus className="w-3 h-3" />Neutral</Badge>;
}

function safeDate(d) {
  try { return format(parseISO(d), "d MMM yyyy", { locale: es }); } catch { return d || "—"; }
}

const PAGE_SIZE = 15;

// ── PerformanceReview detail dialog ──────────────────────────────────────────
function ReviewDetailDialog({ review, open, onClose }) {
  if (!review) return null;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-blue-600" />
            Evaluación de Performance — {review.cleaner_name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-slate-500">Fecha:</span> <span className="font-medium">{safeDate(review.review_date)}</span></div>
            <div><span className="text-slate-500">Cliente:</span> <span className="font-medium">{review.client_name || "—"}</span></div>
            <div><span className="text-slate-500">Revisado por:</span> <span className="font-medium">{review.reviewed_by_admin_name || "—"}</span></div>
            <div><span className="text-slate-500">Puntaje total:</span> <ScoreBadge score={review.overall_score || 0} /></div>
          </div>

          {review.area_scores?.length > 0 && (
            <div>
              <h4 className="font-semibold text-slate-700 mb-2 text-sm">Puntajes por área</h4>
              <div className="space-y-2">
                {review.area_scores.map((a, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg text-sm">
                    <span className="text-slate-700">{a.area_name}</span>
                    <div className="flex items-center gap-3">
                      {a.notes && <span className="text-xs text-slate-400 italic truncate max-w-[120px]">{a.notes}</span>}
                      <Badge variant="outline">{a.score}/{a.max_points}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {review.general_notes && (
            <div>
              <h4 className="font-semibold text-slate-700 mb-1 text-sm">Notas generales</h4>
              <p className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3">{review.general_notes}</p>
            </div>
          )}

          {review.points_impact !== undefined && review.points_impact !== null && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-500">Impacto en ranking:</span>
              <PointsBadge points={review.points_impact} />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── PunctualityRecord detail dialog ──────────────────────────────────────────
function PunctualityDetailDialog({ record, open, onClose }) {
  if (!record) return null;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-orange-500" />
            Registro de Puntualidad — {record.cleaner_name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div><span className="text-slate-500">Fecha:</span> <span className="font-medium">{safeDate(record.date)}</span></div>
            <div><span className="text-slate-500">Período:</span> <span className="font-medium">{record.month_period}</span></div>
            <div><span className="text-slate-500">Hora programada:</span> <span className="font-medium">{record.scheduled_time || "—"}</span></div>
            <div><span className="text-slate-500">Clock-in real:</span> <span className="font-medium">{record.actual_clock_in || "—"}</span></div>
          </div>
          <div className="grid grid-cols-3 gap-3 pt-1">
            <div className={`flex flex-col items-center p-3 rounded-lg ${record.absence ? "bg-red-50" : "bg-green-50"}`}>
              {record.absence ? <AlertCircle className="w-5 h-5 text-red-500 mb-1" /> : <CheckCircle2 className="w-5 h-5 text-green-500 mb-1" />}
              <span className="text-xs text-center">{record.absence ? "Ausencia" : "Asistió"}</span>
            </div>
            <div className={`flex flex-col items-center p-3 rounded-lg ${!record.uniform_ok ? "bg-red-50" : "bg-green-50"}`}>
              {record.uniform_ok ? <CheckCircle2 className="w-5 h-5 text-green-500 mb-1" /> : <AlertCircle className="w-5 h-5 text-red-500 mb-1" />}
              <span className="text-xs text-center">Uniforme</span>
            </div>
            <div className={`flex flex-col items-center p-3 rounded-lg ${!record.presentation_ok ? "bg-red-50" : "bg-green-50"}`}>
              {record.presentation_ok ? <CheckCircle2 className="w-5 h-5 text-green-500 mb-1" /> : <AlertCircle className="w-5 h-5 text-red-500 mb-1" />}
              <span className="text-xs text-center">Presentación</span>
            </div>
          </div>
          {record.minutes_late != null && (
            <div><span className="text-slate-500">Minutos de retraso:</span> <span className={`font-medium ${record.minutes_late > 0 ? "text-red-600" : "text-green-600"}`}>{record.minutes_late > 0 ? `+${record.minutes_late} min tarde` : record.minutes_late < 0 ? `${Math.abs(record.minutes_late)} min antes` : "A tiempo"}</span></div>
          )}
          {record.notes && <div className="bg-slate-50 rounded-lg p-3"><span className="text-slate-500">Notas: </span>{record.notes}</div>}
          <div className="flex items-center gap-2"><span className="text-slate-500">Impacto:</span><PointsBadge points={record.points_impact} /></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── ClientFeedback detail dialog ──────────────────────────────────────────────
function FeedbackDetailDialog({ feedback, open, onClose }) {
  if (!feedback) return null;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-purple-500" />
            Feedback de Cliente — {feedback.client_name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div><span className="text-slate-500">Fecha:</span> <span className="font-medium">{safeDate(feedback.feedback_date)}</span></div>
            <div><span className="text-slate-500">Tipo:</span> <FeedbackTypeBadge type={feedback.feedback_type} /></div>
            <div><span className="text-slate-500">Canal:</span> <span className="font-medium capitalize">{feedback.feedback_channel || "—"}</span></div>
            {feedback.severity && <div><span className="text-slate-500">Severidad:</span> <Badge className={feedback.severity === "high" ? "bg-red-100 text-red-700" : feedback.severity === "medium" ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}>{feedback.severity}</Badge></div>}
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <span className="text-slate-500 text-xs">Descripción:</span>
            <p className="mt-1 text-slate-700">{feedback.description}</p>
          </div>
          {feedback.action_taken && (
            <div className="bg-blue-50 rounded-lg p-3">
              <span className="text-blue-600 text-xs">Acción tomada:</span>
              <p className="mt-1 text-slate-700">{feedback.action_taken}</p>
            </div>
          )}
          <div className="flex items-center gap-2"><span className="text-slate-500">Impacto por limpiador:</span><PointsBadge points={feedback.points_impact} /></div>
          {feedback.registered_by_admin_name && <div><span className="text-slate-500">Registrado por:</span> <span>{feedback.registered_by_admin_name}</span></div>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── VehicleChecklist detail dialog ────────────────────────────────────────────
function VehicleDetailDialog({ record, open, onClose }) {
  if (!record) return null;
  const failed = (record.checklist_items || []).filter(i => !i.passed);
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="w-5 h-5 text-teal-600" />
            Checklist de Vehículo — {record.vehicle_info}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div><span className="text-slate-500">Fecha:</span> <span className="font-medium">{safeDate(record.date)}</span></div>
            <div><span className="text-slate-500">Revisado por:</span> <span className="font-medium">{record.reviewed_by_admin_name || "—"}</span></div>
            <div><span className="text-slate-500">Equipo:</span> <span className="font-medium">{(record.team_member_names || []).join(", ") || "—"}</span></div>
            <div><span className="text-slate-500">Deducción total:</span> <PointsBadge points={record.total_deduction ? -record.total_deduction : 0} /></div>
          </div>

          {record.checklist_items?.length > 0 && (
            <div>
              <h4 className="font-semibold text-slate-700 mb-2">Items del checklist</h4>
              <div className="space-y-1">
                {record.checklist_items.map((item, i) => (
                  <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg ${item.passed ? "bg-green-50" : "bg-red-50"}`}>
                    <div className="flex items-center gap-2">
                      {item.passed ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                      <span className={item.passed ? "text-green-800" : "text-red-800"}>{item.item}</span>
                    </div>
                    {!item.passed && item.points_if_fail && (
                      <Badge className="bg-red-100 text-red-700">-{item.points_if_fail} pts</Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {failed.length > 0 && failed.some(f => f.notes) && (
            <div>
              <h4 className="font-semibold text-slate-700 mb-2">Observaciones de fallos</h4>
              {failed.filter(f => f.notes).map((f, i) => (
                <div key={i} className="bg-slate-50 rounded-lg p-2 mb-1">
                  <span className="font-medium text-slate-700">{f.item}:</span> <span className="text-slate-600">{f.notes}</span>
                </div>
              ))}
            </div>
          )}

          {record.general_notes && (
            <div className="bg-slate-50 rounded-lg p-3">
              <span className="text-slate-500">Notas generales: </span>{record.general_notes}
            </div>
          )}

          {record.photos?.length > 0 && (
            <div>
              <h4 className="font-semibold text-slate-700 mb-2">Fotos ({record.photos.length})</h4>
              <div className="flex flex-wrap gap-2">
                {record.photos.map((p, i) => (
                  <a key={i} href={p.url} target="_blank" rel="noopener noreferrer">
                    <img src={p.url} alt={p.comment || `Foto ${i+1}`} className="w-20 h-20 object-cover rounded-lg border hover:opacity-80 transition-opacity" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────

export default function PerformanceReportsTab({ limpiadores }) {
  const [loading, setLoading] = useState(true);
  const [allPerformance, setAllPerformance] = useState([]);
  const [allPunctuality, setAllPunctuality] = useState([]);
  const [allFeedback, setAllFeedback] = useState([]);
  const [allVehicle, setAllVehicle] = useState([]);
  const [allClients, setAllClients] = useState([]);

  const [selectedCleanerId, setSelectedCleanerId] = useState("all");
  const [selectedClientId, setSelectedClientId] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  // Active tab
  const [activeSection, setActiveSection] = useState("overview");

  // Pagination
  const [perfPage, setPerfPage] = useState(1);
  const [punctPage, setPunctPage] = useState(1);
  const [feedPage, setFeedPage] = useState(1);
  const [vehPage, setVehPage] = useState(1);

  // Detail dialogs
  const [openReview, setOpenReview] = useState(null);
  const [openPunct, setOpenPunct] = useState(null);
  const [openFeedback, setOpenFeedback] = useState(null);
  const [openVehicle, setOpenVehicle] = useState(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [perf, punct, feed, veh, cls] = await Promise.all([
        base44.entities.PerformanceReview.list("-review_date", 2000),
        base44.entities.PunctualityRecord.list("-date", 2000),
        base44.entities.ClientFeedback.list("-feedback_date", 2000),
        base44.entities.VehicleChecklistRecord.list("-date", 2000),
        base44.entities.Client.filter({ active: true }),
      ]);
      setAllPerformance(perf || []);
      setAllPunctuality(punct || []);
      setAllFeedback(feed || []);
      setAllVehicle(veh || []);
      setAllClients((cls || []).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  // ── helpers to filter by cleaner / date ──────────────────────────────────

  const filterByDate = (dateField) => (r) => {
    const d = r[dateField] || "";
    if (filterDateFrom && d < filterDateFrom) return false;
    if (filterDateTo && d > filterDateTo) return false;
    return true;
  };

  const filteredPerf = allPerformance
    .filter(r => selectedCleanerId === "all" || r.cleaner_id === selectedCleanerId)
    .filter(r => selectedClientId === "all" || r.client_id === selectedClientId)
    .filter(filterByDate("review_date"))
    .sort((a, b) => (b.review_date || "").localeCompare(a.review_date || ""));

  const filteredPunct = allPunctuality
    .filter(r => selectedCleanerId === "all" || r.cleaner_id === selectedCleanerId)
    .filter(filterByDate("date"))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const filteredFeedback = allFeedback
    .filter(r => selectedCleanerId === "all" || (r.affected_cleaner_ids || []).includes(selectedCleanerId))
    .filter(r => selectedClientId === "all" || r.client_id === selectedClientId)
    .filter(filterByDate("feedback_date"))
    .sort((a, b) => (b.feedback_date || "").localeCompare(a.feedback_date || ""));

  const filteredVehicle = allVehicle
    .filter(r => selectedCleanerId === "all" || (r.team_member_ids || []).includes(selectedCleanerId))
    .filter(filterByDate("date"))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const selectedCleaner = limpiadores.find(l => l.id === selectedCleanerId);
  const selectedClient = allClients.find(c => c.id === selectedClientId);

  const hasFilters = selectedCleanerId !== "all" || selectedClientId !== "all" || filterDateFrom || filterDateTo;
  const resetFilters = () => { setSelectedCleanerId("all"); setSelectedClientId("all"); setFilterDateFrom(""); setFilterDateTo(""); };

  // ── overview stats ────────────────────────────────────────────────────────

  const avgPerf = filteredPerf.length > 0
    ? filteredPerf.reduce((s, r) => s + (r.overall_score || 0), 0) / filteredPerf.length
    : null;

  const totalPunctDeduction = filteredPunct.reduce((s, r) => s + (r.points_impact || 0), 0);
  const totalFeedbackPoints = filteredFeedback.reduce((s, r) => s + (r.points_impact || 0), 0);
  const totalVehicleDeduction = filteredVehicle.reduce((s, r) => s + (r.points_per_member ? -r.points_per_member : 0), 0);
  const absences = filteredPunct.filter(r => r.absence).length;
  const complaints = filteredFeedback.filter(r => r.feedback_type === "complaint").length;
  const compliments = filteredFeedback.filter(r => r.feedback_type === "compliment").length;

  // ── trend chart data ──────────────────────────────────────────────────────

  const trendData = (() => {
    const byMonth = {};
    filteredPerf.forEach(r => {
      const m = r.review_date?.slice(0, 7);
      if (!m) return;
      if (!byMonth[m]) byMonth[m] = { month: m, scores: [] };
      byMonth[m].scores.push(r.overall_score || 0);
    });
    return Object.values(byMonth)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(m => ({
        label: format(parseISO(m.month + "-01"), "MMM yy", { locale: es }),
        promedio: Math.round(m.scores.reduce((s, v) => s + v, 0) / m.scores.length),
      }));
  })();

  // ── pagination helpers ────────────────────────────────────────────────────

  const paginate = (arr, page) => arr.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = (arr) => Math.ceil(arr.length / PAGE_SIZE);

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Reportes Consolidados</h3>
          <p className="text-sm text-slate-500">
            {selectedCleaner && selectedClient
              ? `${selectedCleaner.invoice_name || selectedCleaner.full_name} en ${selectedClient.name}`
              : selectedCleaner
              ? `Viendo registros de ${selectedCleaner.invoice_name || selectedCleaner.full_name}`
              : selectedClient
              ? `Viendo registros del cliente ${selectedClient.name}`
              : "Selecciona un limpiador y/o cliente para ver registros"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadAll}>Actualizar</Button>
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="font-semibold text-sm text-slate-700">Filtros</span>
            {hasFilters && (
              <Button variant="ghost" size="sm" className="h-6 text-xs text-red-500 hover:text-red-700 ml-auto" onClick={resetFilters}>
                <X className="w-3 h-3 mr-1" /> Limpiar
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {/* Cleaner combobox */}
            <div>
              <Label className="text-xs mb-1 block">Limpiador</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("h-8 w-full justify-between text-xs", selectedCleanerId === "all" && "text-slate-500")}>
                    {selectedCleanerId === "all" ? "Todos" : limpiadores.find(l => l.id === selectedCleanerId)?.invoice_name || "Seleccionar"}
                    <ChevronDown className="w-3 h-3 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar limpiador..." className="h-8" />
                    <CommandEmpty>No encontrado.</CommandEmpty>
                    <CommandGroup className="max-h-[200px] overflow-y-auto">
                      <CommandItem value="all" onSelect={() => { setSelectedCleanerId("all"); setPerfPage(1); setPunctPage(1); setFeedPage(1); setVehPage(1); }}>
                        <Check className={cn("w-4 h-4 mr-2", selectedCleanerId === "all" ? "opacity-100" : "opacity-0")} />
                        Todos
                      </CommandItem>
                      {limpiadores.map(l => (
                        <CommandItem key={l.id} value={l.id} onSelect={() => { setSelectedCleanerId(l.id); setPerfPage(1); setPunctPage(1); setFeedPage(1); setVehPage(1); }}>
                          <Check className={cn("w-4 h-4 mr-2", selectedCleanerId === l.id ? "opacity-100" : "opacity-0")} />
                          {l.invoice_name || l.full_name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Client combobox */}
            <div>
              <Label className="text-xs mb-1 block">Cliente / Casa</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("h-8 w-full justify-between text-xs", selectedClientId === "all" && "text-slate-500")}>
                    {selectedClientId === "all" ? "Todos" : allClients.find(c => c.id === selectedClientId)?.name || "Seleccionar"}
                    <ChevronDown className="w-3 h-3 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[220px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar cliente/casa..." className="h-8" />
                    <CommandEmpty>No encontrado.</CommandEmpty>
                    <CommandGroup className="max-h-[200px] overflow-y-auto">
                      <CommandItem value="all" onSelect={() => { setSelectedClientId("all"); setPerfPage(1); setFeedPage(1); }}>
                        <Check className={cn("w-4 h-4 mr-2", selectedClientId === "all" ? "opacity-100" : "opacity-0")} />
                        Todos
                      </CommandItem>
                      {allClients.map(c => (
                        <CommandItem key={c.id} value={c.id} onSelect={() => { setSelectedClientId(c.id); setPerfPage(1); setFeedPage(1); }}>
                          <Check className={cn("w-4 h-4 mr-2", selectedClientId === c.id ? "opacity-100" : "opacity-0")} />
                          {c.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label className="text-xs mb-1 block">Desde</Label>
              <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Hasta</Label>
              <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI overview row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <Card className="border-0 shadow-sm bg-blue-50 col-span-1">
          <CardContent className="p-3 text-center">
            <ClipboardList className="w-5 h-5 text-blue-500 mx-auto mb-1" />
            <p className="text-xl font-bold text-blue-800">{filteredPerf.length}</p>
            <p className="text-xs text-blue-600">Evaluaciones</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-indigo-50 col-span-1">
          <CardContent className="p-3 text-center">
            <BarChart2 className="w-5 h-5 text-indigo-500 mx-auto mb-1" />
            <p className="text-xl font-bold text-indigo-800">{avgPerf !== null ? Math.round(avgPerf) : "—"}</p>
            <p className="text-xs text-indigo-600">Promedio perf.</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-orange-50 col-span-1">
          <CardContent className="p-3 text-center">
            <Clock className="w-5 h-5 text-orange-500 mx-auto mb-1" />
            <p className="text-xl font-bold text-orange-800">{filteredPunct.length}</p>
            <p className="text-xs text-orange-600">Puntualidad</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-red-50 col-span-1">
          <CardContent className="p-3 text-center">
            <AlertCircle className="w-5 h-5 text-red-500 mx-auto mb-1" />
            <p className="text-xl font-bold text-red-800">{absences}</p>
            <p className="text-xs text-red-600">Ausencias</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-teal-50 col-span-1">
          <CardContent className="p-3 text-center">
            <Car className="w-5 h-5 text-teal-500 mx-auto mb-1" />
            <p className="text-xl font-bold text-teal-800">{filteredVehicle.length}</p>
            <p className="text-xs text-teal-600">Vehículos</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-red-50 col-span-1">
          <CardContent className="p-3 text-center">
            <ThumbsDown className="w-5 h-5 text-red-500 mx-auto mb-1" />
            <p className="text-xl font-bold text-red-800">{complaints}</p>
            <p className="text-xs text-red-600">Quejas</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-green-50 col-span-1">
          <CardContent className="p-3 text-center">
            <ThumbsUp className="w-5 h-5 text-green-500 mx-auto mb-1" />
            <p className="text-xl font-bold text-green-800">{compliments}</p>
            <p className="text-xs text-green-600">Felicitaciones</p>
          </CardContent>
        </Card>
      </div>

      {/* Trend chart (only when cleaner or client selected) */}
      {(selectedCleanerId !== "all" || selectedClientId !== "all") && trendData.length >= 2 && (
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-500" /> Evolución del puntaje de performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip formatter={v => [`${v}/100`, "Promedio"]} />
                <Line type="monotone" dataKey="promedio" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Main tabs */}
      <Tabs value={activeSection} onValueChange={setActiveSection}>
        <TabsList className="grid w-full grid-cols-4 h-10">
          <TabsTrigger value="performance" className="flex items-center gap-1 text-xs">
            <ClipboardList className="w-3.5 h-3.5" />
            <span>Performance</span>
            <Badge variant="secondary" className="ml-1 text-xs px-1.5">{filteredPerf.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="punctuality" className="flex items-center gap-1 text-xs">
            <Clock className="w-3.5 h-3.5" />
            <span>Puntualidad</span>
            <Badge variant="secondary" className="ml-1 text-xs px-1.5">{filteredPunct.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="vehicle" className="flex items-center gap-1 text-xs">
            <Car className="w-3.5 h-3.5" />
            <span>Vehículos</span>
            <Badge variant="secondary" className="ml-1 text-xs px-1.5">{filteredVehicle.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="feedback" className="flex items-center gap-1 text-xs">
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Feedback</span>
            <Badge variant="secondary" className="ml-1 text-xs px-1.5">{filteredFeedback.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* ── PERFORMANCE ── */}
        <TabsContent value="performance">
          <Card className="border-0 shadow-md">
            <CardContent className="p-0">
              {filteredPerf.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p>No hay evaluaciones de performance.</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="text-left px-4 py-3 font-semibold text-slate-600">Fecha</th>
                          {selectedCleanerId === "all" && <th className="text-left px-4 py-3 font-semibold text-slate-600">Limpiador</th>}
                          <th className="text-left px-4 py-3 font-semibold text-slate-600">Cliente</th>
                          <th className="text-center px-4 py-3 font-semibold text-slate-600">Puntaje</th>
                          <th className="text-center px-4 py-3 font-semibold text-slate-600">Impacto</th>
                          <th className="text-left px-4 py-3 font-semibold text-slate-600">Revisado por</th>
                          <th className="text-center px-4 py-3 font-semibold text-slate-600">Ver</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginate(filteredPerf, perfPage).map((r, i) => (
                          <tr key={r.id} className={`border-b border-slate-100 hover:bg-blue-50 transition-colors cursor-pointer ${i % 2 === 0 ? "" : "bg-slate-50/50"}`}
                            onClick={() => setOpenReview(r)}>
                            <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{safeDate(r.review_date)}</td>
                            {selectedCleanerId === "all" && <td className="px-4 py-3 font-medium text-slate-800">{r.cleaner_name}</td>}
                            <td className="px-4 py-3 text-slate-600">{r.client_name || <span className="text-slate-300 italic">Sin cliente</span>}</td>
                            <td className="px-4 py-3 text-center"><ScoreBadge score={r.overall_score || 0} /></td>
                            <td className="px-4 py-3 text-center"><PointsBadge points={r.points_impact} /></td>
                            <td className="px-4 py-3 text-slate-500 text-xs">{r.reviewed_by_admin_name}</td>
                            <td className="px-4 py-3 text-center">
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={e => { e.stopPropagation(); setOpenReview(r); }}>
                                <Eye className="w-4 h-4 text-blue-500" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-3 border-t border-slate-100">
                    <SimplePagination currentPage={perfPage} totalPages={totalPages(filteredPerf)} onPageChange={setPerfPage} totalItems={filteredPerf.length} pageSize={PAGE_SIZE} />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── PUNTUALIDAD ── */}
        <TabsContent value="punctuality">
          <Card className="border-0 shadow-md">
            <CardContent className="p-0">
              {filteredPunct.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <Clock className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p>No hay registros de puntualidad.</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="text-left px-4 py-3 font-semibold text-slate-600">Fecha</th>
                          {selectedCleanerId === "all" && <th className="text-left px-4 py-3 font-semibold text-slate-600">Limpiador</th>}
                          <th className="text-center px-4 py-3 font-semibold text-slate-600">Retraso</th>
                          <th className="text-center px-4 py-3 font-semibold text-slate-600">Uniforme</th>
                          <th className="text-center px-4 py-3 font-semibold text-slate-600">Presentación</th>
                          <th className="text-center px-4 py-3 font-semibold text-slate-600">Ausencia</th>
                          <th className="text-center px-4 py-3 font-semibold text-slate-600">Impacto</th>
                          <th className="text-center px-4 py-3 font-semibold text-slate-600">Ver</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginate(filteredPunct, punctPage).map((r, i) => (
                          <tr key={r.id} className={`border-b border-slate-100 hover:bg-orange-50 transition-colors cursor-pointer ${i % 2 === 0 ? "" : "bg-slate-50/50"}`}
                            onClick={() => setOpenPunct(r)}>
                            <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{safeDate(r.date)}</td>
                            {selectedCleanerId === "all" && <td className="px-4 py-3 font-medium text-slate-800">{r.cleaner_name}</td>}
                            <td className="px-4 py-3 text-center">
                              {r.minutes_late != null ? (
                                <span className={r.minutes_late > 0 ? "text-red-600 font-medium" : "text-green-600"}>
                                  {r.minutes_late > 0 ? `+${r.minutes_late}min` : r.minutes_late < 0 ? `${r.minutes_late}min` : "A tiempo"}
                                </span>
                              ) : "—"}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {r.uniform_ok ? <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" /> : <AlertCircle className="w-4 h-4 text-red-500 mx-auto" />}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {r.presentation_ok ? <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" /> : <AlertCircle className="w-4 h-4 text-red-500 mx-auto" />}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {r.absence ? <Badge className="bg-red-100 text-red-700">Ausente</Badge> : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-center"><PointsBadge points={r.points_impact} /></td>
                            <td className="px-4 py-3 text-center">
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={e => { e.stopPropagation(); setOpenPunct(r); }}>
                                <Eye className="w-4 h-4 text-orange-500" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-3 border-t border-slate-100">
                    <SimplePagination currentPage={punctPage} totalPages={totalPages(filteredPunct)} onPageChange={setPunctPage} totalItems={filteredPunct.length} pageSize={PAGE_SIZE} />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── VEHÍCULOS ── */}
        <TabsContent value="vehicle">
          <Card className="border-0 shadow-md">
            <CardContent className="p-0">
              {filteredVehicle.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <Car className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p>No hay checklists de vehículos.</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="text-left px-4 py-3 font-semibold text-slate-600">Fecha</th>
                          <th className="text-left px-4 py-3 font-semibold text-slate-600">Vehículo</th>
                          <th className="text-left px-4 py-3 font-semibold text-slate-600">Equipo</th>
                          <th className="text-center px-4 py-3 font-semibold text-slate-600">Fallos</th>
                          <th className="text-center px-4 py-3 font-semibold text-slate-600">Deducción total</th>
                          <th className="text-center px-4 py-3 font-semibold text-slate-600">Por miembro</th>
                          <th className="text-center px-4 py-3 font-semibold text-slate-600">Ver</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginate(filteredVehicle, vehPage).map((r, i) => {
                          const failCount = (r.checklist_items || []).filter(c => !c.passed).length;
                          return (
                            <tr key={r.id} className={`border-b border-slate-100 hover:bg-teal-50 transition-colors cursor-pointer ${i % 2 === 0 ? "" : "bg-slate-50/50"}`}
                              onClick={() => setOpenVehicle(r)}>
                              <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{safeDate(r.date)}</td>
                              <td className="px-4 py-3 font-medium text-slate-800">{r.vehicle_info || "—"}</td>
                              <td className="px-4 py-3 text-slate-600 text-xs">{(r.team_member_names || []).join(", ") || "—"}</td>
                              <td className="px-4 py-3 text-center">
                                {failCount > 0
                                  ? <Badge className="bg-red-100 text-red-700">{failCount} fallos</Badge>
                                  : <Badge className="bg-green-100 text-green-700">OK</Badge>}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <PointsBadge points={r.total_deduction ? -r.total_deduction : 0} />
                              </td>
                              <td className="px-4 py-3 text-center">
                                <PointsBadge points={r.points_per_member ? -r.points_per_member : 0} />
                              </td>
                              <td className="px-4 py-3 text-center">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={e => { e.stopPropagation(); setOpenVehicle(r); }}>
                                  <Eye className="w-4 h-4 text-teal-500" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-3 border-t border-slate-100">
                    <SimplePagination currentPage={vehPage} totalPages={totalPages(filteredVehicle)} onPageChange={setVehPage} totalItems={filteredVehicle.length} pageSize={PAGE_SIZE} />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── FEEDBACK ── */}
        <TabsContent value="feedback">
          <Card className="border-0 shadow-md">
            <CardContent className="p-0">
              {filteredFeedback.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p>No hay feedback de clientes.</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="text-left px-4 py-3 font-semibold text-slate-600">Fecha</th>
                          <th className="text-left px-4 py-3 font-semibold text-slate-600">Cliente</th>
                          <th className="text-center px-4 py-3 font-semibold text-slate-600">Tipo</th>
                          {selectedCleanerId === "all" && <th className="text-left px-4 py-3 font-semibold text-slate-600">Limpiadores</th>}
                          <th className="text-left px-4 py-3 font-semibold text-slate-600 max-w-[200px]">Descripción</th>
                          <th className="text-center px-4 py-3 font-semibold text-slate-600">Impacto c/u</th>
                          <th className="text-center px-4 py-3 font-semibold text-slate-600">Ver</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginate(filteredFeedback, feedPage).map((r, i) => (
                          <tr key={r.id} className={`border-b border-slate-100 hover:bg-purple-50 transition-colors cursor-pointer ${i % 2 === 0 ? "" : "bg-slate-50/50"}`}
                            onClick={() => setOpenFeedback(r)}>
                            <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{safeDate(r.feedback_date)}</td>
                            <td className="px-4 py-3 font-medium text-slate-800">{r.client_name}</td>
                            <td className="px-4 py-3 text-center"><FeedbackTypeBadge type={r.feedback_type} /></td>
                            {selectedCleanerId === "all" && (
                              <td className="px-4 py-3 text-slate-600 text-xs">{(r.affected_cleaner_names || []).join(", ") || "—"}</td>
                            )}
                            <td className="px-4 py-3 text-slate-500 text-xs max-w-[200px] truncate">{r.description}</td>
                            <td className="px-4 py-3 text-center"><PointsBadge points={r.points_impact} /></td>
                            <td className="px-4 py-3 text-center">
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={e => { e.stopPropagation(); setOpenFeedback(r); }}>
                                <Eye className="w-4 h-4 text-purple-500" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-3 border-t border-slate-100">
                    <SimplePagination currentPage={feedPage} totalPages={totalPages(filteredFeedback)} onPageChange={setFeedPage} totalItems={filteredFeedback.length} pageSize={PAGE_SIZE} />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Detail Dialogs */}
      <ReviewDetailDialog review={openReview} open={!!openReview} onClose={() => setOpenReview(null)} />
      <PunctualityDetailDialog record={openPunct} open={!!openPunct} onClose={() => setOpenPunct(null)} />
      <FeedbackDetailDialog feedback={openFeedback} open={!!openFeedback} onClose={() => setOpenFeedback(null)} />
      <VehicleDetailDialog record={openVehicle} open={!!openVehicle} onClose={() => setOpenVehicle(null)} />
    </div>
  );
}