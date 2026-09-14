// public/js/n3-list.js — Listagem, Agrupamento, Permissões e Dashboard N3

let currentUser     = null;
let currentFilter   = '';
let currentContrato = '';
let allN3Data       = [];

document.addEventListener('DOMContentLoaded', async () => {
    currentUser = await requireLogin();
    if (!currentUser) return;

    document.getElementById('sidebar-root').innerHTML = buildSidebar(currentUser, 'n3');
    initLogout();

    const isAdm = currentUser.perfil === 'adm';

    // ── Mostrar abas apenas para ADM ──
    if (isAdm) {
        document.getElementById('n3-tabs-container').style.display = 'flex';
        setupTabs();
    }

    // ── Configurar filtro de contrato ──
    if (isAdm) {
        document.getElementById('contract-filter-bar').style.display = 'flex';
        await loadContractOptions();
    }

    // ── Filtros de Status ──
    setupStatusFilters();

    // ── Carregar N3 ──
    loadN3();

    // ── Modal ──
    document.getElementById('btn-fechar-modal').addEventListener('click', closeModal);
    document.getElementById('detail-modal').addEventListener('click', e => {
        if (e.target === document.getElementById('detail-modal')) closeModal();
    });
});

// ═══════════════════════════════════════════════════
//  ABAS (Tabs) — apenas ADM
// ═══════════════════════════════════════════════════
function setupTabs() {
    const btns = document.querySelectorAll('.n3-tab-btn');
    const contents = document.querySelectorAll('.n3-tab-content');

    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            btns.forEach(b => b.classList.remove('active'));
            contents.forEach(c => { c.classList.remove('active'); c.style.display = 'none'; });

            btn.classList.add('active');
            const target = document.getElementById(btn.dataset.tab);
            target.classList.add('active');
            target.style.display = 'block';

            // Ao clicar na aba Dashboard, carrega dados
            if (btn.dataset.tab === 'tab-dashboard-n3') {
                loadDashboardN3();
            }
        });
    });
}

// ═══════════════════════════════════════════════════
//  FILTRO DE CONTRATO
// ═══════════════════════════════════════════════════
async function loadContractOptions() {
    try {
        const contratos = await api.get('/n3/contratos');
        const selectList = document.getElementById('select-contrato-n3');
        const selectDash = document.getElementById('dash3-contrato') || document.getElementById('select-contrato-dashboard');

        contratos.forEach(c => {
            const cleanCode = String(c).replace(/[^0-9a-zA-Z]/g, '') || String(c).trim();
            if (!cleanCode) return;
            
            if (selectList && !selectList.querySelector(`option[value="${cleanCode}"]`)) {
                selectList.appendChild(new Option(`Contrato ${cleanCode}`, cleanCode));
            }
            if (selectDash && !selectDash.querySelector(`option[value="${cleanCode}"]`)) {
                selectDash.appendChild(new Option(`Contrato ${cleanCode}`, cleanCode));
            }
        });

        // Pré-seleciona com o contrato do ADM logado
        if (currentUser.contrato) {
            const userC = String(currentUser.contrato).replace(/[^0-9a-zA-Z]/g, '') || String(currentUser.contrato).trim();
            if (selectList) selectList.value = userC;
            currentContrato = userC;
            if (selectDash) selectDash.value = userC;
        }

        // Evento de alteração
        selectList.addEventListener('change', () => {
            currentContrato = selectList.value;
            loadN3();
        });

        if (selectDash) {
            selectDash.addEventListener('change', () => {
                loadDashboardN3();
            });
        }

    } catch (err) {
        console.error('Erro ao carregar contratos:', err);
    }
}

// ═══════════════════════════════════════════════════
//  FILTROS DE NÍVEL
// ═══════════════════════════════════════════════════
function setupStatusFilters() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.nivel;
            loadN3();
        });
    });
}

// ═══════════════════════════════════════════════════
//  CARREGAR e AGRUPAR N3 (Cronologia Inversa)
// ═══════════════════════════════════════════════════
async function loadN3() {
    const container = document.getElementById('n3-grid-container');
    container.innerHTML = `<div style="text-align:center;padding:var(--space-2xl);color:var(--color-text-muted)">
        <div class="spinner" style="margin:0 auto;width:32px;height:32px;border-width:3px;"></div>
        <div style="margin-top:var(--space-md)">Carregando...</div>
    </div>`;

    try {
        const qp = new URLSearchParams({ limit: 500 });
        if (currentFilter) qp.set('nivel', currentFilter);
        if (currentContrato) qp.set('contrato', currentContrato);

        const data = await api.get(`/n3?${qp}`);
        allN3Data = data.data;
        document.getElementById('total-label').textContent = `${data.total} registro(s)`;

        if (!data.data.length) {
            container.innerHTML = `<div>
                <div class="empty-state">
                    <div class="empty-state__icon">📭</div>
                    <div class="empty-state__title">Nenhum N3 encontrado</div>
                    <div class="empty-state__desc">
                        ${currentFilter ? `Nenhum registro com nível "${currentFilter}".` : 'Seja o primeiro a registrar um N3!'}
                    </div>
                </div>
            </div>`;
            return;
        }

        // Agrupar por data
        const groups = groupByDate(data.data);
        container.innerHTML = '';

        groups.forEach(group => {
            const groupEl = document.createElement('div');
            groupEl.className = 'n3-date-group';

            // Header do grupo com data e contador
            groupEl.innerHTML = `
                <div class="n3-date-group__header" style="color: #FFFFFF; font-weight: bold;">
                    <div class="n3-date-group__date">📅 ${group.dateFormatted}</div>
                    <div class="n3-date-group__count">${group.items.length} registro${group.items.length > 1 ? 's' : ''}</div>
                </div>
            `;

            // Grid de cards dentro do grupo
            const gridEl = document.createElement('div');
            gridEl.className = 'n3-grid';
            gridEl.innerHTML = group.items.map(n3 => renderN3Card(n3)).join('');
            groupEl.appendChild(gridEl);

            container.appendChild(groupEl);
        });

        // Bind: click nos cards abre modal
        container.querySelectorAll('.n3-card').forEach(card => {
            card.addEventListener('click', (e) => {
                // Se clicou no botão de excluir, não abre o modal
                if (e.target.closest('.n3-card__delete-btn')) return;
                openModal(card.dataset.id);
            });
        });

        // Bind: botões de exclusão (ADM)
        if (currentUser.perfil === 'adm') {
            container.querySelectorAll('.n3-card__delete-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteN3(btn.dataset.id);
                });
            });
        }

    } catch (err) {
        container.innerHTML = `<div><div class="empty-state">
            <div class="empty-state__icon">❌</div>
            <div class="empty-state__title">Erro ao carregar</div>
            <div class="empty-state__desc">${err.message}</div>
        </div></div>`;
    }
}

// ═══════════════════════════════════════════════════
//  AGRUPAMENTO POR DATA
// ═══════════════════════════════════════════════════
function groupByDate(records) {
    const map = new Map();

    records.forEach(n3 => {
        const dateKey = n3.data || 'sem-data';
        if (!map.has(dateKey)) {
            map.set(dateKey, []);
        }
        map.get(dateKey).push(n3);
    });

    // Converte para array e ordena (mais recente primeiro — já vem do backend, mas garante)
    const groups = [];
    for (const [dateKey, items] of map) {
        groups.push({
            dateKey,
            dateFormatted: dateKey !== 'sem-data' ? formatDate(dateKey) : 'Sem Data',
            items
        });
    }

    groups.sort((a, b) => {
        if (a.dateKey === 'sem-data') return 1;
        if (b.dateKey === 'sem-data') return -1;
        return b.dateKey.localeCompare(a.dateKey);
    });

    return groups;
}

// ═══════════════════════════════════════════════════
//  RENDERIZAÇÃO DO CARD N3
// ═══════════════════════════════════════════════════
function renderN3Card(n3) {
    const isAdm = currentUser.perfil === 'adm';

    // Foto limpa (sem badge sobre ela)
    const foto = n3.evidencia_1_path
        ? `<div class="n3-card__photo" style="background-image:url('${n3.evidencia_1_path}')"></div>`
        : `<div class="n3-card__photo-placeholder">⚠️</div>`;

    // Botão de exclusão apenas para ADM
    const deleteBtn = isAdm
        ? `<button class="n3-card__delete-btn" data-id="${n3.id}" title="Excluir N3">🗑️</button>`
        : '';

    return `
        <div class="n3-card" data-id="${n3.id}" role="button" tabindex="0" aria-label="Ver detalhes do N3 de ${formatDate(n3.data)}">
            ${deleteBtn}
            ${foto}
            <div class="n3-card__body">
                <div style="margin-bottom: 8px;">${statusBadge(n3.nivel || 'Em Análise')}</div>
                <div class="n3-card__title">${n3.descricao_situacao || '(sem descrição)'}</div>
                <div class="n3-card__meta">
                    <span class="n3-card__meta-item">👤 ${n3.nome_observador}</span>
                    ${n3.local_ss ? `<span class="n3-card__meta-item">📍 ${n3.local_ss}</span>` : ''}
                    ${n3.subcategoria ? `<span class="n3-card__meta-item">🏷️ ${n3.subcategoria}</span>` : ''}
                </div>
            </div>
            <div class="n3-card__footer">
                <div class="n3-card__date">📅 ${formatDate(n3.data)}</div>
                ${n3.lideranca ? `<span style="font-size:var(--font-size-xs);color:var(--color-text-muted)">${n3.lideranca}</span>` : ''}
            </div>
        </div>
    `;
}

// ═══════════════════════════════════════════════════
//  EXCLUSÃO N3 (apenas ADM)
// ═══════════════════════════════════════════════════
async function deleteN3(id) {
    if (!confirm('Tem certeza que deseja excluir este registro N3?\nEsta ação é irreversível.')) return;

    try {
        const res = await api.delete(`/n3/${id}`);
        showToast(res.message || 'N3 removido com sucesso.', 'success');
        loadN3();
    } catch (err) {
        showToast(err.message || 'Erro ao excluir N3.', 'error');
    }
}

// ═══════════════════════════════════════════════════
//  MODAL DE DETALHES
// ═══════════════════════════════════════════════════
async function openModal(id) {
    document.getElementById('detail-modal').classList.remove('hidden');
    document.getElementById('modal-body').innerHTML = `<div class="flex-center" style="padding:var(--space-xl)">
        <div class="spinner" style="width:32px;height:32px;border-width:3px;"></div>
    </div>`;

    try {
        const n3 = await api.get(`/n3/${id}`);
        renderModal(n3);
    } catch (err) {
        document.getElementById('modal-body').innerHTML = `<p class="text-danger">Erro ao carregar: ${err.message}</p>`;
    }
}

async function renderModal(n3) {
    const isAdm = currentUser.perfil === 'adm';

    // Buscar histórico
    let historicoHtml = '';
    try {
        const hist = await api.get(`/n3/${n3.id}/historico`);
        if (hist && hist.length > 0) {
            historicoHtml = `
            <div>
                <div style="font-size:var(--font-size-xs);font-weight:700;text-transform:uppercase;color:var(--color-text-muted);margin-bottom:8px;">Histórico de Alterações</div>
                <div style="display:flex;flex-direction:column;gap:8px;">
                    ${hist.map(h => {
                        // Formata data_hora de forma robusta
                        let dataFmt = '—';
                        let horaFmt = '—';
                        if (h.data_hora) {
                            const dt = new Date(h.data_hora);
                            if (!isNaN(dt.getTime())) {
                                dataFmt = dt.toLocaleDateString('pt-BR');
                                horaFmt = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                            }
                        }
                        return `
                        <div style="background:var(--color-bg-input);padding:8px 12px;border-radius:var(--radius-sm);font-size:var(--font-size-sm);border-left:3px solid var(--color-red-primary);">
                            <div style="display:flex;justify-content:space-between;color:var(--color-text-muted);font-size:var(--font-size-xs);margin-bottom:4px;">
                                <span>👤 ${h.usuario_nome}</span>
                                <span>📅 ${dataFmt} às ${horaFmt}</span>
                            </div>
                            <div>${h.detalhes}</div>
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
        }
    } catch(err) {
        console.error('Erro ao buscar histórico:', err);
    }

    const fotos = [n3.evidencia_1_path, n3.evidencia_2_path].filter(Boolean);
    const fotosHtml = fotos.length
        ? `<div class="photo-preview-grid">${fotos.map(f => `
            <div class="photo-preview-item">
                <a href="${f}" target="_blank"><img src="${f}" alt="Evidência N3"></a>
            </div>`).join('')}</div>`
        : '<p style="color:var(--color-text-muted);font-size:var(--font-size-sm)">Sem evidências fotográficas.</p>';

    const nivelOptions = [
        'Em Análise',
        'N1 — Óbito ou Mudança de Vida',
        'N2 — Acidente com Afastamento',
        'N3 Prioritário — Casos Críticos',
        'N3 — Quase Acidente / Condição Insegura Neutralizada',
        'N4 / N5 — Desvios Leves e Observações'
    ];

    // Cor dinâmica por nível para o header do modal
    const nivelColorMap = {
        'Em Análise':                                              { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.4)',  color: '#f59e0b' },
        'N1 — Óbito ou Mudança de Vida':                         { bg: '#111111',               border: '#444444',               color: '#ffffff' },
        'N2 — Acidente com Afastamento':                         { bg: 'rgba(234,179,8,0.12)',   border: 'rgba(234,179,8,0.4)',   color: '#facc15' },
        'N3 Prioritário — Casos Críticos':                       { bg: 'rgba(239,68,68,0.15)',   border: 'rgba(239,68,68,0.5)',   color: '#f87171' },
        'N3 — Quase Acidente / Condição Insegura Neutralizada':  { bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.4)',  color: '#fb923c' },
        'N4 / N5 — Desvios Leves e Observações':                 { bg: 'rgba(34,197,94,0.10)',   border: 'rgba(34,197,94,0.35)', color: '#4ade80' },
    };
    const nivelAtual = n3.nivel || 'Em Análise';
    const cor = nivelColorMap[nivelAtual] || nivelColorMap['Em Análise'];

    const nivelSelect = isAdm ? `
        <select id="modal-adm-nivel" class="form-select" style="font-size: var(--font-size-sm); border-color: ${cor.border}; color: ${cor.color}; background: ${cor.bg};">
            ${nivelOptions.map(s => `<option value="${s}" ${s === nivelAtual ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
    ` : statusBadge(nivelAtual);

    document.getElementById('modal-body').innerHTML = `
        <div style="display:grid;gap:var(--space-md);">
            <div style="background:${cor.bg}; border:1px solid ${cor.border}; border-radius:var(--radius-md); padding: 10px 14px; display:flex; align-items:center; gap: 10px;">
                <div style="flex:1;">${nivelSelect}</div>
                <div style="font-size:var(--font-size-xs);color:${cor.color};opacity:0.8;white-space:nowrap;">${formatDate(n3.data)}</div>
            </div>

            <div class="form-grid--2" style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-sm);">
                ${field('Observador',  n3.nome_observador)}
                ${field('Matrícula',   n3.matricula_observador)}
                ${field('Liderança',   n3.lideranca)}
                ${field('Local/SS',    n3.local_ss)}
                ${field('Nível',       n3.nivel)}
                ${field('Categoria',   n3.categoria)}
                ${field('Subcategoria',n3.subcategoria)}
                ${field('Prazo',       formatDate(n3.prazo_vencimento))}
            </div>

            <div>
                <div style="font-size:var(--font-size-xs);font-weight:700;text-transform:uppercase;color:var(--color-text-muted);margin-bottom:4px;">Descrição da Situação</div>
                <div style="background:var(--color-bg-input);padding:12px;border-radius:var(--radius-sm);font-size:var(--font-size-sm);line-height:1.6;">${n3.descricao_situacao || '—'}</div>
            </div>

            ${n3.plano_acao ? `<div>
                <div style="font-size:var(--font-size-xs);font-weight:700;text-transform:uppercase;color:var(--color-text-muted);margin-bottom:4px;">Plano de Ação</div>
                <div style="background:var(--color-bg-input);padding:12px;border-radius:var(--radius-sm);font-size:var(--font-size-sm);line-height:1.6;">${n3.plano_acao}</div>
            </div>` : ''}

            <div>
                <div style="font-size:var(--font-size-xs);font-weight:700;text-transform:uppercase;color:var(--color-text-muted);margin-bottom:8px;">Evidências</div>
                ${fotosHtml}
            </div>

            ${historicoHtml}
        </div>
    `;

    // Botões ADM de ação rápida
    const actionsDiv = document.querySelector('#detail-modal .form-actions');
    actionsDiv.innerHTML = `<button class="btn btn--secondary" id="btn-fechar-modal">Fechar</button>`;
    document.getElementById('btn-fechar-modal').addEventListener('click', closeModal);

    if (isAdm) {
        document.getElementById('modal-adm-nivel').addEventListener('change', (e) => {
            saveValidation(n3.id, e.target.value);
        });
    }
}

function field(label, value) {
    return `<div>
        <div style="font-size:var(--font-size-xs);font-weight:700;text-transform:uppercase;color:var(--color-text-muted);margin-bottom:2px;">${label}</div>
        <div style="font-size:var(--font-size-sm);font-weight:500;">${value || '—'}</div>
    </div>`;
}

async function saveValidation(id, nivel) {

    try {
        await api.patch(`/n3/${id}/nivel`, { nivel });
        showToast(`Nível atualizado para "${nivel}".`, 'success');
        closeModal();
        loadN3();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function closeModal() {
    document.getElementById('detail-modal').classList.add('hidden');
}

// ═══════════════════════════════════════════════════
//  DASHBOARD N3 (Aba 2 — ADM)
//  A lógica completa foi movida para /js/n3-dashboard.js
//  Esta função é mantida como ponto de entrada para
//  compatibilidade com o setupTabs() acima.
// ═══════════════════════════════════════════════════
// loadDashboardN3 é definida em n3-dashboard.js e chamada pelo setupTabs()
