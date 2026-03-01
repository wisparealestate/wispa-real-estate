-- Add images jsonb column to properties and backfill from legacy property_photos when present
ALTER TABLE IF EXISTS public.properties ADD COLUMN IF NOT EXISTS images jsonb DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'property_photos' AND relkind = 'r') THEN
    -- Aggregate photos into JSON arrays per property and update properties.images
    WITH agg AS (
      SELECT property_id, jsonb_agg(photo_url) AS imgs
      FROM property_photos
      GROUP BY property_id
    )
    UPDATE public.properties p
    SET images = COALESCE(agg.imgs, '[]'::jsonb)
    FROM agg
    WHERE p.id = agg.property_id;
  END IF;
END$$;
