import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { parseXeroPDF } from '@/functions/parseXeroPDF';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    Upload, FileText, CheckCircle, AlertTriangle, Search,
    Loader2, RefreshCw, Trash2, X, ChevronDown, ChevronUp
} from 'lucide-react';

// Fuzzy match: normaliza texto para comparar nombres
const normalizeName = (name) => {
    return (name || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar acentos
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
};

const fuzzyMatch = (xeroName, systemName) => {
    const n1 = normalizeName(xeroName);
    const n2 = normalizeName(systemName);
    if (n1 === n2) return true;
    if (n1.includes(n2) || n2.includes(n1)) return true;
    // Match por primer apellido o primer nombre
    const words1 = n1.split(' ');
    const words2 = n2.split(' ');
    const commonWords = words1.filter(w => w.length > 2 && words2.includes(w));
    return commonWords.length >= 2;
};

export default function XeroReconciliationPanel({ clientReport, startDate, endDate }) {
    const [uploading, setUploading] = useState(false);
    const [parsing, setParsing] = useState(false);
    const [error, setError] = useState('');
    const [savedReconciliations, setSavedReconciliations] = useState([]);
    const [selectedReconciliation, setSelectedReconciliation] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterMode, setFilterMode] = useState('all'); // 'all' | 'discrepancy' | 'ok' | 'xero_only' | 'system_only'
    const [expandedRows, setExpandedRows] = useState({});

    const periodMonth = startDate ? format(startDate, 'yyyy-MM') : '';
    const periodLabel = startDate ? format(startDate, 'MMMM yyyy', { locale: es }) : '';

    useEffect(() => {
        loadSavedReconciliations();
    }, [periodMonth]);

    const loadSavedReconciliations = async () => {
        if (!periodMonth) return;
        try {
            const records = await base44.entities.XeroReconciliation.filter({ period_month: periodMonth }, '-created_date');
            setSavedReconciliations(Array.isArray(records) ? records : []);
            if (records && records.length > 0) {
                setSelectedReconciliation(records[0]);
            } else {
                setSelectedReconciliation(null);
            }
        } catch (e) {
            console.error('Error cargando reconciliaciones:', e);
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.type !== 'application/pdf') {
            setError('Solo se aceptan archivos PDF');
            return;
        }

        setUploading(true);
        setError('');
        try {
            const { file_url } = await base44.integrations.Core.UploadFile({ file });
            setUploading(false);
            setParsing(true);

            const response = await parseXeroPDF({ fileUrl: file_url, periodLabel });
            const { data } = response;

            if (!data?.success || !data?.data?.contacts) {
                throw new Error('No se pudo extraer datos del PDF');
            }

            const contacts = data.data.contacts;
            const totalCredit = contacts.reduce((sum, c) => sum + (c.credit || 0), 0);
            const totalGross = contacts.reduce((sum, c) => sum + (c.gross || 0), 0);

            // Guardar en base de datos
            const saved = await base44.entities.XeroReconciliation.create({
                period_label: periodLabel,
                period_month: periodMonth,
                contacts,
                total_credit: totalCredit,
                total_gross: totalGross
            });

            setSavedReconciliations(prev => [saved, ...prev]);
            setSelectedReconciliation(saved);
        } catch (err) {
            setError(err.message || 'Error procesando el PDF');
        } finally {
            setUploading(false);
            setParsing(false);
        }
    };

    const handleDelete = async (id) => {
        try {
            await base44.entities.XeroReconciliation.delete(id);
            setSavedReconciliations(prev => prev.filter(r => r.id !== id));
            if (selectedReconciliation?.id === id) {
                setSelectedReconciliation(null);
            }
        } catch (e) {
            setError('Error eliminando el reporte');
        }
    };

    // Cruzar datos de Xero con datos del sistema
    const comparisonData = useMemo(() => {
        if (!selectedReconciliation || !clientReport) return [];

        const xeroContacts = selectedReconciliation.contacts || [];
        const result = [];

        // 1. Recorrer clientes del sistema y buscar match en Xero
        const matchedXeroContacts = new Set();

        clientReport.forEach(client => {
            const xeroMatch = xeroContacts.find(xc => fuzzyMatch(xc.contact, client.clientName));
            const systemBase = client.baseAmount || 0;
            const xeroCredit = xeroMatch ? xeroMatch.credit : null;
            const diff = xeroCredit !== null ? xeroCredit - systemBase : null;
            const hasDiff = diff !== null && Math.abs(diff) > 0.5;

            if (xeroMatch) matchedXeroContacts.add(xeroMatch.contact);

            result.push({
                type: xeroMatch ? 'matched' : 'system_only',
                clientName: client.clientName,
                systemBase,
                xeroCredit,
                xeroGross: xeroMatch?.gross || null,
                diff,
                hasDiff,
                services: client.services?.length || 0
            });
        });

        // 2. Clientes en Xero que no están en el sistema
        xeroContacts.forEach(xc => {
            if (!matchedXeroContacts.has(xc.contact)) {
                result.push({
                    type: 'xero_only',
                    clientName: xc.contact,
                    systemBase: null,
                    xeroCredit: xc.credit,
                    xeroGross: xc.gross,
                    diff: null,
                    hasDiff: false,
                    services: 0
                });
            }
        });

        return result.sort((a, b) => {
            // Primero discrepancias, luego system_only, luego xero_only, luego OK
            const score = (r) => {
                if (r.hasDiff) return 0;
                if (r.type === 'system_only') return 1;
                if (r.type === 'xero_only') return 2;
                return 3;
            };
            return score(a) - score(b) || a.clientName.localeCompare(b.clientName);
        });
    }, [selectedReconciliation, clientReport]);

    const filteredData = useMemo(() => {
        let data = comparisonData;
        if (searchTerm) {
            data = data.filter(r => r.clientName.toLowerCase().includes(searchTerm.toLowerCase()));
        }
        if (filterMode === 'discrepancy') data = data.filter(r => r.hasDiff);
        else if (filterMode === 'ok') data = data.filter(r => r.type === 'matched' && !r.hasDiff);
        else if (filterMode === 'xero_only') data = data.filter(r => r.type === 'xero_only');
        else if (filterMode === 'system_only') data = data.filter(r => r.type === 'system_only');
        return data;
    }, [comparisonData, searchTerm, filterMode]);

    const summary = useMemo(() => {
        const discrepancies = comparisonData.filter(r => r.hasDiff).length;
        const systemOnly = comparisonData.filter(r => r.type === 'system_only').length;
        const xeroOnly = comparisonData.filter(r => r.type === 'xero_only').length;
        const ok = comparisonData.filter(r => r.type === 'matched' && !r.hasDiff).length;
        return { discrepancies, systemOnly, xeroOnly, ok };
    }, [comparisonData]);

    const isLoading = uploading || parsing;

    return (
        <div className="space-y-4">
            {/* Header con upload */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                            <FileText className="w-5 h-5 text-blue-600" />
                            Conciliación con Xero
                        </h3>
                        <p className="text-sm text-slate-500 mt-0.5">
                            Sube el PDF de Xero "Sales Transactions" para comparar con el sistema
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {savedReconciliations.length > 0 && (
                            <span className="text-xs text-slate-500">
                                {savedReconciliations.length} reporte{savedReconciliations.length > 1 ? 's' : ''} guardado{savedReconciliations.length > 1 ? 's' : ''}
                            </span>
                        )}
                        <label className={`cursor-pointer ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
                            <input type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} disabled={isLoading} />
                            <div className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors">
                                {isLoading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Upload className="w-4 h-4" />
                                )}
                                {uploading ? 'Subiendo PDF...' : parsing ? 'Procesando con IA...' : 'Subir PDF de Xero'}
                            </div>
                        </label>
                    </div>
                </div>

                {parsing && (
                    <Alert className="mt-3 bg-blue-50 border-blue-200">
                        <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
                        <AlertDescription className="text-blue-800">
                            La IA está extrayendo los datos del PDF... esto puede tomar 20-30 segundos.
                        </AlertDescription>
                    </Alert>
                )}

                {error && (
                    <Alert variant="destructive" className="mt-3">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}
            </div>

            {/* Selector de reportes guardados */}
            {savedReconciliations.length > 1 && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                    <p className="text-sm font-semibold text-slate-700 mb-2">Reportes guardados para {periodLabel}:</p>
                    <div className="flex flex-wrap gap-2">
                        {savedReconciliations.map(rec => (
                            <div key={rec.id} className="flex items-center gap-1">
                                <button
                                    onClick={() => setSelectedReconciliation(rec)}
                                    className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                                        selectedReconciliation?.id === rec.id
                                            ? 'bg-blue-600 text-white border-blue-600'
                                            : 'bg-white text-slate-700 border-slate-300 hover:border-blue-400'
                                    }`}
                                >
                                    {format(new Date(rec.created_date), 'dd/MM HH:mm')} • {rec.contacts?.length} contactos
                                </button>
                                <button onClick={() => handleDelete(rec.id)} className="text-slate-400 hover:text-red-500 p-1">
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Tabla de comparación */}
            {selectedReconciliation && (
                <>
                    {/* Resumen */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <button onClick={() => setFilterMode(filterMode === 'discrepancy' ? 'all' : 'discrepancy')}
                            className={`rounded-xl border p-3 text-left transition-all ${filterMode === 'discrepancy' ? 'ring-2 ring-orange-500' : ''}`}
                            style={{ background: '#fff7ed', borderColor: '#fed7aa' }}>
                            <p className="text-xs font-semibold text-orange-700 uppercase">Discrepancias</p>
                            <p className="text-3xl font-bold text-orange-900 mt-1">{summary.discrepancies}</p>
                        </button>
                        <button onClick={() => setFilterMode(filterMode === 'system_only' ? 'all' : 'system_only')}
                            className={`rounded-xl border p-3 text-left transition-all ${filterMode === 'system_only' ? 'ring-2 ring-purple-500' : ''}`}
                            style={{ background: '#faf5ff', borderColor: '#e9d5ff' }}>
                            <p className="text-xs font-semibold text-purple-700 uppercase">Solo en Sistema</p>
                            <p className="text-3xl font-bold text-purple-900 mt-1">{summary.systemOnly}</p>
                        </button>
                        <button onClick={() => setFilterMode(filterMode === 'xero_only' ? 'all' : 'xero_only')}
                            className={`rounded-xl border p-3 text-left transition-all ${filterMode === 'xero_only' ? 'ring-2 ring-red-500' : ''}`}
                            style={{ background: '#fff1f2', borderColor: '#fecdd3' }}>
                            <p className="text-xs font-semibold text-red-700 uppercase">Solo en Xero</p>
                            <p className="text-3xl font-bold text-red-900 mt-1">{summary.xeroOnly}</p>
                        </button>
                        <button onClick={() => setFilterMode(filterMode === 'ok' ? 'all' : 'ok')}
                            className={`rounded-xl border p-3 text-left transition-all ${filterMode === 'ok' ? 'ring-2 ring-green-500' : ''}`}
                            style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
                            <p className="text-xs font-semibold text-green-700 uppercase">Coinciden</p>
                            <p className="text-3xl font-bold text-green-900 mt-1">{summary.ok}</p>
                        </button>
                    </div>

                    {/* Filtro de búsqueda */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
                        <div className="flex items-center gap-3">
                            <div className="relative flex-1 max-w-sm">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input placeholder="Buscar cliente..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
                            </div>
                            {filterMode !== 'all' && (
                                <button onClick={() => setFilterMode('all')} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
                                    <X className="w-3 h-3" /> Limpiar filtro
                                </button>
                            )}
                            <span className="text-xs text-slate-500 ml-auto">
                                {filteredData.length} de {comparisonData.length} clientes
                            </span>
                        </div>
                    </div>

                    {/* Tabla */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <Table>
                            <TableHeader className="bg-slate-50">
                                <TableRow>
                                    <TableHead className="font-bold text-slate-700">Cliente</TableHead>
                                    <TableHead className="font-bold text-slate-700">Estado</TableHead>
                                    <TableHead className="text-right font-bold text-slate-700">Sistema (base sin GST)</TableHead>
                                    <TableHead className="text-right font-bold text-slate-700">Xero (credit)</TableHead>
                                    <TableHead className="text-right font-bold text-slate-700">Diferencia</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredData.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-10 text-slate-500">
                                            No hay clientes con este filtro
                                        </TableCell>
                                    </TableRow>
                                ) : filteredData.map((row, i) => (
                                    <TableRow key={i} className={
                                        row.hasDiff ? 'bg-orange-50 hover:bg-orange-100' :
                                        row.type === 'system_only' ? 'bg-purple-50 hover:bg-purple-100' :
                                        row.type === 'xero_only' ? 'bg-red-50 hover:bg-red-100' :
                                        'hover:bg-slate-50'
                                    }>
                                        <TableCell className="font-semibold text-slate-900">{row.clientName}</TableCell>
                                        <TableCell>
                                            {row.hasDiff && <Badge className="bg-orange-500 text-white">Discrepancia</Badge>}
                                            {row.type === 'system_only' && <Badge className="bg-purple-500 text-white">Solo en Sistema</Badge>}
                                            {row.type === 'xero_only' && <Badge className="bg-red-500 text-white">Solo en Xero</Badge>}
                                            {row.type === 'matched' && !row.hasDiff && <Badge className="bg-green-500 text-white">✓ OK</Badge>}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-sm">
                                            {row.systemBase !== null ? `$${row.systemBase.toFixed(2)}` : <span className="text-slate-400">—</span>}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-sm">
                                            {row.xeroCredit !== null ? `$${row.xeroCredit.toFixed(2)}` : <span className="text-slate-400">—</span>}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-sm font-bold">
                                            {row.diff !== null ? (
                                                <span className={row.diff > 0 ? 'text-green-700' : row.diff < 0 ? 'text-red-700' : 'text-slate-500'}>
                                                    {row.diff > 0 ? '+' : ''}{row.diff.toFixed(2)}
                                                </span>
                                            ) : <span className="text-slate-400">—</span>}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </>
            )}

            {!selectedReconciliation && !isLoading && (
                <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center">
                    <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">Sube el PDF de Xero para ver la comparación</p>
                    <p className="text-slate-400 text-sm mt-1">El sistema extraerá los montos automáticamente y los comparará con los datos del sistema</p>
                </div>
            )}
        </div>
    );
}