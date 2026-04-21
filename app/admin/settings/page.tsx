// app/admin/settings/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession } from '@/lib/supabase/queries';
import { 
  ArrowLeft, 
  Lock, 
  Building2, 
  Home, 
  Shield, 
  BookOpen,
  Hospital,
  Users,
  Settings
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userData = checkSession();
    if (!userData || !['admin'].includes(userData.role)) {
      router.push('/admin/login');
      return;
    }
    setUser(userData);
    setLoading(false);
  }, [router]);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // ✅ ตรวจสอบรหัสผ่าน (hardcode: 12345678)
    if (password === '12345678') {
      setIsAuthenticated(true);
      setError('');
    } else {
      setError('❌ รหัสผ่านไม่ถูกต้อง');
      setPassword('');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button
            onClick={() => router.push('/admin')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับ
          </button>
          
          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">
              ⚙️ ตั้งค่าระบบ
            </h1>
            <p className="text-gray-600">จัดการการตั้งค่าระบบและข้อมูลพื้นฐาน</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        
        {!isAuthenticated ? (
          /* 🔐 หน้ายืนยันรหัสผ่าน */
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-md mx-auto">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock className="w-8 h-8 text-blue-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                ยืนยันตัวตน
              </h2>
              <p className="text-gray-600 text-sm">
                กรุณากรอกรหัสผ่านเพื่อเข้าถึงหน้าตั้งค่า
              </p>
            </div>

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  รหัสผ่าน
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="กรอกรหัสผ่าน"
                  required
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-red-600" />
                  <span className="text-red-700 text-sm">{error}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-blue-500 text-white py-3 rounded-lg hover:bg-blue-600 transition-all font-semibold"
              >
                ยืนยัน
              </button>
            </form>
          </div>
        ) : (
          /* ✅ หน้าจัดการหลังยืนยันรหัสผ่าน */
          <div className="space-y-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
              <Shield className="w-5 h-5 text-green-600" />
              <div>
                <p className="font-semibold text-green-800">ยืนยันตัวตนสำเร็จ</p>
                <p className="text-sm text-green-700">คุณสามารถจัดการระบบได้ตอนนี้</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 🏥 ปุ่มจัดการโรงพยาบาล */}
              <button
                onClick={() => router.push('/admin/hospitals')}
                className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-all text-left group"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-all">
                    <Hospital className="w-7 h-7 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-800">
                      จัดการโรงพยาบาล
                    </h3>
                    <p className="text-sm text-gray-500">
                      โรงพยาบาลแม่ข่ายและลูกข่าย
                    </p>
                  </div>
                </div>
                <p className="text-gray-600 text-sm">
                  เพิ่ม/แก้ไข/ลบ ข้อมูลโรงพยาบาลและกำหนดความสัมพันธ์แม่ข่าย-ลูกข่าย
                </p>
              </button>

              {/* 🏘️ ปุ่มจัดการหมู่บ้าน */}
              <button
                onClick={() => router.push('/admin/villages')}
                className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-all text-left group"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 bg-green-100 rounded-lg flex items-center justify-center group-hover:bg-green-200 transition-all">
                    <Home className="w-7 h-7 text-green-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-800">
                      จัดการหมู่บ้าน
                    </h3>
                    <p className="text-sm text-gray-500">
                      หมู่บ้านและตำบล
                    </p>
                  </div>
                </div>
                <p className="text-gray-600 text-sm">
                  เพิ่ม/แก้ไข/ลบ ข้อมูลหมู่บ้านและกำหนดโรงพยาบาลที่ดูแล
                </p>
              </button>

              {/* 📚 ปุ่มจัดการความรู้ */}
              <button
                onClick={() => router.push('/admin/knowledge')}
                className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-all text-left group"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 bg-purple-100 rounded-lg flex items-center justify-center group-hover:bg-purple-200 transition-all">
                    <BookOpen className="w-7 h-7 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-800">
                      จัดการความรู้
                    </h3>
                    <p className="text-sm text-gray-500">
                      บทความและวิดีโอ
                    </p>
                  </div>
                </div>
                <p className="text-gray-600 text-sm">
                  เพิ่ม/แก้ไข/ลบ บทความและวิดีโอความรู้สำหรับผู้ป่วย
                </p>
              </button>

              {/* 👥 ปุ่มจัดการเจ้าหน้าที่ */}
              <button
                onClick={() => router.push('/admin/staff')}
                className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-all text-left group"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 bg-indigo-100 rounded-lg flex items-center justify-center group-hover:bg-indigo-200 transition-all">
                    <Users className="w-7 h-7 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-800">
                      จัดการเจ้าหน้าที่
                    </h3>
                    <p className="text-sm text-gray-500">
                      หมอ พยาบาล อสม.
                    </p>
                  </div>
                </div>
                <p className="text-gray-600 text-sm">
                  เพิ่ม/แก้ไข/ลบ ข้อมูลเจ้าหน้าที่และกำหนดสิทธิ์การเข้าถึง
                </p>
              </button>
            </div>

            {/* 🔙 ปุ่มออกจากระบบตั้งค่า */}
            <div className="pt-6">
              <button
                onClick={() => {
                  setIsAuthenticated(false);
                  setPassword('');
                }}
                className="w-full bg-gray-500 text-white py-3 rounded-lg hover:bg-gray-600 transition-all font-semibold"
              >
                ออกจากระบบตั้งค่า
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}