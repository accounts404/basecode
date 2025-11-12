import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
    Calendar, 
    Users, 
    Clock, 
    DollarSign, 
    AlertTriangle, 
    CheckCircle,
    Loader2,
    Plus,
    AlertCircle,
    FileText
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { base44 } from '@/api/base44Client';

export default function WorkEntryAuditModal({ auditResult, open, onClose, onWorkEntryGenerated }) {
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    if (!auditResult) return null;

    const handleGenerateWorkEntry = async (cleanerId, cleanerName) => {
        setGenerating(true);
        setError('');
        setSuccess('');

        try {
            const { data } = await base44.functions.invoke('generateMissingWorkEntry', {
                scheduleId: auditResult.scheduleId,
                cleanerId: cleanerId
            });

            if (data.success) {
                setSuccess(`✅ WorkEntry creada exitosamente para ${cleanerName}`);
                setTimeout(() => {
                    onWorkEntryGenerated();
                    onClose();
                }, 2000);
            } else {
                setError(data.error || 'Error al crear WorkEntry');
            }
        } catch (err) {
            console.error('Error generando WorkEntry:', err);
            setError(err.response?.data?.error || err.message || 'Error al crear WorkEntry');
        } finally {
            setGenerating(false);
        }
    };

    const getStatusBadge = () => {
        const statusConfig = {
            ok: { label: 'Completo OK', color: 'bg-green-100 text-green-800', icon: CheckCircle },
            missing: { label: 'WorkEntry Faltantes', color: 'bg-red-100 text-red-800', icon: AlertTriangle },
            partial: { label: 'Parcialmente Completo', color: 'bg-amber-100 text-amber-800', icon: AlertCircle },
            discrepancy: { label: 'Con Discrepancias', color: 'bg-orange-100 text-orange-800', icon: AlertCircle }
        };

        const config = statusConfig[auditResult.status] || statusConfig.ok;
        const Icon = config.icon;

        return (
            <Badge className={`${config.color} flex items-center gap-2 px-3 py-1`}>
                <Icon className="w-4 h-4" />
                {config.label}
            </Badge>
        );
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                            <FileText className="w-5 h-5 text-blue-600" />
                            Detalle de Auditoría
                        </span>
                        {getStatusBadge()}
                    </DialogTitle>
                </DialogHeader>

                {error && (
                    <Alert variant="destructive" className="mb-4">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {success && (
                    <Alert className="mb-4 bg-green-50 border-green-200">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <AlertDescription className="text-green-800">{success}</AlertDescription>
                    </Alert>
                )}

                <div className="space-y-6">
                    {/* Información del Servicio */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Calendar className="w-5 h-5 text-blue-600" />
                                Información del Servicio
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm text-slate-500">Cliente</p>
                                    <p className="font-semibold text-slate-900">{auditResult.clientName}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-500">Fecha del Servicio</p>
                                    <p className="font-semibold text-slate-900">
                                        {format(new Date(auditResult.serviceDate), "d 'de' MMMM 'de' yyyy", { locale: es })}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-500">Limpiadores Asignados</p>
                                    <p className="font-semibold text-slate-900">{auditResult.cleanersAssigned}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-500">Con WorkEntry</p>
                                    <p className="font-semibold text-slate-900">{auditResult.cleanersWithWorkEntry}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* WorkEntries Existentes */}
                    {auditResult.workEntries && auditResult.workEntries.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base flex items-center gap-2">
                                    <CheckCircle className="w-5 h-5 text-green-600" />
                                    WorkEntries Existentes ({auditResult.workEntries.length})
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {auditResult.workEntries.map((we, idx) => (
                                        <div 
                                            key={idx} 
                                            className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg"
                                        >
                                            <div className="flex items-center gap-3">
                                                <Users className="w-5 h-5 text-green-600" />
                                                <div>
                                                    <p className="font-semibold text-slate-900">{we.cleanerName}</p>
                                                    <p className="text-sm text-slate-600">
                                                        {we.hours} horas × ${we.totalAmount / we.hours}/h = ${we.totalAmount}
                                                    </p>
                                                </div>
                                            </div>
                                            {we.invoiced ? (
                                                <Badge className="bg-blue-100 text-blue-800">Facturado</Badge>
                                            ) : (
                                                <Badge variant="outline">Pendiente</Badge>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Limpiadores Sin WorkEntry */}
                    {auditResult.missingCleaners && auditResult.missingCleaners.length > 0 && (
                        <Card className="border-red-200">
                            <CardHeader className="bg-red-50">
                                <CardTitle className="text-base flex items-center gap-2 text-red-800">
                                    <AlertTriangle className="w-5 h-5" />
                                    Limpiadores Sin WorkEntry ({auditResult.missingCleaners.length})
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-4">
                                <div className="space-y-3">
                                    {auditResult.missingCleaners.map((mc, idx) => (
                                        <div 
                                            key={idx} 
                                            className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg"
                                        >
                                            <div className="flex items-center gap-3">
                                                <AlertTriangle className="w-5 h-5 text-red-600" />
                                                <div>
                                                    <p className="font-semibold text-slate-900">{mc.cleanerName}</p>
                                                    <p className="text-sm text-slate-600">{mc.reason}</p>
                                                </div>
                                            </div>
                                            <Button
                                                size="sm"
                                                onClick={() => handleGenerateWorkEntry(mc.cleanerId, mc.cleanerName)}
                                                disabled={generating}
                                                className="bg-green-600 hover:bg-green-700"
                                            >
                                                {generating ? (
                                                    <>
                                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                        Generando...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Plus className="w-4 h-4 mr-2" />
                                                        Generar WorkEntry
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Issues/Discrepancias */}
                    {auditResult.issues && auditResult.issues.length > 0 && (
                        <Card className="border-amber-200">
                            <CardHeader className="bg-amber-50">
                                <CardTitle className="text-base flex items-center gap-2 text-amber-800">
                                    <AlertCircle className="w-5 h-5" />
                                    Problemas Detectados ({auditResult.issues.filter(i => i.type !== 'missing').length})
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-4">
                                <div className="space-y-2">
                                    {auditResult.issues
                                        .filter(issue => issue.type !== 'missing')
                                        .map((issue, idx) => (
                                            <div 
                                                key={idx} 
                                                className="p-3 bg-amber-50 border border-amber-200 rounded-lg"
                                            >
                                                <div className="flex items-start gap-2">
                                                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                                                    <div className="flex-1">
                                                        <p className="font-semibold text-slate-900">
                                                            {issue.type === 'duplicate' && '🔄 Duplicación'}
                                                            {issue.type === 'hours_discrepancy' && '⏱️ Discrepancia de Horas'}
                                                        </p>
                                                        <p className="text-sm text-slate-700 mt-1">{issue.message}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                <div className="flex justify-end pt-4 border-t">
                    <Button variant="outline" onClick={onClose}>
                        Cerrar
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}