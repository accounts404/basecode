import React, { useState, useMemo } from 'react';
import { ClientPriceReviewList } from '@/entities/ClientPriceReviewList';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    ArrowLeft,
    Save,
    Trash2,
    TrendingUp,
    TrendingDown,
    DollarSign,
    Percent,
    Users,
    Calendar,
    Target,
    AlertCircle,
    Edit2,
    CheckCircle,
    X,
    Search
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

const statusOptions = [
    { value: 'draft', label: 'Borrador', color: 'bg-slate-500' },
    { value: 'in_progress', label: 'En Progreso', color: 'bg-blue-500' },
    { value: 'completed', label: 'Completada', color: 'bg-green-500' },
    { value: 'archived', label: 'Archivada', color: 'bg-slate-400' },
];

export default function ReviewListDetail({ list, onBack, currentUser }) {
    const [editedList, setEditedList] = useState({ ...list });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [editingClientId, setEditingClientId] = useState(null);
    const [editedClient, setEditedClient] = useState(null);
    const [deleteClientDialog, setDeleteClientDialog] = useState(false);
    const [clientToDelete, setClientToDelete] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortColumn, setSortColumn] = useState('client_name');
    const [sortDirection, setSortDirection] = useState('asc');

    const filteredAndSortedClients = useMemo(() => {
        let clients = [...(editedList.clients_to_review || [])];
        
        // Filtrar por búsqueda
        if (searchTerm) {
            clients = clients.filter(c => 
                c.client_name.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }
        
        // Ordenar
        clients.sort((a, b) => {
            let aValue = a[sortColumn];
            let bValue = b[sortColumn];
            
            if (sortColumn === 'client_name') {
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
        
        return clients;
    }, [editedList.clients_to_review, searchTerm, sortColumn, sortDirection]);

    const activeClients = filteredAndSortedClients.filter(c => !c.excluded);
    const totalPotentialIncrease = activeClients.reduce((sum, c) => 
        sum + (c.adjustment_per_service * c.service_count), 0
    );

    const handleSort = (column) => {
        if (sortColumn === column) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection('asc');
        }
    };

    const getSortIcon = (column) => {
        if (sortColumn !== column) {
            return <TrendingUp className="w-4 h-4 text-slate-400 opacity-50" />;
        }
        return sortDirection === 'asc' ? 
            <TrendingUp className="w-4 h-4 text-purple-700" /> : 
            <TrendingDown className="w-4 h-4 text-purple-700" />;
    };

    const handleSave = async () => {
        setSaving(true);
        setError('');
        setSuccess('');
        
        try {
            await ClientPriceReviewList.update(editedList.id, editedList);
            setSuccess('Lista guardada exitosamente');
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            console.error('Error saving list:', err);
            setError('Error al guardar la lista');
        } finally {
            setSaving(false);
        }
    };

    const handleExcludeClient = (clientId) => {
        setClientToDelete(clientId);
        setDeleteClientDialog(true);
    };

    const confirmExcludeClient = () => {
        const updatedClients = editedList.clients_to_review.map(c =>
            c.client_id === clientToDelete ? { ...c, excluded: true } : c
        );
        setEditedList({ ...editedList, clients_to_review: updatedClients });
        setDeleteClientDialog(false);
        setClientToDelete(null);
    };

    const handleRestoreClient = (clientId) => {
        const updatedClients = editedList.clients_to_review.map(c =>
            c.client_id === clientId ? { ...c, excluded: false } : c
        );
        setEditedList({ ...editedList, clients_to_review: updatedClients });
    };

    const handleEditClient = (client) => {
        setEditingClientId(client.client_id);
        setEditedClient({ ...client });
    };

    const handleSaveClientEdit = () => {
        const updatedClients = editedList.clients_to_review.map(c =>
            c.client_id === editingClientId ? editedClient : c
        );
        setEditedList({ ...editedList, clients_to_review: updatedClients });
        setEditingClientId(null);
        setEditedClient(null);
    };

    const handleCancelClientEdit = () => {
        setEditingClientId(null);
        setEditedClient(null);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50 p-6 md:p-10">
            <div className="max-w-[1800px] mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <Button
                        variant="outline"
                        onClick={onBack}
                        className="hover:bg-slate-100"
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Volver a Listas
                    </Button>
                    <div className="flex-1">
                        <h1 className="text-3xl font-bold text-slate-900">{editedList.list_name}</h1>
                        <p className="text-slate-600 mt-1">
                            Gestiona los clientes de esta lista de revisión
                        </p>
                    </div>
                    <Button
                        onClick={handleSave}
                        disabled={saving}
                        className="bg-purple-600 hover:bg-purple-700"
                        size="lg"
                    >
                        <Save className="w-5 h-5 mr-2" />
                        {saving ? 'Guardando...' : 'Guardar Cambios'}
                    </Button>
                </div>

                {error && (
                    <Alert variant="destructive">
                        <AlertCircle className="h-5 w-5" />
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {success && (
                    <Alert className="border-green-500 bg-green-50">
                        <CheckCircle className="h-5 w-5 text-green-600" />
                        <AlertDescription className="text-green-800">{success}</AlertDescription>
                    </Alert>
                )}

                {/* Info Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <Card className="shadow-lg border border-purple-200 bg-gradient-to-br from-purple-50 to-white">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-semibold text-purple-700 uppercase tracking-wide flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                Fecha de Creación
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-bold text-purple-900">
                                {format(new Date(editedList.review_date), "d MMM yyyy", { locale: es })}
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="shadow-lg border border-blue-200 bg-gradient-to-br from-blue-50 to-white">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-semibold text-blue-700 uppercase tracking-wide flex items-center gap-2">
                                <Users className="w-4 h-4" />
                                Clientes Activos
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-bold text-blue-900">{activeClients.length}</p>
                            <p className="text-xs text-blue-600 mt-1">
                                {editedList.clients_to_review.length - activeClients.length} excluidos
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="shadow-lg border border-green-200 bg-gradient-to-br from-green-50 to-white">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-semibold text-green-700 uppercase tracking-wide flex items-center gap-2">
                                <DollarSign className="w-4 h-4" />
                                Aumento Total
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-bold text-green-900">
                                ${totalPotentialIncrease.toFixed(2)}
                            </p>
                            <p className="text-xs text-green-600 mt-1">Potencial acumulado</p>
                        </CardContent>
                    </Card>

                    <Card className="shadow-lg border border-orange-200 bg-gradient-to-br from-orange-50 to-white">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-semibold text-orange-700 uppercase tracking-wide flex items-center gap-2">
                                <Target className="w-4 h-4" />
                                Objetivo
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-bold text-orange-900">
                                {editedList.target_profit_percentage}%
                            </p>
                            <p className="text-xs text-orange-600 mt-1">Rentabilidad deseada</p>
                        </CardContent>
                    </Card>
                </div>

                {/* List Details Card */}
                <Card className="shadow-lg border border-slate-200">
                    <CardHeader>
                        <CardTitle className="text-xl font-bold text-slate-900">Detalles de la Lista</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">Nombre de la Lista</label>
                                <Input
                                    value={editedList.list_name}
                                    onChange={(e) => setEditedList({ ...editedList, list_name: e.target.value })}
                                    className="font-medium"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">Estado</label>
                                <Select
                                    value={editedList.status}
                                    onValueChange={(value) => setEditedList({ ...editedList, status: value })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {statusOptions.map(opt => (
                                            <SelectItem key={opt.value} value={opt.value}>
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-2 h-2 rounded-full ${opt.color}`} />
                                                    {opt.label}
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <label className="text-sm font-semibold text-slate-700">Notas</label>
                                <Textarea
                                    value={editedList.notes || ''}
                                    onChange={(e) => setEditedList({ ...editedList, notes: e.target.value })}
                                    placeholder="Añade notas sobre esta lista de revisión..."
                                    rows={3}
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Clients Table */}
                <Card className="shadow-lg border border-slate-200">
                    <CardHeader>
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <CardTitle className="text-xl font-bold text-slate-900">Clientes en esta Lista</CardTitle>
                            <div className="relative w-full md:w-80">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                    placeholder="Buscar cliente..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10"
                                />
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-slate-100">
                                    <TableRow>
                                        <TableHead 
                                            className="font-bold text-slate-700 cursor-pointer hover:bg-slate-200/50"
                                            onClick={() => handleSort('client_name')}
                                        >
                                            <div className="flex items-center gap-2">
                                                Cliente
                                                {getSortIcon('client_name')}
                                            </div>
                                        </TableHead>
                                        <TableHead 
                                            className="text-center font-bold text-slate-700 cursor-pointer hover:bg-slate-200/50"
                                            onClick={() => handleSort('service_count')}
                                        >
                                            <div className="flex items-center justify-center gap-2">
                                                Servicios
                                                {getSortIcon('service_count')}
                                            </div>
                                        </TableHead>
                                        <TableHead 
                                            className="text-center font-bold text-slate-700 cursor-pointer hover:bg-slate-200/50"
                                            onClick={() => handleSort('total_hours')}
                                        >
                                            <div className="flex items-center justify-center gap-2">
                                                Horas
                                                {getSortIcon('total_hours')}
                                            </div>
                                        </TableHead>
                                        <TableHead 
                                            className="text-right font-bold text-slate-700 cursor-pointer hover:bg-slate-200/50"
                                            onClick={() => handleSort('current_real_profit_percentage')}
                                        >
                                            <div className="flex items-center justify-end gap-2">
                                                Rent. Actual
                                                {getSortIcon('current_real_profit_percentage')}
                                            </div>
                                        </TableHead>
                                        <TableHead 
                                            className="text-right font-bold text-slate-700 cursor-pointer hover:bg-slate-200/50"
                                            onClick={() => handleSort('current_price_base')}
                                        >
                                            <div className="flex items-center justify-end gap-2">
                                                Precio Actual
                                                {getSortIcon('current_price_base')}
                                            </div>
                                        </TableHead>
                                        <TableHead 
                                            className="text-right font-bold text-slate-700 bg-emerald-50 cursor-pointer hover:bg-emerald-100"
                                            onClick={() => handleSort('suggested_new_price')}
                                        >
                                            <div className="flex items-center justify-end gap-2">
                                                Precio Sugerido
                                                {getSortIcon('suggested_new_price')}
                                            </div>
                                        </TableHead>
                                        <TableHead 
                                            className="text-right font-bold text-slate-700 bg-orange-50 cursor-pointer hover:bg-orange-100"
                                            onClick={() => handleSort('adjustment_per_service')}
                                        >
                                            <div className="flex items-center justify-end gap-2">
                                                Aumento ($)
                                                {getSortIcon('adjustment_per_service')}
                                            </div>
                                        </TableHead>
                                        <TableHead 
                                            className="text-right font-bold text-slate-700 bg-orange-50 cursor-pointer hover:bg-orange-100"
                                            onClick={() => handleSort('adjustment_percentage')}
                                        >
                                            <div className="flex items-center justify-end gap-2">
                                                Aumento (%)
                                                {getSortIcon('adjustment_percentage')}
                                            </div>
                                        </TableHead>
                                        <TableHead className="text-right font-bold text-slate-700">Notas</TableHead>
                                        <TableHead className="text-right font-bold text-slate-700">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredAndSortedClients.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan="10" className="text-center py-12 text-slate-500">
                                                {searchTerm ? 
                                                    `No se encontraron clientes que coincidan con "${searchTerm}"` : 
                                                    'No hay clientes en esta lista'
                                                }
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredAndSortedClients.map((client) => {
                                        const isEditing = editingClientId === client.client_id;
                                        const displayClient = isEditing ? editedClient : client;
                                        
                                        return (
                                            <TableRow 
                                                key={client.client_id}
                                                className={`
                                                    ${client.excluded ? 'opacity-50 bg-slate-50' : 'hover:bg-slate-50'}
                                                    transition-colors border-b border-slate-100
                                                `}
                                            >
                                                <TableCell className="font-semibold text-slate-900">
                                                    <div className="flex items-center gap-2">
                                                        {client.client_name}
                                                        {client.excluded && (
                                                            <Badge variant="outline" className="text-xs">Excluido</Badge>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center">{client.service_count}</TableCell>
                                                <TableCell className="text-center">{client.total_hours?.toFixed(2)}h</TableCell>
                                                <TableCell className="text-right text-red-700 font-bold">
                                                    {client.current_real_profit_percentage?.toFixed(1)}%
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    ${client.current_price_base?.toFixed(2)}
                                                </TableCell>
                                                <TableCell className="text-right bg-emerald-50">
                                                    {isEditing ? (
                                                        <Input
                                                            type="number"
                                                            step="0.01"
                                                            value={displayClient.suggested_new_price}
                                                            onChange={(e) => setEditedClient({
                                                                ...editedClient,
                                                                suggested_new_price: parseFloat(e.target.value) || 0
                                                            })}
                                                            className="w-24 text-right"
                                                        />
                                                    ) : (
                                                        <span className="font-bold text-emerald-700">
                                                            ${displayClient.suggested_new_price?.toFixed(2)}
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right bg-orange-50 font-bold text-orange-700">
                                                    +${displayClient.adjustment_per_service?.toFixed(2)}
                                                </TableCell>
                                                <TableCell className="text-right bg-orange-50 font-bold text-orange-700">
                                                    +{displayClient.adjustment_percentage?.toFixed(1)}%
                                                </TableCell>
                                                <TableCell>
                                                    {isEditing ? (
                                                        <Input
                                                            value={displayClient.notes || ''}
                                                            onChange={(e) => setEditedClient({
                                                                ...editedClient,
                                                                notes: e.target.value
                                                            })}
                                                            placeholder="Notas..."
                                                            className="w-32"
                                                        />
                                                    ) : (
                                                        <span className="text-sm text-slate-600">
                                                            {displayClient.notes || '-'}
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-2">
                                                        {isEditing ? (
                                                            <>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    onClick={handleSaveClientEdit}
                                                                    className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                                                >
                                                                    <CheckCircle className="w-4 h-4" />
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    onClick={handleCancelClientEdit}
                                                                    className="text-slate-600 hover:text-slate-700"
                                                                >
                                                                    <X className="w-4 h-4" />
                                                                </Button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    onClick={() => handleEditClient(client)}
                                                                    disabled={client.excluded}
                                                                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                                >
                                                                    <Edit2 className="w-4 h-4" />
                                                                </Button>
                                                                {client.excluded ? (
                                                                    <Button
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        onClick={() => handleRestoreClient(client.client_id)}
                                                                        className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                                                    >
                                                                        Restaurar
                                                                    </Button>
                                                                ) : (
                                                                    <Button
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        onClick={() => handleExcludeClient(client.client_id)}
                                                                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </Button>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    }))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Delete Client Dialog */}
            <Dialog open={deleteClientDialog} onOpenChange={setDeleteClientDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-orange-700">
                            <AlertCircle className="w-5 h-5" />
                            Excluir Cliente
                        </DialogTitle>
                        <DialogDescription>
                            ¿Estás seguro de que deseas excluir este cliente de la lista? 
                            Podrás restaurarlo más tarde si cambias de opinión.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDeleteClientDialog(false)}
                        >
                            Cancelar
                        </Button>
                        <Button
                            className="bg-orange-600 hover:bg-orange-700"
                            onClick={confirmExcludeClient}
                        >
                            Excluir Cliente
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}