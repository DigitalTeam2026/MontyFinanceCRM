import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { fetchCompanyProfile, getCachedCompanyProfile, type CompanyProfile } from './services/companyProfileService';

interface LoginPageProps {
  onLogin: () => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Instant first paint from the cached branding, then refresh from the database.
  const [brand, setBrand] = useState<CompanyProfile>(() => getCachedCompanyProfile());

  useEffect(() => {
    let cancelled = false;
    fetchCompanyProfile().then((p) => { if (!cancelled) setBrand(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

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
    <>
      <style>{`
        .mf-login{
          --bg:#F7F6F3;--surface:#FFFFFF;--navy:#16213B;--navy-deep:#0F1830;--gold:#C9A14E;
          --gold-soft:#E3C98E;--blue:#2F4DC8;--green:#1FA45C;--muted:#6B7280;--line:#E7E5DF;--radius:16px;
          font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--navy);
          min-height:100vh;display:flex;flex-direction:column;overflow-x:hidden;-webkit-font-smoothing:antialiased;
        }
        .mf-login *{margin:0;padding:0;box-sizing:border-box;}

        .mf-login .stage{position:relative;flex:1;display:grid;grid-template-columns:1.15fr 1fr;align-items:center;gap:48px;padding:48px 72px;}
        .mf-login .stage::before{content:"";position:absolute;inset:0;background:radial-gradient(700px 560px at 10% 70%, rgba(201,161,78,.07), transparent 65%),radial-gradient(560px 480px at 45% 18%, rgba(47,77,200,.05), transparent 60%);pointer-events:none;}

        .mf-login header{display:flex;align-items:center;justify-content:flex-end;gap:16px;padding:30px 72px 0;position:relative;z-index:1;}
        .mf-login .brandlogo{height:36px;width:auto;max-width:180px;object-fit:contain;display:block;}
        .mf-login .wordmark{font-family:'Playfair Display',serif;font-weight:800;font-size:22px;letter-spacing:.2px;}
        .mf-login .wordmark sup{font-family:'Inter',sans-serif;font-size:9px;font-weight:700;letter-spacing:.12em;color:var(--gold);margin-left:4px;}
        .mf-login .divider{width:1px;height:30px;background:var(--line);}
        .mf-login .product{line-height:1.25;}
        .mf-login .product b{font-size:14px;display:block;font-weight:700;}
        .mf-login .product span{font-size:10px;letter-spacing:.3em;color:var(--gold);font-weight:700;text-transform:uppercase;}

        .mf-login .hero{position:relative;z-index:1;max-width:600px;}
        .mf-login h1{font-family:'Playfair Display',serif;font-weight:700;font-size:clamp(42px,5vw,68px);line-height:1.08;letter-spacing:-.01em;margin-bottom:26px;}
        .mf-login h1 .gold{color:var(--gold);}
        .mf-login .hero p{font-size:16.5px;line-height:1.7;color:var(--muted);max-width:46ch;}
        .mf-login .feat-row{display:flex;gap:34px;margin-top:34px;flex-wrap:wrap;}
        .mf-login .feat{display:flex;align-items:center;gap:12px;}
        .mf-login .feat .icon{width:42px;height:42px;border:1.5px solid var(--navy);border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
        .mf-login .feat .icon svg{width:18px;height:18px;stroke:var(--navy);fill:none;stroke-width:1.8;}
        .mf-login .feat b{display:block;font-size:14px;font-weight:700;}
        .mf-login .feat span{font-size:12.5px;color:var(--muted);}

        .mf-login .card{position:relative;z-index:1;justify-self:end;width:min(400px,100%);background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:36px 32px 30px;box-shadow:0 1px 2px rgba(22,33,59,.05),0 28px 60px -28px rgba(22,33,59,.22);}
        .mf-login .card::before{content:"";position:absolute;top:0;left:26px;right:26px;height:2px;border-radius:0 0 2px 2px;background:linear-gradient(90deg,transparent,var(--gold),transparent);}
        .mf-login .card h2{font-family:'Playfair Display',serif;font-weight:700;font-size:27px;margin-bottom:6px;}
        .mf-login .card .sub{font-size:14px;color:var(--muted);margin-bottom:26px;}
        .mf-login .err{background:rgba(225,29,72,.07);border:1px solid rgba(225,29,72,.3);color:#e11d48;font-size:13px;border-radius:10px;padding:11px 14px;margin-bottom:18px;}
        .mf-login label{display:block;font-size:13px;font-weight:600;margin-bottom:7px;}
        .mf-login .field{position:relative;margin-bottom:18px;}
        .mf-login .field>svg{position:absolute;left:13px;top:50%;transform:translateY(-50%);width:16px;height:16px;stroke:var(--muted);fill:none;stroke-width:1.6;pointer-events:none;}
        .mf-login .field input{width:100%;font:inherit;font-size:14px;color:var(--navy);background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:12px 40px 12px 38px;transition:border-color .15s, box-shadow .15s, background .15s;}
        .mf-login .field input::placeholder{color:#A3A8B3;}
        .mf-login .field input:focus{outline:none;background:#fff;border-color:var(--blue);box-shadow:0 0 0 3px rgba(47,77,200,.13);}
        .mf-login .toggle{position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:none;padding:8px;cursor:pointer;color:var(--muted);display:flex;}
        .mf-login .toggle svg{position:static;transform:none;width:17px;height:17px;stroke:currentColor;fill:none;stroke-width:1.6;}
        .mf-login .toggle:focus-visible{outline:2px solid var(--blue);border-radius:8px;}
        .mf-login .forgot{display:block;text-align:right;font-size:13px;font-weight:600;color:var(--blue);text-decoration:none;background:none;border:none;cursor:pointer;font-family:inherit;margin:-6px 0 22px;margin-left:auto;}
        .mf-login .forgot:hover{text-decoration:underline;}
        .mf-login .signin{width:100%;font:inherit;font-size:15px;font-weight:700;color:#FCF9F2;background:linear-gradient(180deg,var(--navy) 0%,var(--navy-deep) 100%);border:none;border-radius:11px;padding:14px 18px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:transform .12s, box-shadow .15s, filter .15s;box-shadow:0 12px 26px -12px rgba(22,33,59,.55);}
        .mf-login .signin:hover{filter:brightness(1.18);transform:translateY(-1px);}
        .mf-login .signin:active{transform:translateY(0);}
        .mf-login .signin:disabled{opacity:.75;cursor:default;transform:none;filter:none;}
        .mf-login .signin:focus-visible{outline:3px solid var(--gold);outline-offset:2px;}
        .mf-login .signin .arrow{color:var(--gold-soft);transition:transform .15s;}
        .mf-login .signin:hover .arrow{transform:translateX(3px);}
        .mf-login .spin{width:15px;height:15px;border:2px solid rgba(252,249,242,.45);border-top-color:#FCF9F2;border-radius:50%;animation:mf-sp .7s linear infinite;}
        @keyframes mf-sp{to{transform:rotate(360deg);}}
        .mf-login .secure{display:flex;align-items:center;justify-content:center;gap:7px;margin-top:16px;font-size:12px;color:var(--muted);}
        .mf-login .secure svg{width:13px;height:13px;stroke:var(--green);fill:none;stroke-width:2;}

        .mf-login footer{padding:0 72px 26px;font-size:12px;color:var(--muted);position:relative;z-index:1;}

        @media (max-width:900px){
          .mf-login header{padding:24px 24px 0;}
          .mf-login .stage{grid-template-columns:1fr;gap:40px;padding:40px 24px;}
          .mf-login .card{justify-self:stretch;}
          .mf-login .feat-row{flex-wrap:wrap;gap:20px;}
          .mf-login footer{padding:0 24px 24px;}
        }
        @media (prefers-reduced-motion: reduce){.mf-login *{transition:none !important;}}
      `}</style>

      <div className="mf-login">
        <header>
          {brand.logo_url
            ? <img className="brandlogo" src={brand.logo_url} alt={brand.company_name} />
            : <div className="wordmark">{brand.company_name}<sup>SAL</sup></div>}
        </header>

        <main className="stage">
          <section className="hero">
            <h1>The smarter way to grow <span className="gold">your business.</span></h1>
            <p>Manage every customer, conversation, and deal from one workspace built for momentum.</p>

            <div className="feat-row">
              <div className="feat">
                <div className="icon"><svg viewBox="0 0 24 24"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" /><path d="M9 12l2 2 4-4" /></svg></div>
                <div><b>Secure</b><span>BDL Licensed</span></div>
              </div>
              <div className="feat">
                <div className="icon"><svg viewBox="0 0 24 24"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" /></svg></div>
                <div><b>Fast</b><span>Instant Access</span></div>
              </div>
              <div className="feat">
                <div className="icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z" /></svg></div>
                <div><b>Inclusive</b><span>For Everyone</span></div>
              </div>
            </div>
          </section>

          <section className="card" aria-label="Sign in">
            <h2>Welcome back</h2>
            <p className="sub">Sign in to your workspace to continue.</p>

            {error && <div className="err">{error}</div>}

            <form onSubmit={handleSubmit}>
              <label htmlFor="mf-email">Email</label>
              <div className="field">
                <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
                <input
                  id="mf-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  placeholder="you@company.com"
                  autoComplete="email"
                />
              </div>

              <label htmlFor="mf-password">Password</label>
              <div className="field">
                <svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
                <input
                  id="mf-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••••"
                  autoComplete="current-password"
                />
                <button
                  className="toggle"
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  <svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
                </button>
              </div>

              <button type="button" className="forgot">Forgot password?</button>

              <button className="signin" type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <span className="spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign in <span className="arrow">→</span>
                  </>
                )}
              </button>
            </form>

            <div className="secure">
              <svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
              Regulated by the Central Bank of Lebanon
            </div>
          </section>
        </main>

        <footer>&copy; 2026 {brand.company_name}. All rights reserved.</footer>
      </div>
    </>
  );
}
