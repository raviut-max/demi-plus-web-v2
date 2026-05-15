// app/admin/knowledge/page.tsx
// ✅ แสดงสถานะ "กำลังอยู่ในระหว่างดำเนินการ"
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, logout } from '@/lib/supabase/queries';
import { ArrowLeft, BookOpen, Settings, LogOut, Clock, AlertCircle } from 'lucide-react';

export default function KnowledgeManagementPage() {
  const router = useRouter();

  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }
    if (userData.role !== 'admin') {
      alert('เฉพาะผู้ดูแลระบบเท่านั้นที่เข้าถึงได้');
      router.push('/admin/dashboard');
      return;
    }
  }, [router]);

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button
            onClick={() => router.push('/admin/dashboard')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับ Dashboard
          </button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2 flex items-center gap-2">
                <BookOpen className="w-8 h-8 text-purple-600" />
                จัดการความรู้
              </h1>
              <p className="text-gray-600">บทความและวิดีโอความรู้สำหรับผู้ป่วย</p>
            </div>
            
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all"
            >
              <LogOut className="w-4 h-4" />
              ออกจากระบบ
            </button>
          </div>
        </div>
      </div>

      {/* Main Content - Under Development */}
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="bg-white rounded-2xl shadow-lg border border-purple-200 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-500 to-indigo-600 px-8 py-6 text-white">
            <div className="flex items-center gap-3">
              <Settings className="w-8 h-8" />
              <div>
                <h2 className="text-2xl font-bold">🚧 กำลังพัฒนา</h2>
                <p className="text-purple-100">ระบบจัดการความรู้</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-8 text-center">
            <div className="mb-8">
              <div className="w-24 h-24 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Clock className="w-12 h-12 text-purple-600 animate-pulse" />
              </div>
              
              <h3 className="text-xl font-bold text-gray-800 mb-3">
                📚 ระบบจัดการความรู้และเนื้อหา
              </h3>
              <p className="text-gray-600 max-w-md mx-auto">
                หน้าสำหรับเพิ่ม/แก้ไข/ลบ บทความและวิดีโอความรู้สำหรับผู้ป่วย 
                พร้อมระบบจัดหมวดหมู่ตามระดับ PAM
              </p>
            </div>

            {/* Status Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-100 text-yellow-800 rounded-full font-semibold mb-8">
              <AlertCircle className="w-4 h-4" />
              กำลังอยู่ในระหว่างดำเนินการ
            </div>

            {/* Features Preview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              {[
                { icon: '📝', title: 'บทความความรู้', desc: 'จัดการเนื้อหาบทความตามระดับผู้ป่วย' },
                { icon: '🎬', title: 'วิดีโอแนะนำ', desc: 'อัปโหลดและจัดหมวดหมู่วิดีโอ' },
                { icon: '🏷️', title: 'จัดหมวดหมู่', desc: 'แบ่งตามระดับ PAM และหัวข้อ' },
              ].map((feature, idx) => (
                <div key={idx} className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <div className="text-3xl mb-2">{feature.icon}</div>
                  <h4 className="font-semibold text-gray-800 mb-1">{feature.title}</h4>
                  <p className="text-xs text-gray-500">{feature.desc}</p>
                </div>
              ))}
            </div>

            {/* Back Button */}
            <button
              onClick={() => router.push('/admin/dashboard')}
              className="px-8 py-3 bg-purple-500 text-white font-semibold rounded-xl hover:bg-purple-600 transition-all"
            >
              ← กลับหน้า Dashboard
            </button>
          </div>
        </div>

        {/* Contact Info */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>หากต้องการใช้งานระบบนี้ด่วน กรุณาติดต่อทีมพัฒนา</p>
          <p className="mt-1 font-medium text-gray-700">📧 support@demiplus.health</p>
        </div>
      </div>
    </div>
  );
}