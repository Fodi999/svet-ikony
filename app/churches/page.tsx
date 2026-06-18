import { publicApi } from '@/lib/api';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({ title: 'QR-иконы для храмов', description: 'Страницы икон, молитв, расписания и пожертвований для храмов.', path: '/churches' });

export default async function ChurchesPage() {
  const churches = await publicApi.churches();
  return <main className="page"><section className="page-hero"><p className="eyebrow">Для храмов</p><h1>QR-иконы и духовные материалы для прихода</h1><p>Интерактивные страницы помогают прихожанам читать молитвы, жития, расписание и материалы без лишней печати.</p></section><div className="feature-grid"><article><h3>Иконы</h3><p>Отдельная страница для каждого образа.</p></article><article><h3>Расписание</h3><p>Информация для прихожан и паломников.</p></article><article><h3>Пожертвования</h3><p>Ссылка на официальный способ поддержки храма.</p></article></div><form className="lead-form"><input placeholder="Название храма" /><input placeholder="Город" /><textarea placeholder="Что нужно подключить" /><button>Отправить заявку</button></form>{churches.map((church) => <section className="seo-text" key={church.id}><h2>{church.title}</h2><p>{church.description}</p></section>)}</main>;
}
