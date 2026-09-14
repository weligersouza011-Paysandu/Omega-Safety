// routes/n3.js
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const db      = require('../database/db');
const { requireAuth, requireAdm } = require('../middleware/auth.middleware');
const router  = express.Router();

// ── Multer ──────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'n3');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename:    (_req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `n3_${Date.now()}_${uuidv4().slice(0,8)}${ext}`);
    },
});
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const ok = /jpeg|jpg|png|gif|webp/.test(path.extname(file.originalname).toLowerCase());
        ok ? cb(null, true) : cb(new Error('Apenas imagens.'));
    },
});

// GET /api/n3/contratos — lista contratos distintos com registros N3
router.get('/contratos', requireAuth, async (req, res) => {
    try {
        const rows = await db.allAsync(`
            SELECT DISTINCT u.contrato
            FROM n3_registros n
            JOIN usuarios u ON u.matricula = n.matricula_observador
            WHERE u.contrato IS NOT NULL AND u.contrato != ''
            ORDER BY u.contrato ASC
        `);
        const set = new Set();
        rows.forEach(r => {
            if (r.contrato) {
                const c = String(r.contrato).replace(/[^0-9]/g, '') || String(r.contrato).trim();
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
router.get('/', requireAuth, async (req, res) => {
    const { perfil, matricula, contrato: userContrato, is_master } = req.session.usuario;
    const { nivel, page = 1, limit = 200, contrato } = req.query;

    let where = 'WHERE 1=1';
    const params = [];

    const isMasterOrAdm = is_master === 1 || perfil === 'adm';

    if (!isMasterOrAdm) {
        // Operacional: filtra pelo contrato do usuário logado (via JOIN)
        if (userContrato && String(userContrato).trim() !== '' && String(userContrato).trim() !== 'Todos') {
            const userContratoLimpo = String(userContrato).replace(/[^0-9a-zA-Z]/g, '') || String(userContrato).trim();
            where += ` AND (REPLACE(TRIM(CAST(u.contrato AS TEXT)), 'Contrato ', '') = ? OR TRIM(CAST(u.contrato AS TEXT)) = ?)`;
            params.push(userContratoLimpo, String(userContrato).trim());
        } else {
            // Sem contrato: mostra apenas os próprios
            where += ` AND n.matricula_observador = ?`;
            params.push(matricula);
        }
    } else {
        // ADM: filtra por contrato se informado via query e não for "Todos"
        if (contrato && String(contrato).trim() !== '' && String(contrato).trim() !== 'Todos') {
            const contratoLimpo = String(contrato).replace(/[^0-9a-zA-Z]/g, '') || String(contrato).trim();
            where += ` AND (REPLACE(TRIM(CAST(u.contrato AS TEXT)), 'Contrato ', '') = ? OR TRIM(CAST(u.contrato AS TEXT)) = ?)`;
            params.push(contratoLimpo, String(contrato).trim());
        }
    }

    if (nivel) {
        where += ` AND n.nivel = ?`;
        params.push(nivel);
    }

    const offset = (Number(page) - 1) * Number(limit);

    try {
        const rows  = await db.allAsync(`
            SELECT n.*, u.contrato as contrato, COALESCE(u.nome, n.nome_observador) as nome_observador
            FROM n3_registros n
            LEFT JOIN usuarios u ON u.matricula = n.matricula_observador
            ${where}
            ORDER BY n.data DESC, n.criado_em DESC LIMIT ? OFFSET ?
        `, [...params, Number(limit), offset]);
        const count = await db.getAsync(`
            SELECT COUNT(*) as count
            FROM n3_registros n
            LEFT JOIN usuarios u ON u.matricula = n.matricula_observador
            ${where}
        `, params);
        res.json({ data: rows, total: count.count, page: Number(page), limit: Number(limit) });
    } catch(err) {
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
    const ev1 = req.files?.evidencia_1?.[0] ? `/uploads/n3/${req.files.evidencia_1[0].filename}` : null;
    const ev2 = req.files?.evidencia_2?.[0] ? `/uploads/n3/${req.files.evidencia_2[0].filename}` : null;

    // Data do registro: hoje (obrigatório)
    const dataRegistro = data || new Date().toISOString().slice(0,10);
    
    // Nível padrão: Em Análise
    const nivelFinal = nivel || 'Em Análise';

    try {
        await db.runAsync(`
            INSERT INTO n3_registros (
                id, data, matricula_observador, nome_observador, lideranca, nivel,
                local_ss, descricao_situacao, categoria, subcategoria, tag, plano_acao,
                empresa_responsavel, lideranca_responsavel, prazo_vencimento,
                status, evidencia_1_path, evidencia_2_path
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,'Em Análise',?,?)`,
            [id, dataRegistro,
             u.matricula, u.nome, lideranca, nivelFinal,
             local_ss, descricao_situacao, categoria||null, subcategoria||null,
             tag||null, plano_acao||null, empresa_responsavel||null,
             lideranca_responsavel||null, ev1, ev2]
        );
        res.status(201).json({ id, message: 'N3 registrado com status "Em Análise".' });
    } catch(err) {
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

        [row.evidencia_1_path, row.evidencia_2_path].forEach(p => {
            if (p) {
                const abs = path.join(__dirname, '..', p);
                if (fs.existsSync(abs)) fs.unlinkSync(abs);
            }
        });
        await db.runAsync('DELETE FROM n3_registros WHERE id = ?', [req.params.id]);
        res.json({ message: 'N3 removido.' });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
