CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS fincite_sources (
    source_id TEXT NOT NULL,
    document_sha256 TEXT NOT NULL CHECK (document_sha256 ~ '^[a-f0-9]{64}$'),
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    raw_sha256 TEXT NOT NULL CHECK (raw_sha256 ~ '^[a-f0-9]{64}$'),
    extractor_version TEXT NOT NULL,
    validation_status TEXT NOT NULL,
    document_text TEXT NOT NULL CHECK (length(document_text) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (source_id, document_sha256)
);

CREATE TABLE IF NOT EXISTS fincite_chunks (
    chunk_id TEXT PRIMARY KEY CHECK (chunk_id ~ '^[a-f0-9]{64}$'),
    source_id TEXT NOT NULL,
    document_sha256 TEXT NOT NULL,
    chunk_sha256 TEXT NOT NULL CHECK (chunk_sha256 ~ '^[a-f0-9]{64}$'),
    chunking_version TEXT NOT NULL,
    chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
    start_char INTEGER NOT NULL CHECK (start_char >= 0),
    end_char INTEGER NOT NULL CHECK (end_char > start_char),
    offset_unit TEXT NOT NULL CHECK (offset_unit = 'UTF-16 code units'),
    chunk_text TEXT NOT NULL CHECK (length(chunk_text) > 0),
    search_vector TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('english'::regconfig, chunk_text)
    ) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (source_id, document_sha256)
        REFERENCES fincite_sources (source_id, document_sha256),
    UNIQUE (source_id, document_sha256, chunking_version, chunk_index)
);

CREATE INDEX IF NOT EXISTS fincite_chunks_search_idx
    ON fincite_chunks USING GIN (search_vector);

CREATE TABLE IF NOT EXISTS fincite_embeddings (
    chunk_id TEXT NOT NULL REFERENCES fincite_chunks (chunk_id),
    model_id TEXT NOT NULL,
    model_revision TEXT NOT NULL,
    embedding VECTOR(384) NOT NULL,
    input_sha256 TEXT NOT NULL CHECK (input_sha256 ~ '^[a-f0-9]{64}$'),
    input_tokens INTEGER NOT NULL CHECK (input_tokens > 0),
    normalized BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (chunk_id, model_id, model_revision)
);
