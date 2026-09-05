// routes/auth.js
const express = require('express');
const bcrypt  = require('bcryptjs');
const db      = require('../database/db');
const router  = express.Router();

// POST /api/auth/check-matricula
router.post('/check-matricula', async (req, res) => {
    const { matricula } = req.body;
    if (!matricula) return res.status(400).json({ error: 'Matrícula obrigatória.' });
    try {
        const usuario = await db.getAsync(
            'SELECT id, matricula, nome, perfil, is_master, ativo FROM usuarios WHERE matricula = ?',
            [matricula.trim()]
        );
        if (!usuario) return res.status(404).json({ error: 'Matrícula não encontrada.' });
        if (!usuario.ativo) return res.status(403).json({ error: 'Usuário inativo.' });
        res.json({ role: usuario.perfil, nome: usuario.nome, is_master: usuario.is_master });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { matricula, senha } = req.body;
    if (!matricula) return res.status(400).json({ error: 'Matrícula obrigatória.' });
    try {
        const usuario = await db.getAsync('SELECT * FROM usuarios WHERE matricula = ?', [matricula.trim()]);
        if (!usuario) return res.status(404).json({ error: 'Matrícula não encontrada.' });
        if (!usuario.ativo) return res.status(403).json({ error: 'Usuário inativo.' });

        const isAdm = usuario.is_master === 1 || (usuario.perfil && (usuario.perfil.toLowerCase() === 'adm' || usuario.perfil.toLowerCase() === 'administrador'));
        if (isAdm) {
            if (!senha) return res.status(401).json({ error: 'Senha obrigatória' });
            if (!bcrypt.compareSync(senha, usuario.senha_hash))
                return res.status(401).json({ error: 'Senha incorreta.' });
        }

        req.session.usuario = {
            id: usuario.id, matricula: usuario.matricula, nome: usuario.nome,
            funcao: usuario.funcao, lideranca: usuario.lideranca, perfil: usuario.perfil,
            foto_perfil: usuario.foto_perfil, contrato: usuario.contrato,
            is_lideranca: usuario.is_lideranca, is_master: usuario.is_master || 0
        };
        res.json({ message: 'Login realizado com sucesso.', usuario: req.session.usuario });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
    if (!req.session?.usuario) return res.status(401).json({ error: 'Não autenticado.' });
    try {
        const usuario = await db.getAsync(
            'SELECT id, matricula, nome, funcao, lideranca, perfil, foto_perfil, contrato, is_lideranca, is_master FROM usuarios WHERE id = ?',
            [req.session.usuario.id]
        );
        if (!usuario) return res.status(404).json({ error: 'Usuário não encontrado.' });
        // Mantém a sessão atualizada com o banco
        req.session.usuario.foto_perfil = usuario.foto_perfil;
        req.session.usuario.is_lideranca = usuario.is_lideranca;
        req.session.usuario.is_master = usuario.is_master || 0;
        res.json(usuario);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
    req.session.destroy(() => res.json({ message: 'Logout realizado.' }));
});

module.exports = router;
