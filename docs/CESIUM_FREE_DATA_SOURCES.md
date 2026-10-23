# Free data / API audit

Verified 2026-09-18 against the primary links below. Data licensing and hosted
service quotas are distinct. No hosted API becomes a browser dependency.

| Source | Purpose / terms | Key / quota / commercial use | Cache / browser delivery |
|---|---|---|---|
| CesiumJS | Runtime, Apache-2.0 plus bundled third-party notices | No key, fee or runtime request quota for self-hosted library; commercial use allowed under license | npm pin; local JS, assets/workers; no ion |
| Natural Earth | Countries and 215 capitals, public domain | No key; no promised download SLA/quota; commercial use permitted; credit recommended, not required | Existing GeoJSON/JSON served locally |
| NASA Blue Marble | Global raster; NASA media policy and asset credit | No key for static file; no advertised guaranteed quota; commercial use subject to NASA rules, no implied endorsement or logo license | Existing local JPEG; generated local tiles; credit NASA Earth Observatory |
| Copernicus GLO-30 | DEM; specific Copernicus WorldDEM-30 license, NOT blanket public domain | GLO-30 free/open; commercial reuse under license and required attribution. CDSE downloads may need account/token; EEA-10 access is restricted | Existing local TIF/cache; generated local tiles; no browser API |
| Sentinel-2 | True-color regional imagery; Copernicus Sentinel legal notice | Free/open data including adaptation/commercial reuse with source/modification notice; authenticated CDSE download quotas apply | Existing TCI + supplements; local imagery tiles |
| Wikidata | Future structured knowledge; CC0 structured data | Public reads do not generally require key, endpoint-specific limits; no unlimited SLA; commercial reuse allowed | Not connected; future server-side cache only |
| Wikipedia | Future summaries/cards; generally CC BY-SA 4.0, check each page/media | Public API reads typically no key; obey API etiquette, maxlag/retry/backoff, descriptive User-Agent; commercial reuse with attribution/share-alike where applicable | Not connected; no live browser dependency; media license checked individually |

## Primary evidence

- Cesium license: https://github.com/CesiumGS/cesium/blob/main/LICENSE.md
- Natural Earth terms: https://www.naturalearthdata.com/about/terms-of-use/
- NASA asset: https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/
- NASA usage: https://www.nasa.gov/nasa-brand-center/images-and-media/
- DEM product/license links: https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM
- GLO-30 license: https://docs.sentinel-hub.com/api/latest/static/files/data/dem/resources/license/License-COPDEM-30.pdf
- Sentinel legal notice: https://cds.climate.copernicus.eu/licences/ec-sentinel
- CDSE quotas: https://documentation.dataspace.copernicus.eu/Quotas.html
- Wikidata: https://www.wikidata.org/wiki/Wikidata:Licensing
- Wikipedia terms: https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use
- API etiquette: https://www.mediawiki.org/wiki/API:Etiquette

CDSE currently lists 4 concurrent immediate-download connections, 20 MB/s per
connection and 12 TB rolling 30-day transfer before throttling; 2000 requests/min
footnote applies to S3. Other APIs have separate quotas. These are not unlimited
production tile-CDN rights. Sentinel Hub/openEO processing credits are explicitly
NOT selected as a production dependency. Reverify quotas before new ingestion.

Existing AWS COG source URLs are provenance only; their hosting availability is
not a paid/free runtime guarantee. This phase reuses cached files, without new
remote DEM/Sentinel downloads. Preserve source hash, acquisition date and
required adapted-data notices in generated manifests and visible credits.

No Google, Bing, Mapbox, ArcGIS, Cesium ion or public OSM tile service is enabled.
Historical prototype data is outside the table: its GPL/reconstruction caveats
remain recorded in lib/visualizer/historical-territories/README.md.
