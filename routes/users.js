// routes/users.js — Gestão de Usuários
const express = require('express');
const bcrypt  = require('bcryptjs');
const multer  = require('multer');
const db      = require('../database/db');
const { uploadBuffer, removeMedia } = require('../config/cloudinary');
const { requireAdm, requireAuth, requireMaster, requireContractScope } = require('../middleware/auth.middleware');
const router  = express.Router();

// Foto de perfil: upload em memória → Cloudinary
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
});

// ── Cadastro em Lote (Operacional) ────────────────────────
const MAX_LOTE       = 2000;  // registros por requisição
const LOTE_CHUNK     = 200;   // linhas por statement multi-row (200×3 = 600 params < 999 do SQLite)
const CONTRATO_RE    = /^[0-9a-zA-Z,\s\-_]+$/;

// Insert multi-linha em uma única query por chunk (em vez de 1 query por linha)
async function insertUsuariosChunk(q, chunk) {
    const verb = db.isPostgres ? 'INSERT INTO' : 'INSERT OR IGNORE INTO';
    const onConflict = db.isPostgres ? ' ON CONFLICT (matricula) DO NOTHING' : '';
    const placeholders = chunk.map(() => '(?, ?, \'operacional\', ?)').join(', ');
    const params = [];
    for (const u of chunk) params.push(u.matricula, u.nome, u.contrato);

    const r = await q.runAsync(
        ` ${verb} usuarios (matricula, nome, perfil, contrato) VALUES ${placeholders}${onConflict}`,
        params
    );
    // PG: rowCount com DO NOTHING = linhas realmente inseridas | SQLite: changes do statement
    return r.changes || 0;
}

router.post('/batch', requireAdm, async (req, res) => {
    const { users } = req.body || {};

    if (!Array.isArray(users) || users.length === 0) {
        return res.status(400).json({ error: 'Lista de usuários inválida ou vazia.' });
    }
    if (users.length > MAX_LOTE) {
        return res.status(400).json({ error: `Lote excede o limite de ${MAX_LOTE} registros. Divida em lotes menores.` });
    }

    // ── Validação eficiente (uma passada, sem I/O) ──
    const errors = [];
    const validos = [];
    const vistos = new Set();

    users.forEach((user, index) => {
        const matricula = String(user?.matricula ?? '').trim();
        const nome      = String(user?.nome ?? '').trim();
        const contrato  = String(user?.contrato ?? '').trim();

        if (!matricula)                       return errors.push({ index, matricula, motivo: 'Matrícula vazia.' });
        if (matricula.length > 255)           return errors.push({ index, matricula, motivo: 'Matrícula acima de 255 caracteres.' });
        if (!nome)                            return errors.push({ index, matricula, motivo: 'Nome vazio.' });
        if (nome.length > 255)                return errors.push({ index, matricula, motivo: 'Nome acima de 255 caracteres.' });
        if (contrato.length > 255)            return errors.push({ index, matricula, motivo: 'Contrato acima de 255 caracteres.' });
        if (contrato && !CONTRATO_RE.test(contrato)) {
                                              return errors.push({ index, matricula, motivo: 'Contrato inválido (ex: 251 ou 251, 301).' });
        }
        if (vistos.has(matricula))            return errors.push({ index, matricula, motivo: 'Matrícula repetida no lote.' });

        vistos.add(matricula);
        validos.push({ matricula, nome, contrato: contrato || null });
    });

    if (validos.length === 0) {
        return res.status(422).json({
            error: 'Nenhum registro válido no lote. Corrija as linhas indicadas e tente novamente.',
            invalidCount: errors.length,
            errors
        });
    }

    try {
        // Transação em conexão dedicada + inserts multi-linha em chunks:
        // 1 requisição → ~⌈N/200⌉ queries (antes: N queries, uma por linha)
        const insertedCount = await db.withTransaction(async (q) => {
            let inseridos = 0;
            for (let i = 0; i < validos.length; i += LOTE_CHUNK) {
                inseridos += await insertUsuariosChunk(q, validos.slice(i, i + LOTE_CHUNK));
            }
            return inseridos;
        });

        const ignoredCount = validos.length - insertedCount;
        res.json({
            message: `Lote processado. Inseridos: ${insertedCount}. Já existentes (ignorados): ${ignoredCount}. Inválidos: ${errors.length}.`,
            insertedCount,
            ignoredCount,
            invalidCount: errors.length,
            errors
        });
    } catch (err) {
        console.error('[USERS] Erro no cadastro em lote:', err);
        if (err.code === '23505' || String(err.message).includes('UNIQUE')) {
            return res.status(409).json({ error: 'Matrícula já existe no sistema.' });
        }
        res.status(500).json({
            error: 'Falha ao processar o lote. Nada foi salvo (transação revertida) — tente novamente.'
        });
    }
});

// ── Cadastro Individual (Administrador) ───────────────────
router.post('/adm', requireAdm, async (req, res) => {
    const { matricula, nome, senha, contrato } = req.body;

    if (!matricula || !nome || !senha || !contrato) {
        return res.status(400).json({ error: 'Todos os campos (Matrícula, Nome, Contrato e Senha) são obrigatórios para um ADM.' });
    }

    // Valida contrato: permite números/contratos separados por vírgula (ex: 251 ou 251, 301)
    if (!/^[0-9a-zA-Z,\s\-_]+$/.test(contrato.trim())) {
        return res.status(400).json({ error: 'O contrato deve conter identificadores válidos (ex: 251 ou 251, 301).' });
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
router.get('/', requireAdm, requireContractScope, async (req, res) => {
    try {
        // ADM comum: lista usuários do próprio contrato + todos os ADMs
        // ADM Master: lista todos
        let query = `SELECT id, matricula, nome, perfil, ativo, criado_em, contrato, foto_perfil, is_lideranca, is_master FROM usuarios WHERE ativo = 1`;
        const params = [];

        if (!req.isMaster && req.contratoScope) {
            query += ` AND (contrato = ? OR perfil = 'adm')`;
            params.push(req.contratoScope);
        }

        query += ` ORDER BY perfil DESC, nome ASC`;
        const rows = await db.allAsync(query, params);
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
    const rawIds = req.body?.ids;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
        return res.status(400).json({ error: 'Nenhum ID fornecido.' });
    }
    if (rawIds.length > MAX_LOTE) {
        return res.status(400).json({ error: `Limite de ${MAX_LOTE} registros por exclusão.` });
    }

    const ids = rawIds.map(Number).filter(n => Number.isInteger(n) && n > 0);
    if (ids.length === 0) return res.status(400).json({ error: 'IDs inválidos.' });

    const DEL_CHUNK = 500; // < 999 params do SQLite

    try {
        // Verifica se algum dos IDs é ADM (em chunks para respeitar o limite de parâmetros)
        for (let i = 0; i < ids.length; i += DEL_CHUNK) {
            const parte = ids.slice(i, i + DEL_CHUNK);
            const ph = parte.map(() => '?').join(',');
            const users = await db.allAsync(`SELECT id, perfil FROM usuarios WHERE id IN (${ph})`, parte);
            if (users.some(u => u.perfil === 'adm')) {
                return res.status(403).json({ error: 'Administradores não podem ser excluídos em lote.' });
            }
        }

        let apagados = 0;
        let inativados = 0;

        for (let i = 0; i < ids.length; i += DEL_CHUNK) {
            const parte = ids.slice(i, i + DEL_CHUNK);
            const ph = parte.map(() => '?').join(',');
            try {
                // Exclusão em massa: uma única query por chunk (falha inteira se alguma FK bloquear)
                const r = await db.runAsync(`DELETE FROM usuarios WHERE id IN (${ph})`, parte);
                apagados += r.changes || 0;
            } catch (fkErr) {
                // Fallback linha a linha: DELETE que falhar por FK vira Soft Delete (preserva histórico)
                for (const id of parte) {
                    try {
                        const r = await db.runAsync(`DELETE FROM usuarios WHERE id = ?`, [id]);
                        if (r.changes) apagados++;
                    } catch (err) {
                        await db.runAsync(`UPDATE usuarios SET ativo = 0 WHERE id = ?`, [id]);
                        inativados++;
                    }
                }
            }
        }

        res.json({ message: `Lote excluído. Removidos: ${apagados}. Inativados (p/ manter histórico): ${inativados}.` });
    } catch (err) {
        console.error('[USERS] Erro na exclusão em lote:', err);
        res.status(500).json({ error: 'Falha ao excluir o lote. Tente novamente.' });
    }
});

// ── Toggle Master (apenas ADM Master pode conceder/revogar) ──
router.patch('/:id/master', requireMaster, async (req, res) => {
    const { is_master } = req.body;
    const targetId = req.params.id;

    // Impede que o Master retire o próprio status de Master
    if (Number(targetId) === req.session.usuario.id && !is_master) {
        return res.status(403).json({ error: 'Você não pode remover o seu próprio status de Master.' });
    }

    try {
        const targetUser = await db.getAsync(`SELECT id, perfil, nome FROM usuarios WHERE id = ?`, [targetId]);
        if (!targetUser) return res.status(404).json({ error: 'Usuário não encontrado.' });
        if (targetUser.perfil !== 'adm') {
            return res.status(400).json({ error: 'Apenas Administradores podem ter o status de Master.' });
        }

        await db.runAsync(`UPDATE usuarios SET is_master = ? WHERE id = ?`, [is_master ? 1 : 0, targetId]);
        res.json({ message: is_master ? `${targetUser.nome} promovido a Administrador Master.` : `Status de Master removido de ${targetUser.nome}.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Exclusão Individual (ADM ou Operacional) ──────────────
router.delete('/:id', requireAdm, requireContractScope, async (req, res) => {
    try {
        const user = await db.getAsync(`SELECT id, perfil, is_master FROM usuarios WHERE id = ?`, [req.params.id]);
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
        
        // Evita que o ADM exclua a si próprio
        if (user.id === req.session.usuario.id) {
            return res.status(403).json({ error: 'Você não pode excluir a sua própria conta.' });
        }

        // Impede que ADM comum exclua um Master
        if (user.is_master && !req.isMaster) {
            return res.status(403).json({ error: 'Apenas um Administrador Master pode remover outro Master.' });
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
router.get('/stats/dashboard', requireAdm, requireContractScope, async (req, res) => {
    try {
        let perfisQuery = `SELECT perfil, COUNT(*) as qtd FROM usuarios WHERE ativo = 1`;
        let contratosQuery = `SELECT contrato, COUNT(*) as qtd FROM usuarios WHERE ativo = 1 AND contrato IS NOT NULL AND contrato != ''`;
        const params = [];

        // ADM comum: restringe estatísticas ao próprio contrato
        if (!req.isMaster && req.contratoScope) {
            perfisQuery += ` AND contrato = ?`;
            contratosQuery += ` AND contrato = ?`;
            params.push(req.contratoScope);
        }

        const perfis = await db.allAsync(perfisQuery + ` GROUP BY perfil`, params);
        const contratos = await db.allAsync(contratosQuery + ` GROUP BY contrato ORDER BY qtd DESC`, params);

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
    
    const userId = req.session.usuario.id;
    const pasta = `omega-safety/perfis/avatar_${userId}`;

    let photoUrl;
    try {
        const uploaded = await uploadBuffer(req.file.buffer, {
            folder: pasta,
            resourceType: 'image',
            filename: req.file.originalname,
        });
        photoUrl = uploaded.secure_url;
    } catch (upErr) {
        return res.status(502).json({ error: 'Falha ao enviar a foto para o Cloudinary: ' + upErr.message });
    }

    try {
        const anterior = await db.getAsync(`SELECT foto_perfil FROM usuarios WHERE id = ?`, [userId]);
        await db.runAsync(`UPDATE usuarios SET foto_perfil = ? WHERE id = ?`, [photoUrl, userId]);
        req.session.usuario.foto_perfil = photoUrl; // Atualiza na sessão também
        if (anterior && anterior.foto_perfil) await removeMedia(anterior.foto_perfil);
        res.json({ message: 'Foto atualizada com sucesso. Você agora é um Usuário Ouro!', url: photoUrl });
    } catch (err) {
        await removeMedia(photoUrl);
        res.status(500).json({ error: err.message });
    }
});

// ── Alteração de Senha (Todos os Colaboradores Autenticados) ──
router.patch('/me/password', requireAuth, async (req, res) => {
    const { novaSenha, confirmaSenha } = req.body;
    const userId = req.session.usuario.id;

    if (!novaSenha || !confirmaSenha) {
        return res.status(400).json({ error: 'Preencha a nova senha e a confirmação.' });
    }

    if (novaSenha !== confirmaSenha) {
        return res.status(400).json({ error: 'As senhas digitadas não coincidem.' });
    }

    if (novaSenha.length < 4) {
        return res.status(400).json({ error: 'A senha deve ter no mínimo 4 caracteres.' });
    }

    try {
        const hash = bcrypt.hashSync(novaSenha, 10);
        await db.runAsync(`UPDATE usuarios SET senha_hash = ? WHERE id = ?`, [hash, userId]);
        res.json({ message: 'Senha alterada com sucesso!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
