-- ============================================================
--  OMEGA SAFETY — Schema SQL (SQLite)
--  Gerado automaticamente. Versão 1.0
-- ============================================================

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- ------------------------------------------------------------
-- USUÁRIOS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    matricula     TEXT    NOT NULL UNIQUE,
    nome          TEXT    NOT NULL,
    funcao        TEXT,
    lideranca     TEXT,
    perfil        TEXT    NOT NULL CHECK(perfil IN ('operacional','adm')) DEFAULT 'operacional',
    contrato      TEXT,   -- Ex: 251, 301
    foto_perfil   TEXT,   -- Caminho para a imagem
    senha_hash    TEXT,   -- NULL para usuários operacionais
    ativo         INTEGER NOT NULL DEFAULT 1,
    is_lideranca  INTEGER DEFAULT 0,
    is_master     INTEGER DEFAULT 0,
    criado_em     DATETIME DEFAULT (datetime('now','localtime'))
);

-- ------------------------------------------------------------
-- TREINAMENTOS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS treinamentos (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    matricula         TEXT    NOT NULL,
    nome              TEXT    NOT NULL,
    funcao            TEXT,
    nome_treinamento  TEXT    NOT NULL,
    data_realizacao   DATE,
    data_vencimento   DATE,
    criado_em         DATETIME DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (matricula) REFERENCES usuarios(matricula) ON UPDATE CASCADE
);

-- ------------------------------------------------------------
-- N3 REGISTROS (Quase Acidentes / Condições Inseguras)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS n3_registros (
    id                     TEXT    PRIMARY KEY,  -- UUID
    data                   DATE    NOT NULL DEFAULT (date('now','localtime')),
    matricula_observador   TEXT    NOT NULL,
    nome_observador        TEXT    NOT NULL,
    lideranca              TEXT    NOT NULL,
    nivel                  TEXT,   -- Ex: N1, N2, N3
    local_ss               TEXT    NOT NULL,
    descricao_situacao     TEXT    NOT NULL,
    categoria              TEXT,
    subcategoria           TEXT,
    tag                    TEXT,
    plano_acao             TEXT,
    empresa_responsavel    TEXT,
    lideranca_responsavel  TEXT,
    prazo_vencimento       DATE,
    status                 TEXT    NOT NULL DEFAULT 'Em Análise'
                                   CHECK(status IN ('Em Análise','Aprovado','Reprovado','Pendente','Concluído')),
    evidencia_1_path       TEXT,   -- Caminho relativo do arquivo físico
    evidencia_2_path       TEXT,
    observacoes_adm        TEXT,   -- Campo para o ADM ao validar
    validado_por           TEXT,   -- Matrícula do ADM que validou
    validado_em            DATETIME,
    criado_em              DATETIME DEFAULT (datetime('now','localtime'))
);

-- ------------------------------------------------------------
-- INSPEÇÕES AVULSAS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inspecoes_avulsas (
    id                TEXT PRIMARY KEY,  -- UUID
    data_inspecao     DATE NOT NULL DEFAULT (date('now','localtime')),
    matricula         TEXT NOT NULL,
    nome_inspetor     TEXT NOT NULL,
    funcao            TEXT,
    lideranca         TEXT,
    local             TEXT,
    categoria         TEXT,
    subcategoria      TEXT,
    placa_veiculo     TEXT,
    tag               TEXT,
    tipo_veiculo      TEXT,
    descricao         TEXT,
    conclusao_tecnica TEXT,
    card_inspecao     TEXT,
    plano_acao        TEXT,
    prazo             DATE,
    foto_path         TEXT,
    criado_em         DATETIME DEFAULT (datetime('now','localtime'))
);

-- ------------------------------------------------------------
-- ÍNDICES PARA PERFORMANCE
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_treinamentos_matricula ON treinamentos(matricula);
CREATE INDEX IF NOT EXISTS idx_n3_matricula           ON n3_registros(matricula_observador);
CREATE INDEX IF NOT EXISTS idx_n3_status              ON n3_registros(status);
CREATE INDEX IF NOT EXISTS idx_n3_data                ON n3_registros(data);
CREATE INDEX IF NOT EXISTS idx_inspecoes_matricula    ON inspecoes_avulsas(matricula);
CREATE INDEX IF NOT EXISTS idx_inspecoes_data         ON inspecoes_avulsas(data_inspecao);

-- ------------------------------------------------------------
-- VPS - CANTEIROS (Maturidade VPS)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vps_canteiros (
    id            TEXT PRIMARY KEY, -- UUID
    nome          TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'Em andamento' CHECK(status IN ('Em andamento', 'Concluída', 'Paralisada')),
    maturidade    INTEGER NOT NULL DEFAULT 1 CHECK(maturidade IN (1,2,3,4)),
    capa_1_path   TEXT,
    capa_2_path   TEXT,
    criado_em     DATETIME DEFAULT (datetime('now','localtime'))
);

-- ------------------------------------------------------------
-- VPS - HISTÓRICO DE MATURIDADE / EVENTOS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vps_historico (
    id               TEXT PRIMARY KEY, -- UUID
    canteiro_id      TEXT NOT NULL,
    id_inspecao      TEXT,
    data_registro    DATE NOT NULL DEFAULT (date('now','localtime')),
    categoria        TEXT NOT NULL CHECK(categoria IN ('Inspeção de Rotina', 'Mudança de Maturidade')),
    tipo_card        TEXT NOT NULL CHECK(tipo_card IN ('Verde', 'Amarelo', 'Vermelho', 'Diamante', 'N/A')),
    descricao        TEXT,
    evidencia_1_path TEXT,
    evidencia_2_path TEXT,
    anexo_path       TEXT,
    criado_por       TEXT, -- Matricula do ADM
    criado_em        DATETIME DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (canteiro_id) REFERENCES vps_canteiros(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vps_historico_canteiro ON vps_historico(canteiro_id);
CREATE INDEX IF NOT EXISTS idx_vps_canteiros_status ON vps_canteiros(status);

-- ------------------------------------------------------------
-- N3 - HISTÓRICO DE ALTERAÇÕES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS n3_historico (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    n3_id            TEXT NOT NULL,
    data_hora        DATETIME DEFAULT (datetime('now','localtime')),
    usuario_nome     TEXT NOT NULL,
    detalhes         TEXT NOT NULL,
    FOREIGN KEY (n3_id) REFERENCES n3_registros(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_n3_historico_n3id ON n3_historico(n3_id);
