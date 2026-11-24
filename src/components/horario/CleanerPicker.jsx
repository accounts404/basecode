import React from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandItem, CommandGroup, CommandEmpty } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";

const labelOf = (u) => u?.display_name || u?.invoice_name || u?.full_name || "Limpiador";

// Selector de limpiador reutilizable (entrenador / aprendiz)
export default function CleanerPicker({
  cleaners = [],
  value,
  onChange,
  placeholder = "Seleccionar limpiador...",
  excludeId = null,
}) {
  const options = cleaners.filter((c) => c.id !== excludeId);
  const selected = cleaners.find((c) => c.id === value);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className="truncate">{selected ? labelOf(selected) : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50 flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[320px]" align="start">
        <Command>
          <CommandInput placeholder="Buscar limpiador..." />
          <CommandList className="max-h-[260px]">
            <CommandEmpty>No se encontraron limpiadores.</CommandEmpty>
            <CommandGroup>
              {options.map((c) => (
                <CommandItem
                  key={c.id}
                  value={labelOf(c)}
                  onSelect={() => onChange(c.id)}
                  className="flex items-center gap-2"
                >
                  <Check className={`h-4 w-4 flex-shrink-0 ${value === c.id ? "opacity-100" : "opacity-0"}`} />
                  <span className="truncate">{labelOf(c)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}