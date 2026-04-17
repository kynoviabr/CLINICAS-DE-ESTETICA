import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, FileText, ClipboardList, CreditCard,
  CalendarDays, Activity, Camera, MessageSquare, Settings, LogOut,
  Menu, X, Stethoscope, FileSignature, BarChart3, TrendingUp, Star
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranding } from '@/contexts/BrandingContext';
import { useUserRole, type AppRole } from '@/hooks/useUserRole';
import { cn } from '@/lib/utils';
import NotificationBell from '@/components/NotificationBell';

interface NavItem {
  to: string;
  icon: any;
  label: string;
  roles: AppRole[];
}

const navItems: NavItem[] = [
  { to: '/clinic', icon: LayoutDashboard, label: 'Dashboard', roles: ['admin', 'receptionist', 'professional', 'sales'] },
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
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 glass border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {logoUrl ? (
            <img src={logoUrl} alt={clinicName} className="w-8 h-8 rounded-lg object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
              <Stethoscope className="w-4 h-4 text-primary-foreground" />
            </div>
          )}
          <span className="font-semibold text-foreground">{clinicName}</span>
        </div>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <button onClick={() => setOpen(!open)} className="p-2 rounded-lg hover:bg-secondary">
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Overlay */}
      {open && <div className="lg:hidden fixed inset-0 z-40 bg-foreground/20" onClick={() => setOpen(false)} />}

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 z-40 h-full w-64 bg-card border-r flex flex-col transition-transform duration-300",
        "lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Logo */}
        <div className="p-5 border-b">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img src={logoUrl} alt={clinicName} className="w-10 h-10 rounded-xl object-cover shadow-glow" />
            ) : (
              <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
                <Stethoscope className="w-5 h-5 text-primary-foreground" />
              </div>
            )}
            <div>
              <h1 className="font-bold text-foreground text-lg leading-tight">{clinicName}</h1>
              <p className="text-xs text-muted-foreground">Gestão Clínica</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {filteredNav.map(({ to, icon: Icon, label }) => {
            const isActive = location.pathname === to || (to !== '/clinic' && location.pathname.startsWith(to));
            return (
              <NavLink
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  isActive
                    ? "gradient-primary text-primary-foreground shadow-glow"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <Icon className="w-4.5 h-4.5 shrink-0" />
                {label}
              </NavLink>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t">
          <button
            onClick={signOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all w-full"
          >
            <LogOut className="w-4.5 h-4.5" />
            Sair
          </button>
        </div>
      </aside>
    </>
  );
}
