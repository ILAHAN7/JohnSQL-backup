import { AxiosError } from "axios"
import { useNavigate } from "react-router-dom"
import client from "@/lib/api/client"
import { toast } from "sonner"
import { useAuth } from "@/context/auth-context"

export function useChatRoom() {
    const navigate = useNavigate()
    const { user, openLoginModal } = useAuth()

    const enterChatRoom = async (params: { postId: number; category?: string }) => {
        if (!user) {
            toast.error("Please log in to message the seller.")
            openLoginModal()
            return
        }

        if (!params.postId) {
            toast.error("Invalid listing.")
            return
        }

        try {
            const res = await client.post("/chat/rooms", { postId: params.postId })
            const { roomId } = res.data
            navigate(`/chat/room/${roomId}`)
        } catch (error: unknown) {
            const msg = error instanceof AxiosError
                ? ((error.response?.data as { error?: string } | undefined)?.error ?? "Failed to open chat. Please try again.")
                : "Failed to open chat. Please try again."
            toast.error(msg)
        }
    }

    return { enterChatRoom }
}
