-- One-off content fill-in for the Saint Barbara icon product
-- (id 3514d9e4-2b9a-4c8d-a296-39a55c133feb, slug ikona-sviatoi-velykomuchenytsi-varvary):
-- fills the empty RU/EN name/SEO/full-description fields, and corrects
-- price_cents from 15000 (= 150.00 UAH, a data-entry error) to 1500000
-- (= 15,000.00 UAH, as requested). Not a schema migration -- plain content
-- UPDATE against an existing row.

UPDATE icon_order_options
SET
  name_ru = 'Икона Святой великомученицы Варвары',
  name_en = 'Icon of Holy Great Martyr Barbara',
  full_description_uk = 'Свята великомучениця Варвара постраждала за Христову віру на початку IV століття. Дочка заможного язичника, вона таємно навернулася до християнства і присвятила себе служінню Богові, за що зазнала жорстоких переслідувань від власного батька. Церковне передання шанує її як покровительку раптової та наглої смерті — перед її іконою моляться про мирну християнську кончину, захист від нещасних випадків і зміцнення віри в скорботні часи.

Ця ікона виконана з дотриманням канонічних традицій іконопису і підходить як для домашнього молитовного куточка, так і для храму. Вона стане гідним подарунком для рідних і близьких — на іменини, хрестини чи на знак духовної підтримки.',
  full_description_ru = 'Святая великомученица Варвара пострадала за веру Христову в начале IV века. Дочь состоятельного язычника, она тайно обратилась в христианство и посвятила себя служению Богу, за что подверглась жестоким гонениям со стороны собственного отца. Церковное предание почитает её как покровительницу внезапной и мгновенной смерти — перед её иконой молятся о мирной христианской кончине, защите от несчастных случаев и укреплении веры в скорбные времена.

Эта икона выполнена с соблюдением канонических традиций иконописи и подходит как для домашнего молитвенного уголка, так и для храма. Она станет достойным подарком для родных и близких — на именины, крестины или в знак духовной поддержки.',
  full_description_en = 'Holy Great Martyr Barbara suffered for the Christian faith in the early 4th century. The daughter of a wealthy pagan, she secretly converted to Christianity and devoted herself to serving God, for which she endured brutal persecution at the hands of her own father. Church tradition venerates her as a protector against sudden and violent death — the faithful pray before her icon for a peaceful Christian passing, protection from accidents, and strengthened faith in times of sorrow.

This icon is crafted in keeping with canonical iconographic tradition and is suited both for a home prayer corner and for church use. It makes a meaningful gift for family and loved ones — for a name day, a baptism, or as a token of spiritual support.',
  seo_title_ru = 'Икона Святой Варвары купить в Украине | СВЕТ ИКОН',
  seo_title_en = 'Icon of Saint Barbara for Sale in Ukraine | Light of Icons',
  seo_description_ru = 'Икона Святой великомученицы Варвары для дома, храма и подарка. Качественное изготовление, доставка по Украине, заказ онлайн.',
  seo_description_en = 'Icon of the Holy Great Martyr Barbara for home, church, or as a gift. Quality craftsmanship, delivery across Ukraine, order online.',
  price_cents = 1500000,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id = '3514d9e4-2b9a-4c8d-a296-39a55c133feb';
