import React from 'react';
import __Layout from './Layout.jsx';

// Importaciones dinámicas con React.lazy
const AdminTasksPanel = React.lazy(() => import('./pages/AdminTasksPanel'));
const AuditoriaWorkEntries = React.lazy(() => import('./pages/AuditoriaWorkEntries'));
const AumentoClientes = React.lazy(() => import('./pages/AumentoClientes'));
const Clientes = React.lazy(() => import('./pages/Clientes'));
const SeguimientoClientes = React.lazy(() => import('./pages/SeguimientoClientes'));
const ConciliacionFacturas = React.lazy(() => import('./pages/ConciliacionFacturas'));
const ConciliacionHoras = React.lazy(() => import('./pages/ConciliacionHoras'));
const Configuracion = React.lazy(() => import('./pages/Configuracion'));
const Cotizaciones = React.lazy(() => import('./pages/Cotizaciones'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Facturas = React.lazy(() => import('./pages/Facturas'));
const GestionCamisas = React.lazy(() => import('./pages/GestionCamisas'));
const GestionLlaves = React.lazy(() => import('./pages/GestionLlaves'));
const GestionFlota = React.lazy(() => import('./pages/GestionFlota'));
const GestionServiciosAdmin = React.lazy(() => import('./pages/GestionServiciosAdmin'));
const HistorialClientes = React.lazy(() => import('./pages/HistorialClientes'));
const Home = React.lazy(() => import('./pages/Home'));
const Horario = React.lazy(() => import('./pages/Horario'));
const Inducciones = React.lazy(() => import('./pages/Inducciones'));
const Limpiadores = React.lazy(() => import('./pages/Limpiadores'));
const MiPerfil = React.lazy(() => import('./pages/MiPerfil'));
const MiPuntuacion = React.lazy(() => import('./pages/MiPuntuacion'));
const MisFacturas = React.lazy(() => import('./pages/MisFacturas'));
const MisHoras = React.lazy(() => import('./pages/MisHoras'));
const PuntuacionLimpiadores = React.lazy(() => import('./pages/PuntuacionLimpiadores'));
const QuoteDetail = React.lazy(() => import('./pages/QuoteDetail'));
const QuoteItemization = React.lazy(() => import('./pages/QuoteItemization'));
const QuoteSettings = React.lazy(() => import('./pages/QuoteSettings'));
const RegistrarTrabajo = React.lazy(() => import('./pages/RegistrarTrabajo'));
const Rentabilidad = React.lazy(() => import('./pages/Rentabilidad'));
const Reportes = React.lazy(() => import('./pages/Reportes'));
const ReportesServicio = React.lazy(() => import('./pages/ReportesServicio'));
const RevisionPrecios = React.lazy(() => import('./pages/RevisionPrecios'));
const ServiceItemsManagement = React.lazy(() => import('./pages/ServiceItemsManagement'));
const ServicioActivo = React.lazy(() => import('./pages/ServicioActivo'));
const TVDashboard = React.lazy(() => import('./pages/TVDashboard'));
const TrabajoEntradas = React.lazy(() => import('./pages/TrabajoEntradas'));
const Vehiculos = React.lazy(() => import('./pages/Vehiculos'));

export const PAGES = {
    "AdminTasksPanel": AdminTasksPanel,
    "AuditoriaWorkEntries": AuditoriaWorkEntries,
    "AumentoClientes": AumentoClientes,
    "Clientes": Clientes,
    "SeguimientoClientes": SeguimientoClientes,
    "ConciliacionFacturas": ConciliacionFacturas,
    "ConciliacionHoras": ConciliacionHoras,
    "Configuracion": Configuracion,
    "Cotizaciones": Cotizaciones,
    "Dashboard": Dashboard,
    "Facturas": Facturas,
    "GestionCamisas": GestionCamisas,
    "GestionLlaves": GestionLlaves,
    "GestionFlota": GestionFlota,
    "GestionServiciosAdmin": GestionServiciosAdmin,
    "HistorialClientes": HistorialClientes,
    "Home": Home,
    "Horario": Horario,
    "Inducciones": Inducciones,
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
};

export const pagesConfig = {
    mainPage: "Horario",
    Pages: PAGES,
    Layout: __Layout,
};