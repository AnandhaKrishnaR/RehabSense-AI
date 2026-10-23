import React, { useState, useEffect } from 'react';
import { apiClient } from '../../services/apiClient';
import { ClinicianReviewItem } from '../../types/api';
import { ShieldAlert, CheckCircle2, Download, MessageSquare, AlertCircle, Clock } from 'lucide-react';

export function ClinicianDashboardView() {
  const [reviews, setReviews] = useState<ClinicianReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [clinicianNotes, setClinicianNotes] = useState('');
  const [resolutionAction, setResolutionAction] = useState('acknowledged_and_plan_adjusted');

  const fetchReviews = () => {
    setLoading(true);
    apiClient.getClinicianReviews().then((items) => {
      setReviews(items);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchReviews();
  }, []);

  const handleResolve = async (reviewId: string) => {
    if (!clinicianNotes.trim()) return;

    try {
      await apiClient.resolveReview(reviewId, {
        clinician_notes: clinicianNotes,
        resolution_action: resolutionAction,
      });
      setResolvingId(null);
      setClinicianNotes('');
      fetchReviews();
    } catch (err) {
      console.error('Failed to resolve review:', err);
    }
  };

  const handleDownloadReport = (sessionId: string) => {
    const baseUrl = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';
    window.open(`${baseUrl}/sessions/${sessionId}/report/?format=csv`, '_blank');
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>
            Clinician Review & Safety Audit Dashboard
          </h2>
          <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0', fontSize: '0.9rem' }}>
            Triaged sessions flagged for elevated pain scores, worsening progression, or unreliable camera tracking.
          </p>
        </div>

        <button className="btn btn-outline" onClick={fetchReviews}>
          Refresh Queue
        </button>
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          Loading review records...
        </div>
      ) : reviews.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <CheckCircle2 size={48} color="#10b981" style={{ margin: '0 auto 1rem' }} />
          <h3>All Cleared</h3>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            No pending exercise sessions require clinical intervention at this time.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {reviews.map((rev) => (
            <div key={rev.id} className="card" style={{ borderLeft: rev.severity === 'urgent' ? '4px solid #ef4444' : '4px solid #f59e0b' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span className={`badge ${rev.severity === 'urgent' ? 'badge-danger' : rev.severity === 'warning' ? 'badge-warning' : 'badge-info'}`}>
                      {rev.severity}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Clock size={12} /> {new Date(rev.created_at).toLocaleString()}
                    </span>
                  </div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0.25rem 0' }}>
                    {rev.patient_identifier} — {rev.exercise === 'bodyweight_squat' ? 'Bodyweight Squat' : 'Shoulder Flexion'}
                  </h3>
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    <span>Session ID: <code>{rev.session_id.slice(0, 8)}...</code></span>
                    <span>Completed Reps: <strong>{rev.completed_reps ?? '--'}</strong></span>
                    {rev.latest_pain_score !== undefined && (
                      <span>Reported Pain: <strong style={{ color: (rev.latest_pain_score || 0) >= 7 ? '#dc2626' : '#ea580c' }}>{rev.latest_pain_score}/10</strong></span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className="btn btn-outline"
                    style={{ fontSize: '0.85rem', padding: '0.45rem 0.85rem' }}
                    onClick={() => handleDownloadReport(rev.session_id)}
                    title="Download CSV session records"
                  >
                    <Download size={15} /> Export CSV
                  </button>
                  {rev.status === 'pending' ? (
                    <button
                      className="btn btn-primary"
                      style={{ fontSize: '0.85rem', padding: '0.45rem 0.85rem' }}
                      onClick={() => setResolvingId(rev.id)}
                    >
                      Resolve Review
                    </button>
                  ) : (
                    <span className="badge badge-success">Resolved</span>
                  )}
                </div>
              </div>

              {/* Reasons & Clinical Feedback */}
              <div style={{ marginTop: '0.85rem', background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '0.85rem' }}>
                <div style={{ fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                  Triggered Safety Flags:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.5rem' }}>
                  {rev.flag_reasons.map((r, i) => (
                    <span key={i} style={{ background: '#fee2e2', color: '#991b1b', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                      {r}
                    </span>
                  ))}
                </div>
                {rev.safety_feedback.length > 0 && (
                  <div style={{ color: 'var(--text-muted)' }}>
                    <strong>Automated Advice Emitted:</strong> {rev.safety_feedback.join(' ')}
                  </div>
                )}
              </div>

              {/* Resolution Modal / Form Inline */}
              {resolvingId === rev.id && (
                <div style={{ marginTop: '1rem', padding: '1rem', background: '#f0f9ff', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.5rem', color: '#0369a1' }}>
                    Document Clinical Resolution Action
                  </h4>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                      Clinical Action:
                    </label>
                    <select
                      value={resolutionAction}
                      onChange={(e) => setResolutionAction(e.target.value)}
                      style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '0.85rem' }}
                    >
                      <option value="acknowledged_and_plan_adjusted">Acknowledged & Adjusted Exercise Range/Depth</option>
                      <option value="patient_contacted">Patient Contacted Directly for Tele-Evaluation</option>
                      <option value="routine_clearance">Form Reviewed — Safe to Continue Baseline</option>
                      <option value="temporary_pause_advised">Temporary Pause Advised</option>
                    </select>
                  </div>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                      Clinician Notes & Rationale (Recorded in Audit Trail):
                    </label>
                    <textarea
                      rows={3}
                      value={clinicianNotes}
                      onChange={(e) => setClinicianNotes(e.target.value)}
                      placeholder="e.g. Reviewed shoulder flexion movement. Patient reported pain above 100 degrees. Advised limiting raise depth to 90 degrees."
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '0.85rem' }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    <button className="btn btn-outline" onClick={() => setResolvingId(null)} style={{ fontSize: '0.8rem' }}>
                      Cancel
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={() => handleResolve(rev.id)}
                      disabled={!clinicianNotes.trim()}
                      style={{ fontSize: '0.8rem' }}
                    >
                      Sign & Submit Resolution
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
