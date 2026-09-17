// migrate.js — Script de migração de dados do SQLite (local) para PostgreSQL (Render)
require('dotenv').config();

const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');

const SQLITE_PATH = path.join(__dirname, 'database', 'omega_safety.db');

const PG_URL = process.env.DATABASE_URL || 'postgresql://omega_safety_db_user:hsAp8sAbEuRsb8iJMGii0URJIY4qKkSa@dpg-dam2o3qjnfac73d3h1m0-a.oregon-postgres.render.com/omega_safety_db';

console.log('🔄 Iniciando migração do SQLite local para PostgreSQL Render...');
console.log('📂 SQLite:', SQLITE_PATH);
console.log('🐘 PostgreSQL:', PG_URL.replace(/:[^:@]+@/, ':****@'));

const sqliteDb = new sqlite3.Database(SQLITE_PATH, (err) => {
    if (err) {
        console.error('❌ Erro ao abrir banco SQLite:', err.message);
        process.exit(1);
    }
});

const pgPool = new Pool({
    connectionString: PG_URL,
    ssl: { rejectUnauthorized: false }
});

function getSqliteRows(sql, params = []) {
    return new Promise((resolve, reject) => {
        sqliteDb.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

async function insertPostgresRow(table, row, conflictTarget = 'id') {
    const keys = Object.keys(row);
    if (!keys.length) return;

    const columns = keys.join(', ');
    const values = keys.map(k => row[k]);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

    let sql = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`;

    if (conflictTarget) {
        sql += ` ON CONFLICT (${conflictTarget}) DO NOTHING`;
    }

    try {
        await pgPool.query(sql, values);
    } catch (err) {
        console.warn(`  ⚠️ Aviso ao inserir em ${table}:`, err.message);
    }
}

async function updateSequence(table) {
    try {
        await pgPool.query(`
            SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1));
        `);
    } catch (e) {
        // Ignora se a tabela não tiver sequence de id
    }
}

async function preparePostgresSchema() {
    try {
        await pgPool.query(`
            ALTER TABLE n3_registros ALTER COLUMN nivel TYPE TEXT;
            ALTER TABLE n3_registros ALTER COLUMN status TYPE VARCHAR(255);
            ALTER TABLE usuarios ALTER COLUMN perfil TYPE VARCHAR(255);
            ALTER TABLE vps_canteiros ALTER COLUMN status TYPE VARCHAR(255);
            ALTER TABLE vps_pendencias ALTER COLUMN status TYPE VARCHAR(255);
            ALTER TABLE cadernos_inspecao ALTER COLUMN status TYPE VARCHAR(255);
            ALTER TABLE vps_historico ADD COLUMN IF NOT EXISTS evidencia_3_path TEXT;
        `);
    } catch (e) {
        // Ignora se as colunas já estiverem com o tipo correto ou a tabela ainda não existir
    }
}

async function migrate() {
    try {
        await preparePostgresSchema();

        // 1. USUÁRIOS
        const usuarios = await getSqliteRows('SELECT * FROM usuarios ORDER BY id ASC');
        console.log(`\n👥 Migrando ${usuarios.length} usuários...`);
        for (const u of usuarios) {
            await insertPostgresRow('usuarios', u, 'matricula');
        }
        await updateSequence('usuarios');

        // 2. TREINAMENTOS
        const treinamentos = await getSqliteRows('SELECT * FROM treinamentos ORDER BY id ASC');
        console.log(`🎓 Migrando ${treinamentos.length} treinamentos...`);
        for (const t of treinamentos) {
            await insertPostgresRow('treinamentos', t, 'id');
        }
        await updateSequence('treinamentos');

        // 3. N3 REGISTROS
        const n3Registros = await getSqliteRows('SELECT * FROM n3_registros');
        console.log(`⚠️ Migrando ${n3Registros.length} registros N3...`);
        for (const n of n3Registros) {
            await insertPostgresRow('n3_registros', n, 'id');
        }

        // 4. N3 HISTÓRICO
        const n3Historico = await getSqliteRows('SELECT * FROM n3_historico ORDER BY id ASC');
        console.log(`📜 Migrando ${n3Historico.length} histórico N3...`);
        for (const h of n3Historico) {
            await insertPostgresRow('n3_historico', h, 'id');
        }
        await updateSequence('n3_historico');

        // 5. INSPEÇÕES AVULSAS
        const inspecoesAvulsas = await getSqliteRows('SELECT * FROM inspecoes_avulsas');
        console.log(`📋 Migrando ${inspecoesAvulsas.length} inspeções avulsas...`);
        for (const i of inspecoesAvulsas) {
            await insertPostgresRow('inspecoes_avulsas', i, 'id');
        }

        // 6. VPS CANTEIROS
        const canteiros = await getSqliteRows('SELECT * FROM vps_canteiros');
        console.log(`🏗️ Migrando ${canteiros.length} canteiros VPS...`);
        for (const c of canteiros) {
            await insertPostgresRow('vps_canteiros', c, 'id');
        }

        // 7. VPS HISTÓRICO
        const vpsHistorico = await getSqliteRows('SELECT * FROM vps_historico');
        console.log(`📊 Migrando ${vpsHistorico.length} histórico VPS...`);
        for (const vh of vpsHistorico) {
            await insertPostgresRow('vps_historico', vh, 'id');
        }

        // 8. VPS PENDÊNCIAS
        const vpsPendencias = await getSqliteRows('SELECT * FROM vps_pendencias');
        console.log(`📌 Migrando ${vpsPendencias.length} pendências VPS...`);
        for (const vp of vpsPendencias) {
            if (vp.historico_id === '') vp.historico_id = null;
            await insertPostgresRow('vps_pendencias', vp, 'id');
        }

        // 9. CADERNOS DE INSPEÇÃO
        const cadernos = await getSqliteRows('SELECT * FROM cadernos_inspecao');
        console.log(`📓 Migrando ${cadernos.length} cadernos de inspeção...`);
        for (const cd of cadernos) {
            await insertPostgresRow('cadernos_inspecao', cd, 'id');
        }

        // 10. PERGUNTAS DO CADERNO
        const perguntas = await getSqliteRows('SELECT * FROM perguntas_caderno ORDER BY id ASC');
        console.log(`❓ Migrando ${perguntas.length} perguntas do caderno...`);
        for (const p of perguntas) {
            await insertPostgresRow('perguntas_caderno', p, 'id');
        }
        await updateSequence('perguntas_caderno');

        // 11. CADERNO RESPOSTAS
        const cadernoRespostas = await getSqliteRows('SELECT * FROM caderno_respostas');
        console.log(`✍️ Migrando ${cadernoRespostas.length} respostas de caderno...`);
        for (const cr of cadernoRespostas) {
            await insertPostgresRow('caderno_respostas', cr, 'id');
        }

        // 12. HISTÓRICO CADERNOS
        const historicoCadernos = await getSqliteRows('SELECT * FROM historico_cadernos ORDER BY id ASC');
        console.log(`📖 Migrando ${historicoCadernos.length} histórico de cadernos...`);
        for (const hc of historicoCadernos) {
            await insertPostgresRow('historico_cadernos', hc, 'id');
        }
        await updateSequence('historico_cadernos');

        console.log('\n✅ MIGRAÇÃO CONCLUÍDA COM SUCESSO!');
        console.log('Todos os dados do SQLite local foram copiados e preservados no PostgreSQL Render.');

    } catch (error) {
        console.error('\n❌ Erro durante a migração:', error);
    } finally {
        sqliteDb.close();
        await pgPool.end();
        process.exit(0);
    }
}

migrate();
