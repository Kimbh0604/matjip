import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const { Pool } = pg;
const csvPath = process.argv[2] || 'data/naver-matjip-seoul.csv';

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let inQuotes = false;

  const normalizedText = text.replace(/^\uFEFF/, '');

  for (let index = 0; index < normalizedText.length; index += 1) {
    const char = normalizedText[index];
    const nextChar = normalizedText[index + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(value);
      value = '';
    } else if (char === '\n') {
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else if (char !== '\r') {
      value += char;
    }
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  const [headers, ...dataRows] = rows.filter((currentRow) => currentRow.some((cell) => cell !== ''));
  return dataRows.map((currentRow) =>
    Object.fromEntries(headers.map((header, index) => [header, currentRow[index] ?? '']))
  );
}

function nullableText(value) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function nullableNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toBoolean(value) {
  return String(value).toLowerCase() === 'true';
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function importCsv() {
  const csv = await readFile(csvPath, 'utf8');
  const rows = parseCsv(csv);
  let imported = 0;

  for (const row of rows) {
    if (!nullableText(row.name) || !nullableText(row.address)) continue;

    await pool.query(
      `
        insert into "defaultMatjip" (
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
          source
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        on conflict (name, address) do update set
          food_category = excluded.food_category,
          operating_hours = excluded.operating_hours,
          phone_number = excluded.phone_number,
          catch_table_reservable = excluded.catch_table_reservable,
          latitude = excluded.latitude,
          longitude = excluded.longitude,
          naver_category = excluded.naver_category,
          naver_place_id = excluded.naver_place_id,
          naver_link = excluded.naver_link,
          memo = excluded.memo,
          source = excluded.source,
          updated_at = now()
      `,
      [
        nullableText(row.name),
        nullableText(row.food_category) ?? '레스토랑',
        nullableText(row.address),
        nullableText(row.operating_hours),
        nullableText(row.phone_number),
        toBoolean(row.catch_table_reservable),
        nullableNumber(row.latitude),
        nullableNumber(row.longitude),
        nullableText(row.naver_category),
        nullableText(row.naver_place_id),
        nullableText(row.naver_link),
        nullableText(row.memo),
        nullableText(row.source)
      ]
    );

    imported += 1;
  }

  console.log(`Imported ${imported}/${rows.length} rows from ${csvPath}`);
}

importCsv()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
