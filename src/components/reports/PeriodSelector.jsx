import React, { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { format, startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay } from "date-fns";
import { es } from "date-fns/locale";
import DateRangePicker from "./DateRangePicker";

const generateBillingPeriods = () => {
  const periods = [];
  const today = new Date();
  
  for (let i = 0; i < 6; i++) {
    const dateCursor = subMonths(today, i);
    const monthName = format(dateCursor, "MMMM yyyy", { locale: es });

    // 2nd half of the month
    const startOfSecondHalf = startOfDay(new Date(dateCursor.getFullYear(), dateCursor.getMonth(), 16));
    if (dateCursor >= startOfSecondHalf || i > 0) {
       periods.push({
        key: `${format(dateCursor, "yyyy-MM")}-2`,
        label: `2da Quincena - ${monthName}`,
        start: startOfSecondHalf,
        end: endOfDay(endOfMonth(dateCursor))
      });
    }

    // 1st half of the month
    periods.push({
      key: `${format(dateCursor, "yyyy-MM")}-1`,
      label: `1ra Quincena - ${monthName}`,
      start: startOfDay(startOfMonth(dateCursor)),
      end: endOfDay(new Date(dateCursor.getFullYear(), dateCursor.getMonth(), 15))
    });
  }
  return periods;
};

export default function PeriodSelector({ onPeriodChange }) {
  const [periods, setPeriods] = useState([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [mode, setMode] = useState('periods');

  useEffect(() => {
    const generatedPeriods = generateBillingPeriods();
    setPeriods(generatedPeriods);
    if (generatedPeriods.length > 0) {
      const defaultPeriod = generatedPeriods[0];
      setSelectedKey(defaultPeriod.key);
      onPeriodChange(defaultPeriod);
    }
  }, []);

  const handlePeriodSelect = (key) => {
    const selected = periods.find(p => p.key === key);
    if (selected) {
      setSelectedKey(key);
      onPeriodChange(selected);
    }
  };

  const handleCustomRangeChange = (range) => {
    onPeriodChange(range);
    setSelectedKey('');
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    
    if (newMode === 'periods') {
      if (periods.length > 0) {
        handlePeriodSelect(periods[0].key);
      }
    } else if (newMode === 'month') {
      const today = new Date();
      const currentMonthPeriod = {
        start: startOfDay(startOfMonth(today)),
        end: endOfDay(endOfMonth(today))
      };
      onPeriodChange(currentMonthPeriod);
      setSelectedKey('');
    }
    // For 'custom', the DateRangePicker will handle the change.
  };

  const renderContent = () => {
    switch (mode) {
      case 'periods':
        return (
          <Select value={selectedKey} onValueChange={handlePeriodSelect}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecciona un período..." />
            </SelectTrigger>
            <SelectContent>
              {periods.map(period => (
                <SelectItem key={period.key} value={period.key}>
                  {period.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case 'month':
        const today = new Date();
        return (
          <div className="flex items-center justify-center p-3 text-center bg-slate-100 rounded-lg border border-slate-200">
            <p className="text-sm font-medium text-slate-700">
              Mostrando datos para: <span className="font-bold">{format(today, "MMMM yyyy", { locale: es })}</span>
            </p>
          </div>
        );
      case 'custom':
        return <DateRangePicker onRangeChange={handleCustomRangeChange} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-1 rounded-lg bg-slate-100 p-1">
        <Button 
          variant={mode === 'periods' ? 'secondary' : 'ghost'} 
          onClick={() => switchMode('periods')}
          className="flex-1 shadow-sm"
        >
          Períodos Fact.
        </Button>
        <Button 
          variant={mode === 'month' ? 'secondary' : 'ghost'} 
          onClick={() => switchMode('month')}
          className="flex-1 shadow-sm"
        >
          Mes Actual
        </Button>
        <Button 
          variant={mode === 'custom' ? 'secondary' : 'ghost'} 
          onClick={() => switchMode('custom')}
          className="flex-1 shadow-sm"
        >
          Personalizado
        </Button>
      </div>
      
      {renderContent()}
    </div>
  );
}