import React, { useState, useRef } from "react";
import { UploadFile } from "@/integrations/Core";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, AlertCircle, Camera, Loader2, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function PhotoUploader({ currentPhotoUrl, onUploadSuccess, userName }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(currentPhotoUrl);

  const compressImage = (file) => {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/')) { resolve(file); return; }
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onerror = () => resolve(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onerror = () => resolve(file);
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1280;
          const MAX_HEIGHT = 1280;
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
          } else {
            if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            if (!blob) { resolve(file); return; }
            resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
          }, 'image/jpeg', 0.7);
        };
      };
    });
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError("Por favor selecciona un archivo de imagen válido.");
      return;
    }

    setUploading(true);
    setError("");

    try {
      const localPreviewUrl = URL.createObjectURL(file);
      setPreviewUrl(localPreviewUrl);

      const compressedFile = await compressImage(file);
      const { file_url } = await UploadFile({ file: compressedFile });
      onUploadSuccess('profile_photo_url', file_url);
      setPreviewUrl(file_url);

      URL.revokeObjectURL(localPreviewUrl);
    } catch (err) {
      setError("Error al subir la foto. Inténtalo de nuevo.");
      console.error("Upload error:", err);
      setPreviewUrl(currentPhotoUrl);
    } finally {
      setUploading(false);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current.click();
  };

  return (
    <div className="flex flex-col items-center space-y-4">
      <div className="relative">
        <Avatar className="w-32 h-32 border-4 border-slate-200">
          <AvatarImage src={previewUrl} alt={userName} />
          <AvatarFallback className="bg-gradient-to-r from-blue-600 to-blue-700 text-white text-3xl font-semibold">
            {userName?.charAt(0)?.toUpperCase() || 'U'}
          </AvatarFallback>
        </Avatar>
        {uploading && (
          <div className="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          </div>
        )}
      </div>

      <div className="text-center">
        <Button onClick={triggerFileSelect} disabled={uploading} variant="outline">
          <Camera className="w-4 h-4 mr-2" />
          {uploading ? "Subiendo..." : previewUrl ? "Cambiar Foto" : "Subir Foto"}
        </Button>
        <p className="text-xs text-slate-500 mt-2">
          JPG, PNG o GIF. Máximo 5MB.
        </p>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept="image/*"
      />
      
      {error && (
        <Alert variant="destructive" className="w-full max-w-sm">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription className="text-sm">{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}