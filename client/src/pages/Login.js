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

  return (
    <div className="min-h-screen flex font-sans">

      {/* LEFT — brand panel */}
      <div className="hidden lg:flex lg:w-[42%] flex-col justify-between bg-gradient-to-br from-primary-800 via-primary-700 to-primary-900 text-white p-12">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
            <img src="/favicon.svg" alt="Debtify" className="h-6 w-6" />
          </div>
          <span className="text-xl font-bold tracking-tight">Debtify</span>
        </div>

        <div>
          <h1 className="text-4xl font-bold leading-tight mb-4">
            Manage leads.<br />Close faster.
          </h1>
          <p className="text-primary-100 text-sm leading-relaxed max-w-sm mb-10">
            A single, secure platform for your sales team to track, assign, and convert leads in real time.
          </p>
          <div className="space-y-4">
            {FEATURES.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-sm text-primary-50">{text}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-primary-200">&copy; {new Date().getFullYear()} Debtify. All rights reserved.</p>
      </div>

      {/* RIGHT — form */}
      <div className="flex-1 flex items-center justify-center bg-gray-50 p-6 sm:p-10">
        <div className="w-full max-w-sm">

          <div className="lg:hidden flex items-center gap-2.5 justify-center mb-8">
            <img src="/favicon.svg" alt="Debtify" className="h-8 w-8" />
            <span className="text-2xl font-bold text-gray-900 tracking-tight">Debtify</span>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-1">Welcome back</h2>
            <p className="text-sm text-gray-500 mb-6">Sign in to your account to continue</p>

            <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <input
                    id="email" name="email" type="email" autoComplete="email" required
                    value={formData.email} onChange={handleChange}
                    placeholder="you@company.com"
                    className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
                    className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit" disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-white text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed bg-primary-600 hover:bg-primary-700"
              >
                {isSubmitting
                  ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Signing in…</>
                  : <>Sign in <ArrowRight className="h-4 w-4" /></>}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">&copy; {new Date().getFullYear()} Debtify. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
