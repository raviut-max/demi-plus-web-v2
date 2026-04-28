// app/admin/dashboard/page.tsx
// ✅ แก้ไขล่าสุด: 28 เมษายน 2569
// ✅ การแก้ไข:
//    1. แสดงข้อมูลผู้ใช้งานที่ login (ชื่อ, บทบาท, โรงพยาบาล)
//    2. แสดงลำดับชั้นโรงพยาบาล (แม่ข่าย → ลูกข่าย)
//    3. Badge แสดงประเภทโรงพยาบาล (ไม่แสดงโค้ด)
//    4. เมนูแสดงตามสิทธิ์ (Admin เห็นทั้งหมด, บุคลากรเห็นเฉพาะเมนูที่อนุญาต)
//    5. ✅ สถิติ Dashboard กรองตามโรงพยาบาลที่เข้าถึงได้

'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, logout, getDashboardStats, getAccessibleHospitalIds, getUserHospitalInfo } from '@/lib/supabase/queries';
import { supabase } from '@/lib/supabase/client';
import {
  Users,
  FileText,
  Calendar,
  Clock,
  LogOut,
  UserPlus,
  UserCheck,
  Target,
  ClipboardCheck,
  BarChart3,
  Settings,
  Hospital,
  Building2
} from 'lucide-react';

interface DashboardStats {
  totalPatients: number;
  todayRecords: number;
  todayAppointments: number;
  pendingAssessments: number;
}

interface MenuItem {
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  href: string;
  badge?: number;
  allowedRoles?: string[];
}

interface UserHospital {
  id: string;
  name: string;
  type: 'main' | 'sub';
  parent_id: string | null;
  parent_hospital?: {
    id: string;
    name: string;
  };
}

export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<UserHospital | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    totalPatients: 0,
    todayRecords: 0,
    todayAppointments: 0,
    pendingAssessments: 0,
  });
  const [loading, setLoading] = useState(true);
  const [accessibleHospitalIds, setAccessibleHospitalIds] = useState<string[]>([]);

  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }

    if (!['admin', 'doctor', 'helper'].includes(userData.role)) {
      alert('ไม่มีสิทธิ์เข้าถึง');
      router.push('/admin/login');
      return;
    }

    setUser(userData);
    loadUserHospital(userData.id);
    loadAccessibleHospitals(userData.id);
  }, [router]);

  // ✅ โหลดข้อมูลโรงพยาบาลของผู้ใช้
  const loadUserHospital = async (userId: string) => {
    try {
      console.log('🏥 Loading user hospital for:', userId);
      
      const hospitalInfo = await getUserHospitalInfo(userId);
      setUserHospital(hospitalInfo);
      console.log('✅ User hospital:', hospitalInfo);
    } catch (error) {
      console.error('Error loading user hospital:', error);
    }
  };

  // ✅ โหลดโรงพยาบาลที่เข้าถึงได้
  const loadAccessibleHospitals = async (userId: string) => {
    try {
      const ids = await getAccessibleHospitalIds(userId);
      setAccessibleHospitalIds(ids);
      console.log('🏥 Accessible hospitals:', ids.length, 'hospitals');
      console.log('🏥 Hospital IDs:', ids);
      
      // ✅ โหลดสถิติหลังจากได้สิทธิ์แล้ว (ส่ง hospitalIds ไปด้วย)
      loadDashboardStats(ids);
    } catch (error) {
      console.error('Error loading accessible hospitals:', error);
    }
  };

  const loadDashboardStats = async (hospitalIds?: string[]) => {
    try {
      console.log('📊 Loading dashboard stats with hospitalIds:', hospitalIds);
      const data = await getDashboardStats(hospitalIds);
      console.log('📊 Dashboard stats:', data);
      setStats(data);
    } catch (error) {
      console.error('Error loading dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  // ✅ เมนูจัดการระบบ - แสดงตามสิทธิ์
  const menuItems: MenuItem[] = [
    {
      title: 'จัดการผู้ป่วย',
      description: 'เพิ่ม/แก้ไข/ดูข้อมูลผู้ป่วย',
      icon: <Users className="w-6 h-6" />,
      color: 'from-blue-500 to-cyan-500',
      href: '/admin/patients',
      allowedRoles: ['admin', 'doctor', 'helper'],
    },
    {
      title: 'แบบประเมิน',
      description: 'ทำแบบประเมิน PAM และ PROMs',
      icon: <ClipboardCheck className="w-6 h-6" />,
      color: 'from-purple-500 to-pink-500',
      href: '/admin/screening',
      allowedRoles: ['admin', 'doctor', 'helper'],
    },
    {
      title: 'เป้าหมาย',
      description: 'กำหนดและจัดการเป้าหมายผู้ป่วย',
      icon: <Target className="w-6 h-6" />,
      color: 'from-green-500 to-emerald-500',
      href: '/admin/goals',
      allowedRoles: ['admin', 'doctor', 'helper'],
    },
    {
      title: 'นัดหมาย',
      description: 'จัดการนัดหมายผู้ป่วย',
      icon: <Calendar className="w-6 h-6" />,
      color: 'from-orange-500 to-red-500',
      href: '/admin/appointments',
      allowedRoles: ['admin', 'doctor', 'helper'],
    },
    {
      title: 'จัดการเจ้าหน้าที่',
      description: 'เพิ่ม/แก้ไข/ดูข้อมูลเจ้าหน้าที่',
      icon: <UserCheck className="w-6 h-6" />,
      color: 'from-indigo-500 to-purple-500',
      href: '/admin/staff',
      allowedRoles: ['admin'], // ✅ เฉพาะ Admin
    },
    {
      title: 'รายงาน',
      description: 'ดูสถิติและรายงาน',
      icon: <BarChart3 className="w-6 h-6" />,
      color: 'from-red-500 to-pink-500',
      href: '/admin/reports',
      allowedRoles: ['admin', 'doctor', 'helper'],
    },
    {
      title: 'ตั้งค่า',
      description: 'ตั้งค่าระบบและจัดการข้อมูลพื้นฐาน',
      icon: <Settings className="w-6 h-6" />,
      color: 'from-gray-500 to-slate-500',
      href: '/admin/settings',
      allowedRoles: ['admin'], // ✅ เฉพาะ Admin เท่านั้น
    },
  ];

  // ✅ Filter เมนูตามสิทธิ์ของผู้ใช้
  const visibleMenuItems = menuItems.filter(item =>
    item.allowedRoles?.includes(user?.role || '')
  );

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
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                DeMi+ หน้าหลัก
              </h1>
              <p className="text-gray-600">ระบบจัดการสำหรับเจ้าหน้าที่</p>
            </div>
            
            <div className="flex items-center gap-4">
              {/* ✅ แสดงข้อมูลผู้ใช้และโรงพยาบาล */}
              <div className="text-right bg-gradient-to-l from-blue-50 to-indigo-50 px-4 py-3 rounded-xl border border-blue-200">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <UserCheck className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">
                      {user?.full_name_th || 'ผู้ดูแลระบบ'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {user?.role === 'admin' ? '👑 ผู้ดูแลระบบ' :
                       user?.role === 'doctor' ? '👨‍⚕️ แพทย์' : '👩‍ เจ้าหน้าที่'}
                    </p>
                  </div>
                </div>
                
                {/* ✅ แสดงข้อมูลโรงพยาบาล */}
                {userHospital ? (
                  <div className="border-t border-blue-200 pt-2 mt-2">
                    <div className="flex items-center gap-1 mb-1">
                      <Hospital className="w-3 h-3 text-blue-600" />
                      <span className="text-xs text-gray-600 font-medium">
                        {userHospital.name}
                      </span>
                    </div>
                    
                    {/* ✅ Badge ประเภทโรงพยาบาล */}
                    <div className="flex items-center gap-2">
                      {userHospital.type === 'main' ? (
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-semibold">
                          🏥 แม่ข่าย
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-semibold">
                          🏥 ลูกข่าย
                        </span>
                      )}
                      
                      {/* ✅ แสดงแม่ข่าย (ถ้าเป็นลูกข่าย) */}
                      {userHospital.type === 'sub' && userHospital.parent_hospital && (
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Building2 className="w-3 h-3" />
                          <span>แม่ข่าย: {userHospital.parent_hospital.name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 mt-2">
                    ไม่สังกัดโรงพยาบาล
                  </p>
                )}
              </div>

              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all shadow-lg"
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
        
        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Total Patients */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-all">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">ผู้ป่วยทั้งหมด</p>
                <p className="text-3xl font-bold text-gray-800">{stats.totalPatients}</p>
                {accessibleHospitalIds.length > 0 && accessibleHospitalIds.length < 100 && (
                  <p className="text-xs text-gray-400 mt-1">
                    🔒 จาก {accessibleHospitalIds.length} รพ.
                  </p>
                )}
              </div>
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center">
                <Users className="w-8 h-8 text-white" />
              </div>
            </div>
          </div>

          {/* Today's Records */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-all">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">บันทึกวันนี้</p>
                <p className="text-3xl font-bold text-gray-800">{stats.todayRecords}</p>
              </div>
              <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl flex items-center justify-center">
                <ClipboardCheck className="w-8 h-8 text-white" />
              </div>
            </div>
          </div>

          {/* Today's Appointments */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-all">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">นัดหมายวันนี้</p>
                <p className="text-3xl font-bold text-gray-800">{stats.todayAppointments}</p>
              </div>
              <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl flex items-center justify-center">
                <Calendar className="w-8 h-8 text-white" />
              </div>
            </div>
          </div>

          {/* Pending Assessments */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-all">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">รอประเมิน</p>
                <p className="text-3xl font-bold text-gray-800">{stats.pendingAssessments}</p>
              </div>
              <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
                <Clock className="w-8 h-8 text-white" />
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-8">
          <h2 className="text-lg font-bold text-gray-800 mb-4">ดำเนินการด่วน</h2>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => router.push('/admin/patients/new')}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all"
            >
              <UserPlus className="w-4 h-4" />
              ลงทะเบียนผู้ป่วยใหม่
            </button>
            <button
              onClick={() => router.push('/admin/screening')}
              className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-all"
            >
              <FileText className="w-4 h-4" />
              ทำแบบประเมิน
            </button>
            {user?.role === 'admin' && (
              <button
                onClick={() => router.push('/admin/staff')}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-all"
              >
                <UserCheck className="w-4 h-4" />
                จัดการเจ้าหน้าที่
              </button>
            )}
            <button
              onClick={() => router.push('/admin/goals')}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all"
            >
              <Target className="w-4 h-4" />
              จัดการเป้าหมาย
            </button>
          </div>
        </div>

        {/* Menu Grid - แสดงเมนูตามสิทธิ์ */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleMenuItems.map((item, index) => (
            <button
              key={index}
              onClick={() => router.push(item.href)}
              className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl hover:scale-105 transition-all text-left group"
            >
              <div className={`w-14 h-14 bg-gradient-to-br ${item.color} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                <div className="text-white">
                  {item.icon}
                </div>
              </div>
              <h3 className="text-lg font-bold text-gray-800 mb-1">{item.title}</h3>
              <p className="text-sm text-gray-600">{item.description}</p>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="inline-block mt-2 px-2 py-1 bg-red-500 text-white text-xs font-semibold rounded-full">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>DeMi+ Admin Dashboard v2.0 | © 2024 All rights reserved</p>
        </div>
      </div>
    </div>
  );
}