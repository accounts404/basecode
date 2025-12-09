import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, X, Check } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';

const MONTHS = [
    { value: 0, label: 'Enero' },
    { value: 1, label: 'Febrero' },
    { value: 2, label: 'Marzo' },
    { value: 3, label: 'Abril' },
    { value: 4, label: 'Mayo' },
    { value: 5, label: 'Junio' },
    { value: 6, label: 'Julio' },
    { value: 7, label: 'Agosto' },
    { value: 8, label: 'Septiembre' },
    { value: 9, label: 'Octubre' },
    { value: 10, label: 'Noviembre' },
    { value: 11, label: 'Diciembre' }
];

export default function MonthMultiSelector({ onSelectionChange }) {
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedMonths, setSelectedMonths] = useState(new Set());

    // Generar lista de años (año actual y 2 años anteriores)
    const availableYears = useMemo(() => {
        const currentYear = new Date().getFullYear();
        return [currentYear, currentYear - 1, currentYear - 2];
    }, []);

    const toggleMonth = (monthValue) => {
        const newSelected = new Set(selectedMonths);
        const monthKey = `${selectedYear}-${monthValue}`;
        
        if (newSelected.has(monthKey)) {
            newSelected.delete(monthKey);
        } else {
            newSelected.add(monthKey);
        }
        
        setSelectedMonths(newSelected);
        
        // Construir los rangos de fechas para los meses seleccionados
        const dateRanges = Array.from(newSelected).map(key => {
            const [year, month] = key.split('-').map(Number);
            const date = new Date(year, month, 1);
            return {
                start: startOfMonth(date),
                end: endOfMonth(date),
                label: format(date, 'MMMM yyyy', { locale: es })
            };
        });
        
        onSelectionChange(dateRanges);
    };

    const clearSelection = () => {
        setSelectedMonths(new Set());
        onSelectionChange([]);
    };

    const isMonthSelected = (monthValue) => {
        return selectedMonths.has(`${selectedYear}-${monthValue}`);
    };

    return (
        <Card className="shadow-md border-slate-200">
            <CardContent className="p-6">
                <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-blue-600" />
                            <h3 className="font-semibold text-slate-900">Seleccionar Meses</h3>
                        </div>
                        {selectedMonths.size > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={clearSelection}
                                className="text-slate-500 hover:text-slate-700"
                            >
                                <X className="w-4 h-4 mr-1" />
                                Limpiar ({selectedMonths.size})
                            </Button>
                        )}
                    </div>

                    {/* Year Selector */}
                    <div className="flex gap-2">
                        {availableYears.map(year => (
                            <Button
                                key={year}
                                variant={selectedYear === year ? "default" : "outline"}
                                size="sm"
                                onClick={() => setSelectedYear(year)}
                                className="flex-1"
                            >
                                {year}
                            </Button>
                        ))}
                    </div>

                    {/* Month Grid */}
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                        {MONTHS.map(month => {
                            const isSelected = isMonthSelected(month.value);
                            return (
                                <Button
                                    key={month.value}
                                    variant={isSelected ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => toggleMonth(month.value)}
                                    className={`relative ${
                                        isSelected 
                                            ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                                            : 'hover:bg-blue-50 hover:border-blue-300'
                                    }`}
                                >
                                    {isSelected && (
                                        <Check className="w-3 h-3 absolute top-1 right-1" />
                                    )}
                                    <span className="text-xs font-medium">{month.label.slice(0, 3)}</span>
                                </Button>
                            );
                        })}
                    </div>

                    {/* Selected Months Display */}
                    {selectedMonths.size > 0 && (
                        <div className="pt-3 border-t border-slate-200">
                            <p className="text-xs text-slate-600 mb-2">Meses seleccionados:</p>
                            <div className="flex flex-wrap gap-2">
                                {Array.from(selectedMonths)
                                    .sort()
                                    .map(key => {
                                        const [year, month] = key.split('-').map(Number);
                                        const date = new Date(year, month, 1);
                                        const label = format(date, 'MMM yyyy', { locale: es });
                                        
                                        return (
                                            <Badge 
                                                key={key} 
                                                variant="secondary"
                                                className="bg-blue-100 text-blue-800 hover:bg-blue-200"
                                            >
                                                {label}
                                            </Badge>
                                        );
                                    })}
                            </div>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}