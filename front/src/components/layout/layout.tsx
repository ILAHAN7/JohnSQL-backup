import { Navbar } from "./Navbar"
import { Footer } from "./footer"
import { Outlet } from "react-router-dom"
import { AnnouncementPopup } from "@/components/ui/AnnouncementPopup"

export function Layout() {
    return (
        <div className="relative flex min-h-screen flex-col font-sans antialiased text-foreground bg-background">
            <AnnouncementPopup />
            <Navbar />
            <main className="flex-1 w-full flex flex-col">
                <Outlet />
            </main>
            <Footer />
        </div>
    )
}
