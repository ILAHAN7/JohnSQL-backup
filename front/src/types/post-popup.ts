export interface PopupResponseDto {
    id: number;
    title: string;
    imageUrl: string;
    linkUrl?: string;
    startDate: string;
    endDate: string;
    active: boolean;
    creatorNickname: string;
}

export interface PopupCreateRequestDto {
    title: string;
    imageUrl: string;
    linkUrl?: string;
    startDate: string; // ISO string
    endDate: string;   // ISO string
    active: boolean;
}
