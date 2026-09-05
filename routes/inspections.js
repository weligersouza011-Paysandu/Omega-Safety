// routes/inspections.js
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const db      = require('../database/db');
const { requireAuth } = require('../middleware/auth.middleware');
const router  = express.Router();

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'inspecoes');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename:    (_req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `insp_${Date.now()}_${uuidv4().slice(0,8)}${ext}`);
    },
});
const upload = multer({ storage, limits: { fileSize: 10*1024*1024 } });

// GET /api/inspecoes
router.get('/', requireAuth, async (req, res) => {
    const { perfil, matricula } = req.session.usuario;
    const { page=1, limit=20 } = req.query;
    const offset = (Number(page)-1)*Number(limit);

    try {
        let rows, total;
        const isMasterOrAdm = req.session.usuario.is_master === 1 || perfil === 'adm';
        if (isMasterOrAdm) {
            rows  = await db.allAsync('SELECT * FROM inspecoes_avulsas ORDER BY data_inspecao DESC LIMIT ? OFFSET ?', [Number(limit), offset]);
            total = (await db.getAsync('SELECT COUNT(*) as count FROM inspecoes_avulsas')).count;
        } else {
            rows  = await db.allAsync('SELECT * FROM inspecoes_avulsas WHERE matricula=? ORDER BY data_inspecao DESC LIMIT ? OFFSET ?', [matricula, Number(limit), offset]);
            total = (await db.getAsync('SELECT COUNT(*) as count FROM inspecoes_avulsas WHERE matricula=?', [matricula])).count;
        }
        res.json({ data: rows, total, page: Number(page), limit: Number(limit) });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/inspecoes
router.post('/', requireAuth, upload.single('foto'), async (req, res) => {
    const u = req.session.usuario;
    const { data_inspecao, lideranca, local, categoria, subcategoria,
            placa_veiculo, tag, tipo_veiculo, descricao, conclusao_tecnica,
            card_inspecao, plano_acao, prazo } = req.body;

    const id      = uuidv4();
    const fotPath = req.file ? `/uploads/inspecoes/${req.file.filename}` : null;

    try {
        await db.runAsync(`
            INSERT INTO inspecoes_avulsas (
                id, data_inspecao, matricula, nome_inspetor, funcao, lideranca,
                local, categoria, subcategoria, placa_veiculo, tag, tipo_veiculo,
                descricao, conclusao_tecnica, card_inspecao, plano_acao, prazo, foto_path
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [id, data_inspecao||new Date().toISOString().slice(0,10),
             u.matricula, u.nome, u.funcao||null, lideranca||null,
             local||null, categoria||null, subcategoria||null,
             placa_veiculo||null, tag||null, tipo_veiculo||null,
             descricao||null, conclusao_tecnica||null, card_inspecao||null,
             plano_acao||null, prazo||null, fotPath]
        );
        res.status(201).json({ id, message: 'Inspeção registrada.' });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/inspecoes/:id
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const row = await db.getAsync('SELECT * FROM inspecoes_avulsas WHERE id=?', [req.params.id]);
        if (!row) return res.status(404).json({ error: 'Não encontrado.' });
        res.json(row);
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
