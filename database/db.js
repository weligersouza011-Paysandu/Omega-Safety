// database/db.js — Inicialização e conexão do SQLite (usando sqlite3 com prebuilt binaries)
const sqlite3 = require('sqlite3').verbose();
const path    = require('path');
const fs      = require('fs');
const bcrypt  = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'omega_safety.db');

// ────────────────────────────────────────────────
//  Cria a conexão
// ────────────────────────────────────────────────
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) { console.error('[DB] Erro ao abrir banco:', err.message); process.exit(1); }
    console.log('[DB] Conectado ao SQLite em', DB_PATH);
});

// ────────────────────────────────────────────────
//  Helper: promisify db.run, db.get, db.all
// ────────────────────────────────────────────────
db.runAsync  = (sql, params=[]) => new Promise((res,rej) =>
    db.run(sql, params, function(err){ err ? rej(err) : res(this); }));

db.getAsync  = (sql, params=[]) => new Promise((res,rej) =>
    db.get(sql, params, (err,row) => err ? rej(err) : res(row)));

db.allAsync  = (sql, params=[]) => new Promise((res,rej) =>
    db.all(sql, params, (err,rows) => err ? rej(err) : res(rows)));

db.execAsync = (sql) => new Promise((res,rej) =>
    db.exec(sql, (err) => err ? rej(err) : res()));

// ────────────────────────────────────────────────
//  Inicialização do Schema + Seed
// ────────────────────────────────────────────────
async function initDB() {
    // WAL mode e foreign keys
    await db.runAsync('PRAGMA journal_mode=WAL');
    await db.runAsync('PRAGMA foreign_keys=ON');

    // Schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');
    await db.execAsync(sql); // Cria todas as tabelas (incluindo VPS se não existir)
    
    // Migrações automáticas seguras (ignora o erro se a coluna já existir)
    try { await db.execAsync('ALTER TABLE usuarios ADD COLUMN contrato TEXT'); } catch(e){}
    try { await db.execAsync('ALTER TABLE usuarios ADD COLUMN foto_perfil TEXT'); } catch(e){}
    try { await db.execAsync('ALTER TABLE usuarios ADD COLUMN is_lideranca INTEGER DEFAULT 0'); } catch(e){}
    try { await db.execAsync('ALTER TABLE usuarios ADD COLUMN is_master INTEGER DEFAULT 0'); } catch(e){}
    try { await db.execAsync('ALTER TABLE vps_canteiros ADD COLUMN contrato TEXT'); } catch(e){}

    // Garantir que as colunas de lixeira existem na tabela cadernos_inspecao
    const cadernoCols = await db.allAsync("PRAGMA table_info(cadernos_inspecao)");
    const hasExcluidoEm  = cadernoCols.some(c => c.name === 'excluido_em');
    const hasExcluidoPor = cadernoCols.some(c => c.name === 'excluido_por');
    if (!hasExcluidoEm) {
        try { await db.execAsync("ALTER TABLE cadernos_inspecao ADD COLUMN excluido_em DATETIME"); } catch(e){}
        console.log('[DB] Coluna excluido_em adicionada.');
    }
    if (!hasExcluidoPor) {
        try { await db.execAsync("ALTER TABLE cadernos_inspecao ADD COLUMN excluido_por TEXT"); } catch(e){}
        console.log('[DB] Coluna excluido_por adicionada.');
    }
    if (!cadernoCols.some(c => c.name === 'subcategoria')) {
        try { await db.execAsync("ALTER TABLE cadernos_inspecao ADD COLUMN subcategoria TEXT"); } catch(e){}
    }
    if (!cadernoCols.some(c => c.name === 'categoria')) {
        try { await db.execAsync("ALTER TABLE cadernos_inspecao ADD COLUMN categoria TEXT"); } catch(e){}
    }

    // Garantir colunas novas na tabela caderno_respostas
    const respostasCols = await db.allAsync("PRAGMA table_info(caderno_respostas)");
    const respColNames = respostasCols.map(c => c.name);
    if (!respColNames.includes('data_ocorrido'))    { try { await db.execAsync("ALTER TABLE caderno_respostas ADD COLUMN data_ocorrido DATETIME"); } catch(e){} }
    if (!respColNames.includes('contrato'))          { try { await db.execAsync("ALTER TABLE caderno_respostas ADD COLUMN contrato TEXT"); } catch(e){} }
    if (!respColNames.includes('lideranca'))         { try { await db.execAsync("ALTER TABLE caderno_respostas ADD COLUMN lideranca TEXT"); } catch(e){} }
    if (!respColNames.includes('descricao'))         { try { await db.execAsync("ALTER TABLE caderno_respostas ADD COLUMN descricao TEXT"); } catch(e){} }
    if (!respColNames.includes('conclusao_tecnica')) { try { await db.execAsync("ALTER TABLE caderno_respostas ADD COLUMN conclusao_tecnica TEXT"); } catch(e){} }
    if (!respColNames.includes('foto_2_path'))       { try { await db.execAsync("ALTER TABLE caderno_respostas ADD COLUMN foto_2_path TEXT"); } catch(e){} }
    if (!respColNames.includes('foto_3_path'))       { try { await db.execAsync("ALTER TABLE caderno_respostas ADD COLUMN foto_3_path TEXT"); } catch(e){} }
    if (!respColNames.includes('subcategoria'))      { try { await db.execAsync("ALTER TABLE caderno_respostas ADD COLUMN subcategoria TEXT"); } catch(e){} }
    if (!respColNames.includes('categoria'))         { try { await db.execAsync("ALTER TABLE caderno_respostas ADD COLUMN categoria TEXT"); } catch(e){} }
    
    // Migração automática vps_pendencias (Garante que historico_id é NULÁVEL para pendências gerais)
    try {
        const pendCols = await db.allAsync("PRAGMA table_info(vps_pendencias)");
        const histCol = pendCols.find(c => c.name === 'historico_id');
        if (histCol && histCol.notnull === 1) {
            console.log('[DB] Migrando vps_pendencias para tornar historico_id nulável...');
            await db.execAsync('PRAGMA foreign_keys=OFF');
            await db.execAsync(`
                CREATE TABLE IF NOT EXISTS vps_pendencias_new (
                    id            TEXT PRIMARY KEY,
                    historico_id  TEXT,
                    canteiro_id   TEXT NOT NULL,
                    item          TEXT NOT NULL,
                    adequacao     TEXT,
                    responsavel   TEXT,
                    data          DATE,
                    status        TEXT NOT NULL DEFAULT 'Pendente',
                    criado_em     DATETIME DEFAULT (datetime('now','localtime')),
                    FOREIGN KEY (canteiro_id) REFERENCES vps_canteiros(id) ON DELETE CASCADE ON UPDATE CASCADE,
                    FOREIGN KEY (historico_id) REFERENCES vps_historico(id) ON DELETE CASCADE ON UPDATE CASCADE
                );
                INSERT INTO vps_pendencias_new (id, historico_id, canteiro_id, item, adequacao, responsavel, data, status, criado_em)
                SELECT id, NULLIF(historico_id, ''), canteiro_id, item, adequacao, responsavel, data, status, criado_em FROM vps_pendencias;
                DROP TABLE vps_pendencias;
                ALTER TABLE vps_pendencias_new RENAME TO vps_pendencias;
                CREATE INDEX IF NOT EXISTS idx_vps_pendencias_historico ON vps_pendencias(historico_id);
                CREATE INDEX IF NOT EXISTS idx_vps_pendencias_canteiro ON vps_pendencias(canteiro_id);
                CREATE INDEX IF NOT EXISTS idx_vps_pendencias_status ON vps_pendencias(status);
            `);
            await db.execAsync('PRAGMA foreign_keys=ON');
            console.log('[DB] Migração vps_pendencias concluída!');
        }
    } catch(e) {
        console.error('[DB] Erro na migração vps_pendencias:', e);
    }
    
    console.log('[DB] Schema inicializado e migrado.');

    // Atualiza a matrícula 1998 para ser master
    await db.runAsync("UPDATE usuarios SET is_master = 1 WHERE matricula = '1998'");

    // Seed ADM padrão
    const adm = await db.getAsync("SELECT id FROM usuarios WHERE matricula = ?", ['1998']);
    if (!adm) {
        const hash = bcrypt.hashSync('1234', 10);
        await db.runAsync(
            "INSERT INTO usuarios (matricula, nome, funcao, perfil, senha_hash, is_master) VALUES (?,?,?,?,?,?)",
            ['1998', 'Weliger', 'Administrador', 'adm', hash, 1]
        );
        console.log('[DB] ADM padrão criado — matrícula: 1998 / senha: 1234');
    }

    // Seed dados de demonstração
    const trein = await db.getAsync("SELECT id FROM treinamentos LIMIT 1");
    if (!trein) {
        const opExists = await db.getAsync("SELECT id FROM usuarios WHERE matricula = ?", ['16317']);
        if (!opExists) {
            await db.runAsync(
                "INSERT INTO usuarios (matricula, nome, funcao, lideranca, perfil, contrato) VALUES (?,?,?,?,?,?)",
                ['16317', 'Abraão Ferreira Araújo', 'Motorista de Ônibus', 'Transportes', 'operacional', '251']
            );
        }

        const demos = [
            ['16317','Abraão Ferreira Araújo','Motorista de Ônibus','NR-33 Espaços Confinados',  '2025-03-10','2026-03-10'],
            ['16317','Abraão Ferreira Araújo','Motorista de Ônibus','PAEBM — Plano de Emergência','2025-01-15','2026-01-15'],
            ['16317','Abraão Ferreira Araújo','Motorista de Ônibus','Direção Defensiva',          '2024-09-05','2025-09-05'],
            ['16317','Abraão Ferreira Araújo','Motorista de Ônibus','Uso de EPI',                 '2025-06-20','2026-06-20'],
        ];
        for (const d of demos) {
            await db.runAsync(
                "INSERT INTO treinamentos (matricula,nome,funcao,nome_treinamento,data_realizacao,data_vencimento) VALUES (?,?,?,?,?,?)",
                d
            );
        }
        console.log('[DB] Dados de demonstração inseridos.');
    }
}

// Inicializa e exporta
initDB().catch(err => { console.error('[DB] Falha na inicialização:', err); process.exit(1); });

module.exports = db;
