import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const port = process.env.PORT || 4000;
const distDir = join(__dirname, '..', 'dist');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const naverMapClientId = process.env.NAVER_MAP_CLIENT_ID || process.env.VITE_NAVER_MAP_CLIENT_ID;
const naverMapClientSecret = process.env.NAVER_MAP_CLIENT_SECRET;
const reportToEmail = process.env.REPORT_TO_EMAIL;
const reportSaveDir = process.env.REPORT_SAVE_DIR || 'reports';
const resendApiKey = process.env.RESEND_API_KEY;
const reportFromEmail = process.env.REPORT_FROM_EMAIL || 'Matjip <onboarding@resend.dev>';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function createReportFileName(restaurantName) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeName = restaurantName
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40);

  return `${timestamp}-${safeName || 'matjip-report'}.txt`;
}

function createReportText(report) {
  return [
    'Matjip 맛집 제보',
    '',
    `접수 시간: ${report.createdAt}`,
    `식당 이름: ${report.restaurantName}`,
    `위치: ${report.location}`,
    `추천 메뉴: ${report.recommendedMenu}`,
    `제보자 이름: ${report.reporterName || '미입력'}`,
    `제보자 이메일: ${report.reporterEmail || '미입력'}`,
    '',
    '맛있었던 이유 / 추가 정보',
    report.reason || '미입력'
  ].join('\n');
}

async function sendReportEmail({ report, reportText }) {
  if (!resendApiKey) {
    throw new Error('RESEND_API_KEY가 설정되지 않았습니다.');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: reportFromEmail,
      to: [reportToEmail],
      reply_to: report.reporterEmail || undefined,
      subject: `[Matjip] 맛집 제보: ${report.restaurantName}`,
      text: reportText,
      html: `
        <h2>맛집 제보</h2>
        <p><strong>접수 시간:</strong> ${escapeHtml(report.createdAt)}</p>
        <p><strong>식당 이름:</strong> ${escapeHtml(report.restaurantName)}</p>
        <p><strong>위치:</strong> ${escapeHtml(report.location)}</p>
        <p><strong>추천 메뉴:</strong> ${escapeHtml(report.recommendedMenu)}</p>
        <p><strong>제보자 이름:</strong> ${escapeHtml(report.reporterName || '미입력')}</p>
        <p><strong>제보자 이메일:</strong> ${escapeHtml(report.reporterEmail || '미입력')}</p>
        <h3>맛있었던 이유 / 추가 정보</h3>
        <p>${escapeHtml(report.reason || '미입력').replace(/\n/g, '<br />')}</p>
      `
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || data.error || `Resend email failed with status ${response.status}`);
  }

  return data;
}

const fallbackLocations = new Map(
  [
    ['강남역', { lat: 37.497952, lng: 127.027619 }],
    ['강남', { lat: 37.497952, lng: 127.027619 }],
    ['잠실역', { lat: 37.513262, lng: 127.100159 }],
    ['잠실', { lat: 37.506072, lng: 127.083204 }],
    ['성수역', { lat: 37.544581, lng: 127.055961 }],
    ['성수', { lat: 37.544581, lng: 127.055961 }],
    ['홍대입구역', { lat: 37.557192, lng: 126.925381 }],
    ['홍대', { lat: 37.557192, lng: 126.925381 }],
    ['압구정역', { lat: 37.527072, lng: 127.028461 }],
    ['압구정', { lat: 37.527072, lng: 127.028461 }],
    ['압구정로데오역', { lat: 37.527381, lng: 127.040534 }],
    ['신사역', { lat: 37.516334, lng: 127.020114 }],
    ['신사', { lat: 37.516334, lng: 127.020114 }],
    ['서울역', { lat: 37.554648, lng: 126.972559 }],
    ['종로3가역', { lat: 37.570421, lng: 126.992144 }],
    ['종로', { lat: 37.57096, lng: 126.981439 }],
    ['종로구', { lat: 37.574698, lng: 126.979644 }],
    ['을지로입구역', { lat: 37.566014, lng: 126.982618 }]
  ].flatMap(([name, location]) => {
    const aliases = name.endsWith('역') ? [name, name.slice(0, -1)] : [name];
    return aliases.map((alias) => [alias, { ...location, label: name }]);
  })
);

function getLocationSearchCandidates(query) {
  const compactQuery = query.replace(/\s+/g, '');
  const candidates = [
    query,
    compactQuery,
    `${compactQuery}역`,
    `${compactQuery}동`,
    `${compactQuery}구`,
    `${compactQuery}로`,
    `서울 ${query}`,
    `서울 ${compactQuery}`,
    `서울 ${compactQuery}역`,
    `서울 ${compactQuery}동`,
    `서울 ${compactQuery}구`
  ];

  return [...new Set(candidates.filter(Boolean))];
}

async function geocodeLocation(query) {
  const searchUrl = new URL('https://maps.apigw.ntruss.com/map-geocode/v2/geocode');
  searchUrl.searchParams.set('query', query);

  const response = await fetch(searchUrl, {
    headers: {
      'X-NCP-APIGW-API-KEY-ID': naverMapClientId,
      'X-NCP-APIGW-API-KEY': naverMapClientSecret
    }
  });

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.errorMessage || data.message || '네이버 위치 검색에 실패했습니다.');
    error.status = response.status;
    throw error;
  }

  return data.addresses?.[0] ?? null;
}

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  const startedAt = Date.now();

  res.on('finish', () => {
    if (req.path.startsWith('/api') || res.statusCode >= 400) {
      const durationMs = Date.now() - startedAt;
      console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`);
    }
  });

  next();
});

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('select 1');
    res.json({ ok: true, database: 'connected' });
  } catch (error) {
    console.error('GET /api/health failed:', error);
    res.status(503).json({
      ok: false,
      database: 'unavailable',
      message: error.message
    });
  }
});

app.post('/api/reports', async (req, res) => {
  const restaurantName = String(req.body.restaurantName ?? '').trim();
  const location = String(req.body.location ?? '').trim();
  const recommendedMenu = String(req.body.recommendedMenu ?? '').trim();
  const reason = String(req.body.reason ?? '').trim();
  const reporterName = String(req.body.reporterName ?? '').trim();
  const reporterEmail = String(req.body.reporterEmail ?? '').trim();
  const createdAt = new Date().toISOString();

  if (!restaurantName || !location || !recommendedMenu) {
    res.status(400).json({ message: '식당 이름, 위치, 추천 메뉴는 필수입니다.' });
    return;
  }

  if (!reportToEmail) {
    res.status(500).json({ message: 'REPORT_TO_EMAIL이 설정되지 않았습니다.' });
    return;
  }

  if (!resendApiKey) {
    res.status(500).json({ message: 'RESEND_API_KEY? ???? ?????.' });
    return;
  }

  try {
    const report = {
      createdAt,
      restaurantName,
      location,
      recommendedMenu,
      reason,
      reporterName,
      reporterEmail
    };
    const reportText = createReportText(report);
    const reportFileName = createReportFileName(restaurantName);
    const reportFilePath = join(reportSaveDir, reportFileName);

    await mkdir(reportSaveDir, { recursive: true });
    await writeFile(reportFilePath, reportText, 'utf8');

    await sendReportEmail({ report, reportText });

    res.status(201).json({ ok: true, file: reportFilePath });
  } catch (error) {
    console.error('POST /api/reports failed:', error);
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/locations/search', async (req, res) => {
  const query = String(req.query.query ?? '').trim();

  if (!query) {
    res.status(400).json({ message: 'query parameter is required.' });
    return;
  }

  if (!naverMapClientId || !naverMapClientSecret) {
    res.status(500).json({
      message: 'NAVER_MAP_CLIENT_ID and NAVER_MAP_CLIENT_SECRET must be set on the server.'
    });
    return;
  }

  try {
    let matchedQuery = query;
    let address = null;

    for (const candidate of getLocationSearchCandidates(query)) {
      address = await geocodeLocation(candidate);

      if (address) {
        matchedQuery = candidate;
        break;
      }
    }

    if (!address) {
      const fallback = fallbackLocations.get(query.replace(/\s+/g, ''));

      if (!fallback) {
        res.status(404).json({ message: '검색 결과가 없습니다.' });
        return;
      }

      res.json({
        query,
        location: {
          lat: fallback.lat,
          lng: fallback.lng,
          label: fallback.label
        }
      });
      return;
    }

    res.json({
      query,
      matchedQuery,
      location: {
        lat: Number(address.y),
        lng: Number(address.x),
        label: address.roadAddress || address.jibunAddress || address.englishAddress || query
      }
    });
  } catch (error) {
    console.error('GET /api/locations/search failed:', error);
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/matjip/nearby', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radiusKm = Number(req.query.radiusKm ?? 1);
  const excludedFoodCategories = String(req.query.excludeFoodCategories ?? '')
    .split(',')
    .map((term) => term.trim())
    .filter(Boolean);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({ message: 'lat, lng query parameters are required.' });
    return;
  }

  if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 50) {
    res.status(400).json({ message: 'radiusKm must be greater than 0 and no more than 50.' });
    return;
  }

  try {
    const result = await pool.query(
      `
        select
          id,
          name,
          food_category,
          address,
          operating_hours,
          phone_number,
          catch_table_reservable,
          latitude,
          longitude,
          naver_category,
          naver_place_id,
          naver_link,
          memo,
          source,
          (
            6371 * acos(
              greatest(
                -1,
                least(
                  1,
                  cos(radians($1)) * cos(radians(latitude::double precision)) *
                  cos(radians(longitude::double precision) - radians($2)) +
                  sin(radians($1)) * sin(radians(latitude::double precision))
                )
              )
            )
          ) as distance_km
        from "defaultMatjip"
        where latitude is not null
          and longitude is not null
          and (
            cardinality($4::text[]) = 0
            or not exists (
              select 1
              from unnest($4::text[]) as excluded(term)
              where food_category ilike '%' || excluded.term || '%'
            )
          )
          and (
            6371 * acos(
              greatest(
                -1,
                least(
                  1,
                  cos(radians($1)) * cos(radians(latitude::double precision)) *
                  cos(radians(longitude::double precision) - radians($2)) +
                  sin(radians($1)) * sin(radians(latitude::double precision))
                )
              )
            )
          ) <= $3
        order by distance_km asc, name asc
      `,
      [lat, lng, radiusKm, excludedFoodCategories]
    );

    res.json({ radiusKm, excludedFoodCategories, restaurants: result.rows });
  } catch (error) {
    console.error('GET /api/matjip/nearby failed:', error);
    res.status(500).json({ message: error.message });
  }
});

app.use(express.static(distDir));

app.get('*', (_req, res) => {
  res.sendFile(join(distDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`Matjip API listening on http://localhost:${port}`);
});
