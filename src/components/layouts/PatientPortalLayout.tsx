import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Home, FileText, CreditCard, CalendarDays, Activity, Camera, MessageSquare, LogOut
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import NotificationBell from '@/components/NotificationBell';

const portalNav = [
  { to: '/portal', icon: Home, label: 'Início' },
  { to: '/portal/contract', icon: FileText, label: 'Contrato' },
  { to: '/portal/payments', icon: CreditCard, label: 'Pagamentos' },
  { to: '/portal/sessions', icon: CalendarDays, label: 'Sessões' },
  { to: '/portal/evolution', icon: Activity, label: 'Evolução' },
  { to: '/portal/photos', icon: Camera, label: 'Fotos' },
  { to: '/portal/feedback', icon: MessageSquare, label: 'Avaliação' },
];

export default function PatientPortalLayout() {
  const { signOut } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <h1 className="font-bold text-foreground">Meu Tratamento</h1>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <button onClick={signOut} className="p-2 rounded-lg text-muted-foreground hover:text-destructive">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 max-w-lg mx-auto w-full px-4 py-6">
        <Outlet />
      </div>

      {/* Bottom nav */}
      <nav className="sticky bottom-0 glass border-t safe-area-bottom">
        <div className="max-w-lg mx-auto flex justify-around py-2">
          {portalNav.slice(0, 5).map(({ to, icon: Icon, label }) => {
            const isActive = location.pathname === to;
            return (
              <NavLink
                key={to}
                to={to}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-xs transition-colors",
                  isActive ? "text-primary font-semibold" : "text-muted-foreground"
                )}
              >
                <Icon className={cn("w-5 h-5", isActive && "stroke-[2.5]")} />
                {label}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
