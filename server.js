// server.js — Entry point do Omega Safety
require('dotenv').config();

const express      = require('express');
const session      = require('express-session');
const sqlite3      = require('sqlite3');
const SQLiteStore  = require('connect-sqlite3')(session);
const path         = require('path');
const cors         = require('cors');

const app = express();

// Necessário atrás do proxy do Render (HTTPS terminado no proxy)
app.set('trust proxy', 1);

// ────────────────────────────────────────────────
//  Middlewares globais
// ────────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
// Limite ampliado: lotes de cadastro em lote passam de 100kb (padrão) e recebiam 413
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

let sessionStore;
if (process.env.DATABASE_URL) {
    try {
        const pgSimple = require('connect-pg-simple')(session);
        const { Pool } = require('pg');
        sessionStore = new pgSimple({
            pool: new Pool({
                connectionString: process.env.DATABASE_URL,
                ssl: { rejectUnauthorized: false }
            }),
            tableName: 'user_sessions',
            createTableIfMissing: true
        });
        console.log('[SESSION] Conector PostgreSQL para sessões ativado.');
    } catch (e) {
        console.warn('[SESSION] MemoryStore ativado como fallback:', e.message);
    }
} else {
    const sqlite3 = require('sqlite3');
    const SQLiteStore = require('connect-sqlite3')(session);
    sessionStore = new SQLiteStore({
        sqlite3: sqlite3,
        db: 'sessions.db',
        dir: path.join(__dirname, 'database'),
    });
    console.log('[SESSION] Conector SQLite local para sessões ativado.');
}

const isProd = process.env.NODE_ENV === 'production';

app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'omega_safety_secret',
    resave: false,
    saveUninitialized: false,
    proxy: isProd,
    cookie: {
        secure: isProd, // true em produção (Render entrega via HTTPS)
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 8 * 60 * 60 * 1000, // 8 horas
    },
}));

// Arquivos estáticos (frontend)
app.use(express.static(path.join(__dirname, 'public')));

// Servir uploads como estáticos (apenas o caminho é gravado no banco)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/Logo', express.static(path.join(__dirname, 'Logo')));

// Middleware Anti-Cache estrito para todas as rotas de API
app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
});

// ────────────────────────────────────────────────
//  Healthcheck (Render) — validação de Neon + Cloudinary
// ────────────────────────────────────────────────
const db = require('./database/db');
const { pingCloudinary, isConfigured: cloudinaryConfigured } = require('./config/cloudinary');

let cloudCache = { at: 0, value: null };

function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timeout (${ms}ms)`)), ms)),
    ]);
}

app.get('/api/health', async (req, res) => {
    const t0 = Date.now();
    let database = 'ok', dbError = null;

    try {
        await withTimeout(db.getAsync('SELECT 1 AS ok'), 5000, 'database');
    } catch (err) {
        database = 'error';
        dbError = err.message;
    }

    let cloud = cloudCache.value;
    if (!cloud || Date.now() - cloudCache.at > 60000) {
        cloud = await pingCloudinary(5000);
        cloudCache = { at: Date.now(), value: cloud };
    }

    const status = database === 'ok' && cloud.ok ? 200 : 503;
    res.status(status).json({
        status: status === 200 ? 'ok' : 'degraded',
        service: 'omega-safety-api',
        uptime: Math.round(process.uptime()),
        latency_ms: Date.now() - t0,
        database: { engine: 'postgresql-neon', state: database, error: dbError },
        media: { provider: 'cloudinary', cloud: process.env.CLOUDINARY_CLOUD_NAME || null, state: cloud.ok ? 'ok' : cloud.detail },
        env: { node: process.version, node_env: process.env.NODE_ENV || 'development' },
        timestamp: new Date().toISOString(),
    });
});

// ────────────────────────────────────────────────
//  Rotas da API
// ────────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/n3',        require('./routes/n3'));
app.use('/api/treinamentos', require('./routes/trainings'));
app.use('/api/inspecoes', require('./routes/inspections'));
app.use('/api/cadernos',  require('./routes/cadernos'));
app.use('/api/users', require('./routes/users'));
app.use('/api/vps', require('./routes/vps'));

// ────────────────────────────────────────────────
//  Rotas do Front-End (Sem extensão .html)
// ────────────────────────────────────────────────
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/treinamentos', (req, res) => res.sendFile(path.join(__dirname, 'public', 'treinamentos.html')));
app.get('/admin/treinamentos', (req, res) => res.sendFile(path.join(__dirname, 'public', 'treinamentos.html')));
app.get('/inspecoes', (req, res) => res.sendFile(path.join(__dirname, 'public', 'inspecoes.html')));
app.get('/admin/users', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'usuarios.html')));
app.get('/vps/maturidade', (req, res) => res.sendFile(path.join(__dirname, 'public', 'vps', 'maturidade.html')));
app.get('/n3', (req, res) => res.sendFile(path.join(__dirname, 'public', 'n3', 'list.html')));
app.get('/n3/novo', (req, res) => res.sendFile(path.join(__dirname, 'public', 'n3', 'form.html')));

// ────────────────────────────────────────────────
//  SPA fallback — qualquer rota não-API serve o index.html
// ────────────────────────────────────────────────
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        res.status(404).json({ error: 'Rota não encontrada.' });
    }
});

// ────────────────────────────────────────────────
//  Error handler em JSON (o default do Express devolve HTML,
//  que o frontend via como "Erro 400" genérico)
// ────────────────────────────────────────────────
app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Payload muito grande. Divida o lote em partes menores.' });
    }
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Corpo da requisição JSON inválido.' });
    }
    console.error('[SERVER] Erro não tratado:', err);
    if (res.headersSent) return next(err);
    res.status(err.status || 500).json({ error: 'Erro interno do servidor.' });
});

// ────────────────────────────────────────────────
//  Inicialização
// ────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🟢 Omega Safety rodando em http://localhost:${PORT}`);
    console.log(`   Acesso na rede: http://<seu-ip>:${PORT}`);
    console.log(`   ADM padrão: matrícula 1998 / senha 1234`);
    console.log(`   Healthcheck: http://localhost:${PORT}/api/health\n`);
});

// Evita desconexões do balanceador do Render (idle timeout ~60s)
server.keepAliveTimeout  = 65 * 1000;
server.headersTimeout    = 66 * 1000;
server.requestTimeout    = 120 * 1000;

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`[SERVER] Porta ${PORT} já em uso. Defina outra em .env (PORT=...).`);
        process.exit(1);
    }
    console.error('[SERVER] Erro no servidor:', err);
});

// Um erro assíncrono não derruba o serviço em silêncio: loga e mantém no ar.
process.on('unhandledRejection', (reason) => {
    console.error('[SERVER] unhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('[SERVER] uncaughtException:', err);
});

// Encerramento gracioso (Render envia SIGTERM em deploy)
const encerrar = (sinal) => () => {
    console.log(`\n[SERVER] ${sinal} recebido — encerrando com elegância...`);
    server.close(() => {
        const pool = db.pool;
        if (pool) pool.end().catch(() => {});
        process.exit(0);
    });
    setTimeout(() => process.exit(0), 10000).unref();
};
process.on('SIGTERM', encerrar('SIGTERM'));
process.on('SIGINT',  encerrar('SIGINT'));
