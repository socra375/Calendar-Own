import {
  Bell, BookOpen, Briefcase, Cake, Calendar, Car, Church, Coffee, Dumbbell, Flag, Gift, GraduationCap, Heart, House, Languages, MapPin,
  Music, PartyPopper, Phone, Plane, Rocket, ShoppingCart, Sparkles, Star, Stethoscope, Tag, Trophy, Users, Utensils, Video, Wallet,
  type LucideIcon,
} from "lucide-react";

export const ICONS: Record<string, LucideIcon> = {
  calendar: Calendar, cake: Cake, gift: Gift, "party-popper": PartyPopper, flag: Flag, star: Star, heart: Heart, briefcase: Briefcase,
  "graduation-cap": GraduationCap, languages: Languages, rocket: Rocket, users: Users, home: House, plane: Plane, music: Music,
  "book-open": BookOpen, dumbbell: Dumbbell, coffee: Coffee, stethoscope: Stethoscope, car: Car, "shopping-cart": ShoppingCart,
  bell: Bell, sparkles: Sparkles, trophy: Trophy, "map-pin": MapPin, video: Video, phone: Phone, wallet: Wallet, utensils: Utensils,
  church: Church, tag: Tag,
};

export function DynIcon({ name, className, fallback = "tag" }: { name?: string | null; className?: string; fallback?: string }) {
  const I = (name && ICONS[name]) || ICONS[fallback] || Tag;
  return <I className={className} aria-hidden />;
}
