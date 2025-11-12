import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Search,
    RefreshCw,
    FileText,
    CheckCircle,
    AlertTriangle,
    AlertCircle,
    TrendingUp,
    Loader2,
    Filter,
    Eye
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import WorkEntryAuditModal from '@/components/work/WorkEntryAuditModal';

export default function AuditoriaEntradasPage() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [auditing, setAuditing] = useState(false);
    const [auditResults, setAuditResults] = useState([]);
    const [stats, setStats] = useState(null);
    const [error, setError] = useState('');
    
    // Filtros
    const [startDate, setStartDate] = useState(() => {
        const date = new Date();
        date.setDate(1); // Primer día del mes actual
        return format(date, 'yyyy-MM-dd');
    });
    const [endDate, setEndDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
    const [selectedCleaners, setSelectedCleaners] = useState([]);
    const [selectedClients, setSelectedClients] = useState([]);
    const [discrepancyFilter, setDiscrepancyFilter] = useState('all');

    // Datos para filtros
    const [cleaners, setCleaners] = useState([]);
    const [clients, setClients] = useState([]);

    // Modal
    const [selectedAudit, setSelectedAudit] = useState(null);
    const [showModal, setShowModal] = useState(false);

    useEffect(() => {
        loadInitialData();
    }, []);

    const loadInitialData = async () => {
        try {
            setLoading(true);
            const currentUser = await base44.auth.me();
            
            if (!currentUser || currentUser.role !== 'admin') {
                setError('Solo los administradores pueden acceder a esta página');
                setLoading(false);
                return;
            }

            setUser(currentUser);

            // Cargar limpiadores y clientes para los filtros
            const [allUsers, allClients] = await Promise.all([
                base44.entities.User.list(),
                base44.entities.Client.list()
            ]);

            setCleaners(allUsers.filter(u => u.role !== 'admin' && u.active !== false));
            setClients(allClients.filter(c => c.active !== false));

        } catch (error) {
            console.error('Error cargando datos:', error);
            setError('Error al cargar datos iniciales');
        } finally {
            setLoading(false);
        }
    };

    const handleRunAudit = async () => {
        setAuditing(true);
        setError('');

        try {
            const { data } = await base44.functions.invoke('auditWorkEntries', {
                startDate: startDate,
                endDate: endDate,
                cleanerIds: selectedCleaners.length > 0 ? selectedCleaners : undefined,
                clientIds: selectedClients.length > 0 ? selectedClients : undefined,
                discrepancyType: discrepancyFilter !== 'all' ? discrepancyFilter : undefined
            });

            if (data.success) {
                setAuditResults(data.results || []);
                setStats(data.stats || null);
            } else {
                setError(data.error || 'Error al ejecutar la auditoría');
            }
        } catch (err) {
            console.error('Error en auditoría:', err);
            setError(err.response?.data?.error || err.message || 'Error al ejecutar la auditoría');
        } finally {
            setAuditing(false);
        }
    };

    const handleViewDetails = (audit) => {
        setSelectedAudit(audit);
        setShowModal(true);
    };

    const handleWorkEntryGenerated = () => {
        // Recargar la auditoría después de generar un WorkEntry
        handleRunAudit();
    };

    const getStatusBadge = (status) => {
        const statusConfig = {
            ok: { label: 'OK', color: 'bg-green-100 text-green-800', icon: CheckCircle },
            missing: { label: 'Falta', color: 'bg-red-100 text-red-800', icon: AlertTriangle },
            partial: { label: 'Parcial', color: 'bg-amber-100 text-amber-800', icon: AlertCircle },
            discrepancy: { label: 'Discrepancia', color: 'bg-orange-100 text-orange-800', icon: AlertCircle }
        };

        const config = statusConfig[status] || statusConfig.ok;
        const Icon = config.icon;

        return (
            <Badge className={`${config.color} flex items-center gap-1`}>
                <Icon className="w-3 h-3" />
                {config.label}
            </Badge>
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
                <div className="text-center space-y-4">
                    <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto" />
                    <p className="text-slate-600">Cargando panel de auditoría...</p>
                </div>
            </div>
        );
    }

    if (!user || user.role !== 'admin') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
                <Card className="max-w-md w-full border-2 border-red-200">
                    <CardContent className="pt-6">
                        <div className="text-center space-y-4">
                            <AlertTriangle className="w-16 h-16 text-red-600 mx-auto" />
                            <h2 className="text-xl font-bold text-slate-800">Acceso Denegado</h2>
                            <p className="text-slate-600">
                                Solo los administradores pueden acceder al panel de auditoría.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                            <FileText className="w-8 h-8 text-blue-600" />
                            Auditoría de Entradas de Trabajo
                        </h1>
                        <p className="text-slate-600 mt-1">
                            Verifica que todos los servicios completados tengan sus WorkEntry correspondientes
                        </p>
                    </div>
                </div>

                {error && (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {/* Filtros */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Filter className="w-5 h-5 text-blue-600" />
                            Filtros de Auditoría
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="space-y-2">
                                <Label>Fecha Inicio</Label>
                                <Input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Fecha Fin</Label>
                                <Input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Tipo de Problema</Label>
                                <Select value={discrepancyFilter} onValueChange={setDiscrepancyFilter}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todos</SelectItem>
                                        <SelectItem value="ok">Sin Problemas</SelectItem>
                                        <SelectItem value="missing">Faltan WorkEntry</SelectItem>
                                        <SelectItem value="partial">Parcialmente Completo</SelectItem>
                                        <SelectItem value="discrepancy">Con Discrepancias</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex items-end">
                                <Button
                                    onClick={handleRunAudit}
                                    disabled={auditing}
                                    className="w-full bg-blue-600 hover:bg-blue-700"
                                >
                                    {auditing ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Auditando...
                                        </>
                                    ) : (
                                        <>
                                            <Search className="w-4 h-4 mr-2" />
                                            Ejecutar Auditoría
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Estadísticas */}
                {stats && (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm opacity-90">Total</p>
                                        <p className="text-3xl font-bold">{stats.total}</p>
                                    </div>
                                    <FileText className="w-8 h-8 opacity-80" />
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm opacity-90">OK</p>
                                        <p className="text-3xl font-bold">{stats.ok}</p>
                                    </div>
                                    <CheckCircle className="w-8 h-8 opacity-80" />
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-gradient-to-br from-red-500 to-red-600 text-white">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm opacity-90">Faltantes</p>
                                        <p className="text-3xl font-bold">{stats.missing}</p>
                                    </div>
                                    <AlertTriangle className="w-8 h-8 opacity-80" />
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-gradient-to-br from-amber-500 to-amber-600 text-white">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm opacity-90">Parciales</p>
                                        <p className="text-3xl font-bold">{stats.partial}</p>
                                    </div>
                                    <AlertCircle className="w-8 h-8 opacity-80" />
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm opacity-90">Discrepancias</p>
                                        <p className="text-3xl font-bold">{stats.discrepancy}</p>
                                    </div>
                                    <TrendingUp className="w-8 h-8 opacity-80" />
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Tabla de Resultados */}
                {auditResults.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>
                                Resultados de Auditoría ({auditResults.length} servicios)
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-lg border">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-slate-50">
                                            <TableHead className="font-bold">Fecha</TableHead>
                                            <TableHead className="font-bold">Cliente</TableHead>
                                            <TableHead className="font-bold">Limpiadores</TableHead>
                                            <TableHead className="font-bold">Con WorkEntry</TableHead>
                                            <TableHead className="font-bold">Estado</TableHead>
                                            <TableHead className="font-bold">Problemas</TableHead>
                                            <TableHead className="font-bold w-12"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {auditResults.map((audit) => (
                                            <TableRow key={audit.scheduleId} className="hover:bg-slate-50">
                                                <TableCell>
                                                    {format(new Date(audit.serviceDate), 'd MMM yyyy', { locale: es })}
                                                </TableCell>
                                                <TableCell className="font-medium">{audit.clientName}</TableCell>
                                                <TableCell>{audit.cleanersAssigned}</TableCell>
                                                <TableCell>
                                                    <span className={audit.cleanersWithWorkEntry < audit.cleanersAssigned ? 'text-red-600 font-semibold' : ''}>
                                                        {audit.cleanersWithWorkEntry}
                                                    </span>
                                                </TableCell>
                                                <TableCell>{getStatusBadge(audit.status)}</TableCell>
                                                <TableCell>
                                                    {audit.issues && audit.issues.length > 0 ? (
                                                        <Badge variant="outline" className="text-xs">
                                                            {audit.issues.length} problema{audit.issues.length !== 1 ? 's' : ''}
                                                        </Badge>
                                                    ) : (
                                                        <span className="text-slate-400 text-sm">Ninguno</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleViewDetails(audit)}
                                                    >
                                                        <Eye className="w-4 h-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {auditResults.length === 0 && !auditing && (
                    <Card>
                        <CardContent className="py-12">
                            <div className="text-center text-slate-500">
                                <Search className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                                <p className="text-lg font-semibold">No hay resultados</p>
                                <p className="text-sm">Ajusta los filtros y ejecuta la auditoría para ver resultados</p>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Modal de Detalles */}
            <WorkEntryAuditModal
                auditResult={selectedAudit}
                open={showModal}
                onClose={() => {
                    setShowModal(false);
                    setSelectedAudit(null);
                }}
                onWorkEntryGenerated={handleWorkEntryGenerated}
            />
        </div>
    );
}