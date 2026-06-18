const features = ['Страницы икон', 'Молитвы', 'Святые', 'Евангелие дня', 'QR-страницы', 'SEO-материалы'];

export function FeatureCards() {
  return (
    <section className="feature-band">
      {features.map((feature) => <span key={feature}>{feature}</span>)}
    </section>
  );
}
