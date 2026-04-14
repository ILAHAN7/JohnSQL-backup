import { useRef, useMemo } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { cn } from "@/lib/utils";
import client from "@/lib/api/client";
import imageCompression from 'browser-image-compression';
import "./rich-text-editor.css";

interface RichTextEditorProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
}

export function RichTextEditorWithImage({ value, onChange, placeholder, className }: RichTextEditorProps) {
    const quillRef = useRef<ReactQuill>(null);

    const imageHandler = () => {
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');
        input.click();

        input.onchange = async () => {
            const file = input.files?.[0];
            if (file) {
                try {
                    // Compression
                    const options = {
                        maxWidthOrHeight: 1200,
                        maxSizeMB: 0.8,
                        useWebWorker: true,
                        fileType: 'image/webp',
                    };
                    const compressedFile = await imageCompression(file, options);

                    // Upload
                    const formData = new FormData();
                    formData.append('file', compressedFile);

                    const res = await client.post('/images', formData, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });

                    const imageUrl = res.data.imageUrl;

                    // Insert to editor
                    const quill = quillRef.current?.getEditor();
                    if (quill) {
                        const range = quill.getSelection();
                        if (range) {
                            quill.insertEmbed(range.index, 'image', imageUrl);
                        }
                    }
                } catch (error) {
                    console.error('Image upload failed:', error);
                }
            }
        };
    };

    const modules = useMemo(() => ({
        toolbar: {
            container: [
                [{ header: [1, 2, 3, false] }],
                ['bold', 'italic', 'underline', 'strike'],
                [{ list: 'ordered' }, { list: 'bullet' }],
                [{ align: [] }],
                ['image', 'link'],
                ['clean'],
            ],
            handlers: {
                image: imageHandler,
            },
        },
    }), []);

    const formats = [
        'header',
        'bold', 'italic', 'underline', 'strike',
        'list',
        'align',
        'image', 'link',
    ];

    return (
        <div className={cn("rich-text-editor", className)}>
            <ReactQuill
                ref={quillRef}
                theme="snow"
                value={value}
                onChange={onChange}
                modules={modules}
                formats={formats}
                placeholder={placeholder}
                className="bg-white rounded-md min-h-[400px]"
            />
        </div>
    );
}
