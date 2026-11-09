import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertCircle, ArrowUpRight, Boxes, CheckCircle2, ChevronDown, ChevronRight,
  Clock3, Code2, Command, ExternalLink, GitBranch, GitFork, GitPullRequest,
  LayoutDashboard, LoaderCircle,
  LogOut, Menu, Package, RefreshCw, Search, ShieldCheck, Sparkles, Star, Users,
  Workflow, XCircle, Zap,
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'repositories', label: 'Repositories', icon: Boxes },
  { id: 'pulls', label: 'Pull Requests', icon: GitPullRequest },
  { id: 'actions', label: 'Actions', icon: Workflow },
  { id: 'releases', label: 'Releases', icon: Package },
];

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = response.headers.get('content-type')?.includes('application/json')
    ? await response.json()
    : null;
  if (!response.ok) throw new Error(data?.error || `Request gagal (${response.status}).`);
  return data;
}

function formatNumber(value = 0) {
  return new Intl.NumberFormat('id-ID', { notation: value > 9999 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value);
}

function timeAgo(value) {
  if (!value) return 'Belum tersedia';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Belum tersedia';
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  const units = [
    ['tahun', 31536000], ['bulan', 2592000], ['minggu', 604800],
    ['hari', 86400], ['jam', 3600], ['menit', 60],
  ];
  for (const [label, size] of units) {
    if (seconds >= size) return `${Math.floor(seconds / size)} ${label} lalu`;
  }
  return 'Baru saja';
}

function initials(name = 'R') {
  return name.split(/[\s-]+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('');
}

function Avatar({ user, size = 'md' }) {
  return user?.avatarUrl
    ? <img className={`avatar avatar-${size}`} src={user.avatarUrl} alt={`${user.login} avatar`} referrerPolicy="no-referrer" />
    : <span className={`avatar avatar-${size} avatar-fallback`}>{initials(user?.name || user?.login)}</span>;
}

function EmptyState({ icon: Icon = Boxes, title, detail }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={21} /></span><strong>{title}</strong><p>{detail}</p></div>;
}

function LoadingBlock({ label = 'Memuat data GitHub…' }) {
  return <div className="loading-block"><LoaderCircle className="spin" size={19} /><span>{label}</span></div>;
}

function MetricCard({ label, value, note, icon: Icon, accent, trend }) {
  return (
    <article className={`metric-card metric-${accent}`}>
      <div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={18} /></span></div>
      <div className="metric-value">{formatNumber(value)}</div>
      <div className="metric-foot"><span>{note}</span>{trend ? <span className="metric-trend"><ArrowUpRight size={13} /> Live</span> : null}</div>
    </article>
  );
}

function SectionHeading({ eyebrow, title, action }) {
  return <div className="section-heading"><div>{eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}<h2>{title}</h2></div>{action}</div>;
}

function RepoCard({ repo }) {
  return (
    <a className="repo-card" href={repo.url} target="_blank" rel="noreferrer">
      <div className="repo-card-head"><span className="repo-icon"><Code2 size={16} /></span><span className="repo-visibility">{repo.visibility || 'public'}</span></div>
      <h3>{repo.name}</h3>
      <p>{repo.description || 'Belum ada deskripsi untuk repository ini.'}</p>
      <div className="repo-meta">
        {repo.language ? <span className="language-dot"><i />{repo.language}</span> : <span className="muted-meta">No language</span>}
        <span><Star size={13} />{formatNumber(repo.stars)}</span>
        <span><GitFork size={13} />{formatNumber(repo.forks)}</span>
        <span className="repo-updated">{timeAgo(repo.updatedAt)}</span>
      </div>
    </a>
  );
}

function StatusPill({ status, conclusion, draft }) {
  if (draft) return <span className="pill pill-neutral">Draft</span>;
  const value = conclusion || status || 'unknown';
  const normalized = value.toLowerCase();
  const positive = ['success', 'completed', 'merged'].includes(normalized);
  const negative = ['failure', 'cancelled', 'timed_out', 'action_required'].includes(normalized);
  return <span className={`pill ${positive ? 'pill-green' : negative ? 'pill-red' : 'pill-amber'}`}><i />{value.replaceAll('_', ' ')}</span>;
}

function Overview({ data, sectionData, onNavigate, loading, pullsLoading, actionsLoading, pullsError, actionsError }) {
  const topRepos = [...(data?.repositories || [])].sort((a, b) => b.stars - a.stars).slice(0, 4);
  const maxLanguage = Math.max(1, ...(data?.languages || []).map((item) => item.count));
  const pulls = sectionData.pulls || [];
  const actions = sectionData.actions || [];
  return (
    <div className="page-stack">
      <section className="welcome-card">
        <div className="welcome-copy"><div className="welcome-label"><span className="online-dot" /> DEVELOPER WORKSPACE</div><h2>Build something<br /><em>exceptional.</em></h2><p>Pantau proyek, kontribusi, workflow, dan rilis GitHub dalam satu workspace.</p><div className="welcome-actions"><a className="button button-primary" href="https://github.com/Ravs-Dev?tab=repositories" target="_blank" rel="noreferrer">Lihat GitHub <ExternalLink size={15} /></a><span className="welcome-meta"><ShieldCheck size={14} /> Secure OAuth connection</span></div></div>
        <div className="welcome-visual"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="visual-core"><GitBranch size={58} strokeWidth={1.35} /></div><span className="visual-chip chip-top"><Activity size={13} /> Developer activity</span><span className="visual-chip chip-bottom"><CheckCircle2 size={13} /> Connected</span><span className="visual-star star-one">✳</span><span className="visual-star star-two">✦</span></div>
      </section>

      <section className="metrics-grid">
        <MetricCard label="Repositories" value={data?.stats.repositories} note="Public repositories" icon={Boxes} accent="blue" trend />
        <MetricCard label="Total stars" value={data?.stats.stars} note="Across your repositories" icon={Star} accent="violet" trend />
        <MetricCard label="Total forks" value={data?.stats.forks} note="Community activity" icon={GitFork} accent="cyan" />
        <MetricCard label="Followers" value={data?.stats.followers} note="Developer network" icon={Users} accent="orange" />
      </section>

      <div className="content-grid">
        <section className="panel panel-main"><SectionHeading eyebrow="YOUR WORKSPACE" title="Featured repositories" action={<button className="text-action" onClick={() => onNavigate('repositories')}>All repositories <ChevronRight size={15} /></button>} />
          {loading ? <LoadingBlock /> : topRepos.length ? <div className="repo-grid">{topRepos.map((repo) => <RepoCard key={repo.id} repo={repo} />)}</div> : <EmptyState title="Belum ada repository publik" detail="Repository publik milik akun ini akan muncul di sini." />}
        </section>
        <section className="panel panel-side"><SectionHeading eyebrow="TECH STACK" title="Languages" />
          {loading ? <LoadingBlock label="Reading repository languages…" /> : data?.languages?.length ? <div className="language-list">{data.languages.map((item, index) => <div className="language-row" key={item.name}><div className="language-label"><span>{item.name}</span><span>{item.count} repos</span></div><div className="language-track"><i style={{ width: `${(item.count / maxLanguage) * 100}%` }} className={`language-fill fill-${index % 5}`} /></div></div>)}</div> : <EmptyState icon={Code2} title="Belum ada data bahasa" detail="Bahasa akan terdeteksi dari repository publik." />}
          <div className="panel-divider" /><div className="profile-mini"><Avatar user={data?.user} size="lg" /><div><strong>{data?.user?.name || data?.user?.login}</strong><span>@{data?.user?.login}</span></div><a href={data?.user?.htmlUrl} target="_blank" rel="noreferrer" aria-label="Open GitHub profile"><ExternalLink size={15} /></a></div>
        </section>
      </div>

      <div className="content-grid content-grid-bottom">
        <section className="panel"><SectionHeading eyebrow="CONTRIBUTION" title="Recent pull requests" action={<button className="text-action" onClick={() => onNavigate('pulls')}>View all <ChevronRight size={15} /></button>} />
          {pullsError ? <div className="inline-error"><AlertCircle size={15} />{pullsError}</div> : pullsLoading ? <LoadingBlock label="Loading pull requests…" /> : pulls.length ? <div className="activity-list">{pulls.slice(0, 4).map((item) => <a className="activity-row" href={item.url} target="_blank" rel="noreferrer" key={item.id}><span className="activity-icon pull-icon"><GitPullRequest size={16} /></span><span className="activity-info"><strong>{item.title}</strong><small>{item.repository} · #{item.number} · {timeAgo(item.updatedAt)}</small></span><StatusPill status={item.state} draft={item.draft} /></a>)}</div> : <EmptyState icon={GitPullRequest} title="No pull requests yet" detail="Pull Request yang kamu buat akan muncul di sini." />}
        </section>
        <section className="panel"><SectionHeading eyebrow="AUTOMATION" title="Latest workflows" action={<button className="text-action" onClick={() => onNavigate('actions')}>View all <ChevronRight size={15} /></button>} />
          {actionsError ? <div className="inline-error"><AlertCircle size={15} />{actionsError}</div> : actionsLoading ? <LoadingBlock label="Loading workflow runs…" /> : actions.length ? <div className="activity-list">{actions.slice(0, 4).map((item) => <a className="activity-row" href={item.url} target="_blank" rel="noreferrer" key={item.id}><span className="activity-icon workflow-icon"><Workflow size={16} /></span><span className="activity-info"><strong>{item.name}</strong><small>{item.repository} · {item.branch || item.event} · {timeAgo(item.createdAt)}</small></span><StatusPill status={item.status} conclusion={item.conclusion} /></a>)}</div> : <EmptyState icon={Workflow} title="No workflow runs" detail="Workflow GitHub Actions dari repo publik akan muncul di sini." />}
        </section>
      </div>
    </div>
  );
}

function RepositoriesPage({ repos, loading, error }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => repos.filter((repo) => `${repo.name} ${repo.description || ''} ${repo.language || ''}`.toLowerCase().includes(query.toLowerCase())), [repos, query]);
  return <div className="page-stack"><div className="page-intro"><div><span className="eyebrow">CODEBASE</span><h2>Repositories</h2><p>Jelajahi dan pantau proyek publikmu.</p></div><div className="search-box"><Search size={16} /><input aria-label="Search repositories" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search repositories…" /></div></div>
    {error ? <div className="inline-error"><AlertCircle size={16} />{error}</div> : null}
    {loading ? <LoadingBlock /> : filtered.length ? <div className="repo-grid repo-grid-large">{filtered.map((repo) => <RepoCard key={repo.id} repo={repo} />)}</div> : <EmptyState title="Repository tidak ditemukan" detail="Coba kata kunci lain atau periksa visibilitas repository." />}
  </div>;
}

function PullRequestsPage({ items, loading, error }) {
  return <div className="page-stack"><div className="page-intro"><div><span className="eyebrow">COLLABORATION</span><h2>Pull Requests</h2><p>Pull Request publik yang dibuat oleh akunmu.</p></div><a className="button button-secondary" href="https://github.com/pulls?q=is%3Apr+author%3ARavs-Dev" target="_blank" rel="noreferrer">Open GitHub <ExternalLink size={14} /></a></div>
    {error ? <div className="inline-error"><AlertCircle size={16} />{error}</div> : null}
    {loading ? <LoadingBlock /> : items.length ? <div className="panel list-panel"><div className="list-heading"><span>{items.length} recent pull requests</span><span>Updated recently</span></div>{items.map((item) => <a className="expanded-row" href={item.url} target="_blank" rel="noreferrer" key={item.id}><span className="activity-icon pull-icon"><GitPullRequest size={17} /></span><span className="expanded-main"><strong>{item.title}</strong><small>{item.repository} · #{item.number} · Updated {timeAgo(item.updatedAt)}</small><span className="label-wrap">{item.labels.slice(0, 3).map((label) => <i key={label}>{label}</i>)}</span></span><StatusPill status={item.state} draft={item.draft} /><ExternalLink className="row-external" size={15} /></a>)}</div> : <EmptyState icon={GitPullRequest} title="No pull requests found" detail="Belum ada Pull Request publik yang dibuat oleh akun ini." />}
  </div>;
}

function ActionsPage({ items, loading, error }) {
  return <div className="page-stack"><div className="page-intro"><div><span className="eyebrow">CI / CD</span><h2>GitHub Actions</h2><p>Ringkasan workflow runs dari repository publik terbaru.</p></div><a className="button button-secondary" href="https://github.com/Ravs-Dev?tab=repositories" target="_blank" rel="noreferrer">Browse repos <ExternalLink size={14} /></a></div>
    {error ? <div className="inline-error"><AlertCircle size={16} />{error}</div> : null}
    {loading ? <LoadingBlock /> : items.length ? <div className="panel list-panel"><div className="list-heading"><span>Workflow runs</span><span>Latest first</span></div>{items.map((item) => <a className="expanded-row" href={item.url} target="_blank" rel="noreferrer" key={item.id}><span className="activity-icon workflow-icon"><Workflow size={17} /></span><span className="expanded-main"><strong>{item.name}</strong><small>{item.repository} · {item.branch || 'No branch'} · {item.event} · {timeAgo(item.createdAt)}</small></span><StatusPill status={item.status} conclusion={item.conclusion} /><ExternalLink className="row-external" size={15} /></a>)}</div> : <EmptyState icon={Workflow} title="No workflow runs found" detail="Aktifkan GitHub Actions pada repository untuk melihat eksekusi workflow di sini." />}
  </div>;
}

function ReleasesPage({ items, loading, error }) {
  return <div className="page-stack"><div className="page-intro"><div><span className="eyebrow">DISTRIBUTION</span><h2>Releases</h2><p>Rilis dan versi terbaru dari repository publikmu.</p></div><a className="button button-secondary" href="https://github.com/Ravs-Dev?tab=repositories" target="_blank" rel="noreferrer">Browse repos <ExternalLink size={14} /></a></div>
    {error ? <div className="inline-error"><AlertCircle size={16} />{error}</div> : null}
    {loading ? <LoadingBlock /> : items.length ? <div className="release-grid">{items.map((item) => <a href={item.url} target="_blank" rel="noreferrer" className="release-card" key={item.id}><div className="release-top"><span className="release-icon"><Package size={18} /></span><span className="release-tag">{item.tag}</span></div><h3>{item.name}</h3><p>{item.repository}</p><div className="release-bottom"><span>{item.prerelease ? 'Pre-release' : item.draft ? 'Draft' : 'Published'}</span><span>{timeAgo(item.publishedAt)}</span><ExternalLink size={14} /></div></a>)}</div> : <EmptyState icon={Package} title="No releases yet" detail="Buat GitHub Release pada repository publik untuk menampilkannya di sini." />}
  </div>;
}

function LoginScreen({ status, error }) {
  return <main className="login-shell"><div className="login-top"><div className="brand-lockup"><span className="brand-mark"><Command size={21} /></span><span>RAVS<span className="brand-muted">.DEV</span></span></div><span className="login-top-label"><span className="online-dot" /> DEVELOPER CONTROL CENTER</span></div>
    <div className="login-content"><div className="login-copy"><span className="eyebrow"><Sparkles size={13} /> BUILT FOR BUILDERS</span><h1>Your code.<br /><em>Your ecosystem.</em></h1><p>Workspace terpusat untuk memantau repository, kontribusi, workflow, dan release GitHub milik Ravs-Dev.</p><div className="login-features"><div><span><Boxes size={16} /></span><strong>Repository insights</strong><small>Stars, forks, bahasa, dan aktivitas.</small></div><div><span><Workflow size={16} /></span><strong>Delivery visibility</strong><small>Workflow dan release dari satu tempat.</small></div><div><span><ShieldCheck size={16} /></span><strong>Secure by design</strong><small>OAuth, PKCE, dan token tersimpan aman.</small></div></div>
      {error ? <div className="inline-error"><AlertCircle size={16} />{error}</div> : null}
      {status && !status.oauthConfigured ? <div className="inline-error"><AlertCircle size={16} />OAuth belum dikonfigurasi. Lengkapi environment variables server.</div> : null}
      {status?.oauthConfigured ? <a className="button button-primary button-connect" href="/api/auth/github"><GitBranch size={19} /> Continue with GitHub <ArrowUpRight size={16} /></a> : <span className="button button-primary button-connect button-disabled" aria-disabled="true"><GitBranch size={19} /> OAuth setup required</span>}<span className="login-privacy"><ShieldCheck size={13} /> Akses hanya untuk membaca profil dan data publik GitHub.</span>
    </div><div className="login-art"><div className="art-grid" /><div className="art-glow" /><div className="art-ring ring-a" /><div className="art-ring ring-b" /><div className="art-core"><GitBranch size={76} strokeWidth={1.15} /></div><div className="floating-card float-a"><span className="float-icon"><GitBranch size={15} /></span><div><b>Repositories</b><small>Connected workspace</small></div><CheckCircle2 size={15} className="float-check" /></div><div className="floating-card float-b"><span className="float-icon float-purple"><Activity size={15} /></span><div><b>Live activity</b><small>GitHub REST API</small></div><span className="float-pulse" /></div><div className="art-caption">ENGINEERED FOR THE NEXT BUILD <span>✳</span></div></div></div>
    <footer className="login-footer"><span>© {new Date().getFullYear()} RAVS-DEV</span><span>Powered by GitHub API <i /> Built with care</span></footer>
  </main>;
}

export default function App() {
  const [auth, setAuth] = useState({ checked: false, authenticated: false, user: null, supportEmail: null, oauthConfigured: false });
  const [dashboard, setDashboard] = useState(null);
  const [sectionData, setSectionData] = useState({ pulls: [], actions: [], releases: [] });
  const [sectionLoading, setSectionLoading] = useState({ dashboard: false, pulls: false, actions: false, releases: false });
  const [sectionErrors, setSectionErrors] = useState({});
  const [loadedSections, setLoadedSections] = useState({ pulls: false, actions: false, releases: false });
  const [active, setActive] = useState('overview');
  const [globalError, setGlobalError] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadDashboardData = useCallback(async () => {
    setSectionLoading((current) => ({ ...current, dashboard: true }));
    setSectionErrors((current) => ({ ...current, dashboard: '' }));
    try {
      const data = await api('/api/dashboard');
      setDashboard(data);
      return data;
    } catch (error) {
      setSectionErrors((current) => ({ ...current, dashboard: error.message }));
      throw error;
    } finally { setSectionLoading((current) => ({ ...current, dashboard: false })); }
  }, []);

  const loadSection = useCallback(async (section) => {
    if (!['pulls', 'actions', 'releases'].includes(section)) return;
    setSectionLoading((current) => ({ ...current, [section]: true }));
    setSectionErrors((current) => ({ ...current, [section]: '' }));
    try {
      const path = { pulls: '/api/pull-requests', actions: '/api/actions', releases: '/api/releases' }[section];
      const data = await api(path);
      setSectionData((current) => ({ ...current, [section]: data.items ?? [] }));
      setLoadedSections((current) => ({ ...current, [section]: true }));
    } catch (error) {
      setSectionErrors((current) => ({ ...current, [section]: error.message }));
      setLoadedSections((current) => ({ ...current, [section]: true }));
    }
    finally { setSectionLoading((current) => ({ ...current, [section]: false })); }
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const status = await api('/api/auth/status');
      setAuth({ checked: true, ...status });
      if (status.authenticated) {
        try {
          await loadDashboardData();
          await Promise.all([loadSection('pulls'), loadSection('actions')]);
        } catch { /* Individual sections expose their own error state. */ }
      }
    } catch (error) {
      setGlobalError(error.message);
      setAuth((current) => ({ ...current, checked: true }));
    }
  }, [loadDashboardData, loadSection]);

  useEffect(() => { checkAuth(); }, [checkAuth, refreshKey]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorCode = params.get('oauth_error');
    if (errorCode) {
      const errorText = errorCode === 'denied' ? 'Akses OAuth dibatalkan. Kamu bisa mencoba lagi kapan saja.' : 'Autentikasi GitHub gagal atau sesi kedaluwarsa. Silakan coba lagi.';
      setGlobalError(errorText);
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.has('connected')) window.history.replaceState({}, '', window.location.pathname);
  }, []);

  useEffect(() => {
    if (auth.authenticated && ['pulls', 'actions', 'releases'].includes(active) && !loadedSections[active] && !sectionLoading[active]) loadSection(active);
  }, [active, auth.authenticated, loadSection, loadedSections, sectionLoading]);

  const handleLogout = async () => {
    try {
      const result = await api('/api/auth/logout', { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      setAuth((current) => ({ ...current, authenticated: false, user: null }));
      if (!result.tokenRevoked) setGlobalError('Sesi dashboard sudah dihapus, tetapi izin OAuth belum berhasil dicabut otomatis. Cabut akses aplikasi dari GitHub Settings → Applications.');
      setDashboard(null);
      setSectionData({ pulls: [], actions: [], releases: [] });
      setActive('overview');
    } catch (error) { setGlobalError(error.message); }
  };

  const refresh = () => {
    setSectionData({ pulls: [], actions: [], releases: [] });
    setLoadedSections({ pulls: false, actions: false, releases: false });
    setRefreshKey((key) => key + 1);
  };

  if (!auth.checked) return <div className="app-loading"><span className="brand-mark"><Command size={22} /></span><LoaderCircle className="spin" size={18} /><span>Preparing your workspace</span></div>;
  if (!auth.authenticated) return <LoginScreen status={auth} error={globalError} />;

  const title = NAV_ITEMS.find((item) => item.id === active)?.label || 'Overview';
  const activeLoading = active === 'overview' ? sectionLoading.dashboard : sectionLoading[active];
  return (
    <div className="app-shell">
      {mobileNav ? <button className="mobile-scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation" /> : null}
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup"><span className="brand-mark"><Command size={21} /></span><span>RAVS<span className="brand-muted">.DEV</span></span></div>
        <div className="workspace-switch"><span className="workspace-avatar">R</span><span><b>Ravs Workspace</b><small>Personal account</small></span><ChevronDown size={14} /></div>
        <div className="nav-label">WORKSPACE</div>
        <nav className="main-nav">{NAV_ITEMS.map((item) => { const Icon = item.icon; return <button key={item.id} className={`nav-item ${active === item.id ? 'nav-active' : ''}`} onClick={() => { setActive(item.id); setMobileNav(false); }}><Icon size={18} /><span>{item.label}</span>{item.id === 'overview' ? <span className="nav-live" /> : null}</button>; })}</nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-callout"><div className="callout-icon"><Zap size={16} /></div><strong>Build in public.</strong><p>Keep your developer ecosystem moving forward.</p><a href="https://github.com/Ravs-Dev" target="_blank" rel="noreferrer">Open GitHub <ArrowUpRight size={13} /></a></div>
        <div className="sidebar-profile"><Avatar user={auth.user} size="md" /><div className="sidebar-profile-copy"><b>{auth.user?.name || auth.user?.login}</b><span>@{auth.user?.login}</span></div><button className="icon-button logout-button" onClick={handleLogout} title="Disconnect GitHub" aria-label="Disconnect GitHub"><LogOut size={16} /></button></div>
      </aside>
      <main className="main-area">
        <header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={19} /></button><div className="breadcrumb"><span>Ravs Workspace</span><ChevronRight size={14} /><strong>{title}</strong></div></div><div className="topbar-right"><span className="sync-status"><span className="online-dot" /> GitHub connected</span><button className="icon-button refresh-button" onClick={refresh} title="Refresh data" aria-label="Refresh data"><RefreshCw size={16} /></button><a className="topbar-avatar-link" href={auth.user?.htmlUrl} target="_blank" rel="noreferrer" title="Open GitHub profile"><Avatar user={auth.user} size="sm" /></a></div></header>
        <div className="page-container"><div className="page-title-row"><div><span className="eyebrow">RAVS DEVELOPER DASHBOARD</span><h1>{active === 'overview' ? `Welcome back, ${(auth.user?.name || auth.user?.login || 'developer').split(' ')[0]}.` : title}</h1><p>{active === 'overview' ? 'A clear view of what you are building and shipping.' : 'Data is synced directly from the GitHub REST API.'}</p></div><div className="page-title-actions"><span className="last-sync"><Clock3 size={13} /> {dashboard?.refreshedAt ? `Synced ${timeAgo(dashboard.refreshedAt)}` : 'Live workspace'}</span><button className="button button-secondary button-small" onClick={refresh}><RefreshCw size={14} /> Refresh</button></div></div>
          {globalError ? <div className="inline-error global-error"><AlertCircle size={16} />{globalError}<button onClick={() => setGlobalError('')} aria-label="Dismiss error"><XCircle size={15} /></button></div> : null}
          {sectionErrors[active] ? <div className="inline-error global-error"><AlertCircle size={16} />{sectionErrors[active]}<button onClick={() => setSectionErrors((current) => ({ ...current, [active]: '' }))} aria-label="Dismiss error"><XCircle size={15} /></button></div> : null}
          {active === 'overview' && sectionErrors.dashboard ? <div className="inline-error global-error"><AlertCircle size={16} />{sectionErrors.dashboard}</div> : null}
          {active === 'overview' ? <Overview data={dashboard} sectionData={sectionData} onNavigate={setActive} loading={sectionLoading.dashboard || (!dashboard && !sectionErrors.dashboard)} pullsLoading={sectionLoading.pulls} actionsLoading={sectionLoading.actions} pullsError={sectionErrors.pulls} actionsError={sectionErrors.actions} /> : null}
          {active === 'repositories' ? <RepositoriesPage repos={dashboard?.repositories || []} loading={sectionLoading.dashboard} error={sectionErrors.dashboard} /> : null}
          {active === 'pulls' ? <PullRequestsPage items={sectionData.pulls} loading={sectionLoading.pulls} error={sectionErrors.pulls} /> : null}
          {active === 'actions' ? <ActionsPage items={sectionData.actions} loading={sectionLoading.actions} error={sectionErrors.actions} /> : null}
          {active === 'releases' ? <ReleasesPage items={sectionData.releases} loading={sectionLoading.releases} error={sectionErrors.releases} /> : null}
          <footer className="app-footer"><span>© {new Date().getFullYear()} RAVS-DEV <i /> Developer workspace</span><span>{auth.supportEmail ? <a href={`mailto:${auth.supportEmail}`}>Support</a> : 'Support contact not configured'} <i /> <a href="https://docs.github.com/en/rest" target="_blank" rel="noreferrer">GitHub API docs <ExternalLink size={11} /></a></span></footer>
        </div>
      </main>
    </div>
  );
}
