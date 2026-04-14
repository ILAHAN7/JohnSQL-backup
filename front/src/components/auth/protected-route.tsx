import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/auth-context";
import { toast } from "sonner";

interface ProtectedRouteProps {
    children: React.ReactNode;
    allowedRoles?: string[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
    const { user, isAuthenticated, isLoading, openLoginModal } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (!isLoading) {
            if (!isAuthenticated) {
                toast.error("Please log in to access this page.");
                openLoginModal();
                navigate("/", { replace: true });
            } else if (user?.isBanned) {
                navigate("/banned", { replace: true });
            } else if (allowedRoles && user && !allowedRoles.includes(user.role)) {
                toast.error("You don't have permission to access this page.");
                navigate("/", { replace: true });
            }
        }
    }, [isLoading, isAuthenticated, user, allowedRoles, openLoginModal, navigate]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (!isAuthenticated || user?.isBanned) {
        return null;
    }

    if (allowedRoles && user && !allowedRoles.includes(user.role)) {
        return null;
    }

    return <>{children}</>;
}
