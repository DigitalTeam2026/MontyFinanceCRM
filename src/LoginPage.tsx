import { useState } from 'react';
import { Eye, EyeOff, Lock, Mail, ArrowRight } from 'lucide-react';
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
    <>
      <style>{`
        .lg-root{position:relative;min-height:100vh;overflow:hidden;background:#05070d;color:#eef2f8;font-family:'Plus Jakarta Sans','Inter',system-ui,sans-serif;-webkit-font-smoothing:antialiased;}
        .lg-mesh{position:fixed;inset:0;overflow:hidden;z-index:0;}
        .lg-blob{position:absolute;border-radius:50%;filter:blur(80px);opacity:.55;}
        .lg-b1{width:46vw;height:46vw;background:#3b6fff;top:-12%;left:-8%;animation:lg-d1 18s ease-in-out infinite;}
        .lg-b2{width:40vw;height:40vw;background:#16b8d4;bottom:-15%;left:18%;animation:lg-d2 22s ease-in-out infinite;}
        .lg-b3{width:34vw;height:34vw;background:#7c5cff;top:24%;left:5%;opacity:.4;animation:lg-d3 26s ease-in-out infinite;}
        @keyframes lg-d1{0%,100%{transform:translate(0,0) scale(1);}50%{transform:translate(14%,10%) scale(1.18);}}
        @keyframes lg-d2{0%,100%{transform:translate(0,0) scale(1);}50%{transform:translate(-12%,-8%) scale(1.12);}}
        @keyframes lg-d3{0%,100%{transform:translate(0,0) scale(1);}50%{transform:translate(-8%,14%) scale(1.25);}}
        .lg-mesh::after{content:"";position:absolute;inset:0;background:radial-gradient(120% 120% at 30% 50%, transparent 38%, rgba(0,0,0,.55) 100%);}
        .lg-wrap{position:relative;z-index:2;display:flex;min-height:100vh;}
        .lg-brand{width:52%;display:flex;flex-direction:column;justify-content:space-between;padding:54px 56px;}
        .lg-logo{display:flex;align-items:center;gap:12px;opacity:0;transform:translateY(16px);animation:lg-rise .7s .05s cubic-bezier(.22,1,.36,1) forwards;}
        .lg-mark{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;font-weight:800;font-size:20px;color:#fff;background:linear-gradient(135deg,#4f8cff,#22d3ee);box-shadow:0 8px 24px rgba(79,140,255,.5),inset 0 1px 0 rgba(255,255,255,.4);}
        .lg-name{font-weight:700;font-size:16px;letter-spacing:-.01em;}
        .lg-sub{font-size:10.5px;letter-spacing:.22em;text-transform:uppercase;color:#6b7689;margin-top:2px;}
        .lg-mid{max-width:480px;}
        .lg-badge{display:inline-flex;align-items:center;gap:8px;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#bcd3ff;background:rgba(79,140,255,.12);border:1px solid rgba(79,140,255,.25);padding:6px 12px;border-radius:99px;margin-bottom:26px;opacity:0;transform:translateY(16px);animation:lg-rise .7s .12s cubic-bezier(.22,1,.36,1) forwards;}
        .lg-dot{width:6px;height:6px;border-radius:50%;background:#4f8cff;box-shadow:0 0 8px #4f8cff;}
        .lg-headline{font-size:52px;font-weight:800;line-height:1.05;letter-spacing:-.03em;opacity:0;transform:translateY(16px);animation:lg-rise .7s .18s cubic-bezier(.22,1,.36,1) forwards;}
        .lg-headline span{background:linear-gradient(120deg,#4f8cff,#22d3ee);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;}
        .lg-lede{margin-top:22px;font-size:16px;line-height:1.6;color:#9aa6bd;max-width:420px;opacity:0;transform:translateY(16px);animation:lg-rise .7s .26s cubic-bezier(.22,1,.36,1) forwards;}
        .lg-copy{font-size:12px;color:#6b7689;opacity:0;transform:translateY(16px);animation:lg-rise .7s .34s cubic-bezier(.22,1,.36,1) forwards;}
        @keyframes lg-rise{to{opacity:1;transform:none;}}
        .lg-formside{flex:1;display:flex;align-items:center;justify-content:center;padding:40px;}
        .lg-card{position:relative;width:380px;max-width:92vw;padding:40px 38px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:24px;backdrop-filter:blur(28px) saturate(160%);-webkit-backdrop-filter:blur(28px) saturate(160%);box-shadow:0 30px 80px -20px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.12);opacity:0;transform:translateY(18px) scale(.98);animation:lg-pop .8s .15s cubic-bezier(.22,1,.36,1) forwards;}
        @keyframes lg-pop{to{opacity:1;transform:none;}}
        .lg-card::before{content:"";position:absolute;inset:0;border-radius:24px;padding:1px;pointer-events:none;background:linear-gradient(135deg,rgba(255,255,255,.35),transparent 30%,transparent 70%,rgba(79,140,255,.4));-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;}
        .lg-title{font-size:25px;font-weight:700;letter-spacing:-.02em;}
        .lg-cardsub{color:#9aa6bd;font-size:13.5px;margin-top:7px;margin-bottom:28px;}
        .lg-err{background:rgba(244,63,94,.12);border:1px solid rgba(244,63,94,.3);color:#fda4af;font-size:13px;border-radius:12px;padding:11px 14px;margin-bottom:18px;}
        .lg-field{margin-bottom:16px;}
        .lg-label{display:block;font-size:12px;font-weight:600;color:#9aa6bd;margin-bottom:8px;}
        .lg-input{position:relative;}
        .lg-input .lg-ic{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:#6b7689;transition:color .2s;}
        .lg-input input{width:100%;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);border-radius:13px;padding:13px 44px 13px 42px;font-size:14px;font-family:inherit;color:#eef2f8;transition:border-color .2s,background .2s,box-shadow .2s;}
        .lg-input input::placeholder{color:#6b7689;}
        .lg-input input:focus{outline:none;border-color:#4f8cff;background:rgba(79,140,255,.08);box-shadow:0 0 0 4px rgba(79,140,255,.14);}
        .lg-input:focus-within .lg-ic{color:#4f8cff;}
        .lg-toggle{position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#6b7689;padding:4px;display:grid;place-items:center;}
        .lg-toggle:hover{color:#eef2f8;}
        .lg-row{display:flex;justify-content:flex-end;margin:-4px 0 22px;}
        .lg-forgot{font-size:12.5px;color:#4f8cff;text-decoration:none;font-weight:600;background:none;border:none;cursor:pointer;font-family:inherit;}
        .lg-forgot:hover{text-decoration:underline;}
        .lg-submit{width:100%;border:none;cursor:pointer;font-family:inherit;font-size:14.5px;font-weight:700;color:#fff;padding:14px;border-radius:13px;display:flex;align-items:center;justify-content:center;gap:9px;background:linear-gradient(135deg,#4f8cff,#22d3ee);box-shadow:0 12px 30px -6px rgba(79,140,255,.5),inset 0 1px 0 rgba(255,255,255,.35);transition:transform .15s,box-shadow .2s,filter .2s;}
        .lg-submit:hover{transform:translateY(-2px);filter:brightness(1.07);box-shadow:0 18px 40px -8px rgba(79,140,255,.6);}
        .lg-submit:active{transform:translateY(0);}
        .lg-submit:disabled{opacity:.7;cursor:default;transform:none;}
        .lg-arrow{transition:transform .2s;}
        .lg-submit:hover .lg-arrow{transform:translateX(3px);}
        .lg-spin{width:15px;height:15px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:lg-sp .7s linear infinite;}
        @keyframes lg-sp{to{transform:rotate(360deg);}}
        @media(max-width:900px){.lg-brand{display:none;}.lg-formside{width:100%;}}
      `}</style>

      <div className="lg-root">
        <div className="lg-mesh">
          <div className="lg-blob lg-b1" />
          <div className="lg-blob lg-b2" />
          <div className="lg-blob lg-b3" />
        </div>

        <div className="lg-wrap">
          {/* LEFT BRAND PANEL */}
          <section className="lg-brand">
            <div className="lg-logo">
              <div className="lg-mark">M</div>
              <div>
                <div className="lg-name">Monty CRM</div>
                <div className="lg-sub">Sales Hub</div>
              </div>
            </div>

            <div className="lg-mid">
              <span className="lg-badge"><span className="lg-dot" /> Sales Hub</span>
              <h1 className="lg-headline">
                The smarter way<br />to grow <span>your business.</span>
              </h1>
              <p className="lg-lede">
                Manage every customer, conversation, and deal from one workspace built for momentum.
              </p>
            </div>

            <div className="lg-copy">&copy; 2026 Monty CRM. All rights reserved.</div>
          </section>

          {/* RIGHT FORM */}
          <section className="lg-formside">
            <div className="lg-card">
              <h2 className="lg-title">Welcome back</h2>
              <p className="lg-cardsub">Sign in to your workspace to continue.</p>

              {error && <div className="lg-err">{error}</div>}

              <form onSubmit={handleSubmit}>
                <div className="lg-field">
                  <label className="lg-label">Email</label>
                  <div className="lg-input">
                    <Mail className="lg-ic" size={16} />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                      placeholder="you@company.com"
                    />
                  </div>
                </div>

                <div className="lg-field">
                  <label className="lg-label">Password</label>
                  <div className="lg-input">
                    <Lock className="lg-ic" size={16} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="••••••••••"
                    />
                    <button
                      type="button"
                      className="lg-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label="Show password"
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>

                <div className="lg-row">
                  <button type="button" className="lg-forgot">Forgot password?</button>
                </div>

                <button type="submit" className="lg-submit" disabled={loading}>
                  {loading ? (
                    <>
                      <span className="lg-spin" />
                      Signing in...
                    </>
                  ) : (
                    <>
                      Sign in
                      <ArrowRight className="lg-arrow" size={17} />
                    </>
                  )}
                </button>
              </form>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
