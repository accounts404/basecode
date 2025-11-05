
import React, { useState } from "react";
import { ShirtInventory } from "@/entities/ShirtInventory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Edit, Package, AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

const MALE_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "XXXXL"]; // Added XXXXL
const FEMALE_SIZES = ["6", "8", "10", "12", "14", "16", "18", "20", "22", "24"];

export default function InventoryTab({ inventory, onRefresh, currentUser }) {
    const [addDialogOpen, setAddDialogOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [restockDialogOpen, setRestockDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); // New state for delete dialog
    const [selectedItem, setSelectedItem] = useState(null);
    const [loading, setLoading] = useState(false);

    const [newItem, setNewItem] = useState({
        model: "",
        gender: "male",
        size: "M",
        color: "",
        new_stock: 0,
        reusable_stock: 0,
        minimum_stock_threshold: 5,
        purchase_price: 0,
        notes: ""
    });

    const [restockData, setRestockData] = useState({
        quantity: 0,
        purchase_price: 0
    });

    const handleAddItem = async () => {
        setLoading(true);
        try {
            await ShirtInventory.create({
                ...newItem,
                last_restock_date: new Date().toISOString().split('T')[0]
            });
            setAddDialogOpen(false);
            setNewItem({
                model: "",
                gender: "male",
                size: "M",
                color: "",
                new_stock: 0,
                reusable_stock: 0,
                minimum_stock_threshold: 5,
                purchase_price: 0,
                notes: ""
            });
            onRefresh();
        } catch (error) {
            console.error('Error añadiendo item:', error);
            alert('Error al añadir el item al inventario');
        } finally {
            setLoading(false);
        }
    };

    const handleRestock = async () => {
        if (!selectedItem || restockData.quantity <= 0) return;
        
        setLoading(true);
        try {
            await ShirtInventory.update(selectedItem.id, {
                new_stock: (selectedItem.new_stock || 0) + parseInt(restockData.quantity),
                last_restock_date: new Date().toISOString().split('T')[0],
                purchase_price: restockData.purchase_price > 0 ? restockData.purchase_price : selectedItem.purchase_price
            });
            setRestockDialogOpen(false);
            setRestockData({ quantity: 0, purchase_price: 0 });
            setSelectedItem(null);
            onRefresh();
        } catch (error) {
            console.error('Error reponiendo stock:', error);
            alert('Error al reponer el stock');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateItem = async () => {
        if (!selectedItem) return;
        
        setLoading(true);
        try {
            await ShirtInventory.update(selectedItem.id, selectedItem);
            setEditDialogOpen(false);
            setSelectedItem(null);
            onRefresh();
        } catch (error) {
            console.error('Error actualizando item:', error);
            alert('Error al actualizar el item');
        } finally {
            setLoading(false);
        }
    };

    // New function to handle item deletion
    const handleDeleteItem = async () => {
        if (!selectedItem) return;
        
        setLoading(true);
        try {
            await ShirtInventory.delete(selectedItem.id);
            setDeleteDialogOpen(false);
            setSelectedItem(null);
            onRefresh();
        } catch (error) {
            console.error('Error eliminando item:', error);
            alert('Error al eliminar el item del inventario');
        } finally {
            setLoading(false);
        }
    };

    const getTotalStock = (item) => (item.new_stock || 0) + (item.reusable_stock || 0);

    const isLowStock = (item) => {
        const total = getTotalStock(item);
        return total < (item.minimum_stock_threshold || 5);
    };

    const getGenderLabel = (gender) => {
        return gender === 'male' ? 'Hombre' : 'Mujer';
    };

    const getAvailableSizes = (gender) => {
        return gender === 'male' ? MALE_SIZES : FEMALE_SIZES;
    };

    // Actualizar talla cuando cambia el género en el formulario de nuevo item
    const handleGenderChange = (gender) => {
        const defaultSize = gender === 'male' ? 'M' : '12';
        setNewItem({ ...newItem, gender, size: defaultSize });
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <Package className="w-5 h-5" />
                            Inventario de Camisas
                        </CardTitle>
                        <Button onClick={() => setAddDialogOpen(true)} className="gap-2">
                            <Plus className="w-4 h-4" />
                            Añadir Modelo
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Modelo</TableHead>
                                <TableHead>Género</TableHead>
                                <TableHead>Color</TableHead>
                                <TableHead>Talla</TableHead>
                                <TableHead>Stock Nuevo</TableHead>
                                <TableHead>Stock Reutilizable</TableHead>
                                <TableHead>Total</TableHead>
                                <TableHead>Mínimo</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead>Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {inventory.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan="10" className="text-center py-8 text-slate-500">
                                        No hay modelos de camisas en el inventario. Añade uno para comenzar.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                inventory.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell className="font-medium">{item.model}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={item.gender === 'male' ? 'bg-blue-50' : 'bg-pink-50'}>
                                                {getGenderLabel(item.gender)}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <div 
                                                    className="w-4 h-4 rounded-full border border-slate-300"
                                                    style={{ backgroundColor: item.color.toLowerCase() }}
                                                />
                                                {item.color}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{item.size}</Badge>
                                        </TableCell>
                                        <TableCell className="text-green-600 font-semibold">
                                            {item.new_stock || 0}
                                        </TableCell>
                                        <TableCell className="text-blue-600 font-semibold">
                                            {item.reusable_stock || 0}
                                        </TableCell>
                                        <TableCell className="font-bold">
                                            {getTotalStock(item)}
                                        </TableCell>
                                        <TableCell className="text-slate-600">
                                            {item.minimum_stock_threshold || 5}
                                        </TableCell>
                                        <TableCell>
                                            {isLowStock(item) ? (
                                                <Badge variant="destructive" className="gap-1">
                                                    <AlertTriangle className="w-3 h-3" />
                                                    Stock Bajo
                                                </Badge>
                                            ) : (
                                                <Badge variant="default" className="bg-green-600">
                                                    OK
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => {
                                                        setSelectedItem(item);
                                                        setRestockDialogOpen(true);
                                                    }}
                                                >
                                                    <Plus className="w-4 h-4 mr-1" />
                                                    Reponer
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => {
                                                        setSelectedItem(item);
                                                        setEditDialogOpen(true);
                                                    }}
                                                >
                                                    <Edit className="w-4 h-4" />
                                                </Button>
                                                {/* New Delete Button */}
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => {
                                                        setSelectedItem(item);
                                                        setDeleteDialogOpen(true);
                                                    }}
                                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Dialog para añadir nuevo modelo */}
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Añadir Nuevo Modelo de Camisa</DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Modelo</Label>
                            <Input
                                placeholder="Ej: Polo Azul Standard"
                                value={newItem.model}
                                onChange={(e) => setNewItem({...newItem, model: e.target.value})}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Género</Label>
                            <Select value={newItem.gender} onValueChange={handleGenderChange}>
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
                            <Input
                                placeholder="Ej: Azul, Negro"
                                value={newItem.color}
                                onChange={(e) => setNewItem({...newItem, color: e.target.value})}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Talla</Label>
                            <Select value={newItem.size} onValueChange={(value) => setNewItem({...newItem, size: value})}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {getAvailableSizes(newItem.gender).map(size => (
                                        <SelectItem key={size} value={size}>{size}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Stock Inicial (Nuevas)</Label>
                            <Input
                                type="number"
                                value={newItem.new_stock}
                                onChange={(e) => setNewItem({...newItem, new_stock: parseInt(e.target.value) || 0})}
                            />
                        </div>
                        {/* NEW: Stock Inicial (Reutilizables) */}
                        <div className="space-y-2">
                            <Label>Stock Inicial (Reutilizables)</Label>
                            <Input
                                type="number"
                                value={newItem.reusable_stock}
                                onChange={(e) => setNewItem({...newItem, reusable_stock: parseInt(e.target.value) || 0})}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Stock Mínimo de Alerta</Label>
                            <Input
                                type="number"
                                value={newItem.minimum_stock_threshold}
                                onChange={(e) => setNewItem({...newItem, minimum_stock_threshold: parseInt(e.target.value) || 5})}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Precio de Compra (opcional)</Label>
                            <Input
                                type="number"
                                step="0.01"
                                value={newItem.purchase_price}
                                onChange={(e) => setNewItem({...newItem, purchase_price: parseFloat(e.target.value) || 0})}
                            />
                        </div>
                        <div className="col-span-2 space-y-2">
                            <Label>Notas (opcional)</Label>
                            <Textarea
                                placeholder="Detalles sobre este modelo..."
                                value={newItem.notes}
                                onChange={(e) => setNewItem({...newItem, notes: e.target.value})}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                            Cancelar
                        </Button>
                        <Button onClick={handleAddItem} disabled={loading || !newItem.model || !newItem.color}>
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Añadir Modelo'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Dialog para reponer stock */}
            <Dialog open={restockDialogOpen} onOpenChange={setRestockDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Reponer Stock</DialogTitle>
                    </DialogHeader>
                    {selectedItem && (
                        <div className="space-y-4">
                            <div className="bg-slate-100 p-4 rounded-lg">
                                <p className="text-sm text-slate-600">Modelo</p>
                                <p className="font-semibold">{selectedItem.model} - {getGenderLabel(selectedItem.gender)} - {selectedItem.color} - {selectedItem.size}</p>
                                <p className="text-xs text-slate-500 mt-1">Stock actual: {selectedItem.new_stock} nuevas</p>
                            </div>
                            <div className="space-y-2">
                                <Label>Cantidad a Añadir</Label>
                                <Input
                                    type="number"
                                    min="1"
                                    value={restockData.quantity}
                                    onChange={(e) => setRestockData({...restockData, quantity: parseInt(e.target.value) || 0})}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Precio de Compra (opcional)</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={restockData.purchase_price}
                                    onChange={(e) => setRestockData({...restockData, purchase_price: parseFloat(e.target.value) || 0})}
                                />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => {
                            setRestockDialogOpen(false);
                            setRestockData({ quantity: 0, purchase_price: 0 });
                        }}>
                            Cancelar
                        </Button>
                        <Button onClick={handleRestock} disabled={loading || restockData.quantity <= 0}>
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reponer Stock'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Dialog para editar */}
            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Editar Modelo</DialogTitle>
                    </DialogHeader>
                    {selectedItem && (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Modelo</Label>
                                <Input
                                    value={selectedItem.model}
                                    onChange={(e) => setSelectedItem({...selectedItem, model: e.target.value})}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Género</Label>
                                <Select 
                                    value={selectedItem.gender} 
                                    onValueChange={(value) => setSelectedItem({...selectedItem, gender: value})}
                                >
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
                                <Input
                                    value={selectedItem.color}
                                    onChange={(e) => setSelectedItem({...selectedItem, color: e.target.value})}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Stock Mínimo</Label>
                                <Input
                                    type="number"
                                    value={selectedItem.minimum_stock_threshold}
                                    onChange={(e) => setSelectedItem({...selectedItem, minimum_stock_threshold: parseInt(e.target.value) || 5})}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Precio de Compra</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={selectedItem.purchase_price || 0}
                                    onChange={(e) => setSelectedItem({...selectedItem, purchase_price: parseFloat(e.target.value) || 0})}
                                />
                            </div>
                            <div className="col-span-2 space-y-2">
                                <Label>Notas</Label>
                                <Textarea
                                    value={selectedItem.notes || ""}
                                    onChange={(e) => setSelectedItem({...selectedItem, notes: e.target.value})}
                                />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                            Cancelar
                        </Button>
                        <Button onClick={handleUpdateItem} disabled={loading}>
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar Cambios'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Dialog para confirmar eliminación (NEW) */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Eliminar Modelo de Camisa</DialogTitle>
                        <DialogDescription>
                            ¿Estás seguro de que quieres eliminar este modelo del inventario?
                        </DialogDescription>
                    </DialogHeader>
                    {selectedItem && (
                        <div className="space-y-4">
                            <div className="bg-slate-100 p-4 rounded-lg">
                                <p className="text-sm text-slate-600">Modelo a Eliminar</p>
                                <p className="font-semibold">
                                    {selectedItem.model} - {getGenderLabel(selectedItem.gender)} - {selectedItem.color} - Talla {selectedItem.size}
                                </p>
                                <p className="text-xs text-slate-500 mt-2">
                                    Stock: {selectedItem.new_stock} nuevas + {selectedItem.reusable_stock} reutilizables = {getTotalStock(selectedItem)} total
                                </p>
                            </div>

                            <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertDescription>
                                    <strong>Advertencia:</strong> Esta acción no se puede deshacer. 
                                    Se recomienda asegurarse de que no haya camisas de este modelo actualmente asignadas a limpiadores antes de eliminarlo.
                                </AlertDescription>
                            </Alert>
                        </div>
                    )}
                    <DialogFooter>
                        <Button 
                            variant="outline" 
                            onClick={() => {
                                setDeleteDialogOpen(false);
                                setSelectedItem(null);
                            }}
                            disabled={loading}
                        >
                            Cancelar
                        </Button>
                        <Button 
                            variant="destructive"
                            onClick={handleDeleteItem}
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Eliminando...
                                </>
                            ) : (
                                <>
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Eliminar Modelo
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

