import { Button } from "@/components/ui/button"
import { RichTextEditor } from "@/components/ui/rich-text-editor"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useState, useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { X, Plus, Image as ImageIcon } from "lucide-react"
import { useAuth } from "@/context/auth-context"
import client from "@/lib/api/client"
import { useUploadImages } from "@/lib/api/market"
import { resizeImage } from "@/lib/utils/image-processing"
import type { MarketCategory, ItemCondition, MarketItemResponseDto, MarketPostResponseDto } from "@/types/market"
import { CATEGORY_LABELS, CONDITION_LABELS } from "@/types/market"


interface FleaItem {
    id?: number
    name: string
    price: string
    productLink: string
    description: string
    condition: ItemCondition
    status: "AVAILABLE" | "RESERVED" | "SOLD"
    imageUrls: string[]
    pendingImages: File[]
}

export function FleaEditPage() {
    const { id, slug = 'uiuc' } = useParams()
    const navigate = useNavigate()
    const listingBase = `/campus/${slug}/listings`
    const { isAuthenticated, isLoading, user } = useAuth()
    const [title, setTitle] = useState("")
    const [content, setContent] = useState("")
    const [location, setLocation] = useState("")
    const [listingType, setListingType] = useState("SELL")
    const [postCategory, setPostCategory] = useState<MarketCategory>("OTHER")
    const [isSaving, setIsSaving] = useState(false)
    const [pageLoading, setPageLoading] = useState(true)

    const [items, setItems] = useState<FleaItem[]>([
        { id: undefined, name: "", price: "", productLink: "", description: "", condition: "GOOD", status: "AVAILABLE", imageUrls: [], pendingImages: [] }
    ])

    useEffect(() => {
        if (isLoading) return

        if (!isAuthenticated) {
            toast.error("Please log in to edit a listing.")
            navigate('/', { replace: true })
            return
        }

        const fetchPost = async () => {
            try {
                const res = await client.get<MarketPostResponseDto>(`/flea/${id}`)
                const post = res.data

                const isOwner = post.writerEmail === user?.sub
                const isAdmin = user?.role === 'campus_admin' || user?.role === 'super_admin'
                if (!isOwner && !isAdmin) {
                    toast.error("You don't have permission to edit this listing.")
                    navigate(`${listingBase}/${id}`)
                    return
                }

                setTitle(post.title || "")
                setContent(post.content || "")
                setLocation(post.location || "")
                setListingType(post.type || "SELL")
                setPostCategory((post.category as MarketCategory) || "OTHER")

                const mappedItems = post.items.map((item: MarketItemResponseDto) => ({
                    id: item.id,
                    name: item.name || "",
                    price: String(item.price || ""),
                    productLink: item.productLink || "",
                    description: item.description || "",
                    condition: (item.condition as ItemCondition) || "GOOD",
                    status: (item.status as FleaItem["status"]) || "AVAILABLE",
                    imageUrls: item.imageUrls || [],
                    pendingImages: []
                }))
                setItems(mappedItems.length > 0 ? mappedItems : [{
                    id: undefined,
                    name: "",
                    price: "",
                    productLink: "",
                    description: "",
                    condition: "GOOD" as ItemCondition,
                    status: "AVAILABLE",
                    imageUrls: [],
                    pendingImages: []
                }])

            } catch (error) {
                console.error("Failed to fetch post", error)
                toast.error("Failed to load listing.")
                navigate(listingBase)
            } finally {
                setPageLoading(false)
            }
        }
        if (id) fetchPost()
    }, [id, navigate, isAuthenticated, isLoading, listingBase, user?.role, user?.sub])

    const handleAddItem = () => {
        setItems([...items, { id: undefined, name: "", price: "", productLink: "", description: "", condition: "GOOD", status: "AVAILABLE", imageUrls: [], pendingImages: [] }])
    }

    const handleRemoveItem = (index: number) => {
        if (items.length === 1) {
            toast.error("A listing must have at least one item.")
            return
        }
        setItems(items.filter((_, i) => i !== index))
    }

    const handleItemChange = (index: number, field: keyof FleaItem, value: FleaItem[keyof FleaItem]) => {
        const newItems = [...items]
        newItems[index] = { ...newItems[index], [field]: value }
        setItems(newItems)
    }

    const handleImageSelect = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const files = Array.from(e.target.files)
            const currentImagesCount = items[index].imageUrls.length + items[index].pendingImages.length

            if (currentImagesCount + files.length > 3) {
                toast.error("Maximum 3 photos per item.")
                return
            }

            try {
                const resizedFiles = await Promise.all(files.map(file => resizeImage(file)))
                const newItems = [...items]
                newItems[index].pendingImages = [...newItems[index].pendingImages, ...resizedFiles]
                setItems(newItems)
            } catch (error) {
                console.error("Image processing error:", error)
                toast.error("Error processing image. Please try again.")
            }
        }
    }

    const removePendingImage = (itemIndex: number, imageIndex: number) => {
        const newItems = [...items]
        newItems[itemIndex].pendingImages = newItems[itemIndex].pendingImages.filter((_, i) => i !== imageIndex)
        setItems(newItems)
    }

    const removeExistingImage = (itemIndex: number, urlToDelete: string) => {
        const newItems = [...items]
        newItems[itemIndex].imageUrls = newItems[itemIndex].imageUrls.filter(url => url !== urlToDelete)
        setItems(newItems)
    }

    const uploadImagesMutation = useUploadImages();

    const uploadImages = async () => {
        const uploadedItems = [...items]

        for (let i = 0; i < uploadedItems.length; i++) {
            if (uploadedItems[i].pendingImages.length > 0) {
                try {
                    const imageUrls = await uploadImagesMutation.mutateAsync(uploadedItems[i].pendingImages)
                    uploadedItems[i].imageUrls = [...uploadedItems[i].imageUrls, ...imageUrls]
                    uploadedItems[i].pendingImages = []
                } catch (err) {
                    console.error("Image upload failed", err)
                    throw new Error("Failed to upload images.")
                }
            }
        }
        return uploadedItems
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSaving(true)

        try {
            if (!isAuthenticated) {
                toast.error("Please log in to edit a listing.")
                navigate('/', { replace: true })
                return
            }

            const finalItemsFn = await uploadImages()

            const payload = {
                title,
                content,
                contactPlace: location,
                type: listingType,
                category: postCategory,
                items: finalItemsFn.map(item => ({
                    id: item.id,
                    name: item.name,
                    price: Number(item.price),
                    link: item.productLink,
                    description: item.description,
                    condition: item.condition,
                    status: item.status,
                    imageUrls: item.imageUrls
                }))
            }

            await client.put(`/flea/${id}`, payload)

            toast.success("Listing updated successfully.")
            navigate(`${listingBase}/${id}`)
        } catch (error) {
            console.error(error)
            toast.error("Failed to update listing. Please try again.")
        } finally {
            setIsSaving(false)
        }
    }

    if (isLoading || pageLoading) return <div className="p-20 text-center text-muted-foreground">Loading...</div>

    return (
        <div className="container max-w-3xl mx-auto py-10 px-4">
            <h1 className="text-3xl font-bold mb-8">Edit Listing</h1>

            <form onSubmit={handleSubmit} className="space-y-8">
                {/* Basic Info */}
                <div className="space-y-4 p-6 bg-white rounded-xl border">
                    <h2 className="text-xl font-semibold mb-4">Listing Details</h2>
                    <div className="space-y-2">
                        <Label htmlFor="title">Title</Label>
                        <Input
                            id="title"
                            placeholder="e.g. Moving sale — textbooks, lamp, mini fridge"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            required
                        />
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Listing Type</Label>
                            <RadioGroup value={listingType} onValueChange={setListingType} className="flex gap-4 pt-1">
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="SELL" id="edit-sell" />
                                    <Label htmlFor="edit-sell" className="cursor-pointer font-normal">For Sale</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="BUY" id="edit-buy" />
                                    <Label htmlFor="edit-buy" className="cursor-pointer font-normal">Wanted</Label>
                                </div>
                            </RadioGroup>
                        </div>
                        <div className="space-y-2">
                            <Label>Category</Label>
                            <Select value={postCategory} onValueChange={(v) => setPostCategory(v as MarketCategory)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {(Object.keys(CATEGORY_LABELS) as MarketCategory[]).map(cat => (
                                        <SelectItem key={cat} value={cat}>{CATEGORY_LABELS[cat]}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="location">Meetup Location</Label>
                        <Input
                            id="location"
                            placeholder="e.g. Main Library, PAR/FAR, Green St"
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="content">Description</Label>
                        <RichTextEditor
                            value={content}
                            onChange={setContent}
                            placeholder="Describe your items, condition, availability, and any other details..."
                        />
                    </div>
                </div>

                {/* Items List */}
                <div className="space-y-4">
                    <h2 className="text-xl font-semibold">Items</h2>

                    {items.map((item, index) => (
                        <div key={index} className="p-6 bg-white rounded-xl border relative space-y-4 group">
                            {items.length > 1 && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute top-2 right-2 text-gray-400 hover:text-red-500"
                                    onClick={() => handleRemoveItem(index)}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            )}

                            <div className="flex justify-between items-start gap-4">
                                <div className="space-y-2 flex-1">
                                    <Label>Item Name</Label>
                                    <Input
                                        placeholder="e.g. iPhone 13, CS 225 Textbook"
                                        value={item.name}
                                        onChange={(e) => handleItemChange(index, "name", e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="space-y-2 w-36">
                                    <Label>Status</Label>
                                    <Select
                                        value={item.status}
                                        onValueChange={(val) => handleItemChange(index, "status", val)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="AVAILABLE">Available</SelectItem>
                                            <SelectItem value="RESERVED">Reserved</SelectItem>
                                            <SelectItem value="SOLD">Sold</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="grid sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Price ($)</Label>
                                    <Input
                                        type="number"
                                        placeholder="0"
                                        min="0"
                                        step="0.01"
                                        value={item.price}
                                        onChange={(e) => handleItemChange(index, "price", e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Condition</Label>
                                    <Select
                                        value={item.condition || "GOOD"}
                                        onValueChange={(v) => handleItemChange(index, "condition", v as ItemCondition)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {(Object.keys(CONDITION_LABELS) as ItemCondition[]).map(cond => (
                                                <SelectItem key={cond} value={cond}>{CONDITION_LABELS[cond]}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Status</Label>
                                <Select
                                    value={item.status}
                                    onValueChange={(v) => handleItemChange(index, "status", v as FleaItem["status"])}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="AVAILABLE">Available — ready to sell</SelectItem>
                                        <SelectItem value="RESERVED">Reserved — pending buyer</SelectItem>
                                        <SelectItem value="SOLD">Sold — no longer available</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Item Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
                                <Input
                                    placeholder="Condition, color, size, etc."
                                    value={item.description}
                                    onChange={(e) => handleItemChange(index, "description", e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Original Product Link <span className="text-muted-foreground font-normal">(optional)</span></Label>
                                <Input
                                    placeholder="https://amazon.com/..."
                                    value={item.productLink}
                                    onChange={(e) => handleItemChange(index, "productLink", e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Photos <span className="text-muted-foreground font-normal">(up to 3)</span></Label>
                                <div className="flex gap-4 items-start flex-wrap">
                                    {/* Existing Images */}
                                    {item.imageUrls.map((url, imgIndex) => (
                                        <div key={`existing-${imgIndex}`} className="relative w-20 h-20 border rounded-lg overflow-hidden shrink-0">
                                            <img
                                                src={url}
                                                alt="preview"
                                                className="w-full h-full object-cover"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removeExistingImage(index, url)}
                                                className="absolute top-0 right-0 bg-black/50 text-white p-0.5 rounded-bl"
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </div>
                                    ))}

                                    {/* Pending Images */}
                                    {item.pendingImages.map((file, imgIndex) => (
                                        <div key={`pending-${imgIndex}`} className="relative w-20 h-20 border rounded-lg overflow-hidden shrink-0 opacity-70">
                                            <img
                                                src={URL.createObjectURL(file)}
                                                alt="preview"
                                                className="w-full h-full object-cover"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removePendingImage(index, imgIndex)}
                                                className="absolute top-0 right-0 bg-black/50 text-white p-0.5 rounded-bl"
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </div>
                                    ))}

                                    {/* Add Button */}
                                    {(item.imageUrls.length + item.pendingImages.length) < 3 && (
                                        <div className="relative">
                                            <input
                                                type="file"
                                                accept="image/*"
                                                multiple
                                                className="hidden"
                                                id={`image-upload-${index}`}
                                                onChange={(e) => handleImageSelect(index, e)}
                                            />
                                            <label
                                                htmlFor={`image-upload-${index}`}
                                                className="flex flex-col items-center justify-center w-20 h-20 border border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                                            >
                                                <ImageIcon className="h-6 w-6 text-muted-foreground mb-1" />
                                                <span className="text-[10px] text-muted-foreground">Add</span>
                                            </label>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}

                    <Button type="button" variant="outline" className="w-full border-dashed py-6" onClick={handleAddItem}>
                        <Plus className="mr-2 h-4 w-4" /> Add Another Item
                    </Button>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button type="button" variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
                    <Button type="submit" size="lg" disabled={isSaving}>
                        {isSaving ? "Saving..." : "Save Changes"}
                    </Button>
                </div>
            </form>
        </div>
    )
}
