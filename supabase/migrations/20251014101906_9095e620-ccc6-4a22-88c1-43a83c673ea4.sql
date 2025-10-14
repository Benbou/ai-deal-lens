-- Ajouter une colonne pour stocker le markdown OCR extrait du deck
ALTER TABLE deck_files 
ADD COLUMN ocr_markdown TEXT;

-- Retirer l'URL Dust conversation qui n'est pas accessible publiquement
ALTER TABLE analyses 
DROP COLUMN dust_conversation_url;