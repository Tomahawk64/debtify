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

  const FormCard = ({ compact }) => (
    <div
      className={`w-full ${compact ? 'max-w-sm' : 'max-w-md'} bg-white/85 backdrop-blur-xl border border-white/60 shadow-2xl shadow-primary-900/20 rounded-3xl p-8 ${compact ? '' : 'lg:p-10'}`}
    >
      <h2 className="text-2xl font-semibold text-gray-900 mb-1 tracking-tight">Welcome back</h2>
      <p className="text-sm text-gray-500 mb-7">Sign in to your account to continue</p>

      <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              id="email" name="email" type="email" autoComplete="email" required
              value={formData.email} onChange={handleChange}
              placeholder="you@company.com"
              className="w-full pl-10 pr-3 py-2.5 bg-white/70 border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-shadow"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required
              value={formData.password} onChange={handleChange}
              placeholder="••••••••"
              className="w-full pl-10 pr-10 py-2.5 bg-white/70 border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-shadow"
            />
            <button
              type="button" tabIndex={-1} onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
            {error}
          </div>
        )}

        <button
          type="submit" disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed bg-gradient-to-r from-primary-600 to-primary-800 hover:from-primary-700 hover:to-primary-900 shadow-lg shadow-primary-900/25"
        >
          {isSubmitting
            ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Signing in…</>
            : <>Sign in <ArrowRight className="h-4 w-4" /></>}
        </button>
      </form>
    </div>
  );

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
        <div className="flex-1 flex items-start justify-center px-5 -mt-10 pb-10">
          <FormCard compact />
        </div>
      </div>

      {/* ───────── Desktop (lg+) ───────── */}
      <div className="hidden lg:block relative min-h-screen overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/loginpage.jpg')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-black/10 to-transparent" />

        <div className="relative z-10 min-h-screen flex flex-col justify-between px-16 py-10">
          <div className="flex items-center gap-3">
            <img src="/favicon.svg" alt="Debtify" className="h-10 w-10 drop-shadow-lg" />
            <span className="text-2xl font-bold text-white tracking-tight" style={{ textShadow: '0 2px 16px rgba(0,0,0,0.35)' }}>Debtify</span>
          </div>

          <div className="flex items-center justify-between gap-16 flex-1">
            <div className="max-w-md">
              <h1
                className="text-5xl font-bold leading-tight mb-5 text-white"
                style={{ textShadow: '0 4px 24px rgba(0,0,0,0.35)' }}
              >
                Manage leads.<br />Close faster.
              </h1>
              <p className="text-white/90 text-base leading-relaxed mb-10" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.3)' }}>
                A single, secure platform for your sales team to track, assign, and convert leads in real time.
              </p>
              <div className="space-y-4">
                {FEATURES.map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center flex-shrink-0">
                      <Icon className="h-4 w-4 text-white" />
                    </div>
                    <span className="text-sm text-white/90" style={{ textShadow: '0 1px 8px rgba(0,0,0,0.3)' }}>{text}</span>
                  </div>
                ))}
              </div>
            </div>

            <FormCard />
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
