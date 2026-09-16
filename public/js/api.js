// public/js/api.js — Wrapper de fetch anti-cache e sincronização global de estado do Omega Safety

const API_BASE = '/api';

// ══════════════════════════════════════════════════════════════
//  CAMADA DE SINCRONIZAÇÃO REATIVA GLOBAL (BroadcastChannel + CustomEvent + Storage)
// ══════════════════════════════════════════════════════════════
const SYNC_CHANNEL_NAME = 'omega_safety_global_sync_channel';
const syncChannel = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel(SYNC_CHANNEL_NAME) : null;

function notifyGlobalChange(action, details = {}) {
    const payload = { action, details, timestamp: Date.now() };
    
    // 1. BroadcastChannel (Sincronização entre abas/janelas abertas)
    if (syncChannel) {
        try { syncChannel.postMessage(payload); } catch (e) {}
    }
    
    // 2. CustomEvent na janela atual (Sincronização reativa interna do módulo)
    window.dispatchEvent(new CustomEvent('omega_sync', { detail: payload }));
    
    // 3. LocalStorage Ping Fallback (Navegadores mais antigos)
    try {
        localStorage.setItem('omega_sync_ping', JSON.stringify(payload));
    } catch (e) {}
}

function onGlobalChange(callback) {
    if (typeof callback !== 'function') return;

    // Escutar mensagens entre abas via BroadcastChannel
    if (syncChannel) {
        syncChannel.onmessage = (e) => {
            if (e && e.data) callback(e.data);
        };
    }

    // Escutar eventos internos da janela
    window.addEventListener('omega_sync', (e) => {
        if (e && e.detail) callback(e.detail);
    });

    // Escutar alterações de LocalStorage (fallback para abas externas)
    window.addEventListener('storage', (e) => {
        if (e.key === 'omega_sync_ping' && e.newValue) {
            try {
                callback(JSON.parse(e.newValue));
            } catch (err) {}
        }
    });
}

// Exporta funções globais de sincronização
window.notifyGlobalChange = notifyGlobalChange;
window.onGlobalChange = onGlobalChange;

// ══════════════════════════════════════════════════════════════
//  CONFIGURAÇÃO ANTI-CACHE E FETCH WRAPPER
// ══════════════════════════════════════════════════════════════
async function apiFetch(endpoint, options = {}) {
    const separator = endpoint.includes('?') ? '&' : '?';
    // Parâmetro de timestamp anti-cache estrito para evitar cache do navegador/proxy ao trocar filtros/locais
    const cacheBuster = `_t=${Date.now()}`;
    const url = `${API_BASE}${endpoint}${separator}${cacheBuster}`;

    const config = {
        credentials: 'include',
        cache: 'no-store',
        headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
        },
        ...options,
    };

    // Mesclar headers adicionais fornecidos em options
    if (options.headers) {
        config.headers = { ...config.headers, ...options.headers };
    }

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

// Atalhos com auto-notificação de mutação
const api = {
    get: (ep) => apiFetch(ep, { method: 'GET' }),
    post: async (ep, body) => {
        const res = await apiFetch(ep, { method: 'POST', body });
        notifyGlobalChange('post', { endpoint: ep });
        return res;
    },
    put: async (ep, body) => {
        const res = await apiFetch(ep, { method: 'PUT', body });
        notifyGlobalChange('put', { endpoint: ep });
        return res;
    },
    patch: async (ep, body) => {
        const res = await apiFetch(ep, { method: 'PATCH', body });
        notifyGlobalChange('patch', { endpoint: ep });
        return res;
    },
    delete: async (ep) => {
        const res = await apiFetch(ep, { method: 'DELETE' });
        notifyGlobalChange('delete', { endpoint: ep });
        return res;
    },
    upload: async (ep, form) => {
        const res = await apiFetch(ep, { method: 'POST', body: form });
        notifyGlobalChange('upload', { endpoint: ep });
        return res;
    },
};

// Exporta para window
window.api = api;
