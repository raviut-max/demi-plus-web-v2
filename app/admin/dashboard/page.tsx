'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, logout, getDashboardStats } from '@/lib/supabase/queries';
import { 
  Users, 
  Calendar, 
  FileText, 
  Settings, 
  LogOut, 
  Activity, 
  TrendingUp, 
  UserPlus, 
  ClipboardCheck, 
  Shield,
  RefreshCw
} from 'lucide-react';

export default function AdminDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalPatients: 0,
    todayRecords: 0,
    todayAppointments: 0,
    pendingAssessments: 0,
  });
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const userData = checkSession();
    
    console.log('📊 [Dashboard] userData:', userData);
    console.log('📊 [Dashboard] full_name_th:', userData?.full_name_th);
    console.log('📊 [Dashboard] role:', userData?.role);

    if (!userData) {
      router.push('/admin/login');
      return;
    }

    if (!['admin', 'doctor', 'helper'].includes(userData.role)) {
      alert('ไม่มีสิทธิ์เข้าถึง');
      router.push('/admin/login');
      return;
    }

    // ✅ ต้องมีบรรทัดนี้!
    setUser(userData);

    loadDashboardStats();
    setLoading(false);
  }, [router]);

  const loadDashboardStats = async () => {
    try {
      setRefreshing(true);
      const statsData = await getDashboardStats();
      setStats(statsData);
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    loadDashboardStats();
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-sky-100 to-cyan-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  const menuItems = [
    {
      icon: <Users className="w-8 h-8" />,
      title: 'จัดการผู้ป่วย',
      description: 'เพิ่ม/แก้ไข/ดูข้อมูลผู้ป่วย',
      color: 'bg-blue-500',
      link: '/admin/patients',
    },
    {
      icon: <Calendar className="w-8 h-8" />,
      title: 'นัดหมาย',
      description: 'จัดการนัดหมายผู้ป่วย',
      color: 'bg-green-500',
      link: '/admin/appointments',
    },
    {
      icon: <FileText className="w-8 h-8" />,
      title: 'แบบประเมิน',
      description: 'ทำ Screening ให้ผู้ป่วย',
      color: 'bg-purple-500',
      link: '/admin/screening',
    },
    {
      icon: <Shield className="w-8 h-8" />,
      title: 'จัดการเจ้าหน้าที่',
      description: 'เพิ่ม/แก้ไข/ดูข้อมูลเจ้าหน้าที่',
      color: 'bg-indigo-500',
      link: '/admin/staff',
    },
    {
      icon: <Activity className="w-8 h-8" />,
      title: 'กิจกรรม',
      description: 'จัดการกิจกรรม',
      color: 'bg-orange-500',
      link: '/admin/activities',
    },
    {
      icon: <TrendingUp className="w-8 h-8" />,
      title: 'รายงาน',
      description: 'ดูสถิติและรายงาน',
      color: 'bg-red-500',
      link: '/admin/reports',
    },
    {
      icon: <Settings className="w-8 h-8" />,
      title: 'ตั้งค่า',
      description: 'ตั้งค่าระบบ',
      color: 'bg-gray-500',
      link: '/admin/settings',
    },
  ];

  const getRoleText = (role: string) => {
    switch (role) {
      case 'admin': return 'ผู้ดูแลระบบ';
      case 'doctor': return 'แพทย์';
      case 'helper': return 'เจ้าหน้าที่';
      default: return 'ผู้ดูแลระบบ';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-100 to-cyan-50">
      {/* Header */}
      <div className="bg-white shadow-lg border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">DeMi+ Admin Dashboard</h1>
              <p className="text-sm text-gray-600">ระบบจัดการสำหรับเจ้าหน้าที่</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-800">
                  {user?.full_name_th || 'ผู้ดูแลระบบ'}
                </p>
                <p className="text-xs text-gray-500">
                  {getRoleText(user?.role || 'admin')}
                </p>
              </div>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                รีเฟรช
              </button>
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
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-all">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">ผู้ป่วยทั้งหมด</p>
                <p className="text-2xl font-bold text-gray-800">{stats.totalPatients}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-all">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <Activity className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">บันทึกวันนี้</p>
                <p className="text-2xl font-bold text-gray-800">{stats.todayRecords}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-all">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                <Calendar className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">นัดหมายวันนี้</p>
                <p className="text-2xl font-bold text-gray-800">{stats.todayAppointments}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-all">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                <Activity className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">รอประเมิน</p>
                <p className="text-2xl font-bold text-gray-800">{stats.pendingAssessments}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-8">
          <h2 className="text-lg font-bold text-gray-800 mb-4">ดำเนินการด่วน</h2>
          <div className="flex flex-wrap gap-4">
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
            <button
              onClick={() => router.push('/admin/staff')}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-all"
            >
              <Shield className="w-4 h-4" />
              จัดการเจ้าหน้าที่
            </button>
            <button
              onClick={() => router.push('/admin/appointments')}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all"
            >
              <Calendar className="w-4 h-4" />
              ดูนัดหมาย
            </button>
          </div>
        </div>

        {/* Menu Grid */}
        <h2 className="text-xl font-bold text-gray-800 mb-4">เมนูจัดการ</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {menuItems.map((item, index) => (
            <button
              key={index}
              onClick={() => router.push(item.link)}
              className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 hover:shadow-xl transition-all active:scale-95"
            >
              <div className="flex items-start gap-4">
                <div className={`${item.color} w-14 h-14 rounded-xl flex items-center justify-center text-white`}>
                  {item.icon}
                </div>
                <div className="text-left">
                  <h3 className="text-lg font-bold text-gray-800">{item.title}</h3>
                  <p className="text-sm text-gray-600">{item.description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>DeMi+ Admin Dashboard v1.0.0 | © 2026 Development for Mind & health</p>
        </div>
      </div>
    </div>
  );
}