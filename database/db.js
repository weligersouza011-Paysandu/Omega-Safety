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
    await db.execAsync(sql);
    
    // Migrações automáticas seguras (ignora o erro se a coluna já existir)
    try { await db.execAsync('ALTER TABLE usuarios ADD COLUMN contrato TEXT'); } catch(e){}
    try { await db.execAsync('ALTER TABLE usuarios ADD COLUMN foto_perfil TEXT'); } catch(e){}
    try { await db.execAsync('ALTER TABLE usuarios ADD COLUMN is_lideranca INTEGER DEFAULT 0'); } catch(e){}
    try { await db.execAsync('ALTER TABLE usuarios ADD COLUMN is_master INTEGER DEFAULT 0'); } catch(e){}
    
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
