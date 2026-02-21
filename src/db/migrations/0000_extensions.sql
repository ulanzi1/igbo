-- Enable PostgreSQL extensions required by downstream stories
-- cube + earth_distance: Story 3.1 proximity queries
-- pg_trgm: Story 10.1 fuzzy text matching
CREATE EXTENSION IF NOT EXISTS cube;
CREATE EXTENSION IF NOT EXISTS earth_distance;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
