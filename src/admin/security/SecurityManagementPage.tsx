import { useState, useEffect } from 'react';
import { Users, Building2, Users as Users2, Shield } from 'lucide-react';
import { fetchUsers } from '../../services/securityService';
import { fetchBusinessUnits } from '../../services/securityService';
import { fetchTeams } from '../../services/securityService';
import { fetchSecurityRoles } from '../../services/securityService';
import UsersPage from './UsersPage';
import BusinessUnitsPage from './BusinessUnitsPage';
import TeamsPage from './TeamsPage';
import SecurityRolesPage from './SecurityRolesPage';

type Tab = 'users' | 'business_units' | 'teams' | 'roles';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'users',          label: 'Users',           icon: <Users size={13} /> },
  { id: 'business_units', label: 'Business Units',  icon: <Building2 size={13} /> },
  { id: 'teams',          label: 'Teams',           icon: <Users2 size={13} /> },
  { id: 'roles',          label: 'Security Roles',  icon: <Shield size={13} /> },
];

interface Stats {
  totalUsers: number;
  activeUsers: number;
  totalRoles: number;
  systemRoles: number;
  customRoles: number;
  totalBUs: number;
  totalTeams: number;
}

export default function SecurityManagementPage() {
  const [tab, setTab] = useState<Tab>('users');
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    Promise.all([
      fetchUsers(),
      fetchBusinessUnits(),
      fetchTeams(),
      fetchSecurityRoles(),
    ]).then(([users, bus, teams, roles]) => {
      setStats({
        totalUsers: users.length,
        activeUsers: users.filter((u) => u.is_active).length,
        totalRoles: roles.length,
        systemRoles: roles.filter((r) => r.is_system).length,
        customRoles: roles.filter((r) => !r.is_system).length,
        totalBUs: bus.length,
        totalTeams: teams.length,
      });
    }).catch(() => {});
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#f3f4f6]">
      {stats && (
        <div className="bg-white border-b border-slate-200 px-5 py-2.5 flex items-center gap-5 shrink-0">
          <StatPill
            icon={<Users size={12} />}
            label="Users"
            value={stats.totalUsers}
            sub={`${stats.activeUsers} active`}
            color="blue"
          />
          <div className="w-px h-6 bg-slate-200" />
          <StatPill
            icon={<Shield size={12} />}
            label="Roles"
            value={stats.totalRoles}
            sub={`${stats.systemRoles} system · ${stats.customRoles} custom`}
            color="amber"
          />
          <div className="w-px h-6 bg-slate-200" />
          <StatPill
            icon={<Building2 size={12} />}
            label="Business Units"
            value={stats.totalBUs}
            color="teal"
          />
          <div className="w-px h-6 bg-slate-200" />
          <StatPill
            icon={<Users2 size={12} />}
            label="Teams"
            value={stats.totalTeams}
            color="slate"
          />
        </div>
      )}

      <div className="bg-white border-b border-slate-200 px-4 flex items-center gap-0 shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-[12px] font-medium border-b-2 transition-all whitespace-nowrap ${
              tab === t.id
                ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <span className={tab === t.id ? 'text-blue-600' : 'text-slate-400'}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 relative">
        {tab === 'users'          && <UsersPage />}
        {tab === 'business_units' && <BusinessUnitsPage />}
        {tab === 'teams'          && <TeamsPage />}
        {tab === 'roles'          && <SecurityRolesPage />}
      </div>
    </div>
  );
}

interface StatPillProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
  color: 'blue' | 'amber' | 'teal' | 'slate';
}

const COLOR_MAP: Record<StatPillProps['color'], string> = {
  blue:  'bg-blue-50 text-blue-600',
  amber: 'bg-amber-50 text-amber-600',
  teal:  'bg-teal-50 text-teal-600',
  slate: 'bg-slate-100 text-slate-500',
};

function StatPill({ icon, label, value, sub, color }: StatPillProps) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${COLOR_MAP[color]}`}>
        {icon}
      </div>
      <div className="flex flex-col leading-none gap-0.5">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[15px] font-semibold text-slate-800">{value}</span>
          <span className="text-[11px] font-medium text-slate-500">{label}</span>
        </div>
        {sub && <span className="text-[10px] text-slate-400">{sub}</span>}
      </div>
    </div>
  );
}
