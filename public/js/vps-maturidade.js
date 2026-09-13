// public/js/vps-maturidade.js

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Verificar autenticação e permissão (Apenas ADM)
    const user = await requireLogin('adm');
    if (!user) return; // Se não for adm, já foi redirecionado

    document.getElementById('sidebar-root').innerHTML = buildSidebar(user, 'vps');
    initLogout();

    // 2. Carregar dados iniciais
    await carregarEstatisticas();
    await carregarCanteiros();
    await carregarTimeline('');

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
            // A api.upload pode não suportar PUT diretamente se não tivermos ajustado, mas assumindo que usa fetch normal:
            const response = await fetch(`/api/vps/canteiros/${id}`, {
                method: 'PUT',
                body: formData,
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}` // ou session header
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
        document.getElementById('stat-em-andamento').textContent = stats.emAndamento || 0;
        document.getElementById('stat-concluidas').textContent = stats.concluidas || 0;
        
        // Remove os cards de maturidade dinâmicos existentes (se houver recarregamento)
        const container = document.getElementById('stats-grid-container');
        container.querySelectorAll('.stat-card--dynamic').forEach(el => el.remove());

        // Adiciona novos cards se > 0
        const maturidades = [
            { level: 4, count: stats.maturidade4, label: 'Maturidade 4', icon: '🏆' },
            { level: 3, count: stats.maturidade3, label: 'Maturidade 3', icon: '⭐' },
            { level: 2, count: stats.maturidade2, label: 'Maturidade 2', icon: '📈' },
            { level: 1, count: stats.maturidade1, label: 'Maturidade 1', icon: '🌱' }
        ];

        maturidades.forEach(m => {
            if (m.count > 0) {
                const card = document.createElement('div');
                card.className = 'stat-card stat-card--dynamic';
                card.innerHTML = `
                    <div class="stat-card__value">${m.count}</div>
                    <div class="stat-card__label">${m.label}</div>
                    <div class="stat-card__icon">${m.icon}</div>
                `;
                container.appendChild(card);
            }
        });
    } catch (e) {
        console.error(e);
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
    } else {
        groupCard.style.display = 'block';
        inputCard.setAttribute('required', 'required');
        groupNivel.style.display = 'none';
        inputNivel.removeAttribute('required');
    }

    // Regra do Diamante
    const canteiroId = document.getElementById('evento-canteiro').value;
    const canteiro = canteirosGlobais.find(c => c.id === canteiroId);
    const diamanteOption = document.getElementById('option-diamante');
    
    if (canteiro && canteiro.maturidade === 4) {
        diamanteOption.style.display = 'block';
    } else {
        diamanteOption.style.display = 'none';
        if (inputCard.value === 'Diamante') {
            inputCard.value = 'Verde'; // reset se estava selecionado
        }
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
            
            const card = document.createElement('div');
            card.className = 'canteiro-card';
            card.onclick = () => {
                abrirDetalhesCanteiro(c);
            };
            
            card.innerHTML = `
                <div class="canteiro-card__edit-btn" title="Editar Obra">⋮</div>
                <div class="canteiro-card__covers">
                    <div class="canteiro-card__cover" style="background-image: ${bg1}"></div>
                    <div class="canteiro-card__cover" style="background-image: ${bg2}"></div>
                </div>
                <div class="canteiro-card__content">
                    <div class="canteiro-card__title">${c.nome}</div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: auto;">
                        <div class="canteiro-card__status">${c.status}</div>
                        <div class="canteiro-card__maturidade badge badge--primary">Maturidade ${c.maturidade}</div>
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
    document.getElementById('detalhes-canteiro-maturidade').textContent = 'Maturidade ' + canteiro.maturidade;
    
    document.getElementById('modal-canteiro-detalhes').classList.add('active');
    await carregarTimelineParaContainer(canteiro.id, 'detalhes-timeline-container');
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
            // Se tipo_card for N/A (Mudança Maturidade), usaremos uma classe default (ex: verde ou cinza)
            const tipoCardClass = (h.tipo_card === 'N/A') ? 'Mudanca' : h.tipo_card;
            item.className = `timeline-item timeline-item--${tipoCardClass}`;
            
            let imgsHTML = '';
            if (h.evidencia_1_path) imgsHTML += `<img src="${h.evidencia_1_path}" class="timeline-item__img" onclick="window.open('${h.evidencia_1_path}','_blank')">`;
            if (h.evidencia_2_path) imgsHTML += `<img src="${h.evidencia_2_path}" class="timeline-item__img" onclick="window.open('${h.evidencia_2_path}','_blank')">`;
            
            let anexoHTML = '';
            if (h.anexo_path) {
                anexoHTML = `<a href="${h.anexo_path}" target="_blank" class="timeline-item__anexo">📄 Visualizar Documento</a>`;
            }
            
            // Exibir ID Inspeção se houver
            const idInspecaoText = h.id_inspecao ? ` | ID: ${h.id_inspecao}` : '';

            item.innerHTML = `
                <div class="timeline-item__badge"></div>
                <div class="timeline-item__content">
                    <div class="timeline-item__header">
                        <span>${h.canteiro_nome}${idInspecaoText}</span>
                        <span>${formatDate(h.data_registro)}</span>
                    </div>
                    <div class="timeline-item__title">${h.categoria} ${h.tipo_card !== 'N/A' ? '- Card ' + h.tipo_card : ''}</div>
                    <div style="color: var(--color-text); font-size: var(--font-size-md);">${h.descricao || ''}</div>
                    ${imgsHTML ? `<div class="timeline-item__evidencias">${imgsHTML}</div>` : ''}
                    ${anexoHTML}
                </div>
            `;
            container.appendChild(item);
        });
        
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="empty-state">Erro ao carregar histórico.</div>';
    }
}
