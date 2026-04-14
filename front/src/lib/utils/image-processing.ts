import imageCompression from 'browser-image-compression';

interface ResizeOptions {
    maxWidthOrHeight: number;
    maxSizeMB: number;
    useWebWorker: boolean;
    fileType: string;
}

const defaultOptions: ResizeOptions = {
    maxWidthOrHeight: 1200,
    maxSizeMB: 0.8,
    useWebWorker: true,
    fileType: 'image/webp',
};

export async function resizeImage(file: File, options: Partial<ResizeOptions> = {}): Promise<File> {
    const finalOptions = { ...defaultOptions, ...options };

    try {
        const compressedFile = await imageCompression(file, finalOptions);
        // If we want to keep the same extension, browser-image-compression usually does that,
        // but we might want to ensure it's still a File object with the original name.
        return new File([compressedFile], file.name, {
            type: compressedFile.type,
            lastModified: Date.now(),
        });
    } catch (error) {
        console.error('Image compression error:', error);
        return file; // Return original file if compression fails
    }
}

export async function resizeImages(files: File[], options: Partial<ResizeOptions> = {}): Promise<File[]> {
    return Promise.all(files.map(file => resizeImage(file, options)));
}
