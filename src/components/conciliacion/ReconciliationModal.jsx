import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Trash2, PlusCircle, DollarSign, List, Info, FileSignature, CheckCircle } from 'lucide-react';

const itemTypes = {
    base_service: 'Servicio Base',
    windows_cleaning: 'Limpieza de Ventanas',
    steam_vacuum: 'Limpieza a Vapor',
    spring_cleaning: 'Spring Cleaning',
    vacancy_cleaning: 'Vacancy Cleaning',
    oven_cleaning: 'Limpieza de Horno',
    fridge_cleaning: 'Limpieza de Nevera',
    first_cleaning: 'Primera Limpieza',
    one_off_service: 'One Off Service',
    other_extra: 'Otro Extra',
    discount: 'Descuento'
};

const paymentMethodLabels = {
    bank_transfer: "Transferencia Bancaria",
    cash: "Efectivo (Cash)",
    credit_card: "Tarjeta de Crédito",
    gocardless: "GoCardless",
    stripe: "Stripe",
    other: "Otro"
};

export default function ReconciliationModal({ service, client, onSave, onCancel, userRole, isReadOnly = false }) {
    const [items, setItems] = useState([]);
    const [paymentMethod, setPaymentMethod] = useState('');
    const [gstType, setGstType] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (service && client) {
            // Si el servicio ya tiene items de conciliación, los usamos.
            if (service.reconciliation_items && service.reconciliation_items.length > 0) {
                setItems(service.reconciliation_items);
            } else {
                // Si no, creamos el item base con el precio recurrente del cliente.
                setItems([{
                    type: 'base_service',
                    description: 'Servicio recurrente',
                    amount: client.current_service_price || 0
                }]);
            }
            
            // Inicializar payment_method: usar snapshot si existe, sino usar el actual del cliente
            if (service.billed_payment_method_snapshot) {
                setPaymentMethod(service.billed_payment_method_snapshot);
            } else {
                setPaymentMethod(client.payment_method || 'bank_transfer');
            }
            
            // Inicializar gst_type: usar snapshot si existe, sino usar el actual del cliente
            if (service.billed_gst_type_snapshot) {
                setGstType(service.billed_gst_type_snapshot);
            } else {
                setGstType(client.gst_type || 'inclusive');
            }
        }
    }, [service, client]);

    const totalAmount = useMemo(() => {
        return items.reduce((total, item) => {
            const amount = parseFloat(item.amount) || 0;
            return item.type === 'discount' ? total - amount : total + amount;
        }, 0);
    }, [items]);

    const handleItemChange = (index, field, value) => {
        // If the modal is read-only, prevent any changes
        if (isReadOnly) return;

        const newItems = [...items];
        newItems[index][field] = value;
        // Si el valor es numérico (monto), nos aseguramos de que sea un número
        if (field === 'amount') {
            newItems[index][field] = parseFloat(value) || 0;
        }
        setItems(newItems);
    };

    const addItem = () => {
        // If the modal is read-only, prevent adding items
        if (isReadOnly) return;
        setItems([...items, { type: 'other_extra', description: '', amount: 0 }]);
    };

    const removeItem = (index) => {
        // If the modal is read-only, prevent removing items
        if (isReadOnly) return;

        if (items.length > 1) { // No permitir eliminar el último item
            const newItems = items.filter((_, i) => i !== index);
            setItems(newItems);
        } else {
            alert("No se puede eliminar la línea de servicio base. Puede editar su monto.");
        }
    };

    const handleSave = async () => {
        // If the modal is read-only, prevent saving
        if (isReadOnly) return;

        setIsLoading(true);
        await onSave(service.id, items, paymentMethod, gstType);
        setIsLoading(false);
    };
    
    // The previous const isReadOnly = userRole !== 'admin'; is now controlled by the prop.

    if (!service || !client) return null;

    const hasSpecialBillingInstructions = client.has_special_billing_instructions && client.special_billing_instructions;

    return (
        <Dialog open={true} onOpenChange={onCancel}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-3">
                        {isReadOnly ? 'Ver Detalles del Servicio' : 'Conciliar Servicio'} - {client.name}
                        {hasSpecialBillingInstructions && (
                            <FileSignature className="w-5 h-5 text-orange-500" />
                        )}
                    </DialogTitle>
                    <DialogDescription>
                        {isReadOnly 
                            ? 'Este servicio ya ha sido facturado y no puede ser modificado.'
                            : 'Ajusta los montos a facturar para este servicio. Agrega extras o descuentos según sea necesario.'
                        }
                    </DialogDescription>
                </DialogHeader>
                
                <div className="py-4 space-y-6 max-h-[60vh] overflow-y-auto px-2">
                    {/* Special Billing Instructions Alert */}
                    {hasSpecialBillingInstructions && (
                        <div className="bg-orange-50 border-l-4 border-orange-400 p-4 rounded-r-lg">
                            <div className="flex items-center gap-2 mb-3">
                                <FileSignature className="w-5 h-5 text-orange-600" />
                                <h4 className="font-bold text-orange-900">⚠️ INSTRUCCIONES ESPECIALES DE FACTURACIÓN</h4>
                            </div>
                            <div 
                                className="bg-white p-3 rounded border border-orange-300 text-orange-800 font-medium cursor-text select-all"
                                style={{ userSelect: 'all' }}
                                title="Haz clic para seleccionar todo el texto y copiarlo"
                            >
                                {client.special_billing_instructions}
                            </div>
                            <p className="text-xs text-orange-600 mt-2 italic">
                                💡 Haz clic en el texto de arriba para seleccionar y copiar las instrucciones especiales
                            </p>
                        </div>
                    )}

                    <div className="bg-slate-50 p-4 rounded-lg border space-y-2">
                        <h3 className="font-semibold text-slate-800 mb-2 flex items-center gap-2"><Info className="w-5 h-5 text-blue-500" /> Información Original</h3>
                        <p className="text-sm">Precio recurrente del cliente: <span className="font-bold">${(client.current_service_price || 0).toFixed(2)} AUD</span></p>
                        
                        <div className="pt-3 border-t space-y-3">
                            <div>
                                <Label className="text-sm font-medium text-slate-700">Método de Pago</Label>
                                <Select
                                    value={paymentMethod}
                                    onValueChange={setPaymentMethod}
                                    disabled={isReadOnly}
                                >
                                    <SelectTrigger className="mt-1">
                                        <SelectValue placeholder="Seleccionar método de pago" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(paymentMethodLabels).map(([value, label]) => (
                                            <SelectItem key={value} value={value}>{label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {service.billed_payment_method_snapshot && (
                                    <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                                        <CheckCircle className="w-3 h-3" />
                                        Método de pago facturado
                                    </p>
                                )}
                            </div>
                            
                            <div>
                                <Label className="text-sm font-medium text-slate-700">Tipo de GST</Label>
                                <Select
                                    value={gstType}
                                    onValueChange={setGstType}
                                    disabled={isReadOnly}
                                >
                                    <SelectTrigger className="mt-1">
                                        <SelectValue placeholder="Seleccionar tipo de GST" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="inclusive">GST Incluido</SelectItem>
                                        <SelectItem value="exclusive">GST Exclusivo</SelectItem>
                                        <SelectItem value="no_tax">Sin Impuestos</SelectItem>
                                    </SelectContent>
                                </Select>
                                {service.billed_gst_type_snapshot && (
                                    <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                                        <CheckCircle className="w-3 h-3" />
                                        Tipo de GST facturado
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="font-semibold text-slate-800 flex items-center gap-2"><List className="w-5 h-5 text-blue-500" /> Líneas de Facturación</h3>
                        {items.map((item, index) => (
                            <div key={index} className="grid grid-cols-12 gap-2 items-end bg-white p-3 rounded-lg border">
                                <div className="col-span-12 md:col-span-4">
                                    <Label>Tipo</Label>
                                    <Select
                                        value={item.type}
                                        onValueChange={(value) => handleItemChange(index, 'type', value)}
                                        disabled={isReadOnly}
                                    >
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {Object.entries(itemTypes).map(([key, value]) => (
                                                <SelectItem key={key} value={key}>{value}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="col-span-12 md:col-span-5">
                                    <Label>Descripción</Label>
                                    <Input
                                        value={item.description}
                                        onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                                        placeholder="Detalles del cargo o descuento"
                                        readOnly={isReadOnly}
                                    />
                                </div>
                                <div className="col-span-10 md:col-span-2">
                                    <Label>Monto (AUD)</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={item.amount}
                                        onChange={(e) => handleItemChange(index, 'amount', e.target.value)}
                                        readOnly={isReadOnly}
                                        className={item.type === 'discount' ? 'text-red-600 font-semibold' : ''}
                                    />
                                </div>
                                <div className="col-span-2 md:col-span-1">
                                    {!isReadOnly && (
                                    <Button
                                        variant="destructive"
                                        size="icon"
                                        onClick={() => removeItem(index)}
                                        disabled={items.length <= 1}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                    {!isReadOnly && (
                    <Button variant="outline" onClick={addItem} className="w-full">
                        <PlusCircle className="w-4 h-4 mr-2" />
                        Añadir Otra Línea (Extra / Descuento)
                    </Button>
                    )}
                </div>

                <DialogFooter className="border-t pt-4">
                    <div className="w-full flex justify-between items-center">
                        <div className="text-lg font-bold flex items-center gap-2">
                            <DollarSign className="w-6 h-6 text-green-600" />
                            Total a Facturar:
                            <span className="text-green-700">${totalAmount.toFixed(2)} AUD</span>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={onCancel}>Cerrar</Button>
                            {!isReadOnly && (
                            <Button onClick={handleSave} disabled={isLoading}>
                                {isLoading ? 'Guardando...' : 'Guardar Cambios'}
                            </Button>
                            )}
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}