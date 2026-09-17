// public/js/utils.js — Funções utilitárias compartilhadas

// ── Toast Notifications ──────────────────────────────
function showToast(message, type = 'success', duration = 4000) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const icons = { success: '✅', error: '❌', warning: '⚠️' };
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(40px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ── Formatação de Data ────────────────────────────────
function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('pt-BR');
}

function formatDateTime(dtStr) {
    if (!dtStr) return '—';
    const d = new Date(dtStr);
    return d.toLocaleString('pt-BR');
}

// Retorna quantos dias faltam para o vencimento (negativo = vencido)
function daysUntil(dateStr) {
    if (!dateStr) return null;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const alvo = new Date(dateStr + 'T00:00:00');
    return Math.round((alvo - hoje) / (1000 * 60 * 60 * 24));
}

// ── Badge de Status N3 ───────────────────────────────
function statusBadge(status) {
    // Mapa: valor do banco → { cls, label }
    const levels = {
        'Em Análise': {
            cls: 'nivel-analise', label: '⏳ Em Análise'
        },
        'N1 — Óbito ou Mudança de Vida': {
            cls: 'nivel-n1', label: 'N1'
        },
        'N2 — Acidente com Afastamento': {
            cls: 'nivel-n2', label: '🟡 N2'
        },
        'N3 Prioritário — Casos Críticos': {
            cls: 'nivel-n3p', label: '🔴 N3 Prioritário'
        },
        'N3 — Quase Acidente / Condição Insegura Neutralizada': {
            cls: 'nivel-n3', label: '🟠 N3'
        },
        'N4 / N5 — Desvios Leves e Observações': {
            cls: 'nivel-n4n5', label: '🟢 N4/N5'
        },
        // Legados (retrocompatibilidade)
        'Aprovado': { cls: 'aprovado', label: 'Aprovado' },
        'Reprovado': { cls: 'reprovado', label: 'Reprovado' },
        'Pendente': { cls: 'pendente', label: 'Pendente' },
        'Concluído': { cls: 'concluido', label: 'Concluído' },
        'N1': { cls: 'n1', label: 'N1' },
        'N2': { cls: 'n2', label: '🟡 N2' },
        'N3': { cls: 'n3', label: '🔴 N3' }
    };

    const entry = levels[status];
    if (entry) {
        return `<span class="badge badge--${entry.cls}">${entry.label}</span>`;
    }
    return `<span class="badge badge--nivel-analise">${status}</span>`;
}

// ── Badge de Situação de Treinamento ────────────────
function trainingBadge(situacao) {
    const labels = { ok: 'Em dia', alerta: 'Vencendo', vencido: 'Vencido' };
    return `<span class="badge badge--${situacao}">${labels[situacao] || situacao}</span>`;
}

// ── Iniciais para Avatar ─────────────────────────────
function getInitials(nome = '') {
    return nome.trim().split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map(n => n[0].toUpperCase())
        .join('');
}

// ── Guardar/Recuperar Sessão ─────────────────────────
function saveSession(user) {
    sessionStorage.setItem('omega_user', JSON.stringify(user));
}

function getSession() {
    try {
        return JSON.parse(sessionStorage.getItem('omega_user'));
    } catch { return null; }
}

function clearSession() {
    sessionStorage.removeItem('omega_user');
}

// ── Proteção de página (redireciona se não logado) ───
async function requireLogin(role = null) {
    try {
        const user = await api.get('/auth/me');
        saveSession(user);
        if (role && user.perfil !== role) {
            window.location.href = '/dashboard';
            return null;
        }
        return user;
    } catch {
        clearSession();
        window.location.href = '/';
        return null;
    }
}

// ── Construir sidebar HTML ───────────────────────────
function buildSidebar(user, activePage) {
    const isAdm = user.perfil === 'adm';
    const navLinks = [
        { href: '/dashboard', icon: '🏠', label: 'Início', key: 'dashboard' },
        { href: '/inspecoes', icon: '🔍', label: 'Inspeções', key: 'inspecoes' },
        { href: '/n3', icon: '⚠️', label: 'N3', key: 'n3' },
    ];
    if (isAdm) {
        navLinks.push({ href: '/vps/maturidade', icon: '📈', label: 'Maturidade VPS', key: 'vps' });
        navLinks.push({ href: '/admin/treinamentos', icon: '📋', label: 'Treinamentos', key: 'treinamentos' });
        navLinks.push({ href: '/admin/users', icon: '👥', label: 'Gestão de Usuários', key: 'usuarios' });
        navLinks.push({ href: '/admin/dashboard', icon: '📊', label: 'Painel ADM', key: 'adm' });
    }

    const links = navLinks.map(l => `
        <a href="${l.href}" class="sidebar__link ${activePage === l.key ? 'active' : ''}">
            <span class="icon">${l.icon}</span>
            <span>${l.label}</span>
        </a>
    `).join('');

    const gamificationBadge = user.foto_perfil
        ? `<span class="badge badge--gold" style="font-size:10px; margin-top:4px;">👑 Ouro</span>`
        : `<span class="badge badge--bronze" style="font-size:10px; margin-top:4px;">🥉 Bronze</span>`;

    const avatarHtml = user.foto_perfil
        ? `<img src="${user.foto_perfil}" alt="Perfil" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`
        : getInitials(user.nome);

    return `
        <aside class="sidebar" id="sidebar">
            <div class="sidebar__logo">
                <img src="/Logo/logo.png" alt="Omega Safety Logo" class="sidebar-brand-logo" />
            </div>
            <nav class="sidebar__nav">
                <div class="sidebar__section-label">Navegação</div>
                ${links}
            </nav>
            <div class="sidebar__user">
                <div class="sidebar__user-info sidebar__user-info--clickable" id="btn-profile-modal-trigger" title="Visualizar Perfil e Gamificação">
                    <div class="sidebar__avatar">
                        ${avatarHtml}
                    </div>
                    <div>
                        <div class="sidebar__user-name">${user.nome}</div>
                        <div class="sidebar__user-mat">Mat. ${user.matricula} · ${isAdm ? 'ADM' : 'Op'}</div>
                        ${gamificationBadge}
                    </div>
                </div>
                <button class="btn-logout" id="btn-logout">
                    <span>🚪</span><span>Sair</span>
                </button>
            </div>
        </aside>
    `;
}

// Inicia logout e modal de perfil
async function initLogout() {
    document.addEventListener('click', async e => {
        if (e.target.closest('#btn-logout')) {
            try {
                await api.post('/auth/logout');
            } finally {
                clearSession();
                window.location.href = '/';
            }
        }

        // Abre o modal de perfil ao clicar no card do usuário
        if (e.target.closest('#btn-profile-modal-trigger')) {
            const user = getSession();
            if (user) {
                ensureProfileModal(user);
                document.getElementById('profile-modal-overlay').classList.add('active');
            }
        }
    });

    // Sincronização do DOM Local (Sidebar e cabeçalho na mesma página)
    document.addEventListener('user-profile-updated', e => {
        const updatedUser = e.detail;

        // Atualiza imagem na barra lateral
        const avatarEl = document.querySelector('.sidebar__avatar');
        if (avatarEl) {
            const avatarHtml = updatedUser.foto_perfil
                ? `<img src="${updatedUser.foto_perfil}" alt="Perfil" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`
                : getInitials(updatedUser.nome);
            avatarEl.innerHTML = avatarHtml;
        }

        // Atualiza crachá/badge na barra lateral
        const sidebarUser = document.querySelector('.sidebar__user-info');
        if (sidebarUser) {
            const badgeEl = sidebarUser.querySelector('.badge');
            if (badgeEl) {
                if (updatedUser.foto_perfil) {
                    badgeEl.className = 'badge badge--gold';
                    badgeEl.innerHTML = '👑 Ouro';
                } else {
                    badgeEl.className = 'badge badge--bronze';
                    badgeEl.innerHTML = '🥉 Bronze';
                }
            }
        }
    });
}

// Função para injetar o modal flutuante de perfil
function ensureProfileModal(user) {
    let overlay = document.getElementById('profile-modal-overlay');
    if (overlay) {
        updateModalData(user);
        return;
    }

    overlay = document.createElement('div');
    overlay.id = 'profile-modal-overlay';
    overlay.className = 'profile-modal-overlay';

    overlay.innerHTML = `
        <div class="profile-modal">
            <button class="profile-modal__close" id="btn-close-profile-modal">&times;</button>
            
            <div class="profile-modal__avatar-wrapper" id="btn-modal-avatar-click" title="Clique para escolher uma foto">
                <img id="modal-profile-avatar" src="" alt="Avatar do Usuário" class="profile-modal__avatar">
            </div>
            
            <h2 class="profile-modal__name" id="modal-profile-name"></h2>
            <div class="profile-modal__meta" id="modal-profile-meta"></div>
            
            <div class="profile-modal__badge-container" id="modal-profile-badge-container"></div>
            
            <div class="profile-modal__actions">
                <div class="profile-modal__preview-label" id="modal-preview-label">Pré-visualização da nova foto</div>
                
                <input type="file" id="input-modal-avatar" accept="image/*" style="display:none;">
                <button class="btn btn--secondary" id="btn-select-photo">Escolher Foto</button>
                <button class="btn btn--primary" id="btn-save-photo" style="display:none;">Salvar Foto</button>
            </div>

            <div class="profile-modal__password-section">
                <button type="button" class="btn btn--outline btn--sm" id="btn-toggle-password-form">
                    🔑 Mudar Senha
                </button>
                <div id="password-form-container" class="profile-modal__password-form" style="display: none;">
                    <input type="password" id="input-new-password" class="modal-input" placeholder="Nova Senha" autocomplete="new-password">
                    <input type="password" id="input-confirm-password" class="modal-input" placeholder="Confirmar Nova Senha" autocomplete="new-password">
                    <div class="modal-form-actions">
                        <button type="button" class="btn btn--primary btn--sm" id="btn-save-password">Salvar Senha</button>
                        <button type="button" class="btn btn--secondary btn--sm" id="btn-cancel-password">Cancelar</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Bind eventos de fechar
    document.getElementById('btn-close-profile-modal').addEventListener('click', () => {
        overlay.classList.remove('active');
    });
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.classList.remove('active');
        }
    });

    const fileInput = document.getElementById('input-modal-avatar');
    const selectBtn = document.getElementById('btn-select-photo');
    const saveBtn = document.getElementById('btn-save-photo');
    const previewLabel = document.getElementById('modal-preview-label');
    const avatarImg = document.getElementById('modal-profile-avatar');
    const avatarWrapper = document.getElementById('btn-modal-avatar-click');

    const triggerFileSelect = () => fileInput.click();
    selectBtn.addEventListener('click', triggerFileSelect);
    avatarWrapper.addEventListener('click', triggerFileSelect);

    let selectedFile = null;

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        selectedFile = file;
        const reader = new FileReader();
        reader.onload = (event) => {
            avatarImg.src = event.target.result;
            previewLabel.classList.add('visible');
            saveBtn.style.display = 'block';
        };
        reader.readAsDataURL(file);
    });

    saveBtn.addEventListener('click', async () => {
        if (!selectedFile) return;

        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;border-top-color:#fff;margin-right:6px;"></span>Salvando...';

        const formData = new FormData();
        formData.append('avatar', selectedFile);

        try {
            const res = await fetch('/api/users/me/photo', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            if (res.ok) {
                showToast(data.message, 'success');

                // Atualiza sessão local
                const currentUser = getSession();
                currentUser.foto_perfil = data.url;
                saveSession(currentUser);

                // Notifica o sistema para atualizar o DOM em tempo real
                document.dispatchEvent(new CustomEvent('user-profile-updated', { detail: currentUser }));

                // Reseta estado
                selectedFile = null;
                saveBtn.style.display = 'none';
                previewLabel.classList.remove('visible');
                overlay.classList.remove('active');
            } else {
                showToast(data.error || 'Erro ao fazer upload.', 'error');
            }
        } catch (err) {
            showToast('Erro de conexão ao enviar imagem.', 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = 'Salvar Foto';
        }
    });

    // Eventos de alteração de senha
    const togglePwdBtn = document.getElementById('btn-toggle-password-form');
    const pwdContainer = document.getElementById('password-form-container');
    const savePwdBtn = document.getElementById('btn-save-password');
    const cancelPwdBtn = document.getElementById('btn-cancel-password');
    const newPwdInput = document.getElementById('input-new-password');
    const confirmPwdInput = document.getElementById('input-confirm-password');

    togglePwdBtn.addEventListener('click', () => {
        const isHidden = pwdContainer.style.display === 'none';
        pwdContainer.style.display = isHidden ? 'flex' : 'none';
        if (!isHidden) {
            newPwdInput.value = '';
            confirmPwdInput.value = '';
        }
    });

    cancelPwdBtn.addEventListener('click', () => {
        pwdContainer.style.display = 'none';
        newPwdInput.value = '';
        confirmPwdInput.value = '';
    });

    savePwdBtn.addEventListener('click', async () => {
        const novaSenha = newPwdInput.value.trim();
        const confirmaSenha = confirmPwdInput.value.trim();

        if (!novaSenha || !confirmaSenha) {
            showToast('Preencha a nova senha e a confirmação.', 'warning');
            return;
        }

        if (novaSenha !== confirmaSenha) {
            showToast('As senhas digitadas não coincidem.', 'error');
            return;
        }

        if (novaSenha.length < 4) {
            showToast('A senha deve ter no mínimo 4 caracteres.', 'warning');
            return;
        }

        savePwdBtn.disabled = true;
        savePwdBtn.innerHTML = '<span class="spinner" style="width:12px;height:12px;border-width:2px;border-top-color:#fff;margin-right:6px;"></span>Salvando...';

        try {
            const res = await api.patch('/users/me/password', { novaSenha, confirmaSenha });
            showToast(res.message || 'Senha alterada com sucesso!', 'success');
            pwdContainer.style.display = 'none';
            newPwdInput.value = '';
            confirmPwdInput.value = '';
        } catch (err) {
            showToast(err.error || err.message || 'Erro ao alterar senha.', 'error');
        } finally {
            savePwdBtn.disabled = false;
            savePwdBtn.innerHTML = 'Salvar Senha';
        }
    });

    updateModalData(user);
}

// Atualiza dados dentro do modal
function updateModalData(user) {
    const defaultAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path fill='%23ccc' d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/></svg>";

    document.getElementById('modal-profile-avatar').src = user.foto_perfil || defaultAvatar;
    document.getElementById('modal-profile-name').textContent = user.nome;

    const isAdm = user.perfil === 'adm';
    document.getElementById('modal-profile-meta').innerHTML = `
        Matrícula: <strong>${user.matricula}</strong> <br>
        Tipo de Acesso: <strong>${isAdm ? 'Administrador' : 'Operacional'}</strong>
    `;

    const badgeContainer = document.getElementById('modal-profile-badge-container');
    if (user.foto_perfil) {
        badgeContainer.innerHTML = `<span class="badge badge--gold">👑 Ouro</span>`;
    } else {
        badgeContainer.innerHTML = `<span class="badge badge--bronze">🥉 Bronze</span>`;
    }

    document.getElementById('btn-save-photo').style.display = 'none';
    document.getElementById('modal-preview-label').classList.remove('visible');

    const pwdContainer = document.getElementById('password-form-container');
    if (pwdContainer) pwdContainer.style.display = 'none';
    const newPwdInput = document.getElementById('input-new-password');
    if (newPwdInput) newPwdInput.value = '';
    const confirmPwdInput = document.getElementById('input-confirm-password');
    if (confirmPwdInput) confirmPwdInput.value = '';
}

// Injeta/Garante o Favicon do Capacete (Logo2) em todas as páginas
(function ensureFavicon() {
    let link = document.querySelector("link[rel*='icon']");
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        link.type = 'image/png';
        document.getElementsByTagName('head')[0].appendChild(link);
    }
    link.href = '/Logo/logo2.png';
})();

// Exporta para window
window.showToast = showToast;
window.formatDate = formatDate;
window.formatDateTime = formatDateTime;
window.daysUntil = daysUntil;
window.statusBadge = statusBadge;
window.trainingBadge = trainingBadge;
window.getInitials = getInitials;
window.saveSession = saveSession;
window.getSession = getSession;
window.clearSession = clearSession;
window.requireLogin = requireLogin;
window.buildSidebar = buildSidebar;
window.initLogout = initLogout;
