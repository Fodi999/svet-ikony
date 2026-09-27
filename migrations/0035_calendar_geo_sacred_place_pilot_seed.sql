-- Sacred Place pilot seed: Kyiv-Pechersk Lavra + the Dormition ("Успенський
-- собор") cathedral, kept as two SEPARATE entities/places per the approved
-- plan (not merged into one record) -- the Lavra is the monastery complex,
-- the cathedral is one building inside it.
--
-- All text below is original, hand-authored summary content, not copied
-- from any external source. Coordinates are approximate map placements for
-- the pilot, not a geodetic survey -- same caveat as the polygons below.
-- website_url / map_url / opening_hours_json are left as placeholders
-- (empty) on purpose: publishing a specific hours/URL claim without the
-- content team confirming it first would be worse than leaving it blank.

INSERT INTO calendar_geo_sources (id, source_type, source_url, retrieved_at, license, attribution) VALUES
 ('source-sacred-place-pilot-manual', 'manual', 'internal://sacred-place-pilot', strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL, 'Svet Ikony editorial pilot seed');

-- Entities (so the pilot also surfaces through the existing entity/catalog
-- flow -- /api/calendar/entity/[id], calendarGeoCatalog -- not just through
-- the new place-keyed endpoints).
INSERT INTO calendar_geo_entities (id, entity_type, canonical_name, verification_status, match_status, geo_status) VALUES
 ('entity-kyiv-pechersk-lavra', 'monastery', 'Kyiv-Pechersk Lavra', 'verified', 'reviewed_verified', 'reviewed_verified'),
 ('entity-uspensky-sobor', 'church', 'Dormition Cathedral (Uspensky Sobor), Kyiv-Pechersk Lavra', 'verified', 'reviewed_verified', 'reviewed_verified');

-- Places. Coordinates are approximate pilot placements.
INSERT INTO calendar_geo_places (id, canonical_name, lat, lon, country_code, region, place_type, verification_status, match_status, geo_status) VALUES
 ('place-kyiv-pechersk-lavra', 'Kyiv-Pechersk Lavra', 50.4350, 30.5578, 'UA', 'Kyiv', 'monastery', 'verified', 'reviewed_verified', 'reviewed_verified'),
 ('place-uspensky-sobor', 'Dormition Cathedral, Kyiv-Pechersk Lavra', 50.4344, 30.5589, 'UA', 'Kyiv', 'church', 'verified', 'reviewed_verified', 'reviewed_verified');

-- Place-to-place hierarchy (calendar_geo_place_relations, added in 0034):
-- the Lavra CONTAINS the cathedral. This is intentionally a different
-- table/row from the calendar_geo_relations rows below -- see 0034's header
-- comment. 'pilgrimage' below is NEVER used for this containment fact.
--
-- verification_status is 'needs_review', not 'verified': this is a manually
-- entered pilot fact with no confirmed external source behind it yet (the
-- containment itself is common knowledge, but nothing here has been checked
-- against a citable source_id-worthy reference). Do not mark manual pilot
-- rows 'verified' without one.
INSERT INTO calendar_geo_place_relations (parent_place_id, child_place_id, relation_type, source_id, verification_status) VALUES
 ('place-kyiv-pechersk-lavra', 'place-uspensky-sobor', 'contains', 'source-sacred-place-pilot-manual', 'needs_review');

-- relation_type='pilgrimage' is the closest existing enum value to "this
-- entity IS located at this place" -- calendar_geo_relations has no literal
-- "location" relation type, and both records are, in fact, major pilgrimage
-- sites, so the choice is accurate, not just a workaround. This is an
-- ENTITY<->PLACE fact, unrelated to the place<->place hierarchy above.
INSERT INTO calendar_geo_relations (entity_id, place_id, relation_type, source_id, verification_status, match_status, geo_status) VALUES
 ('entity-kyiv-pechersk-lavra', 'place-kyiv-pechersk-lavra', 'pilgrimage', 'source-sacred-place-pilot-manual', 'verified', 'reviewed_verified', 'reviewed_verified'),
 ('entity-uspensky-sobor', 'place-uspensky-sobor', 'pilgrimage', 'source-sacred-place-pilot-manual', 'verified', 'reviewed_verified', 'reviewed_verified');

-- Entity name/short_description translations.
INSERT INTO calendar_geo_translations (id, entity_id, locale, name, short_description, translation_status, source_locale, source_id) VALUES
 ('tr-entity-lavra-uk', 'entity-kyiv-pechersk-lavra', 'uk', 'Києво-Печерська лавра', 'Один із найдавніших монастирів Київської Русі, заснований у 1051 році преподобними Антонієм і Феодосієм Печерськими. Комплекс печер, храмів і монастирських споруд на дніпровських кручах — одна з головних православних святинь.', 'verified', 'uk', 'source-sacred-place-pilot-manual'),
 ('tr-entity-lavra-ru', 'entity-kyiv-pechersk-lavra', 'ru', 'Киево-Печерская лавра', 'Один из древнейших монастырей Киевской Руси, основанный в 1051 году преподобными Антонием и Феодосием Печерскими. Комплекс пещер, храмов и монастырских построек на днепровских кручах — одна из главных православных святынь.', 'verified', 'ru', 'source-sacred-place-pilot-manual'),
 ('tr-entity-lavra-en', 'entity-kyiv-pechersk-lavra', 'en', 'Kyiv-Pechersk Lavra', 'One of the oldest monasteries of Kyivan Rus, founded in 1051 by Saints Anthony and Theodosius of the Caves. A complex of caves, churches and monastic buildings on the bluffs above the Dnipro, and one of the principal Orthodox shrines.', 'verified', 'en', 'source-sacred-place-pilot-manual'),
 ('tr-entity-sobor-uk', 'entity-uspensky-sobor', 'uk', 'Успенський собор', 'Головний храм Києво-Печерської лаври, зведений у XI столітті. Був знищений вибухом 1941 року і відбудований у 2000 році; нині — діючий собор і одна з ключових споруд Верхньої лаври.', 'verified', 'uk', 'source-sacred-place-pilot-manual'),
 ('tr-entity-sobor-ru', 'entity-uspensky-sobor', 'ru', 'Успенский собор', 'Главный храм Киево-Печерской лавры, возведённый в XI веке. Был уничтожен взрывом 1941 года и восстановлен в 2000 году; сегодня — действующий собор и одно из ключевых сооружений Верхней лавры.', 'verified', 'ru', 'source-sacred-place-pilot-manual'),
 ('tr-entity-sobor-en', 'entity-uspensky-sobor', 'en', 'Dormition Cathedral', 'The main church of the Kyiv-Pechersk Lavra, built in the 11th century. Destroyed by an explosion in 1941 and rebuilt in 2000; today it is an active cathedral and one of the key buildings of the Upper Lavra.', 'verified', 'en', 'source-sacred-place-pilot-manual');

-- Place name translations (calendar_geo_translations also accepts place_id).
INSERT INTO calendar_geo_translations (id, place_id, locale, name, translation_status, source_locale, source_id) VALUES
 ('tr-place-lavra-uk', 'place-kyiv-pechersk-lavra', 'uk', 'Києво-Печерська лавра', 'verified', 'uk', 'source-sacred-place-pilot-manual'),
 ('tr-place-lavra-ru', 'place-kyiv-pechersk-lavra', 'ru', 'Киево-Печерская лавра', 'verified', 'ru', 'source-sacred-place-pilot-manual'),
 ('tr-place-lavra-en', 'place-kyiv-pechersk-lavra', 'en', 'Kyiv-Pechersk Lavra', 'verified', 'en', 'source-sacred-place-pilot-manual'),
 ('tr-place-sobor-uk', 'place-uspensky-sobor', 'uk', 'Успенський собор', 'verified', 'uk', 'source-sacred-place-pilot-manual'),
 ('tr-place-sobor-ru', 'place-uspensky-sobor', 'ru', 'Успенский собор', 'verified', 'ru', 'source-sacred-place-pilot-manual'),
 ('tr-place-sobor-en', 'place-uspensky-sobor', 'en', 'Dormition Cathedral', 'verified', 'en', 'source-sacred-place-pilot-manual');

-- Profiles (website_url/map_url/opening_hours_json intentionally blank --
-- see the file header comment).
INSERT INTO calendar_geo_place_profiles (place_id, website_url, map_url, opening_hours_json) VALUES
 ('place-kyiv-pechersk-lavra', NULL, NULL, '{}'),
 ('place-uspensky-sobor', NULL, NULL, '{}');

INSERT INTO calendar_geo_place_profile_translations (place_id, locale, history_text, address, directions) VALUES
 ('place-kyiv-pechersk-lavra', 'uk', 'Заснована в 1051 році преподобними Антонієм і Феодосієм Печерськими як печерний монастир на дніпровських кручах. Протягом століть розросталася у великий монастирський комплекс з Верхньою і Нижньою лаврами, друкарнею, бібліотекою та мережею печер, де спочивають мощі багатьох святих. Внесена до списку Світової спадщини ЮНЕСКО.', 'Київ, вул. Лаврська, 15', 'Найближча станція метро — «Арсенальна» (синя лінія), далі 10–15 хвилин пішки вгору вул. Лаврською; також курсують наземні маршрути до зупинки «Печерська лавра».'),
 ('place-kyiv-pechersk-lavra', 'ru', 'Основана в 1051 году преподобными Антонием и Феодосием Печерскими как пещерный монастырь на днепровских кручах. За века выросла в крупный монастырский комплекс с Верхней и Нижней лаврами, типографией, библиотекой и сетью пещер, где покоятся мощи многих святых. Включена в список Всемирного наследия ЮНЕСКО.', 'Киев, ул. Лаврская, 15', 'Ближайшая станция метро — «Арсенальная» (синяя линия), далее 10–15 минут пешком вверх по ул. Лаврской; также есть наземные маршруты до остановки «Печерская лавра».'),
 ('place-kyiv-pechersk-lavra', 'en', 'Founded in 1051 by Saints Anthony and Theodosius of the Caves as a cave monastery on the bluffs above the Dnipro. Over the centuries it grew into a large monastic complex with an Upper and Lower Lavra, a printing house, a library and a network of caves holding the relics of many saints. Listed as a UNESCO World Heritage Site.', 'Kyiv, 15 Lavrska St.', 'The nearest metro station is Arsenalna (blue line), then a 10-15 minute walk uphill along Lavrska St.; surface routes also stop at "Pecherska Lavra".'),
 ('place-uspensky-sobor', 'uk', 'Головний собор лаври, закладений у 1073–1078 роках. Багаторазово перебудовувався після пожеж і руйнувань; був підірваний у листопаді 1941 року і залишався руїною понад півстоліття. Відбудований за історичними кресленнями та відкритий у 2000 році.', 'Київ, вул. Лаврська, 15, територія Верхньої лаври', 'Розташований у центральній частині Верхньої лаври; вхід через головну браму лаври, далі за вказівниками до центральної площі з собором.'),
 ('place-uspensky-sobor', 'ru', 'Главный собор лавры, заложенный в 1073–1078 годах. Многократно перестраивался после пожаров и разрушений; был взорван в ноябре 1941 года и оставался руинами более полувека. Восстановлен по историческим чертежам и открыт в 2000 году.', 'Киев, ул. Лаврская, 15, территория Верхней лавры', 'Расположен в центральной части Верхней лавры; вход через главные врата лавры, далее по указателям к центральной площади с собором.'),
 ('place-uspensky-sobor', 'en', 'The main cathedral of the Lavra, laid down in 1073-1078. Rebuilt several times after fires and destruction; blown up in November 1941 and left in ruins for over half a century. Reconstructed from historical drawings and reopened in 2000.', 'Kyiv, 15 Lavrska St., Upper Lavra grounds', 'Located in the central part of the Upper Lavra; enter through the Lavra''s main gate and follow signage to the central square with the cathedral.');

-- Territory polygons -- approximate pilot outlines, not a survey (see
-- header). Coordinates are [lon, lat] per GeoJSON.
INSERT INTO calendar_geo_place_territories (id, place_id, geometry_type, geometry_json, source_id, verification_status) VALUES
 ('territory-kyiv-pechersk-lavra', 'place-kyiv-pechersk-lavra', 'Polygon',
  '{"type":"Polygon","coordinates":[[[30.5551,50.4370],[30.5610,50.4372],[30.5622,50.4340],[30.5598,50.4318],[30.5548,50.4322],[30.5536,50.4348],[30.5551,50.4370]]]}',
  'source-sacred-place-pilot-manual', 'needs_review'),
 ('territory-uspensky-sobor', 'place-uspensky-sobor', 'Polygon',
  '{"type":"Polygon","coordinates":[[[30.5585,50.4347],[30.5594,50.4347],[30.5594,50.4341],[30.5585,50.4341],[30.5585,50.4347]]]}',
  'source-sacred-place-pilot-manual', 'needs_review');

-- calendar_geo_place_products is intentionally left EMPTY by this seed --
-- see the chat plan: this sandbox has no live D1 access, so no real
-- icon_order_options.id is known here. The collection tab must render its
-- existing "no items yet" empty state for these two places until a content
-- editor inserts real product links against production data.
