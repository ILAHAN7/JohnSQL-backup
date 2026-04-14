import { useState, useEffect, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import client from "@/lib/api/client"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Search, Users, Flag, Trash2, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

// ─── Types ───────────────────────────────────────────────────────────────────

interface AdminUser {
    id: number
    netid: string
    name: string
    email: string
    role: string
    isVerified: boolean
    createdAt: string
}

interface FlaggedPost {
    id: number
    title: string
    writer: string
    type: string
    category: string
    flagCount: number
    createdAt: string
}

type Tab = 'users' | 'flagged'

const ROLE_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
    super_admin:  { label: 'Super Admin',   variant: 'default' },
    campus_admin: { label: 'Campus Admin',  variant: 'secondary' },
    student:      { label: 'Student',       variant: 'outline' },
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AdminDashboard() {
    const navigate = useNavigate()
    const [tab, setTab] = useState<Tab>('users')

    // Users tab state
    const [users, setUsers] = useState<AdminUser[]>([])
    const [search, setSearch] = useState("")
    const [page, setPage] = useState(0)
    const [totalPages, setTotalPages] = useState(0)
    const [totalUsers, setTotalUsers] = useState(0)
    const [usersLoading, setUsersLoading] = useState(true)

    // Flagged tab state
    const [flagged, setFlagged]               = useState<FlaggedPost[]>([])
    const [flaggedPage, setFlaggedPage]       = useState(0)
    const [flaggedTotalPages, setFlaggedTotalPages] = useState(0)
    const [flaggedTotal, setFlaggedTotal]     = useState(0)
    const [flaggedLoading, setFlaggedLoading] = useState(false)

    // ── Fetch users ───────────────────────────────────────────────────────────
    const fetchUsers = useCallback(async (p: number, q: string) => {
        setUsersLoading(true)
        try {
            const res = await client.get('/admin/users', {
                params: { page: p, size: 15, search: q || undefined }
            })
            setUsers(res.data.content)
            setTotalPages(res.data.totalPages)
            setTotalUsers(res.data.totalElements)
        } catch {
            toast.error("Failed to load users.")
        } finally {
            setUsersLoading(false)
        }
    }, [])

    useEffect(() => {
        void fetchUsers(page, search)
    }, [page, search, fetchUsers])

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()
        setPage(0)
        fetchUsers(0, search)
    }

    // ── Fetch flagged ─────────────────────────────────────────────────────────
    const fetchFlagged = useCallback(async (p: number) => {
        setFlaggedLoading(true)
        try {
            const res = await client.get('/admin/posts/flagged', {
                params: { page: p, size: 20 }
            })
            setFlagged(res.data.content)
            setFlaggedTotalPages(res.data.totalPages)
            setFlaggedTotal(res.data.totalElements)
        } catch {
            toast.error("Failed to load flagged posts.")
        } finally {
            setFlaggedLoading(false)
        }
    }, [])

    useEffect(() => {
        if (tab === 'flagged') {
            void fetchFlagged(flaggedPage)
        }
    }, [tab, flaggedPage, fetchFlagged])

    // ── Actions ───────────────────────────────────────────────────────────────
    const handleUnflag = async (postId: number) => {
        try {
            await client.post(`/admin/posts/${postId}/unflag`)
            toast.success("Post unflagged.")
            void fetchFlagged(flaggedPage)
        } catch {
            toast.error("Failed to unflag post.")
        }
    }

    const handleDeleteFlagged = async (postId: number) => {
        if (!confirm("Delete this flagged post? This cannot be undone.")) return
        try {
            await client.delete(`/admin/posts/${postId}`)
            toast.success("Post deleted.")
            void fetchFlagged(flaggedPage)
        } catch {
            toast.error("Failed to delete post.")
        }
    }

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="container mx-auto py-10 px-4 max-w-6xl">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                    <ShieldCheck className="h-7 w-7 text-primary" />
                    Admin Dashboard
                </h1>
                <p className="text-muted-foreground mt-1">
                    Manage users and community content for johnSQL.
                </p>
            </div>

            {/* Tab Switcher */}
            <div className="flex gap-1 mb-6 border-b">
                {([
                    { key: 'users',   label: 'Users',         icon: Users, count: totalUsers },
                    { key: 'flagged', label: 'Flagged Posts',  icon: Flag,  count: flaggedTotal },
                ] as const).map(t => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                            tab === t.key
                                ? 'border-primary text-primary'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <t.icon className="h-4 w-4" />
                        {t.label}
                        {t.count > 0 && (
                            <span className="bg-muted text-muted-foreground text-xs rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
                                {t.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* ── USERS TAB ─────────────────────────────────────────────────── */}
            {tab === 'users' && (
                <div className="space-y-4">
                    <form onSubmit={handleSearch} className="flex gap-2 max-w-md">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by name, email, or NetID..."
                                className="pl-9"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <Button type="submit">Search</Button>
                    </form>

                    <div className="rounded-lg border bg-card">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>User</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Joined</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {usersLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                                            Loading users...
                                        </TableCell>
                                    </TableRow>
                                ) : users.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                                            No users found.
                                        </TableCell>
                                    </TableRow>
                                ) : users.map(u => (
                                    <TableRow
                                        key={u.id}
                                        className="cursor-pointer hover:bg-muted/50"
                                        onClick={() => navigate(`/admin/users/${u.id}`)}
                                    >
                                        <TableCell>
                                            <div className="font-medium">{u.name || u.netid}</div>
                                            <div className="text-xs text-muted-foreground">{u.netid}</div>
                                        </TableCell>
                                        <TableCell className="text-sm">{u.email}</TableCell>
                                        <TableCell>
                                            <Badge variant={ROLE_BADGE[u.role]?.variant ?? 'outline'}>
                                                {ROLE_BADGE[u.role]?.label ?? u.role}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between pt-2">
                            <span className="text-sm text-muted-foreground">
                                Page {page + 1} of {totalPages} ({totalUsers} users)
                            </span>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline" size="sm"
                                    disabled={page === 0}
                                    onClick={() => setPage(p => p - 1)}
                                >Previous</Button>
                                <Button
                                    variant="outline" size="sm"
                                    disabled={page >= totalPages - 1}
                                    onClick={() => setPage(p => p + 1)}
                                >Next</Button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── FLAGGED POSTS TAB ──────────────────────────────────────────── */}
            {tab === 'flagged' && (
                <div className="space-y-4">
                    {flaggedLoading ? (
                        <div className="h-32 flex items-center justify-center text-muted-foreground">
                            Loading flagged posts...
                        </div>
                    ) : flagged.length === 0 ? (
                        <div className="h-32 flex flex-col items-center justify-center text-muted-foreground gap-2">
                            <Flag className="h-8 w-8 opacity-30" />
                            <p>No flagged posts — community is clean!</p>
                        </div>
                    ) : (
                        <div className="rounded-lg border bg-card">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Post</TableHead>
                                        <TableHead>Seller</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead className="text-center">Reports</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {flagged.map(p => (
                                        <TableRow key={p.id}>
                                            <TableCell>
                                                <button
                                                    className="font-medium text-left hover:underline"
                                                    onClick={() => navigate(`/campus/uiuc/listings/${p.id}`)}
                                                >
                                                    {p.title}
                                                </button>
                                                <div className="text-xs text-muted-foreground">
                                                    {new Date(p.createdAt).toLocaleDateString()}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-sm">{p.writer}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline">
                                                    {p.type === 'SELL' ? 'For Sale' : 'Wanted'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <span className="font-semibold text-red-600">{p.flagCount}</span>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex gap-2 justify-end">
                                                    <Button
                                                        variant="outline" size="sm"
                                                        onClick={() => handleUnflag(p.id)}
                                                    >
                                                        Dismiss
                                                    </Button>
                                                    <Button
                                                        variant="destructive" size="sm"
                                                        onClick={() => handleDeleteFlagged(p.id)}
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                                                        Delete
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}

                    {/* Flagged Pagination */}
                    {flaggedTotalPages > 1 && (
                        <div className="flex items-center justify-between pt-2">
                            <span className="text-sm text-muted-foreground">
                                Page {flaggedPage + 1} of {flaggedTotalPages} ({flaggedTotal} flagged)
                            </span>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline" size="sm"
                                    disabled={flaggedPage === 0}
                                    onClick={() => setFlaggedPage(p => p - 1)}
                                >Previous</Button>
                                <Button
                                    variant="outline" size="sm"
                                    disabled={flaggedPage >= flaggedTotalPages - 1}
                                    onClick={() => setFlaggedPage(p => p + 1)}
                                >Next</Button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
