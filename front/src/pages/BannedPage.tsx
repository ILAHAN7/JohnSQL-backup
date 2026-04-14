import { Button } from "@/components/ui/button"
import { ShieldAlert } from "lucide-react"

export function BannedPage() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center">
            <div className="bg-red-50 p-10 rounded-2xl border border-red-100 max-w-md w-full shadow-sm">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <ShieldAlert className="h-8 w-8 text-red-600" />
                </div>
                <h1 className="text-2xl font-bold text-slate-900 mb-2">Account Suspended</h1>
                <p className="text-slate-600 mb-8 leading-relaxed">
                    Your account has been suspended due to a violation of our community guidelines.
                    If you believe this is a mistake or would like to appeal, please contact a campus administrator.
                </p>
                <div className="space-y-3">
                    <Button
                        className="w-full bg-red-600 hover:bg-red-700"
                        onClick={() => window.location.href = 'mailto:admin@johnsql.app'}
                    >
                        Contact Administrator
                    </Button>
                    <Button
                        variant="ghost"
                        className="w-full text-slate-500 hover:text-slate-700"
                        onClick={() => window.location.href = '/'}
                    >
                        Return to Home
                    </Button>
                </div>
                <p className="mt-8 text-xs text-slate-400">
                    johnSQL Community Administration
                </p>
            </div>
        </div>
    )
}
