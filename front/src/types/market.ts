
export type MarketCategory = 'ELECTRONICS' | 'TEXTBOOKS' | 'FURNITURE' | 'CLOTHING' | 'APPLIANCES' | 'OTHER';
export type ItemCondition = 'NEW' | 'LIKE_NEW' | 'GOOD' | 'FAIR' | 'POOR';
export type SortOption = 'newest' | 'oldest' | 'price_asc' | 'price_desc';

export interface MarketFilters {
    type?: 'BUY' | 'SELL';
    category?: MarketCategory;
    sort?: SortOption;
    search?: string;
    campus?: string;  // campus slug, e.g. 'uiuc'
}

export interface MarketItemDto {
    id?: number;
    name: string;
    price: number;
    description: string;
    productLink?: string;
    condition?: ItemCondition;
    imageUrls: string[];
}

export interface MarketPostCreateRequestDto {
    title: string;
    content: string;
    contactPlace: string;
    type: 'BUY' | 'SELL';
    category?: MarketCategory;
    campus?: string;
    items: MarketItemDto[];
}

export interface MarketItemResponseDto {
    id: number;
    name: string;
    price: number;
    description: string;
    productLink: string;
    status: string;
    condition: ItemCondition;
    imageUrls: string[];
}

export interface MarketPostResponseDto {
    id: number;
    title: string;
    content: string;
    writer: string;
    writerId?: number;
    location: string;
    type: 'BUY' | 'SELL';
    category: MarketCategory;
    viewCount: number;
    createdAt: string;
    writerEmail?: string;
    items: MarketItemResponseDto[];
}

export const CATEGORY_LABELS: Record<MarketCategory, string> = {
    ELECTRONICS: 'Electronics',
    TEXTBOOKS:   'Textbooks',
    FURNITURE:   'Furniture',
    CLOTHING:    'Clothing',
    APPLIANCES:  'Appliances',
    OTHER:       'Other',
};

export const CONDITION_LABELS: Record<ItemCondition, string> = {
    NEW:      'New',
    LIKE_NEW: 'Like New',
    GOOD:     'Good',
    FAIR:     'Fair',
    POOR:     'Poor',
};
