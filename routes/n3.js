// routes/n3.js
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const crypto  = require('crypto');
const XLSX    = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const db      = require('../database/db');
const { uploadBuffer, removeMedia } = require('../config/cloudinary');
const { requireAuth, requireAdm, requireContractScope } = require('../middleware/auth.middleware');
const { resolvePeriod, buildPeriodClause, periodMeta, todayIso } = require('../utils/period');
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

// Upload de planilhas históricas (N3) — sem passar pelo Cloudinary
const uploadPlanilha = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
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

// ── Normalização da planilha de importação ─────────────────────
function pad2(value) {
    return String(value).padStart(2, '0');
}

function normalizeToken(value) {
    return String(value == null ? '' : value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function normalizeHeaderKey(value) {
    return normalizeToken(value).replace(/[^a-z0-9]/g, '');
}

function cleanText(value, fallback = '') {
    if (value == null) return fallback;
    const text = String(value).replace(/\u00a0/g, ' ').trim();
    return text || fallback;
}

// Extrai a chave de um serviço SS (ex.: "SS_113/24 - ..." => "ss113/24"),
// usada para relacionar o Local/SS da planilha aos canteiros/contratos.
function ssCodeKey(value) {
    const match = String(value == null ? '' : value)
        .match(/SS[\s_-]*0*(\d{1,3})\s*[/\-]\s*(\d{2})/i);
    return match ? `ss${Number(match[1])}/${match[2]}` : null;
}

function historicalUserMatricula(nome) {
    const normalized = normalizeToken(nome).replace(/\s+/g, ' ').trim();
    const hash = crypto.createHash('sha1').update(normalized).digest('hex');
    return 'HIST-' + hash.slice(0, 10).toUpperCase();
}

function mostFrequentKey(counts) {
    let best = null;
    let bestCount = 0;
    for (const [key, count] of counts || []) {
        if (count > bestCount) {
            best = key;
            bestCount = count;
        }
    }
    return best;
}

// Cria um leitor tolerante a pequenas variações nos cabeçalhos da planilha.
function createRowReader(row) {
    const values = new Map();
    Object.keys(row || {}).forEach(key => {
        values.set(normalizeHeaderKey(key), row[key]);
    });

    return (...aliases) => {
        for (const alias of aliases) {
            const key = normalizeHeaderKey(alias);
            if (!values.has(key)) continue;
            const value = values.get(key);
            if (value !== undefined && value !== null && String(value).trim() !== '') {
                return value;
            }
        }
        return '';
    };
}

function spreadsheetDateToIso(value, fallback = null) {
    if (value === '' || value == null) return fallback;

    if (value instanceof Date) {
        if (isNaN(value.getTime())) return fallback;
        return value.toISOString().slice(0, 10);
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        const parsed = XLSX.SSF.parse_date_code(value);
        if (parsed && parsed.y) {
            return `${parsed.y}-${pad2(parsed.m)}-${pad2(parsed.d)}`;
        }
        return fallback;
    }

    const raw = String(value).trim();
    if (!raw) return fallback;

    let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;

    match = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
    if (match) {
        let year = Number(match[3]);
        if (year < 100) year += 2000;
        return `${year}-${pad2(match[2])}-${pad2(match[1])}`;
    }

    const date = new Date(raw);
    if (!isNaN(date.getTime())) return date.toISOString().slice(0, 10);
    return fallback;
}

function normalizeNivel(value) {
    const token = normalizeToken(value).toUpperCase();
    if (!token) return 'Em Análise';
    if (token.includes('PRIORIT')) return 'N3 Prioritário — Casos Críticos';
    if (token.includes('N1')) return 'N1 — Óbito ou Mudança de Vida';
    if (token.includes('N2')) return 'N2 — Acidente com Afastamento';
    if (token.includes('N4') || token.includes('N5')) return 'N4 / N5 — Desvios Leves e Observações';
    if (token.includes('N3')) return 'N3 — Quase Acidente / Condição Insegura Neutralizada';
    if (token.includes('ANALISE')) return 'Em Análise';
    return cleanText(value, 'Em Análise');
}

function normalizeStatus(value) {
    const token = normalizeToken(value).toUpperCase();
    if (token.includes('CONCLU')) return 'Concluído';
    if (token.includes('PENDENT')) return 'Pendente';
    if (token.includes('APROVAD')) return 'Aprovado';
    if (token.includes('REPROVAD')) return 'Reprovado';
    return 'Em Análise';
}

function normalizeCategoria(value) {
    const token = normalizeToken(value).toUpperCase();
    if (!token) return 'Não informado';
    if (token.includes('ATITUDE')) return 'Evento sem Perda (Atitude Insegura)';
    if (token.includes('EVENTO SEM PERDA')) return 'Evento sem Perda';
    if (token.includes('INSPEC') || token.includes('AUDITORIA')) return 'Durante Inspeção ou Auditoria';
    return cleanText(value, 'Não informado');
}

function normalizeEmpresa(value) {
    const token = normalizeToken(value).toUpperCase();
    if (!token) return 'Não informada';
    if (token.includes('OMEGA')) return 'OMEGA';
    if (token.includes('CLIENTE')) return 'CLIENTE';
    return cleanText(value, 'Não informada');
}

function normalizeTag(value) {
    const tag = cleanText(value).replace(/[^A-Za-z0-9]/g, '');
    return tag || null;
}

// A planilha histórica referencia fotos locais (N3_Images/...) que não existem
// neste servidor. Só preservamos URLs absolutas; o resto fica nulo.
function usablePhotoUrl(value) {
    const url = cleanText(value);
    return /^https?:\/\//i.test(url) ? url : null;
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
// Por padrão retorna apenas os últimos 7 dias. O histórico completo é carregado
// sob demanda com periodo=all (ou data_inicio/data_fim) + offset/limit.
router.get('/', requireAuth, requireContractScope, async (req, res) => {
    const { matricula } = req.session.usuario;
    const { nivel, limit = 200, contrato } = req.query;

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

    // Janela de datas (default: últimos 7 dias)
    const period = resolvePeriod(req.query, 7);
    const periodClause = buildPeriodClause('n.data', period);
    const periodWhere = periodClause.sql ? ` AND ${periodClause.sql}` : '';
    const periodParams = periodClause.params;

    const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);

    const offsetRaw = req.query.offset;
    const parsedOffset = Number(offsetRaw);
    const pageNumber = Math.max(Number(req.query.page) || 1, 1);
    const offset = (offsetRaw !== undefined && offsetRaw !== '' && Number.isFinite(parsedOffset) && parsedOffset >= 0)
        ? Math.floor(parsedOffset)
        : (pageNumber - 1) * safeLimit;

    try {
        const baseFrom = `
            FROM n3_registros n
            LEFT JOIN usuarios u ON u.matricula = n.matricula_observador`;

        const [rows, count, allCount] = await Promise.all([
            db.allAsync(`
                SELECT n.*, COALESCE(n.contrato, u.contrato) as contrato, COALESCE(u.nome, n.nome_observador) as nome_observador
                ${baseFrom}
                ${where}${periodWhere}
                ORDER BY n.data DESC, n.criado_em DESC, n.id DESC LIMIT ? OFFSET ?
            `, [...params, ...periodParams, safeLimit, offset]),
            db.getAsync(`
                SELECT COUNT(*) as count
                ${baseFrom}
                ${where}${periodWhere}
            `, [...params, ...periodParams]),
            period.mode === 'all'
                ? Promise.resolve(null)
                : db.getAsync(`
                    SELECT COUNT(*) as count
                    ${baseFrom}
                    ${where}
                `, params)
        ]);

        const total = count ? Number(count.count) : 0;
        const totalSemPeriodo = allCount ? Number(allCount.count) : total;

        res.json({
            data: rows,
            total,
            total_sem_periodo: totalSemPeriodo,
            page: Math.floor(offset / safeLimit) + 1,
            limit: safeLimit,
            offset,
            has_more: offset + rows.length < total,
            has_historico: totalSemPeriodo > total,
            period: periodMeta(period),
        });
    } catch(err) {
        console.error('[N3] Erro ao listar registros:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/n3/importar — Importação de planilha histórica (%xlsx, .xls, .csv)
// Cada linha vira um registro. Campos ausentes recebem valores de fallback e
// referências locais de foto são descartadas (ficam NULL) sem quebrar a base.
router.post('/importar', requireAdm, uploadPlanilha.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    const importador = req.session.usuario;
    const isMaster = !!importador.is_master;

    try {
        // cellDates:false preserva matrículas numéricas como números (evita que
        // o Excel as converta em datas) e mantém as datas como serial Excel,
        // formato já tratado por spreadsheetDateToIso().
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: false });
        const sheetName = workbook.SheetNames[0];
        const sheet = sheetName ? workbook.Sheets[sheetName] : null;

        if (!sheet) {
            return res.status(400).json({ error: 'A planilha não possui nenhuma aba válida.' });
        }

        const rawData = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
        if (!rawData.length) {
            return res.status(400).json({ error: 'A planilha fornecida está vazia.' });
        }

        const [usuariosIniciais, canteiros, contratosHistoricos] = await Promise.all([
            db.allAsync('SELECT matricula, nome, lideranca, contrato FROM usuarios'),
            db.allAsync('SELECT nome, contrato FROM vps_canteiros WHERE nome IS NOT NULL'),
            db.allAsync(`
                SELECT matricula, contrato, SUM(total) AS total FROM (
                    SELECT matricula_observador AS matricula, contrato, 1 AS total
                    FROM n3_registros
                    WHERE contrato IS NOT NULL AND TRIM(contrato) != ''
                    UNION ALL
                    SELECT matricula, contrato, 1 AS total
                    FROM caderno_respostas
                    WHERE contrato IS NOT NULL AND TRIM(contrato) != ''
                ) evidencias
                GROUP BY matricula, contrato
            `),
        ]);
        let userMap = new Map(
            usuariosIniciais.map(u => [String(u.matricula).trim(), u])
        );

        // Relaciona Local/SS a contrato: primeiro por nome exato do canteiro,
        // depois pela chave do serviço SS (ex.: SS_113/24 => ss113/24).
        const canteiroExato = new Map();
        const canteiroPorSs = new Map();
        for (const canteiro of canteiros) {
            const nomeCanteiro = cleanText(canteiro.nome);
            const contratoCanteiro = cleanText(canteiro.contrato);
            if (!nomeCanteiro || !contratoCanteiro) continue;
            canteiroExato.set(nomeCanteiro, contratoCanteiro);
            const chave = ssCodeKey(nomeCanteiro);
            if (chave && !canteiroPorSs.has(chave)) {
                canteiroPorSs.set(chave, contratoCanteiro);
            }
        }

        // Contratos já registrados para a mesma matrícula em N3/inspeções.
        const historicoContratoMap = new Map();
        for (const item of contratosHistoricos) {
            const matricula = String(item.matricula || '').trim();
            const contrato = cleanText(item.contrato);
            if (!matricula || !contrato) continue;
            const counts = historicoContratoMap.get(matricula) || new Map();
            counts.set(contrato, (counts.get(contrato) || 0) + Number(item.total || 1));
            historicoContratoMap.set(matricula, counts);
        }

        const preparadas = [];
        const evidenciasLocais = new Map();
        const novosUsuarios = new Map();
        const registros = [];
        const erros = [];
        let linhasVazias = 0;
        let fotosIgnoradas = 0;
        let usuariosCriados = 0;

        // 1ª passada: resolve observador e contrato de cada linha e identifica
        // usuários ausentes. A criação ocorre antes dos inserts de N3 para que
        // a chave de relacionamento já exista.
        rawData.forEach((row, index) => {
            const linha = index + 2; // linha 1 = cabeçalho

            // Ignora linhas totalmente vazias
            const temConteudo = Object.values(row || {}).some(
                value => String(value == null ? '' : value).trim() !== ''
            );
            if (!temConteudo) {
                linhasVazias++;
                return;
            }

            try {
                const get = createRowReader(row);
                const rawMatricula = cleanText(get('Matrícula', 'Matricula', 'matricula'));
                const rawNome = cleanText(get('Nome (Observador)', 'Nome', 'Observador', 'nome_observador'));
                const localSs = cleanText(get('Local/SS', 'Local', 'local_ss'));

                // Sem matrícula, mas com nome: cria uma identidade histórica
                // determinística para preservar o observador original.
                let matricula = rawMatricula;
                if (!matricula && rawNome) {
                    matricula = historicalUserMatricula(rawNome);
                }

                // Sem matrícula nem nome: usa quem executa a importação.
                if (!matricula) {
                    matricula = String(importador.matricula).trim();
                }

                const usuario = userMap.get(matricula) || null;
                const nome = rawNome || usuario?.nome || '';

                // Evidência de contrato desta linha: nome exato do canteiro,
                // chave SS ou coluna Contrato (quando existir na planilha).
                let contratoLocal = canteiroExato.get(localSs) || '';
                if (!contratoLocal) {
                    const chave = ssCodeKey(localSs);
                    if (chave) contratoLocal = canteiroPorSs.get(chave) || '';
                }
                if (!contratoLocal) contratoLocal = cleanText(get('Contrato', 'contrato'));

                if (contratoLocal) {
                    const counts = evidenciasLocais.get(matricula) || new Map();
                    counts.set(contratoLocal, (counts.get(contratoLocal) || 0) + 1);
                    evidenciasLocais.set(matricula, counts);
                }

                if (!usuario && !novosUsuarios.has(matricula)) {
                    novosUsuarios.set(matricula, {
                        matricula,
                        nome: (nome || `Observador histórico ${matricula}`).slice(0, 255),
                        contrato: null,
                        lideranca: cleanText(get('Liderança', 'Lideranca', 'lideranca')) || null,
                    });
                }

                preparadas.push({ row, linha, matricula, nome, contrato: null });
            } catch (rowErr) {
                if (erros.length < 100) {
                    erros.push({ linha, motivo: rowErr.message });
                }
            }
        });

        // Contrato por observador: prioriza o contrato já cadastrado no usuário,
        // depois o histórico em N3/inspeções e, por fim, a evidência de Local/SS
        // das próprias linhas. O mesmo contrato vale para todas as linhas da
        // pessoa, evitando registros órfãos quando só parte dos locais casa.
        const contratoPorIdentidade = new Map();
        for (const preparada of preparadas) {
            if (contratoPorIdentidade.has(preparada.matricula)) continue;

            const usuario = userMap.get(preparada.matricula);
            let contrato = usuario?.contrato ? String(usuario.contrato).trim() : '';
            if (!contrato) {
                contrato = mostFrequentKey(historicoContratoMap.get(preparada.matricula)) || '';
            }
            if (!contrato) {
                contrato = mostFrequentKey(evidenciasLocais.get(preparada.matricula)) || '';
            }

            // ADM comum só pode importar para o próprio contrato.
            if (!isMaster) {
                contrato = importador.contrato ? String(importador.contrato).trim() : '';
            }

            contratoPorIdentidade.set(preparada.matricula, contrato || null);
        }

        for (const preparada of preparadas) {
            preparada.contrato = contratoPorIdentidade.get(preparada.matricula) || null;
        }
        for (const novo of novosUsuarios.values()) {
            novo.contrato = contratoPorIdentidade.get(novo.matricula) || null;
        }

        if (novosUsuarios.size) {
            await db.withTransaction(async (tx) => {
                for (const novo of novosUsuarios.values()) {
                    const result = await tx.runAsync(
                        `INSERT INTO usuarios
                            (matricula, nome, funcao, perfil, contrato, senha_hash, ativo, is_lideranca, is_master)
                         VALUES (?, ?, ?, 'operacional', ?, NULL, 1, 0, 0)
                         ON CONFLICT (matricula) DO NOTHING`,
                        [novo.matricula, novo.nome, 'Importado (histórico N3)', novo.contrato]
                    );
                    usuariosCriados += result.changes || 0;
                }
            });

            const usuariosAtualizados = await db.allAsync(
                'SELECT matricula, nome, lideranca, contrato FROM usuarios'
            );
            userMap = new Map(
                usuariosAtualizados.map(u => [String(u.matricula).trim(), u])
            );
        }

        // 2ª passada: monta os registros N3 com os dados já normalizados.
        for (const preparada of preparadas) {
            const { row, linha, matricula } = preparada;
            try {
                const get = createRowReader(row);
                const usuario = userMap.get(matricula) || null;
                const nome = preparada.nome || usuario?.nome || importador.nome;
                const contrato = preparada.contrato ||
                    (usuario?.contrato ? String(usuario.contrato).trim() : null);

                const rawEv1 = get('Evidência 1 (Foto do Forms)', 'Evidencia 1 (Foto do Forms)', 'Evidência 1', 'Evidencia 1');
                const rawEv2 = get('Evidência 2 (Foto)', 'Evidencia 2 (Foto)', 'Evidência 2', 'Evidencia 2');
                const rawEv3 = get('Evidência 3 (Foto)', 'Evidencia 3 (Foto)', 'Evidência 3', 'Evidencia 3');

                const ev1 = usablePhotoUrl(rawEv1);
                const ev2 = usablePhotoUrl(rawEv2);
                const ev3 = usablePhotoUrl(rawEv3);

                fotosIgnoradas += [rawEv1, rawEv2, rawEv3].filter(raw => {
                    const hasValue = cleanText(raw) !== '';
                    return hasValue && !usablePhotoUrl(raw);
                }).length;

                const sourceId = cleanText(get('id', 'ID', 'Id'));
                const id = sourceId
                    ? 'imp-' + crypto.createHash('sha1').update(sourceId).digest('hex')
                    : uuidv4();

                registros.push({
                    id,
                    data: spreadsheetDateToIso(get('Data', 'data'), todayIso()),
                    matricula_observador: matricula,
                    nome_observador: nome || importador.nome,
                    lideranca: cleanText(
                        get('Liderança', 'Lideranca', 'lideranca'),
                        usuario?.lideranca || importador.lideranca || 'Não informada'
                    ),
                    nivel: normalizeNivel(get('Nível', 'Nivel', 'nivel')),
                    local_ss: cleanText(get('Local/SS', 'Local', 'local_ss'), 'Não informado'),
                    descricao_situacao: cleanText(
                        get('Descrição da Situação (N3)', 'Descricao da Situacao (N3)', 'Descrição', 'Descricao', 'descricao_situacao'),
                        'Descrição não informada (registro importado).'
                    ),
                    categoria: normalizeCategoria(get('Categoria (Tipo)', 'Categoria', 'categoria')),
                    subcategoria: cleanText(get('Subcategoria', 'subcategoria'), 'Não informado'),
                    tag: normalizeTag(get('TAG', 'Tag', 'tag')),
                    plano_acao: cleanText(get('Plano de Ação', 'Plano de Acao', 'plano_acao'), 'Não informado.'),
                    empresa_responsavel: normalizeEmpresa(
                        get('Empresa Responsável pela Ação', 'Empresa Responsavel pela Acao', 'Empresa Responsável', 'empresa_responsavel')
                    ),
                    lideranca_responsavel: cleanText(
                        get('Liderança Responsável pela Ação', 'Lideranca Responsavel pela Acao', 'Liderança Responsável', 'lideranca_responsavel')
                    ) || null,
                    prazo_vencimento: spreadsheetDateToIso(get('Prazo (Vencimento)', 'Prazo', 'prazo_vencimento'), null),
                    status: normalizeStatus(get('Status', 'status')),
                    evidencia_1_path: ev1,
                    evidencia_2_path: ev2,
                    evidencia_3_path: ev3,
                    contrato: contrato || null,
                });
            } catch (rowErr) {
                if (erros.length < 100) {
                    erros.push({ linha, motivo: rowErr.message });
                }
            }
        }

        if (!registros.length) {
            return res.status(422).json({
                success: false,
                message: 'Nenhum registro válido foi encontrado para importação.',
                total_processados: rawData.length,
                inseridos: 0,
                erros,
            });
        }

        const colunas = [
            'id', 'data', 'matricula_observador', 'nome_observador', 'lideranca', 'nivel',
            'local_ss', 'descricao_situacao', 'categoria', 'subcategoria', 'tag', 'plano_acao',
            'empresa_responsavel', 'lideranca_responsavel', 'prazo_vencimento', 'status',
            'evidencia_1_path', 'evidencia_2_path', 'evidencia_3_path', 'contrato',
        ];

        let inseridos = 0;
        const tamanhoLote = 100;

        await db.withTransaction(async (tx) => {
            for (let i = 0; i < registros.length; i += tamanhoLote) {
                const lote = registros.slice(i, i + tamanhoLote);
                const placeholders = lote
                    .map(() => `(${colunas.map(() => '?').join(',')})`)
                    .join(',');
                const valores = lote.flatMap(registro => colunas.map(coluna => registro[coluna]));

                const result = await tx.runAsync(
                    `INSERT INTO n3_registros (${colunas.join(',')})
                     VALUES ${placeholders}
                     ON CONFLICT (id) DO NOTHING`,
                    valores
                );
                inseridos += result.changes || 0;
            }
        });

        const ignorados = registros.length - inseridos;

        return res.status(200).json({
            success: true,
            message: `${inseridos} registro(s) importado(s) com sucesso.` +
                (ignorados > 0 ? ` ${ignorados} registro(s) já existente(s) ignorado(s).` : '') +
                (usuariosCriados > 0 ? ` ${usuariosCriados} usuário(s) criado(s).` : '') +
                (fotosIgnoradas > 0 ? ` ${fotosIgnoradas} referência(s) de foto local foram descartadas.` : ''),
            total_processados: rawData.length,
            registros_validos: registros.length,
            inseridos,
            ignorados,
            usuarios_criados: usuariosCriados,
            linhas_vazias: linhasVazias,
            fotos_ignoradas: fotosIgnoradas,
            erros,
        });
    } catch (err) {
        console.error('[N3] Erro na importação da planilha:', err);
        return res.status(500).json({ error: 'Erro ao processar a importação da planilha: ' + err.message });
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
