
import React, { useState, useEffect, useMemo } from "react";
import { User } from "@/entities/User";
import { WorkEntry } from "@/entities/WorkEntry";
import { Client } from "@/entities/Client";
import { Invoice } from "@/entities/Invoice";
import { Reconciliation } from "@/entities/Reconciliation"; // Added import
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { UploadFile, ExtractDataFromUploadedFile, InvokeLLM } from "@/integrations/Core";
import { FileSpreadsheet, Upload, CheckCircle, AlertTriangle, X, Download, Users, Briefcase, Loader2, Sparkles, BrainCircuit, ChevronDown, Eye, AlertCircle, Target, History, Trash2 } from "lucide-react"; // Added Trash2 icon
import { format } from "date-fns";
import { es } from "date-fns/locale";
import PeriodSelector from "../components/reports/PeriodSelector";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea"; // Added import
import { Input } from "@/components/ui/input"; // Added import

export default function ConciliacionHorasPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [workEntries, setWorkEntries] = useState([]);
  const [cleaners, setCleaners] = useState([]);
  const [clients, setClients] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [comparisonResults, setComparisonResults] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reviewMode, setReviewMode] = useState('period');

  // --- NUEVO ESTADO PARA EL FLUJO AI-FIRST REDISEÑADO ---
  const [matchingStep, setMatchingStep] = useState('idle'); // idle, ai_processing, id_review, reconciliation
  const [pastedData, setPastedData] = useState('');
  const [aiParsedData, setAiParsedData] = useState(null); // Datos estructurados con IDs devueltos por la IA
  const [editableAiParsedData, setEditableAiParsedData] = useState(null); // Datos que el usuario puede editar
  const [systemHoursMap, setSystemHoursMap] = useState(null); // Map<clientId, totalHours> (for the fixed cleaner or all cleaners in period)
  const [editableResults, setEditableResults] = useState(null);
  const [relevantClients, setRelevantClients] = useState([]); // <-- NUEVO ESTADO

  // --- NUEVOS ESTADOS PARA HISTORIAL Y VISTAS ---
  const [view, setView] = useState('reconciliation'); // 'reconciliation' | 'history'
  const [pastReconciliations, setPastReconciliations] = useState([]);
  const [selectedPastReconciliation, setSelectedPastReconciliation] = useState(null);


  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const userData = await User.me();
      setUser(userData);
      
      if (userData.role === 'admin') {
        const [entriesResult, cleanersResult, clientsResult, invoicesResult, reconciliationsResult] = await Promise.allSettled([
          WorkEntry.list("-work_date"),
          User.list(),
          Client.list(),
          Invoice.list("-created_date"),
          Reconciliation.list("-created_date") // Fetch past reconciliations
        ]);
        
        const entries = entriesResult.status === 'fulfilled' ? entriesResult.value : [];
        const allUsers = cleanersResult.status === 'fulfilled' ? cleanersResult.value : [];
        const clientsList = clientsResult.status === 'fulfilled' ? clientsResult.value : [];
        const invoicesList = invoicesResult.status === 'fulfilled' ? invoicesResult.value : [];
        const pastRecs = reconciliationsResult.status === 'fulfilled' ? reconciliationsResult.value : []; // Get past reconciliations
        
        const cleanerUsers = allUsers.filter(u => u.role !== 'admin');
        setCleaners(cleanerUsers);
        setClients(clientsList);
        setInvoices(invoicesList);
        setPastReconciliations(pastRecs); // Set past reconciliations
        
        const entriesWithInfo = entries.map(entry => {
          const cleaner = cleanerUsers.find(c => c.id === entry.cleaner_id);
          const client = clientsList.find(c => c.id === entry.client_id);
          return {
            ...entry,
            cleaner_name: cleaner ? (cleaner.invoice_name || cleaner.full_name) : 'Desconocido',
            client_name: entry.client_name || (client ? client.name : 'Desconocido')
          };
        });
        
        setWorkEntries(entriesWithInfo);
      }
    } catch (error) {
      console.error("Error loading data:", error);
      setError("Error al cargar los datos. Por favor, recarga la página.");
    }
    setLoading(false);
  };

  // --- FUNCIÓN DE PROCESAMIENTO CON IA MEJORADA Y ENFOCADA ---
  const handleAiProcessing = async () => {
    if (!pastedData.trim()) {
      setError("Por favor, pega los datos en el cuadro de texto antes de procesar.");
      return;
    }

    if (reviewMode === 'individual' && !selectedInvoice) {
      setError("Por favor, selecciona un invoice antes de procesar.");
      return;
    }
    
    if (reviewMode === 'period' && !selectedPeriod) {
        setError("Por favor, selecciona un período antes de procesar.");
        return;
    }

    setMatchingStep('ai_processing');
    setError("");
    setSuccess("");

    // --- LÓGICA MEJORADA PARA OBTENER CLIENTES RELEVANTES Y CLEANER DE CONTEXTO ---
    let relevantClientsWithIds = [];
    let invoiceCleanerId = null; // The fixed cleaner ID for 'individual' mode
    let invoiceCleanerName = 'N/A'; // The fixed cleaner name for 'individual' mode

    if (reviewMode === 'individual' && selectedInvoice) {
        const invoice = invoices.find(inv => inv.id === selectedInvoice);
        if (invoice) {
            invoiceCleanerId = invoice.cleaner_id;
            const cleaner = cleaners.find(c => c.id === invoiceCleanerId);
            invoiceCleanerName = cleaner ? (cleaner.invoice_name || cleaner.full_name) : 'Desconocido';

            const clientIdsInInvoice = new Set();
            const invoiceWorkEntries = workEntries.filter(entry => invoice.work_entries.includes(entry.id));
            invoiceWorkEntries.forEach(entry => clientIdsInInvoice.add(entry.client_id));
            
            relevantClientsWithIds = clients
                .filter(client => clientIdsInInvoice.has(client.id))
                .map(c => ({ id: c.id, name: c.name, address: c.address }));
        }
    } else { // Fallback para modo período, usa todos los clientes
        relevantClientsWithIds = clients.map(c => ({ id: c.id, name: c.name, address: c.address }));
    }

    setRelevantClients(relevantClientsWithIds); // <-- GUARDAR CLIENTES RELEVANTES EN EL ESTADO

    const prompt = `
      You are a specialized data parsing assistant for a cleaning company.
      Your task is to parse raw text data listing work done for various clients and match those clients to their exact IDs.

      The context is for a SINGLE cleaner's invoice, so you DO NOT need to identify the cleaner. Focus ONLY on the CLIENT and HOURS.

      Here is the raw data from ZenMaid:
      --- RAW DATA ---
      ${pastedData}
      --- END RAW DATA ---

      Here is the specific list of clients associated with this invoice. You MUST match against this list:
      ${JSON.stringify(relevantClientsWithIds, null, 2)}

      Your instructions:
      1. Ignore any header line in the raw data.
      2. For each data line, extract the client name and the hours worked. Hours must be a number (e.g., 1.75, 2.50, 8.0). No text like 'h' or 'hours'.
      3. For each extracted client name, find the best match from the provided client list and return the client's exact ID.
      4. If you cannot find a confident match in the list, you MUST return "NO_ID_MATCH".
      5. Return ONLY a JSON object with the specified structure. Do not include cleaners.
    `;

    const schema = {
      type: "object",
      properties: {
        entries: {
          type: "array",
          description: "List of all parsed work entries with matched client IDs.",
          items: {
            type: "object",
            properties: {
              raw_client_name: { type: "string", description: "The client name as it appeared in the raw data" },
              zenmaid_hours: { type: "number", description: "The number of hours from ZenMaid data" },
              matched_client_id: { type: "string", description: "The exact client ID from the system, or 'NO_ID_MATCH'" }
            },
            required: ["raw_client_name", "zenmaid_hours", "matched_client_id"]
          }
        }
      },
      required: ["entries"]
    };

    try {
      const result = await InvokeLLM({ prompt, response_json_schema: schema });
      if (!result || !result.entries || result.entries.length === 0) {
        throw new Error("La IA no pudo procesar los datos. Revisa que el formato sea reconocible.");
      }
      
      // Inject cleaner info into each AI-parsed entry as the AI doesn't return it
      const aiParsedResult = result.entries.map(entry => ({
          ...entry,
          matched_cleaner_id: invoiceCleanerId,
          raw_cleaner_name: invoiceCleanerName
      }));

      // Calculate system hours using relevant entries, keyed by client_id
      let entriesForSystemHoursMap = [];
      if (reviewMode === 'individual' && selectedInvoice && invoiceCleanerId) {
        const invoice = invoices.find(inv => inv.id === selectedInvoice);
        entriesForSystemHoursMap = workEntries.filter(entry => 
            invoice.work_entries.includes(entry.id) && entry.cleaner_id === invoiceCleanerId
        );
      } else if (reviewMode === 'period' && selectedPeriod) {
         entriesForSystemHoursMap = workEntries.filter(entry => {
          const workDate = new Date(entry.work_date);
          return workDate >= selectedPeriod.start && workDate <= selectedPeriod.end;
        });
      }
      
      // Create map of system hours per client_id (for the relevant cleaner/period)
      const newSystemHoursMap = new Map(); // Map<clientId, totalHours>
      entriesForSystemHoursMap.forEach(entry => {
        const key = entry.client_id;
        const currentHours = newSystemHoursMap.get(key) || 0;
        newSystemHoursMap.set(key, currentHours + (entry.hours || 0));
      });
      setSystemHoursMap(newSystemHoursMap);
      
      // Ordenar entradas: NO_ID_MATCH primero para clientes
      const sortedEntries = aiParsedResult.sort((a, b) => {
        const scoreA = (a.matched_client_id === 'NO_ID_MATCH') ? 0 : 1;
        const scoreB = (b.matched_client_id === 'NO_ID_MATCH') ? 0 : 1;
        return scoreA - scoreB;
      });

      setAiParsedData(sortedEntries);
      setEditableAiParsedData(JSON.parse(JSON.stringify(sortedEntries)));
      setMatchingStep('id_review');
    } catch (err) {
      console.error("AI Processing Error:", err);
      setError(`Error de la IA: ${err.message}. Por favor, verifica el formato de los datos.`);
      setMatchingStep('idle');
    }
  };

  // --- FUNCIÓN PARA MANEJAR CAMBIOS EN LA REVISIÓN DE IDs ---
  const handleIdReviewChange = (index, field, newValue) => {
    const updatedData = [...editableAiParsedData];
    updatedData[index][field] = newValue;
    setEditableAiParsedData(updatedData);
  };
  
  // --- FUNCIÓN PARA PROCESAR LOS IDs CONFIRMADOS ---
  const processConfirmedIds = () => {
    setError("");
    setSuccess("");

    if (!editableAiParsedData) {
      setError("No hay datos revisados para procesar.");
      return;
    }
    
    // Agrupar por cleaner_id y client_id (even if cleaner_id is fixed/null)
    const zenmaidTotals = new Map(); // Key: `${cleanerId}|${clientId}`
    const systemTotals = new Map(); // Key: `${cleanerId}|${clientId}`
    
    editableAiParsedData.forEach((item) => {
      // item.matched_cleaner_id will be fixed by handleAiProcessing, even if null for period mode.
      const cleanerId = item.matched_cleaner_id;
      const clientId = item.matched_client_id;
      const hours = parseFloat(item.zenmaid_hours) || 0;

      // Only process if client ID is valid and hours > 0
      if (clientId && clientId !== "NO_ID_MATCH" && hours > 0) {
        // Use a placeholder for cleanerId if it's null (e.g., in period mode with client-only AI)
        const key = `${cleanerId || 'N/A_CLEANER'}|${clientId}`;
        
        // Sum hours from pasted ZenMaid data
        const currentZenmaidHours = zenmaidTotals.get(key) || 0;
        zenmaidTotals.set(key, currentZenmaidHours + hours);
        
        // Get system hours (from systemHoursMap which is Map<clientId, totalHours>)
        const systemHoursForClient = systemHoursMap.get(clientId) || 0;
        systemTotals.set(key, systemHoursForClient);
      }
    });

    // Create comparisons
    const comparisons = [];
    const allKeys = new Set([...zenmaidTotals.keys(), ...systemTotals.keys()]);
    
    allKeys.forEach(key => {
      const [cleanerIdFromKey, clientIdFromKey] = key.split('|');
      const cleaner = cleaners.find(c => c.id === cleanerIdFromKey);
      const client = clients.find(c => c.id === clientIdFromKey);
      
      // Only include if client is found. Cleaner might be null/N/A for period mode.
      if (client) {
        const zenmaidHours = zenmaidTotals.get(key) || 0;
        const systemHours = systemTotals.get(key) || 0;
        const difference = systemHours - zenmaidHours;
        
        comparisons.push({
          cleaner_id: cleanerIdFromKey === 'N/A_CLEANER' ? null : cleanerIdFromKey,
          cleaner_name: cleanerIdFromKey === 'N/A_CLEANER' ? 'Todos los limpiadores (período)' : (cleaner ? (cleaner.invoice_name || cleaner.full_name) : 'Desconocido'),
          client_id: clientIdFromKey,
          client_name: client.name,
          zenmaid_hours: zenmaidHours,
          system_hours: systemHours,
          difference: difference,
          status: Math.abs(difference) < 0.01 ? 'match' : (difference > 0 ? 'system_higher' : 'zenmaid_higher'),
          notes: '' // Add notes field for editing
        });
      }
    });

    // Ordenar por diferencia absoluta (mayor diferencia primero)
    comparisons.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));

    const results = {
      comparisons: comparisons,
      totalZenmaidHours: Array.from(zenmaidTotals.values()).reduce((sum, h) => sum + h, 0),
      totalSystemHours: Array.from(systemTotals.values()).reduce((sum, h) => sum + h, 0),
      reviewMode: reviewMode,
      selectedInvoice: reviewMode === 'individual' && selectedInvoice ? invoices.find(inv => inv.id === selectedInvoice) : null,
      selectedPeriod: reviewMode === 'period' ? selectedPeriod : null
    };

    setComparisonResults(results);
    setEditableResults(JSON.parse(JSON.stringify(results))); // Set editable results here
    setMatchingStep('reconciliation');
    setSuccess("IDs confirmados y comparación generada. Revisa las discrepancias.");
  };

  const handleResultChange = (index, field, value) => {
    const updatedEditableResults = { ...editableResults };
    const numericValue = parseFloat(value);
    
    // Solo actualiza si el valor es un número válido o si el campo es de notas
    if (field === 'notes' || (!isNaN(numericValue) && numericValue >= 0)) { // Ensure hours are non-negative
        updatedEditableResults.comparisons[index][field] = field === 'notes' ? value : numericValue;
        
        // Recalcular diferencia para la fila
        const item = updatedEditableResults.comparisons[index];
        const newDifference = (item.system_hours || 0) - (item.zenmaid_hours || 0);
        item.difference = newDifference;
        item.status = Math.abs(newDifference) < 0.01 ? 'match' : (newDifference > 0 ? 'system_higher' : 'zenmaid_higher');

        setEditableResults(updatedEditableResults);
    } else if (value === '') { // Permite borrar el campo y que quede vacío o 0
        updatedEditableResults.comparisons[index][field] = (field === 'notes' ? '' : 0);
        setEditableResults(updatedEditableResults);
    }
  };

  const handleDeleteResultRow = (indexToDelete) => {
    const updatedEditableResults = { ...editableResults };
    updatedEditableResults.comparisons = updatedEditableResults.comparisons.filter((_, index) => index !== indexToDelete);
    setEditableResults(updatedEditableResults);
  };

  const handleSaveReconciliation = async () => {
    if (!editableResults) {
        setError("No hay resultados de conciliación para guardar.");
        return;
    }
    setLoading(true);
    setError("");
    setSuccess("");

    try {
        let reconciliationRecord = {};

        if (reviewMode === 'individual' && selectedInvoice) {
            const invoice = invoices.find(inv => inv.id === selectedInvoice);
            if (!invoice) {
                throw new Error("No se pudo encontrar el invoice asociado.");
            }
            reconciliationRecord = {
                cleaner_id: invoice.cleaner_id,
                invoice_id: selectedInvoice,
                period_start: invoice.period_start,
                period_end: invoice.period_end,
                status: 'completed',
                pasted_data: pastedData,
                reconciliation_data: editableResults,
                summary: finalTotals,
            };
        } else if (reviewMode === 'period' && selectedPeriod) {
            reconciliationRecord = {
                // For period mode, cleaner_id and invoice_id might be null or a generic ID if applicable
                cleaner_id: null, // Or a specific ID if the period is for one cleaner
                invoice_id: null,
                period_start: selectedPeriod.start.toISOString(),
                period_end: selectedPeriod.end.toISOString(),
                status: 'completed',
                pasted_data: pastedData,
                reconciliation_data: editableResults,
                summary: finalTotals,
            };
        } else {
            throw new Error("Modo de revisión o selección de período/invoice inválido para guardar.");
        }
        
        await Reconciliation.create(reconciliationRecord);
        setSuccess("¡Conciliación guardada exitosamente! Puedes verla en el historial.");
        setTimeout(() => {
            resetComparison();
            loadData(); // Recargar datos para incluir la nueva conciliación en el historial
        }, 2000);

    } catch (err) {
        console.error("Error saving reconciliation:", err);
        setError(`Error al guardar la conciliación: ${err.message}`);
    } finally {
        setLoading(false);
    }
  };


  const resetComparison = () => {
    setComparisonResults(null);
    setEditableResults(null);
    setError("");
    setSuccess("");
    setMatchingStep('idle');
    setPastedData('');
    setAiParsedData(null);
    setEditableAiParsedData(null);
    setSystemHoursMap(null);
    setSelectedPeriod(null);
    setSelectedInvoice(null);
    setSelectedPastReconciliation(null); // Reset selected past reconciliation
    setView('reconciliation'); // Go back to reconciliation view
    setRelevantClients([]); // Reset relevant clients
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'match':
        return <Badge className="bg-green-100 text-green-800">✓ Coincide</Badge>;
      case 'system_higher':
        return <Badge className="bg-blue-100 text-blue-800">↑ Sistema Mayor</Badge>;
      case 'zenmaid_higher':
        return <Badge className="bg-orange-100 text-orange-800">↓ ZenMaid Mayor</Badge>;
      default:
        return <Badge variant="secondary">Desconocido</Badge>;
    }
  };

  // Get invoices pending review
  const pendingInvoices = invoices.filter(inv => inv.status === 'submitted');

  const finalTotals = useMemo(() => {
    if (!editableResults || !editableResults.comparisons) return { totalSystemHours: 0, totalZenmaidHours: 0, totalDifference: 0 };
    
    const totalSystemHours = editableResults.comparisons.reduce((sum, item) => sum + (item.system_hours || 0), 0);
    const totalZenmaidHours = editableResults.comparisons.reduce((sum, item) => sum + (item.zenmaid_hours || 0), 0);
    const totalDifference = totalSystemHours - totalZenmaidHours;

    return { totalSystemHours, totalZenmaidHours, totalDifference };
  }, [editableResults]);


  if (loading) return (
    <div className="p-8 flex justify-center items-center">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600 mr-3" />
      Cargando...
    </div>
  );
  
  if (user?.role !== 'admin') return <div className="p-8">Acceso denegado.</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header Section */}
        <div className="flex justify-between items-start">
            <div className="text-left mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl mb-4">
                    <Target className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-4xl font-bold text-slate-900 mb-2">
                    Conciliación Inteligente de Horas v2.1
                </h1>
                <p className="text-xl text-slate-600 max-w-3xl mx-auto">
                    Sistema rediseñado para ser editable, permitir notas y guardar un historial de auditoría.
                </p>
            </div>
            <Button variant="outline" onClick={() => setView(view === 'history' ? 'reconciliation' : 'history')}>
                <History className="w-4 h-4 mr-2" />
                {view === 'history' ? 'Ir a Nueva Conciliación' : 'Ver Historial'}
            </Button>
        </div>
        
        {view === 'history' ? (
            <Card className="shadow-xl border-0">
                <CardHeader>
                    <CardTitle>Historial de Conciliaciones</CardTitle>
                </CardHeader>
                <CardContent>
                    {selectedPastReconciliation ? (
                        <div>
                            <Button onClick={() => setSelectedPastReconciliation(null)} className="mb-4">← Volver al Historial</Button>
                            <h3 className="text-lg font-bold">Detalle de Conciliación</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4">
                                <div>
                                    <p className="font-semibold">Fecha de Conciliación:</p>
                                    <p>{format(new Date(selectedPastReconciliation.created_date), 'dd/MM/yyyy HH:mm')}</p>
                                </div>
                                {selectedPastReconciliation.cleaner_id && (
                                    <div>
                                        <p className="font-semibold">Limpiador:</p>
                                        <p>{cleaners.find(c => c.id === selectedPastReconciliation.cleaner_id)?.full_name || 'Desconocido'}</p>
                                    </div>
                                )}
                                {selectedPastReconciliation.invoice_id && (
                                    <div>
                                        <p className="font-semibold">Invoice:</p>
                                        <p>{invoices.find(i => i.id === selectedPastReconciliation.invoice_id)?.invoice_number || 'N/A'}</p>
                                    </div>
                                )}
                                <div>
                                    <p className="font-semibold">Período:</p>
                                    <p>{format(new Date(selectedPastReconciliation.period_start), 'd MMM')} - {format(new Date(selectedPastReconciliation.period_end), 'd MMM yyyy')}</p>
                                </div>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-lg my-4">
                                <h4 className="font-bold mb-2">Resumen:</h4>
                                <p>Total Horas Sistema: <span className="font-semibold">{selectedPastReconciliation.summary.totalSystemHours.toFixed(2)}</span></p>
                                <p>Total Horas ZenMaid: <span className="font-semibold">{selectedPastReconciliation.summary.totalZenmaidHours.toFixed(2)}</span></p>
                                <p>Diferencia Total: <span className="font-semibold">{selectedPastReconciliation.summary.totalDifference.toFixed(2)}</span></p>
                            </div>

                            <h4 className="font-bold mb-2">Comparación Detallada:</h4>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-slate-50">
                                            <TableHead className="font-semibold">Limpiador</TableHead>
                                            <TableHead className="font-semibold">Cliente</TableHead>
                                            <TableHead className="font-semibold text-center">Horas Sistema</TableHead>
                                            <TableHead className="font-semibold text-center">Horas ZenMaid</TableHead>
                                            <TableHead className="font-semibold text-center">Diferencia</TableHead>
                                            <TableHead className="font-semibold">Notas</TableHead>
                                            <TableHead className="font-semibold">Estado</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {selectedPastReconciliation.reconciliation_data.comparisons.map((comp, index) => (
                                            <TableRow key={index} className={Math.abs(comp.difference) > 0.01 ? 'bg-yellow-50' : ''}>
                                                <TableCell className="font-medium text-base">{comp.cleaner_name}</TableCell>
                                                <TableCell className="font-medium text-base">{comp.client_name}</TableCell>
                                                <TableCell className="text-center font-bold text-base text-blue-700">{comp.system_hours.toFixed(2)}</TableCell>
                                                <TableCell className="text-center font-bold text-base text-green-700">{comp.zenmaid_hours.toFixed(2)}</TableCell>
                                                <TableCell className={`font-semibold text-center text-base ${
                                                    comp.difference > 0.01 ? "text-blue-600" : 
                                                    comp.difference < -0.01 ? "text-orange-600" : "text-green-600"
                                                }`}>
                                                    {comp.difference > 0 ? '+' : ''}{comp.difference.toFixed(2)}h
                                                </TableCell>
                                                <TableCell className="text-sm italic">{comp.notes || 'N/A'}</TableCell>
                                                <TableCell>{getStatusBadge(comp.status)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Limpiador</TableHead>
                                    <TableHead>Período</TableHead>
                                    <TableHead>Horas Sistema</TableHead>
                                    <TableHead>Horas ZenMaid</TableHead>
                                    <TableHead>Diferencia</TableHead>
                                    <TableHead>Acción</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {pastReconciliations.map(rec => {
                                    const cleaner = cleaners.find(c => c.id === rec.cleaner_id);
                                    return (
                                    <TableRow key={rec.id}>
                                        <TableCell>{format(new Date(rec.created_date), 'd MMM yyyy, HH:mm')}</TableCell>
                                        <TableCell>{cleaner?.full_name || 'N/A'}</TableCell>
                                        <TableCell>
                                            {rec.period_start && rec.period_end ? 
                                                `${format(new Date(rec.period_start), 'd MMM')} - ${format(new Date(rec.period_end), 'd MMM yyyy')}` : 
                                                'N/A'
                                            }
                                        </TableCell>
                                        <TableCell className="font-semibold text-blue-700">{rec.summary?.totalSystemHours?.toFixed(2) || '0.00'}</TableCell>
                                        <TableCell className="font-semibold text-green-700">{rec.summary?.totalZenmaidHours?.toFixed(2) || '0.00'}</TableCell>
                                        <TableCell className={`font-semibold ${
                                            Math.abs(rec.summary?.totalDifference || 0) < 0.01 ? "text-green-600" : "text-red-600"
                                        }`}>{rec.summary?.totalDifference?.toFixed(2) || '0.00'}</TableCell>
                                        <TableCell><Button variant="secondary" onClick={() => setSelectedPastReconciliation(rec)}>Ver Detalle</Button></TableCell>
                                    </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        ) : (
            <>
                {/* Review Mode Selector */}
                <Card className="shadow-lg border-0 bg-gradient-to-r from-blue-50 to-purple-50">
                <CardContent className="p-6">
                    <div className="flex items-center gap-4 mb-4">
                    <h3 className="text-lg font-semibold text-slate-900">Modo de Revisión:</h3>
                    </div>
                    <div className="flex flex-col md:flex-row gap-4">
                    <Button
                        variant={reviewMode === 'period' ? 'default' : 'outline'}
                        onClick={() => {
                        setReviewMode('period');
                        setSelectedInvoice(null);
                        setComparisonResults(null);
                        setEditableResults(null);
                        }}
                        className="flex items-center gap-2"
                    >
                        <Users className="w-4 h-4" />
                        Revisar por Período
                    </Button>
                    <Button
                        variant={reviewMode === 'individual' ? 'default' : 'outline'}
                        onClick={() => {
                        setReviewMode('individual');
                        setSelectedPeriod(null);
                        setComparisonResults(null);
                        setEditableResults(null);
                        }}
                        className="flex items-center gap-2"
                    >
                        <Eye className="w-4 h-4" />
                        Revisar Invoice Individual
                    </Button>
                    </div>
                </CardContent>
                </Card>

                {/* Period/Invoice Selector */}
                <Card className="shadow-lg border-0 bg-white/70 backdrop-blur-sm">
                <CardContent className="p-6">
                    {reviewMode === 'period' && (
                    <div>
                        <div className="flex items-center gap-4 mb-4">
                        <div className="p-2 bg-blue-100 rounded-lg">
                            <Users className="w-5 h-5 text-blue-600" />
                        </div>
                        <label className="text-lg font-semibold text-slate-700">Seleccionar período para revisar:</label>
                        </div>
                        <div className="max-w-sm">
                        <PeriodSelector onPeriodChange={setSelectedPeriod} />
                        </div>
                        {selectedPeriod && (
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setSelectedPeriod(null)}
                            className="mt-3 text-slate-500 hover:text-slate-700"
                        >
                            <X className="w-4 h-4 mr-2" />
                            Limpiar período
                        </Button>
                        )}
                    </div>
                    )}

                    {reviewMode === 'individual' && (
                    <div>
                        <div className="flex items-center gap-4 mb-4">
                        <div className="p-2 bg-green-100 rounded-lg">
                            <Eye className="w-5 h-5 text-green-600" />
                        </div>
                        <label className="text-lg font-semibold text-slate-700">Seleccionar invoice para revisar:</label>
                        </div>
                        <div className="max-w-md">
                        <Select value={selectedInvoice || ""} onValueChange={setSelectedInvoice}>
                            <SelectTrigger>
                            <SelectValue placeholder="Seleccionar un invoice pendiente..." />
                            </SelectTrigger>
                            <SelectContent>
                            {pendingInvoices.length === 0 ? (
                                <SelectItem value="no-invoices" disabled>No hay invoices pendientes de revisión</SelectItem>
                            ) : (
                                pendingInvoices.map((invoice) => (
                                <SelectItem key={invoice.id} value={invoice.id}>
                                    {invoice.invoice_number} - {cleaners.find(c => c.id === invoice.cleaner_id)?.invoice_name || cleaners.find(c => c.id === invoice.cleaner_id)?.full_name || 'Desconocido'} 
                                    {invoice.period_start && invoice.period_end && (
                                    <span className="text-sm text-slate-500 ml-2">
                                        ({format(new Date(invoice.period_start), "d MMM", { locale: es })} - {format(new Date(invoice.period_end), "d MMM yyyy", { locale: es })})
                                    </span>
                                    )}
                                </SelectItem>
                                ))
                            )}
                            </SelectContent>
                        </Select>
                        </div>
                        {selectedInvoice && (
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setSelectedInvoice(null)}
                            className="mt-3 text-slate-500 hover:text-slate-700"
                        >
                            <X className="w-4 h-4 mr-2" />
                            Limpiar selección
                        </Button>
                        )}
                    </div>
                    )}
                </CardContent>
                </Card>

                {/* Progress Steps */}
                {matchingStep !== 'idle' && (
                <Card className="shadow-lg border-0 bg-gradient-to-r from-blue-50 to-purple-50">
                    <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-slate-900">Progreso del Proceso v2.0</h3>
                        <Button variant="outline" size="sm" onClick={resetComparison}>
                        <X className="w-4 h-4 mr-2" />
                        Reiniciar Proceso
                        </Button>
                    </div>
                    <div className="flex flex-col md:flex-row items-center space-y-4 md:space-y-0 md:space-x-4">
                        <div className="flex items-center space-x-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                            ['ai_processing', 'id_review', 'reconciliation'].includes(matchingStep) 
                            ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-600'
                        }`}>1</div>
                        <span className={`font-medium ${matchingStep === 'ai_processing' ? 'text-blue-600' : 'text-slate-600'}`}>
                            Identificación por IA
                        </span>
                        </div>
                        <div className="flex-1 w-full md:w-auto h-2 bg-slate-200 rounded-full">
                        <div className={`h-full rounded-full transition-all duration-300 ${
                            ['id_review', 'reconciliation'].includes(matchingStep) ? 'bg-blue-500 w-full' : 'w-0'
                        }`} />
                        </div>
                        <div className="flex items-center space-x-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                            ['id_review', 'reconciliation'].includes(matchingStep) 
                            ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-600'
                        }`}>2</div>
                        <span className={`font-medium ${matchingStep === 'id_review' ? 'text-blue-600' : 'text-slate-600'}`}>
                            Revisar IDs
                        </span>
                        </div>
                        <div className="flex-1 w-full md:w-auto h-2 bg-slate-200 rounded-full">
                        <div className={`h-full rounded-full transition-all duration-300 ${
                            matchingStep === 'reconciliation' ? 'bg-green-500 w-full' : 'w-0'
                        }`} />
                        </div>
                        <div className="flex items-center space-x-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                            matchingStep === 'reconciliation' 
                            ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-600'
                        }`}>✓</div>
                        <span className={`font-medium ${matchingStep === 'reconciliation' ? 'text-green-600' : 'text-slate-600'}`}>
                            Conciliación Final
                        </span>
                        </div>
                    </div>
                    </CardContent>
                </Card>
                )}

                {/* Error and Success Messages */}
                {error && (
                <Alert variant="destructive" className="shadow-lg">
                    <AlertTriangle className="h-5 w-5" />
                    <AlertDescription className="text-base">{error}</AlertDescription>
                </Alert>
                )}

                {success && (
                <Alert className="border-green-200 bg-green-50 shadow-lg">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <AlertDescription className="text-green-800 text-base">{success}</AlertDescription>
                </Alert>
                )}

                {/* Main Content */}
                {matchingStep === 'idle' && (
                <Card className="shadow-xl border-0">
                    <CardHeader className="bg-gradient-to-r from-slate-50 to-blue-50 border-b">
                    <CardTitle className="flex items-center gap-3 text-2xl">
                        <Target className="w-6 h-6 text-blue-600" />
                        Iniciar Conciliación v2.1 - Identificación por ID
                    </CardTitle>
                    </CardHeader>
                    <CardContent className="p-8">
                    <div className="grid md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                            <h3 className="font-bold text-blue-900 text-lg mb-4 flex items-center gap-2">
                            <Sparkles className="w-5 h-5" />
                            Mejoras en v2.1
                            </h3>
                            <ol className="space-y-3 text-blue-800">
                            <li className="flex items-start gap-3">
                                <span className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5">✓</span>
                                <span>Identificación por ID único - Elimina errores de nombres similares</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5">✓</span>
                                <span>Revisión inteligente - Solo te enfocas en casos que necesitan atención</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="bg-green-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5">✓</span>
                                <span>Comparación automática precisa - Las horas del sistema aparecen correctamente</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="bg-purple-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5">✓</span>
                                <span>Tabla editable con notas y guardado de historial</span>
                            </li>
                            </ol>
                        </div>
                        </div>

                        <div className="space-y-4">
                        <label className="block text-lg font-semibold text-slate-700 mb-2">
                            Pega tus datos de ZenMaid aquí:
                        </label>
                        <textarea
                            value={pastedData}
                            onChange={(e) => setPastedData(e.target.value)}
                            placeholder={`Cleaner	Customer	Hours worked (based on scheduled times)
Yency Rocio Moncada galvis	Frank Zindel	1.75
Yency Rocio Moncada galvis	Michelle Maspero	2.50

O cualquier formato similar...`}
                            className="w-full h-64 p-4 border-2 border-slate-300 rounded-xl font-mono text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        />
                        
                        <Button 
                            onClick={handleAiProcessing}
                            disabled={!pastedData.trim() || (!selectedPeriod && !selectedInvoice)}
                            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 h-14 text-lg font-semibold shadow-lg"
                        >
                            <Target className="mr-3 h-5 w-5" />
                            Procesar con IA v2.1 - Identificación Precisa
                        </Button>
                        </div>
                    </div>
                    </CardContent>
                </Card>
                )}

                {/* AI Processing */}
                {matchingStep === 'ai_processing' && (
                <Card className="shadow-xl border-0">
                    <CardContent className="p-12 text-center">
                    <div className="space-y-6">
                        <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full mb-4">
                        <Loader2 className="w-10 h-10 animate-spin text-white" />
                        </div>
                        <div>
                        <h3 className="2xl font-bold text-slate-800 mb-2">Identificando por IDs con IA v2.0</h3>
                        <p className="text-lg text-slate-600">
                            La IA está emparejando cada línea con los IDs exactos de limpiadores y clientes...
                        </p>
                        </div>
                        <Progress value={50} className="w-64 mx-auto animate-pulse" />
                        <p className="text-sm text-slate-500">Este proceso es más preciso y elimina errores de nombres.</p>
                    </div>
                    </CardContent>
                </Card>
                )}

                {/* ID Review Screen */}
                {matchingStep === 'id_review' && editableAiParsedData && (
                <div className="space-y-8">
                    <Card className="shadow-xl border-0 bg-gradient-to-r from-blue-50 to-purple-50">
                    <CardHeader>
                        <CardTitle className="text-2xl flex items-center gap-3">
                        <AlertCircle className="w-6 h-6 text-blue-600"/>
                        Revisar Identificación de Clientes
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-lg text-slate-700">
                        La IA ha intentado identificar los clientes. Si alguna coincidencia es incorrecta, corrígela usando el selector. Las filas con <Badge className="bg-red-100 text-red-800">NO_ID_MATCH</Badge> necesitan tu atención.
                        </p>
                        {reviewMode === 'individual' && selectedInvoice && (
                            <div className="mt-4 p-4 bg-blue-100 border border-blue-200 rounded-lg">
                                <p className="font-semibold text-blue-900">Conciliando para el limpiador: <span className="font-bold">{cleaners.find(c => c.id === invoices.find(i => i.id === selectedInvoice)?.cleaner_id)?.full_name}</span></p>
                            </div>
                        )}
                    </CardContent>
                    </Card>

                    <Card className="shadow-lg border-0">
                        <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-slate-50">
                                        <TableHead className="font-semibold">Cliente (ZenMaid)</TableHead>
                                        <TableHead className="font-semibold w-[350px]">Cliente Identificado (Sistema)</TableHead>
                                        <TableHead className="font-semibold text-center">Horas ZenMaid</TableHead>
                                        <TableHead className="font-semibold text-center">Horas Sistema (App)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {editableAiParsedData.map((item, index) => {
                                        const clientIdMissing = item.matched_client_id === 'NO_ID_MATCH';
                                        
                                        const systemHours = !clientIdMissing 
                                        ? (systemHoursMap?.get(item.matched_client_id) || 0) 
                                        : 0;
                                        
                                        return (
                                        <TableRow 
                                            key={index}
                                            className={clientIdMissing ? 'bg-red-50 border-red-200' : 'hover:bg-slate-50'}
                                        >
                                            <TableCell className="font-medium">{item.raw_client_name}</TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-2">
                                                    {clientIdMissing && <Badge variant="destructive" className="w-fit">Necesita Selección</Badge>}
                                                    <Select
                                                        value={item.matched_client_id}
                                                        onValueChange={(value) => handleIdReviewChange(index, 'matched_client_id', value)}
                                                    >
                                                        <SelectTrigger className="w-full">
                                                            <SelectValue placeholder="Seleccionar cliente correcto..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="NO_ID_MATCH">
                                                                <span className="text-red-500">-- NINGUNO (Marcar como no identificado) --</span>
                                                            </SelectItem>
                                                            {relevantClients.map(clientOption => (
                                                                <SelectItem key={clientOption.id} value={clientOption.id}>
                                                                {clientOption.name}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center font-bold text-lg">{item.zenmaid_hours.toFixed(2)}</TableCell>
                                            <TableCell className={`text-center font-bold text-lg ${systemHours > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                                            {clientIdMissing ? 'N/A' : systemHours.toFixed(2)}
                                            </TableCell>
                                        </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                        </CardContent>
                    </Card>
                    
                    <div className="flex justify-center gap-6 pt-6">
                    <Button variant="outline" size="lg" onClick={resetComparison}>
                        <X className="mr-2 h-5 w-5" />
                        Cancelar y Empezar de Nuevo
                    </Button>
                    <Button size="lg" onClick={processConfirmedIds} className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
                        <CheckCircle className="mr-2 h-5 w-5" />
                        Confirmar IDs y Generar Comparación
                    </Button>
                    </div>
                </div>
                )}

                {/* Final Reconciliation Results */}
                {matchingStep === 'reconciliation' && editableResults && (
                <div className="space-y-8">
                    <Card className="shadow-xl border-0">
                    <CardHeader className="bg-gradient-to-r from-green-50 to-blue-50">
                        <CardTitle className="text-2xl flex items-center gap-3">
                        <Target className="w-6 h-6 text-green-600" />
                        Conciliación Final - Comparación Editable
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-8">
                        {/* Summary Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <Card className="shadow-lg border-0 bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200">
                            <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                <p className="text-blue-600 font-semibold text-lg mb-1">Total Horas Sistema</p>
                                <p className="text-4xl font-bold text-blue-900">{finalTotals.totalSystemHours.toFixed(2)}</p>
                                </div>
                                <div className="bg-blue-500 p-4 rounded-2xl">
                                <FileSpreadsheet className="w-8 h-8 text-white" />
                                </div>
                            </div>
                            </CardContent>
                        </Card>
                        
                        <Card className="shadow-lg border-0 bg-gradient-to-r from-green-50 to-green-100 border-green-200">
                            <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                <p className="text-green-600 font-semibold text-lg mb-1">Total Horas ZenMaid</p>
                                <p className="text-4xl font-bold text-green-900">{finalTotals.totalZenmaidHours.toFixed(2)}</p>
                                </div>
                                <div className="bg-green-500 p-4 rounded-2xl">
                                <Upload className="w-8 h-8 text-white" />
                                </div>
                            </div>
                            </CardContent>
                        </Card>

                        <Card className="shadow-lg border-0 bg-gradient-to-r from-purple-50 to-purple-100 border-purple-200">
                            <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                <p className="text-purple-600 font-semibold text-lg mb-1">Diferencia</p>
                                <p className={`text-4xl font-bold ${
                                    Math.abs(finalTotals.totalDifference) < 0.01 
                                    ? 'text-green-900' 
                                    : 'text-purple-900'
                                }`}>
                                    {(finalTotals.totalDifference).toFixed(2)}
                                </p>
                                </div>
                                <div className="bg-purple-500 p-4 rounded-2xl">
                                <Target className="w-8 h-8 text-white" />
                                </div>
                            </div>
                            </CardContent>
                        </Card>
                        </div>

                        {editableResults.selectedInvoice && (
                        <Card className="shadow-lg border-0 bg-gradient-to-r from-purple-50 to-indigo-50 mb-8">
                            <CardContent className="p-6">
                            <h3 className="text-xl font-bold text-slate-900 mb-4">Información del Invoice</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                                <div>
                                <p className="text-sm text-slate-600 mb-1">Número de Invoice</p>
                                <p className="text-lg font-bold text-slate-900">{editableResults.selectedInvoice.invoice_number}</p>
                                </div>
                                <div>
                                <p className="text-sm text-slate-600 mb-1">Limpiador</p>
                                <p className="text-lg font-bold text-slate-900">{cleaners.find(c => c.id === editableResults.selectedInvoice.cleaner_id)?.full_name}</p>
                                </div>
                                <div>
                                <p className="text-sm text-slate-600 mb-1">Período</p>
                                <p className="text-lg font-bold text-slate-900">
                                    {editableResults.selectedInvoice.period_start && editableResults.selectedInvoice.period_end ? 
                                    `${format(new Date(editableResults.selectedInvoice.period_start), "d MMM", { locale: es })} - ${format(new Date(editableResults.selectedInvoice.period_end), "d MMM yyyy", { locale: es })}` : 
                                    editableResults.selectedInvoice.period
                                    }
                                </p>
                                </div>
                            </div>
                            </CardContent>
                        </Card>
                        )}

                        {/* Detailed Comparison Table */}
                        <Card className="shadow-lg border-0">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-xl">
                            <Target className="w-6 h-6 text-blue-600" />
                            Comparación Detallada Editable ({editableResults.comparisons.length} combinaciones)
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                <TableRow className="bg-slate-50">
                                    <TableHead className="font-semibold">Limpiador</TableHead>
                                    <TableHead className="font-semibold">Cliente</TableHead>
                                    <TableHead className="font-semibold text-center w-32">Horas Sistema</TableHead>
                                    <TableHead className="font-semibold text-center w-32">Horas ZenMaid</TableHead>
                                    <TableHead className="font-semibold text-center w-32">Diferencia</TableHead>
                                    <TableHead className="font-semibold w-48">Notas de Ajuste</TableHead>
                                    <TableHead className="font-semibold">Estado</TableHead>
                                    <TableHead className="font-semibold text-center">Acción</TableHead>
                                </TableRow>
                                </TableHeader>
                                <TableBody>
                                {editableResults.comparisons.map((comp, index) => (
                                    <TableRow key={index} className={Math.abs(comp.difference) > 0.01 ? 'bg-yellow-50' : ''}>
                                    <TableCell className="font-medium">{comp.cleaner_name}</TableCell>
                                    <TableCell className="font-medium">{comp.client_name}</TableCell>
                                    <TableCell className="text-center font-bold text-lg text-blue-700">
                                        <Input type="number" step="0.01" value={comp.system_hours.toFixed(2)} onChange={(e) => handleResultChange(index, 'system_hours', e.target.value)} className="text-center"/>
                                    </TableCell>
                                    <TableCell className="text-center font-bold text-lg text-green-700">
                                        <Input type="number" step="0.01" value={comp.zenmaid_hours.toFixed(2)} onChange={(e) => handleResultChange(index, 'zenmaid_hours', e.target.value)} className="text-center"/>
                                    </TableCell>
                                    <TableCell className={`font-semibold text-center text-lg ${
                                        comp.difference > 0.01 ? "text-blue-600" : 
                                        comp.difference < -0.01 ? "text-orange-600" : "text-green-600"
                                    }`}>
                                        {comp.difference > 0 ? '+' : ''}{comp.difference.toFixed(2)}h
                                    </TableCell>
                                    <TableCell>
                                        <Textarea value={comp.notes || ''} onChange={(e) => handleResultChange(index, 'notes', e.target.value)} placeholder="Añadir nota..."/>
                                    </TableCell>
                                    <TableCell>{getStatusBadge(comp.status)}</TableCell>
                                    <TableCell className="text-center">
                                        <Button variant="ghost" size="icon" onClick={() => handleDeleteResultRow(index)} className="text-red-500 hover:bg-red-100 hover:text-red-700">
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </TableCell>
                                    </TableRow>
                                ))}
                                </TableBody>
                            </Table>
                            </div>
                        </CardContent>
                        </Card>

                        <div className="flex justify-center gap-6 pt-8">
                        <Button variant="outline" size="lg" onClick={resetComparison}>
                            <X className="mr-2 h-5 w-5" />
                            Cancelar
                        </Button>
                        <Button size="lg" onClick={handleSaveReconciliation} className="bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700">
                            <CheckCircle className="mr-2 h-5 w-5" />
                            Guardar y Finalizar Conciliación
                        </Button>
                        </div>
                    </CardContent>
                    </Card>
                </div>
                )}
            </>
        )}
      </div>
    </div>
  );
}
