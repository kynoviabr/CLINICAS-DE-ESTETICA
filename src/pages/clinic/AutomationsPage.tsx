import { PageHeader } from '@/components/ui/page-header';
import { AutomationsSettingsTab } from '@/components/settings/AutomationsSettingsTab';
import { useUserRole } from '@/hooks/useUserRole';

/** Automações (lembretes pelo WhatsApp etc.) em página própria, com o item do menu selecionado. */
export default function AutomationsPage() {
  const { role } = useUserRole();
  return (
    <div>
      <PageHeader title="Automações" description="Lembretes e mensagens automáticas da clínica." />
      {role === 'admin'
        ? <AutomationsSettingsTab />
        : <p className="text-sm text-muted-foreground">Só a administração da clínica configura as automações.</p>}
    </div>
  );
}
