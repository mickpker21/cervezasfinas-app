import React from 'react';
import { Helmet } from 'react-helmet-async';
import * as Tabs from '@radix-ui/react-tabs';
import AdminUsersPage from './AdminUsersPage';
import AdminClients from './AdminClients';
import AdminVisits from './AdminVisits';

import AdminSalesImportPage from './AdminSalesImportPage';
import AdminEvaluationsPage from './AdminEvaluationsPage';
import AdminEvaluationConfigPage from './AdminEvaluationConfigPage';
import AdminAssetTypes from './admin/AdminAssetTypes'; // Import the new component
import { navLinks } from '../components/Layout';


// Map hrefs to tab values and components
const tabComponents = {
  '/admin/panel': AdminUsersPage, // Panel principal (could be a dashboard)
  '/admin/dashboard': AdminUsersPage, // You may want a separate dashboard component
  '/admin/users': AdminUsersPage,
  '/admin/clients': AdminClients,
  '/admin/visits': AdminVisits,

  '/admin/sales-import': AdminSalesImportPage,
  '/admin/evaluation-config': AdminEvaluationConfigPage,
  '/admin/asset-types': AdminAssetTypes, // Add the new component to the map
};

export default function AdminPanel() {
  // Use the navLinks.admin array for tabs
  const adminTabs = navLinks.admin;
  // Use the first tab as default
  const defaultTab = adminTabs[0]?.href || '';

  return (
    <div className="space-y-6">
      <Helmet>
        <title>Panel de Administración</title>
        <meta name="description" content="Panel unificado para administración de usuarios, clientes, visitas y configuración." />
      </Helmet>

      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">Panel de Administración</h1>
      </div>

      <Tabs.Root defaultValue={defaultTab} className="block">
        <Tabs.List className="flex gap-2 heineken-card p-2 overflow-x-auto">
          {adminTabs.map(tab => (
            <Tabs.Trigger
              key={tab.href}
              value={tab.href}
              className="px-3 py-2 rounded text-sm text-white data-[state=active]:bg-white/10 flex items-center gap-2"
            >
              {tab.icon && <tab.icon className="w-4 h-4" />} {tab.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <div className="mt-4 space-y-6">
          {adminTabs.map(tab => {
            const TabComponent = tabComponents[tab.href];
            return (
              <Tabs.Content key={tab.href} value={tab.href}>
                {TabComponent ? <TabComponent /> : <div className="text-white">Componente no definido para esta pestaña.</div>}
              </Tabs.Content>
            );
          })}
        </div>
      </Tabs.Root>
    </div>
  );
}
