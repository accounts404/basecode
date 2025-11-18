import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { clearAllFlags } from "@/components/utils/activeServiceManager";
import {
  Calendar,
  Clock,
  User,
  LogOut,
  Activity,
  Trophy,
  FileText,
  DollarSign
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export default function CleanerMobileLayout({ children, user, hasActiveService, isScoringParticipant }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    
    setIsLoggingOut(true);
    console.log('[CleanerMobileLayout] 🚪 Iniciando cierre de sesión...');
    
    try {
      // Paso 1: Limpiar flags de servicio activo
      console.log('[CleanerMobileLayout] 🧹 Limpiando flags de servicio activo...');
      clearAllFlags();
      
      // Paso 2: Limpiar TODO el localStorage
      console.log('[CleanerMobileLayout] 🧹 Limpiando localStorage...');
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        console.log(`[CleanerMobileLayout] 🗑️ Eliminando: ${key}`);
        localStorage.removeItem(key);
      });
      
      // Paso 3: Limpiar sessionStorage también
      console.log('[CleanerMobileLayout] 🧹 Limpiando sessionStorage...');
      sessionStorage.clear();
      
      // Paso 4: Llamar al logout del SDK (esto debería limpiar cookies/tokens)
      console.log('[CleanerMobileLayout] 📤 Llamando a base44.auth.logout()...');
      await base44.auth.logout();
      
      console.log('[CleanerMobileLayout] ✅ Logout exitoso');
      
      // Paso 5: Esperar un momento para asegurar que todo se limpió
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error('[CleanerMobileLayout] ❌ Error al cerrar sesión:', error);
    } finally {
      // Paso 6: Forzar recarga completa de la página
      console.log('[CleanerMobileLayout] 🔄 Forzando recarga completa...');
      
      // Usar replace para evitar que el usuario pueda volver atrás
      window.location.replace(window.location.origin);
    }
  };

  // Determinar qué elementos de navegación mostrar
  const navigationItems = [
    {
      title: "Horario",
      url: createPageUrl("Horario"),
      icon: Calendar,
      show: true
    },
    {
      title: "Servicio Activo",
      url: createPageUrl("ServicioActivo"),
      icon: Activity,
      show: hasActiveService,
      isActive: true
    },
    {
      title: "Mis Horas",
      url: createPageUrl("MisHoras"),
      icon: Clock,
      show: true
    },
    {
      title: "Mis Pagos",
      url: createPageUrl("MisFacturas"),
      icon: DollarSign,
      show: user?.active !== false
    },
    {
      title: "Registrar",
      url: createPageUrl("RegistrarTrabajo"),
      icon: FileText,
      show: user?.active !== false
    },
    {
      title: "Puntuación",
      url: createPageUrl("MiPuntuacion"),
      icon: Trophy,
      show: isScoringParticipant
    },
    {
      title: "Perfil",
      url: createPageUrl("MiPerfil"),
      icon: User,
      show: true
    }
  ].filter(item => item.show);

  const isCurrentPage = (url) => location.pathname === url;

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Header móvil simple */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 flex items-center justify-center">
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/4c3ba79c6_RedOakLogo.png"
              alt="RedOak"
              className="max-w-full max-h-full object-contain"
            />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900">RedOak</h1>
            <p className="text-xs text-slate-600">{user?.full_name}</p>
          </div>
        </div>
        
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className={`p-2 rounded-lg transition-colors ${
            isLoggingOut 
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
              : 'text-slate-600 hover:bg-red-50 hover:text-red-600'
          }`}
        >
          {isLoggingOut ? (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-slate-600" />
          ) : (
            <LogOut className="w-5 h-5" />
          )}
        </button>
      </header>

      {/* Contenido principal con scroll */}
      <main className="flex-1 overflow-auto pb-20">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-2 py-2 safe-area-inset-bottom z-50">
        <div className="flex items-center justify-around max-w-lg mx-auto">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isCurrent = isCurrentPage(item.url);
            const isActiveService = item.isActive;
            
            return (
              <Link
                key={item.title}
                to={item.url}
                className={`flex flex-col items-center justify-center min-w-[60px] py-2 px-3 rounded-lg transition-colors ${
                  isCurrent 
                    ? 'bg-blue-50 text-blue-600' 
                    : isActiveService
                    ? 'text-green-600'
                    : 'text-slate-600'
                } ${isActiveService ? 'animate-pulse' : ''}`}
              >
                <Icon className={`w-6 h-6 mb-1 ${isActiveService ? 'text-green-600' : ''}`} />
                <span className="text-xs font-medium">{item.title}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}