import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import Login from './pages/Login';
import VerificationPage from './pages/VerificationPage';
import Catalog from './pages/Catalog';
import Checkout from './pages/Checkout';
import Orders from './pages/Orders';
import Points from './pages/Points';
import Redeem from './pages/Redeem';
import CoolerExecution from './pages/CoolerExecution';

function ProtectedRoute({ children }) {
    const { isAuthenticated, loading } = useAuth();

    if (loading) {
        return <div className="flex items-center justify-center min-h-screen">Cargando...</div>;
    }

    return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function App() {
    return (
        <AuthProvider>
            <CartProvider>
                <BrowserRouter>
                    <Routes>
                        <Route path="/login" element={<Login />} />
                        <Route path="/verificar" element={<VerificationPage />} />
                        <Route
                            path="/catalog"
                            element={
                                <ProtectedRoute>
                                    <Catalog />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/checkout"
                            element={
                                <ProtectedRoute>
                                    <Checkout />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/orders"
                            element={
                                <ProtectedRoute>
                                    <Orders />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/points"
                            element={
                                <ProtectedRoute>
                                    <Points />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/redeem"
                            element={
                                <ProtectedRoute>
                                    <Redeem />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/cooler-execution"
                            element={
                                <ProtectedRoute>
                                    <CoolerExecution />
                                </ProtectedRoute>
                            }
                        />
                        <Route path="/" element={<Navigate to="/catalog" replace />} />
                    </Routes>
                </BrowserRouter>
            </CartProvider>
        </AuthProvider>
    );
}

export default App;
