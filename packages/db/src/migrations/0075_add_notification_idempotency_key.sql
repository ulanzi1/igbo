ALTER TABLE platform_notifications ADD COLUMN idempotency_key VARCHAR(255);
CREATE UNIQUE INDEX idx_platform_notifications_idempotency_key ON platform_notifications (idempotency_key) WHERE idempotency_key IS NOT NULL;
