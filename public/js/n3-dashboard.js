// public/js/n3-dashboard.js — Dashboard N3 v3
// Melhorias: Filtro de Mês dinâmico, Ano dinâmico, gridlines removidas, datalabels aprimorados

// ══════════════════════════════════════════════════════════════
//  NOMES EXATOS DOS NÍVEIS (igual ao formulário)
// ══════════════════════════════════════════════════════════════
const NIVEL_DEFS = [
    {
        key:   'n1',
        label: 'N1',
        full:  'N1 — Óbito ou Mudança de Vida',
        color: '#111111',
        match: r => (r.nivel || '').startsWith('N1'),
    },
    {
        key:   'n2',
        label: 'N2',
        full:  'N2 — Acidente com Afastamento',
        color: '#dc2626',
        match: r => (r.nivel || '').startsWith('N2'),
    },
    {
        key:   'n3p',
        label: 'N3 Prioritário',
        full:  'N3 Prioritário — Casos Críticos',
        color: '#ea580c',
        match: r => {
            const n = r.nivel || '';
            return n === 'N3 Prioritário — Casos Críticos' || n.startsWith('N3 Priorit');
        },
    },
    {
        key:   'n3',
        label: 'N3 Normal',
        full:  'N3 — Quase Acidente / Condição Insegura Neutralizada',
        color: '#eab308',
        match: r => {
            const n = r.nivel || '';
            return n === 'N3 — Quase Acidente / Condição Insegura Neutralizada'
                || (n.startsWith('N3') && !n.startsWith('N3 Priorit'));
        },
    },
    {
        key:   'n4n5',
        label: 'N4/N5',
        full:  'N4 / N5 — Desvios Leves e Observações',
        color: '#16a34a',
        match: r => {
            const n = r.nivel || '';
            return n === 'N4 / N5 — Desvios Leves e Observações' || n.startsWith('N4') || n.startsWith('N5');
        },
    },
];

const MESES_NOMES = [
    'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];

// ── Estado global ──
let activeNivelFilter  = null;
let activeCrossFilters = { lideranca: [], subcategoria: [], local_ss: [], mesAno: [], usuario: [] };
let allDashRecords     = [];

// ── Instâncias dos gráficos ──
let chartLiderancaInst     = null;
let chartEvolucaoInst      = null;
let chartSubcategoriasInst = null;
let chartPendentesInst     = null;

// ── Registrar plugin datalabels ──
if (window.ChartDataLabels) {
    try { Chart.register(ChartDataLabels); } catch (_) {}
}

// ══════════════════════════════════════════════════════════════
//  INICIALIZAÇÃO
// ══════════════════════════════════════════════════════════════
async function loadDashboardN3() {
    activeNivelFilter = null;

    // Popula apenas Local/SS (estático) — Ano e Mês serão dinâmicos após fetch
    await initLocalFilter();
    await renderDashboard();

    // Listeners
    document.getElementById('dash3-contrato')?.addEventListener('change', () => {
        renderDashboard();
    });
    document.getElementById('dash3-mes')?.addEventListener('change', applyNivelFilter);
    document.getElementById('dash3-ano')?.addEventListener('change', applyNivelFilter);
    document.getElementById('dash3-local')?.addEventListener('change', applyNivelFilter);

    document.getElementById('dash3-clear-filters')?.addEventListener('click', () => {
        if (document.getElementById('dash3-contrato')) document.getElementById('dash3-contrato').value = '';
        if (document.getElementById('dash3-mes'))      document.getElementById('dash3-mes').value      = '';
        if (document.getElementById('dash3-ano'))      document.getElementById('dash3-ano').value      = '';
        if (document.getElementById('dash3-local'))    document.getElementById('dash3-local').value    = '';
        clearNivelFilter();
        activeCrossFilters = { lideranca: [], subcategoria: [], local_ss: [], mesAno: [], usuario: [] };
        renderDashboard();
    });

    // Click-to-filter na pirâmide & hover tooltip
    initPyramidClickFilter();
    initPyramidHoverEvents();

    // Botão reset de nível
    document.getElementById('pyr-reset-btn')?.addEventListener('click', () => {
        clearNivelFilter();
        applyNivelFilter();
    });
}

// ── Popula Local/SS via API ──
async function initLocalFilter() {
    try {
        const locais   = await api.get('/n3/locais');
        const selLocal = document.getElementById('dash3-local');
        if (selLocal && selLocal.options.length <= 1) {
            locais.forEach(l => {
                const opt = document.createElement('option');
                opt.value = opt.textContent = l;
                selLocal.appendChild(opt);
            });
        }
    } catch (e) { console.warn('Erro ao carregar locais:', e); }
}

// ── Popula Ano e Mês dinamicamente com base nos registros reais ──
function populateDateFilters(records) {
    const anos  = new Set();
    const meses = new Set();

    records.forEach(r => {
        if (!r.data) return;
        anos.add(r.data.slice(0, 4));                       // "2026"
        meses.add(parseInt(r.data.slice(5, 7), 10));        // 1..12
    });

    const selAno = document.getElementById('dash3-ano');
    const selMes = document.getElementById('dash3-mes');

    // Salva seleções actuais
    const prevAno = selAno?.value || '';
    const prevMes = selMes?.value || '';

    // Reconstrói Ano
    if (selAno) {
        selAno.innerHTML = '<option value="">Todos</option>';
        [...anos].sort((a, b) => b.localeCompare(a)).forEach(a => {
            const opt = document.createElement('option');
            opt.value = opt.textContent = a;
            selAno.appendChild(opt);
        });
        // Restaura seleção se ainda válida
        if ([...anos].includes(prevAno)) selAno.value = prevAno;
    }

    // Reconstrói Mês (apenas os que têm dados)
    if (selMes) {
        selMes.innerHTML = '<option value="">Todos</option>';
        [...meses].sort((a, b) => a - b).forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;                          // valor numérico "1".."12"
            opt.textContent = MESES_NOMES[m - 1];  // "Janeiro"..
            selMes.appendChild(opt);
        });
        // Restaura seleção se ainda válida
        if ([...meses].map(String).includes(prevMes)) selMes.value = prevMes;
    }
}

// ── Helper para normalização de Contrato (extrai apenas números / limpa "Contrato") ──
function normalizeContrato(val) {
    if (!val) return '';
    const str = String(val).trim();
    // Extrai os dígitos ou remove a palavra "Contrato"
    const digits = str.replace(/[^0-9]/g, '');
    return digits || str.replace(/^contrato\s*/i, '');
}

// ── Popula Contrato dinamicamente via API e registros reais ──
async function populateContratoFilter(records) {
    const selContrato = document.getElementById('dash3-contrato');
    if (!selContrato) return;

    const contratosSet = new Set();

    try {
        const list = await api.get('/n3/contratos');
        if (Array.isArray(list)) {
            list.forEach(c => {
                const norm = normalizeContrato(c);
                if (norm) contratosSet.add(norm);
            });
        }
    } catch (_) {}

    records.forEach(r => {
        const norm = normalizeContrato(r.contrato);
        if (norm) contratosSet.add(norm);
    });

    const prevVal = normalizeContrato(selContrato.value || '');
    selContrato.innerHTML = '<option value="">Todos</option>';

    [...contratosSet].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })).forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;                         // Valor limpo numérico (ex: "251")
        opt.textContent = `Contrato ${c}`;    // Exibição amigável (ex: "Contrato 251")
        selContrato.appendChild(opt);
    });

    if (prevVal && [...contratosSet].includes(prevVal)) {
        selContrato.value = prevVal;
    }
}

// ══════════════════════════════════════════════════════════════
//  FETCH + PIPELINE
// ══════════════════════════════════════════════════════════════
async function renderDashboard() {
    const loading = document.getElementById('dash3-loading');
    if (loading) loading.style.display = 'flex';

    try {
        const qp = new URLSearchParams({ limit: 9999 });
        const contratoEl = document.getElementById('select-contrato-dashboard') || document.getElementById('dash3-contrato');
        const contratoVal = normalizeContrato(contratoEl?.value);
        if (contratoVal) qp.set('contrato', contratoVal);

        allDashRecords = await getAllDashRecords(qp);

        // Popula Ano, Mês e Contrato dinamicamente com os dados reais
        populateDateFilters(allDashRecords);
        await populateContratoFilter(allDashRecords);

        applyNivelFilter();
    } catch (err) {
        console.error('Erro no Dashboard N3:', err);
        showToast('Erro ao carregar Dashboard N3.', 'error');
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

async function getAllDashRecords(qp) {
    const data = await api.get(`/n3?${qp}`);
    return data.data || [];
}

// ══════════════════════════════════════════════════════════════
//  APLICAR TODOS OS FILTROS (Contrato + Local/SS + Mês + Ano + Nível + Cross)
// ══════════════════════════════════════════════════════════════

function matchPyramidLayer(r, nivelKey) {
    const n = (r.nivel || '').trim();
    if (!n || n.toLowerCase() === 'em análise' || n.toLowerCase() === 'em analise') {
        return false;
    }
    switch (nivelKey) {
        case 'pyr-n1':  return n === 'N1 — Óbito ou Mudança de Vida' || n.startsWith('N1');
        case 'pyr-n2':  return n === 'N2 — Acidente com Afastamento' || n.startsWith('N2');
        case 'pyr-n3p': return n === 'N3 Prioritário — Casos Críticos' || /N3.*(Priorit|Prior|ário|P\b)/i.test(n);
        case 'pyr-n3n': return n === 'N3 — Quase Acidente / Condição Insegura Neutralizada' || /N3.*(Normal|N\b)/i.test(n) || (n.startsWith('N3') && !/N3.*(Priorit|Prior|ário|P\b)/i.test(n));
        case 'pyr-n45': return n === 'N4 / N5 — Desvios Leves e Observações' || n.startsWith('N4') || n.startsWith('N5');
        default: return false;
    }
}

function getFilteredRecords(excludeDimension = null) {
    let recs = allDashRecords;
    
    // Static dropdowns
    const contratoFiltroRaw = document.getElementById('dash3-contrato')?.value || '';
    const contratoFiltro    = normalizeContrato(contratoFiltroRaw);
    const mesFiltro         = document.getElementById('dash3-mes')?.value      || '';
    const anoFiltro         = document.getElementById('dash3-ano')?.value      || '';
    const localFiltro       = document.getElementById('dash3-local')?.value    || '';

    if (contratoFiltro) recs = recs.filter(r => normalizeContrato(r.contrato) === contratoFiltro);
    if (localFiltro)    recs = recs.filter(r => r.local_ss === localFiltro);
    if (anoFiltro)      recs = recs.filter(r => r.data && r.data.slice(0, 4) === anoFiltro);
    if (mesFiltro)      recs = recs.filter(r => r.data && parseInt(r.data.slice(5, 7), 10) === parseInt(mesFiltro, 10));

    // Nivel filter (single or multi via activeCrossFilters.nivel)
    if (excludeDimension !== 'nivel') {
        if (activeCrossFilters.nivel && activeCrossFilters.nivel.size > 0) {
            recs = recs.filter(r => {
                for (const nivelKey of activeCrossFilters.nivel) {
                    if (matchPyramidLayer(r, nivelKey)) return true;
                }
                return false;
            });
        } else if (activeNivelFilter) {
            const def = NIVEL_DEFS.find(d => d.full === activeNivelFilter);
            if (def) recs = recs.filter(r => def.match(r));
            else recs = recs.filter(r => matchPyramidLayer(r, activeNivelFilter));
        }
    }

    // Cross filters
    if (excludeDimension !== 'lideranca' && activeCrossFilters.lideranca.length > 0) {
        recs = recs.filter(r => activeCrossFilters.lideranca.includes(r.lideranca));
    }
    if (excludeDimension !== 'subcategoria' && activeCrossFilters.subcategoria.length > 0) {
        recs = recs.filter(r => activeCrossFilters.subcategoria.includes(r.subcategoria || 'Não informado'));
    }
    if (excludeDimension !== 'local_ss' && activeCrossFilters.local_ss.length > 0) {
        recs = recs.filter(r => activeCrossFilters.local_ss.includes(r.local_ss || 'Não informado'));
    }
    if (excludeDimension !== 'mesAno' && activeCrossFilters.mesAno.length > 0) {
        recs = recs.filter(r => {
            if (!r.data) return false;
            return activeCrossFilters.mesAno.includes(r.data.slice(0, 7));
        });
    }
    if (excludeDimension !== 'usuario' && activeCrossFilters.usuario && activeCrossFilters.usuario.length > 0) {
        recs = recs.filter(r => {
            const u = r.nome_observador || r.usuario || 'Não informado';
            return activeCrossFilters.usuario.includes(u);
        });
    }

    return recs;
}

function applyNivelFilter() {
    updatePyramid(getFilteredRecords('nivel'));
    updatePyramidHighlight();
    renderChartLideranca(getFilteredRecords('lideranca'));
    renderChartSubcategorias(getFilteredRecords('subcategoria'));
    renderChartEvolucao(getFilteredRecords('mesAno'));
    renderChartPendentes(getFilteredRecords('local_ss'));
    renderTreemapUsuarios(getFilteredRecords('usuario'));
}
// ══════════════════════════════════════════════════════════════
//  PIRÂMIDE 3D — 5 NÍVEIS OFICIAIS
// ══════════════════════════════════════════════════════════════
// Mapeamento oficial: data-nivel da camada SVG → metadata completa
const PYRAMID_LAYER_INFO = {
    'pyr-n1': {
        label:       'N1',
        title:       'N1 — Fatalidade ou Mudança Permanente de Vida',
        badge:       'N1 — Topo (Severidade Máxima)',
        bg:          '#111116',
        color:       '#ffffff',
        barColor:    '#94a3b8',
        countColor:  '#ffffff',
        borderColor: 'rgba(148, 163, 184, 0.45)',
        panelBg:     'linear-gradient(135deg, rgba(17,17,22,0.98) 0%, rgba(30,30,40,0.96) 100%)',
        glowColor:   'rgba(148, 163, 184, 0.18)',
        desc:        'Eventos catastróficos envolvendo óbito ou alteração permanente na vida do colaborador. Representam a falha crítica de todas as barreiras operacionais.',
        exemplo:     'Ex: Queda de altura sem proteção, esmagamento por carga suspensa.',
        acao:        'Ação: Direito de recusa imediato, interrupção de operação e revisão emergencial de APR/PET.',
        prefixes:    ['N1']
    },
    'pyr-n2': {
        label:       'N2',
        title:       'N2 — Acidente com Afastamento',
        badge:       'N2 — Risco Alto',
        bg:          '#7f1d1d',
        color:       '#fca5a5',
        barColor:    '#ef4444',
        countColor:  '#f87171',
        borderColor: 'rgba(239, 68, 68, 0.5)',
        panelBg:     'linear-gradient(135deg, rgba(30,6,6,0.98) 0%, rgba(65,12,12,0.96) 100%)',
        glowColor:   'rgba(239, 68, 68, 0.22)',
        desc:        'Lesões graves com perda de tempo de trabalho (afastamento temporário/permanente). Indicador direto de falha na barreira preventiva N3.',
        exemplo:     'Ex: Fratura por prensamento de mãos/pés, queimadura por produtos químicos.',
        acao:        'Ação: Investigação com 5 Porquês, Plano de Ação em 24h e Alerta de Segurança.',
        prefixes:    ['N2']
    },
    'pyr-n3p': {
        label:       'N3 Prioritário',
        title:       'N3 Prioritário — Quase Acidente / Casos Críticos',
        badge:       'N3P — Foco Estratégico',
        bg:          '#7c2d12',
        color:       '#fdba74',
        barColor:    '#f97316',
        countColor:  '#fb923c',
        borderColor: 'rgba(249, 115, 22, 0.5)',
        panelBg:     'linear-gradient(135deg, rgba(30,12,6,0.98) 0%, rgba(65,24,12,0.96) 100%)',
        glowColor:   'rgba(249, 115, 22, 0.22)',
        desc:        'Situações de alto potencial de gravidade que por pouco não resultaram em lesão grave. Principal barreira estratégica do sistema para evitar acidentes.',
        exemplo:     'Ex: Carga suspensa desprendida sem atingir pessoas, vazamento de gás isolado.',
        acao:        'Ação: Tratativa prioritária com a gerência em até 24h e eliminação da condição de risco.',
        prefixes:    ['N3 Prioritário', 'N3P', 'N3 - Prioritário']
    },
    'pyr-n3n': {
        label:       'N3 Normal',
        title:       'N3 Normal — Quase Acidente / Desvio Controlado',
        badge:       'N3N — Controle Operacional',
        bg:          '#78350f',
        color:       '#fef08a',
        barColor:    '#facc15',
        countColor:  '#fde047',
        borderColor: 'rgba(250, 204, 21, 0.5)',
        panelBg:     'linear-gradient(135deg, rgba(28,22,6,0.98) 0%, rgba(60,48,12,0.96) 100%)',
        glowColor:   'rgba(250, 204, 21, 0.22)',
        desc:        'Desvios operacionais e condições inseguras identificadas e neutralizadas antes que qualquer incidente ocorra.',
        exemplo:     'Ex: Escada sem sapatas antiderrapantes, ferramentas manuais com desgaste acentuado.',
        acao:        'Ação: Correção imediata pela equipe de área e registro para acompanhamento de tendência.',
        prefixes:    ['N3 Normal', 'N3N', 'N3 - Normal']
    },
    'pyr-n45': {
        label:       'N4 / N5',
        title:       'N4 e N5 — Desvios Leves e Comportamentos Seguros',
        badge:       'N4/N5 — Base Preventiva',
        bg:          '#14532d',
        color:       '#86efac',
        barColor:    '#22c55e',
        countColor:  '#4ade80',
        borderColor: 'rgba(34, 197, 94, 0.5)',
        panelBg:     'linear-gradient(135deg, rgba(6,28,14,0.98) 0%, rgba(12,60,28,0.96) 100%)',
        glowColor:   'rgba(34, 197, 94, 0.22)',
        desc:        'Base da pirâmide: desvios leves (N4) e observações preventivas/boas práticas (N5). Quanto mais ampla a base, mais forte a cultura de segurança.',
        exemplo:     'Ex: Uso incorreto de EPI leve, sugestão de melhoria na organização de sinalização.',
        acao:        'Ação: Abordagem comportamental orientativa e reforço positivo para a equipe.',
        prefixes:    ['N4', 'N5']
    }
};

// Mapeamento legado (para compatibilidade com NIVEL_DEFS e outros filtros)
const PYRAMID_DETAILS = {
    'N1 — Óbito ou Mudança de Vida':                              PYRAMID_LAYER_INFO['pyr-n1'],
    'N2 — Acidente com Afastamento':                              PYRAMID_LAYER_INFO['pyr-n2'],
    'N3 — Quase Acidente / Condição Insegura Neutralizada':      PYRAMID_LAYER_INFO['pyr-n3p'],
    'N4 / N5 — Desvios Leves e Observações':                     PYRAMID_LAYER_INFO['pyr-n45'],
    'N5 — Comportamento e Condição Segura':                       PYRAMID_LAYER_INFO['pyr-n45']
};

let currentHoloLayerKey = null;

function updatePyramid(records) {
    const counts = { 'pyr-n1': 0, 'pyr-n2': 0, 'pyr-n3p': 0, 'pyr-n3n': 0, 'pyr-n45': 0 };

    records.forEach(r => {
        const n = (r.nivel || '').trim();

        // Desconsidera "Em Análise", valores vazios ou nulos
        if (!n || n.toLowerCase() === 'em análise' || n.toLowerCase() === 'em analise') {
            return;
        }

        if (n === 'N1 — Óbito ou Mudança de Vida' || n.startsWith('N1')) {
            counts['pyr-n1']++;
        } else if (n === 'N2 — Acidente com Afastamento' || n.startsWith('N2')) {
            counts['pyr-n2']++;
        } else if (n === 'N3 Prioritário — Casos Críticos' || /N3.*(Priorit|Prior|ário|P\b)/i.test(n)) {
            counts['pyr-n3p']++;
        } else if (n === 'N3 — Quase Acidente / Condição Insegura Neutralizada' || /N3.*(Normal|N\b)/i.test(n) || (n.startsWith('N3') && !/N3.*(Priorit|Prior|ário|P\b)/i.test(n))) {
            counts['pyr-n3n']++;
        } else if (n === 'N4 / N5 — Desvios Leves e Observações' || n.startsWith('N4') || n.startsWith('N5')) {
            counts['pyr-n45']++;
        }
        // Sem fallback `else counts['pyr-n45']++`! Registros em análise ou sem classificação não entram na pirâmide.
    });

    setEl('pyr-n1',  counts['pyr-n1']);
    setEl('pyr-n2',  counts['pyr-n2']);
    setEl('pyr-n3p', counts['pyr-n3p']);
    setEl('pyr-n3n', counts['pyr-n3n']);
    setEl('pyr-n45', counts['pyr-n45']);

    const validTotal = counts['pyr-n1'] + counts['pyr-n2'] + counts['pyr-n3p'] + counts['pyr-n3n'] + counts['pyr-n45'];

    // Atualiza as stats globais ANTES de renderizar o painel
    window.pyrStats = { counts, total: validTotal };

    // Determina qual nível está ativo para exibir no painel
    const activeKey = getCurrentActiveNivelKey();
    renderHoloPanel(activeKey);
}

// Helper: retorna o nível atualmente ativo (para o painel lateral)
function getCurrentActiveNivelKey() {
    if (activeCrossFilters.nivel && activeCrossFilters.nivel.size === 1) {
        return [...activeCrossFilters.nivel][0];
    }
    if (activeCrossFilters.nivel && activeCrossFilters.nivel.size > 1) {
        return null; // Multi-seleção: mostra estado neutro
    }
    if (activeNivelFilter) {
        return activeNivelFilter;
    }
    return null;
}

function setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function renderHoloPanel(nivelKey = null) {
    const holoPanel = document.getElementById('pyr-holo-panel');
    const holoBody  = document.getElementById('pyr-holo-body');
    if (!holoPanel || !holoBody) return;

    currentHoloLayerKey = nivelKey;

    if (!nivelKey) {
        // Estado Neutro Inicial Vazio (Nenhuma Seleção) — 100% Neutro / Platina Dark
        holoPanel.style.background  = 'linear-gradient(135deg, rgba(18,18,24,0.97) 0%, rgba(26,26,36,0.94) 50%, rgba(15,15,20,0.97) 100%)';
        holoPanel.style.borderColor = 'rgba(255, 255, 255, 0.14)';
        holoPanel.style.boxShadow   = '0 0 28px rgba(0, 0, 0, 0.5), inset 0 0 35px rgba(255, 255, 255, 0.03)';

        holoBody.innerHTML = `
            <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:32px 20px; text-align:center; min-height:280px;">
                <div style="width:58px; height:58px; border-radius:50%; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.2); display:flex; align-items:center; justify-content:center; margin-bottom:16px; box-shadow:0 0 16px rgba(255,255,255,0.06);">
                    <span style="font-size:26px;">📊</span>
                </div>
                <div style="color:#ffffff; font-size:16px; font-weight:900; margin-bottom:8px; letter-spacing:0.3px;">Hierarquia de Severidade N3</div>
                <div style="color:#e2e8f0; font-size:12px; line-height:1.55; max-width:290px;">
                    Selecione ou passe o mouse sobre um nível da pirâmide 3D para visualizar os detalhes, métricas e diretrizes preventivas daquele estrato.
                </div>
                <div style="margin-top:20px; padding:6px 14px; background:rgba(255,255,255,0.05); border-radius:20px; border:1px solid rgba(255,255,255,0.12); font-size:11px; color:#cbd5e1; font-weight:600;">
                    ⚡ Clique simples para filtrar • Ctrl+Clique para multi-seleção
                </div>
            </div>
        `;
        holoPanel.classList.add('pyr-holo-panel--active');
        return;
    }

    const info  = PYRAMID_LAYER_INFO[nivelKey] || PYRAMID_LAYER_INFO['pyr-n3p'];

    // Sempre lê as stats globais mais recentes (atualizadas por updatePyramid)
    const stats = window.pyrStats || { counts: { 'pyr-n1': 0, 'pyr-n2': 0, 'pyr-n3p': 0, 'pyr-n3n': 0, 'pyr-n45': 0 }, total: 0 };
    const total = stats.total || 0;
    const count = (stats.counts && typeof stats.counts[nivelKey] === 'number') ? stats.counts[nivelKey] : 0;
    const pct   = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';

    // Theming Dinâmico por Nível
    holoPanel.style.background  = info.panelBg;
    holoPanel.style.borderColor = info.borderColor;
    holoPanel.style.boxShadow   = `0 0 28px ${info.glowColor}, inset 0 0 35px ${info.glowColor}`;

    holoBody.innerHTML = `
        <div style="padding:16px 18px; width:100%; display:flex; flex-direction:column; gap:12px;">
            <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;">
                <div class="pyr-holo__count-block" style="min-width:110px; padding:12px; background:rgba(0,0,0,0.25); border-radius:10px; border:1px solid ${info.borderColor}; text-align:center;">
                    <div class="pyr-holo__count" style="color:${info.countColor}; font-size:38px; font-weight:900; line-height:1;">${count}</div>
                    <div class="pyr-holo__count-label" style="font-size:10px; text-transform:uppercase; color:#94a3b8; letter-spacing:0.5px; margin-top:3px;">registros</div>
                    <div class="pyr-holo__pct" style="color:${info.countColor}; font-size:15px; font-weight:800; margin-top:6px;">${pct}%</div>
                    <div style="font-size:9px; color:#64748b; margin-top:1px;">do total geral</div>
                </div>
                <div style="flex:1;">
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
                        <span class="pyr-holo__badge" style="background:${info.bg}; color:${info.color}; font-size:11px; font-weight:900; padding:4px 10px; border-radius:4px; border:1px solid ${info.borderColor};">
                            ${info.badge}
                        </span>
                    </div>
                    <div class="pyr-holo__title" style="color:#ffffff; font-size:14px; font-weight:900; margin-bottom:4px;">${info.title}</div>
                    <div class="pyr-holo__desc" style="color:#cbd5e1; font-size:12px; line-height:1.45;">${info.desc}</div>
                </div>
            </div>

            <div class="pyr-holo__bar-wrap" style="height:7px; background:rgba(255,255,255,0.08); border-radius:4px; overflow:hidden;">
                <div class="pyr-holo__bar" style="width:${pct}%; height:100%; background:${info.barColor}; transition:width 0.4s ease; box-shadow:0 0 10px ${info.barColor};"></div>
            </div>

            <div class="pyr-holo__detail-box" style="padding:10px 12px; background:rgba(0,0,0,0.2); border-radius:8px; border-left:4px solid ${info.barColor};">
                <div style="font-size:11px; color:${info.countColor}; font-weight:800; margin-bottom:3px;">📌 Ocorrências Típicas:</div>
                <div style="font-size:11px; color:#cbd5e1; line-height:1.4; margin-bottom:8px;">${info.exemplo}</div>
                <div style="font-size:11px; color:${info.barColor}; font-weight:800; margin-bottom:3px;">🛡️ Diretriz Preventiva Recomendada:</div>
                <div style="font-size:11px; color:#ffffff; line-height:1.4;">${info.acao}</div>
            </div>

            <div class="pyr-holo__hint" style="font-size:10px; color:#64748b; text-align:center; margin-top:2px;">
                ⚡ Clique na camada para filtrar todos os gráficos • Ctrl+Clique para multi-seleção
            </div>
        </div>
    `;

    holoPanel.classList.add('pyr-holo-panel--active');
}

function initPyramidHoverEvents() {
    const holoPanel = document.getElementById('pyr-holo-panel');
    if (!holoPanel) return;

    document.querySelectorAll('.pyr-layer').forEach(el => {
        el.addEventListener('mouseenter', () => {
            const nivelKey = el.dataset.nivel;
            if (!nivelKey) return;

            // Mostra preview do nível ao passar o mouse (sem alterar filtro)
            renderHoloPanel(nivelKey);

            // Highlight callout line
            const calloutId = el.dataset.callout;
            document.querySelectorAll('.pyr-callout').forEach(c => c.classList.remove('pyr-callout--active'));
            if (calloutId) {
                const callout = document.getElementById(calloutId);
                if (callout) callout.classList.add('pyr-callout--active');
            }
        });

        el.addEventListener('mouseleave', () => {
            document.querySelectorAll('.pyr-callout').forEach(c => c.classList.remove('pyr-callout--active'));

            // Retorna ao nível selecionado ou ao estado neutro
            renderHoloPanel(getCurrentActiveNivelKey());
        });
    });
}

// ══════════════════════════════════════════════════════════════
//  PIRÂMIDE — click-to-filter + Ctrl multi-seleção
// ══════════════════════════════════════════════════════════════
function initPyramidClickFilter() {
    document.querySelectorAll('.pyr-layer').forEach(el => {
        el.style.cursor = 'pointer';
        el.addEventListener('click', (e) => {
            const nivelKey = el.dataset.nivel;
            if (!nivelKey) return;

            if (e.ctrlKey || e.metaKey) {
                // Ctrl/Cmd: multi-seleção via activeCrossFilters
                if (!activeCrossFilters.nivel) activeCrossFilters.nivel = new Set();
                if (activeCrossFilters.nivel.has(nivelKey)) {
                    activeCrossFilters.nivel.delete(nivelKey);
                    if (activeCrossFilters.nivel.size === 0) {
                        delete activeCrossFilters.nivel;
                        activeNivelFilter = null;
                    }
                } else {
                    activeCrossFilters.nivel.add(nivelKey);
                    // Se passou de 1 para multi, limpa o single filter
                    if (activeCrossFilters.nivel.size > 1) {
                        activeNivelFilter = null;
                    } else {
                        activeNivelFilter = nivelKey;
                    }
                }
            } else {
                // Clique simples: toggle single
                if (activeNivelFilter === nivelKey) {
                    activeNivelFilter = null;
                    if (activeCrossFilters.nivel) delete activeCrossFilters.nivel;
                } else {
                    activeNivelFilter = nivelKey;
                    activeCrossFilters.nivel = new Set([nivelKey]);
                }
            }

            // Atualiza chip footer
            updatePyramidFilterChip();

            // Dispara o pipeline completo de filtragem e re-renderização
            applyNivelFilter();
        });
    });
}

// Helper: atualiza o chip de filtro ativo no rodapé da pirâmide
function updatePyramidFilterChip() {
    const footer   = document.getElementById('pyr-filter-footer');
    const chipText = document.getElementById('pyr-chip-text');
    if (activeCrossFilters.nivel && activeCrossFilters.nivel.size > 0) {
        const labels = [...activeCrossFilters.nivel]
            .map(k => PYRAMID_LAYER_INFO[k]?.label || k)
            .join(', ');
        if (footer)   footer.style.display = 'flex';
        if (chipText) chipText.textContent  = `Filtrando: ${labels}`;
    } else {
        if (footer) footer.style.display = 'none';
    }
}

function clearNivelFilter() {
    activeNivelFilter = null;
    if (activeCrossFilters.nivel) delete activeCrossFilters.nivel;
    const footer = document.getElementById('pyr-filter-footer');
    if (footer) footer.style.display = 'none';
}

function updatePyramidHighlight() {
    const activeSet = activeCrossFilters.nivel;
    const hasFilter = (activeSet && activeSet.size > 0) || Boolean(activeNivelFilter);

    document.querySelectorAll('.pyr-layer').forEach(el => {
        const nivelKey = el.dataset.nivel;
        const isActive = activeSet ? activeSet.has(nivelKey) : (activeNivelFilter === nivelKey);

        if (el.tagName.toLowerCase() === 'g') {
            el.style.opacity = (!hasFilter || isActive) ? '1' : '0.25';
            el.style.filter  = isActive ? 'drop-shadow(0 0 12px rgba(255,255,255,0.7))' : 'none';
        } else {
            el.style.opacity    = (!hasFilter || isActive) ? '1' : '0.25';
            el.style.transform  = isActive ? 'scale(1.04)' : '';
            el.style.borderColor = isActive ? 'rgba(255,255,255,0.5)' : '';
            el.style.boxShadow  = isActive ? '0 0 16px rgba(255,255,255,0.2)' : '';
        }
    });
}

function hexToRgba(hex, alpha = 1) {
    if (!hex) return `rgba(255, 255, 255, ${alpha})`;
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    if (isNaN(num)) return `rgba(255, 255, 255, ${alpha})`;
    return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
}

function toggleCrossFilter(dim, val, isCtrl) {
    if (!activeCrossFilters[dim]) activeCrossFilters[dim] = [];

    if (isCtrl) {
        const idx = activeCrossFilters[dim].indexOf(val);
        if (idx >= 0) {
            activeCrossFilters[dim].splice(idx, 1);
        } else {
            activeCrossFilters[dim].push(val);
        }
    } else {
        if (activeCrossFilters[dim].length === 1 && activeCrossFilters[dim][0] === val) {
            activeCrossFilters[dim] = [];
        } else {
            activeCrossFilters[dim] = [val];
        }
    }
    applyNivelFilter();
}

// ══════════════════════════════════════════════════════════════
//  CONFIGURAÇÃO BASE CHART.JS — Dark Mode sem gridlines
// ══════════════════════════════════════════════════════════════
const NO_GRID = { color: 'transparent', drawBorder: false };
const SUBTLE_GRID = { color: 'rgba(255,255,255,0.05)', drawBorder: false };

const CHART_DEFAULTS = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend:     { display: false },
        datalabels: { display: false },
        tooltip: {
            backgroundColor: '#1a1a1a',
            borderColor:     '#2a2a2a',
            borderWidth:     1,
            titleColor:      '#f0f0f0',
            bodyColor:       '#a0a0a0',
            padding:         10,
        },
    },
    scales: {
        x: { ticks: { color: '#a0a0a0', font: { size: 11 } }, grid: SUBTLE_GRID },
        y: { ticks: { color: '#a0a0a0', font: { size: 11 } }, grid: SUBTLE_GRID },
    },
};

function destroyChart(ref) {
    if (ref) { try { ref.destroy(); } catch (_) {} }
    return null;
}

const DL_PLUGIN = () => window.ChartDataLabels ? [ChartDataLabels] : [];

// ══════════════════════════════════════════════════════════════
//  GRÁFICO 1 — Total de Registros por Liderança
//  · SEM gridlines · datalabels grandes e destacados
// ══════════════════════════════════════════════════════════════
function renderChartLideranca(records) {
    chartLiderancaInst = destroyChart(chartLiderancaInst);
    const canvas = document.getElementById('chartLideranca');
    if (!canvas) return;

    const map = {};
    records.forEach(r => {
        if (!r.lideranca) return;
        map[r.lideranca] = (map[r.lideranca] || 0) + 1;
    });

    const sorted  = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 20);
    const labels  = sorted.map(([k]) => k);
    const values  = sorted.map(([, v]) => v);
    const maxVal  = Math.max(...values, 1);

    // Gradiente de intensidade por ranking com cross-filtering opacity
    const bgColors = values.map((v, i) => {
        const isSelected = activeCrossFilters.lideranca.length === 0 || activeCrossFilters.lideranca.includes(labels[i]);
        const alpha = isSelected ? (0.35 + (v / maxVal) * 0.65) : 0.15;
        return `rgba(180,83,9,${alpha})`;
    });

    chartLiderancaInst = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data:            values,
                backgroundColor: bgColors,
                borderColor:     'transparent',
                borderRadius:    4,
                borderSkipped:   false,
            }],
        },
        options: {
            ...CHART_DEFAULTS,
            indexAxis: 'y',
            onClick: (e, elements) => {
                if (elements.length > 0) {
                    const idx = elements[0].index;
                    const isCtrl = Boolean(e.native?.ctrlKey || e.native?.metaKey || e.ctrlKey || e.metaKey);
                    toggleCrossFilter('lideranca', labels[idx], isCtrl);
                }
            },
            layout: { padding: { right: 48 } },   // espaço para datalabel
            plugins: {
                ...CHART_DEFAULTS.plugins,
                datalabels: {
                    display: true,
                    anchor:  'end',
                    align:   'end',
                    clip:    false,
                    color:   '#ffffff',
                    font:    { size: 12, weight: '700', family: 'Inter, sans-serif' },
                    padding: { left: 6 },
                    formatter: v => v,
                },
            },
            scales: {
                x: {
                    display:    true,
                    beginAtZero: true,
                    grid:       NO_GRID,           // ← sem gridlines verticais
                    ticks:      { display: false }, // ocultar ticks do eixo X (visual limpo)
                    border:     { display: false },
                },
                y: {
                    grid:   NO_GRID,               // ← sem gridlines horizontais
                    border: { display: false },
                    ticks:  {
                        color: '#e5e7eb',
                        font:  { size: 11, family: 'Inter, sans-serif' },
                        padding: 8,
                    },
                },
            },
        },
        plugins: DL_PLUGIN(),
    });
}

// ══════════════════════════════════════════════════════════════
//  GRÁFICO 2 — N3 por Subcategorias
// ══════════════════════════════════════════════════════════════
function renderChartSubcategorias(records) {
    chartSubcategoriasInst = destroyChart(chartSubcategoriasInst);
    const canvas = document.getElementById('chartSubcategorias');
    if (!canvas) return;

    const map = {};
    records.forEach(r => {
        const sub = r.subcategoria || 'Não informado';
        map[sub] = (map[sub] || 0) + 1;
    });

    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 20);
    const labels = sorted.map(([k]) => k);
    const values = sorted.map(([, v]) => v);

    const bgColors = labels.map(label => {
        const isSelected = activeCrossFilters.subcategoria.length === 0 || activeCrossFilters.subcategoria.includes(label);
        return isSelected ? '#1d4ed8' : 'rgba(29, 78, 216, 0.2)';
    });

    chartSubcategoriasInst = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data:            values,
                backgroundColor: bgColors,
                borderColor:     'transparent',
                borderRadius:    3,
            }],
        },
        options: {
            ...CHART_DEFAULTS,
            indexAxis: 'y',
            onClick: (e, elements) => {
                if (elements.length > 0) {
                    const idx = elements[0].index;
                    const isCtrl = Boolean(e.native?.ctrlKey || e.native?.metaKey || e.ctrlKey || e.metaKey);
                    toggleCrossFilter('subcategoria', labels[idx], isCtrl);
                }
            },
            layout: { padding: { right: 40 } },
            plugins: {
                ...CHART_DEFAULTS.plugins,
                datalabels: {
                    display: true, anchor: 'end', align: 'end', clip: false,
                    color: '#f0f0f0', font: { size: 11, weight: '700' },
                    padding: { left: 4 },
                    formatter: v => v,
                },
            },
            scales: {
                x: { beginAtZero: true, grid: NO_GRID, ticks: { display: false }, border: { display: false } },
                y: { grid: NO_GRID, border: { display: false }, ticks: { color: '#e5e7eb', font: { size: 10 }, padding: 6 } },
            },
        },
        plugins: DL_PLUGIN(),
    });
}

// ══════════════════════════════════════════════════════════════
//  GRÁFICO 3 — Evolução Mensal por Nível (empilhado)
// ══════════════════════════════════════════════════════════════
function renderChartEvolucao(records) {
    chartEvolucaoInst = destroyChart(chartEvolucaoInst);
    const canvas = document.getElementById('chartEvolucao');
    if (!canvas) return;

    const MESES_ABR = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

    const mesAnoSet = new Set();
    records.forEach(r => {
        if (!r.data) return;
        mesAnoSet.add(r.data.slice(0, 7)); // "YYYY-MM"
    });

    // Se não há dados, exibir ano atual em branco para manter a estrutura
    if (mesAnoSet.size === 0) {
        const y = new Date().getFullYear();
        mesAnoSet.add(`${y}-01`);
    }

    const mesesExibir = [...mesAnoSet].sort(); // ["2025-01", "2025-02", ...]

    const labels = mesesExibir.map(ym => {
        const y = ym.slice(0, 4);
        const m = parseInt(ym.slice(5, 7), 10);
        return `${MESES_ABR[m - 1]}/${y}`; // e.g. "Set/2025"
    });

    const activeNivels = (activeCrossFilters.nivel && activeCrossFilters.nivel.size > 0)
        ? [...activeCrossFilters.nivel]
        : (activeNivelFilter ? [activeNivelFilter] : null);

    const nivelsSeries = activeNivels
        ? NIVEL_DEFS.filter(d => activeNivels.some(k => isNivelMatch(d, k)))
        : NIVEL_DEFS;

    const datasets = nivelsSeries.map(def => ({
        label:           def.label,
        backgroundColor: mesesExibir.map(ym => {
            const isSelected = activeCrossFilters.mesAno.length === 0 || activeCrossFilters.mesAno.includes(ym);
            return isSelected ? def.color : hexToRgba(def.color, 0.2);
        }),
        borderColor:     'transparent',
        borderRadius:    2,
        stack:           'stack',
        data: mesesExibir.map(ym =>
            records.filter(r => {
                if (!r.data) return false;
                return r.data.slice(0, 7) === ym && def.match(r);
            }).length
        ),
    }));

    chartEvolucaoInst = new Chart(canvas, {
        type: 'bar',
        data: { labels, datasets },
        options: {
            ...CHART_DEFAULTS,
            onClick: (e, elements) => {
                if (elements.length > 0) {
                    const idx = elements[0].index;
                    const isCtrl = Boolean(e.native?.ctrlKey || e.native?.metaKey || e.ctrlKey || e.metaKey);
                    toggleCrossFilter('mesAno', mesesExibir[idx], isCtrl);
                }
            },
            plugins: {
                ...CHART_DEFAULTS.plugins,
                legend: {
                    display:  nivelsSeries.length > 1,
                    position: 'top',
                    labels:   { color: '#a0a0a0', boxWidth: 12, font: { size: 11 } },
                },
                datalabels: {
                    display:   ctx => ctx.dataset.data[ctx.dataIndex] > 0,
                    color:     '#fff',
                    font:      { size: 10, weight: '700' },
                    formatter: v => v > 0 ? v : '',
                },
            },
            scales: {
                x: { stacked: true, grid: NO_GRID, border: { display: false }, ticks: { color: '#a0a0a0' } },
                y: { stacked: true, beginAtZero: true, grace: '15%', grid: NO_GRID, border: { display: false }, ticks: { display: false } },
            },
        },
        plugins: [...DL_PLUGIN(), {
            id: 'totalLabelsEvolucao',
            afterDatasetsDraw: (chart) => {
                const ctx = chart.ctx;
                if (!chart.data.datasets.length) return;
                chart.data.datasets[0].data.forEach((_, i) => {
                    let total = 0;
                    let lastValidMeta = null;
                    for (let j = 0; j < chart.data.datasets.length; j++) {
                        if (!chart.isDatasetVisible(j)) continue;
                        const val = chart.data.datasets[j].data[i];
                        total += val;
                        if (val > 0) {
                            const meta = chart.getDatasetMeta(j);
                            if (meta && meta.data[i]) lastValidMeta = meta.data[i];
                        }
                    }
                    if (total > 0 && lastValidMeta) {
                        ctx.fillStyle = '#ffffff';
                        ctx.font = 'bold 12px Inter, sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'bottom';
                        ctx.fillText(total, lastValidMeta.x, lastValidMeta.y - 4);
                    }
                });
            }
        }],
    });
}

// Helper para corresponder chaves de nível da pirâmide com a definição de série
function isNivelMatch(def, filterKey) {
    if (!filterKey) return true;
    if (def.full === filterKey || def.key === filterKey) return true;
    if (('pyr-' + def.key) === filterKey) return true;
    if (filterKey === 'pyr-n3n' && def.key === 'n3') return true;
    if (filterKey === 'pyr-n45' && (def.key === 'n4n5' || def.key === 'n4' || def.key === 'n5')) return true;
    return matchPyramidLayer({ nivel: def.full }, filterKey);
}

// ══════════════════════════════════════════════════════════════
//  GRÁFICO 4 — Ações Pendentes por Local / SS
// ══════════════════════════════════════════════════════════════
function renderChartPendentes(records) {
    chartPendentesInst = destroyChart(chartPendentesInst);
    const canvas = document.getElementById('chartPendentes');
    if (!canvas) return;

    // Group all records passed to this chart by Local/SS
    const mapLocais = {};
    records.forEach(r => {
        const loc = r.local_ss || 'Não informado';
        mapLocais[loc] = (mapLocais[loc] || 0) + 1;
    });

    const sortedLocais = Object.entries(mapLocais).sort((a, b) => b[1] - a[1]).slice(0, 20);
    const labels = sortedLocais.map(([k]) => k);

    const CHART4_NIVEIS = [
        { key: 'em_analise', label: 'Em Análise / ND', full: 'Em Análise', color: '#6b7280', match: r => !r.nivel || r.nivel === 'Em Análise' },
        ...NIVEL_DEFS
    ];

    const activeNivels = (activeCrossFilters.nivel && activeCrossFilters.nivel.size > 0)
        ? [...activeCrossFilters.nivel]
        : (activeNivelFilter ? [activeNivelFilter] : null);

    const nivelsSeries = activeNivels
        ? CHART4_NIVEIS.filter(d => activeNivels.some(k => isNivelMatch(d, k)))
        : CHART4_NIVEIS;

    const datasets = nivelsSeries.map(def => ({
        label: def.label,
        backgroundColor: labels.map(loc => {
            const isSelected = activeCrossFilters.local_ss.length === 0 || activeCrossFilters.local_ss.includes(loc);
            return isSelected ? def.color : hexToRgba(def.color, 0.2);
        }),
        borderColor: 'transparent',
        borderRadius: 2,
        stack: 'stack',
        data: labels.map(loc => 
            records.filter(r => (r.local_ss || 'Não informado') === loc && def.match(r)).length
        )
    }));

    chartPendentesInst = new Chart(canvas, {
        type: 'bar',
        data: { labels, datasets },
        options: {
            ...CHART_DEFAULTS,
            indexAxis: 'y', // Barras horizontais empilhadas
            onClick: (e, elements) => {
                if (elements.length > 0) {
                    const idx = elements[0].index;
                    const isCtrl = Boolean(e.native?.ctrlKey || e.native?.metaKey || e.ctrlKey || e.metaKey);
                    toggleCrossFilter('local_ss', labels[idx], isCtrl);
                }
            },
            plugins: {
                ...CHART_DEFAULTS.plugins,
                legend: {
                    display: nivelsSeries.length > 1,
                    position: 'top',
                    labels: { color: '#a0a0a0', boxWidth: 12, font: { size: 11 } },
                },
                datalabels: {
                    display: ctx => ctx.dataset.data[ctx.dataIndex] > 0,
                    color: '#fff',
                    font: { size: 10, weight: '700' },
                    formatter: v => v > 0 ? v : '',
                },
            },
            scales: {
                x: { stacked: true, grace: '15%', grid: NO_GRID, border: { display: false }, ticks: { display: false } },
                y: { stacked: true, grid: NO_GRID, border: { display: false }, ticks: { color: '#e5e7eb', font: { size: 11 } } },
            },
        },
        plugins: [...DL_PLUGIN(), {
            id: 'totalLabelsPendentes',
            afterDatasetsDraw: (chart) => {
                const ctx = chart.ctx;
                if (!chart.data.datasets.length) return;
                chart.data.datasets[0].data.forEach((_, i) => {
                    let total = 0;
                    let lastValidMeta = null;
                    for (let j = 0; j < chart.data.datasets.length; j++) {
                        if (!chart.isDatasetVisible(j)) continue;
                        const val = chart.data.datasets[j].data[i];
                        total += val;
                        if (val > 0) {
                            const meta = chart.getDatasetMeta(j);
                            if (meta && meta.data[i]) lastValidMeta = meta.data[i];
                        }
                    }
                    if (total > 0 && lastValidMeta) {
                        ctx.fillStyle = '#ffffff';
                        ctx.font = 'bold 12px Inter, sans-serif';
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(total, lastValidMeta.x + 6, lastValidMeta.y);
                    }
                });
            }
        }],
    });
}

// ══════════════════════════════════════════════════════════════
//  GRÁFICO 5 — Treemap: Registros por Usuário
// ══════════════════════════════════════════════════════════════
let treemapBoxes          = [];
let treemapHoveredIndex   = -1;
let treemapResizeObserver = null;

const TREEMAP_PALETTE = [
    '#0284c7', // Sky Blue
    '#059669', // Emerald Green
    '#2563eb', // Royal Blue
    '#0d9488', // Teal
    '#1d4ed8', // Dark Blue
    '#10b981', // Green
    '#0369a1', // Deep Sky Blue
    '#15803d', // Forest Green
    '#3b82f6', // Bright Blue
    '#0f766e', // Dark Teal
    '#06b6d4', // Cyan
    '#16a34a'  // Vivid Green
];

function renderTreemapUsuarios(records) {
    const canvas    = document.getElementById('chartTreemapUsuarios');
    const container = document.getElementById('treemap-container');
    if (!canvas || !container) return;

    // 1. Agrupar registros por Usuário (nome_observador)
    const mapUsuarios = {};
    records.forEach(r => {
        const u = r.nome_observador || r.usuario || 'Não informado';
        if (!mapUsuarios[u]) {
            mapUsuarios[u] = {
                name: u,
                value: 0,
                breakdown: { n1: 0, n2: 0, n3p: 0, n3: 0, n4n5: 0 }
            };
        }
        mapUsuarios[u].value += 1;

        // Contagem de níveis por usuário
        for (const def of NIVEL_DEFS) {
            if (def.match(r)) {
                mapUsuarios[u].breakdown[def.key] = (mapUsuarios[u].breakdown[def.key] || 0) + 1;
                break;
            }
        }
    });

    const dataItems = Object.values(mapUsuarios).sort((a, b) => b.value - a.value);

    // 2. Ajustar dimensões Canvas com High DPI support
    const rect   = container.getBoundingClientRect();
    const width  = Math.floor(rect.width || container.clientWidth || 800);
    const height = Math.floor(rect.height || container.clientHeight || 380);

    const dpr = window.devicePixelRatio || 1;
    canvas.width  = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width  = width + 'px';
    canvas.style.height = height + 'px';

    const ctx = canvas.getContext('2d');

    // 3. Algoritmo Squarified Treemap
    treemapBoxes = computeTreemapLayout(dataItems, { x: 0, y: 0, w: width, h: height });

    // 4. Desenhar no Canvas
    ctx.save();
    ctx.scale(dpr, dpr);
    const totalRecs = dataItems.reduce((acc, item) => acc + item.value, 0);
    drawTreemapCanvas(ctx, treemapBoxes, width, height, totalRecs);
    ctx.restore();

    // 5. Configurar eventos de hover, clique (Ctrl) e resize
    setupTreemapEvents(canvas, container);
}

function computeTreemapLayout(dataItems, rect) {
    if (!dataItems.length || rect.w <= 0 || rect.h <= 0) return [];

    const totalVal = dataItems.reduce((acc, item) => acc + item.value, 0);
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
        for (const item of row) {
            sum += item.area;
            if (item.area > max) max = item.area;
            if (item.area < min) min = item.area;
        }
        if (sum <= 0 || min <= 0) return Infinity;
        const side2 = side * side;
        const sum2  = sum * sum;
        return Math.max((side2 * max) / sum2, sum2 / (side2 * min));
    }

    function layoutRow(row, container) {
        const rowArea      = row.reduce((sum, item) => sum + item.area, 0);
        const isHorizontal = container.w < container.h;
        const side         = isHorizontal ? container.w : container.h;
        const rowThickness = side > 0 ? rowArea / side : 0;

        let offset = 0;
        row.forEach(item => {
            const itemLength = rowArea > 0 ? item.area / rowThickness : 0;
            let box;
            if (isHorizontal) {
                box = { x: container.x + offset, y: container.y, w: itemLength, h: rowThickness, data: item };
                offset += itemLength;
            } else {
                box = { x: container.x, y: container.y + offset, w: rowThickness, h: itemLength, data: item };
                offset += itemLength;
            }
            result.push(box);
        });

        if (isHorizontal) {
            return {
                x: container.x,
                y: container.y + rowThickness,
                w: container.w,
                h: Math.max(0, container.h - rowThickness)
            };
        } else {
            return {
                x: container.x + rowThickness,
                y: container.y,
                w: Math.max(0, container.w - rowThickness),
                h: container.h
            };
        }
    }

    let currentContainer = { ...rect };
    let currentRow       = [];

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const side = Math.min(currentContainer.w, currentContainer.h);
        if (currentRow.length === 0) {
            currentRow.push(item);
        } else {
            const ratioBefore = worstRatio(currentRow, side);
            const ratioAfter  = worstRatio([...currentRow, item], side);
            if (ratioAfter <= ratioBefore) {
                currentRow.push(item);
            } else {
                currentContainer = layoutRow(currentRow, currentContainer);
                currentRow = [item];
            }
        }
    }
    if (currentRow.length > 0) {
        layoutRow(currentRow, currentContainer);
    }

    return result;
}

function drawTreemapCanvas(ctx, boxes, width, height, totalRecords) {
    ctx.clearRect(0, 0, width, height);

    if (boxes.length === 0) {
        ctx.fillStyle    = '#a0a0a0';
        ctx.font         = '13px Inter, sans-serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Nenhum registro encontrado para este filtro', width / 2, height / 2);
        return;
    }

    const hasUserFilter = activeCrossFilters.usuario && activeCrossFilters.usuario.length > 0;

    boxes.forEach((box, idx) => {
        const uName = box.data.name;
        const uVal  = box.data.value;

        const isSelected = !hasUserFilter || activeCrossFilters.usuario.includes(uName);
        const isHovered  = idx === treemapHoveredIndex;
        const baseColor  = TREEMAP_PALETTE[idx % TREEMAP_PALETTE.length];

        ctx.save();

        const gap = 2;
        const bx  = box.x + gap;
        const by  = box.y + gap;
        const bw  = Math.max(0, box.w - gap * 2);
        const bh  = Math.max(0, box.h - gap * 2);

        if (bw <= 0 || bh <= 0) {
            ctx.restore();
            return;
        }

        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(bx, by, bw, bh, 6);
        } else {
            ctx.rect(bx, by, bw, bh);
        }

        if (isSelected) {
            const grad = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
            grad.addColorStop(0, baseColor);
            grad.addColorStop(1, hexToRgba(baseColor, 0.75));
            ctx.fillStyle = grad;
        } else {
            ctx.fillStyle = hexToRgba(baseColor, 0.15);
        }
        ctx.fill();

        if (isHovered) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth   = 2.5;
            ctx.stroke();
        } else if (hasUserFilter && activeCrossFilters.usuario.includes(uName)) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth   = 2;
            ctx.stroke();
        } else {
            ctx.strokeStyle = isSelected ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.05)';
            ctx.lineWidth   = 1;
            ctx.stroke();
        }

        const padX   = 8;
        const padY   = 8;
        const availW = bw - padX * 2;
        const availH = bh - padY * 2;

        if (availW > 24 && availH > 16) {
            ctx.clip();

            let titleSize = 13;
            let subSize   = 11;

            if (availH < 38 || availW < 65) { titleSize = 11; subSize = 10; }
            if (availH < 24 || availW < 40) { titleSize = 10; subSize = 9; }

            ctx.fillStyle    = isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.4)';
            ctx.font         = `700 ${titleSize}px Inter, sans-serif`;
            ctx.textAlign    = 'left';
            ctx.textBaseline = 'top';

            const nameStr = truncateText(ctx, uName, availW);
            ctx.fillText(nameStr, bx + padX, by + padY);

            if (availH >= titleSize + subSize + 4) {
                ctx.fillStyle = isSelected ? 'rgba(255, 255, 255, 0.85)' : 'rgba(255, 255, 255, 0.3)';
                ctx.font      = `600 ${subSize}px Inter, sans-serif`;
                const pct      = totalRecords > 0 ? ((uVal / totalRecords) * 100).toFixed(1) : '0';
                const countStr = availW > 70 ? `${uVal} reg. (${pct}%)` : `${uVal}`;
                ctx.fillText(countStr, bx + padX, by + padY + titleSize + 3);
            }
        }

        ctx.restore();
    });
}

function truncateText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let truncated = text;
    while (truncated.length > 0 && ctx.measureText(truncated + '…').width > maxWidth) {
        truncated = truncated.slice(0, -1);
    }
    return truncated ? truncated + '…' : '';
}

function setupTreemapEvents(canvas, container) {
    if (canvas.dataset.eventsBound) return;
    canvas.dataset.eventsBound = 'true';

    const tooltip = document.getElementById('dash3-treemap-tooltip');

    canvas.addEventListener('mousemove', (e) => {
        const rect   = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        let foundIdx = -1;
        for (let i = 0; i < treemapBoxes.length; i++) {
            const b = treemapBoxes[i];
            if (mouseX >= b.x && mouseX <= b.x + b.w && mouseY >= b.y && mouseY <= b.y + b.h) {
                foundIdx = i;
                break;
            }
        }

        if (foundIdx !== treemapHoveredIndex) {
            treemapHoveredIndex = foundIdx;
            canvas.style.cursor = foundIdx >= 0 ? 'pointer' : 'default';

            const dpr       = window.devicePixelRatio || 1;
            const ctx       = canvas.getContext('2d');
            ctx.save();
            ctx.scale(dpr, dpr);
            const totalRecs = treemapBoxes.reduce((acc, box) => acc + box.data.value, 0);
            drawTreemapCanvas(ctx, treemapBoxes, rect.width, rect.height, totalRecs);
            ctx.restore();
        }

        if (foundIdx >= 0 && tooltip) {
            const box       = treemapBoxes[foundIdx];
            const data      = box.data;
            const totalRecs = treemapBoxes.reduce((acc, b) => acc + b.data.value, 0);
            const pct       = totalRecs > 0 ? ((data.value / totalRecs) * 100).toFixed(1) : '0';
            const isSel     = activeCrossFilters.usuario.includes(data.name);

            tooltip.style.display = 'block';

            let tipX = mouseX + 15;
            let tipY = mouseY + 15;
            if (tipX + 230 > rect.width)  tipX = mouseX - 235;
            if (tipY + 170 > rect.height) tipY = mouseY - 170;

            tooltip.style.left = `${tipX}px`;
            tooltip.style.top  = `${tipY}px`;

            tooltip.innerHTML = `
                <div class="dash3-tooltip__header">
                    <span>👤 ${data.name}</span>
                </div>
                <div class="dash3-tooltip__main">
                    Total: <strong>${data.value} registros</strong> (${pct}% do geral)
                </div>
                <div class="dash3-tooltip__divider"></div>
                <div class="dash3-tooltip__subhead">Severidade</div>
                <div class="dash3-tooltip__badges">
                    <span class="dash3-tb-badge" style="background:#111; color:#fff; border:1px solid #444;">N1: ${data.breakdown.n1}</span>
                    <span class="dash3-tb-badge" style="background:#dc2626; color:#fff;">N2: ${data.breakdown.n2}</span>
                    <span class="dash3-tb-badge" style="background:#ea580c; color:#fff;">N3 Pri: ${data.breakdown.n3p}</span>
                    <span class="dash3-tb-badge" style="background:#eab308; color:#000;">N3 Norm: ${data.breakdown.n3}</span>
                    <span class="dash3-tb-badge" style="background:#16a34a; color:#fff;">N4/N5: ${data.breakdown.n4n5}</span>
                </div>
                <div class="dash3-tooltip__footer">
                    ${isSel ? '✓ Selecionado (Clique para remover)' : '💡 Clique para filtrar | Ctrl + Clique p/ multi-seleção'}
                </div>
            `;
        } else if (tooltip) {
            tooltip.style.display = 'none';
        }
    });

    canvas.addEventListener('mouseleave', () => {
        if (treemapHoveredIndex !== -1) {
            treemapHoveredIndex = -1;
            canvas.style.cursor = 'default';

            const rect      = canvas.getBoundingClientRect();
            const dpr       = window.devicePixelRatio || 1;
            const ctx       = canvas.getContext('2d');
            ctx.save();
            ctx.scale(dpr, dpr);
            const totalRecs = treemapBoxes.reduce((acc, box) => acc + box.data.value, 0);
            drawTreemapCanvas(ctx, treemapBoxes, rect.width, rect.height, totalRecs);
            ctx.restore();
        }
        if (tooltip) tooltip.style.display = 'none';
    });

    canvas.addEventListener('click', (e) => {
        const rect   = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        for (let i = 0; i < treemapBoxes.length; i++) {
            const b = treemapBoxes[i];
            if (mouseX >= b.x && mouseX <= b.x + b.w && mouseY >= b.y && mouseY <= b.y + b.h) {
                const uName = b.data.name;
                toggleCrossFilter('usuario', uName, e.ctrlKey || e.metaKey);
                break;
            }
        }
    });

    if (!treemapResizeObserver && window.ResizeObserver) {
        treemapResizeObserver = new ResizeObserver(() => {
            if (document.getElementById('tab-dashboard-n3')?.style.display !== 'none') {
                renderTreemapUsuarios(getFilteredRecords('usuario'));
            }
        });
        treemapResizeObserver.observe(container);
    }
}
