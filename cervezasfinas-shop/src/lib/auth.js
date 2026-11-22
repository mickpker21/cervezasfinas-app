import { api } from './api';

export const authService = {
    async login(client_code, password) {
        const data = await api.post('/auth/login.php', { client_code, password });
        if (data.success && data.token) {
            api.setToken(data.token);
            localStorage.setItem('shop_user', JSON.stringify(data.user));
            return data;
        }
        throw new Error(data.error || 'Error de autenticación');
    },

    async logout() {
        api.setToken(null);
        localStorage.removeItem('shop_user');
    },

    getCurrentUser() {
        const userStr = localStorage.getItem('shop_user');
        return userStr ? JSON.parse(userStr) : null;
    },

    isAuthenticated() {
        return !!api.token && !!this.getCurrentUser();
    },

    async changePassword(oldPassword, newPassword) {
        return await api.post('/auth/change-password.php', {
            old_password: oldPassword,
            new_password: newPassword,
        });
    },
};
