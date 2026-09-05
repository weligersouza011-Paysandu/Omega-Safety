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
        const selectDash = document.getElementById('select-contrato-dashboard');

        contratos.forEach(c => {
            const opt1 = new Option(`Contrato ${c}`, c);
            selectList.appendChild(opt1);
            if (selectDash) {
                const opt2 = new Option(`Contrato ${c}`, c);
                selectDash.appendChild(opt2);
            }
        });

        // Pré-seleciona com o contrato do ADM logado
        if (currentUser.contrato) {
            selectList.value = currentUser.contrato;
            currentContrato = currentUser.contrato;
            if (selectDash) selectDash.value = currentUser.contrato;
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
//  FILTROS DE STATUS
// ═══════════════════════════════════════════════════
function setupStatusFilters() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.status;
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
        if (currentFilter) qp.set('status', currentFilter);
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
                        ${currentFilter ? `Nenhum registro com status "${currentFilter}".` : 'Seja o primeiro a registrar um N3!'}
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
                <div class="n3-date-group__header">
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

    const foto = n3.evidencia_1_path
        ? `<div class="n3-card__photo" style="background-image:url('${n3.evidencia_1_path}')">
               <div class="n3-card__status-badge">${statusBadge(n3.status)}</div>
           </div>`
        : `<div class="n3-card__photo-placeholder">
               ⚠️
               <div class="n3-card__status-badge" style="position:absolute;top:8px;right:8px">${statusBadge(n3.status)}</div>
           </div>`;

    // Botão de exclusão apenas para ADM
    const deleteBtn = isAdm
        ? `<button class="n3-card__delete-btn" data-id="${n3.id}" title="Excluir N3">🗑️</button>`
        : '';

    return `
        <div class="n3-card" data-id="${n3.id}" role="button" tabindex="0" aria-label="Ver detalhes do N3 de ${formatDate(n3.data)}">
            ${deleteBtn}
            ${foto}
            <div class="n3-card__body">
                <div class="n3-card__id">#${n3.id.slice(0,8).toUpperCase()}</div>
                <div class="n3-card__title">${n3.descricao_situacao || '(sem descrição)'}</div>
                <div class="n3-card__meta">
                    <span class="n3-card__meta-item">👤 ${n3.nome_observador}</span>
                    ${n3.local_ss ? `<span class="n3-card__meta-item">📍 ${n3.local_ss}</span>` : ''}
                    ${n3.categoria ? `<span class="n3-card__meta-item">🏷️ ${n3.categoria}</span>` : ''}
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

function renderModal(n3) {
    const isAdm = currentUser.perfil === 'adm';

    const fotos = [n3.evidencia_1_path, n3.evidencia_2_path].filter(Boolean);
    const fotosHtml = fotos.length
        ? `<div class="photo-preview-grid">${fotos.map(f => `
            <div class="photo-preview-item">
                <a href="${f}" target="_blank"><img src="${f}" alt="Evidência N3"></a>
            </div>`).join('')}</div>`
        : '<p style="color:var(--color-text-muted);font-size:var(--font-size-sm)">Sem evidências fotográficas.</p>';

    document.getElementById('modal-body').innerHTML = `
        <div style="display:grid;gap:var(--space-md);">
            <div class="flex flex-between">
                <div>${statusBadge(n3.status)}</div>
                <div style="font-size:var(--font-size-xs);color:var(--color-text-muted)">#${n3.id.slice(0,8).toUpperCase()} · ${formatDate(n3.data)}</div>
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

            ${n3.observacoes_adm ? `<div>
                <div style="font-size:var(--font-size-xs);font-weight:700;text-transform:uppercase;color:var(--color-text-muted);margin-bottom:4px;">Observações ADM</div>
                <div style="background:rgba(200,16,46,0.05);border:1px solid var(--color-red-border);padding:12px;border-radius:var(--radius-sm);font-size:var(--font-size-sm);">${n3.observacoes_adm}</div>
            </div>` : ''}

            ${isAdm ? renderAdmValidation(n3) : ''}
        </div>
    `;

    // Botões ADM de ação rápida
    const actionsDiv = document.querySelector('#detail-modal .form-actions');
    if (isAdm) {
        actionsDiv.innerHTML = `
            <button class="btn btn--secondary" id="btn-fechar-modal">Fechar</button>
            <button class="btn btn--primary" id="btn-salvar-validacao">💾 Salvar Validação</button>
        `;
        document.getElementById('btn-fechar-modal').addEventListener('click', closeModal);
        document.getElementById('btn-salvar-validacao').addEventListener('click', () => saveValidation(n3.id));
    } else {
        actionsDiv.innerHTML = `<button class="btn btn--secondary" id="btn-fechar-modal">Fechar</button>`;
        document.getElementById('btn-fechar-modal').addEventListener('click', closeModal);
    }
}

function field(label, value) {
    return `<div>
        <div style="font-size:var(--font-size-xs);font-weight:700;text-transform:uppercase;color:var(--color-text-muted);margin-bottom:2px;">${label}</div>
        <div style="font-size:var(--font-size-sm);font-weight:500;">${value || '—'}</div>
    </div>`;
}

function renderAdmValidation(n3) {
    const statusOptions = ['Em Análise','Aprovado','Reprovado','Pendente','Concluído'];
    return `
        <div style="border-top:1px solid var(--color-border);padding-top:var(--space-md);margin-top:var(--space-sm);">
            <div style="font-size:var(--font-size-xs);font-weight:700;text-transform:uppercase;color:var(--color-red-primary);margin-bottom:var(--space-md);">⚙️ Validação ADM</div>
            <div class="form-group">
                <label class="form-label" for="adm-status">Alterar Status</label>
                <select id="adm-status" class="form-select">
                    ${statusOptions.map(s => `<option value="${s}" ${s === n3.status ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label" for="adm-obs">Observações</label>
                <textarea id="adm-obs" class="form-textarea" rows="3" placeholder="Registre o parecer técnico...">${n3.observacoes_adm || ''}</textarea>
            </div>
        </div>
    `;
}

async function saveValidation(id) {
    const status = document.getElementById('adm-status').value;
    const obs    = document.getElementById('adm-obs').value;

    try {
        await api.patch(`/n3/${id}/status`, { status, observacoes_adm: obs });
        showToast(`N3 atualizado para "${status}".`, 'success');
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
// ═══════════════════════════════════════════════════
async function loadDashboardN3() {
    const dashContrato = document.getElementById('select-contrato-dashboard')?.value || '';

    try {
        const qp = new URLSearchParams({ limit: 9999 });
        if (dashContrato) qp.set('contrato', dashContrato);

        const data = await api.get(`/n3?${qp}`);
        const records = data.data;

        // Contadores por status
        const counts = {
            'Em Análise': 0,
            'Aprovado': 0,
            'Reprovado': 0,
            'Concluído': 0,
            'Pendente': 0,
        };

        records.forEach(r => {
            if (counts.hasOwnProperty(r.status)) {
                counts[r.status]++;
            }
        });

        document.getElementById('dash-em-analise').textContent = counts['Em Análise'];
        document.getElementById('dash-aprovados').textContent   = counts['Aprovado'];
        document.getElementById('dash-reprovados').textContent  = counts['Reprovado'];
        document.getElementById('dash-concluidos').textContent  = counts['Concluído'];

    } catch (err) {
        console.error('Erro ao carregar dashboard N3:', err);
        showToast('Erro ao carregar indicadores do Dashboard N3.', 'error');
    }
}
