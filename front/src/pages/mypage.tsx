import { useEffect, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { useAuth } from "@/context/auth-context"
import client from "@/lib/api/client"
import {
    ChevronLeft, ChevronRight, ShoppingBag, MessageCircle,
    Eye, Image as ImageIcon, Shield,
} from "lucide-react"
import { CATEGORY_LABELS } from "@/types/market"
import type { MarketCategory } from "@/types/market"

// TODO: Replace with dynamic campus resolution when multi-campus is fully supported
const DEFAULT_CAMPUS = 'uiuc'

interface MyPost {
    id: number
    title: string
    type: "BUY" | "SELL"
    category: MarketCategory
    viewCount: number
    price: number
    status: string
    imageUrl?: string
    createdAt: string
}

interface ChatRoom {
    roomId: number
    postTitle: string
    partnerName: string
    lastMessage?: string
    lastMessageAt?: string
    unreadCount: number
}

const ROLE_LABEL: Record<string, { label: string; color: string }> = {
    super_admin:  { label: 'Super Admin',  color: 'bg-purple-100 text-purple-700' },
    campus_admin: { label: 'Campus Admin', color: 'bg-blue-100 text-blue-700' },
    student:      { label: 'Student',      color: 'bg-green-100 text-green-700' },
}

const STATUS_COLOR: Record<string, string> = {
    AVAILABLE: 'text-green-600',
    RESERVED:  'text-yellow-600',
    SOLD:      'text-gray-400',
}

type Tab = 'posts' | 'chat'

export function MyPage() {
    const navigate = useNavigate()
    const { user, isAuthenticated, isLoading } = useAuth()

    const [tab, setTab] = useState<Tab>('posts')

    // Posts state
    const [posts, setPosts]           = useState<MyPost[]>([])
    const [postsLoading, setPostsLoading] = useState(true)
    const [currentPage, setCurrentPage]   = useState(0)
    const [totalPages, setTotalPages]     = useState(0)
    const [totalElements, setTotalElements] = useState(0)

    // Chat state
    const [chatRooms, setChatRooms]       = useState<ChatRoom[]>([])
    const [chatLoading, setChatLoading]   = useState(false)

    // ── Fetch posts ───────────────────────────────────────────────────────────
    const fetchPosts = useCallback(async (page = 0) => {
        setPostsLoading(true)
        try {
            const res = await client.get(`/users/me/posts?page=${page}&size=8`)
            setPosts(res.data.content || [])
            setTotalPages(res.data.totalPages || 0)
            setTotalElements(res.data.totalElements || 0)
            setCurrentPage(res.data.number || 0)
        } catch {
            toast.error("Failed to load your listings.")
        } finally {
            setPostsLoading(false)
        }
    }, [])

    // ── Fetch chat rooms ──────────────────────────────────────────────────────
    const fetchChatRooms = useCallback(async () => {
        setChatLoading(true)
        try {
            const res = await client.get('/chat/rooms')
            setChatRooms(res.data)
        } catch {
            // Non-fatal
        } finally {
            setChatLoading(false)
        }
    }, [])

    useEffect(() => {
        if (isLoading) return
        if (!isAuthenticated) { navigate('/', { replace: true }); return }
        fetchPosts(0)
    }, [isAuthenticated, isLoading, navigate, fetchPosts])

    useEffect(() => {
        if (tab === 'chat' && isAuthenticated) fetchChatRooms()
    }, [tab, isAuthenticated, fetchChatRooms])

    // ── Actions ───────────────────────────────────────────────────────────────
    const handleDelete = async (e: React.MouseEvent, postId: number) => {
        e.stopPropagation()
        if (!confirm("Delete this listing? This cannot be undone.")) return
        try {
            await client.delete(`/flea/${postId}`)
            toast.success("Listing deleted.")
            fetchPosts(currentPage)
        } catch {
            toast.error("Failed to delete listing.")
        }
    }

    if (isLoading) return <div className="p-20 text-center text-muted-foreground">Loading...</div>

    const roleMeta = ROLE_LABEL[user?.role || 'student'] ?? ROLE_LABEL.student

    return (
        <div className="container max-w-5xl mx-auto py-12 px-4">
            <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8">

                {/* ── Sidebar ──────────────────────────────────────────────── */}
                <div className="space-y-4">
                    {/* Profile card */}
                    <div className="bg-white rounded-2xl border p-6 text-center space-y-3">
                        <Avatar className="h-20 w-20 mx-auto text-2xl">
                            <AvatarFallback className="bg-primary/10 text-primary font-bold text-2xl">
                                {user?.name?.[0]?.toUpperCase() || 'U'}
                            </AvatarFallback>
                        </Avatar>
                        <div>
                            <h2 className="text-xl font-bold">{user?.name || 'User'}</h2>
                            <p className="text-sm text-muted-foreground">{user?.sub}</p>
                        </div>
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${roleMeta.color}`}>
                            <Shield className="h-3 w-3" />
                            {roleMeta.label}
                        </span>
                    </div>

                    {/* Nav tabs */}
                    <div className="bg-white rounded-xl border overflow-hidden">
                        {([
                            { key: 'posts', label: 'My Listings',  icon: ShoppingBag },
                            { key: 'chat',  label: 'Messages',      icon: MessageCircle },
                        ] as const).map(t => (
                            <button
                                key={t.key}
                                onClick={() => setTab(t.key)}
                                className={`w-full flex items-center gap-3 px-5 py-4 text-sm font-semibold border-l-4 transition-colors text-left ${
                                    tab === t.key
                                        ? 'border-primary text-primary bg-primary/5'
                                        : 'border-transparent text-muted-foreground hover:bg-muted/50'
                                }`}
                            >
                                <t.icon className="h-4 w-4" />
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {/* Admin shortcut */}
                    {(user?.role === 'campus_admin' || user?.role === 'super_admin') && (
                        <Button variant="outline" className="w-full" onClick={() => navigate('/admin')}>
                            <Shield className="h-4 w-4 mr-2" />
                            Admin Dashboard
                        </Button>
                    )}
                </div>

                {/* ── Main Content ──────────────────────────────────────────── */}
                <div>

                    {/* MY LISTINGS TAB */}
                    {tab === 'posts' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h1 className="text-2xl font-bold">
                                    My Listings
                                    <span className="ml-2 text-base font-normal text-muted-foreground">({totalElements})</span>
                                </h1>
                                <Button size="sm" onClick={() => navigate(`/campus/${DEFAULT_CAMPUS}/listings/new`)}>
                                    + New Listing
                                </Button>
                            </div>

                            {postsLoading ? (
                                <div className="py-20 text-center text-muted-foreground">Loading...</div>
                            ) : posts.length === 0 ? (
                                <div className="py-20 flex flex-col items-center gap-3 text-muted-foreground border border-dashed rounded-xl">
                                    <ShoppingBag className="h-10 w-10 opacity-20" />
                                    <p>You haven't posted any listings yet.</p>
                                    <Button size="sm" variant="outline" onClick={() => navigate(`/campus/${DEFAULT_CAMPUS}/listings/new`)}>
                                        Post your first listing
                                    </Button>
                                </div>
                            ) : (
                                <>
                                    <div className="space-y-3">
                                        {posts.map(post => (
                                            <div
                                                key={post.id}
                                                className="bg-white border rounded-xl p-4 flex gap-4 hover:shadow-sm transition-shadow cursor-pointer group"
                                                onClick={() => navigate(`/campus/${DEFAULT_CAMPUS}/listings/${post.id}`)}
                                            >
                                                {/* Thumbnail */}
                                                <div className="w-20 h-20 shrink-0 rounded-lg overflow-hidden bg-muted/50 flex items-center justify-center">
                                                    {post.imageUrl ? (
                                                        <img src={post.imageUrl} alt={post.title} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <ImageIcon className="h-7 w-7 text-muted-foreground/30" />
                                                    )}
                                                </div>

                                                {/* Info */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                        <Badge variant={post.type === 'SELL' ? 'secondary' : 'outline'} className="text-[10px] h-4 px-1.5">
                                                            {post.type === 'SELL' ? 'For Sale' : 'Wanted'}
                                                        </Badge>
                                                        {post.category !== 'OTHER' && (
                                                            <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                                                                {CATEGORY_LABELS[post.category]}
                                                            </span>
                                                        )}
                                                        <span className={`text-[10px] font-semibold ${STATUS_COLOR[post.status] || 'text-muted-foreground'}`}>
                                                            {post.status === 'AVAILABLE' ? 'Available' : post.status === 'RESERVED' ? 'Reserved' : 'Sold'}
                                                        </span>
                                                    </div>
                                                    <h3 className="font-semibold text-sm line-clamp-1 group-hover:text-primary transition-colors">
                                                        {post.title}
                                                    </h3>
                                                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                                        <span className="font-semibold text-primary">${post.price.toFixed(2)}</span>
                                                        <span className="flex items-center gap-1">
                                                            <Eye className="h-3 w-3" />{post.viewCount}
                                                        </span>
                                                        <span>{new Date(post.createdAt).toLocaleDateString()}</span>
                                                    </div>
                                                </div>

                                                {/* Actions */}
                                                <div className="flex flex-col gap-1.5 justify-center shrink-0" onClick={e => e.stopPropagation()}>
                                                    <Button
                                                        variant="outline" size="sm"
                                                        onClick={() => navigate(`/campus/${DEFAULT_CAMPUS}/listings/${post.id}/edit`)}
                                                    >
                                                        Edit
                                                    </Button>
                                                    <Button
                                                        variant="outline" size="sm"
                                                        className="text-red-500 border-red-100 hover:bg-red-50"
                                                        onClick={(e) => handleDelete(e, post.id)}
                                                    >
                                                        Delete
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Pagination */}
                                    {totalPages > 1 && (
                                        <div className="flex items-center justify-center gap-2 pt-2">
                                            <Button
                                                variant="outline" size="icon"
                                                disabled={currentPage === 0}
                                                onClick={() => fetchPosts(currentPage - 1)}
                                            >
                                                <ChevronLeft className="h-4 w-4" />
                                            </Button>
                                            {[...Array(totalPages)].map((_, i) => (
                                                <Button
                                                    key={i}
                                                    variant={currentPage === i ? 'default' : 'outline'}
                                                    size="sm" className="w-9 h-9"
                                                    onClick={() => fetchPosts(i)}
                                                >
                                                    {i + 1}
                                                </Button>
                                            ))}
                                            <Button
                                                variant="outline" size="icon"
                                                disabled={currentPage >= totalPages - 1}
                                                onClick={() => fetchPosts(currentPage + 1)}
                                            >
                                                <ChevronRight className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* MESSAGES TAB */}
                    {tab === 'chat' && (
                        <div className="space-y-4">
                            <h1 className="text-2xl font-bold">Messages</h1>

                            {chatLoading ? (
                                <div className="py-20 text-center text-muted-foreground">Loading...</div>
                            ) : chatRooms.length === 0 ? (
                                <div className="py-20 flex flex-col items-center gap-3 text-muted-foreground border border-dashed rounded-xl">
                                    <MessageCircle className="h-10 w-10 opacity-20" />
                                    <p>No active conversations yet.</p>
                                    <p className="text-xs">Click "Message Seller" on any listing to start a chat.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {chatRooms.map(room => (
                                        <div
                                            key={room.roomId}
                                            className="bg-white border rounded-xl p-4 flex items-center gap-4 cursor-pointer hover:shadow-sm transition-shadow group"
                                            onClick={() => navigate(`/chat/room/${room.roomId}`)}
                                        >
                                            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                                <MessageCircle className="h-5 w-5 text-primary" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-0.5">
                                                    <span className="font-semibold text-sm group-hover:text-primary transition-colors">
                                                        {room.partnerName}
                                                    </span>
                                                    {room.unreadCount > 0 && (
                                                        <span className="bg-primary text-primary-foreground text-xs rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
                                                            {room.unreadCount}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-muted-foreground truncate">
                                                    {room.lastMessage || 'No messages yet'}
                                                </p>
                                                <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                                                    re: {room.postTitle}
                                                </p>
                                            </div>
                                            <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
