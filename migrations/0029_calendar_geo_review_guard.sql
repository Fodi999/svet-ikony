CREATE TABLE calendar_geo_review_guard (
 id TEXT PRIMARY KEY,
 valid INTEGER NOT NULL CHECK(valid=1)
);
