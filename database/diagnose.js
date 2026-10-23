// diagnose.js — Diagnóstico de distribuição de dados N3
const db = require('./db');

setTimeout(async () => {
    try {
        // Distribuição por mês e nível (2025+)
        const dist = await db.allAsync(
            "SELECT SUBSTRING(data::text, 1, 7) as mes, nivel, COUNT(*) as c FROM n3_registros WHERE data >= '2025-01-01' GROUP BY mes, nivel ORDER BY mes, nivel"
        );

        console.log('\n=== DISTRIBUIÇÃO POR MÊS / NÍVEL (2025+) ===');
        let curMes = '';
        let mesTotal = 0;
        for (const r of dist) {
            if (r.mes !== curMes) {
                if (curMes) console.log(`  → TOTAL ${curMes}: ${mesTotal}`);
                curMes = r.mes;
                mesTotal = 0;
                console.log(`\n[${r.mes}]`);
            }
            mesTotal += parseInt(r.c);
            console.log(`  ${r.c.toString().padStart(4)} | ${r.nivel}`);
        }
        if (curMes) console.log(`  → TOTAL ${curMes}: ${mesTotal}`);

        // Totais gerais por nível
        const totals = await db.allAsync(
            "SELECT nivel, COUNT(*) as c FROM n3_registros GROUP BY nivel ORDER BY c DESC"
        );
        console.log('\n=== TOTAIS GERAIS POR NÍVEL ===');
        totals.forEach(r => console.log(`  ${r.c.toString().padStart(6)} | ${r.nivel}`));

        // Verificar se data_ocorrido existe
        const col = await db.allAsync(
            "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'n3_registros' ORDER BY ordinal_position"
        );
        console.log('\n=== COLUNAS DE n3_registros ===');
        col.forEach(c => console.log(`  ${c.column_name} (${c.data_type})`));

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}, 3000);
