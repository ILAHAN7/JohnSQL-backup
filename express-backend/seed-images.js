/**
 * seed-images.js
 *
 * image_urls가 비어있는 market_items에 Pexels 이미지를 자동으로 채워줍니다.
 *
 * 사용법:
 *   1. https://www.pexels.com/api/ 에서 무료 API 키 발급 (30초)
 *   2. .env 파일에 PEXELS_API_KEY=your_key_here 추가
 *   3. node seed-images.js
 *
 * 옵션:
 *   --dry-run   : DB 업데이트 없이 결과만 미리 확인
 *   --limit=N   : 최대 N개 아이템만 처리 (기본값: 전체)
 */

'use strict';

require('dotenv').config();
const mysql = require('mysql2/promise');
const https = require('https');

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const DRY_RUN  = process.argv.includes('--dry-run');
const LIMIT    = (() => {
    const arg = process.argv.find(a => a.startsWith('--limit='));
    return arg ? parseInt(arg.split('=')[1]) : Infinity;
})();

// ─── 아이템명 → 더 나은 검색어 정규화 ────────────────────────────────────────
const KEYWORD_MAP = [
    // 더 구체적인 패턴을 먼저 배치 (substring 충돌 방지)
    [/macbook|laptop|notebook/i,             'laptop computer'],
    [/airpods|headphone|earphone|headset/i,  'headphones'],   // ← phone보다 먼저
    [/iphone|galaxy|android|smartphone/i,    'smartphone'],
    [/ipad|tablet/i,                         'tablet device'],
    [/textbook|book/i,                       'textbook stack'],
    [/lamp|light|lighting/i,                 'desk lamp'],
    [/desk|table/i,                          'desk furniture'],
    [/chair/i,                               'chair furniture'],
    [/microwave|oven/i,                      'microwave kitchen'],
    [/fridge|refrigerator/i,                 'refrigerator'],
    [/bike|bicycle/i,                        'bicycle'],
    [/monitor|screen/i,                      'computer monitor'],
    [/keyboard/i,                            'mechanical keyboard'],
    [/mouse/i,                               'computer mouse'],
    [/backpack|bag/i,                        'backpack'],
    [/jacket|coat|hoodie|sweatshirt/i,       'hoodie clothing'],
    [/shoes|sneaker|boot/i,                  'sneakers shoes'],
    [/printer/i,                             'printer office'],
    [/camera/i,                              'camera photography'],
    [/guitar|piano|violin|instrument/i,      'musical instrument'],
    [/couch|sofa/i,                          'sofa couch'],
    [/mattress|bed/i,                        'mattress bed'],
    [/ps5|ps4|xbox|playstation|nintendo/i,   'gaming console'],
    [/calculator/i,                          'scientific calculator'],
    [/coffee maker|keurig|espresso/i,        'coffee maker'],
    [/cable|charger|adapter/i,               'cable electronics'],
    [/phone/i,                               'smartphone'],     // ← 일반 phone은 마지막
];

function normalizeKeyword(itemName) {
    for (const [pattern, replacement] of KEYWORD_MAP) {
        if (pattern.test(itemName)) return replacement;
    }
    // 괄호·숫자·특수문자 제거 후 첫 3단어만 사용
    return itemName
        .replace(/\(.*?\)/g, '')
        .replace(/[^\w\s]/g, '')
        .trim()
        .split(/\s+/)
        .slice(0, 3)
        .join(' ');
}

// ─── Pexels 이미지 검색 ───────────────────────────────────────────────────────
function fetchPexelsImage(query) {
    return new Promise((resolve, reject) => {
        const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=square`;
        https.get(url, { headers: { Authorization: PEXELS_API_KEY } }, (res) => {
            let raw = '';
            res.on('data', chunk => (raw += chunk));
            res.on('end', () => {
                try {
                    const data = JSON.parse(raw);
                    const photo = data.photos?.[0];
                    resolve(photo ? photo.src.medium : null);
                } catch {
                    resolve(null);
                }
            });
        }).on('error', reject);
    });
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
    if (!PEXELS_API_KEY) {
        console.error('❌  PEXELS_API_KEY가 .env에 없습니다.');
        console.error('   https://www.pexels.com/api/ 에서 무료 발급 후 .env에 추가하세요.');
        process.exit(1);
    }

    console.log(`🔍  이미지 없는 아이템 조회 중...`);
    if (DRY_RUN)  console.log('⚠️   DRY RUN 모드 — DB는 변경되지 않습니다.');

    const pool = mysql.createPool({
        host:     process.env.DB_HOST     || 'localhost',
        port:     parseInt(process.env.DB_PORT || '3306', 10),
        user:     process.env.DB_USER     || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME     || 'uiuc_flea_market',
    });

    let [items] = await pool.execute(
        `SELECT mi.id, mi.name, mi.image_urls, mp.title AS post_title
         FROM market_items mi
         JOIN market_posts mp ON mi.post_id = mp.id
         WHERE mi.image_urls IS NULL
            OR JSON_LENGTH(mi.image_urls) = 0
            OR mi.image_urls = '[]'
         ORDER BY mi.id ASC`
    );

    if (LIMIT < Infinity) items = items.slice(0, LIMIT);

    if (items.length === 0) {
        console.log('✅  모든 아이템에 이미지가 있습니다!');
        await pool.end();
        return;
    }

    console.log(`📦  처리할 아이템: ${items.length}개\n`);

    let updated = 0, skipped = 0;

    for (const item of items) {
        const keyword = normalizeKeyword(item.name);
        process.stdout.write(`[${item.id}] "${item.name}" → 검색어: "${keyword}" ... `);

        try {
            const imageUrl = await fetchPexelsImage(keyword);

            if (!imageUrl) {
                console.log('이미지 없음 (건너뜀)');
                skipped++;
            } else if (DRY_RUN) {
                console.log(`\n       → ${imageUrl}`);
                updated++;
            } else {
                await pool.execute(
                    'UPDATE market_items SET image_urls = ? WHERE id = ?',
                    [JSON.stringify([imageUrl]), item.id]
                );
                console.log(`✓`);
                updated++;
            }
        } catch (err) {
            console.log(`❌ 오류: ${err.message}`);
            skipped++;
        }

        // Pexels 무료 티어: 200 req/min → 300ms 간격
        await new Promise(r => setTimeout(r, 300));
    }

    console.log(`\n─────────────────────────────`);
    console.log(`✅  완료: ${updated}개 업데이트, ${skipped}개 건너뜀`);

    await pool.end();
}

main().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
});
