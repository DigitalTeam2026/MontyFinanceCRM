// Curated icon set for funnel-stage cards. Stages reference an icon by name
// (optional chrome); kept in its own module so both the renderer and the
// properties panel can import it without tripping react-refresh.
import {
  Wallet, Megaphone, Users, Target, Building2, DollarSign, TrendingUp,
  ShoppingCart, Briefcase, Flag, Award, Star, type LucideIcon,
} from 'lucide-react';

export const STAGE_ICONS: Record<string, LucideIcon> = {
  Wallet, Megaphone, Users, Target, Building2, DollarSign, TrendingUp,
  ShoppingCart, Briefcase, Flag, Award, Star,
};

export const STAGE_ICON_NAMES = Object.keys(STAGE_ICONS);
