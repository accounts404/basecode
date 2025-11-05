
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, Users, Copy, RotateCcw, Edit, EyeOff, X, Check } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export default function CleanerTimesManager({ 
    selectedCleaners, 
    users, 
    baseStartTime, 
    baseEndTime, 
    baseDate,
    cleanerSchedules, 
    onCleanerSchedulesChange,
    isReadOnly = false 
}) {
    const [individualCleanerTimes, setIndividualCleanerTimes] = useState({});
    const [isEditingAll, setIsEditingAll] = useState(false);
    
    // Use ref to track if we've already initialized to prevent unnecessary re-initializations
    const hasInitializedRef = useRef(false);
    const lastSelectedCleanersRef = useRef([]);

    // Helper to calculate and dispatch schedules to parent
    const calculateAndDispatchSchedules = useCallback((currentIndividualTimes) => {
        if (!selectedCleaners || selectedCleaners.length === 0) {
            onCleanerSchedulesChange([]);
            return;
        }

        const schedules = selectedCleaners.map(cleanerId => {
            const cleanerIdStr = String(cleanerId);
            const times = currentIndividualTimes[cleanerIdStr];
            let startTimeStr, endTimeStr;

            // Fallback to base times if individual times are not set for a cleaner or are invalid
            if (times && times.start_time && times.end_time) {
                startTimeStr = times.start_time;
                endTimeStr = times.end_time;
            } else {
                startTimeStr = baseStartTime;
                endTimeStr = baseEndTime;
            }
            
            // Construct date objects for ISOString conversion
            const startDateTime = new Date(`${baseDate}T${startTimeStr}:00`);
            const endDateTime = new Date(`${baseDate}T${endTimeStr}:00`);
            
            // Validate dates before returning
            if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
                console.warn(`Invalid date/time for cleanerId: ${cleanerIdStr}. start_time: ${startTimeStr}, end_time: ${endTimeStr}, baseDate: ${baseDate}`);
                return null;
            }

            return {
                cleaner_id: cleanerIdStr,
                start_time: startDateTime.toISOString(),
                end_time: endDateTime.toISOString()
            };
        }).filter(Boolean);

        onCleanerSchedulesChange(schedules);
    }, [selectedCleaners, baseDate, onCleanerSchedulesChange, baseStartTime, baseEndTime]);

    // 1. Initialize individual times with proper dependency tracking
    useEffect(() => {
        // Check if cleaners have actually changed
        const cleanersChanged = JSON.stringify([...selectedCleaners].sort()) !== JSON.stringify([...lastSelectedCleanersRef.current].sort());
        
        // Only initialize if:
        // - We haven't initialized yet, OR
        // - The selected cleaners have changed, OR  
        // - Base times have changed significantly
        if (!hasInitializedRef.current || cleanersChanged) {
            const initialTimes = {};
            const baseStart = new Date(`${baseDate}T${baseStartTime}`);
            const baseEnd = new Date(`${baseDate}T${baseEndTime}`);

            if (!isNaN(baseStart.getTime()) && !isNaN(baseEnd.getTime())) {
                selectedCleaners.forEach(cleanerId => {
                    const cleanerIdStr = String(cleanerId);
                    const existingSchedule = cleanerSchedules?.find(cs => String(cs.cleaner_id) === cleanerIdStr);
                    if (existingSchedule) {
                        initialTimes[cleanerIdStr] = {
                            start_time: format(parseISO(existingSchedule.start_time), 'HH:mm'),
                            end_time: format(parseISO(existingSchedule.end_time), 'HH:mm'),
                        };
                    } else {
                        initialTimes[cleanerIdStr] = {
                            start_time: format(baseStart, 'HH:mm'),
                            end_time: format(baseEnd, 'HH:mm'),
                        };
                    }
                });
            }
            
            setIndividualCleanerTimes(initialTimes);
            calculateAndDispatchSchedules(initialTimes);
            
            // Mark as initialized and update refs
            hasInitializedRef.current = true;
            lastSelectedCleanersRef.current = [...selectedCleaners];
        }
    }, [selectedCleaners, baseStartTime, baseEndTime, baseDate, cleanerSchedules, calculateAndDispatchSchedules]);

    // 2. ELIMINAMOS COMPLETAMENTE EL useEffect DE SINCRONIZACIÓN
    // Este useEffect causaba el bucle infinito, ya no es necesario
    // useEffect(() => { ... }, [cleanerSchedules, individualCleanerTimes]);

    const handleTimeChange = useCallback((cleanerId, field, value) => {
        const cleanerIdStr = String(cleanerId);
        setIndividualCleanerTimes(prev => {
            const newTimes = {
                ...prev,
                [cleanerIdStr]: {
                    ...prev[cleanerIdStr],
                    [field]: value,
                },
            };
            calculateAndDispatchSchedules(newTimes);
            return newTimes;
        });
    }, [calculateAndDispatchSchedules]);

    const copyTimesToAll = useCallback((sourceCleanerId) => {
        const sourceCleanerIdStr = String(sourceCleanerId);
        const sourceTimes = individualCleanerTimes[sourceCleanerIdStr];
        if (!sourceTimes) return;

        setIndividualCleanerTimes(prev => {
            const newTimes = { ...prev };
            selectedCleaners.forEach(cleanerId => {
                const targetCleanerIdStr = String(cleanerId);
                if (targetCleanerIdStr !== sourceCleanerIdStr) {
                    newTimes[targetCleanerIdStr] = { ...sourceTimes };
                }
            });
            calculateAndDispatchSchedules(newTimes);
            return newTimes;
        });
    }, [individualCleanerTimes, selectedCleaners, calculateAndDispatchSchedules]);

    const resetToBaseTimes = useCallback(() => {
        setIndividualCleanerTimes(prev => {
            const newTimes = {};
            const baseStart = new Date(`${baseDate}T${baseStartTime}`);
            const baseEnd = new Date(`${baseDate}T${baseEndTime}`);

            selectedCleaners.forEach(cleanerId => {
                newTimes[String(cleanerId)] = {
                    start_time: format(baseStart, 'HH:mm'),
                    end_time: format(baseEnd, 'HH:mm')
                };
            });
            calculateAndDispatchSchedules(newTimes);
            return newTimes;
        });
    }, [selectedCleaners, baseStartTime, baseEndTime, baseDate, calculateAndDispatchSchedules]);

    const getCleanerName = (cleanerId) => {
        const cleaner = users.find(u => String(u.id) === String(cleanerId));
        return cleaner ? (cleaner.invoice_name || cleaner.full_name) : 'Limpiador desconocido';
    };

    const calculateHours = (startTime, endTime) => {
        if (!startTime || !endTime) return '0.00h';
        const start = new Date(`2024-01-01T${startTime}:00`);
        const end = new Date(`2024-01-01T${endTime}:00`);
        if (isNaN(start) || isNaN(end) || end < start) return '0.00h';
        const diffMs = end - start;
        const diffHours = diffMs / (1000 * 60 * 60);
        return `${diffHours.toFixed(2)}h`;
    };

    if (selectedCleaners.length === 0) {
        return null;
    }

    if (!isEditingAll || isReadOnly) {
        // --- VISTA RESUMIDA (COLAPSADA) ---
        const totalHours = selectedCleaners.reduce((acc, cleanerId) => {
             const cleanerIdStr = String(cleanerId);
             const times = individualCleanerTimes[cleanerIdStr] || { start_time: baseStartTime, end_time: baseEndTime };
             const start = new Date(`2024-01-01T${times.start_time}:00`);
             const end = new Date(`2024-01-01T${times.end_time}:00`);
             if (isNaN(start) || isNaN(end) || end < start) return acc;
             const diffMs = end - start;
             return acc + (diffMs / (1000 * 60 * 60));
        }, 0);

        return (
            <Card className="bg-slate-50 border-slate-200">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Clock className="w-5 h-5 text-blue-600" />
                            Horarios Individuales
                        </CardTitle>
                        {!isReadOnly && (
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => setIsEditingAll(true)}
                                className="flex items-center gap-2"
                            >
                                <Edit className="w-4 h-4" />
                                Editar Horarios
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2 text-sm">
                        {selectedCleaners.map(cleanerId => {
                            const cleanerIdStr = String(cleanerId);
                            const cleanerTimes = individualCleanerTimes[cleanerIdStr] || { start_time: baseStartTime, end_time: baseEndTime };
                            const hours = calculateHours(cleanerTimes.start_time, cleanerTimes.end_time);
                            return (
                                <div key={cleanerIdStr} className="flex justify-between items-center">
                                    <span className="text-slate-800 font-medium">{getCleanerName(cleanerIdStr)}</span>
                                    <span className="text-slate-600 font-mono bg-white px-2 py-1 rounded">
                                        {cleanerTimes.start_time} - {cleanerTimes.end_time} ({hours})
                                    </span>
                                </div>
                            );
                        })}
                        <div className="pt-2 mt-2 border-t border-slate-300"></div>
                         <div className="flex justify-between items-center font-bold">
                            <span className="text-slate-800">Total Horas de Trabajo</span>
                            <span className="text-slate-900 bg-blue-100 text-blue-800 px-2 py-1 rounded">{totalHours.toFixed(2)}h</span>
                        </div>
                    </div>
                </CardContent>
            </Card>
        );
    }
    
    // --- VISTA DETALLADA (EXPANDIDA) ---
    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Clock className="w-5 h-5 text-blue-600" />
                        Editar Horarios Individuales
                    </CardTitle>
                    <div className="flex gap-2">
                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={resetToBaseTimes}
                            className="flex items-center gap-2"
                        >
                            <RotateCcw className="w-4 h-4" />
                            Resetear
                        </Button>
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setIsEditingAll(false)}
                            className="flex items-center gap-2"
                        >
                            <EyeOff className="w-4 h-4" />
                            Ocultar
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-medium text-blue-900 mb-2">💡 Gestión de Horarios Flexibles</h4>
                    <p className="text-sm text-blue-800 leading-relaxed">
                        Configura horarios específicos para cada limpiador. Útil si uno llega tarde o sale antes. 
                        Puedes copiar un horario a todos para agilizar.
                    </p>
                </div>

                {selectedCleaners.map(cleanerId => {
                    const cleanerIdStr = String(cleanerId);
                    const cleanerTimes = individualCleanerTimes[cleanerIdStr] || { start_time: baseStartTime, end_time: baseEndTime };
                    const hours = calculateHours(cleanerTimes.start_time, cleanerTimes.end_time);
                    
                    return (
                        <div key={cleanerIdStr} className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                                        <Users className="w-5 h-5 text-blue-600" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-slate-900">{getCleanerName(cleanerIdStr)}</h3>
                                        <Badge variant="outline" className="mt-1">
                                            {hours} total
                                        </Badge>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => copyTimesToAll(cleanerIdStr)}
                                    className="flex items-center gap-2 text-blue-600 hover:text-blue-700"
                                    title="Copiar estos horarios a todos los demás limpiadores"
                                >
                                    <Copy className="w-4 h-4" />
                                    Copiar a Todos
                                </Button>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor={`start-${cleanerIdStr}`} className="text-sm font-medium">
                                        Hora de Inicio
                                    </Label>
                                    <Input
                                        id={`start-${cleanerIdStr}`}
                                        type="time"
                                        value={cleanerTimes.start_time}
                                        onChange={(e) => handleTimeChange(cleanerIdStr, 'start_time', e.target.value)}
                                        className="text-center font-mono"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor={`end-${cleanerIdStr}`} className="text-sm font-medium">
                                        Hora de Finalización
                                    </Label>
                                    <Input
                                        id={`end-${cleanerIdStr}`}
                                        type="time"
                                        value={cleanerTimes.end_time}
                                        onChange={(e) => handleTimeChange(cleanerIdStr, 'end_time', e.target.value)}
                                        className="text-center font-mono"
                                    />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </CardContent>
        </Card>
    );
}
