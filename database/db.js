// database/db.js — Suporte dual: PostgreSQL (Render/Produção) / SQLite (Desenvolvimento Local)
const path   = require('path');
const fs     = require('fs');
const bcrypt = require('bcryptjs');

let db = {};
const isPostgres = !!process.env.DATABASE_URL;

function convertPlaceholders(sql) {
    if (typeof sql !== 'string') return sql;
    let index = 1;
    return sql.replace(/\?/g, () => `$${index++}`);
}

if (isPostgres) {
    console.log('[DB] Conectando ao PostgreSQL (DATABASE_URL ativa)...');
    const { Pool } = require('pg');
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    pool.on('error', (err) => {
        console.error('[DB] Erro no pool PostgreSQL:', err);
    });

    db.runAsync = async (sql, params = []) => {
        if (sql.trim().toUpperCase().startsWith('PRAGMA')) return { changes: 0 };
        const converted = convertPlaceholders(sql);
        const res = await pool.query(converted, params);
        return { lastID: res.rows[0]?.id || null, changes: res.rowCount };
    };

    db.getAsync = async (sql, params = []) => {
        if (sql.trim().toUpperCase().startsWith('PRAGMA')) return null;
        const converted = convertPlaceholders(sql);
        const res = await pool.query(converted, params);
        return res.rows[0] || null;
    };

    db.allAsync = async (sql, params = []) => {
        if (sql.trim().toUpperCase().startsWith('PRAGMA')) return [];
        const converted = convertPlaceholders(sql);
        const res = await pool.query(converted, params);
        return res.rows || [];
    };

    db.execAsync = async (sql) => {
        if (sql.trim().toUpperCase().startsWith('PRAGMA')) return;
        return await pool.query(sql);
    };

    db.pool = pool;

} else {
    console.log('[DB] Conectando ao SQLite local...');
    const sqlite3 = require('sqlite3').verbose();
    const DB_PATH = path.join(__dirname, 'omega_safety.db');

    const sqliteDb = new sqlite3.Database(DB_PATH, (err) => {
        if (err) { console.error('[DB] Erro ao abrir SQLite:', err.message); process.exit(1); }
        console.log('[DB] Conectado ao SQLite em', DB_PATH);
    });

    db.runAsync  = (sql, params=[]) => new Promise((res,rej) =>
        sqliteDb.run(sql, params, function(err){ err ? rej(err) : res(this); }));

    db.getAsync  = (sql, params=[]) => new Promise((res,rej) =>
        sqliteDb.get(sql, params, (err,row) => err ? rej(err) : res(row)));

    db.allAsync  = (sql, params=[]) => new Promise((res,rej) =>
        sqliteDb.all(sql, params, (err,rows) => err ? rej(err) : res(rows)));

    db.execAsync = (sql) => new Promise((res,rej) =>
        sqliteDb.exec(sql, (err) => err ? rej(err) : res()));
}

async function initDB() {
    if (isPostgres) {
        console.log('[DB] Criando/verificando estrutura de tabelas PostgreSQL...');
        const postgresSchema = `
        CREATE TABLE IF NOT EXISTS usuarios (
            id            SERIAL PRIMARY KEY,
            matricula     VARCHAR(255) NOT NULL UNIQUE,
            nome          VARCHAR(255) NOT NULL,
            funcao        VARCHAR(255),
            lideranca     VARCHAR(255),
            perfil        VARCHAR(50) NOT NULL DEFAULT 'operacional',
            contrato      VARCHAR(255),
            foto_perfil   TEXT,
            senha_hash    TEXT,
            ativo         INTEGER NOT NULL DEFAULT 1,
            is_lideranca  INTEGER DEFAULT 0,
            is_master     INTEGER DEFAULT 0,
            criado_em     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS treinamentos (
            id                SERIAL PRIMARY KEY,
            matricula         VARCHAR(255) NOT NULL,
            nome              VARCHAR(255) NOT NULL,
            funcao            VARCHAR(255),
            nome_treinamento  VARCHAR(255) NOT NULL,
            data_realizacao   DATE,
            data_vencimento   DATE,
            criado_em         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (matricula) REFERENCES usuarios(matricula) ON UPDATE CASCADE ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS n3_registros (
            id                     VARCHAR(255) PRIMARY KEY,
            data                   DATE DEFAULT CURRENT_DATE,
            matricula_observador   VARCHAR(255) NOT NULL,
            nome_observador        VARCHAR(255) NOT NULL,
            lideranca              VARCHAR(255) NOT NULL,
            nivel                  VARCHAR(50),
            local_ss               VARCHAR(255) NOT NULL,
            descricao_situacao     TEXT NOT NULL,
            categoria              VARCHAR(255),
            subcategoria           VARCHAR(255),
            tag                    VARCHAR(255),
            plano_acao             TEXT,
            empresa_responsavel    VARCHAR(255),
            lideranca_responsavel  VARCHAR(255),
            prazo_vencimento       DATE,
            status                 VARCHAR(50) DEFAULT 'Em Análise',
            evidencia_1_path       TEXT,
            evidencia_2_path       TEXT,
            observacoes_adm        TEXT,
            validado_por           VARCHAR(255),
            validado_em            TIMESTAMP,
            criado_em              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS inspecoes_avulsas (
            id                VARCHAR(255) PRIMARY KEY,
            data_inspecao     DATE DEFAULT CURRENT_DATE,
            matricula         VARCHAR(255) NOT NULL,
            nome_inspetor     VARCHAR(255) NOT NULL,
            funcao            VARCHAR(255),
            lideranca         VARCHAR(255),
            local             VARCHAR(255),
            categoria         VARCHAR(255),
            subcategoria      VARCHAR(255),
            placa_veiculo     VARCHAR(255),
            tag               VARCHAR(255),
            tipo_veiculo      VARCHAR(255),
            descricao         TEXT,
            conclusao_tecnica TEXT,
            card_inspecao     VARCHAR(255),
            plano_acao        TEXT,
            prazo             DATE,
            foto_path         TEXT,
            criado_em         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS vps_canteiros (
            id            VARCHAR(255) PRIMARY KEY,
            nome          VARCHAR(255) NOT NULL,
            contrato      VARCHAR(255),
            status        VARCHAR(50) DEFAULT 'Em andamento',
            maturidade    INTEGER DEFAULT 1,
            capa_1_path   TEXT,
            capa_2_path   TEXT,
            criado_em     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS vps_historico (
            id               VARCHAR(255) PRIMARY KEY,
            canteiro_id      VARCHAR(255) NOT NULL,
            id_inspecao      VARCHAR(255),
            data_registro    DATE DEFAULT CURRENT_DATE,
            categoria        VARCHAR(255) NOT NULL,
            tipo_card        VARCHAR(255) NOT NULL,
            descricao        TEXT,
            evidencia_1_path TEXT,
            evidencia_2_path TEXT,
            anexo_path       TEXT,
            criado_por       VARCHAR(255),
            criado_em        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (canteiro_id) REFERENCES vps_canteiros(id) ON DELETE CASCADE ON UPDATE CASCADE
        );

        CREATE TABLE IF NOT EXISTS vps_pendencias (
            id            VARCHAR(255) PRIMARY KEY,
            historico_id  VARCHAR(255),
            canteiro_id   VARCHAR(255) NOT NULL,
            item          TEXT NOT NULL,
            adequacao     TEXT,
            responsavel   VARCHAR(255),
            data          DATE,
            status        VARCHAR(50) DEFAULT 'Pendente',
            criado_em     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (canteiro_id) REFERENCES vps_canteiros(id) ON DELETE CASCADE ON UPDATE CASCADE
        );

        CREATE TABLE IF NOT EXISTS n3_historico (
            id               SERIAL PRIMARY KEY,
            n3_id            VARCHAR(255) NOT NULL,
            data_hora        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            usuario_nome     VARCHAR(255) NOT NULL,
            detalhes         TEXT NOT NULL,
            FOREIGN KEY (n3_id) REFERENCES n3_registros(id) ON DELETE CASCADE ON UPDATE CASCADE
        );

        CREATE TABLE IF NOT EXISTS cadernos_inspecao (
            id              VARCHAR(255) PRIMARY KEY,
            nome            VARCHAR(255) NOT NULL,
            contrato        VARCHAR(255),
            subcategoria    VARCHAR(255),
            categoria       VARCHAR(255),
            status          VARCHAR(50) DEFAULT 'ativo',
            criado_por      VARCHAR(255),
            atualizado_por  VARCHAR(255),
            excluido_em     TIMESTAMP,
            excluido_por    VARCHAR(255),
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at      TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS perguntas_caderno (
            id                      SERIAL PRIMARY KEY,
            caderno_id              VARCHAR(255) NOT NULL,
            texto_pergunta          TEXT NOT NULL,
            eh_critico_interditivo  INTEGER DEFAULT 0,
            ordem                   INTEGER DEFAULT 0,
            criado_em               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (caderno_id) REFERENCES cadernos_inspecao(id) ON DELETE CASCADE ON UPDATE CASCADE
        );

        CREATE TABLE IF NOT EXISTS caderno_respostas (
            id                  VARCHAR(255) PRIMARY KEY,
            caderno_id          VARCHAR(255) NOT NULL,
            matricula           VARCHAR(255) NOT NULL,
            nome_inspetor       VARCHAR(255) NOT NULL,
            data_inspecao       DATE DEFAULT CURRENT_DATE,
            data_ocorrido       TIMESTAMP,
            contrato            VARCHAR(255),
            lideranca           VARCHAR(255),
            local               VARCHAR(255),
            descricao           TEXT,
            conclusao_tecnica   TEXT,
            respostas_json      TEXT NOT NULL,
            observacoes         TEXT,
            foto_path           TEXT,
            foto_2_path         TEXT,
            foto_3_path         TEXT,
            subcategoria        VARCHAR(255),
            categoria           VARCHAR(255),
            criado_em           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (caderno_id) REFERENCES cadernos_inspecao(id) ON DELETE CASCADE ON UPDATE CASCADE
        );

        CREATE TABLE IF NOT EXISTS historico_cadernos (
            id              SERIAL PRIMARY KEY,
            caderno_id      VARCHAR(255) NOT NULL,
            usuario         VARCHAR(255) NOT NULL,
            acao            VARCHAR(255) NOT NULL,
            timestamp       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            detalhes        TEXT,
            FOREIGN KEY (caderno_id) REFERENCES cadernos_inspecao(id) ON DELETE CASCADE ON UPDATE CASCADE
        );
        `;

        await db.execAsync(postgresSchema);

        try { await db.execAsync('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS contrato VARCHAR(255)'); } catch(e){}
        try { await db.execAsync('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto_perfil TEXT'); } catch(e){}
        try { await db.execAsync('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS is_lideranca INTEGER DEFAULT 0'); } catch(e){}
        try { await db.execAsync('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS is_master INTEGER DEFAULT 0'); } catch(e){}
        try { await db.execAsync('ALTER TABLE vps_canteiros ADD COLUMN IF NOT EXISTS contrato VARCHAR(255)'); } catch(e){}

    } else {
        await db.runAsync('PRAGMA journal_mode=WAL');
        await db.runAsync('PRAGMA foreign_keys=ON');

        const schemaPath = path.join(__dirname, 'schema.sql');
        const sql = fs.readFileSync(schemaPath, 'utf8');
        await db.execAsync(sql);

        try { await db.execAsync('ALTER TABLE usuarios ADD COLUMN contrato TEXT'); } catch(e){}
        try { await db.execAsync('ALTER TABLE usuarios ADD COLUMN foto_perfil TEXT'); } catch(e){}
        try { await db.execAsync('ALTER TABLE usuarios ADD COLUMN is_lideranca INTEGER DEFAULT 0'); } catch(e){}
        try { await db.execAsync('ALTER TABLE usuarios ADD COLUMN is_master INTEGER DEFAULT 0'); } catch(e){}
        try { await db.execAsync('ALTER TABLE vps_canteiros ADD COLUMN contrato TEXT'); } catch(e){}

        try {
            const pendCols = await db.allAsync("PRAGMA table_info(vps_pendencias)");
            const histCol = pendCols.find(c => c.name === 'historico_id');
            if (histCol && histCol.notnull === 1) {
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
                `);
                await db.execAsync('PRAGMA foreign_keys=ON');
            }
        } catch(e){}
    }

    console.log('[DB] Schema de tabelas inicializado e pronto.');

    const adm = await db.getAsync("SELECT id FROM usuarios WHERE matricula = ?", ['1998']);
    if (!adm) {
        const hash = bcrypt.hashSync('1234', 10);
        await db.runAsync(
            "INSERT INTO usuarios (matricula, nome, funcao, perfil, senha_hash, is_master) VALUES (?,?,?,?,?,?)",
            ['1998', 'Weliger', 'Administrador', 'adm', hash, 1]
        );
        console.log('[DB] ADM padrão criado — matrícula: 1998 / senha: 1234');
    } else {
        await db.runAsync("UPDATE usuarios SET is_master = 1 WHERE matricula = '1998'");
    }

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

initDB().catch(err => { console.error('[DB] Falha na inicialização:', err); process.exit(1); });

module.exports = db;
