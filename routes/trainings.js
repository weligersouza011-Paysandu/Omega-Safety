// routes/trainings.js
const express = require('express');
const db      = require('../database/db');
const { requireAuth } = require('../middleware/auth.middleware');
const router  = express.Router();

// GET /api/treinamentos
router.get('/', requireAuth, async (req, res) => {
    const { perfil, matricula: matLogado } = req.session.usuario;
    const matFilter = req.query.matricula;

    const situacaoExpr = `CASE
        WHEN date(t.data_vencimento) < date('now','localtime') THEN 'vencido'
        WHEN date(t.data_vencimento) <= date('now','localtime','+30 days') THEN 'alerta'
        ELSE 'ok'
    END AS situacao`;

    try {
        let rows;
        if (perfil === 'adm' && !matFilter) {
            rows = await db.allAsync(`SELECT t.*, ${situacaoExpr} FROM treinamentos t ORDER BY t.data_vencimento ASC`);
        } else {
            const mat = matFilter || matLogado;
            rows = await db.allAsync(
                `SELECT t.*, ${situacaoExpr} FROM treinamentos t WHERE t.matricula = ? ORDER BY t.data_vencimento ASC`,
                [mat]
            );
        }
        res.json(rows);
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/treinamentos
router.post('/', requireAuth, async (req, res) => {
    const { matricula, nome, funcao, nome_treinamento, data_realizacao, data_vencimento } = req.body;
    if (!matricula || !nome || !nome_treinamento)
        return res.status(400).json({ error: 'Campos obrigatórios: matricula, nome, nome_treinamento.' });
    try {
        const result = await db.runAsync(
            `INSERT INTO treinamentos (matricula, nome, funcao, nome_treinamento, data_realizacao, data_vencimento)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [matricula, nome, funcao||null, nome_treinamento, data_realizacao||null, data_vencimento||null]
        );
        res.status(201).json({ id: result.lastID, message: 'Treinamento registrado.' });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/treinamentos/:id
router.delete('/:id', requireAuth, async (req, res) => {
    if (req.session.usuario.perfil !== 'adm') return res.status(403).json({ error: 'Acesso negado.' });
    await db.runAsync('DELETE FROM treinamentos WHERE id = ?', [req.params.id]);
    res.json({ message: 'Treinamento removido.' });
});

module.exports = router;
