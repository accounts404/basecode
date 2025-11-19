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
    <div className="flex flex-col h-screen" style={{ backgroundColor: currentTheme.colors.background }}>
      {theme.startsWith('christmas_') && <ChristmasDecoration />}
      {/* Header móvil simple */}
      <header 
        className="border-b px-4 py-3 flex items-center justify-between flex-shrink-0"
        style={{ 
          backgroundColor: 'white',
          borderColor: currentTheme.colors.cardBorder,
          background: theme.startsWith('christmas_') 
            ? 'linear-gradient(135deg, #ffffff 0%, #fef2f2 100%)' 
            : theme.startsWith('halloween_')
            ? 'linear-gradient(135deg, #ffffff 0%, #fff7ed 100%)'
            : 'white'
        }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 flex items-center justify-center">
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/4c3ba79c6_RedOakLogo.png"
              alt="RedOak"
              className="max-w-full max-h-full object-contain"
            />
          </div>
          <div>
            <h1 className="text-sm font-bold flex items-center gap-1" style={{ color: theme.startsWith('christmas_') ? '#dc2626' : theme.startsWith('halloween_') ? '#f97316' : '#0f172a' }}>
              {theme.startsWith('christmas_') && currentTheme.decorations?.main && <span>{currentTheme.decorations.main}</span>}
              {theme.startsWith('halloween_') && currentTheme.decorations?.main && <span>{currentTheme.decorations.main}</span>}
              RedOak
              {theme.startsWith('christmas_') && currentTheme.decorations?.lights && <span>{currentTheme.decorations.lights}</span>}
              {theme.startsWith('halloween_') && currentTheme.decorations?.candy && <span>{currentTheme.decorations.candy}</span>}
            </h1>
            <p className="text-xs" style={{ color: theme.startsWith('christmas_') ? '#065f46' : theme.startsWith('halloween_') ? '#7c2d12' : '#475569' }}>
              {theme.startsWith('christmas_') ? `¡Feliz Navidad, ${user?.full_name?.split(' ')[0]}! 🎅` : 
               theme.startsWith('halloween_') ? `¡Feliz Halloween, ${user?.full_name?.split(' ')[0]}! 🎃` : 
               user?.full_name}
            </p>
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

      {/* Alerta de servicio activo */}
      {hasActiveService && location.pathname !== createPageUrl("ServicioActivo") && (
        <Alert className="m-4 bg-amber-50 border-amber-300">
          <Activity className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-900 font-medium">
            ⚠️ Tienes un servicio activo. Debes finalizarlo antes de acceder a otras páginas.
          </AlertDescription>
        </Alert>
      )}

      {/* Contenido principal con scroll */}
      <main className="flex-1 overflow-auto pb-20">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav 
        className="fixed bottom-0 left-0 right-0 border-t px-2 py-2 safe-area-inset-bottom z-50"
        style={{ 
          backgroundColor: 'white',
          borderColor: currentTheme.colors.cardBorder,
          background: theme.startsWith('christmas_') 
            ? 'linear-gradient(180deg, #fef2f2 0%, #ffffff 100%)' 
            : theme.startsWith('halloween_')
            ? 'linear-gradient(180deg, #fff7ed 0%, #ffffff 100%)'
            : 'white'
        }}
      >
        <div className="flex items-center justify-around max-w-lg mx-auto">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isCurrent = isCurrentPage(item.url);
            const isActiveService = item.isActive;
            
            // 🔒 Bloquear navegación si hay servicio activo (excepto a ServicioActivo)
            const isBlocked = hasActiveService && item.url !== createPageUrl("ServicioActivo");
            
            if (isBlocked) {
              return (
                <button
                  key={item.title}
                  disabled
                  className="flex flex-col items-center justify-center min-w-[60px] py-2 px-3 rounded-lg text-slate-300 cursor-not-allowed opacity-50"
                >
                  <Icon className="w-6 h-6 mb-1" />
                  <span className="text-xs font-medium">{item.title}</span>
                </button>
              );
            }
            
            return (
              <Link
                key={item.title}
                to={item.url}
                className={`flex flex-col items-center justify-center min-w-[60px] py-2 px-3 rounded-lg transition-colors ${
                  isActiveService ? 'animate-pulse' : ''
                }`}
                style={
                  isCurrent 
                    ? { 
                        backgroundColor: `${currentTheme.colors.primary}15`,
                        color: currentTheme.colors.primary 
                      }
                    : isActiveService
                    ? { color: '#16a34a' }
                    : { color: '#64748b' }
                }
              >
                <Icon className="w-6 h-6 mb-1" />
                <span className="text-xs font-medium">{item.title}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}