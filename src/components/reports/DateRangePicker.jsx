import React from "react";
import { format, startOfDay, endOfDay } from "date-fns";
import { es } from 'date-fns/locale';
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export default function DateRangePicker({ onRangeChange, initialRange }) {
  const [date, setDate] = React.useState({
    from: initialRange?.start || new Date(new Date().setMonth(new Date().getMonth() - 1)),
    to: initialRange?.end || new Date(),
  });
  const [isMobile, setIsMobile] = React.useState(false);

  // Detect if user is on mobile
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleSelect = (range) => {
    if (range) {
        const { from, to } = range;
        const newRange = { from, to };
        setDate(newRange);
        
        if (newRange.from && newRange.to) {
            onRangeChange({ start: startOfDay(newRange.from), end: endOfDay(newRange.to) });
        }
    }
  };

  const handleMobileStartDateChange = (e) => {
    const startDate = new Date(e.target.value);
    const newRange = { from: startDate, to: date.to };
    setDate(newRange);
    
    if (newRange.from && newRange.to) {
      onRangeChange({ start: startOfDay(newRange.from), end: endOfDay(newRange.to) });
    }
  };

  const handleMobileEndDateChange = (e) => {
    const endDate = new Date(e.target.value);
    const newRange = { from: date.from, to: endDate };
    setDate(newRange);
    
    if (newRange.from && newRange.to) {
      onRangeChange({ start: startOfDay(newRange.from), end: endOfDay(newRange.to) });
    }
  };

  React.useEffect(() => {
    if (date.from && date.to) {
      onRangeChange({ start: startOfDay(date.from), end: endOfDay(date.to) });
    }
  }, []);

  // Mobile version with native date inputs
  if (isMobile) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <Label htmlFor="start-date" className="text-sm font-medium">
              Fecha de Inicio
            </Label>
            <Input
              id="start-date"
              type="date"
              value={date.from ? format(date.from, 'yyyy-MM-dd') : ''}
              onChange={handleMobileStartDateChange}
              className="w-full h-12 text-base"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="end-date" className="text-sm font-medium">
              Fecha de Fin
            </Label>
            <Input
              id="end-date"
              type="date"
              value={date.to ? format(date.to, 'yyyy-MM-dd') : ''}
              onChange={handleMobileEndDateChange}
              className="w-full h-12 text-base"
            />
          </div>
        </div>
        
        {date.from && date.to && (
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-800 text-center">
              <strong>Período seleccionado:</strong><br />
              {format(date.from, "d MMM yyyy", { locale: es })} - {format(date.to, "d MMM yyyy", { locale: es })}
            </p>
          </div>
        )}
      </div>
    );
  }

  // Desktop version with calendar popover (unchanged)
  return (
    <div className="grid gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={`w-full justify-start text-left font-normal ${!date && "text-muted-foreground"}`}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "d MMM, yyyy", { locale: es })} -{" "}
                  {format(date.to, "d MMM, yyyy", { locale: es })}
                </>
              ) : (
                format(date.from, "d MMM, yyyy", { locale: es })
              )
            ) : (
              <span>Selecciona un rango</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={handleSelect}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}