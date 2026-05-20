import useMenuGame from './useMenuGame.js';

export default function MenuPage({ Topbar }) {
  const {
    SEARCH_RADIUS_KM,
    gameRef,
    status,
    excludedText,
    setExcludedText,
    winner,
    isLoading,
    isPlaying,
    candidates,
    filteredRestaurants,
    loadCandidates,
    startGame
  } = useMenuGame();

  return (
    <main className="page-shell">
      <Topbar />

      <section className="menu-page" aria-label="오늘 메뉴 정하기">
        <div className="menu-controls">
          <div className="menu-copy">
            <p>오늘 메뉴 정하기</p>
            <h1>먹기 싫은 메뉴를 빼고 공에게 맡겨보세요</h1>
            <span>
              내 위치 반경 {SEARCH_RADIUS_KM}km 안의 저장된 맛집에서 제외 조건을 반영한 뒤,
              공이 떨어진 구간의 식당을 오늘의 메뉴로 정합니다.
            </span>
          </div>

          <label className="exclude-field">
            못 먹는 음식 / 먹기 싫은 메뉴
            <textarea
              value={excludedText}
              onChange={(event) => setExcludedText(event.target.value)}
              placeholder="예: 라멘, 곱창, 매운, 카페"
              rows="4"
            />
            <span>쉼표로 구분해서 입력하세요.</span>
          </label>

          <div className="menu-actions">
            <button type="button" onClick={loadCandidates} disabled={isLoading || isPlaying}>
              {isLoading ? '불러오는 중' : '내 주변 후보 불러오기'}
            </button>
            <button type="button" onClick={startGame} disabled={candidates.length < 2 || isPlaying}>
              {isPlaying ? '진행 중' : '게임 시작'}
            </button>
          </div>

          <p className="menu-status">
            {status}
            {filteredRestaurants.length > 0 && ` 후보 ${filteredRestaurants.length}개로 게임합니다.`}
          </p>

          {winner && (
            <article className="winner-card">
              <span>오늘의 선택</span>
              <h2>{winner.name}</h2>
              <p>{winner.address}</p>
              <strong>{winner.food_category}</strong>
              {winner.naver_link && (
                <a href={winner.naver_link} target="_blank" rel="noreferrer">
                  네이버 지도에서 보기
                </a>
              )}
            </article>
          )}
        </div>

        <div className="menu-game-area">
          <div className="candidate-strip" aria-label="게임 후보">
            {candidates.length === 0 ? (
              <span>후보를 불러오면 식당별 공이 동시에 떨어집니다.</span>
            ) : (
              candidates.map((candidate, index) => (
                <span key={candidate.id}>
                  {index + 1}. {candidate.name}
                </span>
              ))
            )}
          </div>
          <div className="roulette-board" ref={gameRef} />
        </div>
      </section>
    </main>
  );
}
