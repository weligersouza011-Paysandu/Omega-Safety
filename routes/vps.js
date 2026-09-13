const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireAuth, requireAdm } = require('../middleware/auth.middleware');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configuração do Multer para uploads de imagens do VPS
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '../uploads/vps');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'vps-' + uniqueSuffix + ext);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// GET /api/vps/canteiros - Listar canteiros (Usado no Form de N3 e no Dashboard VPS)
// O N3 precisa buscar as obras em andamento, por isso não usamos requireAdm aqui
router.get('/canteiros', requireAuth, async (req, res) => {
    try {
        const { status } = req.query;
        let sql = 'SELECT * FROM vps_canteiros';
        let params = [];
        
        if (status) {
            sql += ' WHERE status = ?';
            params.push(status);
        }
        
        sql += ' ORDER BY nome ASC';
        
        const canteiros = await db.allAsync(sql, params);
        res.json(canteiros);
    } catch (err) {
        console.error('[VPS] Erro ao listar canteiros:', err);
        res.status(500).json({ error: 'Erro ao buscar canteiros' });
    }
});

// GET /api/vps/stats - Estatísticas para o painel (Apenas ADM)
router.get('/stats', requireAdm, async (req, res) => {
    try {
        const totalAndamento = await db.getAsync("SELECT COUNT(*) as count FROM vps_canteiros WHERE status = 'Em andamento'");
        const totalConcluidas = await db.getAsync("SELECT COUNT(*) as count FROM vps_canteiros WHERE status = 'Concluída'");
        
        const mat1 = await db.getAsync("SELECT COUNT(*) as count FROM vps_canteiros WHERE maturidade = 1 AND status != 'Concluída'");
        const mat2 = await db.getAsync("SELECT COUNT(*) as count FROM vps_canteiros WHERE maturidade = 2 AND status != 'Concluída'");
        const mat3 = await db.getAsync("SELECT COUNT(*) as count FROM vps_canteiros WHERE maturidade = 3 AND status != 'Concluída'");
        const mat4 = await db.getAsync("SELECT COUNT(*) as count FROM vps_canteiros WHERE maturidade = 4 AND status != 'Concluída'");

        res.json({
            emAndamento: totalAndamento.count,
            concluidas: totalConcluidas.count,
            maturidade1: mat1.count,
            maturidade2: mat2.count,
            maturidade3: mat3.count,
            maturidade4: mat4.count
        });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao carregar estatísticas' });
    }
});

// POST /api/vps/canteiros - Criar novo canteiro (Apenas ADM)
router.post('/canteiros', requireAdm, upload.fields([{ name: 'capa_1', maxCount: 1 }, { name: 'capa_2', maxCount: 1 }]), async (req, res) => {
    try {
        const { nome, status, maturidade_inicial } = req.body;
        const id = crypto.randomUUID();
        const maturidade = maturidade_inicial ? parseInt(maturidade_inicial, 10) : 1;
        
        let capa1Path = null;
        let capa2Path = null;
        
        if (req.files && req.files.capa_1) {
            capa1Path = `/uploads/vps/${req.files.capa_1[0].filename}`;
        }
        if (req.files && req.files.capa_2) {
            capa2Path = `/uploads/vps/${req.files.capa_2[0].filename}`;
        }
        
        await db.runAsync(
            'INSERT INTO vps_canteiros (id, nome, status, maturidade, capa_1_path, capa_2_path) VALUES (?, ?, ?, ?, ?, ?)',
            [id, nome, status || 'Em andamento', maturidade, capa1Path, capa2Path]
        );
        
        res.status(201).json({ message: 'Canteiro cadastrado com sucesso!', id });
    } catch (err) {
        console.error('[VPS] Erro ao cadastrar canteiro:', err);
        res.status(500).json({ error: 'Erro ao cadastrar canteiro' });
    }
});

// PUT /api/vps/canteiros/:id - Editar canteiro existente (Apenas ADM)
router.put('/canteiros/:id', requireAdm, upload.fields([{ name: 'capa_1', maxCount: 1 }, { name: 'capa_2', maxCount: 1 }]), async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, status } = req.body;
        
        let updates = ['nome = ?', 'status = ?'];
        let params = [nome, status];

        if (req.files && req.files.capa_1) {
            updates.push('capa_1_path = ?');
            params.push(`/uploads/vps/${req.files.capa_1[0].filename}`);
        }
        if (req.files && req.files.capa_2) {
            updates.push('capa_2_path = ?');
            params.push(`/uploads/vps/${req.files.capa_2[0].filename}`);
        }

        params.push(id);
        
        await db.runAsync(
            `UPDATE vps_canteiros SET ${updates.join(', ')} WHERE id = ?`,
            params
        );
        
        res.json({ message: 'Canteiro atualizado com sucesso!' });
    } catch (err) {
        console.error('[VPS] Erro ao atualizar canteiro:', err);
        res.status(500).json({ error: 'Erro ao atualizar canteiro' });
    }
});

// GET /api/vps/historico - Listar histórico da timeline (Apenas ADM)
router.get('/historico', requireAdm, async (req, res) => {
    try {
        const { canteiro_id } = req.query;
        let sql = `
            SELECT h.*, c.nome as canteiro_nome 
            FROM vps_historico h
            JOIN vps_canteiros c ON h.canteiro_id = c.id
        `;
        let params = [];
        
        if (canteiro_id) {
            sql += ' WHERE h.canteiro_id = ?';
            params.push(canteiro_id);
        }
        
        sql += ' ORDER BY h.data_registro DESC, h.criado_em DESC';
        
        const historico = await db.allAsync(sql, params);
        res.json(historico);
    } catch (err) {
        console.error('[VPS] Erro ao buscar histórico:', err);
        res.status(500).json({ error: 'Erro ao buscar histórico' });
    }
});

// POST /api/vps/historico - Registrar novo evento no histórico (Apenas ADM)
router.post('/historico', requireAdm, upload.fields([
    { name: 'evidencia_1', maxCount: 1 },
    { name: 'evidencia_2', maxCount: 1 },
    { name: 'anexo', maxCount: 1 }
]), async (req, res) => {
    try {
        const { canteiro_id, data_registro, categoria, tipo_card, descricao, id_inspecao, novo_nivel_maturidade } = req.body;
        const id = crypto.randomUUID();
        const criado_por = req.session.usuario.matricula;
        
        let evi1 = null, evi2 = null, anexo = null;
        
        if (req.files) {
            if (req.files.evidencia_1) evi1 = `/uploads/vps/${req.files.evidencia_1[0].filename}`;
            if (req.files.evidencia_2) evi2 = `/uploads/vps/${req.files.evidencia_2[0].filename}`;
            if (req.files.anexo) anexo = `/uploads/vps/${req.files.anexo[0].filename}`;
        }
        
        const finalTipoCard = (categoria === 'Mudança de Maturidade') ? 'N/A' : tipo_card;

        await db.runAsync(
            `INSERT INTO vps_historico (id, canteiro_id, id_inspecao, data_registro, categoria, tipo_card, descricao, 
             evidencia_1_path, evidencia_2_path, anexo_path, criado_por) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, canteiro_id, id_inspecao, data_registro, categoria, finalTipoCard, descricao, evi1, evi2, anexo, criado_por]
        );

        if (categoria === 'Mudança de Maturidade' && novo_nivel_maturidade) {
            await db.runAsync('UPDATE vps_canteiros SET maturidade = ? WHERE id = ?', [parseInt(novo_nivel_maturidade, 10), canteiro_id]);
        }
        
        res.status(201).json({ message: 'Registro adicionado ao histórico com sucesso!', id });
    } catch (err) {
        console.error('[VPS] Erro ao salvar histórico:', err);
        res.status(500).json({ error: 'Erro ao salvar registro de maturidade' });
    }
});

module.exports = router;
