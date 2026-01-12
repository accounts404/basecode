import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Search, Check, X, Edit, Trash2, AlertTriangle, ChevronUp, ChevronDown, Loader2, List, FileText, DollarSign, Calendar, TrendingUp, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { format, differenceInDays, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import RejectionDialog from '../components/quotes/RejectionDialog';

const statusConfig = {
    borrador: { label: 'Borrador', color: 'bg-gray-100 text-gray-800', icon: '📝' },
    itemizando: { label: 'Itemizando', color: 'bg-purple-100 text-purple-800', icon: '📋' },
    enviada: { label: 'Enviada', color: 'bg-blue-100 text-blue-800', icon: '📤' },
    aprobado: { label: 'Aprobado', color: 'bg-green-100 text-green-800', icon: '✅' },
    rechazado: { label: 'Rechazado', color: 'bg-red-100 text-red-800', icon: '❌' }
};

export default function CotizacionesPage() { 
    const [quotes, setQuotes] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [rejectingQuote, setRejectingQuote] = useState(null);
    const [activeTab, setActiveTab] = useState('borrador');
    const [sortConfig, setSortConfig] = useState({ key: 'created_date', direction: 'desc' });
    
    const navigate = useNavigate();

    useEffect(() => {
        loadData();
    }, []);

    const requestSort = (key) => {
        let direction = 'desc';
        if (sortConfig.key === key) {
            direction = sortConfig.direction === 'desc' ? 'asc' : 'desc';
        }
        setSortConfig({ key, direction });
    };

    const renderSortIndicator = (columnKey) => {
        if (sortConfig.key !== columnKey) {
            return <ChevronUp className="w-4 h-4 text-gray-300" />;
        }
        return sortConfig.direction === 'desc' ? 
            <ChevronDown className="w-4 h-4 text-blue-600" /> : 
            <ChevronUp className="w-4 h-4 text-blue-600" />;
    };

    const loadData = async () => {
        setIsLoading(true);
        try {
            const quotesData = await base44.entities.Quote.list('-created_date', 1000);
            setQuotes(quotesData);
        } catch (error) {
            console.error("Error loading quotes data:", error);
            toast.error("Error al cargar las cotizaciones.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSendToItemization = async (quote) => {
        try {
            await base44.entities.Quote.update(quote.id, { status: 'itemizando' });
            toast.success("Cotización movida a itemización.");
            loadData();
        } catch (error) {
            console.error("Error moving quote to itemization:", error);
            toast.error("Error al mover la cotización.");
        }
    };

    const handleBackToItemization = async (quote) => {
        try {
            await base44.entities.Quote.update(quote.id, { status: 'itemizando' });
            toast.success("Cotización devuelta a itemización");
            loadData();
        } catch (error) {
            console.error("Error moving quote back:", error);
            toast.error("Error al devolver la cotización.");
        }
    };

    const handleDeleteQuote = async (quoteId) => {
        try {
            await base44.entities.Quote.delete(quoteId);
            toast.success("Cotización eliminada con éxito.");
            loadData();
        } catch (error) {
            console.error("Error deleting quote:", error);
            toast.error("Error al eliminar la cotización.");
        }
    };

    const handleRejectionSubmit = async (rejectionData) => {
        if (!rejectingQuote) return;

        try {
            await base44.entities.Quote.update(rejectingQuote.id, {
                status: 'rechazado',
                rejection_type: rejectionData.rejection_type,
                rejection_reason: rejectionData.rejection_reason,
            });
            toast.success("Cotización marcada como rechazada.");
            setRejectingQuote(null);
            loadData();
        } catch (error) {
            console.error("Error rejecting quote:", error);
            toast.error("Error al rechazar la cotización.");
        }
    };

    const handleStatusChange = async (quote, newStatus) => {
        try {
            if (newStatus === 'aprobado') {
                if (!quote.selected_services || quote.selected_services.length === 0) {
                    toast.error("Por favor, edita la cotización y selecciona al menos un servicio antes de aprobarla.");
                    return;
                }
                
                await base44.entities.Quote.update(quote.id, { status: newStatus });
                
                const existingTransfer = await base44.entities.ZenMaidTransfer.filter({ quote_id: quote.id });
                if (existingTransfer.length === 0) {
                    await base44.entities.ZenMaidTransfer.create({
                        quote_id: quote.id,
                        client_id: quote.client_id,
                        client_name: quote.client_name,
                        service_address: quote.service_address,
                        status: 'pending',
                        selected_services: quote.selected_services,
                        total_price_min: quote.total_price_min,
                        total_price_max: quote.total_price_max,
                    });
                    toast.success("Cotización aprobada y enviada a ZenMaid para agendar.");
                } else { 
                    toast.success("Cotización aprobada con éxito."); 
                }
            } else {
                await base44.entities.Quote.update(quote.id, { status: newStatus });
                toast.success(`Estado actualizado a ${newStatus}.`);
            }
            loadData();
        } catch (error) { 
            console.error("Error updating quote status:", error);
            toast.error("Error al actualizar el estado."); 
        }
    };

    const quotesByStatus = useMemo(() => {
        return {
            borrador: quotes.filter(q => q.status === 'borrador'),
            itemizando: quotes.filter(q => q.status === 'itemizando'),
            enviada: quotes.filter(q => q.status === 'enviada'),
            aprobado: quotes.filter(q => q.status === 'aprobado'),
            rechazado: quotes.filter(q => q.status === 'rechazado')
        };
    }, [quotes]);

    // Calcular métricas
    const metrics = useMemo(() => {
        const enviadasConFecha = quotesByStatus.enviada.filter(q => q.sent_date);
        const avgDaysToResponse = enviadasConFecha.length > 0 
            ? enviadasConFecha.reduce((sum, q) => sum + differenceInDays(new Date(), parseISO(q.sent_date)), 0) / enviadasConFecha.length
            : 0;
        
        const totalQuotes = quotes.length;
        const approvalRate = totalQuotes > 0 
            ? (quotesByStatus.aprobado.length / totalQuotes) * 100 
            : 0;

        const totalValue = quotesByStatus.aprobado.reduce((sum, q) => {
            const avgPrice = (q.total_price_min + q.total_price_max) / 2;
            return sum + avgPrice;
        }, 0);

        return {
            totalQuotes,
            pendingReview: quotesByStatus.enviada.length,
            approved: quotesByStatus.aprobado.length,
            approvalRate,
            avgDaysToResponse,
            totalValue
        };
    }, [quotes, quotesByStatus]);

    const getFilteredAndSortedQuotes = (status) => {
        const quotesForTab = quotesByStatus[status] || [];
        
        let filteredQuotes = quotesForTab.filter(quote => 
            (quote.client_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (quote.service_address && quote.service_address.toLowerCase().includes(searchTerm.toLowerCase()))
        );
        
        let sortableItems = [...filteredQuotes];
        
        if (sortConfig.key) {
            sortableItems.sort((a, b) => {
                let valA, valB;
                
                switch (sortConfig.key) {
                    case 'client_name':
                        valA = (a.client_name || '').toLowerCase();
                        valB = (b.client_name || '').toLowerCase();
                        return sortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                    
                    case 'service_address':
                        valA = (a.service_address || '').toLowerCase();
                        valB = (b.service_address || '').toLowerCase();
                        return sortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                    
                    case 'quote_date':
                        valA = new Date(a.quote_date);
                        valB = new Date(b.quote_date);
                        return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
                    
                    case 'sent_date':
                        const dateA = new Date(a.sent_date || a.quote_date);
                        const dateB = new Date(b.sent_date || b.quote_date);
                        return sortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA;
                    
                    case 'days_old':
                        const referenceDate = new Date();
                        let daysOldA, daysOldB;
                        
                        if (status === 'enviada') {
                            daysOldA = a.sent_date ? differenceInDays(referenceDate, parseISO(a.sent_date)) : 0;
                            daysOldB = b.sent_date ? differenceInDays(referenceDate, parseISO(b.sent_date)) : 0;
                        } else {
                            daysOldA = differenceInDays(referenceDate, parseISO(a.quote_date));
                            daysOldB = differenceInDays(referenceDate, parseISO(b.quote_date));
                        }
                        
                        return sortConfig.direction === 'asc' ? daysOldA - daysOldB : daysOldB - daysOldA;
                    
                    default:
                        valA = a[sortConfig.key] || '';
                        valB = b[sortConfig.key] || '';
                        return sortConfig.direction === 'asc' 
                            ? valA.toString().localeCompare(valB.toString()) 
                            : valB.toString().localeCompare(valA.toString());
                }
            });
        }
        
        return sortableItems;
    };

    const renderQuoteTable = (status) => {
        const filteredAndSortedQuotes = getFilteredAndSortedQuotes(status);

        return (
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>
                            <Button 
                                variant="ghost" 
                                className="h-auto p-0 font-semibold hover:bg-transparent"
                                onClick={() => requestSort('client_name')}
                            >
                                <span className="flex items-center gap-1">
                                    Cliente
                                    {renderSortIndicator('client_name')}
                                </span>
                            </Button>
                        </TableHead>
                        <TableHead>
                            <Button 
                                variant="ghost" 
                                className="h-auto p-0 font-semibold hover:bg-transparent"
                                onClick={() => requestSort('service_address')}
                            >
                                <span className="flex items-center gap-1">
                                    Dirección
                                    {renderSortIndicator('service_address')}
                                </span>
                            </Button>
                        </TableHead>
                        <TableHead>
                            <Button 
                                variant="ghost" 
                                className="h-auto p-0 font-semibold hover:bg-transparent"
                                onClick={() => requestSort(status === 'enviada' ? 'sent_date' : 'quote_date')}
                            >
                                <span className="flex items-center gap-1">
                                    {status === 'enviada' ? 'Fecha Envío' : 'Fecha'}
                                    {renderSortIndicator(status === 'enviada' ? 'sent_date' : 'quote_date')}
                                </span>
                            </Button>
                        </TableHead>
                        <TableHead>
                            <Button 
                                variant="ghost" 
                                className="h-auto p-0 font-semibold hover:bg-transparent"
                                onClick={() => requestSort('days_old')}
                            >
                                <span className="flex items-center gap-1">
                                    Antigüedad
                                    {renderSortIndicator('days_old')}
                                </span>
                            </Button>
                        </TableHead>
                        {status === 'aprobado' && (
                            <TableHead className="text-right">Valor Estimado</TableHead>
                        )}
                        {status === 'rechazado' && (
                            <TableHead>Motivo Rechazo</TableHead>
                        )}
                        <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filteredAndSortedQuotes.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={7} className="text-center py-10">
                                {isLoading ? (
                                    <div className="flex items-center justify-center gap-2 text-gray-500">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Cargando cotizaciones...
                                    </div>
                                ) : searchTerm ? 
                                    'No se encontraron cotizaciones que coincidan con la búsqueda.' : 
                                    `No hay cotizaciones ${statusConfig[status]?.label.toLowerCase()}.`
                                }
                            </TableCell>
                        </TableRow>
                    ) : (
                        filteredAndSortedQuotes.map(quote => {
                            let daysOld, referenceDate, needsAttention = false;
                            
                            if (status === 'enviada' && quote.sent_date) {
                                referenceDate = parseISO(quote.sent_date);
                                daysOld = differenceInDays(new Date(), referenceDate);
                                needsAttention = daysOld > 20;
                            } else {
                                referenceDate = parseISO(quote.quote_date);
                                daysOld = differenceInDays(new Date(), referenceDate);
                            }

                            const avgPrice = quote.total_price_min && quote.total_price_max 
                                ? (quote.total_price_min + quote.total_price_max) / 2 
                                : 0;

                            return (
                                <TableRow key={quote.id} className={needsAttention ? 'bg-red-50' : 'hover:bg-slate-50'}>
                                    <TableCell className="font-medium">
                                        <div>
                                            <p className="font-semibold text-slate-900">
                                                {quote.client_name || 'Nombre no disponible'}
                                            </p>
                                            {quote.client_phone && (
                                                <p className="text-xs text-slate-500">📱 {quote.client_phone}</p>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div>
                                            <p className="text-sm">{quote.service_address}</p>
                                            {quote.property_type && (
                                                <Badge variant="outline" className="text-xs mt-1">
                                                    {quote.property_type}
                                                </Badge>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {format(referenceDate, 'dd MMM, yyyy', { locale: es })}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1">
                                            {needsAttention && <AlertTriangle className="w-4 h-4 text-red-500" />}
                                            <span className={needsAttention ? 'text-red-600 font-semibold' : ''}>
                                                {daysOld} día{daysOld !== 1 ? 's' : ''}
                                            </span>
                                        </div>
                                    </TableCell>
                                    {status === 'aprobado' && (
                                        <TableCell className="text-right">
                                            <p className="font-semibold text-green-700">
                                                ${avgPrice.toFixed(2)}
                                            </p>
                                            {quote.total_price_min && quote.total_price_max && (
                                                <p className="text-xs text-slate-500">
                                                    ${quote.total_price_min} - ${quote.total_price_max}
                                                </p>
                                            )}
                                        </TableCell>
                                    )}
                                    {status === 'rechazado' && (
                                        <TableCell>
                                            <div className="space-y-1">
                                                {quote.rejection_type && (
                                                    <Badge variant="outline" className="text-xs">
                                                        {quote.rejection_type === 'precio_alto' ? 'Precio alto' :
                                                         quote.rejection_type === 'contrató_competencia' ? 'Contrató competencia' :
                                                         quote.rejection_type === 'no_interesado' ? 'No interesado' :
                                                         'Otro'}
                                                    </Badge>
                                                )}
                                                {quote.rejection_reason && (
                                                    <p className="text-xs text-gray-600 truncate max-w-[200px]" title={quote.rejection_reason}>
                                                        {quote.rejection_reason}
                                                    </p>
                                                )}
                                            </div>
                                        </TableCell>
                                    )}
                                    <TableCell className="text-right">
                                        <div className="flex gap-1 justify-end">
                                            {status === 'borrador' && (
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    onClick={() => handleSendToItemization(quote)} 
                                                    className="text-purple-600 hover:bg-purple-50" 
                                                    title="Mover a Itemización"
                                                >
                                                    <List className="w-4 h-4" />
                                                </Button>
                                            )}
                                            {status === 'itemizando' && (
                                                <Link to={createPageUrl(`QuoteItemization?id=${quote.id}`)}>
                                                    <Button variant="ghost" size="icon" className="text-purple-600 hover:bg-purple-50" title="Itemizar">
                                                        <List className="w-4 h-4" />
                                                    </Button>
                                                </Link>
                                            )}
                                            {status === 'enviada' && (
                                                <>
                                                    {quote.quote_pdf_url && (
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            onClick={() => window.open(quote.quote_pdf_url, '_blank')} 
                                                            className="text-blue-600 hover:bg-blue-50" 
                                                            title="Ver PDF"
                                                        >
                                                            <FileText className="w-4 h-4" />
                                                        </Button>
                                                    )}
                                                    <Button 
                                                        variant="ghost" 
                                                        size="icon" 
                                                        onClick={() => handleBackToItemization(quote)} 
                                                        className="text-purple-600 hover:bg-purple-50" 
                                                        title="Volver a Itemizar"
                                                    >
                                                        <List className="w-4 h-4" />
                                                    </Button>
                                                    <Button 
                                                        variant="ghost" 
                                                        size="icon" 
                                                        onClick={() => handleStatusChange(quote, 'aprobado')} 
                                                        className="text-green-600 hover:bg-green-50" 
                                                        title="Aprobar"
                                                    >
                                                        <Check className="w-4 h-4" />
                                                    </Button>
                                                    <Button 
                                                        variant="ghost" 
                                                        size="icon" 
                                                        onClick={() => setRejectingQuote(quote)} 
                                                        className="text-red-600 hover:bg-red-50" 
                                                        title="Rechazar"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </Button>
                                                </>
                                            )}
                                            <Link to={createPageUrl(`QuoteDetail?id=${quote.id}`)}>
                                                <Button variant="ghost" size="icon" className="hover:bg-slate-100" title="Editar">
                                                    <Edit className="w-4 h-4" />
                                                </Button>
                                            </Link>
                                            {(status === 'borrador' || status === 'itemizando') && (
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="text-red-500 hover:bg-red-50" title="Eliminar">
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                Esta acción no se puede deshacer. La cotización será eliminada permanentemente.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                            <AlertDialogAction onClick={() => handleDeleteQuote(quote.id)} className="bg-red-600 hover:bg-red-700">
                                                                Eliminar
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        })
                    )}
                </TableBody>
            </Table>
        );
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 p-6 md:p-8">
            <div className="max-w-[1800px] mx-auto space-y-6">
                {/* Header */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg">
                                <FileText className="w-8 h-8 text-white" />
                            </div>
                            <div>
                                <h1 className="text-3xl font-bold text-slate-900">Gestión de Cotizaciones</h1>
                                <p className="text-slate-600 mt-1">Administra cotizaciones desde borrador hasta aprobación</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button 
                                variant="outline" 
                                size="lg" 
                                onClick={() => navigate(createPageUrl('QuoteSettings'))}
                                className="shadow-md"
                            >
                                <Settings className="w-5 h-5 mr-2" /> Configuración
                            </Button>
                            <Button onClick={() => navigate(createPageUrl('QuoteDetail'))} size="lg" className="shadow-md">
                                <Plus className="w-5 h-5 mr-2" /> Nueva Cotización
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Métricas */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    <Card className="shadow-md border-slate-200">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs text-slate-600 uppercase font-semibold mb-1">Total Cotizaciones</p>
                                    <p className="text-2xl font-bold text-slate-900">{metrics.totalQuotes}</p>
                                </div>
                                <FileText className="w-8 h-8 text-blue-500" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="shadow-md border-blue-200 bg-blue-50/50">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs text-blue-700 uppercase font-semibold mb-1">Enviadas</p>
                                    <p className="text-2xl font-bold text-blue-900">{metrics.pendingReview}</p>
                                </div>
                                <Calendar className="w-8 h-8 text-blue-500" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="shadow-md border-green-200 bg-green-50/50">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs text-green-700 uppercase font-semibold mb-1">Aprobadas</p>
                                    <p className="text-2xl font-bold text-green-900">{metrics.approved}</p>
                                </div>
                                <Check className="w-8 h-8 text-green-500" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="shadow-md border-emerald-200 bg-emerald-50/50">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs text-emerald-700 uppercase font-semibold mb-1">Tasa Aprobación</p>
                                    <p className="text-2xl font-bold text-emerald-900">{metrics.approvalRate.toFixed(1)}%</p>
                                </div>
                                <TrendingUp className="w-8 h-8 text-emerald-500" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="shadow-md border-purple-200 bg-purple-50/50">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs text-purple-700 uppercase font-semibold mb-1">Valor Aprobado</p>
                                    <p className="text-2xl font-bold text-purple-900">${metrics.totalValue.toFixed(0)}</p>
                                </div>
                                <DollarSign className="w-8 h-8 text-purple-500" />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Búsqueda y Tabs */}
                <Card className="shadow-lg">
                    <CardHeader>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <Input 
                                placeholder="Buscar por cliente o dirección..." 
                                className="pl-10 h-12 text-base" 
                                value={searchTerm} 
                                onChange={e => setSearchTerm(e.target.value)} 
                            />
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                            <div className="px-6 pb-4">
                                <TabsList className="grid w-full grid-cols-5 h-auto p-1">
                                    <TabsTrigger value="borrador" className="flex flex-col md:flex-row items-center gap-2 py-3">
                                        <span className="text-lg">📝</span>
                                        <span className="text-xs md:text-sm font-medium">Borradores</span>
                                        <Badge variant="secondary" className="text-xs">{quotesByStatus.borrador?.length || 0}</Badge>
                                    </TabsTrigger>
                                    <TabsTrigger value="itemizando" className="flex flex-col md:flex-row items-center gap-2 py-3">
                                        <span className="text-lg">📋</span>
                                        <span className="text-xs md:text-sm font-medium">Itemizar</span>
                                        <Badge variant="secondary" className="text-xs">{quotesByStatus.itemizando?.length || 0}</Badge>
                                    </TabsTrigger>
                                    <TabsTrigger value="enviada" className="flex flex-col md:flex-row items-center gap-2 py-3">
                                        <span className="text-lg">📤</span>
                                        <span className="text-xs md:text-sm font-medium">Enviadas</span>
                                        <Badge variant="secondary" className="text-xs">{quotesByStatus.enviada?.length || 0}</Badge>
                                    </TabsTrigger>
                                    <TabsTrigger value="aprobado" className="flex flex-col md:flex-row items-center gap-2 py-3">
                                        <span className="text-lg">✅</span>
                                        <span className="text-xs md:text-sm font-medium">Aprobadas</span>
                                        <Badge variant="secondary" className="text-xs">{quotesByStatus.aprobado?.length || 0}</Badge>
                                    </TabsTrigger>
                                    <TabsTrigger value="rechazado" className="flex flex-col md:flex-row items-center gap-2 py-3">
                                        <span className="text-lg">❌</span>
                                        <span className="text-xs md:text-sm font-medium">Rechazadas</span>
                                        <Badge variant="secondary" className="text-xs">{quotesByStatus.rechazado?.length || 0}</Badge>
                                    </TabsTrigger>
                                </TabsList>
                            </div>

                            <TabsContent value="borrador" className="mt-0">
                                <div className="px-6 pb-4 border-t border-slate-100 pt-4">
                                    <p className="text-sm text-slate-600">
                                        💡 Cotizaciones en preparación. Usa <strong>"Mover a Itemización"</strong> cuando estén listas para seleccionar ítems de limpieza.
                                    </p>
                                </div>
                                <div className="border-t border-slate-100">
                                    {renderQuoteTable('borrador')}
                                </div>
                            </TabsContent>

                            <TabsContent value="itemizando" className="mt-0">
                                <div className="px-6 pb-4 border-t border-slate-100 pt-4">
                                    <p className="text-sm text-slate-600">
                                        📋 Selecciona los ítems específicos de limpieza por área antes de enviar al cliente.
                                    </p>
                                </div>
                                <div className="border-t border-slate-100">
                                    {renderQuoteTable('itemizando')}
                                </div>
                            </TabsContent>

                            <TabsContent value="enviada" className="mt-0">
                                <div className="px-6 pb-4 border-t border-slate-100 pt-4 bg-blue-50/30">
                                    <p className="text-sm text-slate-700">
                                        ⏱️ <strong>El conteo de 20 días inicia aquí.</strong> Las cotizaciones con más de 20 días se resaltan en rojo para seguimiento prioritario.
                                    </p>
                                </div>
                                <div className="border-t border-slate-100">
                                    {renderQuoteTable('enviada')}
                                </div>
                            </TabsContent>

                            <TabsContent value="aprobado" className="mt-0">
                                <div className="px-6 pb-4 border-t border-slate-100 pt-4 bg-green-50/30">
                                    <p className="text-sm text-slate-700">
                                        ✅ Cotizaciones aceptadas. Se envían automáticamente a ZenMaid para programación.
                                    </p>
                                </div>
                                <div className="border-t border-slate-100">
                                    {renderQuoteTable('aprobado')}
                                </div>
                            </TabsContent>

                            <TabsContent value="rechazado" className="mt-0">
                                <div className="px-6 pb-4 border-t border-slate-100 pt-4 bg-red-50/30">
                                    <p className="text-sm text-slate-700">
                                        📊 Analiza los motivos de rechazo para mejorar futuras propuestas.
                                    </p>
                                </div>
                                <div className="border-t border-slate-100">
                                    {renderQuoteTable('rechazado')}
                                </div>
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>
            </div>
            
            <RejectionDialog
                quote={rejectingQuote}
                isOpen={!!rejectingQuote}
                onClose={() => setRejectingQuote(null)}
                onSubmit={handleRejectionSubmit}
            />
        </div>
    );
}