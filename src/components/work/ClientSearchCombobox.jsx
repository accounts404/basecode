import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, MapPin, Phone, X } from 'lucide-react';

export default function ClientSearchCombobox({ 
    clients, 
    selectedClient, 
    onClientSelect, 
    placeholder = "Buscar cliente..." 
}) {
    const [searchTerm, setSearchTerm] = useState('');
    const [isOpen, setIsOpen] = useState(false);

    // Filtrar clientes basado en el término de búsqueda
    const filteredClients = useMemo(() => {
        if (!searchTerm.trim()) return clients.slice(0, 20); // Mostrar los primeros 20 si no hay búsqueda
        
        const search = searchTerm.toLowerCase().trim();
        return clients.filter(client => 
            client.name?.toLowerCase().includes(search) ||
            client.address?.toLowerCase().includes(search)
        ).slice(0, 10); // Limitar a 10 resultados
    }, [clients, searchTerm]);

    const handleClientSelect = (client) => {
        onClientSelect(client);
        setSearchTerm('');
        setIsOpen(false);
    };

    const handleClearSelection = () => {
        onClientSelect(null);
        setSearchTerm('');
        setIsOpen(false);
    };

    const handleInputChange = (e) => {
        const value = e.target.value;
        setSearchTerm(value);
        setIsOpen(value.length > 0);
    };

    const handleInputFocus = () => {
        if (searchTerm.length > 0) {
            setIsOpen(true);
        }
    };

    const handleInputBlur = () => {
        // Delay closing to allow clicks on results
        setTimeout(() => setIsOpen(false), 150);
    };

    return (
        <div className="relative w-full">
            {/* Selected Client Display */}
            {selectedClient && (
                <Card className="mb-3 border-2 border-blue-200 bg-blue-50">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="flex items-center gap-3">
                                    <h4 className="font-semibold text-blue-900">{selectedClient.name}</h4>
                                    <Badge variant={selectedClient.client_type === 'commercial' ? 'default' : 'secondary'}>
                                        {selectedClient.client_type === 'commercial' ? 'Comercial' : 'Doméstico'}
                                    </Badge>
                                </div>
                                
                                {selectedClient.address && (
                                    <div className="flex items-center gap-2 text-sm text-blue-700 mt-1">
                                        <MapPin className="w-4 h-4" />
                                        <span>{selectedClient.address}</span>
                                    </div>
                                )}
                                
                                {selectedClient.mobile_number && (
                                    <div className="flex items-center gap-2 text-sm text-blue-700 mt-1">
                                        <Phone className="w-4 h-4" />
                                        <span>{selectedClient.mobile_number}</span>
                                    </div>
                                )}
                                
                                <div className="grid grid-cols-2 gap-4 text-sm mt-2">
                                    <div>
                                        <span className="font-medium text-blue-900">Precio: </span>
                                        <span className="text-blue-700">${selectedClient.current_service_price || 'No definido'}</span>
                                    </div>
                                    <div>
                                        <span className="font-medium text-blue-900">Horas: </span>
                                        <span className="text-blue-700">{selectedClient.service_hours || 'No definido'}h</span>
                                    </div>
                                </div>
                            </div>
                            
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleClearSelection}
                                className="text-blue-700 border-blue-300 hover:bg-blue-100"
                            >
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Search Input */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                    type="text"
                    placeholder={placeholder}
                    value={searchTerm}
                    onChange={handleInputChange}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                    className="pl-10 pr-4"
                />
            </div>

            {/* Search Results Dropdown */}
            {isOpen && filteredClients.length > 0 && (
                <Card className="absolute top-full left-0 right-0 mt-1 max-h-80 overflow-y-auto z-50 shadow-lg border-2">
                    <CardContent className="p-0">
                        {filteredClients.map((client) => (
                            <div
                                key={client.id}
                                className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0 transition-colors"
                                onMouseDown={(e) => e.preventDefault()} // Prevent blur on click
                                onClick={() => handleClientSelect(client)}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h4 className="font-medium text-gray-900">{client.name}</h4>
                                            <Badge 
                                                variant={client.client_type === 'commercial' ? 'default' : 'secondary'}
                                                className="text-xs"
                                            >
                                                {client.client_type === 'commercial' ? 'Com' : 'Dom'}
                                            </Badge>
                                        </div>
                                        
                                        {client.address && (
                                            <div className="flex items-center gap-1 text-xs text-gray-600 mb-1">
                                                <MapPin className="w-3 h-3" />
                                                <span className="truncate">{client.address}</span>
                                            </div>
                                        )}
                                        
                                        <div className="flex gap-4 text-xs text-gray-500">
                                            <span>${client.current_service_price || '?'}</span>
                                            <span>{client.service_hours || '?'}h</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            {/* No Results Message */}
            {isOpen && searchTerm.length > 0 && filteredClients.length === 0 && (
                <Card className="absolute top-full left-0 right-0 mt-1 z-50 shadow-lg">
                    <CardContent className="p-4 text-center text-gray-500">
                        No se encontraron clientes que coincidan con "{searchTerm}"
                    </CardContent>
                </Card>
            )}
        </div>
    );
}