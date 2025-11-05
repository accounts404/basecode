import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScoreAdjustment } from "@/entities/ScoreAdjustment";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { History, TrendingUp, TrendingDown, Calendar, Info, Loader2 } from "lucide-react";

export default function CleanerScoreHistoryDialog({ isOpen, onClose, cleaner, initialMonth }) {
    const [history, setHistory] = useState([]);
    const [selectedMonth, setSelectedMonth] = useState(initialMonth);
    const [loading, setLoading] = useState(true);

    const categoryLabels = {
        // Deducciones
        uniforme_incompleto: "Uniforme Incompleto",
        uniforme_sucio: "Uniforme Sucio/Descuidado",
        zapatos_inadecuados: "Zapatos Inadecuados",
        llegada_tarde: "Llegada Tarde",
        no_aviso_retraso: "No Avisar Retraso",
        queja_cliente_leve: "Queja de Cliente (Leve)",
        queja_cliente_grave: "Queja de Cliente (Grave)",
        queja_cliente_muy_grave: "Queja de Cliente (Muy Grave)",
        retrabajo_necesario: "Necesidad de Retrabajo",
        revision_supervisor_baja: "Revisión Supervisor (Baja)",
        herramientas_mal_uso: "Mal Uso de Herramientas",
        actitud_negativa: "Actitud Negativa",
        no_seguir_protocolos: "No Seguir Protocolos",
        errores_administrativos: "Errores Administrativos",
        
        // Bonificaciones
        proactividad_problema: "Proactividad Resolviendo Problemas",
        mejora_identificada: "Identificar Mejoras",
        voluntario_extra: "Voluntario para Trabajo Extra",
        cliente_felicitacion: "Felicitación de Cliente",
        revision_supervisor_excelente: "Revisión Supervisor Excelente",
        puntualidad_consistente: "Puntualidad Consistente",
        iniciativa_propia: "Iniciativa Propia",
        colaboracion_equipo: "Excelente Colaboración",
        limpieza_excepcional: "Limpieza Excepcional",
        atencion_detalle: "Atención al Detalle",
        otros: "Otros"
    };

    const loadHistory = useCallback(async () => {
        if (!cleaner || !selectedMonth) return;

        setLoading(true);
        try {
            const adjustments = await ScoreAdjustment.filter({
                cleaner_id: cleaner.cleaner_id, // Use cleaner.cleaner_id from the ranking object
                month_period: selectedMonth
            });
            setHistory(adjustments.sort((a, b) => new Date(b.date_applied) - new Date(a.date_applied)));
        } catch (error) {
            console.error("Error loading cleaner history:", error);
            setHistory([]);
        } finally {
            setLoading(false);
        }
    }, [cleaner, selectedMonth]);

    useEffect(() => {
        if (isOpen) {
            loadHistory();
        }
    }, [isOpen, loadHistory]);

    // Update selectedMonth when initialMonth prop changes (e.g., when main page month changes)
    useEffect(() => {
        setSelectedMonth(initialMonth);
    }, [initialMonth]);

    const deductions = useMemo(() => history.filter(item => item.adjustment_type === 'deduction'), [history]);
    const bonuses = useMemo(() => history.filter(item => item.adjustment_type === 'bonus'), [history]);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <History className="w-6 h-6" />
                        Historial de Puntuación - {cleaner?.cleaner_name || cleaner?.full_name}
                    </DialogTitle>
                </DialogHeader>

                <div className="flex items-center gap-2 mb-4">
                    <Label htmlFor="historyMonth">Ver mes:</Label>
                    <Input
                        id="historyMonth"
                        type="month"
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="w-40"
                    />
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                        <span className="ml-3 text-slate-600">Cargando historial...</span>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Deducciones */}
                        <Card>
                            <CardContent className="p-4">
                                <h3 className="text-lg font-semibold text-red-700 mb-4 flex items-center gap-2">
                                    <TrendingDown className="w-5 h-5" />
                                    Deducciones
                                </h3>
                                <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                                    {deductions.length > 0 ? (
                                        deductions.map(adj => (
                                            <div key={adj.id} className="p-3 border border-red-200 bg-red-50 rounded-lg">
                                                <p className="font-semibold text-red-800">{categoryLabels[adj.category] || adj.category}</p>
                                                <p className="text-sm text-red-700 flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" />
                                                    {format(new Date(adj.date_applied), "d MMM yyyy", { locale: es })}
                                                    <span className="ml-2 font-bold">{adj.points_impact} pts</span>
                                                </p>
                                                {adj.notes && <p className="text-xs text-red-600 mt-1">{adj.notes}</p>}
                                                {adj.admin_name && <p className="text-xs text-red-500 mt-1">Por: {adj.admin_name}</p>}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-4 text-slate-500">
                                            <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                            <p>No hay deducciones para este período.</p>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Bonificaciones */}
                        <Card>
                            <CardContent className="p-4">
                                <h3 className="text-lg font-semibold text-green-700 mb-4 flex items-center gap-2">
                                    <TrendingUp className="w-5 h-5" />
                                    Bonificaciones
                                </h3>
                                <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                                    {bonuses.length > 0 ? (
                                        bonuses.map(adj => (
                                            <div key={adj.id} className="p-3 border border-green-200 bg-green-50 rounded-lg">
                                                <p className="font-semibold text-green-800">{categoryLabels[adj.category] || adj.category}</p>
                                                <p className="text-sm text-green-700 flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" />
                                                    {format(new Date(adj.date_applied), "d MMM yyyy", { locale: es })}
                                                    <span className="ml-2 font-bold">+{adj.points_impact} pts</span>
                                                </p>
                                                {adj.notes && <p className="text-xs text-green-600 mt-1">{adj.notes}</p>}
                                                {adj.admin_name && <p className="text-xs text-green-500 mt-1">Por: {adj.admin_name}</p>}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-4 text-slate-500">
                                            <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                            <p>No hay bonificaciones para este período.</p>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}