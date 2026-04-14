/**
 * One-time migration: listings → market_posts + market_items
 *
 * Run once:  node migrate-listings.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

const CATEGORY_MAP = {
    'Electronics':     'ELECTRONICS',
    'Furniture':       'FURNITURE',
    'Textbooks':       'TEXTBOOKS',
    'Clothing':        'CLOTHING',
    'Dorm Essentials': 'OTHER',
    'Music':           'OTHER',
    'Sports':          'OTHER',
    'Sports Equipment':'OTHER',
    'Tickets':         'OTHER',
    'Event Tickets':   'OTHER',
    'Other':           'OTHER',
};

const CONDITION_MAP = {
    'new':      'NEW',
    'like new': 'LIKE_NEW',
    'good':     'GOOD',
    'fair':     'FAIR',
    'poor':     'POOR',
};

async function run() {
    const conn = await mysql.createConnection({
        host:     process.env.DB_HOST,
        port:     parseInt(process.env.DB_PORT || '3306', 10),
        user:     process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    try {
        // 1. Fetch all listings with category name
        const [listings] = await conn.execute(`
            SELECT l.listing_id, l.seller_id, l.title, l.description,
                   l.price, l.\`condition\`, l.status, l.created_at,
                   c.category_name
            FROM listings l
            LEFT JOIN categories c ON l.category_id = c.category_id
            ORDER BY l.listing_id
        `);
        console.log(`Found ${listings.length} listings to migrate`);

        // 2. Check if migration already ran (posts already inserted)
        const [[{ postCount }]] = await conn.execute(
            'SELECT COUNT(*) as postCount FROM market_posts'
        );
        const postsAlreadyInserted = postCount >= listings.length;

        if (!postsAlreadyInserted) {
            await conn.execute('DELETE FROM market_items');
            await conn.execute('DELETE FROM market_posts');
            await conn.execute('ALTER TABLE market_posts AUTO_INCREMENT = 1');
            await conn.execute('ALTER TABLE market_items AUTO_INCREMENT = 1');
            console.log('Cleared existing market_posts / market_items');

            // Add temp column to track source
            await conn.execute(
                'ALTER TABLE market_posts ADD COLUMN _src_listing_id INT'
            );
        } else {
            console.log(`Posts already inserted (${postCount}), skipping post insert — doing items only`);
        }

        // 4. Batch insert market_posts (skip if already done)
        const postRows = listings.map(l => {
            const category = CATEGORY_MAP[l.category_name] || 'OTHER';
            const deletedAt = l.status === 'inactive' ? new Date() : null;
            return [
                l.title,
                l.description || '',
                '',          // contact_place — not in old schema
                'SELL',      // trade_type — all listings are selling
                l.seller_id,
                1,           // campus_id — UIUC
                category,
                l.created_at,
                deletedAt,
                l.listing_id,  // _src_listing_id
            ];
        });

        const CHUNK = 500;
        if (!postsAlreadyInserted) {
        for (let i = 0; i < postRows.length; i += CHUNK) {
            const chunk = postRows.slice(i, i + CHUNK);
            await conn.query(
                `INSERT INTO market_posts
                 (title, content, contact_place, trade_type, seller_id, campus_id,
                  category, created_at, deleted_at, _src_listing_id)
                 VALUES ?`,
                [chunk]
            );
            console.log(`  Inserted posts ${i + 1}–${Math.min(i + CHUNK, postRows.length)}`);
        }
        } // end if !postsAlreadyInserted

        // 5. Insert market_items by joining on _src_listing_id
        await conn.execute('DELETE FROM market_items');
        const [inserted] = await conn.execute(
            'SELECT id, _src_listing_id FROM market_posts'
        );
        const postMap = new Map(inserted.map(r => [r._src_listing_id, r.id]));

        const itemRows = listings.map(l => {
            const postId = postMap.get(l.listing_id);
            if (!postId) return null;
            const condition = CONDITION_MAP[l.condition] || 'GOOD';
            const status = l.status === 'sold' ? 'SOLD' : 'AVAILABLE';
            return [
                postId,
                l.title,           // item name = listing title
                parseFloat(l.price),
                l.description || '',
                condition,
                status,
                '[]',              // no images in old schema
            ];
        }).filter(Boolean);

        for (let i = 0; i < itemRows.length; i += CHUNK) {
            const chunk = itemRows.slice(i, i + CHUNK);
            await conn.query(
                `INSERT INTO market_items
                 (post_id, name, price, description, \`condition\`, status, image_urls)
                 VALUES ?`,
                [chunk]
            );
            console.log(`  Inserted items ${i + 1}–${Math.min(i + CHUNK, itemRows.length)}`);
        }

        // 6. Drop temp column
        await conn.execute(
            'ALTER TABLE market_posts DROP COLUMN _src_listing_id'
        );

        // 7. Summary
        const [[{ posts }]] = await conn.execute('SELECT COUNT(*) as posts FROM market_posts');
        const [[{ items }]] = await conn.execute('SELECT COUNT(*) as items FROM market_items');
        const [[{ visible }]] = await conn.execute(
            'SELECT COUNT(*) as visible FROM market_posts WHERE deleted_at IS NULL'
        );
        console.log(`\nDone! market_posts: ${posts}, market_items: ${items}, visible: ${visible}`);

    } finally {
        await conn.end();
    }
}

run().catch(err => { console.error(err); process.exit(1); });
