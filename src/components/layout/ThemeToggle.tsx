import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from './ThemeContext';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    if (theme === 'light') {
      setTheme('dark');
    } else if (theme === 'dark') {
      setTheme('system');
    } else {
      setTheme('light');
    }
  };

  const icon =
    theme === 'dark' ? (
      <Moon className="h-5 w-5" />
    ) : theme === 'light' ? (
      <Sun className="h-5 w-5" />
    ) : (
      <>
        <Sun className="h-5 w-5 dark:hidden" />
        <Moon className="hidden h-5 w-5 dark:block" />
      </>
    );

  const label = theme === 'system' ? 'System theme' : theme === 'dark' ? 'Dark mode' : 'Light mode';

  return (
    <Button variant="ghost" size="icon" onClick={toggleTheme} title={label}>
      {icon}
      <span className="sr-only">{label}</span>
    </Button>
  );
}
