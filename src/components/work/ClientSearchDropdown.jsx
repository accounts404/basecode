import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";

export default function ClientSearchDropdown({ clients, selectedClient, onClientSelect }) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  const uniqueClients = [...new Set(clients.map(client => client.toLowerCase()))]
    .map(name => clients.find(client => client.toLowerCase() === name))
    .sort();

  const filteredClients = uniqueClients.filter(client =>
    client.toLowerCase().includes(searchValue.toLowerCase())
  );

  const handleSelect = (client) => {
    onClientSelect(client);
    setOpen(false);
    setSearchValue("");
  };

  const handleClear = () => {
    onClientSelect("");
    setSearchValue("");
  };

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="justify-between min-w-[250px]"
          >
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-slate-400" />
              {selectedClient || "Buscar cliente..."}
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0">
          <Command>
            <CommandInput
              placeholder="Buscar cliente..."
              value={searchValue}
              onValueChange={setSearchValue}
            />
            <CommandList>
              <CommandEmpty>No se encontraron clientes.</CommandEmpty>
              <CommandGroup>
                {filteredClients.map((client) => (
                  <CommandItem
                    key={client}
                    value={client}
                    onSelect={() => handleSelect(client)}
                  >
                    <Check
                      className={`mr-2 h-4 w-4 ${
                        selectedClient === client ? "opacity-100" : "opacity-0"
                      }`}
                    />
                    <div>
                      <p className="font-medium">{client}</p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      
      {selectedClient && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClear}
          className="h-10 w-10 p-0"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}