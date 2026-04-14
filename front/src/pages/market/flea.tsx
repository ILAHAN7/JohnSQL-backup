import { useRef, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Link, Navigate, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { useAuth } from "@/context/auth-context"
import { Plus, Image as ImageIcon } from "lucide-react"
import { isAfter, subHours } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { useMarketPosts } from "@/lib/api/market"
import { FilterBar } from "@/components/market/FilterBar"
import type { MarketPostResponseDto, MarketItemResponseDto, MarketFilters } from "@/types/market"
import { CATEGORY_LABELS } from "@/types/market"

export function FleaPage() {
    const navigate = useNavigate()
    const { slug = 'uiuc' } = useParams()
    const listingBase = `/campus/${slug}/listings`
    const { isAuthenticated } = useAuth()
    const [filters, setFilters] = useState<MarketFilters>({ campus: slug })

    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        status,
    } = useMarketPosts(filters)

    const observerElem = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        const element = observerElem.current
        if (!element) return
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
                    fetchNextPage()
                }
            },
            { threshold: 1.0 }
        )
        observer.observe(element)
        return () => observer.unobserve(element)
    }, [fetchNextPage, hasNextPage, isFetchingNextPage])

    const getThumbnail = (items: MarketItemResponseDto[]) => {
        const itemWithImage = items.find(i => i.imageUrls && i.imageUrls.length > 0)
        return itemWithImage?.imageUrls[0] ?? null
    }

    const isNew = (createdAt: string) => isAfter(new Date(createdAt), subHours(new Date(), 24))

    const totalCount = data?.pages[0]?.totalElements

    // Redirect unknown campus slugs to UIUC
    const VALID_CAMPUS_SLUGS = ['uiuc']
    if (slug && !VALID_CAMPUS_SLUGS.includes(slug)) {
        return <Navigate to="/campus/uiuc/listings" replace />
    }

    return (
        <div className="container max-w-7xl mx-auto py-10 px-4">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Marketplace</h1>
                    <p className="text-muted-foreground mt-1">
                        Buy and sell with students on your campus.
                    </p>
                </div>
                <Button
                    className="gap-2"
                    onClick={() => {
                        if (isAuthenticated) {
                            navigate(`${listingBase}/new`)
                        } else {
                            toast.error("Please log in to post a listing.")
                        }
                    }}
                >
                    <Plus className="h-4 w-4" />
                    Post a Listing
                </Button>
            </div>

            {/* Filters */}
            <div className="mb-6">
                <FilterBar filters={filters} onChange={setFilters} />
            </div>

            {/* Results count */}
            {status === 'success' && totalCount !== undefined && (
                <p className="text-sm text-muted-foreground mb-4">
                    {totalCount === 0
                        ? "No listings found."
                        : `${totalCount} listing${totalCount === 1 ? "" : "s"} found`}
                </p>
            )}

            {status === 'pending' ? (
                <div className="text-center py-20 text-muted-foreground">Loading listings...</div>
            ) : status === 'error' ? (
                <div className="text-center py-20 text-red-500">
                    Failed to load listings. Please try again.
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {data?.pages.map((page) =>
                        page.content.map((post: MarketPostResponseDto) => {
                            const thumbnail = getThumbnail(post.items)
                            const firstItem = post.items[0]

                            return (
                                <div
                                    key={post.id}
                                    className="group relative bg-card rounded-xl border shadow-sm hover:shadow-md transition-shadow overflow-hidden"
                                >
                                    {/* Thumbnail */}
                                    <div className="aspect-square bg-muted/50 w-full relative overflow-hidden">
                                        {isNew(post.createdAt) && (
                                            <Badge className="absolute top-2 left-2 z-20 bg-rose-500 hover:bg-rose-500 border-none px-1.5 py-0 text-[10px] h-4">
                                                New
                                            </Badge>
                                        )}
                                        <Badge
                                            variant="secondary"
                                            className="absolute top-2 right-2 z-20 text-[10px] h-4 px-1.5 py-0"
                                        >
                                            {post.type === 'SELL' ? 'Selling' : 'Buying'}
                                        </Badge>
                                        {thumbnail ? (
                                            <img
                                                src={thumbnail}
                                                alt={post.title}
                                                className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                                <ImageIcon className="h-10 w-10 opacity-20" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="p-4">
                                        <h3 className="font-semibold text-base mb-1 group-hover:text-primary transition-colors line-clamp-1">
                                            {post.title}
                                        </h3>
                                        {firstItem && (
                                            <p className="text-lg font-bold text-primary">
                                                ${firstItem.price.toFixed(2)}
                                            </p>
                                        )}
                                        <div className="flex justify-between items-center mt-2 text-xs text-muted-foreground">
                                            <span className="flex items-center gap-1.5">
                                                {post.category && post.category !== 'OTHER' && (
                                                    <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-medium">
                                                        {CATEGORY_LABELS[post.category]}
                                                    </span>
                                                )}
                                                {post.location || "UIUC Campus"}
                                            </span>
                                            <span>{new Date(post.createdAt).toLocaleDateString()}</span>
                                        </div>
                                    </div>

                                    <Link to={`${listingBase}/${post.id}`} className="absolute inset-0 z-10">
                                        <span className="sr-only">View listing</span>
                                    </Link>
                                </div>
                            )
                        })
                    )}
                </div>
            )}

            {/* Infinite scroll sentinel */}
            <div ref={observerElem} className="h-4 w-full flex justify-center items-center py-4">
                {isFetchingNextPage && (
                    <span className="text-sm text-muted-foreground">Loading more...</span>
                )}
            </div>
        </div>
    )
}
