import { Drum, Gauge, Home, Sparkles, Timer, type LucideIcon } from 'lucide-react';

// Types
export interface NavGroup {
  items: NavItem[];
  title: string;
}

export interface NavItem {
  description?: string;
  href: string;
  icon?: LucideIcon;
  title: string;
}

// Constants
export const navItems: NavGroup[] = [
  {
    title: 'General',
    items: [
      {
        description: 'Welcome to Music Tools',
        href: '/',
        icon: Home,
        title: 'Home',
      },
    ],
  },
  {
    title: 'Tools',
    items: [
      {
        description: 'Practice with adjustable tempo',
        href: '/metronome',
        icon: Timer,
        title: 'Metronome',
      },
      {
        description: 'Tune instruments with microphone',
        href: '/tuner',
        icon: Gauge,
        title: 'Tuner',
      },
      {
        description: 'Build section-based drum patterns',
        href: '/drum-looper',
        icon: Drum,
        title: 'Drum Looper',
      },
      {
        description: 'Heavenly synth pad with chord buttons and drone',
        href: '/worship-pad',
        icon: Sparkles,
        title: 'Worship Pad',
      },
    ],
  },
];
