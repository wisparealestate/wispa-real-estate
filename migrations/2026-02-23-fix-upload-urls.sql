-- Replace http upload URLs with https in DB columns and JSON arrays

-- Update property_photos.photo_url
UPDATE property_photos
SET photo_url = replace(photo_url, 'http://wispa-real-estate-2ew3.onrender.com', 'https://wispa-real-estate-2ew3.onrender.com')
WHERE photo_url LIKE 'http://%wispa-real-estate-2ew3.onrender.com%';

-- Update users.avatar_url
UPDATE users
SET avatar_url = replace(avatar_url, 'http://wispa-real-estate-2ew3.onrender.com', 'https://wispa-real-estate-2ew3.onrender.com')
WHERE avatar_url LIKE 'http://%wispa-real-estate-2ew3.onrender.com%';

-- Update properties.document_url
UPDATE properties
SET document_url = replace(document_url, 'http://wispa-real-estate-2ew3.onrender.com', 'https://wispa-real-estate-2ew3.onrender.com')
WHERE document_url LIKE 'http://%wispa-real-estate-2ew3.onrender.com%';

-- If properties.images is JSONB array of urls, update entries
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='properties' AND column_name='images') THEN
    PERFORM (
      UPDATE properties
      SET images = (
        SELECT jsonb_agg(replace(elem::text, 'http://wispa-real-estate-2ew3.onrender.com', 'https://wispa-real-estate-2ew3.onrender.com')::jsonb)
        FROM jsonb_array_elements(images) AS elems(elem)
      )
      WHERE images::text LIKE '%http://wispa-real-estate-2ew3.onrender.com%'
    );
  END IF;
END$$;

-- Fallback: update any stored JSON files in data/ by running the included script if needed.
