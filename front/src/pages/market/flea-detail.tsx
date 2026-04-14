import { useEffect, useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import DOMPurify from "dompurify"
import { Button } from "@/components/ui/button"
import { ArrowLeft, MapPin, User, Calendar, ExternalLink, MoreHorizontal, MessageCircle, Flag } from "lucide-react"
import client from "@/lib/api/client"
import { AxiosError } from "axios"
import { useAuth } from "@/context/auth-context"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import { useChatRoom } from "@/hooks/use-chat-room"
import type { MarketCategory, ItemCondition } from "@/types/market"
import { CATEGORY_LABELS, CONDITION_LABELS } from "@/types/market"

interface FleaItem {
    id: number
    name: string
    price: number
    status: "AVAILABLE" | "RESERVED" | "SOLD"
    condition?: ItemCondition
    imageUrls: string[]
    description?: string
    productLink?: string
}

interface FleaPostDetail {
    id: number
    title: string
    content: string
    location: string
    writer: string
    writerId: number
    writerEmail: string
    createdAt: string
    type: "BUY" | "SELL"
    category?: MarketCategory
    items: FleaItem[]
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
    AVAILABLE: { label: "Available", className: "bg-green-100 text-green-700" },
    RESERVED:  { label: "Reserved",  className: "bg-yellow-100 text-yellow-700" },
    SOLD:      { label: "Sold",       className: "bg-gray-100 text-gray-500" },
}

export function FleaDetailPage() {
    const { id, slug = 'uiuc' } = useParams()
    const navigate = useNavigate()
    const listingBase = `/campus/${slug}/listings`
    const [post, setPost] = useState<FleaPostDetail | null>(null)
    const [loading, setLoading] = useState(true)
    const [selectedImage, setSelectedImage] = useState<string | null>(null)
    const { enterChatRoom } = useChatRoom()
    const { user } = useAuth()

    useEffect(() => {
        if (!id) return
        client.get(`/flea/${id}`)
            .then(res => setPost(res.data))
            .catch(() => toast.error("Failed to load listing."))
            .finally(() => setLoading(false))
    }, [id])

    const handleDelete = async () => {
        if (!id || !confirm("Delete this listing? This can't be undone.")) return
        try {
            await client.delete(`/flea/${id}`)
            toast.success("Listing deleted.")
            navigate(listingBase)
        } catch {
            toast.error("Failed to delete listing.")
        }
    }

    const handleReport = async () => {
        if (!user) {
            toast.error("Please log in to report a listing.")
            return
        }
        if (!confirm("Report this listing as inappropriate?")) return
        try {
            await client.post(`/flea/${id}/report`)
            toast.success("Listing reported. Our team will review it shortly.")
        } catch (err: unknown) {
            const message = err instanceof AxiosError && err.response?.status === 409
                ? "You've already reported this listing."
                : "Failed to report listing."
            toast.error(message)
        }
    }

    if (loading) return <div className="container py-20 text-center text-muted-foreground">Loading...</div>
    if (!post) return <div className="container py-20 text-center text-muted-foreground">Listing not found.</div>

    const isOwner = user?.sub === post.writerEmail
    const isAdmin = user?.role === 'campus_admin' || user?.role === 'super_admin'

    const sanitizeConfig: Parameters<typeof DOMPurify.sanitize>[1] = {
        ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'a', 'span'],
        ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
        FORCE_BODY: true,
        FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick', 'onmouseover'],
    }

    return (
        <div className="container max-w-4xl mx-auto py-10 px-4">
            {/* Header actions */}
            <div className="flex justify-between items-center mb-6">
                <Button variant="ghost" onClick={() => navigate(listingBase)} className="-ml-4 text-muted-foreground">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Marketplace
                </Button>

                <div className="flex items-center gap-2">
                    {/* Report button — shown to non-owners */}
                    {!isOwner && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-red-600 gap-1.5"
                            onClick={handleReport}
                        >
                            <Flag className="h-4 w-4" />
                            Report
                        </Button>
                    )}

                    {(isOwner || isAdmin) && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                    <MoreHorizontal className="h-5 w-5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {isOwner && (
                                    <DropdownMenuItem onClick={() => navigate(`${listingBase}/${id}/edit`)}>
                                        Edit Listing
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuItem className="text-red-600" onClick={handleDelete}>
                                    Delete Listing
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
            </div>

            <div className="space-y-8">
                {/* Title & meta */}
                <div className="border-b pb-6">
                    <div className="flex items-center gap-3 mb-3 flex-wrap">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${post.type === 'SELL' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                            {post.type === 'SELL' ? 'For Sale' : 'Wanted'}
                        </span>
                        {post.category && post.category !== 'OTHER' && (
                            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground">
                                {CATEGORY_LABELS[post.category]}
                            </span>
                        )}
                        <h1 className="text-3xl font-bold">{post.title}</h1>
                    </div>

                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                            <User className="h-4 w-4" />
                            {post.writer}
                        </div>
                        <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {new Date(post.createdAt).toLocaleDateString('en-US', {
                                year: 'numeric', month: 'long', day: 'numeric'
                            })}
                        </div>
                        {post.location && (
                            <div className="flex items-center gap-1">
                                <MapPin className="h-4 w-4" />
                                {post.location}
                            </div>
                        )}
                    </div>
                </div>

                {/* Items */}
                <div className="space-y-4">
                    <h2 className="text-xl font-semibold">
                        {post.items.length === 1 ? "Item" : `Items (${post.items.length})`}
                    </h2>

                    <div className="grid gap-5">
                        {post.items.map((item) => {
                            const statusInfo = STATUS_LABELS[item.status] ?? STATUS_LABELS.AVAILABLE

                            return (
                                <div key={item.id} className="flex flex-col sm:flex-row gap-6 p-6 border rounded-xl bg-card">
                                    {/* Images */}
                                    {item.imageUrls && item.imageUrls.length > 0 ? (
                                        <div className="flex gap-2 overflow-x-auto sm:w-1/3 shrink-0">
                                            {item.imageUrls.map((url, idx) => (
                                                <div
                                                    key={idx}
                                                    className="w-28 h-28 shrink-0 rounded-lg overflow-hidden border bg-muted/50 cursor-pointer hover:opacity-90 transition-opacity"
                                                    onClick={() => setSelectedImage(url)}
                                                >
                                                    <img src={url} alt={item.name} className="w-full h-full object-cover" />
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="sm:w-1/3 bg-muted/20 rounded-lg flex items-center justify-center h-28 text-muted-foreground text-sm shrink-0">
                                            No photos
                                        </div>
                                    )}

                                    {/* Details */}
                                    <div className="flex-1 space-y-3">
                                        <div className="flex justify-between items-start gap-2">
                                            <h3 className="text-lg font-semibold">{item.name}</h3>
                                            <span className={`px-2 py-0.5 rounded text-xs font-semibold shrink-0 ${statusInfo.className}`}>
                                                {statusInfo.label}
                                            </span>
                                        </div>

                                        <p className="text-2xl font-bold text-primary">
                                            ${item.price.toFixed(2)}
                                        </p>

                                        {item.condition && (
                                            <p className="text-xs text-muted-foreground">
                                                Condition: <span className="font-medium text-foreground">{CONDITION_LABELS[item.condition]}</span>
                                            </p>
                                        )}

                                        {item.description && (
                                            <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                                                {item.description}
                                            </p>
                                        )}

                                        <div className="flex flex-wrap gap-2 pt-1">
                                            {!isOwner && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => {
                                                        enterChatRoom({ postId: post.id, category: 'FLEA' })
                                                    }}
                                                >
                                                    <MessageCircle className="h-4 w-4 mr-2" />
                                                    Message Seller
                                                </Button>
                                            )}

                                            {item.productLink && (
                                                <Button variant="outline" size="sm" asChild>
                                                    <a href={item.productLink} target="_blank" rel="noopener noreferrer">
                                                        <ExternalLink className="h-4 w-4 mr-2" />
                                                        Original Listing
                                                    </a>
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Description */}
                {post.content && (
                    <div className="space-y-3 pt-4 border-t">
                        <h2 className="text-xl font-semibold">Additional Details</h2>
                        <div
                            className="prose max-w-none text-gray-800 bg-white p-6 rounded-xl border min-h-[100px]"
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.content, sanitizeConfig) }}
                        />
                    </div>
                )}

                {/* Meetup Map */}
                {post.location && (
                    <div className="space-y-3 pt-4 border-t">
                        <h2 className="text-xl font-semibold flex items-center gap-2">
                            <MapPin className="h-5 w-5 text-primary" />
                            Meetup Location
                        </h2>
                        <p className="text-sm text-muted-foreground">{post.location}</p>
                        <div className="rounded-xl overflow-hidden border h-64 w-full">
                            <iframe
                                title="Meetup location map"
                                width="100%"
                                height="100%"
                                frameBorder="0"
                                style={{ border: 0 }}
                                src={`https://maps.google.com/maps?q=${encodeURIComponent(post.location + ', Champaign, IL')}&output=embed&z=15`}
                                allowFullScreen
                                loading="lazy"
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Lightbox */}
            {selectedImage && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
                    onClick={() => setSelectedImage(null)}
                >
                    <div className="relative max-w-4xl max-h-[90vh] w-full h-full flex items-center justify-center">
                        <img
                            src={selectedImage}
                            alt="Full size"
                            className="max-w-full max-h-full object-contain rounded-lg"
                        />
                        <button
                            onClick={(e) => { e.stopPropagation(); setSelectedImage(null) }}
                            className="absolute top-4 right-4 bg-white/20 hover:bg-white/30 text-white rounded-full p-2 transition-colors"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

// X icon used in lightbox close button
function X({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    )
}
