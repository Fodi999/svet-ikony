import { Breadcrumbs } from '@/components/site/Breadcrumbs';
import { IconsCatalog } from '@/components/site/IconsCatalog';
import { Eyebrow, HeroTitle, Lead, Page } from '@/components/site/PageChrome';
import { T } from '@/components/site/TranslatedText';
import { publicApi } from '@/lib/api';
import { translate } from '@/lib/i18n';
import { pageMetadata } from '@/lib/seo';
import { getRequestLocale } from '@/lib/serverLocale';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata() {
  const locale = await getRequestLocale();
  return pageMetadata({
    title: translate(locale, 'iconsPageTitle'),
    description: translate(locale, 'iconsPageLead'),
    path: '/icons',
    locale
  });
}

export default async function IconsPage() {
  const locale = await getRequestLocale();
  const icons = await publicApi.icons(locale);
  const categories = Array.from(new Set(icons.map((icon) => icon.category).filter(Boolean)));
  const statClass =
    "min-w-0 grid grid-rows-[auto_auto] content-end justify-items-start gap-3 min-h-[132px] max-[900px]:min-h-[104px] max-[900px]:p-3.5 max-[720px]:min-h-[86px] max-[720px]:p-3 max-[430px]:min-h-[84px] max-[430px]:p-2.5 p-4.5 bg-[linear-gradient(135deg,rgba(205,164,90,.055),transparent_46%),linear-gradient(160deg,rgba(127,141,101,.05),transparent_62%),#141511]";
  const statDtClass = "min-w-0 max-w-full text-foreground font-serif text-[42px] max-[720px]:text-[38px] max-[430px]:text-[34px] leading-[.95] whitespace-nowrap";
  const statDdClass =
    "w-full m-0 text-[#8f9b86] text-[10px] max-[430px]:text-[9px] max-[430px]:leading-[1.12] font-black leading-[1.16] uppercase [overflow-wrap:anywhere] text-balance";

  return (
    <Page className="overflow-hidden">
      <Breadcrumbs
        items={[{ href: '/', label: translate(locale, 'home') }]}
        current={translate(locale, 'navIcons')}
      />
      <section className="grid grid-cols-[minmax(0,1fr)_minmax(260px,420px)] gap-[clamp(24px,5vw,80px)] items-end pt-0 px-0 pb-[clamp(30px,4vw,64px)] border-b border-gold/28 max-[900px]:items-start">
        <div>
          <Eyebrow><T k="catalog" /></Eyebrow>
          <HeroTitle className="max-w-[980px]">
            <T k="iconsPageTitle" />
          </HeroTitle>
          <Lead><T k="iconsPageLead" /></Lead>
        </div>
        <dl className="grid grid-cols-3 gap-px m-0 bg-gold/28">
          <div className={statClass}>
            <dt className={statDtClass}>{icons.length.toString().padStart(2, '0')}</dt>
            <dd className={statDdClass}><T k="iconsCountLabel" /></dd>
          </div>
          <div className={statClass}>
            <dt className={statDtClass}>{categories.length.toString().padStart(2, '0')}</dt>
            <dd className={statDdClass}><T k="sectionsCountLabel" /></dd>
          </div>
          <div className={statClass}>
            <dt className={statDtClass}>QR</dt>
            <dd className={statDdClass}><T k="qrPrayersLivesLabel" /></dd>
          </div>
        </dl>
      </section>
      <IconsCatalog icons={icons} />
      <section className="border-t border-gold/28 pt-[clamp(22px,3vw,42px)] max-[900px]:mt-7 max-[900px]:pt-[22px]">
        <h2><T k="iconsSeoTitle" /></h2>
        <p className="text-muted-foreground leading-[1.5]"><T k="iconsSeoText" /></p>
      </section>
    </Page>
  );
}
