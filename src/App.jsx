import { createBrowserRouter, RouterProvider, Navigate, Outlet, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, lazy, Suspense, useState } from "react"; // Added lazy, Suspense, useState
import { useSupabaseAuth } from "@/contexts/SupabaseAuthContext";
import { useOfflineSync } from "./hooks/useOfflineSync";
import OfflineBanner from "./components/OfflineBanner";
import OfflineSyncMonitor from "./components/OfflineSyncMonitor";
import NetworkAutoSync from "./components/NetworkAutoSync";
import CopilotChat from "./components/CopilotChat";
import { NotificationService } from "@/services/NotificationService";
import { registerServiceWorker } from "@/services/sw-registration";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/components/ui/use-toast";
import { SplashScreen } from '@capacitor/splash-screen';
import { checkForUpdate, APP_CURRENT_VERSION, isNewerVersion as isNewerVer } from "@/services/updateService";
import { Button } from "@/components/ui/button";
import { supabase } from "@/supabaseClient";
import UpdateModal from "@/components/UpdateModal";
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { Capacitor } from '@capacitor/core';

// Lazy Load Pages
import Layout from "./components/Layout";
import FullPageLoader from "./components/FullPageLoader";
const ConquestMapPage = lazy(() => import("./pages/ConquestMapPage"));
const AdminEvaluationsPage = lazy(() => import("./pages/AdminEvaluationsPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const ForcePasswordChangePage = lazy(() => import("./pages/ForcePasswordChangePage"));
const ClientsPage = lazy(() => import("./pages/ClientsPage"));
const ClientDetailsPage = lazy(() => import("./pages/ClientDetailsPageFixed"));
const VisitsPage = lazy(() => import("./pages/VisitsPage"));
const PreventaPage = lazy(() => import("./pages/PreventaPage"));
const PreventaDetailPage = lazy(() => import("./pages/PreventaDetailPage"));
const AdminSettingsPage = lazy(() => import("./pages/AdminSettingsPage"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminClients = lazy(() => import("./pages/AdminClients"));
const AdminVisits = lazy(() => import("./pages/AdminVisits"));
const ConquestDashboard = lazy(() => import("./pages/ConquestDashboard"));
const CoorconDashboard = lazy(() => import("./pages/conquista/CoorconDashboard"));
import ConquistaRankingPage from "./pages/conquista/ConquistaRankingPage";
const DynamicAdvisorDashboard = lazy(() => import("./pages/DynamicAdvisorDashboard"));
const TelesalesDashboard = lazy(() => import("./pages/TelesalesDashboard"));
const TeleventaPage = lazy(() => import("./pages/TeleventaPage"));
const EvaluacionesPage = lazy(() => import("./pages/EvaluacionesPage"));
const NuevaEvaluacion = lazy(() => import("./components/NuevaEvaluacion"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const AdminUsersPage = lazy(() => import("./pages/AdminUsersPage"));
const AdminSalesImportPage = lazy(() => import("./pages/AdminSalesImportPage"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const AdminPointsConfig = lazy(() => import("./pages/AdminPointsConfig"));
const LoyaltyAuditDashboard = lazy(() => import("./pages/LoyaltyAuditDashboard"));
const AdminSkuImagesPage = lazy(() => import("./pages/AdminSkuImagesPage"));
const TeleventaShopOrders = lazy(() => import("./pages/TeleventaShopOrders"));
const TeleventaCoolerExecutions = lazy(() => import("./pages/TeleventaCoolerExecutions"));
const TeleventaRedemptions = lazy(() => import("./pages/TeleventaRedemptions"));
const TeleventaAutoventaOrders = lazy(() => import("./pages/televenta/TeleventaAutoventaOrders"));
const RouteMonitoringPage = lazy(() => import("./pages/televenta/RouteMonitoringPage"));
const TeleventaNewClients = lazy(() => import("./pages/TeleventaNewClients"));
const TeleventaWhatsAppApprovals = lazy(() => import("./pages/televenta/TeleventaWhatsAppApprovals"));
const TeleventaClientHelpCenter = lazy(() => import("./pages/televenta/TeleventaClientHelpCenter"));
const TercerizadosPage = lazy(() => import("./pages/televenta/TercerizadosPage"));
const AdminEvaluationConfigPage = lazy(() => import("./pages/AdminEvaluationConfigPage"));
const AdminMetasPage = lazy(() => import("./pages/AdminMetasPage"));
const AdminClientsMapPage = lazy(() => import("./pages/AdminClientsMapPage"));
const AdminBrandsPage = lazy(() => import("./pages/AdminBrandsPage"));
const ShopAdmin = lazy(() => import("./pages/ShopAdmin"));
const ControlInternoDashboard = lazy(() => import("./pages/ControlInternoDashboard"));
const ControlInternoMapPage = lazy(() => import("./pages/ControlInternoMapPage"));
const SupervisorDashboard = lazy(() => import("./pages/SupervisorDashboard"));
const SupervisorClients = lazy(() => import("./pages/SupervisorClients"));
const SupervisorClientPoints = lazy(() => import("./pages/SupervisorClientPoints"));
const SupervisorVisits = lazy(() => import("./pages/SupervisorVisits"));
const SupervisorClientsMapPage = lazy(() => import("./pages/SupervisorClientsMapPage"));
const SupervisorEvaluationsPage = lazy(() => import("./pages/SupervisorEvaluationsPage"));
const SupervisorScorecard = lazy(() => import("./pages/SupervisorScorecard.jsx"));
const SupervisorCensosPage = lazy(() => import("./pages/SupervisorCensosPage"));
const SupervisorWorkPlan = lazy(() => import("./pages/SupervisorWorkPlan"));
const SupervisorOnboardSupervision = lazy(() => import("./pages/SupervisorOnboardSupervision"));
const SupervisorOnboardSummary = lazy(() => import("./pages/SupervisorOnboardSummary"));
const HRWorkPlansDashboard = lazy(() => import("./pages/hr/HRWorkPlansDashboard"));
const DynamicAdvisorClients = lazy(() => import("./pages/DynamicAdvisorClients"));
const DynamicAdvisorVisits = lazy(() => import("./pages/DynamicAdvisorVisits"));
const DynamicAdvisorRoute = lazy(() => import("./pages/DynamicAdvisorRoute"));
const DynamicAdvisorMap = lazy(() => import("./pages/DynamicAdvisorMap"));
const AdminConquestReports = lazy(() => import('./pages/AdminConquestReports'));
const GerenteDashboard = lazy(() => import('./pages/GerenteDashboard'));
const GerenteClients = lazy(() => import('./pages/GerenteClients'));
const GerenteClientsMapPage = lazy(() => import('./pages/GerenteClientsMapPage'));
const GerenteCallsPage = lazy(() => import('./pages/GerenteCallsPage'));
const CanalModernoPage = lazy(() => import('./pages/CanalModernoPage'));
const InstallerDashboard = lazy(() => import('./pages/installer/InstallerDashboard'));
const ExecuteOrder = lazy(() => import('./pages/installer/ExecuteOrder'));
const AdminInventory = lazy(() => import('./pages/admin/AdminInventory'));
const AdminWorkOrders = lazy(() => import('./pages/admin/AdminWorkOrders'));
const AdminWarehouses = lazy(() => import('./pages/admin/AdminWarehouses'));
const AssetStatusByClient = lazy(() => import('./pages/admin/AssetStatusByClient'));
const NewInstallationRequest = lazy(() => import('./pages/requests/NewInstallationRequest'));
const AdminAssetTypes = lazy(() => import("./pages/admin/AdminAssetTypes"));
const AddAssetToWarehouse = lazy(() => import("./pages/installer/AddAssetToWarehouse"));
const ScanAssetPage = lazy(() => import('./pages/ScanAssetPage'));
const UtilidadesPage = lazy(() => import('./pages/UtilidadesPage'));
const DirectoryPage = lazy(() => import('./pages/DirectoryPage'));
const PriceUploadPage = lazy(() => import("./pages/admin/PriceUploadPage"));
const SalesSimulatorPage = lazy(() => import("./pages/SalesSimulatorPage"));
const ComparativeDashboard = lazy(() => import("./pages/admin/ComparativeDashboard"));
const Um6Dashboard = lazy(() => import("./pages/um6/Um6Dashboard"));
const Um6ManagerPage = lazy(() => import("./pages/um6/Um6ManagerPage"));
const JefeUm6Dashboard = lazy(() => import("./pages/jefeum6/JefeUm6Dashboard"));
const Um6SalesRankingPage = lazy(() => import("./pages/jefeum6/Um6SalesRankingPage"));
const AdminAnnouncements = lazy(() => import("./pages/admin/AdminAnnouncements"));
const AdminMinutas = lazy(() => import("./pages/admin/AdminMinutas"));
const AnalistaIndicatorDashboard = lazy(() => import("./pages/AnalistaIndicatorDashboard"));
const ServicesMapPage = lazy(() => import('./pages/installer/ServicesMapPage'));
const SystemAdminDashboard = lazy(() => import("./pages/admin/SystemAdminDashboard"));
const DeliveryAuditPage = lazy(() => import('./pages/ops/DeliveryAuditPage'));
const DeliveryAuditHistoryPage = lazy(() => import('./pages/ops/DeliveryAuditHistoryPage'));

// Minutas Module
const MinutasDashboard = lazy(() => import("./pages/minutas/MinutasDashboard"));
const MinutaDetailPage = lazy(() => import("./pages/minutas/MinutaDetailPage"));

const DataSyncPage = lazy(() => import("./pages/DataSyncPage"));

// Autoventa Imports (Lazy)
const AutoventaDashboard = lazy(() => import("./pages/autoventa/AutoventaDashboard"));
const AutoventaGeneralDashboard = lazy(() => import("./pages/autoventa/AutoventaGeneralDashboard"));
const AutoventaClientsPage = lazy(() => import("./pages/autoventa/AutoventaClientsPage"));
const AutoventaSalesPage = lazy(() => import("./pages/autoventa/AutoventaSalesPage"));
const AutoventaInventoryPage = lazy(() => import("./pages/autoventa/AutoventaInventoryPage"));
const AutoventaOrdersPage = lazy(() => import("./pages/autoventa/AutoventaOrdersPage"));
const AutoventaStockRequestPage = lazy(() => import("./pages/autoventa/AutoventaStockRequestPage"));
const AutoventaSalesSession = lazy(() => import("./pages/autoventa/AutoventaSalesSession")); // New Route

// Warehouse Imports (Lazy)
const WarehouseDashboard = lazy(() => import("./pages/warehouse/WarehouseDashboard"));
const WarehouseInventory = lazy(() => import('./pages/warehouse/WarehouseInventory'));
const WarehouseTransfers = lazy(() => import('./pages/warehouse/WarehouseTransfers'));
const TruckLoadPage = lazy(() => import("./pages/warehouse/TruckLoadPage"));
const StockAuditPage = lazy(() => import("./pages/warehouse/StockAuditPage"));
const WarehouseHistoryPage = lazy(() => import("./pages/warehouse/WarehouseHistoryPage"));
const RouteLiquidationPage = lazy(() => import("./pages/warehouse/RouteLiquidationPage"));

// Reparto Imports (Lazy)
const DeliveryDashboard = lazy(() => import("./pages/reparto/DeliveryDashboard"));
const DriverPerformanceDashboard = lazy(() => import("./pages/reparto/DriverPerformanceDashboard"));

const CoorTradeDashboard = lazy(() => import("./pages/coortrade/CoorTradeDashboard"));
const GPSTrackingDashboard = lazy(() => import("./pages/ops/GPSTrackingDashboard"));
const TradePromotionsPage = lazy(() => import("./pages/coortrade/TradePromotionsPage"));
const FleetDashboard = lazy(() => import("./pages/ops/FleetDashboard"));

const GerenteTradeDashboard = lazy(() => import("./pages/GerenteTradeDashboard"));

// HR Module Imports (Enterprise)
const CommercialDashboard = lazy(() => import("./pages/hr/CommercialDashboard"));
const CommissionsPage = lazy(() => import("./pages/hr/CommissionsPage"));
const HRAdminDashboard = lazy(() => import("./pages/hr/HRAdminDashboard"));
const AttendanceKiosk = lazy(() => import("./pages/hr/AttendanceKiosk"));
const UserProfile = lazy(() => import("./pages/profile/UserProfile"));

// Recruitment Module (Careers + RRHH Admin)
const CareersPage = lazy(() => import("./pages/careers/CareersPage"));
const JobDetailPage = lazy(() => import("./pages/careers/JobDetailPage"));
const RecruitmentDashboard = lazy(() => import("./pages/rrhh/RecruitmentDashboard"));
const JobPostingManager = lazy(() => import("./pages/rrhh/JobPostingManager"));
const ApplicantDetailPage = lazy(() => import("./pages/rrhh/ApplicantDetailPage"));

// Admin Analytics
const PromotionsAnalysisPage = lazy(() => import("./pages/admin/PromotionsAnalysisPage"));
const AdminAssetAlertsPage = lazy(() => import("./pages/AdminAssetAlertsPage"));

// Helpdesk
const MyTicketsDashboard = lazy(() => import("./pages/helpdesk/MyTicketsDashboard"));
const AdminHelpdeskDashboard = lazy(() => import("./pages/helpdesk/AdminHelpdeskDashboard"));
const AdminPushBroadcastPage = lazy(() => import("./pages/AdminPushBroadcastPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));

// Legal Pages
const TerminosPage = lazy(() => import("./pages/legal/TerminosPage"));
const AvisoPrivacidadPage = lazy(() => import("./pages/legal/AvisoPrivacidadPage"));

// Portafolio & Nosotros
const PortafolioPublicPage = lazy(() => import("./pages/public/PortafolioPublicPage"));
const NosotrosPublicPage = lazy(() => import("./pages/public/NosotrosPublicPage"));
const AdminPortfolioPage = lazy(() => import("./pages/admin/AdminPortfolioPage"));
const AdminAboutUsPage = lazy(() => import("./pages/admin/AdminAboutUsPage"));
const GeoAuditPage = lazy(() => import("./pages/admin/GeoAuditPage"));
const AdminSkuManagerPage = lazy(() => import("./pages/AdminSkuManagerPage"));
const AdminDescuentosPage = lazy(() => import("./pages/AdminDescuentosPage"));
const LiquidacionesReportPage = lazy(() => import("./pages/admin/LiquidacionesReportPage"));
const TicketTemplatesPage = lazy(() => import("./pages/admin/TicketTemplatesPage"));
const PrinterSettingsPage = lazy(() => import("./pages/settings/PrinterSettingsPage"));
const AdminEmployeesPage = lazy(() => import("./pages/admin/AdminEmployeesPage"));
const AdminEmployeeDetailPage = lazy(() => import("./pages/admin/AdminEmployeeDetailPage"));
const AdminEmployeeEquipment = lazy(() => import("./pages/admin/AdminEmployeeEquipment"));
const AdminTimeOffPage = lazy(() => import("./pages/admin/AdminTimeOffPage"));
const ControlInternoAuditsMenu = lazy(() => import("./pages/ControlInternoAuditsMenu"));
const ControlInternoAuditorDashboard = lazy(() => import("./pages/ControlInternoAuditorDashboard"));
const InstallerInstallations = lazy(() => import("./pages/installer/InstallerInstallations"));
const DynamicSurveyPage = lazy(() => import("./pages/supervisor/DynamicSurveyPage"));

const ROLE_TO_HOME_PATH = {
  'admin': '/admin/dashboard',
  'administrador': '/admin/dashboard',
  'conquista': '/conquista/dashboard',
  'asesor-dinamico': '/asesor-dinamico/dashboard',
  'asesor dinamico': '/asesor-dinamico/dashboard',
  'asesor_dinamico': '/asesor-dinamico/dashboard',
  'asesor': '/asesor-dinamico/dashboard',
  'televenta': '/televenta/dashboard',
  'control interno': '/control-interno/dashboard',
  'control-interno': '/control-interno/dashboard',
  'supervisor': '/supervisor/dashboard',
  'gerente': '/gerente/dashboard',
  'gerencia': '/gerente/dashboard',
  'gerente-trade': '/gerente-trade/dashboard',
  'gerentetrade': '/gerente-trade/dashboard',
  'gerente de trade': '/gerente-trade/dashboard',
  'sistemas': '/admin/system-users',
  'sistemashop': '/admin/shop',
  'sistema shop': '/admin/shop',
  'sistema-shop': '/admin/shop',
  'sistema_shop': '/admin/shop',
  'um6': '/um6/dashboard',
  'installer': '/installer/dashboard',
  'instalador': '/installer/dashboard',
  'autoventa': '/autoventa/dashboard',
  'chofer': '/delivery',
  'preventa': '/autoventa/general-dashboard',
  'almacenista': '/warehouse/dashboard',
  'operaciones': '/ops/fleet',
  'flota': '/ops/fleet',
  'bodega': '/warehouse/dashboard',
  'almacen': '/warehouse/dashboard',
  'warehouse': '/warehouse/dashboard',
  'logistica': '/warehouse/dashboard',
  'concesion': '/conquista/mapa',
  'coortrade': '/coortrade/dashboard',
  'coorcon': '/conquista/coordinator-dashboard',
  'coordinador conquista': '/conquista/coordinator-dashboard',
  'rh': '/admin/hr-dashboard',
  'rrhh': '/admin/hr-dashboard',
  'analista': '/analista/dashboard',
  'jefe de operaciones': '/ops/fleet',
  'jefe-operaciones': '/ops/fleet',
  'jefe operaciones': '/ops/fleet',
  'jefeoperaciones': '/ops/fleet',
  'kiosko': '/kiosk',
  'jefeum6': '/jefeum6/dashboard',
  'jefe-um6': '/jefeum6/dashboard',
  'jefe um6': '/jefeum6/dashboard',
};

function getHomePathForRole(rawRole) {
  const normalized = (rawRole || '').toString().trim().toLowerCase().replace(/[_-]/g, ' ');
  return ROLE_TO_HOME_PATH[normalized] || ROLE_TO_HOME_PATH[normalized.replace(/\s+/g, '-')] || '/clients';
}

/**
 * Validador estricto de rutas por rol.
 * Retorna true si el rol tiene permiso para navegar a pathname; de lo contrario false.
 */
function isRouteAllowed(pathname, rawRole) {
  if (!pathname || pathname === '/' || pathname === '') return true;
  const path = pathname.toLowerCase();
  const role = (rawRole || '').toString().trim().toLowerCase().replace(/[_-]/g, ' ');

  // 1. Administrador y Sistemas: Acceso total e ilimitado
  if (role === 'admin' || role === 'administrador' || role === 'sistemas') {
    return true;
  }

  // 1b. Sistema Shop (Control 100% de la Tienda / Shop):
  if (role === 'sistemashop' || role === 'sistema shop' || role === 'sistema-shop' || role === 'sistema_shop') {
    const allowedShopPrefixes = [
      '/admin/shop',
      '/admin/loyalty-audit',
      '/admin/points-config',
      '/admin/sku-images',
      '/admin/brands',
      '/admin/push-broadcast',
      '/admin/price-upload',
      '/admin/promotions',
      '/admin/clients',
      '/admin/helpdesk',
      '/televenta/shop-orders',
      '/televenta/cooler-executions',
      '/televenta/redemptions',
      '/televenta/new-clients',
      '/televenta/whatsapp-approvals',
      '/televenta/atencion-cliente',
      '/supervisor/points',
      '/sales-simulator',
      '/clients',
      '/preventa',
      '/notificaciones',
      '/profile',
      '/utilidades',
      '/mis-tickets',
      '/directory'
    ];
    return allowedShopPrefixes.some(prefix => path === prefix || path.startsWith(prefix + '/') || path.startsWith(prefix + '?'));
  }

  // 2. Kiosko: acceso estrictamente a /kiosk
  if (role === 'kiosko') {
    return path === '/kiosk' || path.startsWith('/kiosk/');
  }

  // 3. UM6: acceso estrictamente a /um6/dashboard
  if (role === 'um6') {
    return path.startsWith('/um6/dashboard');
  }

  // 4. Reglas estrictas para todas las rutas bajo /admin/*
  if (path.startsWith('/admin')) {
    // a) /admin/settings: EXCLUSIVO admin y sistemas (NUNCA supervisor ni otros)
    if (path.startsWith('/admin/settings')) {
      return false;
    }

    // b) Usuarios y gestión del sistema: EXCLUSIVO admin y sistemas
    if (path.startsWith('/admin/users') || path.startsWith('/admin/system-users')) {
      return false;
    }

    // c) Subrutas administrativas compartidas con roles específicos:
    if (path.startsWith('/admin/comparative-sales')) {
      const allowed = ['supervisor', 'gerente', 'gerencia', 'gerente trade', 'gerente-trade', 'gerentetrade', 'coortrade', 'analista'];
      return allowed.includes(role);
    }
    if (path.startsWith('/admin/hr-dashboard') || path.startsWith('/admin/hr') || path.startsWith('/admin/announcements')) {
      return role === 'rh' || role === 'rrhh';
    }
    if (path.startsWith('/admin/conquest-reports')) {
      return role === 'coorcon' || role === 'coordinador conquista' || role === 'conquista';
    }
    if (path.startsWith('/admin/loyalty-audit')) {
      const allowed = ['control interno', 'control-interno', 'supervisor', 'gerente', 'gerencia', 'analista', 'operaciones', 'sistemashop', 'sistema shop'];
      return allowed.includes(role);
    }
    if (path.startsWith('/admin/sales-import')) {
      return role === 'analista';
    }
    if (path.startsWith('/admin/helpdesk') || path.startsWith('/admin/minutas')) {
      return role === 'analista' || role === 'televenta';
    }
    if (path.startsWith('/admin/mapa-clientes')) {
      const allowed = ['supervisor', 'gerente', 'gerencia', 'operaciones', 'flota', 'jefe operaciones', 'jefeoperaciones'];
      return allowed.includes(role);
    }
    if (path.startsWith('/admin/inventory') || path.startsWith('/admin/work-orders') || path.startsWith('/admin/warehouses') || path.startsWith('/admin/asset-')) {
      if ((role === 'jefe operaciones' || role === 'jefeoperaciones') && path.startsWith('/admin/inventory')) {
        return false;
      }
      const allowed = ['almacen', 'almacenista', 'warehouse', 'bodega', 'logistica', 'jefe operaciones', 'jefeoperaciones', 'operaciones'];
      return allowed.includes(role);
    }

    // Todas las demás rutas de /admin:
    // (panel, metrics, dashboard, shop, push-broadcast, geo-audit, price-upload, points-config, evaluation-config, brands, portafolio, nosotros, clients, visits, evaluations, metas, sku-images, promotions, ticket-templates)
    // DENEGADAS para cualquier rol no administrador
    return false;
  }

  // 5. Reglas para /supervisor/*
  if (path.startsWith('/supervisor')) {
    const allowed = ['supervisor', 'gerente', 'gerencia', 'coortrade', 'analista', 'rh', 'rrhh'];
    return allowed.includes(role);
  }

  // 6. Reglas para /gerente/*
  if (path.startsWith('/gerente')) {
    if (path.startsWith('/gerente/calls')) {
      return ['gerente', 'gerencia', 'supervisor'].includes(role);
    }
    return ['gerente', 'gerencia'].includes(role);
  }

  // 7. Reglas para /asesor-dinamico/*
  if (path.startsWith('/asesor-dinamico')) {
    const allowed = ['asesor dinamico', 'asesor-dinamico', 'asesor_dinamico', 'asesor'];
    return allowed.includes(role);
  }

  // 8. Reglas para /conquista/*
  if (path.startsWith('/conquista')) {
    if (path.startsWith('/conquista/ranking')) {
      return ['conquista', 'coorcon', 'coordinador conquista', 'supervisor', 'coortrade'].includes(role);
    }
    if (path.startsWith('/conquista/mapa')) {
      return ['conquista', 'coorcon', 'coordinador conquista', 'concesion'].includes(role);
    }
    if (path.startsWith('/conquista/coordinator-dashboard')) {
      return ['coorcon', 'coordinador conquista'].includes(role);
    }
    return ['conquista', 'coorcon', 'coordinador conquista'].includes(role);
  }

  // 9. Reglas para /televenta/*
  if (path.startsWith('/televenta')) {
    if (path.startsWith('/televenta/tercerizados')) {
      return ['televenta', 'supervisor', 'gerente', 'gerencia'].includes(role);
    }
    if (path.startsWith('/televenta/monitoring')) {
      return ['televenta', 'almacen', 'almacenista', 'warehouse', 'logistica', 'jefe operaciones', 'jefeoperaciones'].includes(role);
    }
    return role === 'televenta';
  }

  // 10. Reglas para /control-interno/*
  if (path.startsWith('/control-interno')) {
    return role === 'control interno' || role === 'control-interno';
  }

  // 11. Reglas para /autoventa/*
  if (path.startsWith('/autoventa')) {
    return role === 'autoventa' || role === 'preventa';
  }

  // 12. Reglas para /warehouse/*
  if (path.startsWith('/warehouse')) {
    const allowed = ['almacen', 'almacenista', 'warehouse', 'bodega', 'logistica'];
    return allowed.includes(role);
  }

  // 13. Reglas para /delivery/*
  if (path.startsWith('/delivery')) {
    return role === 'chofer';
  }

  // 14. Reglas para /installer/*
  if (path.startsWith('/installer')) {
    const allowed = ['installer', 'instalador', 'jefe operaciones', 'jefeoperaciones'];
    return allowed.includes(role);
  }

  // 15. Reglas para /um6/* y /jefeum6/*
  if (path.startsWith('/um6')) {
    return role === 'um6';
  }
  if (path.startsWith('/jefeum6')) {
    return ['jefeum6', 'jefe um6', 'jefe-um6'].includes(role);
  }

  // 16. Reglas para /coortrade/* y /gerente-trade/*
  if (path.startsWith('/coortrade')) {
    return role === 'coortrade';
  }
  if (path.startsWith('/gerente-trade')) {
    return ['gerente trade', 'gerente-trade', 'gerentetrade', 'gerente de trade'].includes(role);
  }

  // 17. Reglas para /rrhh/* y /hr/dashboard
  if (path.startsWith('/hr/dashboard')) {
    const allowed = ['supervisor', 'gerente', 'gerencia', 'coortrade', 'analista', 'rh', 'rrhh', 'televenta', 'asesor dinamico', 'asesor-dinamico', 'asesor_dinamico', 'asesor', 'autoventa', 'preventa'];
    return allowed.includes(role);
  }
  if (path.startsWith('/rrhh')) {
    return ['rh', 'rrhh', 'analista'].includes(role);
  }

  // 18. Reglas para /analista/*
  if (path.startsWith('/analista')) {
    return role === 'analista';
  }

  // 19. Reglas para /kiosk
  if (path === '/kiosk' || path.startsWith('/kiosk/')) {
    return ['kiosko', 'rh', 'rrhh'].includes(role);
  }

  // 20. Reglas para /ops/*
  if (path.startsWith('/ops/fleet')) {
    const allowed = ['operaciones', 'flota', 'jefe operaciones', 'jefe-operaciones', 'jefeoperaciones'];
    return allowed.includes(role);
  }
  if (path.startsWith('/ops/delivery-audit')) {
    const allowed = ['control interno', 'control-interno', 'supervisor', 'analista', 'gerente', 'gerencia'];
    return allowed.includes(role);
  }

  // 21. Restricción específica de control interno
  if ((role === 'control interno' || role === 'control-interno') && (path.startsWith('/preventa') || path.startsWith('/preventas'))) {
    return false;
  }

  // Rutas generales y comunes permitidas para usuarios autenticados
  return true;
}

function ProtectedOutlet() {
  const { user, loading, roleType } = useSupabaseAuth();
  const location = useLocation();
  const path = location.pathname;
  const [dbRole, setDbRole] = useState(null);
  const [roleLoaded, setRoleLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    const directRole = roleType
      || user?.profile?.role
      || user?.user_metadata?.type
      || user?.user_metadata?.role
      || user?.app_metadata?.role
      || user?.app_metadata?.roles?.[0]
      || user?.raw_app_meta_data?.role
      || user?.raw_user_meta_data?.type;

    if (!user || directRole) {
      setRoleLoaded(true);
      return () => { active = false; };
    }

    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
      .then(({ data }) => {
        if (active) setDbRole(data?.role || null);
      })
      .finally(() => {
        if (active) setRoleLoaded(true);
      });

    return () => { active = false; };
  }, [user, roleType]);

  if (loading) return <FullPageLoader />;

  if (!user) return <Navigate to="/login" replace />;

  if (user?.user_metadata?.must_change_password) {
    return <Navigate to="/force-password-change" replace />;
  }

  const mustChange = user?.user_metadata?.must_change_password;
  if (mustChange && path !== '/force-password-change') {
    return <Navigate to="/force-password-change" replace />;
  }

  const effectiveRole = roleType
    || user?.profile?.role
    || user?.user_metadata?.type
    || user?.user_metadata?.role
    || user?.app_metadata?.role
    || user?.app_metadata?.roles?.[0]
    || user?.raw_app_meta_data?.role
    || user?.raw_user_meta_data?.type
    || dbRole;

  if (!effectiveRole && !roleLoaded) {
    return <FullPageLoader />;
  }

  // 🛡️ VERIFICACIÓN ESTRICTA DE RUTAS Y PERMISOS POR ROL
  const isAllowed = isRouteAllowed(path, effectiveRole);
  if (!isAllowed) {
    const targetDest = getHomePathForRole(effectiveRole);
    console.warn(`[ProtectedOutlet] ⛔ Acceso denegado a "${path}" para el rol "${effectiveRole}". Redirigiendo a "${targetDest}".`);
    return <Navigate to={targetDest} replace />;
  }

  return <Outlet />;
}

function RoleRedirect() {
  const { user, roleType } = useSupabaseAuth();
  const [profileRole, setProfileRole] = useState(null);
  const [profileRoleLoaded, setProfileRoleLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    const directRole = roleType
      || user?.profile?.role
      || user?.user_metadata?.type
      || user?.user_metadata?.role
      || user?.app_metadata?.role
      || user?.app_metadata?.roles?.[0]
      || user?.raw_app_meta_data?.role
      || user?.raw_user_meta_data?.type;

    if (!user || directRole) {
      setProfileRoleLoaded(true);
      return () => { active = false; };
    }

    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
      .then(({ data }) => {
        if (active) setProfileRole(data?.role || null);
      })
      .finally(() => {
        if (active) setProfileRoleLoaded(true);
      });

    return () => { active = false; };
  }, [user, roleType]);

  if (!user) return <Navigate to="/login" replace />;

  if (user?.user_metadata?.must_change_password) {
    return <Navigate to="/force-password-change" replace />;
  }

  const type = roleType
    || user.profile?.role
    || user.user_metadata?.type
    || user.user_metadata?.role
    || user.app_metadata?.role
    || user.app_metadata?.roles?.[0]
    || user.raw_app_meta_data?.role
    || user.raw_user_meta_data?.type
    || profileRole;

  if (!type && !profileRoleLoaded) return <FullPageLoader />;

  const dest = getHomePathForRole(type);
  return <Navigate to={dest} replace />;
}



const AnimatedLayout = () => {
  return (
    <Layout>
      <Suspense fallback={<FullPageLoader />}>
        <Outlet />
      </Suspense>
    </Layout>
  );
}

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/force-password-change", element: <ForcePasswordChangePage /> },
  { path: "/register", element: <RegisterPage /> },
  { path: "/sync-initial", element: <DataSyncPage /> },
  { 
    path: "/careers", 
    element: <Suspense fallback={<FullPageLoader />}><CareersPage /></Suspense> 
  },
  { 
    path: "/careers/:jobId", 
    element: <Suspense fallback={<FullPageLoader />}><JobDetailPage /></Suspense> 
  },
  { 
    path: "/portafolio", 
    element: <Suspense fallback={<FullPageLoader />}><PortafolioPublicPage /></Suspense> 
  },
  { 
    path: "/nosotros", 
    element: <Suspense fallback={<FullPageLoader />}><NosotrosPublicPage /></Suspense> 
  },
  {
    path: "/terminos",
    element: <Suspense fallback={<FullPageLoader />}><TerminosPage /></Suspense>
  },
  {
    path: "/aviso-privacidad",
    element: <Suspense fallback={<FullPageLoader />}><AvisoPrivacidadPage /></Suspense>
  },
  {
    path: "/",
    element: <ProtectedOutlet />,
    children: [
      {
        element: <AnimatedLayout />,
        children: [
          { index: true, element: <RoleRedirect /> },
          { path: "admin/panel", element: <AdminPanel /> },
          { path: "admin/metrics", element: <AdminDashboard /> },
          { path: "admin/dashboard", element: <AdminDashboard /> },
          { path: "admin/shop", element: <ShopAdmin /> },
          { path: "admin/system-users", element: <SystemAdminDashboard /> },
          { path: "admin/hr-dashboard", element: <HRAdminDashboard /> },
          { path: "admin/push-broadcast", element: <AdminPushBroadcastPage /> },
          { path: "admin/portafolio", element: <AdminPortfolioPage /> },
          { path: "admin/nosotros", element: <AdminAboutUsPage /> },
          { path: "admin/geo-audit", element: <GeoAuditPage /> },
          { path: "jefeum6/dashboard", element: <JefeUm6Dashboard /> },
          { path: "admin/clients", element: <AdminClients /> },
          { path: "admin/users", element: <AdminUsersPage /> },
          { path: "admin/visits", element: <AdminVisits /> },
          { path: "admin/settings", element: <AdminSettingsPage /> },
          { path: "admin/sales-import", element: <AdminSalesImportPage /> },
          { path: "admin/evaluation-config", element: <AdminEvaluationConfigPage /> },
          { path: "admin/metas", element: <AdminMetasPage /> },
          { path: "admin/mapa-clientes", element: <AdminClientsMapPage /> },
          { path: "admin/evaluations", element: <AdminEvaluationsPage /> },
          { path: "admin/sku-images", element: <AdminSkuImagesPage /> },
          { path: "admin/conquest-reports", element: <AdminConquestReports /> },
          { path: "admin/inventory", element: <AdminInventory /> },
          { path: "admin/work-orders", element: <AdminWorkOrders /> },
          { path: "admin/warehouses", element: <AdminWarehouses /> },
          { path: "admin/asset-status", element: <AssetStatusByClient /> },
          { path: "admin/asset-alerts", element: <AdminAssetAlertsPage /> },
          { path: "admin/asset-types", element: <AdminAssetTypes /> },
          { path: "admin/price-upload", element: <PriceUploadPage /> },
          { path: "admin/comparative-sales", element: <ComparativeDashboard /> },
          { path: "admin/loyalty-audit", element: <LoyaltyAuditDashboard /> },
          { path: "admin/points-config", element: <AdminPointsConfig /> },
          { path: "admin/brands", element: <AdminBrandsPage /> },
          { path: "admin/helpdesk", element: <AdminHelpdeskDashboard /> },
          { path: "admin/announcements", element: <AdminAnnouncements /> },
          { path: "admin/minutas", element: <AdminMinutas /> },
          { path: "admin/minutas/:minutaId", element: <MinutaDetailPage /> },
          { path: "admin/skus", element: <AdminSkuManagerPage /> },
          { path: "admin/descuentos", element: <AdminDescuentosPage /> },
          { path: "admin/reporte-liquidaciones", element: <LiquidacionesReportPage /> },
          { path: "admin/ticket-templates", element: <TicketTemplatesPage /> },
          { path: "admin/hr/employees", element: <AdminEmployeesPage /> },
          { path: "admin/hr/employees/:employeeId", element: <AdminEmployeeDetailPage /> },
          { path: "admin/hr/equipment", element: <AdminEmployeeEquipment /> },
          { path: "admin/hr/time-off", element: <AdminTimeOffPage /> },
          { path: "settings/printer", element: <PrinterSettingsPage /> },
          { path: "sales-simulator", element: <SalesSimulatorPage /> },

          { path: "orders", element: <NewInstallationRequest /> },

          { path: "clients", element: <ClientsPage /> },
          { path: "clients/:clientId", element: <ClientDetailsPage /> },
          { path: "clients/:clientId/simulator", element: <SalesSimulatorPage /> },

          { path: "visits", element: <VisitsPage /> },
          { path: "preventa", element: <PreventaPage /> },
          { path: "preventas", element: <PreventaPage /> },
          { path: "preventas/:id", element: <PreventaDetailPage /> },
          { path: "installer/installations", element: <InstallerInstallations /> },
          { path: "conquista/clientes", element: <ClientsPage /> },
          { path: "control-interno/audits", element: <ControlInternoAuditsMenu /> },
          { path: "control-interno/hallazgos", element: <ControlInternoAuditorDashboard /> },
          { path: "supervisor/custom-survey", element: <DynamicSurveyPage /> },

          {
            path: "ops/delivery-audit",
            element: <DeliveryAuditPage />
          },
          {
            path: "ops/delivery-audit-history",
            element: <DeliveryAuditHistoryPage />
          },
          { path: "scan-asset", element: <ScanAssetPage /> },

          { path: "installer/dashboard", element: <InstallerDashboard /> },
          { path: "installer/services-map", element: <ServicesMapPage /> },
          { path: "installer/order/:orderId", element: <ExecuteOrder /> },
          { path: "installer/add-asset", element: <AddAssetToWarehouse /> },

          { path: "conquista/dashboard", element: <ConquestDashboard /> },
          { path: "conquista/coordinator-dashboard", element: <CoorconDashboard /> }, // New Premium Dashboard for Coordinator
          { path: "conquista/mapa", element: <ConquestMapPage /> },
          { path: "conquista/clientes/:clientId/simulator", element: <SalesSimulatorPage /> },
          { path: "conquista/ranking", element: <ConquistaRankingPage /> },

          { path: "asesor-dinamico/dashboard", element: <DynamicAdvisorDashboard /> },
          { path: "notificaciones", element: <NotificationsPage /> },
          { path: "asesor-dinamico/clientes", element: <DynamicAdvisorClients /> },
          { path: "asesor-dinamico/visitas", element: <DynamicAdvisorVisits /> },
          { path: "asesor-dinamico/ruta", element: <DynamicAdvisorRoute /> },
          { path: "asesor-dinamico/mapa", element: <DynamicAdvisorMap /> },
          { path: "asesor-dinamico/clientes/:clientId/simulator", element: <SalesSimulatorPage /> },

          { path: "televenta/dashboard", element: <TelesalesDashboard /> },
          { path: "televenta/llamadas", element: <TeleventaPage /> },
          { path: "televenta/atencion-cliente", element: <TeleventaClientHelpCenter /> },
          { path: "televenta/whatsapp-approvals", element: <TeleventaWhatsAppApprovals /> },
          { path: "televenta/new-clients", element: <TeleventaNewClients /> },
          { path: "televenta/tercerizados", element: <TercerizadosPage /> },
          { path: "televenta/autoventa-orders", element: <TeleventaAutoventaOrders /> },
          { path: "televenta/shop-orders", element: <TeleventaShopOrders /> },
          { path: "televenta/cooler-executions", element: <TeleventaCoolerExecutions /> },
          { path: "televenta/redemptions", element: <TeleventaRedemptions /> },
          { path: "televenta/monitoring", element: <RouteMonitoringPage /> },
          { path: "televenta/work-orders", element: <AdminWorkOrders /> },
          { path: "televenta/helpdesk", element: <AdminHelpdeskDashboard /> },

          { path: "control-interno/dashboard", element: <ControlInternoDashboard /> },
          { path: "control-interno/auditoria-puntos", element: <LoyaltyAuditDashboard /> },
          { path: "control-interno/mapa", element: <ControlInternoMapPage /> },

          { path: "supervisor/dashboard", element: <SupervisorDashboard /> },
          { path: "supervisor/clients", element: <SupervisorClients /> },
          { path: "supervisor/points", element: <SupervisorClientPoints /> },
          // Added a specific route for the supervisor to access the simulator
          { path: "supervisor/clients/:clientId/simulator", element: <SalesSimulatorPage /> },
          { path: "supervisor/visitas", element: <SupervisorVisits /> },
          { path: "supervisor/mapa-clientes", element: <SupervisorClientsMapPage /> },
          { path: "supervisor/evaluations", element: <SupervisorEvaluationsPage /> },
          { path: "supervisor/scorecard", element: <SupervisorScorecard /> },
          { path: "supervisor/censos", element: <SupervisorCensosPage /> },
          { path: "supervisor/work-plan", element: <SupervisorWorkPlan /> },
          { path: "supervisor/onboard-supervision/:sessionId?", element: <SupervisorOnboardSupervision /> },
          { path: "supervisor/onboard-summary", element: <SupervisorOnboardSummary /> },

          { path: "gerente/dashboard", element: <GerenteDashboard /> },
          { path: "gerente/clients", element: <GerenteClients /> },
          { path: "gerente/mapa-clientes", element: <GerenteClientsMapPage /> },
          { path: "gerente/calls", element: <GerenteCallsPage /> },
          { path: "gerente/um6", element: <Um6ManagerPage /> },

          { path: "um6/dashboard", element: <Um6Dashboard /> },

          { path: "jefeum6/clients", element: <SupervisorClients cadenaFilter="UM6" readOnly /> },
          { path: "jefeum6/points", element: <SupervisorClientPoints cadenaFilter="UM6" /> },
          { path: "jefeum6/clients/:clientId/simulator", element: <SalesSimulatorPage /> },
          { path: "jefeum6/ventas", element: <Um6SalesRankingPage /> },

          // CoorTrade Routes
          { path: "coortrade/dashboard", element: <CoorTradeDashboard /> },
          { path: "coortrade/clients", element: <SupervisorClients /> },
          { path: "coortrade/points", element: <SupervisorClientPoints /> },
          { path: "coortrade/clients/:clientId/simulator", element: <SalesSimulatorPage /> },
          { path: "coortrade/visitas", element: <SupervisorVisits /> },
          { path: "coortrade/map", element: <SupervisorClientsMapPage /> },
          { path: "coortrade/comparative", element: <ComparativeDashboard /> },
          { path: "coortrade/scorecard", element: <SupervisorScorecard /> },
          { path: "coortrade/evaluations", element: <SupervisorEvaluationsPage /> },
          { path: "coortrade/gps", element: <GPSTrackingDashboard /> },
          { path: "coortrade/promotions", element: <TradePromotionsPage /> },
          { path: "gerente-trade/dashboard", element: <GerenteTradeDashboard /> },
          { path: "ops/fleet", element: <FleetDashboard /> },

          { path: "evaluaciones", element: <SupervisorEvaluationsPage /> },
          { path: "evaluaciones/nueva", element: <NuevaEvaluacion /> },


          // RRHH Recruitment Admin
          { path: "rrhh/recruitment", element: <RecruitmentDashboard /> },
          { path: "rrhh/jobs", element: <JobPostingManager /> },
          { path: "rrhh/jobs/new", element: <JobPostingManager /> },
          { path: "rrhh/applicants/:applicantId", element: <ApplicantDetailPage /> },
          { path: "evaluacion/canal-moderno", element: <CanalModernoPage /> },

          // Admin Analytics
          { path: "admin/promotions", element: <PromotionsAnalysisPage /> },
          { path: "admin/comparative-sales", element: <ComparativeDashboard /> },

          { path: "utilidades", element: <UtilidadesPage /> },
          { path: "directorio", element: <DirectoryPage /> },
          { path: "mis-tickets", element: <MyTicketsDashboard /> },

          // Autoventa Routes - Expanded
          { path: "autoventa/general-dashboard", element: <AutoventaGeneralDashboard /> },
          { path: "autoventa/dashboard", element: <AutoventaDashboard /> },
          { path: "autoventa/clients", element: <AutoventaClientsPage /> },
          { path: "autoventa/sales", element: <AutoventaSalesPage /> },
          { path: "autoventa/inventory", element: <AutoventaInventoryPage /> },
          { path: "autoventa/orders", element: <AutoventaOrdersPage /> },
          { path: "autoventa/request", element: <AutoventaStockRequestPage /> },
          { path: "autoventa/session", element: <AutoventaSalesSession /> }, // Dedicated Session

          // Warehouse Routes
          { path: "warehouse/dashboard", element: <WarehouseDashboard /> },
          { path: "warehouse/inventory", element: <WarehouseInventory /> },
          { path: "warehouse/transfers", element: <WarehouseTransfers /> },
          { path: "warehouse/load", element: <TruckLoadPage /> },
          { path: "warehouse/audit", element: <StockAuditPage /> },
          { path: "warehouse/history", element: <WarehouseHistoryPage /> },
          { path: "warehouse/liquidation", element: <RouteLiquidationPage /> },

          // Reparto Routes
          { path: "delivery", element: <DeliveryDashboard /> },
          { path: "delivery/performance", element: <DriverPerformanceDashboard /> },

          // HR / Enterprise Module Routes
          { path: "hr/dashboard", element: <SupervisorDashboard /> },
          { path: "hr/work-plans", element: <HRWorkPlansDashboard /> },
          { path: "hr/commissions", element: <CommissionsPage /> },
          { path: "kiosk", element: <AttendanceKiosk /> }, // Global Kiosk Route
          { path: "profile", element: <UserProfile /> }, // New User Profile Route

          // Analista Routes
          { path: "analista/dashboard", element: <AnalistaIndicatorDashboard /> },
          { path: "analista/minutas", element: <MinutasDashboard /> },

          // Minutas (user-facing)
          { path: "minutas", element: <MinutasDashboard /> },
          { path: "minutas/:minutaId", element: <MinutaDetailPage /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);


import { useGPSTracking } from "./hooks/useGPSTracking";

export default function App() {
  useOfflineSync();
  useGPSTracking();
  const { toast } = useToast();
  const [apkUpdate, setApkUpdate] = useState(null);

  useEffect(() => {
    const handleSyncCompleted = (event) => {
      const count = event.detail?.count || 0;
      toast({
        title: "Sincronización Completada",
        description: `Se han subido ${count} operaciones pendientes exitosamente.`,
        duration: 4000,
        className: "bg-green-600 text-white border-none",
      });
    };

    window.addEventListener('sync-completed', handleSyncCompleted);
    return () => window.removeEventListener('sync-completed', handleSyncCompleted);
  }, []);

  useEffect(() => {
    const handleOfflineStorageError = (event) => {
      toast({
        title: 'Almacenamiento offline no disponible',
        description: `${event.detail?.message || 'No se pudo iniciar SQLite.'} No captures visitas, ventas ni cambios hasta reiniciar la aplicación.`,
        variant: 'destructive',
        duration: 12000,
      });
    };

    window.addEventListener('offline-storage-error', handleOfflineStorageError);
    return () => window.removeEventListener('offline-storage-error', handleOfflineStorageError);
  }, [toast]);

  // Interceptor global para APK / Electron: si cualquier <img> falla al cargar una ruta
  // relativa local (p. ej. /portafolio/..., /bronce.png, /uploads/..., /login/..., /brands/...),
  // redirigirla automáticamente a https://cervezasfinas.com/...
  useEffect(() => {
    const handleGlobalImgError = (event) => {
      const target = event?.target;
      if (!target || target.tagName !== 'IMG') return;
      if (target.dataset?.cfRemoteTried === '1') return;

      const rawAttr = target.getAttribute('src') || '';
      const currentSrc = target.currentSrc || target.src || '';
      if (!rawAttr && !currentSrc) return;
      if (rawAttr.startsWith('data:') || rawAttr.startsWith('blob:')) return;

      let pathname = '';
      if (rawAttr.startsWith('/') && !rawAttr.startsWith('//')) {
        pathname = rawAttr;
      } else if (/^(https?:\/\/localhost|capacitor:\/\/localhost|file:\/\/)/i.test(currentSrc)) {
        try {
          const parsed = new URL(currentSrc);
          pathname = parsed.pathname + (parsed.search || '');
        } catch {}
      }

      if (pathname && pathname !== '/placeholder.svg') {
        target.dataset.cfRemoteTried = '1';
        target.src = `https://cervezasfinas.com${pathname}`;
      }
    };

    window.addEventListener('error', handleGlobalImgError, true);
    return () => window.removeEventListener('error', handleGlobalImgError, true);
  }, []);

  useEffect(() => {
    const initServices = async () => {
      console.log('[App] Iniciando servicios...');

      try {
        await SplashScreen.hide();
      } catch (e) {
        console.warn('[App] Error hiding splash:', e);
      }

      try {
        // Inicializar notificaciones push
        console.log('[App] Inicializando notificaciones...');
        await NotificationService.init();
        console.log('[App] Notificaciones inicializadas.');
      } catch (e) {
        console.error('[App] Error inicializando notificaciones:', e);
      }

      try {
        // Registrar Service Worker para PWA
        console.log('[App] Registrando SW...');
        registerServiceWorker();
        console.log('[App] SW registrado.');
      } catch (e) {
        console.error('[App] Error registrando SW:', e);
      }

      try {
        // Check for APK updates only on native platforms (Android/iOS)
        if (Capacitor.isNativePlatform()) {
          // try Supabase first, then version.json fallback
          let update = null;
          try {
            const { data: apkData } = await supabase
              .from('global_settings')
              .select('value')
              .eq('key', 'latest_apk_version')
              .maybeSingle();
            if (apkData?.value) {
              const apk = typeof apkData.value === 'string' ? JSON.parse(apkData.value) : apkData.value;
              if (apk.version && isNewerVer(apk.version, APP_CURRENT_VERSION)) {
                update = { hasUpdate: true, version: apk.version, url: apk.url, force: apk.force || false, notes: apk.notes };
              }
            }
          } catch (e) {}
          // Fallback to version.json
          if (!update) {
            update = await checkForUpdate();
          }
          if (update && update.hasUpdate) {
            console.log(`[APK] Nueva versión disponible: ${update.version}`);
            setApkUpdate(update);
          }
        }
      } catch (e) {
        console.error('[App] Error checking for updates:', e);
      }

      // Check for OTA Update (Self-Hosted) - ONLY ON NATIVE PLATFORMS
      if (Capacitor.isNativePlatform()) {
        try {
          // ── PASO 1: Notificar que el bundle actual funciona correctamente ──
          // Esto DEBE hacerse siempre antes de cualquier otra operación.
          // Si no se llama, Capgo hace rollback automático al próximo inicio.
          try { 
            await CapacitorUpdater.notifyAppReady();
            console.log('[OTA] notifyAppReady() ✅ - bundle marcado como estable.');
          } catch(e) {
            console.warn('[OTA] notifyAppReady() falló (no crítico):', e);
          }

          // ── PASO 2: Detectar si Capgo hizo rollback al bundle builtin ──
          // Si Capgo revirtió a builtin, el localStorage puede tener la versión
          // OTA fallida guardada, lo que impediría re-descargarla.
          try {
            const currentBundle = await CapacitorUpdater.current();
            const bundleVersion = currentBundle?.bundle?.version || currentBundle?.bundle?.id || '';
            console.log(`[OTA] Bundle activo Capgo: ${bundleVersion}`);
            
            // Si Capgo cargó el builtin pero localStorage dice que hay OTA instalada,
            // significa que hubo rollback → limpiar localStorage para permitir re-descarga
            if (bundleVersion === 'builtin' || bundleVersion === '' || bundleVersion === 'builtin_') {
              const savedOtaVersion = localStorage.getItem('current_ota_version');
              if (savedOtaVersion && savedOtaVersion !== APP_CURRENT_VERSION) {
                console.warn(`[OTA] ⚠️ Capgo está en builtin pero localStorage dice v${savedOtaVersion}. Capgo hizo rollback — limpiando localStorage para permitir re-descarga.`);
                localStorage.removeItem('current_ota_version');
              }
            }
          } catch (e) {
            console.warn('[OTA] No se pudo verificar bundle actual:', e);
          }

          // ── PASO 3: Verificar si hay actualización disponible ──
          console.log('[OTA] Verificando actualización OTA...');
          const { data: otaData, error: otaFetchError } = await supabase
            .from('global_settings')
            .select('value')
            .eq('key', 'latest_ota_version')
            .maybeSingle();

          if (otaFetchError) throw otaFetchError;

          if (otaData && otaData.value) {
            const remoteOta = typeof otaData.value === 'string' ? JSON.parse(otaData.value) : otaData.value;
            // Usar APP_CURRENT_VERSION como fallback para evitar re-descargas innecesarias
            const currentOtaVersion = localStorage.getItem('current_ota_version') || APP_CURRENT_VERSION;

            console.log(`[OTA] Remoto: v${remoteOta.version} | Local OTA: v${currentOtaVersion} | APK base: v${APP_CURRENT_VERSION}`);

            // Comparación semver: solo descargar si la versión remota es MAYOR
            const needsUpdate = remoteOta.version && remoteOta.url && isNewerVer(remoteOta.version, currentOtaVersion);

            if (needsUpdate) {
              console.log(`[OTA] 🔄 Nueva versión disponible: v${remoteOta.version}. Iniciando descarga...`);
              
              toast({
                title: "🔄 Actualizando aplicación...",
                description: `Descargando v${remoteOta.version}. No cierres la app.`,
                className: "bg-blue-600 text-white border-none",
                duration: 60000
              });

              try {
                console.log('[OTA] URL de descarga:', remoteOta.url);
                
                // Descargar el bundle OTA via CapacitorUpdater (nativo, sin restricciones CORS)
                const versionData = await CapacitorUpdater.download({
                  url: remoteOta.url,
                  version: remoteOta.version
                });
                console.log('[OTA] ✅ Descarga completada. Bundle ID:', versionData.id);

                // CRÍTICO: Guardar versión ANTES de .set() porque .set() reinicia la app
                // y nada después de esta línea se ejecuta en este ciclo.
                localStorage.setItem('current_ota_version', remoteOta.version);
                console.log(`[OTA] Versión OTA guardada en localStorage: v${remoteOta.version}`);

                toast({
                  title: "✅ Actualización lista",
                  description: `v${remoteOta.version} instalada. Reiniciando...`,
                  className: "bg-emerald-600 text-white border-none",
                  duration: 3000
                });

                // Breve delay para que el toast se muestre antes del reinicio
                await new Promise(r => setTimeout(r, 1500));

                console.log('[OTA] Aplicando bundle y reiniciando app...');
                await CapacitorUpdater.set({ id: versionData.id });
                // ↑ La app se reinicia aquí — nada debajo de esta línea ejecuta
              } catch (downloadError) {
                const errMsg = downloadError?.message || downloadError?.toString() || 'Error desconocido';
                const shortUrl = remoteOta.url ? remoteOta.url.substring(0, 60) + '...' : 'sin URL';
                console.error('[OTA] ❌ Error descargando/instalando bundle:', downloadError);
                console.error('[OTA] URL intentada:', remoteOta.url);
                console.error('[OTA] Detalle error:', errMsg);
                // NO guardar la versión en localStorage si falló la descarga
                toast({
                  title: "⚠️ Error OTA",
                  description: `${errMsg.substring(0, 100)}`,
                  variant: "destructive",
                  duration: 15000
                });
              }
            } else {
              console.log(`[OTA] ✅ App actualizada (v${currentOtaVersion}).`);
            }
          } else {
            console.log('[OTA] No hay configuración OTA en Supabase.');
          }
        } catch (e) {
          if (e.code !== 'PGRST116') {
            console.error('[OTA] Error verificando OTA Update:', e);
          }
        }
      } else if (typeof window !== 'undefined' && window.electronDesktop?.isElectron) {
        try {
          console.log('[OTA-PC] Verificando actualización OTA para aplicación de escritorio (.exe)...');
          const { data: otaData, error: otaFetchError } = await supabase
            .from('global_settings')
            .select('value')
            .eq('key', 'latest_ota_version')
            .maybeSingle();

          if (!otaFetchError && otaData?.value) {
            const remoteOta = typeof otaData.value === 'string' ? JSON.parse(otaData.value) : otaData.value;
            const currentOtaVersion = localStorage.getItem('current_ota_version') || APP_CURRENT_VERSION;
            const needsUpdate = remoteOta.version && remoteOta.url && isNewerVer(remoteOta.version, currentOtaVersion);

            if (needsUpdate && window.electronDesktop.applyOtaUpdate) {
              toast({
                title: "🔄 Actualizando aplicación de PC...",
                description: `Descargando v${remoteOta.version}. La ventana se recargará al terminar.`,
                className: "bg-blue-600 text-white border-none",
                duration: 45000
              });
              const res = await window.electronDesktop.applyOtaUpdate(remoteOta.url, remoteOta.version);
              if (res?.success) {
                localStorage.setItem('current_ota_version', remoteOta.version);
                toast({
                  title: "✅ Actualización instalada",
                  description: `v${remoteOta.version} aplicada. Reiniciando ventana...`,
                  className: "bg-emerald-600 text-white border-none",
                  duration: 3000
                });
                setTimeout(() => {
                  window.electronDesktop.reloadBundle?.();
                }, 1200);
              }
            }
          }
        } catch (e) {
          console.warn('[OTA-PC] No se pudo verificar OTA en escritorio:', e);
        }
      } else {
        console.log('[OTA] Plataforma web — OTA no aplica.');
      }

      // ==========================================
      // AUTO WALLPAPER SYNC (ANDROID ONLY)
      // ==========================================
      if (Capacitor.isNativePlatform()) {
        try {
          const { data: wpData } = await supabase
            .from('global_settings')
            .select('value, key')
            .in('key', ['corporate_wallpaper_home', 'corporate_wallpaper_lock']);

          if (wpData && wpData.length > 0) {
            const { setDeviceWallpaper } = await import('./services/WallpaperService');

            const homeWp = wpData.find(w => w.key === 'corporate_wallpaper_home')?.value;
            const lockWp = wpData.find(w => w.key === 'corporate_wallpaper_lock')?.value;

            const lastHomeWp = localStorage.getItem('LAST_APPLIED_WP_HOME');
            const lastLockWp = localStorage.getItem('LAST_APPLIED_WP_LOCK');
            
            if (homeWp && homeWp !== lastHomeWp) {
              console.log('[Wallpaper] Nuevo fondo de INICIO detectado...');
              const success = await setDeviceWallpaper(homeWp, true, false);
              if (success) localStorage.setItem('LAST_APPLIED_WP_HOME', homeWp);
            }

            if (lockWp && lockWp !== lastLockWp) {
              console.log('[Wallpaper] Nuevo fondo de BLOQUEO detectado...');
              const success = await setDeviceWallpaper(lockWp, false, true);
              if (success) localStorage.setItem('LAST_APPLIED_WP_LOCK', lockWp);
            }
          }
        } catch (e) {
          console.error('[Wallpaper] Error sincronizando fondo de pantalla:', e);
        }
      }
    };

    initServices();
  }, [toast]);

  return (
    <>
      <NetworkAutoSync />
      {/* <OfflineBanner /> -- Removed: Using OfflineSyncMonitor instead */}
      <OfflineSyncMonitor />
      {apkUpdate && <UpdateModal update={apkUpdate} onClose={() => setApkUpdate(null)} />}
      <RouterProvider router={router} future={{ v7_startTransition: true, v7_relativeSpatPath: true }} />
      <Toaster />
      <Suspense fallback={null}>
        <CopilotChat />
      </Suspense>
    </>
  );

}
