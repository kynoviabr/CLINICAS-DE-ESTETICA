import { Outlet } from 'react-router-dom';
import ClinicSidebar from './ClinicSidebar';

export default function ClinicLayout() {
  return (
    <div className="min-h-screen bg-background">
      <ClinicSidebar />
      <main className="lg:ml-64 pt-16 lg:pt-0 min-h-screen">
        <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
