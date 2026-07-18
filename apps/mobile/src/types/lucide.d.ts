// Fix for lucide-react-native: overrides DOM SVG type conflicts in Expo projects.
// Lists every icon actually used in this codebase.
declare module 'lucide-react-native' {
  import React from 'react';

  interface LucideProps {
    color?: string;
    size?: string | number;
    strokeWidth?: string | number;
    absoluteStrokeWidth?: boolean;
    style?: any;
    [prop: string]: any;
  }

  type LucideIcon = React.FC<LucideProps>;

  // ── Used icons ──────────────────────────────────────────────────────────────
  export const Plus: LucideIcon;
  export const Mic: LucideIcon;
  export const Send: LucideIcon;
  export const ChevronDown: LucideIcon;
  export const ChevronRight: LucideIcon;
  export const GitBranch: LucideIcon;
  export const Cpu: LucideIcon;
  export const Bot: LucideIcon;
  export const Menu: LucideIcon;
  export const Server: LucideIcon;
  export const Wifi: LucideIcon;
  export const WifiOff: LucideIcon;
  export const Loader: LucideIcon;
  export const Clock: LucideIcon;
  export const CalendarClock: LucideIcon;
  export const FolderOpen: LucideIcon;
  export const Settings: LucideIcon;
  export const X: LucideIcon;
  export const MessageSquarePlus: LucideIcon;
  export const SlidersHorizontal: LucideIcon;
  export const Key: LucideIcon;
  export const Globe: LucideIcon;
  export const Sun: LucideIcon;
  export const Moon: LucideIcon;
  export const Terminal: LucideIcon;
  export const Shield: LucideIcon;
  export const FileSearch: LucideIcon;
  export const Box: LucideIcon;
  export const Wrench: LucideIcon;
  export const Paperclip: LucideIcon;
  export const FolderGit2: LucideIcon;
  export const Network: LucideIcon;
  export const Eye: LucideIcon;
  export const EyeOff: LucideIcon;
  export const Check: LucideIcon;
  export const AlertCircle: LucideIcon;
  export const Info: LucideIcon;
  export const Copy: LucideIcon;
  export const File: LucideIcon;
  export const Search: LucideIcon;
  export const ChevronUp: LucideIcon;
  export const CheckCircle: LucideIcon;
  export const Circle: LucideIcon;
  export const ExternalLink: LucideIcon;
  export const RefreshCw: LucideIcon;
}
