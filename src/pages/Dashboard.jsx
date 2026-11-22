import React from 'react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { Navigate } from 'react-router-dom';
import AdminDashboard from './AdminDashboard';
import ConquestDashboard from './ConquestDashboard';
import DynamicAdvisorDashboard from './DynamicAdvisorDashboard';
import TelesalesDashboard from './TelesalesDashboard';
import InstallerDashboard from './installer/InstallerDashboard';
import SupervisorDashboard from './SupervisorDashboard';
import GerenteDashboard from './GerenteDashboard';
import ControlInternoDashboard from './ControlInternoDashboard';
import CanalModernoPage from './CanalModernoPage.jsx';
import Spinner from '@/components/Spinner';

const Dashboard = () => {
    const { user, roleType, loading } = useSupabaseAuth();

    // Show a spinner while the auth state is loading, OR if we have a user but their role hasn't been determined yet.
    // This prevents a flicker and redirect loop where the user is valid but their role is temporarily undefined.
    if (loading || (user && roleType === undefined)) {
        return <div className="flex justify-center items-center h-screen"><Spinner /></div>;
    }

    if (!user) {
        // If there's no user after loading, redirect to the homepage (which will redirect to /login).
        return <Navigate to="/" replace />;
    }

    // Use the normalized roleType from the context for redirection.
    switch (roleType) {
        case 'admin':
        case 'administrador':
            return <AdminDashboard />;
        case 'installer':
        case 'instalador':
            return <InstallerDashboard />;
        case 'conquista':
            return <ConquestDashboard />;
        case 'asesor-dinamico':
            return <DynamicAdvisorDashboard />;
        case 'televenta':
            return <TelesalesDashboard />;
        case 'supervisor':
            return <SupervisorDashboard />;
        case 'gerente':
            return <GerenteDashboard />;
        case 'control-interno':
        case 'control interno':
            return <ControlInternoDashboard />;
        case 'canal-moderno':
            return <CanalModernoPage />;
        default:
            // If the role is not recognized, redirect to a generic page or the login.
            console.warn(`Unrecognized role: "${roleType}". Redirecting to home.`);
            return <Navigate to="/" replace />;
    }
};

export default Dashboard;
