import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Clock, Users, Save, X, Trash2, AlertTriangle, AlertCircle, Loader2, Search, Wand2, KeySquare, FileText, Play, Square, CheckCircle, Navigation, Heart, MapPin, Send, Car, ExternalLink, Home, User, Camera, Upload, Phone, MessageSquare, Plus, Edit2, RotateCcw, ListChecks, Paperclip, ImageIcon, Info } from 'lucide-react';
import { format, parseISO, parse, differenceInMinutes, differenceInSeconds } from 'date-fns';
import { es } from 'date-fns/locale';
import { Client } from '@/entities/Client';
import { Schedule } from '@/entities/Schedule';
import { ServiceReport } from '@/entities/ServiceReport';
import { sendOnMyWaySms } from '@/functions/sendOnMyWaySms';
import { sendUpdateNotification } from '@/functions/sendUpdateNotification';
import { processScheduleForWorkEntries } from "@/functions/processScheduleForWorkEntries";
import { eliminarSerieRecurrente } from '@/functions/eliminarSerieRecurrente';
import { isEqual } from 'lodash';
import PhotoUploader from './PhotoUploader';
import ClientSearchCombobox from '../work/ClientSearchCombobox';
import CleanerTimesManager from './CleanerTimesManager';
import FamilyAndPetsManager from '../clients/FamilyAndPetsManager';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import StructuredServiceNotes from '../clients/StructuredServiceNotes';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { createPageUrl } from '@/utils'; // Import createPageUrl
import FundingValidationAlert, { getFundingValidation } from './FundingValidationAlert';
import ClockInDataSection from './ClockInDataSection';
import CleanerReadOnlyView from './CleanerReadOnlyView';
import CancellationSmsDialog from './CancellationSmsDialog';

export default function CrearServicioForm({
    onSave,
    onCancel,
    onDelete,
    schedule = null,
    users: allUsers = [],
    isReadOnly = false,
    selectedCleanerId = null,
    onClockInOut = null,
    openInMaps = null,
    currentServiceElapsedTime = 0,
    onUpdateSchedule,
    onCancelService,
    currentUser = null
}) {
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedClient, setSelectedClient] = useState(null); // Holds the full client object, always up-to-date
    const [hasExistingRegular, setHasExistingRegular] = useState(false);
    const [cleanerSchedules, setCleanerSchedules] = useState([]);
    const [updateScope, setUpdateScope] = useState('this_only');
    const [saving, setSaving] = useState(false);
    const [searchCleaner, setSearchCleaner] = useState('');
    const [timeRemaining, setTimeRemaining] = useState(null);
    const [cleanerConflicts, setCleanerConflicts] = useState(new Set());

    // Nuevos estados para el reporte de problema
    const [reportNotes, setReportNotes] = useState('');
    const [reportPhotos, setReportPhotos] = useState([]);
    const [reportPriority, setReportPriority] = useState('medium');
    const [submittingReport, setSubmittingReport] = useState(false);

    // Nuevos estados para notificación "En Camino"
    const [sendingOnMyWay, setSendingOnMyWay] = useState(false);
    const [onMyWayError, setOnMyWayError] = useState('');
    const [onMyWaySuccess, setOnMyWaySuccess] = useState('');
    const [showTimeSelection, setShowTimeSelection] = useState(false);
    const [selectedETA, setSelectedETA] = useState('10'); // Por defecto 10 minutos

    // Nuevos estados para notificación de cambios
    const [sendingUpdate, setSendingUpdate] = useState(false);
    const [updateError, setUpdateError] = useState('');
    const [updateSuccess, setUpdateSuccess] = useState('');

    // Estado para herramientas administrativas (Ahora se usa 'loading' para los procesos de admin)
    // Eliminado: const [adminProcessing, setAdminProcessing] = useState(false);
    // Eliminado: const [adminProcessingMessage, setAdminProcessingMessage] = useState("");

    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [error, setError] = useState('');
    const [showCancellationDialog, setShowCancellationDialog] = useState(false);
    const [cancellationSmsText, setCancellationSmsText] = useState(''); // Add this state for general errors, especially deletion

    // NUEVO: Estado separado para las Notas Generales por Defecto (NGPD) del cliente
    const [clientDefaultNotes, setClientDefaultNotes] = useState('');
    const [clientDefaultNotesModified, setClientDefaultNotesModified] = useState(false);

    // NUEVO: Estado para el cronómetro en vivo
    const [liveCleanerTimes, setLiveCleanerTimes] = useState({});
    // isLoading (from outline) is now handled by the general `loading` state for the whole form.

    const isNewService = !schedule?.id; // Determine if it's a new service

    // MODIFICADO: `client_address` y `structured_service_notes` eliminados del formData
    // `client_address` se tomará de `selectedClient.address` y se incluirá en el payload al guardar
    // `structured_service_notes` se leerán directamente de `selectedClient` para la visualización.
    const [formData, setFormData] = useState({
        client_id: '',
        client_name: '',
        client_address: '', // Still part of formData for saving a snapshot, but derived from selectedClient
        cleaner_ids: [],
        start_date: format(new Date(), 'yyyy-MM-dd'),
        start_time: '09:00',
        end_time: '13:00',
        service_specific_notes: '',
        // structured_service_notes removed from formData state. It's read from selectedClient
        service_specific_photos: [],
        notes_private: '',
        recurrence_rule: 'none',
        status: 'scheduled', // Agregar estado por defecto
    });

    const [originalScheduleTimes, setOriginalScheduleTimes] = useState(null);
    const [originalRecurrenceRule, setOriginalRecurrenceRule] = useState('none');

    const fundingValidation = useMemo(() => getFundingValidation(selectedClient, formData.start_date), [selectedClient, formData.start_date]);

    const cleanerClockData = useMemo(() => schedule?.clock_in_data?.find(c => c.cleaner_id === selectedCleanerId), [schedule, selectedCleanerId]);
    const hasClockIn = !!cleanerClockData?.clock_in_time;
    const hasClockOut = !!cleanerClockData?.clock_out_time;

    // Helper function for form input changes
    const handleInputChange = useCallback((e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    }, []);

    const duracionExacta = useMemo(() => {
        if (!formData.start_time || !formData.end_time) return 0;
        const fechaInicio = new Date(`1970-01-01T${formData.start_time}:00`);
        const fechaFin = new Date(`1970-01-01T${formData.end_time}:00`);
        if (fechaFin <= fechaInicio) {
            return 0;
        }
        const diffMs = fechaFin.getTime() - fechaInicio.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);
        return Math.round(diffHours * 100) / 100;
    }, [formData.start_time, formData.end_time]);

    const formatearDuracion = (horas) => {
        if (!horas || horas <= 0) return '0min';
        const h = Math.floor(horas);
        const m = Math.round((horas - h) * 60);
        if (h > 0 && m > 0) return `${h}h ${m}min`;
        if (h > 0) return `${h}h`;
        return `${m}min`;
    };

    const calculateDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const d = R * c;
        return d * 1000;
    };

    const openLocationInMaps = (latitude, longitude, title = 'Ubicación') => {
        if (latitude && longitude) {
            const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
            window.open(mapsUrl, '_blank');
        }
    };

    const parseGPSCoordinates = (locationString) => {
        if (!locationString || typeof locationString !== 'string') return null;

        const coords = locationString.split(',');
        if (coords.length === 2) {
            const lat = parseFloat(coords[0].trim());
            const lng = parseFloat(coords[1].trim());

            if (!isNaN(lat) && !isNaN(lng)) {
                return { latitude: lat, longitude: lng };
            }
        }
        return null;
    };

    const isLocationNearClient = (gpsCoords, clientAddress) => {
        return { isNear: null, distance: null, note: "Comparación con dirección del cliente disponible con geocoding API" };
    };

    // Load clients for the combobox
    useEffect(() => {
        const loadClients = async () => {
            try {
                const clientsData = await Client.list();
                setClients(clientsData.filter(c => c.active !== false));
            } catch (error) {
                console.error('Error cargando clientes:', error);
                setError('Error al cargar clientes.');
            }
        };
        loadClients();
    }, []);

    // NEW FUNCTION: Load schedule data and client details
    const loadScheduleData = useCallback(async () => {
        if (!schedule || !schedule.id) return; // This check is crucial for loadScheduleData

        setLoading(true);
        setError('');

        try {
            let client = null;
            if (schedule.client_id) {
                try {
                    // MODIFICADO: Siempre recargar el cliente para tener la información más actualizada
                    client = await Client.get(schedule.client_id);
                    setSelectedClient(client);
                    setClientDefaultNotes(client.default_service_notes || ''); // Load the default notes
                    setClientDefaultNotesModified(false); // Reset modified flag
                } catch (clientError) {
                    console.warn('[CrearServicioForm] No se pudo cargar el cliente actual:', clientError);
                    setSelectedClient(null); // Clear selected client if not found
                    setClientDefaultNotes(''); // Clear default notes
                    setClientDefaultNotesModified(false); // Reset modified flag
                    setError('Error: No se pudo cargar la información del cliente asociado a este servicio.');
                }
            } else {
                setSelectedClient(null);
                setClientDefaultNotes(''); // Clear default notes
                setClientDefaultNotesModified(false); // Reset modified flag
            }

            // Guardar los tiempos originales del schedule para calcular diferencias
            if (!schedule.preselected_date) {
                setOriginalScheduleTimes({
                    start: parseISO(schedule.start_time),
                    end: parseISO(schedule.end_time),
                });
            } else {
                setOriginalScheduleTimes(null);
            }

            // Extract date and times from ISO format
            const startDate = schedule.start_time ? schedule.start_time.slice(0, 10) : format(new Date(), 'yyyy-MM-dd');
            const startTime = schedule.start_time ? schedule.start_time.slice(11, 16) : '';
            const endTime = schedule.end_time ? schedule.end_time.slice(11, 16) : '';

            setFormData({
                client_id: schedule.client_id || '',
                client_name: schedule.client_name || '',
                client_address: schedule.client_address || '', // Still needs to be in formData for saving snapshot
                cleaner_ids: schedule.cleaner_ids || [],
                start_date: startDate,
                start_time: startTime,
                end_time: endTime,
                service_specific_notes: schedule.service_specific_notes || '',
                // structured_service_notes is removed from formData, read from selectedClient
                service_specific_photos: schedule.photo_urls || [],
                notes_private: schedule.notes_private || '',
                recurrence_rule: schedule.recurrence_rule || 'none',
                status: schedule.status || 'scheduled',
            });
            setCleanerSchedules(schedule.cleaner_schedules || []);

            setOriginalRecurrenceRule(schedule.recurrence_rule || 'none');
            setUpdateScope('this_only'); // Reset scope to default

        } catch (error) {
            console.error('[CrearServicioForm] Error loading schedule data:', error);
            setError('Error al cargar datos del servicio.');
        } finally {
            setLoading(false);
        }
    }, [schedule]);

    // CORREGIDO: useEffect para cargar información del schedule
    // Este efecto se encarga de inicializar el formulario cuando el prop 'schedule' cambia,
    // diferenciando entre editar un servicio existente, crear uno nuevo con fecha preseleccionada,
    // o crear uno nuevo completamente desde cero.
    useEffect(() => {
        // IMPORTANTE: Primero verificar si tiene ID (es un schedule existente)
        if (schedule?.id) {
            loadScheduleData();
        }
        // Es un nuevo servicio con fecha preseleccionada desde el calendario
        else if (schedule?.preselected_date) {
            // Inicializar formData completamente, sobrescribiendo cualquier valor anterior,
            // pero estableciendo la fecha y horas desde los valores preseleccionados.
            setFormData({
                client_id: '', // Resetear información del cliente para un nuevo servicio
                client_name: '',
                client_address: '',
                cleaner_ids: [],
                start_date: schedule.preselected_date, // Usar fecha preseleccionada
                start_time: schedule.preselected_start_time || '09:00', // Usar hora de inicio preseleccionada o por defecto
                end_time: schedule.preselected_end_time || '13:00',   // Usar hora de fin preseleccionada o por defecto
                service_specific_notes: '',
                service_specific_photos: [],
                notes_private: '',
                recurrence_rule: 'none',
                status: 'scheduled',
            });
            // También resetear otros estados relacionados para un nuevo servicio
            setCleanerSchedules([]);
            setSelectedClient(null);
            setClientDefaultNotes(''); // Clear for new service
            setClientDefaultNotesModified(false); // Clear for new service
            setOriginalRecurrenceRule('none');
            setUpdateScope('this_only');
            setLoading(false); // Finalizó la carga/inicialización para fecha preseleccionada
        }
        // Estamos creando un nuevo servicio sin preselección de fecha/hora (schedule es null/undefined)
        else {
            console.log("Reseteando formulario para nuevo servicio sin preselección de fecha.");
            setFormData({
                client_id: '',
                client_name: '',
                client_address: '',
                cleaner_ids: [],
                start_date: format(new Date(), 'yyyy-MM-dd'),
                start_time: '09:00',
                end_time: '13:00',
                service_specific_notes: '',
                service_specific_photos: [],
                notes_private: '',
                recurrence_rule: 'none',
                status: 'scheduled',
            });
            setCleanerSchedules([]);
            setSelectedClient(null);
            setClientDefaultNotes(''); // Clear for new service
            setClientDefaultNotesModified(false); // Clear for new service
            setOriginalRecurrenceRule('none');
            setUpdateScope('this_only');
            setLoading(false); // Finalizó la carga/inicialización para nuevo servicio
        }
    }, [schedule, loadScheduleData]); // loadScheduleData es una dependencia

    // Enhanced time calculation for cleaner view
    useEffect(() => {
        if (isReadOnly && hasClockIn && !hasClockOut && schedule && currentServiceElapsedTime > 0) {
            const scheduledStart = new Date(schedule.start_time);
            const scheduledEnd = new Date(schedule.end_time);
            const scheduledDurationHours = (scheduledEnd - scheduledStart) / (1000 * 60 * 60);
            const assignedCleaners = schedule.cleaner_ids?.length || 1;
            const totalWorkUnits = scheduledDurationHours * assignedCleaners;

            let personHoursCompleted = 0;
            let activeCleaners = 0;

            if (schedule.clock_in_data) {
                schedule.clock_in_data.forEach(clockData => {
                    if (clockData.clock_in_time) {
                        const clockInTime = new Date(clockData.clock_in_time);

                        if (clockData.clock_out_time) {
                            const clockOutTime = new Date(clockData.clock_out_time);
                            const hoursWorked = (clockOutTime - clockInTime) / (1000 * 60 * 60);
                            personHoursCompleted += hoursWorked;
                        } else {
                            const hoursWorked = (new Date() - clockInTime) / (1000 * 60 * 60);
                            personHoursCompleted += hoursWorked;
                            activeCleaners += 1;
                        }
                    }
                });
            }

            const personHoursRemaining = Math.max(0, totalWorkUnits - personHoursCompleted);
            const timeRemainingPerPerson = activeCleaners > 0 ? personHoursRemaining / activeCleaners : 0;

            setTimeRemaining(timeRemainingPerPerson * 3600); // Convert to seconds for display
        } else {
            setTimeRemaining(null);
        }
    }, [isReadOnly, hasClockIn, hasClockOut, schedule, currentServiceElapsedTime]);

    const formatTime = (seconds) => {
        if (seconds < 0 || seconds === null) return "00:00:00";
        const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
        const m = Math.floor(((seconds % 3600) / 60)).toString().padStart(2, '0');
        const s = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    };

    useEffect(() => {
        const formatDuration = (totalSeconds) => {
            if (isNaN(totalSeconds) || totalSeconds < 0) return '00:00:00';
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = Math.floor(totalSeconds % 60);
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        };

        if (isReadOnly || !schedule?.clock_in_data || schedule.clock_in_data.length === 0) {
            setLiveCleanerTimes({});
            return;
        }

        const intervalId = setInterval(() => {
            const now = new Date();
            const newTimes = {};

            const cleanerSchedulesMap = new Map(
                schedule.cleaner_schedules?.map(cs => [cs.cleaner_id, cs]) || []
            );

            schedule.clock_in_data.forEach(cleanerData => {
                const cleanerId = cleanerData.cleaner_id;
                const cleanerSchedule = cleanerSchedulesMap.get(cleanerId);

                let scheduledDurationSeconds = 0;
                if (cleanerSchedule?.start_time && cleanerSchedule?.end_time) {
                    scheduledDurationSeconds = differenceInSeconds(new Date(cleanerSchedule.end_time), new Date(cleanerSchedule.start_time));
                } else if (schedule.start_time && schedule.end_time) {
                    scheduledDurationSeconds = differenceInSeconds(new Date(schedule.end_time), new Date(schedule.start_time));
                }
                
                let workedSeconds = 0;
                let isLive = false;
                if (cleanerData.clock_in_time) {
                    const clockIn = new Date(cleanerData.clock_in_time);
                    if (cleanerData.clock_out_time) {
                        const clockOut = new Date(cleanerData.clock_out_time);
                        workedSeconds = differenceInSeconds(clockOut, clockIn);
                    } else {
                        workedSeconds = differenceInSeconds(now, clockIn);
                        isLive = true;
                    }
                }

                const remainingSeconds = Math.max(0, scheduledDurationSeconds - workedSeconds);
                const progress = scheduledDurationSeconds > 0 ? Math.min(100, (workedSeconds / scheduledDurationSeconds) * 100) : 0;
                
                newTimes[cleanerId] = {
                    workedTime: formatDuration(workedSeconds),
                    remainingTime: formatDuration(remainingSeconds),
                    progress: progress,
                    isLive: isLive,
                };
            });
            setLiveCleanerTimes(newTimes);
        }, 1000);

        return () => clearInterval(intervalId);

    }, [schedule, isReadOnly]);

    const checkCleanerConflicts = useCallback(() => {
        if (!formData.start_date || !formData.start_time || !formData.end_time) {
            setCleanerConflicts(new Set());
            return;
        }

        if (isReadOnly) {
            setCleanerConflicts(new Set());
            return;
        }

        const runConflictCheck = async () => {
            try {
                const allSchedules = await Schedule.list();
                const conflictedCleaners = new Set();

                const newStartTime = new Date(`${formData.start_date}T${formData.start_time}:00.000Z`);
                const newEndTime = new Date(`${formData.start_date}T${formData.end_time}:00.000Z`);

                if (isNaN(newStartTime.getTime()) || isNaN(newEndTime.getTime())) {
                    console.warn('Invalid dates for conflict checking, clearing conflicts.');
                    setCleanerConflicts(new Set());
                    return;
                }

                allUsers.filter(u => u.role !== 'admin' && u.active !== false).forEach(user => {
                    const userServices = allSchedules.filter(s =>
                        s.id !== schedule?.id &&
                        s.cleaner_ids?.includes(user.id) &&
                        ['scheduled', 'in_progress'].includes(s.status || 'scheduled') &&
                        format(new Date(s.start_time), 'yyyy-MM-dd') === formData.start_date
                    );

                    for (const service of userServices) {
                        let serviceStart = new Date(service.start_time);
                        let serviceEnd = new Date(service.end_time);

                        const specificSchedule = service.cleaner_schedules?.find(cs => cs.cleaner_id === user.id);
                        if (specificSchedule) {
                            serviceStart = new Date(specificSchedule.start_time);
                            serviceEnd = new Date(specificSchedule.end_time);
                        }

                        if (isNaN(serviceStart.getTime()) || isNaN(serviceEnd.getTime())) {
                            console.warn(`Service ${service.id} has invalid dates, skipping for conflict check.`);
                            continue;
                        }

                        const bufferMs = 60 * 1000;
                        const hasOverlap = (
                            newStartTime.getTime() < (serviceEnd.getTime() + bufferMs) &&
                            newEndTime.getTime() > (serviceStart.getTime() - bufferMs)
                        );

                        if (hasOverlap) {
                            conflictedCleaners.add(user.id);
                            break;
                        }
                    }
                });

                setCleanerConflicts(conflictedCleaners);
            } catch (error) {
                console.error('Error checking cleaner conflicts:', error);
                setCleanerConflicts(new Set());
            }
        };

        runConflictCheck();
    }, [formData.start_date, formData.start_time, formData.end_time, allUsers, schedule?.id, isReadOnly]);

    useEffect(() => {
        checkCleanerConflicts();
    }, [checkCleanerConflicts]);

    useEffect(() => {
        const checkExisting = async () => {
            if (!selectedClient || !formData.recurrence_rule || formData.recurrence_rule === 'none' || schedule?.id) {
                setHasExistingRegular(false); return;
            }
            try {
                const clientSchedules = await Schedule.list();
                const hasRegular = clientSchedules.some(s => s.client_id === selectedClient.id && s.recurrence_rule && s.recurrence_rule !== 'none');
                setHasExistingRegular(hasRegular);
            } catch (error) {
                console.error("Error verificando servicios regulares:", error);
            }
        };
        checkExisting();
    }, [selectedClient, formData.recurrence_rule, schedule?.id]);

    // MODIFICADO: `handleClientSelect` para cargar info de cliente en tiempo real
    const handleClientSelect = useCallback(async (client) => {
        if (isReadOnly) return;

        if (!client) {
            setSelectedClient(null);
            setFormData(prev => ({
                ...prev,
                client_id: '',
                client_name: '',
                client_address: '', // Clear address from formData as well
                service_specific_notes: '', // Clear service notes too if client is cleared
            }));
            setClientDefaultNotes(''); // Clear for no client
            setClientDefaultNotesModified(false); // Reset
            return;
        }

        // Fetch the full client details to ensure it's up-to-date
        try {
            const fetchedClient = await Client.get(client.id);
            setSelectedClient(fetchedClient);
            setClientDefaultNotes(fetchedClient.default_service_notes || ''); // Load client's default notes
            setClientDefaultNotesModified(false); // Reset

            setFormData(prev => {
                const newFormData = {
                    ...prev,
                    client_id: fetchedClient.id,
                    client_name: fetchedClient.name,
                    client_address: fetchedClient.address || '', // Update client_address in formData
                };

                // Only pre-fill general notes for NEW services when a client is selected
                if (isNewService) {
                    newFormData.service_specific_notes = fetchedClient.default_service_notes || '';
                    // structured_service_notes are read directly from selectedClient, not copied to formData
                }
                return newFormData;
            });

            console.log('[CrearServicioForm] Client selected:', fetchedClient.name);
        } catch (error) {
            console.error('[CrearServicioForm] Error al seleccionar cliente:', error);
            setError('Error al cargar los detalles del cliente.');
            setSelectedClient(null);
            setClientDefaultNotes(''); // Clear default notes
            setClientDefaultNotesModified(false); // Reset
            setFormData(prev => ({ ...prev, client_id: '', client_name: '', client_address: '' }));
        }
    }, [isReadOnly, isNewService]);


    const handleCleanerToggle = (cleanerId) => {
        if (isReadOnly) return;
        setFormData(prev => ({ ...prev, cleaner_ids: prev.cleaner_ids.includes(cleanerId) ? prev.cleaner_ids.filter(id => id !== cleanerId) : [...prev.cleaner_ids, cleanerId] }));
    };

    const handleCleanerSchedulesChange = (schedules) => setCleanerSchedules(schedules);

    const getCombinedPhotos = useCallback(() => {
        const clientPhotos = selectedClient?.default_photo_urls || [];
        const servicePhotos = formData.service_specific_photos || [];
        const normalize = p => p.map(photo => typeof photo === 'string' ? { url: photo, comment: '' } : { url: photo.url || '', comment: photo.comment || '' });
        return [...normalize(clientPhotos), ...normalize(servicePhotos)];
    }, [selectedClient, formData.service_specific_photos]);

    const getServiceFrequencyLabel = (f) => ({ weekly: "Semanal", fortnightly: "Quincenal", every_3_weeks: "Cada 3 semanas", monthly: "Mensual", one_off: "Servicio único" }[f] || f || 'No especificada');

    const handleSubmit = async (e) => {
        console.log("handleSubmit se ha llamado!");
        e.preventDefault();
        if (isReadOnly) return;

        setError('');
        setSaving(true);

        if (!selectedClient) {
            setError('Debe seleccionar un cliente.');
            setSaving(false);
            return;
        }

        if (!formData.start_date || !formData.start_time || !formData.end_time) {
            setError('Debe completar la fecha y horarios del servicio.');
            setSaving(false);
            return;
        }

        if (fundingValidation && !fundingValidation.valid) {
            setError(fundingValidation.message);
            setSaving(false);
            return;
        }

        const startDateTime = { toISOString: () => `${formData.start_date}T${formData.start_time}:00.000`, getTime: () => new Date(`${formData.start_date}T${formData.start_time}:00`).getTime() };
        const endDateTime = { toISOString: () => `${formData.start_date}T${formData.end_time}:00.000`, getTime: () => new Date(`${formData.start_date}T${formData.end_time}:00`).getTime() };

        if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
            setError('Las fechas y horas ingresadas no son válidas.');
            setSaving(false);
            return;
        }

        if (endDateTime.getTime() <= startDateTime.getTime()) {
            setError('La hora de finalización debe ser posterior a la hora de inicio.');
            setSaving(false);
            return;
        }

        try {
            // MODIFICADO: `structured_service_notes` eliminado del payload. `client_address` es de formData.
            const serviceData = {
                client_id: selectedClient.id,
                client_name: selectedClient.name,
                client_address: formData.client_address || '', // Snapshot of address at time of saving
                cleaner_ids: formData.cleaner_ids,
                start_time: startDateTime.toISOString(), // UTC desde hora local Melbourne
                end_time: endDateTime.toISOString(),
                cleaner_schedules: cleanerSchedules.length > 0 ? cleanerSchedules.map(cs => {
                    const csStartTime = cs.start_time ? cs.start_time.slice(11, 16) : formData.start_time;
                    const csEndTime = cs.end_time ? cs.end_time.slice(11, 16) : formData.end_time;
                    return {
                        ...cs,
                        start_time: `${formData.start_date}T${csStartTime}:00.000`,
                        end_time: `${formData.start_date}T${csEndTime}:00.000`
                    };
                }) : null,
                service_specific_notes: formData.service_specific_notes || '',
                // structured_service_notes: formData.structured_service_notes || {}, // ELIMINADO
                notes_private: formData.notes_private || '',
                photo_urls: formData.service_specific_photos || [],
                recurrence_rule: formData.recurrence_rule !== 'none' ? formData.recurrence_rule : null,
                recurrence_id: schedule?.recurrence_id || null,
                status: formData.status || 'scheduled',
            };

            if (serviceData.cleaner_ids && serviceData.cleaner_ids.length > 0) {
                const assignedCleaners = allUsers.filter(u => serviceData.cleaner_ids.includes(u.id));
                if (assignedCleaners.length > 0) {
                    assignedCleaners.sort((a, b) => {
                        const dateA = a.start_date ? new Date(a.start_date) : new Date('9999-12-31');
                        const dateB = b.start_date ? new Date(b.start_date) : new Date('9999-12-31');
                        if (dateA < dateB) return -1;
                        if (dateA > dateB) return 1;
                        return 0;
                    });
                    
                    const mostExperiencedCleaner = assignedCleaners[0];
                    if (mostExperiencedCleaner.color) {
                        serviceData.color = mostExperiencedCleaner.color;
                        console.log(`Color del servicio asignado basado en ${mostExperiencedCleaner.full_name || mostExperiencedCleaner.invoice_name}: ${mostExperiencedCleaner.color}`);
                    } else {
                        serviceData.color = '#3b82f6';
                    }
                }
            } else {
                serviceData.color = '#64748b';
            }

            if (schedule?.id) {
                if (schedule.clock_in_data) serviceData.clock_in_data = schedule.clock_in_data;
                if (schedule.reconciliation_items) serviceData.reconciliation_items = schedule.reconciliation_items;
                if (schedule.xero_invoiced) serviceData.xero_invoiced = schedule.xero_invoiced;
            }

            // IMPORTANT: If clientDefaultNotes were modified, update the client
            if (clientDefaultNotesModified && selectedClient) {
                try {
                    await Client.update(selectedClient.id, {
                        default_service_notes: clientDefaultNotes // Use the separate state
                    });
                    console.log('[CrearServicioForm] ✅ Default service notes updated on client.');
                } catch (clientUpdateError) {
                    console.error('[CrearServicioForm] ❌ Error updating client default notes:', clientUpdateError);
                    setError(`Advertencia: El servicio se guardó pero las notas generales del cliente no pudieron actualizarse: ${clientUpdateError.message}`);
                }
            }

            let finalUpdateScope;

            if (isNewService) {
                if (formData.recurrence_rule !== 'none') {
                    finalUpdateScope = 'new_recurring';
                } else {
                    finalUpdateScope = 'this_only';
                }
            } else {
                const originalRecurrence = originalRecurrenceRule;
                const newRecurrence = formData.recurrence_rule || 'none';

                if (originalRecurrence === 'none' && newRecurrence !== 'none') {
                    finalUpdateScope = 'new_recurring';
                } else {
                    if (schedule.recurrence_id && originalRecurrence !== 'none') {
                        finalUpdateScope = updateScope;
                    } else if (!schedule.recurrence_id && originalRecurrence === 'none' && newRecurrence !== 'none') {
                        finalUpdateScope = 'new_recurring';
                    } else {
                        finalUpdateScope = 'this_only';
                    }
                }
            }
            console.log(`[CrearServicioForm] 🎯 Scope final enviado al backend: ${finalUpdateScope}`);
            await onSave(serviceData, finalUpdateScope);
            console.log('[CrearServicioForm] Servicio guardado exitosamente');

        } catch (error) {
            console.error('Error al guardar:', error);
            setError(error.response?.data?.error || error.message || 'Error al guardar el servicio');
        } finally {
            setSaving(false);
        }
    };

    const handleSendUpdate = async () => {
        if (!schedule || !schedule.id) return;

        setSendingUpdate(true);
        setUpdateError('');
        setUpdateSuccess('');

        try {
            await sendUpdateNotification({ scheduleId: schedule.id });
            setUpdateSuccess('¡Notificación de cambio enviada al cliente!');
        } catch (error) {
            console.error('Error enviando notificación de cambio:', error);
            setUpdateError(error.response?.data?.error || 'No se pudo enviar la notificación.');
        } finally {
            setSendingUpdate(false);
            setTimeout(() => {
                setUpdateError('');
                setUpdateSuccess('');
            }, 5000);
        }
    };

    const handleSendOnMyWay = async (estimatedMinutes = null) => {
        if (!schedule || !schedule.id || schedule.on_my_way_sent_at) return;

        setSendingOnMyWay(true);
        setOnMyWayError('');
        setOnMyWaySuccess('');
        setShowTimeSelection(false);

        try {
            const { data } = await sendOnMyWaySms({
                scheduleId: schedule.id,
                estimatedArrivalMinutes: estimatedMinutes
            });
            if (data.success && data.updatedSchedule) {
                setOnMyWaySuccess('¡Notificación enviada al cliente!');
                if (onUpdateSchedule) {
                    onUpdateSchedule(data.updatedSchedule);
                }
            } else {
                throw new Error(data.error || 'Error desconocido al enviar la notificación.');
            }
        } catch (error) {
            console.error('Error al enviar "En Camino":', error);
            setOnMyWayError(error.response?.data?.error || error.message || 'No se pudo enviar la notificación.');
        } finally {
            setSendingOnMyWay(false);
            setTimeout(() => {
                setOnMyWayError('');
                setOnMyWaySuccess('');
            }, 5000);
        }
    };

    const handleSubmitReport = async () => {
        if (!reportNotes.trim()) {
            alert('Por favor describe el problema antes de enviar el reporte.');
            return;
        }

        setSubmittingReport(true);
        try {
            const cleaner = allUsers.find(u => u.id === selectedCleanerId);
            const cleanerName = cleaner ? (cleaner.display_name || cleaner.invoice_name || cleaner.full_name) : 'Limpiador desconocido';

            const reportData = {
                schedule_id: schedule.id,
                cleaner_id: selectedCleanerId,
                cleaner_name: cleanerName,
                client_name: schedule.client_name,
                service_date: format(parseISO(schedule.start_time), 'yyyy-MM-dd'),
                report_notes: reportNotes.trim(),
                report_photos: reportPhotos,
                priority: reportPriority,
                status: 'pending'
            };

            await ServiceReport.create(reportData);

            try {
                const { notifyAdminOfServiceReport } = await import('@/functions/notifyAdminOfServiceReport');
                await notifyAdminOfServiceReport({
                    report: reportData,
                    cleaner_name: reportData.cleaner_name,
                    client_name: schedule.client_name,
                    service_date: reportData.service_date
                });
            } catch (emailError) {
                console.error('Error enviando notificación:', emailError);
            }

            alert('Reporte enviado exitosamente. El administrador será notificado.');

            setReportNotes('');
            setReportPhotos([]);
            setReportPriority('medium');

        } catch (error) {
            console.error('Error enviando reporte:', error);
            alert('Error al enviar el reporte. Inténtalo nuevamente.');
        } finally {
            setSubmittingReport(false);
        }
    };

    const handleForceComplete = async () => {
        if (!schedule?.id) return;

        try {
            setLoading(true);

            // PASO 1: Marcar el servicio como completado
            await Schedule.update(schedule.id, { status: 'completed' });
            console.log('[CrearServicioForm] ✅ Servicio forzado a "completed" por administrador');

            // PASO 2: Generar entradas de trabajo automáticamente
            try {
                console.log('[CrearServicioForm] 🔄 Iniciando creación automática de entradas de trabajo...');
                const { data } = await processScheduleForWorkEntries({
                    scheduleId: schedule.id,
                    mode: 'create'
                });

                if (data.success && data.created_entries > 0) {
                    console.log(`[CrearServicioForm] ✅ Se crearon ${data.created_entries} entrada(s) de trabajo.`);
                    alert(`✅ Servicio marcado como completado. Se crearon ${data.created_entries} entradas de trabajo automáticamente.`);
                } else if (data.success) {
                    console.warn('[CrearServicioForm] ⚠️ No se crearon nuevas entradas (posiblemente ya existían o tarifa es cero).');
                    alert('✅ Servicio marcado como completado. Las entradas de trabajo ya existían o no se requirieron nuevas.');
                } else {
                    throw new Error(data.error || 'Error desconocido al crear entradas de trabajo.');
                }
            } catch (error) {
                console.error("[CrearServicioForm] ❌ Error creando entradas de trabajo:", error);
                alert(`⚠️ El servicio fue marcado como completado, pero hubo un error al crear las entradas de trabajo: ${error.message}`);
            }

            // PASO 3: Cerrar el formulario y actualizar la lista
            onCancel();

        } catch (error) {
            console.error('[CrearServicioForm] ❌ Error al forzar completado:', error);
            alert(`Error al marcar como completado: ${error.message || 'Error desconocido'}`);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteClick = () => {
        if (!schedule?.id) return;
        if (schedule.recurrence_id) {
            setShowDeleteDialog(true);
        } else {
            handleConfirmDelete('only_this');
        }
    };

    const handleConfirmDelete = async (deleteMode) => {
        if (!schedule?.id) return;

        setDeleteLoading(true);
        setError('');

        try {
            const response = await eliminarSerieRecurrente({
                scheduleId: schedule.id,
                deleteMode: deleteMode
            });

            if (response.data.success) {
                console.log(`Eliminación exitosa: ${response.data.deletedCount} servicio(s) eliminado(s).`);

                if (onDelete) {
                    onDelete();
                }
                if (onCancel) {
                    onCancel();
                }
            } else {
                throw new Error(response.data.error || "Error desconocido al eliminar el servicio.");
            }

        } catch (error) {
            console.error('Error durante la eliminación del servicio:', error);
            let errorMessage = 'No se pudo eliminar el servicio. Por favor, inténtalo de nuevo.';
            if (error.response?.data?.error) {
                errorMessage = error.response.data.error;
            } else if (error.message.includes('not found')) {
                errorMessage = 'El servicio ya fue eliminado previamente.';
            }
            setError(errorMessage);

            if (error.message.includes('not found') || error.response?.status === 404) {
                 if (onCancel) onCancel();
            }

        } finally {
            setDeleteLoading(false);
        }
    };

    const handleStatusChange = async (value) => {
        setFormData(prev => ({ ...prev, status: value }));
        if (value === 'cancelled' && schedule?.id && selectedClient) {
            try {
                const { SystemSetting } = await import('@/entities/SystemSetting');
                const settings = await SystemSetting.list();
                const cancellationSetting = settings.find(s => s.key === 'sms_template_cancellation');
                let template = cancellationSetting?.value || 'Hola {client_name}, lamentamos informarte que el servicio del {service_date} a las {service_time} ha sido cancelado. Por favór contáctanos para reprogramar. Gracias.';
                const serviceDate = schedule.start_time ? new Date(schedule.start_time) : new Date();
                const monthNames = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
                const dateStr = `${serviceDate.getUTCDate()} de ${monthNames[serviceDate.getUTCMonth()]}`;
                const timeStr = `${String(serviceDate.getUTCHours()).padStart(2,'0')}:${String(serviceDate.getUTCMinutes()).padStart(2,'0')}`;
                const clientSmsName = selectedClient.sms_name || selectedClient.name || '';
                template = template.replace(/\{client_name\}/g, clientSmsName).replace(/\{service_date\}/g, dateStr).replace(/\{service_time\}/g, timeStr);
                setCancellationSmsText(template);
            } catch (err) {
                const clientSmsName = selectedClient.sms_name || selectedClient.name || '';
                setCancellationSmsText(`Hola ${clientSmsName}, lamentamos informarte que tu servicio ha sido cancelado. Por favor contáctanos para reprogramar. Gracias.`);
            }
            setShowCancellationDialog(true);
        }
    };

    const handleTimeChange = (field, value) => {
        if (value && value.match(/^\d{2}:\d{2}$/)) {
            setFormData(prev => ({ ...prev, [field]: value }));
        }
    };

    const getTimeSuggestions = () => {
        return [
            { label: 'Mañana temprano', times: ['07:00', '07:30', '08:00', '08:30'] },
            { label: 'Mañana', times: ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30'] },
            { label: 'Mediodía', times: ['12:00', '12:30', '13:00', '13:30'] },
            { label: 'Tarde', times: ['14:00', '14:30', '15:00', '15:30', '16:00', '16:30'] },
            { label: 'Tarde-noche', times: ['17:00', '17:30', '18:00', '18:30'] }
        ];
    };

    const applyTimeSuggestion = (startTime) => {
        const [hours, minutes] = startTime.split(':').map(Number);
        const endDate = new Date(1970, 0, 1, hours, minutes + 150);
        const endTime = endDate.toTimeString().slice(0, 5);
        
        setFormData(prev => ({
            ...prev,
            start_time: startTime,
            end_time: endTime
        }));
    };

    const getServiceStatusDisplay = () => {
        if (!schedule) return null;

        const status = schedule.status;
        
        switch (status) {
            case 'scheduled':
                return {
                    label: 'Programado',
                    color: 'bg-blue-100 text-blue-800',
                    icon: <Calendar className="w-4 h-4" />
                };
            case 'in_progress':
                return {
                    label: 'En Progreso',
                    color: 'bg-yellow-100 text-yellow-800',
                    icon: <Clock className="w-4 h-4" />
                };
            case 'completed':
                return {
                    label: 'Completado',
                    color: 'bg-green-100 text-green-800',
                    icon: <CheckCircle className="w-4 h-4" />
                };
            case 'cancelled':
                return {
                    label: 'Cancelado',
                    color: 'bg-red-100 text-red-800',
                    icon: <AlertTriangle className="w-4 h-4" />
                };
            default:
                return {
                    label: status || 'Desconocido',
                    color: 'bg-gray-100 text-gray-800',
                    icon: <AlertCircle className="w-4 h-4" />
                };
        }
    };

    const statusDisplay = getServiceStatusDisplay();

    const formatTimeOnly = (isoString) => isoString ? format(parseISO(isoString), 'HH:mm', { locale: es }) : 'N/A';
    const formatDateWithTime = (isoString) => isoString ? format(parseISO(isoString), 'dd/MM/yyyy HH:mm', { locale: es }) : 'N/A';
    
    // Función para formatear fecha y hora directamente desde ISO string (UTC)
    const formatUTCDate = (isoString) => {
        if (!isoString) return 'N/A';
        const date = new Date(isoString);
        const year = date.getUTCFullYear();
        const month = date.getUTCMonth();
        const day = date.getUTCDate();
        const weekday = date.getUTCDay();
        const weekdayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
        const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        return `${weekdayNames[weekday]}, ${day} ${monthNames[month]} ${year}`;
    };
    
    const formatUTCTime = (isoString) => {
        if (!isoString) return 'N/A';
        const date = new Date(isoString);
        const hours = String(date.getUTCHours()).padStart(2, '0');
        const minutes = String(date.getUTCMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    };

    const handleOpenClientProfile = (clientId) => {
        if (!clientId) return;
        const clientProfileUrl = createPageUrl('Clientes') + '?edit=' + clientId;
        window.open(clientProfileUrl, '_blank');
    };

    if (loading) return <div className="p-6 text-center">Cargando...</div>;

    return (
        <div className="p-6 max-w-6xl mx-auto overflow-y-auto max-h-[80vh] relative">
            {error && (
                <Alert variant="destructive" className="mb-6">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {saving && (
                <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg shadow-xl flex items-center gap-3">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                        <span className="text-lg font-medium">Guardando servicio...</span>
                    </div>
                </div>
            )}

            <CancellationSmsDialog
                open={showCancellationDialog}
                onClose={() => setShowCancellationDialog(false)}
                schedule={schedule}
                selectedClient={selectedClient}
                initialText={cancellationSmsText}
                onScheduleUpdated={(updated) => {
                    setFormData(prev => ({ ...prev, status: 'cancelled' }));
                    if (onUpdateSchedule) onUpdateSchedule(updated);
                }}
            />

            {isReadOnly && schedule ? (
                <CleanerReadOnlyView
                    schedule={schedule}
                    selectedClient={selectedClient}
                    allUsers={allUsers}
                    currentUser={currentUser}
                    selectedCleanerId={selectedCleanerId}
                    onClockInOut={onClockInOut}
                    openInMaps={openInMaps}
                    onCancel={onCancel}
                    onUpdateSchedule={onUpdateSchedule}
                    currentServiceElapsedTime={currentServiceElapsedTime}
                    clientDefaultNotes={clientDefaultNotes}
                    serviceSpecificNotes={formData.service_specific_notes}
                    serviceSpecificPhotos={formData.service_specific_photos}
                />
            ) : (
                // VISTA DE ADMINISTRADOR
                <form onSubmit={handleSubmit} className="space-y-8">
                    <ClockInDataSection
                        schedule={schedule}
                        allUsers={allUsers}
                        selectedClient={selectedClient}
                        liveCleanerTimes={liveCleanerTimes}
                        openInMaps={openInMaps}
                    />

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Detalles del Servicio</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-3">
                                        <Label className="text-base font-semibold text-slate-700">
                                            Cliente *
                                        </Label>
                                        <div className="space-y-2">
                                            <ClientSearchCombobox
                                                clients={clients}
                                                selectedClient={selectedClient}
                                                onClientSelect={handleClientSelect}
                                                placeholder="Buscar cliente por nombre o dirección..."
                                            />
                                            {selectedClient && (
                                                 <p className="text-sm text-slate-600">Dirección: {selectedClient.address}</p>
                                             )}
                                            <FundingValidationAlert selectedClient={selectedClient} startDate={formData.start_date} />
                                            {/* NEW: If client selected in editable view, show link to profile */}
                                            {formData.client_id && selectedClient && (
                                                <div className="flex items-center gap-2 mt-1">
                                                    <Button
                                                        type="button"
                                                        variant="link"
                                                        size="sm"
                                                        onClick={() => handleOpenClientProfile(formData.client_id)}
                                                        className="text-blue-600 hover:text-blue-800 p-0 h-auto font-medium flex items-center gap-1"
                                                        title={`Ver/Editar perfil de ${selectedClient.name}`}
                                                    >
                                                        <ExternalLink className="w-3 h-3" />
                                                        Ver/Editar perfil de {selectedClient.name}
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="start_date">Fecha *</Label>
                                            <Input id="start_date" type="date" value={formData.start_date} onChange={handleInputChange} name="start_date" required={!isReadOnly} disabled={isReadOnly} />
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                                            <Clock className="w-5 h-5 text-blue-600" />
                                            Horario del Servicio
                                        </h3>

                                        {!schedule?.id && (
                                            <div className="bg-gray-50 p-4 rounded-lg">
                                                <h4 className="text-sm font-semibold text-gray-700 mb-3">🕐 Horarios Comunes</h4>
                                                <div className="space-y-3">
                                                    {getTimeSuggestions().map((group) => (
                                                        <div key={group.label}>
                                                            <p className="text-xs text-gray-600 mb-2">{group.label}</p>
                                                            <div className="flex flex-wrap gap-2">
                                                                {group.times.map((time) => (
                                                                    <Button
                                                                        key={time}
                                                                        type="button"
                                                                        variant="outline"
                                                                        size="sm"
                                                                        className="text-xs h-8 px-3 hover:bg-blue-50 hover:border-blue-300"
                                                                        onClick={() => applyTimeSuggestion(time)}
                                                                        disabled={isReadOnly}
                                                                    >
                                                                        {time}
                                                                    </Button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="start_time" className="text-sm font-medium">
                                                    Hora de Inicio
                                                </Label>
                                                <div className="relative">
                                                    <input
                                                        id="start_time"
                                                        type="time"
                                                        value={formData.start_time || ''}
                                                        onChange={(e) => handleTimeChange('start_time', e.target.value)}
                                                        disabled={isReadOnly}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg font-mono"
                                                        step="900"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <Label htmlFor="end_time" className="text-sm font-medium">
                                                    Hora de Fin
                                                </Label>
                                                <div className="relative">
                                                    <input
                                                        id="end_time"
                                                        type="time"
                                                        value={formData.end_time || ''}
                                                        onChange={(e) => handleTimeChange('end_time', e.target.value)}
                                                        disabled={isReadOnly}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg font-mono"
                                                        step="900"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {!isReadOnly && formData.start_time && (
                                            <div className="bg-blue-50 p-4 rounded-lg">
                                                <h4 className="text-sm font-semibold text-blue-800 mb-3">⚡ Duraciones Comunes</h4>
                                                <div className="flex flex-wrap gap-2">
                                                    {[1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map((duration) => {
                                                        const startTime = formData.start_time;
                                                        if (!startTime) return null;
                                                        
                                                        const [hours, minutes] = startTime.split(':').map(Number);
                                                        const endDate = new Date(1970, 0, 1, hours, minutes + (duration * 60));
                                                        const endTime = endDate.toTimeString().slice(0, 5);
                                                        
                                                        return (
                                                            <Button
                                                                key={duration}
                                                                type="button"
                                                                variant="outline"
                                                                size="sm"
                                                                className="text-xs h-8 px-3 hover:bg-blue-100 hover:border-blue-400"
                                                                onClick={() => setFormData(prev => ({ ...prev, end_time: endTime }))}
                                                            >
                                                                {duration}h ({endTime})
                                                            </Button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {duracionExacta > 0 && (
                                            <div className="text-center">
                                                <div className="inline-flex items-center gap-2 bg-green-100 text-green-800 px-4 py-2 rounded-lg font-semibold">
                                                    <Clock className="w-4 h-4" />
                                                    Duración: {formatearDuracion(duracionExacta)} ({duracionExacta.toFixed(2)} horas)
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* MODIFICADO: `StructuredServiceNotes` para leer de selectedClient y ser readOnly */}
                                    <div className="pt-4 border-t">
                                        <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2 mb-3">
                                            <ListChecks className="w-5 h-5" />
                                            Instrucciones Estructuradas del Cliente
                                        </h3>
                                        <p className="text-sm text-slate-600 mb-4">
                                            Estas notas son las instrucciones por defecto del cliente y no se guardan como específicas para este servicio. Si necesitas editarlas, hazlo en el perfil del cliente.
                                        </p>
                                        <StructuredServiceNotes
                                            structuredNotes={selectedClient?.structured_service_notes || {}}
                                            onUpdate={() => {}} // No actualiza formData, ya que no se guarda en el servicio
                                            isReadOnly={true} // Siempre read-only en el formulario de servicio
                                        />
                                    </div>

                                    {/* Notas del Servicio - SEPARADAS */}
                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="flex items-center gap-2">
                                                <FileText className="w-5 h-5 text-blue-600" />
                                                Notas del Servicio
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            {/* NUEVO: Campo para Notas Generales por Defecto (NGPD) */}
                                            <div>
                                                <Label className="flex items-center gap-2 mb-2">
                                                    <Info className="w-4 h-4 text-blue-600" />
                                                    Notas Generales por Defecto del Cliente
                                                    <Badge variant="secondary" className="text-xs">
                                                        Se aplican a todos los servicios
                                                    </Badge>
                                                </Label>
                                                <Textarea
                                                    value={clientDefaultNotes}
                                                    onChange={(e) => {
                                                        setClientDefaultNotes(e.target.value);
                                                        setClientDefaultNotesModified(true);
                                                    }}
                                                    placeholder="Instrucciones generales que se aplican a todos los servicios de este cliente..."
                                                    className="h-32 bg-blue-50/50 border-blue-200 focus:border-blue-400"
                                                    disabled={!selectedClient}
                                                />
                                                {clientDefaultNotesModified && (
                                                    <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                                                        <AlertCircle className="w-3 h-3" />
                                                        Al guardar, estas notas se actualizarán en el cliente y en todos sus servicios futuros
                                                    </p>
                                                )}
                                            </div>

                                            {/* Campo para Notas Adicionales para Este Servicio (NAES) */}
                                            <div>
                                                <Label className="flex items-center gap-2 mb-2">
                                                    <AlertCircle className="w-4 h-4 text-amber-600" />
                                                    Notas Adicionales para Este Servicio
                                                    <Badge variant="secondary" className="text-xs">
                                                        Solo para este día
                                                    </Badge>
                                                </Label>
                                                <Textarea
                                                    value={formData.service_specific_notes}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, service_specific_notes: e.target.value }))}
                                                    placeholder="Notas especiales solo para este servicio en particular..."
                                                    className="h-24 bg-amber-50/50 border-amber-200 focus:border-amber-400"
                                                />
                                                <p className="text-xs text-gray-500 mt-1">
                                                    Estas notas solo aparecerán en este servicio específico
                                                </p>
                                            </div>
                                        </CardContent>
                                    </Card>

                                </CardContent>
                            </Card>

                            <div className="space-y-3">
                                <Label>Limpiadores Asignados</Label>
                                <div className="relative">
                                    <Input placeholder="Buscar limpiador..." value={searchCleaner} onChange={(e) => setSearchCleaner(e.target.value)} className="pr-8" disabled={isReadOnly} />
                                    <Search className="absolute right-2 top-2.5 h-4 w-4 text-gray-400" />
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-40 overflow-y-auto border rounded-lg p-4 bg-gray-50">
                                    {allUsers.filter(u => u.role !== 'admin' && u.active !== false).filter(user => isReadOnly ? formData.cleaner_ids.includes(user.id) : !searchCleaner || (user.invoice_name || user.full_name || '').toLowerCase().includes(searchCleaner.toLowerCase())).sort((a, b) => (a.invoice_name || a.full_name || '').localeCompare(b.invoice_name || b.full_name || '')).map(user => {
                                        const hasConflict = cleanerConflicts.has(user.id);
                                        return (
                                            <div key={user.id} className="flex items-center space-x-2">
                                                <input
                                                    type="checkbox"
                                                    id={`cleaner-${user.id}`}
                                                    checked={formData.cleaner_ids.includes(user.id)}
                                                    onChange={() => handleCleanerToggle(user.id)}
                                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                    disabled={isReadOnly}
                                                />
                                                <label htmlFor={`cleaner-${user.id}`} className="text-sm cursor-pointer truncate flex items-center gap-1" title={user.display_name || user.invoice_name || user.full_name}>
                                                    {user.display_name || user.invoice_name || user.full_name}
                                                    {hasConflict && (
                                                        <AlertTriangle className="w-4 h-4 text-amber-500" title="Ya tiene un servicio asignado en esta hora" />
                                                    )}
                                                </label>
                                            </div>
                                        );
                                    })}
                                </div>
                                {formData.cleaner_ids.length === 0 && (
                                    <Alert className="border-orange-200 bg-orange-50 text-orange-800">
                                        <AlertCircle className="h-4 w-4" />
                                        <AlertDescription>
                                            <strong>Advertencia:</strong> Este servicio no tiene limpiadores asignados.
                                        </AlertDescription>
                                    </Alert>
                                )}
                                <p className="text-sm text-gray-600">{formData.cleaner_ids.length} limpiador(es) seleccionado(s)</p>
                            </div>

                            {formData.cleaner_ids.length > 0 && !isReadOnly && <CleanerTimesManager selectedCleaners={formData.cleaner_ids} users={allUsers} baseStartTime={formData.start_time} baseEndTime={formData.end_time} baseDate={formData.start_date} cleanerSchedules={cleanerSchedules} onCleanerSchedulesChange={handleCleanerSchedulesChange} isReadOnly={isReadOnly} />}

                            <div className="space-y-2">
                                <Label>Tipo de Servicio</Label>
                                <Select
                                    value={formData.recurrence_rule}
                                    onValueChange={(v) => setFormData({ ...formData, recurrence_rule: v })}
                                    disabled={isReadOnly}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Seleccionar tipo..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Servicio Único (One-Off)</SelectItem>
                                        <SelectItem value="weekly">Regular - Semanal</SelectItem>
                                        <SelectItem value="fortnightly">Regular - Quincenal</SelectItem>
                                        <SelectItem value="every_3_weeks">Regular - Cada 3 semanas</SelectItem>
                                        <SelectItem value="every_4_weeks">Regular - Cada 4 semanas</SelectItem> {/* NEW ITEM */}
                                        <SelectItem value="monthly">Regular - Mensual</SelectItem>
                                    </SelectContent>
                                </Select>
                                {formData.recurrence_rule && formData.recurrence_rule !== 'none' && !schedule?.id && (
                                    <p className="text-sm text-slate-600">
                                        Se generarán servicios recurrentes para los próximos 6 meses.
                                    </p>
                                )}
                            </div>
                            {hasExistingRegular && !isReadOnly && <Alert className="border-amber-200 bg-amber-50"><AlertTriangle className="h-4 w-4" /><AlertDescription className="text-amber-800"><strong>Atención:</strong> Este cliente ya tiene un servicio regular. Revisa que no estés duplicando.</AlertDescription></Alert>}

                            <div className="space-y-2"><Label>Fotos Específicas de Este Servicio</Label><PhotoUploader uploadedUrls={formData.service_specific_photos} onUrlsChange={(urls) => setFormData(p => ({ ...p, service_specific_photos: urls }))} isReadOnly={isReadOnly} /></div>
                        </div>
                        <div className="lg:col-span-1 space-y-6">
                            <Card>
                                <CardHeader><CardTitle>Información Adicional</CardTitle></CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="status">Estado del Servicio</Label>
                                         <Select value={formData.status} onValueChange={handleStatusChange} disabled={isReadOnly}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Seleccionar estado..." />
                                            </SelectTrigger>
                                        <SelectContent>
                                                <SelectItem value="scheduled">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                                        Programado
                                                    </div>
                                                </SelectItem>
                                                <SelectItem value="in_progress">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                                        En Progreso
                                                    </div>
                                                </SelectItem>
                                                <SelectItem value="completed">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-2 h-2 bg-slate-500 rounded-full"></div>
                                                        Completado
                                                    </div>
                                                </SelectItem>
                                                <SelectItem value="cancelled">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                                                        Cancelado
                                                    </div>
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>

                                        {schedule?.reminder_sent_at && (
                                            <div className="mt-2 flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 p-2 rounded-md">
                                                <CheckCircle className="h-4 w-4" />
                                                <span>
                                                    Recordatorio enviado el: {format(new Date(schedule.reminder_sent_at.endsWith('Z') ? schedule.reminder_sent_at : schedule.reminder_sent_at + 'Z'), "EEEE, d 'de' MMMM yyyy 'a las' HH:mm", { locale: es })}
                                                </span>
                                            </div>
                                        )}

                                        <p className="text-xs text-slate-600">
                                            Los recordatorios automáticos solo se envían para servicios en estado "Programado"
                                        </p>
                                    </div>

                                    <div className="space-y-2"><Label htmlFor="notes_private">Notas Administrativas (Privadas)</Label><Textarea id="notes_private" placeholder="Notas internas..." value={formData.notes_private} onChange={handleInputChange} name="notes_private" rows={2} readOnly={isReadOnly} /></div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>

                    {schedule?.id && (
                         <div className="my-6 bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg">
                            <h4 className="font-semibold text-blue-800 flex items-center gap-2 mb-3"><Send className="w-5 h-5"/>Notificar al Cliente</h4>
                            <p className="text-sm text-blue-700 mb-3">Si has cambiado la fecha, hora o limpiadores, puedes enviar una notificación por SMS al cliente con los detalles actualizados.</p>
                            <Button type="button" variant="outline" onClick={handleSendUpdate} disabled={sendingUpdate}>
                                {sendingUpdate ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</> : 'Enviar Notificación de Actualización'}
                            </Button>
                            {updateSuccess && <Alert className="mt-3 border-green-200 bg-green-50 text-green-800"><CheckCircle className="h-4 w-4" /> <AlertDescription>{updateSuccess}</AlertDescription></Alert>}
                            {updateError && <Alert variant="destructive" className="mt-3"><AlertCircle className="h-4 w-4" /> <AlertDescription>{updateError}</AlertDescription></Alert>}
                        </div>
                    )}

                    {schedule?.id && schedule.recurrence_id && (
                        <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg">
                            <h3 className="text-base font-semibold text-amber-800 mb-3 flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5" />
                                Alcance de Modificación
                            </h3>
                            <div className="space-y-3">
                                <div className="flex items-center space-x-3">
                                    <input
                                        type="radio"
                                        id="this_only"
                                        name="updateScope"
                                        value="this_only"
                                        checked={updateScope === 'this_only'}
                                        onChange={(e) => setUpdateScope(e.target.value)}
                                        className="w-4 h-4 text-blue-600"
                                        disabled={isReadOnly}
                                    />
                                    <Label htmlFor="this_only" className="text-sm font-medium text-amber-800">
                                        Modificar solo esta cita
                                    </Label>
                                </div>
                                <div className="flex items-center space-x-3">
                                    <input
                                        type="radio"
                                        id="this_and_future"
                                        name="updateScope"
                                        value="this_and_future"
                                        checked={updateScope === 'this_and_future'}
                                        onChange={(e) => setUpdateScope(e.target.value)}
                                        className="w-4 h-4 text-blue-600"
                                        disabled={isReadOnly}
                                    />
                                    <Label htmlFor="this_and_future" className="text-sm font-medium text-amber-800">
                                        Modificar esta cita y todas las futuras
                                    </Label>
                                </div>
                            </div>
                            <div className="mt-3 text-xs text-amber-700">
                                {updateScope === 'this_only'
                                    ? '✓ Solo se modificará este servicio específico'
                                    : '⚠️ Se modificarán este servicio y todos los futuros de la serie'
                                }
                            </div>
                        </div>
                    )}

                    {currentUser?.role === 'admin' && schedule?.id && schedule?.status !== 'completed' && (
                        <Card className="bg-amber-50 border-amber-200">
                            <CardHeader>
                                <CardTitle className="text-amber-900 flex items-center gap-2">
                                    <AlertTriangle className="w-5 h-5" />
                                    Herramientas Administrativas
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="text-sm text-amber-800">
                                    <p><strong>¿Los limpiadores olvidaron hacer clock in/out completo?</strong></p>
                                    <p>Usa esta herramienta para marcar el servicio como completado y generar las entradas de trabajo automáticamente.</p>
                                    <p className="mt-2 text-xs text-amber-600">
                                        Esta acción no puede deshacerse. Asegúrate de que no haya clock-in/out en progreso para los limpiadores.
                                    </p>
                                </div>

                                <div className="bg-white p-3 rounded-lg">
                                    <h4 className="font-semibold text-slate-800 mb-2">Estado Actual de Clock In/Out:</h4>
                                    {schedule.cleaner_ids?.map(cleanerId => {
                                        const cleanerName = allUsers.find(u => u.id === cleanerId)?.display_name ||
                                                             allUsers.find(u => u.id === cleanerId)?.invoice_name ||
                                                             allUsers.find(u => u.id === cleanerId)?.full_name ||
                                                             'Limpiador desconocido';
                                        const clockData = schedule.clock_in_data?.find(c => c.cleaner_id === cleanerId);

                                        return (
                                            <div key={cleanerId} className="flex items-center justify-between py-1">
                                                <span className="text-sm text-slate-700">{cleanerName}:</span>
                                                <div className="flex gap-2">
                                                    <Badge variant={clockData?.clock_in_time ? "default" : "destructive"} className="text-xs">
                                                        {clockData?.clock_in_time ? "Clock In ✓" : "Clock In ✗"}
                                                    </Badge>
                                                    <Badge variant={clockData?.clock_out_time ? "default" : "destructive"} className="text-xs">
                                                        {clockData?.clock_out_time ? "Clock Out ✓" : "Clock Out ✗"}
                                                    </Badge>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Eliminado: {adminProcessingMessage && (...)} */}

                                <Button
                                    type="button"
                                    onClick={handleForceComplete}
                                    disabled={loading}
                                    className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                                >
                                    {loading ? (
                                        <>
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                                            Procesando...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle className="w-4 h-4 mr-2" />
                                            Forzar Completado y Generar Entradas de Trabajo
                                        </>
                                    )}
                                </Button>
                            </CardContent>
                        </Card>
                    )}

                    {currentUser?.role === 'admin' && schedule?.id && schedule?.status === 'completed' && (
                        <Card className="bg-blue-50 border-blue-200">
                            <CardHeader>
                                <CardTitle className="text-blue-900 flex items-center gap-2">
                                    <Clock className="w-5 h-5" />
                                    Ajuste de Horas Trabajadas
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-sm text-blue-800 space-y-2">
                                    <p><strong>💡 Función Automática Activada:</strong></p>
                                    <p>Si modificas los horarios individuales de los limpiadores y guardas este servicio, el sistema <strong>actualizará automáticamente</strong> las entradas de trabajo correspondientes.</p>
                                    <p className="text-xs text-blue-600">
                                        ⚠️ Solo se actualizarán las entradas que aún no hayan sido facturadas.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    <div className="flex justify-between items-center pt-6 border-t border-gray-200 bg-white sticky bottom-0 pb-4">
                        <div>
                            {onDelete && schedule?.id && (
                                <Button
                                    type="button"
                                    variant="destructive"
                                    onClick={handleDeleteClick}
                                    disabled={saving || deleteLoading}
                                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700"
                                >
                                    {deleteLoading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Eliminando...
                                        </>
                                    ) : (
                                        <>
                                            <Trash2 className="w-4 h-4" /> Eliminar Servicio
                                        </>
                                    )}
                                </Button>
                            )}
                        </div>

                        <div className="flex gap-3">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={onCancel}
                                disabled={saving}
                                className="px-6"
                            >
                                Cancelar
                            </Button>

                            <Button
                                type="submit"
                                disabled={saving || !selectedClient}
                                className="bg-blue-600 hover:bg-blue-700 px-8 flex items-center gap-2"
                            >
                                {saving ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Guardando...
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-5 h-5" />
                                        {schedule?.id ? 'Guardar Cambios' : 'Crear Servicio'}
                                    </>
                                )}
                                {!saving && cleanerConflicts.size > 0 && formData.cleaner_ids.some(id => cleanerConflicts.has(id)) && (
                                    <span className="ml-2 bg-amber-400 text-amber-900 px-2 py-1 rounded-full text-xs font-bold">⚠️</span>
                                )}
                            </Button>
                        </div>
                    </div>
                </form>
            )}

            <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <DialogContent className="max-w-xl p-0">
                    <DialogHeader className="text-center p-6 border-b">
                        <DialogTitle className="text-xl font-bold text-red-700 flex items-center justify-center gap-3">
                            <Trash2 className="w-6 h-6" />
                            Eliminar Servicio Recurrente
                        </DialogTitle>
                    </DialogHeader>

                    <div className="p-6 space-y-6">
                        <div className="bg-slate-50 rounded-lg p-4 border text-center">
                            <p className="font-semibold text-slate-800 text-lg">{schedule?.client_name}</p>
                            <p className="text-sm text-slate-600 mt-1">
                                {schedule?.start_time && format(parseISO(schedule.start_time), "d 'de' MMMM 'de' yyyy 'a las' HH:mm", { locale: es })}
                            </p>
                        </div>

                        <div className="text-center">
                            <p className="text-slate-700 text-base leading-relaxed mb-2">
                                Este servicio forma parte de una <strong>serie recurrente</strong>.
                            </p>
                            <p className="text-slate-600 text-sm">
                                Selecciona qué servicios deseas eliminar:
                            </p>
                        </div>

                        <Button
                            variant="outline"
                            className="w-full h-auto p-4 border-2 border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-all duration-200"
                            onClick={() => handleConfirmDelete('only_this')}
                            disabled={deleteLoading}
                        >
                            <div className="flex items-center gap-4 text-left w-full">
                                <div className="flex-shrink-0 bg-blue-100 rounded-full p-3">
                                    <Calendar className="w-5 h-5 text-blue-600" />
                                </div>
                                <div className="flex-1">
                                    <p className="font-semibold text-slate-800">Eliminar solo este servicio</p>
                                    <p className="text-sm text-slate-600 mt-1">
                                        Los demás servicios de la serie se mantendrán programados.
                                    </p>
                                </div>
                            </div>
                        </Button>

                        <Button
                            variant="outline"
                            className="w-full h-auto p-4 border-2 border-red-200 hover:border-red-400 hover:bg-red-50 transition-all duration-200"
                            onClick={() => handleConfirmDelete('this_and_future')}
                            disabled={deleteLoading}
                        >
                            <div className="flex items-center gap-4 text-left w-full">
                                <div className="flex-shrink-0 bg-red-100 rounded-full p-3">
                                    <RotateCcw className="w-5 h-5 text-red-600" />
                                </div>
                                <div className="flex-1">
                                    <p className="font-semibold text-slate-800">Eliminar este y todos los futuros</p>
                                    <p className="text-sm text-slate-600 mt-1">
                                        Se eliminarán todos los servicios desde esta fecha en adelante.
                                    </p>
                                </div>
                            </div>
                        </Button>
                    </div>

                    {deleteLoading && (
                        <div className="flex justify-center items-center gap-3 pt-4">
                            <Loader2 className="w-5 h-5 animate-spin text-slate-600" />
                            <span className="text-slate-600 font-medium">Eliminando servicios...</span>
                        </div>
                    )}

                    {error && (
                        <Alert variant="destructive" className="mt-4">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                    <div className="flex justify-center p-6 border-t bg-slate-50 rounded-b-lg">
                        <Button
                            variant="ghost"
                            onClick={() => setShowDeleteDialog(false)}
                            disabled={deleteLoading}
                            className="text-slate-600 hover:text-slate-900"
                        >
                            <X className="w-4 h-4 mr-2" />
                            Cancelar
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}