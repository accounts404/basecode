import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { applyRecurrencePreview } from '@/functions/applyRecurrencePreview';
import { restoreWronglyCancelledSchedules } from '@/functions/restoreWronglyCancelledSchedules';
import { extendRecurringSchedules } from '@/functions/extendRecurringSchedules';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  CalendarClock, CheckCircle, Clock, Loader2, AlertTriangle, RefreshCw, History, Play, Shield, RotateCcw, ChevronDown, ChevronRight, Search, UserCheck, XCircle,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

const RULE_LABELS = {
  weekly: 'Semanal', fortnightly: 'Quincenal', every_3_weeks: 'Cada 3 sem.', every_4_weeks: 'Cada 4 sem.', monthly: 'Mensual',
};

const STATUS_STYLES = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  approved: 'bg-green-100 text-green-800 border-green-200',
  expired: 'bg-slate-100 text-slate-600 border-slate-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
};

const ITEM_STATUS_LABELS = { pending: 'Pendiente', applied: 'Creada', skipped: 'Omitida' };
const ITEM_STATUS_STYLES = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  applied: 'bg-green-100 text-green-800 border-green-200',
  skipped: 'bg-slate-100 text-slate-600 border-slate-200',
};

export default function RecurrenciasPreview() {
  const [previews, setPreviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [applyingItem, setApplyingItem] = useState(null);
  const [applyingAll, setApplyingAll] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [result, setResult] = useState(null);

  // Restore wrongly cancelled
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreDryRun, setRestoreDryRun] = useState(null);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreResult, setRestoreResult] = useState(null);
  const [generating, setGenerating] = useState(false);

  const loadPreviews = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const all = await base44.entities.RecurrencePreview.list('-created_date', 50);
      setPreviews(Array.isArray(all) ? all : []);
    } catch (e) {
      setError('Error cargando vistas previas: ' + (e.message || 'desconocido'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPreviews(); }, [loadPreviews]);

  const pendingPreview = previews.find((p) => p.status === 'pending' || p.status === 'approved');
  const historyPreviews = previews.filter((p) => p.status !== 'pending' && p.status !== 'approved');

  const handleGenerate = async () => {
    if (!confirm('¿Generar la vista previa de recurrencias ahora? Se enviará un correo al administrador con el resumen. No se crearán ni cancelarán servicios.')) return;
    setGenerating(true);
    setResult(null);
    try {
      const res = await extendRecurringSchedules({});
      const data = res.data || res;
      setResult({ ok: true, message: `Vista previa generada: ${data.preview_items || 0} series, ${data.summary?.total_new_services ?? 0} servicios. Correo enviado: ${data.email_sent ? 'sí' : 'no'}.` });
      await loadPreviews();
    } catch (e) {
      setResult({ ok: false, message: e.response?.data?.error || e.message || 'Error al generar' });
    } finally {
      setGenerating(false);
    }
  };

  const handleApproveItem = async (recurrenceId, clientName) => {
    if (!pendingPreview) return;
    if (!confirm(`¿Aprobar y crear los servicios futuros de la serie de "${clientName}"? Esto solo crea servicios nuevos (todos futuros). No modifica ni cancela servicios pasados.`)) return;
    setApplyingItem(recurrenceId);
    setResult(null);
    try {
      const res = await applyRecurrencePreview({ previewId: pendingPreview.id, recurrenceId });
      const data = res.data || res;
      setResult({ ok: true, message: data.message || 'Serie aprobada', created: data.created_count, errors: data.errors || [] });
      await loadPreviews();
    } catch (e) {
      setResult({ ok: false, message: e.response?.data?.error || e.message || 'Error al aprobar la serie' });
    } finally {
      setApplyingItem(null);
    }
  };

  const handleSkipItem = async (recurrenceId, clientName) => {
    if (!pendingPreview) return;
    if (!confirm(`¿Omitir la serie de "${clientName}"? No se crearán los servicios futuros de esta serie en esta vista previa.`)) return;
    setApplyingItem(recurrenceId);
    setResult(null);
    try {
      const res = await applyRecurrencePreview({ previewId: pendingPreview.id, recurrenceId, mode: 'skip' });
      const data = res.data || res;
      setResult({ ok: true, message: data.message || 'Serie omitida' });
      await loadPreviews();
    } catch (e) {
      setResult({ ok: false, message: e.response?.data?.error || e.message || 'Error al omitir' });
    } finally {
      setApplyingItem(null);
    }
  };

  const handleApproveAll = async () => {
    if (!pendingPreview) return;
    const pendingItems = (pendingPreview.preview_items || []).filter((it) => (it.item_status || 'pending') !== 'applied');
    if (pendingItems.length === 0) { setResult({ ok: true, message: 'Todas las series ya fueron aprobadas.' }); return; }
    if (!confirm(`¿Aprobar y crear los servicios futuros de TODAS las series pendientes (${pendingItems.length})? Solo crea servicios futuros; no toca el pasado.`)) return;
    setApplyingAll(true);
    setResult(null);
    try {
      const res = await applyRecurrencePreview({ previewId: pendingPreview.id });
      const data = res.data || res;
      setResult({ ok: true, message: data.message || 'Aplicado', created: data.created_count, errors: data.errors || [] });
      await loadPreviews();
    } catch (e) {
      setResult({ ok: false, message: e.response?.data?.error || e.message || 'Error al aplicar' });
    } finally {
      setApplyingAll(false);
    }
  };

  const handleRestoreDryRun = async () => {
    setRestoreLoading(true);
    setRestoreResult(null);
    try {
      const res = await restoreWronglyCancelledSchedules({ dryRun: true });
      setRestoreDryRun(res.data || res);
    } catch (e) {
      setRestoreResult({ ok: false, message: e.response?.data?.error || e.message || 'Error' });
    } finally {
      setRestoreLoading(false);
    }
  };

  const handleRestoreApply = async () => {
    if (!confirm('¿Restaurar al estado original todos los servicios cancelados por el bug del 1-Sep? Pasados con trabajo → completed, pasados sin trabajo → scheduled, futuros → scheduled. Se registrará auditoría.')) return;
    setRestoreLoading(true);
    setRestoreResult(null);
    try {
      const res = await restoreWronglyCancelledSchedules({ dryRun: false });
      setRestoreResult(res.data || res);
      setRestoreDryRun(null);
    } catch (e) {
      setRestoreResult({ ok: false, message: e.response?.data?.error || e.message || 'Error' });
    } finally {
      setRestoreLoading(false);
    }
  };

  const renderPreviewTable = (p) => {
    const items = p.preview_items || [];
    const isExpanded = expanded === p.id;
    const pendingItems = items.filter((it) => (it.item_status || 'pending') === 'pending');
    const appliedItems = items.filter((it) => (it.item_status || 'pending') === 'applied');
    const skippedItems = items.filter((it) => (it.item_status || 'pending') === 'skipped');
    const summary = p.summary || {};
    const pastChanges = summary.past_changes ?? 0;
    const futureChanges = summary.future_changes ?? summary.total_new_services ?? 0;

    return (
      <Card className="border-slate-200">
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CalendarClock className="w-5 h-5 text-blue-600" />
                Vista previa {p.period}
              </CardTitle>
              <p className="text-xs text-slate-500 mt-1">
                Generada el {format(parseISO(p.generated_at), "d 'de' MMMM yyyy 'a las' HH:mm", { locale: es })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={STATUS_STYLES[p.status] || ''}>
                {p.status === 'pending' && <Clock className="w-3 h-3 mr-1" />}
                {p.status === 'approved' && <CheckCircle className="w-3 h-3 mr-1" />}
                {p.status === 'expired' && <History className="w-3 h-3 mr-1" />}
                {p.status}
              </Badge>
              {p.email_sent && <Badge variant="secondary" className="text-xs">📧 Correo enviado</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <StatBox label="Series a extender" value={summary.total_series_to_extend ?? 0} accent="blue" />
            <StatBox label="Cambios a futuro" value={futureChanges} accent="green" />
            <StatBox label="Cambios en pasado" value={pastChanges} accent={pastChanges === 0 ? 'green' : 'red'} />
            <StatBox label="Servicios nuevos" value={summary.total_new_services ?? 0} accent="green" />
          </div>
          <div className="grid grid-cols-3 gap-3 mb-5">
            <StatBox label="Ya al día" value={summary.already_ok ?? 0} />
            <StatBox label="Abandonadas" value={summary.skipped_abandoned ?? 0} />
            <StatBox label="Limpiadores inactivos" value={summary.skipped_inactive ?? 0} />
          </div>

          <div className={`rounded-lg border p-3 mb-4 text-sm flex items-center gap-2 ${pastChanges === 0 ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
            {pastChanges === 0 ? <CheckCircle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            <span>
              <strong>Cambios en el pasado: {pastChanges}.</strong> El cron nunca modifica ni cancela servicios pasados; solo propone crear servicios futuros. Cada serie se aprueba manualmente.
            </span>
          </div>

          {items.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800 flex items-center gap-2">
              <CheckCircle className="w-5 h-5" /> No hay extensiones pendientes este mes. Todas las series están al día.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpanded(isExpanded ? null : p.id)}
                  className="text-slate-600"
                >
                  {isExpanded ? <ChevronDown className="w-4 h-4 mr-1" /> : <ChevronRight className="w-4 h-4 mr-1" />}
                  {isExpanded ? 'Ocultar detalle' : `Ver detalle (${items.length} series · ${appliedItems.length} aprobadas · ${skippedItems.length} omitidas · ${pendingItems.length} pendientes)`}
                </Button>
                <div className="text-xs text-slate-500">
                  {appliedItems.length}/{items.length} series aprobadas
                </div>
              </div>

              {isExpanded && (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Cliente</th>
                        <th className="text-left px-3 py-2 font-medium">Frecuencia</th>
                        <th className="text-left px-3 py-2 font-medium">Limpiadores</th>
                        <th className="text-left px-3 py-2 font-medium">Último servicio</th>
                        <th className="text-left px-3 py-2 font-medium">A crear</th>
                        <th className="text-left px-3 py-2 font-medium">Próximas fechas</th>
                        <th className="text-left px-3 py-2 font-medium">Estado</th>
                        <th className="text-left px-3 py-2 font-medium">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map((it, i) => {
                        const itemStatus = it.item_status || 'pending';
                        const isApplied = itemStatus === 'applied';
                        return (
                          <tr key={i} className={`hover:bg-slate-50 ${isApplied ? 'bg-green-50/40' : ''}`}>
                            <td className="px-3 py-2 font-medium text-slate-800">{it.client_name}</td>
                            <td className="px-3 py-2">{RULE_LABELS[it.recurrence_rule] || it.recurrence_rule}</td>
                            <td className="px-3 py-2 text-xs text-slate-600">
                              {(it.cleaner_names || []).length > 0 ? (
                                <span className="inline-flex items-center gap-1"><UserCheck className="w-3 h-3" />{it.cleaner_names.join(', ')}</span>
                              ) : '—'}
                            </td>
                            <td className="px-3 py-2 text-slate-600">{it.last_service_date}</td>
                            <td className="px-3 py-2"><Badge variant="secondary">{it.count}</Badge></td>
                            <td className="px-3 py-2 text-xs text-slate-500">
                              <div className="max-h-24 overflow-y-auto whitespace-normal leading-relaxed pr-1">
                                {(it.new_dates || []).join(', ')}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <Badge variant="outline" className={ITEM_STATUS_STYLES[itemStatus]}>
                                {ITEM_STATUS_LABELS[itemStatus]}
                                {isApplied && it.applied_count != null && ` · ${it.applied_count}`}
                              </Badge>
                            </td>
                            <td className="px-3 py-2">
                              {isApplied ? (
                                <span className="text-xs text-green-700 inline-flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Creada</span>
                              ) : itemStatus === 'skipped' ? (
                                <span className="text-xs text-slate-500 inline-flex items-center gap-1"><XCircle className="w-3 h-3" /> Omitida</span>
                              ) : (
                                <div className="flex gap-1">
                                  <Button
                                    size="sm"
                                    onClick={() => handleApproveItem(it.recurrence_id, it.client_name)}
                                    disabled={applyingItem === it.recurrence_id}
                                    className="bg-green-600 hover:bg-green-700 text-white h-8"
                                  >
                                    {applyingItem === it.recurrence_id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Play className="w-3 h-3 mr-1" />}
                                    Aprobar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleSkipItem(it.recurrence_id, it.client_name)}
                                    disabled={applyingItem === it.recurrence_id}
                                    className="h-8 text-red-600 border-red-200 hover:bg-red-50"
                                  >
                                    Omitir
                                  </Button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {pendingItems.length > 0 && (
                <div className="mt-5 flex items-center gap-3 flex-wrap">
                  <Button
                    onClick={handleApproveAll}
                    disabled={applyingAll}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    {applyingAll ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                    Aprobar todo ({pendingItems.length} pendientes)
                  </Button>
                  <span className="text-xs text-slate-500">
                    Crea {pendingItems.reduce((a, it) => a + (it.count || 0), 0)} servicios futuros. No toca el pasado ni cancela nada.
                  </span>
                </div>
              )}

              {appliedItems.length > 0 && p.execution_result && (
                <div className="mt-4 text-sm bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <span className="font-medium text-slate-700">Servicios creados hasta ahora:</span>{' '}
                  {p.execution_result.created_count ?? appliedItems.reduce((a, it) => a + (it.applied_count || 0), 0)}
                  {p.execution_result.errors?.length > 0 && (
                    <span className="text-red-600"> · {p.execution_result.errors.length} errores</span>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <CalendarClock className="w-6 h-6 text-blue-600" />
            Recurrencias (Aprobación)
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            El cron del día 1 de cada mes genera una vista previa de extensiones. Aprobá cada serie manualmente. Solo se crean servicios futuros; el pasado no se modifica.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating}>
            {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CalendarClock className="w-4 h-4 mr-2" />}
            Generar vista previa ahora
          </Button>
          <Button variant="outline" size="sm" onClick={loadPreviews} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {result && (
        <Alert variant={result.ok ? 'default' : 'destructive'} className={result.ok ? 'border-green-200 bg-green-50 text-green-800' : ''}>
          {result.ok ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          <AlertDescription>
            {result.message}
            {result.errors?.length > 0 && ` (${result.errors.length} errores)`}
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
      ) : (
        <>
          {/* Pending preview */}
          {pendingPreview ? (
            renderPreviewTable(pendingPreview)
          ) : (
            <Card className="border-slate-200">
              <CardContent className="py-10 text-center text-slate-500">
                <Clock className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                <p>No hay vista previa pendiente. El próximo cron (1 del mes) generará una nueva, o pulsá "Generar vista previa ahora".</p>
              </CardContent>
            </Card>
          )}

          {/* Restore wrongly cancelled section */}
          <Card className="border-amber-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-amber-900">
                <Shield className="w-5 h-5" />
                Restaurar servicios cancelados por error
                <Button variant="ghost" size="sm" onClick={() => setRestoreOpen(!restoreOpen)} className="ml-auto">
                  {restoreOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </Button>
              </CardTitle>
            </CardHeader>
            {restoreOpen && (
              <CardContent className="space-y-4">
                <p className="text-sm text-amber-800">
                  Los servicios que el cron canceló por error y que ya fueron trabajados (con clock-in/out) o facturados
                  se pueden restaurar a <strong>completed</strong> aquí. Primero ejecutá una simulación para ver el alcance.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" onClick={handleRestoreDryRun} disabled={restoreLoading}>
                    {restoreLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                    Simular (dry-run)
                  </Button>
                  {restoreDryRun && restoreDryRun.incident_cancelled > 0 && (
                    <Button onClick={handleRestoreApply} disabled={restoreLoading} className="bg-amber-600 hover:bg-amber-700 text-white">
                      <RotateCcw className="w-4 h-4 mr-2" /> Restaurar {restoreDryRun.incident_cancelled} servicios
                    </Button>
                  )}
                </div>

                {restoreDryRun && (
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 text-sm space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div><p className="text-xs text-slate-500">Cancelados totales</p><p className="text-lg font-bold text-slate-700">{restoreDryRun.total_cancelled}</p></div>
                      <div><p className="text-xs text-slate-500">Del incidente (1-Sep)</p><p className="text-lg font-bold text-amber-700">{restoreDryRun.incident_cancelled}</p></div>
                      <div><p className="text-xs text-slate-500">A 'completed'</p><p className="text-lg font-bold text-green-700">{restoreDryRun.by_status?.completed ?? 0}</p></div>
                      <div><p className="text-xs text-slate-500">A 'scheduled'</p><p className="text-lg font-bold text-blue-700">{restoreDryRun.by_status?.scheduled ?? 0}</p></div>
                    </div>
                    {restoreDryRun.by_client?.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="text-slate-500"><tr>
                            <th className="text-left px-2 py-1">Cliente</th>
                            <th className="text-left px-2 py-1">A completed</th>
                            <th className="text-left px-2 py-1">A scheduled</th>
                            <th className="text-left px-2 py-1">Total</th>
                          </tr></thead>
                          <tbody className="divide-y divide-slate-100">
                            {restoreDryRun.by_client.map((c) => (
                              <tr key={c.client_name}>
                                <td className="px-2 py-1 font-medium">{c.client_name}</td>
                                <td className="px-2 py-1 text-green-700">{c.completed}</td>
                                <td className="px-2 py-1 text-blue-700">{c.scheduled}</td>
                                <td className="px-2 py-1 font-semibold">{c.total}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {restoreDryRun.sample?.length > 0 && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-slate-500 hover:text-slate-700">Ver muestra de servicios ({restoreDryRun.sample.length})</summary>
                        <div className="overflow-x-auto mt-2">
                          <table className="w-full text-xs">
                            <thead className="text-slate-500"><tr>
                              <th className="text-left px-2 py-1">Cliente</th>
                              <th className="text-left px-2 py-1">Fecha</th>
                              <th className="text-left px-2 py-1">Futuro</th>
                              <th className="text-left px-2 py-1">Evidencia</th>
                              <th className="text-left px-2 py-1">Propuesto</th>
                            </tr></thead>
                            <tbody className="divide-y divide-slate-100">
                              {restoreDryRun.sample.map((s) => (
                                <tr key={s.id}>
                                  <td className="px-2 py-1 font-medium">{s.client_name}</td>
                                  <td className="px-2 py-1">{s.start_time?.slice(0,10)}</td>
                                  <td className="px-2 py-1">{s.is_future ? 'Sí' : 'No'}</td>
                                  <td className="px-2 py-1">{s.has_evidence ? '✓' : '—'}</td>
                                  <td className="px-2 py-1 font-semibold">{s.proposed}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {restoreDryRun.incident_cancelled > 25 && <p className="text-xs text-slate-400 mt-1">Mostrando 25 de {restoreDryRun.incident_cancelled}.</p>}
                        </div>
                      </details>
                    )}
                  </div>
                )}

                {restoreResult && (
                  <Alert variant={restoreResult.success ? 'default' : 'destructive'} className={restoreResult.success ? 'border-green-200 bg-green-50 text-green-800' : ''}>
                    {restoreResult.success ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                    <AlertDescription>{restoreResult.message || 'Completado'}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            )}
          </Card>

          {/* History */}
          {historyPreviews.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <History className="w-5 h-5" /> Historial
              </h2>
              <div className="space-y-3">
                {historyPreviews.slice(0, 6).map((p) => (
                  <div key={p.id} className="bg-white rounded-lg border border-slate-200 p-3 flex items-center justify-between">
                    <div>
                      <span className="font-medium text-slate-800">{p.period}</span>
                      <span className="text-xs text-slate-500 ml-2">
                        {format(parseISO(p.generated_at), "d MMM yyyy HH:mm", { locale: es })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">{p.summary?.total_new_services ?? 0} servicios</span>
                      <Badge variant="outline" className={STATUS_STYLES[p.status]}>{p.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatBox({ label, value, accent }) {
  const color = accent === 'blue' ? 'text-blue-700' : accent === 'green' ? 'text-green-700' : accent === 'red' ? 'text-red-700' : 'text-slate-700';
  return (
    <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}