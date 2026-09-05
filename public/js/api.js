// public/js/api.js — Wrapper de fetch para a API do Omega Safety

const API_BASE = '/api';

async function apiFetch(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const config = {
        credentials: 'include',
        headers: {},
        ...options,
    };

    // Não define Content-Type para FormData (multer precisa do boundary)
    if (!(config.body instanceof FormData)) {
        config.headers['Content-Type'] = 'application/json';
        if (config.body && typeof config.body === 'object') {
            config.body = JSON.stringify(config.body);
        }
    }

    const res = await fetch(url, config);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        const err = new Error(data.error || `Erro ${res.status}`);
        err.status = res.status;
        throw err;
    }

    return data;
}

// Atalhos
const api = {
    get:    (ep)         => apiFetch(ep, { method: 'GET' }),
    post:   (ep, body)   => apiFetch(ep, { method: 'POST', body }),
    patch:  (ep, body)   => apiFetch(ep, { method: 'PATCH', body }),
    delete: (ep)         => apiFetch(ep, { method: 'DELETE' }),
    upload: (ep, form)   => apiFetch(ep, { method: 'POST', body: form }),
};

// Exporta para window
window.api = api;
