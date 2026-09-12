# Local historical layer proof of concept

`prototype.json` is a reconstruction dataset, not verified production cartography.

- Rus: unmodified Kyivan Rus MultiPolygon from aourednik/historical-basemaps world_1000.geojson (GPL-3.0, bundled LICENSE.txt). The displayed source year is 1000; it must not be described as exact boundaries in 988.
- Byzantium: project-authored schematic polygons for Constantinople and Morea before the fall. Metropolitan Museum historical context: https://www.metmuseum.org/essays/byzantium-ca-330-1453 . Geometry was NOT provided by that source. Minor possessions and enclaves are omitted. Do not reuse the mockup's empire around 1025 for an event in 1453.

Binding uses the declared narrow time interval plus location bounds, or optional translation group IDs; it does not depend on titles or language. Modern-country lookup stays independent.

Before a production rollout: review source licensing, date accuracy, enclaves, coastline, polygon topology, and scholarly attribution. Replace schematic geometry with audited data. No backend/schema changes are required.
