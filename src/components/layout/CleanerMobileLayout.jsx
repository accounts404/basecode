import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { clearAllFlags } from "@/components/utils/activeServiceManager";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useTheme, THEME_DEFINITIONS } from '@/components/theme/ThemeProvider';
import ChristmasDecoration from '@/components/theme/ChristmasDecoration';
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
  const { theme } = useTheme();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const currentTheme = THEME_DEFINITIONS[theme] || THEME_DEFINITIONS.default;
  
  // 🔒 BLOQUEAR NAVEGACIÓN cuando hay servicio activo
  useEffect(() => {
    if (hasActiveService && location.pathname !== createPageUrl("ServicioActivo")) {
      console.log('[CleanerMobileLayout] 🔒 Servicio activo detectado, redirigiendo a ServicioActivo');
      navigate(createPageUrl("ServicioActivo"), { replace: true });
    }
  }, [hasActiveService, location.pathname, navigate]);

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
      {theme === 'christmas' && <ChristmasDecoration />}

      {/* Header */}
      <header className="flex-shrink-0 bg-white border-b border-slate-100 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center">
              <img
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/4c3ba79c6_RedOakLogo.png"
                alt="RedOak"
                className="max-w-full max-h-full object-contain"
              />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900 leading-none">
                {theme === 'christmas' ? `🎄 ¡Hola, ${user?.full_name?.split(' ')[0]}!` : user?.full_name?.split(' ')[0]}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {theme === 'christmas' ? '¡Felices Fiestas! 🎅' : 'RedOak Cleaning'}
              </p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-red-500 transition-colors disabled:opacity-50"
          >
            {isLoggingOut ? (
              <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
            ) : (
              <LogOut className="w-3.5 h-3.5" />
            )}
            Salir
          </button>
        </div>
      </header>

      {/* Active service warning */}
      {hasActiveService && location.pathname !== createPageUrl("ServicioActivo") && (
        <div className="mx-4 mt-3 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2">
          <Activity className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <p className="text-xs font-semibold text-amber-800">Tienes un servicio activo. Finalizalo primero.</p>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 overflow-auto pb-20">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 pb-safe z-50">
        <div className="flex items-center justify-around px-2 pt-2 pb-3">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isCurrent = isCurrentPage(item.url);
            const isBlocked = hasActiveService && item.url !== createPageUrl("ServicioActivo");
            const isActiveService = item.isActive;

            if (isBlocked) {
              return (
                <button key={item.title} disabled className="flex flex-col items-center gap-1 px-3 py-1 opacity-30 cursor-not-allowed">
                  <Icon className="w-5 h-5 text-slate-400" />
                  <span className="text-[10px] text-slate-400">{item.title}</span>
                </button>
              );
            }

            return (
              <Link
                key={item.title}
                to={item.url}
                className="flex flex-col items-center gap-1 px-3 py-1 relative"
              >
                {isActiveService ? (
                  <div className="relative">
                    <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center shadow-md -mt-5 mb-0.5">
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-white animate-pulse" />
                  </div>
                ) : (
                  <Icon className={`w-5 h-5 transition-colors ${isCurrent ? 'text-blue-600' : 'text-slate-400'}`} />
                )}
                <span className={`text-[10px] font-medium transition-colors ${
                  isActiveService ? 'text-green-600' :
                  isCurrent ? 'text-blue-600' : 'text-slate-400'
                }`}>{item.title}</span>
                {isCurrent && !isActiveService && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-blue-600 rounded-full" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}