import React, { useState, useMemo, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { format, startOfMonth, endOfMonth, subMonths, eachMonthOfInterval } from 'date-fns';
import { es } from 'date-fns/locale';

const getAvailableMonths = (workEntries) => {
    if (!workEntries || workEntries.length === 0) return [];
    const dates = workEntries.map(e => new Date(e.work_date));
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));

    const months = eachMonthOfInterval({
        start: startOfMonth(minDate),
        end: startOfMonth(maxDate),
    });

    return months
        .map(month => ({
            value: format(month, 'yyyy-MM'),
            label: format(month, 'MMMM yyyy', { locale: es }),
        }))
        .filter(month => {
            // EXCLUIR agosto y septiembre 2025
            return month.value !== '2025-08' && month.value !== '2025-09';
        })
        .reverse(); // Show most recent first
};

export default function MonthRangePicker({ onRangeChange, workEntries }) {
    const availableMonths = useMemo(() => getAvailableMonths(workEntries), [workEntries]);
    
    const [startMonth, setStartMonth] = useState('');
    const [endMonth, setEndMonth] = useState('');

    useEffect(() => {
        // Set default range to last 6 months if available
        if (availableMonths.length > 0) {
            const defaultEnd = availableMonths[0].value;
            const defaultStart = availableMonths[Math.min(5, availableMonths.length - 1)].value;
            setStartMonth(defaultStart);
            setEndMonth(defaultEnd);
            onRangeChange({
                start: startOfMonth(new Date(defaultStart)),
                end: endOfMonth(new Date(defaultEnd)),
            });
        }
    }, [availableMonths, onRangeChange]); // Changed dependency array here

    const handleApply = () => {
        if (startMonth && endMonth) {
            onRangeChange({
                start: startOfMonth(new Date(startMonth)),
                end: endOfMonth(new Date(endMonth)),
            });
        }
    };
    
    const setPresetRange = (months) => {
        const end = availableMonths[0];
        const start = availableMonths[Math.min(months - 1, availableMonths.length - 1)];
        setStartMonth(start.value);
        setEndMonth(end.value);
        onRangeChange({
            start: startOfMonth(new Date(start.value)),
            end: endOfMonth(new Date(end.value)),
        });
    };
    
    if (availableMonths.length === 0) return null;

    return (
        <div className="p-4 bg-white/50 border border-slate-200 rounded-xl shadow-md space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="text-sm font-medium text-slate-700 block mb-1">Mes de Inicio</label>
                    <Select value={startMonth} onValueChange={setStartMonth}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                        <SelectContent>
                            {availableMonths.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div>
                    <label className="text-sm font-medium text-slate-700 block mb-1">Mes de Fin</label>
                    <Select value={endMonth} onValueChange={setEndMonth}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                        <SelectContent>
                            {availableMonths.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setPresetRange(3)}>Últimos 3 meses</Button>
                <Button variant="outline" size="sm" onClick={() => setPresetRange(6)}>Últimos 6 meses</Button>
                <Button variant="outline" size="sm" onClick={() => setPresetRange(12)}>Últimos 12 meses</Button>
                <Button 
                    className="bg-blue-600 hover:bg-blue-700 text-white ml-auto" 
                    onClick={handleApply}
                    disabled={!startMonth || !endMonth || startMonth > endMonth}
                >
                    Aplicar Rango
                </Button>
            </div>
            {startMonth > endMonth && (
                <p className="text-red-600 text-sm text-center">La fecha de inicio no puede ser posterior a la fecha de fin.</p>
            )}
        </div>
    );
}