export default function AgeGate({ onConfirm }) {
  return (
    <div className="screen gate">
      <div className="gate-icon">18+</div>
      <h2>Только для совершеннолетних</h2>
      <p className="muted">
        Товары предназначены для лиц старше 18 лет. Курение вредит вашему здоровью.
      </p>
      <button className="primary" onClick={onConfirm}>Мне есть 18 лет</button>
      <button className="link" onClick={() => window.Telegram?.WebApp?.close()}>Выйти</button>
    </div>
  )
}
