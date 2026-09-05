// public/js/admin-usuarios.js

let parsedUsers = [];

document.addEventListener('DOMContentLoaded', async () => {
    // Apenas ADM pode acessar
    const user = await requireLogin('adm');
    if (!user) return;

    document.getElementById('sidebar-root').innerHTML = buildSidebar(user, 'usuarios');
    initLogout();

    setupTabs();
    setupUserList();
    setupBatchLogic();
    setupAdmLogic();
    setupDashboard();
    setupAddUserSelector();
});

// ── Lógica da Lista Geral (Visualizar, Editar, Excluir) ────────
function setupUserList() {
    const tbodyOp = document.getElementById('user-list-op-tbody');
    const tbodyAdm = document.getElementById('user-list-adm-tbody');
    const checkAll = document.getElementById('check-all');
    const btnBatchDelete = document.getElementById('btn-delete-batch');
    const batchCountSpan = document.getElementById('batch-count');
    
    let usersData = [];

    // Carrega usuários da API
    async function loadUsers() {
        try {
            usersData = await api.get('/users');
            renderTables();
        } catch (err) {
            tbodyOp.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--color-red-primary);">Erro ao carregar usuários: ${err.message}</td></tr>`;
            tbodyAdm.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--color-red-primary);">Erro ao carregar usuários: ${err.message}</td></tr>`;
        }
    }

    // Renderiza as tabelas
    function renderTables() {
        const operacionais = usersData.filter(u => u.perfil === 'operacional');
        const adms = usersData.filter(u => u.perfil === 'adm');

        // Operacionais
        if (!operacionais.length) {
            tbodyOp.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:var(--space-xl);">Nenhum usuário operacional encontrado.</td></tr>`;
        } else {
            const defaultAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path fill='%23ccc' d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/></svg>";
            
            tbodyOp.innerHTML = operacionais.map(u => `
                <tr id="tr-${u.id}">
                    <td style="text-align:center;"><input type="checkbox" class="row-checkbox" data-id="${u.id}"></td>
                    <td>
                        <div style="display:flex; align-items:center; gap:10px;">
                            <img src="${u.foto_perfil || defaultAvatar}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:1px solid var(--color-border);" alt="Avatar">
                            <div>
                                <span class="view-mode" id="view-nome-${u.id}">${u.nome}</span>
                                <input type="text" class="edit-mode form-input" id="edit-nome-${u.id}" value="${u.nome}" style="display:none; padding:4px 8px;">
                                <div style="font-size:10px; color:var(--color-text-secondary); margin-top:2px;">${u.foto_perfil ? '👑 Ouro' : '🥉 Bronze'}</div>
                            </div>
                        </div>
                    </td>
                    <td style="font-family:monospace;">
                        <span class="view-mode" id="view-mat-${u.id}">${u.matricula}</span>
                        <input type="text" class="edit-mode form-input" id="edit-mat-${u.id}" value="${u.matricula}" style="display:none; padding:4px 8px;">
                    </td>
                    <td>
                        <span class="view-mode" id="view-contrato-${u.id}">${u.contrato || '—'}</span>
                        <input type="text" class="edit-mode form-input" id="edit-contrato-${u.id}" value="${u.contrato || ''}" style="display:none; padding:4px 8px; width:60px;">
                    </td>
                    <td style="text-align:center;">
                        <span class="view-mode" id="view-lideranca-${u.id}">${u.is_lideranca ? '🌟 Sim' : 'Não'}</span>
                        <select class="edit-mode form-input" id="edit-lideranca-${u.id}" style="display:none; padding:4px; width:70px;">
                            <option value="0" ${!u.is_lideranca ? 'selected' : ''}>Não</option>
                            <option value="1" ${u.is_lideranca ? 'selected' : ''}>Sim</option>
                        </select>
                    </td>
                    <td style="text-align:right;">
                        <button class="btn-icon btn-edit view-mode" data-id="${u.id}" title="Editar" style="background:none; border:none; cursor:pointer; font-size:16px;">✏️</button>
                        <button class="btn-icon btn-save edit-mode" data-id="${u.id}" title="Salvar" style="display:none; background:none; border:none; cursor:pointer; font-size:16px;">💾</button>
                        <button class="btn-icon btn-cancel edit-mode" data-id="${u.id}" title="Cancelar" style="display:none; background:none; border:none; cursor:pointer; font-size:16px;">❌</button>
                    </td>
                </tr>
            `).join('');
        }

        // ADMs
        if (!adms.length) {
            tbodyAdm.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:var(--space-xl);">Nenhum administrador encontrado.</td></tr>`;
        } else {
            const defaultAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path fill='%23ccc' d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/></svg>";
            
            tbodyAdm.innerHTML = adms.map(u => `
                <tr id="tr-${u.id}">
                    <td style="text-align:center;"><span title="ADM não selecionável" style="opacity:0.3;">🔒</span></td>
                    <td>
                        <div style="display:flex; align-items:center; gap:10px;">
                            <img src="${u.foto_perfil || defaultAvatar}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:1px solid var(--color-border);" alt="Avatar">
                            <div>
                                <span class="view-mode" id="view-nome-${u.id}">${u.nome}</span>
                                <input type="text" class="edit-mode form-input" id="edit-nome-${u.id}" value="${u.nome}" style="display:none; padding:4px 8px;">
                                <div style="font-size:10px; color:var(--color-text-secondary); margin-top:2px;">${u.foto_perfil ? '👑 Ouro' : '🥉 Bronze'}</div>
                            </div>
                        </div>
                    </td>
                    <td style="font-family:monospace;">
                        <span class="view-mode" id="view-mat-${u.id}">${u.matricula}</span>
                        <input type="text" class="edit-mode form-input" id="edit-mat-${u.id}" value="${u.matricula}" style="display:none; padding:4px 8px;">
                    </td>
                    <td>
                        <span class="view-mode" id="view-contrato-${u.id}">${u.contrato || '—'}</span>
                        <input type="text" class="edit-mode form-input" id="edit-contrato-${u.id}" value="${u.contrato || ''}" style="display:none; padding:4px 8px; width:60px;" maxlength="3" pattern="\\d{3}" inputmode="numeric">
                    </td>
                    <td style="text-align:center;">
                        <span class="view-mode" id="view-lideranca-${u.id}">${u.is_lideranca ? '🌟 Sim' : 'Não'}</span>
                        <select class="edit-mode form-input" id="edit-lideranca-${u.id}" style="display:none; padding:4px; width:70px;">
                            <option value="0" ${!u.is_lideranca ? 'selected' : ''}>Não</option>
                            <option value="1" ${u.is_lideranca ? 'selected' : ''}>Sim</option>
                        </select>
                    </td>
                    <td style="text-align:right;">
                        <button class="btn-icon btn-edit view-mode" data-id="${u.id}" title="Editar" style="background:none; border:none; cursor:pointer; font-size:16px;">✏️</button>
                        <button class="btn-icon btn-delete-adm view-mode" data-id="${u.id}" title="Excluir Administrador" style="background:none; border:none; cursor:pointer; font-size:16px;">🗑️</button>
                        <button class="btn-icon btn-save edit-mode" data-id="${u.id}" title="Salvar" style="display:none; background:none; border:none; cursor:pointer; font-size:16px;">💾</button>
                        <button class="btn-icon btn-cancel edit-mode" data-id="${u.id}" title="Cancelar" style="display:none; background:none; border:none; cursor:pointer; font-size:16px;">❌</button>
                    </td>
                </tr>
            `).join('');
        }
        
        updateBatchButtonState();

        // Reaplica o filtro de busca ao renderizar/carregar
        const searchInput = document.getElementById('search-users-input');
        if (searchInput && searchInput.value.trim() !== '') {
            searchInput.dispatchEvent(new Event('input'));
        }
    }

    // ── Delegação de Eventos na Tabela ──
    document.getElementById('tab-list').addEventListener('click', async (e) => {
        const target = e.target;
        const id = target.dataset.id;
        
        if (!id) return; // clique fora de botão relevante

        // Editar
        if (target.classList.contains('btn-edit')) {
            toggleEditMode(id, true);
        }
        // Cancelar Edição
        else if (target.classList.contains('btn-cancel')) {
            toggleEditMode(id, false);
            // Restaura valores originais
            const u = usersData.find(x => x.id == id);
            document.getElementById(`edit-nome-${id}`).value = u.nome;
            document.getElementById(`edit-mat-${id}`).value = u.matricula;
            document.getElementById(`edit-contrato-${id}`).value = u.contrato || '';
            document.getElementById(`edit-lideranca-${id}`).value = u.is_lideranca || 0;
        }
        // Salvar Edição
        else if (target.classList.contains('btn-save')) {
            const u = usersData.find(x => x.id == id);
            const novoNome = document.getElementById(`edit-nome-${id}`).value.trim();
            const novaMat = document.getElementById(`edit-mat-${id}`).value.trim();
            const novoContrato = document.getElementById(`edit-contrato-${id}`).value.trim();
            const novaLideranca = parseInt(document.getElementById(`edit-lideranca-${id}`).value, 10);
            
            // Validação de Contrato: obrigatoriamente 3 dígitos numéricos se fornecido
            if (novoContrato && !/^\d{3}$/.test(novoContrato)) {
                showToast('O contrato deve conter exatamente 3 dígitos numéricos (ou ficar em branco).', 'error');
                return;
            }
            
            try {
                await api.patch(`/users/${id}`, { nome: novoNome, matricula: novaMat, contrato: novoContrato || null });
                if (u.is_lideranca !== novaLideranca) {
                    await api.patch(`/users/${id}/lideranca`, { is_lideranca: novaLideranca });
                }
                showToast('Usuário atualizado com sucesso.', 'success');
                // Atualiza cache local
                u.nome = novoNome;
                u.matricula = novaMat;
                u.contrato = novoContrato || null;
                u.is_lideranca = novaLideranca;
                // Atualiza View Mode elements
                document.getElementById(`view-nome-${id}`).textContent = novoNome;
                document.getElementById(`view-mat-${id}`).textContent = novaMat;
                document.getElementById(`view-contrato-${id}`).textContent = novoContrato || '—';
                document.getElementById(`view-lideranca-${id}`).textContent = novaLideranca ? '🌟 Sim' : 'Não';
                toggleEditMode(id, false);
            } catch (err) {
                showToast(err.message || 'Erro ao salvar edição.', 'error');
            }
        }
        // Excluir ADM Individual
        else if (target.classList.contains('btn-delete-adm')) {
            // Modal Customizado ou Confirm Nativ
            if (confirm('ATENÇÃO: Tem certeza que deseja remover este administrador?\nEsta ação exige extrema cautela e removerá os privilégios imediatamente.')) {
                try {
                    const res = await api.delete(`/users/${id}`);
                    showToast(res.message, 'success');
                    loadUsers();
                } catch (err) {
                    showToast(err.message || 'Erro ao excluir ADM.', 'error');
                }
            }
        }
    });

    function toggleEditMode(id, isEditing) {
        const tr = document.getElementById(`tr-${id}`);
        tr.querySelectorAll('.view-mode').forEach(el => el.style.display = isEditing ? 'none' : '');
        tr.querySelectorAll('.edit-mode').forEach(el => el.style.display = isEditing ? 'inline-block' : 'none');
    }

    // ── Lógica de Seleção / Checkboxes ──
    checkAll.addEventListener('change', () => {
        const checkboxes = tbodyOp.querySelectorAll('.row-checkbox');
        checkboxes.forEach(cb => cb.checked = checkAll.checked);
        updateBatchButtonState();
    });

    tbodyOp.addEventListener('change', (e) => {
        if (e.target.classList.contains('row-checkbox')) {
            updateBatchButtonState();
            const allCheckboxes = Array.from(tbodyOp.querySelectorAll('.row-checkbox'));
            checkAll.checked = allCheckboxes.length > 0 && allCheckboxes.every(cb => cb.checked);
        }
    });

    function updateBatchButtonState() {
        const checked = tbodyOp.querySelectorAll('.row-checkbox:checked').length;
        batchCountSpan.textContent = checked;
        btnBatchDelete.style.display = checked > 0 ? 'inline-flex' : 'none';
    }

    // ── Ação de Exclusão em Lote ──
    btnBatchDelete.addEventListener('click', async () => {
        const checkboxes = tbodyOp.querySelectorAll('.row-checkbox:checked');
        const ids = Array.from(checkboxes).map(cb => cb.dataset.id);
        
        if (ids.length === 0) return;

        if (confirm(`Tem certeza que deseja excluir os ${ids.length} usuários operacionais selecionados?\nEles serão inativados para preservar histórico de N3 caso já tenham registros.`)) {
            try {
                btnBatchDelete.disabled = true;
                btnBatchDelete.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;border-top-color:var(--color-red-primary); margin-right:6px;"></span> Processando...';
                
                const res = await api.delete('/users/batch', { ids });
                showToast(res.message, 'success', 6000);
                loadUsers();
            } catch (err) {
                showToast(err.message || 'Erro ao excluir lote.', 'error');
            } finally {
                btnBatchDelete.disabled = false;
                btnBatchDelete.innerHTML = `🗑️ Excluir Selecionados (<span id="batch-count">${ids.length}</span>)`;
            }
        }
    });

    // Sincroniza com upload instantâneo de foto
    document.addEventListener('user-profile-updated', (e) => {
        const updatedUser = e.detail;
        const cacheUser = usersData.find(u => u.id == updatedUser.id);
        if (cacheUser) {
            cacheUser.foto_perfil = updatedUser.foto_perfil;
            const tr = document.getElementById(`tr-${updatedUser.id}`);
            if (tr) {
                const img = tr.querySelector('img');
                const badgeDiv = tr.querySelector('div > div');
                if (img) {
                    img.src = updatedUser.foto_perfil || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path fill='%23ccc' d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/></svg>";
                }
                if (badgeDiv) {
                    badgeDiv.textContent = updatedUser.foto_perfil ? '👑 Ouro' : '🥉 Bronze';
                }
            }
        }
    });

    // Filtro de pesquisa dinâmico em tempo real
    const searchInput = document.getElementById('search-users-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.toLowerCase().trim();
            
            // Filtra administradores
            const admRows = tbodyAdm.querySelectorAll('tr');
            admRows.forEach(row => {
                if (row.cells.length < 2) return;
                const text = row.innerText.toLowerCase();
                row.style.display = text.includes(query) ? '' : 'none';
            });

            // Filtra operacionais
            const opRows = tbodyOp.querySelectorAll('tr');
            opRows.forEach(row => {
                if (row.cells.length < 2) return;
                const text = row.innerText.toLowerCase();
                row.style.display = text.includes(query) ? '' : 'none';
            });
        });
    }

    // Carrega usuários ao iniciar se a aba for clicada, ou logo na montagem
    loadUsers();
    
    // Atualiza a tabela sempre que a aba for clicada
    document.querySelector('[data-target="tab-list"]').addEventListener('click', () => {
        loadUsers();
    });
}

// ── Lógica de Abas ──────────────────────────────────────────────
function setupTabs() {
    const btns = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');

    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active de todos
            btns.forEach(b => b.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            // Ativa o clicado
            btn.classList.add('active');
            document.getElementById(btn.dataset.target).classList.add('active');
        });
    });
}

// ── Lógica Lote (Operacional) ───────────────────────────────────
function setupBatchLogic() {
    const inputArea   = document.getElementById('lote-input');
    const btnLimpar   = document.getElementById('btn-limpar-lote');
    const btnPreview  = document.getElementById('btn-preview-lote');
    const previewArea = document.getElementById('lote-preview-area');
    const tbody       = document.getElementById('preview-tbody');
    const countLabel  = document.getElementById('preview-count');
    const btnSubmit   = document.getElementById('btn-submit-lote');

    btnLimpar.addEventListener('click', () => {
        inputArea.value = '';
        parsedUsers = [];
        previewArea.style.display = 'none';
        inputArea.focus();
    });

    btnPreview.addEventListener('click', () => {
        const text = inputArea.value.trim();
        if (!text) {
            showToast('Cole ou digite os dados antes de pré-visualizar.', 'warning');
            return;
        }

        parsedUsers = [];
        const lines = text.split('\n');

        lines.forEach(line => {
            const cleanLine = line.trim();
            if (!cleanLine) return;

            // Divide por Tabulação, Ponto-e-vírgula ou Vírgula
            const parts = cleanLine.split(/\t|;|,/);
            if (parts.length >= 2) {
                const mat = parts[0].trim();
                const nome = parts[1].trim();
                const contrato = parts.length > 2 ? parts[2].trim() : '';
                if (mat && nome) {
                    parsedUsers.push({ matricula: mat, nome: nome, contrato: contrato });
                }
            }
        });

        if (parsedUsers.length === 0) {
            showToast('Nenhum dado válido encontrado. Use o formato: Matrícula ; Nome ; Contrato', 'error');
            return;
        }

        renderPreviewTable();
        countLabel.textContent = parsedUsers.length;
        previewArea.style.display = 'block';
    });

    // Delegar evento de exclusão na tabela de preview
    tbody.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-remove-row')) {
            const index = e.target.dataset.index;
            parsedUsers.splice(index, 1);
            renderPreviewTable();
            countLabel.textContent = parsedUsers.length;
            if (parsedUsers.length === 0) {
                previewArea.style.display = 'none';
            }
        }
    });

    function renderPreviewTable() {
        tbody.innerHTML = parsedUsers.map((u, i) => `
            <tr>
                <td style="font-family:monospace; font-weight:600;">${u.matricula}</td>
                <td>${u.nome}</td>
                <td><span class="badge" style="background:var(--color-bg-input);">${u.contrato || '—'}</span></td>
                <td>
                    <button type="button" class="btn-remove-row" data-index="${i}" style="background:none; border:none; color:var(--color-red-primary); cursor:pointer; font-size:16px;">Excluir</button>
                </td>
            </tr>
        `).join('');
    }

    btnSubmit.addEventListener('click', async () => {
        if (parsedUsers.length === 0) return;

        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px;border-top-color:#fff;"></span> Salvando...';

        try {
            const res = await api.post('/users/batch', { users: parsedUsers });
            showToast(res.message, 'success', 6000);
            
            // Limpa após sucesso
            inputArea.value = '';
            parsedUsers = [];
            previewArea.style.display = 'none';
        } catch (err) {
            showToast(err.message || 'Erro ao processar lote.', 'error');
        } finally {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = 'Salvar Usuários';
        }
    });
}

// ── Lógica Individual (ADM) ─────────────────────────────────────
function setupAdmLogic() {
    const form = document.getElementById('form-adm');
    const btnSubmit = document.getElementById('btn-submit-adm');
    const btnText = document.getElementById('btn-submit-adm-text');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const nome = document.getElementById('adm-nome').value.trim();
        const matricula = document.getElementById('adm-matricula').value.trim();
        const contrato = document.getElementById('adm-contrato').value.trim();
        const senha = document.getElementById('adm-senha').value;

        if (!nome || !matricula || !contrato || !senha) {
            showToast('Preencha todos os campos.', 'error');
            return;
        }

        // Validação: até 3 dígitos numéricos
        if (!/^\d{1,3}$/.test(contrato)) {
            showToast('O contrato deve conter até 3 dígitos numéricos.', 'error');
            return;
        }

        btnSubmit.disabled = true;
        btnText.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px;border-top-color:#fff;"></span> Cadastrando...';

        try {
            await api.post('/users/adm', { matricula, nome, contrato, senha });
            showToast(`Administrador ${nome} cadastrado com sucesso!`, 'success');
            form.reset();
            document.getElementById('adm-nome').focus();
        } catch (err) {
            showToast(err.message || 'Erro ao cadastrar administrador.', 'error');
        } finally {
            btnSubmit.disabled = false;
            btnText.innerHTML = 'Cadastrar Administrador';
        }
    });
}

// ── Lógica do Dashboard Analítico ─────────────────────────
let chartDonutInstance = null;
let chartBarInstance = null;

// Registra o plugin de rótulos do Chart.js
Chart.register(ChartDataLabels);

function setupDashboard() {
    document.querySelector('[data-target="tab-dashboard"]').addEventListener('click', async () => {
        try {
            const stats = await api.get('/users/stats/dashboard');
            renderDashboardCharts(stats);
        } catch (err) {
            showToast('Erro ao carregar os dados do dashboard.', 'error');
        }
    });
}

function renderDashboardCharts(stats) {
    // 1. Atualizar cards de resumo no topo
    const totalAdm = stats.perfis.find(p => p.perfil === 'adm')?.qtd || 0;
    const totalOp = stats.perfis.find(p => p.perfil === 'operacional')?.qtd || 0;
    document.getElementById('card-total-adm').textContent = totalAdm;
    document.getElementById('card-total-op').textContent = totalOp;

    // 2. Gráfico de Rosca (Distribuição de Contratos em %)
    const ctxDonut = document.getElementById('chartDonut').getContext('2d');
    if (chartDonutInstance) chartDonutInstance.destroy();

    // Calcula total operacional para obter a porcentagem
    const totalContratosQtd = stats.contratos.reduce((sum, c) => sum + c.qtd, 0);
    const percentagesData = stats.contratos.map(c => totalContratosQtd > 0 ? parseFloat(((c.qtd / totalContratosQtd) * 100).toFixed(1)) : 0);

    // Prepara paleta de cores elegantes baseadas em vermelho/vinho
    const colorPalette = [
        '#8B1C31', // Vermelho Vinho (Principal)
        '#A6223B', // Vermelho Mais Claro
        '#C8102E', // Vermelho Rubi
        '#E11D48', // Rosa Escuro
        '#FB7185', // Rosa Médio
        '#FDA4AF', // Rosa Claro
        '#FECDD3', // Rosa Suave
        '#FFE4E6'  // Rosa Bem Suave
    ];

    chartDonutInstance = new Chart(ctxDonut, {
        type: 'doughnut',
        data: {
            labels: stats.contratos.map(c => c.contrato ? `Contrato ${c.contrato}` : 'Sem Contrato'),
            datasets: [{
                data: percentagesData,
                backgroundColor: colorPalette.slice(0, stats.contratos.length || 1),
                borderWidth: 1,
                borderColor: '#1e1e1e'
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#ccc' } },
                datalabels: {
                    display: true,
                    color: '#fff',
                    font: {
                        weight: 'bold',
                        size: 11
                    },
                    formatter: (value) => {
                        return value + '%';
                    }
                }
            }
        }
    });

    // 3. Gráfico de Barras (Contratos)
    const ctxBar = document.getElementById('chartBar').getContext('2d');
    if (chartBarInstance) chartBarInstance.destroy();

    // Define a largura dinâmica do wrapper para evitar deformaçao
    const numContracts = stats.contratos.length;
    const minWidth = Math.max(300, numContracts * 45); // 45px por contrato
    const barWrapper = document.getElementById('chart-bar-wrapper');
    if (barWrapper) {
        barWrapper.style.minWidth = `${minWidth}px`;
    }

    const maxVal = Math.max(...stats.contratos.map(c => c.qtd)) || 0;

    chartBarInstance = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: stats.contratos.map(c => c.contrato ? `Contrato ${c.contrato}` : 'Sem Contrato'),
            datasets: [{
                label: 'Usuários',
                data: stats.contratos.map(c => c.qtd),
                backgroundColor: '#8B1C31',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { 
                    beginAtZero: true, 
                    grid: { display: false, drawBorder: false }, 
                    ticks: { display: false },
                    suggestedMax: Math.ceil(maxVal * 1.15) || 5
                },
                x: { grid: { display: false }, ticks: { color: '#ccc' } }
            },
            plugins: {
                legend: { display: false },
                datalabels: {
                    display: true,
                    anchor: 'end',
                    align: 'top',
                    color: '#ccc',
                    font: {
                        weight: 'bold',
                        size: 11
                    },
                    formatter: (value) => value
                }
            }
        }
    });
}

// Configura o seletor interno de adicionar novos usuários (Operacional vs ADM)
function setupAddUserSelector() {
    const btnOp = document.getElementById('btn-select-operacional');
    const btnAdm = document.getElementById('btn-select-adm');
    const formOp = document.getElementById('form-container-operacional');
    const formAdm = document.getElementById('form-container-adm');

    if (!btnOp || !btnAdm) return;

    btnOp.addEventListener('click', () => {
        btnOp.classList.add('btn--primary');
        btnOp.classList.remove('btn--secondary');
        btnAdm.classList.add('btn--secondary');
        btnAdm.classList.remove('btn--primary');
        formOp.style.display = 'block';
        formAdm.style.display = 'none';
    });

    btnAdm.addEventListener('click', () => {
        btnAdm.classList.add('btn--primary');
        btnAdm.classList.remove('btn--secondary');
        btnOp.classList.add('btn--secondary');
        btnOp.classList.remove('btn--primary');
        formAdm.style.display = 'block';
        formOp.style.display = 'none';
    });

    // Ao clicar na aba principal "Adicionar Novos Usuários", reinicia a exibição para tela limpa
    const tabBtn = document.querySelector('[data-target="tab-adicionar"]');
    if (tabBtn) {
        tabBtn.addEventListener('click', () => {
            btnOp.classList.remove('btn--primary');
            btnOp.classList.add('btn--secondary');
            btnAdm.classList.remove('btn--primary');
            btnAdm.classList.add('btn--secondary');
            formOp.style.display = 'none';
            formAdm.style.display = 'none';
        });
    }
}
