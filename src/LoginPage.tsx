import { useState } from 'react';
import { Eye, EyeOff, Lock, Mail, Users, BarChart2, Shield } from 'lucide-react';
import { supabase } from './lib/supabase';

interface LoginPageProps {
  onLogin: () => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError('Invalid email or password. Please try again.');
    } else {
      onLogin();
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div
        className="hidden lg:flex lg:w-[46%] flex-col justify-between p-10 relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #0d1b3e 0%, #0a2255 50%, #0d1b3e 100%)' }}
      >
        {/* Animated wave background */}
        <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.18 }}>
          <svg viewBox="0 0 800 600" className="absolute bottom-0 left-0 w-full" preserveAspectRatio="none">
            <path d="M0,400 C150,300 350,500 500,350 C650,200 750,400 800,300 L800,600 L0,600 Z" fill="#1a6fd4" />
            <path d="M0,450 C100,380 300,520 500,420 C700,320 750,460 800,380 L800,600 L0,600 Z" fill="#1458b0" opacity="0.7" />
            <path d="M0,500 C200,440 400,560 600,480 C700,440 750,500 800,460 L800,600 L0,600 Z" fill="#0d3d80" opacity="0.6" />
          </svg>
          {/* Dots grid */}
          {Array.from({ length: 80 }).map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full bg-blue-400"
              style={{
                width: 2, height: 2,
                left: `${(i % 10) * 10 + 4}%`,
                top: `${Math.floor(i / 10) * 12 + 8}%`,
                opacity: 0.3 + (i % 3) * 0.15,
              }}
            />
          ))}
        </div>

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/40">
            <span className="text-white font-bold text-base">M</span>
          </div>
          <div>
            <div className="text-white font-semibold text-sm leading-tight">Monty CRM</div>
            <div className="text-blue-300 text-xs leading-tight">Sales Hub</div>
          </div>
        </div>

        {/* Headline */}
        <div className="relative z-10">
          <h1 className="text-white text-3xl font-bold leading-tight mb-3">
            Welcome to<br />
            <span className="text-blue-400">Monty CRM</span>
          </h1>
          <p className="text-blue-200 text-sm leading-relaxed mb-8">
            The smarter way to manage your<br />customers and grow your business.
          </p>

          <div className="space-y-5">
            {[
              { icon: Users, title: 'Customer First', desc: 'Build stronger relationships and deliver exceptional customer experiences.' },
              { icon: BarChart2, title: 'Data Driven', desc: 'Turn your data into actionable insights and drive growth.' },
              { icon: Shield, title: 'Secure & Reliable', desc: 'Enterprise-grade security to keep your data safe and accessible.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-3.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon size={15} className="text-blue-300" />
                </div>
                <div>
                  <div className="text-white text-sm font-medium">{title}</div>
                  <div className="text-blue-300/80 text-xs leading-relaxed mt-0.5">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom filler */}
        <div className="relative z-10" />
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col bg-white">
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-sm">
            {/* Mobile logo */}
            <div className="flex items-center gap-3 mb-8 lg:hidden">
              <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
                <span className="text-white font-bold">M</span>
              </div>
              <div>
                <div className="font-semibold text-gray-900 text-sm">Monty CRM</div>
                <div className="text-gray-500 text-xs">Sales Hub</div>
              </div>
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mb-1">Sign in to your account</h2>
            <p className="text-gray-500 text-sm mb-7">Enter your credentials to access Monty CRM</p>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3 mb-5">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    placeholder="Enter your email"
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="Enter your password"
                    className="w-full pl-10 pr-11 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-medium text-sm rounded-lg py-2.5 transition-colors mt-2 shadow-sm"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in...
                  </span>
                ) : 'Sign in'}
              </button>
            </form>
          </div>
        </div>

        <div className="text-center text-xs text-gray-400 pb-6">
          &copy; 2026 Monty CRM. All rights reserved.
        </div>
      </div>
    </div>
  );
}
