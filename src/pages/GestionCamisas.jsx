import React, { useState, useEffect, useCallback } from "react";
import { User } from "@/entities/User";
import { ShirtInventory } from "@/entities/ShirtInventory";
import { CleanerShirtAssignment } from "@/entities/CleanerShirtAssignment";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
    Shirt, 
    Package, 
    Users, 
    AlertTriangle, 
    TrendingUp, 
    Plus,
    Loader2,
    Clock,
    CheckCircle,
    XCircle,
    AlertCircle
} from "lucide-react";
import { format, differenceInDays, parseISO } from "date-fns";
import { es } from "date-fns/locale";

import InventoryTab from "../components/shirts/InventoryTab";
import AssignmentsTab from "../components/shirts/AssignmentsTab";
import AlertsTab from "../components/shirts/AlertsTab";

export default function GestionCamisasPage() {
    const [currentUser, setCurrentUser] = useState(null);
    const [inventory, setInventory] = useState([]);
    const [assignments, setAssignments] = useState([]);
    const [cleaners, setCleaners] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("inventory");

    const loadAllRecords = async (entity, sortField = '-created_date') => {
        const BATCH_SIZE = 5000;
        let allRecords = [];
        let skip = 0;
        let hasMore = true;

        while (hasMore) {
            const batch = await entity.list(sortField, BATCH_SIZE, skip);
            const batchArray = Array.isArray(batch) ? batch : [];
            
            allRecords = [...allRecords, ...batchArray];
            
            if (batchArray.length < BATCH_SIZE) {
                hasMore = false;
            } else {
                skip += BATCH_SIZE;
            }
        }

        return allRecords;
    };

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [user, inventoryData, assignmentsData, usersData] = await Promise.all([
                User.me(),
                loadAllRecords(ShirtInventory, '-created_date'),
                loadAllRecords(CleanerShirtAssignment, '-created_date'),
                loadAllRecords(User, '-created_date')
            ]);

            setCurrentUser(user);
            setInventory(Array.isArray(inventoryData) ? inventoryData : []);
            setAssignments(Array.isArray(assignmentsData) ? assignmentsData : []);
            
            // Filtrar solo limpiadores (no admins)
            const cleanersList = Array.isArray(usersData) 
                ? usersData.filter(u => u.role !== 'admin')
                : [];
            setCleaners(cleanersList);
        } catch (error) {
            console.error('Error cargando datos:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Calcular estadísticas generales
    const stats = React.useMemo(() => {
        const totalNewStock = inventory.reduce((sum, item) => sum + (item.new_stock || 0), 0);
        const totalReusableStock = inventory.reduce((sum, item) => sum + (item.reusable_stock || 0), 0);
        const activeAssignments = assignments.filter(a => a.status === 'issued').length;
        const lowStockItems = inventory.filter(item => 
            (item.new_stock + item.reusable_stock) < (item.minimum_stock_threshold || 5)
        ).length;

        return {
            totalNewStock,
            totalReusableStock,
            totalStock: totalNewStock + totalReusableStock,
            activeAssignments,
            lowStockItems
        };
    }, [inventory, assignments]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
            </div>
        );
    }

    if (!currentUser || currentUser.role !== 'admin') {
        return (
            <div className="p-8">
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                        Acceso denegado. Esta página es solo para administradores.
                    </AlertDescription>
                </Alert>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                            <Shirt className="w-8 h-8 text-blue-600" />
                            Gestión de Uniformes
                        </h1>
                        <p className="text-slate-600 mt-1">
                            Control de inventario y asignaciones de camisas
                        </p>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card>
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-slate-600">Stock Total</p>
                                    <p className="text-3xl font-bold text-blue-600">{stats.totalStock}</p>
                                    <p className="text-xs text-slate-500 mt-1">
                                        {stats.totalNewStock} nuevas / {stats.totalReusableStock} reutilizables
                                    </p>
                                </div>
                                <Package className="w-10 h-10 text-blue-600 opacity-20" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-slate-600">Asignadas</p>
                                    <p className="text-3xl font-bold text-green-600">{stats.activeAssignments}</p>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Camisas en uso
                                    </p>
                                </div>
                                <Users className="w-10 h-10 text-green-600 opacity-20" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-slate-600">Stock Bajo</p>
                                    <p className="text-3xl font-bold text-orange-600">{stats.lowStockItems}</p>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Modelos por reponer
                                    </p>
                                </div>
                                <AlertTriangle className="w-10 h-10 text-orange-600 opacity-20" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-slate-600">Disponibles</p>
                                    <p className="text-3xl font-bold text-purple-600">
                                        {stats.totalStock - stats.activeAssignments}
                                    </p>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Para entregar
                                    </p>
                                </div>
                                <TrendingUp className="w-10 h-10 text-purple-600 opacity-20" />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="inventory" className="flex items-center gap-2">
                            <Package className="w-4 h-4" />
                            Inventario
                        </TabsTrigger>
                        <TabsTrigger value="assignments" className="flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            Asignaciones
                        </TabsTrigger>
                        <TabsTrigger value="alerts" className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4" />
                            Alertas y Próximas
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="inventory" className="mt-6">
                        <InventoryTab 
                            inventory={inventory}
                            onRefresh={loadData}
                            currentUser={currentUser}
                        />
                    </TabsContent>

                    <TabsContent value="assignments" className="mt-6">
                        <AssignmentsTab
                            assignments={assignments}
                            cleaners={cleaners}
                            inventory={inventory}
                            onRefresh={loadData}
                            currentUser={currentUser}
                        />
                    </TabsContent>

                    <TabsContent value="alerts" className="mt-6">
                        <AlertsTab
                            assignments={assignments}
                            cleaners={cleaners}
                            inventory={inventory}
                            onRefresh={loadData}
                            currentUser={currentUser}
                        />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}