import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { registerClockOut } from "@/components/utils/activeServiceManager";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
    Clock,
    MapPin,
    Navigation,
    CheckCircle,
    AlertTriangle,
    Camera,
    FileText,
    PawPrint,
    KeySquare,
    AlertCircle
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import ServiceReportForm from "../components/reports/ServiceReportForm";

const parseISOAsUTC = (isoString) => {
    if (!isoString) return null;
    const clean = isoString.endsWith('Z') ? isoString.slice(0, -1) : isoString;
    return new Date(clean);
};

const formatElapsedTime = (seconds) => {
    if (seconds <= 0) return "00:00:00";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export default function ServicioActivoPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [activeService, setActiveService] = useState(null);
    const [clientInfo, setClientInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [elapsedTime, setElapsedTime] = useState(0);
    const [remainingTime, setRemainingTime] = useState(0);
    const [scheduledDuration, setScheduledDuration] = useState(0);
    const [clockingOut, setClockingOut] = useState(false);
    const [showReportDialog, setShowReportDialog] = useState(false);
    
    const intervalRef = useRef(null);
    const pollingRef = useRef(null);
    const isUnmountingRef = useRef(false);

    useEffect(() => {
        if (user) {
            loadUserAndActiveService();
        }
        return () => {
            isUnmountingRef.current = true;
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, [user]);

    // POLLING OPTIMIZADO: Solo consulta el servicio actual por ID
    useEffect(() => {
        if (loading || !activeService?.id || !user || clockingOut || isUnmountingRef.current) return;

        pollingRef.current = setInterval(async () => {
            if (isUnmountingRef.current || clockingOut) {
                if (pollingRef.current) clearInterval(pollingRef.current);
                return;
            }

            try {
                const updatedService = await base44.entities.Schedule.get(activeService.id);
                if (isUnmountingRef.current || clockingOut) return;

                const cleanerClockData = updatedService?.clock_in_data?.find(c => c.cleaner_id === user.id);
                const stillActive = cleanerClockData?.clock_in_time && !cleanerClockData?.clock_out_time;

                if (!stillActive || updatedService.status === 'completed' || updatedService.status === 'cancelled') {
                    navigate(createPageUrl("Horario"), { replace: true });
                    return;
                }

                setActiveService(updatedService);
                
                if (updatedService.client_id && (!clientInfo || clientInfo.id !== updatedService.client_id)) {
                    const client = await base44.entities.Client.get(updatedService.client_id);
                    if (!isUnmountingRef.current && !clockingOut) setClientInfo(client);
                }
            } catch (error) {
                console.error('[ServicioActivo] Error en polling:', error);
            }
        }, 20000);

        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, [loading, activeService?.id, user, clientInfo?.id, navigate, clockingOut]);

    const loadUserAndActiveService = async () => {
        if (isUnmountingRef.current || !user) return;

        try {
            const cachedActiveService = localStorage.getItem('redoak_active_service');
            let targetServiceId = null;

            if (cachedActiveService) {
                try {
                    const parsed = JSON.parse(cachedActiveService);
                    if (parsed.fullSchedule) {
                        setActiveService(parsed.fullSchedule);
                        targetServiceId = parsed.fullSchedule.id;
                        setLoading(false); 
                        
                        const cleanerSchedule = parsed.fullSchedule.cleaner_schedules?.find(cs => cs.cleaner_id === user.id);
                        let duration = 0;
                        if (cleanerSchedule?.start_time && cleanerSchedule?.end_time) {
                            duration = Math.floor((parseISOAsUTC(cleanerSchedule.end_time).getTime() - parseISOAsUTC(cleanerSchedule.start_time).getTime()) / 1000);
                        } else {
                            duration = Math.floor((parseISOAsUTC(parsed.fullSchedule.end_time).getTime() - parseISOAsUTC(parsed.fullSchedule.start_time).getTime()) / 1000);
                        }
                        setScheduledDuration(duration);
                        startTimer(parsed.fullSchedule, user.id, duration);
                    }
                } catch (e) {}
            }

            let active = null;
            if (targetServiceId) {
                const fetchedService = await base44.entities.Schedule.get(targetServiceId);
                const cleanerClockData = fetchedService?.clock_in_data?.find(c => c.cleaner_id === user.id);
                if (cleanerClockData?.clock_in_time && !cleanerClockData?.clock_out_time) {
                    active = fetchedService;
                }
            }

            if (!active) {
                const { syncActiveService } = await import('@/components/utils/activeServiceManager');
                const syncResult = await syncActiveService(user.id);
                if (syncResult.hasActive && syncResult.schedule) {
                    active = syncResult.schedule;
                }
            }

            if (!active) {
                navigate(createPageUrl("Horario"), { replace: true });
                return;
            }

            if (isUnmountingRef.current) return;
            setActiveService(active);

            if (active.client_id) {
                try {
                    const client = await base44.entities.Client.get(active.client_id);
                    if (!isUnmountingRef.current) setClientInfo(client);
                } catch (e) {}
            }

            let duration = 0;
            const cleanerSchedule = active.cleaner_schedules?.find(cs => cs.cleaner_id === user.id);
            if (cleanerSchedule?.start_time && cleanerSchedule?.end_time) {
                duration = Math.floor((parseISOAsUTC(cleanerSchedule.end_time).getTime() - parseISOAsUTC(cleanerSchedule.start_time).getTime()) / 1000);
            } else {
                duration = Math.floor((parseISOAsUTC(active.end_time).getTime() - parseISOAsUTC(active.start_time).getTime()) / 1000);
            }
            
            if (isUnmountingRef.current) return;
            setScheduledDuration(duration);
            startTimer(active, user.id, duration);

        } catch (error) {
            console.error('[ServicioActivo] Error cargando datos:', error);
            if (!isUnmountingRef.current) setError("Error al cargar el servicio activo");
        } finally {
            if (!isUnmountingRef.current) setLoading(false);
        }
    };

    const startTimer = (service, userId, duration) => {
        if (intervalRef.current) clearInterval(intervalRef.current);

        const updateTimer = () => {
            if (isUnmountingRef.current) return;
            const cleanerClockData = service.clock_in_data?.find(c => c.cleaner_id === userId);
            if (!cleanerClockData?.clock_in_time) return;

            const clockInTime = parseISOAsUTC(cleanerClockData.clock_in_time);
            const now = new Date();
            const elapsed = Math.floor((now.getTime() - clockInTime.getTime()) / 1000);
            
            setElapsedTime(elapsed);
            setRemainingTime(Math.max(0, duration - elapsed));
        };

        updateTimer();
        intervalRef.current = setInterval(updateTimer, 1000);
    };

    const handleClockOut = async () => {
        if (!activeService || !user || clockingOut) return;

        setClockingOut(true);
        setError("");
        isUnmountingRef.current = true;

        if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }

        const idempotencyKey = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });

        let userLocation = null;
        try {
            const { getUserLocation } = await import('@/components/utils/clockService');
            userLocation = await getUserLocation();
        } catch (e) {}

        const MAX_RETRIES = 3;
        let lastError = null;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                if (attempt > 0) {
                    const delay = Math.pow(2, attempt - 1) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

                const { data: result } = await base44.functions.invoke('clockOut', {
                    scheduleId: activeService.id,
                    idempotencyKey,
                    location: userLocation
                });

                if (!result?.success) throw new Error(result?.error || 'Error desconocido en Clock Out');

                registerClockOut(activeService.id);
                const cachedSchedules = localStorage.getItem('redoak_cleaner_schedules');
                if (cachedSchedules && result.schedule) {
                    try {
                        const parsed = JSON.parse(cachedSchedules);
                        const updated = parsed.map(s => s.id === activeService.id ? result.schedule : s);
                        localStorage.setItem('redoak_cleaner_schedules', JSON.stringify(updated));
                    } catch (e) {}
                }

                setTimeout(() => {
                    navigate(createPageUrl("Horario"), {
                        replace: true,
                        state: { clockOutSuccess: true, message: '✅ Clock Out exitoso. ¡Servicio finalizado!' }
                    });
                }, 500);
                return;

            } catch (error) {
                lastError = error;
            }
        }

        isUnmountingRef.current = false;
        setClockingOut(false);
        setError(`❌ No se pudo completar el Clock Out: ${lastError?.message || 'Error de red'}. Intenta de nuevo.`);
        loadUserAndActiveService();
    };

    const handleReportSuccess = () => {
        setShowReportDialog(false);
        setSuccess("¡Reporte enviado exitosamente! El administrador ha sido notificado.");
        setTimeout(() => setSuccess(""), 5000);
    };

    const openInMaps = (address) => {
        const encodedAddress = encodeURIComponent(address);
        window.location.href = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
    };

    const getStructuredNotes = () => clientInfo?.structured_service_notes || activeService?.structured_service_notes || null;
    const getDefaultClientNotes = () => clientInfo?.default_service_notes || (activeService?.notes_public && !activeService?.service_specific_notes ? activeService.notes_public : null);
    const getServiceSpecificNotes = () => activeService?.service_specific_notes || null;
    const getDefaultClientPhotos = () => clientInfo?.default_photo_urls || [];

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
                <div className="text-center space-y-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="text-slate-600">Cargando servicio activo...</p>
                </div>
            </div>
        );
    }

    if (!activeService) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
                <Card className="max-w-md w-full">
                    <CardContent className="pt-6 text-center space-y-4">
                        <AlertCircle className="w-16 h-16 text-slate-400 mx-auto" />
                        <h2 className="text-xl font-bold text-slate-800">No hay servicio activo</h2>
                        <Button onClick={() => navigate(createPageUrl("Horario"))}>Ir al Horario</Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const clockInTime = activeService && user 
        ? parseISOAsUTC(activeService.clock_in_data?.find(c => c.cleaner_id === user.id)?.clock_in_time)
        : null;

    const percentageComplete = scheduledDuration > 0 ? (elapsedTime / scheduledDuration) * 100 : 0;
    const structuredNotes = getStructuredNotes();
    const defaultClientNotes = getDefaultClientNotes();
    const serviceSpecificNotes = getServiceSpecificNotes();
    const defaultClientPhotos = getDefaultClientPhotos();

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-3 sm:p-4 pb-48">
            <div className="max-w-2xl mx-auto space-y-4 relative">
                {error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
                {success && <Alert className="bg-green-50 border-green-200"><CheckCircle className="h-4 w-4 text-green-600" /><AlertDescription className="text-green-800">{success}</AlertDescription></Alert>}

                <Card className="shadow-lg border-2 border-blue-200">
                    <CardContent className="pt-6">
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex-1">
                                <h1 className="text-2xl font-bold text-slate-900 mb-2">{activeService.client_name}</h1>
                                <button onClick={() => openInMaps(activeService.client_address)} className="flex items-center gap-2 text-blue-600 hover:text-blue-800">
                                    <MapPin className="w-5 h-5" />
                                    <span className="text-sm underline">{activeService.client_address}</span>
                                    <Navigation className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-white border-2 border-blue-200 shadow-lg">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <Clock className="w-5 h-5 text-blue-600" />
                                <h3 className="text-lg font-bold text-slate-800">Tiempo Trabajado</h3>
                            </div>
                            <div className="bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200">
                                <p className="text-xs text-slate-600 font-medium">Inicio:</p>
                                <p className="text-sm font-bold text-blue-700">
                                    {clockInTime ? format(clockInTime, 'HH:mm', { locale: es }) : '--:--'}
                                </p>
                            </div>
                        </div>
                        <div className="text-center mb-4">
                            <p className="text-4xl sm:text-5xl font-bold text-blue-600 font-mono tracking-tight">
                                {formatElapsedTime(elapsedTime)}
                            </p>
                            <p className="text-sm text-slate-500 mt-2">Tiempo transcurrido</p>
                        </div>
                        {scheduledDuration > 0 && (
                            <>
                                <div className="w-full bg-slate-200 rounded-full h-3 mb-2 overflow-hidden">
                                    <div className={`h-full rounded-full ${percentageComplete > 100 ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(percentageComplete, 100)}%` }} />
                                </div>
                                <p className="text-center text-sm text-slate-600 font-medium">
                                    {percentageComplete > 100 ? (
                                        <span className="text-red-600 font-bold">⚠️ {Math.round(percentageComplete)}% - Extra: {formatElapsedTime(elapsedTime - scheduledDuration)}</span>
                                    ) : (
                                        <span>{Math.round(percentageComplete)}% completado (Est. {formatElapsedTime(scheduledDuration)})</span>
                                    )}
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>

                {clientInfo?.has_access && (
                    <Card className="shadow-lg">
                        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg"><KeySquare className="w-5 h-5 text-purple-600" />Información de Acceso</CardTitle></CardHeader>
                        <CardContent className="space-y-2">
                            <div><span className="font-semibold text-slate-700">Tipo:</span><span className="ml-2 text-slate-600">{clientInfo.access_type}</span></div>
                            {clientInfo.access_identifier && <div><span className="font-semibold text-slate-700">ID:</span><span className="ml-2 font-mono bg-slate-100 px-2 py-1 rounded">{clientInfo.access_identifier}</span></div>}
                            {clientInfo.access_instructions && <div><span className="font-semibold text-slate-700">Instrucciones:</span><p className="text-slate-600 mt-1 whitespace-pre-wrap">{clientInfo.access_instructions}</p></div>}
                        </CardContent>
                    </Card>
                )}

                {clientInfo?.pets?.length > 0 && (
                    <Card className="shadow-lg">
                        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg"><PawPrint className="w-5 h-5 text-orange-600" />Mascotas</CardTitle></CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {clientInfo.pets.map((pet, i) => (
                                    <div key={i} className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                                        <h4 className="font-bold text-orange-900">{pet.name}</h4>
                                        <p className="text-sm text-orange-700">{pet.special_instructions}</p>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {structuredNotes && (
                    <Card className="shadow-lg">
                        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg"><FileText className="w-5 h-5 text-indigo-600" />Instrucciones por Área</CardTitle></CardHeader>
                        <CardContent>
                            <Accordion type="multiple" className="w-full">
                                {Object.entries(structuredNotes).map(([key, data]) => {
                                    if (!data?.notes && !data?.photos?.length) return null;
                                    return (
                                        <AccordionItem value={key} key={key}>
                                            <AccordionTrigger className="text-base font-semibold capitalize">{key.replace(/_/g, ' ')}</AccordionTrigger>
                                            <AccordionContent>
                                                {data.notes && <p className="text-slate-700 whitespace-pre-wrap mb-3">{data.notes}</p>}
                                                {data.photos?.length > 0 && (
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {data.photos.map((photo, idx) => (
                                                            <img key={idx} src={photo.url} alt="Referencia" className="w-full h-32 object-cover rounded-lg" />
                                                        ))}
                                                    </div>
                                                )}
                                            </AccordionContent>
                                        </AccordionItem>
                                    );
                                })}
                            </Accordion>
                        </CardContent>
                    </Card>
                )}

                {defaultClientNotes && (
                    <Card className="shadow-lg">
                        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg"><FileText className="w-5 h-5 text-blue-600" />Notas Generales</CardTitle></CardHeader>
                        <CardContent><p className="text-slate-700 whitespace-pre-wrap">{defaultClientNotes}</p></CardContent>
                    </Card>
                )}
                
                {serviceSpecificNotes && (
                    <Card className="shadow-lg border-l-4 border-l-purple-500">
                        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg"><FileText className="w-5 h-5 text-purple-600" />Notas del Servicio</CardTitle></CardHeader>
                        <CardContent><p className="text-slate-700 whitespace-pre-wrap">{serviceSpecificNotes}</p></CardContent>
                    </Card>
                )}
            </div>

            <div className="fixed bottom-0 left-0 right-0 p-3 sm:p-4 bg-white/95 backdrop-blur-md border-t border-slate-200/50 shadow-[0_-8px_30px_-15px_rgba(0,0,0,0.15)] z-50">
                <div className="max-w-2xl mx-auto space-y-3">
                    <Button onClick={() => setShowReportDialog(true)} variant="outline" disabled={clockingOut} className="w-full h-12 text-sm font-semibold border-2 border-amber-500 text-amber-700 hover:bg-amber-50">
                        <AlertTriangle className="w-5 h-5 mr-2" /> Reportar Problema
                    </Button>
                    <Button onClick={() => handleClockOut(0)} disabled={clockingOut} className="w-full h-14 text-sm font-bold bg-green-600 hover:bg-green-700 text-white shadow-lg">
                        {clockingOut ? <><Clock className="w-5 h-5 mr-2 animate-spin" /> Procesando...</> : <><CheckCircle className="w-6 h-6 mr-2" /> Finalizar Servicio</>}
                    </Button>
                </div>
            </div>

            <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader><DialogTitle className="flex items-center gap-2 text-xl"><AlertTriangle className="w-6 h-6 text-amber-600" /> Reportar Problema</DialogTitle></DialogHeader>
                    <ServiceReportForm scheduleId={activeService.id} clientName={activeService.client_name} serviceDate={(activeService.start_time || '').slice(0, 10)} cleanerId={user?.id} cleanerName={user?.full_name} onSuccess={handleReportSuccess} onCancel={() => setShowReportDialog(false)} />
                </DialogContent>
            </Dialog>
        </div>
    );
}