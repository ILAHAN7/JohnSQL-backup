import { useState, useEffect, useCallback } from "react"
import { AxiosError } from "axios"
import { useParams, useNavigate } from "react-router-dom"
import client from "@/lib/api/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/context/auth-context"
import { toast } from "sonner"
import { ArrowLeft, User, Mail, Shield, Calendar, FileText, Ban } from "lucide-react"

interface AdminUser {
    id: number
    netid: string
    name: string
    email: string
    role: string
    isVerified: boolean
    isBanned: boolean
    createdAt: string
}

interface UserPost {
    id: number
    title: string
    type: string
    category: string
    createdAt: string
}

interface AdminLog {
    action: string
    note: string
    actorName: string
    createdAt: string
}

const ROLE_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
    super_admin:  { label: 'Super Admin',  variant: 'default' },
    campus_admin: { label: 'Campus Admin', variant: 'secondary' },
    student:      { label: 'Student',      variant: 'outline' },
}

const ROLE_OPTIONS = [
    { value: 'student',      label: 'Student' },
    { value: 'campus_admin', label: 'Campus Admin' },
    { value: 'super_admin',  label: 'Super Admin' },
]

export function UserDetailPage() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const { user: currentUser, isLoading: authLoading } = useAuth()

    const [userData, setUserData]   = useState<AdminUser | null>(null)
    const [posts, setPosts]         = useState<UserPost[]>([])
    const [logs, setLogs]           = useState<AdminLog[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [newRole, setNewRole]     = useState<string>('')
    const [savingRole, setSavingRole] = useState(false)

    const isSuperAdmin = currentUser?.role === 'super_admin'

    const fetchDetail = useCallback(async () => {
        if (!id) return
        setIsLoading(true)
        try {
            const res = await client.get(`/admin/users/${id}`)
            setUserData(res.data.user)
            setPosts(res.data.posts)
            setLogs(res.data.logs)
            setNewRole(res.data.user.role)
        } catch {
            toast.error("Failed to load user details.")
            navigate('/admin')
        } finally {
            setIsLoading(false)
        }
    }, [id, navigate])

    useEffect(() => {
        if (!authLoading) {
            void fetchDetail()
        }
    }, [authLoading, fetchDetail])

    const handleRoleChange = async () => {
        if (!userData || newRole === userData.role) return
        setSavingRole(true)
        try {
            await client.patch(`/admin/users/${id}/role`, { role: newRole })
            toast.success(`Role updated to ${ROLE_OPTIONS.find(r => r.value === newRole)?.label}.`)
            setUserData(prev => prev ? { ...prev, role: newRole } : prev)
        } catch (err: unknown) {
            const message = err instanceof AxiosError
                ? ((err.response?.data as { error?: string } | undefined)?.error ?? "Failed to update role.")
                : "Failed to update role."
            toast.error(message)
        } finally {
            setSavingRole(false)
        }
    }

    const handleBanToggle = async () => {
        if (!userData) return
        const willBan = !userData.isBanned
        const confirmMsg = willBan
            ? `Ban ${userData.name || userData.netid}? They will be locked out immediately.`
            : `Unban ${userData.name || userData.netid}? They will regain access.`
        if (!confirm(confirmMsg)) return
        try {
            await client.patch(`/admin/users/${id}/ban`, { banned: willBan })
            toast.success(willBan ? 'User banned.' : 'User unbanned.')
            setUserData(prev => prev ? { ...prev, isBanned: willBan } : prev)
        } catch (err: unknown) {
            const message = err instanceof AxiosError
                ? ((err.response?.data as { error?: string } | undefined)?.error ?? 'Failed to update ban status.')
                : 'Failed to update ban status.'
            toast.error(message)
        }
    }

    const handleDeletePost = async (postId: number) => {
        if (!confirm("Delete this post permanently?")) return
        try {
            await client.delete(`/admin/posts/${postId}`)
            toast.success("Post deleted.")
            setPosts(prev => prev.filter(p => p.id !== postId))
        } catch {
            toast.error("Failed to delete post.")
        }
    }

    if (authLoading || isLoading) {
        return <div className="p-20 text-center text-muted-foreground">Loading...</div>
    }
    if (!userData) {
        return <div className="p-20 text-center">User not found.</div>
    }

    const roleBadge = ROLE_BADGE[userData.role] ?? { label: userData.role, variant: 'outline' as const }

    return (
        <div className="container mx-auto py-10 px-4 max-w-4xl space-y-6">
            <Button variant="ghost" onClick={() => navigate('/admin')} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
            </Button>

            {/* ── User Info Card ─────────────────────────────────────────────── */}
            <Card>
                <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
                                {userData.name?.[0]?.toUpperCase() || userData.netid?.[0]?.toUpperCase() || 'U'}
                            </div>
                            <div>
                                <CardTitle className="text-2xl">{userData.name || userData.netid}</CardTitle>
                                <CardDescription>@{userData.netid}</CardDescription>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {userData.isBanned && (
                                <Badge variant="destructive" className="gap-1">
                                    <Ban className="h-3 w-3" /> Banned
                                </Badge>
                            )}
                            <Badge variant={roleBadge.variant}>{roleBadge.label}</Badge>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid sm:grid-cols-2 gap-3 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Mail className="h-4 w-4" />
                            <span>{userData.email}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <User className="h-4 w-4" />
                            <span>NetID: {userData.netid}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Shield className="h-4 w-4" />
                            <span>Verified: {userData.isVerified ? 'Yes' : 'No'}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            <span>Joined: {userData.createdAt ? new Date(userData.createdAt).toLocaleDateString('en-US', { dateStyle: 'long' }) : '—'}</span>
                        </div>
                    </div>

                    {/* Role management + Ban — only if current user can manage */}
                    {(isSuperAdmin || currentUser?.role === 'campus_admin') && currentUser?.sub !== userData.email && (
                        <div className="pt-4 border-t space-y-4">
                            <div>
                                <p className="text-sm font-medium mb-2">Change Role</p>
                                <div className="flex items-center gap-3">
                                    <Select value={newRole} onValueChange={setNewRole}>
                                        <SelectTrigger className="w-48">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {ROLE_OPTIONS
                                                .filter(r => isSuperAdmin || r.value !== 'super_admin')
                                                .map(r => (
                                                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                                                ))
                                            }
                                        </SelectContent>
                                    </Select>
                                    <Button
                                        onClick={handleRoleChange}
                                        disabled={newRole === userData.role || savingRole}
                                        size="sm"
                                    >
                                        {savingRole ? 'Saving...' : 'Save Role'}
                                    </Button>
                                </div>
                            </div>
                            <div>
                                <p className="text-sm font-medium mb-2">Account Status</p>
                                <Button
                                    variant={userData.isBanned ? 'outline' : 'destructive'}
                                    size="sm"
                                    className={userData.isBanned ? 'border-green-500 text-green-700 hover:bg-green-50' : ''}
                                    onClick={handleBanToggle}
                                >
                                    <Ban className="h-3.5 w-3.5 mr-1.5" />
                                    {userData.isBanned ? 'Unban User' : 'Ban User'}
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ── User's Posts ───────────────────────────────────────────────── */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Posts ({posts.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Title</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {posts.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                                        No posts yet.
                                    </TableCell>
                                </TableRow>
                            ) : posts.map(p => (
                                <TableRow key={p.id}>
                                    <TableCell>
                                        <button
                                            className="font-medium hover:underline text-left"
                                            onClick={() => navigate(`/campus/uiuc/listings/${p.id}`)}
                                        >
                                            {p.title}
                                        </button>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline">
                                            {p.type === 'SELL' ? 'For Sale' : 'Wanted'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—'}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost" size="sm"
                                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                            onClick={() => handleDeletePost(p.id)}
                                        >
                                            Delete
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* ── Admin Logs ─────────────────────────────────────────────────── */}
            <Card>
                <CardHeader>
                    <CardTitle>Activity Log</CardTitle>
                    <CardDescription>Admin actions taken on this user account.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Action</TableHead>
                                <TableHead>Note</TableHead>
                                <TableHead>By</TableHead>
                                <TableHead className="text-right">Date</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {logs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                                        No admin actions on record.
                                    </TableCell>
                                </TableRow>
                            ) : logs.map((l, i) => (
                                <TableRow key={i}>
                                    <TableCell>
                                        <Badge variant={l.action === 'DELETE_POST' ? 'destructive' : l.action === 'ROLE_CHANGE' ? 'secondary' : 'outline'}>
                                            {l.action}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-sm">{l.note}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground">{l.actorName}</TableCell>
                                    <TableCell className="text-right text-sm text-muted-foreground">
                                        {new Date(l.createdAt).toLocaleDateString()}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
