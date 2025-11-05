
import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
    AlertTriangle, 
    Clock, 
    TrendingDown, 
    UserPlus,
    Package
} from "lucide-react";
import { differenceInDays, parseISO } from "date-fns";

export default function AlertsTab({ assignments, cleaners, inventory, onRefresh, currentUser }) {
    // Configuración: días para renovación (5 meses = 150 días)
    const RENEWAL_THRESHOLD_DAYS = 150;

    // Limpiadores que necesitan renovación
    const cleanersNeedingRenewal = useMemo(() => {
        return assignments
            .filter(a => a.status === 'issued')
            .map(assignment => {
                const daysAssigned = differenceInDays(new Date(), parseISO(assignment.issued_date));
                const daysUntilRenewal = RENEWAL_THRESHOLD_DAYS - daysAssigned;
                
                // Buscar el limpiador para obtener su invoice_name o full_name
                const cleaner = cleaners.find(c => c.id === assignment.cleaner_id);
                const fullName = cleaner?.invoice_name || cleaner?.full_name || assignment.cleaner_name;
                
                return {
                    ...assignment,
                    full_invoice_name: fullName,
                    daysAssigned,
                    daysUntilRenewal,
                    needsRenewal: daysAssigned >= RENEWAL_THRESHOLD_DAYS
                };
            })
            .filter(a => a.needsRenewal)
            .sort((a, b) => b.daysAssigned - a.daysAssigned);
    }, [assignments, cleaners]);

    // Items de inventario con stock bajo
    const lowStockItems = useMemo(() => {
        return inventory
            .map(item => ({
                ...item,
                totalStock: (item.new_stock || 0) + (item.reusable_stock || 0),
                isLow: ((item.new_stock || 0) + (item.reusable_stock || 0)) < (item.minimum_stock_threshold || 5)
            }))
            .filter(item => item.isLow)
            .sort((a, b) => a.totalStock - b.totalStock);
    }, [inventory]);

    return (
        <div className="space-y-6">
            {/* Alerta general */}
            {(cleanersNeedingRenewal.length > 0 || lowStockItems.length > 0) && (
                <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Acciones Requeridas</AlertTitle>
                    <AlertDescription>
                        <ul className="list-disc list-inside space-y-1 mt-2">
                            {cleanersNeedingRenewal.length > 0 && (
                                <li>{cleanersNeedingRenewal.length} camisa(s) necesitan renovación</li>
                            )}
                            {lowStockItems.length > 0 && (
                                <li>{lowStockItems.length} modelo(s) con stock bajo</li>
                            )}
                        </ul>
                    </AlertDescription>
                </Alert>
            )}

            {/* Sección A: Próximos a Renovar */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-blue-600" />
                        Camisas que Necesitan Renovación ({cleanersNeedingRenewal.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {cleanersNeedingRenewal.length === 0 ? (
                        <div className="text-center py-8 text-slate-500">
                            ✅ No hay camisas que necesiten renovación en este momento
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Limpiador</TableHead>
                                    <TableHead>Modelo/Talla Actual</TableHead>
                                    <TableHead>Días Asignada</TableHead>
                                    <TableHead>Contador Renovación</TableHead>
                                    <TableHead>Alerta</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {cleanersNeedingRenewal.map((assignment) => (
                                    <TableRow key={assignment.id}>
                                        <TableCell className="font-medium">
                                            {assignment.full_invoice_name}
                                        </TableCell>
                                        <TableCell>
                                            {assignment.shirt_model} - {assignment.shirt_size}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={assignment.daysAssigned > RENEWAL_THRESHOLD_DAYS ? "destructive" : "secondary"}>
                                                {assignment.daysAssigned} días
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {assignment.daysUntilRenewal <= 0 ? (
                                                <Badge variant="destructive" className="gap-1">
                                                    <AlertTriangle className="w-3 h-3" />
                                                    ¡Vencida! ({Math.abs(assignment.daysUntilRenewal)} días pasados)
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {assignment.daysUntilRenewal} días restantes
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="destructive" className="gap-1">
                                                <Clock className="w-3 h-3" />
                                                Renovar Ahora
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Sección B: Stock Bajo */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <TrendingDown className="w-5 h-5 text-red-600" />
                        Alertas de Stock Bajo ({lowStockItems.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {lowStockItems.length === 0 ? (
                        <div className="text-center py-8 text-slate-500">
                            ✅ Todos los modelos tienen stock suficiente
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Modelo</TableHead>
                                    <TableHead>Género</TableHead>
                                    <TableHead>Talla</TableHead>
                                    <TableHead>Color</TableHead>
                                    <TableHead>Stock Actual</TableHead>
                                    <TableHead>Mínimo Requerido</TableHead>
                                    <TableHead>Alerta</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {lowStockItems.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell className="font-medium">{item.model}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline">
                                                {item.gender === 'male' ? 'Hombre' : 'Mujer'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{item.size}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div 
                                                className="w-4 h-4 rounded-full border border-slate-300"
                                                style={{ backgroundColor: item.color.toLowerCase() }}
                                            />
                                            {item.color}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="destructive">
                                                {item.totalStock}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{item.minimum_stock_threshold || 5}</TableCell>
                                        <TableCell>
                                            <Badge variant="destructive" className="gap-1">
                                                <Package className="w-3 h-3" />
                                                ¡Reponer Stock!
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Información adicional */}
            <Card className="bg-blue-50 border-blue-200">
                <CardContent className="p-6">
                    <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5" />
                        Consejos de Gestión
                    </h3>
                    <ul className="space-y-2 text-sm text-blue-800">
                        <li>• Las camisas deben renovarse cada {RENEWAL_THRESHOLD_DAYS} días ({Math.round(RENEWAL_THRESHOLD_DAYS / 30)} meses aprox.)</li>
                        <li>• Mantén siempre un stock mínimo de seguridad para evitar quedarte sin camisas</li>
                        <li>• Cuando un limpiador devuelve una camisa en buena condición, se añade automáticamente al stock reutilizable</li>
                        <li>• Revisa regularmente la pestaña de "Alertas" para gestionar proactivamente el inventario</li>
                        <li>• El contador muestra los días restantes hasta la próxima renovación obligatoria</li>
                    </ul>
                </CardContent>
            </Card>
        </div>
    );
}
