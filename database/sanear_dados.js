// sanear_dados.js — Saneamento e normalização dos dados N3
// Executa apenas UPDATE nos dados; não altera schema nem código.
const db = require('./db');

setTimeout(async () => {
    try {
        console.log('\n====================================================');
        console.log(' SANEAMENTO DE DADOS — Omega Safety N3');
        console.log('====================================================\n');

        // ── 1. Reclassificar "Em Análise" → N3 Normal ──────────────────
        // Registros sem classificação definitiva (importação antiga / novos sem nível)
        // devem ser promovidos para N3 Normal como padrão do módulo.
        const r1 = await db.runAsync(
            "UPDATE n3_registros SET nivel = 'N3 — Quase Acidente / Condição Insegura Neutralizada' WHERE nivel = 'Em Análise' OR nivel IS NULL OR TRIM(nivel) = ''"
        );
        console.log(`[1] Em Análise → N3 Normal: ${r1.changes} registros atualizados`);

        // ── 2. Normalizar variações de texto do N3 Normal ───────────────
        // Garante que qualquer registro "N3" sem sufixo correto fique padronizado.
        const r2 = await db.runAsync(
            "UPDATE n3_registros SET nivel = 'N3 — Quase Acidente / Condição Insegura Neutralizada' WHERE nivel ILIKE '%N3%' AND nivel NOT ILIKE '%Priorit%' AND nivel <> 'N3 — Quase Acidente / Condição Insegura Neutralizada'"
        );
        console.log(`[2] Normalizar variações N3 Normal: ${r2.changes} registros atualizados`);

        // ── 3. Normalizar variações do N3 Prioritário ───────────────────
        const r3 = await db.runAsync(
            "UPDATE n3_registros SET nivel = 'N3 Prioritário — Casos Críticos' WHERE nivel ILIKE '%N3%' AND nivel ILIKE '%Priorit%' AND nivel <> 'N3 Prioritário — Casos Críticos'"
        );
        console.log(`[3] Normalizar variações N3 Prioritário: ${r3.changes} registros atualizados`);

        // ── 4. Normalizar N4 ────────────────────────────────────────────
        const r4 = await db.runAsync(
            "UPDATE n3_registros SET nivel = 'N4 — Desvio Leve' WHERE nivel ILIKE '%N4%' AND nivel <> 'N4 — Desvio Leve'"
        );
        console.log(`[4] Normalizar N4: ${r4.changes} registros atualizados`);

        // ── 5. Normalizar N5 ────────────────────────────────────────────
        const r5 = await db.runAsync(
            "UPDATE n3_registros SET nivel = 'N5 — Comportamento e Condição Segura' WHERE nivel ILIKE '%N5%' AND nivel <> 'N5 — Comportamento e Condição Segura'"
        );
        console.log(`[5] Normalizar N5: ${r5.changes} registros atualizados`);

        // ── 6. Relatório pós-saneamento ─────────────────────────────────
        console.log('\n=== DISTRIBUIÇÃO PÓS-SANEAMENTO (2025+) ===');
        const dist = await db.allAsync(
            "SELECT SUBSTRING(data::text, 1, 7) as mes, nivel, COUNT(*) as c FROM n3_registros WHERE data >= '2025-01-01' GROUP BY mes, nivel ORDER BY mes, nivel"
        );

        let curMes = '';
        let mesTotal = 0;
        for (const r of dist) {
            if (r.mes !== curMes) {
                if (curMes) console.log(`  ► TOTAL ${curMes}: ${mesTotal}\n`);
                curMes = r.mes;
                mesTotal = 0;
                console.log(`[${r.mes}]`);
            }
            mesTotal += parseInt(r.c);
            console.log(`  ${String(r.c).padStart(4)} | ${r.nivel}`);
        }
        if (curMes) console.log(`  ► TOTAL ${curMes}: ${mesTotal}\n`);

        console.log('\n=== TOTAIS GERAIS ===');
        const tots = await db.allAsync(
            "SELECT nivel, COUNT(*) as c FROM n3_registros GROUP BY nivel ORDER BY c DESC"
        );
        tots.forEach(r => console.log(`  ${String(r.c).padStart(6)} | ${r.nivel}`));

        // ── 7. Atualizar data_ocorrido onde estiver NULL (backfill) ─────
        if (dist.some(() => true)) {
            // A coluna data_ocorrido existe no banco (adicionada via ALTER TABLE anterior)
            try {
                const r7 = await db.runAsync(
                    "UPDATE n3_registros SET data_ocorrido = data WHERE data_ocorrido IS NULL AND data IS NOT NULL"
                );
                console.log(`\n[7] Backfill data_ocorrido: ${r7.changes} registros`);
            } catch (e) {
                console.log('\n[7] data_ocorrido: coluna não existe (ignorando backfill)');
            }
        }

        console.log('\n====================================================');
        console.log(' Saneamento concluído com sucesso.');
        console.log('====================================================\n');
        process.exit(0);
    } catch (e) {
        console.error('\nERRO NO SANEAMENTO:', e.message);
        process.exit(1);
    }
}, 3000);
