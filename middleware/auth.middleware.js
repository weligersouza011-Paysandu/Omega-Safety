// middleware/auth.middleware.js
// Verifica se existe sessão ativa e, opcionalmente, se é ADM ou Master

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

// Apenas ADM Master pode acessar rotas protegidas por este middleware
function requireMaster(req, res, next) {
    if (!req.session || !req.session.usuario) {
        return res.status(401).json({ error: 'Não autenticado.' });
    }
    if (!req.session.usuario.is_master) {
        return res.status(403).json({ error: 'Acesso restrito ao Administrador Master.' });
    }
    next();
}

/**
 * Middleware de escopo de contrato.
 * - ADM Master: acesso livre a todos os contratos.
 * - ADM Comum: injeta req.contratoScope = contrato do usuário (e ignora ?contrato de terceiros).
 * - Operacional: injeta req.contratoScope = contrato do usuário.
 *
 * As rotas devem utilizar req.contratoScope e req.isMaster para filtrar queries.
 */
function requireContractScope(req, res, next) {
    if (!req.session || !req.session.usuario) {
        return res.status(401).json({ error: 'Não autenticado.' });
    }

    const u = req.session.usuario;
    req.isMaster = u.is_master === 1;
    req.isAdm = u.perfil === 'adm';
    req.isOperacional = u.perfil === 'operacional';
    req.usuarioLogado = u;

    if (req.isMaster) {
        // Master: sem restrição, usa o ?contrato da query se fornecido
        req.contratoScope = null; // null = irrestrito
    } else {
        // ADM comum ou Operacional: força o contrato do próprio usuário
        req.contratoScope = u.contrato || null;
    }

    next();
}

module.exports = { requireAuth, requireAdm, requireMaster, requireContractScope };
