import React, { FormEvent, useState } from 'react';
import { Activity, HeartHandshake, HeartPulse, Stethoscope, Users } from 'lucide-react';

export type WorkspaceRole = 'patient' | 'physiotherapist' | 'caregiver';

interface LoginViewProps {
  onLogin: (role: WorkspaceRole) => void;
}

const loginRoles: Array<{
  id: WorkspaceRole;
  label: string;
  description: string;
  icon: typeof Activity;
}> = [
  { id: 'patient', label: 'Patient', description: 'Follow your exercise plan', icon: Activity },
  { id: 'physiotherapist', label: 'Physiotherapist', description: 'Support your patients', icon: Stethoscope },
  { id: 'caregiver', label: 'Family member', description: 'Help with a loved one’s care', icon: Users },
];

export function LoginView({ onLogin }: LoginViewProps) {
  const [role, setRole] = useState<WorkspaceRole>('patient');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onLogin(role);
  };

  return (
    <main className="login-page">
      <header className="login-topbar">
        <div className="brand-lockup" aria-label="RehabSense">
          <span className="brand-mark"><HeartPulse size={21} /></span>
          <span className="brand-wordmark"><strong>RehabSense</strong><small>CARE, IN MOTION</small></span>
        </div>
        <span className="login-topbar-note"><HeartHandshake size={16} /> Your recovery, supported</span>
      </header>

      <div className="login-layout">
        <section className="login-welcome">
          <div className="login-eyebrow"><span /> A LITTLE SUPPORT GOES A LONG WAY</div>
          <h1>Care that moves<br />with you.</h1>
          <p>Connect with your care team, follow a guided exercise plan, and keep your recovery moving at your own pace.</p>
          <div className="login-benefits">
            <span><Activity size={17} /> Guided movement sessions</span>
            <span><Stethoscope size={17} /> Your care team in one place</span>
            <span><HeartHandshake size={17} /> Support for the whole family</span>
          </div>
          <div className="login-welcome-art" aria-hidden="true">
            <div className="login-art-orbit orbit-one" />
            <div className="login-art-orbit orbit-two" />
            <div className="login-art-heart"><HeartPulse size={64} strokeWidth={1.25} /></div>
            <div className="login-art-dot dot-one" />
            <div className="login-art-dot dot-two" />
          </div>
        </section>

        <section className="login-card" aria-labelledby="login-heading">
          <div className="login-card-heading">
            <span className="login-card-mark"><HeartPulse size={18} /></span>
            <span>Welcome back</span>
          </div>
          <h2 id="login-heading">Sign in to RehabSense</h2>
          <p className="login-card-subtitle">Choose your care role and continue to your workspace.</p>

          <form onSubmit={submit}>
            <fieldset className="login-role-fieldset">
              <legend>I’m signing in as</legend>
              <div className="login-role-options">
                {loginRoles.map(({ id, label, description, icon: Icon }) => (
                  <button
                    className={`login-role-option ${role === id ? 'login-role-selected' : ''}`}
                    key={id}
                    type="button"
                    aria-pressed={role === id}
                    onClick={() => setRole(id)}
                  >
                    <span className="login-role-icon"><Icon size={18} /></span>
                    <span className="login-role-copy"><strong>{label}</strong><small>{description}</small></span>
                    <span className="login-role-radio" />
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="login-field">
              <span>Email address</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className="login-field">
              <span>Password</span>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            <button className="login-submit" type="submit">Sign in <span aria-hidden="true">→</span></button>
          </form>

          <p className="login-demo-note">
            Demo sign-in only. This opens the selected sample workspace; credentials are not verified or stored.
          </p>
        </section>
      </div>
      <footer className="login-footer">
        <span><span className="login-footer-dot" /> RehabSense is an assistive exercise companion, not a diagnostic service.</span>
        <span>Clinical decisions remain with your licensed care team.</span>
      </footer>
    </main>
  );
}
