// public/js/vps-maturidade.js

// ═══════════════════════════════════════════════════
//  ESCALA E DESIGN SYSTEM OFICIAL — MATURIDADE VPS (5S)
// ═══════════════════════════════════════════════════
const MATURIDADE_CONFIG = {
    0: { label: 'Inexistente', fullLabel: '0 - Inexistente', color: '#ef4444', textColor: '#ffffff', icon: '❌', bgLight: 'rgba(239, 68, 68, 0.15)' },
    1: { label: 'Fraco', fullLabel: '1 - Fraco', color: '#f97316', textColor: '#ffffff', icon: '🟧', bgLight: 'rgba(249, 115, 22, 0.15)' },
    2: { label: 'Em implantação', fullLabel: '2 - Em implantação', color: '#eab308', textColor: '#000000', icon: '🟨', bgLight: 'rgba(234, 179, 8, 0.15)' },
    3: { label: 'Implantado', fullLabel: '3 - Implantado', color: '#22c55e', textColor: '#ffffff', icon: '🟩', bgLight: 'rgba(34, 197, 94, 0.15)' },
    4: { label: 'Excelência', fullLabel: '4 - Excelência', color: '#3b82f6', textColor: '#ffffff', icon: '🟦', bgLight: 'rgba(59, 130, 246, 0.15)' }
};

let canteirosGlobais = [];
let liderancasGlobais = [];
let contratosGlobais = [];
let pendenciasEventsInitialized = false;
const pendenciasEmEdicao = new Set();

function formatarDataExibicao(dataStr) {
    if (!dataStr) return '-';
    const parts = String(dataStr).split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dataStr;
}

function renderStatusBadgeHTML(status) {
    if (status === 'Em Andamento') {
        return `<span style="color: #3b82f6; font-weight: 700; background: rgba(59,130,246,0.12); padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(59,130,246,0.3); font-size: 11px; display: inline-block;">🔵 Em Andamento</span>`;
    }
    if (status === 'Concluído' || status === 'Concluída' || status === 'Resolvido') {
        return `<span style="color: #22c55e; font-weight: 700; background: rgba(34,197,94,0.12); padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(34,197,94,0.3); font-size: 11px; display: inline-block;">🟢 Resolvido / Concluído</span>`;
    }
    return `<span style="color: #f97316; font-weight: 700; background: rgba(249,115,22,0.12); padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(249,115,22,0.3); font-size: 11px; display: inline-block;">🟠 Pendente</span>`;
}

function getMaturidadeConfig(nivel) {
    const n = parseInt(nivel, 10);
    return MATURIDADE_CONFIG[isNaN(n) ? 0 : n] || MATURIDADE_CONFIG[0];
}

function getMaturidadeBadgeHTML(nivel) {
    const cfg = getMaturidadeConfig(nivel);
    return `<span class="badge" style="background:${cfg.color}; color:${cfg.textColor}; font-weight:700; border-radius:12px; padding:4px 12px; font-size:12px; display:inline-flex; align-items:center; gap:6px; box-shadow:0 2px 8px rgba(0,0,0,0.25);">Maturidade ${nivel} - ${cfg.label}</span>`;
}

function renderMaturidade5SGraphic(nivelStr) {
    const nivel = parseInt(nivelStr, 10);
    const cfg = getMaturidadeConfig(nivel);

    const levels = [
        { num: 4, name: 'Excelência', color: '#3b82f6' },
        { num: 3, name: 'Implantado', color: '#22c55e' },
        { num: 2, name: 'Em implantação', color: '#eab308', textDark: true },
        { num: 1, name: 'Fraco', color: '#f97316' },
        { num: 0, name: 'Inexistente', color: '#ef4444' }
    ];

    const ladderRows = levels.map(l => {
        const isSelected = l.num === (isNaN(nivel) ? 0 : nivel);
        const opacity = isSelected ? '1' : '0.35';
        const border = isSelected ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.1)';
        const textColor = (l.textDark && isSelected) ? '#000000' : '#ffffff';
        const fontWeight = isSelected ? '800' : '600';
        return `
            <div style="background:${l.color}; opacity:${opacity}; border:${border}; color:${textColor}; font-weight:${fontWeight}; padding:4px 8px; display:flex; align-items:center; justify-space-between; font-size:11px; border-radius:3px; transition:all 0.2s ease;">
                <span style="font-size:13px; font-weight:800; margin-right:6px;">${l.num}</span>
                <span style="flex:1; text-align:left;">${l.name}</span>
                ${isSelected ? '<span style="font-weight:800; font-size:11px;">◄</span>' : ''}
            </div>
        `;
    }).join('');

    return `
        <div class="vps-maturidade-widget" style="border: 1px solid var(--color-border); border-radius: 8px; overflow: hidden; max-width: 320px; background: #0b1329; box-shadow: 0 4px 16px rgba(0,0,0,0.35);">
            <div style="background: #0d2838; color: #ffffff; text-align: center; padding: 6px 12px; font-weight: 700; font-size: 13px; border-bottom: 1px solid var(--color-border); letter-spacing: 0.5px;">
                Maturidade de 5S
            </div>
            <div style="display: flex; min-height: 145px;">
                <div style="flex: 1.2; background: ${cfg.color}; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; padding: 10px;">
                    <div style="font-size: 56px; font-weight: 900; color: #ffffff; text-shadow: 0 2px 8px rgba(0,0,0,0.5); line-height: 1;">${isNaN(nivel) ? 0 : nivel}</div>
                    <div style="font-size: 11px; font-weight: 800; color: ${cfg.textColor}; text-transform: uppercase; margin-top: 4px; text-align: center; line-height: 1.2;">${cfg.label}</div>
                    <div style="position: absolute; right: -7px; top: calc(50% - 7px); width: 0; height: 0; border-top: 7px solid transparent; border-bottom: 7px solid transparent; border-left: 7px solid ${cfg.color}; z-index: 2;"></div>
                </div>
                <div style="flex: 1.5; display: flex; flex-direction: column; justify-content: space-between; background: #0a0e1a; padding: 6px; gap: 3px;">
                    ${ladderRows}
                </div>
            </div>
        </div>
    `;
}

function setupMaturidadePreviews() {
    const selInicial = document.getElementById('canteiro-maturidade-inicial');
    if (selInicial) {
        const update = () => {
            const el = document.getElementById('preview-maturidade-inicial');
            if (el) el.innerHTML = renderMaturidade5SGraphic(selInicial.value);
        };
        selInicial.addEventListener('change', update);
        update();
    }

    const selEditar = document.getElementById('editar-canteiro-maturidade');
    if (selEditar) {
        const update = () => {
            const el = document.getElementById('preview-maturidade-editar');
            if (el) el.innerHTML = renderMaturidade5SGraphic(selEditar.value);
        };
        selEditar.addEventListener('change', update);
        update();
    }

    const selNovo = document.getElementById('evento-novo-nivel');
    if (selNovo) {
        const update = () => {
            const el = document.getElementById('preview-maturidade-novo-nivel');
            if (el) el.innerHTML = renderMaturidade5SGraphic(selNovo.value);
        };
        selNovo.addEventListener('change', update);
        update();
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Verificar autenticação e permissão
    const user = await requireLogin('adm');
    if (!user) return;

    document.getElementById('sidebar-root').innerHTML = buildSidebar(user, 'vps');
    initLogout();

    setupMaturidadePreviews();
    setupAllEventListeners();

    // 2. Carregar dados iniciais em paralelo (Performance rápida)
    try {
        await Promise.all([
            carregarLiderancas(),
            carregarContratos(),
            carregarEstatisticas(),
            carregarCanteiros(),
            carregarPendenciasGerais(),
            carregarTimeline('')
        ]);
    } catch (e) {
        console.error('[VPS] Erro ao carregar dados iniciais:', e);
    }

    // 3. Ouvinte de sincronização global reativa
    if (typeof window.onGlobalChange === 'function') {
        window.onGlobalChange(async () => {
            await Promise.all([
                carregarContratos(),
                carregarEstatisticas(),
                carregarCanteiros(),
                carregarPendenciasGerais()
            ]);
            const sel = document.getElementById('filtro-timeline');
            await carregarTimeline(sel ? sel.value : '');
        });
    }
});

function setupAllEventListeners() {
    // Lógica das Abas
    document.querySelectorAll('.vps-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.vps-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.vps-tab-content').forEach(c => c.style.display = 'none');
            
            btn.classList.add('active');
            const target = btn.getAttribute('data-target');
            const elTarget = document.getElementById(target);
            if (elTarget) elTarget.style.display = 'block';
        });
    });

    // Botão "+ Novo Canteiro"
    const btnNovoCanteiro = document.getElementById('btn-novo-canteiro');
    if (btnNovoCanteiro) {
        btnNovoCanteiro.addEventListener('click', () => {
            const modal = document.getElementById('modal-canteiro');
            if (modal) {
                modal.style.display = 'flex';
                modal.classList.add('active');
            }
            const sel = document.getElementById('canteiro-maturidade-inicial');
            if (sel) {
                const el = document.getElementById('preview-maturidade-inicial');
                if (el) el.innerHTML = renderMaturidade5SGraphic(sel.value);
            }
        });
    }

    // Botão "+ Registrar Evento"
    const btnNovoEvento = document.getElementById('btn-novo-evento');
    if (btnNovoEvento) {
        btnNovoEvento.addEventListener('click', () => {
            preencherSelectObrasModal();
            const modal = document.getElementById('modal-evento');
            if (modal) {
                modal.style.display = 'flex';
                modal.classList.add('active');
            }
            atualizarFormEvento();
            const inputData = document.getElementById('evento-data');
            if (inputData) {
                inputData.value = new Date().toISOString().split('T')[0];
            }
        });
    }

    // Botão "+ Adicionar Pendência" (Abre o modal diretamente)
    const btnAddPendenciaGeral = document.getElementById('btn-add-pendencia-geral');
    if (btnAddPendenciaGeral) {
        btnAddPendenciaGeral.addEventListener('click', async (e) => {
            e.preventDefault();
            console.log('[VPS] Clique no botão + Adicionar Pendência');
            await abrirModalAddPendencia();
        });
    }

    // Filtros
    const selFiltroCanteiro = document.getElementById('filtro-canteiro-contrato');
    if (selFiltroCanteiro) {
        selFiltroCanteiro.addEventListener('change', async () => {
            await carregarCanteiros();
        });
    }

    const selFiltroPendencias = document.getElementById('filtro-pendencias-status');
    if (selFiltroPendencias) {
        selFiltroPendencias.addEventListener('change', async () => {
            await carregarPendenciasGerais();
        });
    }

    // Eventos de formulários
    document.getElementById('evento-categoria')?.addEventListener('change', atualizarFormEvento);
    document.getElementById('evento-canteiro')?.addEventListener('change', atualizarFormEvento);

    // Form Novo Canteiro
    document.getElementById('form-canteiro')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        try {
            const formData = new FormData(e.target);
            await api.upload('/vps/canteiros', formData);
            showToast('Canteiro cadastrado com sucesso!');
            fecharModal('modal-canteiro');
            e.target.reset();
            await Promise.all([carregarContratos(), carregarEstatisticas(), carregarCanteiros()]);
        } catch (error) {
            showToast('Erro ao cadastrar canteiro', 'error');
        } finally {
            btn.disabled = false;
        }
    });

    // Form Editar Canteiro
    document.getElementById('form-editar-canteiro')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        try {
            const formData = new FormData(e.target);
            const id = document.getElementById('editar-canteiro-id').value;
            const response = await fetch(`/api/vps/canteiros/${id}`, {
                method: 'PUT',
                body: formData,
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            if (!response.ok) throw new Error();
            showToast('Canteiro atualizado com sucesso!');
            fecharModal('modal-editar-canteiro');
            e.target.reset();
            await Promise.all([carregarContratos(), carregarEstatisticas(), carregarCanteiros()]);
        } catch (error) {
            showToast('Erro ao atualizar canteiro', 'error');
        } finally {
            btn.disabled = false;
        }
    });

    // Form Registrar Evento
    document.getElementById('form-evento')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        try {
            const formData = new FormData(e.target);
            if (!formData.get('data_registro')) {
                formData.append('data_registro', new Date().toISOString().split('T')[0]);
            }
            await api.upload('/vps/historico', formData);
            showToast('Evento registrado com sucesso!');
            fecharModal('modal-evento');
            e.target.reset();
            await Promise.all([
                carregarEstatisticas(),
                carregarCanteiros(),
                carregarTimeline(document.getElementById('filtro-timeline')?.value || '')
            ]);
        } catch (error) {
            showToast('Erro ao registrar evento', 'error');
        } finally {
            btn.disabled = false;
        }
    });

    // Form Nova Pendência
    document.getElementById('form-add-pendencia')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btnSubmit = e.target.querySelector('button[type="submit"]');
        btnSubmit.disabled = true;

        const canteiroId = document.getElementById('pendencia-canteiro').value;
        const itemVal = document.getElementById('pendencia-item').value.trim();
        const adeqVal = document.getElementById('pendencia-adequacao').value.trim();
        const respVal = document.getElementById('pendencia-responsavel').value;
        const dataVal = document.getElementById('pendencia-data').value;
        const statusVal = document.getElementById('pendencia-status').value;

        const payload = {
            canteiro_id: canteiroId,
            item: itemVal,
            adequacao: adeqVal,
            responsavel: respVal,
            data: dataVal,
            status: statusVal
        };

        console.log('[VPS] Criando nova pendência via modal:', payload);

        try {
            const res = await api.post('/vps/pendencias', payload);
            console.log('[VPS] Resposta do servidor ao criar pendência:', res);
            showToast('Pendência adicionada com sucesso!');
            fecharModal('modal-add-pendencia');
            e.target.reset();
            await Promise.all([carregarEstatisticas(), carregarCanteiros(), carregarPendenciasGerais()]);
        } catch (err) {
            console.error('[VPS] Erro ao cadastrar pendência:', err);
            showToast(err.message || 'Erro ao criar nova pendência', 'error');
        } finally {
            btnSubmit.disabled = false;
        }
    });

    // Fechamento genérico de modais via botões .close-modal e .profile-modal__close
    document.querySelectorAll('.close-modal, .profile-modal__close').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const modal = btn.closest('.modal, .profile-modal-overlay');
            if (modal) {
                modal.classList.remove('active');
                modal.style.display = 'none';
            }
        };
    });
}

function fecharModal(modalId) {
    const modal = typeof modalId === 'string' ? document.getElementById(modalId) : modalId;
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
    }
}

async function abrirModalAddPendencia() {
    const modalAdd = document.getElementById('modal-add-pendencia');
    if (!modalAdd) {
        console.error('[VPS] Elemento #modal-add-pendencia não existe no DOM.');
        showToast('Erro interno: modal de pendência não encontrado.', 'error');
        return;
    }

    let canteiros = canteirosGlobais;
    if (!canteiros || !canteiros.length) {
        try {
            canteiros = await api.get('/vps/canteiros');
            canteirosGlobais = canteiros;
        } catch (e) {
            console.error('[VPS] Erro ao buscar canteiros para o modal:', e);
        }
    }

    if (!canteiros || !canteiros.length) {
        showToast('Cadastre ao menos um canteiro de obra antes de adicionar pendências.', 'warning');
        return;
    }

    // Popula select de Obras no modal
    const selCanteiroModal = document.getElementById('pendencia-canteiro');
    if (selCanteiroModal) {
        selCanteiroModal.innerHTML = '<option value="">Selecione a Obra...</option>';
        canteiros.forEach(c => {
            selCanteiroModal.innerHTML += `<option value="${c.id}">${escapeAttr(c.nome)}</option>`;
        });
        selCanteiroModal.value = canteiros[0].id;
    }

    // Preenche data atual padrão
    const inputDataModal = document.getElementById('pendencia-data');
    if (inputDataModal) {
        inputDataModal.value = new Date().toISOString().split('T')[0];
    }

    // Limpa campos
    const inputItem = document.getElementById('pendencia-item');
    if (inputItem) inputItem.value = '';
    const inputAdeq = document.getElementById('pendencia-adequacao');
    if (inputAdeq) inputAdeq.value = '';
    const selStatus = document.getElementById('pendencia-status');
    if (selStatus) selStatus.value = 'Pendente';

    // Atualiza responsáveis filtrados pelo contrato do canteiro selecionado
    const updateModalLiderancas = () => {
        const cId = selCanteiroModal ? selCanteiroModal.value : '';
        const selRespModal = document.getElementById('pendencia-responsavel');
        if (selRespModal) {
            selRespModal.innerHTML = renderLiderancaOptions(cId, '');
        }
    };

    if (selCanteiroModal) {
        selCanteiroModal.onchange = updateModalLiderancas;
        updateModalLiderancas();
    }

    // Abre modal com suporte a display flex e classe active
    modalAdd.style.display = 'flex';
    modalAdd.classList.add('active');
    console.log('[VPS] Modal #modal-add-pendencia aberto com sucesso!');
}

async function carregarLiderancas() {
    try {
        liderancasGlobais = await api.get('/vps/liderancas');
    } catch (e) {
        console.error('Erro ao carregar lideranças:', e);
    }
}

async function carregarContratos() {
    try {
        contratosGlobais = await api.get('/vps/contratos');
        
        const selFiltro = document.getElementById('filtro-canteiro-contrato');
        if (selFiltro) {
            const valAtual = selFiltro.value;
            selFiltro.innerHTML = '<option value="">Todos os Contratos</option>';
            contratosGlobais.forEach(c => {
                selFiltro.innerHTML += `<option value="${escapeAttr(c)}">Contrato ${escapeAttr(c)}</option>`;
            });
            selFiltro.value = valAtual;
        }

        const selNovo = document.getElementById('canteiro-contrato');
        if (selNovo) {
            const valAtual = selNovo.value;
            selNovo.innerHTML = '<option value="">Selecione um Contrato...</option>';
            contratosGlobais.forEach(c => {
                selNovo.innerHTML += `<option value="${escapeAttr(c)}">Contrato ${escapeAttr(c)}</option>`;
            });
            selNovo.value = valAtual;
        }

        const selEditar = document.getElementById('editar-canteiro-contrato');
        if (selEditar) {
            const valAtual = selEditar.value;
            selEditar.innerHTML = '<option value="">Selecione um Contrato...</option>';
            contratosGlobais.forEach(c => {
                selEditar.innerHTML += `<option value="${escapeAttr(c)}">Contrato ${escapeAttr(c)}</option>`;
            });
            selEditar.value = valAtual;
        }
    } catch (e) {
        console.error('Erro ao carregar contratos:', e);
    }
}

async function carregarEstatisticas() {
    try {
        const stats = await api.get('/vps/stats');
        
        const container = document.getElementById('stats-grid-container');
        if (container) {
            container.innerHTML = '';
            const totalEmAndamento = Number(stats.emAndamento) || 0;

            const maturidades = [
                { level: 4, count: Number(stats.maturidade4) || 0, fullLabel: 'Maturidade 4 — Excelência', color: '#3b82f6', textColor: '#ffffff', bgLight: 'rgba(59, 130, 246, 0.14)', borderColor: 'rgba(59, 130, 246, 0.35)', glow: 'rgba(59, 130, 246, 0.35)', icon: '🏆' },
                { level: 3, count: Number(stats.maturidade3) || 0, fullLabel: 'Maturidade 3 — Implantado', color: '#22c55e', textColor: '#ffffff', bgLight: 'rgba(34, 197, 94, 0.14)', borderColor: 'rgba(34, 197, 94, 0.35)', glow: 'rgba(34, 197, 94, 0.35)', icon: '⭐' },
                { level: 2, count: Number(stats.maturidade2) || 0, fullLabel: 'Maturidade 2 — Em implantação', color: '#eab308', textColor: '#000000', bgLight: 'rgba(234, 179, 8, 0.14)', borderColor: 'rgba(234, 179, 8, 0.35)', glow: 'rgba(234, 179, 8, 0.35)', icon: '📈' },
                { level: 1, count: Number(stats.maturidade1) || 0, fullLabel: 'Maturidade 1 — Fraco', color: '#f97316', textColor: '#ffffff', bgLight: 'rgba(249, 115, 22, 0.14)', borderColor: 'rgba(249, 115, 22, 0.35)', glow: 'rgba(249, 115, 22, 0.35)', icon: '🌱' },
                { level: 0, count: Number(stats.maturidade0) || 0, fullLabel: 'Maturidade 0 — Inexistente', color: '#ef4444', textColor: '#ffffff', bgLight: 'rgba(239, 68, 68, 0.14)', borderColor: 'rgba(239, 68, 68, 0.35)', glow: 'rgba(239, 68, 68, 0.35)', icon: '❌' }
            ];

            maturidades.forEach(m => {
                if (m.count > 0) {
                    const pct = totalEmAndamento > 0 ? Math.round((m.count / totalEmAndamento) * 100) : 0;
                    const card = document.createElement('div');
                    card.className = 'vps-maturidade-card';
                    card.style.setProperty('--card-glow', m.glow);
                    card.style.setProperty('--card-border-hover', m.color);
                    card.style.borderLeft = `5px solid ${m.color}`;
                    card.style.borderTop = `1px solid ${m.borderColor}`;
                    card.style.borderRight = `1px solid ${m.borderColor}`;
                    card.style.borderBottom = `1px solid ${m.borderColor}`;
                    card.style.background = `linear-gradient(135deg, var(--color-surface, #121c38) 0%, ${m.bgLight} 100%)`;

                    card.innerHTML = `
                        <div class="vps-maturidade-card__header">
                            <span class="vps-maturidade-card__badge" style="background: ${m.color}; color: ${m.textColor};">
                                Nível ${m.level} • 5S
                            </span>
                            <span class="vps-maturidade-card__icon">${m.icon}</span>
                        </div>
                        <div class="vps-maturidade-card__body">
                            <div class="vps-maturidade-card__value" style="color: ${m.color};">${m.count}</div>
                            <div class="vps-maturidade-card__label">${m.fullLabel}</div>
                            <div class="vps-maturidade-card__subtext">${pct}% das obras em andamento</div>
                        </div>
                    `;
                    container.appendChild(card);
                }
            });
        }

        const containerCompact = document.getElementById('historico-cards-compact-container');
        if (containerCompact) {
            containerCompact.innerHTML = '';
            const cardsCompactos = [
                { tipo: 'Diamante', label: 'Card Diamante', count: Number(stats.cardsDiamante) || 0, color: '#3b82f6', textColor: '#ffffff', glow: 'rgba(59, 130, 246, 0.35)', bgLight: 'rgba(59, 130, 246, 0.12)', borderColor: 'rgba(59, 130, 246, 0.35)', icon: '💎', subtext: 'Destaques e Evoluções' },
                { tipo: 'Verde', label: 'Card Verde', count: Number(stats.cardsVerde) || 0, color: '#22c55e', textColor: '#ffffff', glow: 'rgba(34, 197, 94, 0.35)', bgLight: 'rgba(34, 197, 94, 0.12)', borderColor: 'rgba(34, 197, 94, 0.35)', icon: '🟢', subtext: 'Conforme / 5S OK' },
                { tipo: 'Amarelo', label: 'Card Amarelo', count: Number(stats.cardsAmarelo) || 0, color: '#eab308', textColor: '#000000', glow: 'rgba(234, 179, 8, 0.35)', bgLight: 'rgba(234, 179, 8, 0.12)', borderColor: 'rgba(234, 179, 8, 0.35)', icon: '🟡', subtext: 'Alertas de Não Conformidade' },
                { tipo: 'Vermelho', label: 'Card Vermelho', count: Number(stats.cardsVermelho) || 0, color: '#ef4444', textColor: '#ffffff', glow: 'rgba(239, 68, 68, 0.35)', bgLight: 'rgba(239, 68, 68, 0.12)', borderColor: 'rgba(239, 68, 68, 0.35)', icon: '🔴', subtext: 'Interdições / Gravíssimos' }
            ];

            cardsCompactos.forEach(c => {
                const cardEl = document.createElement('div');
                cardEl.className = 'vps-historico-card-compact';
                cardEl.style.setProperty('--card-glow', c.glow);
                cardEl.style.setProperty('--card-border-hover', c.color);
                cardEl.style.borderLeft = `4px solid ${c.color}`;
                cardEl.style.borderTop = `1px solid ${c.borderColor}`;
                cardEl.style.borderRight = `1px solid ${c.borderColor}`;
                cardEl.style.borderBottom = `1px solid ${c.borderColor}`;
                cardEl.style.background = `linear-gradient(135deg, var(--color-surface, #121c38) 0%, ${c.bgLight} 100%)`;

                cardEl.innerHTML = `
                    <div class="vps-historico-card-compact__header">
                        <span class="vps-historico-card-compact__badge" style="background: ${c.color}; color: ${c.textColor};">
                            ${c.label}
                        </span>
                        <span class="vps-historico-card-compact__icon">${c.icon}</span>
                    </div>
                    <div>
                        <div class="vps-historico-card-compact__value" style="color: ${c.color};">${c.count}</div>
                        <div class="vps-historico-card-compact__label">${c.label}s Registrados</div>
                        <div class="vps-historico-card-compact__subtext">${c.subtext}</div>
                    </div>
                `;
                containerCompact.appendChild(cardEl);
            });
        }
    } catch (e) {
        console.error('Erro ao carregar estatísticas VPS:', e);
    }
}

function atualizarFormEvento() {
    const categoria = document.getElementById('evento-categoria')?.value;
    const groupCard = document.getElementById('group-tipo-card');
    const groupNivel = document.getElementById('group-nova-maturidade');
    const inputCard = document.getElementById('evento-tipo-card');
    const inputNivel = document.getElementById('evento-novo-nivel');

    if (!categoria) return;

    if (categoria === 'Mudança de Maturidade') {
        if (groupCard) groupCard.style.display = 'none';
        inputCard?.removeAttribute('required');
        if (groupNivel) groupNivel.style.display = 'block';
        inputNivel?.setAttribute('required', 'required');
        const el = document.getElementById('preview-maturidade-novo-nivel');
        if (el && inputNivel) el.innerHTML = renderMaturidade5SGraphic(inputNivel.value);
    } else {
        if (groupCard) groupCard.style.display = 'block';
        inputCard?.setAttribute('required', 'required');
        if (groupNivel) groupNivel.style.display = 'none';
        inputNivel?.removeAttribute('required');
    }

    const diamanteOption = document.getElementById('option-diamante');
    if (diamanteOption) diamanteOption.style.display = 'block';
}

function renderCardStatusBadge(cardStatus) {
    if (!cardStatus || (!cardStatus.ultimoCard && !cardStatus.hasDiamante)) {
        return `
            <div class="canteiro-card__last-card-legend" style="position: absolute; top: 10px; left: 10px; z-index: 10; background: rgba(11, 19, 41, 0.75); backdrop-filter: blur(4px); border: 1px solid rgba(255,255,255,0.12); color: var(--color-text-muted, #94a3b8); padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600;">
                Sem histórico
            </div>
        `;
    }

    if (cardStatus.hasDiamante) {
        const verdes = cardStatus.totalVerdes || 0;
        const verdesBadge = verdes > 0 
            ? `<span style="background: rgba(34, 197, 94, 0.25); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.4); padding: 1px 6px; border-radius: 8px; font-size: 10px; font-weight: 800; display: inline-flex; align-items: center; gap: 3px;">
                🟢 ${verdes} Verde${verdes > 1 ? 's' : ''}
               </span>`
            : '';

        return `
            <div class="canteiro-card__last-card-legend" title="Card Diamante mantido permanentemente (${verdes} Verde(s) acumulados)" style="position: absolute; top: 10px; left: 10px; z-index: 10; background: rgba(11, 19, 41, 0.92); backdrop-filter: blur(4px); border: 1px solid #3b82f6; color: #ffffff; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 10px rgba(59,130,246,0.35); max-width: calc(100% - 55px); overflow: hidden; white-space: nowrap; text-overflow: ellipsis;">
                <span style="font-size: 13px;">💎</span>
                <span>Card Diamante</span>
                ${verdesBadge}
            </div>
        `;
    }

    let cardColor = '#22c55e', cardIcon = '🟢', cardLabel = 'Verde';
    let subtext = '';

    if (cardStatus.ultimoCard === 'Amarelo') {
        cardColor = '#eab308'; cardIcon = '🟡'; cardLabel = 'Amarelo';
        subtext = ' (Atenção)';
    } else if (cardStatus.ultimoCard === 'Vermelho') {
        cardColor = '#ef4444'; cardIcon = '🔴'; cardLabel = 'Vermelho';
        subtext = ' (Interdição)';
    } else if (cardStatus.ultimoCard === 'Verde') {
        cardColor = '#22c55e'; cardIcon = '🟢'; cardLabel = 'Verde';
        if (cardStatus.totalVerdes > 1) {
            subtext = ` (${cardStatus.totalVerdes}x)`;
        }
    }

    return `
        <div class="canteiro-card__last-card-legend" title="Status de Inspeção: Card ${cardLabel}" style="position: absolute; top: 10px; left: 10px; z-index: 10; background: rgba(11, 19, 41, 0.88); backdrop-filter: blur(4px); border: 1px solid ${cardColor}; color: #ffffff; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; display: flex; align-items: center; gap: 4px;">
            <span style="font-size: 12px;">${cardIcon}</span>
            <span>Card ${cardLabel}${subtext}</span>
        </div>
    `;
}

function escapeAttr(str) {
    if (!str) return '';
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderLiderancaOptions(canteiroId, responsavelAtual) {
    const cant = canteirosGlobais.find(c => c.id === canteiroId);
    const targetContrato = cant ? cant.contrato : null;

    let filtered = liderancasGlobais;
    if (targetContrato && String(targetContrato).trim() !== '') {
        const cleanTarget = String(targetContrato).trim();
        filtered = liderancasGlobais.filter(l => {
            if (!l.contrato) return false;
            const arr = String(l.contrato).split(',').map(x => x.trim());
            return arr.includes(cleanTarget) || l.contrato === cleanTarget;
        });
    }

    let optionsLiderancas = '<option value="">Selecione Liderança...</option>';
    filtered.forEach(l => {
        const sel = (responsavelAtual === l.nome) ? 'selected' : '';
        const contratoInfo = l.contrato ? ` (${l.contrato})` : '';
        optionsLiderancas += `<option value="${escapeAttr(l.nome)}" ${sel}>${escapeAttr(l.nome)}${contratoInfo}</option>`;
    });
    if (responsavelAtual && !filtered.some(l => l.nome === responsavelAtual)) {
        optionsLiderancas += `<option value="${escapeAttr(responsavelAtual)}" selected>${escapeAttr(responsavelAtual)}</option>`;
    }
    return optionsLiderancas;
}

async function carregarPendenciasGerais() {
    const tbody = document.getElementById('tbody-pendencias-geral');
    if (!tbody) return;

    const statusFilterSel = document.getElementById('filtro-pendencias-status');
    const statusFilter = statusFilterSel ? statusFilterSel.value : 'Pendente';

    try {
        let url = '/vps/pendencias';
        if (statusFilter) {
            url += `?status=${encodeURIComponent(statusFilter)}`;
        }

        const pendencias = await api.get(url);

        if (!pendencias.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="padding: 16px; text-align: center; color: var(--color-text-muted); font-size: 11px; font-style: italic;">
                        Nenhuma pendência encontrada${statusFilter ? ` com status "${statusFilter}"` : ''}.
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        pendencias.forEach(p => {
            const isEditing = pendenciasEmEdicao.has(String(p.id));

            if (isEditing) {
                let statusStyle = 'color: #f97316;';
                if (p.status === 'Em Andamento') statusStyle = 'color: #3b82f6;';
                else if (p.status === 'Concluído' || p.status === 'Concluída' || p.status === 'Resolvido') statusStyle = 'color: #22c55e;';

                let optionsObras = '<option value="">Selecione Obra...</option>';
                canteirosGlobais.forEach(c => {
                    const sel = (p.canteiro_id === c.id) ? 'selected' : '';
                    optionsObras += `<option value="${c.id}" ${sel}>${escapeAttr(c.nome)}</option>`;
                });

                const optionsLiderancas = renderLiderancaOptions(p.canteiro_id, p.responsavel);

                html += `
                    <tr data-pendencia-id="${p.id}" class="row-editing" style="background: rgba(59, 130, 246, 0.08);">
                        <td style="padding: 6px 8px;">
                            <select class="vps-table-select pendencia-geral-canteiro" data-id="${p.id}" style="font-weight: 600;">
                                ${optionsObras}
                            </select>
                        </td>
                        <td style="padding: 6px 8px;">
                            <input type="text" class="vps-table-input pendencia-geral-item" data-id="${p.id}" value="${escapeAttr(p.item || '')}" placeholder="Item / problema...">
                        </td>
                        <td style="padding: 6px 8px;">
                            <input type="text" class="vps-table-input pendencia-geral-adequacao" data-id="${p.id}" value="${escapeAttr(p.adequacao || '')}" placeholder="Ação de adequação...">
                        </td>
                        <td style="padding: 6px 8px;">
                            <select class="vps-table-select pendencia-geral-responsavel" data-id="${p.id}">
                                ${optionsLiderancas}
                            </select>
                        </td>
                        <td style="padding: 6px 8px;">
                            <input type="date" class="vps-table-input pendencia-geral-data" data-id="${p.id}" value="${p.data || ''}">
                        </td>
                        <td style="padding: 6px 8px;">
                            <select class="vps-table-select pendencia-geral-status" data-id="${p.id}" style="${statusStyle} font-weight: 700;">
                                <option value="Pendente" ${p.status === 'Pendente' ? 'selected' : ''}>🟠 Pendente</option>
                                <option value="Em Andamento" ${p.status === 'Em Andamento' ? 'selected' : ''}>🔵 Em Andamento</option>
                                <option value="Concluído" ${(p.status === 'Concluído' || p.status === 'Concluída' || p.status === 'Resolvido') ? 'selected' : ''}>🟢 Resolvido / Concluído</option>
                            </select>
                        </td>
                        <td style="padding: 6px; text-align: center; white-space: nowrap;">
                            <button type="button" class="btn-save-pendencia-geral" data-id="${p.id}" title="Salvar Alterações" style="background: none; border: none; cursor: pointer; font-size: 16px; padding: 4px; margin-right: 4px;">💾</button>
                            <button type="button" class="btn-cancel-edit-pendencia-geral" data-id="${p.id}" title="Cancelar Edição" style="background: none; border: none; cursor: pointer; font-size: 14px; padding: 4px;">❌</button>
                        </td>
                    </tr>
                `;
            } else {
                const canteiroObj = canteirosGlobais.find(c => c.id === p.canteiro_id);
                const nomeObra = p.canteiro_nome || (canteiroObj ? canteiroObj.nome : 'Obra Desconhecida');

                html += `
                    <tr data-pendencia-id="${p.id}">
                        <td style="padding: 10px 12px; font-weight: 600; color: var(--color-text);">
                            ${escapeAttr(nomeObra)}
                        </td>
                        <td style="padding: 10px 12px; color: var(--color-text);">
                            ${escapeAttr(p.item || '-')}
                        </td>
                        <td style="padding: 10px 12px; color: var(--color-text-muted);">
                            ${escapeAttr(p.adequacao || '-')}
                        </td>
                        <td style="padding: 10px 12px; color: var(--color-text-muted);">
                            ${escapeAttr(p.responsavel || '-')}
                        </td>
                        <td style="padding: 10px 12px; color: var(--color-text-muted); font-size: 11px;">
                            ${formatarDataExibicao(p.data)}
                        </td>
                        <td style="padding: 10px 12px;">
                            ${renderStatusBadgeHTML(p.status)}
                        </td>
                        <td style="padding: 10px 6px; text-align: center; white-space: nowrap;">
                            <button type="button" class="btn-edit-pendencia-geral" data-id="${p.id}" title="Editar Pendência" style="background: none; border: none; cursor: pointer; font-size: 15px; padding: 4px; margin-right: 4px;">✏️</button>
                            <button type="button" class="btn-delete-pendencia-geral" data-id="${p.id}" title="Excluir Pendência" style="background: none; border: none; cursor: pointer; font-size: 15px; padding: 4px;">🗑️</button>
                        </td>
                    </tr>
                `;
            }
        });

        tbody.innerHTML = html;
        setupPendenciasGeraisEvents();

    } catch (e) {
        console.error('Erro ao carregar pendências gerais:', e);
        tbody.innerHTML = `<tr><td colspan="7" style="padding: 16px; text-align: center; color: #ef4444;">Erro ao carregar tabela de pendências.</td></tr>`;
    }
}

function setupPendenciasGeraisEvents() {
    const tbody = document.getElementById('tbody-pendencias-geral');
    if (!tbody || pendenciasEventsInitialized) return;
    pendenciasEventsInitialized = true;

    // Delegation para alteração dinâmica de canteiro no modo de edição
    tbody.addEventListener('change', (e) => {
        const target = e.target;
        const row = target.closest('tr');
        if (!row) return;

        if (target.classList.contains('pendencia-geral-canteiro')) {
            const newCanteiroId = target.value;
            const respSelect = row.querySelector('.pendencia-geral-responsavel');
            if (respSelect) {
                const currentResp = respSelect.value;
                respSelect.innerHTML = renderLiderancaOptions(newCanteiroId, currentResp);
            }
        }
    });

    // Delegation para botões de ação (✏️ Editar, 💾 Salvar, ❌ Cancelar, 🗑️ Excluir)
    tbody.addEventListener('click', async (e) => {
        const target = e.target;

        // Clique no botão ✏️ (Editar linha)
        const btnEdit = target.closest('.btn-edit-pendencia-geral');
        if (btnEdit) {
            e.stopPropagation();
            const id = btnEdit.getAttribute('data-id');
            pendenciasEmEdicao.add(String(id));
            await carregarPendenciasGerais();
            return;
        }

        // Clique no botão ❌ (Cancelar edição)
        const btnCancel = target.closest('.btn-cancel-edit-pendencia-geral');
        if (btnCancel) {
            e.stopPropagation();
            const id = btnCancel.getAttribute('data-id');
            pendenciasEmEdicao.delete(String(id));
            await carregarPendenciasGerais();
            return;
        }

        // Clique no botão 💾 (Salvar alterações)
        const btnSave = target.closest('.btn-save-pendencia-geral');
        if (btnSave) {
            e.stopPropagation();
            const id = btnSave.getAttribute('data-id');
            const row = btnSave.closest('tr');
            if (row) {
                btnSave.disabled = true;
                try {
                    await salvarLinhaPendencia(row, id);
                    pendenciasEmEdicao.delete(String(id));
                    showToast('Pendência atualizada com sucesso!');
                    await Promise.all([carregarEstatisticas(), carregarCanteiros(), carregarPendenciasGerais()]);
                } catch (err) {
                    showToast('Erro ao salvar pendência', 'error');
                } finally {
                    btnSave.disabled = false;
                }
            }
            return;
        }

        // Clique no botão 🗑️ (Excluir)
        const btnDelete = target.closest('.btn-delete-pendencia-geral');
        if (btnDelete) {
            e.stopPropagation();
            const id = btnDelete.getAttribute('data-id');
            if (confirm('Deseja realmente excluir esta pendência?')) {
                try {
                    await api.delete('/vps/pendencias/' + id);
                    pendenciasEmEdicao.delete(String(id));
                    showToast('Pendência removida com sucesso!');
                    await Promise.all([carregarEstatisticas(), carregarCanteiros(), carregarPendenciasGerais()]);
                } catch (err) {
                    showToast('Erro ao excluir pendência', 'error');
                }
            }
        }
    });
}

async function salvarLinhaPendencia(row, id) {
    const canteiroVal = row.querySelector('.pendencia-geral-canteiro').value;
    const itemVal = row.querySelector('.pendencia-geral-item').value.trim();
    const adeqVal = row.querySelector('.pendencia-geral-adequacao').value.trim();
    const respVal = row.querySelector('.pendencia-geral-responsavel').value;
    const dataVal = row.querySelector('.pendencia-geral-data').value;
    const statusVal = row.querySelector('.pendencia-geral-status').value;

    await api.put('/vps/pendencias/' + id, {
        canteiro_id: canteiroVal,
        item: itemVal,
        adequacao: adeqVal,
        responsavel: respVal,
        data: dataVal,
        status: statusVal
    });
}

async function carregarCanteiros() {
    try {
        const filtroContrato = document.getElementById('filtro-canteiro-contrato')?.value || '';
        let url = '/vps/canteiros';
        if (filtroContrato) {
            url += `?contrato=${encodeURIComponent(filtroContrato)}`;
        }

        canteirosGlobais = await api.get(url);
        const select = document.getElementById('filtro-timeline');
        
        if (select) {
            select.innerHTML = '<option value="">Todas as obras (Consolidado)</option>';
        }

        const containerAndamento = document.getElementById('canteiros-andamento');
        const containerParalisadas = document.getElementById('canteiros-paralisadas');
        const containerConcluidas = document.getElementById('canteiros-concluidas');
        
        if (containerAndamento) containerAndamento.innerHTML = '';
        if (containerParalisadas) containerParalisadas.innerHTML = '';
        if (containerConcluidas) containerConcluidas.innerHTML = '';

        if (!canteirosGlobais.length) {
            if (containerAndamento) containerAndamento.innerHTML = '<div class="empty-state">Nenhum canteiro em andamento.</div>';
            if (containerParalisadas) containerParalisadas.innerHTML = '<div class="empty-state">Nenhuma obra paralisada.</div>';
            if (containerConcluidas) containerConcluidas.innerHTML = '<div class="empty-state">Nenhuma obra concluída.</div>';
            return;
        }

        let countAndamento = 0, countParalisadas = 0, countConcluidas = 0;

        canteirosGlobais.forEach(c => {
            if (select) select.innerHTML += `<option value="${c.id}">${c.nome}</option>`;

            const bg1 = c.capa_1_path ? `url(${c.capa_1_path})` : 'var(--color-border)';
            const bg2 = c.capa_2_path ? `url(${c.capa_2_path})` : 'var(--color-border)';
            
            const statusCardHTML = renderCardStatusBadge(c.card_status);

            const card = document.createElement('div');
            card.className = 'canteiro-card';
            card.onclick = () => abrirDetalhesCanteiro(c);
            
            const statusObraHTML = c.tem_pendencias_ativas
                ? `<span class="badge badge--acao-pendente" style="background: rgba(239, 68, 68, 0.18); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.4); font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 12px; display: inline-flex; align-items: center; gap: 5px; box-shadow: 0 2px 8px rgba(239, 68, 68, 0.2);">⚠️ Ação Pendente</span>`
                : '';

            card.innerHTML = `
                ${statusCardHTML}
                <div class="canteiro-card__edit-btn" title="Editar Obra">⋮</div>
                <div class="canteiro-card__covers">
                    <div class="canteiro-card__cover" style="background-image: ${bg1}"></div>
                    <div class="canteiro-card__cover" style="background-image: ${bg2}"></div>
                </div>
                <div class="canteiro-card__content">
                    <div class="canteiro-card__title" style="display:flex; justify-content:space-between; align-items:flex-start; gap:6px;">
                        <span>${c.nome}</span>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 6px; margin-top: auto;">
                        ${c.tem_pendencias_ativas ? `<div class="canteiro-card__status">${statusObraHTML}</div>` : ''}
                        <div class="canteiro-card__maturidade">${getMaturidadeBadgeHTML(c.maturidade)}</div>
                    </div>
                </div>
            `;

            card.querySelector('.canteiro-card__edit-btn').onclick = (e) => {
                e.stopPropagation();
                abrirModalEditar(c);
            };

            if (c.status === 'Em andamento') {
                containerAndamento?.appendChild(card);
                countAndamento++;
            } else if (c.status === 'Paralisada') {
                containerParalisadas?.appendChild(card);
                countParalisadas++;
            } else {
                containerConcluidas?.appendChild(card);
                countConcluidas++;
            }
        });

        if (containerAndamento && countAndamento === 0) containerAndamento.innerHTML = '<div class="empty-state">Nenhum canteiro em andamento.</div>';
        if (containerParalisadas && countParalisadas === 0) containerParalisadas.innerHTML = '<div class="empty-state">Nenhuma obra paralisada.</div>';
        if (containerConcluidas && countConcluidas === 0) containerConcluidas.innerHTML = '<div class="empty-state">Nenhuma obra concluída.</div>';

    } catch (e) {
        console.error(e);
    }
}

function abrirModalEditar(canteiro) {
    document.getElementById('editar-canteiro-id').value = canteiro.id;
    document.getElementById('editar-canteiro-nome').value = canteiro.nome;
    document.getElementById('editar-canteiro-status').value = canteiro.status;
    const selContrato = document.getElementById('editar-canteiro-contrato');
    if (selContrato) {
        selContrato.value = canteiro.contrato || '';
    }
    const selMat = document.getElementById('editar-canteiro-maturidade');
    if (selMat) {
        selMat.value = canteiro.maturidade !== undefined ? canteiro.maturidade : 1;
        const el = document.getElementById('preview-maturidade-editar');
        if (el) el.innerHTML = renderMaturidade5SGraphic(selMat.value);
    }
    const modal = document.getElementById('modal-editar-canteiro');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
    }
}

function preencherSelectObrasModal() {
    const select = document.getElementById('evento-canteiro');
    if (!select) return;
    select.innerHTML = '<option value="">Selecione a obra...</option>';
    canteirosGlobais.forEach(c => {
        select.innerHTML += `<option value="${c.id}">${c.nome}</option>`;
    });
}

async function carregarTimeline(canteiroId) {
    await carregarTimelineParaContainer(canteiroId, 'timeline-container');
}

async function abrirDetalhesCanteiro(canteiro) {
    document.getElementById('detalhes-canteiro-titulo').textContent = canteiro.nome;
    document.getElementById('detalhes-canteiro-status').textContent = canteiro.status;
    document.getElementById('detalhes-canteiro-maturidade').innerHTML = getMaturidadeBadgeHTML(canteiro.maturidade);

    const cardStatusBox = document.getElementById('detalhes-canteiro-card-status');
    if (cardStatusBox) {
        cardStatusBox.innerHTML = renderCardStatusBadge(canteiro.card_status);
        const badgeEl = cardStatusBox.querySelector('.canteiro-card__last-card-legend');
        if (badgeEl) {
            badgeEl.style.position = 'relative';
            badgeEl.style.top = '0';
            badgeEl.style.left = '0';
            badgeEl.style.display = 'inline-flex';
            badgeEl.style.maxWidth = 'none';
        }
    }

    const graphicBox = document.getElementById('detalhes-canteiro-graphic-container');
    if (graphicBox) {
        graphicBox.innerHTML = renderMaturidade5SGraphic(canteiro.maturidade);
    }
    
    const modal = document.getElementById('modal-canteiro-detalhes');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
    }
    await carregarTimelineParaContainer(canteiro.id, 'detalhes-timeline-container');
}

function abrirModalDetalhesEvento(h) {
    const el = document.getElementById('detalhes-evento-conteudo');
    if (!el) return;

    let badgeCard = '';
    if (h.tipo_card === 'Verde') badgeCard = '<span class="badge" style="background:#22c55e; color:#fff; font-size:12px; font-weight:700; padding:5px 12px; border-radius:12px;">🟢 Card Verde (OK)</span>';
    else if (h.tipo_card === 'Amarelo') badgeCard = '<span class="badge" style="background:#eab308; color:#000; font-size:12px; font-weight:700; padding:5px 12px; border-radius:12px;">🟡 Card Amarelo (Atenção)</span>';
    else if (h.tipo_card === 'Vermelho') badgeCard = '<span class="badge" style="background:#ef4444; color:#fff; font-size:12px; font-weight:700; padding:5px 12px; border-radius:12px;">🔴 Card Vermelho (Interdição)</span>';
    else if (h.tipo_card === 'Diamante') badgeCard = '<span class="badge" style="background:#3b82f6; color:#fff; font-size:12px; font-weight:700; padding:5px 12px; border-radius:12px; box-shadow:0 0 10px rgba(59,130,246,0.5);">💎 Card Diamante (Evolução)</span>';
    else badgeCard = '<span class="badge" style="background:#a855f7; color:#fff; font-size:12px; font-weight:700; padding:5px 12px; border-radius:12px;">📊 Mudança de Maturidade</span>';

    let anexoHTML = '';
    if (h.anexo_path) {
        anexoHTML = `
            <div style="margin-top:15px; padding:12px; background:rgba(255,255,255,0.03); border:1px solid var(--color-border); border-radius:8px; display:flex; align-items:center; justify-content:space-between;">
                <span style="font-weight:600; font-size:13px; color:var(--color-text);">📄 Documento Anexado</span>
                <a href="${h.anexo_path}" target="_blank" class="btn btn--secondary" style="font-size:12px; padding:6px 14px;">Visualizar Documento</a>
            </div>
        `;
    }

    el.innerHTML = `
        <div style="background:var(--color-surface); border:1px solid var(--color-border); border-radius:12px; padding:18px; margin-bottom:16px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                <div>
                    <h3 style="margin:0; font-size:1.15rem; color:var(--color-text);">${h.canteiro_nome || 'Obra'}</h3>
                    <div style="font-size:0.82rem; color:var(--color-text-muted); margin-top:4px;">Registrado em ${formatDate(h.data_registro)} ${h.criado_por ? ' • Por matr. ' + h.criado_por : ''}</div>
                </div>
                <div>${badgeCard}</div>
            </div>
            
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap:10px; background:rgba(0,0,0,0.25); padding:12px; border-radius:8px; margin-top:12px;">
                <div>
                    <div style="font-size:11px; color:var(--color-text-muted); text-transform:uppercase;">Categoria</div>
                    <div style="font-size:13px; font-weight:700; color:var(--color-text); margin-top:2px;">${h.categoria}</div>
                </div>
                ${h.id_inspecao ? `
                <div>
                    <div style="font-size:11px; color:var(--color-text-muted); text-transform:uppercase;">ID Inspeção</div>
                    <div style="font-size:13px; font-weight:700; color:var(--color-primary); margin-top:2px;">${h.id_inspecao}</div>
                </div>
                ` : ''}
                <div>
                    <div style="font-size:11px; color:var(--color-text-muted); text-transform:uppercase;">Tipo de Card</div>
                    <div style="font-size:13px; font-weight:700; color:var(--color-text); margin-top:2px;">${h.tipo_card}</div>
                </div>
            </div>
        </div>

        <div style="margin-bottom:16px;">
            <h4 style="margin-bottom:8px; font-size:0.95rem; color:var(--color-text);">Descrição / Observações:</h4>
            <div style="background:rgba(255,255,255,0.03); border:1px solid var(--color-border); padding:14px; border-radius:8px; font-size:0.92rem; color:var(--color-text); line-height:1.5; white-space:pre-wrap;">${h.descricao || 'Sem descrição cadastrada.'}</div>
        </div>

        ${anexoHTML}
    `;

    const modal = document.getElementById('modal-detalhes-evento');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
    }
}

async function carregarTimelineParaContainer(canteiroId, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '<div class="empty-state">Carregando histórico...</div>';
    
    try {
        let url = '/vps/historico';
        if (canteiroId) url += `?canteiro_id=${canteiroId}`;
        
        const historico = await api.get(url);
        
        if (!historico.length) {
            container.innerHTML = '<div class="empty-state">Nenhum evento registrado.</div>';
            return;
        }
        
        container.innerHTML = '';
        
        historico.forEach(h => {
            const item = document.createElement('div');
            const tipoCardClass = (h.tipo_card === 'N/A') ? 'Mudanca' : h.tipo_card;
            item.className = `timeline-item timeline-item--${tipoCardClass}`;
            
            let anexoHTML = '';
            if (h.anexo_path) {
                anexoHTML = `<a href="${h.anexo_path}" target="_blank" onclick="event.stopPropagation();" class="timeline-item__anexo" style="margin-top:8px; display:inline-block;">📄 Visualizar Documento Anexo</a>`;
            }
            
            const idInspecaoText = h.id_inspecao ? ` | ID: ${h.id_inspecao}` : '';

            item.innerHTML = `
                <div class="timeline-item__badge"></div>
                <div class="timeline-item__content">
                    <button class="timeline-item__delete-btn" title="Excluir Evento">&times;</button>
                    <div class="timeline-item__header">
                        <span>${h.canteiro_nome}${idInspecaoText}</span>
                        <span>${formatDate(h.data_registro)}</span>
                    </div>
                    <div class="timeline-item__title">${h.categoria} ${h.tipo_card !== 'N/A' ? '- Card ' + h.tipo_card : ''}</div>
                    <div style="color: var(--color-text); font-size: var(--font-size-md); margin-top: 6px; line-height: 1.5;">${h.descricao || ''}</div>
                    ${anexoHTML}
                </div>
            `;

            const btnDelete = item.querySelector('.timeline-item__delete-btn');
            if (btnDelete) {
                btnDelete.onclick = async (e) => {
                    e.stopPropagation();
                    if (confirm(`Deseja realmente excluir o evento "${h.categoria}" da obra ${h.canteiro_nome}?`)) {
                        try {
                            await api.delete('/vps/historico/' + h.id);
                            showToast('Evento excluído do histórico com sucesso!');
                            await Promise.all([carregarEstatisticas(), carregarCanteiros(), carregarTimelineParaContainer(canteiroId, containerId)]);
                        } catch (err) {
                            showToast('Erro ao excluir evento do histórico.', 'error');
                        }
                    }
                };
            }

            const contentDiv = item.querySelector('.timeline-item__content');
            if (contentDiv) {
                contentDiv.onclick = (e) => {
                    if (e.target.closest('.timeline-item__delete-btn') || e.target.closest('.timeline-item__anexo')) {
                        return;
                    }
                    abrirModalDetalhesEvento(h);
                };
            }

            container.appendChild(item);
        });
        
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="empty-state">Erro ao carregar histórico.</div>';
    }
}
