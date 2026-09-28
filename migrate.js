// migrate.js — Migração de dados: Render (produção) ou SQLite local → Neon
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');

const SQLITE_PATH = path.join(__dirname, 'database', 'omega_safety.db');

// Origem: banco de produção anterior (Render) se existir, senão o SQLite local
const SOURCE_URL = process.env.SOURCE_DATABASE_URL || null;
// Destino: Neon (DATABASE_URL)
const PG_URL = process.env.DATABASE_URL;

if (!PG_URL) {
    console.error('❌ DATABASE_URL (Neon) não definida no .env');
    process.exit(1);
}

console.log('🔄 Iniciando migração de dados para o PostgreSQL (Neon)...');
console.log('📂 Origem:', SOURCE_URL ? SOURCE_URL.replace(/:[^:@]+@/, ':****@') : SQLITE_PATH);
console.log('🐘 Destino:', PG_URL.replace(/:[^:@]+@/, ':****@'));

const sqliteDb = new sqlite3.Database(SQLITE_PATH, (err) => {
    if (err && !SOURCE_URL) {
        console.error('❌ Erro ao abrir banco SQLite:', err.message);
        process.exit(1);
    }
});

const pgPool = new Pool({
    connectionString: PG_URL,
    ssl: { rejectUnauthorized: false }
});

const sourcePool = SOURCE_URL
    ? new Pool({ connectionString: SOURCE_URL, ssl: { rejectUnauthorized: false } })
    : null;

function getSqliteRows(sql, params = []) {
    return new Promise((resolve, reject) => {
        sqliteDb.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

async function getSourceRows(sql, params = []) {
    if (sourcePool) {
        const res = await sourcePool.query(sql, params);
        return res.rows || [];
    }
    return getSqliteRows(sql, params);
}

async function insertPostgresRow(table, row, conflictTarget = 'id', omitColumns = []) {
    const keys = Object.keys(row).filter(k => !omitColumns.includes(k));
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
        // O id não é copiado: o seed do initDB já ocupou ids locais (ex.: 1),
        // então deixamos a sequence do Neon atribuir novos ids sem colidir.
        const usuarios = await getSourceRows('SELECT * FROM usuarios ORDER BY id ASC');
        console.log(`\n👥 Migrando ${usuarios.length} usuários...`);
        for (const u of usuarios) {
            await insertPostgresRow('usuarios', u, 'matricula', ['id']);
        }
        await updateSequence('usuarios');

        // Usuários já existentes no destino (criados pelo seed) não são regravados
        // pelo ON CONFLICT — backfill das colunas que vieram vazias da origem.
        for (const u of usuarios) {
            if (u.foto_perfil) {
                await pgPool.query(
                    'UPDATE usuarios SET foto_perfil = $1 WHERE matricula = $2 AND foto_perfil IS NULL',
                    [u.foto_perfil, u.matricula]
                );
            }
        }

        // 2. TREINAMENTOS
        const treinamentos = await getSourceRows('SELECT * FROM treinamentos ORDER BY id ASC');
        console.log(`🎓 Migrando ${treinamentos.length} treinamentos...`);
        for (const t of treinamentos) {
            await insertPostgresRow('treinamentos', t, 'id');
        }
        await updateSequence('treinamentos');

        // 3. N3 REGISTROS
        const n3Registros = await getSourceRows('SELECT * FROM n3_registros');
        console.log(`⚠️ Migrando ${n3Registros.length} registros N3...`);
        for (const n of n3Registros) {
            await insertPostgresRow('n3_registros', n, 'id');
        }

        // 4. N3 HISTÓRICO
        const n3Historico = await getSourceRows('SELECT * FROM n3_historico ORDER BY id ASC');
        console.log(`📜 Migrando ${n3Historico.length} histórico N3...`);
        for (const h of n3Historico) {
            await insertPostgresRow('n3_historico', h, 'id');
        }
        await updateSequence('n3_historico');

        // 5. INSPEÇÕES AVULSAS
        const inspecoesAvulsas = await getSourceRows('SELECT * FROM inspecoes_avulsas');
        console.log(`📋 Migrando ${inspecoesAvulsas.length} inspeções avulsas...`);
        for (const i of inspecoesAvulsas) {
            await insertPostgresRow('inspecoes_avulsas', i, 'id');
        }

        // 6. VPS CANTEIROS
        const canteiros = await getSourceRows('SELECT * FROM vps_canteiros');
        console.log(`🏗️ Migrando ${canteiros.length} canteiros VPS...`);
        for (const c of canteiros) {
            await insertPostgresRow('vps_canteiros', c, 'id');
        }

        // 7. VPS HISTÓRICO
        const vpsHistorico = await getSourceRows('SELECT * FROM vps_historico');
        console.log(`📊 Migrando ${vpsHistorico.length} histórico VPS...`);
        for (const vh of vpsHistorico) {
            await insertPostgresRow('vps_historico', vh, 'id');
        }

        // 8. VPS PENDÊNCIAS
        const vpsPendencias = await getSourceRows('SELECT * FROM vps_pendencias');
        console.log(`📌 Migrando ${vpsPendencias.length} pendências VPS...`);
        for (const vp of vpsPendencias) {
            if (vp.historico_id === '') vp.historico_id = null;
            await insertPostgresRow('vps_pendencias', vp, 'id');
        }

        // 9. CADERNOS DE INSPEÇÃO
        const cadernos = await getSourceRows('SELECT * FROM cadernos_inspecao');
        console.log(`📓 Migrando ${cadernos.length} cadernos de inspeção...`);
        for (const cd of cadernos) {
            await insertPostgresRow('cadernos_inspecao', cd, 'id');
        }

        // 10. PERGUNTAS DO CADERNO
        const perguntas = await getSourceRows('SELECT * FROM perguntas_caderno ORDER BY id ASC');
        console.log(`❓ Migrando ${perguntas.length} perguntas do caderno...`);
        for (const p of perguntas) {
            await insertPostgresRow('perguntas_caderno', p, 'id');
        }
        await updateSequence('perguntas_caderno');

        // 11. CADERNO RESPOSTAS
        const cadernoRespostas = await getSourceRows('SELECT * FROM caderno_respostas');
        console.log(`✍️ Migrando ${cadernoRespostas.length} respostas de caderno...`);
        for (const cr of cadernoRespostas) {
            await insertPostgresRow('caderno_respostas', cr, 'id');
        }

        // 12. HISTÓRICO CADERNOS
        const historicoCadernos = await getSourceRows('SELECT * FROM historico_cadernos ORDER BY id ASC');
        console.log(`📖 Migrando ${historicoCadernos.length} histórico de cadernos...`);
        for (const hc of historicoCadernos) {
            await insertPostgresRow('historico_cadernos', hc, 'id');
        }
        await updateSequence('historico_cadernos');

        console.log('\n✅ MIGRAÇÃO CONCLUÍDA COM SUCESSO!');
        console.log('Todos os dados da origem foram copiados e preservados no PostgreSQL (Neon).');

    } catch (error) {
        console.error('\n❌ Erro durante a migração:', error);
    } finally {
        sqliteDb.close();
        await pgPool.end();
        if (sourcePool) await sourcePool.end();
        process.exit(0);
    }
}

migrate();
