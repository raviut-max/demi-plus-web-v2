// app/admin/settings/page.tsx
// ✅ แก้ไขล่าสุด: 2 พฤษภาคม 2569
// ✅ การแก้ไข:
//    1. แสดงข้อมูลผู้ใช้งานที่ login (ชื่อ, บทบาท, โรงพยาบาล)
//    2. แสดงลำดับชั้นโรงพยาบาล (แม่ข่าย → ลูกข่าย)
//    3. Badge แสดงประเภทโรงพยาบาล
//    4. เพิ่มปุ่ม Logout
//    5. UI สอดคล้องกับหน้าอื่นๆ
//    6. แสดงสถิติระบบ

'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, logout, getUserHospitalInfo, getAccessibleHospitalIds } from '@/lib/supabase/queries';
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
    if (!userData || !['admin'].includes(userData.role)) {
      router.push('/admin/login');
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
      console.log('🏥 [loadUserHospital] Loading for user:', userId);
      const hospitalInfo = await getUserHospitalInfo(userId);
      setUserHospital(hospitalInfo);
      console.log('✅ [loadUserHospital] User hospital:', hospitalInfo);
    } catch (error) {
      console.error('❌ [loadUserHospital] Error:', error);
    }
  };

  // ✅ โหลดสถิติระบบ
  const loadSystemStats = async () => {
    try {
      console.log('📊 [loadSystemStats] Loading system stats...');
      
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

      console.log('✅ [loadSystemStats] Stats loaded:', {
        hospitals: hospitalsCount,
        staff: staffCount,
        patients: patientsCount,
        pending: pendingCount,
      });
    } catch (error) {
      console.error('❌ [loadSystemStats] Error:', error);
    }
  };

  const handleLogout = () => {
    console.log('🚪 [handleLogout] User logging out...');
    logout();
    router.push('/admin/login');
  };

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
                        {user?.role === 'admin' ? '👑 ผู้ดูแลระบบ' :
                         user?.role === 'doctor' ? '👨‍⚕️ แพทย์' : '👩‍💼 เจ้าหน้าที่'}
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

                      {userHospital.type === 'sub' && userHospital.parent_hospital && (
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Building2 className="w-3 h-3" />
                          <span>แม่ข่าย: {userHospital.parent_hospital.name}</span>
                        </div>
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
                    <Activity className="w-6 h-6 text-green-600" />
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
                    <FileText className="w-6 h-6 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">รออนุมัติ</p>
                    <p className="text-2xl font-bold text-gray-800">{stats.pendingApprovals}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* ✅ เมนูจัดการ */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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

              {/*  ปุ่มรายงาน */}
              <button
                onClick={() => router.push('/admin/reports')}
                className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-all text-left group"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 bg-green-100 rounded-lg flex items-center justify-center group-hover:bg-green-200 transition-all">
                    <Activity className="w-7 h-7 text-green-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-800">
                      รายงานและสถิติ
                    </h3>
                    <p className="text-sm text-gray-500">
                      Dashboard และรายงาน
                    </p>
                  </div>
                </div>
                <p className="text-gray-600 text-sm">
                  ดูสถิติการใช้งานและรายงานต่างๆ ของระบบ
                </p>
              </button>

              {/* 💾 ปุ่มฐานข้อมูล */}
              <button
                onClick={() => router.push('/admin/database')}
                className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-all text-left group"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 bg-red-100 rounded-lg flex items-center justify-center group-hover:bg-red-200 transition-all">
                    <Database className="w-7 h-7 text-red-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-800">
                      ฐานข้อมูล
                    </h3>
                    <p className="text-sm text-gray-500">
                      Backup และ Restore
                    </p>
                  </div>
                </div>
                <p className="text-gray-600 text-sm">
                  จัดการฐานข้อมูล สำรองข้อมูล และกู้คืนระบบ
                </p>
              </button>

              {/* 🔐 ปุ่มตั้งค่าความปลอดภัย */}
              <button
                onClick={() => router.push('/admin/security')}
                className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-all text-left group"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 bg-yellow-100 rounded-lg flex items-center justify-center group-hover:bg-yellow-200 transition-all">
                    <Lock className="w-7 h-7 text-yellow-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-800">
                      ความปลอดภัย
                    </h3>
                    <p className="text-sm text-gray-500">
                      รหัสผ่านและสิทธิ์
                    </p>
                  </div>
                </div>
                <p className="text-gray-600 text-sm">
                  จัดการรหัสผ่าน การเข้าถึง และความปลอดภัยของระบบ
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