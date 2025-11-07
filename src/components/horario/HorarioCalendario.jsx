
import React, { forwardRef, useImperativeHandle, useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, Users, MapPin } from 'lucide-react';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks, addMonths, subMonths, startOfMonth, endOfMonth, eachWeekOfInterval, isToday, isSameDay, addDays, isSameMonth, parseISO, addMinutes, roundToNearestMinutes } from 'date-fns';
import { es } from 'date-fns/locale';
import CleanerDayListView from './CleanerDayListView';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';


// NUEVA FUNCIÓN HELPER para parsear fechas de forma consistente y en UTC
const parseISOAsUTC = (isoString) => {
    if (!isoString) return new Date(); // Or handle as error/null depending on desired behavior
    const correctedIsoString = isoString.endsWith('Z') ? isoString : `${isoString}Z`;
    // Create a Date object from the ISO string, which will represent the time in UTC
    return new Date(correctedIsoString);
};

// Helper para formatear una fecha UTC a HH:mm
const formatTimeUTC = (date) => {
    if (!date) return '';
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
};

// Constantes para el diseño y el rango de horas
const HOUR_HEIGHT = 64; // Altura en píxeles para un bloque de hora
const SLOT_HEIGHT = HOUR_HEIGHT / 4; // Altura en píxeles para un slot de 15 minutos

const VISIBLE_START_HOUR = 6;  // 6 AM (interpretado como UTC)
const VISIBLE_END_HOUR = 22;   // 10 PM (interpretado como UTC)
const TOTAL_VISIBLE_HOURS = VISIBLE_END_HOUR - VISIBLE_START_HOUR; // Total de horas a mostrar (16 horas)
const TOTAL_DISPLAY_HEIGHT_PX = TOTAL_VISIBLE_HOURS * HOUR_HEIGHT; // Altura total de la sección de tiempo

const HorarioCalendario = forwardRef(({ 
    events = [], 
    date, 
    view, 
    onNavigate, 
    onView, 
    onSelectEvent, 
    onCreateAtTime, 
    onMoveEvent = null, 
    onResizeEvent = null, 
    users = [], 
    isCleanerView = false, 
    selectedCleanerId = null, 
    isReadOnly = false, 
    assignedVehicle = null, 
    requiredKeys = [],
    currentUser, 
    base44,      
    setNotification, 
    loadEvents   
}, ref) => {
    const [selectedDate, setSelectedDate] = useState(date);
    const [draggedEvent, setDraggedEvent] = useState(null);
    const [draggedEventOffsetY, setDraggedEventOffsetY] = useState(0);
    const [dragIndicator, setDragIndicator] = useState({ visible: false, top: 0, left: 0, width: 0, text: '' });
    const [resizeIndicator, setResizeIndicator] = useState({ visible: false, top: 0, left: 0, width: 0, text: '' });
    const [currentTime, setCurrentTime] = useState(new Date());
    const [isDragging, setIsDragging] = useState(false);
    const [resizingEvent, setResizingEvent] = useState(null);
    const calendarGridRef = useRef(null);
    const lastHoveredSlotKey = useRef(null);

    // NUEVO: Estado para rastrear servicios que ya están siendo procesados (para Clock Out)
    const [processingSchedules, setProcessingSchedules] = useState(new Set());

    // Update selectedDate when date prop changes
    useEffect(() => {
        setSelectedDate(date);
    }, [date]);

    // Update current time every minute for live time tracking
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 60000); // Update every minute
        return () => clearInterval(timer);
    }, []);

    // NUEVA LÓGICA: useEffect para manejar los eventos de redimensionamiento
    useEffect(() => {
        if (!resizingEvent || !calendarGridRef.current) return;

        const handleMouseMove = (e) => {
            e.preventDefault();
            e.stopPropagation();

            const gridRect = calendarGridRef.current.getBoundingClientRect();
            let yPositionInGrid = e.clientY - gridRect.top + calendarGridRef.current.scrollTop;
            
            // Clampar yPositionInGrid al rango visible
            yPositionInGrid = Math.max(0, Math.min(TOTAL_DISPLAY_HEIGHT_PX, yPositionInGrid));

            // Calcular minutos totales desde el inicio de la cuadrícula visible (en UTC)
            let totalMinutesFromGridStart = (yPositionInGrid / HOUR_HEIGHT) * 60;
            
            const originalEventStart = parseISOAsUTC(resizingEvent.originalStartTime);
            const originalEventEnd = parseISOAsUTC(resizingEvent.originalEndTime);

            // Crear una fecha de referencia para el día del evento en UTC, a la hora de inicio visible (e.g., 6 AM UTC)
            const refDateForSnapping = new Date(
                Date.UTC(
                    originalEventStart.getUTCFullYear(),
                    originalEventStart.getUTCMonth(),
                    originalEventStart.getUTCDate(),
                    VISIBLE_START_HOUR,
                    0
                )
            );
            
            // Sumar los minutos calculados a la fecha de referencia y luego redondear (en UTC)
            const snappedDateTime = roundToNearestMinutes(addMinutes(refDateForSnapping, totalMinutesFromGridStart), { nearestTo: 15 });
            
            const snappedHour = snappedDateTime.getUTCHours();
            const snappedMinute = snappedDateTime.getUTCMinutes();

            // Construir la nueva hora potencial en UTC
            const newPotentialTime = new Date(
                Date.UTC(
                    originalEventStart.getUTCFullYear(),
                    originalEventStart.getUTCMonth(),
                    originalEventStart.getUTCDate(),
                    snappedHour,
                    snappedMinute
                )
            );

            let displayText = '';
            let finalTime = newPotentialTime;

            if (resizingEvent.direction === 'bottom') {
                // Asegurar que la nueva hora de fin sea al menos 15 minutos después del inicio (en UTC)
                if (newPotentialTime.getTime() <= addMinutes(originalEventStart, 15).getTime()) {
                    finalTime = addMinutes(originalEventStart, 15);
                }
                displayText = `Nueva hora fin: ${formatTimeUTC(finalTime)}`;
            } else if (resizingEvent.direction === 'top') {
                // Asegurar que la nueva hora de inicio sea al menos 15 minutos antes del fin (en UTC)
                if (newPotentialTime.getTime() >= addMinutes(originalEventEnd, -15).getTime()) {
                    finalTime = addMinutes(originalEventEnd, -15);
                }
                displayText = `Nueva hora inicio: ${formatTimeUTC(finalTime)}`;
            }

            // NUEVO: Mostrar indicador visual con la nueva hora
            const indicatorTopInViewport = e.clientY - 30; // Posicionar un poco arriba del cursor
            
            // Encontrar el elemento de la columna del día para obtener el ancho
            const dayColumn = e.target.closest('[data-day-column]') || e.target.closest('.relative');
            let indicatorWidth = 200; // ancho por defecto
            let indicatorLeft = e.clientX - 100; // centrar en el cursor por defecto

            if (dayColumn) {
                const dayColumnRect = dayColumn.getBoundingClientRect();
                indicatorWidth = dayColumnRect.width;
                indicatorLeft = dayColumnRect.left;
            }

            setResizeIndicator({
                visible: true,
                top: indicatorTopInViewport,
                left: indicatorLeft,
                width: indicatorWidth,
                text: displayText
            });
        };

        const handleMouseUp = (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Limpiar indicador
            setResizeIndicator({ visible: false, top: 0, left: 0, width: 0, text: '' });

            if (!calendarGridRef.current || !resizingEvent) {
                setResizingEvent(null);
                return;
            }

            const gridRect = calendarGridRef.current.getBoundingClientRect();
            let yPositionInGrid = e.clientY - gridRect.top + calendarGridRef.current.scrollTop;
            
            // Clampar yPositionInGrid al rango visible
            yPositionInGrid = Math.max(0, Math.min(TOTAL_DISPLAY_HEIGHT_PX, yPositionInGrid));

            // Calcular minutos totales desde el inicio de la cuadrícula visible (e.g., 6 AM UTC)
            let totalMinutesFromGridStart = (yPositionInGrid / HOUR_HEIGHT) * 60;
            
            const originalEventStart = parseISOAsUTC(resizingEvent.originalStartTime);
            const originalEventEnd = parseISOAsUTC(resizingEvent.originalEndTime);

            // Crear una fecha de referencia para el día del evento en UTC, a la hora de inicio visible (e.g., 6 AM UTC)
            const refDateForSnapping = new Date(
                Date.UTC(
                    originalEventStart.getUTCFullYear(),
                    originalEventStart.getUTCMonth(),
                    originalEventStart.getUTCDate(),
                    VISIBLE_START_HOUR,
                    0
                )
            );
            
            // Sumar los minutos calculados a la fecha de referencia y luego redondear al minuto más cercano (15) en UTC
            const snappedDateTime = roundToNearestMinutes(addMinutes(refDateForSnapping, totalMinutesFromGridStart), { nearestTo: 15 });
            
            const snappedHour = snappedDateTime.getUTCHours();
            const snappedMinute = snappedDateTime.getUTCMinutes();

            let newStart = originalEventStart;
            let newEnd = originalEventEnd;

            // Construir la nueva hora potencial para la posición del manejador en UTC
            const newPotentialTime = new Date(
                Date.UTC(
                    originalEventStart.getUTCFullYear(),
                    originalEventStart.getUTCMonth(),
                    originalEventStart.getUTCDate(),
                    snappedHour,
                    snappedMinute
                )
            );

            if (resizingEvent.direction === 'bottom') {
                newEnd = newPotentialTime;
                // Asegurar que la nueva hora de fin sea al menos 15 minutos después de la hora de inicio (en UTC)
                if (newEnd.getTime() <= addMinutes(originalEventStart, 15).getTime()) {
                    newEnd = addMinutes(originalEventStart, 15);
                }
            } else if (resizingEvent.direction === 'top') {
                newStart = newPotentialTime;
                // Asegurar que la nueva hora de inicio sea al menos 15 minutos antes de la hora de fin (en UTC)
                if (newStart.getTime() >= addMinutes(originalEventEnd, -15).getTime()) {
                    newStart = addMinutes(originalEventEnd, -15);
                }
            }
            
            // Solo llamar a onResizeEvent si las horas han cambiado realmente
            if (onResizeEvent && (newStart.getTime() !== originalEventStart.getTime() || newEnd.getTime() !== originalEventEnd.getTime())) {
                onResizeEvent(resizingEvent.id, newStart, newEnd);
            }
            
            setResizingEvent(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [resizingEvent, onResizeEvent, currentTime]);

    const cleanerNameMap = useMemo(() => {
        if (!users || users.length === 0) return new Map();
        // MODIFICADO: Priorizar display_name para el mapa de nombres
        return new Map(users.map(u => [u.id, (u.display_name || u.invoice_name || u.full_name)]));
    }, [users]);
    
    // NEW: Helper functions for cleaner info used in renderEvent
    const getCleanerInitials = useCallback((cleanerId) => {
        const user = users.find(u => u.id === cleanerId);
        if (!user) return '?';
        
        const name = user.display_name || user.full_name || 'Unknown';
        // Obtener las primeras 2 letras del nombre
        return name.substring(0, 2).toUpperCase();
    }, [users]);

    const getCleanerColor = useCallback((cleanerId) => {
        const user = users.find(u => u.id === cleanerId);
        return user?.color || '#3b82f6';
    }, [users]);

    const getCleanerName = useCallback((cleanerId) => {
        const user = users.find(u => u.id === cleanerId);
        return user?.display_name || user?.full_name || 'Desconocido';
    }, [users]);

    // Corrected navigation functions as per outline (with preservation of month view for consistency)
    const handlePrevious = () => {
        let newDate;
        if (view === 'day') {
            newDate = addDays(selectedDate, -1);
        } else if (view === 'week') {
            newDate = addDays(selectedDate, -7); 
        } else { 
            newDate = subMonths(selectedDate, 1);
        }
        setSelectedDate(newDate);
        onNavigate(newDate);
    };

    const handleNext = () => {
        let newDate;
        if (view === 'day') {
            newDate = addDays(selectedDate, 1);
        } else if (view === 'week') {
            newDate = addDays(selectedDate, 7); 
        } else { 
            newDate = addMonths(selectedDate, 1);
        }
        setSelectedDate(newDate);
        onNavigate(newDate);
    };

    const handleToday = () => {
        const today = new Date();
        setSelectedDate(today);
        onNavigate(today);
    };

    const handleViewChange = (newView) => {
        onView(newView);
    };

    const handleEmptySpaceClick = (clickDate, hour = null, minute = null) => {
        if (isReadOnly || isCleanerView || !onCreateAtTime) {
            console.log('Creación de servicios deshabilitada para limpiadores o en modo de solo lectura.');
            return;
        }
        
        // clickDate is a local date object, hour/minute should be interpreted as UTC for event creation
        const targetDate = new Date(
            Date.UTC(
                clickDate.getFullYear(),
                clickDate.getMonth(),
                clickDate.getDate(),
                hour !== null ? hour : 9, // Default to 9 AM UTC
                minute !== null ? minute : 0
            )
        );
        
        onCreateAtTime(targetDate);
    };

    // Modified drag-and-drop functions as per outline
    const handleDragStart = (e, event) => {
        if (isReadOnly || isCleanerView || event.status === 'cancelled') { // Added cancelled status check
            e.preventDefault();
            console.log('Drag and drop deshabilitado para limpiadores, en modo de solo lectura o evento cancelado.');
            return false;
        }
        
        // NUEVO: Calcular y guardar el offset del ratón respecto al borde superior del evento
        const offsetY = e.clientY - e.currentTarget.getBoundingClientRect().top;
        setDraggedEventOffsetY(offsetY);

        setDraggedEvent(event);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', event.id); 
        setIsDragging(true); // NUEVO: Activar estado de arrastre
        
        // Hide the original element to improve UX during drag
        const currentElement = e.currentTarget;
        if (currentElement) {
            setTimeout(() => {
                currentElement.style.visibility = 'hidden';
            }, 0);
        }
    };

    const handleDragEnd = (e) => {
        const currentElement = e.currentTarget;
        if (currentElement) {
           currentElement.style.visibility = 'visible';
        }
        setDraggedEvent(null);
        setDraggedEventOffsetY(0); // Resetear offset
        setDragIndicator({ visible: false, top: 0, left: 0, width: 0, text: '' });
        lastHoveredSlotKey.current = null;
        setIsDragging(false); // NUEVO: Desactivar estado de arrastre
    };

    // MODIFICADO: La lógica ahora se basa en la posición del ratón y el offset, no en la ranura específica
    const handleGridDragOver = (e, dayDate) => {
        if (!draggedEvent || isReadOnly || isCleanerView) return;
        
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';

        if (!calendarGridRef.current) return;

        const gridRect = calendarGridRef.current.getBoundingClientRect();
        
        // Calcular la posición Y del borde superior del evento dentro de la cuadrícula
        const yPositionInGrid = e.clientY - gridRect.top + calendarGridRef.current.scrollTop - draggedEventOffsetY;
        
        // Convertir la posición Y a minutos y ajustarla a la ranura de 15 min más cercana (en UTC)
        const hoursFromGridTop = yPositionInGrid / HOUR_HEIGHT;
        const totalMinutesFromGridTop = Math.max(0, hoursFromGridTop * 60);
        const snappedTotalMinutes = Math.round(totalMinutesFromGridTop / 15) * 15;
        
        const snappedHour = VISIBLE_START_HOUR + Math.floor(snappedTotalMinutes / 60);
        const snappedMinute = snappedTotalMinutes % 60;

        // Asegurarse de que el indicador no vaya más allá del rango visible (en UTC)
        if (snappedHour < VISIBLE_START_HOUR || (snappedHour >= VISIBLE_END_HOUR && snappedMinute > 0)) {
            setDragIndicator({ visible: false });
            lastHoveredSlotKey.current = null;
            return;
        }

        // dayDate es un objeto Date local, crear un objeto Date UTC para el indicador
        const newDateTimeUTC = new Date(
            Date.UTC(
                dayDate.getFullYear(),
                dayDate.getMonth(),
                dayDate.getDate(),
                snappedHour,
                snappedMinute
            )
        );
        const slotKey = `${dayDate.toISOString().split('T')[0]}-${snappedHour}-${snappedMinute}`;
        
        if (slotKey !== lastHoveredSlotKey.current) {
            lastHoveredSlotKey.current = slotKey;
            
            // Posición del indicador visual
            const indicatorTopInGrid = (snappedTotalMinutes / 60) * HOUR_HEIGHT;
            const indicatorTopInViewport = indicatorTopInGrid - calendarGridRef.current.scrollTop + gridRect.top;
            
            // Usar la columna del día actual como referencia para la posición horizontal
            const dayColumnElement = e.currentTarget;
            const dayColumnRect = dayColumnElement.getBoundingClientRect();

            setDragIndicator({
                visible: true,
                top: indicatorTopInViewport,
                left: dayColumnRect.left,
                width: dayColumnRect.width,
                text: `Mover a las ${formatTimeUTC(newDateTimeUTC)}`
            });
        }
    };
    
    // Keeping handleGridDragLeave for correct drag indicator behavior
    const handleGridDragLeave = (e) => {
        if (isReadOnly || isCleanerView) return;
        // Se oculta el indicador si el cursor sale del área de la columna del día
        if (e.currentTarget && !e.currentTarget.contains(e.relatedTarget)) {
            setDragIndicator({ visible: false, top: 0, left: 0, width: 0, text: '' });
            lastHoveredSlotKey.current = null;
        }
    };

    // MODIFICADO: La lógica es idéntica a DragOver para calcular la hora final
    const handleGridDrop = (e, dayDate) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (!draggedEvent || !onMoveEvent || isReadOnly || isCleanerView || !calendarGridRef.current) {
            console.error('Drop failed: No dragged event in state, onMoveEvent handler, or calendar is read-only or cleaner view.');
            return;
        }
        
        const gridRect = calendarGridRef.current.getBoundingClientRect();
        const yPositionInGrid = e.clientY - gridRect.top + calendarGridRef.current.scrollTop - draggedEventOffsetY;
        
        const hoursFromGridTop = yPositionInGrid / HOUR_HEIGHT;
        const totalMinutesFromGridTop = Math.max(0, hoursFromGridTop * 60);
        const snappedTotalMinutes = Math.round(totalMinutesFromGridTop / 15) * 15;
        
        let snappedHour = VISIBLE_START_HOUR + Math.floor(snappedTotalMinutes / 60);
        let snappedMinute = snappedTotalMinutes % 60;

        // Asegurarse de que el drop final esté dentro del rango visible (en UTC)
        if (snappedHour < VISIBLE_START_HOUR) {
            // Drop a la hora de inicio visible si se arrastra por encima
            snappedHour = VISIBLE_START_HOUR;
            snappedMinute = 0;
        } else if (snappedHour >= VISIBLE_END_HOUR) {
            // Drop a la hora de fin visible (o el último slot) si se arrastra por debajo
            snappedHour = VISIBLE_END_HOUR - 1;
            snappedMinute = 45; // Last 15-min slot
        }
        
        // dayDate es un objeto Date local, crear un objeto Date UTC para el nuevo inicio
        const newStartTime = new Date(
            Date.UTC(
                dayDate.getFullYear(),
                dayDate.getMonth(),
                dayDate.getDate(),
                snappedHour,
                snappedMinute
            )
        );
        
        const originalDurationMs = parseISOAsUTC(draggedEvent.end_time).getTime() - parseISOAsUTC(draggedEvent.start_time).getTime();
        const newEndTime = new Date(newStartTime.getTime() + originalDurationMs);
        
        onMoveEvent(draggedEvent.id, newStartTime, newEndTime);
        
        // Limpieza de estado manejada por handleDragEnd, que se dispara automáticamente después
    };

    // NUEVA FUNCIÓN: Iniciar el redimensionamiento
    const handleResizeStart = (e, event, direction) => {
        if (isReadOnly || isCleanerView || event.status === 'cancelled') return;
        e.preventDefault();
        e.stopPropagation(); // Evita que se dispare el drag del evento completo
        
        setResizingEvent({
            id: event.id,
            direction: direction, // 'top' or 'bottom'
            originalStartTime: event.start_time,
            originalEndTime: event.end_time,
        });
    };

    const handleClockOut = async (event) => {
        if (!currentUser) return;
    
        // Prevenir múltiples ejecuciones simultáneas para el mismo servicio
        if (processingSchedules.has(event.id)) {
          console.log('⚠️ Este servicio ya está siendo procesado, esperando...');
          return;
        }
    
        try {
          setProcessingSchedules(prev => new Set([...prev, event.id]));
    
          const now = new Date().toISOString();
          const updatedClockInData = event.clock_in_data ? [...event.clock_in_data] : [];
          const existingClockIn = updatedClockInData.find(c => c.cleaner_id === currentUser.id);
    
          if (!existingClockIn || existingClockIn.clock_out_time) {
            setNotification({
                type: "error",
                message: "No tienes un Clock In activo o ya hiciste Clock Out."
            });
            return;
          }
    
          let userLat = null;
          let userLng = null;
          try {
            const position = await new Promise((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
            });
            userLat = position.coords.latitude;
            userLng = position.coords.longitude;
          } catch (geoError) {
            console.warn("No se pudo obtener la ubicación:", geoError);
          }
    
          existingClockIn.clock_out_time = now;
          if (userLat && userLng) {
            existingClockIn.clock_out_location = `${userLat},${userLng}`;
          }
    
          const allClockedOut = updatedClockInData.every(c => c.clock_out_time);
          // Store the original status before modification for the WorkEntries check
          const originalEventStatus = event.status; 
          const newStatus = allClockedOut ? 'completed' : event.status;
    
          const { id, created_date, updated_date, created_by, ...updateData } = event;
          updateData.clock_in_data = updatedClockInData;
          updateData.status = newStatus;
    
          await base44.entities.Schedule.update(event.id, updateData);
    
          // MEJORA: Solo llamar a processScheduleForWorkEntries si el servicio cambió a 'completed'
          // y no se había procesado antes
          if (newStatus === 'completed' && originalEventStatus !== 'completed') {
            console.log('✓ Servicio completado por primera vez, invocando processScheduleForWorkEntries');
            try {
              const response = await base44.functions.invoke('processScheduleForWorkEntries', {
                scheduleId: event.id,
                mode: 'create'
              });
              
              if (response.data && response.data.success) {
                console.log('✓ WorkEntries procesadas:', response.data.message);
              } else {
                console.warn('⚠️ Respuesta inesperada al procesar WorkEntries:', response.data);
              }
            } catch (processError) {
              console.error('Error al procesar WorkEntries:', processError);
              // No bloqueamos el Clock Out si falla el procesamiento
            }
          } else if (newStatus === 'completed') {
            console.log('ℹ️ Servicio ya estaba completado, no se vuelve a procesar WorkEntries');
          }
    
          setNotification({
            type: "success",
            message: `Clock Out registrado exitosamente${allClockedOut ? '. Servicio completado.' : ''}`
          });
          
          await loadEvents();
        } catch (error) {
          console.error("Error en Clock Out:", error);
          setNotification({
            type: "error",
            message: "Error al registrar Clock Out. Por favor, inténtalo de nuevo."
          });
        } finally {
          // Limpiar el registro de procesamiento después de un breve delay
          setTimeout(() => {
            setProcessingSchedules(prev => {
              const newSet = new Set(prev);
              newSet.delete(event.id);
              return newSet;
            });
          }, 2000);
        }
    };
    
    // Pre-filter events based on cleaner view and selected cleaner
    const eventsToDisplay = useMemo(() => {
        if (!events) return [];
        if (isCleanerView && selectedCleanerId) {
            return events.filter(event => 
                event.cleaner_ids && event.cleaner_ids.includes(selectedCleanerId)
            );
        }
        return events;
    }, [events, isCleanerView, selectedCleanerId]);

    // CORREGIDO DEFINITIVAMENTE: Función mejorada para filtrar eventos por día
    // Ahora maneja correctamente todos los casos de zona horaria
    const getEventsForDay = (dayDate) => {
        // Crear el string de fecha en formato YYYY-MM-DD desde el objeto Date local
        const year = dayDate.getFullYear();
        const month = String(dayDate.getMonth() + 1).padStart(2, '0');
        const day = String(dayDate.getDate()).padStart(2, '0');
        const columnDateString = `${year}-${month}-${day}`;
        
        const filtered = eventsToDisplay.filter(event => {
            if (!event.start_time) {
                return false;
            }
            
            // Extraer la fecha del ISO string sin hacer ninguna conversión
            // Esto funciona porque los ISO strings siempre tienen el formato:
            // "YYYY-MM-DDTHH:MM:SS.sssZ" o "YYYY-MM-DDTHH:MM:SS.sss"
            const eventDateString = event.start_time.slice(0, 10);
            
            const matches = eventDateString === columnDateString;
            
            return matches;
        });
        
        return filtered;
    };

    const calculateEventPosition = (event) => {
        const startTime = parseISOAsUTC(event.start_time);
        const endTime = parseISOAsUTC(event.end_time);
        
        // La lógica de cálculo de horas y minutos ahora usará los componentes UTC
        const startInHours = startTime.getUTCHours() + (startTime.getUTCMinutes() / 60);
        const endInHours = endTime.getUTCHours() + (endTime.getUTCMinutes() / 60);

        // If the event starts after the visible end or ends before the visible start (in UTC), it's not visible
        if (endInHours <= VISIBLE_START_HOUR || startInHours >= VISIBLE_END_HOUR) {
            return null;
        }

        // Clip the event to the visible time range (in UTC)
        const visibleEventStart = Math.max(startInHours, VISIBLE_START_HOUR);
        const visibleEventEnd = Math.min(endInHours, VISIBLE_END_HOUR);
        
        // Calculate position relative to the visible start hour (in UTC)
        const startPositionRelative = visibleEventStart - VISIBLE_START_HOUR;
        const duration = visibleEventEnd - visibleEventStart;

        return {
            startPosition: startPositionRelative,
            duration: duration
        };
    };

    // Función para organizar eventos superpuestos en columnas
    const organizeOverlappingEvents = (dayEvents) => {
        if (dayEvents.length === 0) return [];

        // Filter out events that are entirely outside the visible range before sorting
        const visibleDayEvents = dayEvents.filter(event => {
            const eventStart = parseISOAsUTC(event.start_time);
            const eventEnd = parseISOAsUTC(event.end_time);
            const startInHours = eventStart.getUTCHours() + (eventStart.getUTCMonth() / 60);
            const endInHours = eventEnd.getUTCHours() + (eventEnd.getUTCMinutes() / 60); 
            return !(endInHours <= VISIBLE_START_HOUR || startInHours >= VISIBLE_END_HOUR);
        });

        const sortedEvents = [...visibleDayEvents].sort((a, b) => 
            parseISOAsUTC(a.start_time).getTime() - parseISOAsUTC(b.start_time).getTime()
        );

        const columns = [];
        
        sortedEvents.forEach(event => {
            const eventStart = parseISOAsUTC(event.start_time);
            const eventEnd = parseISOAsUTC(event.end_time);
            
            let columnIndex = 0;
            let placed = false;
            
            while (!placed) {
                if (!columns[columnIndex]) {
                    columns[columnIndex] = [];
                }
                
                const hasConflict = columns[columnIndex].some(existingEvent => {
                    const existingStart = parseISOAsUTC(existingEvent.start_time);
                    const existingEnd = parseISOAsUTC(existingEvent.end_time);
                    
                    return (eventStart.getTime() < existingEnd.getTime() && eventEnd.getTime() > existingStart.getTime());
                });
                
                if (!hasConflict) {
                    columns[columnIndex].push(event);
                    placed = true;
                } else {
                    columnIndex++;
                }
            }
        });

        const eventsWithColumns = [];
        columns.forEach((column, columnIndex) => {
            column.forEach(event => {
                eventsWithColumns.push({
                    ...event,
                    columnIndex,
                    totalColumns: columns.length
                });
            });
        });

        return eventsWithColumns;
    };

    // Función para obtener nombres de limpiadores con diferentes niveles de detalle
    const getCleanersDisplay = (cleanerIds, compact = false) => {
        if (!cleanerIds || cleanerIds.length === 0) return 'Sin asignar';
        
        const cleanerNames = cleanerIds
            .map(id => {
                const name = cleanerNameMap.get(id);
                if (!name) return null;
                
                if (compact) {
                    // Para espacios muy pequeños, usar iniciales
                    return name.split(' ')
                        .map(word => word.charAt(0).toUpperCase())
                        .join('');
                } else {
                    // Para espacios normales, usar solo el primer nombre
                    return name.split(' ')[0];
                }
            })
            .filter(Boolean);
        
        if (compact && cleanerNames.length > 3) {
            // Si hay muchos limpiadores y poco espacio, mostrar solo los primeros + count
            return `${cleanerNames.slice(0, 2).join(',')},+${cleanerNames.length - 2}`;
        }
        
        return cleanerNames.join(', ');
    };

    const renderEvent = (event, style, onClick) => {
        const eventDate = parseISOAsUTC(event.start_time);
        if (!eventDate || isNaN(eventDate.getTime())) {
            return null;
        }

        const startTime = format(eventDate, 'HH:mm');
        const endTime = event.end_time ? format(parseISOAsUTC(event.end_time), 'HH:mm') : '';

        const statusColors = {
            'scheduled': 'bg-blue-50 border-blue-200 text-blue-800',
            'in_progress': 'bg-green-50 border-green-300 text-green-800',
            'completed': 'bg-slate-100 border-slate-300 text-slate-800',
            'cancelled': 'bg-red-50 border-red-200 text-red-800'
        };

        const statusClass = statusColors[event.status] || statusColors['scheduled'];

        // Información para el tooltip
        const cleanerNames = event.cleaner_ids?.map(id => getCleanerName(id)) || [];
        const hasClockInData = event.clock_in_data && event.clock_in_data.length > 0;

        return (
            <HoverCard openDelay={200} closeDelay={100}>
                <HoverCardTrigger asChild>
                    <div
                        onClick={onClick}
                        style={{
                            ...style,
                            backgroundColor: event.color || '#3b82f6',
                            borderRadius: '6px',
                            padding: '4px 6px',
                            overflow: 'hidden',
                            border: '1px solid rgba(0,0,0,0.1)',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                            transition: 'all 0.2s ease',
                            height: '100%',
                            width: '100%',
                        }}
                        className="hover:scale-105 hover:shadow-md"
                    >
                        <div className="text-white font-semibold text-xs truncate mb-1">
                            {event.client_name}
                        </div>

                        {/* Iniciales de limpiadores */}
                        {event.cleaner_ids && event.cleaner_ids.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-1">
                                {event.cleaner_ids.map(cleanerId => {
                                    const initials = getCleanerInitials(cleanerId);
                                    const cleanerColor = getCleanerColor(cleanerId);
                                    
                                    return (
                                        <span
                                            key={cleanerId}
                                            className="inline-flex items-center justify-center px-1.5 py-0.5 text-[9px] font-bold rounded"
                                            style={{
                                                backgroundColor: 'rgba(0,0,0,0.3)',
                                                color: 'white',
                                                minWidth: '20px',
                                                border: `1.5px solid ${cleanerColor}`
                                            }}
                                        >
                                            {initials}
                                        </span>
                                    );
                                })}
                            </div>
                        )}

                        <div className="text-white text-[10px] opacity-90">
                            {startTime} {endTime && `- ${endTime}`}
                        </div>
                    </div>
                </HoverCardTrigger>

                <HoverCardContent 
                    side="right" 
                    align="start"
                    className="w-80 p-4 bg-white border-2 shadow-xl z-[9999]"
                    sideOffset={5}
                >
                    <div className="space-y-3">
                        {/* Header */}
                        <div className="border-b pb-2">
                            <h4 className="font-bold text-base text-slate-900 mb-1">
                                {event.client_name}
                            </h4>
                            <Badge variant="outline" className={statusClass}>
                                {event.status === 'scheduled' && 'Programado'}
                                {event.status === 'in_progress' && 'En Progreso'}
                                {event.status === 'completed' && 'Completado'}
                                {event.status === 'cancelled' && 'Cancelado'}
                            </Badge>
                        </div>

                        {/* Horario */}
                        <div className="flex items-start gap-2">
                            <Clock className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
                            <div className="text-sm">
                                <div className="font-semibold text-slate-700">
                                    {format(eventDate, "EEEE d 'de' MMMM", { locale: es })}
                                </div>
                                <div className="text-slate-600">
                                    {startTime} {endTime && `- ${endTime}`}
                                </div>
                            </div>
                        </div>

                        {/* Dirección */}
                        {event.client_address && (
                            <div className="flex items-start gap-2">
                                <MapPin className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
                                <div className="text-sm text-slate-600">
                                    {event.client_address}
                                </div>
                            </div>
                        )}

                        {/* Limpiadores asignados */}
                        {cleanerNames.length > 0 && (
                            <div className="flex items-start gap-2">
                                <Users className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
                                <div className="flex-1">
                                    <div className="text-xs font-semibold text-slate-700 mb-1">
                                        Limpiadores:
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {event.cleaner_ids.map(cleanerId => {
                                            const cleanerColor = getCleanerColor(cleanerId);
                                            const cleanerName = getCleanerName(cleanerId);
                                            
                                            return (
                                                <div
                                                    key={cleanerId}
                                                    className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs"
                                                    style={{
                                                        backgroundColor: `${cleanerColor}20`,
                                                        border: `1px solid ${cleanerColor}60`
                                                    }}
                                                >
                                                    <div
                                                        className="w-2 h-2 rounded-full"
                                                        style={{ backgroundColor: cleanerColor }}
                                                    />
                                                    <span style={{ color: cleanerColor }} className="font-medium">
                                                        {cleanerName}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Clock In/Out status */}
                        {hasClockInData && (
                            <div className="bg-slate-50 rounded-lg p-2 border border-slate-200">
                                <div className="text-xs font-semibold text-slate-700 mb-1">
                                    Estado del Servicio:
                                </div>
                                <div className="space-y-1">
                                    {event.clock_in_data.map((clockData, index) => {
                                        const cleanerName = getCleanerName(clockData.cleaner_id);
                                        const hasClockIn = clockData.clock_in_time;
                                        const hasClockOut = clockData.clock_out_time;
                                        
                                        return (
                                            <div key={index} className="text-xs text-slate-600">
                                                <span className="font-medium">{cleanerName}:</span>{' '}
                                                {hasClockIn && !hasClockOut && (
                                                    <span className="text-green-600 font-semibold">
                                                        ✓ En servicio desde {format(parseISOAsUTC(clockData.clock_in_time), 'HH:mm')}
                                                    </span>
                                                )}
                                                {hasClockIn && hasClockOut && (
                                                    <span className="text-slate-500">
                                                        Completado ({format(parseISOAsUTC(clockData.clock_in_time), 'HH:mm')} - {format(parseISOAsUTC(clockData.clock_out_time), 'HH:mm')})
                                                    </span>
                                                )}
                                                {!hasClockIn && (
                                                    <span className="text-slate-400">No iniciado</span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Notas públicas (si existen y son breves) */}
                        {event.notes_public && event.notes_public.length > 0 && (
                            <div className="bg-blue-50 rounded-lg p-2 border border-blue-200">
                                <div className="text-xs font-semibold text-blue-900 mb-1">
                                    Notas:
                                </div>
                                <div className="text-xs text-blue-800 line-clamp-3">
                                    {event.notes_public}
                                </div>
                            </div>
                        )}

                        {/* Instrucción para ver más */}
                        <div className="pt-2 border-t text-center">
                            <div className="text-xs text-slate-500 italic">
                                Haz clic para ver todos los detalles
                            </div>
                        </div>
                    </div>
                </HoverCardContent>
            </HoverCard>
        );
    };

    const renderDayOrWeekView = (days) => {
        const isWeekView = days.length > 1;
        const timeSlots = [];
        // Generate 15-minute slots for each hour within the visible range (UTC)
        for (let h = VISIBLE_START_HOUR; h < VISIBLE_END_HOUR; h++) {
            for (let m = 0; m < 60; m += 15) {
                timeSlots.push({ hour: h, minute: m });
            }
        }
        
        return (
            <div className="flex flex-col h-full">
                {isWeekView && (
                    <div className="flex border-b border-gray-200 sticky top-0 bg-white z-20">
                        <div className="w-20 flex-shrink-0 border-r border-gray-200"></div>
                        {days.map(day => (
                            <div key={day.toISOString()} className={`flex-1 p-2 text-center border-r border-gray-200 ${isToday(day) ? 'bg-blue-50' : ''}`}>
                                <div className="text-sm font-medium text-gray-900">{format(day, 'EEE', { locale: es })}</div>
                                <div className={`text-lg font-semibold ${isToday(day) ? 'text-blue-600' : 'text-gray-700'}`}>{format(day, 'd')}.</div>
                            </div>
                        ))}
                    </div>
                )}
                
                <div className="flex flex-1 overflow-auto" ref={calendarGridRef}>
                    {/* Columna de horas (Mostrando horas UTC) */}
                    <div className="w-20 flex-shrink-0 border-r border-gray-200">
                        {Array.from({ length: TOTAL_VISIBLE_HOURS }).map((_, i) => {
                            const hour = VISIBLE_START_HOUR + i;
                            return (
                                <div key={hour} className="p-2 text-sm text-gray-500 bg-gray-50 border-b border-gray-100 flex items-center justify-center"
                                    style={{height: `${HOUR_HEIGHT}px`}}
                                >
                                    {hour.toString().padStart(2, '0')}:00
                                </div>
                            );
                        })}
                    </div>
                    
                    {/* Días de la semana / Día individual */}
                    <div className="flex flex-1">
                        {days.map((day) => (
                            <div 
                                key={day.toISOString()} 
                                className="flex-1 relative border-r border-gray-200"
                                style={{ height: `${TOTAL_DISPLAY_HEIGHT_PX}px` }}
                                onDragOver={(e) => handleGridDragOver(e, day)}
                                onDrop={(e) => handleGridDrop(e, day)}
                                onDragLeave={handleGridDragLeave}
                                data-day-column="true" // Added for resize indicator to find column width
                            >
                                {/* Grid de 15 minutos para click (ya no es zona de drop principal) */}
                                {!isReadOnly && !isCleanerView && onCreateAtTime && timeSlots.map(({ hour, minute }) => {
                                    const slotTimeUTC = new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute));
                                    const slotKey = `${day.toISOString().split('T')[0]}-${hour}-${minute}`;
                                    const topPositionInPx = ((hour - VISIBLE_START_HOUR) + (minute / 60)) * HOUR_HEIGHT;
                                    
                                    return (
                                        <div
                                            key={slotKey}
                                            className="absolute w-full border-b border-dashed border-gray-100 transition-colors hover:bg-blue-50/70 pointer-events-auto"
                                            style={{ 
                                                top: `${topPositionInPx}px`, 
                                                height: `${SLOT_HEIGHT}px`,
                                                zIndex: 0
                                            }}
                                            onClick={() => handleEmptySpaceClick(day, hour, minute)}
                                            title={`Crear servicio el ${format(day, 'd MMM', { locale: es })} a las ${formatTimeUTC(slotTimeUTC)} (UTC)`}
                                        />
                                    );
                                })}

                                {/* Eventos del día */}
                                {(() => {
                                    const dayEvents = getEventsForDay(day);
                                    const organizedEvents = organizeOverlappingEvents(dayEvents);
                                    
                                    return organizedEvents.map(event => {
                                        const position = calculateEventPosition(event);
                                        // Si el evento no es visible (o solo una parte mínima), no lo renderizamos o ajustamos su posición.
                                        if (!position) return null;

                                        const columnWidth = 100 / event.totalColumns;
                                        const leftPosition = event.columnIndex * columnWidth;
                                        
                                        const topPx = position.startPosition * HOUR_HEIGHT;
                                        const heightPx = Math.max(position.duration * HOUR_HEIGHT, 32); // Altura mínima de 32px
                                        
                                        return (
                                            <div
                                                key={event.id}
                                                draggable={!isCleanerView && !isReadOnly && event.status !== 'cancelled'}
                                                onDragStart={(e) => handleDragStart(e, event)}
                                                onDragEnd={handleDragEnd}
                                                className={`absolute p-0.5 z-10`}
                                                style={{
                                                    top: `${topPx}px`,
                                                    height: `${heightPx}px`,
                                                    left: `${leftPosition}%`,
                                                    width: `${columnWidth}%`,
                                                }}
                                            >
                                                {/* NUEVO: Manejadores para redimensionar */}
                                                {!isReadOnly && !isCleanerView && event.status !== 'cancelled' && (
                                                    <>
                                                        <div
                                                            onMouseDown={(e) => handleResizeStart(e, event, 'top')}
                                                            className="absolute top-0 left-0 w-full h-2 cursor-ns-resize z-20"
                                                            title="Arrastra para cambiar la hora de inicio"
                                                        />
                                                        <div
                                                            onMouseDown={(e) => handleResizeStart(e, event, 'bottom')}
                                                            className="absolute bottom-0 left-0 w-full h-2 cursor-ns-resize z-20"
                                                            title="Arrastra para cambiar la hora de fin"
                                                        />
                                                    </>
                                                )}

                                                {renderEvent(
                                                    event,
                                                    { cursor: (!isCleanerView && !isReadOnly && event.status !== 'cancelled') ? 'grab' : 'pointer' },
                                                    () => onSelectEvent(event)
                                                )}
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    const renderDayView = () => renderDayOrWeekView([selectedDate]);
    
    const renderWeekView = () => {
        const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
        return renderDayOrWeekView(eachDayOfInterval({ start: weekStart, end: weekEnd }));
    };

    const renderMonthView = () => {
        const monthStart = startOfMonth(selectedDate);
        const monthEnd = endOfMonth(selectedDate);
        const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
        const weeks = eachWeekOfInterval({ start: calendarStart, end: endOfWeek(monthEnd, {weekStartsOn: 1}) }, { weekStartsOn: 1 });

        return (
            <div className="flex flex-col h-full">
                {/* Header de días de la semana */}
                <div className="grid grid-cols-7 border-b bg-slate-50">
                    {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(day => (
                        <div key={day} className="p-4 text-center font-semibold text-slate-700 border-r">
                            {day}
                        </div>
                    ))}
                </div>
                
                {/* Semanas del mes */}
                <div className="flex-1 grid grid-rows-6">
                    {weeks.map((weekStart, weekIndex) => (
                        <div key={weekIndex} className="grid grid-cols-7 border-b">
                            {eachDayOfInterval({ start: weekStart, end: endOfWeek(weekStart, {weekStartsOn: 1}) }).map(day => {
                                const dayEvents = getEventsForDay(day);
                                const isCurrentMonth = isSameMonth(day, selectedDate);
                                const isTodayDate = isToday(day);
                                
                                return (
                                    <div 
                                        key={day.toISOString()} 
                                        className={`border-r p-3 min-h-[180px] relative overflow-y-auto transition-colors ${
                                            !isCurrentMonth ? 'bg-gray-50 text-gray-400' : 'bg-white'
                                        } ${isTodayDate ? 'bg-blue-50 border-2 border-blue-200' : ''}`}
                                        onClick={(e) => {
                                            // BLOQUEAR CLICKS EN ESPACIOS VACÍOS PARA LIMPIADORES O EN MODO DE SOLO LECTURA
                                            if (!isReadOnly && !isCleanerView && onCreateAtTime && (e.target === e.currentTarget || e.target.closest('.empty-space'))) {
                                                handleEmptySpaceClick(day);
                                            }
                                        }}
                                        title={!isReadOnly && !isCleanerView && onCreateAtTime ? `Crear servicio el ${format(day, 'd MMM yyyy', { locale: es })}` : ''}
                                    >
                                        {/* Número del día */}
                                        <div className={`text-base font-semibold mb-3 sticky top-0 bg-white/90 backdrop-blur-sm z-10 ${
                                            isTodayDate ? 'text-blue-600 bg-blue-100/90 px-2 py-1 rounded-full text-center' : ''
                                        }`}>
                                            {format(day, 'd')}
                                        </div>
                                        
                                        {/* Eventos del día */}
                                        <div className="space-y-2">
                                            {dayEvents.map(event => (
                                                <div key={event.id}>
                                                    {renderEvent(
                                                        event,
                                                        { cursor: 'pointer' },
                                                        () => onSelectEvent(event)
                                                    )}
                                                </div>
                                            ))}
                                            
                                            {/* Espacio vacío clickeable SOLO PARA ADMIN Y CUANDO onCreateAtTime ESTÁ DISPONIBLE */}
                                            {dayEvents.length === 0 && isCurrentMonth && !isReadOnly && !isCleanerView && onCreateAtTime && (
                                                <div className="empty-space h-24 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-blue-50 rounded-lg transition-all border-2 border-dashed border-gray-200 hover:border-blue-300">
                                                    <div className="text-center">
                                                        <div className="text-2xl mb-1">+</div>
                                                        <div className="text-xs">Crear servicio</div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const getTitle = () => {
        if (view === 'day') return format(selectedDate, "EEEE, d 'de' MMMM, yyyy", { locale: es });
        if (view === 'week') {
            const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
            const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
            return `${format(weekStart, "EEE d MMM", { locale: es })} - ${format(weekEnd, "EEE d MMM yyyy", { locale: es })}`;
        }
        return format(selectedDate, "MMMM yyyy", { locale: es });
    };

    return (
        <div className="h-full flex flex-col border rounded-lg bg-card text-card-foreground shadow-sm">
            <div className={`flex flex-col p-6 ${isCleanerView ? 'sticky top-0 bg-white z-20 shadow-sm' : ''}`}>
                <div className="flex items-center justify-between flex-wrap gap-4">
                    {/* NAVEGACIÓN SIEMPRE VISIBLE */}
                    <div className="flex-1 flex justify-start items-center gap-2">
                        <Button variant="outline" size="sm" onClick={handlePrevious}><ChevronLeft className="w-4 h-4" /></Button>
                        <Button variant="outline" size="sm" onClick={handleNext}><ChevronRight className="w-4 h-4" /></Button>
                        <Button variant="outline" size="sm" onClick={handleToday}>Hoy</Button>
                    </div>

                    {/* Título (siempre visible) */}
                    <h2 className="text-xl font-semibold flex items-center gap-2 flex-shrink-0">
                        <CalendarIcon className="w-5 h-5 text-blue-600" />
                        {getTitle()}
                    </h2>

                    {/* CONTROLES DE VISTA (Diferente para Admin y Limpiador) */}
                    <div className="flex-1 flex justify-end items-center gap-1">
                        {isCleanerView ? (
                            <>
                                <Button variant={view === 'day' ? 'default' : 'outline'} size="sm" onClick={() => handleViewChange('day')}>Día</Button>
                                <Button variant={view === 'week' ? 'default' : 'outline'} size="sm" onClick={() => handleViewChange('week')}>Semana</Button>
                            </>
                        ) : (
                            <>
                                <Button variant={view === 'day' ? 'default' : 'outline'} size="sm" onClick={() => handleViewChange('day')}>Día</Button>
                                <Button variant={view === 'week' ? 'default' : 'outline'} size="sm" onClick={() => handleViewChange('week')}>Semana</Button>
                                <Button variant={view === 'month' ? 'default' : 'outline'} size="sm" onClick={() => handleViewChange('month')}>Mes</Button>
                            </>
                        )}
                    </div>
                </div>
            </div>
            
            <div className="flex-1 p-0 overflow-auto">
                {isCleanerView && view === 'day' ? (
                    <CleanerDayListView
                        events={eventsToDisplay}
                        selectedDate={selectedDate}
                        selectedCleanerId={selectedCleanerId}
                        onSelectEvent={onSelectEvent}
                        processingSchedules={processingSchedules} 
                        handleClockOut={handleClockOut} 
                        currentUser={currentUser} 
                    />
                ) : isCleanerView && view === 'week' ? (
                    renderWeekView()
                ) : (
                    <>
                        {view === 'day' && renderDayView()}
                        {view === 'week' && renderWeekView()}
                        {view === 'month' && renderMonthView()}
                    </>
                )}
            </div>

            {/* Indicador de arrastre - Sigue siendo solo para admin */}
            {!isCleanerView && dragIndicator.visible && (
                <div 
                    className="fixed flex items-center justify-center bg-blue-500/80 text-white text-sm font-bold rounded-lg shadow-xl z-50 pointer-events-none border-2 border-blue-300"
                    style={{ 
                        top: dragIndicator.top, 
                        left: dragIndicator.left,
                        width: dragIndicator.width,
                        height: `${SLOT_HEIGHT}px`,
                        transition: 'top 0.05s ease, left 0.05s ease'
                    }}
                >
                    {dragIndicator.text}
                </div>
            )}

            {/* NUEVO: Indicador de redimensionamiento */}
            {!isCleanerView && resizeIndicator.visible && (
                <div 
                    className="fixed flex items-center justify-center bg-purple-500/90 text-white text-sm font-bold rounded-lg shadow-xl z-50 pointer-events-none border-2 border-purple-300 px-3 py-2"
                    style={{ 
                        top: resizeIndicator.top, 
                        left: resizeIndicator.left,
                        maxWidth: resizeIndicator.width,
                        transition: 'top 0.05s ease, left 0.05s ease'
                    }}
                >
                    {resizeIndicator.text}
                </div>
            )}
        </div>
    );
});

HorarioCalendario.displayName = 'HorarioCalendario';

export default HorarioCalendario;
