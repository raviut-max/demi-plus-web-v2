// app/admin/settings/page.tsx
// ✅ แก้ไขล่าสุด: 10 พฤษภาคม 2569
// ✅ การแก้ไข:
//    1. ✅ แก้ไข route นำเข้าจาก Excel เป็น /admin/patients/import-excel (ป้องกัน conflict)
//    2. ✅ อัปเดตปุ่มทั้งหมดให้ชี้ไปที่ route ที่ถูกต้อง
'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  checkSession,
  logout,
  getUserHospitalInfo,
  getAccessibleHospitalIds,
  isSuperAdmin
} from '@/lib/supabase/queries';
import {
  ArrowLeft,
  Lock,
  Building2,
  BookOpen,
  Shield,
  Users,
  Settings,
  UserCheck,
  Hospital,
  LogOut,
  AlertCircle,
  FileSpreadsheet,
  Upload,
  UserPlus,
  Database,
  FileText,
  Activity
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface UserHospital {
  id: string;
  name: string;
  code: string;
  type: 'main' | 'sub';
  parent_id: string | null;
  parent_hospital?: {
    id: string;
    name: string;
    code: string;
  };
}

interface SystemStats {
  totalHospitals: number;
  totalStaff: number;
  totalPatients: number;
  pendingApprovals: number;
}

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<UserHospital | null>(null);
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<SystemStats>({
    totalHospitals: 0,
    totalStaff: 0,
    totalPatients: 0,
    pendingApprovals: 0,
  });

  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }
    // ✅ ตรวจสอบสิทธิ์: เฉพาะ Super Admin หรือ Hospital Admin เท่านั้น
    if (!isSuperAdmin(userData) && userData.role !== 'admin') {
      alert('เฉพาะผู้ดูแลระบบระดับสูงเท่านั้นที่เข้าถึงได้');
      router.push('/admin/dashboard');
      return;
    }

    setUser(userData);
    loadUserHospital(userData.id);
    loadSystemStats();
    setLoading(false);
  }, [router]);

  // ✅ โหลดข้อมูลโรงพยาบาลของผู้ใช้
  const loadUserHospital = async (userId: string) => {
    try {
      const hospitalInfo = await getUserHospitalInfo(userId);
      setUserHospital(hospitalInfo);
    } catch (error) {
      console.error('Error loading user hospital:', error);
    }
  };

  // ✅ โหลดสถิติระบบ
  const loadSystemStats = async () => {
    try {
      // ✅ นับโรงพยาบาล
      const { count: hospitalsCount } = await supabase
        .from('hospitals')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      // ✅ นับเจ้าหน้าที่
      const { count: staffCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .in('role', ['admin', 'doctor', 'helper'])
        .eq('is_active', true);

      // ✅ นับผู้ป่วย
      const { count: patientsCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      // ✅ นับรออนุมัติ
      const { count: pendingCount } = await supabase
        .from('pending_staff')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      setStats({
        totalHospitals: hospitalsCount || 0,
        totalStaff: staffCount || 0,
        totalPatients: patientsCount || 0,
        pendingApprovals: pendingCount || 0,
      });
    } catch (error) {
      console.error('Error loading system stats:', error);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // ✅ ตรวจสอบรหัสผ่าน (แนะนำให้เปลี่ยนเป็นระบบที่ปลอดภัยกว่าในผลิต)
    if (password === '12345678') {
      setIsAuthenticated(true);
      setError('');
    } else {
      setError('❌ รหัสผ่านไม่ถูกต้อง');
      setPassword('');
    }
  };

  // ✅ Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    );
  }

  // ✅ Main render
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
          
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                ⚙️ ตั้งค่าระบบ
              </h1>
              <p className="text-gray-600">จัดการการตั้งค่าระบบและข้อมูลพื้นฐาน</p>
            </div>

            <div className="flex items-center gap-4">
              {/* ✅ แสดงข้อมูลผู้ใช้และโรงพยาบาล */}
              {userHospital && (
                <div className="text-right bg-gradient-to-l from-blue-50 to-indigo-50 px-4 py-3 rounded-xl border border-blue-200">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <UserCheck className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800 text-sm">
                        {user?.full_name_th || 'ผู้ดูแลระบบ'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {isSuperAdmin(user) ? '👑 Super Admin' : '🏥 Hospital Admin'}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-blue-200 pt-2 mt-2">
                    <div className="flex items-center gap-1 mb-1">
                      <Hospital className="w-3 h-3 text-blue-600" />
                      <span className="text-xs text-gray-600 font-medium">
                        {userHospital.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {userHospital.type === 'main' ? (
                        <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-semibold">
                          🏥 แม่ข่าย
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs font-semibold">
                          🏥 ลูกข่าย
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

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
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        
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
                  <AlertCircle className="w-4 h-4 text-red-600" />
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

            {/* ✅ สถิติระบบ */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">โรงพยาบาล</p>
                    <p className="text-2xl font-bold text-gray-800">{stats.totalHospitals}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                    <Users className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">เจ้าหน้าที่</p>
                    <p className="text-2xl font-bold text-gray-800">{stats.totalStaff}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                    <UserCheck className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">ผู้ป่วย</p>
                    <p className="text-2xl font-bold text-gray-800">{stats.totalPatients}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                    <AlertCircle className="w-6 h-6 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">รออนุมัติ</p>
                    <p className="text-2xl font-bold text-gray-800">{stats.pendingApprovals}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* ✅ เมนูจัดการ - แบ่งเป็นหมวดหมู่ */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              
              {/* 📊 หมวดข้อมูลผู้ป่วย */}
              <div className="lg:col-span-3">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-green-600" />
                  จัดการข้อมูลผู้ป่วย
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  
                  {/* 📥 ปุ่มนำเข้าผู้ป่วยจาก Excel - ✅ แก้ไขแล้ว (เปลี่ยน route) */}
                  <button
                    onClick={() => router.push('/admin/patients/import-excel')}
                    className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-all text-left group"
                  >
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-14 h-14 bg-green-100 rounded-lg flex items-center justify-center group-hover:bg-green-200 transition-all">
                        <FileSpreadsheet className="w-7 h-7 text-green-600" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-800">
                          นำเข้าจาก Excel
                        </h3>
                        <p className="text-sm text-gray-500">
                          Import ผู้ป่วยจำนวนมาก
                        </p>
                      </div>
                    </div>
                    <p className="text-gray-600 text-sm">
                      อัปโหลดไฟล์ Excel เพื่อนำเข้าผู้ป่วยหลายรายพร้อมกัน พร้อมตรวจสอบและแก้ไขก่อนบันทึก
                    </p>
                  </button>

                  {/* ➕ ปุ่มเพิ่มผู้ป่วยใหม่ */}
                  <button
                    onClick={() => router.push('/admin/patients/new')}
                    className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-all text-left group"
                  >
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-14 h-14 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-all">
                        <UserPlus className="w-7 h-7 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-800">
                          เพิ่มผู้ป่วยใหม่
                        </h3>
                        <p className="text-sm text-gray-500">
                          เพิ่มทีละราย
                        </p>
                      </div>
                    </div>
                    <p className="text-gray-600 text-sm">
                      เพิ่มผู้ป่วยใหม่ทีละราย พร้อมกรอกข้อมูลครบถ้วน
                    </p>
                  </button>

                  {/* 📋 ปุ่มรายการผู้ป่วย */}
                  <button
                    onClick={() => router.push('/admin/patients')}
                    className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-all text-left group"
                  >
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-14 h-14 bg-purple-100 rounded-lg flex items-center justify-center group-hover:bg-purple-200 transition-all">
                        <Users className="w-7 h-7 text-purple-600" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-800">
                          รายการผู้ป่วย
                        </h3>
                        <p className="text-sm text-gray-500">
                          ดูและแก้ไข
                        </p>
                      </div>
                    </div>
                    <p className="text-gray-600 text-sm">
                      ดูรายการผู้ป่วยทั้งหมด ค้นหา และแก้ไขข้อมูล
                    </p>
                  </button>
                </div>
              </div>

              {/* 🏥 หมวดโรงพยาบาล */}
              <div className="lg:col-span-3">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <Hospital className="w-5 h-5 text-blue-600" />
                  จัดการโรงพยาบาล
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* 🏥 ปุ่มจัดการโรงพยาบาล */}
                  <button
                    onClick={() => router.push('/admin/hospitals')}
                    className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-all text-left group"
                  >
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-14 h-14 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-all">
                        <Building2 className="w-7 h-7 text-blue-600" />
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
                </div>
              </div>

              {/* 👥 หมวดเจ้าหน้าที่ */}
              <div className="lg:col-span-3">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-600" />
                  จัดการเจ้าหน้าที่
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
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

                  {/* 📊 ปุ่มสถิติระบบ */}
                  <button
                    onClick={() => router.push('/admin/statistics')}
                    className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-all text-left group"
                  >
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-14 h-14 bg-orange-100 rounded-lg flex items-center justify-center group-hover:bg-orange-200 transition-all">
                        <Activity className="w-7 h-7 text-orange-600" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-800">
                          สถิติระบบ
                        </h3>
                        <p className="text-sm text-gray-500">
                          รายงานและกราฟ
                        </p>
                      </div>
                    </div>
                    <p className="text-gray-600 text-sm">
                      ดูสถิติการใช้งาน รายงาน และกราฟแสดงข้อมูลต่างๆ
                    </p>
                  </button>
                </div>
              </div>
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