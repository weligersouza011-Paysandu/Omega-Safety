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

// Função auxiliar para calcular o status acumulado dos cards do canteiro
function calcularStatusCardCanteiro(historyList) {
    let hasDiamante = false;
    let verdesPostDiamante = 0;
    let totalVerdes = 0;
    let totalDiamantes = 0;
    let totalAmarelos = 0;
    let totalVermelhos = 0;
    let ultimoCard = null;
    let ultimoCardData = null;

    if (!historyList || !historyList.length) {
        return {
            hasDiamante: false,
            verdesPostDiamante: 0,
            totalVerdes: 0,
            totalDiamantes: 0,
            totalAmarelos: 0,
            totalVermelhos: 0,
            ultimoCard: null,
            ultimoCardData: null
        };
    }

    for (const h of historyList) {
        const tipo = h.tipo_card;
        if (!tipo || tipo === 'N/A') continue;

        ultimoCard = tipo;
        if (h.data_registro) ultimoCardData = h.data_registro;

        if (tipo === 'Diamante') {
            hasDiamante = true;
            verdesPostDiamante = 0;
            totalDiamantes++;
        } else if (tipo === 'Verde') {
            totalVerdes++;
            if (hasDiamante) {
                verdesPostDiamante++;
            }
        } else if (tipo === 'Amarelo') {
            hasDiamante = false;
            verdesPostDiamante = 0;
            totalAmarelos++;
        } else if (tipo === 'Vermelho') {
            hasDiamante = false;
            verdesPostDiamante = 0;
            totalVermelhos++;
        }
    }

    return {
        hasDiamante,
        verdesPostDiamante,
        totalVerdes,
        totalDiamantes,
        totalAmarelos,
        totalVermelhos,
        ultimoCard,
        ultimoCardData
    };
}

// GET /api/vps/canteiros - Listar canteiros (com status acumulado do histórico de cards)
router.get('/canteiros', requireAuth, async (req, res) => {
    try {
        const { status, contrato } = req.query;
        let sql = `SELECT c.* FROM vps_canteiros c`;
        let params = [];
        let conditions = [];
        
        if (status) {
            conditions.push('c.status = ?');
            params.push(status);
        }
        if (contrato) {
            conditions.push('c.contrato = ?');
            params.push(contrato);
        }
        
        if (conditions.length) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }
        
        sql += ' ORDER BY c.nome ASC';
        
        const canteiros = await db.allAsync(sql, params);

        const allHistorico = await db.allAsync(`
            SELECT canteiro_id, tipo_card, data_registro, criado_em 
            FROM vps_historico 
            WHERE tipo_card != 'N/A' 
            ORDER BY data_registro ASC, criado_em ASC
        `);

        const historicoPorCanteiro = {};
        allHistorico.forEach(h => {
            if (!historicoPorCanteiro[h.canteiro_id]) {
                historicoPorCanteiro[h.canteiro_id] = [];
            }
            historicoPorCanteiro[h.canteiro_id].push(h);
        });

        const pendenciasAtivas = await db.allAsync(`
            SELECT canteiro_id, COUNT(*) as count 
            FROM vps_pendencias 
            WHERE status NOT IN ('Concluído', 'Concluída', 'Resolvido') 
            GROUP BY canteiro_id
        `);
        const pendenciasMap = {};
        pendenciasAtivas.forEach(p => {
            pendenciasMap[p.canteiro_id] = p.count;
        });

        const canteirosEnriquecidos = canteiros.map(c => {
            const history = historicoPorCanteiro[c.id] || [];
            const cardStatus = calcularStatusCardCanteiro(history);
            const qtdPendenciasAtivas = pendenciasMap[c.id] || 0;
            return {
                ...c,
                ultimo_card: cardStatus.ultimoCard,
                ultimo_card_data: cardStatus.ultimoCardData,
                card_status: cardStatus,
                tem_pendencias_ativas: qtdPendenciasAtivas > 0,
                qtd_pendencias_ativas: qtdPendenciasAtivas
            };
        });

        res.json(canteirosEnriquecidos);
    } catch (err) {
        console.error('[VPS] Erro ao listar canteiros:', err);
        res.status(500).json({ error: 'Erro ao buscar canteiros' });
    }
});

// GET /api/vps/contratos - Listar todos os contratos únicos (de canteiros e usuários)
router.get('/contratos', requireAuth, async (req, res) => {
    try {
        const canteiroContratos = await db.allAsync(
            `SELECT DISTINCT contrato FROM vps_canteiros WHERE contrato IS NOT NULL AND contrato != ''`
        );
        const usuarioContratos = await db.allAsync(
            `SELECT DISTINCT contrato FROM usuarios WHERE ativo = 1 AND contrato IS NOT NULL AND contrato != ''`
        );
        
        const set = new Set();
        canteiroContratos.forEach(r => {
            if (r.contrato) {
                r.contrato.split(',').forEach(c => set.add(c.trim()));
            }
        });
        usuarioContratos.forEach(r => {
            if (r.contrato) {
                r.contrato.split(',').forEach(c => set.add(c.trim()));
            }
        });
        
        if (set.size === 0) {
            set.add('251');
            set.add('301');
        }

        const list = Array.from(set).sort();
        res.json(list);
    } catch (err) {
        console.error('[VPS] Erro ao buscar contratos:', err);
        res.status(500).json({ error: 'Erro ao buscar contratos' });
    }
});

// GET /api/vps/liderancas - Listar lideranças ativas por contrato (ou geral)
router.get('/liderancas', requireAuth, async (req, res) => {
    try {
        const { contrato, canteiro_id } = req.query;
        let targetContrato = contrato;

        if (!targetContrato && canteiro_id) {
            const cant = await db.getAsync('SELECT contrato FROM vps_canteiros WHERE id = ?', [canteiro_id]);
            if (cant) targetContrato = cant.contrato;
        }

        const rows = await db.allAsync(
            `SELECT id, matricula, nome, contrato FROM usuarios WHERE ativo = 1 AND is_lideranca = 1 ORDER BY nome ASC`
        );

        if (targetContrato && String(targetContrato).trim() !== '') {
            const cleanTarget = String(targetContrato).trim();
            const filtered = rows.filter(u => {
                if (!u.contrato) return false;
                const arr = String(u.contrato).split(',').map(c => c.trim());
                return arr.includes(cleanTarget) || u.contrato === cleanTarget;
            });
            return res.json(filtered);
        }

        res.json(rows);
    } catch (err) {
        console.error('[VPS] Erro ao buscar lideranças:', err);
        res.status(500).json({ error: 'Erro ao buscar lideranças' });
    }
});

// GET /api/vps/stats - Estatísticas para o painel (Apenas ADM)
router.get('/stats', requireAdm, async (req, res) => {
    try {
        const totalAndamento = await db.getAsync("SELECT COUNT(*) as count FROM vps_canteiros WHERE status = 'Em andamento'");
        const totalConcluidas = await db.getAsync("SELECT COUNT(*) as count FROM vps_canteiros WHERE status = 'Concluída'");
        const totalParalisadas = await db.getAsync("SELECT COUNT(*) as count FROM vps_canteiros WHERE status = 'Paralisada'");
        
        // Maturidades 0 a 4 ESTRITAMENTE para obras com status 'Em andamento'
        const mat0 = await db.getAsync("SELECT COUNT(*) as count FROM vps_canteiros WHERE maturidade = 0 AND status = 'Em andamento'");
        const mat1 = await db.getAsync("SELECT COUNT(*) as count FROM vps_canteiros WHERE maturidade = 1 AND status = 'Em andamento'");
        const mat2 = await db.getAsync("SELECT COUNT(*) as count FROM vps_canteiros WHERE maturidade = 2 AND status = 'Em andamento'");
        const mat3 = await db.getAsync("SELECT COUNT(*) as count FROM vps_canteiros WHERE maturidade = 3 AND status = 'Em andamento'");
        const mat4 = await db.getAsync("SELECT COUNT(*) as count FROM vps_canteiros WHERE maturidade = 4 AND status = 'Em andamento'");

        // Contagem consolidada do histórico de cards emitidos
        const cardsDiamante = await db.getAsync("SELECT COUNT(*) as count FROM vps_historico WHERE tipo_card = 'Diamante'");
        const cardsVerde = await db.getAsync("SELECT COUNT(*) as count FROM vps_historico WHERE tipo_card = 'Verde'");
        const cardsAmarelo = await db.getAsync("SELECT COUNT(*) as count FROM vps_historico WHERE tipo_card = 'Amarelo'");
        const cardsVermelho = await db.getAsync("SELECT COUNT(*) as count FROM vps_historico WHERE tipo_card = 'Vermelho'");

        res.json({
            emAndamento: totalAndamento ? totalAndamento.count : 0,
            concluidas: totalConcluidas ? totalConcluidas.count : 0,
            paralisadas: totalParalisadas ? totalParalisadas.count : 0,
            maturidade0: mat0 ? mat0.count : 0,
            maturidade1: mat1 ? mat1.count : 0,
            maturidade2: mat2 ? mat2.count : 0,
            maturidade3: mat3 ? mat3.count : 0,
            maturidade4: mat4 ? mat4.count : 0,
            cardsDiamante: cardsDiamante ? cardsDiamante.count : 0,
            cardsVerde: cardsVerde ? cardsVerde.count : 0,
            cardsAmarelo: cardsAmarelo ? cardsAmarelo.count : 0,
            cardsVermelho: cardsVermelho ? cardsVermelho.count : 0
        });
    } catch (err) {
        console.error('[VPS] Erro ao carregar estatísticas:', err);
        res.status(500).json({ error: 'Erro ao carregar estatísticas' });
    }
});

// POST /api/vps/canteiros - Criar novo canteiro (Apenas ADM)
router.post('/canteiros', requireAdm, upload.fields([{ name: 'capa_1', maxCount: 1 }, { name: 'capa_2', maxCount: 1 }]), async (req, res) => {
    try {
        const { nome, status, maturidade_inicial, contrato } = req.body;
        const id = crypto.randomUUID();
        const maturidade = (maturidade_inicial !== undefined && maturidade_inicial !== '') ? parseInt(maturidade_inicial, 10) : 1;
        const finalContrato = contrato ? contrato.trim() : null;
        
        let capa1Path = null;
        let capa2Path = null;
        
        if (req.files && req.files.capa_1) {
            capa1Path = `/uploads/vps/${req.files.capa_1[0].filename}`;
        }
        if (req.files && req.files.capa_2) {
            capa2Path = `/uploads/vps/${req.files.capa_2[0].filename}`;
        }
        
        await db.runAsync(
            'INSERT INTO vps_canteiros (id, nome, contrato, status, maturidade, capa_1_path, capa_2_path) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [id, nome, finalContrato, status || 'Em andamento', maturidade, capa1Path, capa2Path]
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
        const { nome, status, maturidade, contrato } = req.body;
        
        let updates = ['nome = ?', 'status = ?'];
        let params = [nome, status];

        if (contrato !== undefined) {
            updates.push('contrato = ?');
            params.push(contrato ? contrato.trim() : null);
        }

        if (maturidade !== undefined && maturidade !== '') {
            updates.push('maturidade = ?');
            params.push(parseInt(maturidade, 10));
        }

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

// GET /api/vps/historico - Listar histórico da timeline com pendências (Apenas ADM)
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

        // Buscar todas as pendências associadas ao histórico retornado
        let pendenciasPorHistorico = {};
        try {
            const allPendencias = await db.allAsync(`SELECT * FROM vps_pendencias ORDER BY criado_em ASC`);
            allPendencias.forEach(p => {
                if (!pendenciasPorHistorico[p.historico_id]) {
                    pendenciasPorHistorico[p.historico_id] = [];
                }
                pendenciasPorHistorico[p.historico_id].push(p);
            });
        } catch (e) {
            // Tabela pode estar vazia ou recém criada
        }

        const historicoEnriquecido = historico.map(h => ({
            ...h,
            pendencias: pendenciasPorHistorico[h.id] || []
        }));

        res.json(historicoEnriquecido);
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

// DELETE /api/vps/historico/:id - Excluir evento do histórico (Apenas ADM)
router.delete('/historico/:id', requireAdm, async (req, res) => {
    try {
        const { id } = req.params;
        await db.runAsync('DELETE FROM vps_historico WHERE id = ?', [id]);
        await db.runAsync('DELETE FROM vps_pendencias WHERE historico_id = ?', [id]);
        res.json({ message: 'Registro de histórico excluído com sucesso!' });
    } catch (err) {
        console.error('[VPS] Erro ao excluir registro do histórico:', err);
        res.status(500).json({ error: 'Erro ao excluir registro do histórico' });
    }
});

// ═══════════════════════════════════════════════════════════════
//  ROTAS CRUD — VPS PENDÊNCIAS / ADEQUAÇÕES
// ═══════════════════════════════════════════════════════════════

// GET /api/vps/pendencias - Listar pendências (geral ou filtradas)
router.get('/pendencias', requireAuth, async (req, res) => {
    try {
        const { canteiro_id, status } = req.query;
        let sql = `
            SELECT p.*, c.nome as canteiro_nome 
            FROM vps_pendencias p
            JOIN vps_canteiros c ON p.canteiro_id = c.id
        `;
        let params = [];
        let conditions = [];

        if (canteiro_id) {
            conditions.push('p.canteiro_id = ?');
            params.push(canteiro_id);
        }
        if (status) {
            conditions.push('p.status = ?');
            params.push(status);
        }

        if (conditions.length) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }

        sql += ' ORDER BY p.data DESC, p.criado_em DESC';

        const pendencias = await db.allAsync(sql, params);
        res.json(pendencias);
    } catch (err) {
        console.error('[VPS] Erro ao listar pendências:', err);
        res.status(500).json({ error: 'Erro ao buscar pendências' });
    }
});

// POST /api/vps/pendencias - Criar nova pendência (Apenas ADM)
router.post('/pendencias', requireAdm, async (req, res) => {
    try {
        const { historico_id, canteiro_id, item, adequacao, responsavel, data, status } = req.body;
        if (!canteiro_id) {
            return res.status(400).json({ error: 'canteiro_id é obrigatório' });
        }
        const id = crypto.randomUUID();
        const finalData = data || new Date().toISOString().split('T')[0];
        const finalStatus = status || 'Pendente';
        const finalItem = item || 'Nova Pendência / Adequação';

        await db.runAsync(
            `INSERT INTO vps_pendencias (id, historico_id, canteiro_id, item, adequacao, responsavel, data, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, historico_id || null, canteiro_id, finalItem, adequacao || '', responsavel || '', finalData, finalStatus]
        );

        res.status(201).json({ message: 'Pendência adicionada com sucesso!', id });
    } catch (err) {
        console.error('[VPS] Erro ao criar pendência:', err);
        res.status(500).json({ error: 'Erro ao criar pendência' });
    }
});

// PUT /api/vps/pendencias/:id - Atualizar dados/status/obra da pendência (Apenas ADM)
router.put('/pendencias/:id', requireAdm, async (req, res) => {
    try {
        const { id } = req.params;
        const { canteiro_id, item, adequacao, responsavel, data, status } = req.body;

        let updates = [];
        let params = [];

        if (canteiro_id !== undefined) { updates.push('canteiro_id = ?'); params.push(canteiro_id); }
        if (item !== undefined) { updates.push('item = ?'); params.push(item); }
        if (adequacao !== undefined) { updates.push('adequacao = ?'); params.push(adequacao); }
        if (responsavel !== undefined) { updates.push('responsavel = ?'); params.push(responsavel); }
        if (data !== undefined) { updates.push('data = ?'); params.push(data); }
        if (status !== undefined) { updates.push('status = ?'); params.push(status); }

        if (!updates.length) {
            return res.status(400).json({ error: 'Nenhum campo informado para atualização' });
        }

        params.push(id);
        await db.runAsync(`UPDATE vps_pendencias SET ${updates.join(', ')} WHERE id = ?`, params);

        res.json({ message: 'Pendência atualizada com sucesso!' });
    } catch (err) {
        console.error('[VPS] Erro ao atualizar pendência:', err);
        res.status(500).json({ error: 'Erro ao atualizar pendência' });
    }
});

// DELETE /api/vps/pendencias/:id - Excluir uma pendência (Apenas ADM)
router.delete('/pendencias/:id', requireAdm, async (req, res) => {
    try {
        const { id } = req.params;
        await db.runAsync('DELETE FROM vps_pendencias WHERE id = ?', [id]);
        res.json({ message: 'Pendência excluída com sucesso!' });
    } catch (err) {
        console.error('[VPS] Erro ao excluir pendência:', err);
        res.status(500).json({ error: 'Erro ao excluir pendência' });
    }
});

module.exports = router;
