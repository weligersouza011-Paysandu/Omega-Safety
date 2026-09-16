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
    // 1. Verificar autenticação e permissão (Apenas ADM)
    const user = await requireLogin('adm');
    if (!user) return; // Se não for adm, já foi redirecionado

    document.getElementById('sidebar-root').innerHTML = buildSidebar(user, 'vps');
    initLogout();

    setupMaturidadePreviews();

    // 2. Carregar dados iniciais
    await carregarEstatisticas();
    await carregarCanteiros();
    await carregarTimeline('');

    // 3. Registrar ouvinte de sincronização global reativa (auto-refresh sem F5)
    if (typeof window.onGlobalChange === 'function') {
        window.onGlobalChange(async () => {
            await carregarEstatisticas();
            await carregarCanteiros();
            const sel = document.getElementById('filtro-timeline');
            await carregarTimeline(sel ? sel.value : '');
        });
    }

    // 3. Event Listeners
    // Lógica das abas
    document.querySelectorAll('.vps-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.vps-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.vps-tab-content').forEach(c => c.style.display = 'none');
            
            btn.classList.add('active');
            const target = btn.getAttribute('data-target');
            document.getElementById(target).style.display = 'block';
        });
    });

    document.getElementById('btn-novo-canteiro').addEventListener('click', () => {
        document.getElementById('modal-canteiro').classList.add('active');
        const sel = document.getElementById('canteiro-maturidade-inicial');
        if (sel) {
            const el = document.getElementById('preview-maturidade-inicial');
            if (el) el.innerHTML = renderMaturidade5SGraphic(sel.value);
        }
    });

    document.getElementById('btn-novo-evento').addEventListener('click', () => {
        preencherSelectObrasModal();
        document.getElementById('modal-evento').classList.add('active');
        atualizarFormEvento(); // Inicializa lógica do form
    });

    // Lógica condicional do formulário de evento
    document.getElementById('evento-categoria').addEventListener('change', atualizarFormEvento);
    document.getElementById('evento-canteiro').addEventListener('change', atualizarFormEvento);

    document.getElementById('form-canteiro').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        
        try {
            const formData = new FormData(e.target);
            await api.upload('/vps/canteiros', formData);
            showToast('Canteiro cadastrado com sucesso!');
            document.getElementById('modal-canteiro').classList.remove('active');
            e.target.reset();
            await carregarEstatisticas();
            await carregarCanteiros();
        } catch (error) {
            showToast('Erro ao cadastrar canteiro', 'error');
        } finally {
            btn.disabled = false;
        }
    });

    document.getElementById('form-editar-canteiro').addEventListener('submit', async (e) => {
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
            document.getElementById('modal-editar-canteiro').classList.remove('active');
            e.target.reset();
            await carregarEstatisticas();
            await carregarCanteiros();
        } catch (error) {
            showToast('Erro ao atualizar canteiro', 'error');
        } finally {
            btn.disabled = false;
        }
    });

    document.getElementById('form-evento').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        
        try {
            const formData = new FormData(e.target);
            formData.append('data_registro', new Date().toISOString().split('T')[0]); // Data atual
            await api.upload('/vps/historico', formData);
            showToast('Evento registrado com sucesso!');
            document.getElementById('modal-evento').classList.remove('active');
            e.target.reset();
            await carregarTimeline(document.getElementById('filtro-timeline').value);
        } catch (error) {
            showToast('Erro ao registrar evento', 'error');
        } finally {
            btn.disabled = false;
        }
    });
});

let canteirosGlobais = [];

async function carregarEstatisticas() {
    try {
        const stats = await api.get('/vps/stats');
        
        // 1. CARDS SUPERIORES: ESTRITAMENTE APENAS OBRAS EM ANDAMENTO
        const container = document.getElementById('stats-grid-container');
        if (container) {
            container.innerHTML = '';

            // Obras ativas em andamento é a base estrita do cálculo estatístico superior
            const totalEmAndamento = Number(stats.emAndamento) || 0;

            const maturidades = [
                { 
                    level: 4, 
                    count: Number(stats.maturidade4) || 0, 
                    label: 'Excelência', 
                    fullLabel: 'Maturidade 4 — Excelência', 
                    color: '#3b82f6', 
                    textColor: '#ffffff',
                    bgLight: 'rgba(59, 130, 246, 0.14)', 
                    borderColor: 'rgba(59, 130, 246, 0.35)', 
                    glow: 'rgba(59, 130, 246, 0.35)',
                    icon: '🏆' 
                },
                { 
                    level: 3, 
                    count: Number(stats.maturidade3) || 0, 
                    label: 'Implantado', 
                    fullLabel: 'Maturidade 3 — Implantado', 
                    color: '#22c55e', 
                    textColor: '#ffffff',
                    bgLight: 'rgba(34, 197, 94, 0.14)', 
                    borderColor: 'rgba(34, 197, 94, 0.35)', 
                    glow: 'rgba(34, 197, 94, 0.35)',
                    icon: '⭐' 
                },
                { 
                    level: 2, 
                    count: Number(stats.maturidade2) || 0, 
                    label: 'Em implantação', 
                    fullLabel: 'Maturidade 2 — Em implantação', 
                    color: '#eab308', 
                    textColor: '#000000',
                    bgLight: 'rgba(234, 179, 8, 0.14)', 
                    borderColor: 'rgba(234, 179, 8, 0.35)', 
                    glow: 'rgba(234, 179, 8, 0.35)',
                    icon: '📈' 
                },
                { 
                    level: 1, 
                    count: Number(stats.maturidade1) || 0, 
                    label: 'Fraco', 
                    fullLabel: 'Maturidade 1 — Fraco', 
                    color: '#f97316', 
                    textColor: '#ffffff',
                    bgLight: 'rgba(249, 115, 22, 0.14)', 
                    borderColor: 'rgba(249, 115, 22, 0.35)', 
                    glow: 'rgba(249, 115, 22, 0.35)',
                    icon: '🌱' 
                },
                { 
                    level: 0, 
                    count: Number(stats.maturidade0) || 0, 
                    label: 'Inexistente', 
                    fullLabel: 'Maturidade 0 — Inexistente', 
                    color: '#ef4444', 
                    textColor: '#ffffff',
                    bgLight: 'rgba(239, 68, 68, 0.14)', 
                    borderColor: 'rgba(239, 68, 68, 0.35)', 
                    glow: 'rgba(239, 68, 68, 0.35)',
                    icon: '❌' 
                }
            ];

            // Renderizar apenas faixas de maturidade ativas em obras em andamento
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

        // 2. SEÇÃO DE CARDS HISTÓRICOS INFERIORES (COMPACTOS)
        const containerCompact = document.getElementById('historico-cards-compact-container');
        if (containerCompact) {
            containerCompact.innerHTML = '';

            const cardsCompactos = [
                {
                    tipo: 'Diamante',
                    label: 'Card Diamante',
                    count: Number(stats.cardsDiamante) || 0,
                    color: '#3b82f6',
                    textColor: '#ffffff',
                    glow: 'rgba(59, 130, 246, 0.35)',
                    bgLight: 'rgba(59, 130, 246, 0.12)',
                    borderColor: 'rgba(59, 130, 246, 0.35)',
                    icon: '💎',
                    subtext: 'Destaques e Evoluções'
                },
                {
                    tipo: 'Verde',
                    label: 'Card Verde',
                    count: Number(stats.cardsVerde) || 0,
                    color: '#22c55e',
                    textColor: '#ffffff',
                    glow: 'rgba(34, 197, 94, 0.35)',
                    bgLight: 'rgba(34, 197, 94, 0.12)',
                    borderColor: 'rgba(34, 197, 94, 0.35)',
                    icon: '🟢',
                    subtext: 'Conforme / 5S OK'
                },
                {
                    tipo: 'Amarelo',
                    label: 'Card Amarelo',
                    count: Number(stats.cardsAmarelo) || 0,
                    color: '#eab308',
                    textColor: '#000000',
                    glow: 'rgba(234, 179, 8, 0.35)',
                    bgLight: 'rgba(234, 179, 8, 0.12)',
                    borderColor: 'rgba(234, 179, 8, 0.35)',
                    icon: '🟡',
                    subtext: 'Alertas de Não Conformidade'
                },
                {
                    tipo: 'Vermelho',
                    label: 'Card Vermelho',
                    count: Number(stats.cardsVermelho) || 0,
                    color: '#ef4444',
                    textColor: '#ffffff',
                    glow: 'rgba(239, 68, 68, 0.35)',
                    bgLight: 'rgba(239, 68, 68, 0.12)',
                    borderColor: 'rgba(239, 68, 68, 0.35)',
                    icon: '🔴',
                    subtext: 'Interdições / Gravíssimos'
                }
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
    const categoria = document.getElementById('evento-categoria').value;
    const groupCard = document.getElementById('group-tipo-card');
    const groupNivel = document.getElementById('group-nova-maturidade');
    const inputCard = document.getElementById('evento-tipo-card');
    const inputNivel = document.getElementById('evento-novo-nivel');

    if (categoria === 'Mudança de Maturidade') {
        groupCard.style.display = 'none';
        inputCard.removeAttribute('required');
        groupNivel.style.display = 'block';
        inputNivel.setAttribute('required', 'required');
        const el = document.getElementById('preview-maturidade-novo-nivel');
        if (el && inputNivel) el.innerHTML = renderMaturidade5SGraphic(inputNivel.value);
    } else {
        groupCard.style.display = 'block';
        inputCard.setAttribute('required', 'required');
        groupNivel.style.display = 'none';
        inputNivel.removeAttribute('required');
    }

    // Opção Diamante sempre disponível para seleção manual na rotina de inspeção
    const diamanteOption = document.getElementById('option-diamante');
    if (diamanteOption) {
        diamanteOption.style.display = 'block';
    }
}

async function carregarCanteiros() {
    try {
        canteirosGlobais = await api.get('/vps/canteiros');
        const select = document.getElementById('filtro-timeline');
        
        // Limpar e repopular o select da timeline
        select.innerHTML = '<option value="">Todas as obras (Consolidado)</option>';
        
        const containerAndamento = document.getElementById('canteiros-andamento');
        const containerParalisadas = document.getElementById('canteiros-paralisadas');
        const containerConcluidas = document.getElementById('canteiros-concluidas');
        
        containerAndamento.innerHTML = '';
        containerParalisadas.innerHTML = '';
        containerConcluidas.innerHTML = '';

        if (!canteirosGlobais.length) {
            containerAndamento.innerHTML = '<div class="empty-state">Nenhum canteiro em andamento.</div>';
            containerParalisadas.innerHTML = '<div class="empty-state">Nenhuma obra paralisada.</div>';
            containerConcluidas.innerHTML = '<div class="empty-state">Nenhuma obra concluída.</div>';
            return;
        }

        let countAndamento = 0, countParalisadas = 0, countConcluidas = 0;

        canteirosGlobais.forEach(c => {
            select.innerHTML += `<option value="${c.id}">${c.nome}</option>`;

            const bg1 = c.capa_1_path ? `url(${c.capa_1_path})` : 'var(--color-border)';
            const bg2 = c.capa_2_path ? `url(${c.capa_2_path})` : 'var(--color-border)';
            
            // Legenda do último card recebido no topo do canteiro
            let ultimoCardHTML = '';
            if (c.ultimo_card) {
                let cardColor = '#22c55e', cardIcon = '🟢', cardLabel = 'Verde';
                if (c.ultimo_card === 'Amarelo') { cardColor = '#eab308'; cardIcon = '🟡'; cardLabel = 'Amarelo'; }
                else if (c.ultimo_card === 'Vermelho') { cardColor = '#ef4444'; cardIcon = '🔴'; cardLabel = 'Vermelho'; }
                else if (c.ultimo_card === 'Diamante') { cardColor = '#3b82f6'; cardIcon = '💎'; cardLabel = 'Diamante'; }
                
                ultimoCardHTML = `
                    <div class="canteiro-card__last-card-legend" title="Último status de inspeção" style="position: absolute; top: 10px; left: 10px; z-index: 10; background: rgba(11, 19, 41, 0.88); backdrop-filter: blur(4px); border: 1px solid ${cardColor}; color: #ffffff; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; display: flex; align-items: center; gap: 5px; box-shadow: 0 2px 8px rgba(0,0,0,0.5);">
                        <span style="font-size: 12px;">${cardIcon}</span>
                        <span>Último: Card ${cardLabel}</span>
                    </div>
                `;
            } else {
                ultimoCardHTML = `
                    <div class="canteiro-card__last-card-legend" style="position: absolute; top: 10px; left: 10px; z-index: 10; background: rgba(11, 19, 41, 0.7); backdrop-filter: blur(4px); border: 1px solid rgba(255,255,255,0.12); color: var(--color-text-muted, #94a3b8); padding: 4px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">
                        Sem histórico
                    </div>
                `;
            }

            const card = document.createElement('div');
            card.className = 'canteiro-card';
            card.onclick = () => {
                abrirDetalhesCanteiro(c);
            };
            
            card.innerHTML = `
                ${ultimoCardHTML}
                <div class="canteiro-card__edit-btn" title="Editar Obra">⋮</div>
                <div class="canteiro-card__covers">
                    <div class="canteiro-card__cover" style="background-image: ${bg1}"></div>
                    <div class="canteiro-card__cover" style="background-image: ${bg2}"></div>
                </div>
                <div class="canteiro-card__content">
                    <div class="canteiro-card__title">${c.nome}</div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: auto;">
                        <div class="canteiro-card__status">${c.status}</div>
                        <div class="canteiro-card__maturidade">${getMaturidadeBadgeHTML(c.maturidade)}</div>
                    </div>
                </div>
            `;

            card.querySelector('.canteiro-card__edit-btn').onclick = (e) => {
                e.stopPropagation();
                abrirModalEditar(c);
            };

            if (c.status === 'Em andamento') {
                containerAndamento.appendChild(card);
                countAndamento++;
            } else if (c.status === 'Paralisada') {
                containerParalisadas.appendChild(card);
                countParalisadas++;
            } else {
                containerConcluidas.appendChild(card);
                countConcluidas++;
            }
        });

        if(countAndamento === 0) containerAndamento.innerHTML = '<div class="empty-state">Nenhum canteiro em andamento.</div>';
        if(countParalisadas === 0) containerParalisadas.innerHTML = '<div class="empty-state">Nenhuma obra paralisada.</div>';
        if(countConcluidas === 0) containerConcluidas.innerHTML = '<div class="empty-state">Nenhuma obra concluída.</div>';

    } catch (e) {
        console.error(e);
    }
}

function abrirModalEditar(canteiro) {
    document.getElementById('editar-canteiro-id').value = canteiro.id;
    document.getElementById('editar-canteiro-nome').value = canteiro.nome;
    document.getElementById('editar-canteiro-status').value = canteiro.status;
    const selMat = document.getElementById('editar-canteiro-maturidade');
    if (selMat) {
        selMat.value = canteiro.maturidade !== undefined ? canteiro.maturidade : 1;
        const el = document.getElementById('preview-maturidade-editar');
        if (el) el.innerHTML = renderMaturidade5SGraphic(selMat.value);
    }
    document.getElementById('modal-editar-canteiro').classList.add('active');
}

function preencherSelectObrasModal() {
    const select = document.getElementById('evento-canteiro');
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
    const graphicBox = document.getElementById('detalhes-canteiro-graphic-container');
    if (graphicBox) {
        graphicBox.innerHTML = renderMaturidade5SGraphic(canteiro.maturidade);
    }
    
    document.getElementById('modal-canteiro-detalhes').classList.add('active');
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

    let imgsHTML = '';
    if (h.evidencia_1_path) {
        imgsHTML += `
            <div style="text-align:center;">
                <img src="${h.evidencia_1_path}" style="max-width:100%; max-height:220px; border-radius:8px; border:1px solid var(--color-border); cursor:pointer; object-fit:cover;" onclick="window.open('${h.evidencia_1_path}','_blank')">
                <div style="font-size:11px; color:var(--color-text-muted); margin-top:4px;">Evidência 1</div>
            </div>
        `;
    }
    if (h.evidencia_2_path) {
        imgsHTML += `
            <div style="text-align:center;">
                <img src="${h.evidencia_2_path}" style="max-width:100%; max-height:220px; border-radius:8px; border:1px solid var(--color-border); cursor:pointer; object-fit:cover;" onclick="window.open('${h.evidencia_2_path}','_blank')">
                <div style="font-size:11px; color:var(--color-text-muted); margin-top:4px;">Evidência 2</div>
            </div>
        `;
    }

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

        ${imgsHTML ? `
        <div style="margin-bottom:16px;">
            <h4 style="margin-bottom:10px; font-size:0.95rem; color:var(--color-text);">Evidências Fotográficas:</h4>
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:12px;">
                ${imgsHTML}
            </div>
        </div>
        ` : ''}

        ${anexoHTML}
    `;

    document.getElementById('modal-detalhes-evento').classList.add('active');
}

async function carregarTimelineParaContainer(canteiroId, containerId) {
    const container = document.getElementById(containerId);
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
            
            let imgsHTML = '';
            if (h.evidencia_1_path) imgsHTML += `<img src="${h.evidencia_1_path}" class="timeline-item__img" onclick="event.stopPropagation(); window.open('${h.evidencia_1_path}','_blank')">`;
            if (h.evidencia_2_path) imgsHTML += `<img src="${h.evidencia_2_path}" class="timeline-item__img" onclick="event.stopPropagation(); window.open('${h.evidencia_2_path}','_blank')">`;
            
            let anexoHTML = '';
            if (h.anexo_path) {
                anexoHTML = `<a href="${h.anexo_path}" target="_blank" onclick="event.stopPropagation();" class="timeline-item__anexo">📄 Visualizar Documento</a>`;
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
                    <div style="color: var(--color-text); font-size: var(--font-size-md); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${h.descricao || ''}</div>
                    ${imgsHTML ? `<div class="timeline-item__evidencias">${imgsHTML}</div>` : ''}
                    ${anexoHTML}
                </div>
            `;

            // Botão de Exclusão
            const btnDelete = item.querySelector('.timeline-item__delete-btn');
            if (btnDelete) {
                btnDelete.onclick = async (e) => {
                    e.stopPropagation();
                    if (confirm(`Deseja realmente excluir o evento "${h.categoria}" da obra ${h.canteiro_nome}?`)) {
                        try {
                            await api.delete('/vps/historico/' + h.id);
                            showToast('Evento excluído do histórico com sucesso!');
                            await carregarEstatisticas();
                            await carregarCanteiros();
                            await carregarTimelineParaContainer(canteiroId, containerId);
                        } catch (err) {
                            showToast('Erro ao excluir evento do histórico.', 'error');
                        }
                    }
                };
            }

            // Clique para abrir detalhes completos
            const contentDiv = item.querySelector('.timeline-item__content');
            if (contentDiv) {
                contentDiv.onclick = (e) => {
                    if (e.target.closest('.timeline-item__delete-btn') || e.target.closest('.timeline-item__anexo') || e.target.closest('.timeline-item__img')) {
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
