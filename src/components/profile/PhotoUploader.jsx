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

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError("Por favor selecciona un archivo de imagen válido.");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError("La imagen no puede ser mayor a 5MB.");
      return;
    }

    setUploading(true);
    setError("");

    try {
      // Create preview
      const localPreviewUrl = URL.createObjectURL(file);
      setPreviewUrl(localPreviewUrl);

      const { file_url } = await UploadFile({ file });
      onUploadSuccess('profile_photo_url', file_url);
      setPreviewUrl(file_url);

      // Clean up local preview
      URL.revokeObjectURL(localPreviewUrl);
    } catch (err) {
      setError("Error al subir la foto. Inténtalo de nuevo.");
      console.error("Upload error:", err);
      setPreviewUrl(currentPhotoUrl); // Reset to original
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