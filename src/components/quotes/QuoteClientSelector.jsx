import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, MapPin, Phone, X, UserPlus } from 'lucide-react';

export default function QuoteClientSelector({ 
    clients, 
    selectedClientId, 
    onClientSelect,
    onCreateNewClient,
    placeholder = "Buscar cliente o crear nuevo..." 
}) {
    const [searchTerm, setSearchTerm] = useState('');
    const [isOpen, setIsOpen] = useState(false);

    const selectedClient = clients.find(c => c.id === selectedClientId);

    // Filtrar clientes basado en el término de búsqueda
    const filteredClients = useMemo(() => {
        if (!searchTerm.trim()) return clients.slice(0, 20);
        
        const search = searchTerm.toLowerCase().trim();
        return clients.filter(client => 
            client.name?.toLowerCase().includes(search) ||
            client.address?.toLowerCase().includes(search) ||
            client.mobile_number?.includes(search)
        ).slice(0, 15);
    }, [clients, searchTerm]);

    const handleClientSelect = (clientId) => {
        onClientSelect(clientId);
        setSearchTerm('');
        setIsOpen(false);
    };

    const handleNewClient = () => {
        onClientSelect('');
        setSearchTerm('');
        setIsOpen(false);
        if (onCreateNewClient) onCreateNewClient();
    };

    const handleClearSelection = () => {
        onClientSelect('');
        setSearchTerm('');
    };

    const handleInputChange = (e) => {
        const value = e.target.value;
        setSearchTerm(value);
        setIsOpen(true);
    };

    const handleInputFocus = () => {
        setIsOpen(true);
    };

    const handleInputBlur = () => {
        setTimeout(() => setIsOpen(false), 200);
    };

    return (
        <div className="relative w-full">
            {/* Selected Client Display */}
            {selectedClient && (
                <Card className="mb-3 border-2 border-blue-200 bg-blue-50">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                    <h4 className="font-semibold text-blue-900 text-lg">{selectedClient.name}</h4>
                                    <Badge variant={selectedClient.client_type === 'commercial' ? 'default' : 'secondary'}>
                                        {selectedClient.client_type === 'commercial' ? 'Comercial' : 'Doméstico'}
                                    </Badge>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                    {selectedClient.address && (
                                        <div className="flex items-center gap-2 text-blue-700">
                                            <MapPin className="w-4 h-4" />
                                            <span>{selectedClient.address}</span>
                                        </div>
                                    )}
                                    
                                    {selectedClient.mobile_number && (
                                        <div className="flex items-center gap-2 text-blue-700">
                                            <Phone className="w-4 h-4" />
                                            <span>{selectedClient.mobile_number}</span>
                                        </div>
                                    )}
                                    
                                    {selectedClient.email && (
                                        <div className="text-blue-700 md:col-span-2">
                                            📧 {selectedClient.email}
                                        </div>
                                    )}
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
            {!selectedClient && (
                <>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <Input
                            type="text"
                            placeholder={placeholder}
                            value={searchTerm}
                            onChange={handleInputChange}
                            onFocus={handleInputFocus}
                            onBlur={handleInputBlur}
                            className="pl-10 pr-4 h-12 text-base"
                        />
                    </div>

                    {/* Search Results Dropdown */}
                    {isOpen && (
                        <Card className="absolute top-full left-0 right-0 mt-1 max-h-96 overflow-y-auto z-50 shadow-xl border-2">
                            <CardContent className="p-0">
                                {/* Opción de Nuevo Cliente */}
                                <div
                                    className="p-4 bg-gradient-to-r from-blue-50 to-blue-100 cursor-pointer border-b-2 border-blue-200 hover:from-blue-100 hover:to-blue-200 transition-colors"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={handleNewClient}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-blue-600 rounded-lg">
                                            <UserPlus className="w-5 h-5 text-white" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-blue-900">+ Nuevo Cliente</h4>
                                            <p className="text-xs text-blue-700">Crear cliente después de aprobar</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Lista de Clientes */}
                                {filteredClients.length > 0 ? (
                                    filteredClients.map((client) => (
                                        <div
                                            key={client.id}
                                            className="p-3 hover:bg-blue-50 cursor-pointer border-b last:border-b-0 transition-colors"
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => handleClientSelect(client.id)}
                                        >
                                            <div className="flex items-center gap-2 mb-1">
                                                <h4 className="font-semibold text-gray-900">{client.name}</h4>
                                                <Badge 
                                                    variant={client.client_type === 'commercial' ? 'default' : 'secondary'}
                                                    className="text-xs"
                                                >
                                                    {client.client_type === 'commercial' ? 'Com' : 'Dom'}
                                                </Badge>
                                                {!client.active && (
                                                    <Badge variant="outline" className="text-xs border-red-300 text-red-600">
                                                        Inactivo
                                                    </Badge>
                                                )}
                                            </div>
                                            
                                            {client.address && (
                                                <div className="flex items-center gap-1 text-xs text-gray-600 mb-1">
                                                    <MapPin className="w-3 h-3" />
                                                    <span className="truncate">{client.address}</span>
                                                </div>
                                            )}
                                            
                                            <div className="flex gap-4 text-xs text-gray-500">
                                                {client.mobile_number && <span>📱 {client.mobile_number}</span>}
                                                {client.service_frequency && (
                                                    <span className="text-blue-600 font-medium">
                                                        {client.service_frequency === 'weekly' ? 'Semanal' : 
                                                         client.service_frequency === 'fortnightly' ? 'Quincenal' :
                                                         client.service_frequency === 'every_3_weeks' ? 'C/3 sem' :
                                                         client.service_frequency === 'monthly' ? 'Mensual' : 'One-off'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    searchTerm && (
                                        <div className="p-4 text-center text-gray-500">
                                            No se encontraron clientes que coincidan con "{searchTerm}"
                                        </div>
                                    )
                                )}
                            </CardContent>
                        </Card>
                    )}
                </>
            )}
        </div>
    );
}