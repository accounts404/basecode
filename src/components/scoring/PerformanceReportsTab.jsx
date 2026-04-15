import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BarChart2, TrendingUp, User, Home, Calendar, Search, X, ChevronDown, ChevronUp, Filter, Star, AlertCircle, CheckCircle2 } from "lucide-react";
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { es } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from "recharts";
import SimplePagination from "@/components/ui/simple-pagination";

function ScoreBadge({ score }) {
  const cls = score >= 90 ? "bg-green-100 text-green-800"
    : score >= 75 ? "bg-blue-100 text-blue-800"
    : score >= 60 ? "bg-yellow-100 text-yellow-800"
    : "bg-red-100 text-red-800";
  return <Badge className={cls}>{Math.round(score)} / 100</Badge>;
}

const PAGE_SIZE = 15;

export default function PerformanceReportsTab({ limpiadores }) {
  const [allReviews, setAllReviews] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterCleaner, setFilterCleaner] = useState("all");
  const [filterClient, setFilterClient] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterScore, setFilterScore] = useState("all"); // all, perfect, good, fair, poor
  const [clientSearch, setClientSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [reviews, cls] = await Promise.all([
        base44.entities.PerformanceReview.list("-review_date", 500),
        base44.entities.Client.filter({ active: true }),
      ]);
      setAllReviews(reviews);
      setClients(cls.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  // Derived unique values for dropdowns
  const uniqueCleaners = limpiadores;
  const uniqueClients = clients.filter(c => allReviews.some(r => r.client_id === c.id));

  // Apply filters
  const filtered = allReviews.filter(r => {
    if (filterCleaner !== "all" && r.cleaner_id !== filterCleaner) return false;
    if (filterClient !== "all" && r.client_id !== filterClient) return false;
    if (filterDateFrom && r.review_date < filterDateFrom) return false;
    if (filterDateTo && r.review_date > filterDateTo) return false;
    if (filterScore === "perfect" && r.overall_score < 100) return false;
    if (filterScore === "good" && (r.overall_score < 75 || r.overall_score >= 100)) return false;
    if (filterScore === "fair" && (r.overall_score < 60 || r.overall_score >= 75)) return false;
    if (filterScore === "poor" && r.overall_score >= 60) return false;
    return true;
  }).sort((a, b) => new Date(b.review_date) - new Date(a.review_date));

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const resetFilters = () => {
    setFilterCleaner("all");
    setFilterClient("all");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterScore("all");
    setPage(1);
  };

  const hasFilters = filterCleaner !== "all" || filterClient !== "all" || filterDateFrom || filterDateTo || filterScore !== "all";

  // Stats from filtered
  const avgScore = filtered.length > 0 ? filtered.reduce((s, r) => s + (r.overall_score || 0), 0) / filtered.length : null;
  const perfect = filtered.filter(r => r.overall_score === 100).length;
  const poor = filtered.filter(r => r.overall_score < 60).length;

  // ---- Chart: trend by month ----
  const trendData = (() => {
    const byMonth = {};
    filtered.forEach(r => {
      const m = r.review_date?.slice(0, 7);
      if (!m) return;
      if (!byMonth[m]) byMonth[m] = { month: m, scores: [], count: 0 };
      byMonth[m].scores.push(r.overall_score || 0);
      byMonth[m].count++;
    });
    return Object.values(byMonth)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(m => ({
        label: format(parseISO(m.month + "-01"), "MMM yy", { locale: es }),
        promedio: Math.round(m.scores.reduce((s, v) => s + v, 0) / m.scores.length),
        evaluaciones: m.count,
      }));
  })();

  // ---- Chart: avg per cleaner ----
  const cleanerData = (() => {
    const byCleaner = {};
    filtered.forEach(r => {
      if (!byCleaner[r.cleaner_id]) byCleaner[r.cleaner_id] = { name: r.cleaner_name, scores: [] };
      byCleaner[r.cleaner_id].scores.push(r.overall_score || 0);
    });
    return Object.values(byCleaner)
      .map(c => ({ name: (c.name || "").split(" ")[0], promedio: Math.round(c.scores.reduce((s, v) => s + v, 0) / c.scores.length), total: c.scores.length }))
      .sort((a, b) => b.promedio - a.promedio);
  })();

  // ---- Chart: avg per client ----
  const clientData = (() => {
    const byClient = {};
    filtered.filter(r => r.client_id).forEach(r => {
      if (!byClient[r.client_id]) byClient[r.client_id] = { name: r.client_name, scores: [] };
      byClient[r.client_id].scores.push(r.overall_score || 0);
    });
    return Object.values(byClient)
      .map(c => ({ name: (c.name || "").split(" ")[0], promedio: Math.round(c.scores.reduce((s, v) => s + v, 0) / c.scores.length), total: c.scores.length }))
      .sort((a, b) => b.promedio - a.promedio)
      .slice(0, 15);
  })();

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Reportes de Performance</h3>
          <p className="text-sm text-slate-500">Análisis histórico completo de evaluaciones</p>
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
                <X className="w-3 h-3 mr-1" /> Limpiar filtros
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* Cleaner */}
            <div>
              <Label className="text-xs mb-1 block">Limpiador</Label>
              <Select value={filterCleaner} onValueChange={v => { setFilterCleaner(v); setPage(1); }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {uniqueCleaners.map(c => <SelectItem key={c.id} value={c.id}>{c.invoice_name || c.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {/* Client */}
            <div>
              <Label className="text-xs mb-1 block">Cliente</Label>
              <Select value={filterClient} onValueChange={v => { setFilterClient(v); setPage(1); }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {uniqueClients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {/* Date from */}
            <div>
              <Label className="text-xs mb-1 block">Desde</Label>
              <Input type="date" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); setPage(1); }} className="h-8 text-xs" />
            </div>
            {/* Date to */}
            <div>
              <Label className="text-xs mb-1 block">Hasta</Label>
              <Input type="date" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); setPage(1); }} className="h-8 text-xs" />
            </div>
            {/* Score range */}
            <div>
              <Label className="text-xs mb-1 block">Puntaje</Label>
              <Select value={filterScore} onValueChange={v => { setFilterScore(v); setPage(1); }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="perfect">Perfectas (100)</SelectItem>
                  <SelectItem value="good">Buenas (75-99)</SelectItem>
                  <SelectItem value="fair">Regulares (60-74)</SelectItem>
                  <SelectItem value="poor">Bajas (&lt;60)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-0 shadow-sm bg-blue-50">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-blue-800">{filtered.length}</p>
            <p className="text-xs text-blue-600">Evaluaciones</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-green-50">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-green-800">{avgScore !== null ? Math.round(avgScore) : "—"}</p>
            <p className="text-xs text-green-600">Promedio general</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-purple-50">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-purple-800">{perfect}</p>
            <p className="text-xs text-purple-600">Perfectas (100)</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-red-50">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-red-800">{poor}</p>
            <p className="text-xs text-red-600">Bajas (&lt;60)</p>
          </CardContent>
        </Card>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <BarChart2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No hay evaluaciones con los filtros aplicados.</p>
        </div>
      ) : (
        <Tabs defaultValue="table">
          <TabsList>
            <TabsTrigger value="table">Lista detallada</TabsTrigger>
            <TabsTrigger value="trend">Tendencia en el tiempo</TabsTrigger>
            <TabsTrigger value="by_cleaner">Por limpiador</TabsTrigger>
            <TabsTrigger value="by_client">Por cliente</TabsTrigger>
          </TabsList>

          {/* TABLE */}
          <TabsContent value="table">
            <Card className="border-0 shadow-md">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600">Fecha</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600">Limpiador</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600">Cliente</th>
                        <th className="text-center px-4 py-3 font-semibold text-slate-600">Puntaje</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600">Revisado por</th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-600">Notas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paged.map((r, i) => (
                        <tr key={r.id} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${i % 2 === 0 ? "" : "bg-slate-50/50"}`}>
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                            {format(parseISO(r.review_date), "d MMM yyyy", { locale: es })}
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-800">{r.cleaner_name}</td>
                          <td className="px-4 py-3 text-slate-600">{r.client_name || <span className="text-slate-300 italic">Sin cliente</span>}</td>
                          <td className="px-4 py-3 text-center">
                            <ScoreBadge score={r.overall_score || 0} />
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs">{r.reviewed_by_admin_name}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs max-w-[200px] truncate">{r.general_notes || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 border-t border-slate-100">
                  <SimplePagination
                    currentPage={page}
                    totalPages={totalPages}
                    onPageChange={setPage}
                    totalItems={filtered.length}
                    pageSize={PAGE_SIZE}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TREND */}
          <TabsContent value="trend">
            <Card className="border-0 shadow-md">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" /> Evolución del puntaje promedio por mes
                </CardTitle>
              </CardHeader>
              <CardContent>
                {trendData.length < 2 ? (
                  <p className="text-center text-slate-400 py-8">Necesitas al menos 2 meses de datos para ver la tendencia.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(v, n) => [n === "promedio" ? `${v}/100` : v, n === "promedio" ? "Promedio" : "Evaluaciones"]} />
                      <Legend formatter={n => n === "promedio" ? "Promedio puntaje" : "# Evaluaciones"} />
                      <Line type="monotone" dataKey="promedio" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="evaluaciones" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4" dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* BY CLEANER */}
          <TabsContent value="by_cleaner">
            <Card className="border-0 shadow-md">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="w-4 h-4" /> Puntaje promedio por limpiador
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={Math.max(250, cleanerData.length * 40)}>
                  <BarChart data={cleanerData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                    <Tooltip formatter={(v, n) => [`${v}/100`, "Promedio"]} />
                    <Bar dataKey="promedio" fill="#3b82f6" radius={[0, 4, 4, 0]}
                      label={{ position: "right", fontSize: 11, formatter: (v) => `${v}` }} />
                  </BarChart>
                </ResponsiveContainer>

                {/* Detailed table */}
                <div className="mt-4 space-y-2">
                  {cleanerData.map((c, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? "bg-yellow-100 text-yellow-700" : i === 1 ? "bg-slate-200 text-slate-600" : "bg-orange-100 text-orange-600"}`}>
                          {i + 1}
                        </span>
                        <span className="text-sm font-medium text-slate-700">
                          {cleanerData.find(cd => cd.name === c.name) ? uniqueCleaners.find(l => (l.invoice_name || l.full_name).startsWith(c.name))?.invoice_name || uniqueCleaners.find(l => (l.invoice_name || l.full_name).startsWith(c.name))?.full_name || c.name : c.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400">{c.total} eval.</span>
                        <ScoreBadge score={c.promedio} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* BY CLIENT */}
          <TabsContent value="by_client">
            <Card className="border-0 shadow-md">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Home className="w-4 h-4" /> Puntaje promedio por cliente
                </CardTitle>
              </CardHeader>
              <CardContent>
                {clientData.length === 0 ? (
                  <p className="text-center text-slate-400 py-8">No hay evaluaciones asociadas a clientes.</p>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={Math.max(250, clientData.length * 36)}>
                      <BarChart data={clientData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                        <Tooltip formatter={(v) => [`${v}/100`, "Promedio"]} />
                        <Bar dataKey="promedio" fill="#10b981" radius={[0, 4, 4, 0]}
                          label={{ position: "right", fontSize: 11, formatter: (v) => `${v}` }} />
                      </BarChart>
                    </ResponsiveContainer>

                    <div className="mt-4 space-y-2">
                      {clientData.map((c, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg">
                          <div className="flex items-center gap-2">
                            <Home className="w-4 h-4 text-slate-400" />
                            <span className="text-sm font-medium text-slate-700">
                              {uniqueClients.find(cl => cl.name.startsWith(c.name))?.name || c.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-slate-400">{c.total} eval.</span>
                            <ScoreBadge score={c.promedio} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}