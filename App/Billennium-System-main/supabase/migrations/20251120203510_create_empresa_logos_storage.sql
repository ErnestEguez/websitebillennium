/*
  # Create Storage Bucket for Empresa Logos

  ## Changes
  1. Create public bucket 'empresa-logos' for storing company logos
  2. Set up RLS policies to allow:
     - Authenticated users to upload logos
     - Public read access to logos (needed for PDF generation)

  ## Security
  - Only authenticated users can upload
  - Files are publicly readable (logos need to be visible in PDFs)
  - File size limits should be enforced at application level
*/

-- Create the bucket for empresa logos (public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'empresa-logos',
  'empresa-logos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Policy: Allow authenticated users to upload logos
CREATE POLICY "Authenticated users can upload logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'empresa-logos');

-- Policy: Allow authenticated users to update their logos
CREATE POLICY "Authenticated users can update logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'empresa-logos')
  WITH CHECK (bucket_id = 'empresa-logos');

-- Policy: Allow authenticated users to delete logos
CREATE POLICY "Authenticated users can delete logos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'empresa-logos');

-- Policy: Allow public read access to logos (needed for PDFs and display)
CREATE POLICY "Public read access to logos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'empresa-logos');
