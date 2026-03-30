import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ServiceReport } from '@/entities/ServiceReport';
import {
    Calendar, Clock, Users, AlertTriangle, AlertCircle, Loader2,
    Play, Square, CheckCircle, Navigation, Heart, MapPin, Send, Car, ExternalLink,
    Home, Camera, ImageIcon, Info, ListChecks, Paperclip, KeySquare, FileText
} from 'lucide-react';
import { format, parseISO, differenceInSeconds } from 'date-fns';
import { es } from 'date-fns/locale';
import FamilyAndPetsManager from '../clients/FamilyAndPetsManager';
import StructuredServiceNotes from '../clients/StructuredServiceNotes';
import PhotoUploader from './PhotoUploader';
import { sendOnMyWaySms } from '@/functions/sendOnMyWaySms';

const formatUTCDate = (isoString) => {
    if (!isoString) return 'N/A';
    const date = new Date(isoString);
    const weekdayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${weekdayNames[date.getUTCDay()]}, ${date.getUTCDate()} ${monthNames[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
};

const formatUTCTime = (isoString) => {
    if (!isoString) return 'N/A';
    const date = new Date(isoString);
    return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
};

const formatTime = (seconds) => {
    if (seconds < 0 || seconds === null) return "00:00:00";
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor(((seconds % 3600) / 60)).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
};

const formatDuration = (totalSeconds) => {
    if (isNaN(totalSeconds) || totalSeconds < 0) return '00:00:00';
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export default function CleanerReadOnlyView({
    schedule,
    selectedClient,
    allUsers,
    currentUser,
    selectedCleanerId,
    onClockInOut,
    openInMaps,
    onCancel,
    onUpdateSchedule,
    currentServiceElapsedTime,
    clientDefaultNotes,
    serviceSpecificNotes,
    serviceSpecificPhotos,
}) {
    const [sendingOnMyWay, setSendingOnMyWay] = useState(false);
    const [onMyWayError, setOnMyWayError] = useState('');
    const [onMyWaySuccess, setOnMyWaySuccess] = useState('');
    const [showTimeSelection, setShowTimeSelection] = useState(false);
    const [selectedETA, setSelectedETA] = useState('10');
    const [reportNotes, setReportNotes] = useState('');
    const [reportPhotos, setReportPhotos] = useState([]);
    const [reportPriority, setReportPriority] = useState('medium');
    const [submittingReport, setSubmittingReport] = useState(false);
    const [liveCleanerTimes, setLiveCleanerTimes] = useState({});
    const [timeRemaining, setTimeRemaining] = useState(null);

    const cleanerClockData = schedule?.clock_in_data?.find(c => c.cleaner_id === selectedCleanerId);
    const hasClockIn = !!cleanerClockData?.clock_in_time;
    const hasClockOut = !!cleanerClockData?.clock_out_time;

    const status = schedule?.status;
    const statusDisplay = status === 'scheduled' ? { label: 'Programado', color: 'bg-blue-100 text-blue-800', icon: <Calendar className="w-4 h-4" /> }
        : status === 'in_progress' ? { label: 'En Progreso', color: 'bg-yellow-100 text-yellow-800', icon: <Clock className="w-4 h-4" /> }
        : status === 'completed' ? { label: 'Completado', color: 'bg-green-100 text-green-800', icon: <CheckCircle className="w-4 h-4" /> }
        : status === 'cancelled' ? { label: 'Cancelado', color: 'bg-red-100 text-red-800', icon: <AlertTriangle className="w-4 h-4" /> }
        : null;

    useEffect(() => {
        if (hasClockIn && !hasClockOut && schedule && currentServiceElapsedTime > 0) {
            const scheduledStart = new Date(schedule.start_time);
            const scheduledEnd = new Date(schedule.end_time);
            const scheduledDurationHours = (scheduledEnd - scheduledStart) / (1000 * 60 * 60);
            const assignedCleaners = schedule.cleaner_ids?.length || 1;
            const totalWorkUnits = scheduledDurationHours * assignedCleaners;
            let personHoursCompleted = 0;
            let activeCleaners = 0;
            if (schedule.clock_in_data) {
                schedule.clock_in_data.forEach(cd => {
                    if (cd.clock_in_time) {
                        const clockInTime = new Date(cd.clock_in_time);
                        if (cd.clock_out_time) {
                            personHoursCompleted += (new Date(cd.clock_out_time) - clockInTime) / (1000 * 60 * 60);
                        } else {
                            personHoursCompleted += (new Date() - clockInTime) / (1000 * 60 * 60);
                            activeCleaners += 1;
                        }
                    }
                });
            }
            const personHoursRemaining = Math.max(0, totalWorkUnits - personHoursCompleted);
            setTimeRemaining(activeCleaners > 0 ? (personHoursRemaining / activeCleaners) * 3600 : 0);
        } else {
            setTimeRemaining(null);
        }
    }, [hasClockIn, hasClockOut, schedule, currentServiceElapsedTime]);

    useEffect(() => {
        if (!schedule?.clock_in_data || schedule.clock_in_data.length === 0) { setLiveCleanerTimes({}); return; }
        const intervalId = setInterval(() => {
            const now = new Date();
            const newTimes = {};
            const cleanerSchedulesMap = new Map(schedule.cleaner_schedules?.map(cs => [cs.cleaner_id, cs]) || []);
            schedule.clock_in_data.forEach(cd => {
                const cs = cleanerSchedulesMap.get(cd.cleaner_id);
                let scheduledDurationSeconds = 0;
                if (cs?.start_time && cs?.end_time) {
                    scheduledDurationSeconds = differenceInSeconds(new Date(cs.end_time), new Date(cs.start_time));
                } else if (schedule.start_time && schedule.end_time) {
                    scheduledDurationSeconds = differenceInSeconds(new Date(schedule.end_time), new Date(schedule.start_time));
                }
                let workedSeconds = 0;
                let isLive = false;
                if (cd.clock_in_time) {
                    if (cd.clock_out_time) {
                        workedSeconds = differenceInSeconds(new Date(cd.clock_out_time), new Date(cd.clock_in_time));
                    } else {
                        workedSeconds = differenceInSeconds(now, new Date(cd.clock_in_time));
                        isLive = true;
                    }
                }
                newTimes[cd.cleaner_id] = {
                    workedTime: formatDuration(workedSeconds),
                    remainingTime: formatDuration(Math.max(0, scheduledDurationSeconds - workedSeconds)),
                    progress: scheduledDurationSeconds > 0 ? Math.min(100, (workedSeconds / scheduledDurationSeconds) * 100) : 0,
                    isLive,
                };
            });
            setLiveCleanerTimes(newTimes);
        }, 1000);
        return () => clearInterval(intervalId);
    }, [schedule]);

    const handleSendOnMyWay = async (estimatedMinutes = null) => {
        if (!schedule?.id || schedule.on_my_way_sent_at) return;
        setSendingOnMyWay(true);
        setOnMyWayError('');
        setOnMyWaySuccess('');
        setShowTimeSelection(false);
        try {
            const { data } = await sendOnMyWaySms({ scheduleId: schedule.id, estimatedArrivalMinutes: estimatedMinutes });
            if (data.success && data.updatedSchedule) {
                setOnMyWaySuccess('¡Notificación enviada al cliente!');
                if (onUpdateSchedule) onUpdateSchedule(data.updatedSchedule);
            } else {
                throw new Error(data.error || 'Error desconocido.');
            }
        } catch (err) {
            setOnMyWayError(err.response?.data?.error || err.message || 'No se pudo enviar la notificación.');
        } finally {
            setSendingOnMyWay(false);
            setTimeout(() => { setOnMyWayError(''); setOnMyWaySuccess(''); }, 5000);
        }
    };

    const handleSubmitReport = async () => {
        if (!reportNotes.trim()) { alert('Por favor describe el problema antes de enviar el reporte.'); return; }
        setSubmittingReport(true);
        try {
            const cleaner = allUsers.find(u => u.id === selectedCleanerId);
            const cleanerName = cleaner ? (cleaner.display_name || cleaner.invoice_name || cleaner.full_name) : 'Limpiador desconocido';
            const reportData = {
                schedule_id: schedule.id, cleaner_id: selectedCleanerId, cleaner_name: cleanerName,
                client_name: schedule.client_name, service_date: format(parseISO(schedule.start_time), 'yyyy-MM-dd'),
                report_notes: reportNotes.trim(), report_photos: reportPhotos, priority: reportPriority, status: 'pending'
            };
            await ServiceReport.create(reportData);
            try {
                const { notifyAdminOfServiceReport } = await import('@/functions/notifyAdminOfServiceReport');
                await notifyAdminOfServiceReport({ report: reportData, cleaner_name: cleanerName, client_name: schedule.client_name, service_date: reportData.service_date });
            } catch (e) { console.error('Error enviando notificación:', e); }
            alert('Reporte enviado exitosamente. El administrador será notificado.');
            setReportNotes(''); setReportPhotos([]); setReportPriority('medium');
        } catch (err) {
            alert('Error al enviar el reporte. Inténtalo nuevamente.');
        } finally { setSubmittingReport(false); }
    };

    return (
        <div className="space-y-8">
            {statusDisplay && (
                <div className="mb-6 p-4 bg-slate-50 rounded-lg border">
                    <div className="flex items-center justify-center gap-3">
                        <div className={`flex items-center gap-2 px-4 py-2 rounded-full font-semibold text-lg ${statusDisplay.color}`}>
                            {statusDisplay.icon}
                            <span>Estado: {statusDisplay.label}</span>
                        </div>
                    </div>
                    {schedule.status === 'completed' && (
                        <div className="mt-3 text-center">
                            <p className="text-green-700 font-medium">✅ Este servicio ha sido marcado como completado</p>
                            <p className="text-sm text-green-600 mt-1">Las entradas de trabajo han sido generadas automáticamente</p>
                        </div>
                    )}
                </div>
            )}

            {selectedCleanerId && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 sm:p-6 shadow-lg space-y-4">
                    <div className="flex items-start sm:items-center justify-between mb-4 flex-col sm:flex-row gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                                <Calendar className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <Badge className="mb-1">{schedule.status === 'completed' ? 'Completado' : (schedule.status === 'in_progress' ? 'En Progreso' : 'Programado')}</Badge>
                                <h2 className="text-2xl font-bold text-blue-900 flex items-center gap-2">
                                    {selectedClient?.name || schedule.client_name}
                                    {currentUser?.role === 'admin' && selectedClient?.id && (
                                        <Button type="button" variant="ghost" size="icon" onClick={() => window.open(`/Clientes?edit=${selectedClient.id}`, '_blank')} className="text-blue-600 hover:text-blue-800">
                                            <ExternalLink className="w-5 h-5" />
                                        </Button>
                                    )}
                                </h2>
                                <p className="text-blue-700 flex items-center gap-2">
                                    <MapPin className="w-4 h-4" />
                                    {selectedClient?.address || schedule.client_address}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-white p-4 rounded-lg border border-blue-200">
                            <h3 className="font-semibold text-blue-900 mb-2 flex items-center gap-2"><Calendar className="w-5 h-5" />Horario del Servicio</h3>
                            <p className="text-sm text-blue-700"><strong>Fecha:</strong> {formatUTCDate(schedule.start_time)}</p>
                            <p className="text-sm text-blue-700"><strong>Hora:</strong> {formatUTCTime(schedule.start_time)} - {formatUTCTime(schedule.end_time)}</p>
                        </div>
                        <div className="bg-white p-4 rounded-lg border border-blue-200">
                            <h3 className="font-semibold text-blue-900 mb-2 flex items-center gap-2"><Home className="w-5 h-5" />Detalles de la Propiedad</h3>
                            {selectedClient?.property_type && <p className="text-sm text-blue-700 mb-1"><strong>Tipo:</strong> {{ house:'Casa', townhouse:'Townhouse', unit:'Unit', apartment:'Apartamento' }[selectedClient.property_type] || selectedClient.property_type}</p>}
                            {selectedClient?.property_stories && <p className="text-sm text-blue-700 mb-1"><strong>Plantas:</strong> {{ single_storey:'Una Planta', double_storey:'Dos Plantas', triple_storey:'Tres Plantas', other:'Otras' }[selectedClient.property_stories] || selectedClient.property_stories}</p>}
                            <div className="flex gap-4 mt-1">
                                {selectedClient?.num_bedrooms && <p className="text-sm text-blue-700"><strong>Habitaciones:</strong> {selectedClient.num_bedrooms}</p>}
                                {selectedClient?.num_bathrooms && <p className="text-sm text-blue-700"><strong>Baños:</strong> {selectedClient.num_bathrooms}</p>}
                            </div>
                            {(!selectedClient?.property_type && !selectedClient?.num_bedrooms && !selectedClient?.num_bathrooms) && <p className="text-sm text-blue-500 italic">Información no disponible</p>}
                        </div>
                        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                            <h3 className="font-semibold text-green-900 mb-2 flex items-center gap-2"><Clock className="w-5 h-5" />Tiempo de Referencia</h3>
                            <div className="text-center">
                                <p className="text-2xl font-bold text-green-900">{selectedClient?.service_hours || '--'} horas</p>
                                <p className="text-sm text-green-700 mt-1">Duración total estimada del servicio</p>
                            </div>
                        </div>
                    </div>

                    {openInMaps && (selectedClient?.address || schedule.client_address) && (
                        <Button variant="outline" size="lg" onClick={() => openInMaps(selectedClient?.address || schedule.client_address)} className="w-full sm:w-auto mt-4">
                            <Navigation className="w-4 h-4 mr-2" />Navegar
                        </Button>
                    )}

                    <div className="pt-4 border-t border-blue-200">
                        <h3 className="font-semibold text-blue-900 flex items-center gap-2 text-lg mb-3">⚡ Acciones del Servicio</h3>
                        <div className="bg-white rounded-lg border-2 p-4 space-y-4">
                            {!showTimeSelection ? (
                                <div className="flex flex-col sm:flex-row items-center gap-4">
                                    <Button type="button" size="lg" className={`font-bold text-lg py-4 flex-1 w-full ${schedule.on_my_way_sent_at ? 'bg-gray-400 text-gray-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'}`} onClick={() => setShowTimeSelection(true)} disabled={sendingOnMyWay || !!schedule.on_my_way_sent_at}>
                                        {sendingOnMyWay ? <Loader2 className="w-6 h-6 mr-3 animate-spin" /> : <Car className="w-6 h-6 mr-3" />}
                                        EN CAMINO
                                    </Button>
                                    <div className="text-center sm:text-left text-sm text-slate-600 flex-1 w-full">
                                        {schedule.on_my_way_sent_at ? (
                                            <div className="text-green-600 font-semibold flex items-center justify-center sm:justify-start gap-2">
                                                <CheckCircle className="w-5 h-5" />
                                                <span>Notificación enviada a las {format(new Date(schedule.on_my_way_sent_at), 'HH:mm')}</span>
                                            </div>
                                        ) : <p>Pulsa para notificar al cliente que vas de camino.</p>}
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="text-center">
                                        <h4 className="font-semibold text-blue-900 mb-2">¿En cuánto tiempo llegarás?</h4>
                                        <p className="text-sm text-slate-600 mb-4">Selecciona el tiempo estimado para que el cliente sepa cuándo esperarte:</p>
                                    </div>
                                    <RadioGroup value={selectedETA} onValueChange={setSelectedETA} className="flex justify-center">
                                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                                            {['2', '5', '10', '15', '20', '30'].map((minutes) => (
                                                <div key={minutes} className="flex items-center space-x-2">
                                                    <input type="radio" id={`eta-${minutes}`} name="eta" value={minutes} checked={selectedETA === minutes} onChange={() => setSelectedETA(minutes)} className="w-4 h-4" />
                                                    <Label htmlFor={`eta-${minutes}`} className="text-sm font-medium cursor-pointer">{minutes} min</Label>
                                                </div>
                                            ))}
                                        </div>
                                    </RadioGroup>
                                    <div className="flex gap-3 justify-center">
                                        <Button type="button" variant="outline" onClick={() => setShowTimeSelection(false)} disabled={sendingOnMyWay}>Cancelar</Button>
                                        <Button type="button" className="bg-blue-600 hover:bg-blue-700" onClick={() => handleSendOnMyWay(parseInt(selectedETA))} disabled={sendingOnMyWay}>
                                            {sendingOnMyWay ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Enviando...</> : <><Send className="w-4 h-4 mr-2" />Enviar Notificación</>}
                                        </Button>
                                    </div>
                                </div>
                            )}
                            {onMyWaySuccess && <Alert className="border-green-200 bg-green-50 text-green-800"><CheckCircle className="h-4 w-4" /><AlertDescription>{onMyWaySuccess}</AlertDescription></Alert>}
                            {onMyWayError && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{onMyWayError}</AlertDescription></Alert>}
                        </div>
                    </div>
                </div>
            )}

            <Card>
                <CardHeader><CardTitle className="flex items-center gap-3 text-purple-600"><Users className="w-6 h-6" />Equipo de Limpiadores Asignados</CardTitle></CardHeader>
                <CardContent>
                    {schedule?.cleaner_ids?.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {schedule.cleaner_ids.map(cleanerId => {
                                const cleaner = allUsers.find(c => c.id === cleanerId);
                                return cleaner ? (
                                    <div key={cleanerId} className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                                        <Avatar className="w-10 h-10">
                                            <AvatarImage src={cleaner.profile_photo_url} />
                                            <AvatarFallback className="bg-blue-200 text-blue-800 font-semibold">{cleaner.full_name?.charAt(0).toUpperCase() || '?'}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1">
                                            <p className="font-medium text-slate-900">{cleaner.display_name || cleaner.invoice_name || cleaner.full_name}</p>
                                            {cleaner.email && <p className="text-sm text-slate-600">{cleaner.email}</p>}
                                        </div>
                                    </div>
                                ) : null;
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
                            <Users className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                            <p className="font-medium">No hay limpiadores asignados</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {onClockInOut && schedule.status !== 'completed' && (
                <div>
                    <h3 className="font-semibold text-blue-900 flex items-center gap-2 text-lg mb-3"><Clock className="w-6 h-6" />Control de Tiempo</h3>
                    <div className="bg-white rounded-lg border-2 p-4 space-y-4">
                        <div className="text-center">
                            {!hasClockIn && <div className="flex items-center justify-center gap-2 text-slate-500"><Clock className="w-5 h-5" /><span className="text-base font-medium">Servicio no iniciado</span></div>}
                            {hasClockIn && !hasClockOut && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-center gap-2 text-green-700"><Play className="w-5 h-5" /><span className="text-base font-semibold">Servicio EN PROGRESO</span></div>
                                    <p className="text-sm text-green-600">Iniciado: {format(new Date(cleanerClockData.clock_in_time), 'HH:mm')}</p>
                                    {currentServiceElapsedTime > 0 && (
                                        <div className="mt-4 p-4 bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg">
                                            <div className="text-center">
                                                <p className="text-sm text-slate-600 mb-2">Tu tiempo trabajado:</p>
                                                <div className="text-3xl font-mono font-bold text-slate-800">{formatTime(currentServiceElapsedTime)}</div>
                                                {timeRemaining !== null && (
                                                    <div className="mt-3">
                                                        <p className="text-sm text-slate-600 mb-1">Tu tiempo restante estimado:</p>
                                                        <div className="text-xl font-mono font-bold text-blue-700">{formatTime(timeRemaining)}</div>
                                                        {timeRemaining <= 300 && timeRemaining > 0 && <p className="text-sm text-amber-600 mt-2 font-medium">⚠️ Quedan menos de 5 minutos</p>}
                                                        {timeRemaining <= 0 && <p className="text-sm text-red-600 mt-2 font-medium">⏰ Tu parte del trabajo está completa</p>}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                            {hasClockOut && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-center gap-2 text-slate-700"><CheckCircle className="w-5 h-5" /><span className="text-base font-semibold">Servicio COMPLETADO</span></div>
                                    <div className="text-sm text-slate-600 space-y-1">
                                        <p>Iniciado: {format(new Date(cleanerClockData.clock_in_time), 'HH:mm')}</p>
                                        <p>Finalizado: {format(new Date(cleanerClockData.clock_out_time), 'HH:mm')}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Button type="button" size="lg" className={`font-bold text-lg py-4 ${hasClockIn && !hasClockOut ? 'bg-gray-400 text-gray-600 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white'}`} onClick={() => onClockInOut(schedule.id, 'clock_in')} disabled={hasClockIn && !hasClockOut}>
                                <Play className="w-6 h-6 mr-3" />CLOCK IN
                            </Button>
                            <Button type="button" size="lg" className={`font-bold text-lg py-4 ${!hasClockIn || hasClockOut ? 'bg-gray-400 text-gray-600 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 text-white'}`} onClick={() => onClockInOut(schedule.id, 'clock_out')} disabled={!hasClockIn || hasClockOut}>
                                <Square className="w-6 h-6 mr-3" />CLOCK OUT
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {schedule.status === 'completed' && (
                <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-200 text-center">
                    <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-3" />
                    <h3 className="text-lg font-semibold text-green-800 mb-2">Servicio Completado</h3>
                    <p className="text-green-700">Este servicio ha sido finalizado exitosamente.</p>
                    <p className="text-sm text-green-600 mt-2">Tu trabajo ha sido registrado automáticamente en el sistema.</p>
                </div>
            )}

            <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="w-5 h-5 text-blue-600" />Notas del Servicio</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    {clientDefaultNotes && (
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                            <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2"><Info className="w-4 h-4" />Notas Generales del Cliente</h4>
                            <p className="text-sm text-blue-800 whitespace-pre-wrap">{clientDefaultNotes}</p>
                        </div>
                    )}
                    {serviceSpecificNotes && (
                        <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
                            <h4 className="font-semibold text-amber-900 mb-2 flex items-center gap-2"><AlertCircle className="w-4 h-4" />Notas Especiales para Hoy</h4>
                            <p className="text-sm text-amber-800 whitespace-pre-wrap">{serviceSpecificNotes}</p>
                        </div>
                    )}
                    {!clientDefaultNotes && !serviceSpecificNotes && <p className="text-gray-500 italic text-center py-4">No hay notas para este servicio</p>}
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle className="flex items-center gap-3 text-purple-600"><Home className="w-6 h-6 text-purple-600"/>Información del Hogar y Acceso</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                    {selectedClient && (selectedClient.pets?.length > 0 || selectedClient.family_details) && (
                        <div className="bg-purple-50 border-l-4 border-purple-400 rounded-r-lg p-6">
                            <h3 className="font-semibold text-purple-900 flex items-center gap-2 mb-4"><Heart className="w-5 h-5" />Familia y Mascotas</h3>
                            <FamilyAndPetsManager client={selectedClient} onUpdate={() => {}} isReadOnly={true} />
                        </div>
                    )}
                    {selectedClient?.has_access && (
                        <div className="bg-amber-50 border-l-4 border-amber-400 p-6 rounded-r-lg">
                            <h3 className="font-semibold text-amber-900 flex items-center gap-2 mb-4"><KeySquare className="w-5 h-5" />Instrucciones de Acceso</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                                <div><p className="font-medium text-slate-500">Tipo:</p><p className="font-semibold text-slate-800">{{ key:'Llave Física', smart_lock:'Cerradura Inteligente', lockbox:'Caja de Seguridad' }[selectedClient.access_type] || 'Otro'}</p></div>
                                <div><p className="font-medium text-slate-500">Identificador:</p><p className="font-semibold text-slate-800">{selectedClient.access_identifier || 'N/A'}</p></div>
                                <div className="col-span-full"><p className="font-medium text-slate-500">Instrucciones:</p><p className="text-slate-800 whitespace-pre-wrap">{selectedClient.access_instructions || 'N/A'}</p></div>
                                {selectedClient.access_photos?.length > 0 && (
                                    <div className="col-span-full">
                                        <p className="font-medium text-slate-500 mb-2">Fotos de Ayuda:</p>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                            {selectedClient.access_photos.map((p, i) => (
                                                <div key={i} className="space-y-2">
                                                    <a href={p.url} target="_blank" rel="noopener noreferrer"><img src={p.url} alt={`Acceso ${i + 1}`} className="w-full h-32 object-cover rounded-lg border" /></a>
                                                    {p.comment && <p className="text-xs text-slate-600 bg-white p-2 rounded border">{p.comment}</p>}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    {selectedClient?.default_photo_urls?.length > 0 && (
                        <div className="bg-blue-50 border-l-4 border-blue-400 p-6 rounded-r-lg">
                            <h3 className="font-semibold text-blue-900 flex items-center gap-2 mb-4"><ImageIcon className="w-5 h-5" />Fotos de Referencia del Cliente</h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {selectedClient.default_photo_urls.map((photo, idx) => (
                                    <div key={idx} className="space-y-2">
                                        <a href={photo.url} target="_blank" rel="noopener noreferrer"><img src={photo.url} alt={photo.comment || `Referencia ${idx + 1}`} className="w-full h-32 object-cover rounded-lg border shadow-sm" /></a>
                                        {photo.comment && <p className="text-xs text-slate-600 bg-white p-2 rounded border">{photo.comment}</p>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="space-y-6">
                {(selectedClient?.structured_service_notes && Object.keys(selectedClient.structured_service_notes).some(area =>
                    selectedClient.structured_service_notes[area]?.notes || selectedClient.structured_service_notes[area]?.photos?.length > 0
                )) && (
                    <Card className="border-blue-500 border-2">
                        <CardHeader className="bg-blue-50">
                            <CardTitle className="flex items-center gap-3 text-blue-900"><ListChecks className="w-6 h-6" />Instrucciones por Área</CardTitle>
                            <p className="text-sm text-blue-700 pt-2">Revisa cuidadosamente las instrucciones específicas para cada área antes de comenzar.</p>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-8">
                            <StructuredServiceNotes structuredNotes={selectedClient.structured_service_notes} onUpdate={() => {}} isReadOnly={true} />
                        </CardContent>
                    </Card>
                )}

                {serviceSpecificPhotos?.length > 0 && (
                    <Card>
                        <CardHeader><CardTitle className="flex items-center gap-3 text-slate-800"><Paperclip className="w-5 h-5" />Fotos Adicionales para Este Servicio</CardTitle></CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                {serviceSpecificPhotos.map((photo, idx) => (
                                    <div key={idx} className="space-y-2">
                                        <a href={photo.url} target="_blank" rel="noopener noreferrer"><img src={photo.url} alt={photo.comment || `Foto ${idx + 1}`} className="w-full h-24 object-cover rounded-lg shadow-sm" /></a>
                                        {photo.comment && <p className="text-xs text-slate-600 bg-white p-2 rounded border">{photo.comment}</p>}
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            {selectedClient && (
                <Card className="bg-gradient-to-r from-green-50 to-blue-50 border-l-4 border-green-400">
                    <CardHeader>
                        <CardTitle className="font-semibold text-green-900 flex items-center gap-2 text-lg"><AlertTriangle className="w-6 h-6" />Reportar un Problema</CardTitle>
                        <p className="text-sm text-green-800">Si encuentras algo que el administrador deba saber sobre este servicio, repórtalo aquí.</p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="report_priority">Nivel de Prioridad</Label>
                            <Select value={reportPriority} onValueChange={setReportPriority}>
                                <SelectTrigger><SelectValue placeholder="Selecciona prioridad" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="low">🟢 Baja - Información general</SelectItem>
                                    <SelectItem value="medium">🟡 Media - Requiere atención</SelectItem>
                                    <SelectItem value="high">🟠 Alta - Problema importante</SelectItem>
                                    <SelectItem value="urgent">🔴 Urgente - Acción inmediata</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Descripción del Problema</Label>
                            <Textarea placeholder="Describe detalladamente lo que pasó..." value={reportNotes} onChange={(e) => setReportNotes(e.target.value)} rows={4} />
                        </div>
                        <div className="space-y-2">
                            <Label>Fotos del Problema (Opcional)</Label>
                            <PhotoUploader uploadedUrls={reportPhotos} onUrlsChange={setReportPhotos} isReadOnly={false} />
                        </div>
                        <Button type="button" className="bg-green-600 hover:bg-green-700 w-full sm:w-auto" onClick={handleSubmitReport} disabled={submittingReport}>
                            {submittingReport ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Enviando Reporte...</> : <><Send className="w-4 h-4 mr-2" />Enviar Reporte al Admin</>}
                        </Button>
                    </CardContent>
                </Card>
            )}

            <div className="flex justify-end items-center pt-6 border-t border-gray-200 bg-white sticky bottom-0 pb-4">
                <Button type="button" variant="outline" onClick={onCancel} className="px-6">Cerrar</Button>
            </div>
        </div>
    );
}