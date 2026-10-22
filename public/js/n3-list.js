// public/js/n3-list.js — Listagem, Agrupamento, Permissões e Dashboard N3

let currentUser     = null;
let currentFilter   = '';
let currentContrato = '';
let currentPeriod   = '7d';
let allN3Data       = [];
let n3ListState     = { loading: false, hasMore: false, hasHistorico: false, total: 0, totalSemPeriodo: 0 };
let n3Importing     = false;
let n3RequestSeq    = 0;

document.addEventListener('DOMContentLoaded', async () => {
    currentUser = await requireLogin();
    if (!currentUser) return;
    window.__currentUser = currentUser; // Compartilhado com n3-dashboard.js e outros co-carregados

    document.getElementById('sidebar-root').innerHTML = buildSidebar(currentUser, 'n3');
    initLogout();

    if (currentUser.contrato) {
        currentContrato = String(currentUser.contrato).replace(/[^0-9a-zA-Z]/g, '') || String(currentUser.contrato).trim();
    }

    const isMaster = currentUser.is_master === 1;
    const isAdm = isMaster || currentUser.perfil === 'adm';

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

    // ── Período / histórico e importação (ADM) ──
    setupPeriodFilter();
    setupN3Import(isAdm);

    // ── Carregar N3 ──
    loadN3();

    if (typeof window.onGlobalChange === 'function') {
        window.onGlobalChange(async () => {
            // Durante a importação o recarregamento é controlado manualmente,
            // para já abrir o histórico em vez de recarregar os últimos 7 dias.
            if (n3Importing) return;
            if (typeof loadN3 === 'function') {
                loadN3();
            }
        });
    }

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

        const userC = currentUser && currentUser.contrato 
            ? (String(currentUser.contrato).replace(/[^0-9a-zA-Z]/g, '') || String(currentUser.contrato).trim())
            : '';

        const isMaster = currentUser && currentUser.is_master === 1;

        const contractSet = new Set();
        if (Array.isArray(contratos)) {
            contratos.forEach(c => {
                const cleanCode = String(c).replace(/[^0-9a-zA-Z]/g, '') || String(c).trim();
                if (cleanCode) contractSet.add(cleanCode);
            });
        }

        if (userC) {
            contractSet.add(userC);
        }

        function populateSelect(selectEl) {
            if (!selectEl) return;
            selectEl.innerHTML = '';
            
            if (isMaster) {
                const optTodos = document.createElement('option');
                optTodos.value = '';
                optTodos.textContent = 'Todos os Contratos';
                selectEl.appendChild(optTodos);
            }

            Array.from(contractSet).sort((a,b) => a.localeCompare(b, undefined, {numeric: true})).forEach(code => {
                const opt = document.createElement('option');
                opt.value = code;
                opt.textContent = `Contrato ${code}`;
                selectEl.appendChild(opt);
            });

            if (userC) {
                selectEl.value = userC;
            } else if (isMaster) {
                selectEl.value = '';
            }

            if (!isMaster) {
                selectEl.disabled = true;
                selectEl.title = 'Restrito ao seu contrato';
                selectEl.style.cursor = 'not-allowed';
            } else {
                selectEl.disabled = false;
            }
        }

        populateSelect(selectList);
        populateSelect(selectDash);

        if (userC) {
            currentContrato = userC;
        } else if (selectList) {
            currentContrato = selectList.value;
        }

        if (selectList && !selectList.dataset.listenerAttached) {
            selectList.dataset.listenerAttached = 'true';
            selectList.addEventListener('change', () => {
                currentContrato = selectList.value;
                loadN3();
            });
        }

        if (selectDash && !selectDash.dataset.listenerAttached) {
            selectDash.dataset.listenerAttached = 'true';
            selectDash.addEventListener('change', () => {
                if (typeof loadDashboardN3 === 'function') loadDashboardN3();
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
//  PERÍODO / HISTÓRICO
// ═══════════════════════════════════════════════════
function setupPeriodFilter() {
    const select = document.getElementById('select-periodo-n3');
    if (select) {
        select.value = currentPeriod;
        select.addEventListener('change', () => {
            currentPeriod = select.value || '7d';
            loadN3();
        });
    }

    const moreBtn = document.getElementById('btn-n3-load-more');
    if (moreBtn && !moreBtn.dataset.listenerAttached) {
        moreBtn.dataset.listenerAttached = 'true';
        moreBtn.addEventListener('click', () => {
            // Quando o período atual acabou, o próximo clique salta para o
            // histórico completo, continuando de onde os registros pararam.
            if (!n3ListState.hasMore && n3ListState.hasHistorico && currentPeriod !== 'all') {
                currentPeriod = 'all';
                if (select) select.value = 'all';
            }
            loadN3(false);
        });
    }
}

function updateN3LoadMore() {
    const container = document.getElementById('n3-load-more-container');
    const btn = document.getElementById('btn-n3-load-more');
    const hint = document.getElementById('n3-load-more-hint');
    if (!container || !btn) return;

    const podeCarregar = n3ListState.hasMore || n3ListState.hasHistorico;
    container.style.display = podeCarregar ? 'flex' : 'none';
    if (!podeCarregar) return;

    if (!n3ListState.hasMore && n3ListState.hasHistorico && currentPeriod !== 'all') {
        btn.textContent = 'Carregar mais histórico';
    } else {
        btn.textContent = 'Carregar mais registros';
    }

    if (hint) {
        hint.textContent = `${allN3Data.length} de ${n3ListState.total} carregado(s)` +
            (n3ListState.hasHistorico ? ` · ${n3ListState.totalSemPeriodo} no histórico total` : '');
    }
}

// ═══════════════════════════════════════════════════
//  IMPORTAÇÃO DE PLANILHA (ADM)
// ═══════════════════════════════════════════════════
function setupN3Import(isAdm) {
    const btn = document.getElementById('btn-importar-n3');
    const input = document.getElementById('input-importar-n3');
    if (!btn || !input || !isAdm) return;

    btn.style.display = 'inline-flex';
    btn.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        if (!file) return;

        const textoOriginal = btn.textContent;
        btn.disabled = true;
        btn.textContent = '⏳ Importando...';
        n3Importing = true;

        let importou = false;

        try {
            const form = new FormData();
            form.append('file', file);
            const resp = await api.upload('/n3/importar', form);

            let msg = resp.message || 'Planilha importada.';
            if (resp.erros && resp.erros.length) {
                msg += ` ${resp.erros.length} linha(s) com erro.`;
            }
            showToast(msg, resp.inseridos > 0 ? 'success' : 'warning', 9000);
            importou = true;
        } catch (err) {
            showToast(err.message || 'Erro ao importar planilha.', 'error', 9000);
        } finally {
            n3Importing = false;
            input.value = '';
            btn.disabled = false;
            btn.textContent = textoOriginal;
        }

        if (importou) {
            // Abre o histórico para o usuário conferir o que entrou.
            currentPeriod = 'all';
            const select = document.getElementById('select-periodo-n3');
            if (select) select.value = 'all';
            loadN3();
        }
    });
}

// ═══════════════════════════════════════════════════
//  CARREGAR e AGRUPAR N3 (Cronologia Inversa)
// ═══════════════════════════════════════════════════
async function loadN3(reset = true) {
    // Cada chamada recebe uma sequência; respostas antigas são descartadas
    // para que trocar de filtro/período nunca exiba dados desatualizados.
    const seq = ++n3RequestSeq;

    const container = document.getElementById('n3-grid-container');
    const moreBtn = document.getElementById('btn-n3-load-more');

    if (reset) {
        allN3Data = [];
        container.innerHTML = `<div style="text-align:center;padding:var(--space-2xl);color:var(--color-text-muted)">
            <div class="spinner" style="margin:0 auto;width:32px;height:32px;border-width:3px;"></div>
            <div style="margin-top:var(--space-md)">Carregando...</div>
        </div>`;
    } else if (moreBtn) {
        moreBtn.disabled = true;
        moreBtn.textContent = 'Carregando...';
    }

    n3ListState.loading = true;

    try {
        const qp = new URLSearchParams({
            limit: 100,
            periodo: currentPeriod || '7d',
            offset: reset ? 0 : allN3Data.length,
        });
        if (currentFilter) qp.set('nivel', currentFilter);
        if (currentContrato) qp.set('contrato', currentContrato);

        const data = await api.get(`/n3?${qp}`);
        if (seq !== n3RequestSeq) return;

        n3ListState.hasMore = !!data.has_more;
        n3ListState.hasHistorico = !!data.has_historico;
        n3ListState.total = Number(data.total) || 0;
        n3ListState.totalSemPeriodo = Number(data.total_sem_periodo) || n3ListState.total;

        const recebidos = Array.isArray(data.data) ? data.data : [];
        if (reset) {
            allN3Data = recebidos;
        } else {
            const existentes = new Set(allN3Data.map(r => r.id));
            allN3Data = allN3Data.concat(recebidos.filter(r => !existentes.has(r.id)));
        }

        document.getElementById('total-label').textContent =
            `${allN3Data.length} de ${n3ListState.total} registro(s)` +
            (n3ListState.hasHistorico ? ` · ${n3ListState.totalSemPeriodo} no histórico` : '');

        renderN3List();
        updateN3LoadMore();
    } catch (err) {
        if (seq !== n3RequestSeq) return;
        if (reset) {
            container.innerHTML = `<div><div class="empty-state">
                <div class="empty-state__icon">❌</div>
                <div class="empty-state__title">Erro ao carregar</div>
                <div class="empty-state__desc">${err.message}</div>
            </div></div>`;
        } else {
            showToast(err.message || 'Erro ao carregar mais registros.', 'error');
        }
    } finally {
        if (seq === n3RequestSeq) {
            n3ListState.loading = false;
            if (moreBtn) moreBtn.disabled = false;
            updateN3LoadMore();
        }
    }
}

function renderN3List() {
    const container = document.getElementById('n3-grid-container');

    if (!allN3Data.length) {
        const isOperacional = currentUser && currentUser.perfil === 'operacional';
        const temHistorico = n3ListState.hasHistorico;
        const emptyDesc = currentFilter
            ? `Nenhum registro com nível "${currentFilter}" neste período.`
            : isOperacional
                ? 'Nenhum N3 encontrado para o seu contrato neste período. Registe uma ocorrência para que apareça aqui.'
                : temHistorico
                    ? 'Nenhum N3 nos últimos 7 dias. Use o botão abaixo para carregar o histórico.'
                    : 'Nenhum registro N3 encontrado para os filtros selecionados.';
        container.innerHTML = `<div>
            <div class="empty-state">
                <div class="empty-state__icon">📭</div>
                <div class="empty-state__title">Nenhum N3 encontrado</div>
                <div class="empty-state__desc">${emptyDesc}</div>
            </div>
        </div>`;
        return;
    }

    // Agrupar por data
    const groups = groupByDate(allN3Data);
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
    if (currentUser.perfil === 'adm' || currentUser.is_master === 1) {
        container.querySelectorAll('.n3-card__delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteN3(btn.dataset.id);
            });
        });
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
    const isAdm = currentUser.perfil === 'adm' || currentUser.is_master === 1;

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
    const isAdm = currentUser.perfil === 'adm' || currentUser.is_master === 1;

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
