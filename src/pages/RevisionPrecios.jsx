import React, { useState, useEffect } from 'react';
import { ClientPriceReviewList } from '@/entities/ClientPriceReviewList';
import { User } from '@/entities/User';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
    FileText, 
    Plus, 
    Trash2, 
    Eye, 
    Calendar, 
    Users, 
    TrendingUp,
    AlertCircle,
    Archive,
    CheckCircle,
    Clock
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import ReviewListDetail from '@/components/revision-precios/ReviewListDetail';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

const statusConfig = {
    draft: {
        color: 'bg-slate-500',
        label: 'Borrador',
        icon: FileText
    },
    in_progress: {
        color: 'bg-blue-500',
        label: 'En Progreso',
        icon: Clock
    },
    completed: {
        color: 'bg-green-500',
        label: 'Completada',
        icon: CheckCircle
    },
    archived: {
        color: 'bg-slate-400',
        label: 'Archivada',
        icon: Archive
    }
};

export default function RevisionPreciosPage() {
    const [lists, setLists] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedList, setSelectedList] = useState(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [listToDelete, setListToDelete] = useState(null);
    const navigate = useNavigate();

    const loadLists = async () => {
        setLoading(true);
        try {
            const allLists = await ClientPriceReviewList.list('-created_date');
            setLists(allLists || []);
        } catch (err) {
            console.error('Error loading lists:', err);
            setError('Error al cargar las listas de revisión');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const init = async () => {
            try {
                const user = await User.me();
                setCurrentUser(user);
                await loadLists();
            } catch (err) {
                console.error('Error loading user:', err);
                setError('Error al cargar datos del usuario');
            }
        };
        init();
    }, []);

    const handleDeleteClick = (list) => {
        setListToDelete(list);
        setDeleteDialogOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!listToDelete) return;
        
        try {
            await ClientPriceReviewList.delete(listToDelete.id);
            await loadLists();
            setDeleteDialogOpen(false);
            setListToDelete(null);
        } catch (err) {
            console.error('Error deleting list:', err);
            setError('Error al eliminar la lista');
        }
    };

    const handleViewList = (list) => {
        setSelectedList(list);
    };

    const handleBackToLists = async () => {
        setSelectedList(null);
        await loadLists();
    };

    if (loading && !currentUser) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700"></div>
            </div>
        );
    }

    if (selectedList) {
        return (
            <ReviewListDetail 
                list={selectedList} 
                onBack={handleBackToLists}
                currentUser={currentUser}
            />
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 p-6 md:p-10">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-10">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl shadow-lg">
                                <FileText className="w-7 h-7 text-white" />
                            </div>
                            <div>
                                <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Listas de Revisión de Precios</h1>
                                <p className="text-slate-600 mt-1 text-lg">
                                    Gestiona tus listas de clientes para aumento de precios
                                </p>
                            </div>
                        </div>
                        <Button
                            onClick={() => navigate(createPageUrl('AumentoClientes'))}
                            className="bg-purple-600 hover:bg-purple-700 shadow-lg"
                            size="lg"
                        >
                            <Plus className="w-5 h-5 mr-2" />
                            Crear Nueva Lista
                        </Button>
                    </div>

                    {error && (
                        <Alert variant="destructive" className="mb-6">
                            <AlertCircle className="h-5 w-5" />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <Card className="shadow-lg border border-slate-200">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-semibold text-slate-600 uppercase tracking-wide">
                                Total de Listas
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-bold text-slate-900">{lists.length}</p>
                        </CardContent>
                    </Card>

                    <Card className="shadow-lg border border-blue-200 bg-gradient-to-br from-blue-50 to-white">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-semibold text-blue-700 uppercase tracking-wide">
                                En Progreso
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-bold text-blue-900">
                                {lists.filter(l => l.status === 'in_progress').length}
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="shadow-lg border border-green-200 bg-gradient-to-br from-green-50 to-white">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-semibold text-green-700 uppercase tracking-wide">
                                Completadas
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-bold text-green-900">
                                {lists.filter(l => l.status === 'completed').length}
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="shadow-lg border border-slate-200 bg-gradient-to-br from-slate-50 to-white">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
                                Borradores
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-bold text-slate-900">
                                {lists.filter(l => l.status === 'draft').length}
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Lists Grid */}
                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700 mx-auto"></div>
                    </div>
                ) : lists.length === 0 ? (
                    <Card className="shadow-lg text-center py-12">
                        <CardContent>
                            <FileText className="w-24 h-24 mx-auto text-slate-300 mb-4" />
                            <h3 className="text-2xl font-bold text-slate-900 mb-2">
                                No hay listas creadas
                            </h3>
                            <p className="text-slate-600 mb-6">
                                Crea tu primera lista desde el análisis de "Aumento de Clientes"
                            </p>
                            <Button
                                onClick={() => navigate(createPageUrl('AumentoClientes'))}
                                className="bg-purple-600 hover:bg-purple-700"
                            >
                                <Plus className="w-5 h-5 mr-2" />
                                Ir a Aumento de Clientes
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {lists.map(list => {
                            const config = statusConfig[list.status] || statusConfig.draft;
                            const Icon = config.icon;
                            const activeClients = (list.clients_to_review || []).filter(c => !c.excluded);
                            
                            return (
                                <Card key={list.id} className="shadow-lg hover:shadow-xl transition-shadow border border-slate-200">
                                    <CardHeader>
                                        <div className="flex justify-between items-start mb-2">
                                            <Badge className={`${config.color} text-white`}>
                                                <Icon className="w-3 h-3 mr-1" />
                                                {config.label}
                                            </Badge>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDeleteClick(list)}
                                                className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                        <CardTitle className="text-xl font-bold text-slate-900 line-clamp-2">
                                            {list.list_name}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-3 mb-4">
                                            <div className="flex items-center gap-2 text-sm text-slate-600">
                                                <Calendar className="w-4 h-4 text-purple-600" />
                                                <span>
                                                    {format(new Date(list.review_date), "d 'de' MMMM 'de' yyyy", { locale: es })}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 text-sm text-slate-600">
                                                <Users className="w-4 h-4 text-blue-600" />
                                                <span className="font-medium">{activeClients.length} clientes</span>
                                                {(list.clients_to_review || []).length !== activeClients.length && (
                                                    <span className="text-xs text-slate-500">
                                                        ({(list.clients_to_review || []).length - activeClients.length} excluidos)
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 text-sm text-slate-600">
                                                <TrendingUp className="w-4 h-4 text-green-600" />
                                                <span>Objetivo: {list.target_profit_percentage}%</span>
                                            </div>
                                            {list.created_by_user_name && (
                                                <div className="text-xs text-slate-500">
                                                    Creada por: {list.created_by_user_name}
                                                </div>
                                            )}
                                        </div>

                                        <Button
                                            onClick={() => handleViewList(list)}
                                            className="w-full bg-slate-700 hover:bg-slate-800"
                                            size="sm"
                                        >
                                            <Eye className="w-4 h-4 mr-2" />
                                            Ver Detalles
                                        </Button>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Delete Confirmation Dialog */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-700">
                            <AlertCircle className="w-5 h-5" />
                            Confirmar Eliminación
                        </DialogTitle>
                        <DialogDescription>
                            ¿Estás seguro de que deseas eliminar la lista "{listToDelete?.list_name}"?
                            Esta acción no se puede deshacer.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDeleteDialogOpen(false)}
                        >
                            Cancelar
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleConfirmDelete}
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Eliminar Lista
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}