import Link from 'next/link';

export function ChurchSection() {
  return (
    <section className="church-section">
      <div>
        <p className="eyebrow">Для храмов</p>
        <h2>QR-страницы для икон, расписания и материалов прихода</h2>
      </div>
      <p>Можно создать страницы храмовых икон, добавить молитвы, расписание, ссылки на пожертвования и духовные тексты для прихожан.</p>
      <Link href="/churches">Открыть раздел</Link>
    </section>
  );
}
