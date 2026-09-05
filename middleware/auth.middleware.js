// middleware/auth.middleware.js
// Verifica se existe sessão ativa e, opcionalmente, se é ADM

function requireAuth(req, res, next) {
    if (!req.session || !req.session.usuario) {
        return res.status(401).json({ error: 'Não autenticado. Faça login.' });
    }
    next();
}

function requireAdm(req, res, next) {
    if (!req.session || !req.session.usuario) {
        return res.status(401).json({ error: 'Não autenticado.' });
    }
    if (req.session.usuario.is_master) {
        return next();
    }
    if (req.session.usuario.perfil !== 'adm') {
        return res.status(403).json({ error: 'Acesso restrito ao perfil ADM.' });
    }
    next();
}

module.exports = { requireAuth, requireAdm };
