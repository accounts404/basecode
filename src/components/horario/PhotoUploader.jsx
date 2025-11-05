
import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { UploadFile } from '@/integrations/Core';
import { Upload, X, Loader2, MessageSquare, Image } from 'lucide-react';
import { Reorder } from "framer-motion"; // Added Reorder import

export default function PhotoUploader({ uploadedUrls = [], onUrlsChange }) {
    const [isUploading, setIsUploading] = useState(false);
    // Removed editingIndex and tempComment states as per the new comment handling approach
    const fileInputRef = useRef(null); // Added useRef for file input

    // Normalizar datos para manejar tanto formato legacy (string) como nuevo (objeto)
    const normalizePhotos = (photos) => {
        return photos.map(photo => {
            if (typeof photo === 'string') {
                return { url: photo, comment: '' };
            }
            return { url: photo.url || '', comment: photo.comment || '' };
        });
    };

    const normalizedPhotos = normalizePhotos(uploadedUrls);

    // New function to handle file input click using ref
    const handleUploadClick = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        } else {
            console.error("El input de archivo no está disponible.");
        }
    };

    const handleFileChange = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        setIsUploading(true);
        const currentPhotos = [...normalizedPhotos];

        for (const file of files) {
            try {
                const { file_url } = await UploadFile({ file });
                if (file_url) {
                    currentPhotos.push({ url: file_url, comment: '' });
                }
            } catch (error) {
                console.error('Error subiendo archivo:', error);
                alert('Error al subir la imagen. Inténtalo de nuevo.');
            }
        }

        onUrlsChange(currentPhotos);
        setIsUploading(false);
        e.target.value = ''; // Clear input value after selection
    };

    const handleRemovePhoto = (indexToRemove) => {
        const updatedPhotos = normalizedPhotos.filter((_, i) => i !== indexToRemove);
        onUrlsChange(updatedPhotos);
    };

    // New function to handle comment changes directly
    const handleCommentChange = (index, newComment) => {
        const updatedPhotos = [...normalizedPhotos];
        updatedPhotos[index] = { ...updatedPhotos[index], comment: newComment };
        onUrlsChange(updatedPhotos);
    };

    // New function for reordering, assumes 'newOrder' is the reordered array
    const handleReorder = (newOrder) => {
        // This function assumes the Reorder component from framer-motion is used
        // and provides the reordered array directly.
        // The current JSX does not use Reorder.Group/Reorder.Item, so this
        // function will not be actively triggered until those components are added.
        onUrlsChange(newOrder);
    };

    // Removed handleEditComment, handleSaveComment, handleCancelEdit as they are replaced by handleCommentChange

    return (
        <div className="space-y-4">
            {/* Botón de subida */}
            <div className="flex items-center gap-3">
                <Button
                    type="button"
                    variant="outline"
                    onClick={handleUploadClick} // Changed to use new handleUploadClick
                    disabled={isUploading}
                    className="hover:bg-blue-50 hover:border-blue-300"
                >
                    {isUploading ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Subiendo...
                        </>
                    ) : (
                        <>
                            <Upload className="w-4 h-4 mr-2" />
                            Subir Fotos
                        </>
                    )}
                </Button>
                <input
                    ref={fileInputRef} // Changed to use ref instead of dynamic id
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                />
                <span className="text-sm text-slate-500">
                    Puedes subir múltiples imágenes y añadir comentarios descriptivos
                </span>
            </div>

            {/* Grid de fotos */}
            {normalizedPhotos.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Note: To enable drag-and-drop reordering, this div and mapped items
                       would need to be wrapped with Reorder.Group and Reorder.Item from framer-motion.
                       The handleReorder function is provided but not actively used in JSX here. */}
                    {normalizedPhotos.map((photo, index) => (
                        <div key={index} className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
                            {/* Imagen */}
                            <div className="relative group mb-3">
                                <img
                                    src={photo.url}
                                    alt={photo.comment || `Foto ${index + 1}`}
                                    className="w-full h-32 object-cover rounded-lg shadow-sm"
                                />
                                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-200 rounded-lg flex items-center justify-center">
                                    <Button
                                        type="button"
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => handleRemovePhoto(index)}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>

                            {/* Comentario - now directly editable */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <MessageSquare className="w-4 h-4 text-slate-500" />
                                    <span className="text-sm font-medium text-slate-700">Comentario</span>
                                </div>

                                {/* Directly editable textarea for comment */}
                                <Textarea
                                    value={photo.comment}
                                    onChange={(e) => handleCommentChange(index, e.target.value)}
                                    placeholder="Ej: Ubicación de las llaves, área especial a limpiar, productos a usar..."
                                    rows={2}
                                    className="text-sm"
                                />
                                {/* Removed the edit/save/cancel buttons and conditional rendering as comment is always editable */}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {normalizedPhotos.length === 0 && (
                <div className="text-center py-8 px-4 border-2 border-dashed border-slate-300 rounded-lg bg-slate-50">
                    <Image className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">
                        No hay fotos subidas aún
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                        Las fotos con comentarios ayudan a los limpiadores a entender mejor las instrucciones
                    </p>
                </div>
            )}
        </div>
    );
}
