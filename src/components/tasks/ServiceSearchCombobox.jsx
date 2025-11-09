import React, { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, CalendarClock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function ServiceSearchCombobox({
  schedules,
  selectedSchedule,
  onScheduleSelect,
  placeholder = 'Buscar servicio...',
}) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Filter and sort schedules
  const filteredSchedules = useMemo(() => {
    if (!schedules || schedules.length === 0) return [];
    
    const filtered = schedules.filter(schedule => {
      if (!searchTerm) return true;
      
      const term = searchTerm.toLowerCase();
      const clientName = schedule.client_name?.toLowerCase() || '';
      const address = schedule.client_address?.toLowerCase() || '';
      const startTime = schedule.start_time ? format(new Date(schedule.start_time), 'PPP', { locale: es }).toLowerCase() : '';
      
      return clientName.includes(term) || address.includes(term) || startTime.includes(term);
    });

    // Sort by start_time (most recent first)
    return filtered.sort((a, b) => {
      if (!a.start_time) return 1;
      if (!b.start_time) return -1;
      return new Date(b.start_time).getTime() - new Date(a.start_time).getTime();
    }).slice(0, 100); // Limit to 100 results
  }, [schedules, searchTerm]);

  const handleSelect = (schedule) => {
    onScheduleSelect(schedule);
    setOpen(false);
  };

  const handleClear = () => {
    onScheduleSelect(null);
    setSearchTerm('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {selectedSchedule ? (
            <span className="truncate">
              {selectedSchedule.client_name} - {format(new Date(selectedSchedule.start_time), "d 'de' MMM", { locale: es })}
            </span>
          ) : (
            <span className="text-slate-500">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar por cliente o fecha..."
            value={searchTerm}
            onValueChange={setSearchTerm}
          />
          <CommandEmpty>
            No se encontraron servicios.
          </CommandEmpty>
          <CommandGroup className="max-h-[300px] overflow-auto">
            {selectedSchedule && (
              <CommandItem
                value="clear"
                onSelect={handleClear}
                className="text-red-600"
              >
                Limpiar selección
              </CommandItem>
            )}
            {filteredSchedules.map((schedule) => (
              <CommandItem
                key={schedule.id}
                value={schedule.id}
                onSelect={() => handleSelect(schedule)}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <CalendarClock className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{schedule.client_name}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {format(new Date(schedule.start_time), "PPP 'a las' HH:mm", { locale: es })}
                    </p>
                    {schedule.client_address && (
                      <p className="text-xs text-slate-400 truncate">{schedule.client_address}</p>
                    )}
                  </div>
                </div>
                <Check
                  className={cn(
                    'ml-2 h-4 w-4 flex-shrink-0',
                    selectedSchedule?.id === schedule.id ? 'opacity-100' : 'opacity-0'
                  )}
                />
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}