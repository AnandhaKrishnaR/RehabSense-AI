import React, { useState, useEffect } from 'react';
import { apiClient } from './services/apiClient';
import { HealthResponse } from './types/api';
import { ExerciseSessionView } from './features/sessions/ExerciseSessionView';
import { ClinicianDashboardView } from './features/clinician/ClinicianDashboardView';
import { ProgressView } from './features/progress/ProgressView';
import { Activity, ShieldAlert, FileText, Stethoscope } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'session' | 'clinician' | 'progress'>('session');
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    apiClient.getHealth().then((res) => {
      setHealth(res);
    });
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Clinical Disclaimer Banner */}
      <div style={{
        background: '#fffbeb',
        borderBottom: '1px solid #fef3c7',
        color: '#92400e',
        fontSize: '0.82rem',
        padding: '0.5rem 1rem',
        textAlign: 'center',
        fontWeight: 500,
      }}>
        ⚠️ <strong>Assistive Companion Prototype</strong>: RehabSense AI is an exercise tracking companion. It does not provide medical diagnosis, alter therapy prescriptions, or replace a licensed clinician.
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
          flexWrap: 'wrap',
          gap: '1rem',
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
                Multimodal AI-Powered Physiotherapy Companion
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
      <main className="container" style={{ flex: 1, padding: '1.75rem 1.5rem' }}>
        {activeTab === 'session' && <ExerciseSessionView />}
        {activeTab === 'clinician' && <ClinicianDashboardView />}
        {activeTab === 'progress' && <ProgressView />}
      </main>

      {/* Footer */}
      <footer style={{
        background: '#ffffff',
        borderTop: '1px solid var(--border)',
        padding: '1rem 0',
        textAlign: 'center',
        fontSize: '0.82rem',
        color: 'var(--text-muted)',
      }}>
        RehabSense AI — Hackathon Multimodal Architecture (React 18 + Three.js + MediaPipe + Django REST Framework)
      </footer>
    </div>
  );
}
