import useHomeMap from './useHomeMap.js';

export default function HomePage({ Topbar }) {
  const {
    SEARCH_RADIUS_KM,
    mapRef,
    status,
    position,
    userLocation,
    restaurants,
    selectedRestaurant,
    setSelectedRestaurant,
    isLoadingRestaurants,
    searchQuery,
    setSearchQuery,
    isSearching,
    handleSearchSubmit,
    handleReturnToMyLocation
  } = useHomeMap();

  return (
    <main className="app-shell">
      <Topbar />

      <aside className="sidebar" aria-label="주변 맛집 목록">
        <div className="sidebar-header">
          <div className="sidebar-title">
            <span>주변 탐색</span>
            <strong>내 주변 맛집</strong>
          </div>
          <span className="location-chip" aria-live="polite">
            {position ? `${SEARCH_RADIUS_KM}km 반경` : '위치 확인'}
          </span>
        </div>

        <form className="search-panel" aria-label="위치 검색" onSubmit={handleSearchSubmit}>
          <label htmlFor="search">지역명 또는 지하철역</label>
          <div className="search-row">
            <input
              id="search"
              type="search"
              placeholder="예: 성수동, 강남역, 잠실역"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <button type="submit" disabled={isSearching}>
              {isSearching ? '검색 중' : '검색'}
            </button>
          </div>
        </form>

        <section className="nearby-section">
          <div className="nearby-title">
            <div>
              <p>Near by</p>
              <h1>내 주변 식당</h1>
            </div>
            <strong>{restaurants.length}</strong>
          </div>

          <p className="status-text">{isLoadingRestaurants ? '식당을 불러오는 중입니다.' : status}</p>

          {selectedRestaurant && (
            <article className="restaurant-detail" aria-label="선택한 식당 상세 정보">
              <div className="restaurant-detail-header">
                <div>
                  <span>{selectedRestaurant.food_category}</span>
                  <h2>{selectedRestaurant.name}</h2>
                </div>
                <button type="button" onClick={() => setSelectedRestaurant(null)}>
                  닫기
                </button>
              </div>

              <dl>
                <div>
                  <dt>주소</dt>
                  <dd>{selectedRestaurant.address}</dd>
                </div>
                <div>
                  <dt>거리</dt>
                  <dd>{Number(selectedRestaurant.distance_km).toFixed(2)}km</dd>
                </div>
                <div>
                  <dt>전화번호</dt>
                  <dd>{selectedRestaurant.phone_number || '정보 없음'}</dd>
                </div>
                <div>
                  <dt>예약</dt>
                  <dd>{selectedRestaurant.catch_table_reservable ? '캐치테이블 가능' : '미지원'}</dd>
                </div>
                <div>
                  <dt>메모</dt>
                  <dd>{selectedRestaurant.memo || '저장된 메모가 없습니다.'}</dd>
                </div>
              </dl>

              {selectedRestaurant.naver_link && (
                <a href={selectedRestaurant.naver_link} target="_blank" rel="noreferrer">
                  네이버 지도에서 보기
                </a>
              )}
            </article>
          )}

          <div className="restaurant-list">
            {!isLoadingRestaurants && restaurants.length === 0 ? (
              <div className="empty-state">
                <strong>아직 표시할 식당이 없습니다.</strong>
                <span>
                  좌표가 저장된 맛집 데이터가 생기면 이곳에 {SEARCH_RADIUS_KM}km 이내 식당이
                  표시됩니다.
                </span>
              </div>
            ) : (
              restaurants.map((restaurant) => (
                <article
                  className={`restaurant-card ${
                    selectedRestaurant?.id === restaurant.id ? 'is-selected' : ''
                  }`}
                  key={restaurant.id}
                >
                  <div>
                    <button type="button" onClick={() => setSelectedRestaurant(restaurant)}>
                      {restaurant.name}
                    </button>
                    <span>{restaurant.food_category}</span>
                  </div>
                  <p>{restaurant.address}</p>
                  <dl>
                    <div>
                      <dt>거리</dt>
                      <dd>{Number(restaurant.distance_km).toFixed(2)}km</dd>
                    </div>
                    <div>
                      <dt>예약</dt>
                      <dd>{restaurant.catch_table_reservable ? '가능' : '미지원'}</dd>
                    </div>
                  </dl>
                </article>
              ))
            )}
          </div>
        </section>
      </aside>

      <section className="map-stage" aria-label="내 위치 지도">
        <div ref={mapRef} className="map" />
        <button
          className="return-location-button"
          type="button"
          onClick={handleReturnToMyLocation}
          disabled={!userLocation}
        >
          내 위치로 돌아가기
        </button>
      </section>
    </main>
  );
}
