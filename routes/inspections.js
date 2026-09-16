// routes/inspections.js — Inspeções Avulsas (legado) + Respostas de Caderno
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const db      = require('../database/db');
const { requireAuth, requireAdm } = require('../middleware/auth.middleware');
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

function isPrivileged(u) {
    return u && (u.is_master === 1 || u.perfil === 'adm');
}

function deriveConclusaoTecnica(perguntas, respostasObj) {
    let unanswered = 0;
    let criticalNok = 0;
    let simpleNok = 0;

    for (const p of perguntas) {
        const ans = respostasObj[p.id] || respostasObj[String(p.id)] || {};
        const valor = ans.resposta || null;
        if (!valor) unanswered++;
        else if (valor === 'nok') {
            if (p.eh_critico_interditivo) criticalNok++;
            else simpleNok++;
        }
    }

    if (!perguntas.length) {
        return { ok: false, error: 'O caderno não possui itens para inspecionar.' };
    }
    if (criticalNok > 0) {
        return { ok: true, allowed: ['Interdição'], value: 'Interdição' };
    }
    if (unanswered > 0) {
        return { ok: false, error: 'Responda todos os itens do caderno.' };
    }
    if (simpleNok > 0) {
        return { ok: true, allowed: ['Ver e Agir', 'Notificação'] };
    }
    return { ok: true, allowed: ['Em Conformidade'], value: 'Em Conformidade' };
}

function respostasListQuery() {
    return `SELECT r.*, c.nome as caderno_nome, c.contrato as caderno_contrato
            FROM caderno_respostas r
            JOIN cadernos_inspecao c ON c.id = r.caderno_id`;
}

// ═══════════════════════════════════════════════════════════════
//  RESPOSTAS / INSPEÇÕES PREENCHIDAS (Registros / Rotina)
//  (rotas específicas ANTES de /:id para não serem interceptadas)
// ═══════════════════════════════════════════════════════════════

// GET /api/inspecoes/respostas — Listar respostas
router.get('/respostas', requireAuth, async (req, res) => {
    const { perfil, matricula } = req.session.usuario;
    const { caderno_id, page=1, limit=20 } = req.query;
    const offset = (Number(page)-1)*Number(limit);

    try {
        let where = '1=1';
        const params = [];

        if (caderno_id) {
            where += ' AND r.caderno_id = ?';
            params.push(caderno_id);
        }

        if (!isPrivileged(req.session.usuario)) {
            const userContrato = req.session.usuario.contrato;
            if (userContrato) {
                where += ' AND r.contrato = ?';
                params.push(userContrato);
            } else {
                where += ' AND r.matricula = ?';
                params.push(matricula);
            }
        }

        const rows = await db.allAsync(
            `${respostasListQuery()}
             WHERE ${where}
             ORDER BY r.data_inspecao DESC, r.criado_em DESC
             LIMIT ? OFFSET ?`,
            [...params, Number(limit), offset]
        );

        const totalRow = await db.getAsync(
            `SELECT COUNT(*) as count FROM caderno_respostas r WHERE ${where}`,
            params
        );

        res.json({ data: rows, total: totalRow.count, page: Number(page), limit: Number(limit) });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/inspecoes/respostas/stats — Estatísticas para Dashboard
router.get('/respostas/stats', requireAuth, async (req, res) => {
    try {
        const privileged = isPrivileged(req.session.usuario);
        const mat = req.session.usuario.matricula;

        const baseWhere = privileged ? '1=1' : 'r.matricula = ?';
        const baseParams = privileged ? [] : [mat];

        const totalRespostas = (await db.getAsync(
            `SELECT COUNT(*) as count FROM caderno_respostas r WHERE ${baseWhere}`, baseParams
        )).count;

        const totalCadernos = (await db.getAsync(
            "SELECT COUNT(*) as count FROM cadernos_inspecao WHERE status='ativo'"
        )).count;

        const porCaderno = await db.allAsync(
            privileged
                ? `SELECT c.nome, COUNT(r.id) as total
                   FROM cadernos_inspecao c
                   LEFT JOIN caderno_respostas r ON r.caderno_id = c.id
                   WHERE c.status = 'ativo'
                   GROUP BY c.id ORDER BY total DESC`
                : `SELECT c.nome, COUNT(r.id) as total
                   FROM cadernos_inspecao c
                   JOIN caderno_respostas r ON r.caderno_id = c.id
                   WHERE r.matricula = ? AND c.status = 'ativo'
                   GROUP BY c.id ORDER BY total DESC`, baseParams
        );

        const porMes = await db.allAsync(
            privileged
                ? `SELECT strftime('%Y-%m', data_inspecao) as mes, COUNT(*) as total
                   FROM caderno_respostas
                   WHERE data_inspecao IS NOT NULL AND data_inspecao != ''
                   GROUP BY mes ORDER BY mes ASC`
                : `SELECT strftime('%Y-%m', data_inspecao) as mes, COUNT(*) as total
                   FROM caderno_respostas
                   WHERE matricula = ? AND data_inspecao IS NOT NULL AND data_inspecao != ''
                   GROUP BY mes ORDER BY mes ASC`, baseParams
        );

        const catParams = privileged ? [] : [mat, mat];
        const porMesCategoria = await db.allAsync(
            privileged
                ? `WITH user_counts AS (
                       SELECT 
                           strftime('%Y-%m', r.data_inspecao) as mes,
                           COALESCE(
                               NULLIF(TRIM(c.categoria), ''),
                               NULLIF(TRIM(r.categoria), ''),
                               CASE 
                                   WHEN c.nome LIKE '%NR%' OR c.nome LIKE '%RAC%' THEN 'NR'
                                   WHEN c.nome LIKE '%5S%' THEN '5S'
                                   WHEN c.nome LIKE '%Passaporte%' THEN 'Passaporte'
                                   WHEN c.nome LIKE '%Incêndio%' OR c.nome LIKE '%Ambiente%' THEN 'Meio Ambiente'
                                   WHEN c.nome LIKE '%Checklist%' THEN 'Checklist'
                                   ELSE 'Geral'
                               END
                           ) as categoria,
                           r.nome_inspetor,
                           COUNT(*) as total_insp,
                           ROW_NUMBER() OVER (
                               PARTITION BY strftime('%Y-%m', r.data_inspecao), 
                               COALESCE(
                                   NULLIF(TRIM(c.categoria), ''),
                                   NULLIF(TRIM(r.categoria), ''),
                                   CASE 
                                       WHEN c.nome LIKE '%NR%' OR c.nome LIKE '%RAC%' THEN 'NR'
                                       WHEN c.nome LIKE '%5S%' THEN '5S'
                                       WHEN c.nome LIKE '%Passaporte%' THEN 'Passaporte'
                                       WHEN c.nome LIKE '%Incêndio%' OR c.nome LIKE '%Ambiente%' THEN 'Meio Ambiente'
                                       WHEN c.nome LIKE '%Checklist%' THEN 'Checklist'
                                       ELSE 'Geral'
                                   END
                               )
                               ORDER BY COUNT(*) DESC
                           ) as rn
                       FROM caderno_respostas r
                       LEFT JOIN cadernos_inspecao c ON c.id = r.caderno_id
                       WHERE r.data_inspecao IS NOT NULL AND r.data_inspecao != ''
                       GROUP BY 1, 2, r.nome_inspetor
                   ),
                   cat_totals AS (
                       SELECT 
                           strftime('%Y-%m', r.data_inspecao) as mes,
                           COALESCE(
                               NULLIF(TRIM(c.categoria), ''),
                               NULLIF(TRIM(r.categoria), ''),
                               CASE 
                                   WHEN c.nome LIKE '%NR%' OR c.nome LIKE '%RAC%' THEN 'NR'
                                   WHEN c.nome LIKE '%5S%' THEN '5S'
                                   WHEN c.nome LIKE '%Passaporte%' THEN 'Passaporte'
                                   WHEN c.nome LIKE '%Incêndio%' OR c.nome LIKE '%Ambiente%' THEN 'Meio Ambiente'
                                   WHEN c.nome LIKE '%Checklist%' THEN 'Checklist'
                                   ELSE 'Geral'
                               END
                           ) as categoria,
                           COUNT(*) as total
                       FROM caderno_respostas r
                       LEFT JOIN cadernos_inspecao c ON c.id = r.caderno_id
                       WHERE r.data_inspecao IS NOT NULL AND r.data_inspecao != ''
                       GROUP BY 1, 2
                   )
                   SELECT 
                       t.mes,
                       t.categoria,
                       t.total,
                       u.nome_inspetor as top_inspetor,
                       u.total_insp as top_inspetor_count
                   FROM cat_totals t
                   LEFT JOIN user_counts u ON u.mes = t.mes AND u.categoria = t.categoria AND u.rn = 1
                   ORDER BY t.mes ASC, t.categoria ASC`
                : `WITH user_counts AS (
                       SELECT 
                           strftime('%Y-%m', r.data_inspecao) as mes,
                           COALESCE(
                               NULLIF(TRIM(c.categoria), ''),
                               NULLIF(TRIM(r.categoria), ''),
                               CASE 
                                   WHEN c.nome LIKE '%NR%' OR c.nome LIKE '%RAC%' THEN 'NR'
                                   WHEN c.nome LIKE '%5S%' THEN '5S'
                                   WHEN c.nome LIKE '%Passaporte%' THEN 'Passaporte'
                                   WHEN c.nome LIKE '%Incêndio%' OR c.nome LIKE '%Ambiente%' THEN 'Meio Ambiente'
                                   WHEN c.nome LIKE '%Checklist%' THEN 'Checklist'
                                   ELSE 'Geral'
                               END
                           ) as categoria,
                           r.nome_inspetor,
                           COUNT(*) as total_insp,
                           ROW_NUMBER() OVER (
                               PARTITION BY strftime('%Y-%m', r.data_inspecao), 
                               COALESCE(
                                   NULLIF(TRIM(c.categoria), ''),
                                   NULLIF(TRIM(r.categoria), ''),
                                   CASE 
                                       WHEN c.nome LIKE '%NR%' OR c.nome LIKE '%RAC%' THEN 'NR'
                                       WHEN c.nome LIKE '%5S%' THEN '5S'
                                       WHEN c.nome LIKE '%Passaporte%' THEN 'Passaporte'
                                       WHEN c.nome LIKE '%Incêndio%' OR c.nome LIKE '%Ambiente%' THEN 'Meio Ambiente'
                                       WHEN c.nome LIKE '%Checklist%' THEN 'Checklist'
                                       ELSE 'Geral'
                                   END
                               )
                               ORDER BY COUNT(*) DESC
                           ) as rn
                       FROM caderno_respostas r
                       LEFT JOIN cadernos_inspecao c ON c.id = r.caderno_id
                       WHERE r.matricula = ? AND r.data_inspecao IS NOT NULL AND r.data_inspecao != ''
                       GROUP BY 1, 2, r.nome_inspetor
                   ),
                   cat_totals AS (
                       SELECT 
                           strftime('%Y-%m', r.data_inspecao) as mes,
                           COALESCE(
                               NULLIF(TRIM(c.categoria), ''),
                               NULLIF(TRIM(r.categoria), ''),
                               CASE 
                                   WHEN c.nome LIKE '%NR%' OR c.nome LIKE '%RAC%' THEN 'NR'
                                   WHEN c.nome LIKE '%5S%' THEN '5S'
                                   WHEN c.nome LIKE '%Passaporte%' THEN 'Passaporte'
                                   WHEN c.nome LIKE '%Incêndio%' OR c.nome LIKE '%Ambiente%' THEN 'Meio Ambiente'
                                   WHEN c.nome LIKE '%Checklist%' THEN 'Checklist'
                                   ELSE 'Geral'
                               END
                           ) as categoria,
                           COUNT(*) as total
                       FROM caderno_respostas r
                       LEFT JOIN cadernos_inspecao c ON c.id = r.caderno_id
                       WHERE r.matricula = ? AND r.data_inspecao IS NOT NULL AND r.data_inspecao != ''
                       GROUP BY 1, 2
                   )
                   SELECT 
                       t.mes,
                       t.categoria,
                       t.total,
                       u.nome_inspetor as top_inspetor,
                       u.total_insp as top_inspetor_count
                   FROM cat_totals t
                   LEFT JOIN user_counts u ON u.mes = t.mes AND u.categoria = t.categoria AND u.rn = 1
                   ORDER BY t.mes ASC, t.categoria ASC`, catParams
        );

        const porCategoria = await db.allAsync(
            privileged
                ? `SELECT COALESCE(
                       NULLIF(TRIM(c.categoria), ''),
                       NULLIF(TRIM(r.categoria), ''),
                       CASE 
                           WHEN c.nome LIKE '%NR%' OR c.nome LIKE '%RAC%' THEN 'NR'
                           WHEN c.nome LIKE '%5S%' THEN '5S'
                           WHEN c.nome LIKE '%Passaporte%' THEN 'Passaporte'
                           WHEN c.nome LIKE '%Incêndio%' OR c.nome LIKE '%Ambiente%' THEN 'Meio Ambiente'
                           WHEN c.nome LIKE '%Checklist%' THEN 'Checklist'
                           ELSE 'Geral'
                       END
                   ) as categoria, COUNT(*) as total
                   FROM caderno_respostas r
                   LEFT JOIN cadernos_inspecao c ON c.id = r.caderno_id
                   GROUP BY 1 ORDER BY total DESC`
                : `SELECT COALESCE(
                       NULLIF(TRIM(c.categoria), ''),
                       NULLIF(TRIM(r.categoria), ''),
                       CASE 
                           WHEN c.nome LIKE '%NR%' OR c.nome LIKE '%RAC%' THEN 'NR'
                           WHEN c.nome LIKE '%5S%' THEN '5S'
                           WHEN c.nome LIKE '%Passaporte%' THEN 'Passaporte'
                           WHEN c.nome LIKE '%Incêndio%' OR c.nome LIKE '%Ambiente%' THEN 'Meio Ambiente'
                           WHEN c.nome LIKE '%Checklist%' THEN 'Checklist'
                           ELSE 'Geral'
                       END
                   ) as categoria, COUNT(*) as total
                   FROM caderno_respostas r
                   LEFT JOIN cadernos_inspecao c ON c.id = r.caderno_id
                   WHERE r.matricula = ?
                   GROUP BY 1 ORDER BY total DESC`, baseParams
        );

        const conclusaoTecnica = await db.allAsync(
            privileged
                ? `SELECT COALESCE(conclusao_tecnica, 'Não informado') as tipo, COUNT(*) as total
                   FROM caderno_respostas
                   GROUP BY conclusao_tecnica ORDER BY total DESC`
                : `SELECT COALESCE(conclusao_tecnica, 'Não informado') as tipo, COUNT(*) as total
                   FROM caderno_respostas WHERE matricula = ?
                   GROUP BY conclusao_tecnica ORDER BY total DESC`, baseParams
        );

        const porFrenteServico = await db.allAsync(
            privileged
                ? `SELECT local, COUNT(*) as total
                   FROM caderno_respostas
                   WHERE local IS NOT NULL AND local != ''
                   GROUP BY local ORDER BY total DESC LIMIT 15`
                : `SELECT local, COUNT(*) as total
                   FROM caderno_respostas
                   WHERE matricula = ? AND local IS NOT NULL AND local != ''
                   GROUP BY local ORDER BY total DESC LIMIT 15`, baseParams
        );

        const porSubcategoria = await db.allAsync(
            privileged
                ? `SELECT COALESCE(subcategoria, 'Não categorizado') as subcategoria, COUNT(*) as total
                   FROM caderno_respostas
                   GROUP BY subcategoria ORDER BY total DESC LIMIT 15`
                : `SELECT COALESCE(subcategoria, 'Não categorizado') as subcategoria, COUNT(*) as total
                   FROM caderno_respostas WHERE matricula = ?
                   GROUP BY subcategoria ORDER BY total DESC LIMIT 15`, baseParams
        );

        const porLideranca = await db.allAsync(
            privileged
                ? `SELECT 
                       COALESCE(NULLIF(TRIM(r.lideranca), ''), NULLIF(TRIM(u.lideranca), ''), 'Não informada') as lideranca,
                       COUNT(*) as total
                   FROM caderno_respostas r
                   LEFT JOIN usuarios u ON u.matricula = r.matricula
                   GROUP BY 1 ORDER BY total DESC LIMIT 15`
                : `SELECT 
                       COALESCE(NULLIF(TRIM(r.lideranca), ''), NULLIF(TRIM(u.lideranca), ''), 'Não informada') as lideranca,
                       COUNT(*) as total
                   FROM caderno_respostas r
                   LEFT JOIN usuarios u ON u.matricula = r.matricula
                   WHERE r.matricula = ?
                   GROUP BY 1 ORDER BY total DESC LIMIT 15`, baseParams
        );

        const porUsuario = await db.allAsync(
            privileged
                ? `SELECT nome_inspetor, COUNT(*) as total
                   FROM caderno_respostas
                   GROUP BY nome_inspetor ORDER BY total DESC`
                : `SELECT nome_inspetor, COUNT(*) as total
                   FROM caderno_respostas WHERE matricula = ?
                   GROUP BY nome_inspetor ORDER BY total DESC`, baseParams
        );

        const respostas = await db.allAsync(
            privileged
                ? `SELECT 
                       r.id,
                       strftime('%Y-%m', r.data_inspecao) as mes,
                       strftime('%Y', r.data_inspecao) as ano,
                       COALESCE(NULLIF(TRIM(r.contrato), ''), NULLIF(TRIM(c.contrato), ''), 'Geral') as contrato,
                       COALESCE(
                           NULLIF(TRIM(c.categoria), ''),
                           NULLIF(TRIM(r.categoria), ''),
                           CASE 
                               WHEN c.nome LIKE '%NR%' OR c.nome LIKE '%RAC%' THEN 'NR'
                               WHEN c.nome LIKE '%5S%' THEN '5S'
                               WHEN c.nome LIKE '%Passaporte%' THEN 'Passaporte'
                               WHEN c.nome LIKE '%Incêndio%' OR c.nome LIKE '%Ambiente%' THEN 'Meio Ambiente'
                               WHEN c.nome LIKE '%Checklist%' THEN 'Checklist'
                               ELSE 'Geral'
                           END
                       ) as categoria,
                       COALESCE(c.nome, 'Caderno Desconhecido') as caderno_nome,
                       COALESCE(r.local, 'Não informado') as frente,
                       COALESCE(NULLIF(TRIM(r.lideranca), ''), NULLIF(TRIM(u.lideranca), ''), 'Não informada') as lideranca,
                       COALESCE(r.conclusao_tecnica, 'Em Conformidade') as conclusao_tecnica,
                       COALESCE(r.nome_inspetor, 'Inspetor') as nome_inspetor
                   FROM caderno_respostas r
                   LEFT JOIN cadernos_inspecao c ON c.id = r.caderno_id
                   LEFT JOIN usuarios u ON u.matricula = r.matricula
                   WHERE r.data_inspecao IS NOT NULL AND r.data_inspecao != ''
                   ORDER BY r.data_inspecao ASC`
                : `SELECT 
                       r.id,
                       strftime('%Y-%m', r.data_inspecao) as mes,
                       strftime('%Y', r.data_inspecao) as ano,
                       COALESCE(NULLIF(TRIM(r.contrato), ''), NULLIF(TRIM(c.contrato), ''), 'Geral') as contrato,
                       COALESCE(
                           NULLIF(TRIM(c.categoria), ''),
                           NULLIF(TRIM(r.categoria), ''),
                           CASE 
                               WHEN c.nome LIKE '%NR%' OR c.nome LIKE '%RAC%' THEN 'NR'
                               WHEN c.nome LIKE '%5S%' THEN '5S'
                               WHEN c.nome LIKE '%Passaporte%' THEN 'Passaporte'
                               WHEN c.nome LIKE '%Incêndio%' OR c.nome LIKE '%Ambiente%' THEN 'Meio Ambiente'
                               WHEN c.nome LIKE '%Checklist%' THEN 'Checklist'
                               ELSE 'Geral'
                           END
                       ) as categoria,
                       COALESCE(c.nome, 'Caderno Desconhecido') as caderno_nome,
                       COALESCE(r.local, 'Não informado') as frente,
                       COALESCE(NULLIF(TRIM(r.lideranca), ''), NULLIF(TRIM(u.lideranca), ''), 'Não informada') as lideranca,
                       COALESCE(r.conclusao_tecnica, 'Em Conformidade') as conclusao_tecnica,
                       COALESCE(r.nome_inspetor, 'Inspetor') as nome_inspetor
                   FROM caderno_respostas r
                   LEFT JOIN cadernos_inspecao c ON c.id = r.caderno_id
                   LEFT JOIN usuarios u ON u.matricula = r.matricula
                   WHERE r.matricula = ? AND r.data_inspecao IS NOT NULL AND r.data_inspecao != ''
                   ORDER BY r.data_inspecao ASC`, baseParams
        );

        const todosContratosRows = await db.allAsync(`
            SELECT DISTINCT contrato FROM (
                SELECT contrato FROM caderno_respostas WHERE contrato IS NOT NULL AND TRIM(contrato) != ''
                UNION
                SELECT contrato FROM cadernos_inspecao WHERE contrato IS NOT NULL AND TRIM(contrato) != ''
                UNION
                SELECT contrato FROM usuarios WHERE contrato IS NOT NULL AND TRIM(contrato) != ''
            ) ORDER BY contrato ASC
        `);
        const todosContratos = todosContratosRows.map(r => r.contrato);

        res.json({
            totalRespostas,
            totalCadernos,
            porCaderno,
            porMes,
            porMesCategoria,
            porCategoria,
            conclusaoTecnica,
            porFrenteServico,
            porSubcategoria,
            porLideranca,
            porUsuario,
            todosContratos,
            respostas
        });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/inspecoes/respostas/:id
router.get('/respostas/:id', requireAuth, async (req, res) => {
    try {
        const row = await db.getAsync(
            `${respostasListQuery()} WHERE r.id = ?`,
            [req.params.id]
        );
        if (!row) return res.status(404).json({ error: 'Inspeção não encontrada.' });

        if (!isPrivileged(req.session.usuario) && row.matricula !== req.session.usuario.matricula) {
            return res.status(403).json({ error: 'Acesso negado.' });
        }

        let perguntas = [];
        try {
            perguntas = await db.allAsync(
                'SELECT * FROM perguntas_caderno WHERE caderno_id = ? ORDER BY ordem ASC, id ASC',
                [row.caderno_id]
            );
        } catch (_) {}

        res.json({ inspecao: row, perguntas });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/inspecoes/respostas — Submeter inspeção de rotina
router.post('/respostas', requireAuth, upload.fields([
    { name: 'foto', maxCount: 1 },
    { name: 'foto_2', maxCount: 1 },
    { name: 'foto_3', maxCount: 1 }
]), async (req, res) => {
    const u = req.session.usuario;
    const { caderno_id, data_inspecao, data_ocorrido, contrato, lideranca,
            local, subcategoria, categoria, descricao, conclusao_tecnica, respostas_json, observacoes } = req.body;

    if (!caderno_id) return res.status(400).json({ error: 'Caderno é obrigatório.' });
    if (!respostas_json) return res.status(400).json({ error: 'Respostas são obrigatórias.' });

    let respostasObj;
    try {
        respostasObj = typeof respostas_json === 'string' ? JSON.parse(respostas_json) : respostas_json;
    } catch (_) {
        return res.status(400).json({ error: 'Formato de respostas inválido.' });
    }

    try {
        const caderno = await db.getAsync("SELECT * FROM cadernos_inspecao WHERE id=? AND status='ativo'", [caderno_id]);
        if (!caderno) return res.status(404).json({ error: 'Caderno não encontrado.' });

        const perguntas = await db.allAsync(
            'SELECT id, eh_critico_interditivo FROM perguntas_caderno WHERE caderno_id = ?',
            [caderno_id]
        );
        const regra = deriveConclusaoTecnica(perguntas, respostasObj);
        if (!regra.ok) return res.status(400).json({ error: regra.error });

        const conclusaoFinal = regra.value || conclusao_tecnica;
        if (!conclusaoFinal) {
            return res.status(400).json({ error: 'Conclusão técnica é obrigatória.' });
        }
        if (!regra.allowed.includes(conclusaoFinal)) {
            return res.status(400).json({
                error: regra.allowed.includes('Ver e Agir')
                    ? 'Há não conformidade sem interdição. Selecione Ver e Agir ou Notificação.'
                    : `Conclusão técnica inválida. Esperado: ${regra.allowed.join(' ou ')}.`
            });
        }

        const contratoFinal = contrato || u.contrato || caderno.contrato || null;
        if (!contratoFinal) return res.status(400).json({ error: 'Contrato é obrigatório.' });

        if (lideranca) {
            const lid = await db.getAsync(
                `SELECT id FROM usuarios WHERE ativo = 1 AND is_lideranca = 1 AND contrato = ? AND nome = ?`,
                [contratoFinal, lideranca]
            );
            if (!lid) {
                return res.status(400).json({ error: 'A liderança deve pertencer ao mesmo contrato da inspeção.' });
            }
        } else {
            return res.status(400).json({ error: 'Liderança é obrigatória.' });
        }

        if (local) {
            const obra = await db.getAsync('SELECT id FROM vps_canteiros WHERE nome = ?', [local]);
            if (!obra) {
                return res.status(400).json({ error: 'Local / SS deve ser uma obra cadastrada na Maturidade VPS.' });
            }
        } else {
            return res.status(400).json({ error: 'Local / SS é obrigatório.' });
        }

        const id = uuidv4();
        const fotPath   = req.files?.foto?.[0]   ? `/uploads/inspecoes/${req.files.foto[0].filename}` : null;
        const fot2Path  = req.files?.foto_2?.[0]  ? `/uploads/inspecoes/${req.files.foto_2[0].filename}` : null;
        const fot3Path  = req.files?.foto_3?.[0]  ? `/uploads/inspecoes/${req.files.foto_3[0].filename}` : null;

        if (!fotPath) {
            return res.status(400).json({ error: 'A Foto 1 (evidência inicial) é obrigatória.' });
        }

        const dataRegistro = data_inspecao || new Date().toISOString().slice(0, 10);

        await db.runAsync(
            `INSERT INTO caderno_respostas
             (id, caderno_id, matricula, nome_inspetor, data_inspecao, data_ocorrido,
              contrato, lideranca, local, subcategoria, categoria, descricao, conclusao_tecnica,
              respostas_json, observacoes, foto_path, foto_2_path, foto_3_path)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [id, caderno_id, u.matricula, u.nome,
             dataRegistro, data_ocorrido || null, contratoFinal,
             lideranca, local, subcategoria || null, categoria || null, descricao || null,
             conclusaoFinal,
             typeof respostas_json === 'string' ? respostas_json : JSON.stringify(respostasObj),
             observacoes || null,
             fotPath, fot2Path, fot3Path]
        );

        res.status(201).json({ id, message: 'Inspeção registrada com sucesso.' });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/inspecoes/respostas/:id
router.delete('/respostas/:id', requireAdm, async (req, res) => {
    try {
        const row = await db.getAsync('SELECT * FROM caderno_respostas WHERE id = ?', [req.params.id]);
        if (!row) return res.status(404).json({ error: 'Não encontrado.' });

        [row.foto_path, row.foto_2_path, row.foto_3_path].forEach(p => {
            if (p) {
                const abs = path.join(__dirname, '..', p);
                if (fs.existsSync(abs)) fs.unlinkSync(abs);
            }
        });

        await db.runAsync('DELETE FROM caderno_respostas WHERE id = ?', [req.params.id]);
        res.json({ message: 'Inspeção removida.' });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════
//  INSPEÇÕES AVULSAS (legado — mantido para retrocompatibilidade)
// ═══════════════════════════════════════════════════════════════

// GET /api/inspecoes
router.get('/', requireAuth, async (req, res) => {
    const { perfil, matricula } = req.session.usuario;
    const { page=1, limit=20 } = req.query;
    const offset = (Number(page)-1)*Number(limit);

    try {
        let rows, total;
        if (isPrivileged(req.session.usuario)) {
            rows  = await db.allAsync('SELECT * FROM inspecoes_avulsas ORDER BY data_inspecao DESC LIMIT ? OFFSET ?', [Number(limit), offset]);
            total = (await db.getAsync('SELECT COUNT(*) as count FROM inspecoes_avulsas')).count;
        } else {
            const userContrato = req.session.usuario.contrato;
            if (userContrato) {
                rows  = await db.allAsync('SELECT * FROM inspecoes_avulsas WHERE contrato=? ORDER BY data_inspecao DESC LIMIT ? OFFSET ?', [userContrato, Number(limit), offset]);
                total = (await db.getAsync('SELECT COUNT(*) as count FROM inspecoes_avulsas WHERE contrato=?', [userContrato])).count;
            } else {
                rows  = await db.allAsync('SELECT * FROM inspecoes_avulsas WHERE matricula=? ORDER BY data_inspecao DESC LIMIT ? OFFSET ?', [matricula, Number(limit), offset]);
                total = (await db.getAsync('SELECT COUNT(*) as count FROM inspecoes_avulsas WHERE matricula=?', [matricula])).count;
            }
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
