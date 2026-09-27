-- Additive: curated commerce links for the SacredPlacePanel "Коллекция" tab.
-- product_id points at icon_order_options (the real product catalog / source
-- of truth for slug, photo_url, price_cents, currency, stock_status, is_active
-- -- see lib/d1/repositories/products.ts's own comment on that table's real
-- name). church_icons stays a separate, editorial/content entity; a place
-- that needs to reference a canonical icon as CONTENT (not as a purchasable
-- product) does that through the existing calendar_geo_content_links /
-- translation_group_id mechanism on calendar_geo_entities, not here.
--
-- Deliberately NOT copied here: price, photo, stock, slug, currency -- the
-- panel joins icon_order_options at read time for all of those.
CREATE TABLE calendar_geo_place_products (
 place_id TEXT NOT NULL REFERENCES calendar_geo_places(id),
 product_id TEXT NOT NULL REFERENCES icon_order_options(id),
 relation_type TEXT NOT NULL CHECK(relation_type IN ('primary','related')),
 sort_order INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY(place_id, product_id)
);

CREATE TRIGGER calendar_geo_place_products_updated_at
 AFTER UPDATE ON calendar_geo_place_products
 BEGIN UPDATE calendar_geo_place_products SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE place_id=NEW.place_id AND product_id=NEW.product_id; END;

CREATE INDEX idx_calendar_geo_place_products_place ON calendar_geo_place_products(place_id, sort_order);

-- Row-based localization for the short curatorial caption shown under each
-- collection card, same split as calendar_geo_place_profiles/_translations.
CREATE TABLE calendar_geo_place_product_captions (
 place_id TEXT NOT NULL,
 product_id TEXT NOT NULL,
 locale TEXT NOT NULL CHECK(locale IN ('uk','ru','en')),
 caption TEXT NOT NULL DEFAULT '',
 PRIMARY KEY(place_id, product_id, locale),
 FOREIGN KEY(place_id, product_id) REFERENCES calendar_geo_place_products(place_id, product_id)
);
