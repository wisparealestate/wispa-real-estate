-- Migration: convert non-array images jsonb to arrays and add trigger to coerce
BEGIN;

-- Convert existing non-array images (objects or null) to empty arrays
UPDATE properties SET images = '[]'::jsonb WHERE images IS NULL OR jsonb_typeof(images) IS DISTINCT FROM 'array';

-- Create a function to coerce `images` to a jsonb array on insert/update
CREATE OR REPLACE FUNCTION coerce_images_to_array()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.images IS NULL THEN
    NEW.images := '[]'::jsonb;
  ELSE
    BEGIN
      IF jsonb_typeof(NEW.images) IS DISTINCT FROM 'array' THEN
        -- If it's an object or something else, replace with empty array
        NEW.images := '[]'::jsonb;
      END IF;
    EXCEPTION WHEN others THEN
      NEW.images := '[]'::jsonb;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to properties table
DROP TRIGGER IF EXISTS trigger_coerce_images_to_array ON properties;
CREATE TRIGGER trigger_coerce_images_to_array
BEFORE INSERT OR UPDATE ON properties
FOR EACH ROW EXECUTE FUNCTION coerce_images_to_array();

COMMIT;
