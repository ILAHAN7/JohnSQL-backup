# JohnSQL - University Marketplace Platform

A full-stack flea market platform built specifically for university communities, enabling secure peer-to-peer trading with campus-verified users.

## Architecture

**Backend**: Node.js + Express + MySQL  
**Frontend**: React + TypeScript + Vite  
**Authentication**: JWT with OTP email verification  
**File Storage**: Local file system with multer  
**Real-time**: HTTP-based chat system  

## Database Schema

### Core Tables
```sql
-- Posts can contain multiple items (e.g., moving sale)
market_posts: id, title, content, contact_place, trade_type, seller_id, category, campus_id, view_count, created_at, updated_at, deleted_at

-- Individual items within a post
market_items: id, post_id, name, price, description, product_link, status, condition, image_urls

-- Auto-created users on first login
users: user_id, netid, first_name, last_name, illinois_email, role, is_verified, is_banned, created_at

-- Chat system
chat_rooms: id, post_id, buyer_id, seller_id, created_at
chat_messages: id, room_id, sender_id, content, is_read, created_at
```

## CRUD Operations

### CREATE Operations

#### Market Posts
- **Endpoint**: `POST /api/flea`
- **Auth**: Required (JWT Bearer token)
- **Features**:
  - Multi-item listings support (max 10 items)
  - Rich text content with HTML sanitization
  - Image upload and processing (max 3 per item, auto-resized)
  - Input validation (title 1-200 chars, price $0-99,999)
  - Atomic transaction (post + items created together)

**Request Body**:
```json
{
  "title": "Moving Sale - Electronics & Furniture",
  "content": "<p>Rich text content with images</p>",
  "contactPlace": "Union Bookstore",
  "type": "SELL", // or "BUY"
  "category": "ELECTRONICS",
  "campus": "uiuc",
  "items": [
    {
      "name": "MacBook Pro",
      "price": "1200.00",
      "description": "Excellent condition",
      "condition": "EXCELLENT",
      "productLink": "https://...",
      "imageUrls": ["https://..."]
    }
  ]
}
```

#### Image Upload
- **Endpoints**: 
  - `POST /api/images` (single file)
  - `POST /api/images/multiple` (multiple files)
- **Validation**: Only JPEG, PNG, GIF, WebP allowed, max 5MB
- **Security**: Auto-generated filenames, type validation

#### Chat Rooms
- **Endpoint**: `POST /api/chat/rooms`
- **Auto-creation**: Prevents duplicate rooms per user-post pair
- **Concurrency Safe**: Uses `INSERT IGNORE` for race condition handling

### READ Operations

#### Market Posts Listing
- **Endpoint**: `GET /api/flea`
- **Features**:
  - Pagination (default 12 per page, max 50)
  - Multi-criteria filtering (type, category, campus, search)
  - Sorting (newest, oldest, price_asc, price_desc)
  - Soft delete support (excludes deleted posts)

**Query Parameters**:
```
GET /api/flea?page=0&size=12&type=SELL&category=ELECTRONICS&sort=newest&search=macbook&campus=uiuc
```

**Response**:
```json
{
  "content": [
    {
      "id": 123,
      "title": "MacBook Pro",
      "writer": "John Doe",
      "writerEmail": "johndoe@illinois.edu",
      "location": "Union Bookstore",
      "type": "SELL",
      "category": "ELECTRONICS",
      "viewCount": 45,
      "createdAt": "2026-04-14T10:00:00Z",
      "items": [
        {
          "id": 456,
          "name": "MacBook Pro",
          "price": 1200.00,
          "status": "AVAILABLE",
          "condition": "EXCELLENT",
          "imageUrls": ["https://..."]
        }
      ]
    }
  ],
  "totalElements": 150,
  "totalPages": 13,
  "number": 0,
  "last": false
}
```

#### Post Detail
- **Endpoint**: `GET /api/flea/:id`
- **Auto-increment**: View count increased on each access
- **Relations**: Includes all items and author info

#### User's Own Posts
- **Endpoint**: `GET /api/users/me/posts`
- **Auth**: Optional (returns empty if not authenticated)
- **Summary**: Returns condensed view with first image and price

### UPDATE Operations

#### Market Posts
- **Endpoint**: `PUT /api/flea/:id`
- **Authorization**: Owner or admin only
- **Strategy**: Replace all items (DELETE + INSERT)
- **Validation**: Same as CREATE operation

**Permission Check**:
```javascript
// Owner check
const isOwner = post.author_email === requester_email;
// Admin check  
const isAdmin = ['campus_admin', 'super_admin'].includes(requester_role);
```

#### Item Status Updates
- Available through the main PUT endpoint
- Status options: `AVAILABLE`, `RESERVED`, `SOLD`
- Condition options: `NEW`, `EXCELLENT`, `GOOD`, `FAIR`, `POOR`

### DELETE Operations

#### Soft Delete Posts
- **Endpoint**: `DELETE /api/flea/:id`
- **Method**: Soft delete using `deleted_at` timestamp
- **Authorization**: Owner or admin only
- **Cascade**: Items remain but post becomes inaccessible

```sql
UPDATE market_posts SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL
```

#### Hard Delete (Admin Only)
- **Endpoint**: `DELETE /api/admin/posts/:id`
- **Method**: Permanent deletion
- **Cascade**: All related items deleted via foreign key constraint
- **Audit**: Logged in `admin_logs` table

## Security & Validation

### Authentication
- **Method**: JWT Bearer tokens (30-day expiry)
- **Verification**: OTP sent to @illinois.edu email
- **Rate Limiting**: 5 OTP requests per 15 minutes per IP

### Authorization Levels
- **student**: Create, read, update/delete own posts
- **campus_admin**: All student permissions + moderate flagged content
- **super_admin**: All permissions + user management + role assignments

### Input Validation
- **HTML Sanitization**: All rich text content sanitized
- **File Upload**: Type, size, and extension validation
- **SQL Injection**: Parameterized queries only
- **XSS Protection**: Content Security Policy headers

### Rate Limiting
- **API**: 100 requests/minute per IP
- **Chat**: 30 messages/minute per IP  
- **OTP**: 5 requests/15 minutes per IP

## Advanced Features

### Search & Filtering
```javascript
// Complex filter example
const conditions = [
  'mp.deleted_at IS NULL',
  'mp.trade_type = ?',
  'mp.category = ?', 
  '(mp.title LIKE ? OR mp.content LIKE ?)',
  'EXISTS (SELECT 1 FROM campuses c WHERE c.id = mp.campus_id AND c.slug = ?)'
];
```

### Performance Optimizations
- **Database Indexes**: Strategic indexing on frequently queried columns
- **Pagination**: Efficient offset-based pagination
- **Image Processing**: Client-side resizing before upload
- **Connection Pooling**: MySQL connection pool (max 10 connections)

### Real-time Features
- **Chat System**: HTTP-based messaging with unread count tracking
- **Live Updates**: React Query for real-time data synchronization

## Getting Started

### Prerequisites
- Node.js 18+
- MySQL 8.0+
- Gmail account (for OTP emails)

### Backend Setup
```bash
cd express-backend
npm install
cp .env.example .env
# Configure database and email settings
npm start
```

### Frontend Setup  
```bash
cd front
npm install
npm run dev
```

### Database Migration
Automatic migration runs on server startup:
- Creates tables if they don't exist
- Adds missing columns safely
- Creates performance indexes
- Seeds initial campus data

## API Reference

### Base URL
```
Development: http://localhost:3001/api
Production: https://yourdomain.com/api
```

### Authentication Headers
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

### Error Responses
```json
{
  "error": "Descriptive error message",
  "code": "ERROR_CODE", // Optional
  "details": {} // Optional additional context
}
```

## Project Structure

```
JohnSQL/
├── express-backend/          # Node.js API server
│   ├── server.js            # Main application entry
│   ├── uploads/             # File storage directory
│   └── __tests__/           # Backend tests
├── front/                   # React frontend
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── pages/           # Route components
│   │   ├── lib/api/         # API integration layer
│   │   └── types/           # TypeScript definitions
│   └── public/              # Static assets
├── schema.sql               # Database reference schema
└── README.md               # This file
```

