import React, { FormEvent, useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  ClipboardList,
  HeartHandshake,
  MessageCircle,
  Plus,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import { ClinicianReviewItem, ProgressSummaryResponse, TherapyPlan, TherapyPlanItem } from '../../types/api';
import { CanonicalExerciseId } from '../../types/vision';

type DashboardPage = 'overview' | 'exercise' | 'progress' | 'care-team' | 'reviews' | 'patients' | 'schedule' | 'messages';

interface DashboardProps {
  onNavigate: (page: DashboardPage) => void;
}

function useProgress() {
  const [progress, setProgress] = useState<ProgressSummaryResponse | null>(null);

  useEffect(() => {
    apiClient.getProgress().then(setProgress);
  }, []);

  return progress;
}

function PageHeading({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: React.ReactNode }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{detail}</p>
      </div>
      {action}
    </div>
  );
}

function Metric({ icon: Icon, label, value, detail, tone = 'green' }: {
  icon: typeof Activity;
  label: string;
  value: string;
  detail: string;
  tone?: 'green' | 'terracotta' | 'sage';
}) {
  return (
    <article className="metric-card">
      <div className={`metric-icon tone-${tone}`}><Icon size={18} /></div>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      <div className="metric-detail">{detail}</div>
    </article>
  );
}

function PainChart({ values }: { values: Array<{ date: string; pain_score: number | null }> }) {
  const points = values.slice(-7);
  if (points.length < 2) {
    return <div className="chart-empty">A few check-ins will make your trend visible here.</div>;
  }

  const width = 520;
  const height = 150;
  const padding = { left: 24, right: 16, top: 16, bottom: 28 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const coordinates = points.map((entry, index) => ({
    x: padding.left + (index / (points.length - 1)) * plotWidth,
    y: padding.top + (1 - Math.max(0, Math.min(10, entry.pain_score ?? 0)) / 10) * plotHeight,
    label: new Date(entry.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    value: entry.pain_score ?? 0,
  }));
  const path = coordinates.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const area = `${path} L ${coordinates[coordinates.length - 1].x} ${height - padding.bottom} L ${coordinates[0].x} ${height - padding.bottom} Z`;

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Pain check-ins over time, from zero to ten">
        {[0, 5, 10].map((tick) => {
          const y = padding.top + (1 - tick / 10) * plotHeight;
          return <g key={tick}><line x1={padding.left} y1={y} x2={width - padding.right} y2={y} className="chart-grid" /><text x="0" y={y + 4} className="chart-axis">{tick}</text></g>;
        })}
        <path d={area} className="chart-area" />
        <path d={path} className="chart-line" />
        {coordinates.map((point) => (
          <g key={`${point.label}-${point.x}`}>
            <circle cx={point.x} cy={point.y} r="4" className="chart-point" />
            <text x={point.x} y={height - 6} textAnchor="middle" className="chart-axis">{point.label}</text>
          </g>
        ))}
      </svg>
      <div className="chart-legend"><span className="legend-dot" /> Confirmed patient pain score <span className="legend-range">0–10 scale</span></div>
    </div>
  );
}

export function PatientOverview({ onNavigate }: DashboardProps) {
  const progress = useProgress();
  const today = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
  const nextCheckIn = new Date();
  nextCheckIn.setDate(nextCheckIn.getDate() + 2);
  const nextCheckInLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(nextCheckIn);
  const squatReps = progress?.completed_exercises.bodyweight_squat.total_reps ?? 28;
  const shoulderReps = progress?.completed_exercises.shoulder_flexion.total_reps ?? 16;

  return (
    <section className="dashboard-content">
      <PageHeading eyebrow={today} title="Good morning, Anjali" detail="Small, steady steps are moving your recovery forward." />

      <section className="patient-hero" aria-label="Today's rehabilitation plan">
        <div className="patient-hero-copy">
          <span className="hero-kicker"><span className="hero-pulse" /> YOUR PLAN, DAY 12</span>
          <h2>Compassionate care,<br />right here at home.</h2>
          <p>Your physiotherapist has prepared two gentle exercises for today. Start whenever you feel ready.</p>
          <button className="button button-light" onClick={() => onNavigate('exercise')}>
            Begin today's session <ArrowRight size={16} />
          </button>
        </div>
        <div className="patient-hero-image">
          <img src="https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=900&q=85" alt="Physiotherapist ready to support a patient's recovery" />
          <div className="hero-image-note"><ShieldCheck size={15} /> Guided by your care team</div>
        </div>
        <div className="hero-decoration" aria-hidden="true">12</div>
      </section>

      <section className="commitment-band">
        <div className="commitment-mark"><HeartHandshake size={21} /></div>
        <div className="commitment-heading"><span className="eyebrow">COMMITTED TO YOU</span><h2>Recovery, guided by people who care.</h2></div>
        <p>Your exercise plan, progress, and care-team guidance come together in one place, so you can focus on each steady step.</p>
      </section>

      <div className="metric-grid">
        <Metric icon={Activity} label="Sessions this month" value={`${progress?.total_sessions ?? 5}`} detail="A routine you can be proud of" />
        <Metric icon={TrendingUp} label="Squat repetitions" value={`${squatReps}`} detail="Across completed sessions" tone="terracotta" />
        <Metric icon={CheckCircle2} label="Shoulder raises" value={`${shoulderReps}`} detail="Recorded with reliable tracking" tone="sage" />
      </div>

      <div className="dashboard-columns">
        <section className="surface-section">
          <div className="section-heading">
            <div><div className="eyebrow">TODAY'S ROUTINE</div><h2>Your exercises</h2></div>
            <button className="text-button" onClick={() => onNavigate('exercise')}>Open session <ArrowRight size={15} /></button>
          </div>
          <div className="exercise-list">
            <button className="exercise-row" onClick={() => onNavigate('exercise')}>
              <span className="exercise-number">01</span>
              <span className="exercise-description"><strong>Bodyweight squat</strong><small>2 sets · 10 repetitions · Move at a comfortable depth</small></span>
              <span className="exercise-time"><Clock3 size={14} /> 8 min</span>
              <ArrowRight size={16} className="row-arrow" />
            </button>
            <button className="exercise-row" onClick={() => onNavigate('exercise')}>
              <span className="exercise-number exercise-number-sage">02</span>
              <span className="exercise-description"><strong>Shoulder flexion</strong><small>2 sets · 8 repetitions · Raise within a comfortable range</small></span>
              <span className="exercise-time"><Clock3 size={14} /> 6 min</span>
              <ArrowRight size={16} className="row-arrow" />
            </button>
          </div>
          <div className="care-note"><HeartHandshake size={17} /><span>Listen to your body. Pause and contact your care team if symptoms worsen.</span></div>
        </section>

        <section className="surface-section appointment-panel">
          <div className="eyebrow">NEXT CHECK-IN</div>
          <div className="appointment-date"><CalendarDays size={19} /><span>{nextCheckInLabel}</span></div>
          <h2>Dr. Meera Shah</h2>
          <p>Physiotherapy review<br />10:30 AM · Video consultation</p>
          <button className="button button-secondary" onClick={() => onNavigate('care-team')}>View care team <ArrowRight size={15} /></button>
          <div className="appointment-rule" />
          <div className="appointment-foot"><span className="status-dot" /> Your next review is in 2 days</div>
        </section>
      </div>

      <section className="surface-section trend-section">
        <div className="section-heading">
          <div><div className="eyebrow">HOW YOU'RE FEELING</div><h2>Pain check-ins</h2></div>
          <button className="text-button" onClick={() => onNavigate('progress')}>View progress <ArrowRight size={15} /></button>
        </div>
        <PainChart values={progress?.pain_trend ?? []} />
      </section>
    </section>
  );
}

export function PatientCareTeam({ onNavigate }: DashboardProps) {
  return (
    <section className="dashboard-content">
      <PageHeading eyebrow="YOUR SUPPORT CIRCLE" title="Care team" detail="The people supporting your rehabilitation journey." />
      <section className="surface-section care-team-card">
        <div className="care-person-avatar">MS</div>
        <div className="care-person-copy"><span className="eyebrow">PHYSIOTHERAPIST</span><h2>Dr. Meera Shah</h2><p>Licensed physiotherapist · Rehabilitation care</p><span className="online-indicator"><span className="status-dot" /> Available for your Friday check-in</span></div>
        <button className="button button-secondary" onClick={() => onNavigate('progress')}>Share progress <ArrowRight size={15} /></button>
      </section>
      <div className="dashboard-columns care-team-details">
        <section className="surface-section"><div className="eyebrow">YOUR PLAN</div><h2>Prescribed exercises</h2><p className="muted-copy">Your current plan includes bodyweight squats and shoulder flexion. Exercise targets are set by your physiotherapist.</p><button className="text-button" onClick={() => onNavigate('exercise')}>Review exercise guidance <ArrowRight size={15} /></button></section>
        <section className="surface-section"><div className="eyebrow">SAFETY FIRST</div><h2>When to pause</h2><p className="muted-copy">Stop an exercise if pain increases or you feel unwell. For urgent symptoms, seek immediate medical help.</p><span className="safety-chip"><ShieldCheck size={15} /> Your wellbeing comes first</span></section>
      </div>
    </section>
  );
}

export function ClinicianOverview({ onNavigate }: DashboardProps) {
  const progress = useProgress();
  const [reviews, setReviews] = useState<ClinicianReviewItem[]>([]);
  const today = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());

  useEffect(() => {
    apiClient.getClinicianReviews().then(setReviews);
  }, []);

  const urgentCount = reviews.filter((review) => review.severity === 'urgent').length;
  const reviewCount = reviews.filter((review) => review.status === 'pending').length;

  return (
    <section className="dashboard-content">
      <PageHeading eyebrow={`CLINICAL WORKSPACE · ${today.toUpperCase()}`} title="Good morning, Dr. Shah" detail="A clear view of your patients' movement and the reviews that need attention." action={<button className="button button-secondary" onClick={() => onNavigate('patients')}><Plus size={16} /> Create care plan</button>} />
      <div className="metric-grid clinician-metrics">
        <Metric icon={Users} label="Active patients" value="24" detail="3 have sessions today" />
        <Metric icon={ClipboardList} label="Pending reviews" value={`${reviewCount}`} detail="Safety flags awaiting review" tone="terracotta" />
        <Metric icon={Activity} label="Sessions this month" value={`${progress?.total_sessions ?? 12}`} detail="Across your caseload" tone="sage" />
      </div>
      <div className="dashboard-columns clinician-columns">
        <section className="surface-section">
          <div className="section-heading"><div><div className="eyebrow">CLINICAL ATTENTION</div><h2>Review queue</h2></div><button className="text-button" onClick={() => onNavigate('reviews')}>Open queue <ArrowRight size={15} /></button></div>
          {reviews.length ? reviews.slice(0, 3).map((review) => (
            <button className="review-row" key={review.id} onClick={() => onNavigate('reviews')}>
              <span className={`review-mark ${review.severity === 'urgent' ? 'review-mark-urgent' : ''}`}><Activity size={16} /></span>
              <span className="review-copy"><strong>{review.patient_identifier}</strong><small>{review.exercise === 'bodyweight_squat' ? 'Bodyweight squat' : 'Shoulder flexion'} · {review.flag_reasons[0]?.replace(/_/g, ' ')}</small></span>
              <span className={`severity-label severity-${review.severity}`}>{review.severity}</span>
            </button>
          )) : <div className="empty-state"><CheckCircle2 size={20} /> No flagged sessions need attention.</div>}
          {urgentCount > 0 && <div className="urgent-note"><ShieldCheck size={15} /> {urgentCount} urgent flag{urgentCount === 1 ? '' : 's'} need prompt review.</div>}
        </section>
        <section className="surface-section caseload-panel">
          <div className="section-heading"><div><div className="eyebrow">PATIENTS</div><h2>Today's caseload</h2></div><button className="text-button" onClick={() => onNavigate('patients')}>All patients <ArrowRight size={15} /></button></div>
          {[
            { initials: 'AN', name: 'Anjali Nair', focus: 'Post-operative mobility', next: 'Session 10:30 AM' },
            { initials: 'RK', name: 'Ravi Kumar', focus: 'Shoulder range of motion', next: 'Review 1:00 PM' },
            { initials: 'DP', name: 'Devika Pillai', focus: 'Balance and strength', next: 'Session 3:15 PM' },
          ].map((patient) => <button className="patient-row" key={patient.initials} onClick={() => onNavigate('patients')}><span className="patient-avatar">{patient.initials}</span><span className="patient-copy"><strong>{patient.name}</strong><small>{patient.focus}</small></span><span className="patient-next">{patient.next}</span></button>)}
        </section>
      </div>
      <div className="workspace-note"><ShieldCheck size={16} /> Demo workspace: role views are for interface review; authorization must be enforced by the backend before clinical deployment.</div>
    </section>
  );
}

export function ClinicianPatients({ onNavigate }: DashboardProps) {
  const [patientName, setPatientName] = useState('Anjali Nair');
  const [clinicianName, setClinicianName] = useState('Dr. Meera Shah');
  const [notes, setNotes] = useState('Continue within a comfortable range. Pause if pain increases.');
  const [exerciseId, setExerciseId] = useState<CanonicalExerciseId>('bodyweight_squat');
  const [targetReps, setTargetReps] = useState(10);
  const [targetSets, setTargetSets] = useState(2);
  const [plans, setPlans] = useState<TherapyPlan[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submitPlan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const item: TherapyPlanItem = { exercise_id: exerciseId, target_sets: targetSets, target_reps: targetReps, notes };
    try {
      const plan = await apiClient.createTherapyPlan({ patient_name: patientName.trim(), clinician_name: clinicianName.trim(), notes, items: [item] });
      setPlans((current) => [plan, ...current]);
      setMessage(`Care plan saved for ${plan.patient_name}.`);
    } catch {
      setMessage('Unable to save this care plan. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="dashboard-content">
      <PageHeading eyebrow="CARE PLANNING" title="Patients & plans" detail="Create and review exercise plans using the existing therapy-plan service." action={<button className="button button-secondary" onClick={() => onNavigate('reviews')}>Review safety queue <ArrowRight size={15} /></button>} />
      <div className="plan-layout">
        <section className="surface-section plan-form-section">
          <div className="eyebrow">NEW PRESCRIPTION</div><h2>Build a care plan</h2>
          <form className="care-plan-form" onSubmit={submitPlan}>
            <label>Patient name<input required value={patientName} onChange={(event) => setPatientName(event.target.value)} /></label>
            <label>Clinician<input required value={clinicianName} onChange={(event) => setClinicianName(event.target.value)} /></label>
            <label>Exercise<select value={exerciseId} onChange={(event) => setExerciseId(event.target.value as CanonicalExerciseId)}><option value="bodyweight_squat">Bodyweight squat</option><option value="shoulder_flexion">Shoulder flexion</option></select></label>
            <div className="form-pair"><label>Sets<input type="number" min="1" max="10" value={targetSets} onChange={(event) => setTargetSets(Number(event.target.value))} /></label><label>Repetitions<input type="number" min="1" max="50" value={targetReps} onChange={(event) => setTargetReps(Number(event.target.value))} /></label></div>
            <label>Clinical notes<textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
            <button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving plan…' : <><Plus size={16} /> Save care plan</>}</button>
            {message && <p className="form-success" role="status"><CheckCircle2 size={16} /> {message}</p>}
          </form>
        </section>
        <section className="surface-section plan-aside">
          <div className="eyebrow">ACTIVE CASES</div><h2>Care team roster</h2>
          {[
            { initials: 'AN', name: 'Anjali Nair', note: 'Post-operative mobility · Active plan' },
            { initials: 'RK', name: 'Ravi Kumar', note: 'Shoulder rehabilitation · Review due' },
            { initials: 'DP', name: 'Devika Pillai', note: 'Balance and strength · Active plan' },
          ].map((patient) => <div className="roster-row" key={patient.initials}><span className="patient-avatar">{patient.initials}</span><span><strong>{patient.name}</strong><small>{patient.note}</small></span></div>)}
          <div className="plan-divider" />
          <div className="eyebrow">RECENTLY CREATED</div>
          {plans.length ? plans.map((plan) => <div className="created-plan" key={plan.id}><CheckCircle2 size={16} /><span><strong>{plan.patient_name}</strong><small>{plan.items.length} exercise · {new Date(plan.created_at).toLocaleDateString()}</small></span></div>) : <p className="muted-copy">New plans you create in this session will appear here.</p>}
        </section>
      </div>
    </section>
  );
}

interface ClinicAppointment {
  id: string;
  patient: string;
  date: string;
  time: string;
  type: string;
}

export function ClinicianSchedule() {
  const [appointments, setAppointments] = useState<ClinicAppointment[]>([
    { id: 'a1', patient: 'Anjali Nair', date: '2026-10-23', time: '10:30', type: 'Video review' },
    { id: 'a2', patient: 'Ravi Kumar', date: '2026-10-23', time: '13:00', type: 'Movement assessment' },
    { id: 'a3', patient: 'Devika Pillai', date: '2026-10-23', time: '15:15', type: 'Follow-up' },
  ]);
  const [patient, setPatient] = useState('Anjali Nair');
  const [date, setDate] = useState('2026-10-24');
  const [time, setTime] = useState('10:00');
  const [type, setType] = useState('Video review');
  const [notice, setNotice] = useState<string | null>(null);

  const addAppointment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppointments((current) => [...current, { id: `a-${Date.now()}`, patient, date, time, type }].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)));
    setNotice(`Appointment scheduled for ${patient}.`);
  };

  const removeAppointment = (id: string) => {
    setAppointments((current) => current.filter((appointment) => appointment.id !== id));
    setNotice('Appointment removed from this demo schedule.');
  };

  return (
    <section className="dashboard-content">
      <PageHeading eyebrow="CLINICAL WORKSPACE" title="Clinic schedule" detail="Coordinate follow-ups and movement reviews. Changes here are demo-local until a scheduling service is available." />
      <div className="plan-layout schedule-layout">
        <section className="surface-section schedule-list-section">
          <div className="section-heading"><div><div className="eyebrow">UPCOMING APPOINTMENTS</div><h2>{appointments.length} scheduled</h2></div><CalendarDays size={20} className="section-icon" /></div>
          <div className="schedule-list">
            {appointments.map((appointment) => <article className="schedule-row" key={appointment.id}><div className="schedule-date"><strong>{new Date(`${appointment.date}T00:00:00`).toLocaleDateString(undefined, { day: '2-digit' })}</strong><span>{new Date(`${appointment.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short' })}</span></div><div className="schedule-copy"><strong>{appointment.patient}</strong><small>{appointment.type}</small></div><span className="schedule-time"><Clock3 size={14} /> {appointment.time}</span><button className="icon-button schedule-remove" aria-label={`Remove ${appointment.patient} appointment`} onClick={() => removeAppointment(appointment.id)}>×</button></article>)}
            {!appointments.length && <div className="empty-state">No upcoming appointments. Add one to get started.</div>}
          </div>
          {notice && <p className="form-success" role="status"><CheckCircle2 size={15} /> {notice}</p>}
        </section>
        <section className="surface-section schedule-form-section">
          <div className="eyebrow">NEW APPOINTMENT</div><h2>Book a check-in</h2>
          <form className="care-plan-form" onSubmit={addAppointment}>
            <label>Patient<select value={patient} onChange={(event) => setPatient(event.target.value)}><option>Anjali Nair</option><option>Ravi Kumar</option><option>Devika Pillai</option></select></label>
            <div className="form-pair"><label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label><label>Time<input type="time" value={time} onChange={(event) => setTime(event.target.value)} required /></label></div>
            <label>Appointment type<select value={type} onChange={(event) => setType(event.target.value)}><option>Video review</option><option>Movement assessment</option><option>Follow-up</option></select></label>
            <button className="button button-primary"><Plus size={16} /> Add appointment</button>
          </form>
        </section>
      </div>
    </section>
  );
}

interface RoutineTask { id: string; title: string; details: string; time: string; }
const caregiverTasks: RoutineTask[] = [
  { id: 'warmup', title: 'Gentle warm-up', details: 'Comfortable walk or seated movement', time: 'Before exercises' },
  { id: 'squat', title: 'Bodyweight squat', details: '2 sets · 10 repetitions · Follow the prescribed range', time: 'Morning' },
  { id: 'shoulder', title: 'Shoulder flexion', details: '2 sets · 8 repetitions · Move without forcing', time: 'Morning' },
];

function readLocalValue<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) as T : fallback;
  } catch {
    return fallback;
  }
}

export function CaregiverDashboard({ page, onNavigate }: DashboardProps & { page: DashboardPage }) {
  const progress = useProgress();
  const [completed, setCompleted] = useState<Record<string, boolean>>(() => readLocalValue('rehabsense-caregiver-checklist', {}));
  const [reminder, setReminder] = useState(() => readLocalValue('rehabsense-caregiver-reminder', '09:00'));
  const [savedReminder, setSavedReminder] = useState(reminder);
  const [note, setNote] = useState('');
  const [savedNote, setSavedNote] = useState(() => readLocalValue('rehabsense-caregiver-note', ''));
  const [notice, setNotice] = useState<string | null>(null);
  const completedCount = caregiverTasks.filter((task) => completed[task.id]).length;
  const toggleTask = (taskId: string) => {
    setCompleted((current) => {
      const next = { ...current, [taskId]: !current[taskId] };
      localStorage.setItem('rehabsense-caregiver-checklist', JSON.stringify(next));
      return next;
    });
  };

  const saveReminder = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    localStorage.setItem('rehabsense-caregiver-reminder', JSON.stringify(reminder));
    setSavedReminder(reminder);
    setNotice(`Reminder saved for ${reminder}.`);
  };

  const saveNote = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!note.trim()) return;
    localStorage.setItem('rehabsense-caregiver-note', JSON.stringify(note.trim()));
    setSavedNote(note.trim());
    setNote('');
    setNotice('Support note saved on this device.');
  };

  if (page === 'messages') {
    return (
      <section className="dashboard-content">
        <PageHeading eyebrow="FAMILY SUPPORT" title="Notes for the care team" detail="Share an observation to discuss at the next check-in. This demo saves notes on this device only." />
        <div className="dashboard-columns messages-layout">
          <section className="surface-section">
            <div className="eyebrow">NEW SUPPORT NOTE</div><h2>What have you noticed?</h2>
            <form className="care-plan-form" onSubmit={saveNote}>
              <label>Note<textarea rows={6} value={note} onChange={(event) => setNote(event.target.value)} placeholder="For example: Anjali completed the morning routine and felt comfortable afterward." /></label>
              <button className="button button-primary" disabled={!note.trim()}><MessageCircle size={16} /> Save note</button>
              {notice && <p className="form-success" role="status"><CheckCircle2 size={16} /> {notice}</p>}
            </form>
          </section>
          <section className="surface-section"><div className="eyebrow">MOST RECENT</div><h2>Saved observation</h2>{savedNote ? <blockquote className="support-quote">“{savedNote}”</blockquote> : <p className="muted-copy">No notes saved yet.</p>}<p className="local-data-note">Notes are stored locally for this prototype and are not sent to the clinic.</p></section>
        </div>
      </section>
    );
  }

  const isSchedule = page === 'schedule';
  return (
    <section className="dashboard-content">
      <PageHeading eyebrow="FAMILY SUPPORT · ANJALI'S RECOVERY" title={isSchedule ? 'Today’s home routine' : 'Care, together'} detail={isSchedule ? 'Help keep the routine calm and consistent. The prescribed targets are read-only.' : 'A simple, supportive view of today’s plan and recent progress.'} />
      {!isSchedule && <section className="caregiver-hero"><div><span className="hero-kicker"><HeartHandshake size={15} /> SUPPORT PARTNER VIEW</span><h2>Showing up is<br />part of the care.</h2><p>Help Anjali follow the plan prescribed by her physiotherapist. Exercise targets and clinical records stay read-only here.</p></div><div className="caregiver-progress"><div className="progress-ring" style={{ '--progress': `${Math.round((completedCount / caregiverTasks.length) * 100)}%` } as React.CSSProperties}><strong>{completedCount}/{caregiverTasks.length}</strong><small>today</small></div><span>Routine check-in</span></div></section>}
      <div className="dashboard-columns caregiver-columns">
        <section className="surface-section">
          <div className="section-heading"><div><div className="eyebrow">TODAY'S PLAN</div><h2>{completedCount} of {caregiverTasks.length} steps checked</h2></div>{!isSchedule && <span className="read-only-tag"><ShieldCheck size={14} /> Read-only plan</span>}</div>
          <div className="checklist">
            {caregiverTasks.map((task) => <label key={task.id} className={`checklist-row ${completed[task.id] ? 'is-complete' : ''}`}><input type="checkbox" checked={!!completed[task.id]} onChange={() => toggleTask(task.id)} /><span className="checklist-copy"><strong>{task.title}</strong><small>{task.details}</small></span><span className="checklist-time">{task.time}</span></label>)}
          </div>
          <p className="local-data-note">Checklist completion is saved in this browser only. Follow the clinician’s plan; do not change repetitions or exercise selection.</p>
        </section>
        <section className="surface-section reminder-section">
          <div className="eyebrow">GENTLE REMINDER</div><h2>Choose a check-in time</h2>
          <form onSubmit={saveReminder} className="reminder-form"><label htmlFor="reminder-time">Daily reminder</label><div><select id="reminder-time" value={reminder} onChange={(event) => setReminder(event.target.value)}><option value="08:00">8:00 AM</option><option value="09:00">9:00 AM</option><option value="10:00">10:00 AM</option><option value="17:00">5:00 PM</option></select><button className="button button-secondary">Save</button></div></form>
          <div className="reminder-confirmation"><Clock3 size={16} /> Reminder set for {savedReminder}</div>
          {notice && <p className="form-success" role="status"><Check size={15} /> {notice}</p>}
        </section>
      </div>
      {!isSchedule && <div className="dashboard-columns caregiver-lower">
        <section className="surface-section"><div className="eyebrow">RECENT PROGRESS</div><h2>Recovery at a glance</h2><div className="caregiver-stats"><div><strong>{progress?.total_sessions ?? 5}</strong><span>sessions completed</span></div><div><strong>{progress?.completed_exercises.bodyweight_squat.total_reps ?? 28}</strong><span>squat repetitions</span></div></div><p className="local-data-note">Summary only. Clinical details remain with the patient and care team.</p></section>
        <section className="support-cta"><div className="support-cta-icon"><MessageCircle size={19} /></div><div><h2>Share an observation</h2><p>Let the physiotherapist know how the routine is going.</p></div><button className="button button-light" onClick={() => onNavigate('messages')}>Write a note <ArrowRight size={15} /></button></section>
      </div>}
    </section>
  );
}

export type { DashboardPage };