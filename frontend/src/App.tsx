import React, { useEffect, useState } from 'react';
import {
  Activity,
  Bell,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  FileHeart,
  Heart,
  HeartPulse,
  Home,
  Menu,
  MessageCircle,
  PersonStanding,
  ShieldCheck,
  Stethoscope,
  Users,
  X,
} from 'lucide-react';
import { apiClient } from './services/apiClient';
import { HealthResponse } from './types/api';
import { ExerciseSessionView } from './features/sessions/ExerciseSessionView';
import { ClinicianDashboardView } from './features/clinician/ClinicianDashboardView';
import { ProgressView } from './features/progress/ProgressView';
import {
  CaregiverDashboard,
  ClinicianOverview,
  ClinicianPatients,
  ClinicianSchedule,
  DashboardPage,
  PatientCareTeam,
  PatientOverview,
} from './features/dashboard/RoleDashboardViews';

type WorkspaceRole = 'patient' | 'physiotherapist' | 'caregiver';

const roleOptions: Array<{ id: WorkspaceRole; label: string; description: string }> = [
  { id: 'patient', label: 'Patient', description: 'Anjali Nair' },
  { id: 'physiotherapist', label: 'Physiotherapist', description: 'Dr. Meera Shah' },
  { id: 'caregiver', label: 'Family caregiver', description: 'Latha Nair' },
];

const navigation: Record<WorkspaceRole, Array<{ id: DashboardPage; label: string; icon: typeof Home }>> = {
  patient: [
    { id: 'overview', label: 'Overview', icon: Home },
    { id: 'exercise', label: 'Exercise session', icon: PersonStanding },
    { id: 'progress', label: 'My progress', icon: Activity },
    { id: 'care-team', label: 'Care team', icon: Heart },
  ],
  physiotherapist: [
    { id: 'overview', label: 'Overview', icon: Home },
    { id: 'patients', label: 'Patients & plans', icon: Users },
    { id: 'reviews', label: 'Safety review', icon: ShieldCheck },
    { id: 'schedule', label: 'Clinic schedule', icon: CalendarDays },
  ],
  caregiver: [
    { id: 'overview', label: 'Care overview', icon: Home },
    { id: 'schedule', label: 'Today’s routine', icon: ClipboardCheck },
    { id: 'messages', label: 'Care notes', icon: MessageCircle },
  ],
};

const roleNames: Record<WorkspaceRole, string> = {
  patient: 'Anjali Nair',
  physiotherapist: 'Dr. Meera Shah',
  caregiver: 'Latha Nair',
};

export default function App() {
  const [role, setRole] = useState<WorkspaceRole>('patient');
  const [page, setPage] = useState<DashboardPage>('overview');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  useEffect(() => {
    apiClient.getHealth().then(setHealth);
  }, []);

  const changeRole = (nextRole: WorkspaceRole) => {
    setRole(nextRole);
    setPage('overview');
    setMenuOpen(false);
    setNotificationsOpen(false);
  };

  const navigate = (nextPage: DashboardPage) => {
    setPage(nextPage);
    setMenuOpen(false);
    setNotificationsOpen(false);
  };

  const unreadCount = role === 'physiotherapist' ? 2 : role === 'caregiver' ? 1 : (health?.demo_mode ? 0 : 1);

  const renderPage = () => {
    if (role === 'patient') {
      if (page === 'exercise') return <ExerciseSessionView />;
      if (page === 'progress') return <ProgressView />;
      if (page === 'care-team') return <PatientCareTeam onNavigate={navigate} />;
      return <PatientOverview onNavigate={navigate} />;
    }

    if (role === 'physiotherapist') {
      if (page === 'patients') return <ClinicianPatients onNavigate={navigate} />;
      if (page === 'reviews') return <ClinicianDashboardView />;
      if (page === 'schedule') return <ClinicianSchedule />;
      return <ClinicianOverview onNavigate={navigate} />;
    }

    return <CaregiverDashboard page={page} onNavigate={navigate} />;
  };

  const notifications = role === 'physiotherapist'
    ? [
        { title: 'Safety review needs attention', detail: 'Shoulder flexion · Patient #1042', page: 'reviews' as DashboardPage },
        { title: 'A new session was recorded', detail: 'Movement summary is ready to review', page: 'reviews' as DashboardPage },
      ]
    : role === 'caregiver'
    ? [{ title: 'Anjali’s morning routine', detail: '3 gentle steps in today’s plan', page: 'schedule' as DashboardPage }]
    : [{ title: 'Your care-team check-in', detail: 'Friday at 10:30 AM with Dr. Meera Shah', page: 'care-team' as DashboardPage }];

  return (
    <div className={`app-shell role-${role}`}>
      <header className="topbar">
        <button className="mobile-menu-button icon-button" onClick={() => setMenuOpen((open) => !open)} aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen}>
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <button className="brand-lockup" onClick={() => navigate('overview')} aria-label="RehabSense AI home">
          <span className="brand-mark"><HeartPulse size={21} /></span>
          <span className="brand-wordmark"><strong>RehabSense</strong><small>CARE, IN MOTION</small></span>
        </button>
        <nav className="top-navigation" aria-label={`${roleOptions.find((option) => option.id === role)?.label} navigation`}>
          {navigation[role].map(({ id, label }) => (
            <button key={id} className={`top-navigation-link ${page === id ? 'top-navigation-active' : ''}`} onClick={() => navigate(id)} aria-current={page === id ? 'page' : undefined}>
              {label}
            </button>
          ))}
        </nav>
        <div className="topbar-spacer" />
        <label className="role-select-wrap"><span>Workspace preview</span><span className="role-select-control"><select value={role} onChange={(event) => changeRole(event.target.value as WorkspaceRole)} aria-label="Switch dashboard preview role">{roleOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select><ChevronDown size={14} aria-hidden="true" /></span></label>
        <div className="notification-wrap">
          <button className={`icon-button notification-button ${notificationsOpen ? 'is-open' : ''}`} onClick={() => setNotificationsOpen((open) => !open)} aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`} aria-expanded={notificationsOpen}>
            <Bell size={19} />{unreadCount > 0 && <span className="notification-count">{unreadCount}</span>}
          </button>
          {notificationsOpen && <div className="notification-popover"><div className="popover-title">Notifications <span>{unreadCount} new</span></div>{notifications.map((notification) => <button key={notification.title} className="notification-item" onClick={() => navigate(notification.page)}><span className="notification-icon"><FileHeart size={16} /></span><span><strong>{notification.title}</strong><small>{notification.detail}</small></span></button>)}<div className="popover-foot">Updates shown for this workspace preview</div></div>}
        </div>
        <div className="profile-chip"><span className="profile-avatar">{role === 'patient' ? 'AN' : role === 'physiotherapist' ? 'MS' : 'LN'}</span><span className="profile-copy"><strong>{roleNames[role]}</strong><small>{roleOptions.find((option) => option.id === role)?.label}</small></span></div>
      </header>

      <div className="app-body">
        <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
          <div className="workspace-label"><span className="workspace-label-mark"><Stethoscope size={15} /></span><span>REHABILITATION<br />CARE PORTAL</span></div>
          <div className="sidebar-section-label">YOUR WORKSPACE</div>
          <nav className="side-navigation" aria-label={`${roleOptions.find((option) => option.id === role)?.label} navigation`}>
            {navigation[role].map(({ id, label, icon: Icon }) => <button key={id} className={`side-nav-item ${page === id ? 'side-nav-active' : ''}`} onClick={() => navigate(id)} aria-current={page === id ? 'page' : undefined}><Icon size={18} strokeWidth={1.8} /><span>{label}</span>{id === 'reviews' && unreadCount > 0 && <span className="nav-count">{unreadCount}</span>}</button>)}
          </nav>
          <div className="sidebar-bottom">
            <div className="sidebar-support"><span><HeartHandshakeIcon /></span><strong>Here for your recovery.</strong><small>Your care team is with you every step.</small></div>
            <div className="api-status"><span className={`api-status-dot ${health?.status?.toLowerCase().includes('healthy') ? 'api-online' : ''}`} /><span>{health?.status?.toLowerCase().includes('healthy') ? 'Care service connected' : 'Connecting to care service'}</span></div>
          </div>
        </aside>

        {menuOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}

        <main className="main-panel">
          <div className="main-inner">{renderPage()}</div>
          <footer className="app-footer"><span><ShieldCheck size={14} /> RehabSense is an assistive exercise companion, not a diagnostic service.</span><span>Clinical decisions remain with your licensed care team.</span></footer>
        </main>
      </div>
    </div>
  );
}

function HeartHandshakeIcon() {
  return <Heart size={17} />;
}
