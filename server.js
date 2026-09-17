// server.js — Entry point do Omega Safety
require('dotenv').config();

const express      = require('express');
const session      = require('express-session');
const sqlite3      = require('sqlite3');
const SQLiteStore  = require('connect-sqlite3')(session);
const path         = require('path');
const cors         = require('cors');

const app = express();

// ────────────────────────────────────────────────
//  Middlewares globais
// ────────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'omega_safety_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // true em produção se HTTPS estrito
        httpOnly: true,
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
//  Inicialização
// ────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🟢 Omega Safety rodando em http://localhost:${PORT}`);
    console.log(`   Acesso na rede: http://<seu-ip>:${PORT}`);
    console.log(`   ADM padrão: matrícula 1998 / senha 1234\n`);
});
