
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import PhotoUploader from '../horario/PhotoUploader';
import { 
    Sparkles, 
    ChefHat, 
    Bath, 
    Shirt, 
    Home, 
    MoreHorizontal, 
    FileText,
    Camera,
    Info
} from 'lucide-react';

const CLEANING_AREAS = [
    {
        key: 'dusting_wiping_tidyup',
        name: 'Dusting / Wiping / Tidy Up',
        icon: <Sparkles className="w-5 h-5" />,
        color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
        description: 'Quitar el polvo, limpiar superficies y ordenar'
    },
    {
        key: 'kitchen_and_pantry',
        name: 'Kitchen and Pantry',
        icon: <ChefHat className="w-5 h-5" />,
        color: 'bg-orange-100 text-orange-800 border-orange-200',
        description: 'Cocina, despensa y áreas de preparación de alimentos'
    },
    {
        key: 'bathrooms',
        name: 'Bathrooms',
        icon: <Bath className="w-5 h-5" />,
        color: 'bg-blue-100 text-blue-800 border-blue-200',
        description: 'Baños, duchas, toilettes'
    },
    {
        key: 'laundry',
        name: 'Laundry',
        icon: <Shirt className="w-5 h-5" />,
        color: 'bg-purple-100 text-purple-800 border-purple-200',
        description: 'Área de lavado, lavandería'
    },
    {
        key: 'floors',
        name: 'Floors',
        icon: <Home className="w-5 h-5" />,
        color: 'bg-green-100 text-green-800 border-green-200',
        description: 'Suelos, pisos, alfombras'
    },
    {
        key: 'other_areas',
        name: 'Otras',
        icon: <MoreHorizontal className="w-5 h-5" />,
        color: 'bg-gray-100 text-gray-800 border-gray-200',
        description: 'Otras áreas no especificadas'
    }
];

export default function StructuredServiceNotes({ 
    structuredNotes = {}, 
    onUpdate,
    isReadOnly = false 
}) {
    // Initialize structured notes with empty objects if they don't exist
    const normalizedNotes = CLEANING_AREAS.reduce((acc, area) => {
        acc[area.key] = structuredNotes[area.key] || { notes: '', photos: [] };
        return acc;
    }, {});

    const [activeTab, setActiveTab] = useState(CLEANING_AREAS[0].key);

    const updateAreaNotes = (areaKey, notes) => {
        const updated = {
            ...normalizedNotes,
            [areaKey]: {
                ...normalizedNotes[areaKey],
                notes: notes
            }
        };
        onUpdate(updated);
    };

    const updateAreaPhotos = (areaKey, photos) => {
        const updated = {
            ...normalizedNotes,
            [areaKey]: {
                ...normalizedNotes[areaKey],
                photos: photos
            }
        };
        onUpdate(updated);
    };

    // Count areas with content for summary
    const areasWithContent = CLEANING_AREAS.filter(area => 
        normalizedNotes[area.key]?.notes?.trim() || 
        normalizedNotes[area.key]?.photos?.length > 0
    );

    if (isReadOnly && areasWithContent.length === 0) {
        return (
            <div className="text-center py-8 text-slate-500">
                <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p>No hay notas estructuradas por áreas configuradas para este cliente.</p>
            </div>
        );
    }

    if (isReadOnly) {
        return (
            <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                    <Info className="w-5 h-5 text-blue-600" />
                    <span className="font-semibold text-slate-900">
                        Instrucciones por Área ({areasWithContent.length} configuradas)
                    </span>
                </div>

                {areasWithContent.map(area => {
                    const areaData = normalizedNotes[area.key];
                    if (!areaData?.notes?.trim() && (!areaData?.photos || areaData.photos.length === 0)) {
                        return null;
                    }

                    return (
                        <Card key={area.key} className={`border ${area.color.split(' ')[2]}`}>
                            <CardHeader className="pb-3">
                                <CardTitle className="flex items-center gap-2 text-base">
                                    {area.icon}
                                    <span>{area.name}</span>
                                    <Badge variant="outline" className={area.color}>
                                        {areaData.notes?.trim() ? 'Con notas' : ''}
                                        {areaData.notes?.trim() && areaData.photos?.length > 0 ? ' • ' : ''}
                                        {areaData.photos?.length > 0 ? `${areaData.photos.length} foto${areaData.photos.length > 1 ? 's' : ''}` : ''}
                                    </Badge>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {areaData.notes?.trim() && (
                                    <div className="mb-4">
                                        <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 p-3 rounded-lg">
                                            {areaData.notes}
                                        </p>
                                    </div>
                                )}
                                
                                {areaData.photos && areaData.photos.length > 0 && (
                                    <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                        {areaData.photos.map((photo, pIndex) => (
                                            <div key={pIndex} className="flex flex-col gap-2">
                                                <a 
                                                    href={photo.url} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="block rounded-lg overflow-hidden border border-slate-200 hover:shadow-lg transition-shadow"
                                                >
                                                    <img
                                                        src={photo.url}
                                                        alt={photo.comment || `Foto ${pIndex + 1} de ${area.name}`}
                                                        className="w-full h-auto object-cover aspect-square"
                                                    />
                                                </a>
                                                {photo.comment && (
                                                    <p className="text-sm text-slate-800 bg-slate-100 p-2 rounded-md">
                                                        {photo.comment}
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-5 h-5 text-blue-600" />
                    <h3 className="font-semibold text-blue-900">Notas Estructuradas por Áreas de Limpieza</h3>
                </div>
                <p className="text-sm text-blue-700">
                    Configura instrucciones específicas para cada área. Estas notas se aplicarán automáticamente a todos los servicios nuevos de este cliente.
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                    {CLEANING_AREAS.map(area => {
                        const hasContent = normalizedNotes[area.key]?.notes?.trim() || normalizedNotes[area.key]?.photos?.length > 0;
                        return (
                            <Badge key={area.key} variant={hasContent ? "default" : "outline"} className={hasContent ? area.color : ''}>
                                {area.name} {hasContent && '✓'}
                            </Badge>
                        );
                    })}
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6">
                    {CLEANING_AREAS.map(area => (
                        <TabsTrigger 
                            key={area.key} 
                            value={area.key}
                            className="flex items-center gap-1 text-xs"
                        >
                            {area.icon}
                            <span className="hidden sm:inline">{area.name.split(' ')[0]}</span>
                        </TabsTrigger>
                    ))}
                </TabsList>

                {CLEANING_AREAS.map(area => (
                    <TabsContent key={area.key} value={area.key} className="space-y-6 mt-6">
                        <Card className={`border-2 ${area.color.split(' ')[2]}`}>
                            <CardHeader className={`${area.color} border-b`}>
                                <CardTitle className="flex items-center gap-3">
                                    {area.icon}
                                    <div>
                                        <div className="text-lg">{area.name}</div>
                                        <div className="text-sm font-normal opacity-80">{area.description}</div>
                                    </div>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-6">
                                <div className="space-y-6">
                                    {/* Notes Section */}
                                    <div className="space-y-2">
                                        <Label className="text-base font-semibold flex items-center gap-2">
                                            <FileText className="w-4 h-4" />
                                            Instrucciones para {area.name}
                                        </Label>
                                        <Textarea
                                            value={normalizedNotes[area.key]?.notes || ''}
                                            onChange={(e) => updateAreaNotes(area.key, e.target.value)}
                                            placeholder={`Ej: Para ${area.name.toLowerCase()}: usar productos específicos, evitar ciertas áreas, prestar atención especial a...`}
                                            rows={4}
                                            className="min-h-[100px]"
                                        />
                                    </div>

                                    {/* Photos Section */}
                                    <div className="space-y-2">
                                        <Label className="text-base font-semibold flex items-center gap-2">
                                            <Camera className="w-4 h-4" />
                                            Fotos de Referencia para {area.name}
                                        </Label>
                                        <PhotoUploader
                                            uploadedUrls={normalizedNotes[area.key]?.photos || []}
                                            onUrlsChange={(photos) => updateAreaPhotos(area.key, photos)}
                                        />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    );
}
