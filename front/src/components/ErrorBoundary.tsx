import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="p-10 text-red-600 bg-white h-screen w-screen">
                    <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
                    <p className="text-gray-600 mb-4">An unexpected error occurred. Please try refreshing the page.</p>
                    {import.meta.env.DEV && (
                        <pre className="bg-gray-100 p-4 rounded overflow-auto border border-red-200">
                            {this.state.error?.toString()}
                            <br />
                            {this.state.error?.stack}
                        </pre>
                    )}
                    <button
                        className="mt-4 px-4 py-2 bg-primary text-white rounded hover:bg-primary/90"
                        onClick={() => window.location.reload()}
                    >
                        Reload Page
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
