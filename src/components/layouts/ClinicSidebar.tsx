import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, FileText, ClipboardList, CreditCard,
  CalendarDays, Activity, Camera, MessageSquare, Settings, LogOut,
  Menu, X, Stethoscope, FileSignature, BarChart3, TrendingUp, Star, KanbanSquare
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranding } from '@/contexts/BrandingContext';
import { useUserRole, type AppRole } from '@/hooks/useUserRole';
import { cn } from '@/lib/utils';
import NotificationBell from '@/components/NotificationBell';

interface NavItem {
  to: string;
  icon: unknown;
  label: string;
  roles: AppRole[];
}

const navItems: NavItem[] = [
  { to: '/clinic', icon: LayoutDashboard, label: 'Dashboard', roles: ['admin', 'receptionist', 'professional', 'sales'] },
  { to: '/clinic/crm', icon: KanbanSquare, label: 'CRM', roles: ['admin', 'receptionist', 'sales'] },
  { to: '/clinic/patients', icon: Users, label: 'Pacientes', roles: ['admin', 'receptionist', 'professional', 'sales'] },
  { to: '/clinic/treatments', icon: Stethoscope, label: 'Tratamentos', roles: ['admin', 'receptionist', 'professional', 'sales'] },
  { to: '/clinic/proposals', icon: FileText, label: 'Propostas', roles: ['admin', 'receptionist', 'sales'] },
  { to: '/clinic/contracts', icon: FileSignature, label: 'Contratos', roles: ['admin', 'receptionist', 'sales'] },
  { to: '/clinic/payments', icon: CreditCard, label: 'Pagamentos', roles: ['admin', 'receptionist'] },
  { to: '/clinic/appointments', icon: CalendarDays, label: 'Agenda', roles: ['admin', 'receptionist', 'professional'] },
  { to: '/clinic/sessions', icon: ClipboardList, label: 'Sessões', roles: ['admin', 'professional'] },
  { to: '/clinic/evolution', icon: Activity, label: 'Evolução', roles: ['admin', 'professional'] },
  { to: '/clinic/photos', icon: Camera, label: 'Fotos', roles: ['admin', 'professional'] },
  { to: '/clinic/feedback', icon: Star, label: 'Feedbacks', roles: ['admin', 'receptionist', 'professional'] },
  { to: '/clinic/nps', icon: TrendingUp, label: 'NPS', roles: ['admin', 'receptionist', 'professional'] },
  { to: '/clinic/satisfaction', icon: BarChart3, label: 'Satisfação', roles: ['admin'] },
  { to: '/clinic/reports', icon: MessageSquare, label: 'Relatórios', roles: ['admin', 'sales'] },
  { to: '/clinic/settings', icon: Settings, label: 'Configurações', roles: ['admin'] },
];

/**
 * Stripe-style sidebar.
 * - 220px width, navy bg
 * - Active item: bg purple .22 + 2px purple border-right
 * - Mobile: slide-in drawer with navy overlay
 */
export default function ClinicSidebar() {
  const [open, setOpen] = useState(false);
  const { signOut } = useAuth();
  const { clinicName, logoUrl } = useBranding();
  const { role } = useUserRole();
  const location = useLocation();

  const filteredNav = navItems.filter(item => !role || item.roles.includes(role as AppRole));

  return (
    <>
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 glass-navy border-b border-[hsl(var(--sidebar-border))] px-4 h-[60px] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {logoUrl ? (
            <img src={logoUrl} alt={clinicName} className="w-8 h-8 rounded-btn object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-btn bg-primary flex items-center justify-center">
              <Stethoscope className="w-4 h-4 text-primary-foreground" />
            </div>
          )}
          <span className="font-heading font-semibold text-white text-[15px]">{clinicName}</span>
        </div>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <button
            onClick={() => setOpen(!open)}
            className="p-2 rounded-btn text-white/90 hover:bg-white/10 transition-colors"
            aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Overlay */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-[hsl(var(--bg-navy)/0.52)] backdrop-blur-[2px] animate-in fade-in-0"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-40 h-full w-[220px] flex flex-col transition-transform duration-300 ease-stripe',
          'bg-sidebar text-sidebar-foreground border-r border-[hsl(var(--sidebar-border))]',
          'lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="px-5 h-[60px] flex items-center border-b border-[hsl(var(--sidebar-border))] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {logoUrl ? (
              <img src={logoUrl} alt={clinicName} className="w-9 h-9 rounded-btn object-cover shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-btn bg-primary flex items-center justify-center shrink-0 shadow-glow">
                <Stethoscope className="w-4.5 h-4.5 text-primary-foreground" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="font-heading font-semibold text-white text-[15px] leading-tight tracking-tight truncate">
                {clinicName}
              </h1>
              <p className="text-[11px] uppercase tracking-wider text-white/50 font-medium mt-0.5">
                Clinic OS
              </p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {filteredNav.map(({ to, icon: Icon, label }) => {
            const isActive = location.pathname === to || (to !== '/clinic' && location.pathname.startsWith(to));
            return (
              <NavLink
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className={cn(
                  'group relative flex items-center gap-3 px-3 py-2 mx-1 rounded-btn text-[13px] font-medium transition-all duration-150 ease-stripe',
                  isActive
                    ? 'bg-[hsl(var(--primary)/0.22)] text-white'
                    : 'text-white/70 hover:bg-white/5 hover:text-white'
                )}
              >
                {/* Active indicator: 2px right border */}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute right-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-primary"
                  />
                )}
                <Icon className={cn('w-4 h-4 shrink-0', isActive && 'text-white')} />
                <span className="truncate">{label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-2 border-t border-[hsl(var(--sidebar-border))] shrink-0">
          <button
            onClick={signOut}
            className="flex items-center gap-3 px-3 py-2 mx-1 rounded-btn text-[13px] font-medium text-white/70 hover:bg-[hsl(var(--destructive)/0.18)] hover:text-white transition-all w-[calc(100%-0.5rem)] ease-stripe"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </aside>
    </>
  );
}
