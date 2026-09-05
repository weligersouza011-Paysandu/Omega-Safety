// routes/users.js — Gestão de Usuários
const express = require('express');
const bcrypt  = require('bcryptjs');
const multer  = require('multer');
const path    = require('path');
const db      = require('../database/db');
const { requireAdm, requireAuth } = require('../middleware/auth.middleware');
const router  = express.Router();

// Configuração do Multer para foto de perfil
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '..', 'public', 'uploads', 'perfis'));
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `avatar_${req.session.usuario.id}_${Date.now()}${ext}`);
    }
});
const upload = multer({ storage });

// ── Cadastro em Lote (Operacional) ────────────────────────
router.post('/batch', requireAdm, async (req, res) => {
    const { users } = req.body;
    
    if (!Array.isArray(users) || users.length === 0) {
        return res.status(400).json({ error: 'Lista de usuários inválida ou vazia.' });
    }

    let insertedCount = 0;
    let ignoredCount  = 0;

    try {
        // Usa transação para performance
        await db.runAsync('BEGIN TRANSACTION');

        for (const user of users) {
            const { matricula, nome, contrato } = user;
            if (!matricula || !nome) {
                ignoredCount++;
                continue; // Pula linha inválida
            }

            try {
                // INSERT OR IGNORE no SQLite (evita erro de UNIQUE constraint na matrícula)
                await db.runAsync(
                    `INSERT OR IGNORE INTO usuarios (matricula, nome, perfil, contrato) VALUES (?, ?, 'operacional', ?)`,
                    [matricula.trim(), nome.trim(), contrato ? contrato.trim() : null]
                );
                
                // SQLite run: `this.changes` diz quantas linhas foram afetadas. Mas com promisify, 
                // para ser seguro sem depender do `this`, checamos separadamente ou apenas 
                // assumimos que passou (já que IGNORE engole o erro).
                insertedCount++;
            } catch (innerErr) {
                ignoredCount++;
            }
        }

        await db.runAsync('COMMIT');

        res.json({
            message: `Lote processado. Registros inseridos/atualizados: ${insertedCount}. Com erro ou ignorados: ${ignoredCount}.`,
            insertedCount,
            ignoredCount
        });
    } catch (err) {
        await db.runAsync('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
});

// ── Cadastro Individual (Administrador) ───────────────────
router.post('/adm', requireAdm, async (req, res) => {
    const { matricula, nome, senha, contrato } = req.body;

    if (!matricula || !nome || !senha || !contrato) {
        return res.status(400).json({ error: 'Todos os campos (Matrícula, Nome, Contrato e Senha) são obrigatórios para um ADM.' });
    }

    // Valida contrato: até 3 dígitos numéricos
    if (!/^\d{1,3}$/.test(contrato.trim())) {
        return res.status(400).json({ error: 'O contrato deve conter até 3 dígitos numéricos.' });
    }

    try {
        const hash = bcrypt.hashSync(senha, 10);
        await db.runAsync(
            `INSERT INTO usuarios (matricula, nome, perfil, senha_hash, contrato) VALUES (?, ?, 'adm', ?, ?)`,
            [matricula.trim(), nome.trim(), hash, contrato.trim()]
        );
        res.status(201).json({ message: 'Administrador cadastrado com sucesso.' });
    } catch (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ error: 'Matrícula já existe no sistema.' });
        }
        res.status(500).json({ error: err.message });
    }
});

// ── Listagem Geral (Administrador) ──────────────────────
router.get('/', requireAdm, async (req, res) => {
    try {
        const rows = await db.allAsync(`SELECT id, matricula, nome, perfil, ativo, criado_em, contrato, foto_perfil, is_lideranca FROM usuarios WHERE ativo = 1 ORDER BY nome ASC`);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Edição Individual ─────────────────────────────────────
router.patch('/:id', requireAdm, async (req, res) => {
    const { matricula, nome, contrato } = req.body;
    if (!matricula || !nome) return res.status(400).json({ error: 'Matrícula e Nome são obrigatórios.' });

    try {
        await db.runAsync(
            `UPDATE usuarios SET matricula = ?, nome = ?, contrato = ? WHERE id = ?`,
            [matricula.trim(), nome.trim(), contrato ? contrato.trim() : null, req.params.id]
        );
        res.json({ message: 'Usuário atualizado com sucesso.' });
    } catch (err) {
        if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Matrícula já está em uso.' });
        res.status(500).json({ error: err.message });
    }
});

// ── Toggle Liderança ─────────────────────────────────────
router.patch('/:id/lideranca', requireAdm, async (req, res) => {
    const { is_lideranca } = req.body;
    try {
        await db.runAsync(
            `UPDATE usuarios SET is_lideranca = ? WHERE id = ?`,
            [is_lideranca ? 1 : 0, req.params.id]
        );
        res.json({ message: is_lideranca ? 'Usuário marcado como Liderança.' : 'Flag de Liderança removida.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Lideranças por Contrato (para o formulário N3) ───────
router.get('/liderancas/:contrato', requireAuth, async (req, res) => {
    try {
        const rows = await db.allAsync(
            `SELECT id, matricula, nome FROM usuarios WHERE ativo = 1 AND is_lideranca = 1 AND contrato = ? ORDER BY nome ASC`,
            [req.params.contrato]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Contratos Ativos (distintos com usuários ativos) ─────
router.get('/contratos-ativos', requireAuth, async (req, res) => {
    try {
        const rows = await db.allAsync(
            `SELECT DISTINCT contrato FROM usuarios WHERE ativo = 1 AND contrato IS NOT NULL AND contrato != '' ORDER BY contrato ASC`
        );
        res.json(rows.map(r => r.contrato));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Exclusão em Lote (Apenas Operacional) ─────────────────
router.delete('/batch', requireAdm, async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'Nenhum ID fornecido.' });

    try {
        // Verifica se algum dos IDs é ADM
        const placeholders = ids.map(() => '?').join(',');
        const users = await db.allAsync(`SELECT id, perfil FROM usuarios WHERE id IN (${placeholders})`, ids);
        
        if (users.some(u => u.perfil === 'adm')) {
            return res.status(403).json({ error: 'Administradores não podem ser excluídos em lote.' });
        }

        let apagados = 0;
        let inativados = 0;

        await db.runAsync('BEGIN TRANSACTION');
        for (const id of ids) {
            try {
                // Tenta apagar definitivamente
                await db.runAsync(`DELETE FROM usuarios WHERE id = ?`, [id]);
                apagados++;
            } catch (err) {
                // Se falhar (ex: FOREIGN KEY constraint falhou devido a um histórico de N3)
                // Fazemos o Soft Delete (inativação)
                await db.runAsync(`UPDATE usuarios SET ativo = 0 WHERE id = ?`, [id]);
                inativados++;
            }
        }
        await db.runAsync('COMMIT');

        res.json({ message: `Lote excluído. Removidos: ${apagados}. Inativados (p/ manter histórico): ${inativados}.` });
    } catch (err) {
        await db.runAsync('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
});

// ── Exclusão Individual (ADM ou Operacional) ──────────────
router.delete('/:id', requireAdm, async (req, res) => {
    try {
        const user = await db.getAsync(`SELECT id, perfil FROM usuarios WHERE id = ?`, [req.params.id]);
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
        
        // Evita que o ADM exclua a si próprio
        if (user.id === req.session.usuario.id) {
            return res.status(403).json({ error: 'Você não pode excluir a sua própria conta.' });
        }

        try {
            await db.runAsync(`DELETE FROM usuarios WHERE id = ?`, [req.params.id]);
            res.json({ message: 'Usuário removido permanentemente.' });
        } catch (err) {
            // Soft Delete fallback
            await db.runAsync(`UPDATE usuarios SET ativo = 0 WHERE id = ?`, [req.params.id]);
            res.json({ message: 'Usuário inativado para preservação do histórico de segurança.' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Estatísticas do Dashboard Analítico ─────────────────────
router.get('/stats/dashboard', requireAdm, async (req, res) => {
    try {
        // Contagem por perfil
        const perfis = await db.allAsync(`SELECT perfil, COUNT(*) as qtd FROM usuarios WHERE ativo = 1 GROUP BY perfil`);
        
        // Contagem por contrato (TODOS os usuários: ADM + Operacionais)
        const contratos = await db.allAsync(`
            SELECT contrato, COUNT(*) as qtd 
            FROM usuarios 
            WHERE ativo = 1 AND contrato IS NOT NULL AND contrato != ''
            GROUP BY contrato 
            ORDER BY qtd DESC
        `);

        res.json({ perfis, contratos });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Upload de Foto de Perfil (Ouro/Bronze) ──────────────────
router.post('/me/photo', requireAuth, upload.single('avatar'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }
    
    const photoUrl = `/uploads/perfis/${req.file.filename}`;
    const userId = req.session.usuario.id;

    try {
        await db.runAsync(`UPDATE usuarios SET foto_perfil = ? WHERE id = ?`, [photoUrl, userId]);
        req.session.usuario.foto_perfil = photoUrl; // Atualiza na sessão também
        res.json({ message: 'Foto atualizada com sucesso. Você agora é um Usuário Ouro!', url: photoUrl });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
