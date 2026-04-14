/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface User {
    sub: string;       // email — used as unique ID & for ownership checks
    role: string;
    name: string;
    isBanned: boolean;
    profileImage?: string;
}

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (token: string) => void;
    logout: () => void;
    openLoginModal: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_KEY     = 'johnsql_user';
const TOKEN_KEY    = 'johnsql_token';
const LOGIN_TS_KEY = 'johnsql_login_at';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const API = () => import.meta.env.VITE_API_BASE_URL || '/api';

type Step = 'email' | 'otp';

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser]         = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const navigate = useNavigate();

    // ── Form state ────────────────────────────────────────────────────────────
    const [step, setStep]         = useState<Step>('email');
    const [inputName, setInputName]   = useState('');
    const [inputEmail, setInputEmail] = useState('');
    const [inputOtp, setInputOtp]     = useState('');
    const [emailError, setEmailError] = useState('');
    const [otpError, setOtpError]     = useState('');
    const [sending, setSending]       = useState(false);
    const [verifying, setVerifying]   = useState(false);
    const [countdown, setCountdown]   = useState(0); // resend cooldown

    // ── Session load on mount ─────────────────────────────────────────────────
    useEffect(() => {
        const controller = new AbortController();
        const load = async () => {
            try {
                const stored  = localStorage.getItem(USER_KEY);
                const loginAt = localStorage.getItem(LOGIN_TS_KEY);
                const token   = localStorage.getItem(TOKEN_KEY);
                if (stored && loginAt && token) {
                    if (Date.now() - parseInt(loginAt) > SESSION_TTL_MS) {
                        localStorage.removeItem(USER_KEY);
                        localStorage.removeItem(LOGIN_TS_KEY);
                        localStorage.removeItem(TOKEN_KEY);
                    } else {
                        const parsed: User = JSON.parse(stored);
                        if (!controller.signal.aborted) setUser(parsed);
                        // Re-verify ban status on every app load
                        try {
                            const res = await fetch(`${API()}/users/me`, {
                                headers: {
                                    'Authorization': `Bearer ${token}`,
                                },
                                signal: controller.signal,
                            });
                            if (controller.signal.aborted) return;
                            if (res.ok) {
                                const data = await res.json();
                                if (data.isBanned) {
                                    localStorage.removeItem(USER_KEY);
                                    localStorage.removeItem(LOGIN_TS_KEY);
                                    setUser(null);
                                    navigate('/banned', { replace: true });
                                    return;
                                }
                                const updated: User = { ...parsed, role: data.role || parsed.role, isBanned: false };
                                localStorage.setItem(USER_KEY, JSON.stringify(updated));
                                if (!controller.signal.aborted) setUser(updated);
                            }
                        } catch (err) {
                            if (err instanceof Error && err.name === 'AbortError') return;
                            /* Non-fatal — proceed with cached session */
                        }
                    }
                }
            } catch {
                /* ignore invalid persisted session state */
            }
            if (!controller.signal.aborted) setIsLoading(false);
        };
        void load();
        return () => controller.abort();
    }, [navigate]);

    // ── Countdown timer for resend ────────────────────────────────────────────
    useEffect(() => {
        if (countdown <= 0) return;
        const t = setTimeout(() => setCountdown(c => c - 1), 1000);
        return () => clearTimeout(t);
    }, [countdown]);

    // ── Reset modal state ─────────────────────────────────────────────────────
    const resetModal = () => {
        setStep('email');
        setInputName('');
        setInputEmail('');
        setInputOtp('');
        setEmailError('');
        setOtpError('');
        setSending(false);
        setVerifying(false);
        setCountdown(0);
    };

    const handleClose = (open: boolean) => {
        if (!open) resetModal();
        setShowModal(open);
    };

    // ── Step 1: Send OTP ──────────────────────────────────────────────────────
    const handleSendOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        const name  = inputName.trim();
        const email = inputEmail.trim().toLowerCase();
        if (!name) return;
        if (!email.endsWith('@illinois.edu')) {
            setEmailError('Please use your @illinois.edu email address.');
            return;
        }
        setEmailError('');
        setSending(true);
        try {
            const res = await fetch(`${API()}/auth/send-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, name }),
            });
            const data = await res.json();
            if (!res.ok) {
                setEmailError(data.error || 'Failed to send code.');
                return;
            }
            setStep('otp');
            setCountdown(60); // 60s cooldown before resend
        } catch {
            setEmailError('Network error. Please try again.');
        } finally {
            setSending(false);
        }
    };

    // ── Step 2: Verify OTP ────────────────────────────────────────────────────
    const handleVerifyOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        const code = inputOtp.trim();
        if (code.length !== 6) {
            setOtpError('Please enter the 6-digit code.');
            return;
        }
        setOtpError('');
        setVerifying(true);
        try {
            const res = await fetch(`${API()}/auth/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: inputEmail.trim().toLowerCase(), code, name: inputName.trim() }),
            });
            const data = await res.json();
            if (!res.ok) {
                if (data.error === 'banned') {
                    setShowModal(false);
                    navigate('/banned', { replace: true });
                    return;
                }
                setOtpError(data.error || 'Invalid code. Please try again.');
                return;
            }
            // Success — save token and user
            const u: User = {
                sub: data.email,
                name: data.name || inputName.trim(),
                role: data.role || 'student',
                isBanned: false,
            };
            localStorage.setItem(TOKEN_KEY, data.token);
            localStorage.setItem(USER_KEY, JSON.stringify(u));
            localStorage.setItem(LOGIN_TS_KEY, Date.now().toString());
            setUser(u);
            handleClose(false);
        } catch {
            setOtpError('Network error. Please try again.');
        } finally {
            setVerifying(false);
        }
    };

    // ── Resend OTP ────────────────────────────────────────────────────────────
    const handleResend = async () => {
        if (countdown > 0) return;
        setSending(true);
        try {
            await fetch(`${API()}/auth/send-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: inputEmail.trim().toLowerCase(), name: inputName.trim() }),
            });
            setCountdown(60);
            setOtpError('');
        } finally {
            setSending(false);
        }
    };

    // ── Logout ────────────────────────────────────────────────────────────────
    const logout = () => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem(LOGIN_TS_KEY);
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{
            user,
            isAuthenticated: !!user,
            isLoading,
            login: () => {},
            logout,
            openLoginModal: () => { resetModal(); setShowModal(true); },
        }}>
            {children}

            <Dialog open={showModal} onOpenChange={handleClose}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            {step === 'email' ? 'Sign in to johnSQL' : 'Check your email'}
                        </DialogTitle>
                    </DialogHeader>

                    {/* ── Step 1: Name + Email ── */}
                    {step === 'email' && (
                        <form onSubmit={handleSendOtp} className="space-y-4 pt-2">
                            <div className="space-y-2">
                                <Label htmlFor="login-name">Name</Label>
                                <Input
                                    id="login-name"
                                    placeholder="Your full name"
                                    value={inputName}
                                    onChange={e => setInputName(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="login-email">University Email</Label>
                                <Input
                                    id="login-email"
                                    type="email"
                                    placeholder="netid@illinois.edu"
                                    value={inputEmail}
                                    onChange={e => { setInputEmail(e.target.value); setEmailError(''); }}
                                    required
                                    className={emailError ? 'border-red-500 focus-visible:ring-red-500' : ''}
                                />
                                {emailError && (
                                    <p className="text-xs text-red-600 font-medium">{emailError}</p>
                                )}
                            </div>
                            <Button type="submit" className="w-full" disabled={sending}>
                                {sending ? 'Sending code...' : 'Send Verification Code'}
                            </Button>
                            <p className="text-xs text-center text-muted-foreground">
                                A 6-digit code will be sent to your <strong>@illinois.edu</strong> inbox.
                            </p>
                        </form>
                    )}

                    {/* ── Step 2: OTP Input ── */}
                    {step === 'otp' && (
                        <form onSubmit={handleVerifyOtp} className="space-y-4 pt-2">
                            <div className="bg-muted/50 rounded-lg px-4 py-3 text-sm text-muted-foreground">
                                Code sent to <strong className="text-foreground">{inputEmail}</strong>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="login-otp">6-Digit Code</Label>
                                <Input
                                    id="login-otp"
                                    placeholder="123456"
                                    value={inputOtp}
                                    onChange={e => {
                                        const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                                        setInputOtp(v);
                                        setOtpError('');
                                    }}
                                    maxLength={6}
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    autoFocus
                                    className={`text-center text-2xl tracking-[0.5em] font-mono ${otpError ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                                    required
                                />
                                {otpError && (
                                    <p className="text-xs text-red-600 font-medium">{otpError}</p>
                                )}
                            </div>
                            <Button type="submit" className="w-full" disabled={verifying || inputOtp.length !== 6}>
                                {verifying ? 'Verifying...' : 'Verify & Sign In'}
                            </Button>
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <button
                                    type="button"
                                    className="hover:text-foreground transition-colors"
                                    onClick={() => { setStep('email'); setInputOtp(''); setOtpError(''); }}
                                >
                                    ← Change email
                                </button>
                                <button
                                    type="button"
                                    disabled={countdown > 0 || sending}
                                    onClick={handleResend}
                                    className="hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {countdown > 0 ? `Resend in ${countdown}s` : 'Resend code'}
                                </button>
                            </div>
                        </form>
                    )}
                </DialogContent>
            </Dialog>
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
