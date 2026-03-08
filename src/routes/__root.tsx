import { createRootRoute, Outlet } from '@tanstack/react-router';
import { KeyboardShortcutsProvider } from '@/components/layout/KeyboardShortcutsContext';
import { TopNav } from '@/components/layout/TopNav';
import { Sidebar } from '@/components/layout/Sidebar';
import { SidebarProvider } from '@/components/layout/SidebarContext';
import { ThemeProvider } from '@/components/layout/ThemeContext';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <ThemeProvider>
      <KeyboardShortcutsProvider>
        <SidebarProvider>
          <div className="relative flex min-h-svh flex-col">
            <TopNav />
            <div className="flex flex-1">
              <Sidebar />
              <main className="flex-1 overflow-y-auto p-6">
                <Outlet />
              </main>
            </div>
          </div>
        </SidebarProvider>
      </KeyboardShortcutsProvider>
    </ThemeProvider>
  );
}
