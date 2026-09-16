// public/js/inspecoes.js — Módulo de Inspeções (Caderno de Inspeção)

let currentUser      = null;
let allCadernos      = [];
let perguntasEditing = [];
let openMenuId       = null;

const INSP_SUBCATEGORIAS = [
    'ART (Inconforme)',
    'Checklist (Inconforme)',
    '5S',
    'RAC 01 / NR35 - Trabalho em Altura',
    'RAC 02 - Condução de Veículos e Equipamentos',
    'RAC 03 / NR-12 - Máquinas e Equipamentos',
    'RAC 04 - Bloqueio e Etiquetagem de Energia',
    'RAC 05 - Içamento e Movimentação de Cargas',
    'RAC 06 / NR-33 - Espaço Confinado',
    'RAC 07 - Estabilidade de Taludes, Escavações e Barragens',
    'RAC 08 - Substâncias Perigosas',
    'RAC 10 / NR-10 - Trabalho com Eletricidade',
    'RAC 11 — Atividades Críticas em Sistemas Pressurizados',
    'RAC 12',
    'NR-6 (EPI\'s, Uniforme Danificado)',
    'NR-12 (Máquinas e Equipamentos)',
    'NR-15 (Insalubridade)',
    'NR-17 (Ergonomia)',
    'NR-21 (Trabalho a Céu Aberto)',
    'NR-23 (Proteção contra incêndios)',
    'NR-26 (Sinalização de Segurança)',
    'MA (Atitude Insegura)',
    'MA (Documentação)',
    'MA (Banheiro)',
    'MA (Reabastecimento)',
    'MA (Segregação de Lixo)',
    'MA (Resíduos Industriais) / NR-25',
    'MA (Extintor)',
    'MA (Vegetação Alta)',
    'MA (Problema Químico, Inflamáveis) / NR-20',
    'Passaporte (Treinamento Vencido, Troca)'
];

const INSP_SUBCATEGORIA_TO_CATEGORIA = {
    'ART (Inconforme)': 'ART',
    'Checklist (Inconforme)': 'Checklist',
    '5S': '5S',
    'RAC 01 / NR35 - Trabalho em Altura': 'RAC',
    'RAC 02 - Condução de Veículos e Equipamentos': 'RAC',
    'RAC 03 / NR-12 - Máquinas e Equipamentos': 'RAC',
    'RAC 04 - Bloqueio e Etiquetagem de Energia': 'RAC',
    'RAC 05 - Içamento e Movimentação de Cargas': 'RAC',
    'RAC 06 / NR-33 - Espaço Confinado': 'RAC',
    'RAC 07 - Estabilidade de Taludes, Escavações e Barragens': 'RAC',
    'RAC 08 - Substâncias Perigosas': 'RAC',
    'RAC 10 / NR-10 - Trabalho com Eletricidade': 'RAC',
    'RAC 11 — Atividades Críticas em Sistemas Pressurizados': 'RAC',
    'RAC 12': 'RAC',
    'NR-6 (EPI\'s, Uniforme Danificado)': 'NR',
    'NR-12 (Máquinas e Equipamentos)': 'NR',
    'NR-15 (Insalubridade)': 'NR',
    'NR-17 (Ergonomia)': 'NR',
    'NR-21 (Trabalho a Céu Aberto)': 'NR',
    'NR-23 (Proteção contra incêndios)': 'NR',
    'NR-26 (Sinalização de Segurança)': 'NR',
    'MA (Atitude Insegura)': 'Meio Ambiente',
    'MA (Documentação)': 'Meio Ambiente',
    'MA (Banheiro)': 'Meio Ambiente',
    'MA (Reabastecimento)': 'Meio Ambiente',
    'MA (Segregação de Lixo)': 'Meio Ambiente',
    'MA (Resíduos Industriais) / NR-25': 'Meio Ambiente',
    'MA (Extintor)': 'Meio Ambiente',
    'MA (Vegetação Alta)': 'Meio Ambiente',
    'MA (Problema Químico, Inflamáveis) / NR-20': 'Meio Ambiente',
    'Passaporte (Treinamento Vencido, Troca)': 'Passaporte'
};

document.addEventListener('DOMContentLoaded', async () => {
    currentUser = await requireLogin();
    if (!currentUser) return;

    document.getElementById('sidebar-root').innerHTML = buildSidebar(currentUser, 'inspecoes');
    initLogout();

    const isAdm = currentUser.is_master === 1 || currentUser.perfil === 'adm';
    if (isAdm) {
        document.getElementById('insp-tabs-container').style.display = 'flex';
        setupTabs();
    }

    loadRegistrosTab();

    if (typeof window.onGlobalChange === 'function') {
        window.onGlobalChange(async () => {
            if (typeof loadRegistrosTab === 'function') {
                loadRegistrosTab();
            }
        });
    }

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.insp-actions__btn') && !e.target.closest('.insp-actions__menu')) {
            closeAllMenus();
        }
    });

    document.getElementById('caderno-modal').addEventListener('click', e => {
        if (e.target === document.getElementById('caderno-modal')) closeCadernoModal();
    });
    document.getElementById('btn-fechar-caderno-modal').addEventListener('click', closeCadernoModal);
    document.getElementById('btn-salvar-caderno').addEventListener('click', saveCaderno);
    document.getElementById('btn-add-pergunta').addEventListener('click', addPerguntaToModal);
    document.getElementById('caderno-subcategoria').addEventListener('change', (e) => {
        const cat = INSP_SUBCATEGORIA_TO_CATEGORIA[e.target.value] || '';
        document.getElementById('caderno-categoria').value = cat;
    });

    document.getElementById('caderno-view-modal').addEventListener('click', e => {
        if (e.target === document.getElementById('caderno-view-modal')) closeViewModal();
    });
    document.getElementById('btn-fechar-view-modal').addEventListener('click', closeViewModal);

    document.getElementById('historico-modal').addEventListener('click', e => {
        if (e.target === document.getElementById('historico-modal')) closeHistoricoModal();
    });
    document.getElementById('btn-fechar-historico-modal').addEventListener('click', closeHistoricoModal);

    document.getElementById('nova-inspecao-modal').addEventListener('click', e => {
        if (e.target === document.getElementById('nova-inspecao-modal')) closeNovaInspecaoModal();
    });
    document.getElementById('insp-btn-cancel').addEventListener('click', closeNovaInspecaoModal);
    document.getElementById('insp-btn-submit').addEventListener('click', submitNovaInspecao);
    document.getElementById('btn-realizar-inspecao').addEventListener('click', openNovaInspecaoModal);
    document.getElementById('insp-caderno-select').addEventListener('change', inspLoadPerguntas);
    document.getElementById('insp-contrato').addEventListener('change', () => loadInspLiderancas());

    setupInspPhotoUpload('insp-upload-zone-1', 'insp-foto-input', 'insp-preview-1');
    setupInspPhotoUpload('insp-upload-zone-2', 'insp-foto-2-input', 'insp-preview-2');
    setupInspPhotoUpload('insp-upload-zone-3', 'insp-foto-3-input', 'insp-preview-3');

    const viewModal = document.getElementById('insp-view-modal');
    viewModal.addEventListener('click', e => {
        if (e.target === viewModal) closeInspViewModal();
    });
    document.getElementById('btn-fechar-insp-view').addEventListener('click', closeInspViewModal);
});

// ═══════════════════════════════════════════════════
//  ABAS (Tabs)
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

            if (btn.dataset.tab === 'tab-registros') loadRegistrosTab();
            else if (btn.dataset.tab === 'tab-cadernos') loadCadernosTab();
            else if (btn.dataset.tab === 'tab-dashboard-insp') loadDashboardTab();
        });
    });
}

// ═══════════════════════════════════════════════════
//  ABA 1: REGISTROS / ROTINA — Cards de Inspeções
// ═══════════════════════════════════════════════════
async function loadRegistrosTab() {
    const container = document.getElementById('registros-content');
    const countEl = document.getElementById('insp-registros-count');
    container.innerHTML = spinner('Carregando inspeções...');

    try {
        const resp = await api.get('/inspecoes/respostas?limit=200');
        const inspecoes = resp.data || [];

        if (countEl) {
            countEl.textContent = inspecoes.length
                ? `${inspecoes.length} registro(s) encontrado(s)`
                : 'Nenhum registro ainda — clique em Realizar Inspeção';
        }

        if (!inspecoes.length) {
            container.innerHTML = emptyState('📋', 'Nenhuma inspeção registrada',
                'Clique em "Realizar Inspeção" para iniciar a primeira inspeção de rotina.');
            return;
        }

        const groups = groupByDateInsp(inspecoes);
        container.innerHTML = `<div id="insp-registros-grid"></div>`;
        const gridContainer = document.getElementById('insp-registros-grid');

        groups.forEach(group => {
            const groupEl = document.createElement('div');
            groupEl.className = 'n3-date-group';
            groupEl.innerHTML = `
                <div class="n3-date-group__header">
                    <div class="n3-date-group__date">📅 ${group.dateFormatted}</div>
                    <div class="n3-date-group__count">${group.items.length} registro${group.items.length > 1 ? 's' : ''}</div>
                </div>
            `;
            const gridEl = document.createElement('div');
            gridEl.className = 'n3-grid';
            gridEl.innerHTML = group.items.map(r => renderInspecaoCard(r)).join('');
            groupEl.appendChild(gridEl);
            gridContainer.appendChild(groupEl);
        });

        gridContainer.querySelectorAll('.n3-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.n3-card__delete-btn')) return;
                viewInspecao(card.dataset.id);
            });
        });

        if (currentUser && (currentUser.is_master === 1 || currentUser.perfil === 'adm')) {
            gridContainer.querySelectorAll('.n3-card__delete-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteInspecao(btn.dataset.id);
                });
            });
        }

    } catch(err) {
        if (countEl) countEl.textContent = 'Não foi possível carregar os registros';
        container.innerHTML = emptyState('❌', 'Erro ao carregar inspeções', err.message);
    }
}

function groupByDateInsp(records) {
    const map = new Map();
    records.forEach(r => {
        const dateKey = r.data_inspecao || 'sem-data';
        if (!map.has(dateKey)) map.set(dateKey, []);
        map.get(dateKey).push(r);
    });
    const groups = [];
    for (const [dateKey, items] of map) {
        groups.push({
            dateKey,
            dateFormatted: dateKey !== 'sem-data' ? formatBrDate(dateKey) : 'Sem Data',
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

function renderInspecaoCard(r) {
    let respostas = {};
    try { respostas = JSON.parse(r.respostas_json || '{}'); } catch(_){}
    const total = Object.keys(respostas).length;
    const conformes = Object.values(respostas).filter(v => v.resposta === 'ok').length;
    const naoConformes = Object.values(respostas).filter(v => v.resposta === 'nok').length;

    let statusClass = 'insp-card-status--ok';
    let statusLabel = '✅ Conforme';
    if (naoConformes > 0) {
        statusClass = 'insp-card-status--nok';
        statusLabel = `❌ ${naoConformes} Não Conforme${naoConformes > 1 ? 's' : ''}`;
    } else if (total === 0) {
        statusClass = 'insp-card-status--pending';
        statusLabel = '⏳ Pendente';
    }

    const conclusao = r.conclusao_tecnica || '';
    const foto = r.foto_path
        ? `<div class="n3-card__photo" style="background-image:url('${r.foto_path}')"></div>`
        : `<div class="n3-card__photo-placeholder">📋</div>`;

    const isAdm = currentUser && (currentUser.is_master === 1 || currentUser.perfil === 'adm');
    const deleteBtn = isAdm
        ? `<button class="n3-card__delete-btn" data-id="${r.id}" title="Excluir inspeção">🗑️</button>`
        : '';

    return `
        <div class="n3-card insp-card" data-id="${r.id}" role="button" tabindex="0" aria-label="Ver detalhes da inspeção">
            ${deleteBtn}
            ${foto}
            <div class="n3-card__body">
                <div style="margin-bottom:8px;">
                    <span class="insp-card-status ${statusClass}">${statusLabel}</span>
                </div>
                <div class="n3-card__title">${esc(r.caderno_nome || 'Caderno')}</div>
                <div class="n3-card__meta">
                    <span class="n3-card__meta-item">👤 ${esc(r.nome_inspetor)}</span>
                    ${r.local ? `<span class="n3-card__meta-item">📍 ${esc(r.local)}</span>` : ''}
                    ${r.lideranca ? `<span class="n3-card__meta-item">🏢 ${esc(r.lideranca)}</span>` : ''}
                    ${conclusao ? `<span class="n3-card__meta-item">📝 ${esc(conclusao)}</span>` : ''}
                </div>
                <div style="margin-top:var(--space-sm);font-size:var(--font-size-xs);color:var(--color-text-muted);">
                    ${conformes}/${total} conformes
                    ${r.contrato ? ` · Contrato ${esc(r.contrato)}` : ''}
                </div>
            </div>
            <div class="n3-card__footer">
                <div class="n3-card__date">📅 ${formatBrDate(r.data_inspecao)}</div>
                ${r.criado_em ? `<span style="font-size:var(--font-size-xs);color:var(--color-text-muted)">Criado ${formatDateTime(r.criado_em)}</span>` : ''}
            </div>
        </div>
    `;
}

async function viewInspecao(id) {
    const modal = document.getElementById('insp-view-modal');
    const body = document.getElementById('insp-view-body');
    body.innerHTML = spinner();
    modal.classList.remove('hidden');

    try {
        const { inspecao: r, perguntas } = await api.get('/inspecoes/respostas/' + id);
        let respostas = {};
        try { respostas = JSON.parse(r.respostas_json || '{}'); } catch(_){}

        const labels = { ok: '✅ Conforme', nok: '❌ Não Conforme', na: '⬜ Não se aplica' };
        const perguntasHtml = (perguntas || []).map((p, i) => {
            const ans = respostas[p.id] || respostas[String(p.id)] || {};
            return `
                <div class="insp-checklist-item ${p.eh_critico_interditivo ? 'insp-checklist-item--critica' : ''}">
                    <div class="insp-checklist-item__number">${i + 1}</div>
                    <div class="insp-checklist-item__body">
                        <div class="insp-checklist-item__text">${esc(p.texto_pergunta)}</div>
                        <div style="margin-top:6px;font-size:var(--font-size-sm);font-weight:600;">${labels[ans.resposta] || '—'}</div>
                        ${ans.observacao ? `<div style="margin-top:4px;font-size:var(--font-size-xs);color:var(--color-text-muted);">${esc(ans.observacao)}</div>` : ''}
                    </div>
                </div>`;
        }).join('') || '<p style="color:var(--color-text-muted);">Sem itens registrados.</p>';

        const fotos = [r.foto_path, r.foto_2_path, r.foto_3_path].filter(Boolean);
        const fotosHtml = fotos.length
            ? `<div class="insp-fotos-preview">${fotos.map((f, i) => `<div class="insp-foto-thumb" onclick="openInspLightbox(${JSON.stringify(fotos).replace(/"/g, '&quot;')}, ${i})"><img src="${f}" alt="Evidência ${i + 1}"></div>`).join('')}</div>`
            : '<p style="color:var(--color-text-muted);font-size:var(--font-size-sm);">Nenhuma foto anexada.</p>';

        body.innerHTML = `
            <div class="caderno-view__section">
                <div class="caderno-view__label">Caderno</div>
                <div class="caderno-view__value">${esc(r.caderno_nome || '—')}</div>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:var(--space-xl);margin-bottom:var(--space-lg);">
                <div class="caderno-view__section" style="flex:1;min-width:140px;">
                    <div class="caderno-view__label">Inspetor</div>
                    <div class="caderno-view__value">${esc(r.nome_inspetor)} (Mat. ${esc(r.matricula)})</div>
                </div>
                <div class="caderno-view__section" style="flex:1;min-width:120px;">
                    <div class="caderno-view__label">Contrato</div>
                    <div class="caderno-view__value">${esc(r.contrato || r.caderno_contrato || '—')}</div>
                </div>
                <div class="caderno-view__section" style="flex:1;min-width:120px;">
                    <div class="caderno-view__label">Data do registro</div>
                    <div class="caderno-view__value">${formatBrDate(r.data_inspecao)}</div>
                </div>
            </div>
            <div class="form-section__title">Evidências Fotográficas</div>
            ${fotosHtml}
            ${r.data_ocorrido ? `<div class="caderno-view__section" style="margin-top:var(--space-md);"><div class="caderno-view__label">Data do ocorrido</div><div class="caderno-view__value">${formatDateTime(r.data_ocorrido)}</div></div>` : ''}
            ${r.local ? `<div class="caderno-view__section"><div class="caderno-view__label">Local</div><div class="caderno-view__value">${esc(r.local)}</div></div>` : ''}
            ${r.conclusao_tecnica ? `<div class="caderno-view__section"><div class="caderno-view__label">Conclusão técnica</div><div class="caderno-view__value">${esc(r.conclusao_tecnica)}</div></div>` : ''}
            ${r.descricao ? `<div class="caderno-view__section"><div class="caderno-view__label">Descrição</div><div class="caderno-view__value">${esc(r.descricao)}</div></div>` : ''}
            <div class="form-section__title" style="margin-top:var(--space-md);">Itens do caderno</div>
            ${perguntasHtml}
        `;
    } catch (err) {
        body.innerHTML = `<p style="color:#ef4444;text-align:center;padding:var(--space-xl);">Erro: ${esc(err.message)}</p>`;
    }
}

function closeInspViewModal() {
    document.getElementById('insp-view-modal').classList.add('hidden');
}

let inspLightboxFotos = [];
let inspLightboxIndex = 0;

function openInspLightbox(fotos, index) {
    inspLightboxFotos = fotos;
    inspLightboxIndex = index;
    let lb = document.getElementById('insp-lightbox');
    if (!lb) {
        lb = document.createElement('div');
        lb.id = 'insp-lightbox';
        lb.className = 'insp-lightbox';
        lb.innerHTML = `
            <button class="insp-lightbox__close" onclick="closeInspLightbox()" title="Fechar">✕</button>
            <button class="insp-lightbox__nav insp-lightbox__nav--prev" onclick="navInspLightbox(-1)" title="Anterior">❮</button>
            <img class="insp-lightbox__img" src="" alt="Evidência ampliada">
            <button class="insp-lightbox__nav insp-lightbox__nav--next" onclick="navInspLightbox(1)" title="Próxima">❯</button>
            <div class="insp-lightbox__counter"></div>
        `;
        lb.addEventListener('click', (e) => {
            if (e.target === lb) closeInspLightbox();
        });
        document.body.appendChild(lb);
    }
    renderInspLightbox();
    requestAnimationFrame(() => lb.classList.add('insp-lightbox--active'));
    document.addEventListener('keydown', inspLightboxKeyHandler);
}

function renderInspLightbox() {
    const lb = document.getElementById('insp-lightbox');
    if (!lb) return;
    lb.querySelector('.insp-lightbox__img').src = inspLightboxFotos[inspLightboxIndex];
    lb.querySelector('.insp-lightbox__counter').textContent = `${inspLightboxIndex + 1} / ${inspLightboxFotos.length}`;
    const prev = lb.querySelector('.insp-lightbox__nav--prev');
    const next = lb.querySelector('.insp-lightbox__nav--next');
    prev.style.display = inspLightboxFotos.length > 1 ? '' : 'none';
    next.style.display = inspLightboxFotos.length > 1 ? '' : 'none';
}

function navInspLightbox(dir) {
    inspLightboxIndex = (inspLightboxIndex + dir + inspLightboxFotos.length) % inspLightboxFotos.length;
    renderInspLightbox();
}

function closeInspLightbox() {
    const lb = document.getElementById('insp-lightbox');
    if (lb) lb.classList.remove('insp-lightbox--active');
    document.removeEventListener('keydown', inspLightboxKeyHandler);
}

function inspLightboxKeyHandler(e) {
    if (e.key === 'Escape') closeInspLightbox();
    else if (e.key === 'ArrowLeft') navInspLightbox(-1);
    else if (e.key === 'ArrowRight') navInspLightbox(1);
}

async function deleteInspecao(id) {
    if (!confirm('Tem certeza que deseja excluir esta inspeção?\nEsta ação é irreversível.')) return;

    try {
        const res = await api.delete('/inspecoes/respostas/' + id);
        showToast(res.message || 'Inspeção removida com sucesso.', 'success');
        loadRegistrosTab();
    } catch (err) {
        showToast(err.message || 'Erro ao excluir inspeção.', 'error');
    }
}

// ═══════════════════════════════════════════════════
//  MODAL: Realizar Inspeção (rolagem vertical)
// ═══════════════════════════════════════════════════
let inspPerguntasCache = [];
const INSP_CONCLUSAO = {
    CONFORME: 'Em Conformidade',
    INTERDICAO: 'Interdição',
    VER_AGIR: 'Ver e Agir',
    NOTIFICACAO: 'Notificação'
};

async function openNovaInspecaoModal() {
    inspPerguntasCache = [];

    document.getElementById('insp-data-registro').value = new Date().toISOString().slice(0, 10);
    document.getElementById('insp-data-ocorrido').value = '';
    document.getElementById('insp-descricao').value = '';
    document.getElementById('insp-checklist-container').style.display = 'none';
    document.getElementById('insp-checklist-perguntas').innerHTML = '';
    resetInspPhotoSlot('insp-upload-zone-1', 'insp-foto-input', 'insp-preview-1');
    resetInspPhotoSlot('insp-upload-zone-2', 'insp-foto-2-input', 'insp-preview-2');
    resetInspPhotoSlot('insp-upload-zone-3', 'insp-foto-3-input', 'insp-preview-3');
    applyInspConclusao();

    const contratoSel = document.getElementById('insp-contrato');
    const isAdm = currentUser.is_master === 1 || currentUser.perfil === 'adm';

    try {
        const contratos = await api.get('/users/contratos-ativos');
        contratoSel.innerHTML = '<option value="">Selecione...</option>';
        contratos.forEach(c => {
            const val = String(c).trim();
            if (val) contratoSel.innerHTML += `<option value="${esc(val)}">Contrato ${esc(val)}</option>`;
        });
        if (currentUser.contrato) {
            if (![...contratoSel.options].some(o => o.value === currentUser.contrato)) {
                contratoSel.innerHTML += `<option value="${esc(currentUser.contrato)}">Contrato ${esc(currentUser.contrato)}</option>`;
            }
            contratoSel.value = currentUser.contrato;
        }
    } catch(_){}

    contratoSel.disabled = !isAdm && !!currentUser.contrato;
    contratoSel.style.background = contratoSel.disabled ? 'var(--color-bg-hover)' : '';
    contratoSel.style.cursor = contratoSel.disabled ? 'not-allowed' : '';

    await loadInspLiderancas();
    await loadInspLocaisVps();

    try {
        const cadernos = await api.get('/cadernos?status=ativo');
        const sel = document.getElementById('insp-caderno-select');
        sel.innerHTML = '<option value="">Selecione o caderno...</option>';
        cadernos.forEach(c => {
            sel.innerHTML += `<option value="${c.id}">${esc(c.nome)}${c.contrato ? ' (Contrato ' + esc(c.contrato) + ')' : ''} — ${c.total_perguntas} itens</option>`;
        });
        if (!cadernos.length) {
            sel.innerHTML = '<option value="">Nenhum caderno ativo disponível</option>';
        }
    } catch(_){
        document.getElementById('insp-caderno-select').innerHTML = '<option value="">Nenhum caderno disponível</option>';
    }

    const modal = document.getElementById('nova-inspecao-modal');
    modal.classList.remove('hidden');
    const scroll = modal.querySelector('.modal-scroll-body');
    if (scroll) scroll.scrollTop = 0;
}

function closeNovaInspecaoModal() {
    document.getElementById('nova-inspecao-modal').classList.add('hidden');
}

async function loadInspLiderancas() {
    const contrato = document.getElementById('insp-contrato').value;
    const sel = document.getElementById('insp-lideranca');
    if (!contrato) {
        sel.innerHTML = '<option value="">Selecione o contrato primeiro...</option>';
        return;
    }

    sel.innerHTML = '<option value="">Carregando lideranças...</option>';
    try {
        const liderancas = await api.get('/users/liderancas/' + encodeURIComponent(contrato));
        if (!liderancas.length) {
            sel.innerHTML = '<option value="">Nenhuma liderança neste contrato</option>';
            return;
        }
        sel.innerHTML = '<option value="">Selecione a liderança...</option>';
        liderancas.forEach(lid => {
            sel.innerHTML += `<option value="${esc(lid.nome)}">${esc(lid.nome)} (Mat. ${esc(lid.matricula)})</option>`;
        });
        if (currentUser.lideranca && [...sel.options].some(o => o.value === currentUser.lideranca)) {
            sel.value = currentUser.lideranca;
        }
    } catch (_) {
        sel.innerHTML = '<option value="">Erro ao carregar lideranças</option>';
    }
}

async function loadInspLocaisVps() {
    const sel = document.getElementById('insp-local');
    sel.innerHTML = '<option value="">Carregando obras / SS...</option>';
    try {
        const canteiros = await api.get('/vps/canteiros');
        if (!canteiros || !canteiros.length) {
            sel.innerHTML = '<option value="">Nenhuma obra cadastrada na Maturidade VPS</option>';
            return;
        }
        sel.innerHTML = '<option value="">Selecione o local / SS...</option>';
        canteiros.forEach(c => {
            if (!c.nome) return;
            const status = c.status ? ` — ${c.status}` : '';
            sel.innerHTML += `<option value="${esc(c.nome)}">${esc(c.nome)}${esc(status)}</option>`;
        });
    } catch (_) {
        sel.innerHTML = '<option value="">Erro ao carregar locais da Maturidade VPS</option>';
    }
}

function collectInspAnswers() {
    const items = document.querySelectorAll('#insp-checklist-perguntas .insp-checklist-item');
    let unanswered = 0;
    let criticalNok = 0;
    let simpleNok = 0;
    const respostas = {};

    items.forEach(q => {
        const pid = q.dataset.perguntaId;
        const sel = q.querySelector('.checklist-option.selected');
        const obs = (q.querySelector('textarea') || {}).value || '';
        const valor = sel ? sel.dataset.value : null;
        respostas[pid] = { resposta: valor, observacao: obs.trim() || null };
        if (!valor) unanswered++;
        else if (valor === 'nok') {
            if (q.classList.contains('insp-checklist-item--critica')) criticalNok++;
            else simpleNok++;
        }
    });

    return { items, unanswered, criticalNok, simpleNok, respostas };
}

function deriveInspConclusao(snapshot) {
    if (!snapshot.items.length) {
        return { mode: 'pending', allowed: [], hint: 'Responda todos os itens do caderno para definir a conclusão técnica.' };
    }
    if (snapshot.criticalNok > 0) {
        return {
            mode: 'locked',
            allowed: [INSP_CONCLUSAO.INTERDICAO],
            hint: 'Item crítico de interdição marcado como Não Conforme. Conclusão definida automaticamente como Interdição.'
        };
    }
    if (snapshot.unanswered > 0) {
        return { mode: 'pending', allowed: [], hint: 'Responda todos os itens do caderno para definir a conclusão técnica.' };
    }
    if (snapshot.simpleNok > 0) {
        return {
            mode: 'choice',
            allowed: [INSP_CONCLUSAO.VER_AGIR, INSP_CONCLUSAO.NOTIFICACAO],
            hint: 'Há não conformidade sem interdição. Escolha Ver e Agir (correção imediata) ou Notificação (acompanhamento formal).'
        };
    }
    return {
        mode: 'locked',
        allowed: [INSP_CONCLUSAO.CONFORME],
        hint: 'Todos os itens estão em conformidade. Conclusão definida automaticamente.'
    };
}

function applyInspConclusao() {
    const sel = document.getElementById('insp-conclusao');
    const hint = document.getElementById('insp-conclusao-hint');
    if (!sel) return;

    const derived = deriveInspConclusao(collectInspAnswers());
    const previous = sel.value;

    sel.innerHTML = derived.allowed.length
        ? derived.allowed.map(v => `<option value="${v}">${v}</option>`).join('')
        : '<option value="">Responda os itens do caderno...</option>';

    sel.classList.remove('insp-conclusao--interdicao');

    if (derived.mode === 'locked') {
        sel.value = derived.allowed[0];
        sel.disabled = true;
        sel.style.background = 'var(--color-bg-hover)';
        sel.style.cursor = 'not-allowed';
        if (derived.allowed[0] === INSP_CONCLUSAO.INTERDICAO) {
            sel.classList.add('insp-conclusao--interdicao');
            sel.style.background = '#fef2f2';
            sel.style.borderColor = '#ef4444';
            sel.style.color = '#991b1b';
        }
    } else if (derived.mode === 'choice') {
        sel.disabled = false;
        sel.style.background = '';
        sel.style.borderColor = '';
        sel.style.color = '';
        sel.style.cursor = '';
        sel.insertAdjacentHTML('afterbegin', '<option value="">Selecione Ver e Agir ou Notificação...</option>');
        sel.value = derived.allowed.includes(previous) ? previous : '';
    } else {
        sel.disabled = true;
        sel.value = '';
        sel.style.background = 'var(--color-bg-hover)';
        sel.style.borderColor = '';
        sel.style.color = '';
        sel.style.cursor = 'not-allowed';
    }

    if (hint) hint.textContent = derived.hint;
}

async function inspLoadPerguntas() {
    const cadernoId = document.getElementById('insp-caderno-select').value;
    const container = document.getElementById('insp-checklist-container');
    const list = document.getElementById('insp-checklist-perguntas');

    if (!cadernoId) {
        container.style.display = 'none';
        inspPerguntasCache = [];
        applyInspConclusao();
        return;
    }

    list.innerHTML = '<div style="text-align:center;padding:var(--space-lg);"><div class="spinner" style="width:24px;height:24px;border-width:2px;margin:0 auto;"></div></div>';
    container.style.display = 'block';

    try {
        const resp = await api.get('/cadernos/' + cadernoId);
        inspPerguntasCache = resp.perguntas || [];

        if (!inspPerguntasCache.length) {
            list.innerHTML = '<p style="color:var(--color-text-muted);text-align:center;padding:var(--space-md);">Este caderno não possui perguntas.</p>';
            applyInspConclusao();
            return;
        }

        list.innerHTML = inspPerguntasCache.map((p, i) => `
            <div class="insp-checklist-item ${p.eh_critico_interditivo ? 'insp-checklist-item--critica' : ''}" data-pergunta-id="${p.id}">
                <div class="insp-checklist-item__number">${i + 1}</div>
                <div class="insp-checklist-item__body">
                    <div class="insp-checklist-item__text">${esc(p.texto_pergunta)}</div>
                    ${p.eh_critico_interditivo ? '<span class="insp-checklist-item__badge">⚠️ Crítica para interdição</span>' : ''}
                    <div class="insp-checklist-item__options">
                        <button type="button" class="checklist-option" data-value="ok" onclick="inspSelectOption(this)">✅ Conforme</button>
                        <button type="button" class="checklist-option" data-value="nok" onclick="inspSelectOption(this)">❌ Não Conforme</button>
                        <button type="button" class="checklist-option" data-value="na" onclick="inspSelectOption(this)">⬜ Não Se Aplica</button>
                    </div>
                    <div class="insp-checklist-item__obs">
                        <textarea placeholder="Observação (opcional)" rows="1"></textarea>
                    </div>
                </div>
            </div>
        `).join('');
        applyInspConclusao();
    } catch(err) {
        list.innerHTML = `<p style="color:#ef4444;text-align:center;padding:var(--space-md);">Erro ao carregar perguntas: ${esc(err.message)}</p>`;
        applyInspConclusao();
    }
}

function inspSelectOption(btn) {
    const group = btn.closest('.insp-checklist-item__options');
    group.querySelectorAll('.checklist-option').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');

    const item = btn.closest('.insp-checklist-item');
    if (item.classList.contains('insp-checklist-item--critica') && btn.dataset.value === 'nok') {
        showToast('ATENÇÃO: Não conforme em item crítico — conclusão será Interdição.', 'warning', 6000);
    }
    applyInspConclusao();
}

function setupInspPhotoUpload(zoneId, inputId, previewId) {
    const zone    = document.getElementById(zoneId);
    const input   = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    if (!zone || !input || !preview) return;

    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        if (e.dataTransfer.files.length) {
            const dt = new DataTransfer();
            dt.items.add(e.dataTransfer.files[0]);
            input.files = dt.files;
            showInspPreview(input.files[0], preview, zone);
        }
    });
    input.addEventListener('change', () => {
        if (input.files[0]) showInspPreview(input.files[0], preview, zone);
    });
}

function showInspPreview(file, previewDiv, zone) {
    const reader = new FileReader();
    reader.onload = e => {
        previewDiv.style.display = 'grid';
        previewDiv.innerHTML = `
            <div class="photo-preview-item">
                <img src="${e.target.result}" alt="Preview da evidência">
                <button type="button" class="photo-preview-remove" aria-label="Remover foto">✕</button>
            </div>
        `;
        zone.style.display = 'none';
        previewDiv.querySelector('.photo-preview-remove').addEventListener('click', () => {
            resetInspPhotoSlot(zone.id, zone.querySelector('input[type="file"]').id, previewDiv.id);
        });
    };
    reader.readAsDataURL(file);
}

function resetInspPhotoSlot(zoneId, inputId, previewId) {
    const zone = document.getElementById(zoneId);
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    if (preview) { preview.innerHTML = ''; preview.style.display = 'none'; }
    if (zone) zone.style.display = '';
    if (input) {
        const dt = new DataTransfer();
        input.files = dt.files;
        input.value = '';
    }
}

async function submitNovaInspecao() {
    const cadernoId = document.getElementById('insp-caderno-select').value;
    const contrato = document.getElementById('insp-contrato').value;
    const lideranca = document.getElementById('insp-lideranca').value;
    const local = document.getElementById('insp-local').value;
    const snapshot = collectInspAnswers();
    const derived = deriveInspConclusao(snapshot);
    const conclusao = document.getElementById('insp-conclusao').value;

    if (!contrato) { showToast('Selecione o contrato.', 'warning'); return; }
    if (!lideranca) { showToast('Selecione a liderança do mesmo contrato.', 'warning'); return; }
    if (!local) { showToast('Selecione o Local / SS cadastrado na Maturidade VPS.', 'warning'); return; }
    if (!cadernoId) { showToast('Selecione um caderno.', 'warning'); return; }
    if (!inspPerguntasCache.length) { showToast('O caderno selecionado não possui itens.', 'warning'); return; }
    if (snapshot.unanswered > 0) {
        showToast(`Responda todas as perguntas. ${snapshot.unanswered} restante(s).`, 'warning');
        return;
    }
    if (!conclusao) {
        showToast('A Conclusão Técnica é obrigatória.', 'warning');
        return;
    }
    if (!derived.allowed.includes(conclusao)) {
        showToast('Selecione a conclusão técnica conforme as respostas do caderno.', 'warning');
        return;
    }
    const foto1File = document.getElementById('insp-foto-input').files[0];
    if (!foto1File) {
        showToast('A Foto 1 (evidência inicial) é obrigatória.', 'warning');
        return;
    }

    const btn = document.getElementById('insp-btn-submit');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;border-top-color:#fff;margin-right:6px;"></span>Salvando...';

    try {
        const formData = new FormData();
        formData.append('caderno_id', cadernoId);
        formData.append('data_inspecao', document.getElementById('insp-data-registro').value);
        formData.append('data_ocorrido', document.getElementById('insp-data-ocorrido').value || '');
        formData.append('contrato', contrato);
        formData.append('lideranca', lideranca);
        formData.append('local', local);
        formData.append('descricao', document.getElementById('insp-descricao').value || '');
        formData.append('conclusao_tecnica', conclusao);
        formData.append('respostas_json', JSON.stringify(snapshot.respostas));

        const foto2 = document.getElementById('insp-foto-2-input').files[0];
        const foto3 = document.getElementById('insp-foto-3-input').files[0];
        formData.append('foto', foto1File);
        if (foto2) formData.append('foto_2', foto2);
        if (foto3) formData.append('foto_3', foto3);

        await api.upload('/inspecoes/respostas', formData);

        showToast('Inspeção registrada com sucesso!', 'success');
        closeNovaInspecaoModal();
        loadRegistrosTab();
    } catch(err) {
        showToast('Erro ao salvar: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Registrar Inspeção';
    }
}

async function selectCadernoForChecklist(cadernoId) {
    const container = document.getElementById('registros-content');
    container.innerHTML = spinner();

    try {
        const resp = await api.get('/cadernos/' + cadernoId);
        const { caderno, perguntas } = resp;

        if (!perguntas.length) {
            container.innerHTML = `
                <button class="btn-back" onclick="loadRegistrosTab()">← Voltar</button>
                ${emptyState('📝', 'Nenhuma pergunta cadastrada', 'Este caderno ainda não possui perguntas.')}`;
            return;
        }

        container.innerHTML = `
            <button class="btn-back" onclick="loadRegistrosTab()">← Voltar à seleção</button>
            <div class="checklist-container">
                <div class="checklist-header">
                    <div class="checklist-header__title">📒 ${esc(caderno.nome)}</div>
                    <div class="checklist-header__meta">
                        <span>📋 ${perguntas.length} pergunta${perguntas.length !== 1 ? 's' : ''}</span>
                        ${caderno.contrato ? `<span>📑 Contrato ${caderno.contrato}</span>` : ''}
                        <span>👤 ${currentUser.nome}</span>
                        <span>📅 ${new Date().toLocaleDateString('pt-BR')}</span>
                    </div>
                </div>
                <form id="checklist-form" class="checklist-form">
                    <input type="hidden" name="caderno_id" value="${caderno.id}">
                    <div style="margin-bottom:var(--space-lg);">
                        <label class="form-label" for="checklist-local">📍 Local da Inspeção</label>
                        <input type="text" id="checklist-local" class="form-input" placeholder="Ex: Canteiro de obras, Escritório, Pátio...">
                    </div>
                    ${perguntas.map((p, i) => `
                        <div class="checklist-question ${p.eh_critico_interditivo ? 'checklist-question--critica' : ''}" data-pergunta-id="${p.id}">
                            <div class="checklist-question__number">${i + 1}</div>
                            <div class="checklist-question__body">
                                <div class="checklist-question__text">${esc(p.texto_pergunta)}</div>
                                ${p.eh_critico_interditivo ? '<span class="checklist-question__badge">⚠️ Crítica para interdição</span>' : ''}
                                <div class="checklist-question__options">
                                    <button type="button" class="checklist-option" data-value="ok" onclick="selectOption(this)">✅ Conforme</button>
                                    <button type="button" class="checklist-option" data-value="nok" onclick="selectOption(this)">❌ Não Conforme</button>
                                    <button type="button" class="checklist-option" data-value="na" onclick="selectOption(this)">⬜ Não Se Aplica</button>
                                </div>
                                <div class="checklist-question__obs">
                                    <textarea placeholder="Observações (opcional)" rows="2"></textarea>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                    <div style="margin-top:var(--space-lg);">
                        <label class="form-label" for="checklist-observacoes">📝 Observações Gerais</label>
                        <textarea id="checklist-observacoes" class="form-input" rows="3" placeholder="Observações adicionais..."></textarea>
                    </div>
                    <div style="margin-top:var(--space-xl); display:flex; justify-content:flex-end; gap:var(--space-md);">
                        <button type="button" class="btn btn--secondary" onclick="loadRegistrosTab()">Cancelar</button>
                        <button type="button" class="btn btn--primary" onclick="submitChecklist()">📋 Registrar Inspeção</button>
                    </div>
                </form>
            </div>
        `;
    } catch(err) {
        container.innerHTML = `
            <button class="btn-back" onclick="loadRegistrosTab()">← Voltar</button>
            ${emptyState('❌', 'Erro ao carregar caderno', err.message)}`;
    }
}

function selectOption(btn) {
    const group = btn.closest('.checklist-question__options');
    group.querySelectorAll('.checklist-option').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');

    const question = btn.closest('.checklist-question');
    if (question.classList.contains('checklist-question--critica') && btn.dataset.value === 'nok') {
        showToast('⚠️ ATENÇÃO: Resposta NÃO CONFORME em pergunta crítica de interdição!', 'warning', 6000);
    }
}

async function submitChecklist() {
    const form = document.getElementById('checklist-form');
    if (!form) return;

    const cadernoId   = form.querySelector('[name="caderno_id"]').value;
    const local       = document.getElementById('checklist-local').value.trim();
    const observacoes = document.getElementById('checklist-observacoes').value.trim();

    const respostas = {};
    let hasCriticalNok = false;

    form.querySelectorAll('.checklist-question').forEach(q => {
        const pid = q.dataset.perguntaId;
        const sel = q.querySelector('.checklist-option.selected');
        const obs = q.querySelector('textarea').value.trim();
        respostas[pid] = { resposta: sel ? sel.dataset.value : null, observacao: obs || null };
        if (q.classList.contains('checklist-question--critica') && sel && sel.dataset.value === 'nok') {
            hasCriticalNok = true;
        }
    });

    const unanswered = Object.values(respostas).filter(r => !r.resposta).length;
    if (unanswered > 0) {
        showToast(`Responda todas as perguntas. ${unanswered} restante(s).`, 'warning');
        return;
    }

    if (hasCriticalNok) {
        if (!confirm('⚠️ ATENÇÃO: Existem respostas NÃO CONFORME em perguntas críticas de interdição.\n\nA inspeção será registrada com alerta de interdição.\n\nDeseja prosseguir?')) return;
    }

    try {
        await api.post('/inspecoes/respostas', {
            caderno_id: cadernoId,
            local: local || null,
            respostas_json: JSON.stringify(respostas),
            observacoes: observacoes || null
        });
        showToast('✅ Inspeção registrada com sucesso!', 'success');
        loadRegistrosTab();
    } catch(err) {
        showToast('Erro ao registrar: ' + err.message, 'error');
    }
}

// ═══════════════════════════════════════════════════
//  ABA 3: GESTÃO DE CADERNOS (ADM) — Tabela + Lixeira
// ═══════════════════════════════════════════════════
async function loadCadernosTab() {
    const container = document.getElementById('cadernos-content');
    container.innerHTML = spinner('Carregando cadernos...');

    try {
        allCadernos = await api.get('/cadernos');
        renderCadernosTab(container);
    } catch(err) {
        container.innerHTML = emptyState('❌', 'Erro ao carregar cadernos', err.message);
    }
}

function renderCadernosTab(container) {
    const q = (document.getElementById('caderno-search') || {}).value || '';
    const filtered = allCadernos.filter(c => !q || c.nome.toLowerCase().includes(q.toLowerCase()));

    container.innerHTML = `
        <h3 class="insp-section-title">Cadernos de Inspeção — Disponíveis</h3>
        <div class="insp-toolbar">
            <div class="insp-search">
                <span class="insp-search__icon">🔍</span>
                <input type="text" class="insp-search__input" id="caderno-search" placeholder="Buscar caderno..." value="${esc(q)}" oninput="filterCadernos()">
            </div>
            <button class="btn btn--primary" onclick="openCadernoModal()">+ Adicionar Caderno</button>
        </div>

        ${filtered.length ? `
            <div class="insp-table-wrap">
                <table class="insp-table">
                    <thead>
                        <tr>
                            <th>Nome</th>
                            <th>Status</th>
                            <th>Qtd. Itens</th>
                            <th>Data de Criação</th>
                            <th style="width:50px;"></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filtered.map(c => `
                            <tr>
                                <td><strong>${esc(c.nome)}</strong>${c.contrato ? `<br><span style="font-size:11px;color:var(--color-text-muted);">Contrato ${esc(c.contrato)}</span>` : ''}</td>
                                <td><span class="insp-status insp-status--${c.status}">${c.status === 'ativo' ? '● Ativo' : '● Inativo'}</span></td>
                                <td>${c.total_perguntas} item${c.total_perguntas !== 1 ? 's' : ''}</td>
                                <td>${formatBrDate(c.created_at)}</td>
                                <td>
                                    <div class="insp-actions">
                                        <button class="insp-actions__btn" onclick="toggleMenu(event, '${c.id}')" title="Ações">⋮</button>
                                        <div class="insp-actions__menu" id="menu-${c.id}">
                                            <button class="insp-actions__menu-item" onclick="viewCaderno('${c.id}')">👁️ Visualizar</button>
                                            ${c.status === 'ativo'
                                                ? `<button class="insp-actions__menu-item" onclick="desativarCaderno('${c.id}')">⏸️ Desativar</button>`
                                                : `<button class="insp-actions__menu-item insp-actions__menu-item--danger" onclick="excluirCaderno('${c.id}')">🗑️ Excluir</button>`
                                            }
                                            <button class="insp-actions__menu-item" onclick="duplicateCaderno('${c.id}')">📋 Duplicar</button>
                                            <button class="insp-actions__menu-item" onclick="openCadernoModal('${c.id}')">✏️ Editar</button>
                                            <button class="insp-actions__menu-item" onclick="openHistoricoModal('${c.id}')">📜 Histórico</button>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div style="margin-top:var(--space-md); font-size:var(--font-size-xs); color:var(--color-text-muted);">
                ${filtered.length} caderno(s) encontrado(s) · ${allCadernos.length} total
            </div>
        ` : `
            <div class="empty-state" style="padding:60px var(--space-xl);">
                <div class="empty-state__icon">📒</div>
                <div class="empty-state__title">${q ? 'Nenhum resultado para "' + esc(q) + '"' : 'Nenhum caderno criado'}</div>
                <div class="empty-state__desc">${q ? 'Tente outro termo de busca.' : 'Clique em "+ Adicionar Caderno" para criar o primeiro modelo.'}</div>
            </div>
        `}

        <div id="lixeira-section"></div>
    `;

    loadLixeiraSection();
}

function filterCadernos() {
    renderCadernosTab(document.getElementById('cadernos-content'));
}

// ═══════════════════════════════════════════════════
//  LIXEIRA (seção inferior na aba de cadernos)
// ═══════════════════════════════════════════════════
async function loadLixeiraSection() {
    const section = document.getElementById('lixeira-section');
    if (!section) return;

    let lixeira = [];
    let fetchError = false;
    try {
        lixeira = await api.get('/cadernos/lixeira');
    } catch(_) {
        fetchError = true;
    }

    const count = lixeira.length;
    const titleText = fetchError
        ? 'Lixeira — Cadernos Excluídos'
        : `Lixeira — Cadernos Excluídos (${count} item${count !== 1 ? 's' : ''})`;

    let rows = '';
    if (fetchError) {
        rows = `<tr><td colspan="5" style="text-align:center;color:var(--color-text-muted);padding:var(--space-xl);">Erro ao carregar lixeira.</td></tr>`;
    } else if (count === 0) {
        rows = `<tr><td colspan="5" style="text-align:center;color:var(--color-text-muted);padding:var(--space-xl);">Nenhum caderno na lixeira.</td></tr>`;
    } else {
        rows = lixeira.map(c => {
            const excluidoEm = new Date(c.excluido_em);
            const expiraEm = new Date(excluidoEm.getTime() + 7 * 24 * 60 * 60 * 1000);
            const expiraStr = expiraEm.toLocaleDateString('pt-BR');
            const labelExcluidoPor = c.excluido_por_nome
                ? `${c.excluido_por_nome} (Mat. ${esc(c.excluido_por || '')})`
                : esc(c.excluido_por || '—');
            return `
                <tr>
                    <td><strong>${esc(c.nome)}</strong>${c.contrato ? `<br><span style="font-size:11px;color:var(--color-text-muted);">Contrato ${esc(c.contrato)}</span>` : ''}</td>
                    <td>${labelExcluidoPor}</td>
                    <td>${formatDateTime(c.excluido_em)}</td>
                    <td>${expiraStr}</td>
                    <td>
                        <button class="btn btn--primary btn--sm" onclick="recuperarCaderno('${c.id}')">♻️ Recuperar</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    section.innerHTML = `
        <div class="lixeira-section">
            <div class="lixeira-header">
                <span class="lixeira-header__icon">🗑️</span>
                <span class="lixeira-header__title">${titleText}</span>
            </div>
            <div class="lixeira-body">
                <table class="insp-table lixeira-table">
                    <thead>
                        <tr>
                            <th>Nome do Caderno</th>
                            <th>Excluído por</th>
                            <th>Data de Exclusão</th>
                            <th>Expira em</th>
                            <th style="width:120px;">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

async function recuperarCaderno(id) {
    if (!confirm('Recuperar este caderno da lixeira?\nEle voltará como "Inativo" e precisará ser reativado.')) return;

    try {
        await api.post('/cadernos/' + id + '/restaurar');
        showToast('✅ Caderno recuperado com sucesso!', 'success');
        loadCadernosTab();
    } catch(err) {
        showToast('Erro ao recuperar: ' + err.message, 'error');
    }
}

// ═══════════════════════════════════════════════════
//  MENU DE AÇÕES (Três Pontos)
// ═══════════════════════════════════════════════════
function toggleMenu(e, id) {
    e.preventDefault();
    e.stopPropagation();
    const menu = document.getElementById('menu-' + id);
    if (!menu) return;
    const wasOpen = menu.classList.contains('open');
    closeAllMenus();
    if (!wasOpen) {
        menu.classList.add('open');
    }
}

function closeAllMenus() {
    document.querySelectorAll('.insp-actions__menu').forEach(m => m.classList.remove('open'));
}

// ═══════════════════════════════════════════════════
//  MODAL: Visualizar Caderno (somente leitura)
// ═══════════════════════════════════════════════════
async function viewCaderno(id) {
    closeAllMenus();
    const modal = document.getElementById('caderno-view-modal');
    const body  = document.getElementById('caderno-view-body');
    body.innerHTML = spinner();
    modal.classList.remove('hidden');

    try {
        const { caderno, perguntas } = await api.get('/cadernos/' + id);

        const criadorLabel = caderno.criado_por_nome
            ? `${caderno.criado_por_nome} (Mat. ${esc(caderno.criado_por || '')})`
            : esc(caderno.criado_por || '—');

        body.innerHTML = `
            <div class="caderno-view__section">
                <div class="caderno-view__label">Nome</div>
                <div class="caderno-view__value">${esc(caderno.nome)}</div>
            </div>
            <div style="display:flex; gap:var(--space-xl); margin-bottom:var(--space-lg);">
                <div class="caderno-view__section" style="flex:1;">
                    <div class="caderno-view__label">Contrato</div>
                    <div class="caderno-view__value">${caderno.contrato ? esc(caderno.contrato) : '—'}</div>
                </div>
                <div class="caderno-view__section" style="flex:1;">
                    <div class="caderno-view__label">Status</div>
                    <div class="caderno-view__value"><span class="insp-status insp-status--${caderno.status}">${caderno.status === 'ativo' ? '● Ativo' : '● Inativo'}</span></div>
                </div>
                <div class="caderno-view__section" style="flex:1;">
                    <div class="caderno-view__label">Criado por</div>
                    <div class="caderno-view__value">${criadorLabel}</div>
                </div>
            </div>
            <div class="caderno-view__section">
                <div class="caderno-view__label">Itens / Perguntas (${perguntas.length})</div>
                ${perguntas.length ? `
                    <ul class="caderno-view__perguntas">
                        ${perguntas.map((p, i) => `
                            <li>
                                <span class="num">${i + 1}.</span>
                                <span>${esc(p.texto_pergunta)}</span>
                                ${p.eh_critico_interditivo ? '<span class="interditivo">Interditivo</span>' : ''}
                            </li>
                        `).join('')}
                    </ul>
                ` : '<p style="color:var(--color-text-muted); font-size:var(--font-size-sm);">Nenhuma pergunta cadastrada.</p>'}
            </div>
        `;
    } catch(err) {
        body.innerHTML = `<p style="color:#ef4444; text-align:center; padding:var(--space-xl);">Erro: ${esc(err.message)}</p>`;
    }
}

function closeViewModal() {
    document.getElementById('caderno-view-modal').classList.add('hidden');
}

// ═══════════════════════════════════════════════════
//  MODAL: Criar / Editar Caderno
// ═══════════════════════════════════════════════════
async function openCadernoModal(cadernoId = null) {
    closeAllMenus();
    perguntasEditing = [];

    const modal       = document.getElementById('caderno-modal');
    const title       = document.getElementById('caderno-modal-title');
    const nomeInput   = document.getElementById('caderno-nome');
    const contratoSel = document.getElementById('caderno-contrato');
    const editIdInput = document.getElementById('caderno-edit-id');
    const statusGroup = document.getElementById('caderno-status-group');
    const statusSelect = document.getElementById('caderno-status');
    const subSel      = document.getElementById('caderno-subcategoria');
    const catInput    = document.getElementById('caderno-categoria');

    nomeInput.value = '';
    editIdInput.value = '';
    catInput.value = '';
    subSel.innerHTML = '<option value="">Selecione a subcategoria...</option>';
    INSP_SUBCATEGORIAS.forEach(s => {
        subSel.innerHTML += `<option value="${esc(s)}">${esc(s)}</option>`;
    });
    renderPerguntasList();

    // Carregar contratos
    try {
        const contratos = await api.get('/users/contratos-ativos');
        contratoSel.innerHTML = '<option value="">Todos</option>';
        contratos.forEach(c => {
            const clean = String(c).replace(/[^0-9a-zA-Z]/g, '') || String(c).trim();
            if (clean) contratoSel.innerHTML += `<option value="${clean}">Contrato ${clean}</option>`;
        });
    } catch(_) {}

    if (cadernoId) {
        title.textContent = 'Editar Caderno de Inspeção';
        editIdInput.value = cadernoId;
        statusGroup.style.display = 'block';

        try {
            const { caderno, perguntas } = await api.get('/cadernos/' + cadernoId);
            nomeInput.value = caderno.nome;
            if (caderno.contrato) contratoSel.value = caderno.contrato;
            statusSelect.value = caderno.status;
            if (caderno.subcategoria) {
                subSel.value = caderno.subcategoria;
                catInput.value = INSP_SUBCATEGORIA_TO_CATEGORIA[caderno.subcategoria] || caderno.categoria || '';
            } else if (caderno.categoria) {
                catInput.value = caderno.categoria;
            }

            perguntasEditing = perguntas.map(p => ({
                id: p.id,
                texto_pergunta: p.texto_pergunta,
                eh_critico_interditivo: p.eh_critico_interditivo
            }));
            renderPerguntasList();
        } catch(err) {
            showToast('Erro ao carregar caderno: ' + err.message, 'error');
            return;
        }
    } else {
        title.textContent = 'Novo Caderno de Inspeção';
        statusGroup.style.display = 'none';
        statusSelect.value = 'ativo';
    }

    modal.classList.remove('hidden');
    nomeInput.focus();
}

function closeCadernoModal() {
    document.getElementById('caderno-modal').classList.add('hidden');
    perguntasEditing = [];
}

function renderPerguntasList() {
    const list  = document.getElementById('caderno-perguntas-list');
    const empty = document.getElementById('perguntas-empty');
    const counter = document.getElementById('perguntas-counter');

    counter.textContent = perguntasEditing.length + ' pergunta(s)';

    if (!perguntasEditing.length) {
        list.innerHTML = '<div class="caderno-perguntas-empty" id="perguntas-empty">Nenhuma pergunta adicionada. Use o campo abaixo para adicionar.</div>';
        return;
    }

    list.innerHTML = perguntasEditing.map((p, i) => `
        <div class="caderno-pergunta-item">
            <span class="caderno-pergunta-item__num">${i + 1}.</span>
            <span class="caderno-pergunta-item__text">${esc(p.texto_pergunta)}</span>
            ${p.eh_critico_interditivo ? '<span class="caderno-pergunta-item__critica">Interditivo</span>' : ''}
            <button type="button" class="caderno-pergunta-item__remove" onclick="removePerguntaFromModal(${i})" title="Remover">✕</button>
        </div>
    `).join('');
}

function addPerguntaToModal() {
    const input  = document.getElementById('nova-pergunta-input');
    const check  = document.getElementById('nova-pergunta-critica');
    const texto  = input.value.trim();

    if (!texto) {
        showToast('Digite o texto da pergunta.', 'warning');
        input.focus();
        return;
    }

    perguntasEditing.push({
        texto_pergunta: texto,
        eh_critico_interditivo: check.checked ? 1 : 0
    });

    input.value = '';
    check.checked = false;
    renderPerguntasList();
    input.focus();
}

function removePerguntaFromModal(index) {
    perguntasEditing.splice(index, 1);
    renderPerguntasList();
}

async function saveCaderno() {
    const nome        = document.getElementById('caderno-nome').value.trim();
    const contrato    = document.getElementById('caderno-contrato').value || null;
    const editId      = document.getElementById('caderno-edit-id').value;
    const status      = document.getElementById('caderno-status').value;
    const subcategoria = document.getElementById('caderno-subcategoria').value || null;
    const categoria    = document.getElementById('caderno-categoria').value || null;

    if (!nome) {
        showToast('Informe o nome do caderno.', 'warning');
        document.getElementById('caderno-nome').focus();
        return;
    }
    if (!perguntasEditing.length) {
        showToast('Adicione pelo menos uma pergunta.', 'warning');
        return;
    }

    const btn = document.getElementById('btn-salvar-caderno');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;border-top-color:#fff;margin-right:6px;"></span>Salvando...';

    try {
        const payload = {
            nome,
            contrato,
            subcategoria,
            categoria,
            perguntas: perguntasEditing.map(p => ({
                texto_pergunta: p.texto_pergunta,
                eh_critico_interditivo: p.eh_critico_interditivo ? 1 : 0
            }))
        };

        if (editId) {
            payload.status = status;
            await api.put('/cadernos/' + editId, payload);
            showToast('✅ Caderno atualizado com sucesso!', 'success');
        } else {
            await api.post('/cadernos', payload);
            showToast('✅ Caderno criado com sucesso!', 'success');
        }

        closeCadernoModal();
        loadCadernosTab();
    } catch(err) {
        showToast('Erro ao salvar: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Salvar Caderno';
    }
}

// ═══════════════════════════════════════════════════
//  DESATIVAR / EXCLUIR (para lixeira) / DUPLICAR / HISTÓRICO
// ═══════════════════════════════════════════════════
async function desativarCaderno(id) {
    closeAllMenus();
    const c = allCadernos.find(x => x.id === id);
    const nome = c ? c.nome : '';

    if (!confirm('Desativar o caderno "' + nome + '"?\n\nEle ficará como Inativo e não será listado para preenchimento de inspeções.')) return;

    try {
        await api.post('/cadernos/' + id + '/desativar');
        showToast('Caderno desativado com sucesso.', 'success');
        loadCadernosTab();
    } catch(err) {
        showToast('Erro ao desativar: ' + err.message, 'error');
    }
}

async function excluirCaderno(id) {
    closeAllMenus();
    const c = allCadernos.find(x => x.id === id);
    const nome = c ? c.nome : '';

    if (!confirm('Excluir o caderno "' + nome + '"?\n\nEle será movido para a lixeira. Você poderá recuperá-lo ou excluí-lo permanentemente.')) return;

    try {
        await api.delete('/cadernos/' + id);
        showToast('Caderno movido para a lixeira.', 'success');
        loadCadernosTab();
    } catch(err) {
        showToast('Erro ao excluir: ' + err.message, 'error');
    }
}

async function duplicateCaderno(id) {
    closeAllMenus();
    const c = allCadernos.find(x => x.id === id);
    const nome = c ? c.nome : '';

    if (!confirm('Duplicar o caderno "' + nome + '"?\n\nUma cópia será criada com o sufixo "(Cópia)".') ) return;

    try {
        const result = await api.post('/cadernos/' + id + '/duplicar');
        showToast('✅ ' + result.message, 'success');
        loadCadernosTab();
    } catch(err) {
        showToast('Erro ao duplicar: ' + err.message, 'error');
    }
}

async function openHistoricoModal(cadernoId) {
    closeAllMenus();
    const modal = document.getElementById('historico-modal');
    const body  = document.getElementById('historico-modal-body');
    body.innerHTML = spinner();
    modal.classList.remove('hidden');

    try {
        const historico = await api.get('/cadernos/' + cadernoId + '/historico');

        if (!historico.length) {
            body.innerHTML = '<p style="text-align:center; color:var(--color-text-muted); padding:var(--space-xl);">Nenhum registro de alteração.</p>';
            return;
        }

        const acoes = {
            'criado': '🟢 Criado',
            'editado': '✏️ Editado',
            'duplicado': '📋 Duplicado',
            'desativado': '⏸️ Desativado',
            'excluido_lixeira': '🗑️ Excluído (lixeira)',
            'restaurado': '♻️ Restaurado',
            'excluído': '🔴 Excluído'
        };

        body.innerHTML = historico.map(h => `
            <div style="padding:var(--space-md); background:var(--color-bg-hover); border-radius:var(--radius-md); margin-bottom:var(--space-sm);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <span style="font-size:var(--font-size-sm); font-weight:600;">${esc(h.usuario_nome || h.usuario)}</span>
                    <span style="font-size:var(--font-size-xs); color:var(--color-text-muted);">${formatDateTime(h.timestamp)}</span>
                </div>
                <div style="margin-bottom:4px;">
                    <span style="font-size:var(--font-size-xs); font-weight:700; color:var(--color-red-primary);">${acoes[h.acao] || h.acao}</span>
                </div>
                <div style="font-size:var(--font-size-sm); color:var(--color-text-secondary);">${esc(h.detalhes)}</div>
            </div>
        `).join('');
    } catch(err) {
        body.innerHTML = `<p style="color:#ef4444; text-align:center; padding:var(--space-xl);">Erro: ${esc(err.message)}</p>`;
    }
}

function closeHistoricoModal() {
    document.getElementById('historico-modal').classList.add('hidden');
}

// ═══════════════════════════════════════════════════
//  ABA 2: DASHBOARD DE INSPEÇÕES
// ═══════════════════════════════════════════════════
let _dashChartInstances = [];

function destroyDashCharts() {
    _dashChartInstances.forEach(c => { try { c.destroy(); } catch(_){} });
    _dashChartInstances = [];
}

let _treemapBoxes = [];
let _treemapHovered = -1;
let _treemapResizeObs = null;

const INSP_TREEMAP_PALETTE = [
    '#2563eb', '#9333ea', '#ea580c', '#dc2626', '#0891b2',
    '#059669', '#ca8a04', '#db2777', '#7c3aed', '#0d9488',
    '#e11d48', '#0284c7'
];

// ═══════════════════════════════════════════════════
//  ESTADO E ENGINE DE FILTRAGEM CRUZADA (Power BI)
// ═══════════════════════════════════════════════════
//  ESTADO E ENGINE DE FILTRAGEM CRUZADA (Power BI)
// ═══════════════════════════════════════════════════
let dashFilterState = {
    mes: [],
    categoria: [],
    caderno: [],
    frente: [],
    lideranca: [],
    conclusao: []
};

let _dashRawStats = null;

function isDashFilterActive() {
    const dropMes = document.getElementById('select-dash-mes')?.value || '';
    const dropAno = document.getElementById('select-dash-ano')?.value || '';
    const dropLocal = document.getElementById('select-dash-local')?.value || '';
    const dropContrato = document.getElementById('select-dash-contrato')?.value || '';

    return (
        Boolean(dropMes || dropAno || dropLocal || dropContrato) ||
        dashFilterState.mes.length > 0 ||
        dashFilterState.categoria.length > 0 ||
        dashFilterState.caderno.length > 0 ||
        dashFilterState.frente.length > 0 ||
        dashFilterState.lideranca.length > 0 ||
        dashFilterState.conclusao.length > 0
    );
}

/**
 * Popula dinamicamente os seletores de filtro globais (Mês, Ano, Local e Contrato).
 */
function populateDashGlobalFilters(respostas = [], todosContratos = []) {
    const selMes = document.getElementById('select-dash-mes');
    const selAno = document.getElementById('select-dash-ano');
    const selLocal = document.getElementById('select-dash-local');
    const selContrato = document.getElementById('select-dash-contrato');

    if (!selMes || !selAno || !selLocal || !selContrato) return;

    const MESES_NOMES = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    const curMes = selMes.value;
    const curAno = selAno.value;
    const curLocal = selLocal.value;
    const curContrato = selContrato.value;

    const anosSet = new Set();
    const mesesSet = new Set();
    const locaisSet = new Set();
    const contratosSet = new Set();

    (todosContratos || []).forEach(c => {
        if (c) contratosSet.add(c);
    });

    (respostas || []).forEach(r => {
        if (r.mes) {
            const [y, m] = r.mes.split('-');
            if (y) anosSet.add(y);
            if (m) mesesSet.add(parseInt(m, 10));
        }
        if (r.frente && r.frente !== 'Não informado') locaisSet.add(r.frente);
        if (r.contrato) contratosSet.add(r.contrato);
    });

    selMes.innerHTML = '<option value="">Todos</option>';
    [...mesesSet].sort((a, b) => a - b).forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = MESES_NOMES[m - 1];
        selMes.appendChild(opt);
    });
    if ([...mesesSet].map(String).includes(curMes)) selMes.value = curMes;

    selAno.innerHTML = '<option value="">Todos</option>';
    [...anosSet].sort((a, b) => b.localeCompare(a)).forEach(y => {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        selAno.appendChild(opt);
    });
    if ([...anosSet].includes(curAno)) selAno.value = curAno;

    selLocal.innerHTML = '<option value="">Todos</option>';
    [...locaisSet].sort().forEach(loc => {
        const opt = document.createElement('option');
        opt.value = loc;
        opt.textContent = loc;
        selLocal.appendChild(opt);
    });
    if ([...locaisSet].includes(curLocal)) selLocal.value = curLocal;

    selContrato.innerHTML = '<option value="">Todos</option>';
    [...contratosSet].sort().forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c.startsWith('Contrato') ? c : `Contrato ${c}`;
        selContrato.appendChild(opt);
    });
    if ([...contratosSet].includes(curContrato)) selContrato.value = curContrato;
}

function handleDashDropdownChange() {
    applyDashFilters();
}

function clearAllDashFilters() {
    const selMes = document.getElementById('select-dash-mes');
    const selAno = document.getElementById('select-dash-ano');
    const selLocal = document.getElementById('select-dash-local');
    const selContrato = document.getElementById('select-dash-contrato');

    if (selMes) selMes.value = '';
    if (selAno) selAno.value = '';
    if (selLocal) selLocal.value = '';
    if (selContrato) selContrato.value = '';

    dashFilterState = {
        mes: [],
        categoria: [],
        caderno: [],
        frente: [],
        lideranca: [],
        conclusao: []
    };

    applyDashFilters();
}

/**
 * Manipulador de clique dos Cards de Status Superiores (KPIs Conclusão Técnica).
 * Implementa o comportamento de toggle (Ligar/Desligar no mesmo clique) e filtro cruzado.
 */
function handleStatusCardClick(statusType, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    if (!statusType) return;

    const isMulti = event ? (event.ctrlKey || event.metaKey) : false;

    if (!Array.isArray(dashFilterState.conclusao)) {
        dashFilterState.conclusao = [];
    }

    if (isMulti) {
        const idx = dashFilterState.conclusao.indexOf(statusType);
        if (idx >= 0) {
            dashFilterState.conclusao.splice(idx, 1);
        } else {
            dashFilterState.conclusao.push(statusType);
        }
    } else {
        // Toggle OFF se o mesmo card já estiver ativado como filtro único, senão seleciona o card
        const isAlreadySelected = dashFilterState.conclusao.length === 1 && dashFilterState.conclusao[0] === statusType;
        if (isAlreadySelected) {
            dashFilterState.conclusao = [];
        } else {
            dashFilterState.conclusao = [statusType];
        }
    }

    applyDashFilters();
}

function toggleDashFilter(type, value, isMulti = false) {
    if (!dashFilterState[type] || !value) return;

    if (type === 'conclusao') {
        handleStatusCardClick(value, isMulti ? { ctrlKey: true } : null);
        return;
    }

    if (isMulti) {
        const idx = dashFilterState[type].indexOf(value);
        if (idx >= 0) {
            dashFilterState[type].splice(idx, 1);
        } else {
            dashFilterState[type].push(value);
        }
    } else {
        const isSingleSelected = dashFilterState[type].length === 1 && dashFilterState[type][0] === value;
        if (isSingleSelected) {
            dashFilterState[type] = [];
        } else {
            dashFilterState[type] = [value];
        }
    }

    applyDashFilters();
}

function clearDashFilters() {
    clearAllDashFilters();
}

function renderDashFilterBar() {
    const bar = document.getElementById('dash-filter-bar');
    const chipsContainer = document.getElementById('dash-filter-chips');
    if (!bar || !chipsContainer) return;

    if (!isDashFilterActive()) {
        bar.style.display = 'none';
        chipsContainer.innerHTML = '';
        return;
    }

    bar.style.display = 'flex';

    const labelMap = {
        mes: 'Mês',
        categoria: 'Categoria',
        caderno: 'Caderno',
        frente: 'Frente de Serviço',
        lideranca: 'Liderança',
        conclusao: 'Conclusão Técnica'
    };

    let html = '';
    Object.keys(dashFilterState).forEach(type => {
        dashFilterState[type].forEach(val => {
            html += `
                <span style="display:inline-flex;align-items:center;gap:6px;background:rgba(59,130,246,0.15);color:#60a5fa;border:1px solid rgba(59,130,246,0.3);padding:4px 10px;border-radius:14px;font-size:12px;font-weight:600;">
                    ${labelMap[type] || type}: ${esc(val)}
                    <span onclick="toggleDashFilter('${type}', '${esc(val)}', true)" style="cursor:pointer;font-weight:bold;margin-left:2px;opacity:0.8;">&times;</span>
                </span>
            `;
        });
    });

    chipsContainer.innerHTML = html;
}

function aggregateRawRespostas(rows) {
    const ctMap = { 'Em Conformidade': 0, 'Ver e Agir': 0, 'Notificação': 0, 'Interdição': 0 };
    rows.forEach(r => {
        if (r.conclusao_tecnica && ctMap[r.conclusao_tecnica] !== undefined) {
            ctMap[r.conclusao_tecnica]++;
        }
    });
    const conclusaoTecnica = Object.keys(ctMap).map(tipo => ({ tipo, total: ctMap[tipo] }));

    const mcMap = new Map();
    const mcInspMap = new Map();
    rows.forEach(r => {
        const mes = r.mes || 'Sem Data';
        const cat = r.categoria || 'Geral';
        const key = `${mes}||${cat}`;
        mcMap.set(key, (mcMap.get(key) || 0) + 1);

        if (!mcInspMap.has(key)) mcInspMap.set(key, new Map());
        const insp = r.nome_inspetor || 'N/A';
        const iMap = mcInspMap.get(key);
        iMap.set(insp, (iMap.get(insp) || 0) + 1);
    });

    const porMesCategoria = [];
    for (const [key, total] of mcMap) {
        const [mes, categoria] = key.split('||');
        const iMap = mcInspMap.get(key);
        let top_inspetor = 'N/A', top_inspetor_count = 0;
        if (iMap) {
            for (const [name, count] of iMap) {
                if (count > top_inspetor_count) {
                    top_inspetor = name;
                    top_inspetor_count = count;
                }
            }
        }
        porMesCategoria.push({ mes, categoria, total, top_inspetor, top_inspetor_count });
    }
    porMesCategoria.sort((a, b) => a.mes.localeCompare(b.mes));

    const catMap = new Map();
    rows.forEach(r => {
        const cat = r.categoria || 'Geral';
        catMap.set(cat, (catMap.get(cat) || 0) + 1);
    });
    const porCategoria = Array.from(catMap.entries())
        .map(([categoria, total]) => ({ categoria, total }))
        .sort((a, b) => b.total - a.total);

    const frenteMap = new Map();
    rows.forEach(r => {
        const f = r.frente || 'Não informado';
        const insp = r.nome_inspetor || 'Não informado';
        if (!frenteMap.has(f)) {
            frenteMap.set(f, { total: 0, inspetores: new Map() });
        }
        const item = frenteMap.get(f);
        item.total++;
        item.inspetores.set(insp, (item.inspetores.get(insp) || 0) + 1);
    });
    const porFrenteServico = Array.from(frenteMap.entries())
        .map(([local, data]) => ({
            local,
            total: data.total,
            inspetores: Array.from(data.inspetores.entries())
                .map(([nome, qty]) => ({ nome, qty }))
                .sort((a, b) => b.qty - a.qty)
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

    const cadernoMap = new Map();
    rows.forEach(r => {
        const c = r.caderno_nome || 'Sem Nome';
        const insp = r.nome_inspetor || 'Não informado';
        if (!cadernoMap.has(c)) {
            cadernoMap.set(c, { total: 0, inspetores: new Map() });
        }
        const item = cadernoMap.get(c);
        item.total++;
        item.inspetores.set(insp, (item.inspetores.get(insp) || 0) + 1);
    });
    const porCaderno = Array.from(cadernoMap.entries())
        .map(([nome, data]) => ({
            nome,
            total: data.total,
            inspetores: Array.from(data.inspetores.entries())
                .map(([nome, qty]) => ({ nome, qty }))
                .sort((a, b) => b.qty - a.qty)
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

    const lidMap = new Map();
    rows.forEach(r => {
        const l = r.lideranca || 'Não informada';
        const insp = r.nome_inspetor || 'Não informado';
        if (!lidMap.has(l)) {
            lidMap.set(l, { total: 0, liderados: new Map() });
        }
        const item = lidMap.get(l);
        item.total++;
        item.liderados.set(insp, (item.liderados.get(insp) || 0) + 1);
    });
    const porLideranca = Array.from(lidMap.entries())
        .map(([lideranca, data]) => ({
            lideranca,
            total: data.total,
            liderados: Array.from(data.liderados.entries())
                .map(([nome, qty]) => ({ nome, qty }))
                .sort((a, b) => b.qty - a.qty)
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

    const userMap = new Map();
    rows.forEach(r => {
        const u = r.nome_inspetor || 'N/A';
        userMap.set(u, (userMap.get(u) || 0) + 1);
    });
    const porUsuario = Array.from(userMap.entries())
        .map(([nome_inspetor, total]) => ({ nome_inspetor, total }))
        .sort((a, b) => b.total - a.total);

    return {
        conclusaoTecnica,
        porMesCategoria,
        porCategoria,
        porFrenteServico,
        porCaderno,
        porLideranca,
        porUsuario
    };
}

function applyDashFilters() {
    renderDashFilterBar();
    if (!_dashRawStats) return;

    destroyDashCharts();

    const dropMes = document.getElementById('select-dash-mes')?.value || '';
    const dropAno = document.getElementById('select-dash-ano')?.value || '';
    const dropLocal = document.getElementById('select-dash-local')?.value || '';
    const dropContrato = document.getElementById('select-dash-contrato')?.value || '';

    const matchDropdownFilters = (r) => {
        if (dropMes && r.mes) {
            const m = parseInt(r.mes.slice(5, 7), 10);
            if (String(m) !== String(dropMes)) return false;
        }
        if (dropAno && r.mes) {
            const y = r.mes.slice(0, 4);
            if (y !== dropAno) return false;
        }
        if (dropLocal && r.frente !== dropLocal) return false;
        if (dropContrato && r.contrato !== dropContrato) return false;
        return true;
    };

    let aggregated;
    let indicatorConclusaoTecnica;

    if (_dashRawStats.respostas && _dashRawStats.respostas.length > 0) {
        // Rows matching ALL active filters (dropdowns + interactive slicers including conclusao)
        const filteredRows = _dashRawStats.respostas.filter(r => {
            if (!matchDropdownFilters(r)) return false;

            if (dashFilterState.mes.length && !dashFilterState.mes.includes(r.mes)) return false;
            if (dashFilterState.categoria.length && !dashFilterState.categoria.includes(r.categoria)) return false;
            if (dashFilterState.caderno.length && !dashFilterState.caderno.includes(r.caderno_nome)) return false;
            if (dashFilterState.frente.length && !dashFilterState.frente.includes(r.frente)) return false;
            if (dashFilterState.lideranca.length && !dashFilterState.lideranca.includes(r.lideranca)) return false;
            if (dashFilterState.conclusao.length && !dashFilterState.conclusao.includes(r.conclusao_tecnica)) return false;
            return true;
        });

        // Rows matching ALL active filters EXCEPT conclusao (for top status card metrics)
        const indicatorRows = _dashRawStats.respostas.filter(r => {
            if (!matchDropdownFilters(r)) return false;

            if (dashFilterState.mes.length && !dashFilterState.mes.includes(r.mes)) return false;
            if (dashFilterState.categoria.length && !dashFilterState.categoria.includes(r.categoria)) return false;
            if (dashFilterState.caderno.length && !dashFilterState.caderno.includes(r.caderno_nome)) return false;
            if (dashFilterState.frente.length && !dashFilterState.frente.includes(r.frente)) return false;
            if (dashFilterState.lideranca.length && !dashFilterState.lideranca.includes(r.lideranca)) return false;
            return true;
        });

        aggregated = aggregateRawRespostas(filteredRows);
        const cardAgg = aggregateRawRespostas(indicatorRows);
        indicatorConclusaoTecnica = cardAgg.conclusaoTecnica;
    } else {
        aggregated = {
            conclusaoTecnica: _dashRawStats.conclusaoTecnica || [],
            porMesCategoria: (_dashRawStats.porMesCategoria || []).filter(r => {
                if (dashFilterState.mes.length && !dashFilterState.mes.includes(r.mes)) return false;
                if (dashFilterState.categoria.length && !dashFilterState.categoria.includes(r.categoria)) return false;
                return true;
            }),
            porCategoria: (_dashRawStats.porCategoria || []).filter(r => {
                if (dashFilterState.categoria.length && !dashFilterState.categoria.includes(r.categoria)) return false;
                return true;
            }),
            porFrenteServico: (_dashRawStats.porFrenteServico || []).filter(r => {
                if (dashFilterState.frente.length && !dashFilterState.frente.includes(r.local)) return false;
                return true;
            }),
            porCaderno: (_dashRawStats.porCaderno || []).filter(r => {
                if (dashFilterState.caderno.length && !dashFilterState.caderno.includes(r.nome)) return false;
                return true;
            }),
            porLideranca: (_dashRawStats.porLideranca || []).filter(r => {
                if (dashFilterState.lideranca.length && !dashFilterState.lideranca.includes(r.lideranca)) return false;
                return true;
            }),
            porUsuario: _dashRawStats.porUsuario || []
        };
        indicatorConclusaoTecnica = _dashRawStats.conclusaoTecnica || [];
    }

    const indContainer = document.getElementById('dashboard-insp-indicators-container');
    if (indContainer) {
        indContainer.innerHTML = renderConclusaoTecnicaCards(indicatorConclusaoTecnica);
    }

    renderDashEvolucao(aggregated.porMesCategoria);
    renderDashDonut(aggregated.porCategoria);
    renderDashFrenteServico(aggregated.porFrenteServico);
    renderDashCadernos(aggregated.porCaderno);
    renderDashLideranca(aggregated.porLideranca);
    renderDashTreemap(aggregated.porUsuario);
}

function renderConclusaoTecnicaCards(ct = []) {
    const findCT = (tipo) => {
        const row = ct.find(r => r.tipo === tipo);
        return row ? row.total : 0;
    };

    const cardsConfig = [
        { tipo: 'Em Conformidade', label: 'Em Conformidade', color: '#22c55e', icon: '✅' },
        { tipo: 'Ver e Agir',       label: 'Ver e Agir',       color: '#3b82f6', icon: '⚡' },
        { tipo: 'Notificação',     label: 'Notificação',     color: '#f59e0b', icon: '⚠️' },
        { tipo: 'Interdição',      label: 'Interdição',      color: '#ef4444', icon: '🛑' }
    ];

    const hasConclusaoFilter = dashFilterState.conclusao && dashFilterState.conclusao.length > 0;

    return `
        <div class="dash-indicators">
            ${cardsConfig.map(card => {
                const isSelected = dashFilterState.conclusao && dashFilterState.conclusao.includes(card.tipo);
                const activeClass = isSelected ? 'dash-indicator-card--active' : (hasConclusaoFilter ? 'dash-indicator-card--dimmed' : '');
                const activeStyle = isSelected
                    ? `border: 2px solid ${card.color}; background: rgba(255,255,255,0.08); box-shadow: 0 0 16px ${card.color}50; transform: translateY(-2px);`
                    : `border-left: 4px solid ${card.color}; opacity: ${hasConclusaoFilter ? '0.55' : '1'};`;

                return `
                    <div class="dash-indicator-card ${activeClass}" 
                         data-status="${card.tipo}"
                         style="--ind-color:${card.color}; cursor:pointer; transition: all 0.2s ease-in-out; ${activeStyle}"
                         onclick="handleStatusCardClick('${card.tipo}', event)"
                         title="${isSelected ? 'Clique para desativar o filtro de ' + card.label : 'Clique para filtrar por ' + card.label}">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                            <div class="dash-indicator-card__value" style="font-size:24px; font-weight:800; color:${card.color};">${findCT(card.tipo)}</div>
                            ${isSelected ? `<span style="font-size:10px; font-weight:800; background:${card.color}; color:#ffffff; padding:2px 8px; border-radius:12px; text-transform:uppercase; letter-spacing:0.5px; box-shadow: 0 0 8px ${card.color}80;">Filtro Ativo ✓</span>` : ''}
                        </div>
                        <div class="dash-indicator-card__label" style="display:flex; align-items:center; gap:6px;">
                            <span>${card.icon}</span>
                            <span>${card.label}</span>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

async function loadDashboardTab() {
    const container = document.getElementById('dashboard-insp-content');
    container.innerHTML = spinner('Carregando dashboard...');

    try {
        const stats = await api.get('/inspecoes/respostas/stats');
        _dashRawStats = stats;
        destroyDashCharts();

        const ct = stats.conclusaoTecnica || [];

        container.innerHTML = `
            <!-- Barra de Filtros Globais Superiores (Idêntica ao Dashboard N3) -->
            <div id="dash-global-filters-container">
                <div class="dash3-filters" id="dash-global-filters-bar">
                    <div class="dash3-filters__group">
                        <label class="dash3-filters__label" for="select-dash-contrato">CONTRATO</label>
                        <select id="select-dash-contrato" class="dash3-filters__select" style="min-width: 170px;" onchange="handleDashDropdownChange()">
                            <option value="">Todos</option>
                        </select>
                    </div>

                    <div class="dash3-filters__group">
                        <label class="dash3-filters__label" for="select-dash-mes">MÊS</label>
                        <select id="select-dash-mes" class="dash3-filters__select" style="min-width: 140px;" onchange="handleDashDropdownChange()">
                            <option value="">Todos</option>
                        </select>
                    </div>

                    <div class="dash3-filters__group">
                        <label class="dash3-filters__label" for="select-dash-ano">ANO</label>
                        <select id="select-dash-ano" class="dash3-filters__select" style="min-width: 110px;" onchange="handleDashDropdownChange()">
                            <option value="">Todos</option>
                        </select>
                    </div>

                    <div class="dash3-filters__group">
                        <label class="dash3-filters__label" for="select-dash-local">LOCAL/SS</label>
                        <select id="select-dash-local" class="dash3-filters__select" style="min-width: 200px;" onchange="handleDashDropdownChange()">
                            <option value="">Todos</option>
                        </select>
                    </div>

                    <button type="button" class="dash3-filters__clear" onclick="clearAllDashFilters()">
                        Limpar Filtros
                    </button>
                </div>
            </div>

            <div id="dash-filter-bar" class="dash-filter-bar" style="display:none;margin-bottom:var(--space-md);padding:10px 16px;background:var(--color-bg-card);border:1px solid var(--color-border);border-radius:var(--border-radius-md);align-items:center;justify-content:space-between;gap:12px;">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;" id="dash-filter-chips"></div>
                <button type="button" class="btn btn--secondary btn--sm" id="btn-clear-dash-filters" onclick="clearAllDashFilters()" style="font-size:12px;display:flex;align-items:center;gap:6px;">
                    ✨ Limpar Filtros
                </button>
            </div>

            <!-- Cards de Status Superiores -->
            <div id="dashboard-insp-indicators-container">
                ${renderConclusaoTecnicaCards(ct)}
            </div>

            <div class="dash-grid dash-grid--full">
                <div class="dash-chart-box">
                    <div class="dash-chart-box__title">Evolução Mensal por Categoria</div>
                    <div class="dash-chart-box__body" id="dashChartEvolucaoBox" style="height:360px;">
                        <canvas id="dashChartEvolucao"></canvas>
                    </div>
                </div>
            </div>

            <div class="dash-grid">
                <div class="dash-chart-box">
                    <div class="dash-chart-box__title">Distribuição por Categoria</div>
                    <div class="dash-chart-box__body" id="dashChartDonutBox" style="height:340px;">
                        <canvas id="dashChartDonut"></canvas>
                    </div>
                </div>
                <div class="dash-chart-box">
                    <div class="dash-chart-box__title">Inspeções por Frente de Serviço</div>
                    <div class="dash-chart-box__body" id="dashChartFrenteBox" style="height:340px;">
                        <canvas id="dashChartFrente"></canvas>
                    </div>
                </div>
            </div>

            <div class="dash-grid">
                <div class="dash-chart-box">
                    <div class="dash-chart-box__title">Inspeções por Cadernos</div>
                    <div class="dash-chart-box__body" id="dashChartCadernosBox" style="height:360px;">
                        <canvas id="dashChartCadernos"></canvas>
                    </div>
                </div>
                <div class="dash-chart-box">
                    <div class="dash-chart-box__title">Inspeções por Liderança</div>
                    <div class="dash-chart-box__body" id="dashChartLiderancaBox" style="height:360px;">
                        <canvas id="dashChartLideranca"></canvas>
                    </div>
                </div>
            </div>

            <div class="dash-chart-box" style="margin-top:var(--space-xl);">
                <div class="dash-chart-box__title">Engajamento por Inspetor (Treemap)</div>
                <div class="dash-treemap-wrap" id="dashTreemapWrap">
                    <canvas id="dashTreemapCanvas"></canvas>
                    <div class="dash-treemap-tooltip" id="dashTreemapTooltip"></div>
                </div>
            </div>
        `;

        populateDashGlobalFilters(stats.respostas || [], stats.todosContratos || []);
        renderDashFilterBar();
        renderDashEvolucao(stats.porMesCategoria || stats.porMes || []);
        renderDashDonut(stats.porCategoria || []);
        renderDashFrenteServico(stats.porFrenteServico || []);
        renderDashCadernos(stats.porCaderno || []);
        renderDashLideranca(stats.porLideranca || []);
        renderDashTreemap(stats.porUsuario || []);

    } catch(err) {
        container.innerHTML = `
            <div class="dash-empty">
                <div class="dash-empty__icon">📊</div>
                <div style="font-weight:700;color:var(--color-text-primary);margin-bottom:var(--space-sm);">Erro ao carregar dashboard</div>
                <div>${esc(err.message)}</div>
            </div>`;
    }
}

// ═══════════════════════════════════════════════════
//  GRÁFICO: Evolução Mensal (Colunas Empilhadas por Categoria)
// ═══════════════════════════════════════════════════
function renderDashEvolucao(data) {
    const box = document.getElementById('dashChartEvolucaoBox') || document.getElementById('dashChartEvolucao')?.parentElement;
    if (!box) return;

    if (!data || !data.length) {
        box.innerHTML = '<div class="dash-empty"><div class="dash-empty__icon">📈</div>Sem dados de evolução mensal.</div>';
        return;
    }

    let canvas = document.getElementById('dashChartEvolucao');
    if (!canvas) {
        box.innerHTML = '<canvas id="dashChartEvolucao"></canvas>';
        canvas = document.getElementById('dashChartEvolucao');
    }

    const isStacked = data.some(d => d.categoria);
    const months = [...new Set(data.map(d => d.mes))].sort();

    const monthNamesShort = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const monthNamesFull = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    const labels = months.map(mStr => {
        const [y, m] = mStr.split('-');
        const idx = parseInt(m, 10) - 1;
        return `${monthNamesShort[idx]}/${y.slice(2)}`;
    });

    let datasets = [];

    if (isStacked) {
        const categories = [...new Set(data.map(d => d.categoria))];

        const CATEGORY_COLORS = {
            '5S': '#0078d4',
            'ART': '#002050',
            'Checklist': '#2b88d8',
            'Meio Ambiente': '#2e7d32',
            'NR': '#a04000',
            'Passaporte': '#666666',
            'Equipamentos': '#ea580c',
            'Segurança': '#dc2626',
            'Outros': '#64748b'
        };
        const FALLBACK_PALETTE = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#ca8a04', '#e11d48', '#4f46e5', '#0d9488'];

        datasets = categories.map((cat, catIdx) => {
            const catColor = CATEGORY_COLORS[cat] || FALLBACK_PALETTE[catIdx % FALLBACK_PALETTE.length];
            const dataArr = [];
            const topInspectorsArr = [];

            months.forEach(mStr => {
                const match = data.find(d => d.mes === mStr && d.categoria === cat);
                if (match) {
                    dataArr.push(match.total || 0);
                    topInspectorsArr.push({
                        nome: match.top_inspetor || 'N/A',
                        count: match.top_inspetor_count || match.total || 0
                    });
                } else {
                    dataArr.push(0);
                    topInspectorsArr.push(null);
                }
            });

            return {
                label: cat,
                data: dataArr,
                backgroundColor: catColor,
                borderColor: 'rgba(0, 0, 0, 0.15)',
                borderWidth: 1,
                stack: 'stackedGroup',
                topInspectors: topInspectorsArr
            };
        });
    } else {
        const dataArr = months.map(mStr => {
            const match = data.find(d => d.mes === mStr);
            return match ? match.total : 0;
        });

        datasets = [{
            label: 'Total de Inspeções',
            data: dataArr,
            backgroundColor: '#0078d4',
            borderColor: '#005a9e',
            borderWidth: 1,
            borderRadius: 4
        }];
    }

    const stackedTotalsPlugin = {
        id: 'stackedTotalsPlugin',
        afterDatasetsDraw(chart) {
            const { ctx, scales: { y } } = chart;
            const datasetCount = chart.data.datasets.length;
            if (!datasetCount) return;

            const meta0 = chart.getDatasetMeta(0);
            if (!meta0 || !meta0.data || !meta0.data.length) return;

            ctx.save();
            ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetY = 1;

            const len = meta0.data.length;
            for (let i = 0; i < len; i++) {
                let total = 0;
                let topY = y.getPixelForValue(0);
                let hasValue = false;

                for (let d = 0; d < datasetCount; d++) {
                    if (chart.isDatasetVisible(d)) {
                        const val = chart.data.datasets[d].data[i] || 0;
                        total += val;
                        const meta = chart.getDatasetMeta(d);
                        if (meta && meta.data && meta.data[i] && val > 0) {
                            topY = Math.min(topY, meta.data[i].y);
                            hasValue = true;
                        }
                    }
                }

                if (hasValue && total > 0) {
                    const xPos = meta0.data[i].x;
                    ctx.fillText(total, xPos, topY - 6);
                }
            }
            ctx.restore();
        }
    };

    const ctx = canvas.getContext('2d');
    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'nearest',
                intersect: true
            },
            onHover: (event, chartElement) => {
                if (event.native && event.native.target) {
                    event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default';
                }
            },
            onClick: (event, elements, chart) => {
                if (!elements || !elements.length) return;
                const isMulti = event.native ? (event.native.ctrlKey || event.native.metaKey) : false;
                const el = elements[0];
                const idx = el.index;
                const datasetIdx = el.datasetIndex;

                const mStr = months[idx];
                const catName = chart.data.datasets[datasetIdx] ? chart.data.datasets[datasetIdx].label : null;

                if (isStacked && catName) {
                    toggleDashFilter('categoria', catName, isMulti);
                } else if (mStr) {
                    toggleDashFilter('mes', mStr, isMulti);
                }
            },
            plugins: {
                legend: {
                    display: isStacked,
                    position: 'top',
                    align: 'start',
                    labels: {
                        color: '#d1d5db',
                        font: { size: 12, weight: '600' },
                        usePointStyle: true,
                        pointStyle: 'circle',
                        boxWidth: 8,
                        boxHeight: 8,
                        padding: 16
                    }
                },
                datalabels: {
                    display: function(context) {
                        const val = context.dataset.data[context.dataIndex] || 0;
                        return val > 0;
                    },
                    color: '#ffffff',
                    font: { weight: '800', size: 12 },
                    textStrokeColor: 'rgba(0, 0, 0, 0.75)',
                    textStrokeWidth: 3,
                    formatter: v => v
                },
                tooltip: {
                    backgroundColor: '#0f172a',
                    titleColor: '#f8fafc',
                    titleFont: { size: 13, weight: 'bold' },
                    bodyColor: '#e2e8f0',
                    bodyFont: { size: 12 },
                    borderColor: '#334155',
                    borderWidth: 1,
                    padding: 12,
                    boxPadding: 6,
                    usePointStyle: true,
                    callbacks: {
                        title: function(context) {
                            if (!context.length) return '';
                            const idx = context[0].dataIndex;
                            const mStr = months[idx];
                            if (!mStr) return '';
                            const [y, m] = mStr.split('-');
                            const monthIdx = parseInt(m, 10) - 1;
                            return `📅 Período: ${monthNamesFull[monthIdx]} / ${y}`;
                        },
                        label: function(context) {
                            const catName = context.dataset.label || 'Inspeções';
                            const val = context.raw || 0;
                            return ` 📁 Categoria: ${catName} → ${val} registro(s)`;
                        },
                        afterLabel: function(context) {
                            if (!isStacked) return [];
                            const dataset = context.dataset;
                            const idx = context.dataIndex;
                            const inspInfo = dataset.topInspectors ? dataset.topInspectors[idx] : null;
                            if (inspInfo && inspInfo.nome && inspInfo.nome !== 'N/A') {
                                return ` 👤 Inspetor Principal: ${inspInfo.nome} (${inspInfo.count} registros)`;
                            }
                            return [];
                        },
                        footer: function(context) {
                            if (!context.length || !isStacked) return '';
                            const idx = context[0].dataIndex;
                            let sum = 0;
                            context.chart.data.datasets.forEach((ds, dIdx) => {
                                if (context.chart.isDatasetVisible(dIdx)) {
                                    sum += (ds.data[idx] || 0);
                                }
                            });
                            return `📊 Total Acumulado do Mês: ${sum} inspeção(ões)`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    stacked: isStacked,
                    grid: { display: false },
                    ticks: { color: '#9ca3af', font: { size: 11, weight: '600' } }
                },
                y: {
                    stacked: isStacked,
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: {
                        color: '#9ca3af',
                        font: { size: 11, weight: '600' },
                        stepSize: 1,
                        precision: 0,
                        callback: function(value) {
                            if (Math.floor(value) === value) {
                                return value;
                            }
                        }
                    }
                }
            }
        },
        plugins: window.ChartDataLabels
            ? [ChartDataLabels, stackedTotalsPlugin]
            : [stackedTotalsPlugin]
    });
    _dashChartInstances.push(chart);
}

// ═══════════════════════════════════════════════════
//  GRÁFICO: Donut por Categoria
// ═══════════════════════════════════════════════════
function renderDashDonut(porCategoria) {
    const box = document.getElementById('dashChartDonutBox') || document.getElementById('dashChartDonut')?.parentElement;
    if (!box) return;

    const filtered = (porCategoria || []).filter(p => p.categoria && p.categoria !== 'Não categorizado');
    if (!filtered.length) {
        box.innerHTML = '<div class="dash-empty"><div class="dash-empty__icon">🍩</div>Sem dados de categoria.</div>';
        return;
    }

    let canvas = document.getElementById('dashChartDonut');
    if (!canvas) {
        box.innerHTML = '<canvas id="dashChartDonut"></canvas>';
        canvas = document.getElementById('dashChartDonut');
    }

    const colors = ['#2563eb','#9333ea','#ea580c','#22c55e','#0891b2','#dc2626','#ca8a04','#db2777','#7c3aed','#0d9488'];
    const labels = filtered.map(p => p.categoria);
    const data = filtered.map(p => p.total);
    const total = data.reduce((a, b) => a + b, 0);

    const ctx = canvas.getContext('2d');
    const chart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: colors.slice(0, labels.length),
                borderColor: '#1e1e1e',
                borderWidth: 2,
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
            onHover: (event, chartElement) => {
                if (event.native && event.native.target) {
                    event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default';
                }
            },
            onClick: (event, elements, chart) => {
                if (!elements || !elements.length) return;
                const isMulti = event.native ? (event.native.ctrlKey || event.native.metaKey) : false;
                const idx = elements[0].index;
                const catName = labels[idx];
                if (catName) toggleDashFilter('categoria', catName, isMulti);
            },
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: '#a0a0a0',
                        font: { size: 12 },
                        padding: 12,
                        usePointStyle: true,
                        pointStyleWidth: 10
                    }
                },
                datalabels: {
                    color: '#fff',
                    font: { weight: 700, size: 11 },
                    formatter: (value) => {
                        const pct = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                        return pct >= 5 ? pct + '%' : '';
                    }
                }
            }
        },
        plugins: window.ChartDataLabels ? [ChartDataLabels] : []
    });
    _dashChartInstances.push(chart);
}

// ═══════════════════════════════════════════════════
//  GRÁFICO: Frente de Serviço (Barras Horizontais)
// ═══════════════════════════════════════════════════
function renderDashFrenteServico(porFrente) {
    const box = document.getElementById('dashChartFrenteBox') || document.getElementById('dashChartFrente')?.parentElement;
    if (!box) return;

    const filtered = (porFrente || []).filter(p => p.total > 0);
    if (!filtered.length) {
        box.innerHTML = '<div class="dash-empty"><div class="dash-empty__icon">📋</div>Sem dados de frente de serviço.</div>';
        return;
    }

    let canvas = document.getElementById('dashChartFrente');
    if (!canvas) {
        box.innerHTML = '<canvas id="dashChartFrente"></canvas>';
        canvas = document.getElementById('dashChartFrente');
    }

    const sorted = [...filtered].reverse();
    const labels = sorted.map(p => {
        const s = p.local || '';
        return s.length > 35 ? s.slice(0, 32) + '...' : s;
    });
    const data = sorted.map(p => p.total);

    const ctx = canvas.getContext('2d');
    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Inspeções',
                data,
                backgroundColor: '#0284c7',
                borderColor: '#0369a1',
                borderWidth: 1,
                borderRadius: 4,
                maxBarThickness: 24
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { right: 35 }
            },
            onHover: (event, chartElement) => {
                if (event.native && event.native.target) {
                    event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default';
                }
            },
            onClick: (event, elements, chart) => {
                if (!elements || !elements.length) return;
                const isMulti = event.native ? (event.native.ctrlKey || event.native.metaKey) : false;
                const idx = elements[0].index;
                const item = sorted[idx];
                if (item && item.local) toggleDashFilter('frente', item.local, isMulti);
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (items) => {
                            if (!items.length) return '';
                            const item = sorted[items[0].dataIndex];
                            return `Frente: ${item.local || 'Não informada'}`;
                        },
                        label: (context) => {
                            const item = sorted[context.dataIndex];
                            return `Total de Inspeções: ${item.total}`;
                        },
                        afterBody: (items) => {
                            if (!items.length) return [];
                            const item = sorted[items[0].dataIndex];
                            if (!item.inspetores || !item.inspetores.length) return [];
                            const lines = ['', 'Inspetores / Executantes:'];
                            item.inspetores.slice(0, 5).forEach(i => {
                                lines.push(` • ${i.nome}: ${i.qty} inspeção(ões)`);
                            });
                            if (item.inspetores.length > 5) {
                                lines.push(` • ... e mais ${item.inspetores.length - 5} inspetor(es)`);
                            }
                            return lines;
                        }
                    }
                },
                datalabels: {
                    anchor: 'end',
                    align: 'right',
                    color: '#ffffff',
                    font: { weight: '800', size: 12 },
                    formatter: v => v > 0 ? v : ''
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: { display: false },
                    ticks: {
                        color: '#9ca3af',
                        font: { size: 11, weight: '600' },
                        stepSize: 1,
                        precision: 0,
                        callback: function(val) {
                            if (Math.floor(val) === val) return val;
                        }
                    }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: '#d1d5db', font: { size: 11, weight: '600' } }
                }
            }
        },
        plugins: window.ChartDataLabels ? [ChartDataLabels] : []
    });
    _dashChartInstances.push(chart);
}

// ═══════════════════════════════════════════════════
//  GRÁFICO: Inspeções por Cadernos (Barras Horizontais)
// ═══════════════════════════════════════════════════
function renderDashCadernos(porCaderno) {
    const box = document.getElementById('dashChartCadernosBox') || document.getElementById('dashChartCadernos')?.parentElement;
    if (!box) return;

    const filtered = (porCaderno || []).filter(p => p.total > 0);
    if (!filtered.length) {
        box.innerHTML = '<div class="dash-empty"><div class="dash-empty__icon">📚</div>Sem dados de cadernos.</div>';
        return;
    }

    let canvas = document.getElementById('dashChartCadernos');
    if (!canvas) {
        box.innerHTML = '<canvas id="dashChartCadernos"></canvas>';
        canvas = document.getElementById('dashChartCadernos');
    }

    const sorted = [...filtered].reverse();
    const labels = sorted.map(p => {
        const s = p.nome || 'Caderno';
        return s.length > 35 ? s.slice(0, 32) + '...' : s;
    });
    const data = sorted.map(p => p.total);

    const ctx = canvas.getContext('2d');
    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Inspeções',
                data,
                backgroundColor: '#0078d4',
                borderColor: '#005a9e',
                borderWidth: 1,
                borderRadius: 4,
                maxBarThickness: 24
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { right: 35 }
            },
            onHover: (event, chartElement) => {
                if (event.native && event.native.target) {
                    event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default';
                }
            },
            onClick: (event, elements, chart) => {
                if (!elements || !elements.length) return;
                const isMulti = event.native ? (event.native.ctrlKey || event.native.metaKey) : false;
                const idx = elements[0].index;
                const item = sorted[idx];
                if (item && item.nome) toggleDashFilter('caderno', item.nome, isMulti);
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (items) => {
                            if (!items.length) return '';
                            const item = sorted[items[0].dataIndex];
                            return `Caderno: ${item.nome || 'Sem Nome'}`;
                        },
                        label: (context) => {
                            const item = sorted[context.dataIndex];
                            return `Total de Inspeções: ${item.total}`;
                        },
                        afterBody: (items) => {
                            if (!items.length) return [];
                            const item = sorted[items[0].dataIndex];
                            if (!item.inspetores || !item.inspetores.length) return [];
                            const lines = ['', 'Inspetores / Executantes:'];
                            item.inspetores.slice(0, 5).forEach(i => {
                                lines.push(` • ${i.nome}: ${i.qty} inspeção(ões)`);
                            });
                            if (item.inspetores.length > 5) {
                                lines.push(` • ... e mais ${item.inspetores.length - 5} inspetor(es)`);
                            }
                            return lines;
                        }
                    }
                },
                datalabels: {
                    anchor: 'end',
                    align: 'right',
                    color: '#ffffff',
                    font: { weight: '800', size: 12 },
                    formatter: v => v > 0 ? v : ''
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: { display: false },
                    ticks: {
                        color: '#9ca3af',
                        font: { size: 11, weight: '600' },
                        stepSize: 1,
                        precision: 0,
                        callback: function(val) {
                            if (Math.floor(val) === val) return val;
                        }
                    }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: '#d1d5db', font: { size: 11, weight: '600' } }
                }
            }
        },
        plugins: window.ChartDataLabels ? [ChartDataLabels] : []
    });
    _dashChartInstances.push(chart);
}

// ═══════════════════════════════════════════════════
//  GRÁFICO: Inspeções por Liderança (Barras Horizontais)
// ═══════════════════════════════════════════════════
function renderDashLideranca(porLideranca) {
    const box = document.getElementById('dashChartLiderancaBox') || document.getElementById('dashChartLideranca')?.parentElement;
    if (!box) return;

    const filtered = (porLideranca || []).filter(p => p.lideranca && p.lideranca !== 'Não informada' && p.total > 0);
    const list = filtered.length ? filtered : (porLideranca || []).filter(p => p.total > 0);

    if (!list.length) {
        box.innerHTML = '<div class="dash-empty"><div class="dash-empty__icon">👔</div>Sem dados de liderança.</div>';
        return;
    }

    let canvas = document.getElementById('dashChartLideranca');
    if (!canvas) {
        box.innerHTML = '<canvas id="dashChartLideranca"></canvas>';
        canvas = document.getElementById('dashChartLideranca');
    }

    const sorted = [...list].reverse();
    const labels = sorted.map(p => {
        const s = p.lideranca || 'Não informada';
        return s.length > 35 ? s.slice(0, 32) + '...' : s;
    });
    const data = sorted.map(p => p.total);

    const ctx = canvas.getContext('2d');
    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Inspeções',
                data,
                backgroundColor: '#10b981',
                borderColor: '#059669',
                borderWidth: 1,
                borderRadius: 4,
                maxBarThickness: 26
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { right: 45 }
            },
            onHover: (event, chartElement) => {
                if (event.native && event.native.target) {
                    event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default';
                }
            },
            onClick: (event, elements, chart) => {
                if (!elements || !elements.length) return;
                const isMulti = event.native ? (event.native.ctrlKey || event.native.metaKey) : false;
                const idx = elements[0].index;
                const item = sorted[idx];
                if (item && item.lideranca) toggleDashFilter('lideranca', item.lideranca, isMulti);
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (items) => {
                            if (!items.length) return '';
                            const item = sorted[items[0].dataIndex];
                            return `Liderança: ${item.lideranca || 'Não informada'}`;
                        },
                        label: (context) => {
                            const item = sorted[context.dataIndex];
                            return `Total de Inspeções: ${item.total}`;
                        },
                        afterBody: (items) => {
                            if (!items.length) return [];
                            const item = sorted[items[0].dataIndex];
                            if (!item.liderados || !item.liderados.length) return [];
                            const lines = ['', 'Liderados / Inspetores:'];
                            item.liderados.slice(0, 8).forEach(i => {
                                lines.push(` • ${i.nome}: ${i.qty} inspeção(ões)`);
                            });
                            if (item.liderados.length > 8) {
                                lines.push(` • ... e mais ${item.liderados.length - 8} liderado(s)`);
                            }
                            return lines;
                        }
                    }
                },
                datalabels: {
                    anchor: 'end',
                    align: 'right',
                    color: '#ffffff',
                    font: { weight: '800', size: 14 },
                    formatter: v => v > 0 ? v : ''
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: { display: false },
                    ticks: {
                        color: '#e5e7eb',
                        font: { size: 12, weight: '700' },
                        stepSize: 1,
                        precision: 0,
                        callback: function(val) {
                            if (Math.floor(val) === val) return val;
                        }
                    }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: '#ffffff', font: { size: 13, weight: '700' } }
                }
            }
        },
        plugins: window.ChartDataLabels ? [ChartDataLabels] : []
    });
    _dashChartInstances.push(chart);
}

// ═══════════════════════════════════════════════════
//  TREEMAP: Engajamento por Usuário (Canvas)
// ═══════════════════════════════════════════════════
function renderDashTreemap(porUsuario) {
    const wrap = document.getElementById('dashTreemapWrap');
    if (!wrap) return;

    const filtered = (porUsuario || []).filter(p => p.nome_inspetor && p.total > 0);
    if (!filtered.length) {
        wrap.innerHTML = '<div class="dash-empty"><div class="dash-empty__icon">👤</div>Sem dados de engajamento.</div>';
        return;
    }

    let canvas = document.getElementById('dashTreemapCanvas');
    if (!canvas) {
        wrap.innerHTML = '<canvas id="dashTreemapCanvas"></canvas><div class="dash-treemap-tooltip" id="dashTreemapTooltip"></div>';
        canvas = document.getElementById('dashTreemapCanvas');
    }

    const dataItems = filtered.map(p => ({ name: p.nome_inspetor, value: p.total }));
    const totalRecs = dataItems.reduce((a, b) => a + b.value, 0);

    const rect   = wrap.getBoundingClientRect();
    const width  = Math.floor(rect.width  || wrap.clientWidth  || 800);
    const height = Math.floor(rect.height || wrap.clientHeight || 400);

    const dpr = window.devicePixelRatio || 1;
    canvas.width  = width  * dpr;
    canvas.height = height * dpr;
    canvas.style.width  = width  + 'px';
    canvas.style.height = height + 'px';

    _treemapBoxes = _computeTreemapLayout(dataItems, { x: 0, y: 0, w: width, h: height });

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(dpr, dpr);
    _drawTreemapBoxes(ctx, _treemapBoxes, width, height, totalRecs);
    ctx.restore();

    _setupTreemapEvents(canvas, wrap, totalRecs);
}

function _computeTreemapLayout(dataItems, rect) {
    if (!dataItems.length || rect.w <= 0 || rect.h <= 0) return [];
    const totalVal = dataItems.reduce((a, b) => a + b.value, 0);
    if (totalVal <= 0) return [];

    const totalArea = rect.w * rect.h;
    const items = dataItems.map(item => ({
        ...item,
        area: (item.value / totalVal) * totalArea
    }));

    const result = [];

    function worstRatio(row, side) {
        if (!row.length || side <= 0) return Infinity;
        let sum = 0, max = -Infinity, min = Infinity;
        for (const it of row) {
            sum += it.area;
            if (it.area > max) max = it.area;
            if (it.area < min) min = it.area;
        }
        if (sum <= 0 || min <= 0) return Infinity;
        return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
    }

    function layoutRow(row, c) {
        const rowArea = row.reduce((s, it) => s + it.area, 0);
        const isH = c.w < c.h;
        const side = isH ? c.w : c.h;
        const thick = side > 0 ? rowArea / side : 0;
        let off = 0;
        row.forEach(it => {
            const len = rowArea > 0 ? it.area / thick : 0;
            if (isH) {
                result.push({ x: c.x + off, y: c.y, w: len, h: thick, data: it });
            } else {
                result.push({ x: c.x, y: c.y + off, w: thick, h: len, data: it });
            }
            off += len;
        });
        return isH
            ? { x: c.x, y: c.y + thick, w: c.w, h: Math.max(0, c.h - thick) }
            : { x: c.x + thick, y: c.y, w: Math.max(0, c.w - thick), h: c.h };
    }

    let cur = { ...rect };
    let row = [];
    for (let i = 0; i < items.length; i++) {
        const side = Math.min(cur.w, cur.h);
        if (!row.length) { row.push(items[i]); continue; }
        if (worstRatio([...row, items[i]], side) <= worstRatio(row, side)) {
            row.push(items[i]);
        } else {
            cur = layoutRow(row, cur);
            row = [items[i]];
        }
    }
    if (row.length) layoutRow(row, cur);
    return result;
}

function _drawTreemapBoxes(ctx, boxes, w, h, total) {
    ctx.clearRect(0, 0, w, h);
    if (!boxes.length) {
        ctx.fillStyle = '#666';
        ctx.font = '13px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Nenhum dado disponível', w / 2, h / 2);
        return;
    }

    boxes.forEach((box, idx) => {
        const gap = 2;
        const bx = box.x + gap, by = box.y + gap;
        const bw = Math.max(0, box.w - gap * 2);
        const bh = Math.max(0, box.h - gap * 2);
        if (bw <= 0 || bh <= 0) return;

        const color = INSP_TREEMAP_PALETTE[idx % INSP_TREEMAP_PALETTE.length];
        const isHov = idx === _treemapHovered;

        ctx.save();
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 6);
        else ctx.rect(bx, by, bw, bh);

        const grad = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
        grad.addColorStop(0, color);
        grad.addColorStop(1, _hexToRgba(color, 0.75));
        ctx.fillStyle = grad;
        ctx.fill();

        if (isHov) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2.5;
            ctx.stroke();
        } else {
            ctx.strokeStyle = 'rgba(255,255,255,0.12)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        const padX = 8, padY = 8;
        const aW = bw - padX * 2;
        const aH = bh - padY * 2;

        if (aW > 20 && aH > 14) {
            ctx.save();
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 6);
            else ctx.rect(bx, by, bw, bh);
            ctx.clip();

            let tSize = 13, sSize = 11;
            if (aH < 36 || aW < 60) { tSize = 11; sSize = 10; }
            if (aH < 22 || aW < 36) { tSize = 10; sSize = 9; }

            ctx.fillStyle = '#fff';
            ctx.font = `700 ${tSize}px Inter, sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(_truncateDashText(ctx, box.data.name, aW), bx + padX, by + padY);

            if (aH >= tSize + sSize + 4) {
                ctx.fillStyle = 'rgba(255,255,255,0.85)';
                ctx.font = `600 ${sSize}px Inter, sans-serif`;
                const pct = total > 0 ? ((box.data.value / total) * 100).toFixed(1) : '0';
                const sub = aW > 65 ? `${box.data.value} insp. (${pct}%)` : `${box.data.value}`;
                ctx.fillText(sub, bx + padX, by + padY + tSize + 3);
            }
            ctx.restore();
        }
        ctx.restore();
    });
}

function _truncateDashText(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 0 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t ? t + '…' : '';
}

function _hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

function _setupTreemapEvents(canvas, wrap, totalRecs) {
    const tooltip = document.getElementById('dashTreemapTooltip');

    canvas.onmousemove = (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        let found = -1;
        for (let i = 0; i < _treemapBoxes.length; i++) {
            const b = _treemapBoxes[i];
            if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) { found = i; break; }
        }

        if (found !== _treemapHovered) {
            _treemapHovered = found;
            canvas.style.cursor = found >= 0 ? 'pointer' : 'default';
            const dpr = window.devicePixelRatio || 1;
            const ctx = canvas.getContext('2d');
            ctx.save();
            ctx.scale(dpr, dpr);
            _drawTreemapBoxes(ctx, _treemapBoxes, rect.width, rect.height, totalRecs);
            ctx.restore();
        }

        if (found >= 0 && tooltip) {
            const d = _treemapBoxes[found].data;
            const pct = totalRecs > 0 ? ((d.value / totalRecs) * 100).toFixed(1) : '0';
            tooltip.style.display = 'block';
            let tx = mx + 15, ty = my + 15;
            if (tx + 220 > rect.width)  tx = mx - 225;
            if (ty + 100 > rect.height) ty = my - 100;
            tooltip.style.left = tx + 'px';
            tooltip.style.top  = ty + 'px';
            tooltip.innerHTML = `
                <div class="dash-treemap-tooltip__name">👤 ${esc(d.name)}</div>
                <div class="dash-treemap-tooltip__stat"><strong>${d.value}</strong> inspeções (${pct}%)</div>
            `;
        } else if (tooltip) {
            tooltip.style.display = 'none';
        }
    };

    canvas.onmouseleave = () => {
        if (_treemapHovered !== -1) {
            _treemapHovered = -1;
            canvas.style.cursor = 'default';
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            const ctx = canvas.getContext('2d');
            ctx.save();
            ctx.scale(dpr, dpr);
            _drawTreemapBoxes(ctx, _treemapBoxes, rect.width, rect.height, totalRecs);
            ctx.restore();
        }
        if (tooltip) tooltip.style.display = 'none';
    };

    if (!_treemapResizeObs && window.ResizeObserver) {
        _treemapResizeObs = new ResizeObserver(() => {
            if (document.getElementById('tab-dashboard-insp')?.style.display !== 'none') {
                loadDashboardTab();
            }
        });
        _treemapResizeObs.observe(wrap);
    }
}

// ═══════════════════════════════════════════════════
//  UTILITÁRIOS
// ═══════════════════════════════════════════════════
function esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function formatBrDate(value) {
    if (!value) return '—';
    try {
        let dateStr = String(value).trim();
        if (dateStr.includes(' ')) dateStr = dateStr.split(' ')[0];
        const parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        return parts[2] + '/' + parts[1] + '/' + parts[0];
    } catch (_) {
        return '—';
    }
}

function formatDateTime(value) {
    if (!value) return '—';
    try {
        const d = new Date(value);
        if (isNaN(d.getTime())) return String(value);
        return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
        return String(value);
    }
}

function spinner(text) {
    return `<div class="empty-state"><div class="spinner" style="width:32px;height:32px;border-width:3px;"></div>${text ? '<div class="empty-state__title" style="margin-top:var(--space-md);">' + text + '</div>' : ''}</div>`;
}

function emptyState(icon, title, desc) {
    return `<div class="empty-state"><div class="empty-state__icon">${icon}</div><div class="empty-state__title">${title}</div><div class="empty-state__desc">${desc}</div></div>`;
}
