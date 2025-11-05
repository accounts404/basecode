import React, { useState, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { ChevronsUpDown, Check } from 'lucide-react';

export default function MatchingCombobox({ value, onChange, allSystemNames, usedSystemNames }) {
  const [open, setOpen] = useState(false);

  const sortedNames = useMemo(() => {
    const usedSet = new Set(usedSystemNames.filter(name => name !== value)); // Exclude current value from being marked as "used"
    return [...allSystemNames].sort((a, b) => {
      const aIsUsed = usedSet.has(a);
      const bIsUsed = usedSet.has(b);
      if (aIsUsed === bIsUsed) return a.localeCompare(b);
      return aIsUsed ? 1 : -1;
    });
  }, [allSystemNames, usedSystemNames, value]);

  const handleSelect = (currentValue) => {
    onChange(currentValue);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between md:w-80"
        >
          {value && value !== "NO_MATCH"
            ? value
            : <span className="text-slate-500">Seleccionar coincidencia...</span>}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command filter={(value, search) => {
            if (value.toLowerCase().includes(search.toLowerCase())) return 1;
            return 0;
        }}>
          <CommandInput placeholder="Buscar nombre..." />
          <CommandList>
            <CommandEmpty>No se encontró el nombre.</CommandEmpty>
            
            <CommandGroup>
                <CommandItem
                    value="NO_MATCH"
                    onSelect={() => handleSelect("NO_MATCH")}
                    className="text-red-600 font-medium cursor-pointer"
                >
                    <Check className={`mr-2 h-4 w-4 ${value === "NO_MATCH" ? "opacity-100" : "opacity-0"}`} />
                    Ignorar / Sin Coincidencia
                </CommandItem>
            </CommandGroup>
            
            <CommandGroup heading="Nombres en el Sistema">
              {sortedNames.map((name) => (
                <CommandItem
                  key={name}
                  value={name}
                  onSelect={() => handleSelect(name)}
                  className={`cursor-pointer ${usedSystemNames.includes(name) && name !== value ? 'text-slate-400' : ''}`}
                >
                  <Check className={`mr-2 h-4 w-4 ${value === name ? "opacity-100" : "opacity-0"}`} />
                  <span>{name}</span>
                </CommandItem>
              ))}
            </CommandGroup>

          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}