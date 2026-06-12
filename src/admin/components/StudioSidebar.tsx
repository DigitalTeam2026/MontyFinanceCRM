import { Database, Settings, ChevronRight, GitBranch, ShieldCheck, Map, BarChart2, LogOut, ExternalLink, GitMerge, Milestone, ScanSearch, ClipboardCheck, FileWarning, KeyRound, ShieldAlert, Activity, Zap, Building2, FolderCog } from 'lucide-react';
import { getInitials } from '../../app/utils/initials';

interface SideNavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface StudioSidebarProps {
  activeModule: string;
  onNavigate: (id: string) => void;
  userEmail?: string;
  userName?: string;
  onSignOut?: () => void;
}

const SECTIONS: { label: string; items: SideNavItem[] }[] = [
  {
    label: 'Organization',
    items: [
      { id: 'companyprofile', label: 'Company Profile', icon: <Building2 size={14} /> },
    ],
  },
  {
    label: 'Customization',
    items: [
      { id: 'entities',  label: 'Tables',           icon: <Database size={14} /> },
      { id: 'workflows',    label: 'Workflows',        icon: <GitBranch size={14} /> },
      { id: 'processflows', label: 'Process Flows',   icon: <GitMerge size={14} /> },
      { id: 'stages',       label: 'Pipeline Stages', icon: <Milestone size={14} /> },
    ],
  },
  {
    label: 'Platform',
    items: [
      { id: 'navigation',  label: 'Navigation',        icon: <Map size={14} /> },
      { id: 'dashboard',   label: 'Dashboards',        icon: <BarChart2 size={14} /> },
      { id: 'duplicates',       label: 'Duplicate Detection', icon: <ScanSearch size={14} /> },
      { id: 'approvals',            label: 'Approval Processes',      icon: <ClipboardCheck size={14} /> },
      { id: 'policies',          label: 'Data Policies',       icon: <FileWarning size={14} /> },
      { id: 'digitalrules',     label: 'Digital Rules',       icon: <ShieldAlert size={14} /> },
      { id: 'merges',            label: 'Merge Center',        icon: <GitMerge size={14} /> },
      { id: 'integrations',      label: 'API Integrations',    icon: <Zap size={14} /> },
      { id: 'documentlocation',  label: 'Document Location',    icon: <FolderCog size={14} /> },
    ],
  },
  {
    label: 'Security',
    items: [
      { id: 'security',       label: 'Security',          icon: <ShieldCheck size={14} /> },
      { id: 'columnsecurity', label: 'Column Security',   icon: <KeyRound size={14} /> },
    ],
  },
  {
    label: 'Diagnostics',
    items: [
      { id: 'dbvalidation', label: 'DB Validation', icon: <Activity size={14} /> },
    ],
  },
];

export default function StudioSidebar({ activeModule, onNavigate, userEmail, userName, onSignOut }: StudioSidebarProps) {
  const initials = getInitials(userName, userEmail);

  return (
    <aside
      className="app-sidebar w-52 flex flex-col h-full shrink-0"
      style={{ background: 'var(--sidebar-bg)', color: 'var(--sidebar-text)', borderRight: '1px solid var(--border)' }}
    >
      <div className="px-4 py-3.5 border-b border-[#e5e7eb] flex items-center gap-2.5">
        <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center shrink-0">
          <Settings size={12} className="text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-[#1e293b] leading-none truncate">Admin Studio</p>
          <p className="text-[9px] text-[#9ca3af] mt-0.5 leading-none">Configuration</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {SECTIONS.map((section) => (
          <div key={section.label} className="mb-1">
            <p className="px-4 pt-3 pb-1 text-[9px] font-semibold text-[#9ca3af] uppercase tracking-widest select-none">
              {section.label}
            </p>
            {section.items.map((item) => {
              const active = activeModule === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`w-full flex items-center gap-2.5 px-4 py-2 text-[12px] transition-colors relative ${
                    active
                      ? 'bg-[#e9eef7] text-[#1e293b]'
                      : 'text-[#4b5563] hover:bg-[#eceef1] hover:text-[#1f2937]'
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#2563eb]" />
                  )}
                  <span className={active ? 'text-[#2563eb]' : 'text-[#6b7280]'}>{item.icon}</span>
                  <span className="flex-1 text-left font-medium">{item.label}</span>
                  {active && <ChevronRight size={11} className="text-[#2563eb] shrink-0" />}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="px-3 py-2 border-t border-[#e5e7eb]">
        <a
          href="#/"
          className="flex items-center gap-2 px-2 py-1.5 rounded text-[11px] text-[#4b5563] hover:text-[#1f2937] hover:bg-[#eceef1] transition-colors w-full"
        >
          <ExternalLink size={12} className="text-[#9ca3af]" />
          <span className="font-medium">Go to CRM</span>
        </a>
      </div>

      <div className="px-3 py-2.5 border-t border-[#e5e7eb] flex items-center gap-2.5">
        <div className="w-6 h-6 rounded-full bg-blue-700 flex items-center justify-center shrink-0">
          <span className="text-[9px] font-bold text-white">{initials}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-[#374151] truncate leading-none">{userEmail ?? 'System Admin'}</p>
          <p className="text-[9px] text-[#9ca3af] mt-0.5">Administrator</p>
        </div>
        {onSignOut && (
          <button
            onClick={onSignOut}
            title="Sign out"
            className="text-[#9ca3af] hover:text-[#374151] transition-colors"
          >
            <LogOut size={13} />
          </button>
        )}
      </div>
    </aside>
  );
}
