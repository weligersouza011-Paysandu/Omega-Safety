// utils/period.js — Janelas de data para listagens paginadas (N3 / Inspeções)
// Aplicado por padrão: últimos 7 dias. Períodos maiores/histórico são carregados
// sob demanda pelo cliente, mantendo a primeira requisição leve.

const ALL_PERIOD_ALIASES = new Set([
    'all', 'todos', 'todo', 'historico', 'histórico', 'completo', 'completa', 'total'
]);

function pad2(n) {
    return String(n).padStart(2, '0');
}

// Converte Date/string em 'YYYY-MM-DD' sem deslocar o dia por fuso horário.
function toIsoDate(value) {
    if (!value) return null;

    if (value instanceof Date) {
        if (isNaN(value.getTime())) return null;
        return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
    }

    const raw = String(value).trim();
    if (!raw) return null;

    let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;

    m = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
    if (m) {
        const day = pad2(m[1]);
        const month = pad2(m[2]);
        let year = Number(m[3]);
        if (year < 100) year += 2000;
        return `${year}-${month}-${day}`;
    }

    return null;
}

function todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isoDaysAgo(days) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - Math.max(0, days - 1));
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Resolve o período solicitado pela query string.
 *
 * Prioridade:
 *   1. data_inicio / data_fim (intervalo personalizado)
 *   2. periodo (7d, 30d, all, N)
 *   3. dias (compatibilidade; N ou 0/all)
 *   4. defaultDays (7)
 */
function resolvePeriod(query = {}, defaultDays = 7) {
    const customStart = toIsoDate(query.data_inicio);
    const customEnd = toIsoDate(query.data_fim);

    if (customStart || customEnd) {
        const start = customStart && customEnd && customStart > customEnd ? customEnd : customStart;
        const end = customStart && customEnd && customStart > customEnd ? customStart : customEnd;
        return {
            mode: 'custom',
            days: null,
            cutoff: null,
            data_inicio: start,
            data_fim: end,
            label: 'Período personalizado',
        };
    }

    const raw = query.periodo !== undefined && query.periodo !== null && String(query.periodo).trim() !== ''
        ? query.periodo
        : query.dias;

    let days = defaultDays;

    if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
        const token = String(raw).trim().toLowerCase();

        if (ALL_PERIOD_ALIASES.has(token)) {
            return {
                mode: 'all',
                days: null,
                cutoff: null,
                data_inicio: null,
                data_fim: null,
                label: 'Todo o histórico',
            };
        }

        if (['7d', '7', 'semana', 'ultimos7', 'últimos7'].includes(token)) {
            days = 7;
        } else if (['30d', '30', 'mes', 'mês', 'ultimos30', 'últimos30'].includes(token)) {
            days = 30;
        } else if (['90d', '90', 'trimestre'].includes(token)) {
            days = 90;
        } else {
            const parsed = parseInt(token, 10);
            if (Number.isFinite(parsed)) {
                if (parsed <= 0) {
                    return {
                        mode: 'all',
                        days: null,
                        cutoff: null,
                        data_inicio: null,
                        data_fim: null,
                        label: 'Todo o histórico',
                    };
                }
                days = parsed;
            }
        }
    }

    days = Math.min(Math.max(days, 1), 3650);

    return {
        mode: `${days}d`,
        days,
        cutoff: isoDaysAgo(days),
        data_inicio: null,
        data_fim: null,
        label: `Últimos ${days} dias`,
    };
}

/**
 * Gera o trecho SQL de filtro de data. O nome da coluna é sempre interno
 * (nunca vem do cliente), então pode ser interpolado com segurança.
 */
function buildPeriodClause(column, period) {
    const clauses = [];
    const params = [];

    if (period && period.cutoff) {
        clauses.push(`${column} >= ?`);
        params.push(period.cutoff);
    } else if (period) {
        if (period.data_inicio) {
            clauses.push(`${column} >= ?`);
            params.push(period.data_inicio);
        }
        if (period.data_fim) {
            clauses.push(`${column} <= ?`);
            params.push(period.data_fim);
        }
    }

    return {
        sql: clauses.length ? clauses.join(' AND ') : '',
        params,
    };
}

function periodMeta(period) {
    return {
        mode: period.mode,
        days: period.days,
        data_inicio: period.data_inicio,
        data_fim: period.data_fim,
        label: period.label,
    };
}

module.exports = {
    toIsoDate,
    todayIso,
    isoDaysAgo,
    resolvePeriod,
    buildPeriodClause,
    periodMeta,
};
