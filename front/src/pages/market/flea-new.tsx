import { Button } from "@/components/ui/button"
import { RichTextEditor } from "@/components/ui/rich-text-editor"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useState, useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { X, Plus, Image as ImageIcon } from "lucide-react"
import { useAuth } from "@/context/auth-context"
import { useCreateMarketPost, useUploadImages } from "@/lib/api/market"
import { resizeImage } from "@/lib/utils/image-processing"
import type { MarketCategory, ItemCondition } from "@/types/market"
import { CATEGORY_LABELS, CONDITION_LABELS } from "@/types/market"

interface FleaItemState {
    name: string
    price: string
    productLink: string
    description: string
    condition: ItemCondition
    imageUrls: string[]
    pendingImages: File[]
}

export function FleaNewPage() {
    const navigate = useNavigate()
    const { slug = 'uiuc' } = useParams()
    const listingBase = `/campus/${slug}/listings`
    const { isAuthenticated, isLoading } = useAuth()

    const [title, setTitle] = useState("")
    const [content, setContent] = useState("")
    const [location, setLocation] = useState("")
    const [listingType, setListingType] = useState<"SELL" | "BUY">("SELL")
    const [postCategory, setPostCategory] = useState<MarketCategory>("OTHER")
    const [items, setItems] = useState<FleaItemState[]>([
        { name: "", price: "", productLink: "", description: "", condition: "GOOD", imageUrls: [], pendingImages: [] }
    ])

    const createPostMutation = useCreateMarketPost()
    const uploadImagesMutation = useUploadImages()

    useEffect(() => {
        if (isLoading) return
        if (!isAuthenticated) {
            toast.error("Please log in to post a listing.")
            navigate("/", { replace: true })
        }
    }, [isAuthenticated, isLoading, navigate])

    const handleAddItem = () => {
        setItems([...items, { name: "", price: "", productLink: "", description: "", condition: "GOOD", imageUrls: [], pendingImages: [] }])
    }

    const handleRemoveItem = (index: number) => {
        if (items.length === 1) {
            toast.error("A listing must have at least one item.")
            return
        }
        setItems(items.filter((_, i) => i !== index))
    }

    const handleItemChange = (index: number, field: keyof FleaItemState, value: FleaItemState[keyof FleaItemState]) => {
        const newItems = [...items]
        newItems[index] = { ...newItems[index], [field]: value }
        setItems(newItems)
    }

    const handleImageSelect = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return
        const files = Array.from(e.target.files)
        const current = items[index].imageUrls.length + items[index].pendingImages.length

        if (current + files.length > 3) {
            toast.error("Maximum 3 photos per item.")
            return
        }
        try {
            const resized = await Promise.all(files.map(f => resizeImage(f)))
            const newItems = [...items]
            newItems[index].pendingImages = [...newItems[index].pendingImages, ...resized]
            setItems(newItems)
        } catch {
            toast.error("Error processing image. Please try again.")
        }
    }

    const removePendingImage = (itemIndex: number, imgIndex: number) => {
        const newItems = [...items]
        newItems[itemIndex].pendingImages = newItems[itemIndex].pendingImages.filter((_, i) => i !== imgIndex)
        setItems(newItems)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!isAuthenticated) {
            toast.error("Please log in to post a listing.")
            return
        }
        try {
            const processedItems = await Promise.all(items.map(async (item) => {
                let finalImageUrls = [...item.imageUrls]
                if (item.pendingImages.length > 0) {
                    const uploaded = await uploadImagesMutation.mutateAsync(item.pendingImages)
                    finalImageUrls = [...finalImageUrls, ...uploaded]
                }
                return { ...item, imageUrls: finalImageUrls }
            }))

            await createPostMutation.mutateAsync({
                title,
                content,
                contactPlace: location,
                type: listingType,
                category: postCategory,
                campus: slug,
                items: processedItems.map(item => ({
                    name: item.name,
                    price: Number(item.price),
                    productLink: item.productLink,
                    description: item.description,
                    condition: item.condition,
                    imageUrls: item.imageUrls,
                }))
            })

            toast.success("Listing posted successfully!")
            navigate(listingBase)
        } catch {
            toast.error("Failed to post listing. Please try again.")
        }
    }

    const isPending = createPostMutation.isPending || uploadImagesMutation.isPending

    return (
        <div className="container max-w-3xl mx-auto py-10 px-4">
            <h1 className="text-3xl font-bold mb-2">Post a Listing</h1>
            <p className="text-muted-foreground mb-8">Fill out the details below to list your item on johnSQL.</p>

            <form onSubmit={handleSubmit} className="space-y-8">
                {/* Basic Info */}
                <div className="space-y-5 p-6 bg-white rounded-xl border">
                    <h2 className="text-lg font-semibold">Listing Details</h2>

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
                            <RadioGroup
                                value={listingType}
                                onValueChange={(val: "SELL" | "BUY") => setListingType(val)}
                                className="flex gap-6 pt-1"
                            >
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="SELL" id="sell" />
                                    <Label htmlFor="sell" className="cursor-pointer font-normal">For Sale</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="BUY" id="buy" />
                                    <Label htmlFor="buy" className="cursor-pointer font-normal">Wanted</Label>
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

                {/* Items */}
                <div className="space-y-4">
                    <h2 className="text-lg font-semibold">Items</h2>

                    {items.map((item, index) => (
                        <div key={index} className="p-6 bg-white rounded-xl border relative space-y-4">
                            {items.length > 1 && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute top-3 right-3 text-gray-400 hover:text-red-500"
                                    onClick={() => handleRemoveItem(index)}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            )}

                            <div className="grid sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Item Name</Label>
                                    <Input
                                        placeholder="e.g. iPhone 13, CS 225 Textbook"
                                        value={item.name}
                                        onChange={(e) => handleItemChange(index, "name", e.target.value)}
                                        required
                                    />
                                </div>
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
                            </div>

                            <div className="space-y-2">
                                <Label>Condition</Label>
                                <Select
                                    value={item.condition}
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

                            <div className="space-y-2">
                                <Label>Item Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
                                <Input
                                    placeholder="Color, size, any defects, etc."
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
                                <div className="flex gap-3 flex-wrap">
                                    {item.pendingImages.map((file, imgIdx) => (
                                        <div key={imgIdx} className="relative w-20 h-20 border rounded-lg overflow-hidden shrink-0">
                                            <img
                                                src={URL.createObjectURL(file)}
                                                alt="preview"
                                                className="w-full h-full object-cover"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removePendingImage(index, imgIdx)}
                                                className="absolute top-0 right-0 bg-black/50 text-white p-0.5 rounded-bl"
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </div>
                                    ))}

                                    {item.pendingImages.length < 3 && (
                                        <div className="relative">
                                            <input
                                                type="file"
                                                accept="image/*"
                                                multiple
                                                className="hidden"
                                                id={`photo-${index}`}
                                                onChange={(e) => handleImageSelect(index, e)}
                                            />
                                            <label
                                                htmlFor={`photo-${index}`}
                                                className="flex flex-col items-center justify-center w-20 h-20 border border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                                            >
                                                <ImageIcon className="h-5 w-5 text-muted-foreground mb-1" />
                                                <span className="text-[10px] text-muted-foreground">Add</span>
                                            </label>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}

                    <Button
                        type="button"
                        variant="outline"
                        className="w-full border-dashed py-6"
                        onClick={handleAddItem}
                    >
                        <Plus className="mr-2 h-4 w-4" />
                        Add Another Item
                    </Button>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t">
                    <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
                        Cancel
                    </Button>
                    <Button type="submit" size="lg" disabled={isPending}>
                        {isPending ? "Posting..." : "Post Listing"}
                    </Button>
                </div>
            </form>
        </div>
    )
}
