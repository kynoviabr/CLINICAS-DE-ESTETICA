import { Outlet } from 'react-router-dom';
import ClinicSidebar from './ClinicSidebar';

/**
 * Stripe-style clinic shell.
 * - Sidebar: 220px (lg+)
 * - Mobile: 60px sticky top header
 * - Content area uses bg-page (#f6f9fc)
 */
export default function ClinicLayout() {
  return (
    <div className="min-h-screen bg-bg-page">
      <ClinicSidebar />
      <main className="lg:ml-[220px] pt-[60px] lg:pt-0 min-h-screen">
        <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10 max-w-[1280px] mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
