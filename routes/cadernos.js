// routes/cadernos.js — Cadernos de Inspeção (CRUD + Lixeira + Duplicar)
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db      = require('../database/db');
const { requireAuth, requireAdm } = require('../middleware/auth.middleware');
const router  = express.Router();

// ═══════════════════════════════════════════════════════════════
//  GET /api/cadernos — Listar cadernos ativos/inativos (exclui lixeira)
// ═══════════════════════════════════════════════════════════════
router.get('/', requireAuth, async (req, res) => {
    try {
        const { contrato, status } = req.query;

        // Verificar se as colunas de lixeira existem
        const cols = await db.allAsync("PRAGMA table_info(cadernos_inspecao)");
        const hasExcluidoEm = cols.some(c => c.name === 'excluido_em');

        let where = hasExcluidoEm ? 'c.excluido_em IS NULL' : '1=1';
        const params = [];

        if (contrato) {
            where += ' AND c.contrato = ?';
            params.push(contrato);
        }

        if (status) {
            where += ' AND c.status = ?';
            params.push(status);
        }

        const u = req.session.usuario;
        const isMasterOrAdm = u.is_master === 1 || u.perfil === 'adm';
        if (!isMasterOrAdm && u.contrato) {
            where += " AND (c.contrato IS NULL OR c.contrato = '' OR c.contrato = ?)";
            params.push(u.contrato);
        }

        const cadernos = await db.allAsync(
            `SELECT c.*,
                u_criador.nome  AS criado_por_nome,
                u_atualizador.nome AS atualizado_por_nome,
                (SELECT COUNT(*) FROM perguntas_caderno WHERE caderno_id = c.id) as total_perguntas,
                (SELECT COUNT(*) FROM caderno_respostas WHERE caderno_id = c.id) as total_respostas
             FROM cadernos_inspecao c
             LEFT JOIN usuarios u_criador     ON u_criador.matricula    = c.criado_por
             LEFT JOIN usuarios u_atualizador ON u_atualizador.matricula = c.atualizado_por
             WHERE ${where}
             ORDER BY c.created_at DESC`,
            params
        );

        res.json(cadernos);
    } catch (err) {
        console.error('[CADERNOS] Erro ao listar cadernos:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
//  GET /api/cadernos/lixeira — Listar itens na lixeira
// ═══════════════════════════════════════════════════════════════
router.get('/lixeira', requireAdm, async (req, res) => {
    try {
        // Verificar se as colunas da lixeira existem
        const cols = await db.allAsync("PRAGMA table_info(cadernos_inspecao)");
        const hasExcluidoEm  = cols.some(c => c.name === 'excluido_em');
        const hasExcluidoPor = cols.some(c => c.name === 'excluido_por');

        if (!hasExcluidoEm || !hasExcluidoPor) {
            // Colunas não existem ainda — retornar array vazio (sem erro)
            return res.json([]);
        }

        const cadernos = await db.allAsync(
            `SELECT c.*,
                u_excluiu.nome AS excluido_por_nome,
                (SELECT COUNT(*) FROM perguntas_caderno WHERE caderno_id = c.id) as total_perguntas
             FROM cadernos_inspecao c
             LEFT JOIN usuarios u_excluiu ON u_excluiu.matricula = c.excluido_por
             WHERE c.excluido_em IS NOT NULL
             ORDER BY c.excluido_em DESC`
        );

        const now = Date.now();
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        const result = cadernos.map(c => {
            const excluidoEm = new Date(c.excluido_em).getTime();
            const elapsed = now - excluidoEm;
            const diasRestantes = Math.max(0, Math.ceil((SEVEN_DAYS_MS - elapsed) / (24 * 60 * 60 * 1000)));
            return { ...c, dias_restantes: diasRestantes };
        });

        res.json(result);
    } catch (err) {
        console.error('[CADERNOS] Erro ao buscar lixeira:', err.message);
        // Retornar array vazio em vez de 500 para não quebrar o frontend
        res.json([]);
    }
});

// ═══════════════════════════════════════════════════════════════
//  POST /api/cadernos — Criar caderno com perguntas (ADM)
// ═══════════════════════════════════════════════════════════════
router.post('/', requireAdm, async (req, res) => {
    const { nome, contrato, subcategoria, categoria, perguntas } = req.body;

    if (!nome || !nome.trim()) {
        return res.status(400).json({ error: 'Nome do caderno é obrigatório.' });
    }

    if (!Array.isArray(perguntas) || perguntas.length === 0) {
        return res.status(400).json({ error: 'O caderno deve ter pelo menos uma pergunta.' });
    }

    for (let i = 0; i < perguntas.length; i++) {
        const p = perguntas[i];
        if (!p.texto_pergunta || !p.texto_pergunta.trim()) {
            return res.status(400).json({ error: `Pergunta ${i + 1}: texto é obrigatório.` });
        }
    }

    const id = uuidv4();
    const u = req.session.usuario;

    try {
        await db.runAsync(
            `INSERT INTO cadernos_inspecao (id, nome, contrato, subcategoria, categoria, status, criado_por, atualizado_por)
             VALUES (?,?,?,?,?,?,?,?)`,
            [id, nome.trim(), contrato || null, subcategoria || null, categoria || null, 'ativo', u.matricula, u.matricula]
        );

        for (let i = 0; i < perguntas.length; i++) {
            const p = perguntas[i];
            await db.runAsync(
                `INSERT INTO perguntas_caderno (caderno_id, texto_pergunta, eh_critico_interditivo, ordem)
                 VALUES (?,?,?,?)`,
                [id, p.texto_pergunta.trim(), p.eh_critico_interditivo ? 1 : 0, i + 1]
            );
        }

        await db.runAsync(
            `INSERT INTO historico_cadernos (caderno_id, usuario, acao, detalhes)
             VALUES (?,?,?,?)`,
            [id, u.matricula, 'criado', `Caderno "${nome.trim()}" criado com ${perguntas.length} pergunta(s).`]
        );

        res.status(201).json({ id, message: 'Caderno criado com sucesso.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
//  GET /api/cadernos/:id — Detalhes de um caderno + perguntas + nome do criador
// ═══════════════════════════════════════════════════════════════
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const caderno = await db.getAsync(
            `SELECT c.*,
                u_criador.nome  AS criado_por_nome,
                u_atualizador.nome AS atualizado_por_nome
             FROM cadernos_inspecao c
             LEFT JOIN usuarios u_criador     ON u_criador.matricula    = c.criado_por
             LEFT JOIN usuarios u_atualizador ON u_atualizador.matricula = c.atualizado_por
             WHERE c.id = ?`,
            [req.params.id]
        );
        if (!caderno) {
            return res.status(404).json({ error: 'Caderno não encontrado.' });
        }

        const perguntas = await db.allAsync(
            'SELECT * FROM perguntas_caderno WHERE caderno_id = ? ORDER BY ordem ASC, id ASC',
            [req.params.id]
        );

        res.json({ caderno, perguntas });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
//  PUT /api/cadernos/:id — Atualizar caderno + perguntas (ADM)
// ═══════════════════════════════════════════════════════════════
router.put('/:id', requireAdm, async (req, res) => {
    const { nome, contrato, status, subcategoria, categoria, perguntas } = req.body;
    const u = req.session.usuario;

    try {
        const existing = await db.getAsync(
            'SELECT * FROM cadernos_inspecao WHERE id = ? AND excluido_em IS NULL',
            [req.params.id]
        );
        if (!existing) {
            return res.status(404).json({ error: 'Caderno não encontrado.' });
        }

        const novoNome       = nome       !== undefined ? nome.trim()           : existing.nome;
        const novoContrato   = contrato   !== undefined ? contrato              : existing.contrato;
        const novoStatus     = status     !== undefined ? status                : existing.status;
        const novaSub        = subcategoria !== undefined ? subcategoria         : existing.subcategoria;
        const novaCat        = categoria  !== undefined ? categoria             : existing.categoria;

        await db.runAsync(
            `UPDATE cadernos_inspecao
             SET nome = ?, contrato = ?, status = ?, subcategoria = ?, categoria = ?, atualizado_por = ?, updated_at = datetime('now','localtime')
             WHERE id = ?`,
            [novoNome, novoContrato, novoStatus, novaSub || null, novaCat || null, u.matricula, req.params.id]
        );

        if (Array.isArray(perguntas)) {
            await db.runAsync('DELETE FROM perguntas_caderno WHERE caderno_id = ?', [req.params.id]);

            for (let i = 0; i < perguntas.length; i++) {
                const p = perguntas[i];
                if (!p.texto_pergunta || !p.texto_pergunta.trim()) continue;
                await db.runAsync(
                    `INSERT INTO perguntas_caderno (caderno_id, texto_pergunta, eh_critico_interditivo, ordem)
                     VALUES (?,?,?,?)`,
                    [req.params.id, p.texto_pergunta.trim(), p.eh_critico_interditivo ? 1 : 0, i + 1]
                );
            }
        }

        const detalhes = [];
        if (nome !== undefined) detalhes.push(`Nome: "${existing.nome}" → "${novoNome}"`);
        if (contrato !== undefined) detalhes.push(`Contrato: "${existing.contrato || ''}" → "${novoContrato || ''}"`);
        if (status !== undefined) detalhes.push(`Status: "${existing.status}" → "${novoStatus}"`);
        if (subcategoria !== undefined) detalhes.push(`Subcategoria: "${existing.subcategoria || ''}" → "${novaSub || ''}"`);
        if (categoria !== undefined) detalhes.push(`Categoria: "${existing.categoria || ''}" → "${novaCat || ''}"`);
        if (Array.isArray(perguntas)) detalhes.push(`Perguntas atualizadas (${perguntas.length} itens)`);

        await db.runAsync(
            `INSERT INTO historico_cadernos (caderno_id, usuario, acao, detalhes)
             VALUES (?,?,?,?)`,
            [req.params.id, u.matricula, 'editado', detalhes.join('; ') || 'Cadastro atualizado.']
        );

        res.json({ message: 'Caderno atualizado com sucesso.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
//  POST /api/cadernos/:id/duplicar — Duplicar caderno (ADM)
// ═══════════════════════════════════════════════════════════════
router.post('/:id/duplicar', requireAdm, async (req, res) => {
    const u = req.session.usuario;

    try {
        const original = await db.getAsync(
            'SELECT * FROM cadernos_inspecao WHERE id = ? AND excluido_em IS NULL',
            [req.params.id]
        );
        if (!original) {
            return res.status(404).json({ error: 'Caderno não encontrado.' });
        }

        const perguntasOriginais = await db.allAsync(
            'SELECT * FROM perguntas_caderno WHERE caderno_id = ? ORDER BY ordem ASC',
            [req.params.id]
        );

        const novoId = uuidv4();
        const nomeDuplicado = `${original.nome} (Cópia)`;

        await db.runAsync(
            `INSERT INTO cadernos_inspecao (id, nome, contrato, status, criado_por, atualizado_por)
             VALUES (?,?,?,?,?,?)`,
            [novoId, nomeDuplicado, original.contrato, 'ativo', u.matricula, u.matricula]
        );

        for (const p of perguntasOriginais) {
            await db.runAsync(
                `INSERT INTO perguntas_caderno (caderno_id, texto_pergunta, eh_critico_interditivo, ordem)
                 VALUES (?,?,?,?)`,
                [novoId, p.texto_pergunta, p.eh_critico_interditivo, p.ordem]
            );
        }

        await db.runAsync(
            `INSERT INTO historico_cadernos (caderno_id, usuario, acao, detalhes)
             VALUES (?,?,?,?)`,
            [req.params.id, u.matricula, 'duplicado',
             `Caderno duplicado para "${nomeDuplicado}" (${perguntasOriginais.length} pergunta(s) copiada(s)).`]
        );

        await db.runAsync(
            `INSERT INTO historico_cadernos (caderno_id, usuario, acao, detalhes)
             VALUES (?,?,?,?)`,
            [novoId, u.matricula, 'criado',
             `Duplicado a partir do caderno "${original.nome}" (ID: ${original.id}).`]
        );

        res.status(201).json({
            id: novoId,
            nome: nomeDuplicado,
            message: `Caderno duplicado com sucesso. ${perguntasOriginais.length} pergunta(s) copiada(s).`
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
//  POST /api/cadernos/:id/desativar — Desativar caderno ativo (ADM)
// ═══════════════════════════════════════════════════════════════
router.post('/:id/desativar', requireAdm, async (req, res) => {
    const u = req.session.usuario;

    try {
        const existing = await db.getAsync(
            "SELECT * FROM cadernos_inspecao WHERE id = ? AND excluido_em IS NULL AND status = 'ativo'",
            [req.params.id]
        );
        if (!existing) {
            return res.status(404).json({ error: 'Caderno não encontrado ou já está inativo.' });
        }

        await db.runAsync(
            `UPDATE cadernos_inspecao
             SET status = 'inativo', atualizado_por = ?, updated_at = datetime('now','localtime')
             WHERE id = ?`,
            [u.matricula, req.params.id]
        );

        await db.runAsync(
            `INSERT INTO historico_cadernos (caderno_id, usuario, acao, detalhes)
             VALUES (?,?,?,?)`,
            [req.params.id, u.matricula, 'desativado',
             `Caderno "${existing.nome}" desativado.`]
        );

        res.json({ message: 'Caderno desativado com sucesso.' });
    } catch (err) {
        console.error('[CADERNOS] Erro ao desativar:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
//  POST /api/cadernos/:id/restaurar — Restaurar da lixeira (ADM)
// ═══════════════════════════════════════════════════════════════
router.post('/:id/restaurar', requireAdm, async (req, res) => {
    const u = req.session.usuario;

    try {
        const existing = await db.getAsync(
            'SELECT * FROM cadernos_inspecao WHERE id = ? AND excluido_em IS NOT NULL',
            [req.params.id]
        );
        if (!existing) {
            return res.status(404).json({ error: 'Caderno não encontrado na lixeira.' });
        }

        await db.runAsync(
            `UPDATE cadernos_inspecao
             SET excluido_em = NULL, excluido_por = NULL, status = 'inativo',
                 atualizado_por = ?, updated_at = datetime('now','localtime')
             WHERE id = ?`,
            [u.matricula, req.params.id]
        );

        await db.runAsync(
            `INSERT INTO historico_cadernos (caderno_id, usuario, acao, detalhes)
             VALUES (?,?,?,?)`,
            [req.params.id, u.matricula, 'restaurado',
             `Caderno "${existing.nome}" restaurado da lixeira.`]
        );

        res.json({ message: 'Caderno restaurado com sucesso.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
//  DELETE /api/cadernos/:id — Mover para lixeira (ADM)
// ═══════════════════════════════════════════════════════════════
router.delete('/:id', requireAdm, async (req, res) => {
    const u = req.session.usuario;

    try {
        // Verificar se as colunas da lixeira existem
        const cols = await db.allAsync("PRAGMA table_info(cadernos_inspecao)");
        const hasExcluidoEm  = cols.some(c => c.name === 'excluido_em');
        const hasExcluidoPor = cols.some(c => c.name === 'excluido_por');

        if (!hasExcluidoEm || !hasExcluidoPor) {
            return res.status(500).json({ error: 'Colunas de lixeira não configuradas no banco de dados. Reinicie o servidor.' });
        }

        const existing = await db.getAsync(
            'SELECT * FROM cadernos_inspecao WHERE id = ? AND excluido_em IS NULL',
            [req.params.id]
        );
        if (!existing) {
            return res.status(404).json({ error: 'Caderno não encontrado ou já na lixeira.' });
        }

        await db.runAsync(
            `UPDATE cadernos_inspecao
             SET excluido_em = datetime('now','localtime'), excluido_por = ?,
                 atualizado_por = ?, updated_at = datetime('now','localtime')
             WHERE id = ?`,
            [u.matricula, u.matricula, req.params.id]
        );

        await db.runAsync(
            `INSERT INTO historico_cadernos (caderno_id, usuario, acao, detalhes)
             VALUES (?,?,?,?)`,
            [req.params.id, u.matricula, 'excluido_lixeira',
             `Caderno "${existing.nome}" movido para a lixeira.`]
        );

        res.json({ message: 'Caderno movido para a lixeira.' });
    } catch (err) {
        console.error('[CADERNOS] Erro ao excluir caderno:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
//  DELETE /api/cadernos/:id/permanente — Excluir permanentemente (ADM)
// ═══════════════════════════════════════════════════════════════
router.delete('/:id/permanente', requireAdm, async (req, res) => {
    const u = req.session.usuario;

    try {
        const existing = await db.getAsync(
            'SELECT * FROM cadernos_inspecao WHERE id = ? AND excluido_em IS NOT NULL',
            [req.params.id]
        );
        if (!existing) {
            return res.status(404).json({ error: 'Caderno não encontrado na lixeira.' });
        }

        await db.runAsync('DELETE FROM perguntas_caderno WHERE caderno_id = ?', [req.params.id]);
        await db.runAsync('DELETE FROM historico_cadernos WHERE caderno_id = ?', [req.params.id]);
        await db.runAsync('DELETE FROM caderno_respostas WHERE caderno_id = ?', [req.params.id]);
        await db.runAsync('DELETE FROM cadernos_inspecao WHERE id = ?', [req.params.id]);

        res.json({ message: `Caderno "${existing.nome}" excluído permanentemente.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
//  GET /api/cadernos/:id/historico — Histórico de alterações (ADM)
// ═══════════════════════════════════════════════════════════════
router.get('/:id/historico', requireAdm, async (req, res) => {
    try {
        const historico = await db.allAsync(
            `SELECT h.*, u.nome AS usuario_nome
             FROM historico_cadernos h
             LEFT JOIN usuarios u ON u.matricula = h.usuario
             WHERE h.caderno_id = ?
             ORDER BY h.timestamp DESC`,
            [req.params.id]
        );
        res.json(historico);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
