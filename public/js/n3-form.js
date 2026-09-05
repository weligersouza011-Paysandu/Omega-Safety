// public/js/n3-form.js — Formulário de Registro N3

document.addEventListener('DOMContentLoaded', async () => {
    const user = await requireLogin();
    if (!user) return;

    document.getElementById('sidebar-root').innerHTML = buildSidebar(user, 'n3');
    initLogout();

    // ── Data de Registro: travada na data de hoje ──
    document.getElementById('f-data').value = new Date().toISOString().slice(0, 10);

    // ── Nível: travado para operacionais, editável para ADMs ──
    const nivelSelect = document.getElementById('f-nivel');
    const nivelHint = document.getElementById('nivel-hint');
    const isMasterOrAdm = user.is_master === 1 || user.perfil === 'adm';

    if (!isMasterOrAdm) {
        nivelSelect.disabled = true;
        nivelSelect.value = 'Em Análise';
        nivelSelect.style.opacity = '0.7';
        nivelSelect.style.cursor = 'not-allowed';
        nivelHint.textContent = '(travado para operacionais)';
    } else {
        nivelHint.textContent = '(editável por ADM)';
    }

    // ── Carregar contratos ativos ──
    await loadContratos(user);

    // ── Drag-and-drop e preview de fotos ──
    setupPhotoUpload('upload-zone-1', 'input-foto-1', 'preview-1');
    setupPhotoUpload('upload-zone-2', 'input-foto-2', 'preview-2');

    // ── Setup dinâmico Nível ──
    setupNivelColors();

    // ── Setup dinâmico Empresa Responsável ──
    setupEmpresaResponsavel();

    // ── Setup dinâmico TAG ──
    setupTagConditional();

    // ── Carregar Locais ──
    await loadLocais();

    // ── Submit ──
    document.getElementById('n3-form').addEventListener('submit', submitN3);
});

// ═══════════════════════════════════════════════════
//  CONTRATOS + LIDERANÇAS DINÂMICAS
// ═══════════════════════════════════════════════════
async function loadContratos(user) {
    const selectContrato = document.getElementById('f-contrato');

    try {
        const contratos = await api.get('/users/contratos-ativos');

        selectContrato.innerHTML = '<option value="">Selecione o contrato...</option>';
        contratos.forEach(c => {
            const opt = new Option(`Contrato ${c}`, c);
            selectContrato.appendChild(opt);
        });

        // Pré-seleciona com o contrato do usuário logado
        if (user.contrato && contratos.includes(user.contrato)) {
            selectContrato.value = user.contrato;
            await loadLiderancas(user.contrato);
        }

        // Ao mudar o contrato, recarrega lideranças
        selectContrato.addEventListener('change', async () => {
            const contrato = selectContrato.value;
            if (contrato) {
                await loadLiderancas(contrato);
            } else {
                const selectLid = document.getElementById('f-lideranca');
                selectLid.innerHTML = '<option value="">Selecione o contrato primeiro...</option>';
            }
        });

    } catch (err) {
        console.error('Erro ao carregar contratos:', err);
        selectContrato.innerHTML = '<option value="">Erro ao carregar contratos</option>';
    }
}

async function loadLiderancas(contrato) {
    const selectLid = document.getElementById('f-lideranca');
    const selectLidResp = document.getElementById('f-lideranca-resp');
    
    selectLid.innerHTML = '<option value="">Carregando lideranças...</option>';
    if (selectLidResp) selectLidResp.innerHTML = '<option value="">Carregando lideranças...</option>';

    try {
        const liderancas = await api.get(`/users/liderancas/${contrato}`);

        if (liderancas.length === 0) {
            selectLid.innerHTML = '<option value="">Nenhuma liderança cadastrada neste contrato</option>';
            if (selectLidResp) selectLidResp.innerHTML = '<option value="">Nenhuma liderança cadastrada neste contrato</option>';
            return;
        }

        selectLid.innerHTML = '<option value="">Selecione a liderança...</option>';
        if (selectLidResp) selectLidResp.innerHTML = '<option value="">Selecione a liderança responsável (opcional)...</option>';
        
        liderancas.forEach(lid => {
            const opt1 = new Option(`${lid.nome} (Mat. ${lid.matricula})`, lid.nome);
            selectLid.appendChild(opt1);
            if (selectLidResp) {
                const opt2 = new Option(`${lid.nome} (Mat. ${lid.matricula})`, lid.nome);
                selectLidResp.appendChild(opt2);
            }
        });

    } catch (err) {
        console.error('Erro ao carregar lideranças:', err);
        selectLid.innerHTML = '<option value="">Erro ao carregar lideranças</option>';
        if (selectLidResp) selectLidResp.innerHTML = '<option value="">Erro ao carregar lideranças</option>';
    }
}

// ═══════════════════════════════════════════════════
//  UPLOAD COM PREVIEW
// ═══════════════════════════════════════════════════
function setupPhotoUpload(zoneId, inputId, previewId) {
    const zone    = document.getElementById(zoneId);
    const input   = document.getElementById(inputId);
    const preview = document.getElementById(previewId);

    // Drag events
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', ()=> zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        if (e.dataTransfer.files.length) {
            const dt = new DataTransfer();
            dt.items.add(e.dataTransfer.files[0]);
            input.files = dt.files;
            showPreview(input.files[0], preview, zone);
        }
    });

    input.addEventListener('change', () => {
        if (input.files[0]) showPreview(input.files[0], preview, zone);
    });
}

function showPreview(file, previewDiv, zone) {
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
            previewDiv.innerHTML = '';
            previewDiv.style.display = 'none';
            zone.style.display = '';
            const dt = new DataTransfer();
            const inputEl = zone.querySelector('input[type="file"]');
            if (inputEl) inputEl.files = dt.files;
        });
    };
    reader.readAsDataURL(file);
}

// ═══════════════════════════════════════════════════
//  SUBMIT DO FORMULÁRIO
// ═══════════════════════════════════════════════════
async function submitN3(e) {
    e.preventDefault();

    const form   = document.getElementById('n3-form');
    const btn    = document.getElementById('btn-submit');
    const btnTxt = document.getElementById('btn-submit-text');

    // Validações básicas
    const descricao = document.getElementById('f-descricao').value.trim();
    const lideranca = document.getElementById('f-lideranca').value;
    const local     = document.getElementById('f-local').value.trim();
    const contrato  = document.getElementById('f-contrato').value;
    
    // Get radio values
    const categoriaEl = document.querySelector('input[name="categoria"]:checked');
    const categoria = categoriaEl ? categoriaEl.value : null;
    
    const subcategoriaEl = document.querySelector('input[name="subcategoria"]:checked');
    const subcategoria = subcategoriaEl ? subcategoriaEl.value : null;

    const tag       = document.getElementById('f-tag').value.trim();
    
    const empresaRespEl = document.querySelector('input[name="empresa_responsavel"]:checked');
    const empresaResp = empresaRespEl ? empresaRespEl.value : null;

    if (!contrato) {
        showToast('Selecione o contrato.', 'error');
        document.getElementById('f-contrato').focus();
        return;
    }
    if (!lideranca) {
        showToast('Selecione a liderança.', 'error');
        document.getElementById('f-lideranca').focus();
        return;
    }
    if (!local) {
        showToast('Informe o local / SS.', 'error');
        document.getElementById('f-local').focus();
        return;
    }
    if (!categoria) {
        showToast('Selecione a categoria.', 'error');
        return;
    }
    if (!subcategoria) {
        showToast('Selecione a subcategoria.', 'error');
        return;
    }
    if (tag && !/^[A-Za-z0-9]+$/.test(tag)) {
        showToast('A TAG deve conter apenas letras e números, sem espaços ou caracteres especiais.', 'error');
        document.getElementById('f-tag').focus();
        return;
    }
    if (!empresaResp) {
        showToast('Selecione a empresa responsável.', 'error');
        return;
    }
    if (empresaResp === 'OMEGA') {
        const liderancaResp = document.getElementById('f-lideranca-resp').value;
        if (!liderancaResp) {
            showToast('Selecione a Liderança Responsável (Ação).', 'error');
            document.getElementById('f-lideranca-resp').focus();
            return;
        }
    }
    if (!descricao) {
        showToast('Por favor, preencha a descrição da situação.', 'error');
        document.getElementById('f-descricao').focus();
        return;
    }

    // Loading
    btn.disabled = true;
    btnTxt.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px;"></span> Enviando...';

    try {
        const formData = new FormData(form);
        
        // Se data_hora_ocorrido está vazio, preenche com agora
        if (!formData.get('data_hora_ocorrido')) {
            formData.set('data_hora_ocorrido', new Date().toISOString());
        }

        const result = await api.upload('/n3', formData);

        showToast('N3 registrado com sucesso! Status: Em Análise.', 'success');

        setTimeout(() => {
            window.location.href = '/n3/list.html';
        }, 1500);

    } catch (err) {
        showToast(err.message || 'Erro ao registrar N3.', 'error');
        btn.disabled = false;
        btnTxt.textContent = '✅ Registrar N3';
    }
}

// ═══════════════════════════════════════════════════
//  AJUSTES DINÂMICOS (CORES, CONDICIONAIS, ETC)
// ═══════════════════════════════════════════════════
function setupNivelColors() {
    const nivelSelect = document.getElementById('f-nivel');
    if (!nivelSelect) return;

    function applyColor() {
        const val = nivelSelect.value;
        let bg = '', color = '#fff';
        if (val.includes('N1')) bg = '#1a1a1a'; // Preto
        else if (val.includes('N2')) bg = '#d32f2f'; // Vermelho
        else if (val.includes('Prioritário')) { bg = '#f97316'; color = '#fff'; } // Laranja
        else if (val.includes('N3')) { bg = '#fbc02d'; color = '#fff'; } // Amarelo
        else if (val.includes('N4') || val.includes('N5')) bg = '#388e3c'; // Verde
        else { bg = ''; color = ''; } // Default

        if (bg) {
            nivelSelect.style.backgroundColor = bg;
            nivelSelect.style.color = color;
        } else {
            nivelSelect.style.backgroundColor = '';
            nivelSelect.style.color = '';
        }
    }

    nivelSelect.addEventListener('change', applyColor);
    applyColor();
}

async function loadLocais() {
    try {
        const locais = await api.get('/n3/locais');
        const select = document.getElementById('f-local');
        if (select && locais && locais.length) {
            locais.forEach(local => {
                const opt = document.createElement('option');
                opt.value = local;
                opt.textContent = local;
                select.appendChild(opt);
            });
        }
    } catch (err) {
        console.error('Erro ao carregar locais:', err);
    }
}

function setupTagConditional() {
    const subcatRadios = document.querySelectorAll('input[name="subcategoria"]');
    const tagContainer = document.getElementById('tag-container');
    const tagInput = document.getElementById('f-tag');

    if (!subcatRadios.length || !tagContainer || !tagInput) return;

    subcatRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            const val = radio.value;
            if (val.startsWith('RAC 02') || val.startsWith('RAC 03') || val.startsWith('RAC 05')) {
                tagContainer.style.display = 'block';
            } else {
                tagContainer.style.display = 'none';
                tagInput.value = '';
            }
        });
    });

    tagInput.addEventListener('input', () => {
        tagInput.value = tagInput.value.replace(/[^a-zA-Z0-9]/g, '');
    });
}

function setupEmpresaResponsavel() {
    const radios = document.querySelectorAll('input[name="empresa_responsavel"]');
    const liderancaContainer = document.getElementById('lideranca-resp-container');
    const liderancaSelect = document.getElementById('f-lideranca-resp');

    if (!radios.length || !liderancaContainer || !liderancaSelect) return;

    radios.forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.value === 'OMEGA' && radio.checked) {
                liderancaContainer.style.display = 'block';
                liderancaSelect.required = true;
            } else if (radio.value === 'CLIENTE' && radio.checked) {
                liderancaContainer.style.display = 'none';
                liderancaSelect.required = false;
                liderancaSelect.value = '';
            }
        });
    });
}
