// routes/trainings.js
const express  = require('express');
const multer   = require('multer');
const XLSX     = require('xlsx');
const PDFDocument = require('pdfkit');
const archiver = require('archiver');
const db       = require('../database/db');
const { requireAuth } = require('../middleware/auth.middleware');
const router   = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // Limite 10MB
});

// Lista de tipos de treinamento padronizados (Enum)
const TIPOS_TREINAMENTO_VALIDOS = [
    'NR-01 - Gerenciamento de Riscos Ocupacionais (GRO)',
    'NR-06 - Equipamentos de Proteção Individual (EPI)',
    'NR-10 - Segurança em Instalações e Serviços em Eletricidade',
    'NR-12 - Segurança no Trabalho em Máquinas e Equipamentos',
    'NR-18 - Saúde e Segurança na Indústria da Construção',
    'NR-20 - Segurança com Inflamáveis e Combustíveis',
    'NR-33 - Segurança no Trabalho em Espaços Confinados',
    'NR-35 - Trabalho em Altura',
    'Outros'
];

// Helper para normalizar datas de Excel/String para YYYY-MM-DD
function parseDateString(val) {
    if (!val) return null;
    if (val instanceof Date) {
        return val.toISOString().split('T')[0];
    }
    if (typeof val === 'number') {
        // Serial Date do Excel
        const dateObj = XLSX.SSF.parse_date_code(val);
        if (dateObj) {
            const m = String(dateObj.m).padStart(2, '0');
            const d = String(dateObj.d).padStart(2, '0');
            return `${dateObj.y}-${m}-${d}`;
        }
    }
    const str = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    
    // Formato BR: DD/MM/YYYY
    const brMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (brMatch) {
        const d = brMatch[1].padStart(2, '0');
        const m = brMatch[2].padStart(2, '0');
        const y = brMatch[3];
        return `${y}-${m}-${d}`;
    }
    return null;
}

// GET /api/treinamentos/modelo — Baixar Planilha Modelo (.xlsx)
router.get('/modelo', (req, res) => {
    try {
        const dadosExemplo = [
            {
                matricula: 'EMP-1001',
                nome_colaborador: 'Carlos Eduardo Silva',
                funcao: 'Técnico de Manutenção',
                nome_treinamento: 'NR-35 - Trabalho em Altura',
                data_realizacao: '2025-01-15',
                data_vencimento: '2027-01-15'
            },
            {
                matricula: 'EMP-1002',
                nome_colaborador: 'Ana Maria Santos',
                funcao: 'Eletricista',
                nome_treinamento: 'NR-10 - Segurança em Instalações e Serviços em Eletricidade',
                data_realizacao: '2024-06-10',
                data_vencimento: '2026-06-10'
            }
        ];

        const worksheet = XLSX.utils.json_to_sheet(dadosExemplo, {
            header: ['matricula', 'nome_colaborador', 'funcao', 'nome_treinamento', 'data_realizacao', 'data_vencimento']
        });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Modelo');

        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="modelo_treinamentos.xlsx"');
        return res.send(buffer);
    } catch (err) {
        console.error('[ERRO MODELO XLSX]:', err);
        return res.status(500).json({ error: 'Erro ao gerar planilha modelo.' });
    }
});

// GET /api/treinamentos/exportar — Exportar Dados (CSV)
router.get('/exportar', requireAuth, async (req, res) => {
    try {
        const { perfil, matricula: matLogado } = req.session.usuario || {};
        let rows;

        if (perfil === 'adm') {
            rows = await db.allAsync(`SELECT t.* FROM treinamentos t ORDER BY t.data_vencimento ASC`);
        } else {
            rows = await db.allAsync(`SELECT t.* FROM treinamentos t WHERE t.matricula = ? ORDER BY t.data_vencimento ASC`, [matLogado]);
        }

        let csv = 'id,matricula,nome_colaborador,funcao,nome_treinamento,data_realizacao,data_vencimento\n';
        rows.forEach(r => {
            const nomeColab = (r.nome || r.nome_colaborador || '').replace(/"/g, '""');
            const func = (r.funcao || '').replace(/"/g, '""');
            const trein = (r.nome_treinamento || '').replace(/"/g, '""');
            csv += `"${r.id}","${r.matricula}","${nomeColab}","${func}","${trein}","${r.data_realizacao || ''}","${r.data_vencimento || ''}"\n`;
        });

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="treinamentos_exportados.csv"');
        return res.send('\uFEFF' + csv); // UTF-8 BOM
    } catch (err) {
        console.error('[ERRO EXPORTAR CSV]:', err);
        return res.status(500).json({ error: 'Erro ao exportar dados em CSV.' });
    }
});

// POST /api/treinamentos/importar — Importar Planilha em Massa
router.post('/importar', requireAuth, upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    try {
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rawData = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (!rawData || rawData.length === 0) {
            return res.status(400).json({ error: 'A planilha fornecida está vazia.' });
        }

        const validos = [];
        const erros = [];

        rawData.forEach((row, index) => {
            const linhaNum = index + 2; // Linha 1 é cabeçalho
            const matricula = String(row.matricula || row.Matricula || '').trim();
            const nomeColaborador = String(row.nome_colaborador || row.nome || row.Nome || '').trim();
            const funcao = String(row.funcao || row.Funcao || '').trim();
            let nomeTreinamento = String(row.nome_treinamento || row.Treinamento || '').trim();
            const dataRealizacaoStr = parseDateString(row.data_realizacao || row.DataRealizacao);
            const dataVencimentoStr = parseDateString(row.data_vencimento || row.DataVencimento);

            // Validações
            if (!matricula) {
                erros.push({ linha: linhaNum, motivo: 'Campo "matricula" é obrigatório.' });
                return;
            }
            if (!nomeColaborador) {
                erros.push({ linha: linhaNum, motivo: 'Campo "nome_colaborador" é obrigatório.' });
                return;
            }
            if (!nomeTreinamento) {
                erros.push({ linha: linhaNum, motivo: 'Campo "nome_treinamento" é obrigatório.' });
                return;
            }
            if (!dataRealizacaoStr) {
                erros.push({ linha: linhaNum, motivo: 'Data de realização inválida ou ausente (Use AAAA-MM-DD ou DD/MM/AAAA).' });
                return;
            }
            if (!dataVencimentoStr) {
                erros.push({ linha: linhaNum, motivo: 'Data de vencimento inválida ou ausente (Use AAAA-MM-DD ou DD/MM/AAAA).' });
                return;
            }
            if (dataVencimentoStr < dataRealizacaoStr) {
                erros.push({ linha: linhaNum, motivo: 'Data de vencimento não pode ser anterior à data de realização.' });
                return;
            }

            // Normalizar / Encontrar aproximação do tipo de treinamento se necessário
            const matchEnum = TIPOS_TREINAMENTO_VALIDOS.find(t => t.toLowerCase() === nomeTreinamento.toLowerCase());
            if (matchEnum) {
                nomeTreinamento = matchEnum;
            }

            validos.push({
                matricula,
                nome_colaborador: nomeColaborador,
                funcao,
                nome_treinamento: nomeTreinamento,
                data_realizacao: dataRealizacaoStr,
                data_vencimento: dataVencimentoStr
            });
        });

        if (validos.length === 0) {
            return res.status(422).json({
                success: false,
                message: 'Nenhum registro válido foi encontrado para inserção.',
                total_processados: rawData.length,
                inseridos: 0,
                erros
            });
        }

        // Persistência em Massa Transacional
        let inseridos = 0;
        if (db.pool) {
            // PostgreSQL Transaction
            const client = await db.pool.connect();
            try {
                await client.query('BEGIN');
                for (const item of validos) {
                    await client.query(
                        `INSERT INTO treinamentos (matricula, nome, funcao, nome_treinamento, data_realizacao, data_vencimento)
                         VALUES ($1, $2, $3, $4, $5, $6)`,
                        [item.matricula, item.nome_colaborador, item.funcao, item.nome_treinamento, item.data_realizacao, item.data_vencimento]
                    );
                    inseridos++;
                }
                await client.query('COMMIT');
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        } else {
            // SQLite Batch Loop
            await db.runAsync('BEGIN TRANSACTION');
            try {
                for (const item of validos) {
                    await db.runAsync(
                        `INSERT INTO treinamentos (matricula, nome, funcao, nome_treinamento, data_realizacao, data_vencimento)
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        [item.matricula, item.nome_colaborador, item.funcao, item.nome_treinamento, item.data_realizacao, item.data_vencimento]
                    );
                    inseridos++;
                }
                await db.runAsync('COMMIT');
            } catch (err) {
                await db.runAsync('ROLLBACK');
                throw err;
            }
        }

        return res.status(200).json({
            success: true,
            message: `${inseridos} treinamento(s) importados com sucesso.`,
            total_processados: rawData.length,
            inseridos,
            erros
        });

    } catch (err) {
        console.error('[ERRO IMPORTAÇÃO]:', err);
        return res.status(500).json({ error: 'Erro interno ao processar a importação da planilha.' });
    }
});

// GET /api/treinamentos (com paginação e busca)
router.get('/', requireAuth, async (req, res) => {
    const { perfil, matricula: matLogado } = req.session.usuario || {};
    const matFilter  = req.query.matricula;
    const busca      = req.query.busca     || '';
    const situFilter = req.query.situacao  || '';
    const page       = Math.max(1, parseInt(req.query.page)  || 1);
    const limit      = Math.min(200, parseInt(req.query.limit) || 50);
    const offset     = (page - 1) * limit;

    // Expressão de situação compatível com SQLite e PostgreSQL
    const isPostgres = !!db.pool;
    const situacaoExpr = isPostgres
        ? `CASE
            WHEN t.data_vencimento::date < CURRENT_DATE THEN 'vencido'
            WHEN t.data_vencimento::date <= CURRENT_DATE + INTERVAL '30 days' THEN 'alerta'
            ELSE 'ok'
           END AS situacao`
        : `CASE
            WHEN date(t.data_vencimento) < date('now','localtime') THEN 'vencido'
            WHEN date(t.data_vencimento) <= date('now','localtime','+30 days') THEN 'alerta'
            ELSE 'ok'
           END AS situacao`;

    // Determina se é admin/master (acesso total)
    const isAdmin = (perfil === 'adm' || perfil === 'master');

    try {
        const conditions = [];
        const params     = [];
        let   paramIdx   = 1; // Para PostgreSQL ($1, $2...)

        // Filtro por matrícula
        const matTarget = matFilter || (!isAdmin ? matLogado : null);
        if (matTarget) {
            conditions.push(isPostgres ? `t.matricula = $${paramIdx++}` : `t.matricula = ?`);
            params.push(matTarget);
        }

        // Busca textual
        if (busca) {
            const like = `%${busca}%`;
            if (isPostgres) {
                conditions.push(`(t.nome ILIKE $${paramIdx} OR t.nome_treinamento ILIKE $${paramIdx + 1} OR t.matricula ILIKE $${paramIdx + 2})`);
                paramIdx += 3;
            } else {
                conditions.push(`(t.nome LIKE ? OR t.nome_treinamento LIKE ? OR t.matricula LIKE ?)`);
            }
            params.push(like, like, like);
        }

        // Filtro de situação
        if (situFilter) {
            const situSQL = isPostgres
                ? `CASE WHEN t.data_vencimento::date < CURRENT_DATE THEN 'vencido' WHEN t.data_vencimento::date <= CURRENT_DATE + INTERVAL '30 days' THEN 'alerta' ELSE 'ok' END`
                : `CASE WHEN date(t.data_vencimento) < date('now','localtime') THEN 'vencido' WHEN date(t.data_vencimento) <= date('now','localtime','+30 days') THEN 'alerta' ELSE 'ok' END`;
            conditions.push(isPostgres ? `(${situSQL}) = $${paramIdx++}` : `(${situSQL}) = ?`);
            params.push(situFilter);
        }

        const whereSQL = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        // Conta total para paginação
        const countSQL = `SELECT COUNT(*) AS total FROM treinamentos t ${whereSQL}`;
        const countRow = await db.allAsync(countSQL, params);
        const total    = parseInt((countRow[0] || {}).total || (countRow[0] || {}).count || 0);

        // Query principal com LIMIT/OFFSET
        const limitClause = isPostgres
            ? `LIMIT $${paramIdx++} OFFSET $${paramIdx++}`
            : `LIMIT ? OFFSET ?`;
        const dataSQL = `SELECT t.*, ${situacaoExpr} FROM treinamentos t ${whereSQL} ORDER BY t.data_vencimento ASC ${limitClause}`;
        const rows    = await db.allAsync(dataSQL, [...params, limit, offset]);

        // Normaliza campo: retorna sempre nome_colaborador para o frontend
        const normalized = rows.map(r => ({ ...r, nome_colaborador: r.nome_colaborador || r.nome }));

        res.json({
            data:  normalized,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit)
        });
    } catch(err) {
        console.error('[ERRO GET TREINAMENTOS]:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/treinamentos
router.post('/', requireAuth, async (req, res) => {
    const { matricula, nome, nome_colaborador, funcao, nome_treinamento, data_realizacao, data_vencimento } = req.body;
    const nomeFinal = nome_colaborador || nome;
    if (!matricula || !nomeFinal || !nome_treinamento)
        return res.status(400).json({ error: 'Campos obrigatórios: matricula, nome_colaborador, nome_treinamento.' });
    try {
        // Usa coluna 'nome' (nome real da coluna na tabela)
        const result = await db.runAsync(
            `INSERT INTO treinamentos (matricula, nome, funcao, nome_treinamento, data_realizacao, data_vencimento)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [matricula, nomeFinal, funcao||null, nome_treinamento, data_realizacao||null, data_vencimento||null]
        );
        res.status(201).json({ id: result.lastID || result.rows?.[0]?.id, message: 'Treinamento registrado.' });
    } catch(err) {
        console.error('[ERRO POST TREINAMENTO]:', err);
        res.status(500).json({ error: err.message });
    }
});

// ──────────────────────────────────────────────────────
//  GERAÇÃO DE CERTIFICADOS PDF (Individual e Lote/ZIP)
// ──────────────────────────────────────────────────────

// Helper: formatar data BR
function formatDateBR(dateStr) {
    if (!dateStr) return '—';
    const [y, m, d] = String(dateStr).split('-');
    return `${d}/${m}/${y}`;
}

// Helper: gerar um PDF de certificado em buffer (retorna Promise<Buffer>)
function gerarCertificadoPDF(registro) {
    return new Promise((resolve, reject) => {
        const buffers = [];
        const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });

        doc.on('data', chunk => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        const pageW = doc.page.width;
        const pageH = doc.page.height;
        const margin = 40;
        const contentW = pageW - margin * 2;

        // ── Bordas decorativas ──
        doc.lineWidth(3).strokeColor('#4f46e5')
           .rect(20, 20, pageW - 40, pageH - 40).stroke();
        doc.lineWidth(1).strokeColor('#818cf8')
           .rect(28, 28, pageW - 56, pageH - 56).stroke();

        // ── Cabeçalho ──
        doc.fontSize(11).fillColor('#64748b')
           .text('OMEGA SAFETY 2.0 — Sistema de Gestão de Segurança do Trabalho', margin, 45, { align: 'center', width: contentW });

        doc.moveDown(0.5);
        doc.fontSize(28).fillColor('#1e293b')
           .text('CERTIFICADO DE TREINAMENTO', margin, 75, { align: 'center', width: contentW });

        doc.moveDown(0.3);
        doc.lineWidth(2).strokeColor('#4f46e5')
           .moveTo(pageW / 2 - 120, 115).lineTo(pageW / 2 + 120, 115).stroke();

        // ── Corpo principal ──
        const nomeColab = registro.nome_colaborador || registro.nome || 'Colaborador';
        doc.moveDown(2);
        doc.fontSize(12).fillColor('#475569')
           .text('Certificamos que o(a) colaborador(a)', margin, 145, { align: 'center', width: contentW });

        doc.moveDown(0.6);
        doc.fontSize(24).fillColor('#1e293b')
           .text(nomeColab.toUpperCase(), margin, 170, { align: 'center', width: contentW });

        doc.moveDown(1);
        doc.fontSize(12).fillColor('#475569')
           .text(`Matrícula: ${registro.matricula}    |    Função: ${registro.funcao || 'N/A'}`, margin, 210, { align: 'center', width: contentW });

        doc.moveDown(1.5);
        doc.fontSize(12).fillColor('#475569')
           .text('concluiu com aproveitamento o treinamento de segurança:', margin, 245, { align: 'center', width: contentW });

        doc.moveDown(0.8);
        doc.fontSize(18).fillColor('#4f46e5')
           .text(registro.nome_treinamento, margin, 275, { align: 'center', width: contentW });

        // ── Grid de informações ──
        const gridY = 325;
        const col1X = margin + 100;
        const col2X = pageW / 2 + 40;

        doc.fontSize(10).fillColor('#94a3b8').text('DATA DE REALIZAÇÃO', col1X, gridY);
        doc.fontSize(14).fillColor('#1e293b').text(formatDateBR(registro.data_realizacao), col1X, gridY + 18);

        doc.fontSize(10).fillColor('#94a3b8').text('DATA DE VENCIMENTO', col2X, gridY);
        doc.fontSize(14).fillColor('#1e293b').text(formatDateBR(registro.data_vencimento), col2X, gridY + 18);

        // ── Linhas de assinatura ──
        const sigY = 420;
        doc.lineWidth(0.5).strokeColor('#cbd5e1');

        // Assinatura 1
        doc.moveTo(margin + 60, sigY).lineTo(margin + 300, sigY).stroke();
        doc.fontSize(9).fillColor('#64748b')
           .text('Instrutor / Responsável Técnico', margin + 60, sigY + 6, { width: 240, align: 'center' });

        // Assinatura 2
        doc.moveTo(pageW - margin - 300, sigY).lineTo(pageW - margin - 60, sigY).stroke();
        doc.fontSize(9).fillColor('#64748b')
           .text('Coordenador de Segurança do Trabalho', pageW - margin - 300, sigY + 6, { width: 240, align: 'center' });

        // ── Rodapé ──
        doc.fontSize(8).fillColor('#94a3b8')
           .text(`Documento gerado automaticamente pelo Omega Safety 2.0 em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}. Registro ID: ${registro.id}`,
                  margin, pageH - 55, { align: 'center', width: contentW });

        doc.end();
    });
}

// POST /api/treinamentos/certificados-lote
router.post('/certificados-lote', requireAuth, async (req, res) => {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Informe um array de IDs de treinamentos.' });
    }

    try {
        // Buscar registros
        const placeholders = ids.map((_, i) => `?`).join(',');
        const rows = await db.allAsync(
            `SELECT * FROM treinamentos WHERE id IN (${placeholders})`,
            ids
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Nenhum registro encontrado para os IDs informados.' });
        }

        // Caso único: retornar PDF diretamente
        if (rows.length === 1) {
            const pdfBuffer = await gerarCertificadoPDF(rows[0]);
            const nomeArq = `certificado_${rows[0].matricula}_${rows[0].id}.pdf`;
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${nomeArq}"`);
            return res.send(pdfBuffer);
        }

        // Caso múltiplo: compactar em ZIP via streaming
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename="certificados_treinamentos.zip"');

        const archive = archiver('zip', { zlib: { level: 6 } });
        archive.on('error', err => { throw err; });
        archive.pipe(res);

        for (const registro of rows) {
            const pdfBuffer = await gerarCertificadoPDF(registro);
            const nomeArq = `certificado_${registro.matricula}_${registro.id}.pdf`;
            archive.append(pdfBuffer, { name: nomeArq });
        }

        await archive.finalize();
    } catch (err) {
        console.error('[ERRO CERTIFICADOS-LOTE]:', err);
        if (!res.headersSent) {
            return res.status(500).json({ error: 'Erro ao gerar certificados.' });
        }
    }
});

// ──────────────────────────────────────────────────────
//  EXCLUSÃO EM LOTE (Transacional)
// ──────────────────────────────────────────────────────

// DELETE /api/treinamentos/lote
router.delete('/lote', requireAuth, async (req, res) => {
    if (req.session.usuario.perfil !== 'adm') {
        return res.status(403).json({ error: 'Acesso negado. Apenas administradores podem excluir em lote.' });
    }

    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Informe um array de IDs para exclusão.' });
    }

    try {
        let removidos = 0;

        if (db.pool) {
            // PostgreSQL: DELETE ... WHERE id = ANY($1::int[])
            const client = await db.pool.connect();
            try {
                await client.query('BEGIN');
                const result = await client.query(
                    `DELETE FROM treinamentos WHERE id = ANY($1::int[])`,
                    [ids]
                );
                removidos = result.rowCount;
                await client.query('COMMIT');
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        } else {
            // SQLite: DELETE com IN (?)
            const placeholders = ids.map(() => '?').join(',');
            await db.runAsync('BEGIN TRANSACTION');
            try {
                const result = await db.runAsync(
                    `DELETE FROM treinamentos WHERE id IN (${placeholders})`,
                    ids
                );
                removidos = result.changes || ids.length;
                await db.runAsync('COMMIT');
            } catch (err) {
                await db.runAsync('ROLLBACK');
                throw err;
            }
        }

        return res.json({
            success: true,
            message: `${removidos} treinamento(s) excluído(s) com sucesso.`,
            removidos
        });
    } catch (err) {
        console.error('[ERRO EXCLUSÃO LOTE]:', err);
        return res.status(500).json({ error: 'Erro ao excluir registros em lote.' });
    }
});

// DELETE /api/treinamentos/:id
router.delete('/:id', requireAuth, async (req, res) => {
    if (req.session.usuario.perfil !== 'adm') return res.status(403).json({ error: 'Acesso negado.' });
    await db.runAsync('DELETE FROM treinamentos WHERE id = ?', [req.params.id]);
    res.json({ message: 'Treinamento removido.' });
});

module.exports = router;
