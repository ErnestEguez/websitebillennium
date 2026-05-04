/*
  # Force PostgREST Schema Refresh

  1. Purpose
    - Create and drop a temporary table to force PostgREST to reload its entire schema cache
    - This resolves issues where PostgREST hasn't recognized existing tables after migrations

  2. Changes
    - Creates a temporary table with minimal structure
    - Immediately drops it
    - Forces PostgREST to invalidate and rebuild its schema cache
*/

-- Create temporary table
CREATE TABLE IF NOT EXISTS _postgrest_refresh_trigger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now()
);

-- Drop it immediately to trigger schema reload
DROP TABLE IF EXISTS _postgrest_refresh_trigger;
