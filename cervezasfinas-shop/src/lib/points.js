import { api } from './api';

export const pointsService = {
    /**
     * Obtiene el balance de puntos del cliente
     */
    async getBalance(client_code) {
        try {
            const response = await api.get(`/points/balance.php`);
            return response.data || { balance: 0 };
        } catch (error) {
            console.error('Error getting points balance:', error);
            return { balance: 0 };
        }
    },

    /**
     * Obtiene el historial de transacciones de puntos
     */
    async getTransactions(client_code) {
        try {
            const response = await api.get(`/points/transactions.php`);
            return response.data || [];
        } catch (error) {
            console.error('Error getting points transactions:', error);
            return [];
        }
    },

    /**
     * Calcula puntos disponibles (excluyendo expirados)
     */
    async getAvailablePoints(client_code) {
        const balance = await this.getBalance(client_code);
        return balance.available_points || balance.balance || 0;
    },

    /**
     * Formatea puntos para mostrar
     */
    formatPoints(points) {
        return new Intl.NumberFormat('es-MX').format(points);
    },
};
