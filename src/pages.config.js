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
import AdminTasksPanel from './pages/AdminTasksPanel';
import AuditoriaWorkEntries from './pages/AuditoriaWorkEntries';
import AumentoClientes from './pages/AumentoClientes';
import Clientes from './pages/Clientes';
import ConciliacionFacturas from './pages/ConciliacionFacturas';
import ConciliacionHoras from './pages/ConciliacionHoras';
import Configuracion from './pages/Configuracion';
import Cotizaciones from './pages/Cotizaciones';
import Dashboard from './pages/Dashboard';
import Facturas from './pages/Facturas';
import GestionCamisas from './pages/GestionCamisas';
import GestionFlota from './pages/GestionFlota';
import GestionServiciosAdmin from './pages/GestionServiciosAdmin';
import HistorialClientes from './pages/HistorialClientes';
import Home from './pages/Home';
import Horario from './pages/Horario';
import Limpiadores from './pages/Limpiadores';
import MiPerfil from './pages/MiPerfil';
import MiPuntuacion from './pages/MiPuntuacion';
import MisFacturas from './pages/MisFacturas';
import MisHoras from './pages/MisHoras';
import PuntuacionLimpiadores from './pages/PuntuacionLimpiadores';
import QuoteDetail from './pages/QuoteDetail';
import QuoteItemization from './pages/QuoteItemization';
import QuoteSettings from './pages/QuoteSettings';
import RegistrarTrabajo from './pages/RegistrarTrabajo';
import Rentabilidad from './pages/Rentabilidad';
import Reportes from './pages/Reportes';
import ReportesServicio from './pages/ReportesServicio';
import RevisionPrecios from './pages/RevisionPrecios';
import ServiceItemsManagement from './pages/ServiceItemsManagement';
import ServicioActivo from './pages/ServicioActivo';
import TVDashboard from './pages/TVDashboard';
import TrabajoEntradas from './pages/TrabajoEntradas';
import Vehiculos from './pages/Vehiculos';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AdminTasksPanel": AdminTasksPanel,
    "AuditoriaWorkEntries": AuditoriaWorkEntries,
    "AumentoClientes": AumentoClientes,
    "Clientes": Clientes,
    "ConciliacionFacturas": ConciliacionFacturas,
    "ConciliacionHoras": ConciliacionHoras,
    "Configuracion": Configuracion,
    "Cotizaciones": Cotizaciones,
    "Dashboard": Dashboard,
    "Facturas": Facturas,
    "GestionCamisas": GestionCamisas,
    "GestionFlota": GestionFlota,
    "GestionServiciosAdmin": GestionServiciosAdmin,
    "HistorialClientes": HistorialClientes,
    "Home": Home,
    "Horario": Horario,
    "Limpiadores": Limpiadores,
    "MiPerfil": MiPerfil,
    "MiPuntuacion": MiPuntuacion,
    "MisFacturas": MisFacturas,
    "MisHoras": MisHoras,
    "PuntuacionLimpiadores": PuntuacionLimpiadores,
    "QuoteDetail": QuoteDetail,
    "QuoteItemization": QuoteItemization,
    "QuoteSettings": QuoteSettings,
    "RegistrarTrabajo": RegistrarTrabajo,
    "Rentabilidad": Rentabilidad,
    "Reportes": Reportes,
    "ReportesServicio": ReportesServicio,
    "RevisionPrecios": RevisionPrecios,
    "ServiceItemsManagement": ServiceItemsManagement,
    "ServicioActivo": ServicioActivo,
    "TVDashboard": TVDashboard,
    "TrabajoEntradas": TrabajoEntradas,
    "Vehiculos": Vehiculos,
}

export const pagesConfig = {
    mainPage: "Horario",
    Pages: PAGES,
    Layout: __Layout,
};