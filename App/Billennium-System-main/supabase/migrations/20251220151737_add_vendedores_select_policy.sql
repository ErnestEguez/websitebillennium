/*
  # Add SELECT policy for vendedores table

  1. Changes
    - Add SELECT policy to allow authenticated users to read their own vendedor record
    - This fixes login issues where users cannot load their profile after authentication

  2. Security
    - Users can only read their own vendedor record (auth.uid() = id)
*/

CREATE POLICY "Users can read own vendedor record"
  ON vendedores
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = id);
