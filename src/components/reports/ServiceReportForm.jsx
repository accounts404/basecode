import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Camera, AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import PhotoUploader from "../horario/PhotoUploader";

const priorityConfig = {
    low: { label: '🟢 Baja', color: 'bg-green-100 text-green-800', description: 'Puede esperar, no es urgente' },
    medium: { label: '🟡 Media', color: 'bg-yellow-100 text-yellow-800', description: 'Requiere atención pronto' },
    high: { label: '🟠 Alta', color: 'bg-orange-100 text-orange-800', description: 'Requiere atención prioritaria' },
    urgent: { label: '🔴 Urgente', color: 'bg-red-100 text-red-800', description: 'Requiere atención inmediata' }
};

export default function ServiceReportForm({ 
    scheduleId, 
    clientName, 
    serviceDate, 
    cleanerId, 
    cleanerName, 
    onSuccess, 
    onCancel 
}) {
    const [reportNotes, setReportNotes] = useState("");
    const [reportPhotos, setReportPhotos] = useState([]);
    const [priority, setPriority] = useState("medium");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!reportNotes.trim()) {
            setError("Por favor describe el problema antes de enviar el reporte.");
            return;
        }

        setSubmitting(true);
        setError("");

        try {
            const reportData = {
                schedule_id: scheduleId,
                cleaner_id: cleanerId,
                cleaner_name: cleanerName,
                client_name: clientName,
                service_date: serviceDate,
                report_notes: reportNotes.trim(),
                report_photos: reportPhotos,
                priority: priority,
                status: 'pending'
            };

            const newReport = await base44.entities.ServiceReport.create(reportData);

            // Enviar notificación al admin
            try {
                await base44.functions.invoke('notifyAdminOfServiceReport', {
                    report: newReport,
                    cleaner_name: cleanerName,
                    client_name: clientName,
                    service_date: serviceDate
                });
            } catch (notifyError) {
                console.warn('No se pudo enviar la notificación al admin:', notifyError);
            }

            if (onSuccess) {
                onSuccess(newReport);
            }

        } catch (error) {
            console.error("Error creando reporte:", error);
            setError("Error al enviar el reporte. Por favor, inténtalo de nuevo.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* Información del servicio */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2">Información del Servicio</h3>
                <div className="space-y-1 text-sm">
                    <p className="text-blue-800"><strong>Cliente:</strong> {clientName}</p>
                    <p className="text-blue-800"><strong>Fecha:</strong> {serviceDate}</p>
                </div>
            </div>

            {/* Nivel de Prioridad */}
            <div>
                <Label className="text-base font-semibold mb-3 block">
                    Nivel de Prioridad *
                </Label>
                <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger className="h-14 text-base">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {Object.entries(priorityConfig).map(([key, config]) => (
                            <SelectItem key={key} value={key} className="py-3">
                                <div>
                                    <div className="font-semibold">{config.label}</div>
                                    <div className="text-xs text-slate-600">{config.description}</div>
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Descripción del Problema */}
            <div>
                <Label htmlFor="report_notes" className="text-base font-semibold mb-3 block">
                    Descripción del Problema *
                </Label>
                <Textarea
                    id="report_notes"
                    value={reportNotes}
                    onChange={(e) => setReportNotes(e.target.value)}
                    placeholder="Describe detalladamente el problema o situación que encontraste durante el servicio..."
                    rows={6}
                    className="resize-none text-base p-4"
                    required
                />
                <p className="text-sm text-slate-600 mt-2">
                    Sé lo más específico posible. Incluye detalles sobre qué sucedió, dónde y cuándo.
                </p>
            </div>

            {/* Fotos de Soporte */}
            <div>
                <Label className="text-base font-semibold mb-3 block flex items-center gap-2">
                    <Camera className="w-5 h-5 text-blue-600" />
                    Fotos de Soporte (Opcional)
                </Label>
                <PhotoUploader
                    uploadedUrls={reportPhotos}
                    onUrlsChange={setReportPhotos}
                />
                <p className="text-sm text-slate-600 mt-2">
                    Las fotos ayudan al equipo administrativo a entender mejor la situación.
                </p>
            </div>

            {/* Error Alert */}
            {error && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {/* Botones de Acción */}
            <div className="flex flex-col gap-3 pt-4">
                <Button
                    type="submit"
                    disabled={submitting || !reportNotes.trim()}
                    className="w-full h-14 text-base font-semibold bg-amber-600 hover:bg-amber-700"
                >
                    {submitting ? (
                        <>
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                            Enviando Reporte...
                        </>
                    ) : (
                        <>
                            <CheckCircle className="w-5 h-5 mr-2" />
                            Enviar Reporte
                        </>
                    )}
                </Button>

                {onCancel && (
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onCancel}
                        disabled={submitting}
                        className="w-full h-14 text-base font-semibold"
                    >
                        Cancelar
                    </Button>
                )}
            </div>
        </form>
    );
}