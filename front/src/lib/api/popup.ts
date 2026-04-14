import client from "./client"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { PopupResponseDto, PopupCreateRequestDto } from "@/types/post-popup"
import imageCompression from 'browser-image-compression'

export const useUploadImage = () => {
    return useMutation({
        mutationFn: async (file: File) => {
            // Compression options
            const options = {
                maxWidthOrHeight: 800,
                maxSizeMB: 0.5,
                useWebWorker: true,
                fileType: 'image/webp' as const,
            };

            const compressedFile = await imageCompression(file, options);
            const formData = new FormData();
            formData.append('file', compressedFile);

            const { data } = await client.post<{ imageUrl: string }>('/images', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            return data.imageUrl;
        },
    });
};

// Public API for active popups
export const useActivePopups = () => {
    return useQuery<PopupResponseDto[]>({
        queryKey: ["activePopups"],
        queryFn: async () => {
            const res = await client.get("/popups/active");
            return res.data;
        }
    });
}

// Admin API for all popups
export const useAllPopups = () => {
    return useQuery<PopupResponseDto[]>({
        queryKey: ["allPopups"],
        queryFn: async () => {
            const res = await client.get("/popups");
            return res.data;
        }
    });
}

export const useCreatePopup = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: PopupCreateRequestDto) => {
            const res = await client.post("/popups", data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["allPopups"] });
            queryClient.invalidateQueries({ queryKey: ["activePopups"] });
        }
    });
}

export const useUpdatePopup = (id: number) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: PopupCreateRequestDto) => {
            const res = await client.put(`/popups/${id}`, data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["allPopups"] });
            queryClient.invalidateQueries({ queryKey: ["activePopups"] });
        }
    });
}

export const useDeletePopup = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: number) => {
            await client.delete(`/popups/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["allPopups"] });
            queryClient.invalidateQueries({ queryKey: ["activePopups"] });
        }
    });
}
