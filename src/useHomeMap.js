import { useEffect, useRef, useState } from 'react';

const DEFAULT_CENTER = { lat: 37.5666103, lng: 126.9783882 };
const SEARCH_RADIUS_KM = 5;

function createCurrentLocationMarkerHtml() {
  return `
    <div class="current-marker" aria-label="내 위치">
      <span class="current-marker__pulse"></span>
      <span class="current-marker__dot"></span>
    </div>
  `;
}

function createRestaurantMarkerHtml() {
  return `
    <div class="restaurant-marker" aria-label="식당 위치">
      <span class="restaurant-marker__icon">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M7 2v8" />
          <path d="M4.5 2v8" />
          <path d="M9.5 2v8" />
          <path d="M4.5 10h5" />
          <path d="M7 10v12" />
          <path d="M17 2c-2 2.2-3 4.8-3 7.7V13h4v9" />
        </svg>
      </span>
      <span class="restaurant-marker__tail"></span>
    </div>
  `;
}

function loadNaverMap(clientId) {
  if (!clientId) {
    return Promise.reject(new Error('VITE_NAVER_MAP_CLIENT_ID가 설정되지 않았습니다.'));
  }

  if (window.naver?.maps) {
    return Promise.resolve(window.naver.maps);
  }

  const existingScript = document.querySelector('script[data-naver-map]');
  if (existingScript) {
    return new Promise((resolve, reject) => {
      existingScript.addEventListener('load', () => resolve(window.naver.maps), { once: true });
      existingScript.addEventListener('error', reject, { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${clientId}&submodules=geocoder`;
    script.async = true;
    script.defer = true;
    script.dataset.naverMap = 'true';
    script.addEventListener('load', () => resolve(window.naver.maps), { once: true });
    script.addEventListener('error', () => reject(new Error('네이버 지도 스크립트를 불러오지 못했습니다.')), {
      once: true
    });
    document.head.appendChild(script);
  });
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('이 브라우저는 위치 서비스를 지원하지 않습니다.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    });
  });
}

export { SEARCH_RADIUS_KM };

export default function useHomeMap() {
  const mapRef = useRef(null);
  const naverMapRef = useRef(null);
  const currentMarkerRef = useRef(null);
  const radiusCircleRef = useRef(null);
  const restaurantMarkersRef = useRef([]);
  const [status, setStatus] = useState('위치 권한을 확인하고 있어요.');
  const [position, setPosition] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [restaurants, setRestaurants] = useState([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [isLoadingRestaurants, setIsLoadingRestaurants] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const clientId = import.meta.env.VITE_NAVER_MAP_CLIENT_ID;

  useEffect(() => {
    let isMounted = true;

    async function initializeMap() {
      try {
        const maps = await loadNaverMap(clientId);
        const geoPosition = await getCurrentPosition();

        if (!isMounted) return;

        const current = {
          lat: geoPosition.coords.latitude,
          lng: geoPosition.coords.longitude
        };
        const center = new maps.LatLng(current.lat, current.lng);
        const map = new maps.Map(mapRef.current, {
          center,
          zoom: 16,
          minZoom: 7,
          scaleControl: true,
          logoControl: true,
          mapDataControl: true,
          zoomControl: false
        });

        naverMapRef.current = map;
        currentMarkerRef.current = new maps.Marker({
          position: center,
          map,
          title: '내 위치',
          icon: {
            content: createCurrentLocationMarkerHtml(),
            size: new maps.Size(44, 44),
            anchor: new maps.Point(22, 22)
          }
        });
        radiusCircleRef.current = new maps.Circle({
          map,
          center,
          radius: SEARCH_RADIUS_KM * 1000,
          strokeColor: '#123c2d',
          strokeOpacity: 0.2,
          strokeWeight: 1,
          fillColor: '#0f7b55',
          fillOpacity: 0.06
        });

        setPosition(current);
        setUserLocation(current);
        setStatus(`현재 위치 기준 ${SEARCH_RADIUS_KM}km 반경을 표시했습니다.`);
      } catch (error) {
        if (!isMounted) return;

        setStatus(error.message || '현재 위치를 가져오지 못했습니다.');

        try {
          const maps = await loadNaverMap(clientId);
          const fallbackCenter = new maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng);
          naverMapRef.current = new maps.Map(mapRef.current, {
            center: fallbackCenter,
            zoom: 13,
            zoomControl: false
          });
        } catch {
          // The status above already points to the actionable setup issue.
        }
      }
    }

    initializeMap();

    return () => {
      isMounted = false;
      currentMarkerRef.current?.setMap(null);
      radiusCircleRef.current?.setMap(null);
      restaurantMarkersRef.current.forEach((marker) => marker.setMap(null));
      currentMarkerRef.current = null;
      radiusCircleRef.current = null;
      restaurantMarkersRef.current = [];
    };
  }, [clientId]);

  useEffect(() => {
    if (!position) return;

    let isMounted = true;

    async function loadNearbyRestaurants() {
      setIsLoadingRestaurants(true);

      try {
        const params = new URLSearchParams({
          lat: String(position.lat),
          lng: String(position.lng),
          radiusKm: String(SEARCH_RADIUS_KM)
        });
        const response = await fetch(`/api/matjip/nearby?${params.toString()}`);

        if (!response.ok) {
          throw new Error('주변 식당 정보를 불러오지 못했습니다.');
        }

        const data = await response.json();

        if (isMounted) {
          const nextRestaurants = data.restaurants ?? [];
          setRestaurants(nextRestaurants);
          setSelectedRestaurant((current) =>
            current && nextRestaurants.some((restaurant) => restaurant.id === current.id) ? current : null
          );
        }
      } catch (error) {
        if (isMounted) {
          setStatus(error.message);
          setRestaurants([]);
        }
      } finally {
        if (isMounted) {
          setIsLoadingRestaurants(false);
        }
      }
    }

    loadNearbyRestaurants();

    return () => {
      isMounted = false;
    };
  }, [position]);

  useEffect(() => {
    if (!window.naver?.maps || !naverMapRef.current) return;

    const maps = window.naver.maps;
    const restaurantsWithCoordinates = restaurants.filter(
      (restaurant) => restaurant.latitude && restaurant.longitude
    );

    restaurantMarkersRef.current.forEach((marker) => marker.setMap(null));
    restaurantMarkersRef.current = restaurantsWithCoordinates
      .map(
        (restaurant) =>
          new maps.Marker({
            position: new maps.LatLng(Number(restaurant.latitude), Number(restaurant.longitude)),
            map: naverMapRef.current,
            title: restaurant.name,
            icon: {
              content: createRestaurantMarkerHtml(),
              size: new maps.Size(42, 48),
              anchor: new maps.Point(21, 46)
            }
          })
      )
      .map((marker, index) => {
        maps.Event.addListener(marker, 'click', () => {
          setSelectedRestaurant(restaurantsWithCoordinates[index]);
        });

        return marker;
      });
  }, [restaurants]);

  async function handleSearchSubmit(event) {
    event.preventDefault();

    const query = searchQuery.trim();
    if (!query) return;

    try {
      setIsSearching(true);
      setStatus(`"${query}" 위치를 검색하고 있습니다.`);

      const maps = await loadNaverMap(clientId);
      const response = await fetch(`/api/locations/search?query=${encodeURIComponent(query)}`);

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || '검색 위치를 찾지 못했습니다.');
      }

      const data = await response.json();
      const result = data.location;
      const nextCenter = new maps.LatLng(result.lat, result.lng);

      if (!naverMapRef.current) {
        naverMapRef.current = new maps.Map(mapRef.current, {
          center: nextCenter,
          zoom: 16,
          minZoom: 7,
          scaleControl: true,
          logoControl: true,
          mapDataControl: true,
          zoomControl: false
        });
      }

      if (typeof naverMapRef.current.morph === 'function') {
        naverMapRef.current.morph(nextCenter, 16);
      } else {
        naverMapRef.current.setZoom(16);
        naverMapRef.current.setCenter(nextCenter);
      }

      if (currentMarkerRef.current) {
        currentMarkerRef.current.setPosition(nextCenter);
      } else {
        currentMarkerRef.current = new maps.Marker({
          position: nextCenter,
          map: naverMapRef.current,
          title: '검색 위치',
          icon: {
            content: createCurrentLocationMarkerHtml(),
            size: new maps.Size(44, 44),
            anchor: new maps.Point(22, 22)
          }
        });
      }

      if (radiusCircleRef.current) {
        radiusCircleRef.current.setCenter(nextCenter);
      } else {
        radiusCircleRef.current = new maps.Circle({
          map: naverMapRef.current,
          center: nextCenter,
          radius: SEARCH_RADIUS_KM * 1000,
          strokeColor: '#123c2d',
          strokeOpacity: 0.2,
          strokeWeight: 1,
          fillColor: '#0f7b55',
          fillOpacity: 0.06
        });
      }

      setPosition({ lat: result.lat, lng: result.lng });
      setSelectedRestaurant(null);
      setStatus(`${result.label} 기준 ${SEARCH_RADIUS_KM}km 반경을 표시했습니다.`);
    } catch (error) {
      setStatus(error.message || '위치 검색에 실패했습니다.');
    } finally {
      setIsSearching(false);
    }
  }

  async function handleReturnToMyLocation() {
    if (!userLocation) {
      setStatus('저장된 내 위치가 없습니다. 브라우저 위치 권한을 확인해주세요.');
      return;
    }

    try {
      const maps = await loadNaverMap(clientId);
      const nextCenter = new maps.LatLng(userLocation.lat, userLocation.lng);

      if (!naverMapRef.current) {
        naverMapRef.current = new maps.Map(mapRef.current, {
          center: nextCenter,
          zoom: 16,
          minZoom: 7,
          scaleControl: true,
          logoControl: true,
          mapDataControl: true,
          zoomControl: false
        });
      }

      if (typeof naverMapRef.current.morph === 'function') {
        naverMapRef.current.morph(nextCenter, 16);
      } else {
        naverMapRef.current.setZoom(16);
        naverMapRef.current.setCenter(nextCenter);
      }

      currentMarkerRef.current?.setPosition(nextCenter);
      radiusCircleRef.current?.setCenter(nextCenter);
      setPosition(userLocation);
      setSelectedRestaurant(null);
      setStatus(`내 위치 기준 ${SEARCH_RADIUS_KM}km 반경으로 돌아왔습니다.`);
    } catch (error) {
      setStatus(error.message || '내 위치로 돌아오지 못했습니다.');
    }
  }

  return {
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
  };
}
