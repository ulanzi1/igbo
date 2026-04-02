#!/usr/bin/env bash
# Codemod: replace @/db/* import paths with @igbo/db/* paths
# Usage: ./scripts/codemod-db-imports.sh
# Run from monorepo root

set -euo pipefail

TARGET="apps/community/src"

echo "=== Codemod: @/db -> @igbo/db import paths ==="
echo "Target: $TARGET"

# Order matters: schema and queries first (more specific), then bare @/db
# Also handle both double and single quotes

# 1. @/db/schema/* -> @igbo/db/schema/*
find "$TARGET" -name "*.ts" -o -name "*.tsx" | xargs sed -i '' \
  's|from "@/db/schema/\([^"]*\)"|from "@igbo/db/schema/\1"|g;
   s|from '"'"'@/db/schema/\([^'"'"']*\)'"'"'|from '"'"'@igbo/db/schema/\1'"'"'|g;
   s|vi\.mock("@/db/schema/\([^"]*\)"|vi.mock("@igbo/db/schema/\1"|g;
   s|vi\.mock('"'"'@/db/schema/\([^'"'"']*\)'"'"'|vi.mock('"'"'@igbo/db/schema/\1'"'"'|g;
   s|import("@/db/schema/\([^"]*\)")|import("@igbo/db/schema/\1")|g;
   s|import('"'"'@/db/schema/\([^'"'"']*\)'"'"')|import('"'"'@igbo/db/schema/\1'"'"')|g' 2>/dev/null || true

# 2. @/db/queries/* -> @igbo/db/queries/*
find "$TARGET" -name "*.ts" -o -name "*.tsx" | xargs sed -i '' \
  's|from "@/db/queries/\([^"]*\)"|from "@igbo/db/queries/\1"|g;
   s|from '"'"'@/db/queries/\([^'"'"']*\)'"'"'|from '"'"'@igbo/db/queries/\1'"'"'|g;
   s|vi\.mock("@/db/queries/\([^"]*\)"|vi.mock("@igbo/db/queries/\1"|g;
   s|vi\.mock('"'"'@/db/queries/\([^'"'"']*\)'"'"'|vi.mock('"'"'@igbo/db/queries/\1'"'"'|g;
   s|import("@/db/queries/\([^"]*\)")|import("@igbo/db/queries/\1")|g;
   s|import('"'"'@/db/queries/\([^'"'"']*\)'"'"')|import('"'"'@igbo/db/queries/\1'"'"')|g' 2>/dev/null || true

# 3. @/db (bare — connection instance) -> @igbo/db
find "$TARGET" -name "*.ts" -o -name "*.tsx" | xargs sed -i '' \
  's|from "@/db"|from "@igbo/db"|g;
   s|from '"'"'@/db'"'"'|from '"'"'@igbo/db'"'"'|g;
   s|vi\.mock("@/db"|vi.mock("@igbo/db"|g;
   s|vi\.mock('"'"'@/db'"'"'|vi.mock('"'"'@igbo/db'"'"'|g;
   s|import("@/db")|import("@igbo/db")|g;
   s|import('"'"'@/db'"'"')|import('"'"'@igbo/db'"'"')|g' 2>/dev/null || true

echo "=== Codemod complete ==="
