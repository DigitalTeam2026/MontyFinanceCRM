// Single source of truth for navigation icons.
//
// Both the Admin Studio icon picker (src/admin/navigation/NavigationPage.tsx)
// and the CRM sidebar (src/app/components/AppSidebar.tsx) resolve icons through
// this map. Add an icon here once and it is instantly available to pick AND to
// render — previously the two kept separate hardcoded maps, so any icon the
// picker offered but the sidebar lacked silently fell back to a default.
import {
  TrendingUp, Briefcase, Handshake, Target, Trophy, Filter, Percent, Zap, Flag,
  User, Users, UserPlus, Building2, Factory, CreditCard, Contact, Crown,
  Mail, Phone, MessageCircle, Send, Headphones, Bell, Video, Megaphone, Rocket, Ticket,
  Globe, Map, MapPin, Compass, Landmark, Banknote, Coins, Wallet, CircleDollarSign, ArrowRightLeft,
  BarChart3, PieChart, LineChart, Database, Layers, Kanban, Table, Tag, Package, GitBranch,
  Calendar, CalendarCheck, Clock, Waypoints,
  LayoutGrid, FileText, FolderOpen, BookOpen, ShoppingCart, Settings, Star, BarChart2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const NAV_ICONS: Record<string, LucideIcon> = {
  // CRM & Sales
  TrendingUp, Briefcase, Handshake, Target, Trophy, Filter, Percent, Zap, Flag,
  // People & Companies
  User, Users, UserPlus, Building2, Factory, CreditCard, Contact, Crown,
  // Communication & Marketing
  Mail, Phone, MessageCircle, Send, Headphones, Bell, Video, Megaphone, Rocket, Ticket,
  // Geography & Money
  Globe, Map, MapPin, Compass, Landmark, Banknote, Coins, Wallet, CircleDollarSign, ArrowRightLeft,
  // Data & Organization
  BarChart3, PieChart, LineChart, Database, Layers, Kanban, Table, Tag, Package, GitBranch,
  Calendar, CalendarCheck, Clock, Waypoints,
  // Layout & General — 'Layout' is a legacy alias kept so existing nav records still render.
  Layout: LayoutGrid, FileText, FolderOpen, BookOpen, ShoppingCart, Settings, Star, BarChart2,
};

export const NAV_ICON_CATEGORIES: { label: string; names: string[] }[] = [
  { label: 'CRM & Sales', names: ['TrendingUp', 'Briefcase', 'Handshake', 'Target', 'Trophy', 'Filter', 'Percent', 'Zap', 'Flag'] },
  { label: 'People & Companies', names: ['User', 'Users', 'UserPlus', 'Building2', 'Factory', 'CreditCard', 'Contact', 'Crown'] },
  { label: 'Communication & Marketing', names: ['Mail', 'Phone', 'MessageCircle', 'Send', 'Headphones', 'Bell', 'Video', 'Megaphone', 'Rocket', 'Ticket'] },
  { label: 'Geography & Money', names: ['Globe', 'Map', 'MapPin', 'Compass', 'Landmark', 'Banknote', 'Coins', 'Wallet', 'CircleDollarSign', 'ArrowRightLeft'] },
  { label: 'Data & Organization', names: ['BarChart3', 'PieChart', 'LineChart', 'Database', 'Layers', 'Kanban', 'Table', 'Tag', 'Package', 'GitBranch', 'Calendar', 'CalendarCheck', 'Clock', 'Waypoints'] },
  { label: 'Layout & General', names: ['Layout', 'FileText', 'FolderOpen', 'BookOpen', 'ShoppingCart', 'Settings', 'Star', 'BarChart2'] },
];

/** Resolve a saved nav-item icon name to a rendered icon, falling back to FileText. */
export function renderNavIcon(name: string | null | undefined, size = 16) {
  const Icon = (name && NAV_ICONS[name]) || FileText;
  return <Icon size={size} />;
}

/** Resolve a saved nav-area icon name to a rendered icon, falling back to LayoutGrid. */
export function renderAreaIcon(name: string | null | undefined, size = 16) {
  const Icon = (name && NAV_ICONS[name]) || LayoutGrid;
  return <Icon size={size} />;
}
