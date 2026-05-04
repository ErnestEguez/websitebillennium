/*
  # Add DELETE policy for anonymous users on articulos table

  1. Problem
    - VB6 code cannot delete articulos because there's no DELETE policy for anon role
    
  2. Solution
    - Add policy to allow anonymous users to delete articulos
    
  3. Security
    - Allows VB6 synchronization code to delete and recreate articulos
*/

-- Allow anonymous users to delete articulos
CREATE POLICY "Permitir eliminación anónima de articulos"
  ON articulos
  FOR DELETE
  TO anon
  USING (true);