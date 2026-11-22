import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { LogOut, Users, Settings, LayoutDashboard, Briefcase, MapPin, MapPinOff, Map as MapIcon, Menu, X, Wrench, Package, Warehouse, FilePlus, Archive, QrCode, Newspaper, Upload, ShoppingCart, ShoppingBag, Camera, Calculator, UploadCloud, BarChart2, FileText, Truck, Box, ClipboardList, ShieldCheck, AlertCircle, TrendingUp, Target, Gift, Zap, LayoutList, Image as ImageIcon, UserPlus, Trophy, DollarSign, Clock, User, Tag, Calendar, Car, MessageSquare, Megaphone, FileCheck, ClipboardCheck, Video, ArrowRightLeft, Printer, Search, Bell, ChevronRight, ChevronLeft, Sparkles, Award } from 'lucide-react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/components/ui/use-toast';
import { useRef, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { kvStorage } from '@/services/kvStorage';
import { APP_CURRENT_VERSION } from '@/services/updateService';
import GlobalAnnouncement from '@/components/GlobalAnnouncement';
import MandatoryPhoneModal from '@/components/MandatoryPhoneModal';

export const navLinks = {
  admin: [
    { href: '/admin/dashboard', label: 'Dashboard General', icon: LayoutDashboard, section: 'Control Maestro' },

    // 1. Comercial, Clientes y Televenta
    { href: '/admin/clients', label: 'Directorio Clientes', icon: Briefcase, section: '1. Comercial y Televenta' },
    { href: '/televenta/shop-orders', label: 'Pedidos Tienda y Televenta', icon: ShoppingBag, section: '1. Comercial y Televenta' },
    { href: '/televenta/llamadas', label: 'Panel Llamadas Televenta', icon: MessageSquare, section: '1. Comercial y Televenta' },
    { href: '/sales-simulator', label: 'Crear Pedido / Cotizador', icon: Calculator, section: '1. Comercial y Televenta' },
    { href: '/televenta/atencion-cliente', label: 'Centro de Ayuda 360°', icon: ShieldCheck, section: '1. Comercial y Televenta' },
    { href: '/televenta/tercerizados', label: 'Tercerizados (Promo)', icon: Users, section: '1. Comercial y Televenta' },
    { href: '/televenta/whatsapp-approvals', label: 'Validar WhatsApp', icon: MessageSquare, section: '1. Comercial y Televenta' },
    { href: '/admin/mapa-clientes', label: 'Mapa General', icon: MapPin, section: '1. Comercial y Televenta' },
    { href: '/admin/visits', label: 'Bitácora Visitas', icon: MapPin, section: '1. Comercial y Televenta' },
    { href: '/admin/sales-import', label: 'Importar Ventas', icon: Upload, section: '1. Comercial y Televenta' },
    { href: '/admin/conquest-reports', label: 'Reportes Conquista', icon: BarChart2, section: '1. Comercial y Televenta' },
    { href: '/admin/comparative-sales', label: 'Comparativo Ventas', icon: TrendingUp, section: '1. Comercial y Televenta' },
    { href: '/admin/promotions', label: 'Análisis Promociones', icon: Tag, section: '1. Comercial y Televenta' },
    { href: '/admin/price-upload', label: 'Gestor de Precios', icon: DollarSign, section: '1. Comercial y Televenta' },
    { href: '/admin/metas', label: 'Metas y Objetivos', icon: Target, section: '1. Comercial y Televenta' },
    { href: '/supervisor/work-plan', label: 'Planes de Trabajo', icon: Calendar, section: '1. Comercial y Televenta' },
    { href: '/supervisor/onboard-supervision', label: 'Supervisión Abordo', icon: Car, section: '1. Comercial y Televenta' },

    // 2. Tienda Online y Lealtad
    { href: '/admin/shop', label: 'Admin Tienda (Centro 100%)', icon: ShoppingCart, section: '2. Tienda Online y Lealtad' },
    { href: '/admin/shop?tab=zone-visibility', label: 'Zonas y Excepciones Cliente', icon: ShieldCheck, section: '2. Tienda Online y Lealtad' },
    { href: '/admin/skus', label: 'Gestión de SKUs', icon: Package, section: '2. Tienda Online y Lealtad' },
    { href: '/admin/descuentos', label: 'Descuentos y Precios', icon: Tag, section: '2. Tienda Online y Lealtad' },
    { href: '/admin/reporte-liquidaciones', label: 'Reporte Liquidaciones', icon: BarChart2, section: '2. Tienda Online y Lealtad' },
    { href: '/admin/loyalty-audit', label: 'Auditoría Puntos & Ventas', icon: Award, section: '2. Tienda Online y Lealtad' },
    { href: '/admin/points-config', label: 'Config. Puntos', icon: Gift, section: '2. Tienda Online y Lealtad' },
    { href: '/admin/sku-images', label: 'Imágenes Productos', icon: ImageIcon, section: '2. Tienda Online y Lealtad' },
    { href: '/admin/brands', label: 'Marcas de la Tienda', icon: Tag, section: '2. Tienda Online y Lealtad' },
    { href: '/admin/push-broadcast', label: 'Notificaciones Push', icon: Bell, section: '2. Tienda Online y Lealtad' },

    // 3. Logística, Almacén y Activos
    { href: '/admin/inventory', label: 'Inventario de Equipos', icon: Package, section: '3. Logística y Activos' },
    { href: '/admin/warehouses', label: 'Almacenes', icon: Warehouse, section: '3. Logística y Activos' },
    { href: '/warehouse/inventory', label: 'Inventario WMS', icon: Warehouse, section: '3. Logística y Activos' },
    { href: '/warehouse/transfers', label: 'Traspasos / Planta', icon: Truck, section: '3. Logística y Activos' },
    { href: '/admin/work-orders', label: 'Órdenes de Trabajo', icon: Wrench, section: '3. Logística y Activos' },
    { href: '/admin/asset-status', label: 'Estado Activos', icon: ShieldCheck, section: '3. Logística y Activos' },
    { href: '/admin/asset-alerts', label: 'Alertas de Equipos', icon: AlertCircle, section: '3. Logística y Activos' },
    { href: '/scan-asset', label: 'Escanear Activo', icon: QrCode, section: '3. Logística y Activos' },

    // 4. Plataformas Especializadas y Auditoría
    { href: '/autoventa/dashboard', label: 'Modo Autoventa', icon: Truck, section: '4. Modos Operativos y Auditoría' },
    { href: '/warehouse/dashboard', label: 'Modo Almacén', icon: ClipboardList, section: '4. Modos Operativos y Auditoría' },
    { href: '/um6/dashboard', label: 'Modo UM6', icon: Zap, section: '4. Modos Operativos y Auditoría' },
    { href: '/ops/delivery-audit-history', label: 'Historial Auditorías', icon: ClipboardCheck, section: '4. Modos Operativos y Auditoría' },
    { href: '/admin/geo-audit', label: 'Auditoría GPS', icon: MapPinOff, section: '4. Modos Operativos y Auditoría' },

    // 5. RRHH, Sistema y Configuración
    { href: '/admin/hr-dashboard', label: 'Centro de Comando RRHH', icon: Users, section: '5. RRHH y Configuración' },
    { href: '/hr/dashboard', label: 'Mi Desempeño', icon: Trophy, section: '5. RRHH y Configuración' },
    { href: '/hr/commissions', label: 'Mis Comisiones', icon: DollarSign, section: '5. RRHH y Configuración' },
    { href: '/admin/users', label: 'Usuarios y Roles', icon: Users, section: '5. RRHH y Configuración' },
    { href: '/admin/settings', label: 'Configuración App / OTA', icon: Settings, section: '5. RRHH y Configuración' },
    { href: '/admin/ticket-templates', label: 'Plantillas de Ticket', icon: Printer, section: '5. RRHH y Configuración' },
    { href: '/settings/printer', label: 'Config. Impresora', icon: Printer, section: '5. RRHH y Configuración' },
    { href: '/admin/evaluation-config', label: 'Config. Evaluaciones', icon: LayoutList, section: '5. RRHH y Configuración' },
    { href: '/admin/helpdesk', label: 'Gestión Helpdesk', icon: ShieldCheck, section: '5. RRHH y Configuración' },
    { href: '/admin/minutas', label: 'Gestión Minutas', icon: FileCheck, section: '5. RRHH y Configuración' },
    { href: '/admin/announcements', label: 'Anuncios Corporativos', icon: Megaphone, section: '5. RRHH y Configuración' },
    { href: '/admin/portafolio', label: 'Portafolio Web', icon: Video, section: '5. RRHH y Configuración' },
    { href: '/admin/nosotros', label: 'Sección Nosotros', icon: Target, section: '5. RRHH y Configuración' },
    { href: '/utilidades', label: 'Utilidades', icon: Archive, section: '5. RRHH y Configuración' },
  ],
  installer: [
    { href: '/installer/dashboard', label: 'Mis Órdenes', icon: LayoutDashboard },
    { href: '/installer/add-asset', label: 'Mi Almacén', icon: Warehouse },
    { href: '/scan-asset', label: 'Escanear Activo', icon: QrCode },
    { href: '/utilidades', label: 'Utilidades', icon: Archive },
    { href: '/mis-tickets', label: 'Mis Tickets (Ayuda)', icon: MessageSquare },
  ],
  instalador: [
    { href: '/installer/dashboard', label: 'Mis Órdenes', icon: LayoutDashboard },
    { href: '/installer/add-asset', label: 'Mi Almacén', icon: Warehouse },
    { href: '/scan-asset', label: 'Escanear Activo', icon: QrCode },
    { href: '/utilidades', label: 'Utilidades', icon: Archive },
    { href: '/mis-tickets', label: 'Mis Tickets (Ayuda)', icon: MessageSquare },
  ],
  conquista: [
    { href: '/conquista/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/conquista/mapa', label: 'Mapa', icon: MapPin },
    { href: '/conquista/ranking', label: 'Ranking', icon: Trophy },
    { href: '/clients', label: 'Mis Clientes', icon: Briefcase },
    { href: '/visits', label: 'Mis Visitas', icon: MapPin },
    { href: '/preventa', label: 'Preventa', icon: ShoppingCart },
    { href: '/utilidades', label: 'Utilidades', icon: Archive },
    { href: '/mis-tickets', label: 'Mis Tickets (Ayuda)', icon: MessageSquare },
  ],
  'asesor-dinamico': [
    { href: '/asesor-dinamico/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/orders', label: 'Órdenes de Equipos', icon: FilePlus },
    { href: '/asesor-dinamico/clientes', label: 'Clientes', icon: Briefcase },
    { href: '/asesor-dinamico/visitas', label: 'Visitas', icon: MapPin },
    { href: '/asesor-dinamico/ruta', label: 'Ruta', icon: MapPin },
    { href: '/asesor-dinamico/mapa', label: 'Mapa', icon: MapPin },
    { href: '/scan-asset', label: 'Escanear Activo', icon: QrCode },
    { href: '/preventa', label: 'Preventa', icon: ShoppingCart },
    { href: '/utilidades', label: 'Utilidades', icon: Archive },
    { href: '/mis-tickets', label: 'Mis Tickets (Ayuda)', icon: MessageSquare },
  ],
  televenta: [
    { href: '/televenta/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/televenta/atencion-cliente', label: 'Centro de Ayuda 360°', icon: ShieldCheck },
    { href: '/televenta/whatsapp-approvals', label: 'Validar WhatsApp', icon: MessageSquare },
    { href: '/televenta/new-clients', label: 'Clientes Nuevos Hoy', icon: UserPlus },
    { href: '/televenta/tercerizados', label: 'Panel Tercerizados', icon: Users },
    { href: '/televenta/monitoring', label: 'Monitoreo Rutas', icon: Truck },
    { href: '/televenta/llamadas', label: 'Llamadas', icon: MapPin },
    { href: '/televenta/shop-orders', label: 'Pedidos E-shop', icon: ShoppingCart },
    { href: '/televenta/cooler-executions', label: 'Enfriadores', icon: Warehouse },
    { href: '/televenta/work-orders', label: 'Órdenes de Trabajo', icon: Wrench },
    { href: '/televenta/redemptions', label: 'Canjes', icon: FilePlus },
    { href: '/televenta/autoventa-orders', label: 'Pedidos Autoventa', icon: Truck },
    { href: '/hr/dashboard', label: 'Mi Desempeño', icon: Trophy },
    { href: '/preventa', label: 'Preventa', icon: ShoppingCart },
    { href: '/utilidades', label: 'Utilidades', icon: Archive },
    { href: '/mis-tickets', label: 'Mis Tickets (Ayuda)', icon: MessageSquare },
    { href: '/televenta/helpdesk', label: 'Gestión Helpdesk', icon: ShieldCheck },
    { href: '/minutas', label: 'Mis Minutas', icon: FileCheck },
  ],
  'control-interno': [
    { href: '/control-interno/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/control-interno/auditoria-puntos', label: 'Auditoría Puntos vs Ventas', icon: Award },
    { href: '/control-interno/mapa', label: 'Mapa Maestro', icon: MapPin },
    { href: '/evaluaciones', label: 'Evaluaciones', icon: Briefcase },
    { href: '/ops/delivery-audit', label: 'Auditoría de Reparto', icon: ClipboardCheck },
    { href: '/ops/delivery-audit-history', label: 'Mis Auditorías', icon: FileText },
    { href: '/clients', label: 'Clientes', icon: Briefcase },
    { href: '/scan-asset', label: 'Escanear Activo', icon: QrCode },
    { href: '/utilidades', label: 'Utilidades', icon: Archive },
    { href: '/mis-tickets', label: 'Mis Tickets (Ayuda)', icon: MessageSquare },
  ],
  'concesion': [
    { href: '/conquista/mapa', label: 'Mapa', icon: MapPin },
    { href: '/conquista/ranking', label: 'Ranking', icon: Trophy },
    { href: '/clients', label: 'Mis Clientes', icon: Briefcase },
    { href: '/visits', label: 'Mis Visitas', icon: MapPin },
    { href: '/utilidades', label: 'Utilidades', icon: Archive },
    { href: '/mis-tickets', label: 'Mis Tickets (Ayuda)', icon: MessageSquare },
  ],
  'control interno': [
    { href: '/control-interno/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/control-interno/auditoria-puntos', label: 'Auditoría Puntos vs Ventas', icon: Award },
    { href: '/control-interno/mapa', label: 'Mapa Maestro', icon: MapPin },
    { href: '/evaluaciones', label: 'Evaluaciones', icon: Briefcase },
    { href: '/ops/delivery-audit', label: 'Auditoría de Reparto', icon: ClipboardCheck },
    { href: '/ops/delivery-audit-history', label: 'Mis Auditorías', icon: FileText },
    { href: '/clients', label: 'Clientes', icon: Briefcase },
    { href: '/scan-asset', label: 'Escanear Activo', icon: QrCode },
    { href: '/utilidades', label: 'Utilidades', icon: Archive },
    { href: '/mis-tickets', label: 'Mis Tickets (Ayuda)', icon: MessageSquare },
  ],
  supervisor: [
    { href: '/supervisor/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/supervisor/work-plan', label: 'Plan de Trabajo', icon: Calendar },
    { href: '/supervisor/onboard-supervision', label: 'Supervisión Abordo', icon: Car },
    { href: '/televenta/tercerizados', label: 'Seguimiento Tercerizados', icon: Users },
    { href: '/orders', label: 'Órdenes de Equipos', icon: FilePlus },
    { href: '/supervisor/clients', label: 'Clientes', icon: Briefcase },
    { href: '/supervisor/points', label: 'Puntos de Clientes', icon: Gift },
    { href: '/supervisor/visitas', label: 'Visitas', icon: MapPin },
    { href: '/supervisor/mapa-clientes', label: 'Mapa de Clientes', icon: MapPin },
    { href: '/supervisor/evaluations', label: 'Evaluaciones', icon: Briefcase },
    { href: '/gerente/calls', label: 'Reporte de Llamadas', icon: BarChart2 },
    { href: '/supervisor/scorecard', label: 'Scorecard', icon: BarChart2 },
    { href: '/supervisor/censos', label: 'Censos', icon: ClipboardList },
    { href: '/admin/comparative-sales', label: 'Ventas Comparativo', icon: BarChart2 },
    { href: '/conquista/ranking', label: 'Ranking', icon: Trophy },
    { href: '/scan-asset', label: 'Escanear Activo', icon: QrCode },
    { href: '/preventa', label: 'Preventa', icon: ShoppingCart },
    { href: '/utilidades', label: 'Utilidades', icon: Archive },
    { href: '/minutas', label: 'Mis Minutas', icon: FileCheck },
    { href: '/mis-tickets', label: 'Mis Tickets (Ayuda)', icon: MessageSquare },
  ],
  gerente: [
    { href: '/gerente/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/gerente/clients', label: 'Clientes', icon: Briefcase },
    { href: '/televenta/tercerizados', label: 'Seguimiento Tercerizados', icon: Users },
    { href: '/gerente/mapa-clientes', label: 'Mapa de Clientes', icon: MapPin },
    { href: '/gerente/calls', label: 'Reporte de Llamadas', icon: BarChart2 },
    { href: '/gerente/um6', label: 'UM6', icon: LayoutDashboard },
    { href: '/hr/dashboard', label: 'Mi Desempeño', icon: Trophy },
    { href: '/supervisor/work-plan', label: 'Planes de Trabajo', icon: Calendar },
    { href: '/preventa', label: 'Preventa', icon: ShoppingCart },
    { href: '/utilidades', label: 'Utilidades', icon: Archive },
    { href: '/minutas', label: 'Mis Minutas', icon: FileCheck },
    { href: '/mis-tickets', label: 'Mis Tickets (Ayuda)', icon: MessageSquare },
  ],
  um6: [
    { href: '/um6/dashboard', label: 'POS UM6', icon: LayoutDashboard },
    { href: '/utilidades', label: 'Utilidades', icon: Archive },
    { href: '/mis-tickets', label: 'Mis Tickets (Ayuda)', icon: MessageSquare },
  ],
  jefeum6: [
    { href: '/jefeum6/dashboard', label: 'Dashboard UM6', icon: LayoutDashboard },
    { href: '/jefeum6/ventas', label: 'Ventas UM6', icon: TrendingUp },
    { href: '/jefeum6/clients', label: 'Clientes UM6', icon: Briefcase },
    { href: '/orders', label: 'Órdenes de Equipos', icon: FilePlus },
    { href: '/mis-tickets', label: 'Mis Tickets (Ayuda)', icon: MessageSquare },
    { href: '/utilidades', label: 'Utilidades', icon: Archive },
  ],
  'jefe-um6': [
    { href: '/jefeum6/dashboard', label: 'Dashboard UM6', icon: LayoutDashboard },
    { href: '/jefeum6/ventas', label: 'Ventas UM6', icon: TrendingUp },
    { href: '/jefeum6/clients', label: 'Clientes UM6', icon: Briefcase },
    { href: '/orders', label: 'Órdenes de Equipos', icon: FilePlus },
    { href: '/mis-tickets', label: 'Mis Tickets (Ayuda)', icon: MessageSquare },
    { href: '/utilidades', label: 'Utilidades', icon: Archive },
  ],
  almacen: [
    { href: '/warehouse/dashboard', label: 'Panel', icon: LayoutDashboard },
    { href: '/televenta/monitoring', label: 'Monitoreo Rutas', icon: Truck },
    { href: '/warehouse/inventory', label: 'Inventario WMS', icon: Box },
    { href: '/warehouse/transfers', label: 'Traspasos / Planta', icon: ArrowRightLeft },
    { href: '/warehouse/load', label: 'Cargar Camión', icon: ShoppingCart },
    { href: '/warehouse/audit', label: 'Auditoría', icon: Briefcase },
    { href: '/warehouse/history', label: 'Historial', icon: FileText },
    { href: '/utilidades', label: 'Utilidades', icon: Archive },
    { href: '/mis-tickets', label: 'Mis Tickets (Ayuda)', icon: MessageSquare },
  ],
  almacenista: [
    { href: '/warehouse/dashboard', label: 'Panel', icon: LayoutDashboard },
    { href: '/televenta/monitoring', label: 'Monitoreo Rutas', icon: Truck },
    { href: '/warehouse/inventory', label: 'Inventario WMS', icon: Box },
    { href: '/warehouse/transfers', label: 'Traspasos / Planta', icon: ArrowRightLeft },
    { href: '/warehouse/load', label: 'Cargar Camión', icon: ShoppingCart },
    { href: '/warehouse/audit', label: 'Auditoría', icon: Briefcase },
    { href: '/warehouse/history', label: 'Historial', icon: FileText },
    { href: '/utilidades', label: 'Utilidades', icon: Archive },
    { href: '/mis-tickets', label: 'Mis Tickets (Ayuda)', icon: MessageSquare },
  ],
  warehouse: [
    { href: '/warehouse/dashboard', label: 'Panel', icon: LayoutDashboard },
    { href: '/televenta/monitoring', label: 'Monitoreo Rutas', icon: Truck },
    { href: '/warehouse/inventory', label: 'Inventario WMS', icon: Box },
    { href: '/warehouse/transfers', label: 'Traspasos / Planta', icon: ArrowRightLeft },
    { href: '/warehouse/load', label: 'Cargar Camión', icon: ShoppingCart },
    { href: '/warehouse/audit', label: 'Auditoría', icon: Briefcase },
    { href: '/warehouse/history', label: 'Historial', icon: FileText },
    { href: '/utilidades', label: 'Utilidades', icon: Archive },
    { href: '/mis-tickets', label: 'Mis Tickets (Ayuda)', icon: MessageSquare },
  ],
  logistica: [
    { href: '/warehouse/dashboard', label: 'Panel de Logística', icon: LayoutDashboard },
    { href: '/ops/fleet', label: 'Control de Flota', icon: Truck },
    { href: '/warehouse/inventory', label: 'Inventario WMS', icon: Box },
    { href: '/warehouse/transfers', label: 'Traspasos / Planta', icon: ArrowRightLeft },
    { href: '/warehouse/load', label: 'Cargar Camión', icon: ShoppingCart },
    { href: '/warehouse/audit', label: 'Auditoría', icon: Briefcase },
    { href: '/warehouse/history', label: 'Historial', icon: FileText },
    { href: '/utilidades', label: 'Utilidades', icon: Archive },
    { href: '/mis-tickets', label: 'Mis Tickets (Ayuda)', icon: MessageSquare },
  ],
  liquidador: [
    { href: '/warehouse/liquidation', label: 'Liquidación de Ruta', icon: ClipboardList },
    { href: '/warehouse/dashboard', label: 'Modo Almacén', icon: Warehouse },
    { href: '/warehouse/history', label: 'Historial Movimientos', icon: FileText },
    { href: '/utilidades', label: 'Utilidades', icon: Archive },
    { href: '/mis-tickets', label: 'Mis Tickets (Ayuda)', icon: MessageSquare },
  ],
  preventa: [
    { href: '/autoventa/general-dashboard', label: 'Tablero Venta', icon: LayoutDashboard },
    { href: '/autoventa/dashboard', label: 'Indicadores Día', icon: TrendingUp },
    { href: '/autoventa/clients', label: 'Clientes', icon: Users },
    { href: '/autoventa/sales', label: 'Levantar Pedido', icon: ShoppingCart },
    { href: '/autoventa/orders', label: 'Mis Pedidos', icon: ClipboardList },
    { href: '/hr/dashboard', label: 'Mi Desempeño', icon: Trophy },
    { href: '/settings/printer', label: 'Config. Impresora', icon: Printer },
    { href: '/utilidades', label: 'Utilidades', icon: Archive },
    { href: '/mis-tickets', label: 'Mis Tickets (Ayuda)', icon: MessageSquare },
  ],
  autoventa: [
    { href: '/autoventa/general-dashboard', label: 'Tablero Autoventa', icon: LayoutDashboard },
    { href: '/autoventa/dashboard', label: 'Indicadores Día', icon: TrendingUp },
    { href: '/autoventa/clients', label: 'Clientes', icon: Users },
    { href: '/autoventa/sales', label: 'Ruta (Hoy)', icon: MapPin },
    { href: '/autoventa/inventory', label: 'Inventario Abordo', icon: Box },
    { href: '/autoventa/orders', label: 'Ventas Realizadas', icon: ClipboardList },
    { href: '/autoventa/request', label: 'Solicitar Stock', icon: Box },
    { href: '/warehouse/audit', label: 'Validación Carga', icon: ShieldCheck },
    { href: '/hr/dashboard', label: 'Mi Desempeño', icon: Trophy },
    { href: '/settings/printer', label: 'Config. Impresora', icon: Printer },
    { href: '/utilidades', label: 'Utilidades', icon: Archive },
  ],
  chofer: [
    { href: '/delivery', label: 'Panel de Reparto', icon: Truck },
    { href: '/autoventa/orders', label: 'Pedidos a Entregar', icon: ClipboardList },
    { href: '/autoventa/inventory', label: 'Inventario Abordo', icon: Box },
    { href: '/delivery/performance', label: 'Mi Desempeño', icon: Trophy },
    { href: '/settings/printer', label: 'Config. Impresora', icon: Printer },
    { href: '/utilidades', label: 'Utilidades', icon: Archive },
    { href: '/mis-tickets', label: 'Mis Tickets (Ayuda)', icon: MessageSquare },
  ],
  coortrade: [
    { href: '/coortrade/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/coortrade/clients', label: 'Todos los Clientes', icon: Users },
    { href: '/coortrade/points', label: 'Puntos de Clientes', icon: Gift },
    { href: '/coortrade/visitas', label: 'Visitas', icon: MapPin },
    { href: '/coortrade/map', label: 'Mapa Global', icon: MapPin },
    { href: '/coortrade/comparative', label: 'Comparativo Ventas', icon: BarChart2 },
    { href: '/coortrade/scorecard', label: 'Scorecard', icon: Trophy },
    { href: '/coortrade/evaluations', label: 'Evaluaciones', icon: ClipboardList },
    { href: '/hr/dashboard', label: 'Mi Desempeño', icon: Trophy },
    { href: '/hr/commissions', label: 'Mis Comisiones', icon: DollarSign },
    { href: '/supervisor/work-plan', label: 'Planes de Trabajo', icon: Calendar },
    { href: '/preventa', label: 'Preventa', icon: ShoppingCart },
    { href: '/utilidades', label: 'Utilidades', icon: Archive },
    { href: '/minutas', label: 'Mis Minutas', icon: FileCheck },
    { href: '/mis-tickets', label: 'Mis Tickets (Ayuda)', icon: MessageSquare },
  ],
  rh: [
    { href: '/admin/hr-dashboard', label: 'Centro de Comando RRHH', icon: Users },
    { href: '/kiosk', label: 'Kiosco Asistencia', icon: Clock },
    { href: '/supervisor/work-plan', label: 'Planes de Trabajo', icon: Calendar },
    { href: '/evaluaciones', label: 'Evaluaciones', icon: ClipboardList },
    // Reclutamiento
    { href: '/rrhh/recruitment', label: 'Reclutamiento', icon: Briefcase },
    { href: '/rrhh/jobs', label: 'Gestionar Vacantes', icon: LayoutList },
    { href: '/careers', label: 'Portal de Empleo', icon: UserPlus },
    { href: '/admin/announcements', label: 'Anuncios Corporativos', icon: Megaphone },
    { href: '/utilidades', label: 'Utilidades', icon: Archive },
    // Personal things
    { href: '/hr/dashboard', label: 'Mi Desempeño', icon: Trophy },
    { href: '/hr/commissions', label: 'Mis Comisiones', icon: DollarSign },
    { href: '/minutas', label: 'Mis Minutas', icon: FileCheck },
    { href: '/mis-tickets', label: 'Mis Tickets (Ayuda)', icon: MessageSquare },
  ],
  analista: [
    { href: '/analista/dashboard', label: 'Monitor de Indicadores', icon: Target },
    { href: '/supervisor/dashboard', label: 'Dashboard Supervisor', icon: LayoutDashboard },
    { href: '/supervisor/scorecard', label: 'Scorecard', icon: BarChart2 },
    { href: '/supervisor/evaluations', label: 'Evaluaciones', icon: Briefcase },
    { href: '/admin/sales-import', label: 'Importar Ventas', icon: Upload },
    { href: '/installer/dashboard', label: 'Instalador Dashboard', icon: Wrench },
    { href: '/rrhh/recruitment', label: 'Reclutamiento', icon: Briefcase },
    { href: '/admin/helpdesk', label: 'Gestión Tickets', icon: ShieldCheck },
    { href: '/admin/minutas', label: 'Gestión Minutas', icon: FileCheck },
    { href: '/supervisor/onboard-summary', label: 'Historial Supervisión', icon: Car },
    { href: '/analista/minutas', label: 'Mis Minutas', icon: ClipboardList },
    { href: '/ops/delivery-audit-history', label: 'Historial Auditorías', icon: ClipboardCheck },
    { href: '/utilidades', label: 'Utilidades', icon: Archive },
    { href: '/mis-tickets', label: 'Mis Tickets (Ayuda)', icon: MessageSquare },
  ],
  'coordinador conquista': [
    { href: '/conquista/coordinator-dashboard', label: 'Tablero Control', icon: LayoutDashboard },
    { href: '/admin/conquest-reports', label: 'Reportes Globales', icon: BarChart2 },
    { href: '/conquista/mapa', label: 'Mapa Operativo', icon: MapPin },
    { href: '/conquista/ranking', label: 'Ranking', icon: Trophy },
    { href: '/supervisor/clients', label: 'Cartera Clientes', icon: Users },
    { href: '/supervisor/points', label: 'Puntos de Clientes', icon: Gift },
    { href: '/supervisor/visitas', label: 'Bitácora Visitas', icon: MapPin },
    { href: '/supervisor/work-plan', label: 'Planes de Trabajo', icon: Calendar },
    { href: '/hr/dashboard', label: 'Mi Desempeño', icon: Trophy },
    { href: '/utilidades', label: 'Utilidades', icon: Archive },
  ],
  coorcon: [
    { href: '/conquista/coordinator-dashboard', label: 'Tablero Control', icon: LayoutDashboard },
    { href: '/admin/conquest-reports', label: 'Reportes Globales', icon: BarChart2 },
    { href: '/conquista/mapa', label: 'Mapa Operativo', icon: MapPin },
    { href: '/conquista/ranking', label: 'Ranking', icon: Trophy },
    { href: '/supervisor/clients', label: 'Cartera Clientes', icon: Users },
    { href: '/supervisor/points', label: 'Puntos de Clientes', icon: Gift },
    { href: '/supervisor/visitas', label: 'Bitácora Visitas', icon: MapPin },
    { href: '/supervisor/work-plan', label: 'Planes de Trabajo', icon: Calendar },
    { href: '/hr/dashboard', label: 'Mi Desempeño', icon: Trophy },
    { href: '/utilidades', label: 'Utilidades', icon: Archive },
  ],
  'operaciones': [
    { href: '/ops/fleet', label: 'Control de Flota', icon: Truck },
    { href: '/admin/mapa-clientes', label: 'Mapa Maestro', icon: MapPin },
    { href: '/admin/inventory', label: 'Inventario Global', icon: Package },
    { href: '/ops/delivery-audit-history', label: 'Historial Auditorías', icon: ClipboardCheck },
    { href: '/utilidades', label: 'Utilidades', icon: Archive },
    { href: '/mis-tickets', label: 'Mis Tickets (Ayuda)', icon: MessageSquare },
  ],
  'sistemas': [
    { href: '/admin/system-users', label: 'Gestión de Usuarios', icon: Users },
    { href: '/admin/skus', label: 'Gestión de SKUs', icon: Package },
    { href: '/admin/descuentos', label: 'Descuentos y Precios', icon: Tag },
    { href: '/admin/price-upload', label: 'Gestor de Precios', icon: DollarSign },
    { href: '/admin/promotions', label: 'Promociones / Reglas', icon: Tag },
    { href: '/admin/inventory', label: 'Inventario de Equipos', icon: Package },
    { href: '/warehouse/dashboard', label: 'Modo Almacén', icon: ClipboardList },
    { href: '/warehouse/inventory', label: 'Inventario WMS', icon: Warehouse },
    { href: '/warehouse/transfers', label: 'Traspasos / Planta', icon: Truck },
    { href: '/admin/mapa-clientes', label: 'Mapa Maestro', icon: MapPin },
    { href: '/ops/fleet', label: 'Control de Flota', icon: Truck },
    { href: '/utilidades', label: 'Utilidades', icon: Archive },
  ],
  'jefe-operaciones': [
    { href: '/ops/fleet', label: 'Control de Flota', icon: Truck },
    { href: '/admin/mapa-clientes', label: 'Mapa Maestro', icon: MapPin },
    { href: '/admin/inventory', label: 'Inventario Global', icon: Package },
    { href: '/ops/delivery-audit-history', label: 'Historial Auditorías', icon: ClipboardCheck },
    { href: '/utilidades', label: 'Utilidades', icon: Archive },
    { href: '/mis-tickets', label: 'Mis Tickets (Ayuda)', icon: MessageSquare },
  ],
  'jefe operaciones': [
    { href: '/ops/fleet', label: 'Control de Flota', icon: Truck },
    { href: '/admin/mapa-clientes', label: 'Mapa Maestro', icon: MapPin },
    { href: '/admin/inventory', label: 'Inventario Global', icon: Package },
    { href: '/ops/delivery-audit-history', label: 'Historial Auditorías', icon: ClipboardCheck },
    { href: '/utilidades', label: 'Utilidades', icon: Archive },
    { href: '/mis-tickets', label: 'Mis Tickets (Ayuda)', icon: MessageSquare },
  ],
  'jefeoperaciones': [
    { href: '/ops/fleet', label: 'Control de Flota', icon: Truck },
    { href: '/admin/mapa-clientes', label: 'Mapa Maestro', icon: MapPin },
    { href: '/admin/inventory', label: 'Inventario Global', icon: Package },
    { href: '/ops/delivery-audit-history', label: 'Historial Auditorías', icon: ClipboardCheck },
    { href: '/utilidades', label: 'Utilidades', icon: Archive },
    { href: '/mis-tickets', label: 'Mis Tickets (Ayuda)', icon: MessageSquare },
  ],
  'sistemashop': [
    // CONTROL MAESTRO
    { href: '/admin/shop?tab=overview', label: 'Centro de Control 100%', icon: LayoutDashboard, section: 'Control Maestro' },
    // 1. OPERACIÓN EN VIVO Y PEDIDOS
    { href: '/televenta/atencion-cliente', label: 'Centro de Ayuda 360°', icon: ShieldCheck, section: '1. Operación y Pedidos' },
    { href: '/televenta/shop-orders', label: 'Pedidos, Preventas y Chat', icon: ShoppingBag, section: '1. Operación y Pedidos' },
    { href: '/televenta/cooler-executions', label: 'Evaluar Fotos Enfriador', icon: Camera, section: '1. Operación y Pedidos' },
    { href: '/admin/shop?tab=redemptions', label: 'Autorizar Canjes', icon: ShoppingCart, section: '1. Operación y Pedidos' },
    { href: '/televenta/redemptions', label: 'Entrega de Premios', icon: Gift, section: '1. Operación y Pedidos' },
    { href: '/sales-simulator', label: 'Crear Pedido / Cotizador', icon: Calculator, section: '1. Operación y Pedidos' },
    // 2. CATÁLOGO, MARCAS E IMAGEN
    { href: '/admin/shop?tab=catalog', label: 'Catálogo de Productos', icon: Package, section: '2. Catálogo e Imagen' },
    { href: '/admin/sku-images', label: 'Imágenes de SKUs', icon: ImageIcon, section: '2. Catálogo e Imagen' },
    { href: '/admin/brands', label: 'Marcas de la Tienda', icon: Tag, section: '2. Catálogo e Imagen' },
    { href: '/admin/shop?tab=banners', label: 'Banners Promocionales', icon: Megaphone, section: '2. Catálogo e Imagen' },
    { href: '/admin/shop?tab=cooler-refs', label: 'Guías de Enfriadores', icon: ShieldCheck, section: '2. Catálogo e Imagen' },
    // 3. PRECIOS, PROMOCIONES Y DESCUENTOS
    { href: '/admin/shop?tab=promotions', label: 'Promociones y Combos', icon: TrendingUp, section: '3. Precios y Promos' },
    { href: '/admin/shop?tab=special-prices', label: 'Precios Especiales', icon: DollarSign, section: '3. Precios y Promos' },
    { href: '/admin/shop?tab=gec-discounts', label: 'Descuentos Nivel GEC', icon: Trophy, section: '3. Precios y Promos' },
    { href: '/admin/shop?tab=surcharges', label: 'Recargos de Envase', icon: Box, section: '3. Precios y Promos' },
    { href: '/admin/price-upload', label: 'Carga Masiva Precios', icon: UploadCloud, section: '3. Precios y Promos' },
    // 4. LEALTAD, PUNTOS Y PREMIOS
    { href: '/admin/points-config', label: 'Reglas Puntos y SKUs', icon: Settings, section: '4. Puntos y Lealtad' },
    { href: '/admin/shop?tab=redemption-catalog', label: 'Catálogo de Premios', icon: Gift, section: '4. Puntos y Lealtad' },
    { href: '/supervisor/points', label: 'Saldo Puntos Clientes', icon: ClipboardCheck, section: '4. Puntos y Lealtad' },
    // 5. CLIENTES Y COMUNICACIÓN
    { href: '/admin/shop?tab=clients', label: 'Clientes y Contraseñas', icon: Users, section: '5. Clientes y Push' },
    { href: '/admin/push-broadcast', label: 'Notificaciones Push', icon: Bell, section: '5. Clientes y Push' },
    // GENERAL
    { href: '/utilidades', label: 'Utilidades', icon: Archive, section: 'General' },
    { href: '/mis-tickets', label: 'Mis Tickets (Ayuda)', icon: MessageSquare, section: 'General' },
  ],
};
navLinks['sistema shop'] = navLinks['sistemashop'];
navLinks['sistema-shop'] = navLinks['sistemashop'];
navLinks['sistema_shop'] = navLinks['sistemashop'];


const categorizeLinks = (items) => {
  const menu = [];
  const discovery = [];
  const general = [];

  items.forEach((link) => {
    const l = link.label.toLowerCase();
    const h = link.href.toLowerCase();

    if (
      h.includes('setting') ||
      h.includes('profile') ||
      h.includes('utilidad') ||
      h.includes('ticket') ||
      h.includes('ayuda') ||
      h.includes('printer') ||
      h.includes('kiosk')
    ) {
      general.push(link);
    } else if (
      l.includes('dashboard') ||
      l.includes('general') ||
      l.includes('inicio') ||
      l.includes('tablero') ||
      l.includes('panel') ||
      l.includes('indicadores')
    ) {
      menu.push(link);
    } else {
      discovery.push(link);
    }
  });

  return { menu, discovery, general };
};

const SidebarContent = ({ onLinkClick, collapsed, onToggleCollapse }) => {
  const { user, signOut, supabase } = useSupabaseAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [dbRole, setDbRole] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Fallback: Fetch role from DB if missing in Auth Metadata
  useEffect(() => {
    if (user) {
      const metaRole = user?.user_metadata?.type || user?.user_metadata?.role || user?.app_metadata?.role;
      if (!metaRole && !dbRole) {
        supabase.from('profiles').select('role').eq('id', user.id).single()
          .then(({ data }) => {
            if (data?.role) {
              setDbRole(data.role);
            }
          });
      }
    }
  }, [user]);

  const handleLogout = async () => {
    try {
      const { NotificationService } = await import('@/services/NotificationService');
      await NotificationService.logout();
      await signOut();
    } catch (_) {
    } finally {
      navigate('/login', { replace: true });
    }
  };

  const rawType = dbRole
    || user?.user_metadata?.type
    || user?.user_metadata?.role
    || (user?.app_metadata?.roles && user.app_metadata.roles[0])
    || user?.raw_app_meta_data?.role
    || user?.raw_user_meta_data?.type
    || user?.role
    || '';
  const lower = String(rawType || '').toLowerCase();

  const candidates = [lower, lower.replace(/\s+/g, '-'), lower.replace(/\s+/g, ' ')].filter(Boolean);
  let links = [];
  if (user) {
    for (const cand of candidates) {
      if (navLinks[cand]) { links = navLinks[cand]; break; }
    }
    if ((!links || links.length === 0) && rawType) {
      if (navLinks[rawType]) links = navLinks[rawType];
      else {
        let foundKey = Object.keys(navLinks).find(k => k.includes(lower));
        if (!foundKey) {
          foundKey = Object.keys(navLinks).find(k => lower.includes(k));
        }
        if (foundKey) links = navLinks[foundKey];
      }
    }
  }

  const isDesktop = !onLinkClick;

  // Filtrado por buscador
  const filteredLinks = searchQuery.trim()
    ? links.filter((l) => l.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : null;

  const { menu, discovery, general } = categorizeLinks(links);
  const customSections = React.useMemo(() => {
    if (!links || !links.some(l => l.section)) return null;
    const map = [];
    links.forEach(item => {
      const secName = item.section || 'General';
      let group = map.find(g => g.title === secName);
      if (!group) {
        group = { title: secName, items: [] };
        map.push(group);
      }
      group.items.push(item);
    });
    return map;
  }, [links]);

  const userName = user?.user_metadata?.full_name
    || user?.user_metadata?.name
    || user?.email?.split('@')[0]
    || 'Colaborador';
  const userRole = (rawType || 'Cervezas Finas').toUpperCase();
  const userInitial = (userName[0] || 'C').toUpperCase();
  const avatarUrl = user?.user_metadata?.avatar_url;

  const renderLinkItem = (link) => {
    const fullCurrentUrl = location.pathname + (location.search || '');
    const isActive = link.href.includes('?')
      ? fullCurrentUrl === link.href || (link.href.endsWith('?tab=overview') && location.pathname === '/admin/shop' && !location.search)
      : (location.pathname === link.href || location.pathname.startsWith(link.href + '/'));
    return (
      <li key={link.href}>
        <Link
          to={link.href}
          onClick={onLinkClick}
          title={collapsed ? link.label : undefined}
          className={`
            group flex items-center rounded-2xl transition-all duration-200 text-xs font-semibold
            ${collapsed ? 'justify-center p-3' : 'px-3 py-2.5'}
            ${isActive
              ? 'bg-gradient-to-r from-emerald-500 to-[#00b341] text-white shadow-[0_4px_18px_rgba(0,204,74,0.35)] font-bold'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
            }
          `}
        >
          <link.icon className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-emerald-400'} ${collapsed ? '' : 'mr-3'}`} />
          {!collapsed && (
            <span className="truncate flex-1 tracking-wide">
              {link.label}
            </span>
          )}
        </Link>
      </li>
    );
  };

  return (
    <div
      className={`
        flex flex-col h-full rounded-[28px] overflow-hidden border border-white/10
        backdrop-blur-2xl bg-[#070e1b]/80 shadow-[0_20px_50px_rgba(0,0,0,0.7)]
        transition-all duration-300 ease-in-out p-3.5
        ${isDesktop ? (collapsed ? 'w-[78px]' : 'w-[270px]') : 'w-[285px]'}
      `}
      style={{
        boxShadow: '0 20px 60px -15px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.1)',
      }}
    >
      {/* ── Top Header (Logo + Brand + Notification) ── */}
      <div className={`flex items-center justify-between pb-3 border-b border-white/[0.06] shrink-0 ${collapsed ? 'flex-col gap-2.5 pb-2' : ''}`}>
        {/* Logo Cervezas Finas adaptado */}
        {!collapsed ? (
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/logo.png"
              alt="Logo Cervezas Finas"
              className="h-8 w-auto object-contain shrink-0 drop-shadow-[0_0_10px_rgba(0,204,74,0.35)]"
            />
            <div className="truncate">
              <span className="text-[12px] font-black uppercase tracking-wider text-white block leading-tight">
                Cervezas Finas
              </span>
              <span className="text-[9px] font-bold text-emerald-400 tracking-[0.2em] uppercase block">
                Heineken México
              </span>
            </div>
          </div>
        ) : (
          <img
            src="/logo.png"
            alt="Logo"
            className="h-8 w-auto object-contain mx-auto drop-shadow-[0_0_10px_rgba(0,204,74,0.35)]"
          />
        )}

        <div className="flex items-center shrink-0">
          {/* Notification bell */}
          <button
            type="button"
            aria-label="Notificaciones"
            onClick={() => navigate('/notificaciones')}
            className="relative p-1.5 rounded-xl hover:bg-white/10 text-slate-300 hover:text-white transition-all cursor-pointer"
          >
            <Bell className="w-3.5 h-3.5" />
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-400 animate-pulse ring-2 ring-slate-900" />
          </button>
        </div>
      </div>

      {/* ── User Profile Card (Dorian / Switch account) ── */}
      <div
        onClick={() => {
          navigate('/profile');
          if (onLinkClick) onLinkClick();
        }}
        className={`
          flex items-center gap-2.5 p-2 rounded-2xl bg-white/[0.03] hover:bg-white/[0.07]
          border border-white/[0.06] transition-all cursor-pointer group shadow-sm mt-3 mb-2.5
          ${collapsed ? 'justify-center p-1.5' : ''}
        `}
      >
        <div className="w-9 h-9 rounded-xl overflow-hidden bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white font-black text-sm shadow-md shrink-0 ring-1 ring-white/20">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span>{userInitial}</span>
          )}
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0 flex items-center justify-between">
            <div className="truncate">
              <p className="text-xs font-bold text-white truncate leading-tight group-hover:text-emerald-400 transition-colors">
                {userName}
              </p>
              <p className="text-[10px] text-slate-400 truncate flex items-center gap-1 mt-0.5 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                {userRole}
              </p>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0 ml-1" />
          </div>
        )}
      </div>

      {/* ── Search Input (SEARCH...) ── */}
      {!collapsed && (
        <div className="relative mb-3 shrink-0">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="SEARCH..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8 pl-8 pr-7 rounded-xl bg-white/[0.04] hover:bg-white/[0.06] focus:bg-white/[0.08] border border-white/[0.08] focus:border-emerald-500/50 text-[11px] text-slate-200 placeholder:text-slate-500 tracking-wider font-semibold focus:outline-none transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* ── Navigation Menu (Categorized) ── */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden pr-1 -mr-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {filteredLinks ? (
          /* Resultados de búsqueda */
          <div className="space-y-1">
            {!collapsed && (
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 px-3 pt-1 pb-1">
                Resultados ({filteredLinks.length})
              </p>
            )}
            <ul className="space-y-1">
              {filteredLinks.map(renderLinkItem)}
            </ul>
          </div>
        ) : customSections ? (
          /* Secciones clasificadas (ej. Sistema Shop 100%) */
          <div className="space-y-3.5">
            {customSections.map((group) => (
              <div key={group.title}>
                {!collapsed && (
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400/80 px-3 pb-1">
                    {group.title}
                  </p>
                )}
                <ul className="space-y-1">
                  {group.items.map(renderLinkItem)}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          /* Secciones normales estilo macOS */
          <div className="space-y-3.5">
            {/* Categoría: MENU */}
            {menu.length > 0 && (
              <div>
                {!collapsed && (
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 px-3 pb-1">
                    Menu
                  </p>
                )}
                <ul className="space-y-1">
                  {menu.map(renderLinkItem)}
                </ul>
              </div>
            )}

            {/* Categoría: DISCOVERY / OPERACIÓN */}
            {discovery.length > 0 && (
              <div>
                {!collapsed && (
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 px-3 pb-1">
                    Operación
                  </p>
                )}
                <ul className="space-y-1">
                  {discovery.map(renderLinkItem)}
                </ul>
              </div>
            )}

            {/* Categoría: GENERAL */}
            {general.length > 0 && (
              <div>
                {!collapsed && (
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 px-3 pb-1">
                    General
                  </p>
                )}
                <ul className="space-y-1">
                  {general.map(renderLinkItem)}
                </ul>
              </div>
            )}
          </div>
        )}
      </nav>

      {/* ── Bottom Section (Log out / Version) ── */}
      <div className="pt-3 border-t border-white/[0.06] shrink-0 space-y-1 mt-2">

        <button
          type="button"
          onClick={handleLogout}
          title={collapsed ? 'Log out' : undefined}
          className={`
            w-full flex items-center rounded-2xl text-xs font-semibold text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all
            ${collapsed ? 'justify-center p-2.5' : 'px-3 py-2.5'}
          `}
        >
          <LogOut className={`w-4 h-4 shrink-0 ${collapsed ? '' : 'mr-3'}`} />
          {!collapsed && <span>Log out</span>}
        </button>

        {!collapsed && (
          <div className="pt-2 px-2 flex items-center justify-between text-[10px] font-bold text-slate-500">
            <span>Cervezas Finas</span>
            <span className="flex items-center gap-1 font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              v{APP_CURRENT_VERSION}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

const Layout = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  const { user, roleType, signOut } = useSupabaseAuth();

  const handleLogout = React.useCallback(async () => {
    try {
      const { NotificationService } = await import('@/services/NotificationService');
      await NotificationService.logout();
      await signOut?.();
    } catch (_) {
    } finally {
      navigate('/login', { replace: true });
    }
  }, [signOut, navigate]);

  const pathname = location?.pathname || '';
  const isUm6Section = pathname === '/um6' || pathname.startsWith('/um6/');
  const isAutoventaSession = pathname === '/autoventa/session';
  const isKioskSection = pathname === '/kiosk';

  React.useEffect(() => {
    const handler = () => setIsSidebarOpen(true);
    window.addEventListener('openSidebar', handler);
    return () => window.removeEventListener('openSidebar', handler);
  }, []);

  // TELEVENTA & SISTEMA SHOP GLOBAL NOTIFICATIONS (Pedidos nuevos, Solicitud de Asesor y Vinculaciones)
  const { toast } = useToast();
  const prevAlertsRef = useRef({
    initialized: false,
    lastOrderId: 0,
    lastVerificationId: 0,
    chatsByCode: {}
  });
  const [liveTeleventaBadges, setLiveTeleventaBadges] = useState({
    unreadChats: 0,
    humanRequests: 0,
    pendingOrders: 0,
    pendingVerifications: 0
  });

  const playNotificationChime = React.useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } catch (_) {}
  }, []);

  useEffect(() => {
    const rawR = String(roleType || user?.user_metadata?.type || user?.role || '').toLowerCase().trim();
    const isTeleventaOrShop = ['televenta', 'sistemashop', 'sistema shop', 'sistema-shop', 'sistema_shop', 'admin', 'administrador'].includes(rawR);
    if (!isTeleventaOrShop) return;

    const checkTeleventaAlerts = async () => {
      try {
        const { getShopAuthHeaders } = await import('@/lib/api');
        const res = await fetch('/api/shop/televenta/alerts-poll.php', { headers: await getShopAuthHeaders() });
        const data = await res.json();
        if (!data || !data.success) return;

        setLiveTeleventaBadges({
          unreadChats: Number(data.unread_chats_count || 0),
          humanRequests: Number(data.human_handoff_count || 0),
          pendingOrders: Number(data.pending_orders_count || 0),
          pendingVerifications: Number(data.pending_verifications_count || 0)
        });

        const state = prevAlertsRef.current;
        const latestOrder = data.latest_order || null;
        const latestOrderId = Number(latestOrder?.id || 0);
        const latestVer = data.latest_verification || null;
        const latestVerId = Number(latestVer?.id || 0);
        const chatAlerts = Array.isArray(data.chat_alerts) ? data.chat_alerts : [];

        if (!state.initialized) {
          state.initialized = true;
          state.lastOrderId = latestOrderId;
          state.lastVerificationId = latestVerId;
          const map = {};
          chatAlerts.forEach(c => {
            map[c.client_code] = {
              unread: Number(c.unread_count || 0),
              human: Boolean(c.is_human_request),
              lastMsg: c.last_message || ''
            };
          });
          state.chatsByCode = map;
          return;
        }

        // 1. Notificar si llegó un PEDIDO NUEVO (Tienda o WhatsApp Bot)
        if (latestOrderId > state.lastOrderId && state.lastOrderId > 0) {
          playNotificationChime();
          toast({
            title: `🛒 ¡Nuevo Pedido #${latestOrder.order_number}!`,
            description: `${latestOrder.client_name || ('Cliente ' + latestOrder.client_code)} · $${Number(latestOrder.total_amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
            action: (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/televenta/atencion-cliente?client=${encodeURIComponent(latestOrder.client_code)}`)}
              >
                Atender 360°
              </Button>
            ),
            duration: 9000,
          });
        }
        if (latestOrderId > state.lastOrderId) {
          state.lastOrderId = latestOrderId;
        }

        // 2. Notificar si un cliente solicita HABLAR CON UN ASESOR o envía un mensaje nuevo
        const nextMap = {};
        chatAlerts.forEach(chat => {
          const prev = state.chatsByCode[chat.client_code];
          const currUnread = Number(chat.unread_count || 0);
          const currHuman = Boolean(chat.is_human_request);
          nextMap[chat.client_code] = {
            unread: currUnread,
            human: currHuman,
            lastMsg: chat.last_message || ''
          };

          const isNewHumanRequest = currHuman && (!prev || !prev.human);
          const hasMoreUnread = currUnread > (prev ? prev.unread : 0);

          if (isNewHumanRequest || hasMoreUnread) {
            playNotificationChime();
            toast({
              title: currHuman
                ? `🙋‍♂️ ${chat.client_name} solicita hablar con un Asesor`
                : `💬 Nuevo mensaje de ${chat.client_name}`,
              description: chat.last_message || 'Abrió conversación en WhatsApp / Soporte',
              action: (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/televenta/atencion-cliente?client=${encodeURIComponent(chat.client_code)}`)}
                >
                  Abrir Chat 360°
                </Button>
              ),
              duration: 9000,
            });
          }
        });
        state.chatsByCode = nextMap;

        // 3. Notificar si llegó una nueva solicitud de VINCULACIÓN DE WHATSAPP
        if (latestVerId > state.lastVerificationId && state.lastVerificationId > 0) {
          playNotificationChime();
          toast({
            title: `📱 Solicitud de Vinculación WhatsApp`,
            description: `${latestVer.business_name || latestVer.contact_name || latestVer.phone_number} solicita vincular su número`,
            action: (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/televenta/whatsapp-approvals')}
              >
                Validar
              </Button>
            ),
            duration: 8000,
          });
        }
        if (latestVerId > state.lastVerificationId) {
          state.lastVerificationId = latestVerId;
        }
      } catch (e) {}
    };

    const interval = setInterval(checkTeleventaAlerts, 7000);
    checkTeleventaAlerts();
    return () => clearInterval(interval);
  }, [user, roleType, toast, navigate, playNotificationChime]);

  return (
    <div className="flex h-[100dvh] min-h-[100dvh] bg-[#03060c] text-slate-100 overflow-hidden relative">
      {/* Background wallpaper glow ambient */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-emerald-500/[0.04] blur-[120px]" />
        <div className="absolute -bottom-40 right-0 w-[500px] h-[500px] rounded-full bg-blue-500/[0.03] blur-[120px]" />
      </div>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && !isAutoventaSession && !isKioskSection && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/70 z-40 lg:hidden backdrop-blur-md"
          />
        )}
      </AnimatePresence>

      {/* Desktop Floating Sidebar (Auto Expand on Hover, Auto Collapse on Leave) */}
      {!isUm6Section && !isAutoventaSession && !isKioskSection && (
        <aside
          className="hidden lg:block shrink-0 z-30 p-3.5 h-full relative transition-all duration-300 ease-out"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <SidebarContent
            collapsed={!isHovered}
          />
        </aside>
      )}

      {/* Mobile Drawer (Floating Capsule) */}
      {!isUm6Section && !isAutoventaSession && !isKioskSection && (
        <AnimatePresence>
          {isSidebarOpen && (
            <motion.aside
              initial={{ x: '-100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '-100%', opacity: 0 }}
              transition={{ type: 'spring', stiffness: 350, damping: 32 }}
              className="fixed top-0 left-0 h-full z-50 lg:hidden p-3.5"
            >
              <SidebarContent
                onLinkClick={() => setIsSidebarOpen(false)}
                collapsed={false}
              />
            </motion.aside>
          )}
        </AnimatePresence>
      )}

      {/* Content Area */}
      <div className="flex-1 min-h-0 flex flex-col relative z-10 p-2 sm:p-3 lg:p-3.5 lg:pl-0">
        {/* Header (Mobile Only) */}
        {!isUm6Section && !isAutoventaSession && !isKioskSection ? (
          <header className="lg:hidden bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-3 mb-2.5 flex items-center justify-between shadow-lg">
            <div className="flex items-center">
              <button
                aria-label="Abrir menú"
                className="mr-3 w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-200 hover:text-white"
                onClick={() => setIsSidebarOpen(true)}
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2">
                <img alt="Logo" className="h-8" src="/logo.png" />
                <span className="text-sm font-black tracking-wider text-emerald-400">CERVEZAS FINAS</span>
              </div>
            </div>
          </header>
        ) : (!isAutoventaSession && isUm6Section) ? (
          <header className="bg-emerald-950/30 p-3 rounded-2xl border border-emerald-500/20 mb-2 flex justify-end">
            <Button
              variant="outline"
              className="border border-red-500/40 text-red-200 hover:bg-red-500/15"
              onClick={handleLogout}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Cerrar sesión
            </Button>
          </header>
        ) : null}

        {/* Barra global de alertas en vivo para Televenta (Solicitudes de Asesor, Mensajes y Pedidos Nuevos) */}
        {(liveTeleventaBadges.humanRequests > 0 || liveTeleventaBadges.unreadChats > 0 || liveTeleventaBadges.pendingVerifications > 0) &&
          pathname !== '/televenta/atencion-cliente' && (
            <div className="mb-2.5 px-3.5 py-2 rounded-2xl bg-gradient-to-r from-purple-950/90 via-indigo-950/90 to-emerald-950/90 border border-purple-500/40 flex flex-wrap items-center justify-between gap-2 shadow-lg">
              <div className="flex items-center gap-3 flex-wrap text-xs">
                {liveTeleventaBadges.humanRequests > 0 && (
                  <span className="inline-flex items-center gap-1.5 font-bold text-purple-200 bg-purple-600/30 border border-purple-400/40 px-2.5 py-1 rounded-full animate-pulse">
                    🙋‍♂️ {liveTeleventaBadges.humanRequests} cliente(s) solicitan hablar con un asesor
                  </span>
                )}
                {liveTeleventaBadges.unreadChats > 0 && (
                  <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-200 bg-emerald-600/20 border border-emerald-500/30 px-2.5 py-1 rounded-full">
                    💬 {liveTeleventaBadges.unreadChats} chat(s) con mensajes nuevos
                  </span>
                )}
                {liveTeleventaBadges.pendingVerifications > 0 && (
                  <span className="inline-flex items-center gap-1.5 font-semibold text-amber-200 bg-amber-600/20 border border-amber-500/30 px-2.5 py-1 rounded-full">
                    📱 {liveTeleventaBadges.pendingVerifications} vinculación(es) WhatsApp pendiente(s)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => navigate('/televenta/atencion-cliente')}
                  className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                >
                  🎧 Abrir Centro de Ayuda 360°
                </Button>
                {liveTeleventaBadges.pendingVerifications > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate('/televenta/whatsapp-approvals')}
                    className="h-7 text-xs border-amber-400/50 text-amber-200 hover:bg-amber-950/50"
                  >
                    Validar WhatsApp
                  </Button>
                )}
              </div>
            </div>
          )}

        {/* Main Content inside rounded container */}
        <main
          className={`
            flex-1 min-h-0 min-w-0 rounded-[24px] border border-white/[0.07] bg-[#070e1b]/60 backdrop-blur-xl
            ${(isAutoventaSession || isKioskSection || pathname === '/autoventa/sales' || pathname === '/control-interno/mapa')
              ? 'overflow-hidden p-0'
              : 'overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8'
            }
          `}
        >
          {children}
        </main>
      </div>

      <MandatoryPhoneModal />
      <GlobalAnnouncement />
    </div>
  );
};

export default Layout;

