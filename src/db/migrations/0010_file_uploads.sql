CREATE TABLE platform_file_uploads (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploader_id      UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  object_key       VARCHAR(512) NOT NULL UNIQUE,
  original_filename VARCHAR(255),
  file_type        VARCHAR(50),
  file_size        BIGINT,
  status           VARCHAR(20) NOT NULL DEFAULT 'processing',
  processed_url    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX platform_file_uploads_uploader_id_idx ON platform_file_uploads(uploader_id);
CREATE INDEX platform_file_uploads_status_idx ON platform_file_uploads(status);
