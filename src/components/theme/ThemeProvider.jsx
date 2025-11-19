import React, { createContext, useContext, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const ThemeContext = createContext({
  theme: 'default',
  themeConfig: null,
  loading: true,
  refreshTheme: () => {}
});

export const useTheme = () => useContext(ThemeContext);

// Definiciones de temas
export const THEME_DEFINITIONS = {
  default: {
    name: 'Default',
    colors: {
      primary: '#3b82f6',
      secondary: '#64748b',
      accent: '#6366f1',
      background: '#f8fafc',
      headerGradient: 'from-blue-600 to-indigo-600',
      cardBackground: '#ffffff',
      cardBorder: '#e2e8f0'
    }
  },
  
  // ========== VARIANTES DE HALLOWEEN ==========
  halloween_spooky: {
    name: 'Halloween Terrorífico 👻',
    category: 'halloween',
    colors: {
      primary: '#f97316',
      secondary: '#7c2d12',
      accent: '#ea580c',
      background: '#1a0a00',
      headerGradient: 'from-orange-600 via-red-700 to-black',
      cardBackground: '#2d1810',
      cardBorder: '#f97316'
    },
    emoji: '🎃',
    decorations: {
      main: '👻',
      secondary: '🕷️',
      accent: '🦇',
      extra: '💀',
      candy: '🍭'
    }
  },
  halloween_fun: {
    name: 'Halloween Divertido 🎃',
    category: 'halloween',
    colors: {
      primary: '#f59e0b',
      secondary: '#fb923c',
      accent: '#fbbf24',
      background: '#fff7ed',
      headerGradient: 'from-orange-400 to-amber-500',
      cardBackground: '#ffffff',
      cardBorder: '#fdba74'
    },
    emoji: '🎃',
    decorations: {
      main: '🎃',
      secondary: '🍬',
      accent: '🍭',
      extra: '🧙',
      candy: '🍫'
    }
  },
  halloween_gothic: {
    name: 'Halloween Gótico 🦇',
    category: 'halloween',
    colors: {
      primary: '#7c3aed',
      secondary: '#4c1d95',
      accent: '#a855f7',
      background: '#0f0a1f',
      headerGradient: 'from-purple-900 via-violet-800 to-black',
      cardBackground: '#1e1433',
      cardBorder: '#7c3aed'
    },
    emoji: '🦇',
    decorations: {
      main: '🦇',
      secondary: '🕸️',
      accent: '🌙',
      extra: '⚰️',
      candy: '🕷️'
    }
  },
  
  // ========== VARIANTES DE NAVIDAD ==========
  christmas_classic: {
    name: 'Navidad Clásica 🎅',
    category: 'christmas',
    colors: {
      primary: '#dc2626',
      secondary: '#065f46',
      accent: '#ca8a04',
      background: '#fef2f2',
      headerGradient: 'from-red-600 to-green-700',
      cardBackground: '#ffffff',
      cardBorder: '#fca5a5'
    },
    emoji: '🎄',
    decorations: {
      main: '🎅',
      secondary: '🎄',
      accent: '🎁',
      extra: '⭐',
      candy: '🍬',
      lights: '✨',
      bell: '🔔'
    }
  },
  christmas_winter: {
    name: 'Invierno Mágico ❄️',
    category: 'christmas',
    colors: {
      primary: '#0ea5e9',
      secondary: '#0284c7',
      accent: '#38bdf8',
      background: '#f0f9ff',
      headerGradient: 'from-blue-400 via-cyan-300 to-blue-500',
      cardBackground: '#ffffff',
      cardBorder: '#bae6fd'
    },
    emoji: '❄️',
    decorations: {
      main: '❄️',
      secondary: '⛄',
      accent: '🎿',
      extra: '✨',
      candy: '🧊',
      lights: '💎',
      bell: '🔵'
    }
  },
  christmas_rustic: {
    name: 'Navidad Rústica 🌲',
    category: 'christmas',
    colors: {
      primary: '#78716c',
      secondary: '#166534',
      accent: '#b45309',
      background: '#faf8f5',
      headerGradient: 'from-stone-600 via-green-800 to-amber-700',
      cardBackground: '#ffffff',
      cardBorder: '#d6d3d1'
    },
    emoji: '🌲',
    decorations: {
      main: '🌲',
      secondary: '🦌',
      accent: '🍂',
      extra: '🌰',
      candy: '🎄',
      lights: '🕯️',
      bell: '🔔'
    }
  }
};

const isDateInRange = (startDate, endDate) => {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();
  
  const [startMonth, startDay] = startDate.split('-').map(Number);
  const [endMonth, endDay] = endDate.split('-').map(Number);
  
  // Caso especial: el rango cruza el año nuevo (ej: 12-01 a 01-06)
  if (startMonth > endMonth) {
    return (
      (currentMonth === startMonth && currentDay >= startDay) ||
      (currentMonth > startMonth) ||
      (currentMonth < endMonth) ||
      (currentMonth === endMonth && currentDay <= endDay)
    );
  }
  
  // Caso normal: el rango está dentro del mismo año
  if (currentMonth < startMonth || currentMonth > endMonth) return false;
  if (currentMonth === startMonth && currentDay < startDay) return false;
  if (currentMonth === endMonth && currentDay > endDay) return false;
  
  return true;
};

export default function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('default');
  const [themeConfig, setThemeConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadThemeSettings = async () => {
    try {
      const settings = await base44.entities.ThemeSettings.list();
      
      if (!settings || settings.length === 0) {
        // Crear configuración por defecto
        const defaultSettings = {
          active_theme: 'default',
          seasonal_themes_enabled: true,
          halloween_start_date: '10-20',
          halloween_end_date: '11-02',
          christmas_start_date: '12-01',
          christmas_end_date: '01-06'
        };
        
        await base44.entities.ThemeSettings.create(defaultSettings);
        setThemeConfig(defaultSettings);
        setTheme('default');
        return;
      }
      
      const config = settings[0];
      setThemeConfig(config);
      
      // Determinar tema efectivo
      let effectiveTheme = config.active_theme || 'default';
      
      // Si los temas estacionales están habilitados, verificar fechas
      if (config.seasonal_themes_enabled) {
        const isHalloweenSeason = isDateInRange(config.halloween_start_date, config.halloween_end_date);
        const isChristmasSeason = isDateInRange(config.christmas_start_date, config.christmas_end_date);
        
        if (isHalloweenSeason) {
          // Si el tema configurado es de Halloween, usarlo; si no, usar el predeterminado
          if (effectiveTheme.startsWith('halloween_')) {
            // Ya está configurado correctamente, mantenerlo
          } else {
            effectiveTheme = 'halloween_spooky';
          }
        } else if (isChristmasSeason) {
          // Si el tema configurado es de Navidad, usarlo; si no, usar el predeterminado
          if (effectiveTheme.startsWith('christmas_')) {
            // Ya está configurado correctamente, mantenerlo
          } else {
            effectiveTheme = 'christmas_classic';
          }
        } else {
          // Fuera de temporadas: usar default si está en un tema estacional
          if (effectiveTheme.startsWith('halloween_') || effectiveTheme.startsWith('christmas_')) {
            effectiveTheme = 'default';
          }
        }
      }
      
      console.log('[ThemeProvider] Tema efectivo:', effectiveTheme);
      setTheme(effectiveTheme);
      
    } catch (error) {
      console.error('[ThemeProvider] Error cargando configuración de tema:', error);
      setTheme('default');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadThemeSettings();
  }, []);

  const refreshTheme = () => {
    loadThemeSettings();
  };

  return (
    <ThemeContext.Provider value={{ theme, themeConfig, loading, refreshTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}