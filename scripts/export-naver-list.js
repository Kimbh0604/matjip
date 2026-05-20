import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DEFAULT_LINK = 'https://naver.me/FSwAkadO';
const inputUrl = process.argv[2] || DEFAULT_LINK;
const outputArgIndex = process.argv.indexOf('--out');
const outputPath =
  outputArgIndex >= 0 && process.argv[outputArgIndex + 1]
    ? process.argv[outputArgIndex + 1]
    : null;

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).replace(/\r?\n/g, ' ').trim();
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function extractShareId(url) {
  const match = url.match(/\/folder\/([a-f0-9]+)/i) || url.match(/shares\/([a-f0-9]+)/i);
  return match?.[1] ?? null;
}

function normalizeNaverPlaceUrl(placeId) {
  return placeId ? `https://map.naver.com/p/entry/place/${placeId}` : '';
}

function getBroadFoodCategory(...values) {
  const text = values.filter(Boolean).join(' ');

  if (/카페|커피|디저트|베이커리|빵|케이크/.test(text)) return '카페';
  if (/바|BAR|술집|와인|맥주|호프|이자카야|포차/.test(text)) return '술집';
  if (/중식|중국|짜장|짬뽕|마라|양꼬치|훠궈|딤섬/.test(text)) return '중식';
  if (/일식|라멘|라면|스시|초밥|돈카츠|돈까스|카츠|소바|우동|덮밥/.test(text)) return '일식';
  if (/양식|파스타|피자|스테이크|프렌치|이탈리아|브런치|버거/.test(text)) return '양식';
  if (/한식|국밥|곰탕|설렁탕|칼국수|냉면|보쌈|족발|고기|갈비|불고기|구이|백반|분식/.test(text)) {
    return '한식';
  }

  return '레스토랑';
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.3,en;q=0.2',
      Referer: 'https://map.naver.com/',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36'
    },
    redirect: 'follow'
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) ${url}`);
  }

  return response.json();
}

async function resolveShareId(url) {
  const directShareId = extractShareId(url);
  if (directShareId) return directShareId;

  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.3,en;q=0.2',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36'
    }
  });

  const shareId = extractShareId(response.url);
  if (!shareId) {
    throw new Error(`Could not find shareId from ${url}`);
  }

  return shareId;
}

async function fetchPlaceDetail(placeId) {
  if (!placeId) return null;

  try {
    const data = await fetchJson(
      `https://pages.map.naver.com/save-pages/api/place/place-detail?placeId=${encodeURIComponent(
        placeId
      )}&lang=ko`
    );
    return data?.data?.placeDetail ?? null;
  } catch {
    return null;
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function toRow(bookmark, detail, folderName) {
  const detailCategory = detail?.category?.category ?? '';
  const phoneNumber = detail?.phoneInfo?.phone ?? '';
  const address = detail?.address?.roadAddress || detail?.address?.address || bookmark.address || '';
  const naverCategory = detailCategory || bookmark.mcidName || '';

  return {
    name: bookmark.name,
    food_category: getBroadFoodCategory(detailCategory, bookmark.mcidName, bookmark.name, bookmark.memo),
    naver_category: naverCategory,
    address,
    operating_hours: '',
    phone_number: phoneNumber,
    catch_table_reservable: false,
    latitude: bookmark.py,
    longitude: bookmark.px,
    naver_place_id: bookmark.sid,
    naver_link: normalizeNaverPlaceUrl(bookmark.sid),
    memo: bookmark.memo ?? '',
    source: `naver_shared_folder:${folderName}`
  };
}

async function main() {
  const shareId = await resolveShareId(inputUrl);
  const shared = await fetchJson(
    `https://pages.map.naver.com/save-pages/api/maps-bookmark/v3/shares/${shareId}/bookmarks`
  );
  const folderName = shared.folder?.name ?? shareId;
  const bookmarks = shared.bookmarkList ?? [];

  console.log(`Folder: ${folderName}`);
  console.log(`Places: ${bookmarks.length}`);

  const rows = await mapWithConcurrency(bookmarks, 6, async (bookmark, index) => {
    if ((index + 1) % 50 === 0 || index === bookmarks.length - 1) {
      console.log(`Enriching details: ${index + 1}/${bookmarks.length}`);
    }

    const detail = await fetchPlaceDetail(bookmark.sid);
    return toRow(bookmark, detail, folderName);
  });

  const headers = [
    'name',
    'food_category',
    'naver_category',
    'address',
    'operating_hours',
    'phone_number',
    'catch_table_reservable',
    'latitude',
    'longitude',
    'naver_place_id',
    'naver_link',
    'memo',
    'source'
  ];
  const csv = [headers.join(','), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(','))]
    .join('\n');

  await mkdir('data', { recursive: true });
  const safeFolderName = folderName.replace(/[\\/:*?"<>|]/g, '_');
  const filePath = outputPath ?? join('data', `${safeFolderName}-${shareId.slice(0, 8)}.csv`);
  await writeFile(filePath, `\uFEFF${csv}\n`, 'utf8');

  console.log(`CSV written: ${filePath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
