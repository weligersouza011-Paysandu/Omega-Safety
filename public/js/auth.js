// public/js/auth.js — Lógica da tela de Login

document.addEventListener('DOMContentLoaded', async () => {
    // Se já está logado, redireciona direto
    try {
        const user = await api.get('/auth/me');
        if (user && user.matricula) {
            window.location.href = '/dashboard.html';
            return;
        }
    } catch { /* não logado, continua */ }

    const form        = document.getElementById('login-form');
    const matInput    = document.getElementById('matricula');
    const senhaInput  = document.getElementById('senha');
    const senhaSection= document.getElementById('senha-section');
    const userFound   = document.getElementById('user-found');
    const errorDiv    = document.getElementById('login-error');
    const errorTxt    = document.getElementById('login-error-text');
    const btnText     = document.getElementById('btn-login-text');
    const btnIcon     = document.getElementById('btn-login-icon');
    const btnLogin    = document.getElementById('btn-login');

    let isPasswordRequired = false;

    // ── Oculta erros/info ao digitar ──────────────────────────
    function clearFeedback() {
        errorDiv.classList.remove('visible');
        userFound.classList.remove('visible');
    }

    function showError(msg) {
        errorTxt.textContent = msg;
        errorDiv.classList.add('visible');
        userFound.classList.remove('visible');
    }

    // Limpar feedback ao digitar nova matrícula
    matInput.addEventListener('input', () => {
        clearFeedback();
        if (isPasswordRequired) {
            isPasswordRequired = false;
            senhaSection.classList.remove('visible');
            senhaSection.style.display = 'none';
            senhaInput.value = '';
            btnText.textContent = 'ENTRAR';
        }
    });

    // ── Submit do Formulário ──────────────────────────────────
    form.addEventListener('submit', async e => {
        e.preventDefault();
        clearFeedback();

        const mat   = matInput.value.trim();
        const senha = senhaInput.value;

        if (!mat) { showError('Por favor, informe sua matrícula.'); matInput.focus(); return; }

        if (isPasswordRequired && !senha) {
            showError('Senha obrigatória para acessar.');
            senhaInput.focus();
            return;
        }

        // Loading state
        btnLogin.disabled = true;
        btnText.textContent = 'Aguarde...';
        btnIcon.innerHTML = '<span class="spinner" style="border-top-color:#fff;border-color:rgba(255,255,255,0.2);width:16px;height:16px;border-width:2px;"></span>';

        try {
            const result = await api.post('/auth/login', { matricula: mat, senha: isPasswordRequired ? senha : '' });
            // Salva dados da sessão no sessionStorage
            sessionStorage.setItem('omega_user', JSON.stringify(result.usuario));
            window.location.href = '/dashboard.html';
        } catch (err) {
            btnLogin.disabled = false;
            btnIcon.textContent = '→';

            // Se o backend pedir senha
            if (err.message && err.message.includes('Senha obrigatória')) {
                isPasswordRequired = true;
                senhaSection.style.display = 'block';
                senhaSection.classList.add('visible');
                btnText.textContent = 'CONFIRMAR SENHA';
                clearFeedback(); // Limpa erro vermelho
                senhaInput.focus();
            } else {
                showError(err.message || 'Falha ao realizar login.');
                btnText.textContent = isPasswordRequired ? 'CONFIRMAR SENHA' : 'ENTRAR';
            }
        }
    });

    matInput.focus();
});
