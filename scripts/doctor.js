// scripts/doctor.js — Validação de ambiente (Neon + Cloudinary) para deploy
// Uso: npm run doctor
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const { pingCloudinary, isConfigured } = require('../config/cloudinary');

const resultados = [];
const ok   = (nome, detalhe) => { resultados.push({ nome, estado: 'OK', detalhe }); };
const erro = (nome, detalhe) => { resultados.push({ nome, estado: 'FALHA', detalhe }); };

async function checarNeon() {
    if (!process.env.DATABASE_URL) return erro('Neon (DATABASE_URL)', 'variável ausente no .env');
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 15000,
    });
    try {
        const r = await pool.query('SELECT current_database() AS db, version() AS v');
        const tables = await pool.query(
            "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = current_schema()"
        );
        ok('Neon (DATABASE_URL)', `conectado ao "${r.rows[0].db}" · ${tables.rows[0].n} tabela(s) · ${r.rows[0].v.split(' ')[1]}`);
    } catch (err) {
        erro('Neon (DATABASE_URL)', err.message);
    } finally {
        await pool.end().catch(() => {});
    }
}

async function checarCloudinary() {
    if (!isConfigured) return erro('Cloudinary', 'credenciais ausentes no .env');
    const r = await pingCloudinary(8000);
    if (r.ok) ok('Cloudinary', `cloud "${process.env.CLOUDINARY_CLOUD_NAME}" · ping OK`);
    else erro('Cloudinary', `cloud "${process.env.CLOUDINARY_CLOUD_NAME}" · ${r.detail}`);
}

async function main() {
    console.log('\n🩺 Doctor — Omega Safety 2.0\n');
    await checarNeon();
    await checarCloudinary();

    let falhas = 0;
    for (const r of resultados) {
        const icone = r.estado === 'OK' ? '✅' : '❌';
        console.log(`${icone} ${r.nome}: ${r.detalhe}`);
        if (r.estado !== 'OK') falhas++;
    }

    console.log(falhas ? `\n⚠️  ${falhas} verificação(ões) falharam.\n` : '\n✅ Ambiente pronto para o deploy.\n');
    process.exit(falhas ? 1 : 0);
}

main().catch(err => { console.error('❌', err); process.exit(1); });
