import Dashboard from './pages/Dashboard';
import RegistrarTrabajo from './pages/RegistrarTrabajo';
import Clientes from './pages/Clientes';
import MisHoras from './pages/MisHoras';
import TrabajoEntradas from './pages/TrabajoEntradas';
import Facturas from './pages/Facturas';
import MisFacturas from './pages/MisFacturas';
import Reportes from './pages/Reportes';
import MiPerfil from './pages/MiPerfil';
import Limpiadores from './pages/Limpiadores';
import ConciliacionHoras from './pages/ConciliacionHoras';
import Rentabilidad from './pages/Rentabilidad';
import Horario from './pages/Horario';
import Vehiculos from './pages/Vehiculos';
import GestionFlota from './pages/GestionFlota';
import ReportesServicio from './pages/ReportesServicio';
import Configuracion from './pages/Configuracion';
import ConciliacionFacturas from './pages/ConciliacionFacturas';
import PuntuacionLimpiadores from './pages/PuntuacionLimpiadores';
import MiPuntuacion from './pages/MiPuntuacion';
import GestionServiciosAdmin from './pages/GestionServiciosAdmin';
import TVDashboard from './pages/TVDashboard';
import AumentoClientes from './pages/AumentoClientes';
import GestionCamisas from './pages/GestionCamisas';
import HistorialClientes from './pages/HistorialClientes';
import ServicioActivo from './pages/ServicioActivo';
import AdminTasksPanel from './pages/AdminTasksPanel';
import AuditoriaEntradas from './pages/AuditoriaEntradas';
import Layout from './Layout.jsx';


export const PAGES = {
    "Dashboard": Dashboard,
    "RegistrarTrabajo": RegistrarTrabajo,
    "Clientes": Clientes,
    "MisHoras": MisHoras,
    "TrabajoEntradas": TrabajoEntradas,
    "Facturas": Facturas,
    "MisFacturas": MisFacturas,
    "Reportes": Reportes,
    "MiPerfil": MiPerfil,
    "Limpiadores": Limpiadores,
    "ConciliacionHoras": ConciliacionHoras,
    "Rentabilidad": Rentabilidad,
    "Horario": Horario,
    "Vehiculos": Vehiculos,
    "GestionFlota": GestionFlota,
    "ReportesServicio": ReportesServicio,
    "Configuracion": Configuracion,
    "ConciliacionFacturas": ConciliacionFacturas,
    "PuntuacionLimpiadores": PuntuacionLimpiadores,
    "MiPuntuacion": MiPuntuacion,
    "GestionServiciosAdmin": GestionServiciosAdmin,
    "TVDashboard": TVDashboard,
    "AumentoClientes": AumentoClientes,
    "GestionCamisas": GestionCamisas,
    "HistorialClientes": HistorialClientes,
    "ServicioActivo": ServicioActivo,
    "AdminTasksPanel": AdminTasksPanel,
    "AuditoriaEntradas": AuditoriaEntradas,
}

export const pagesConfig = {
    mainPage: "Horario",
    Pages: PAGES,
    Layout: Layout,
};