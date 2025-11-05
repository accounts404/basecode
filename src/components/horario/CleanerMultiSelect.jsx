import React, { useMemo } from 'react';
import { Command, CommandInput, CommandList, CommandItem, CommandGroup, CommandEmpty } from '@/components/ui/command';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User } from 'lucide-react';

export default function CleanerMultiSelect({ allCleaners, selectedCleanerIds, onSelectionChange }) {
    const cleanersByType = useMemo(() => {
        const permanent = allCleaners.filter(c => c.employee_type === 'permanent' && c.active !== false);
        const casual = allCleaners.filter(c => (c.employee_type === 'casual' || !c.employee_type) && c.active !== false);
        const inactive = allCleaners.filter(c => c.active === false);
        return { permanent, casual, inactive };
    }, [allCleaners]);

    const handleSelect = (cleanerId) => {
        const newSelection = new Set(selectedCleanerIds);
        if (newSelection.has(cleanerId)) {
            newSelection.delete(cleanerId);
        } else {
            newSelection.add(cleanerId);
        }
        onSelectionChange(Array.from(newSelection));
    };

    const renderCleanerList = (cleaners) => {
        return cleaners.map(cleaner => (
            <CommandItem
                key={cleaner.id}
                onSelect={() => handleSelect(cleaner.id)}
                className="flex items-center gap-3 cursor-pointer"
            >
                <Checkbox
                    checked={selectedCleanerIds.includes(cleaner.id)}
                    onCheckedChange={() => handleSelect(cleaner.id)}
                />
                <Avatar className="w-8 h-8">
                    <AvatarImage src={cleaner.profile_photo_url} alt={cleaner.full_name} />
                    <AvatarFallback>{cleaner.full_name?.charAt(0) || '?'}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                    {/* MODIFICADO: Priorizar display_name */}
                    <p className="font-medium">{cleaner.display_name || cleaner.invoice_name || cleaner.full_name}</p>
                    <p className="text-xs text-slate-500">{cleaner.email}</p>
                </div>
            </CommandItem>
        ));
    };

    return (
        <Command className="rounded-lg border shadow-sm">
            <CommandInput placeholder="Buscar limpiador por nombre o email..." />
            <CommandList className="max-h-[300px]">
                <CommandEmpty>No se encontraron limpiadores.</CommandEmpty>
                
                {cleanersByType.permanent.length > 0 && (
                    <CommandGroup heading="De Planta">
                        {renderCleanerList(cleanersByType.permanent)}
                    </CommandGroup>
                )}

                {cleanersByType.casual.length > 0 && (
                    <CommandGroup heading="Casuales">
                        {renderCleanerList(cleanersByType.casual)}
                    </CommandGroup>
                )}

                {cleanersByType.inactive.length > 0 && (
                     <CommandGroup heading="Inactivos">
                        {renderCleanerList(cleanersByType.inactive)}
                    </CommandGroup>
                )}
            </CommandList>
        </Command>
    );
}