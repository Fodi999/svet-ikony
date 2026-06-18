export function QRIconDemo() {
  return (
    <div className="qr-demo" aria-label="Икона с QR-кодом">
      <div className="kiot">
        <div className="icon-face">
          <span className="halo" />
          <strong>IC XC</strong>
          <small>Образ в киоте</small>
        </div>
        <div className="qr-drawer">
          <img src="/images/qr-code.svg" alt="QR-код страницы иконы" />
          <span>сканировать</span>
        </div>
      </div>
    </div>
  );
}
