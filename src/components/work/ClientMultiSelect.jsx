import React, { useState, useRef, useEffect } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function ClientMultiSelect({ 
  clients, 
  selectedClients = [], 
  onSelectionChange,
  maxSelections = 5
}) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const inputRef = useRef(null);

  // Filtrar clientes basado en búsqueda
  const filteredClients = clients.filter(client =>
    client.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectClient = (client) => {
    if (selectedClients.includes(client)) {
      // Deseleccionar
      onSelectionChange(selectedClients.filter(c => c !== client));
    } else {
      // Seleccionar (si no se alcanzó el límite)
      if (selectedClients.length < maxSelections) {
        onSelectionChange([...selectedClients, client]);
      }
    }
  };

  const handleRemoveClient = (clientToRemove) => {
    onSelectionChange(selectedClients.filter(c => c !== clientToRemove));
  };

  const handleClearAll = () => {
    onSelectionChange([]);
  };

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  return (
    <div className="w-full space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between h-auto min-h-[40px] py-2"
          >
            <div className="flex flex-wrap gap-1 flex-1">
              {selectedClients.length === 0 ? (
                <span className="text-muted-foreground">Seleccionar clientes...</span>
              ) : (
                selectedClients.map(client => (
                  <Badge 
                    key={client} 
                    variant="secondary"
                    className="text-xs"
                  >
                    {client}
                  </Badge>
                ))
              )}
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <div className="p-2 border-b">
            <Input
              ref={inputRef}
              placeholder="Buscar cliente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9"
            />
          </div>
          
          {selectedClients.length > 0 && (
            <div className="p-2 border-b bg-slate-50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-600">
                  Seleccionados: {selectedClients.length}/{maxSelections}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearAll}
                  className="h-6 px-2 text-xs"
                >
                  Limpiar todo
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {selectedClients.map(client => (
                  <Badge 
                    key={client}
                    variant="default"
                    className="text-xs cursor-pointer hover:bg-primary/80"
                    onClick={() => handleRemoveClient(client)}
                  >
                    {client}
                    <X className="ml-1 h-3 w-3" />
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <ScrollArea className="h-[200px]">
            <div className="p-1">
              {filteredClients.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  No se encontraron clientes
                </div>
              ) : (
                filteredClients.map((client) => {
                  const isSelected = selectedClients.includes(client);
                  const isDisabled = !isSelected && selectedClients.length >= maxSelections;
                  
                  return (
                    <div
                      key={client}
                      onClick={() => !isDisabled && handleSelectClient(client)}
                      className={`
                        flex items-center justify-between rounded-sm px-2 py-1.5 text-sm cursor-pointer
                        ${isSelected ? 'bg-accent' : 'hover:bg-accent'}
                        ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
                      `}
                    >
                      <span className="truncate">{client}</span>
                      {isSelected && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
          
          {selectedClients.length >= maxSelections && (
            <div className="p-2 border-t bg-amber-50">
              <p className="text-xs text-amber-700 text-center">
                Límite de {maxSelections} clientes alcanzado
              </p>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}