/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import Horario from './pages/Horario';
import MiPerfil from './pages/MiPerfil';
import MiPuntuacion from './pages/MiPuntuacion';
import MisFacturas from './pages/MisFacturas';
import MisHoras from './pages/MisHoras';
import RegistrarTrabajo from './pages/RegistrarTrabajo';
import ServicioActivo from './pages/ServicioActivo';
import BlankPage from './components/BlankPage';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AdminTasksPanel": BlankPage,
    "AuditoriaWorkEntries": BlankPage,
    "AumentoClientes": BlankPage,
    "Clientes": BlankPage,
    "SeguimientoClientes": BlankPage,
    "ConciliacionFacturas": BlankPage,
    "ConciliacionHoras": BlankPage,
    "Configuracion": BlankPage,
    "Cotizaciones": BlankPage,
    "Dashboard": BlankPage,
    "Facturas": BlankPage,
    "GestionCamisas": BlankPage,
    "GestionLlaves": BlankPage,
    "GestionFlota": BlankPage,
    "GestionServiciosAdmin": BlankPage,
    "HistorialClientes": BlankPage,
    "Home": BlankPage,
    "Horario": Horario,
    "Inducciones": BlankPage,
    "Limpiadores": BlankPage,
    "MiPerfil": MiPerfil,
    "MiPuntuacion": MiPuntuacion,
    "MisFacturas": MisFacturas,
    "MisHoras": MisHoras,
    "PuntuacionLimpiadores": BlankPage,
    "QuoteDetail": BlankPage,
    "QuoteItemization": BlankPage,
    "QuoteSettings": BlankPage,
    "RegistrarTrabajo": RegistrarTrabajo,
    "Rentabilidad": BlankPage,
    "Reportes": BlankPage,
    "ReportesServicio": BlankPage,
    "RevisionPrecios": BlankPage,
    "ServiceItemsManagement": BlankPage,
    "ServicioActivo": ServicioActivo,
    "TVDashboard": BlankPage,
    "TrabajoEntradas": BlankPage,
    "Vehiculos": BlankPage,
}

export const pagesConfig = {
    mainPage: "Horario",
    Pages: PAGES,
    Layout: __Layout,
};