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
  halloween: {
    name: 'Halloween',
    colors: {
      primary: '#f97316',
      secondary: '#7c2d12',
      accent: '#ea580c',
      background: '#fff7ed',
      headerGradient: 'from-orange-600 to-amber-700',
      cardBackground: '#ffffff',
      cardBorder: '#fdba74'
    },
    emoji: '🎃',
    decorations: {
      ghost: '👻',
      spider: '🕷️',
      bat: '🦇',
      skull: '💀',
      candy: '🍭'
    }
  },
  christmas: {
    name: 'Navidad',
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
      snow: '❄️',
      santa: '🎅',
      gift: '🎁',
      star: '⭐',
      bell: '🔔',
      candy: '🍬',
      lights: '✨'
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
        if (isDateInRange(config.halloween_start_date, config.halloween_end_date)) {
          effectiveTheme = 'halloween';
        } else if (isDateInRange(config.christmas_start_date, config.christmas_end_date)) {
          effectiveTheme = 'christmas';
        }
      }
      
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