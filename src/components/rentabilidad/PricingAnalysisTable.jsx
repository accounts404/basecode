import React, { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, XCircle, AlertTriangle, TrendingUp, TrendingDown, ArrowUp } from 'lucide-react';

const calculateGSTBase = (price, gstType) => {
    const numPrice = parseFloat(price) || 0;
    if (gstType === 'inclusive') {
        return numPrice / 1.1;
    }
    return numPrice; // exclusive and no_tax are already base prices
};

export default function PricingAnalysisTable({ clients, selectedFrequency, thresholds, onRowClick }) {
    const [sortColumn, setSortColumn] = useState('difference');
    const [sortDirection, setSortDirection] = useState('desc'); // desc para mostrar los peores primero
    
    if (!selectedFrequency || selectedFrequency === 'all') {
        return (
            <div className="text-center py-12 text-slate-500">
                <p>Por favor, selecciona una frecuencia para ver el análisis de precios.</p>
            </div>
        );
    }
    
    const threshold = thresholds.find(t => t.frequency === selectedFrequency);

    if (!threshold) {
        return (
            <div className="text-center py-12 text-slate-500">
                <AlertTriangle className="mx-auto h-8 w-8 text-amber-500 mb-2" />
                <p>No se ha definido un umbral de precio mínimo para esta frecuencia.</p>
                <p className="text-sm">Puedes definirlo en "Configurar Umbrales".</p>
            </div>
        );
    }

    const filteredClients = clients
        .filter(c => 
            c.service_frequency === selectedFrequency && 
            c.current_service_price > 0 && 
            c.service_hours > 0
        )
        .map(client => {
            const totalServicePriceBase = calculateGSTBase(client.current_service_price, client.gst_type);
            const pricePerHour = totalServicePriceBase / client.service_hours;
            const difference = pricePerHour - threshold.min_price; // Invertido: positivo = bien, negativo = mal
            const percentage_adjustment = difference < 0 ? Math.abs((difference / pricePerHour) * 100) : 0;
            
            return {
                ...client,
                totalServicePrice: totalServicePriceBase,
                pricePerHour,
                difference,
                percentage_adjustment,
                isBelowThreshold: difference < 0
            };
        });

    // Sorting logic
    const sortedClients = [...filteredClients].sort((a, b) => {
        let aValue = a[sortColumn];
        let bValue = b[sortColumn];

        if (sortColumn === 'name') {
            aValue = aValue?.toLowerCase() || '';
            bValue = bValue?.toLowerCase() || '';
            return sortDirection === 'asc' ? 
                aValue.localeCompare(bValue) : 
                bValue.localeCompare(aValue);
        }

        aValue = parseFloat(aValue) || 0;
        bValue = parseFloat(bValue) || 0;
        
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
    });

    if (sortedClients.length === 0) {
        return (
             <div className="text-center py-12 text-slate-500">
                <p>No hay clientes activos con precio recurrente y horas de servicio definidas para la frecuencia seleccionada.</p>
            </div>
        );
    }

    const handleSort = (column) => {
        if (sortColumn === column) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection(column === 'difference' ? 'desc' : 'asc'); // Por defecto, diferencia desc (los peores primero)
        }
    };

    const getSortIcon = (column) => {
        if (sortColumn !== column) {
            return <TrendingUp className="w-4 h-4 text-gray-400 opacity-50" />;
        }
        return sortDirection === 'asc' ? 
            <TrendingUp className="w-4 h-4 text-blue-600" /> : 
            <TrendingDown className="w-4 h-4 text-blue-600" />;
    };

    // Contar cuántos clientes están por debajo del umbral
    const clientsBelowThreshold = sortedClients.filter(c => c.isBelowThreshold).length;
    const clientsAboveThreshold = sortedClients.length - clientsBelowThreshold;

    return (
        <div className="space-y-4">
            {/* Resumen de estado */}
            <div className="flex gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex items-center gap-2">
                    <XCircle className="w-5 h-5 text-red-600" />
                    <span className="text-sm font-semibold text-slate-700">
                        {clientsBelowThreshold} cliente{clientsBelowThreshold !== 1 ? 's' : ''} por debajo del mínimo
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="text-sm font-semibold text-slate-700">
                        {clientsAboveThreshold} cliente{clientsAboveThreshold !== 1 ? 's' : ''} cumpliendo el mínimo
                    </span>
                </div>
            </div>

            {/* Tabla simplificada */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <Table>
                    <TableHeader className="bg-slate-100/95">
                        <TableRow>
                            <TableHead className="w-[200px]">
                                <button
                                    onClick={() => handleSort('name')}
                                    className="flex items-center gap-2 hover:text-blue-700 font-bold"
                                >
                                    Cliente
                                    {getSortIcon('name')}
                                </button>
                            </TableHead>
                            <TableHead className="text-right">
                                <button
                                    onClick={() => handleSort('totalServicePrice')}
                                    className="flex items-center justify-end gap-2 hover:text-blue-700 font-bold w-full"
                                >
                                    Precio Total (Base)
                                    {getSortIcon('totalServicePrice')}
                                </button>
                            </TableHead>
                            <TableHead className="text-center">
                                <button
                                    onClick={() => handleSort('service_hours')}
                                    className="flex items-center justify-center gap-2 hover:text-blue-700 font-bold w-full"
                                >
                                    Horas
                                    {getSortIcon('service_hours')}
                                </button>
                            </TableHead>
                            <TableHead className="text-right">
                                <button
                                    onClick={() => handleSort('pricePerHour')}
                                    className="flex items-center justify-end gap-2 hover:text-blue-700 font-bold w-full"
                                >
                                    Precio/Hora Actual
                                    {getSortIcon('pricePerHour')}
                                </button>
                            </TableHead>
                            <TableHead className="text-right bg-blue-50">
                                <div className="flex items-center justify-end gap-2 font-bold text-blue-700">
                                    Mínimo/Hora Requerido
                                </div>
                            </TableHead>
                            <TableHead className="text-right bg-amber-50">
                                <button
                                    onClick={() => handleSort('difference')}
                                    className="flex items-center justify-end gap-2 hover:text-blue-700 font-bold w-full text-amber-800"
                                >
                                    Diferencia ($/h)
                                    {getSortIcon('difference')}
                                </button>
                            </TableHead>
                            <TableHead className="text-right bg-purple-50">
                                <button
                                    onClick={() => handleSort('percentage_adjustment')}
                                    className="flex items-center justify-end gap-2 hover:text-blue-700 font-bold w-full text-purple-800"
                                >
                                    Ajuste Requerido (%)
                                    {getSortIcon('percentage_adjustment')}
                                </button>
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sortedClients.map((client) => {
                            const rowClass = client.isBelowThreshold 
                                ? 'bg-red-50 hover:bg-red-100 border-l-4 border-l-red-500' 
                                : 'bg-green-50 hover:bg-green-100 border-l-4 border-l-green-500';
                            
                            return (
                                <TableRow 
                                    key={client.id} 
                                    className={`${rowClass} cursor-pointer transition-colors`}
                                    onClick={() => onRowClick && onRowClick(client)}
                                >
                                    <TableCell className="font-semibold text-slate-900">
                                        <div className="flex items-center gap-2">
                                            {client.isBelowThreshold ? (
                                                <XCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                                            ) : (
                                                <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                                            )}
                                            {client.name}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right text-slate-700">
                                        ${client.totalServicePrice.toFixed(2)}
                                    </TableCell>
                                    <TableCell className="text-center text-slate-700 font-medium">
                                        {client.service_hours}h
                                    </TableCell>
                                    <TableCell className={`text-right font-bold text-lg ${client.isBelowThreshold ? 'text-red-700' : 'text-green-700'}`}>
                                        ${client.pricePerHour.toFixed(2)}/h
                                    </TableCell>
                                    <TableCell className="text-right font-bold text-lg text-blue-700 bg-blue-50">
                                        ${threshold.min_price.toFixed(2)}/h
                                    </TableCell>
                                    <TableCell className={`text-right font-bold text-xl bg-amber-50 ${client.isBelowThreshold ? 'text-red-700' : 'text-green-700'}`}>
                                        {client.isBelowThreshold ? (
                                            <span className="flex items-center justify-end gap-1">
                                                <TrendingDown className="w-5 h-5" />
                                                -${Math.abs(client.difference).toFixed(2)}
                                            </span>
                                        ) : (
                                            <span className="flex items-center justify-end gap-1">
                                                <TrendingUp className="w-5 h-5" />
                                                +${client.difference.toFixed(2)}
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell className={`text-right font-bold text-xl bg-purple-50 ${client.isBelowThreshold ? 'text-red-700' : 'text-green-700'}`}>
                                        {client.isBelowThreshold ? (
                                            <span className="flex items-center justify-end gap-1">
                                                <ArrowUp className="w-5 h-5" />
                                                +{client.percentage_adjustment.toFixed(1)}%
                                            </span>
                                        ) : (
                                            <span className="flex items-center justify-end gap-1">
                                                <CheckCircle className="w-5 h-5" />
                                                OK
                                            </span>
                                        )}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>

            {/* Leyenda */}
            <div className="text-sm text-slate-600 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <p className="font-semibold mb-2">Interpretación:</p>
                <ul className="space-y-1 list-disc list-inside">
                    <li><span className="font-medium text-red-700">Rojo:</span> Cliente por debajo del precio mínimo por hora. Se muestra el ajuste necesario.</li>
                    <li><span className="font-medium text-green-700">Verde:</span> Cliente cumpliendo o superando el precio mínimo por hora.</li>
                    <li><span className="font-medium">Diferencia:</span> Cuánto falta o sobra respecto al mínimo requerido ($/hora).</li>
                    <li><span className="font-medium">Ajuste Requerido:</span> Porcentaje que necesitas subir el precio para alcanzar el mínimo.</li>
                </ul>
            </div>
        </div>
    );
}