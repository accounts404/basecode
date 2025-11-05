
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import AdminDashboard from '../components/dashboard/AdminDashboard';
import { Loader2 } from 'lucide-react';
import { syncActiveService } from '@/components/utils/activeServiceManager';

export default function DashboardPage() {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchUser = async () => {
            try {
                // Intentar cargar usuario desde caché primero
                const cachedUser = localStorage.getItem('redoak_user');
                if (cachedUser) {
                    const parsedUser = JSON.parse(cachedUser);
                    setUser(parsedUser);
                    setLoading(false);
                    
                    // Si es limpiador, verificar servicio activo y redirigir
                    if (parsedUser.role !== 'admin') {
                        checkAndRedirect(parsedUser.id);
                        return;
                    }
                }

                // Luego cargar datos frescos
                const userData = await base44.auth.me();
                setUser(userData);
                localStorage.setItem('redoak_user', JSON.stringify(userData));
                
                // Si es limpiador, verificar servicio activo y redirigir
                if (userData.role !== 'admin') {
                    checkAndRedirect(userData.id);
                }
            } catch (error) {
                console.error("Failed to fetch user:", error);
                localStorage.removeItem('redoak_user');
            } finally {
                setLoading(false);
            }
        };
        
        const checkAndRedirect = async (userId) => {
            try {
                const result = await syncActiveService(userId);
                
                if (result.hasActive) {
                    console.log('[Dashboard] 🎯 Servicio activo detectado, redirigiendo a ServicioActivo');
                    navigate(createPageUrl('ServicioActivo'), { replace: true });
                } else {
                    console.log('[Dashboard] 📅 Sin servicio activo, redirigiendo a Horario');
                    navigate(createPageUrl('Horario'), { replace: true });
                }
            } catch (error) {
                console.error('[Dashboard] Error verificando servicio activo:', error);
                // En caso de error, llevar a Horario por defecto
                navigate(createPageUrl('Horario'), { replace: true });
            }
        };
        
        fetchUser();
    }, [navigate]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    if (!user) {
        return <div className="p-8 text-center text-red-500">Error de autenticación. Por favor, intenta iniciar sesión de nuevo.</div>;
    }

    // Solo mostrar AdminDashboard si es admin
    if (user.role === 'admin') {
        return <AdminDashboard />;
    }

    // Los limpiadores ya fueron redirigidos
    return (
        <div className="flex items-center justify-center h-screen">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
    );
}
