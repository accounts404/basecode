import React, { useState, useEffect } from "react";
import { ScoreCategory } from "@/entities/ScoreCategory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Save, X } from "lucide-react";

export default function CategorySelector({ 
    selectedCategory, 
    onCategoryChange, 
    adjustmentType,
    userId
}) {
    const [categories, setCategories] = useState([]);
    const [showNewCategoryDialog, setShowNewCategoryDialog] = useState(false);
    const [newCategoryData, setNewCategoryData] = useState({
        name: '',
        type: adjustmentType,
        suggested_points: '',
        description: ''
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadCategories();
    }, []);

    useEffect(() => {
        // Actualizar el tipo de la nueva categoría cuando cambia adjustmentType
        setNewCategoryData(prev => ({ ...prev, type: adjustmentType }));
    }, [adjustmentType]);

    const loadCategories = async () => {
        try {
            const allCategories = await ScoreCategory.filter({ active: true });
            setCategories(allCategories);
        } catch (error) {
            console.error('Error cargando categorías:', error);
            setCategories([]);
        }
    };

    const handleCreateCategory = async () => {
        if (!newCategoryData.name.trim()) {
            alert('Por favor ingresa un nombre para la categoría');
            return;
        }

        setLoading(true);
        try {
            const categoryData = {
                name: newCategoryData.name.trim(),
                type: newCategoryData.type,
                description: newCategoryData.description.trim(),
                created_by: userId,
                active: true
            };

            if (newCategoryData.suggested_points && !isNaN(parseInt(newCategoryData.suggested_points))) {
                categoryData.suggested_points = parseInt(newCategoryData.suggested_points);
            }

            const newCategory = await ScoreCategory.create(categoryData);
            
            // Actualizar la lista de categorías
            await loadCategories();
            
            // Seleccionar automáticamente la nueva categoría
            onCategoryChange(newCategory.name);
            
            // Resetear y cerrar el formulario
            setNewCategoryData({
                name: '',
                type: adjustmentType,
                suggested_points: '',
                description: ''
            });
            setShowNewCategoryDialog(false);
        } catch (error) {
            console.error('Error creando categoría:', error);
            alert('Error al crear la categoría: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const filteredCategories = categories.filter(cat => 
        cat.type === 'both' || cat.type === adjustmentType
    );

    return (
        <div className="space-y-2">
            <Label>Categoría *</Label>
            <div className="flex gap-2">
                <Select
                    value={selectedCategory}
                    onValueChange={onCategoryChange}
                    className="flex-1"
                >
                    <SelectTrigger>
                        <SelectValue placeholder="Selecciona una categoría" />
                    </SelectTrigger>
                    <SelectContent>
                        {filteredCategories.map((category) => (
                            <SelectItem key={category.id} value={category.name}>
                                {category.name}
                                {category.suggested_points && (
                                    <span className="text-sm text-gray-500 ml-2">
                                        ({category.suggested_points} pts)
                                    </span>
                                )}
                            </SelectItem>
                        ))}
                        {filteredCategories.length === 0 && (
                            <SelectItem value={null} disabled>
                                No hay categorías disponibles
                            </SelectItem>
                        )}
                    </SelectContent>
                </Select>
                
                <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowNewCategoryDialog(true)}
                    title="Agregar nueva categoría"
                >
                    <Plus className="w-4 h-4" />
                </Button>
            </div>

            {/* Dialog para crear nueva categoría */}
            <Dialog open={showNewCategoryDialog} onOpenChange={setShowNewCategoryDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            Crear Nueva Categoría {adjustmentType === 'deduction' ? '(Deducción)' : '(Bonificación)'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label>Nombre de la Categoría *</Label>
                            <Input
                                value={newCategoryData.name}
                                onChange={(e) => setNewCategoryData(prev => ({ ...prev, name: e.target.value }))}
                                placeholder="Ej: Uniforme Incompleto, Cliente Satisfecho"
                                className="mt-1"
                            />
                        </div>

                        <div>
                            <Label>Puntos Sugeridos (Opcional)</Label>
                            <Input
                                type="number"
                                value={newCategoryData.suggested_points}
                                onChange={(e) => setNewCategoryData(prev => ({ ...prev, suggested_points: e.target.value }))}
                                placeholder="Ej: 5, 10, 15"
                                className="mt-1"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Los puntos sugeridos aparecerán como referencia al usar esta categoría
                            </p>
                        </div>

                        <div>
                            <Label>Descripción (Opcional)</Label>
                            <Textarea
                                value={newCategoryData.description}
                                onChange={(e) => setNewCategoryData(prev => ({ ...prev, description: e.target.value }))}
                                placeholder="Describe cuándo usar esta categoría..."
                                rows={3}
                                className="mt-1"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                        <Button
                            variant="outline"
                            onClick={() => {
                                setShowNewCategoryDialog(false);
                                setNewCategoryData({
                                    name: '',
                                    type: adjustmentType,
                                    suggested_points: '',
                                    description: ''
                                });
                            }}
                            disabled={loading}
                        >
                            <X className="w-4 h-4 mr-2" />
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleCreateCategory}
                            disabled={loading || !newCategoryData.name.trim()}
                        >
                            {loading ? (
                                <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                                    Guardando...
                                </>
                            ) : (
                                <>
                                    <Save className="w-4 h-4 mr-2" />
                                    Crear Categoría
                                </>
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}