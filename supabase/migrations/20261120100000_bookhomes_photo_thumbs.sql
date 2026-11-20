-- Card thumbnails for listing photos (applied 20 Nov 2026).
-- thumb_url: small copy stored next to the photo as <name>.t.jpg. Null = none yet; equal to url = none possible.
-- Set by bookhomes-host add_photo (browser uploads a 640px copy), bookhomes-import-airbnb (Airbnb 720px copy)
-- and the bookhomes-ical-sync cron (backfills older Airbnb imports). Cards use it; listing pages use the full photo.
alter table bookhomes.listing_photos add column if not exists thumb_url text;
comment on column bookhomes.listing_photos.thumb_url is 'Small card copy (<name>.t.jpg next to the photo). Null = none yet; equal to url = none possible.';
