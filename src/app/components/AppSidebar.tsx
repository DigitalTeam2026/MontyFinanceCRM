import {
  TrendingUp, Megaphone, Headphones as HeadphonesIcon,
  LayoutGrid, FileText, Users, Package, BarChart2, Settings as SettingsIcon,
  Star, Globe, Layers, FolderOpen, BookOpen, ShoppingCart, Briefcase,
  ChevronDown, ChevronRight, Settings, LogOut, PanelLeftClose, PanelLeftOpen,
  UserPlus, Target, Ticket, Building2, RotateCcw, Check,
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import type { AppModule, AppEntity } from '../types';
import { LOGICAL_NAME_TO_ENTITY } from '../types';
import { getInitials } from '../utils/initials';
import RecentPinsPanel from './RecentPinsPanel';
import { fetchFullNavTree } from '../../services/navigationService';
import type { NavArea, NavGroup, NavItem } from '../../services/navigationService';
import { fetchCompanyProfile, getCachedCompanyProfile, type CompanyProfile } from '../../services/companyProfileService';
import { THEMES, DEFAULT_THEME, applyTheme, getCachedTheme, fetchUserTheme, saveUserTheme } from '../../services/themeService';
import type { ThemeKey } from '../../services/themeService';

const ICON_MAP: Record<string, React.ReactNode> = {
  TrendingUp:   <TrendingUp size={16} />,
  Megaphone:    <Megaphone size={16} />,
  Headphones:   <HeadphonesIcon size={16} />,
  Layout:       <LayoutGrid size={16} />,
  FileText:     <FileText size={16} />,
  Users:        <Users size={16} />,
  Package:      <Package size={16} />,
  BarChart2:    <BarChart2 size={16} />,
  Settings:     <SettingsIcon size={16} />,
  Star:         <Star size={16} />,
  Globe:        <Globe size={16} />,
  Layers:       <Layers size={16} />,
  FolderOpen:   <FolderOpen size={16} />,
  BookOpen:     <BookOpen size={16} />,
  ShoppingCart: <ShoppingCart size={16} />,
  Briefcase:    <Briefcase size={16} />,
  UserPlus:     <UserPlus size={16} />,
  Target:       <Target size={16} />,
  Ticket:       <Ticket size={16} />,
  Building2:    <Building2 size={16} />,
};

const AREA_ICON_MAP: Record<string, React.ReactNode> = {
  TrendingUp:   <TrendingUp size={16} />,
  Megaphone:    <Megaphone size={16} />,
  Headphones:   <HeadphonesIcon size={16} />,
  Layout:       <LayoutGrid size={16} />,
  FileText:     <FileText size={16} />,
  Users:        <Users size={16} />,
  Package:      <Package size={16} />,
  BarChart2:    <BarChart2 size={16} />,
  Settings:     <SettingsIcon size={16} />,
  Star:         <Star size={16} />,
  Globe:        <Globe size={16} />,
  Layers:       <Layers size={16} />,
  FolderOpen:   <FolderOpen size={16} />,
  BookOpen:     <BookOpen size={16} />,
  ShoppingCart: <ShoppingCart size={16} />,
  Briefcase:    <Briefcase size={16} />,
};

function resolveEntity(entityName: string | null): AppEntity {
  if (!entityName) return '';
  return LOGICAL_NAME_TO_ENTITY[entityName] ?? entityName;
}

interface AppSidebarProps {
  activeModule: AppModule;
  activeEntity: AppEntity;
  onNavigate: (module: AppModule, entity: AppEntity) => void;
  onNavigateToRecord: (module: AppModule, entity: AppEntity, recordId: string) => void;
  onNavigateToDashboard?: (module: AppModule, entity: AppEntity) => void;
  userEmail?: string;
  userName?: string;
  onSignOut?: () => void;
  userId: string;
  recentRefreshKey?: number;
  isSystemAdmin?: boolean;
  viewType?: string;
}

function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative group/tip">
      {children}
      <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-50
        opacity-0 group-hover/tip:opacity-100 transition-opacity delay-150 duration-150">
        <div className="bg-[#1e293b] text-white text-[11px] font-medium px-2 py-1 rounded-md shadow-lg whitespace-nowrap border border-white/10">
          {label}
          <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[#1e293b]" />
        </div>
      </div>
    </div>
  );
}

function SidebarThemePicker({ currentTheme, onChange }: { currentTheme: ThemeKey; onChange: (k: ThemeKey) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const active = THEMES.find((t) => t.key === currentTheme);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] transition-colors rounded"
        style={{ color: 'var(--sidebar-text)' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--sidebar-hover)'; e.currentTarget.style.color = 'var(--sidebar-strong)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--sidebar-text)'; }}
      >
        <span
          className="w-3.5 h-3.5 rounded-full border border-black/10 shrink-0"
          style={{ background: active?.swatch ?? '#FFFFFF' }}
        />
        <span className="flex-1 text-left font-medium">Theme</span>
        <span className="text-[10px] shrink-0" style={{ color: 'var(--sidebar-text)', opacity: 0.7 }}>{active?.name ?? 'Custom'}</span>
        <ChevronRight size={11} className="shrink-0" style={{ color: 'var(--sidebar-text)', opacity: 0.7 }} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-[230px] rounded-lg shadow-2xl border z-50 overflow-hidden"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow)' }}>
          <div className="px-3 pt-3 pb-2">
            <p className="text-[11px] font-semibold" style={{ color: 'var(--text)' }}>Themes</p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--muted)' }}>Pick a theme — it's saved to your account</p>
          </div>
          <div className="px-2 pb-2 max-h-[280px] overflow-y-auto">
            {THEMES.map((t) => {
              const selected = currentTheme === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => { onChange(t.key); setOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md transition-colors"
                  style={{ background: selected ? 'var(--row-hover)' : 'transparent' }}
                  onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = 'var(--row-hover)'; }}
                  onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span
                    className="w-5 h-5 rounded-md border shrink-0"
                    style={{ background: t.swatch, borderColor: 'rgba(0,0,0,0.12)' }}
                  />
                  <span className="flex-1 text-left text-[12px] font-medium" style={{ color: 'var(--text)' }}>{t.name}</span>
                  {selected && <Check size={13} className="shrink-0" style={{ color: 'var(--primary)' }} />}
                </button>
              );
            })}
          </div>
          <div className="border-t px-3 py-2" style={{ borderColor: 'var(--border)' }}>
            <button
              onClick={() => { onChange(DEFAULT_THEME); setOpen(false); }}
              className="flex items-center gap-1.5 text-[11px] hover:underline font-medium"
              style={{ color: 'var(--link)' }}
            >
              <RotateCcw size={10} />
              Reset to default
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AppSidebar({
  activeModule,
  activeEntity,
  onNavigate,
  onNavigateToRecord,
  onNavigateToDashboard,
  userEmail,
  userName,
  onSignOut,
  userId,
  recentRefreshKey,
  isSystemAdmin = false,
  viewType,
}: AppSidebarProps) {
  const [expanded, setExpanded] = useState<AppModule>(activeModule);
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<ThemeKey>(() => getCachedTheme(userId));

  const [areas, setAreas] = useState<NavArea[]>([]);
  const [groups, setGroups] = useState<NavGroup[]>([]);
  const [items, setItems] = useState<NavItem[]>([]);
  const [brand, setBrand] = useState<CompanyProfile>(getCachedCompanyProfile);

  useEffect(() => {
    let cancelled = false;
    fetchCompanyProfile().then((p) => { if (!cancelled) setBrand(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Load this user's saved theme from the database (cross-device), then apply.
  useEffect(() => {
    let cancelled = false;
    fetchUserTheme(userId).then((k) => { if (!cancelled) setTheme(k); }).catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    fetchFullNavTree()
      .then(({ areas: a, groups: g, items: i }) => {
        setAreas(a.filter((ar) => ar.is_active));
        setGroups(g.filter((gr) => gr.is_active));
        setItems(i.filter((it) => it.is_active));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setExpanded(activeModule);
  }, [activeModule]);

  const handleThemeChange = (key: ThemeKey) => {
    setTheme(key);
    applyTheme(key);
    saveUserTheme(userId, key).catch(() => {});
  };

  const initials = getInitials(userName, userEmail);

  const getGroupItems = (groupId: string) => items.filter((i) => i.nav_group_id === groupId);

  const firstEntityOfArea = (area: NavArea): AppEntity => {
    const areaGroups = groups.filter((g) => g.nav_area_id === area.nav_area_id);
    for (const g of areaGroups) {
      const gItems = items.filter((i) => i.nav_group_id === g.nav_group_id && i.entity_name);
      if (gItems.length > 0) return resolveEntity(gItems[0].entity_name);
    }
    return area.name;
  };

  const allNavItems = items.filter((i) => i.entity_name);
  const seenEntities = new Set<string>();
  const uniqueNavItems = allNavItems.filter((i) => {
    const key = resolveEntity(i.entity_name);
    if (seenEntities.has(key)) return false;
    seenEntities.add(key);
    return true;
  });

  const getAreaForItem = (item: NavItem): NavArea | undefined => {
    const group = groups.find((g) => g.nav_group_id === item.nav_group_id);
    return group ? areas.find((a) => a.nav_area_id === group.nav_area_id) : undefined;
  };

  return (
    <aside
      className="app-sidebar flex flex-col h-full shrink-0 select-none overflow-hidden transition-all duration-300 ease-in-out"
      style={{
        width: collapsed ? '56px' : '220px',
        background: 'var(--sidebar-bg)',
        color: 'var(--sidebar-text)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Brand block - 48px */}
      <div
        className={`h-[48px] flex items-center shrink-0 ${collapsed ? 'justify-center px-0' : 'px-4 gap-2.5'}`}
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        {collapsed ? (
          <div className="w-[26px] h-[26px] rounded-[6px] bg-[#2b6cb0] flex items-center justify-center shrink-0 text-white text-[11px] font-bold">
            {getInitials(brand.company_name)}
          </div>
        ) : (
          <>
            <div className="min-w-0 flex-1 overflow-hidden flex flex-col justify-center">
              <span className="block text-[14px] font-semibold text-[#1f2937] leading-tight truncate">{brand.company_name}</span>
            </div>
            <button
              onClick={() => setCollapsed(true)}
              title="Collapse sidebar"
              className="text-[#9ca3af] hover:text-[#374151] transition-colors shrink-0"
            >
              <PanelLeftClose size={13} />
            </button>
          </>
        )}
      </div>

      {/* Nav */}
      {collapsed ? (
        <nav className="flex-1 overflow-y-auto sidebar-scroll py-2 flex flex-col items-center gap-0.5">
          <button
            onClick={() => setCollapsed(false)}
            title="Expand sidebar"
            className="w-8 h-8 flex items-center justify-center text-[#6b7280] hover:text-[#374151] rounded-md transition-colors mb-1"
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--sidebar-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <PanelLeftOpen size={14} />
          </button>

          <div className="w-6 mb-1" style={{ borderTop: '1px solid var(--border)' }} />

          {/* Dashboard button */}
          <Tooltip label="Personal Dashboard">
            <button
              onClick={() => onNavigateToDashboard?.('sales', 'accounts')}
              className="w-8 h-8 flex items-center justify-center rounded-md transition-colors"
              style={{
                background: viewType === 'dashboard' ? 'var(--sidebar-active)' : 'transparent',
                color: viewType === 'dashboard' ? 'var(--sidebar-strong)' : 'var(--sidebar-text)',
              }}
              onMouseEnter={(e) => {
                if (viewType !== 'dashboard') { e.currentTarget.style.background = 'var(--sidebar-hover)'; e.currentTarget.style.color = 'var(--sidebar-text)'; }
              }}
              onMouseLeave={(e) => {
                if (viewType !== 'dashboard') { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--sidebar-text)'; }
              }}
            >
              <LayoutGrid size={16} />
            </button>
          </Tooltip>

          <div className="w-6 mb-1" style={{ borderTop: '1px solid var(--border)' }} />

          {areas.map((area) => {
            const isActiveModule = activeModule === area.name;
            return (
              <Tooltip key={area.nav_area_id} label={area.display_label}>
                <button
                  onClick={() => {
                    setExpanded(area.name);
                    onNavigate(area.name, firstEntityOfArea(area));
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-md transition-colors"
                  style={{
                    background: isActiveModule ? 'var(--sidebar-active)' : 'transparent',
                    color: isActiveModule ? 'var(--sidebar-strong)' : 'var(--sidebar-text)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActiveModule) { e.currentTarget.style.background = 'var(--sidebar-hover)'; e.currentTarget.style.color = 'var(--sidebar-text)'; }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActiveModule) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--sidebar-text)'; }
                  }}
                >
                  {AREA_ICON_MAP[area.icon_name] ?? <LayoutGrid size={16} />}
                </button>
              </Tooltip>
            );
          })}

          <div className="w-6 my-1" style={{ borderTop: '1px solid var(--border)' }} />

          {uniqueNavItems.map((item) => {
            const entity = resolveEntity(item.entity_name);
            const area = getAreaForItem(item);
            const isActive = activeEntity === entity;
            return (
              <Tooltip key={item.nav_item_id} label={item.display_label}>
                <button
                  onClick={() => { if (area) onNavigate(area.name, entity); }}
                  className="w-8 h-8 flex items-center justify-center rounded-md transition-colors"
                  style={{
                    background: isActive ? 'var(--sidebar-active)' : 'transparent',
                    color: isActive ? 'var(--sidebar-strong)' : 'var(--sidebar-text)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) { e.currentTarget.style.background = 'var(--sidebar-hover)'; e.currentTarget.style.color = 'var(--sidebar-text)'; }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--sidebar-text)'; }
                  }}
                >
                  {ICON_MAP[item.icon_name] ?? <FileText size={16} />}
                </button>
              </Tooltip>
            );
          })}
        </nav>
      ) : (
        <nav className="flex-1 overflow-y-auto sidebar-scroll py-1">
          {/* Dashboard button */}
          <button
            onClick={() => onNavigateToDashboard?.('sales', 'accounts')}
            className="w-full flex items-center gap-2 px-3 h-[36px] text-[13px] font-semibold transition-colors"
            style={{
              color: viewType === 'dashboard' ? 'var(--sidebar-strong)' : 'var(--sidebar-text)',
              background: viewType === 'dashboard' ? 'var(--sidebar-hover)' : 'transparent',
            }}
            onMouseEnter={(e) => {
              if (viewType !== 'dashboard') e.currentTarget.style.background = 'var(--sidebar-hover)';
            }}
            onMouseLeave={(e) => {
              if (viewType !== 'dashboard') e.currentTarget.style.background = 'transparent';
            }}
          >
            <span className={viewType === 'dashboard' ? 'text-[#2563eb]' : 'text-[#6b7280]'}>
              <LayoutGrid size={16} />
            </span>
            <span className="flex-1 text-left truncate">Dashboard</span>
          </button>

          <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />

          {areas.map((area) => {
            const isOpen = expanded === area.name;
            const isActiveModule = activeModule === area.name;
            const areaGroups = groups.filter((g) => g.nav_area_id === area.nav_area_id);

            return (
              <div key={area.nav_area_id}>
                {/* Area header - 32px */}
                <button
                  onClick={() => {
                    setExpanded(area.name);
                    onNavigate(area.name, firstEntityOfArea(area));
                  }}
                  className="w-full flex items-center gap-2 px-3 h-[36px] text-[13px] font-semibold transition-colors"
                  style={{
                    color: isActiveModule ? 'var(--sidebar-strong)' : 'var(--sidebar-text)',
                    background: isActiveModule ? 'var(--sidebar-hover)' : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActiveModule) e.currentTarget.style.background = 'var(--sidebar-hover)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActiveModule) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span className={isActiveModule ? 'text-[#2563eb]' : 'text-[#6b7280]'}>
                    {AREA_ICON_MAP[area.icon_name] ?? <LayoutGrid size={16} />}
                  </span>
                  <span className="flex-1 text-left truncate">{area.display_label}</span>
                  {isOpen
                    ? <ChevronDown size={12} className="text-[#9ca3af] shrink-0" />
                    : <ChevronRight size={12} className="text-[#9ca3af] shrink-0" />}
                </button>

                {isOpen && (
                  <div className="pb-1">
                    {areaGroups.map((group) => {
                      const groupItems = getGroupItems(group.nav_group_id);
                      if (groupItems.length === 0) return null;
                      return (
                        <div key={group.nav_group_id}>
                          {/* Sub-section label */}
                          <p
                            className="text-[10px] uppercase font-semibold text-[#9ca3af]"
                            style={{ letterSpacing: '0.8px', padding: '12px 14px 4px' }}
                          >
                            {group.display_label}
                          </p>
                          {groupItems.map((item) => {
                            const entity = resolveEntity(item.entity_name);
                            const isActive = isActiveModule && activeEntity === entity;
                            return (
                              <button
                                key={item.nav_item_id}
                                onClick={() => onNavigate(area.name, entity)}
                                className="w-full flex items-center gap-2 text-[13px] transition-colors relative"
                                style={{
                                  padding: '7px 12px 7px 14px',
                                  color: isActive ? 'var(--sidebar-strong)' : 'var(--sidebar-text)',
                                  fontWeight: isActive ? 600 : 500,
                                  background: isActive ? 'var(--sidebar-active)' : 'transparent',
                                  borderLeft: isActive ? '2px solid var(--sidebar-strong)' : '2px solid transparent',
                                }}
                                onMouseEnter={(e) => {
                                  if (!isActive) {
                                    e.currentTarget.style.background = 'var(--sidebar-hover)';
                                    e.currentTarget.style.color = 'var(--sidebar-strong)';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!isActive) {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.color = 'var(--sidebar-text)';
                                  }
                                }}
                              >
                                <span className={isActive ? 'text-[#2563eb]' : 'text-[#6b7280]'}>
                                  {ICON_MAP[item.icon_name] ?? <FileText size={16} />}
                                </span>
                                <span className="truncate">{item.display_label}</span>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <RecentPinsPanel
            userId={userId}
            onNavigate={onNavigateToRecord}
            refreshKey={recentRefreshKey}
          />
        </nav>
      )}

      {/* Footer */}
      <div
        className={collapsed ? 'py-3 flex flex-col items-center gap-2' : 'px-2 py-2'}
        style={{ borderTop: '1px solid var(--border)' }}
      >
        {collapsed ? (
          <>
            {isSystemAdmin && (
              <Tooltip label="Admin Studio">
                <a
                  href="#/studio"
                  className="w-8 h-8 flex items-center justify-center text-[#6b7280] hover:text-[#374151] rounded-md transition-colors"
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--sidebar-hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <Settings size={13} />
                </a>
              </Tooltip>
            )}
            <Tooltip label={userEmail ?? 'User'}>
              <div className="w-6 h-6 rounded-full bg-[#2b6cb0] flex items-center justify-center cursor-default">
                <span className="text-[9px] font-bold text-white">{initials}</span>
              </div>
            </Tooltip>
            {onSignOut && (
              <Tooltip label="Sign out">
                <button
                  onClick={onSignOut}
                  className="w-8 h-8 flex items-center justify-center text-[#6b7280] hover:text-[#374151] rounded-md transition-colors"
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--sidebar-hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <LogOut size={13} />
                </button>
              </Tooltip>
            )}
          </>
        ) : (
          <>
            {isSystemAdmin && (
              <a
                href="#/studio"
                className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-[#4b5563] hover:text-[#1f2937] transition-colors rounded"
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--sidebar-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <Settings size={12} className="text-[#6b7280]" />
                <span className="font-medium">Admin Studio</span>
              </a>
            )}

            <SidebarThemePicker currentTheme={theme} onChange={handleThemeChange} />

            <div className="flex items-center gap-2.5 px-3 pt-2 pb-1" style={{ borderTop: '1px solid var(--border)', marginTop: '4px' }}>
              <div className="w-6 h-6 rounded-full bg-[#2b6cb0] flex items-center justify-center shrink-0">
                <span className="text-[9px] font-bold text-white">{initials}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-[#6b7280] truncate leading-none">{userEmail ?? 'User'}</p>
              </div>
              {onSignOut && (
                <button
                  onClick={onSignOut}
                  title="Sign out"
                  className="text-[#6b7280] hover:text-[#374151] transition-colors"
                >
                  <LogOut size={12} />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
