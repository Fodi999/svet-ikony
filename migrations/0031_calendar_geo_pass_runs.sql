CREATE TABLE calendar_geo_pass_runs (
 id TEXT PRIMARY KEY,
 pass TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('running','stopped','complete','error')),
 started_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 profile_ids_json TEXT NOT NULL CHECK(json_valid(profile_ids_json)),
 baseline_json TEXT NOT NULL CHECK(json_valid(baseline_json)),
 stats_json TEXT NOT NULL CHECK(json_valid(stats_json)),
 report_json TEXT CHECK(report_json IS NULL OR json_valid(report_json))
);
