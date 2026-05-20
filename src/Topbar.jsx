export default function Topbar() {
  return (
    <header className="topbar" aria-label="상단 내비게이션">
      <a className="topbar-brand" href="/" aria-label="Matjip 홈">
        <span className="brand-mark">M</span>
        <span>Matjip</span>
      </a>
      <nav className="topbar-nav" aria-label="페이지 이동">
        <a href="/report">맛집 제보</a>
        <a href="/menu">오늘 메뉴 정하기</a>
      </nav>
    </header>
  );
}
