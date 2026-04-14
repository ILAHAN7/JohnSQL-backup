-- johnSQL - MySQL Schema (Reference)
-- NOTE: This file is for reference only. Live schema is managed by automatic migrations in express-backend/server.js
-- The GCP database (uiuc_flea_market) contains: users, market_posts, market_items,
-- campuses, otp_tokens, post_reports, admin_logs, chat_rooms, chat_messages

USE uiuc_flea_market;

-- market_posts: one post can contain multiple items (e.g. a moving sale)
-- seller_id references the existing users.user_id column
CREATE TABLE IF NOT EXISTS market_posts (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    title         VARCHAR(500) NOT NULL,
    content       TEXT,
    contact_place VARCHAR(500),
    trade_type    ENUM('BUY', 'SELL') DEFAULT 'SELL',
    seller_id     INT,
    view_count    INT DEFAULT 0,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (seller_id) REFERENCES users(user_id) ON DELETE SET NULL
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- market_items: individual items within a post
CREATE TABLE IF NOT EXISTS market_items (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    post_id      INT NOT NULL,
    name         VARCHAR(500) NOT NULL,
    price        DECIMAL(10, 2) DEFAULT 0.00,
    description  TEXT,
    product_link VARCHAR(1000),
    status       ENUM('AVAILABLE', 'RESERVED', 'SOLD') DEFAULT 'AVAILABLE',
    image_urls   JSON,
    FOREIGN KEY (post_id) REFERENCES market_posts(id) ON DELETE CASCADE
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Note: User creation is handled by the backend (getOrCreateUser) using illinois_email as the unique key.
-- No need to manually insert users; they are created automatically on first login.
