import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { syncActiveService, shouldSkipActiveCheck, hasRecentClockOut } from '@/components/utils/activeServiceManager';
import NotificationBell from "@/components/notifications/NotificationBell";
import ThemeProvider, { useTheme, THEME_DEFINITIONS } from '@/components/theme/ThemeProvider';
import ChristmasDecoration from '@/components/theme/ChristmasDecoration';
import {
  LayoutDashboard,
  Clock,
  Users,
  FileText,
  BarChart3,
  Menu,
  LogOut,
  UserCog,
  CalendarClock,
  TrendingUp,
  BarChart,
  Calendar,
  UserCheck,
  Car,
  MapPin,
  GitCompare,
  CheckCircle,
  AlertTriangle,
  Landmark,
  Settings,
  Trophy,
  Search,
  Activity,
  ArrowRightSquare,
  Shirt,
  History,
  ListChecks,
  BookOpen,
  KeySquare,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format } from "date-fns";
import CleanerMobileLayout from '@/components/layout/CleanerMobileLayout';

const adminMenuItems = [
    { name: 'Dashboard', path: 'Dashboard', icon: BarChart },
    { name: 'Dashboard TV', path: 'TVDashboard', icon: Activity },
    { name: 'Cotizaciones', path: 'Cotizaciones', icon: FileText },
    { name: 'Tareas', path: 'AdminTasksPanel', icon: ListChecks },
  { name: 'Horario', path: 'Horario', icon: Calendar },
  { name: 'Gestión Avanzada', path: 'GestionServiciosAdmin', icon: Search },
  { name: 'Reportes de Servicio', path: 'ReportesServicio', icon: AlertTriangle },
  { name: 'Clientes', path: 'Clientes', icon: Users },
  { name: 'Seguimiento Clientes', path: 'SeguimientoClientes', icon: Activity },
  { name: 'Limpiadores', path: 'Limpiadores', icon: UserCheck },
  { name: 'Inducciones', path: 'Inducciones', icon: BookOpen },
  { name: 'Gestión de Flota', path: 'GestionFlota', icon: Car },
  { name: 'Gestión de Llaves', path: 'GestionLlaves', icon: KeySquare },
  { name: 'Entradas de Trabajo', path: 'TrabajoEntradas', icon: Clock },
  { name: 'Auditoría WorkEntries', path: 'AuditoriaWorkEntries', icon: GitCompare },
  { name: 'Facturas', path: 'Facturas', icon: FileText },
  { name: 'Conciliación Facturas', path: 'ConciliacionFacturas', icon: Landmark },
  { name: 'Reportes', path: 'Reportes', icon: BarChart3 },
  { name: 'Rentabilidad', path: 'Rentabilidad', icon: TrendingUp },
  { name: 'Aumento Clientes', path: 'AumentoClientes', icon: ArrowRightSquare },
  { name: 'Revisión Precios', path: 'RevisionPrecios', icon: FileText },
  { name: 'Puntuación Limpiadores', path: 'PuntuacionLimpiadores', icon: Trophy },
  { name: 'Gestión de Uniformes', path: 'GestionCamisas', icon: Shirt },
  { name: 'Historial Clientes', path: 'HistorialClientes', icon: History },
  { name: 'Configuración', path: 'Configuracion', icon: Settings },
];

const adminNavigation = adminMenuItems.map(item => ({
  title: item.name,
  url: createPageUrl(item.path),
  icon: item.icon,
}));

const cleanerNavigationItems = [
  {
    title: "Mi Horario",
    url: createPageUrl("Horario"),
    icon: CalendarClock,
  },
  {
    title: "Mis Horas",
    url: createPageUrl("MisHoras"),
    icon: Clock,
  },
  {
    title: "Registrar Trabajo",
    url: createPageUrl("RegistrarTrabajo"),
    icon: FileText,
    requiresActive: true,
  },
  {
    title: "Mis Pagos",
    url: createPageUrl("MisFacturas"),
    icon: FileText,
    requiresActive: true,
  },
  {
    title: "Mi Puntuación",
    url: createPageUrl("MiPuntuacion"),
    icon: Trophy,
    isScoringItem: true,
  },
  {
    title: "Mi Perfil",
    url: createPageUrl("MiPerfil"),
    icon: UserCog,
  },
];

function LayoutContent({ children, currentPageName }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [isScoringParticipant, setIsScoringParticipant] = useState(false);
  const [hasActiveService, setHasActiveService] = useState(false);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [isCheckingService, setIsCheckingService] = useState(false);

  const [isCleanerView, setIsCleanerView] = useState(false);
  const [assignedVehicle, setAssignedVehicle] = useState(null);
  const [mainDriverName, setMainDriverName] = useState(null);
  const [requiredKeys, setRequiredKeys] = useState([]);
  const [loadingCleanerData, setLoadingCleanerData] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);

  const [tasks, setTasks] = useState([]);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);

  const [error, setError] = useState('');

  const intervalRef = React.useRef(null);
  const pollingRef = React.useRef(null);
  const lastCheckRef = React.useRef(0);

  useEffect(() => {
    loadInitialData();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  useEffect(() => {
    if (location.state?.clockOutSuccess && location.state?.message) {
      console.log('[Layout] 🎉 Mostrando mensaje de Clock Out exitoso');
      
      // Limpiar el state inmediatamente
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate, location.pathname]);

  useEffect(() => {
    if (location.state?.selectedService && location.state?.openModal) {
      console.log('[Layout] 🎯 Abriendo modal para servicio desde dashboard:', location.state.selectedService);
      
      // Este caso es manejado por la página Horario, no aquí
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate, location.pathname]);

  // OPTIMIZADO: Verificación inteligente de servicio activo para limpiadores
  const checkForActiveService = React.useCallback(async (userId, forceCheck = false) => {
    // Evitar verificaciones duplicadas muy cercanas
    const now = Date.now();
    const timeSinceLastCheck = now - lastCheckRef.current;
    
    if (!forceCheck && timeSinceLastCheck < 2000) {
      console.log('[Layout] ⏭️ Saltando verificación (muy reciente)');
      return;
    }
    
    // CRÍTICO: Respetar flags de Clock Out reciente
    if (shouldSkipActiveCheck(userId) || hasRecentClockOut()) {
      console.log('[Layout] 🚫 Saltando verificación por Clock Out reciente');
      setHasActiveService(false);
      return;
    }
    
    if (isCheckingService) {
      console.log('[Layout] ⏳ Ya hay una verificación en progreso');
      return;
    }
    
    setIsCheckingService(true);
    lastCheckRef.current = now;
    
    try {
      const result = await syncActiveService(userId);
      
      const hasActive = result.hasActive;
      console.log(`[Layout] ${hasActive ? '✅' : '❌'} Servicio activo:`, hasActive);
      
      setHasActiveService(hasActive);
      
      // OPTIMIZADO: Solo redirigir si estamos en Horario y encontramos un servicio activo
      // Y NO si acabamos de hacer Clock Out
      if (hasActive && 
          location.pathname === createPageUrl("Horario") && 
          !hasRecentClockOut()) {
        console.log('[Layout] 🚀 Servicio activo detectado, redirigiendo...');
        navigate(createPageUrl("ServicioActivo"), { replace: true });
      }
      
    } catch (error) {
      console.error('[Layout] ❌ Error verificando servicio activo:', error);
      setHasActiveService(false);
    } finally {
      setIsCheckingService(false);
    }
  }, [location.pathname, navigate, isCheckingService]);

  const loadInitialData = async () => {
    try {
      const cachedUser = localStorage.getItem('redoak_user');
      if (cachedUser) {
        const parsed = JSON.parse(cachedUser);
        setUser(parsed);
        setLoading(false);
        
        if (parsed.role !== 'admin') {
          setIsCleanerView(true);
          // Verificación inicial de servicio activo
          checkForActiveService(parsed.id, true);
        }
      }

      const freshUser = await base44.auth.me();
      setUser(freshUser);
      localStorage.setItem('redoak_user', JSON.stringify(freshUser));

      if (freshUser.role !== 'admin') {
        setIsCleanerView(true);
        const currentMonth = format(new Date(), 'yyyy-MM');
        const scores = await base44.entities.MonthlyCleanerScore.filter({
          cleaner_id: freshUser.id,
          month_period: currentMonth,
          is_participating: true,
        });
        setIsScoringParticipant(scores.length > 0);

        // Verificar servicio activo
        await checkForActiveService(freshUser.id, true);
      }
    } catch (error) {
      console.error("Error loading user:", error);
      localStorage.removeItem('redoak_user');
    } finally {
      setLoading(false);
      setInitialLoadComplete(true);
    }
  };

  // OPTIMIZADO: Polling más inteligente para limpiadores
  useEffect(() => {
    if (!user || user.role === 'admin' || !initialLoadComplete) return;
    
    // Polling cada 15 segundos (reducido de 20s para mejor respuesta)
    const pollingInterval = 15000;
    
    console.log(`[Layout] 🔄 Iniciando polling cada ${pollingInterval/1000}s`);
    
    pollingRef.current = setInterval(() => {
      console.log('[Layout] 🔄 Polling: Verificando servicio activo...');
      checkForActiveService(user.id);
    }, pollingInterval);
    
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [user, initialLoadComplete, checkForActiveService]);

  const handleLogout = async () => {
    localStorage.clear();
    await base44.auth.logout();
    setUser(null);
  };

  if (currentPageName === 'TVDashboard') {
    return <div className="min-h-screen w-full">{children}</div>;
  }

  if (loading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <span className="text-slate-600">Cargando...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="w-32 h-16 mx-auto mb-6 flex items-center justify-center">
              <img
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/4c3ba79c6_RedOakLogo.png"
                alt="RedOak Cleaning Solutions"
                className="max-w-full max-h-full object-contain"
              />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">RedOak Cleaning Solutions</h1>
            <p className="text-slate-600 mb-6">Sistema de seguimiento de horas de limpieza</p>
            <Button
              onClick={() => base44.auth.login()}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              Iniciar Sesión
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Si es limpiador, usar layout móvil
  if (user.role !== 'admin') {
    return (
      <CleanerMobileLayout 
        user={user} 
        hasActiveService={hasActiveService}
        isScoringParticipant={isScoringParticipant}
      >
        {children}
      </CleanerMobileLayout>
    );
  }

  // Si es admin, usar layout desktop con sidebar (código existente)
  const navigation = adminNavigation;
  const currentTheme = THEME_DEFINITIONS[theme] || THEME_DEFINITIONS.default;
  // const isUserActive = user.active !== false; // This line is no longer strictly necessary for admin view's rendering logic

  return (
    <SidebarProvider>
      {theme === 'christmas' && <ChristmasDecoration />}
      <div className="min-h-screen flex w-full" style={{ backgroundColor: currentTheme.colors.background }}>
        {/* Sidebar con hover para expandir */}
        <div
          className={`fixed left-0 top-0 h-full bg-white border-r border-slate-200 transition-all duration-300 ease-in-out z-40 ${
            isSidebarExpanded ? 'w-64' : 'w-20'
          }`}
          onMouseEnter={() => setIsSidebarExpanded(true)}
          onMouseLeave={() => setIsSidebarExpanded(false)}
        >
          {/* Header */}
          <div className="border-b border-slate-200 p-4 h-[73px] flex items-center justify-center overflow-hidden" style={{ backgroundColor: 'white' }}>
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                <img
                  src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/4c3ba79c6_RedOakLogo.png"
                  alt="RedOak"
                  className="max-w-full max-h-full object-contain"
                />
              </div>
              <div className={`transition-all duration-300 ${isSidebarExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'} overflow-hidden`}>
                <h2 className="font-bold text-slate-900 whitespace-nowrap flex items-center gap-2">
                  {theme === 'christmas' && <span className="text-xl">🎅</span>}
                  RedOak Cleaning
                  {currentTheme.emoji && <span className="text-lg">{currentTheme.emoji}</span>}
                  {theme === 'christmas' && <span className="text-xl">🎁</span>}
                </h2>
                <p className="text-xs whitespace-nowrap" style={{ color: theme === 'christmas' ? '#dc2626' : '#64748b' }}>
                  {theme === 'christmas' ? '¡Felices Fiestas! 🔔✨' : 'Panel Administrativo'}
                </p>
              </div>
            </div>
          </div>

          {/* Content - Navigation */}
          <div className="p-3 flex-1 overflow-y-auto h-[calc(100vh-73px-120px)]">
            <div className="mb-2">
              <div className={`text-xs font-medium text-slate-500 uppercase tracking-wider px-3 py-2 transition-all duration-300 ${
                isSidebarExpanded ? 'opacity-100' : 'opacity-0'
              }`}>
                Navegación
              </div>
              <div className="space-y-1">
                {navigation.map((item) => {
                  const isCurrentPage = location.pathname === item.url;
                  
                  return (
                    <div key={item.title} className="relative group">
                      <Link
                        to={item.url}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl mb-1 transition-all duration-200 ${
                          isSidebarExpanded ? 'justify-start' : 'justify-center'
                        }`}
                        style={isCurrentPage ? {
                          backgroundColor: `${currentTheme.colors.primary}15`,
                          color: currentTheme.colors.primary,
                          borderColor: currentTheme.colors.primary,
                          borderWidth: '1px'
                        } : {}}
                      >
                        <item.icon className="w-5 h-5 flex-shrink-0" />
                        <span className={`font-medium whitespace-nowrap transition-all duration-300 ${
                          isSidebarExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'
                        } overflow-hidden`}>
                          {item.title}
                        </span>
                      </Link>
                      
                      {!isSidebarExpanded && (
                        <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-3 py-2 bg-slate-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 whitespace-nowrap z-50">
                          {item.title}
                          <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-900"></div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-slate-200 p-4 h-[120px]">
            <div className={`flex items-center gap-2 mb-3 ${isSidebarExpanded ? '' : 'justify-center'}`}>
              <Avatar className="w-10 h-10 flex-shrink-0">
                <AvatarImage src={user?.profile_photo_url} alt={user?.full_name} />
                <AvatarFallback className="bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold">
                  {user.full_name?.charAt(0)?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              
              {user.role === 'admin' && !isSidebarExpanded && (
                <div className="flex-shrink-0">
                  <NotificationBell userId={user.id} userRole={user.role} />
                </div>
              )}

              <div className={`flex-1 min-w-0 transition-all duration-300 ${
                isSidebarExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0'
              } overflow-hidden`}>
                <p className="font-medium text-slate-900 text-sm truncate whitespace-nowrap">{user.full_name}</p>
                <p className="text-xs text-slate-500 truncate whitespace-nowrap">{user.email}</p>
              </div>
              
              {user.role === 'admin' && isSidebarExpanded && (
                <div className="flex-shrink-0">
                  <NotificationBell userId={user.id} userRole={user.role} />
                </div>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className={`w-full text-slate-600 hover:text-slate-900 ${
                isSidebarExpanded ? 'justify-start' : 'justify-center px-0'
              }`}
            >
              <LogOut className="w-4 h-4 flex-shrink-0" />
              <span className={`transition-all duration-300 ${
                isSidebarExpanded ? 'opacity-100 w-auto ml-2' : 'opacity-0 w-0'
              } overflow-hidden whitespace-nowrap`}>
                Cerrar Sesión
              </span>
            </Button>
          </div>
        </div>

        {/* Main content con padding ajustado */}
        <main className={`flex-1 flex flex-col transition-all duration-300 ${
          isSidebarExpanded ? 'ml-64' : 'ml-20'
        }`}>
          <header className="bg-white border-b border-slate-200 px-6 py-4 md:hidden">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="hover:bg-slate-100 p-2 rounded-lg transition-colors duration-200" />
              <h1 className="text-xl font-semibold text-slate-900">RedOak Cleaning</h1>
            </div>
          </header>

          <div className="flex-1 overflow-auto">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

export default function Layout({ children, currentPageName }) {
  return (
    <ThemeProvider>
      <LayoutContent children={children} currentPageName={currentPageName} />
    </ThemeProvider>
  );
}