import { useState, useEffect } from "react"
import { useActivePopups } from "@/lib/api/popup"
import type { PopupResponseDto } from "@/types/post-popup"
import { useLocation } from "react-router-dom"
import {
    Dialog,
    DialogPortal,
    DialogTitle,
} from "@/components/ui/dialog"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { ChevronLeft, ChevronRight } from "lucide-react"

export function AnnouncementPopup() {
    const { data: popups, isLoading } = useActivePopups()
    const [currentPopupIndex, setCurrentPopupIndex] = useState(0)
    const [visiblePopups, setVisiblePopups] = useState<PopupResponseDto[]>([])
    const [open, setOpen] = useState(false)
    const location = useLocation()

    useEffect(() => {
        // Only show popups on the main page
        if (location.pathname !== "/") {
            setOpen(false)
            return
        }

        if (!isLoading && popups && popups.length > 0) {
            // Check if all popups have been dismissed globally
            const allDismissedAt = localStorage.getItem('popup_all_dismissed_today')
            if (allDismissedAt) {
                const lastDismissedTime = parseInt(allDismissedAt)
                if (Date.now() - lastDismissedTime <= 24 * 60 * 60 * 1000) {
                    setOpen(false)
                    return
                }
            }

            // Filter popups that haven't been dismissed individually (optional but good for consistency)
            const filtered = popups.filter((popup: PopupResponseDto) => {
                const dismissedAt = localStorage.getItem(`popup_dismissed_${popup.id}`)
                if (!dismissedAt) return true

                const lastDismissedTime = parseInt(dismissedAt)
                const now = Date.now()
                return now - lastDismissedTime > 24 * 60 * 60 * 1000
            })

            setVisiblePopups(filtered)
            if (filtered.length > 0) {
                setCurrentPopupIndex(0)
                setOpen(true)
            } else {
                setOpen(false)
            }
        } else {
            setOpen(false)
        }
    }, [popups, isLoading, location.pathname])

    if (isLoading || visiblePopups.length === 0 || !open) return null

    const currentPopup = visiblePopups[currentPopupIndex]
    if (!currentPopup) return null

    const handleClose = () => {
        setOpen(false)
    }

    const handleDontShowToday = () => {
        // Set a global dismissal flag for all popups
        localStorage.setItem('popup_all_dismissed_today', Date.now().toString())
        setOpen(false)
    }

    const handleNext = (e: React.MouseEvent) => {
        e.stopPropagation()
        setCurrentPopupIndex((prev) => (prev + 1) % visiblePopups.length)
    }

    const handlePrev = (e: React.MouseEvent) => {
        e.stopPropagation()
        setCurrentPopupIndex((prev) => (prev - 1 + visiblePopups.length) % visiblePopups.length)
    }

    const handleImageClick = () => {
        if (currentPopup.linkUrl) {
            window.open(currentPopup.linkUrl, '_blank', 'noopener,noreferrer')
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogPortal>
                {/* Custom Overlay to ensure it's fully transparent and doesn't darken */}
                <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-transparent pointer-events-none" />
                <DialogPrimitive.Content
                    className="fixed left-[50%] top-[50%] z-50 flex w-full max-w-[400px] translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden border-none bg-transparent shadow-2xl transition-all duration-300 focus:outline-none"
                >
                    <DialogTitle className="sr-only">Announcement</DialogTitle>
                    <div className="relative group bg-white rounded-lg overflow-hidden border border-slate-200 shadow-xl">
                        {/* Popup Image */}
                        <div
                            className={`relative cursor-pointer overflow-hidden ${currentPopup.linkUrl ? 'hover:opacity-95' : ''}`}
                            onClick={handleImageClick}
                        >
                            <img
                                src={currentPopup.imageUrl}
                                alt={currentPopup.title}
                                className="w-full aspect-[4/5] object-cover block"
                            />

                            {/* Navigation Arrows */}
                            {visiblePopups.length > 1 && (
                                <>
                                    <button
                                        onClick={handlePrev}
                                        className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white rounded-full p-1 transition-all opacity-0 group-hover:opacity-100"
                                    >
                                        <ChevronLeft className="w-6 h-6" />
                                    </button>
                                    <button
                                        onClick={handleNext}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white rounded-full p-1 transition-all opacity-0 group-hover:opacity-100"
                                    >
                                        <ChevronRight className="w-6 h-6" />
                                    </button>
                                </>
                            )}
                        </div>

                        {/* Pagination if multiple */}
                        {visiblePopups.length > 1 && (
                            <div className="absolute top-4 right-4 bg-black/50 text-white text-[10px] px-2 py-1 rounded-full pointer-events-none">
                                {currentPopupIndex + 1} / {visiblePopups.length}
                            </div>
                        )}

                        {/* Footer Buttons */}
                        <div className="flex w-full bg-white border-t">
                            <button
                                onClick={handleDontShowToday}
                                className="flex-1 py-4 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors border-r"
                            >
                                Don't show today
                            </button>
                            <button
                                onClick={handleClose}
                                className="flex-1 py-4 text-sm font-medium text-slate-900 hover:bg-slate-50 transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </DialogPrimitive.Content>
            </DialogPortal>
        </Dialog>
    )
}
