import { useEffect, useRef, useState, useCallback } from 'react';
import { useToast } from '../../app/context/ToastContext';
import {
  Plus, Trash2, RefreshCw, ChevronRight, ChevronDown,
  GripVertical, Check, Shield, Wrench, Save, Undo2,
  TrendingUp, Megaphone, Headphones, LayoutGrid as Layout, FileText,
  Users, Package, BarChart2, Settings, Star, Globe, Layers,
  FolderOpen, BookOpen, ShoppingCart, Briefcase, Eye, EyeOff,
  ArrowUp, ArrowDown, MoreHorizontal,
  // CRM & Sales
  Handshake, Target, Trophy, Filter, Percent, Zap, Flag,
  // People & Companies
  User, UserPlus, Building2, Factory, CreditCard, Contact, Crown,
  // Communication & Marketing
  Mail, Phone, MessageCircle, Send, Bell, Video, Rocket, Ticket,
  // Geography & Money
  Map, MapPin, Compass, Landmark, Banknote, Coins, Wallet, CircleDollarSign, ArrowRightLeft,
  // Data & Organization
  BarChart3, PieChart, LineChart, Database, Kanban, Table, Tag, GitBranch,
  Calendar, CalendarCheck, Clock, Waypoints,
} from 'lucide-react';
import type { NavArea, NavGroup, NavItem } from '../../services/navigationService';
import {
  fetchFullNavTree,
  createNavArea, updateNavArea, softDeleteNavArea,
  createNavGroup, updateNavGroup, deleteNavGroup,
  createNavItem, updateNavItem, deleteNavItem,
  reorderNavAreas, reorderNavGroups, reorderNavItems,
} from '../../services/navigationService';
import { fetchEntities } from '../../services/entityService';
import type { EntityDefinition } from '../../types/entity';
import type { SecurityRole } from '../../types/security';
import { fetchSecurityRoles } from '../../services/securityService';
import ConfirmDialog from '../components/ConfirmDialog';

const ICON_MAP: Record<string, React.ReactNode> = {
  // CRM & Sales
  TrendingUp: <TrendingUp size={13} />, Briefcase: <Briefcase size={13} />,
  Handshake: <Handshake size={13} />, Target: <Target size={13} />,
  Trophy: <Trophy size={13} />, Filter: <Filter size={13} />,
  Percent: <Percent size={13} />, Zap: <Zap size={13} />, Flag: <Flag size={13} />,
  // People & Companies
  User: <User size={13} />, Users: <Users size={13} />, UserPlus: <UserPlus size={13} />,
  Building2: <Building2 size={13} />, Factory: <Factory size={13} />,
  CreditCard: <CreditCard size={13} />, Contact: <Contact size={13} />, Crown: <Crown size={13} />,
  // Communication & Marketing
  Mail: <Mail size={13} />, Phone: <Phone size={13} />, MessageCircle: <MessageCircle size={13} />,
  Send: <Send size={13} />, Headphones: <Headphones size={13} />, Bell: <Bell size={13} />,
  Video: <Video size={13} />, Megaphone: <Megaphone size={13} />, Rocket: <Rocket size={13} />,
  Ticket: <Ticket size={13} />,
  // Geography & Money
  Globe: <Globe size={13} />, Map: <Map size={13} />, MapPin: <MapPin size={13} />,
  Compass: <Compass size={13} />, Landmark: <Landmark size={13} />, Banknote: <Banknote size={13} />,
  Coins: <Coins size={13} />, Wallet: <Wallet size={13} />,
  CircleDollarSign: <CircleDollarSign size={13} />, ArrowRightLeft: <ArrowRightLeft size={13} />,
  // Data & Organization
  BarChart3: <BarChart3 size={13} />, PieChart: <PieChart size={13} />, LineChart: <LineChart size={13} />,
  Database: <Database size={13} />, Layers: <Layers size={13} />, Kanban: <Kanban size={13} />,
  Table: <Table size={13} />, Tag: <Tag size={13} />, Package: <Package size={13} />,
  GitBranch: <GitBranch size={13} />, Calendar: <Calendar size={13} />,
  CalendarCheck: <CalendarCheck size={13} />, Clock: <Clock size={13} />, Waypoints: <Waypoints size={13} />,
  // Layout & General (legacy values retained so existing nav records still render)
  Layout: <Layout size={13} />, FileText: <FileText size={13} />, FolderOpen: <FolderOpen size={13} />,
  BookOpen: <BookOpen size={13} />, ShoppingCart: <ShoppingCart size={13} />,
  Settings: <Settings size={13} />, Star: <Star size={13} />, BarChart2: <BarChart2 size={13} />,
};

const ICON_CATEGORIES: { label: string; names: string[] }[] = [
  { label: 'CRM & Sales', names: ['TrendingUp', 'Briefcase', 'Handshake', 'Target', 'Trophy', 'Filter', 'Percent', 'Zap', 'Flag'] },
  { label: 'People & Companies', names: ['User', 'Users', 'UserPlus', 'Building2', 'Factory', 'CreditCard', 'Contact', 'Crown'] },
  { label: 'Communication & Marketing', names: ['Mail', 'Phone', 'MessageCircle', 'Send', 'Headphones', 'Bell', 'Video', 'Megaphone', 'Rocket', 'Ticket'] },
  { label: 'Geography & Money', names: ['Globe', 'Map', 'MapPin', 'Compass', 'Landmark', 'Banknote', 'Coins', 'Wallet', 'CircleDollarSign', 'ArrowRightLeft'] },
  { label: 'Data & Organization', names: ['BarChart3', 'PieChart', 'LineChart', 'Database', 'Layers', 'Kanban', 'Table', 'Tag', 'Package', 'GitBranch', 'Calendar', 'CalendarCheck', 'Clock', 'Waypoints'] },
  { label: 'Layout & General', names: ['Layout', 'FileText', 'FolderOpen', 'BookOpen', 'ShoppingCart', 'Settings', 'Star', 'BarChart2'] },
];

/** Sensible default icon for an entity, keyed by substrings of its logical name. */
const ENTITY_ICON_DEFAULTS: { match: RegExp; icon: string }[] = [
  { match: /sale|opportunit|deal|revenue/i, icon: 'TrendingUp' },
  { match: /market/i, icon: 'Rocket' },
  { match: /campaign/i, icon: 'Megaphone' },
  { match: /event/i, icon: 'CalendarCheck' },
  { match: /countr|region|geo/i, icon: 'Globe' },
  { match: /currenc/i, icon: 'CircleDollarSign' },
  { match: /source/i, icon: 'Waypoints' },
  { match: /industr|sector/i, icon: 'Factory' },
  { match: /contact|person|people/i, icon: 'Contact' },
  { match: /account|compan|organi[sz]ation|business/i, icon: 'Building2' },
  { match: /lead/i, icon: 'UserPlus' },
];

function defaultIconForEntity(logicalName: string): string {
  const hit = ENTITY_ICON_DEFAULTS.find((d) => d.match.test(logicalName));
  return hit ? hit.icon : 'FileText';
}

type Selection =
  | { kind: 'area'; id: string }
  | { kind: 'group'; id: string }
  | { kind: 'item'; id: string }
  | null;

interface Snapshot {
  areas: NavArea[];
  groups: NavGroup[];
  items: NavItem[];
}

export default function NavigationPage() {
  const { showSuccess, showError } = useToast();
  const [areas, setAreas] = useState<NavArea[]>([]);
  const [groups, setGroups] = useState<NavGroup[]>([]);
  const [items, setItems] = useState<NavItem[]>([]);
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [entities, setEntities] = useState<EntityDefinition[]>([]);
  const [roles, setRoles] = useState<SecurityRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [selection, setSelection] = useState<Selection>(null);
  const [contextMenu, setContextMenu] = useState<{ kind: 'area' | 'group' | 'item'; id: string; x: number; y: number } | null>(null);

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const [creatingArea, setCreatingArea] = useState(false);
  const [areaForm, setAreaForm] = useState({ display_label: '', icon_name: 'Layout' });
  const [addingGroupTo, setAddingGroupTo] = useState<string | null>(null);
  const [groupForm, setGroupForm] = useState({ display_label: '' });
  const [addingItemTo, setAddingItemTo] = useState<string | null>(null);
  const [itemForm, setItemForm] = useState({ display_label: '', entity_name: '', icon_name: 'FileText', role_visibility: [] as string[] });

  const [deleteAreaTarget, setDeleteAreaTarget] = useState<NavArea | null>(null);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<NavGroup | null>(null);
  const [deleteItemTarget, setDeleteItemTarget] = useState<NavItem | null>(null);

  const dragRef = useRef<{ kind: 'area' | 'group' | 'item'; id: string } | null>(null);
  const canDragRef = useRef(false);
  const [dropIndicator, setDropIndicator] = useState<{ id: string; position: 'above' | 'below' } | null>(null);

  const takeSnapshot = useCallback(() => {
    setSnapshot({ areas: [...areas], groups: [...groups], items: [...items] });
  }, [areas, groups, items]);

  const markDirty = useCallback(() => {
    if (!isDirty) {
      takeSnapshot();
      setIsDirty(true);
    }
  }, [isDirty, takeSnapshot]);

  useEffect(() => {
    Promise.all([fetchFullNavTree(), fetchEntities(), fetchSecurityRoles()])
      .then(([tree, e, r]) => {
        setAreas(tree.areas);
        setGroups(tree.groups);
        setItems(tree.items);
        setEntities(e);
        setRoles(r);
        if (tree.areas.length > 0) {
          setExpandedAreas(new Set(tree.areas.map((a) => a.nav_area_id)));
          setExpandedGroups(new Set(tree.groups.map((g) => g.nav_group_id)));
        }
      })
      .catch((e) => showError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (contextMenu) setContextMenu(null);
      void e;
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [contextMenu]);

  const selectedArea = selection?.kind === 'area' ? areas.find((a) => a.nav_area_id === selection.id) ?? null : null;
  const selectedGroup = selection?.kind === 'group' ? groups.find((g) => g.nav_group_id === selection.id) ?? null : null;
  const selectedItem = selection?.kind === 'item' ? items.find((i) => i.nav_item_id === selection.id) ?? null : null;

  const handleUndo = () => {
    if (!snapshot) return;
    setAreas(snapshot.areas);
    setGroups(snapshot.groups);
    setItems(snapshot.items);
    setIsDirty(false);
    setSnapshot(null);
    showSuccess('Changes reverted');
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      // Persist parent reassignment for groups and items first
      for (const g of groups) {
        const orig = snapshot?.groups.find((og) => og.nav_group_id === g.nav_group_id);
        if (orig && orig.nav_area_id !== g.nav_area_id) {
          await updateNavGroup(g.nav_group_id, { nav_area_id: g.nav_area_id });
        }
      }
      for (const it of items) {
        const orig = snapshot?.items.find((oi) => oi.nav_item_id === it.nav_item_id);
        if (orig && orig.nav_group_id !== it.nav_group_id) {
          await updateNavItem(it.nav_item_id, { nav_group_id: it.nav_group_id });
        }
      }
      await reorderNavAreas(areas.map((a) => a.nav_area_id));
      const areaIdSet = new Set(areas.map((a) => a.nav_area_id));
      for (const areaId of areaIdSet) {
        const areaGroups = groups.filter((g) => g.nav_area_id === areaId);
        if (areaGroups.length > 0) await reorderNavGroups(areaGroups.map((g) => g.nav_group_id));
        for (const group of areaGroups) {
          const groupItems = items.filter((i) => i.nav_group_id === group.nav_group_id);
          if (groupItems.length > 0) await reorderNavItems(groupItems.map((i) => i.nav_item_id));
        }
      }
      setIsDirty(false);
      setSnapshot(null);
      showSuccess('Navigation order saved');
    } catch (e: unknown) { showError(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); }
  };

  const moveArea = (areaId: string, direction: 'up' | 'down') => {
    const idx = areas.findIndex((a) => a.nav_area_id === areaId);
    if (idx < 0) return;
    const target = direction === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= areas.length) return;
    markDirty();
    const next = [...areas];
    [next[idx], next[target]] = [next[target], next[idx]];
    setAreas(next);
  };

  const moveGroup = (groupId: string, direction: 'up' | 'down') => {
    const group = groups.find((g) => g.nav_group_id === groupId);
    if (!group) return;
    const areaGroups = groups.filter((g) => g.nav_area_id === group.nav_area_id);
    const idx = areaGroups.findIndex((g) => g.nav_group_id === groupId);
    const target = direction === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= areaGroups.length) return;
    markDirty();
    const idA = areaGroups[idx].nav_group_id;
    const idB = areaGroups[target].nav_group_id;
    setGroups((prev) => prev.map((g) => g.nav_group_id === idA ? prev.find((x) => x.nav_group_id === idB)! : g.nav_group_id === idB ? prev.find((x) => x.nav_group_id === idA)! : g));
  };

  const moveItem = (itemId: string, direction: 'up' | 'down') => {
    const item = items.find((i) => i.nav_item_id === itemId);
    if (!item) return;
    const groupItems = items.filter((i) => i.nav_group_id === item.nav_group_id);
    const idx = groupItems.findIndex((i) => i.nav_item_id === itemId);
    const target = direction === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= groupItems.length) return;
    markDirty();
    const idA = groupItems[idx].nav_item_id;
    const idB = groupItems[target].nav_item_id;
    setItems((prev) => prev.map((i) => i.nav_item_id === idA ? prev.find((x) => x.nav_item_id === idB)! : i.nav_item_id === idB ? prev.find((x) => x.nav_item_id === idA)! : i));
  };

  const handleDrop = (targetId: string, targetKind: 'area' | 'group' | 'item', position: 'above' | 'below') => {
    const drag = dragRef.current;
    if (!drag || drag.kind !== targetKind || drag.id === targetId) { setDropIndicator(null); return; }

    if (targetKind === 'area') {
      const fromIdx = areas.findIndex((a) => a.nav_area_id === drag.id);
      let toIdx = areas.findIndex((a) => a.nav_area_id === targetId);
      if (fromIdx < 0 || toIdx < 0) { setDropIndicator(null); return; }
      if (position === 'below') toIdx += 1;
      if (fromIdx < toIdx) toIdx -= 1;
      markDirty();
      const next = [...areas];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      setAreas(next);
    } else if (targetKind === 'group') {
      const sourceGroup = groups.find((g) => g.nav_group_id === drag.id);
      const targetGroup = groups.find((g) => g.nav_group_id === targetId);
      if (!sourceGroup || !targetGroup) { setDropIndicator(null); return; }
      markDirty();
      const destAreaId = targetGroup.nav_area_id;
      // Move source group to target area if different
      const updated = sourceGroup.nav_area_id !== destAreaId
        ? { ...sourceGroup, nav_area_id: destAreaId }
        : sourceGroup;
      const destGroups = groups
        .filter((g) => g.nav_area_id === destAreaId && g.nav_group_id !== drag.id)
        .concat(sourceGroup.nav_area_id !== destAreaId ? [updated] : []);
      // If same area, work with existing list
      const workingList = sourceGroup.nav_area_id === destAreaId
        ? groups.filter((g) => g.nav_area_id === destAreaId)
        : destGroups;
      const fromIdx = workingList.findIndex((g) => g.nav_group_id === drag.id);
      let toIdx = workingList.findIndex((g) => g.nav_group_id === targetId);
      if (position === 'below') toIdx += 1;
      if (fromIdx >= 0 && fromIdx < toIdx) toIdx -= 1;
      const reordered = workingList.filter((g) => g.nav_group_id !== drag.id);
      reordered.splice(Math.max(0, toIdx), 0, updated);
      const orderMap = new Map(reordered.map((g, i) => [g.nav_group_id, i]));
      setGroups((prev) => {
        let result = prev.map((g) => g.nav_group_id === drag.id ? updated : g);
        // Re-sort destination area groups
        const indices = result.reduce<number[]>((acc, g, i) => { if (g.nav_area_id === destAreaId) acc.push(i); return acc; }, []);
        const sorted = indices.map((i) => result[i]).sort((a, b) => (orderMap.get(a.nav_group_id) ?? 0) - (orderMap.get(b.nav_group_id) ?? 0));
        indices.forEach((pos, i) => { result[pos] = sorted[i]; });
        return result;
      });
    } else {
      const sourceItem = items.find((i) => i.nav_item_id === drag.id);
      const targetItem = items.find((i) => i.nav_item_id === targetId);
      if (!sourceItem || !targetItem) { setDropIndicator(null); return; }
      markDirty();
      const destGroupId = targetItem.nav_group_id;
      const updated = sourceItem.nav_group_id !== destGroupId
        ? { ...sourceItem, nav_group_id: destGroupId }
        : sourceItem;
      const workingList = sourceItem.nav_group_id === destGroupId
        ? items.filter((i) => i.nav_group_id === destGroupId)
        : items.filter((i) => i.nav_group_id === destGroupId && i.nav_item_id !== drag.id).concat([updated]);
      const fromIdx = workingList.findIndex((i) => i.nav_item_id === drag.id);
      let toIdx = workingList.findIndex((i) => i.nav_item_id === targetId);
      if (position === 'below') toIdx += 1;
      if (fromIdx >= 0 && fromIdx < toIdx) toIdx -= 1;
      const reordered = workingList.filter((i) => i.nav_item_id !== drag.id);
      reordered.splice(Math.max(0, toIdx), 0, updated);
      const orderMap = new Map(reordered.map((it, i) => [it.nav_item_id, i]));
      setItems((prev) => {
        let result = prev.map((i) => i.nav_item_id === drag.id ? updated : i);
        const indices = result.reduce<number[]>((acc, it, i) => { if (it.nav_group_id === destGroupId) acc.push(i); return acc; }, []);
        const sorted = indices.map((i) => result[i]).sort((a, b) => (orderMap.get(a.nav_item_id) ?? 0) - (orderMap.get(b.nav_item_id) ?? 0));
        indices.forEach((pos, i) => { result[pos] = sorted[i]; });
        return result;
      });
    }
    setDropIndicator(null);
  };

  const getDropPosition = (e: React.DragEvent, targetId: string): 'above' | 'below' => {
    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const pos = e.clientY < midY ? 'above' : 'below';
    setDropIndicator({ id: targetId, position: pos });
    return pos;
  };

  const handleCreateArea = async () => {
    if (!areaForm.display_label.trim()) return;
    setSaving(true);
    try {
      const name = areaForm.display_label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      const created = await createNavArea({ name, display_label: areaForm.display_label.trim(), icon_name: areaForm.icon_name, sort_order: areas.length });
      setAreas((prev) => [...prev, created]);
      setCreatingArea(false);
      setAreaForm({ display_label: '', icon_name: 'Layout' });
      setExpandedAreas((prev) => new Set([...prev, created.nav_area_id]));
      setSelection({ kind: 'area', id: created.nav_area_id });
      showSuccess('Area created');
    } catch (e: unknown) { showError(e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  };

  const handleSaveArea = async (area: NavArea) => {
    setSaving(true);
    try {
      const updated = await updateNavArea(area.nav_area_id, { display_label: area.display_label, icon_name: area.icon_name, is_active: area.is_active });
      setAreas((prev) => prev.map((a) => a.nav_area_id === updated.nav_area_id ? updated : a));
      showSuccess('Area saved');
    } catch (e: unknown) { showError(e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  };

  const handleDeleteArea = async () => {
    if (!deleteAreaTarget) return;
    await softDeleteNavArea(deleteAreaTarget.nav_area_id);
    setAreas((prev) => prev.filter((a) => a.nav_area_id !== deleteAreaTarget.nav_area_id));
    if (selection?.kind === 'area' && selection.id === deleteAreaTarget.nav_area_id) setSelection(null);
    setDeleteAreaTarget(null);
  };

  const handleCreateGroup = async (areaId: string) => {
    if (!groupForm.display_label.trim()) return;
    setSaving(true);
    try {
      const name = groupForm.display_label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      const areaGroups = groups.filter((g) => g.nav_area_id === areaId);
      const created = await createNavGroup({ nav_area_id: areaId, name, display_label: groupForm.display_label.trim(), sort_order: areaGroups.length });
      setGroups((prev) => [...prev, created]);
      setAddingGroupTo(null);
      setGroupForm({ display_label: '' });
      setExpandedGroups((prev) => new Set([...prev, created.nav_group_id]));
      setSelection({ kind: 'group', id: created.nav_group_id });
      showSuccess('Group created');
    } catch (e: unknown) { showError(e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  };

  const handleSaveGroup = async (group: NavGroup) => {
    setSaving(true);
    try {
      const updated = await updateNavGroup(group.nav_group_id, { display_label: group.display_label, is_active: group.is_active, nav_area_id: group.nav_area_id });
      setGroups((prev) => prev.map((g) => g.nav_group_id === updated.nav_group_id ? updated : g));
      showSuccess('Group saved');
    } catch (e: unknown) { showError(e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  };

  const handleDeleteGroup = async () => {
    if (!deleteGroupTarget) return;
    await deleteNavGroup(deleteGroupTarget.nav_group_id);
    setGroups((prev) => prev.filter((g) => g.nav_group_id !== deleteGroupTarget.nav_group_id));
    if (selection?.kind === 'group' && selection.id === deleteGroupTarget.nav_group_id) setSelection(null);
    setDeleteGroupTarget(null);
  };

  const handleCreateItem = async (groupId: string) => {
    if (!itemForm.display_label.trim()) return;
    setSaving(true);
    try {
      const groupItems = items.filter((i) => i.nav_group_id === groupId);
      const created = await createNavItem({
        nav_group_id: groupId,
        entity_name: itemForm.entity_name || null,
        display_label: itemForm.display_label.trim(),
        icon_name: itemForm.icon_name,
        sort_order: groupItems.length,
        is_active: true,
        role_visibility: itemForm.role_visibility.length > 0 ? itemForm.role_visibility : null,
      });
      setItems((prev) => [...prev, created]);
      setAddingItemTo(null);
      setItemForm({ display_label: '', entity_name: '', icon_name: 'FileText', role_visibility: [] });
      setSelection({ kind: 'item', id: created.nav_item_id });
      showSuccess('Item created');
    } catch (e: unknown) { showError(e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  };

  const handleSaveItem = async (item: NavItem) => {
    setSaving(true);
    try {
      const updated = await updateNavItem(item.nav_item_id, {
        display_label: item.display_label,
        entity_name: item.entity_name,
        icon_name: item.icon_name,
        is_active: item.is_active,
        nav_group_id: item.nav_group_id,
        role_visibility: (item.role_visibility ?? []).length > 0 ? item.role_visibility : null,
      });
      setItems((prev) => prev.map((i) => i.nav_item_id === updated.nav_item_id ? updated : i));
      showSuccess('Item saved');
    } catch (e: unknown) { showError(e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  };

  const handleDeleteItem = async () => {
    if (!deleteItemTarget) return;
    await deleteNavItem(deleteItemTarget.nav_item_id);
    setItems((prev) => prev.filter((i) => i.nav_item_id !== deleteItemTarget.nav_item_id));
    if (selection?.kind === 'item' && selection.id === deleteItemTarget.nav_item_id) setSelection(null);
    setDeleteItemTarget(null);
  };

  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><RefreshCw size={16} className="animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#fafbfc]">
      {/* Command Bar */}
      <div className="bg-white border-b border-slate-200 px-5 py-2 flex items-center gap-1.5 shrink-0">
        <CmdBtn primary onClick={() => { setCreatingArea(true); setAreaForm({ display_label: '', icon_name: 'Layout' }); }} icon={<Plus size={13} />}>
          New area
        </CmdBtn>
        <CmdSep />
        {isDirty && (
          <>
            <CmdBtn onClick={handleSaveAll} icon={saving ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />} disabled={saving} primary>
              Save order
            </CmdBtn>
            <CmdBtn onClick={handleUndo} icon={<Undo2 size={12} />}>
              Undo
            </CmdBtn>
            <CmdSep />
          </>
        )}
        <CmdBtn onClick={() => {
          setLoading(true);
          fetchFullNavTree()
            .then(({ areas: a, groups: g, items: i }) => { setAreas(a); setGroups(g); setItems(i); setIsDirty(false); setSnapshot(null); })
            .catch((e) => showError(e.message))
            .finally(() => setLoading(false));
        }} icon={<RefreshCw size={12} />}>
          Refresh
        </CmdBtn>
        <div className="flex-1" />
        {isDirty && (
          <span className="text-[11px] font-medium text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full ring-1 ring-amber-200">
            Unsaved changes
          </span>
        )}
        <span className="text-[11px] text-slate-400">
          {areas.length} area{areas.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* LEFT: Navigation Tree */}
        <div className="w-80 border-r border-slate-200 bg-white flex flex-col shrink-0">
          <div className="px-4 py-3 border-b border-slate-100 shrink-0">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Sitemap Structure</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Drag items or use context menu to reorder</p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {creatingArea && (
              <div className="mx-3 my-2 px-3 py-2.5 border border-blue-200 bg-blue-50/50 rounded-lg space-y-2">
                <input
                  type="text" value={areaForm.display_label}
                  onChange={(e) => setAreaForm({ ...areaForm, display_label: e.target.value })}
                  className={MINI_INPUT} placeholder="Area name..." autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateArea(); if (e.key === 'Escape') setCreatingArea(false); }}
                />
                <IconPicker value={areaForm.icon_name} onChange={(v) => setAreaForm({ ...areaForm, icon_name: v })} />
                <div className="flex gap-1.5">
                  <button onClick={() => setCreatingArea(false)} className="flex-1 py-1 text-[10px] border border-slate-200 rounded text-slate-600 bg-white hover:bg-slate-50">Cancel</button>
                  <button onClick={handleCreateArea} disabled={saving || !areaForm.display_label.trim()} className="flex-1 py-1 text-[10px] bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-0.5">
                    {saving ? <RefreshCw size={9} className="animate-spin" /> : <Check size={9} />} Create
                  </button>
                </div>
              </div>
            )}

            {areas.map((area) => {
              const isExpanded = expandedAreas.has(area.nav_area_id);
              const areaGroups = groups.filter((g) => g.nav_area_id === area.nav_area_id);
              const isSelected = selection?.kind === 'area' && selection.id === area.nav_area_id;
              const showAbove = dropIndicator?.id === area.nav_area_id && dropIndicator.position === 'above';
              const showBelow = dropIndicator?.id === area.nav_area_id && dropIndicator.position === 'below';

              return (
                <div key={area.nav_area_id}>
                  {showAbove && <div className="h-0.5 bg-blue-500 mx-2 rounded-full" />}
                  <div
                    className={`border-b border-slate-100 transition-colors ${isSelected ? 'bg-blue-50/60' : ''}`}
                    draggable
                    onDragStart={(e) => {
                      if (!canDragRef.current) { e.preventDefault(); return; }
                      dragRef.current = { kind: 'area', id: area.nav_area_id };
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => { canDragRef.current = false; setDropIndicator(null); }}
                    onDragOver={(e) => { e.preventDefault(); if (dragRef.current?.kind === 'area' && dragRef.current.id !== area.nav_area_id) getDropPosition(e, area.nav_area_id); }}
                    onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropIndicator(null); }}
                    onDrop={(e) => { e.preventDefault(); const pos = dropIndicator?.id === area.nav_area_id ? dropIndicator.position : 'below'; handleDrop(area.nav_area_id, 'area', pos); }}
                  >
                    <div
                      className="flex items-center gap-1.5 px-2 py-2 cursor-pointer hover:bg-slate-50/80 group"
                      onClick={() => {
                        setSelection({ kind: 'area', id: area.nav_area_id });
                        setExpandedAreas((s) => { const n = new Set(s); n.has(area.nav_area_id) ? n.delete(area.nav_area_id) : n.add(area.nav_area_id); return n; });
                      }}
                      onContextMenu={(e) => { e.preventDefault(); setContextMenu({ kind: 'area', id: area.nav_area_id, x: e.clientX, y: e.clientY }); }}
                    >
                      <GripVertical
                        size={10} className="text-slate-300 shrink-0 cursor-grab hover:text-slate-500 transition-colors"
                        onMouseDown={() => { canDragRef.current = true; }}
                      />
                      <span className={`shrink-0 ${isSelected ? 'text-blue-600' : 'text-slate-500'}`}>
                        {ICON_MAP[area.icon_name] ?? <Layout size={13} />}
                      </span>
                      <span className={`flex-1 text-[12px] font-semibold truncate ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>
                        {area.display_label}
                      </span>
                      <TypeBadge system={area.is_system} />
                      {!area.is_active && <EyeOff size={10} className="text-slate-300 shrink-0" />}
                      <button
                        onClick={(e) => { e.stopPropagation(); setContextMenu({ kind: 'area', id: area.nav_area_id, x: e.clientX, y: e.clientY }); }}
                        className="p-0.5 text-slate-300 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      >
                        <MoreHorizontal size={11} />
                      </button>
                      {isExpanded ? <ChevronDown size={11} className="text-slate-400 shrink-0" /> : <ChevronRight size={11} className="text-slate-400 shrink-0" />}
                    </div>

                    {isExpanded && (
                      <div className="ml-5 border-l-2 border-slate-100">
                        {areaGroups.map((group) => {
                          const groupExpanded = expandedGroups.has(group.nav_group_id);
                          const groupItems = items.filter((i) => i.nav_group_id === group.nav_group_id);
                          const isGroupSelected = selection?.kind === 'group' && selection.id === group.nav_group_id;
                          const gShowAbove = dropIndicator?.id === group.nav_group_id && dropIndicator.position === 'above';
                          const gShowBelow = dropIndicator?.id === group.nav_group_id && dropIndicator.position === 'below';

                          return (
                            <div key={group.nav_group_id}>
                              {gShowAbove && <div className="h-0.5 bg-blue-400 mx-2 rounded-full" />}
                              <div
                                draggable
                                onDragStart={(e) => {
                                  if (!canDragRef.current) { e.preventDefault(); return; }
                                  e.stopPropagation();
                                  dragRef.current = { kind: 'group', id: group.nav_group_id };
                                  e.dataTransfer.effectAllowed = 'move';
                                }}
                                onDragEnd={() => { canDragRef.current = false; setDropIndicator(null); }}
                                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (dragRef.current?.kind === 'group' && dragRef.current.id !== group.nav_group_id) getDropPosition(e, group.nav_group_id); }}
                                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropIndicator(null); }}
                                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const pos = dropIndicator?.id === group.nav_group_id ? dropIndicator.position : 'below'; handleDrop(group.nav_group_id, 'group', pos); }}
                              >
                                <div
                                  className={`flex items-center gap-1.5 px-2 py-1.5 cursor-pointer hover:bg-slate-50/80 group ${isGroupSelected ? 'bg-blue-50/50' : ''}`}
                                  onClick={() => {
                                    setSelection({ kind: 'group', id: group.nav_group_id });
                                    setExpandedGroups((s) => { const n = new Set(s); n.has(group.nav_group_id) ? n.delete(group.nav_group_id) : n.add(group.nav_group_id); return n; });
                                  }}
                                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ kind: 'group', id: group.nav_group_id, x: e.clientX, y: e.clientY }); }}
                                >
                                  <GripVertical
                                    size={9} className="text-slate-300 shrink-0 cursor-grab hover:text-slate-500 transition-colors"
                                    onMouseDown={() => { canDragRef.current = true; }}
                                  />
                                  <FolderOpen size={11} className={`shrink-0 ${isGroupSelected ? 'text-blue-500' : 'text-slate-400'}`} />
                                  <span className={`flex-1 text-[11px] font-medium truncate ${isGroupSelected ? 'text-blue-700' : 'text-slate-600'}`}>
                                    {group.display_label}
                                  </span>
                                  <span className="text-[9px] text-slate-400 shrink-0">{groupItems.length}</span>
                                  {!group.is_active && <EyeOff size={9} className="text-slate-300 shrink-0" />}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setContextMenu({ kind: 'group', id: group.nav_group_id, x: e.clientX, y: e.clientY }); }}
                                    className="p-0.5 text-slate-300 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                  >
                                    <MoreHorizontal size={10} />
                                  </button>
                                  {groupExpanded ? <ChevronDown size={10} className="text-slate-400 shrink-0" /> : <ChevronRight size={10} className="text-slate-400 shrink-0" />}
                                </div>

                                {groupExpanded && (
                                  <div className="ml-5 border-l-2 border-slate-50">
                                    {groupItems.map((item) => {
                                      const isItemSelected = selection?.kind === 'item' && selection.id === item.nav_item_id;
                                      const iShowAbove = dropIndicator?.id === item.nav_item_id && dropIndicator.position === 'above';
                                      const iShowBelow = dropIndicator?.id === item.nav_item_id && dropIndicator.position === 'below';

                                      return (
                                        <div key={item.nav_item_id}>
                                          {iShowAbove && <div className="h-0.5 bg-blue-400 mx-2 rounded-full" />}
                                          <div
                                            className={`flex items-center gap-1.5 px-2 py-1.5 cursor-pointer hover:bg-slate-50/80 group ${isItemSelected ? 'bg-blue-50/50' : ''}`}
                                            draggable
                                            onDragStart={(e) => {
                                              if (!canDragRef.current) { e.preventDefault(); return; }
                                              e.stopPropagation();
                                              dragRef.current = { kind: 'item', id: item.nav_item_id };
                                              e.dataTransfer.effectAllowed = 'move';
                                            }}
                                            onDragEnd={() => { canDragRef.current = false; setDropIndicator(null); }}
                                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (dragRef.current?.kind === 'item' && dragRef.current.id !== item.nav_item_id) getDropPosition(e, item.nav_item_id); }}
                                            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropIndicator(null); }}
                                            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const pos = dropIndicator?.id === item.nav_item_id ? dropIndicator.position : 'below'; handleDrop(item.nav_item_id, 'item', pos); }}
                                            onClick={() => setSelection({ kind: 'item', id: item.nav_item_id })}
                                            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ kind: 'item', id: item.nav_item_id, x: e.clientX, y: e.clientY }); }}
                                          >
                                            <GripVertical
                                              size={9} className="text-slate-300 cursor-grab shrink-0 hover:text-slate-500 transition-colors"
                                              onMouseDown={() => { canDragRef.current = true; }}
                                            />
                                            <span className={`shrink-0 ${isItemSelected ? 'text-blue-500' : 'text-slate-400'}`}>
                                              {ICON_MAP[item.icon_name] ?? <FileText size={12} />}
                                            </span>
                                            <span className={`flex-1 text-[11px] truncate ${!item.is_active ? 'line-through text-slate-300' : isItemSelected ? 'text-blue-700 font-medium' : 'text-slate-600'}`}>
                                              {item.display_label}
                                            </span>
                                            {item.entity_name && (
                                              <span className="text-[9px] font-mono text-slate-400 truncate max-w-[56px] shrink-0">{item.entity_name}</span>
                                            )}
                                            {(item.role_visibility?.length ?? 0) > 0 && (
                                              <span className="text-[9px] px-1 bg-amber-100 text-amber-700 rounded shrink-0">{item.role_visibility!.length}R</span>
                                            )}
                                            <button
                                              onClick={(e) => { e.stopPropagation(); setContextMenu({ kind: 'item', id: item.nav_item_id, x: e.clientX, y: e.clientY }); }}
                                              className="p-0.5 text-slate-300 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                            >
                                              <MoreHorizontal size={10} />
                                            </button>
                                          </div>
                                          {iShowBelow && <div className="h-0.5 bg-blue-400 mx-2 rounded-full" />}
                                        </div>
                                      );
                                    })}

                                    {addingItemTo === group.nav_group_id ? (
                                      <InlineItemForm
                                        form={itemForm}
                                        entities={entities}
                                        onChange={setItemForm}
                                        onSave={() => handleCreateItem(group.nav_group_id)}
                                        onCancel={() => setAddingItemTo(null)}
                                        saving={saving}
                                      />
                                    ) : (
                                      <button onClick={() => { setAddingItemTo(group.nav_group_id); setItemForm({ display_label: '', entity_name: '', icon_name: 'FileText', role_visibility: [] }); }} className="flex items-center gap-1 px-3 py-1.5 text-[10px] text-slate-400 hover:text-blue-600 w-full transition-colors">
                                        <Plus size={9} /> Add Item
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                              {gShowBelow && <div className="h-0.5 bg-blue-400 mx-2 rounded-full" />}
                            </div>
                          );
                        })}

                        {addingGroupTo === area.nav_area_id ? (
                          <div className="px-2 py-2 bg-slate-50/80 border-t border-slate-100 space-y-1.5 mx-1 my-1 rounded-lg">
                            <input type="text" value={groupForm.display_label} onChange={(e) => setGroupForm({ display_label: e.target.value })} className={MINI_INPUT} placeholder="Group name..." autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleCreateGroup(area.nav_area_id); if (e.key === 'Escape') setAddingGroupTo(null); }} />
                            <div className="flex gap-1.5">
                              <button onClick={() => setAddingGroupTo(null)} className="flex-1 py-1 text-[10px] border border-slate-200 rounded text-slate-600 bg-white">Cancel</button>
                              <button onClick={() => handleCreateGroup(area.nav_area_id)} disabled={saving || !groupForm.display_label.trim()} className="flex-1 py-1 text-[10px] bg-slate-600 text-white rounded hover:bg-slate-700 disabled:opacity-50 flex items-center justify-center gap-0.5">
                                {saving ? <RefreshCw size={9} className="animate-spin" /> : <Check size={9} />} Add
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => { setAddingGroupTo(area.nav_area_id); setGroupForm({ display_label: '' }); }} className="flex items-center gap-1 px-3 py-1.5 text-[10px] text-slate-400 hover:text-slate-600 w-full border-t border-slate-100 transition-colors">
                            <Plus size={9} /> Add Group
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {showBelow && <div className="h-0.5 bg-blue-500 mx-2 rounded-full" />}
                </div>
              );
            })}

            {areas.length === 0 && !creatingArea && (
              <div className="flex flex-col items-center justify-center h-32 text-center px-4">
                <Layout size={20} className="text-slate-200 mb-2" />
                <p className="text-[11px] text-slate-400">No navigation areas yet</p>
                <button onClick={() => setCreatingArea(true)} className="mt-2 text-[11px] text-blue-600 hover:underline">Add your first area</button>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Properties Panel */}
        <div className="flex-1 overflow-y-auto bg-[#fafbfc]">
          {selectedArea && (
            <AreaPropertiesPanel area={selectedArea} onChange={(a) => setAreas((prev) => prev.map((x) => x.nav_area_id === a.nav_area_id ? a : x))} onSave={handleSaveArea} onDelete={deleteAreaTarget ? undefined : (a) => setDeleteAreaTarget(a)} saving={saving} />
          )}
          {selectedGroup && (
            <GroupPropertiesPanel group={selectedGroup} areas={areas} onChange={(g) => { markDirty(); setGroups((prev) => prev.map((x) => x.nav_group_id === g.nav_group_id ? g : x)); }} onSave={handleSaveGroup} onDelete={deleteGroupTarget ? undefined : (g) => setDeleteGroupTarget(g)} saving={saving} />
          )}
          {selectedItem && (
            <ItemPropertiesPanel item={selectedItem} entities={entities} roles={roles} groups={groups} areas={areas} onChange={(i) => { markDirty(); setItems((prev) => prev.map((x) => x.nav_item_id === i.nav_item_id ? i : x)); }} onSave={handleSaveItem} onDelete={deleteItemTarget ? undefined : (i) => setDeleteItemTarget(i)} saving={saving} />
          )}
          {!selection && <EmptyPanel />}
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenuOverlay
          kind={contextMenu.kind}
          id={contextMenu.id}
          x={contextMenu.x}
          y={contextMenu.y}
          onMoveUp={() => {
            if (contextMenu.kind === 'area') moveArea(contextMenu.id, 'up');
            else if (contextMenu.kind === 'group') moveGroup(contextMenu.id, 'up');
            else moveItem(contextMenu.id, 'up');
          }}
          onMoveDown={() => {
            if (contextMenu.kind === 'area') moveArea(contextMenu.id, 'down');
            else if (contextMenu.kind === 'group') moveGroup(contextMenu.id, 'down');
            else moveItem(contextMenu.id, 'down');
          }}
          onDelete={() => {
            if (contextMenu.kind === 'area') {
              const a = areas.find((x) => x.nav_area_id === contextMenu.id);
              if (a?.is_deletable) setDeleteAreaTarget(a);
            } else if (contextMenu.kind === 'group') {
              const g = groups.find((x) => x.nav_group_id === contextMenu.id);
              if (g?.is_deletable) setDeleteGroupTarget(g);
            } else {
              const i = items.find((x) => x.nav_item_id === contextMenu.id);
              if (i?.is_deletable) setDeleteItemTarget(i);
            }
          }}
          isDeletable={
            contextMenu.kind === 'area' ? (areas.find((x) => x.nav_area_id === contextMenu.id)?.is_deletable ?? false)
            : contextMenu.kind === 'group' ? (groups.find((x) => x.nav_group_id === contextMenu.id)?.is_deletable ?? false)
            : (items.find((x) => x.nav_item_id === contextMenu.id)?.is_deletable ?? false)
          }
        />
      )}

      {/* Delete Dialogs */}
      {deleteAreaTarget && (
        <ConfirmDialog title="Delete Navigation Area" message={`Delete "${deleteAreaTarget.display_label}" and all its groups and items?`} confirmLabel="Delete" onConfirm={handleDeleteArea} onCancel={() => setDeleteAreaTarget(null)} danger />
      )}
      {deleteGroupTarget && (
        <ConfirmDialog title="Delete Group" message={`Delete "${deleteGroupTarget.display_label}" and all its items?`} confirmLabel="Delete" onConfirm={handleDeleteGroup} onCancel={() => setDeleteGroupTarget(null)} danger />
      )}
      {deleteItemTarget && (
        <ConfirmDialog title="Delete Item" message={`Delete "${deleteItemTarget.display_label}"?`} confirmLabel="Delete" onConfirm={handleDeleteItem} onCancel={() => setDeleteItemTarget(null)} danger />
      )}
    </div>
  );
}

/* ====== Sub-components ====== */

function TypeBadge({ system }: { system: boolean }) {
  return system ? (
    <span className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-500 shrink-0">
      <Shield size={8} /> Sys
    </span>
  ) : (
    <span className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-600 shrink-0">
      <Wrench size={8} />
    </span>
  );
}

function ContextMenuOverlay({ kind, x, y, onMoveUp, onMoveDown, onDelete, isDeletable }: {
  kind: string; id: string; x: number; y: number;
  onMoveUp: () => void; onMoveDown: () => void; onDelete: () => void; isDeletable: boolean;
}) {
  return (
    <div
      className="fixed z-50 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[160px] animate-in fade-in"
      style={{ left: Math.min(x, window.innerWidth - 180), top: Math.min(y, window.innerHeight - 150) }}
      onClick={(e) => e.stopPropagation()}
    >
      <button onClick={onMoveUp} className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-slate-700 hover:bg-slate-50 transition-colors">
        <ArrowUp size={12} className="text-slate-400" /> Move Up
      </button>
      <button onClick={onMoveDown} className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-slate-700 hover:bg-slate-50 transition-colors">
        <ArrowDown size={12} className="text-slate-400" /> Move Down
      </button>
      {isDeletable && (
        <>
          <div className="my-1 border-t border-slate-100" />
          <button onClick={onDelete} className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-red-600 hover:bg-red-50 transition-colors">
            <Trash2 size={12} /> Delete {kind}
          </button>
        </>
      )}
    </div>
  );
}

function EmptyPanel() {
  return (
    <div className="flex flex-col items-center justify-center h-72 text-center px-6">
      <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center mb-4 shadow-sm">
        <Layout size={24} className="text-slate-300" />
      </div>
      <p className="text-sm font-semibold text-slate-500 mb-1">Select any item to edit</p>
      <p className="text-[11px] text-slate-400 max-w-xs">
        Click an area, group, or item in the tree to edit its properties. Drag items or right-click to reorder.
      </p>
      <div className="mt-6 grid grid-cols-3 gap-3 max-w-sm w-full">
        {[
          { label: 'Areas', desc: 'Top-level modules', color: 'bg-blue-50 border-blue-200 text-blue-700', icon: <Layout size={12} /> },
          { label: 'Groups', desc: 'Sub-sections', color: 'bg-slate-50 border-slate-200 text-slate-600', icon: <FolderOpen size={12} /> },
          { label: 'Items', desc: 'Entity / page links', color: 'bg-slate-50 border-slate-200 text-slate-600', icon: <FileText size={12} /> },
        ].map((c) => (
          <div key={c.label} className={`p-3 rounded-xl border ${c.color}`}>
            <div className="flex items-center gap-1.5 mb-1">{c.icon}<p className="text-[11px] font-semibold">{c.label}</p></div>
            <p className="text-[10px] opacity-70">{c.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function InlineItemForm({ form, entities, onChange, onSave, onCancel, saving }: {
  form: { display_label: string; entity_name: string; icon_name: string; role_visibility: string[] };
  entities: EntityDefinition[];
  onChange: (f: typeof form) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <div className="px-2 py-2 bg-blue-50/50 border-t border-blue-100 space-y-1.5 mx-1 my-1 rounded-lg">
      <input type="text" value={form.display_label} onChange={(e) => onChange({ ...form, display_label: e.target.value })} className={MINI_INPUT} placeholder="Label..." autoFocus onKeyDown={(e) => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }} />
      <EntityPicker entities={entities} value={form.entity_name} onChange={(v) => onChange({ ...form, entity_name: v, icon_name: v ? defaultIconForEntity(v) : form.icon_name })} />
      <IconPicker value={form.icon_name} onChange={(v) => onChange({ ...form, icon_name: v })} />
      <div className="flex gap-1.5">
        <button onClick={onCancel} className="flex-1 py-1 text-[10px] border border-slate-200 rounded text-slate-600 bg-white">Cancel</button>
        <button onClick={onSave} disabled={saving || !form.display_label.trim()} className="flex-1 py-1 text-[10px] bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-0.5">
          {saving ? <RefreshCw size={9} className="animate-spin" /> : <Check size={9} />} Add
        </button>
      </div>
    </div>
  );
}

function AreaPropertiesPanel({ area, onChange, onSave, onDelete, saving }: {
  area: NavArea; onChange: (a: NavArea) => void; onSave: (a: NavArea) => void; onDelete?: (a: NavArea) => void; saving: boolean;
}) {
  return (
    <div className="p-5 max-w-md">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-blue-50 border border-blue-200 rounded-xl text-blue-600">
          {ICON_MAP[area.icon_name] ?? <Layout size={13} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-slate-800">{area.display_label}</p>
          <TypeBadge system={area.is_system} />
        </div>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
        <div>
          <label className={LBL}>Display Label</label>
          <input type="text" value={area.display_label} onChange={(e) => onChange({ ...area, display_label: e.target.value })} className={INPUT} />
        </div>
        <div>
          <label className={LBL}>Icon</label>
          <IconPicker value={area.icon_name} onChange={(v) => onChange({ ...area, icon_name: v })} />
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="area-active" checked={area.is_active} onChange={(e) => onChange({ ...area, is_active: e.target.checked })} className="w-3.5 h-3.5 accent-blue-600" />
          <label htmlFor="area-active" className="text-[11px] text-slate-700 font-medium flex items-center gap-1">
            {area.is_active ? <Eye size={11} className="text-emerald-500" /> : <EyeOff size={11} className="text-slate-400" />}
            {area.is_active ? 'Visible in navigation' : 'Hidden from navigation'}
          </label>
        </div>
        {area.is_system && (
          <div className="flex items-start gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
            <Shield size={11} className="text-slate-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-slate-500">System area -- rename and toggle visibility freely, but it cannot be deleted.</p>
          </div>
        )}
      </div>
      <div className="mt-4 flex items-center gap-2">
        {area.is_deletable && onDelete && (
          <button onClick={() => onDelete(area)} className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            <Trash2 size={11} /> Delete
          </button>
        )}
        <div className="flex-1" />
        <button onClick={() => onSave(area)} disabled={saving || !area.display_label.trim()} className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-40 transition-colors">
          {saving ? <RefreshCw size={11} className="animate-spin" /> : <Check size={11} />} Save Changes
        </button>
      </div>
    </div>
  );
}

function GroupPropertiesPanel({ group, areas, onChange, onSave, onDelete, saving }: {
  group: NavGroup; areas: NavArea[]; onChange: (g: NavGroup) => void; onSave: (g: NavGroup) => void; onDelete?: (g: NavGroup) => void; saving: boolean;
}) {
  return (
    <div className="p-5 max-w-md">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-500">
          <FolderOpen size={13} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-slate-800">{group.display_label}</p>
          <TypeBadge system={group.is_system} />
        </div>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
        <div>
          <label className={LBL}>Display Label</label>
          <input type="text" value={group.display_label} onChange={(e) => onChange({ ...group, display_label: e.target.value })} className={INPUT} />
        </div>
        <div>
          <label className={LBL}>Parent Area</label>
          <div className="relative">
            <select
              value={group.nav_area_id}
              onChange={(e) => onChange({ ...group, nav_area_id: e.target.value })}
              className={INPUT + ' pr-8 appearance-none'}
            >
              {areas.map((a) => <option key={a.nav_area_id} value={a.nav_area_id}>{a.display_label}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="grp-active" checked={group.is_active} onChange={(e) => onChange({ ...group, is_active: e.target.checked })} className="w-3.5 h-3.5 accent-blue-600" />
          <label htmlFor="grp-active" className="text-[11px] text-slate-700 font-medium flex items-center gap-1">
            {group.is_active ? <Eye size={11} className="text-emerald-500" /> : <EyeOff size={11} className="text-slate-400" />}
            {group.is_active ? 'Visible' : 'Hidden'}
          </label>
        </div>
        {group.is_system && (
          <div className="flex items-start gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
            <Shield size={11} className="text-slate-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-slate-500">System group -- can be renamed and toggled but not deleted.</p>
          </div>
        )}
      </div>
      <div className="mt-4 flex items-center gap-2">
        {group.is_deletable && onDelete && (
          <button onClick={() => onDelete(group)} className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            <Trash2 size={11} /> Delete
          </button>
        )}
        <div className="flex-1" />
        <button onClick={() => onSave(group)} disabled={saving || !group.display_label.trim()} className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-40 transition-colors">
          {saving ? <RefreshCw size={11} className="animate-spin" /> : <Check size={11} />} Save Changes
        </button>
      </div>
    </div>
  );
}

function ItemPropertiesPanel({ item, entities, roles, groups, areas, onChange, onSave, onDelete, saving }: {
  item: NavItem; entities: EntityDefinition[]; roles: SecurityRole[]; groups: NavGroup[]; areas: NavArea[];
  onChange: (i: NavItem) => void; onSave: (i: NavItem) => void; onDelete?: (i: NavItem) => void; saving: boolean;
}) {
  const toggleRole = (roleId: string) => {
    const current = item.role_visibility ?? [];
    onChange({ ...item, role_visibility: current.includes(roleId) ? current.filter((r) => r !== roleId) : [...current, roleId] });
  };

  return (
    <div className="p-5 max-w-md">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-500">
          {ICON_MAP[item.icon_name] ?? <FileText size={13} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-slate-800">{item.display_label}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <TypeBadge system={item.is_system} />
            {item.entity_name && (
              <span className="text-[9px] font-mono px-1.5 py-0.5 bg-blue-50 border border-blue-200 text-blue-600 rounded">
                {item.entity_name}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
        <div>
          <label className={LBL}>Display Label</label>
          <input type="text" value={item.display_label} onChange={(e) => onChange({ ...item, display_label: e.target.value })} className={INPUT} />
        </div>
        <div>
          <label className={LBL}>Parent Group</label>
          <div className="relative">
            <select
              value={item.nav_group_id}
              onChange={(e) => onChange({ ...item, nav_group_id: e.target.value })}
              className={INPUT + ' pr-8 appearance-none'}
            >
              {areas.map((a) => {
                const areaGroups = groups.filter((g) => g.nav_area_id === a.nav_area_id);
                if (areaGroups.length === 0) return null;
                return (
                  <optgroup key={a.nav_area_id} label={a.display_label}>
                    {areaGroups.map((g) => <option key={g.nav_group_id} value={g.nav_group_id}>{g.display_label}</option>)}
                  </optgroup>
                );
              })}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>
        <div>
          <label className={LBL}>Linked Entity (optional)</label>
          <EntityPicker entities={entities} value={item.entity_name ?? ''} onChange={(v) => onChange({ ...item, entity_name: v || null })} />
        </div>
        <div>
          <label className={LBL}>Icon</label>
          <IconPicker value={item.icon_name} onChange={(v) => onChange({ ...item, icon_name: v })} />
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="item-active" checked={item.is_active} onChange={(e) => onChange({ ...item, is_active: e.target.checked })} className="w-3.5 h-3.5 accent-blue-600" />
          <label htmlFor="item-active" className="text-[11px] text-slate-700 font-medium flex items-center gap-1">
            {item.is_active ? <Eye size={11} className="text-emerald-500" /> : <EyeOff size={11} className="text-slate-400" />}
            {item.is_active ? 'Visible in navigation' : 'Hidden from navigation'}
          </label>
        </div>

        <div>
          <label className={LBL}>
            Role Visibility
            <span className="text-[9px] font-normal text-slate-400 ml-1">(empty = all roles)</span>
          </label>
          {roles.length === 0 ? (
            <p className="text-[11px] text-slate-400 mt-1">No security roles defined yet.</p>
          ) : (
            <div className="space-y-1.5 mt-1.5">
              {roles.map((r) => {
                const has = (item.role_visibility ?? []).includes(r.role_id);
                return (
                  <div
                    key={r.role_id}
                    onClick={() => toggleRole(r.role_id)}
                    className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${has ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <div className={`w-4 h-4 rounded flex items-center justify-center border-2 shrink-0 ${has ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                      {has && <Check size={9} className="text-white" />}
                    </div>
                    <span className="text-[11px] font-medium text-slate-700">{r.name}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {item.is_system && (
          <div className="flex items-start gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
            <Shield size={11} className="text-slate-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-slate-500">System item -- label, icon, visibility, and role restrictions are all editable.</p>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2">
        {item.is_deletable && onDelete && (
          <button onClick={() => onDelete(item)} className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            <Trash2 size={11} /> Delete
          </button>
        )}
        <div className="flex-1" />
        <button onClick={() => onSave(item)} disabled={saving || !item.display_label.trim()} className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-40 transition-colors">
          {saving ? <RefreshCw size={11} className="animate-spin" /> : <Check size={11} />} Save Changes
        </button>
      </div>
    </div>
  );
}

function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white">
      {ICON_CATEGORIES.map((cat) => (
        <div key={cat.label}>
          <p className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400 border-b border-slate-100">
            {cat.label}
          </p>
          <div className="flex flex-wrap gap-1.5 p-2">
            {cat.names.map((name) => (
              <button
                key={name} onClick={() => onChange(name)} title={name} type="button"
                className={`p-1.5 rounded-lg border-2 transition-colors ${value === name ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-transparent text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}
              >
                {ICON_MAP[name]}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EntityPicker({ entities, value, onChange }: { entities: EntityDefinition[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)} className={INPUT + ' pr-8 appearance-none'}>
        <option value="">-- None (custom page) --</option>
        {entities.map((e) => <option key={e.entity_definition_id} value={e.logical_name}>{e.display_name}</option>)}
      </select>
      <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
    </div>
  );
}

function CmdBtn({ children, onClick, icon, primary, disabled }: {
  children: React.ReactNode; onClick?: () => void; icon?: React.ReactNode; primary?: boolean; disabled?: boolean;
}) {
  const base = 'flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded transition-all disabled:opacity-50';
  const style = primary
    ? `${base} bg-blue-600 hover:bg-blue-700 text-white shadow-sm`
    : `${base} text-slate-600 hover:bg-slate-100`;
  return <button className={style} onClick={onClick} disabled={disabled}>{icon}{children}</button>;
}

function CmdSep() {
  return <div className="w-px h-5 bg-slate-200 mx-1" />;
}

const MINI_INPUT = 'w-full px-2 py-1.5 text-[11px] border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400';
const INPUT = 'w-full px-2.5 py-2 text-[12px] border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400';
const LBL = 'block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1';
