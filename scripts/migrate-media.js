// scripts/migrate-media.js
// Sobe as imagens locais (/uploads/...) para o Cloudinary e grava a secure_url
// nas tabelas do Neon. Uso:
//   node scripts/migrate-media.js --dry-run   (só mostra o que faria)
//   node scripts/migrate-media.js             (sobe + atualiza o banco)
//   node scripts/migrate-media.js --cleanup   (também apaga os locais após 100% OK)
const fs   = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const https = require('https');
const { Pool } = require('pg');
const { uploadFile, isConfigured } = require('../config/cloudinary');

const ROOT = path.join(__dirname, '..');
const DRY_RUN  = process.argv.includes('--dry-run');
const CLEANUP  = process.argv.includes('--cleanup');

if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL (Neon) não definida no .env');
    process.exit(1);
}
if (!isConfigured) {
    console.error('❌ Credenciais do Cloudinary ausentes no .env');
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

// tabela → colunas com mídia (pasta no Cloudinary e tipo de recurso)
const ALVOS = [
    { tabela: 'n3_registros',       pk: 'id', colunas: ['evidencia_1_path', 'evidencia_2_path'], folder: 'omega-safety/n3',       tipo: 'image' },
    { tabela: 'inspecoes_avulsas',  pk: 'id', colunas: ['foto_path'],                            folder: 'omega-safety/inspecoes', tipo: 'image' },
    { tabela: 'caderno_respostas',  pk: 'id', colunas: ['foto_path', 'foto_2_path', 'foto_3_path'], folder: 'omega-safety/cadernos', tipo: 'image' },
    { tabela: 'vps_canteiros',      pk: 'id', colunas: ['capa_1_path', 'capa_2_path'],           folder: 'omega-safety/vps',       tipo: 'image' },
    { tabela: 'vps_historico',      pk: 'id', colunas: ['evidencia_1_path', 'evidencia_2_path', 'evidencia_3_path'], folder: 'omega-safety/vps', tipo: 'image' },
    { tabela: 'vps_historico',      pk: 'id', colunas: ['anexo_path'],                           folder: 'omega-safety/vps',       tipo: 'auto'  },
    { tabela: 'usuarios',           pk: 'id', colunas: ['foto_perfil'],                          folder: 'omega-safety/perfis',    tipo: 'image' },
];

function localPath(stored) {
    const rel = stored.replace(/^\//, '');
    const candidatos = [
        path.join(ROOT, rel),                       // uploads/n3/... , uploads/inspecoes/...
        path.join(ROOT, 'public', rel),             // uploads/perfis/... (avatars)
    ];
    return candidatos.find(p => fs.existsSync(p)) || null;
}

function headOk(url, timeout = 15000) {
    return new Promise((resolve) => {
        const req = https.request(url, { method: 'HEAD', timeout }, (res) => {
            res.resume();
            resolve(res.statusCode >= 200 && res.statusCode < 300);
        });
        req.on('timeout', () => { req.destroy(); resolve(false); });
        req.on('error', () => resolve(false));
        req.end();
    });
}

async function main() {
    console.log(`\n🚀 Migração de mídia → Cloudinary ${DRY_RUN ? '(DRY RUN)' : ''}\n`);

    let totalRefs = 0, enviadas = 0, atualizadas = 0, falhas = 0;
    const apagar = [];

    for (const alvo of ALVOS) {
        const cols = [alvo.pk, ...alvo.colunas].join(', ');
        const { rows } = await pool.query(`SELECT ${cols} FROM ${alvo.tabela}`);
        for (const row of rows) {
            for (const col of alvo.colunas) {
                const valor = row[col];
                if (!valor || typeof valor !== 'string' || !valor.startsWith('/uploads/')) continue;

                totalRefs++;
                const arq = localPath(valor);
                const rotulo = `${alvo.tabela}.${col} [${row[alvo.pk]}]`;

                if (!arq) {
                    console.warn(`  ⚠️  ${rotulo} → arquivo local ausente: ${valor}`);
                    falhas++;
                    continue;
                }

                if (DRY_RUN) {
                    console.log(`  📋 ${rotulo} → ${valor}`);
                    continue;
                }

                try {
                    const r = await uploadFile(arq, {
                        folder: alvo.folder,
                        resourceType: alvo.tipo,
                        filename: path.basename(arq),
                    });

                    const ok = await headOk(r.secure_url);
                    if (!ok) {
                        console.error(`  ❌ ${rotulo} → URL não respondeu 200: ${r.secure_url}`);
                        falhas++;
                        continue;
                    }

                    await pool.query(`UPDATE ${alvo.tabela} SET ${col} = $1 WHERE ${alvo.pk} = $2`, [r.secure_url, row[alvo.pk]]);
                    console.log(`  ✅ ${rotulo} → ${r.secure_url}`);
                    enviadas++;
                    atualizadas++;
                    apagar.push(arq);
                } catch (err) {
                    console.error(`  ❌ ${rotulo} → ${err.message}`);
                    falhas++;
                }
            }
        }
    }

    console.log('\n───────────────────────────────────────');
    console.log(`Referências encontradas : ${totalRefs}`);
    console.log(`Enviadas ao Cloudinary  : ${enviadas}`);
    console.log(`Banco atualizado        : ${atualizadas}`);
    console.log(`Falhas                  : ${falhas}`);

    if (!DRY_RUN && apagar.length && falhas === 0) {
        if (CLEANUP) {
            console.log(`\n🧹 Removendo ${apagar.length} arquivos locais já migrados...`);
            apagar.forEach(f => { try { fs.unlinkSync(f); } catch (e) { console.warn('  ⚠️', e.message); } });
        } else {
            console.log(`\nℹ️  ${apagar.length} arquivos locais mantidos. Rode com --cleanup para removê-los.`);
        }
    }

    await pool.end();
    process.exit(falhas > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('❌ Erro na migração de mídia:', err);
    process.exit(1);
});
