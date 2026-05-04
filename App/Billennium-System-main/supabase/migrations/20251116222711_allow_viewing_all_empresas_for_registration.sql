/*
  # Allow viewing all active empresas during registration

  1. Changes
    - Add policy to allow authenticated users to view all active empresas
    - This is needed during registration to select which empresa to join
    - Users can still only see their own empresa's data once registered

  2. Security
    - Only shows active empresas
    - Only allows SELECT, not modify
    - Required for registration flow
*/

-- Add policy to allow viewing all active empresas for registration
CREATE POLICY "Authenticated users can view all active empresas"
  ON empresas FOR SELECT
  TO authenticated
  USING (activo = true);
