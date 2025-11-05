import React from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import {
  CalendarClock,
  Clock,
  FileText,
  Trophy,
  UserCog,
  LogOut,
  Home,
  Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function CleanerMobileLayout({ children, user, hasActiveService, isScoringParticipant }) {
  const location = useLocation();

  const handleLogout = async () => {
    localStorage.clear();
    await base44.auth.logout();
  };

  const navigationItems = [
    {
      title: "Horario",
      url: createPageUrl("Horario"),
      icon: CalendarClock,
      showAlways: true
    },
    {
      title: "Servicio Activo",
      url: createPageUrl("ServicioActivo"),
      icon: Home,
      showWhen: hasActiveService
    },
    {
      title: "Registrar Trabajo",
      url: createPageUrl("RegistrarTrabajo"),
      icon: Plus,
      showAlways: true
    },
    {
      title: "Mis Horas",
      url: createPageUrl("MisHoras"),
      icon: Clock,
      showAlways: true
    },
    {
      title: "Mis Pagos",
      url: createPageUrl("MisFacturas"),
      icon: FileText,
      showAlways: true
    },
    {
      title: "Mi Puntuación",
      url: createPageUrl("MiPuntuacion"),
      icon: Trophy,
      showWhen: isScoringParticipant
    },
    {
      title: "Mi Perfil",
      url: createPageUrl("MiPerfil"),
      icon: UserCog,
      showAlways: true
    }
  ];

  const visibleItems = navigationItems.filter(item => 
    item.showAlways || item.showWhen
  );

  // Priorizar los primeros 5 items más importantes
  const bottomNavItems = visibleItems.slice(0, 5);

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex-shrink-0">
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
              <h2 className="font-bold text-slate-900 text-sm">RedOak Cleaning</h2>
              <p className="text-xs text-slate-500">Panel de Limpiador</p>
            </div>
          </div>
          
          <Avatar className="w-10 h-10">
            <AvatarImage src={user?.profile_photo_url} alt={user?.full_name} />
            <AvatarFallback className="bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold text-sm">
              {user?.full_name?.charAt(0)?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="bg-white border-t border-slate-200 flex-shrink-0 safe-area-bottom">
        <div className={`grid gap-1 p-2 ${bottomNavItems.length <= 4 ? 'grid-cols-4' : 'grid-cols-5'}`}>
          {bottomNavItems.map((item) => {
            const isActive = location.pathname === item.url;
            const Icon = item.icon;
            
            return (
              <Link
                key={item.title}
                to={item.url}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg transition-colors ${
                  isActive 
                    ? 'bg-blue-50 text-blue-600' 
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-5 h-5 mb-1 ${
                  item.title === "Servicio Activo" && hasActiveService 
                    ? 'animate-pulse text-green-600' 
                    : ''
                }`} />
                <span className="text-[10px] font-medium truncate w-full text-center leading-tight">
                  {item.title}
                </span>
              </Link>
            );
          })}
        </div>
        
        {/* User Info & Logout */}
        <div className="border-t border-slate-100 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">
                {user?.full_name}
              </p>
              <p className="text-xs text-slate-500 truncate">
                {user?.email}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="ml-2 flex-shrink-0"
            >
              <LogOut className="w-4 h-4 mr-1" />
              <span className="text-xs">Salir</span>
            </Button>
          </div>
        </div>
      </nav>
    </div>
  );
}