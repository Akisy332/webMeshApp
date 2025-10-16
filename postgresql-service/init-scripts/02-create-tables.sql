-- Создание таблиц для PostgreSQL

CREATE TABLE IF NOT EXISTS module (
    id INTEGER PRIMARY KEY,
    name TEXT,
    color TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    datetime TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    hidden BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS message_type (
    id INTEGER PRIMARY KEY,
    type TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS data (
    id SERIAL PRIMARY KEY,
    id_module INTEGER REFERENCES module(id),
    id_session INTEGER REFERENCES sessions(id),
    id_message_type INTEGER REFERENCES message_type(id),
    datetime TIMESTAMP WITH TIME ZONE,
    datetime_unix BIGINT,
    lat DOUBLE PRECISION,
    lon DOUBLE PRECISION,
    alt DOUBLE PRECISION,
    gps_ok BOOLEAN,
    message_number INTEGER,
    rssi INTEGER,
    snr INTEGER,
    source INTEGER,
    jumps INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для производительности
CREATE INDEX IF NOT EXISTS idx_data_session_module ON data(id_session, id_module);
CREATE INDEX IF NOT EXISTS idx_data_datetime_unix ON data(datetime_unix);
CREATE INDEX IF NOT EXISTS idx_data_module ON data(id_module);
CREATE INDEX IF NOT EXISTS idx_data_gps_ok ON data(gps_ok) WHERE gps_ok = true;
CREATE INDEX IF NOT EXISTS idx_sessions_hidden ON sessions(hidden) WHERE hidden = false;

-- Вставка базовых данных
INSERT INTO message_type (id, type) VALUES 
(0, 'Mesh'),
(1, 'Sim'),
(2, 'Mesh / Sim')
ON CONFLICT (id) DO NOTHING;