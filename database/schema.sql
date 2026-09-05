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
