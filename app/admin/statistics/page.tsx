// app/admin/statistics/page.tsx
// ✅ แสดงสถานะ "กำลังอยู่ในระหว่างดำเนินการ"
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, logout } from '@/lib/supabase/queries';
import { 
  ArrowLeft, Activity, BarChart3, LogOut, 
  Clock, AlertCircle, Users, Hospital 
} from 'lucide-react';

export default function StatisticsPage() {
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
                <BarChart3 className="w-8 h-8 text-blue-600" />
                สถิติและรายงานระบบ
              </h1>
              <p className="text-gray-600">Dashboard สถิติการใช้งานและข้อมูลเชิงลึก</p>
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
      <div className="max-w-5xl mx-auto px-4 py-16">
        <div className="bg-white rounded-2xl shadow-lg border border-blue-200 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-500 to-cyan-600 px-8 py-6 text-white">
            <div className="flex items-center gap-3">
              <Activity className="w-8 h-8" />
              <div>
                <h2 className="text-2xl font-bold">🚧 กำลังพัฒนา</h2>
                <p className="text-blue-100">ระบบสถิติและรายงาน</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-8 text-center">
            <div className="mb-8">
              <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Clock className="w-12 h-12 text-blue-600 animate-pulse" />
              </div>
              
              <h3 className="text-xl font-bold text-gray-800 mb-3">
                📊 ระบบสถิติและรายงานเชิงลึก
              </h3>
              <p className="text-gray-600 max-w-md mx-auto">
                Dashboard แสดงสถิติผู้ป่วย การใช้งานระบบ ประสิทธิภาพการรักษา 
                และรายงานที่สามารถ Export ได้
              </p>
            </div>

            {/* Status Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-100 text-yellow-800 rounded-full font-semibold mb-8">
              <AlertCircle className="w-4 h-4" />
              กำลังอยู่ในระหว่างดำเนินการ
            </div>

            {/* Features Preview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {[
                { icon: <Users className="w-6 h-6" />, title: 'สถิติผู้ป่วย', desc: 'จำนวนผู้ป่วยใหม่/เก่า, ระดับ PAM' },
                { icon: <Hospital className="w-6 h-6" />, title: 'สถิติโรงพยาบาล', desc: 'การใช้งานแยกตามเครือข่าย' },
                { icon: <Activity className="w-6 h-6" />, title: 'กิจกรรมผู้ป่วย', desc: 'การบันทึกเป้าหมายและติดตามผล' },
                { icon: <BarChart3 className="w-6 h-6" />, title: 'รายงานส่งออก', desc: 'Export เป็น Excel/PDF' },
              ].map((feature, idx) => (
                <div key={idx} className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <div className="text-blue-600 mb-3 flex justify-center">{feature.icon}</div>
                  <h4 className="font-semibold text-gray-800 mb-1">{feature.title}</h4>
                  <p className="text-xs text-gray-500">{feature.desc}</p>
                </div>
              ))}
            </div>

            {/* Progress Bar */}
            <div className="max-w-md mx-auto mb-8">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>ความคืบหน้าการพัฒนา</span>
                <span className="font-semibold">~65%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div className="bg-gradient-to-r from-blue-500 to-cyan-500 h-3 rounded-full w-2/3 animate-pulse"></div>
              </div>
              <p className="text-xs text-gray-500 mt-2">คาดว่าจะพร้อมใช้งานในเวอร์ชันถัดไป</p>
            </div>

            {/* Back Button */}
            <button
              onClick={() => router.push('/admin/dashboard')}
              className="px-8 py-3 bg-blue-500 text-white font-semibold rounded-xl hover:bg-blue-600 transition-all"
            >
              ← กลับหน้า Dashboard
            </button>
          </div>
        </div>

        {/* Contact Info */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>หากต้องการข้อมูลสถิติเบื้องต้น สามารถดูได้ที่หน้า Dashboard หลัก</p>
          <p className="mt-1 font-medium text-gray-700">📧 support@demiplus.health</p>
        </div>
      </div>
    </div>
  );
}