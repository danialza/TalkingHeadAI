'use client';
import { Sparkles, Sun } from 'lucide-react';
import clsx from 'clsx';
import { useTheme } from '@/lib/theme';

interface ThemeToggleProps {
  variant?: 'classic' | 'aurora';
  className?: string;
}

/** Two-state segment control. Available in both Classic and Aurora skins. */
export default function ThemeToggle({ variant = 'classic', className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();

  const isAurora = variant === 'aurora';

  return (
    <div
      className={clsx(
        'inline-flex items-center gap-1 p-1 rounded-full',
        isAurora
          ? 'bg-white/8 border border-white/15 backdrop-blur-md'
          : 'bg-white border border-gray-200 shadow-sm',
        className,
      )}
      role="group"
      aria-label="Theme"
    >
      <button
        type="button"
        onClick={() => setTheme('classic')}
        aria-pressed={theme === 'classic'}
        className={clsx(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
          theme === 'classic'
            ? isAurora
              ? 'bg-white/90 text-gray-900 shadow'
              : 'bg-blue-600 text-white shadow'
            : isAurora
              ? 'text-white/70 hover:text-white'
              : 'text-gray-500 hover:text-gray-800',
        )}
      >
        <Sun className="w-3.5 h-3.5" />
        Classic
      </button>
      <button
        type="button"
        onClick={() => setTheme('aurora')}
        aria-pressed={theme === 'aurora'}
        className={clsx(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
          theme === 'aurora'
            ? isAurora
              ? 'bg-gradient-to-r from-fuchsia-400 to-indigo-500 text-white shadow-lg'
              : 'bg-gradient-to-r from-fuchsia-500 to-indigo-600 text-white shadow'
            : isAurora
              ? 'text-white/70 hover:text-white'
              : 'text-gray-500 hover:text-gray-800',
        )}
      >
        <Sparkles className="w-3.5 h-3.5" />
        Aurora
      </button>
    </div>
  );
}
