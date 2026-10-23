import React, { useState, useEffect } from 'react';
import { apiClient } from './services/apiClient';
import { HealthResponse } from './types/api';
import { Activity, ShieldAlert, FileText, UserCheck, Stethoscope } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'session' | 'clinician' | 'progress'>('session');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [demoMode, setDemoMode] = useState<boolean>(true);

  useEffect(() => {
    apiClient.getHealth().then((res) => {
      setHealth(res);
      setDemoMode(res.demo_mode);
    });
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Clinical Disclaimer Banner */}
      <div style={{
        background: '#fffbeb',
        borderBottom: '1px solid #fef3c7',
        color: '#92400e',
        fontSize: '0.82rem',
        padding: '0.5rem 1rem',
        textAlign: 'center',
        fontWeight: 500,
      }}>
        ⚠️ <strong>Assistive Companion Prototype</strong>: RehabSense AI is an exercise tracking tool. It does not provide medical diagnosis, alter therapy prescriptions, or replace a licensed physiotherapist.
      </div>

      {/* Main Header & Navbar */}
      <header style={{
        background: '#ffffff',
        borderBottom: '1px solid var(--border)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        <div className="container" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1rem 1.5rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              background: 'linear-gradient(135deg, #0284c7 0%, #0d9488 100%)',
              color: '#ffffff',
              borderRadius: '10px',
              padding: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Activity size={24} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                RehabSense AI
              </h1>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                Multimodal Physiotherapy Exercise Companion
              </p>
            </div>
          </div>

          {/* Navigation Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <nav style={{ display: 'flex', gap: '0.5rem', background: '#f1f5f9', padding: '0.25rem', borderRadius: '10px' }}>
              <button
                className={`btn ${activeTab === 'session' ? 'btn-primary' : 'btn-outline'}`}
                style={{ padding: '0.45rem 1rem', fontSize: '0.88rem', border: 'none' }}
                onClick={() => setActiveTab('session')}
              >
                <Activity size={16} /> Exercise Session
              </button>
              <button
                className={`btn ${activeTab === 'clinician' ? 'btn-primary' : 'btn-outline'}`}
                style={{ padding: '0.45rem 1rem', fontSize: '0.88rem', border: 'none' }}
                onClick={() => setActiveTab('clinician')}
              >
                <Stethoscope size={16} /> Clinician Review
              </button>
              <button
                className={`btn ${activeTab === 'progress' ? 'btn-primary' : 'btn-outline'}`}
                style={{ padding: '0.45rem 1rem', fontSize: '0.88rem', border: 'none' }}
                onClick={() => setActiveTab('progress')}
              >
                <FileText size={16} /> Progress & Reports
              </button>
            </nav>

            <span className={`badge ${health?.status?.includes('healthy') ? 'badge-success' : 'badge-warning'}`}>
              {health?.status ? `API: ${health.status}` : 'Connecting...'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="container" style={{ flex: 1, padding: '2rem 1.5rem' }}>
        {activeTab === 'session' && (
          <div id="exercise-session-container">
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Exercise Rehabilitation Session</h2>
              <p style={{ color: 'var(--text-muted)' }}>
                Select an approved exercise, follow the 3D demonstration, and maintain proper form with real-time pose tracking.
              </p>
            </div>
            {/* Session UI component will mount here in Phase 3 */}
            <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
              <Activity size={48} color="#0284c7" style={{ margin: '0 auto 1rem' }} />
              <h3>Phase 1 Scaffold Active</h3>
              <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                Backend connected at <code>/api/v1/health/</code>. Initializing Phase 2 (Data & Models) and Phase 3 (3D Avatar).
              </p>
            </div>
          </div>
        )}

        {activeTab === 'clinician' && (
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>Clinician Safety Review Dashboard</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              Review exercise sessions flagged for worsening pain, elevated difficulty, or unreliable movement tracking.
            </p>
            <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
              <ShieldAlert size={48} color="#f59e0b" style={{ margin: '0 auto 1rem' }} />
              <h3>Clinician Review Module Ready</h3>
              <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                Audit trails and resolution workflow connecting to <code>/api/v1/clinician/reviews/</code>.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'progress' && (
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>Patient Rehabilitation Progress</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
              Longitudinal tracking of completed repetitions, pain progression, and downloadable reports.
            </p>
            <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
              <FileText size={48} color="#10b981" style={{ margin: '0 auto 1rem' }} />
              <h3>Progress & Summary Module Ready</h3>
              <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                Summary metrics connecting to <code>/api/v1/progress/</code>.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{
        background: '#ffffff',
        borderTop: '1px solid var(--border)',
        padding: '1rem 0',
        textAlign: 'center',
        fontSize: '0.85rem',
        color: 'var(--text-muted)',
      }}>
        RehabSense AI — Hackathon Multimodal Architecture (React 18 + Three.js + MediaPipe + Django REST Framework)
      </footer>
    </div>
  );
}
