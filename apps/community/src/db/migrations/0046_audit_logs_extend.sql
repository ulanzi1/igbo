-- Migration 0046: Extend audit_logs with target_type and trace_id columns
ALTER TABLE "audit_logs" ADD COLUMN "target_type" varchar(50);
ALTER TABLE "audit_logs" ADD COLUMN "trace_id" varchar(64);
