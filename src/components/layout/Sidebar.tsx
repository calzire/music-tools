import { Link, useRouterState } from '@tanstack/react-router';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { navItems, type NavItem } from '@/lib/nav';
import { Button } from '@/components/ui/button';
import { useSidebar } from './SidebarContext';

function NavLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  const routerState = useRouterState();
  const isActive = routerState.location.pathname === item.href;

  return (
    <Link
      to={item.href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        isActive
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
      )}
    >
      {item.icon && <item.icon className="h-4 w-4" />}
      {item.title}
    </Link>
  );
}

function NavGroup({
  title,
  items,
  onNavClick,
}: {
  title: string;
  items: NavItem[];
  onNavClick?: () => void;
}) {
  return (
    <div className="space-y-1">
      <h4 className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      {items.map(item => (
        <NavLink key={item.href} item={item} onClick={onNavClick} />
      ))}
    </div>
  );
}

function SidebarContent({ onNavClick }: { onNavClick?: () => void }) {
  return (
    <nav className="flex flex-col gap-6 p-4">
      {navItems.map(group => (
        <NavGroup
          key={group.title}
          title={group.title}
          items={group.items}
          onNavClick={onNavClick}
        />
      ))}
    </nav>
  );
}

export function Sidebar() {
  const { isOpen, close } = useSidebar();

  return (
    <>
      {/* Mobile drawer overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 transform border-r border-border bg-sidebar transition-transform duration-200 ease-in-out md:hidden',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <span className="font-semibold">Menu</span>
          <Button variant="ghost" size="icon" onClick={close}>
            <X className="h-5 w-5" />
            <span className="sr-only">Close sidebar</span>
          </Button>
        </div>
        <SidebarContent onNavClick={close} />
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          'sticky top-14 hidden h-[calc(100svh-3.5rem)] w-64 shrink-0 overflow-y-auto border-r border-border bg-sidebar transition-all duration-200 ease-in-out md:block',
          !isOpen && 'md:w-0 md:border-r-0 md:overflow-hidden',
        )}
      >
        <SidebarContent />
      </aside>
    </>
  );
}
