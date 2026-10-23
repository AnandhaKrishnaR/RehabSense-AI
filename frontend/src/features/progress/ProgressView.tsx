import React, { useState, useEffect } from 'react';
import { apiClient } from '../../services/apiClient';
import { ProgressSummaryResponse } from '../../types/api';
import { TrendingUp, Activity, AlertTriangle, Calendar, Award } from 'lucide-react';

export function ProgressView() {
  const [progress, setProgress] = useState<ProgressSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.getProgress().then((data) => {
      setProgress(data);
      setLoading(false);
    });
  }, []);

  if (loading || !progress) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
        Loading rehabilitation progress trends...
      </div>
    );
  }

  const squatStats = progress.completed_exercises.bodyweight_squat;
  const shoulderStats = progress.completed_exercises.shoulder_flexion;

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>
          Rehabilitation Adherence & Progress History
        </h2>
        <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0', fontSize: '0.9rem' }}>
          Objective movement repetition totals and patient-reported pain trends across like-for-like exercise sessions.
        </p>
      </div>

      {/* Top Level Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ borderLeft: '4px solid #0284c7' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Total Sessions
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '0.25rem' }}>
            {progress.total_sessions}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#0369a1', marginTop: '0.25rem' }}>
            Recorded sessions
          </div>
        </div>

        <div className="card" style={{ borderLeft: '4px solid #10b981' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Bodyweight Squats
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '0.25rem' }}>
            {squatStats?.total_reps ?? 0} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>reps</span>
          </div>
          <div style={{ fontSize: '0.8rem', color: '#059669', marginTop: '0.25rem' }}>
            Across {squatStats?.sessions_count ?? 0} sessions
          </div>
        </div>

        <div className="card" style={{ borderLeft: '4px solid #6366f1' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Shoulder Flexion
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '0.25rem' }}>
            {shoulderStats?.total_reps ?? 0} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>reps</span>
          </div>
          <div style={{ fontSize: '0.8rem', color: '#4f46e5', marginTop: '0.25rem' }}>
            Across {shoulderStats?.sessions_count ?? 0} sessions
          </div>
        </div>

        <div className="card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Clinician Review Flags
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: progress.flagged_sessions_count > 0 ? '#d97706' : 'var(--text-main)', marginTop: '0.25rem' }}>
            {progress.flagged_sessions_count}
          </div>
          <div style={{ fontSize: '0.8rem', color: progress.flagged_sessions_count > 0 ? '#b45309' : 'var(--text-muted)', marginTop: '0.25rem' }}>
            {progress.flagged_sessions_count > 0 ? 'Pending clinician review' : 'No active alerts'}
          </div>
        </div>
      </div>

      {/* Pain & Symptom Progression Timeline */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.25rem' }}>
          Patient-Reported Pain & Difficulty Progression
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Subjective symptom scores (0–10 Visual Analog Scale) confirmed by the patient during session check-ins.
        </p>

        {progress.pain_trend.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No symptoms logged yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Date</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Pain Score (0 - 10)</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Visual Scale</th>
                  <th style={{ padding: '0.5rem 0.75rem' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {progress.pain_trend.map((entry, idx) => {
                  const score = entry.pain_score ?? 0;
                  const isHigh = score >= 7;
                  const isModerate = score >= 4 && score < 7;
                  const barColor = isHigh ? '#ef4444' : isModerate ? '#f59e0b' : '#10b981';

                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.65rem 0.75rem', fontWeight: 500 }}>{entry.date}</td>
                      <td style={{ padding: '0.65rem 0.75rem' }}>
                        <strong>{entry.pain_score !== null ? `${entry.pain_score}/10` : 'None'}</strong>
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', width: '40%' }}>
                        <div style={{ background: '#e2e8f0', borderRadius: '4px', height: '10px', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, score * 10)}%`, background: barColor, height: '100%' }} />
                        </div>
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem' }}>
                        <span className={`badge ${isHigh ? 'badge-danger' : isModerate ? 'badge-warning' : 'badge-success'}`}>
                          {isHigh ? 'Elevated Pain' : isModerate ? 'Moderate' : 'Mild / Safe'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Clinical Disclaimer Notice */}
      <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        <strong>Data Integrity Notice:</strong> All repetitions are calculated from reliable MediaPipe landmark frames. Measurements where landmark visibility dropped below 65% are excluded from repetition counts to maintain kinematic data integrity. Joint-angle metrics are tracked independently per exercise and are not aggregated across distinct anatomical planes.
      </div>
    </div>
  );
}
