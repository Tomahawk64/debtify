import React, { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Eye, EyeOff, Mail, Lock, ArrowRight, ShieldCheck, Zap, BarChart3 } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';

const FEATURES = [
  { icon: ShieldCheck, text: 'Secure, role-based access control' },
  { icon: Zap, text: 'Real-time lead updates' },
  { icon: BarChart3, text: 'Built-in analytics & reporting' },
];

const FormCard = ({ compact, formData, handleChange, handleSubmit, showPassword, setShowPassword, error, isSubmitting }) => (
  <div className={`relative w-full ${compact ? 'max-w-sm' : 'max-w-[420px]'}`}>
    {/* soft brand glow behind the card */}
    {!compact && (
      <div className="absolute -inset-6 bg-primary-400/25 blur-3xl rounded-[48px] -z-10" aria-hidden="true" />
    )}

    {/* gradient ring frame */}
    <div className="p-px rounded-[28px] bg-gradient-to-br from-white/90 via-primary-200/50 to-white/40 shadow-2xl shadow-primary-950/20">
      <div className={`rounded-[27px] bg-white/90 backdrop-blur-2xl p-8 ${compact ? '' : 'lg:p-10'}`}>

        <h2 className="text-[26px] font-bold text-gray-900 mb-1.5 tracking-tight">Welcome back</h2>
        <div className="h-1 w-10 rounded-full bg-gradient-to-r from-primary-500 to-primary-300 mb-4" />
        <p className="text-sm text-gray-500 mb-7">Sign in to your account to continue</p>

        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
          <div>
            <label htmlFor="email" className="block text-xs font-semibold text-gray-600 tracking-wide uppercase mb-2">Email address</label>
            <div className="relative">
              <div className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg bg-primary-50 flex items-center justify-center pointer-events-none">
                <Mail className="h-3.5 w-3.5 text-primary-600" />
              </div>
              <input
                id="email" name="email" type="email" autoComplete="email" required
                value={formData.email} onChange={handleChange}
                placeholder="you@company.com"
                className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200/80 rounded-2xl text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-all focus:outline-none focus:bg-white focus:border-primary-400 focus:ring-4 focus:ring-primary-500/10"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-semibold text-gray-600 tracking-wide uppercase mb-2">Password</label>
            <div className="relative">
              <div className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg bg-primary-50 flex items-center justify-center pointer-events-none">
                <Lock className="h-3.5 w-3.5 text-primary-600" />
              </div>
              <input
                id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required
                value={formData.password} onChange={handleChange}
                placeholder="••••••••"
                className="w-full pl-12 pr-11 py-3 bg-gray-50 border border-gray-200/80 rounded-2xl text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-all focus:outline-none focus:bg-white focus:border-primary-400 focus:ring-4 focus:ring-primary-500/10"
              />
              <button
                type="button" tabIndex={-1} onClick={() => setShowPassword(v => !v)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-primary-600 transition-colors"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3.5 py-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit" disabled={isSubmitting}
            className="group relative w-full overflow-hidden flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white text-sm font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed bg-gradient-to-r from-primary-600 via-primary-700 to-primary-800 shadow-lg shadow-primary-900/30 hover:shadow-xl hover:shadow-primary-900/40 hover:-translate-y-0.5"
          >
            <span className="pointer-events-none absolute inset-0 -translate-x-[120%] skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-[120%]" />
            <span className="relative flex items-center gap-2">
              {isSubmitting
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Signing in…</>
                : <>Sign in <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></>}
            </span>
          </button>
        </form>
      </div>
    </div>
  </div>
);

const Login = () => {
  const { login, isAuthenticated, loading, user, clearError } = useAuth();
  const location = useLocation();

  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { clearError(); }, []); // eslint-disable-line

  if (loading) return <LoadingSpinner message="Checking authentication..." />;

  if (isAuthenticated && user) {
    const MAP = { superadmin: '/super-admin-dashboard', admin: '/admin-dashboard', restricted_admin: '/restricted-dashboard', agent1: '/agent1-dashboard', agent2: '/agent2-dashboard' };
    const dest = location.state?.from?.pathname || MAP[user.role] || '/dashboard';
    return <Navigate to={dest} replace />;
  }

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault(); setIsSubmitting(true); setError('');
    try { const r = await login(formData); if (!r.success) setError(r.error || 'Invalid email or password'); }
    catch { setError('Invalid email or password'); }
    finally { setIsSubmitting(false); }
  };

  const formProps = { formData, handleChange, handleSubmit, showPassword, setShowPassword, error, isSubmitting };

  return (
    <div className="min-h-screen font-sans bg-gray-50">

      {/* ───────── Mobile / tablet (< lg) ───────── */}
      <div className="lg:hidden min-h-screen flex flex-col">
        <div
          className="relative h-48 flex-shrink-0 bg-cover"
          style={{ backgroundImage: "url('/loginpage-sm.jpg')", backgroundPosition: '75% center' }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-gray-50 via-transparent to-black/20" />
          <div className="relative flex items-center gap-2.5 p-6">
            <img src="/favicon.svg" alt="Debtify" className="h-8 w-8 drop-shadow" />
            <span className="text-xl font-bold text-white tracking-tight drop-shadow">Debtify</span>
          </div>
        </div>
        <div className="flex-1 flex items-start justify-center px-5 -mt-10 pb-10 animate-fade-in">
          <FormCard compact {...formProps} />
        </div>
      </div>

      {/* ───────── Desktop (lg+) ───────── */}
      <div className="hidden lg:block relative min-h-screen overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/loginpage.jpg')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-black/10 to-transparent" />

        {/* ambient brand glow blobs */}
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-primary-400/15 rounded-full blur-3xl animate-pulse-slow pointer-events-none" />
        <div className="absolute bottom-10 right-1/3 w-72 h-72 bg-amber-300/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 min-h-screen flex flex-col justify-between px-16 py-10">
          <div className="flex items-center gap-3 animate-fade-in">
            <img src="/favicon.svg" alt="Debtify" className="h-10 w-10 drop-shadow-lg" />
            <span className="text-2xl font-bold text-white tracking-tight" style={{ textShadow: '0 2px 16px rgba(0,0,0,0.35)' }}>Debtify</span>
          </div>

          <div className="flex items-center justify-between gap-16 flex-1">
            <div className="max-w-md animate-fade-in">
              <h1 className="text-5xl font-bold leading-tight mb-5 text-white" style={{ textShadow: '0 4px 24px rgba(0,0,0,0.35)' }}>
                Manage leads.<br />
                <span
                  className="bg-gradient-to-r from-white to-primary-200 bg-clip-text text-transparent"
                  style={{ filter: 'drop-shadow(0 4px 20px rgba(0,0,0,0.4))' }}
                >
                  Close faster.
                </span>
              </h1>
              <p className="text-white/90 text-base leading-relaxed mb-10" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.3)' }}>
                A single, secure platform for your sales team to track, assign, and convert leads in real time.
              </p>
              <div className="space-y-4">
                {FEATURES.map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-white/25 to-white/5 backdrop-blur-sm border border-white/25 flex items-center justify-center flex-shrink-0 shadow-lg">
                      <Icon className="h-4 w-4 text-white" />
                    </div>
                    <span className="text-sm text-white/90" style={{ textShadow: '0 1px 8px rgba(0,0,0,0.3)' }}>{text}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="animate-fade-in" style={{ animationDelay: '120ms', animationFillMode: 'backwards' }}>
              <FormCard {...formProps} />
            </div>
          </div>

          <p className="text-xs text-white/70" style={{ textShadow: '0 1px 8px rgba(0,0,0,0.3)' }}>
            &copy; {new Date().getFullYear()} Debtify. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
