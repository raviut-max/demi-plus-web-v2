'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Eye, PlusCircle } from 'lucide-react';

export default function AppointmentsPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect ไปหน้าดูนัดหมายโดย default
    router.push('/admin/appointments/view');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-sky-100 to-cyan-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-gray-600">กำลังโหลด...</p>
      </div>
    </div>
  );
}
