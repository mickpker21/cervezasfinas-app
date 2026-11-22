export const API_URL = import.meta.env.VITE_API_URL || 'https://cervezasfinas.com/api/shop';

class APIClient {
    constructor() {
        this.baseURL = API_URL;
        this.token = localStorage.getItem('shop_token');
    }

    setToken(token) {
        this.token = token;
        if (token) {
            localStorage.setItem('shop_token', token);
        } else {
            localStorage.removeItem('shop_token');
        }
    }

    async request(endpoint, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        const config = {
            ...options,
            headers,
        };

        try {
            const response = await fetch(`${this.baseURL}${endpoint}`, config);
            const data = await response.json();

            if (!response.ok) {
                const error = new Error(data.error || 'Error en la petición');
                error.status = response.status;
                throw error;
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    }

    post(endpoint, body) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(body),
        });
    }

    put(endpoint, body) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(body),
        });
    }

    delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }
}

export const api = new APIClient();
