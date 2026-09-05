// public/js/dashboard.js — Lógica do Dashboard

document.addEventListener('DOMContentLoaded', async () => {
    // Verifica autenticação
    const user = await requireLogin();
    if (!user) return;

    // ── Injeta Sidebar ────────────────────────────────────────
    document.getElementById('sidebar-root').innerHTML = buildSidebar(user, 'dashboard');
    initLogout();

    // ── Saudação ──────────────────────────────────────────────
    const firstName = user.nome.split(' ')[0];
    document.getElementById('user-first-name').textContent = firstName;
    document.getElementById('user-role-label').textContent =
        user.perfil === 'adm' ? '🔴 Administrador — Visão Gerencial' : '👷 Usuário Operacional';

    // Data atual
    const hoje = new Date();
    document.getElementById('today-date').textContent =
        hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    // ── Treinamentos ──────────────────────────────────────────
    loadTrainings(user);

    // ── Stats ADM ─────────────────────────────────────────────
    if (user.perfil === 'adm') {
        document.getElementById('stats-section').classList.remove('hidden');
        loadAdmStats();
    }
});

async function loadTrainings(user) {
    const body  = document.getElementById('trainings-body');
    const count = document.getElementById('trainings-count');

    try {
        const rows = await api.get('/treinamentos');
        count.textContent = rows.length;

        if (!rows.length) {
            body.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state__icon">📋</div>
                    <div class="empty-state__title">Nenhum treinamento registrado</div>
                    <div class="empty-state__desc">Seus treinamentos aparecerão aqui quando forem cadastrados.</div>
                </div>`;
            return;
        }

        // Ordena: vencidos primeiro, depois alertas, depois ok
        const order = { vencido: 0, alerta: 1, ok: 2 };
        rows.sort((a,b) => order[a.situacao] - order[b.situacao]);

        body.innerHTML = rows.map(t => {
            const dias = daysUntil(t.data_vencimento);
            let diasTxt = '';
            if (dias !== null) {
                if (dias < 0)       diasTxt = `<br><small style="color:var(--color-training-vencido)">Vencido há ${Math.abs(dias)}d</small>`;
                else if (dias === 0) diasTxt = `<br><small style="color:var(--color-training-alerta)">Vence hoje!</small>`;
                else if (dias <= 30) diasTxt = `<br><small style="color:var(--color-training-alerta)">Vence em ${dias}d</small>`;
            }
            return `
                <div class="training-row">
                    <div>
                        <div class="training-row__name">${t.nome_treinamento}</div>
                        <div class="training-row__mat">Mat. ${t.matricula}</div>
                    </div>
                    <div>${trainingBadge(t.situacao)}</div>
                    <div class="training-row__date">
                        ${formatDate(t.data_vencimento)}
                        ${diasTxt}
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        body.innerHTML = `<div class="empty-state">
            <div class="empty-state__icon">❌</div>
            <div class="empty-state__title">Erro ao carregar treinamentos</div>
            <div class="empty-state__desc">${err.message}</div>
        </div>`;
    }
}

async function loadAdmStats() {
    try {
        // N3 Em Análise
        const n3Data = await api.get('/n3?status=Em Análise&limit=1');
        document.getElementById('stat-n3-analise').textContent = n3Data.total ?? '—';

        // Treinamentos (todos para filtrar)
        const treinamentos = await api.get('/treinamentos');
        const vencidos = treinamentos.filter(t => t.situacao === 'vencido').length;
        const alertas  = treinamentos.filter(t => t.situacao === 'alerta').length;
        document.getElementById('stat-trein-vencidos').textContent = vencidos;
        document.getElementById('stat-trein-alerta').textContent   = alertas;

        // Inspeções de hoje
        const insp = await api.get('/inspecoes?limit=1');
        document.getElementById('stat-inspecoes').textContent = insp.total ?? '—';

    } catch (err) {
        console.error('Erro ao carregar stats ADM:', err);
    }
}
