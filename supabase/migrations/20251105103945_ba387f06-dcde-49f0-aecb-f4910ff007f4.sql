-- Trigger pour suppression automatique des fichiers storage quand un deal est supprimé

-- Fonction pour supprimer les fichiers du storage bucket deck-files
CREATE OR REPLACE FUNCTION delete_deal_storage_files()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  file_path TEXT;
BEGIN
  -- Construire le chemin du fichier dans le bucket
  -- Format: {user_id}/{deal_id}.pdf
  file_path := OLD.user_id || '/' || OLD.id || '.pdf';
  
  -- Supprimer le fichier du bucket deck-files
  DELETE FROM storage.objects 
  WHERE bucket_id = 'deck-files' 
  AND name = file_path;
  
  -- Log la suppression
  RAISE NOTICE 'Deleted storage file: % from bucket deck-files', file_path;
  
  RETURN OLD;
END;
$$;

-- Créer le trigger AFTER DELETE sur la table deals
DROP TRIGGER IF EXISTS trigger_delete_deal_storage_files ON deals;
CREATE TRIGGER trigger_delete_deal_storage_files
  AFTER DELETE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION delete_deal_storage_files();