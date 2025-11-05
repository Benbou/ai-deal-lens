-- Correction du search_path pour la fonction delete_deal_storage_files
-- Supprimer le trigger d'abord, puis recréer la fonction avec search_path vide

-- 1. Supprimer le trigger
DROP TRIGGER IF EXISTS trigger_delete_deal_storage_files ON deals;

-- 2. Supprimer l'ancienne fonction
DROP FUNCTION IF EXISTS delete_deal_storage_files();

-- 3. Recréer la fonction avec search_path vide (sécurisé)
CREATE OR REPLACE FUNCTION delete_deal_storage_files()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  file_path TEXT;
BEGIN
  -- Construire le chemin du fichier dans le bucket
  -- Format: {user_id}/{deal_id}.pdf
  file_path := OLD.user_id || '/' || OLD.id || '.pdf';
  
  -- Supprimer le fichier du bucket deck-files avec schéma explicite
  DELETE FROM storage.objects 
  WHERE bucket_id = 'deck-files' 
  AND name = file_path;
  
  -- Log la suppression
  RAISE NOTICE 'Deleted storage file: % from bucket deck-files', file_path;
  
  RETURN OLD;
END;
$$;

-- 4. Recréer le trigger
CREATE TRIGGER trigger_delete_deal_storage_files
  AFTER DELETE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION delete_deal_storage_files();