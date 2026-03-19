// app/admin/goals/page.tsx
'use client';

import { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, logout } from '@/lib/supabase/queries';
import GoalsContent from './GoalsContent';

export default function AdminGoalsPage() {
  const router = useRouter();
  
  // ✅ ตรวจสอบสิทธิ์ที่ระดับหน้าหลัก (ก่อน Suspense)
  const userData = checkSession();
  
  if (!userData) {
    if (typeof window !== 'undefined') {
      router.push('/admin/login');
    }
    return null;
  }

  if (!['admin', 'doctor', 'helper'].includes(userData.role)) {
    if (typeof window !== 'undefined') {
      alert('ไม่มีสิทธิ์เข้าถึง');
      router.push('/admin/login');
    }
    return null;
  }

  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-sky-100 to-cyan-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    }>
      <GoalsContent user={userData} />
    </Suspense>
  );
}
