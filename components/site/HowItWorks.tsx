const steps = [
  ['01', 'Икона в киоте', 'QR-код аккуратно скрыт в выдвижном элементе и не нарушает внешний вид.'],
  ['02', 'Сканирование', 'Человек открывает страницу конкретной иконы с молитвой и материалами.'],
  ['03', 'Духовное чтение', 'Молитва, Евангелие дня, житие и история доступны с телефона.']
];

export function HowItWorks() {
  return (
    <section className="section">
      <div className="section-head">
        <p className="eyebrow">Как это работает</p>
        <h2>Тихая цифровая поддержка рядом с иконой</h2>
      </div>
      <div className="feature-grid">
        {steps.map(([index, title, text]) => <article key={index}><span>{index}</span><h3>{title}</h3><p>{text}</p></article>)}
      </div>
    </section>
  );
}
