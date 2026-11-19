import { lazy } from 'react';
import { useClinicPlan } from '@/hooks/useClinicPlan';
import { isLeanPlan } from '@/lib/plans';
import { PageLoader } from '@/components/PageLoader';

const MeuDiaPage = lazy(() => import('./MeuDiaPage'));
const DashboardPage = lazy(() => import('./DashboardPage'));

/** Início da clínica: no Essencial é o "Meu dia"; nos planos maiores, o Dashboard gerencial. */
export default function HomePage() {
  const { modules, loading } = useClinicPlan();
  if (loading) return <PageLoader />;
  return isLeanPlan(modules) ? <MeuDiaPage /> : <DashboardPage />;
}
