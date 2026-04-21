// app/admin/dashboard/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, logout, getDashboardStats } from '@/lib/supabase/queries';
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
  Settings
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
}

export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState({
    totalPatients: 0,
    todayRecords: 0,
    todayAppointments: 0,
    pendingAssessments: 0,
  });
  const [loading, setLoading] = useState(true);

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
    loadDashboardStats();
  }, [router]);

  const loadDashboardStats = async () => {
    try {
      const data = await getDashboardStats();
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

  // ✅ เมนูจัดการระบบ - ลบ กิจกรรม, ความรู้, Mentor ออก (เหลือ 7 เมนู)
  const menuItems: MenuItem[] = [
    {
      title: 'จัดการผู้ป่วย',
      description: 'เพิ่ม/แก้ไข/ดูข้อมูลผู้ป่วย',
      icon: <Users className="w-6 h-6" />,
      color: 'from-blue-500 to-cyan-500',
      href: '/admin/patients',
    },
    {
      title: 'แบบประเมิน',
      description: 'ทำแบบประเมิน PAM และ PROMs',
      icon: <FileText className="w-6 h-6" />,
      color: 'from-purple-500 to-pink-500',
      href: '/admin/screening',
    },
    {
      title: 'เป้าหมาย',
      description: 'กำหนดและจัดการเป้าหมายผู้ป่วย',
      icon: <Target className="w-6 h-6" />,
      color: 'from-green-500 to-emerald-500',
      href: '/admin/goals',
    },
    {
      title: 'นัดหมาย',
      description: 'จัดการนัดหมายผู้ป่วย',
      icon: <Calendar className="w-6 h-6" />,
      color: 'from-orange-500 to-red-500',
      href: '/admin/appointments',
    },
    {
      title: 'จัดการเจ้าหน้าที่',
      description: 'เพิ่ม/แก้ไข/ดูข้อมูลเจ้าหน้าที่',
      icon: <UserCheck className="w-6 h-6" />,
      color: 'from-indigo-500 to-purple-500',
      href: '/admin/staff',
    },
    {
      title: 'รายงาน',
      description: 'ดูสถิติและรายงาน',
      icon: <BarChart3 className="w-6 h-6" />,
      color: 'from-red-500 to-pink-500',
      href: '/admin/reports',
    },
    {
      title: 'ตั้งค่า',
      description: 'ตั้งค่าระบบและจัดการข้อมูลพื้นฐาน',
      icon: <Settings className="w-6 h-6" />,
      color: 'from-gray-500 to-slate-500',
      href: '/admin/settings',
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-50 to-purple-50">
      {/* Header */}
      <div className="bg-white shadow-lg border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              {/* ✅ แก้ไขชื่อเป็น "DeMi+ หน้าหลัก" */}
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                DeMi+ หน้าหลัก
              </h1>
              <p className="text-gray-600">
                ระบบจัดการสำหรับเจ้าหน้าที่
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="font-semibold text-gray-800">
                  {user?.full_name_th || 'ผู้ดูแลระบบ'}
                </p>
                <p className="text-sm text-gray-500">
                  {user?.role === 'admin' ? 'ผู้ดูแลระบบ' :
                   user?.role === 'doctor' ? 'แพทย์' : 'เจ้าหน้าที่'}
                </p>
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
            <button
              onClick={() => router.push('/admin/staff/new')}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-all"
            >
              <UserCheck className="w-4 h-4" />
              เพิ่มเจ้าหน้าที่
            </button>
            <button
              onClick={() => router.push('/admin/goals')}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all"
            >
              <Target className="w-4 h-4" />
              จัดการเป้าหมาย
            </button>
          </div>
        </div>

        {/* Menu Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {menuItems.map((item, index) => (
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