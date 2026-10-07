// routes/n3.js
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');
const db      = require('../database/db');
const { uploadBuffer, removeMedia } = require('../config/cloudinary');
const { requireAuth, requireAdm, requireContractScope } = require('../middleware/auth.middleware');
const router  = express.Router();

// ── Multer (memória) + Cloudinary ───────────────
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const ok = /jpeg|jpg|png|gif|webp/.test(path.extname(file.originalname).toLowerCase());
        ok ? cb(null, true) : cb(new Error('Apenas imagens.'));
    },
});

async function uploadToCloudinary(file, folder) {
    if (!file) return null;
    const { secure_url } = await uploadBuffer(file.buffer, {
        folder,
        resourceType: 'image',
        filename: file.originalname,
    });
    return secure_url;
}

// GET /api/n3/contratos — lista contratos distintos com registros N3 ou usuários
router.get('/contratos', requireAuth, async (req, res) => {
    try {
        const rows = await db.allAsync(`
            SELECT DISTINCT contrato FROM (
                SELECT u.contrato FROM usuarios u WHERE u.contrato IS NOT NULL AND TRIM(u.contrato) != ''
                UNION
                SELECT u.contrato FROM n3_registros n JOIN usuarios u ON u.matricula = n.matricula_observador WHERE u.contrato IS NOT NULL AND TRIM(u.contrato) != ''
            ) ORDER BY contrato ASC
        `);
        const set = new Set();
        rows.forEach(r => {
            if (r.contrato) {
                const c = String(r.contrato).replace(/[^0-9a-zA-Z]/g, '') || String(r.contrato).trim();
                if (c) set.add(c);
            }
        });
        res.json([...set]);
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/n3/locais
router.get('/locais', requireAuth, async (req, res) => {
    try {
        const rows = await db.allAsync(`
            SELECT DISTINCT local_ss
            FROM n3_registros
            WHERE local_ss IS NOT NULL AND local_ss != ''
            ORDER BY local_ss ASC
        `);
        res.json(rows.map(r => r.local_ss));
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/n3
router.get('/', requireAuth, requireContractScope, async (req, res) => {
    const { matricula } = req.session.usuario;
    const { nivel, page = 1, limit = 200, contrato } = req.query;

    let where = 'WHERE 1=1';
    const params = [];

    if (req.isMaster) {
        // Master: pode filtrar livremente por qualquer contrato
        if (contrato && String(contrato).trim() !== '' && String(contrato).trim() !== 'Todos') {
            const contratoLimpo = String(contrato).replace(/[^0-9a-zA-Z]/g, '') || String(contrato).trim();
            where += ` AND (n.contrato = ? OR n.contrato = ? OR u.contrato = ? OR u.contrato = ?)`;
            params.push(contratoLimpo, String(contrato).trim(), contratoLimpo, String(contrato).trim());
        }
    } else if (req.contratoScope) {
        // ADM comum ou Operacional com contrato
        const contratoLimpo = String(req.contratoScope).replace(/[^0-9a-zA-Z]/g, '') || String(req.contratoScope).trim();
        if (req.isAdm) {
            // ADM comum: todos do contrato
            where += ` AND (n.contrato = ? OR n.contrato = ? OR u.contrato = ? OR u.contrato = ?)`;
            params.push(contratoLimpo, String(req.contratoScope).trim(), contratoLimpo, String(req.contratoScope).trim());
        } else {
            // Operacional: do contrato OU próprios (para registros sem contrato no user)
            where += ` AND ((n.contrato = ? OR n.contrato = ? OR u.contrato = ? OR u.contrato = ?) OR n.matricula_observador = ?)`;
            params.push(contratoLimpo, String(req.contratoScope).trim(), contratoLimpo, String(req.contratoScope).trim(), matricula);
        }
    } else {
        // Sem contrato: mostra apenas os próprios
        where += ` AND n.matricula_observador = ?`;
        params.push(matricula);
    }

    if (nivel) {
        where += ` AND n.nivel = ?`;
        params.push(nivel);
    }

    const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);
    const offset = (Math.max(Number(page), 1) - 1) * safeLimit;

    try {
        const [rows, count] = await Promise.all([
            db.allAsync(`
                SELECT n.*, COALESCE(n.contrato, u.contrato) as contrato, COALESCE(u.nome, n.nome_observador) as nome_observador
                FROM n3_registros n
                LEFT JOIN usuarios u ON u.matricula = n.matricula_observador
                ${where}
                ORDER BY n.data DESC, n.criado_em DESC LIMIT ? OFFSET ?
            `, [...params, safeLimit, offset]),
            db.getAsync(`
                SELECT COUNT(*) as count
                FROM n3_registros n
                LEFT JOIN usuarios u ON u.matricula = n.matricula_observador
                ${where}
            `, params)
        ]);
        res.json({ data: rows, total: count ? count.count : 0, page: Number(page), limit: safeLimit });
    } catch(err) {
        console.error('[N3] Erro ao listar registros:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/n3/:id
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const row = await db.getAsync('SELECT * FROM n3_registros WHERE id = ?', [req.params.id]);
        if (!row) return res.status(404).json({ error: 'Registro não encontrado.' });
        
        const isMasterOrAdm = req.session.usuario.is_master === 1 || req.session.usuario.perfil === 'adm';
        if (!isMasterOrAdm && row.matricula_observador !== req.session.usuario.matricula)
            return res.status(403).json({ error: 'Acesso negado.' });
        res.json(row);
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/n3
router.post('/', requireAuth, upload.fields([
    { name: 'evidencia_1', maxCount: 1 },
    { name: 'evidencia_2', maxCount: 1 },
]), async (req, res) => {
    const u = req.session.usuario;
    const {
        data, data_hora_ocorrido, lideranca, nivel, local_ss, descricao_situacao,
        categoria, subcategoria, tag, plano_acao,
        empresa_responsavel, lideranca_responsavel,
    } = req.body;

    if (!lideranca || !local_ss || !descricao_situacao)
        return res.status(400).json({ error: 'Campos obrigatórios: liderança, local/SS, descrição.' });

    if (!categoria || !subcategoria)
        return res.status(400).json({ error: 'Campos obrigatórios: categoria, subcategoria.' });

    if (!empresa_responsavel)
        return res.status(400).json({ error: 'Campo obrigatório: empresa responsável.' });

    if (empresa_responsavel === 'OMEGA' && !lideranca_responsavel)
        return res.status(400).json({ error: 'Liderança responsável (ação) é obrigatória para a Ômega.' });

    if (tag && !/^[A-Za-z0-9]+$/.test(tag))
        return res.status(400).json({ error: 'A TAG deve conter apenas letras e números.' });

    const id  = uuidv4();
    const userContrato = u.contrato ? String(u.contrato).trim() : null;

    // Data do registro: hoje (obrigatório)
    const dataRegistro = data || new Date().toISOString().slice(0,10);
    
    // Nível padrão: Em Análise
    const nivelFinal = nivel || 'Em Análise';

    let ev1 = null, ev2 = null;
    try {
        ev1 = await uploadToCloudinary(req.files?.evidencia_1?.[0], 'omega-safety/n3');
        ev2 = await uploadToCloudinary(req.files?.evidencia_2?.[0], 'omega-safety/n3');
    } catch (err) {
        return res.status(502).json({ error: 'Falha ao enviar a evidência para o Cloudinary: ' + err.message });
    }

    try {
        await db.runAsync(`
            INSERT INTO n3_registros (
                id, data, matricula_observador, nome_observador, lideranca, nivel,
                local_ss, descricao_situacao, categoria, subcategoria, tag, plano_acao,
                empresa_responsavel, lideranca_responsavel, prazo_vencimento,
                status, evidencia_1_path, evidencia_2_path, contrato
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,'Em Análise',?,?,?)`,
            [id, dataRegistro,
             u.matricula, u.nome, lideranca, nivelFinal,
             local_ss, descricao_situacao, categoria||null, subcategoria||null,
             tag||null, plano_acao||null, empresa_responsavel||null,
             lideranca_responsavel||null, ev1, ev2, userContrato]
        );
        res.status(201).json({ id, message: 'N3 registrado com status "Em Análise".' });
    } catch(err) {
        await Promise.all([removeMedia(ev1), removeMedia(ev2)]);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/n3/:id/historico
router.get('/:id/historico', requireAuth, async (req, res) => {
    try {
        const rows = await db.allAsync(
            'SELECT * FROM n3_historico WHERE n3_id = ? ORDER BY data_hora DESC',
            [req.params.id]
        );
        res.json(rows);
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/n3/:id/nivel
router.patch('/:id/nivel', requireAdm, async (req, res) => {
    const { nivel } = req.body;
    if (!nivel) return res.status(400).json({ error: 'Nível é obrigatório.' });

    try {
        const existing = await db.getAsync('SELECT id, nivel FROM n3_registros WHERE id = ?', [req.params.id]);
        if (!existing) return res.status(404).json({ error: 'Não encontrado.' });

        const antigo = existing.nivel || 'N/A';

        await db.runAsync(
            `UPDATE n3_registros SET nivel=? WHERE id=?`,
            [nivel, req.params.id]
        );

        // Inserir no histórico
        const detalhes = `Nível alterado de '${antigo}' para '${nivel}'`;
        const dataHoraAgora = new Date().toISOString(); // ex: 2026-09-13T23:59:00.000Z
        await db.runAsync(
            `INSERT INTO n3_historico (n3_id, usuario_nome, detalhes, data_hora) VALUES (?,?,?,?)`,
            [req.params.id, req.session.usuario.nome, detalhes, dataHoraAgora]
        );

        res.json({ message: `Nível atualizado para "${nivel}".` });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/n3/:id
router.delete('/:id', requireAdm, async (req, res) => {
    try {
        const row = await db.getAsync('SELECT * FROM n3_registros WHERE id = ?', [req.params.id]);
        if (!row) return res.status(404).json({ error: 'Não encontrado.' });

        await Promise.all([removeMedia(row.evidencia_1_path), removeMedia(row.evidencia_2_path)]);
        await db.runAsync('DELETE FROM n3_registros WHERE id = ?', [req.params.id]);
        res.json({ message: 'N3 removido.' });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
