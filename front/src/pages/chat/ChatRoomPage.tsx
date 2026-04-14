import { useEffect, useState, useRef, useCallback } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useAuth } from "@/context/auth-context"
import client from "@/lib/api/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowLeft, Send, MessageCircle } from "lucide-react"
import { toast } from "sonner"

interface Message {
    id: number
    senderId: number
    senderEmail: string
    senderName: string
    content: string
    isRead: boolean
    createdAt: string
}

interface RoomInfo {
    roomId: number
    postId: number
    postTitle: string
    partnerName: string
    partnerId: number
}

export function ChatRoomPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const { user } = useAuth()

    // TODO: replace with dynamic campus slug from room info when multi-campus is supported
    const CAMPUS_SLUG = 'uiuc'

    const [room, setRoom]         = useState<RoomInfo | null>(null)
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput]       = useState("")
    const [sending, setSending]   = useState(false)
    const [loading, setLoading]   = useState(true)
    const bottomRef               = useRef<HTMLDivElement>(null)
    const wsRef                   = useRef<WebSocket | null>(null)

    const scrollToBottom = () => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    // ── Fetch room + initial messages ─────────────────────────────────────────
    const fetchMessages = useCallback(async () => {
        if (!id) return
        try {
            const res = await client.get(`/chat/room/${id}/messages`)
            setMessages(res.data)
        } catch {
            // silent
        }
    }, [id])

    useEffect(() => {
        if (!id) return
        const init = async () => {
            try {
                const [roomRes] = await Promise.all([
                    client.get(`/chat/room/${id}`),
                ])
                setRoom(roomRes.data)
                await fetchMessages()
                await client.post(`/chat/room/${id}/read`).catch(() => {})
            } catch {
                toast.error("Failed to load conversation.")
                navigate('/mypage')
            } finally {
                setLoading(false)
            }
        }
        init()
    }, [id, navigate, fetchMessages])

    // Scroll to bottom on new messages
    useEffect(() => { scrollToBottom() }, [messages])

    // WebSocket for real-time messages (with HTTP polling fallback)
    useEffect(() => {
        if (!id) return

        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const wsUrl = `${wsProtocol}//${window.location.host}/ws/chat`

        let fallbackInterval: ReturnType<typeof setInterval> | null = null

        try {
            const ws = new WebSocket(wsUrl)
            wsRef.current = ws

            ws.onopen = () => {
                // Authenticate first with JWT, then subscribe to room
                const token = localStorage.getItem('johnsql_token')
                if (token) {
                    ws.send(JSON.stringify({ type: 'auth', token }))
                }
                ws.send(JSON.stringify({ type: 'subscribe', roomId: parseInt(id) }))
            }

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data)
                    if (data.type === 'new_message' && data.message) {
                        setMessages(prev => {
                            if (prev.some(m => m.id === data.message.id)) return prev
                            return [...prev, data.message]
                        })
                        client.post(`/chat/room/${id}/read`).catch(() => {})
                    }
                } catch { /* ignore */ }
            }

            ws.onerror = () => {
                // Fallback to polling if WS fails
                fallbackInterval = setInterval(fetchMessages, 4000)
            }

            ws.onclose = () => {
                // Fallback to polling on disconnect
                if (!fallbackInterval) {
                    fallbackInterval = setInterval(fetchMessages, 4000)
                }
            }
        } catch {
            // WebSocket not supported, fallback to polling
            fallbackInterval = setInterval(fetchMessages, 4000)
        }

        return () => {
            if (wsRef.current) {
                wsRef.current.close()
                wsRef.current = null
            }
            if (fallbackInterval) clearInterval(fallbackInterval)
        }
    }, [id, fetchMessages])

    // ── Send message ──────────────────────────────────────────────────────────
    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!input.trim() || sending) return
        setSending(true)
        try {
            await client.post(`/chat/room/${id}/messages`, { content: input.trim() })
            setInput("")
            await fetchMessages()
        } catch {
            toast.error("Failed to send message.")
        } finally {
            setSending(false)
        }
    }

    if (loading) return (
        <div className="flex items-center justify-center h-[70vh] text-muted-foreground">
            Loading conversation...
        </div>
    )

    return (
        <div className="container max-w-2xl mx-auto py-6 px-4 flex flex-col h-[calc(100vh-80px)]">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4 pb-4 border-b">
                <Button variant="ghost" size="icon" onClick={() => navigate('/mypage')}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <MessageCircle className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm leading-tight truncate">{room?.partnerName}</p>
                    <p className="text-xs text-muted-foreground truncate">re: {room?.postTitle}</p>
                </div>
                <Button
                    variant="outline" size="sm"
                    onClick={() => navigate(`/campus/${CAMPUS_SLUG}/listings/${room?.postId}`)}
                >
                    View Listing
                </Button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-3 pb-2">
                {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
                        <MessageCircle className="h-10 w-10 opacity-20" />
                        <p className="text-sm">No messages yet. Say hi!</p>
                    </div>
                ) : messages.map(msg => {
                    const isMine = msg.senderEmail === user?.sub
                    return (
                        <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[75%] space-y-1`}>
                                {!isMine && (
                                    <p className="text-[10px] text-muted-foreground ml-1">{msg.senderName}</p>
                                )}
                                <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                                    isMine
                                        ? 'bg-primary text-primary-foreground rounded-br-sm'
                                        : 'bg-muted text-foreground rounded-bl-sm'
                                }`}>
                                    {msg.content}
                                </div>
                                <p className={`text-[10px] text-muted-foreground ${isMine ? 'text-right mr-1' : 'ml-1'}`}>
                                    {new Date(msg.createdAt).toLocaleTimeString('en-US', {
                                        hour: '2-digit', minute: '2-digit'
                                    })}
                                </p>
                            </div>
                        </div>
                    )
                })}
                <div ref={bottomRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSend} className="flex gap-2 pt-4 border-t">
                <Input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1"
                    disabled={sending}
                    autoFocus
                />
                <Button type="submit" size="icon" disabled={!input.trim() || sending}>
                    <Send className="h-4 w-4" />
                </Button>
            </form>
        </div>
    )
}
