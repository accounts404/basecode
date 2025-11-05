
import React, { useState, useMemo } from "react";
import { CleanerShirtAssignment } from "@/entities/CleanerShirtAssignment";
import { ShirtInventory } from "@/entities/ShirtInventory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Plus, CheckCircle, Users, History, Loader2, AlertTriangle, Clock } from "lucide-react";
import { format, differenceInDays, parseISO } from "date-fns";
import { es } from "date-fns/locale";

export default function AssignmentsTab({ assignments, cleaners, inventory, onRefresh, currentUser }) {
    const [issueDialogOpen, setIssueDialogOpen] = useState(false);
    const [returnDialogOpen, setReturnDialogOpen] = useState(false);
    const [selectedAssignment, setSelectedAssignment] = useState(null);
    const [loading, setLoading] = useState(false);

    const [issueData, setIssueData] = useState({
        cleaner_id: "",
        shirt_model: "",
        shirt_gender: "male", // Added gender
        shirt_size: "M",
        shirt_color: "",
        is_new_shirt: true,
        notes: ""
    });

    const [returnData, setReturnData] = useState({
        return_condition: "good",
        notes: ""
    });

    // Filtrar asignaciones activas y pasadas
    const activeAssignments = useMemo(() =>
        assignments.filter(a => a.status === 'issued'),
        [assignments]
    );

    const pastAssignments = useMemo(() =>
        assignments.filter(a => a.status !== 'issued'),
        [assignments]
    );

    const MALE_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "XXXXL"]; // Added XXXXL
    const FEMALE_SIZES = ["6", "8", "10", "12", "14", "16", "18", "20", "22", "24"];

    const getGenderLabel = (gender) => {
        return gender === 'male' ? 'Hombre' : 'Mujer';
    };

    const getAvailableSizes = (gender) => {
        return gender === 'male' ? MALE_SIZES : FEMALE_SIZES;
    };

    const handleIssueShirt = async () => {
        if (!issueData.cleaner_id || !issueData.shirt_model || !issueData.shirt_color || !issueData.shirt_gender) {
            alert('Por favor completa todos los campos requeridos');
            return;
        }

        setLoading(true);
        try {
            const cleaner = cleaners.find(c => c.id === issueData.cleaner_id);

            // Crear la asignación
            await CleanerShirtAssignment.create({
                ...issueData,
                cleaner_name: cleaner?.invoice_name || cleaner?.full_name || cleaner?.display_name || 'Desconocido',
                issued_date: new Date().toISOString().split('T')[0],
                issued_by_admin: currentUser.id,
                status: 'issued'
            });

            // Actualizar el inventario
            const inventoryItem = inventory.find(item =>
                item.model === issueData.shirt_model &&
                item.gender === issueData.shirt_gender && // Filter by gender
                item.size === issueData.shirt_size &&
                item.color === issueData.shirt_color
            );

            if (inventoryItem) {
                const updateData = {};
                if (issueData.is_new_shirt) {
                    updateData.new_stock = Math.max(0, (inventoryItem.new_stock || 0) - 1);
                } else {
                    updateData.reusable_stock = Math.max(0, (inventoryItem.reusable_stock || 0) - 1);
                }
                await ShirtInventory.update(inventoryItem.id, updateData);
            }

            setIssueDialogOpen(false);
            setIssueData({
                cleaner_id: "",
                shirt_model: "",
                shirt_gender: "male", // Reset gender
                shirt_size: "M",
                shirt_color: "",
                is_new_shirt: true,
                notes: ""
            });
            onRefresh();
        } catch (error) {
            console.error('Error entregando camisa:', error);
            alert('Error al entregar la camisa');
        } finally {
            setLoading(false);
        }
    };

    const handleReturnShirt = async () => {
        if (!selectedAssignment) return;

        setLoading(true);
        try {
            const newStatus = returnData.return_condition === 'lost' ? 'lost' :
                            returnData.return_condition === 'damaged' ? 'returned_damaged' :
                            'returned_reusable';

            // Actualizar la asignación
            await CleanerShirtAssignment.update(selectedAssignment.id, {
                returned_date: new Date().toISOString().split('T')[0],
                return_condition: returnData.return_condition,
                status: newStatus,
                notes: (selectedAssignment.notes || '') + '\n' + returnData.notes,
                returned_by_admin: currentUser.id
            });

            // Si está en buena condición, sumar al stock reutilizable
            if (returnData.return_condition === 'good' || returnData.return_condition === 'fair' || returnData.return_condition === 'excellent') {
                const inventoryItem = inventory.find(item =>
                    item.model === selectedAssignment.shirt_model &&
                    item.gender === selectedAssignment.shirt_gender && // Filter by gender
                    item.size === selectedAssignment.shirt_size &&
                    item.color === selectedAssignment.shirt_color
                );

                if (inventoryItem) {
                    await ShirtInventory.update(inventoryItem.id, {
                        reusable_stock: (inventoryItem.reusable_stock || 0) + 1
                    });
                }
            }

            setReturnDialogOpen(false);
            setSelectedAssignment(null);
            setReturnData({
                return_condition: "good",
                notes: ""
            });
            onRefresh();
        } catch (error) {
            console.error('Error registrando devolución:', error);
            alert('Error al registrar la devolución');
        } finally {
            setLoading(false);
        }
    };

    const getDaysAssigned = (issuedDate) => {
        try {
            return differenceInDays(new Date(), parseISO(issuedDate));
        } catch {
            return 0;
        }
    };

    const getDaysUntilRenewal = (issuedDate) => {
        const RENEWAL_THRESHOLD = 150; // 5 meses
        const daysAssigned = getDaysAssigned(issuedDate);
        return RENEWAL_THRESHOLD - daysAssigned;
    };

    const getRenewalBadge = (issuedDate) => {
        const daysUntilRenewal = getDaysUntilRenewal(issuedDate);

        if (daysUntilRenewal <= 0) {
            return (
                <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    ¡Renovar Ya! ({Math.abs(daysUntilRenewal)} días pasados)
                </Badge>
            );
        } else if (daysUntilRenewal <= 30) {
            return (
                <Badge variant="secondary" className="gap-1 bg-orange-100 text-orange-800">
                    <Clock className="w-3 h-3" />
                    {daysUntilRenewal} días para renovar
                </Badge>
            );
        } else {
            return (
                <Badge variant="outline" className="gap-1">
                    <CheckCircle className="w-3 h-3 text-green-600" />
                    {daysUntilRenewal} días restantes
                </Badge>
            );
        }
    };

    const availableModels = useMemo(() => {
        const models = new Set(inventory.map(item => item.model));
        return Array.from(models);
    }, [inventory]);

    const availableColors = useMemo(() => {
        if (!issueData.shirt_model || !issueData.shirt_gender) return []; // Added gender dependency
        const colors = new Set(
            inventory
                .filter(item => item.model === issueData.shirt_model && item.gender === issueData.shirt_gender) // Filter by gender
                .map(item => item.color)
        );
        return Array.from(colors);
    }, [inventory, issueData.shirt_model, issueData.shirt_gender]); // Added gender dependency

    const canIssueFromStock = useMemo(() => {
        if (!issueData.shirt_model || !issueData.shirt_color || !issueData.shirt_size || !issueData.shirt_gender) return false; // Added gender dependency

        const item = inventory.find(i =>
            i.model === issueData.shirt_model &&
            i.gender === issueData.shirt_gender && // Filter by gender
            i.color === issueData.shirt_color &&
            i.size === issueData.shirt_size
        );

        if (!item) return false;

        return issueData.is_new_shirt
            ? (item.new_stock || 0) > 0
            : (item.reusable_stock || 0) > 0;
    }, [inventory, issueData]);

    const handleGenderChange = (gender) => {
        const defaultSize = gender === 'male' ? 'M' : '12';
        setIssueData({ ...issueData, shirt_gender: gender, shirt_size: defaultSize, shirt_color: "" });
    };

    return (
        <div className="space-y-4">
            <Tabs defaultValue="active">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="active">Asignaciones Activas ({activeAssignments.length})</TabsTrigger>
                    <TabsTrigger value="history">Historial ({pastAssignments.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="active" className="mt-6">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="flex items-center gap-2">
                                    <Users className="w-5 h-5" />
                                    Camisas Asignadas Actualmente
                                </CardTitle>
                                <Button onClick={() => setIssueDialogOpen(true)} className="gap-2">
                                    <Plus className="w-4 h-4" />
                                    Entregar Camisa
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Limpiador</TableHead>
                                        <TableHead>Modelo</TableHead>
                                        <TableHead>Género</TableHead> {/* Added Gender column */}
                                        <TableHead>Talla</TableHead>
                                        <TableHead>Color</TableHead>
                                        <TableHead>Fecha Entrega</TableHead>
                                        <TableHead>Días Asignada</TableHead>
                                        <TableHead>Contador Renovación</TableHead>
                                        <TableHead>Tipo</TableHead>
                                        <TableHead>Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {activeAssignments.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan="10" className="text-center py-8 text-slate-500"> {/* Updated colSpan */}
                                                No hay camisas asignadas actualmente
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        activeAssignments.map((assignment) => (
                                            <TableRow key={assignment.id}>
                                                <TableCell className="font-medium">
                                                    {assignment.cleaner_name}
                                                </TableCell>
                                                <TableCell>{assignment.shirt_model}</TableCell>
                                                <TableCell> {/* Display Gender */}
                                                    <Badge variant="outline" className={assignment.shirt_gender === 'male' ? 'bg-blue-50' : 'bg-pink-50'}>
                                                        {getGenderLabel(assignment.shirt_gender)}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline">{assignment.shirt_size}</Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <div
                                                            className="w-4 h-4 rounded-full border border-slate-300"
                                                            style={{ backgroundColor: assignment.shirt_color.toLowerCase() }}
                                                        />
                                                        {assignment.shirt_color}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    {format(parseISO(assignment.issued_date), 'dd MMM yyyy', { locale: es })}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={getDaysAssigned(assignment.issued_date) > 180 ? "destructive" : "secondary"}>
                                                        {getDaysAssigned(assignment.issued_date)} días
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    {getRenewalBadge(assignment.issued_date)}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={assignment.is_new_shirt ? "default" : "secondary"}>
                                                        {assignment.is_new_shirt ? 'Nueva' : 'Reutilizada'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => {
                                                            setSelectedAssignment(assignment);
                                                            setReturnDialogOpen(true);
                                                        }}
                                                        className="gap-1"
                                                    >
                                                        <CheckCircle className="w-4 h-4" />
                                                        Registrar Devolución
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="history" className="mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <History className="w-5 h-5" />
                                Historial de Transacciones
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Limpiador</TableHead>
                                        <TableHead>Modelo/Género/Talla</TableHead> {/* Updated column header */}
                                        <TableHead>Fecha Entrega</TableHead>
                                        <TableHead>Fecha Devolución</TableHead>
                                        <TableHead>Condición</TableHead>
                                        <TableHead>Estado</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {pastAssignments.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan="6" className="text-center py-8 text-slate-500">
                                                No hay historial de devoluciones
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        pastAssignments.map((assignment) => (
                                            <TableRow key={assignment.id}>
                                                <TableCell className="font-medium">
                                                    {assignment.cleaner_name}
                                                </TableCell>
                                                <TableCell>
                                                    {assignment.shirt_model} - {getGenderLabel(assignment.shirt_gender)} - {assignment.shirt_color} - {assignment.shirt_size} {/* Display Gender */}
                                                </TableCell>
                                                <TableCell>
                                                    {format(parseISO(assignment.issued_date), 'dd MMM yyyy', { locale: es })}
                                                </TableCell>
                                                <TableCell>
                                                    {assignment.returned_date
                                                        ? format(parseISO(assignment.returned_date), 'dd MMM yyyy', { locale: es })
                                                        : '-'
                                                    }
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={
                                                        assignment.return_condition === 'excellent' || assignment.return_condition === 'good' ? 'default' :
                                                        assignment.return_condition === 'fair' ? 'secondary' :
                                                        'destructive'
                                                    }>
                                                        {assignment.return_condition === 'excellent' ? 'Excelente' :
                                                         assignment.return_condition === 'good' ? 'Buena' :
                                                         assignment.return_condition === 'fair' ? 'Aceptable' :
                                                         assignment.return_condition === 'damaged' ? 'Dañada' :
                                                         'Perdida'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline">
                                                        {assignment.status === 'returned_reusable' ? 'Devuelta - Reutilizable' :
                                                         assignment.status === 'returned_damaged' ? 'Devuelta - Dañada' :
                                                         'Perdida'}
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Dialog para entregar camisa */}
            <Dialog open={issueDialogOpen} onOpenChange={setIssueDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Entregar Camisa a Limpiador</DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2 space-y-2">
                            <Label>Limpiador</Label>
                            <Select value={issueData.cleaner_id} onValueChange={(value) => setIssueData({...issueData, cleaner_id: value})}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecciona un limpiador" />
                                </SelectTrigger>
                                <SelectContent>
                                    {cleaners.map((cleaner) => (
                                        <SelectItem key={cleaner.id} value={cleaner.id}>
                                            {cleaner.invoice_name || cleaner.full_name || cleaner.display_name} {!cleaner.active && '(Inactivo)'}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Modelo</Label>
                            <Select value={issueData.shirt_model} onValueChange={(value) => setIssueData({...issueData, shirt_model: value, shirt_color: ""})}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecciona modelo" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableModels.map((model) => (
                                        <SelectItem key={model} value={model}>
                                            {model}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2"> {/* Added Gender Select */}
                            <Label>Género</Label>
                            <Select value={issueData.shirt_gender} onValueChange={handleGenderChange}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="male">Hombre</SelectItem>
                                    <SelectItem value="female">Mujer</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Color</Label>
                            <Select
                                value={issueData.shirt_color}
                                onValueChange={(value) => setIssueData({...issueData, shirt_color: value})}
                                disabled={!issueData.shirt_model || !issueData.shirt_gender} // Disabled if model or gender not selected
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecciona color" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableColors.map((color) => (
                                        <SelectItem key={color} value={color}>
                                            {color}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Talla</Label>
                            <Select value={issueData.shirt_size} onValueChange={(value) => setIssueData({...issueData, shirt_size: value})}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {getAvailableSizes(issueData.shirt_gender).map(size => ( // Dynamic sizes based on gender
                                        <SelectItem key={size} value={size}>{size}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Tipo de Camisa</Label>
                            <Select
                                value={issueData.is_new_shirt.toString()}
                                onValueChange={(value) => setIssueData({...issueData, is_new_shirt: value === 'true'})}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="true">Nueva</SelectItem>
                                    <SelectItem value="false">Reutilizada</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="col-span-2 space-y-2">
                            <Label>Notas (opcional)</Label>
                            <Textarea
                                placeholder="Observaciones sobre la entrega..."
                                value={issueData.notes}
                                onChange={(e) => setIssueData({...issueData, notes: e.target.value})}
                            />
                        </div>

                        {!canIssueFromStock && issueData.shirt_model && issueData.shirt_color && issueData.shirt_size && issueData.shirt_gender && ( // Added gender to condition
                            <div className="col-span-2">
                                <Badge variant="destructive" className="gap-1">
                                    <AlertTriangle className="w-3 h-3" />
                                    No hay stock disponible de este tipo
                                </Badge>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIssueDialogOpen(false)}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleIssueShirt}
                            disabled={loading || !canIssueFromStock || !issueData.cleaner_id}
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Entregar Camisa'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Dialog para registrar devolución */}
            <Dialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Registrar Devolución de Camisa</DialogTitle>
                    </DialogHeader>
                    {selectedAssignment && (
                        <div className="space-y-4">
                            <div className="bg-slate-100 p-4 rounded-lg space-y-2">
                                <p className="text-sm text-slate-600">Limpiador</p>
                                <p className="font-semibold">{selectedAssignment.cleaner_name}</p>
                                <p className="text-sm text-slate-600 mt-2">Camisa</p>
                                <p className="font-semibold">
                                    {selectedAssignment.shirt_model} - {getGenderLabel(selectedAssignment.shirt_gender)} - {selectedAssignment.shirt_color} - {selectedAssignment.shirt_size} {/* Display Gender */}
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label>Condición de la Camisa</Label>
                                <Select
                                    value={returnData.return_condition}
                                    onValueChange={(value) => setReturnData({...returnData, return_condition: value})}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="excellent">Excelente - Como nueva</SelectItem>
                                        <SelectItem value="good">Buena - Puede reutilizarse</SelectItem>
                                        <SelectItem value="fair">Aceptable - Puede reutilizarse</SelectItem>
                                        <SelectItem value="damaged">Dañada - No reutilizable</SelectItem>
                                        <SelectItem value="lost">Perdida - No devuelta</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Notas (opcional)</Label>
                                <Textarea
                                    placeholder="Observaciones sobre la devolución..."
                                    value={returnData.notes}
                                    onChange={(e) => setReturnData({...returnData, notes: e.target.value})}
                                />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setReturnDialogOpen(false)}>
                            Cancelar
                        </Button>
                        <Button onClick={handleReturnShirt} disabled={loading}>
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Registrar Devolución'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
