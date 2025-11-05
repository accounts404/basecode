import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, X, Users, Phone } from 'lucide-react';

export default function FamilyAndPetsManager({ client, onUpdate, isReadOnly = false }) {
    const [pets, setPets] = useState(client?.pets || []);
    const [familyDetails, setFamilyDetails] = useState(client?.family_details || {
        spouse_name: '',
        children: [],
        family_notes: '',
        emergency_contact: ''
    });

    const [newChildName, setNewChildName] = useState('');
    const [newPetName, setNewPetName] = useState('');
    const [newPetType, setNewPetType] = useState('perro');

    const addChild = (e) => {
        e.preventDefault();
        if (!newChildName.trim()) {
            alert('Por favor ingresa el nombre del niño/niña');
            return;
        }

        const updatedChildren = [...(familyDetails.children || []), newChildName.trim()];
        const updatedFamilyDetails = { ...familyDetails, children: updatedChildren };
        setFamilyDetails(updatedFamilyDetails);
        onUpdate({ family_details: updatedFamilyDetails });
        setNewChildName('');
    };

    const removeChild = (e, index) => {
        e.preventDefault();
        const updatedChildren = familyDetails.children.filter((_, i) => i !== index);
        const updatedFamilyDetails = { ...familyDetails, children: updatedChildren };
        setFamilyDetails(updatedFamilyDetails);
        onUpdate({ family_details: updatedFamilyDetails });
    };

    const addPet = (e) => {
        e.preventDefault();
        if (!newPetName.trim() || !newPetType.trim()) {
            alert('Por favor ingresa el nombre y tipo de mascota');
            return;
        }

        const updatedPets = [...pets, { 
            name: newPetName.trim(), 
            type: newPetType 
        }];
        setPets(updatedPets);
        onUpdate({ pets: updatedPets });
        
        setNewPetName('');
        setNewPetType('perro');
    };

    const removePet = (e, index) => {
        e.preventDefault();
        const updatedPets = pets.filter((_, i) => i !== index);
        setPets(updatedPets);
        onUpdate({ pets: updatedPets });
    };

    const updateFamilyField = (field, value) => {
        const updatedFamilyDetails = { ...familyDetails, [field]: value };
        setFamilyDetails(updatedFamilyDetails);
        onUpdate({ family_details: updatedFamilyDetails });
    };

    if (isReadOnly) {
        return (
            <Card className="border-blue-200 bg-blue-50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-blue-800">
                        <Users className="w-5 h-5" />
                        Información Familiar
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="bg-white p-4 rounded-lg border border-blue-200">
                        {familyDetails.spouse_name && (
                            <div className="mb-3">
                                <span className="text-sm font-medium text-slate-600">Cónyuge/Pareja:</span>
                                <span className="ml-2 font-semibold text-slate-900">{familyDetails.spouse_name}</span>
                            </div>
                        )}
                        
                        {familyDetails.children && familyDetails.children.length > 0 && (
                            <div className="mb-3">
                                <span className="text-sm font-medium text-slate-600">Hijos:</span>
                                <div className="flex flex-wrap gap-2 mt-1">
                                    {familyDetails.children.map((child, index) => (
                                        <Badge key={index} className="bg-blue-100 text-blue-800">
                                            👶 {child}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        )}

                        {pets && pets.length > 0 && (
                            <div className="mb-3">
                                <span className="text-sm font-medium text-slate-600">Mascotas:</span>
                                <div className="flex flex-wrap gap-2 mt-1">
                                    {pets.map((pet, index) => (
                                        <Badge key={index} className="bg-green-100 text-green-800">
                                            {pet.type === 'perro' ? '🐕' : pet.type === 'gato' ? '🐱' : '🐾'} {pet.name}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        )}
                        
                        {familyDetails.emergency_contact && (
                            <div className="mb-3">
                                <span className="text-sm font-medium text-slate-600 flex items-center gap-1">
                                    <Phone className="w-4 h-4" />
                                    Contacto de Emergencia:
                                </span>
                                <span className="ml-2 font-semibold text-slate-900">{familyDetails.emergency_contact}</span>
                            </div>
                        )}
                        
                        {familyDetails.family_notes && (
                            <div className="mt-3 pt-3 border-t border-slate-200">
                                <span className="text-sm font-medium text-slate-600">Notas Familiares:</span>
                                <p className="mt-1 text-sm text-slate-700 bg-slate-50 p-2 rounded border-l-4 border-blue-300">
                                    {familyDetails.family_notes}
                                </p>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-600" />
                    Información Familiar
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <Label>Cónyuge/Pareja</Label>
                        <Input
                            value={familyDetails.spouse_name}
                            onChange={(e) => updateFamilyField('spouse_name', e.target.value)}
                            placeholder="Nombre del cónyuge/pareja"
                        />
                    </div>
                    <div>
                        <Label>Contacto de Emergencia</Label>
                        <Input
                            value={familyDetails.emergency_contact}
                            onChange={(e) => updateFamilyField('emergency_contact', e.target.value)}
                            placeholder="Nombre y teléfono de emergencia"
                        />
                    </div>
                </div>

                {/* Children */}
                <div>
                    <Label>Hijos</Label>
                    <div className="space-y-2 mt-2">
                        {familyDetails.children && familyDetails.children.map((child, index) => (
                            <div key={index} className="flex items-center gap-2 bg-blue-50 p-2 rounded">
                                <Badge className="bg-blue-100 text-blue-800">👶 {child}</Badge>
                                <Button 
                                    type="button"
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={(e) => removeChild(e, index)}
                                >
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>
                        ))}
                        <div className="flex gap-2">
                            <Input
                                value={newChildName}
                                onChange={(e) => setNewChildName(e.target.value)}
                                placeholder="Nombre del niño/niña"
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        addChild(e);
                                    }
                                }}
                            />
                            <Button 
                                type="button"
                                onClick={addChild}
                                variant="outline"
                            >
                                <Plus className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Pets - Simplified */}
                <div>
                    <Label>Mascotas</Label>
                    <div className="space-y-2 mt-2">
                        {pets.map((pet, index) => (
                            <div key={index} className="flex items-center gap-2 bg-green-50 p-2 rounded">
                                <Badge className="bg-green-100 text-green-800">
                                    {pet.type === 'perro' ? '🐕' : pet.type === 'gato' ? '🐱' : '🐾'} {pet.name}
                                </Badge>
                                <Button 
                                    type="button"
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={(e) => removePet(e, index)}
                                >
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>
                        ))}
                        <div className="flex gap-2">
                            <Input
                                value={newPetName}
                                onChange={(e) => setNewPetName(e.target.value)}
                                placeholder="Nombre de la mascota"
                                className="flex-1"
                            />
                            <Select value={newPetType} onValueChange={setNewPetType}>
                                <SelectTrigger className="w-32">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="perro">🐕 Perro</SelectItem>
                                    <SelectItem value="gato">🐱 Gato</SelectItem>
                                    <SelectItem value="otros">🐾 Otros</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button 
                                type="button"
                                onClick={addPet}
                                variant="outline"
                            >
                                <Plus className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </div>

                <div>
                    <Label>Notas Familiares</Label>
                    <Textarea
                        value={familyDetails.family_notes}
                        onChange={(e) => updateFamilyField('family_notes', e.target.value)}
                        placeholder="Horarios especiales, preferencias familiares, información adicional..."
                        rows={3}
                    />
                </div>
            </CardContent>
        </Card>
    );
}