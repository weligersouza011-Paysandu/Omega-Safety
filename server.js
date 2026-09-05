// server.js — Entry point do Omega Safety
require('dotenv').config();

const express      = require('express');
const session      = require('express-session');
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

// Sessões persistidas no SQLite
app.use(session({
    store: new SQLiteStore({
        db:  'sessions.db',
        dir: path.join(__dirname, 'database'),
    }),
    secret:            process.env.SESSION_SECRET || 'omega_safety_secret',
    resave:            false,
    saveUninitialized: false,
    cookie: {
        secure:   false,          // true em produção com HTTPS
        httpOnly: true,
        maxAge:   8 * 60 * 60 * 1000, // 8 horas (turno de trabalho)
    },
}));

// Arquivos estáticos (frontend)
app.use(express.static(path.join(__dirname, 'public')));

// Servir uploads como estáticos (apenas o caminho é gravado no banco)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Servir imagens oficias da marca
app.use('/Logo', express.static(path.join(__dirname, 'Logo')));

// ────────────────────────────────────────────────
//  Rotas da API
// ────────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/n3',        require('./routes/n3'));
app.use('/api/treinamentos', require('./routes/trainings'));
app.use('/api/inspecoes', require('./routes/inspections'));
app.use('/api/users', require('./routes/users'));

// ────────────────────────────────────────────────
//  Rotas do Front-End (Sem extensão .html)
// ────────────────────────────────────────────────
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/inspecoes', (req, res) => res.sendFile(path.join(__dirname, 'public', 'inspecoes.html')));
app.get('/admin/users', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'usuarios.html')));
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
