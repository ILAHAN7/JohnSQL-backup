import { Link, useLocation, useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Menu, ShoppingBag } from "lucide-react"
import {
    Sheet,
    SheetContent,
    SheetTrigger,
} from "@/components/ui/sheet"
import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/context/auth-context"
import client from "@/lib/api/client"

export function Navbar() {
    const [isOpen, setIsOpen] = useState(false)
    const { user, logout, openLoginModal } = useAuth()
    const location = useLocation()
    const navigate = useNavigate()

    const isAdmin = user?.role === 'campus_admin' || user?.role === 'super_admin'

    const [unreadCount, setUnreadCount] = useState(0)

    useEffect(() => {
        let cancelled = false
        const fetchUnread = async () => {
            if (!user) {
                if (!cancelled) setUnreadCount(0)
                return
            }
            try {
                const res = await client.get('/notifications/unread-count')
                if (!cancelled) setUnreadCount(res.data.count || 0)
            } catch { /* non-fatal */ }
        }
        void fetchUnread()
        const interval = setInterval(() => { void fetchUnread() }, 30_000)
        return () => { cancelled = true; clearInterval(interval) }
    }, [user])

    const navLinks = [
        { name: "Marketplace", href: "/campus/uiuc/listings" },
    ]

    const handleLogout = () => {
        logout()
        navigate("/")
    }

    return (
        <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
            <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 md:px-8">

                {/* Logo */}
                <div className="flex items-center gap-8">
                    <Link to="/" className="flex items-center gap-2">
                        <ShoppingBag className="h-6 w-6 text-primary" />
                        <span className="text-xl font-bold tracking-tight">
                            john<span className="text-primary">SQL</span>
                        </span>
                    </Link>

                    {/* Desktop nav */}
                    <nav className="hidden md:flex items-center gap-1 text-sm font-medium">
                        {navLinks.map((link) => (
                            <Link
                                key={link.href}
                                to={link.href}
                                className={cn(
                                    "h-10 px-4 py-2 flex items-center rounded-md transition-colors hover:bg-accent hover:text-accent-foreground font-medium",
                                    location.pathname.startsWith(link.href)
                                        ? "text-primary font-semibold"
                                        : "text-muted-foreground"
                                )}
                            >
                                {link.name}
                            </Link>
                        ))}
                    </nav>
                </div>

                {/* Right side */}
                <div className="flex items-center gap-3">
                    {user ? (
                        <>
                            {/* Post a Listing button */}
                            <Button
                                size="sm"
                                className="hidden md:flex"
                                onClick={() => navigate("/campus/uiuc/listings/new")}
                            >
                                + Post a Listing
                            </Button>

                            {/* User dropdown */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" className="relative h-auto w-auto rounded-full gap-2 px-2">
                                        <span className="hidden md:block text-sm font-medium">
                                            {user.name}
                                        </span>
                                        <Avatar className="h-8 w-8">
                                            <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                                                {user.name.charAt(0).toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="w-48" align="end">
                                    <div className="px-3 py-2 text-xs text-muted-foreground truncate">
                                        {user.sub}
                                    </div>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem asChild>
                                        <Link to="/mypage" className="flex items-center justify-between w-full">
                                            My Listings
                                            {unreadCount > 0 && (
                                                <span className="ml-2 bg-primary text-primary-foreground text-xs rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
                                                    {unreadCount}
                                                </span>
                                            )}
                                        </Link>
                                    </DropdownMenuItem>
                                    {isAdmin && (
                                        <>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem asChild>
                                                <Link to="/admin">Admin Dashboard</Link>
                                            </DropdownMenuItem>
                                        </>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        onClick={handleLogout}
                                        className="cursor-pointer text-red-600 focus:text-red-600"
                                    >
                                        Log Out
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </>
                    ) : (
                        <div className="hidden md:flex items-center gap-2">
                            <Button onClick={() => openLoginModal()}>
                                Sign In
                            </Button>
                        </div>
                    )}

                    {/* Mobile hamburger */}
                    <Sheet open={isOpen} onOpenChange={setIsOpen}>
                        <SheetTrigger asChild>
                            <Button variant="ghost" size="icon" className="md:hidden">
                                <Menu className="h-6 w-6" />
                                <span className="sr-only">Toggle Menu</span>
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="right" className="w-[280px]">
                            <div className="flex flex-col h-full">
                                <div className="flex items-center gap-2 px-2 pt-4 pb-8">
                                    <ShoppingBag className="h-5 w-5 text-primary" />
                                    <span className="text-lg font-bold">
                                        john<span className="text-primary">SQL</span>
                                    </span>
                                </div>

                                <div className="flex flex-col gap-1 px-2">
                                    {navLinks.map((link) => (
                                        <Link
                                            key={link.href}
                                            to={link.href}
                                            onClick={() => setIsOpen(false)}
                                            className={cn(
                                                "flex items-center py-2 px-3 text-base font-medium rounded-md transition-colors hover:bg-accent",
                                                location.pathname.startsWith(link.href)
                                                    ? "text-primary bg-accent/50"
                                                    : "text-muted-foreground"
                                            )}
                                        >
                                            {link.name}
                                        </Link>
                                    ))}
                                </div>

                                <div className="mt-auto p-4 border-t flex flex-col gap-2">
                                    {user ? (
                                        <>
                                            <div className="flex items-center gap-3 px-1 mb-2">
                                                <Avatar className="h-9 w-9">
                                                    <AvatarFallback className="bg-primary text-primary-foreground">
                                                        {user.name.charAt(0).toUpperCase()}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <p className="text-sm font-medium">{user.name}</p>
                                                    <p className="text-xs text-muted-foreground truncate max-w-[160px]">{user.sub}</p>
                                                </div>
                                            </div>
                                            <Button
                                                className="w-full"
                                                onClick={() => { navigate("/campus/uiuc/listings/new"); setIsOpen(false) }}
                                            >
                                                + Post a Listing
                                            </Button>
                                            <Button variant="outline" className="w-full" asChild>
                                                <Link to="/mypage" onClick={() => setIsOpen(false)}>My Listings</Link>
                                            </Button>
                                            {isAdmin && (
                                                <Button variant="outline" className="w-full" asChild>
                                                    <Link to="/admin" onClick={() => setIsOpen(false)}>Admin</Link>
                                                </Button>
                                            )}
                                            <Button
                                                variant="ghost"
                                                className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                                                onClick={() => { handleLogout(); setIsOpen(false) }}
                                            >
                                                Log Out
                                            </Button>
                                        </>
                                    ) : (
                                        <>
                                            <Button className="w-full" onClick={() => { openLoginModal(); setIsOpen(false) }}>
                                                Sign In
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </SheetContent>
                    </Sheet>
                </div>
            </div>
        </header>
    )
}
