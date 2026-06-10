import {
  TrendingUp, Megaphone, Headphones as HeadphonesIcon,
  LayoutGrid, FileText, Users, Package, BarChart2, Settings as SettingsIcon,
  Star, Globe, Layers, FolderOpen, BookOpen, ShoppingCart, Briefcase,
  ChevronDown, ChevronRight, Settings, LogOut, PanelLeftClose, PanelLeftOpen,
  UserCheck, UserPlus, Target, Ticket, Building2, Palette, RotateCcw,
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import type { AppModule, AppEntity } from '../types';
import { LOGICAL_NAME_TO_ENTITY } from '../types';
import { getInitials } from '../utils/initials';
import RecentPinsPanel from './RecentPinsPanel';
import { fetchFullNavTree } from '../../services/navigationService';
import type { NavArea, NavGroup, NavItem } from '../../services/navigationService';

const ICON_MAP: Record<string, React.ReactNode> = {
  TrendingUp:   <TrendingUp size={15} />,
  Megaphone:    <Megaphone size={15} />,
  Headphones:   <HeadphonesIcon size={15} />,
  Layout:       <LayoutGrid size={15} />,
  FileText:     <FileText size={15} />,
  Users:        <Users size={15} />,
  Package:      <Package size={15} />,
  BarChart2:    <BarChart2 size={15} />,
  Settings:     <SettingsIcon size={15} />,
  Star:         <Star size={15} />,
  Globe:        <Globe size={15} />,
  Layers:       <Layers size={15} />,
  FolderOpen:   <FolderOpen size={15} />,
  BookOpen:     <BookOpen size={15} />,
  ShoppingCart: <ShoppingCart size={15} />,
  Briefcase:    <Briefcase size={15} />,
  UserPlus:     <UserPlus size={15} />,
  Target:       <Target size={15} />,
  Ticket:       <Ticket size={15} />,
  Building2:    <Building2 size={15} />,
};

const AREA_ICON_MAP: Record<string, React.ReactNode> = {
  TrendingUp:   <TrendingUp size={15} />,
  Megaphone:    <Megaphone size={15} />,
  Headphones:   <HeadphonesIcon size={15} />,
  Layout:       <LayoutGrid size={15} />,
  FileText:     <FileText size={15} />,
  Users:        <Users size={15} />,
  Package:      <Package size={15} />,
  BarChart2:    <BarChart2 size={15} />,
  Settings:     <SettingsIcon size={15} />,
  Star:         <Star size={15} />,
  Globe:        <Globe size={15} />,
  Layers:       <Layers size={15} />,
  FolderOpen:   <FolderOpen size={15} />,
  BookOpen:     <BookOpen size={15} />,
  ShoppingCart: <ShoppingCart size={15} />,
  Briefcase:    <Briefcase size={15} />,
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
  onNavigateAssignedToMe: (module: AppModule, entity: AppEntity) => void;
  userEmail?: string;
  userName?: string;
  onSignOut?: () => void;
  userId: string;
  recentRefreshKey?: number;
  isSystemAdmin?: boolean;
}

const SIDEBAR_PRESETS: { name: string; color: string }[] = [
  { name: 'Midnight Navy', color: '#0a1d36' },
  { name: 'Royal Blue',    color: '#0f2a5e' },
  { name: 'Monty Blue',    color: '#163b6e' },
  { name: 'Charcoal',      color: '#1e2328' },
  { name: 'Graphite',      color: '#2d3239' },
  { name: 'Pine',          color: '#0e2f24' },
  { name: 'Emerald',       color: '#0a3622' },
  { name: 'Plum',          color: '#2d1b3d' },
  { name: 'Aubergine',     color: '#3b1a3e' },
  { name: 'Espresso',      color: '#2c1e12' },
  { name: 'Burgundy',      color: '#3b1320' },
  { name: 'Steel',         color: '#2a3040' },
];

const LS_KEY = 'monty.sidebarColor';

function loadSidebarColor(): string {
  try {
    return localStorage.getItem(LS_KEY) || '#0a1d36';
  } catch {
    return '#0a1d36';
  }
}

function saveSidebarColor(color: string) {
  try {
    localStorage.setItem(LS_KEY, color);
  } catch { /* noop */ }
}

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, h / 360 + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, h / 360) * 255);
  const b = Math.round(hue2rgb(p, q, h / 360 - 1 / 3) * 255);
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function applySidebarCssVars(color: string) {
  document.documentElement.style.setProperty('--sidebar-bg', color);
  const [h, s] = hexToHsl(color);
  const accent = hslToHex(h, Math.max(s, 0.55), 0.43);
  const link = hslToHex(h, Math.max(s, 0.55), 0.40);
  document.documentElement.style.setProperty('--navy-accent', accent);
  document.documentElement.style.setProperty('--link', link);
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

function SidebarThemePicker({ currentColor, onChange }: { currentColor: string; onChange: (c: string) => void }) {
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

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-[#9fb0c8] hover:text-white hover:bg-[#13284a] transition-colors rounded"
      >
        <span
          className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0"
          style={{ background: currentColor }}
        />
        <span className="flex-1 text-left font-medium">Personalize sidebar</span>
        <ChevronRight size={11} className="text-[#7a8ca8] shrink-0" />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-[220px] bg-white rounded-lg shadow-2xl border border-[var(--border)] z-50 overflow-hidden">
          <div className="px-3 pt-3 pb-2">
            <p className="text-[11px] font-semibold text-[var(--ink-700)]">Sidebar Color</p>
            <p className="text-[10px] text-[var(--ink-400)] mt-0.5">Choose a theme for the sidebar</p>
          </div>
          <div className="px-3 pb-2 grid grid-cols-6 gap-2">
            {SIDEBAR_PRESETS.map((p) => (
              <button
                key={p.color}
                title={p.name}
                onClick={() => onChange(p.color)}
                className="relative w-7 h-7 rounded-md border border-[var(--border)] transition-transform hover:scale-110"
                style={{ background: p.color }}
              >
                {currentColor === p.color && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="w-2 h-2 rounded-full bg-white" />
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="px-3 pb-2 flex items-center gap-2">
            <label className="text-[10px] text-[var(--ink-500)] font-medium shrink-0">Custom:</label>
            <input
              type="color"
              value={currentColor}
              onChange={(e) => onChange(e.target.value)}
              className="w-6 h-6 rounded border border-[var(--border)] cursor-pointer p-0"
            />
          </div>
          <div className="border-t border-[var(--divider)] px-3 py-2">
            <button
              onClick={() => onChange('#0a1d36')}
              className="flex items-center gap-1.5 text-[11px] text-[var(--link)] hover:underline font-medium"
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
  onNavigateAssignedToMe,
  userEmail,
  userName,
  onSignOut,
  userId,
  recentRefreshKey,
  isSystemAdmin = false,
}: AppSidebarProps) {
  const [expanded, setExpanded] = useState<AppModule>(activeModule);
  const [collapsed, setCollapsed] = useState(false);
  const [myRecordsOpen, setMyRecordsOpen] = useState(false);
  const [sidebarColor, setSidebarColor] = useState(loadSidebarColor);

  const [areas, setAreas] = useState<NavArea[]>([]);
  const [groups, setGroups] = useState<NavGroup[]>([]);
  const [items, setItems] = useState<NavItem[]>([]);

  useEffect(() => {
    applySidebarCssVars(sidebarColor);
  }, [sidebarColor]);

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

  const handleColorChange = (color: string) => {
    setSidebarColor(color);
    saveSidebarColor(color);
    applySidebarCssVars(color);
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
      className="text-[#d4dceb] flex flex-col h-full shrink-0 select-none overflow-hidden transition-all duration-300 ease-in-out"
      style={{
        width: collapsed ? '56px' : '220px',
        background: 'var(--sidebar-bg)',
      }}
    >
      {/* Brand block - 44px */}
      <div
        className={`h-[44px] flex items-center shrink-0 ${collapsed ? 'justify-center px-0' : 'px-3 gap-2.5'}`}
        style={{ borderBottom: '1px solid var(--sidebar-border)' }}
      >
        {collapsed ? (
          <div className="w-[22px] h-[22px] rounded-[5px] bg-[#2b6cb0] flex items-center justify-center shrink-0">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
        ) : (
          <>
            <div className="w-[22px] h-[22px] rounded-[5px] bg-[#2b6cb0] flex items-center justify-center shrink-0">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <div className="min-w-0 flex-1 overflow-hidden">
              <span className="text-[13px] font-semibold text-white leading-none">CRM </span>
              <span className="text-[11px] text-[#9fb0c8] font-medium">Platform</span>
            </div>
            <button
              onClick={() => setCollapsed(true)}
              title="Collapse sidebar"
              className="text-[#7a8ca8] hover:text-white transition-colors shrink-0"
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
            className="w-9 h-9 flex items-center justify-center text-[#7a8ca8] hover:text-white rounded-md transition-colors mb-1"
            style={{ ['--tw-bg-opacity' as string]: 0 }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--sidebar-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <PanelLeftOpen size={14} />
          </button>

          <div className="w-6 mb-1" style={{ borderTop: '1px solid var(--sidebar-border)' }} />

          {areas.map((area) => {
            const isActiveModule = activeModule === area.name;
            return (
              <Tooltip key={area.nav_area_id} label={area.display_label}>
                <button
                  onClick={() => {
                    setExpanded(area.name);
                    onNavigate(area.name, firstEntityOfArea(area));
                  }}
                  className="w-9 h-9 flex items-center justify-center rounded-md transition-colors"
                  style={{
                    background: isActiveModule ? 'var(--sidebar-active)' : 'transparent',
                    color: isActiveModule ? 'white' : '#7a8ca8',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActiveModule) e.currentTarget.style.background = 'var(--sidebar-hover)';
                    e.currentTarget.style.color = 'white';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActiveModule) e.currentTarget.style.background = 'transparent';
                    if (!isActiveModule) e.currentTarget.style.color = '#7a8ca8';
                  }}
                >
                  {AREA_ICON_MAP[area.icon_name] ?? <LayoutGrid size={15} />}
                </button>
              </Tooltip>
            );
          })}

          <div className="w-6 my-1" style={{ borderTop: '1px solid var(--sidebar-border)' }} />

          {uniqueNavItems.map((item) => {
            const entity = resolveEntity(item.entity_name);
            const area = getAreaForItem(item);
            const isActive = activeEntity === entity;
            return (
              <Tooltip key={item.nav_item_id} label={item.display_label}>
                <button
                  onClick={() => { if (area) onNavigate(area.name, entity); }}
                  className="w-9 h-9 flex items-center justify-center rounded-md transition-colors"
                  style={{
                    background: isActive ? '#1f4374' : 'transparent',
                    color: isActive ? 'white' : '#7a8ca8',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'var(--sidebar-hover)';
                    e.currentTarget.style.color = 'white';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'transparent';
                    if (!isActive) e.currentTarget.style.color = '#7a8ca8';
                  }}
                >
                  {ICON_MAP[item.icon_name] ?? <FileText size={15} />}
                </button>
              </Tooltip>
            );
          })}
        </nav>
      ) : (
        <nav className="flex-1 overflow-y-auto sidebar-scroll py-1">
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
                  className="w-full flex items-center gap-2 px-4 h-[32px] text-[12px] font-medium transition-colors"
                  style={{
                    color: isActiveModule ? 'white' : '#d4dceb',
                    background: isActiveModule ? 'var(--sidebar-hover)' : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActiveModule) e.currentTarget.style.background = '#13284a';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActiveModule) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span className={isActiveModule ? 'text-[#5b9bd5]' : 'text-[#7a8ca8]'}>
                    {AREA_ICON_MAP[area.icon_name] ?? <LayoutGrid size={15} />}
                  </span>
                  <span className="flex-1 text-left truncate">{area.display_label}</span>
                  {isOpen
                    ? <ChevronDown size={12} className="text-[#7a8ca8] shrink-0" />
                    : <ChevronRight size={12} className="text-[#7a8ca8] shrink-0" />}
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
                            className="text-[10.5px] uppercase font-medium text-[#7a8ca8]"
                            style={{ letterSpacing: '1.1px', padding: '14px 16px 4px' }}
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
                                className="w-full flex items-center gap-2 text-[12px] transition-colors relative"
                                style={{
                                  padding: '6px 12px 6px 16px',
                                  color: isActive ? 'white' : '#d4dceb',
                                  background: isActive ? '#1f4374' : 'transparent',
                                  borderLeft: isActive ? '2px solid #3b82f6' : '2px solid transparent',
                                }}
                                onMouseEnter={(e) => {
                                  if (!isActive) {
                                    e.currentTarget.style.background = '#13284a';
                                    e.currentTarget.style.color = 'white';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!isActive) {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.color = '#d4dceb';
                                  }
                                }}
                              >
                                <span className={isActive ? 'text-[#5b9bd5]' : 'text-[#7a8ca8]'}>
                                  {ICON_MAP[item.icon_name] ?? <FileText size={15} />}
                                </span>
                                <span className="font-medium truncate">{item.display_label}</span>
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

          {/* My Records */}
          <div style={{ borderTop: '1px solid var(--sidebar-border)', marginTop: '4px', paddingTop: '4px' }}>
            <button
              onClick={() => setMyRecordsOpen((v) => !v)}
              className="w-full flex items-center gap-2 px-4 h-[32px] text-[12px] font-medium text-[#d4dceb] transition-colors"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#13284a';
                e.currentTarget.style.color = 'white';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#d4dceb';
              }}
            >
              <span className="text-[#7a8ca8]">
                <UserCheck size={15} />
              </span>
              <span className="flex-1 text-left">My Records</span>
              {myRecordsOpen
                ? <ChevronDown size={11} className="text-[#7a8ca8] shrink-0" />
                : <ChevronRight size={11} className="text-[#7a8ca8] shrink-0" />}
            </button>
            {myRecordsOpen && (
              <div className="pb-1">
                {uniqueNavItems.map((item) => {
                  const entity = resolveEntity(item.entity_name);
                  const area = getAreaForItem(item);
                  if (!area) return null;
                  return (
                    <button
                      key={item.nav_item_id}
                      onClick={() => onNavigateAssignedToMe(area.name, entity)}
                      className="w-full flex items-center gap-2 text-[12px] text-[#d4dceb] transition-colors"
                      style={{ padding: '6px 12px 6px 16px' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#13284a';
                        e.currentTarget.style.color = 'white';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = '#d4dceb';
                      }}
                    >
                      <span className="text-[#7a8ca8]">{ICON_MAP[item.icon_name] ?? <FileText size={15} />}</span>
                      <span className="font-medium truncate">{item.display_label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

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
        style={{ borderTop: '1px solid #15294a' }}
      >
        {collapsed ? (
          <>
            {isSystemAdmin && (
              <Tooltip label="Admin Studio">
                <a
                  href="#/studio"
                  className="w-9 h-9 flex items-center justify-center text-[#7a8ca8] hover:text-white rounded-md transition-colors"
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#13284a'; }}
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
                  className="w-9 h-9 flex items-center justify-center text-[#7a8ca8] hover:text-white rounded-md transition-colors"
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#13284a'; }}
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
                className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-[#9fb0c8] hover:text-white transition-colors rounded"
                onMouseEnter={(e) => { e.currentTarget.style.background = '#13284a'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <Settings size={12} className="text-[#7a8ca8]" />
                <span className="font-medium">Admin Studio</span>
              </a>
            )}

            <SidebarThemePicker currentColor={sidebarColor} onChange={handleColorChange} />

            <div className="flex items-center gap-2.5 px-3 pt-2 pb-1" style={{ borderTop: '1px solid #15294a', marginTop: '4px' }}>
              <div className="w-6 h-6 rounded-full bg-[#2b6cb0] flex items-center justify-center shrink-0">
                <span className="text-[9px] font-bold text-white">{initials}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-[#9fb0c8] truncate leading-none">{userEmail ?? 'User'}</p>
              </div>
              {onSignOut && (
                <button
                  onClick={onSignOut}
                  title="Sign out"
                  className="text-[#7a8ca8] hover:text-white transition-colors"
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
