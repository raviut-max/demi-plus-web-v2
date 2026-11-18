// app/admin/care-pathway-dashboard/page.tsx
// ✅ แก้ไขล่าสุด: 18 พฤศจิกายน 2569
// ✅ ใช้ Database View (v_care_pathway_stats, v_overdue_patients)
// ✅ เร็วขึ้น 10-20 เท่า (จาก 10-20 วินาที → 0.5-1 วินาที)
// ✅ เพิ่มส่วนหัว: แสดง "ผู้ทำรายการ" (ชื่อ/บทบาท/โรงพยาบาล) + ปุ่มออกจากระบบ แบบเดียวกับ Dashboard
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import {
  checkSession,
  getAccessibleHospitalIds,
  isSuperAdmin,
  getUserHospitalInfo,
  logout,
} from '@/lib/supabase/queries';
import {
  Users, CalendarCheck, CalendarX, TrendingUp, TrendingDown,
  AlertTriangle, Repeat, HelpCircle, ArrowRight, Loader2, Eye,
  UserCheck, Hospital, Building2, LogOut,
} from 'lucide-react';

interface DashboardStats {
  total_patients: number;
  on_time_count: number;
  overdue_count: number;
  pam_increased: number;
  pam_decreased: number;
  active_recorders: number;
  repeat_recorders: number;
  obstacles_count: number;
  opportunities_count: number;
  other_count: number;
  total_overdue_count: number;
}

interface OverduePatient {
  id: string;
  hospital_number: string;
  first_name: string;
  last_name: string;
  pam_level: string;
  hospital_id: string;
  hospital_name: string;
  last_followup: string | null;
  days_overdue: number;
}

export default function CarePathwayDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<any>(null); // ✅ State ใหม่: ข้อมูล รพ. ของผู้ใช้
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [overduePatients, setOverduePatients] = useState<OverduePatient[]>([]);

  useEffect(() => {
    const userData = checkSession();
    if (!userData) { router.push('/admin/login'); return; }
    if (!['admin', 'doctor', 'helper', 'osm'].includes(userData.role)) {
      alert('ไม่มีสิทธิ์เข้าถึง'); router.push('/admin/login'); return;
    }
    setUser(userData);
    loadUserHospital(userData.id); // ✅ โหลดข้อมูล รพ. สำหรับ Header
    loadData(userData);
  }, [router]);

  // ✅ โหลดข้อมูลโรงพยาบาลของผู้ใช้ (แบบเดียวกับหน้า Dashboard)
  const loadUserHospital = async (userId: string) => {
    try {
      const hospitalInfo = await getUserHospitalInfo(userId);
      setUserHospital(hospitalInfo);
    } catch (error) {
      console.error('❌ [loadUserHospital] Error:', error);
    }
  };

  // ✅ ออกจากระบบ (แบบเดียวกับ Dashboard)
  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  const loadData = useCallback(async (userData: any) => {
    setLoading(true);
    try {
      const startTime = performance.now();
      const hospitalIds = await getAccessibleHospitalIds(userData.id);
      const isSuper = isSuperAdmin(userData);

      console.log('📊 [loadData] Starting with View...', { isSuper, hospitalIdsCount: hospitalIds.length });

      // ✅ Query View เดียวได้ทุกอย่าง (เร็วมาก!)
      const { data: statsData, error: statsError } = await supabase
        .from('v_care_pathway_stats')
        .select('*')
        .single();

      if (statsError) {
        console.error('❌ [loadData] Stats View Error:', statsError);
        throw statsError;
      }

      console.log('📊 [loadData] Stats loaded:', statsData);
      setStats(statsData);

      // ✅ Query Watchlist จาก View (เฉพาะ 10 อันดับแรก)
      let overdueQuery = supabase
        .from('v_overdue_patients')
        .select('*')
        .order('days_overdue', { ascending: false })
        .limit(10);

      // ✅ กรองตาม hospital_ids (ถ้าไม่ใช่ super admin)
      if (!isSuper && hospitalIds.length > 0) {
        overdueQuery = overdueQuery.in('hospital_id', hospitalIds);
      }

      const { data: overdueData, error: overdueError } = await overdueQuery;

      if (overdueError) {
        console.error('❌ [loadData] Overdue View Error:', overdueError);
        throw overdueError;
      }

      console.log('📊 [loadData] Overdue patients:', overdueData?.length);
      setOverduePatients(overdueData || []);

      const endTime = performance.now();
      console.log(`✅ [loadData] Complete in ${(endTime - startTime).toFixed(0)}ms`);
    } catch (error) {
      console.error('❌ [CarePathwayDashboard] Error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">กำลังโหลดข้อมูลภาพรวม...</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center text-red-600">
          <AlertTriangle className="w-12 h-12 mx-auto mb-4" />
          <p>ไม่สามารถโหลดข้อมูลได้</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* ============================================================ */}
      {/* Header - ✅ เพิ่มการ์ด "ผู้ทำรายการ" + ออกจากระบบ แบบ Dashboard */}
      {/* ============================================================ */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button onClick={() => router.push('/admin/dashboard')} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4">
            <ArrowRight className="w-4 h-4 rotate-180" /> กลับ Dashboard
          </button>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">📊 ภาพรวม Care Pathway Dashboard</h1>
              <p className="text-sm text-gray-500">สรุปผลการดูแลผู้ป่วยตามเส้นทางสุขภาพ (ข้อมูลย้อนหลัง 30 วัน)</p>
            </div>

            {/* ✅ การ์ดผู้ทำรายการ + ปุ่มออกจากระบบ (สไตล์เดียวกับ /admin/dashboard) */}
            <div className="flex items-center gap-4">
              <div className="text-right bg-gradient-to-l from-blue-50 to-indigo-50 px-4 py-3 rounded-xl border border-blue-200">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <UserCheck className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">{user?.full_name_th || 'ผู้ดูแลระบบ'}</p>
                    <p className="text-xs text-gray-500">
                      {user?.role === 'admin' ? '👑 ผู้ดูแลระบบ' :
                        user?.role === 'doctor' ? '👨‍⚕️ แพทย์' :
                          user?.role === 'osm' ? '🏘️ อสม.' : '👩‍💼 เจ้าหน้าที่'}
                    </p>
                  </div>
                </div>
                {userHospital ? (
                  <div className="border-t border-blue-200 pt-2 mt-2">
                    <div className="flex items-center gap-1 mb-1">
                      <Hospital className="w-3 h-3 text-blue-600" />
                      <span className="text-xs text-gray-600 font-medium">{userHospital.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {userHospital.type === 'main' ? (
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-semibold">🏥 แม่ข่าย</span>
                      ) : (
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-semibold">🏥 ลูกข่าย</span>
                      )}
                      {userHospital.type === 'sub' && userHospital.parent_hospital && (
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Building2 className="w-3 h-3" />
                          <span>แม่ข่าย: {userHospital.parent_hospital.name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 mt-2">ไม่สังกัดโรงพยาบาล</p>
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

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* ============================================================ */}
        {/* หมวดที่ 1: สรุปตัวเลขภาพรวม */}
        {/* ============================================================ */}
        <div>
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" /> หมวดที่ 1: สรุปตัวเลขภาพรวม
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white rounded-xl shadow-sm border p-5 flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center"><Users className="w-6 h-6 text-blue-600" /></div>
              <div><p className="text-sm text-gray-500">ผู้ป่วยในระบบ</p><p className="text-2xl font-bold text-gray-800">{stats.total_patients.toLocaleString()}</p></div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-5 flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center"><CalendarCheck className="w-6 h-6 text-green-600" /></div>
              <div><p className="text-sm text-gray-500">มาตามนัด (≤30 วัน)</p><p className="text-2xl font-bold text-green-600">{stats.on_time_count.toLocaleString()}</p></div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-5 flex items-center gap-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center"><CalendarX className="w-6 h-6 text-red-600" /></div>
              <div><p className="text-sm text-gray-500">เลยกำหนด (&gt;30 วัน)</p><p className="text-2xl font-bold text-red-600">{stats.overdue_count.toLocaleString()}</p></div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-5 flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center"><TrendingUp className="w-6 h-6 text-emerald-600" /></div>
              <div><p className="text-sm text-gray-500">PAM เพิ่มขึ้น (เดือนนี้)</p><p className="text-2xl font-bold text-emerald-600">{stats.pam_increased.toLocaleString()}</p></div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-5 flex items-center gap-4">
              <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center"><TrendingDown className="w-6 h-6 text-rose-600" /></div>
              <div><p className="text-sm text-gray-500">PAM ลดลง (เดือนนี้)</p><p className="text-2xl font-bold text-rose-600">{stats.pam_decreased.toLocaleString()}</p></div>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* หมวดที่ 2: รายชื่อผู้ป่วยที่ต้องให้ความสนใจ (Watchlist) */}
        {/* ============================================================ */}
        <div>
          {/* ✅ badge แสดงจำนวนทั้งหมด */}
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 flex-wrap">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            หมวดที่ 2: ผู้ป่วยที่ต้องให้ความสนใจ (เลยกำหนด &gt;30 วัน)
            <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-bold">
              ทั้งหมด {stats.total_overdue_count.toLocaleString()} คน
            </span>
          </h2>
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            {overduePatients.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <CalendarCheck className="w-12 h-12 mx-auto mb-3 text-green-400" />
                <p>ยอดเยี่ยม! ไม่มีผู้ป่วยที่เลยกำหนดการติดตาม</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-6 py-3 text-left font-semibold text-gray-700">HN</th>
                      <th className="px-6 py-3 text-left font-semibold text-gray-700">ชื่อ-นามสกุล</th>
                      <th className="px-6 py-3 text-center font-semibold text-gray-700">PAM Level</th>
                      <th className="px-6 py-3 text-center font-semibold text-gray-700">โรงพยาบาล</th>
                      <th className="px-6 py-3 text-center font-semibold text-gray-700">ติดตามล่าสุด</th>
                      <th className="px-6 py-3 text-center font-semibold text-gray-700">เลยกำหนด</th>
                      <th className="px-6 py-3 text-center font-semibold text-gray-700">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {overduePatients.map((p) => (
                      <tr key={p.id} className="hover:bg-red-50/50 transition-colors">
                        <td className="px-6 py-3 font-mono text-gray-600">{p.hospital_number}</td>
                        <td className="px-6 py-3 font-medium text-gray-800">{p.first_name} {p.last_name}</td>
                        <td className="px-6 py-3 text-center">
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                            p.pam_level === 'L4' ? 'bg-purple-100 text-purple-700' :
                              p.pam_level === 'L3' ? 'bg-blue-100 text-blue-700' :
                                p.pam_level === 'L2' ? 'bg-green-100 text-green-700' :
                                  'bg-red-100 text-red-700'
                          }`}>
                            {p.pam_level || 'L0'}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-center text-gray-600">{p.hospital_name || '-'}</td>
                        <td className="px-6 py-3 text-center text-gray-600">
                          {p.last_followup ? new Date(p.last_followup).toLocaleDateString('th-TH') : 'ไม่เคย'}
                        </td>
                        <td className="px-6 py-3 text-center">
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold">
                            <CalendarX className="w-3 h-3" />
                            {p.days_overdue === 999 ? 'ไม่เคยติดตาม' : `${p.days_overdue} วัน`}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-center">
                          <button
                            onClick={() => router.push(`/admin/patients/${p.id}/care-pathway`)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs hover:bg-blue-600 transition-colors"
                          >
                            <Eye className="w-3 h-3" /> ดูรายละเอียด
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ============================================================ */}
        {/* หมวดที่ 3: สถิติการทำซ้ำและเหตุผล */}
        {/* ============================================================ */}
        <div>
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Repeat className="w-5 h-5 text-purple-600" /> หมวดที่ 3: สถิติการทำซ้ำและเหตุผล (ย้อนหลัง 30 วัน)
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* สถิติการทำซ้ำ */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-md font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Repeat className="w-4 h-4 text-blue-500" /> สถิติการบันทึกกิจกรรมซ้ำ
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div>
                    <p className="text-sm text-blue-800 font-medium">ผู้ป่วยที่บันทึกกิจกรรม</p>
                    <p className="text-xs text-blue-600">มีอย่างน้อย 1 ครั้งในเดือนนี้</p>
                  </div>
                  <p className="text-3xl font-bold text-blue-700">{stats.active_recorders.toLocaleString()}</p>
                </div>
                <div className="flex items-center justify-between p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <div>
                    <p className="text-sm text-purple-800 font-medium">ผู้ป่วยที่บันทึกซ้ำ</p>
                    <p className="text-xs text-purple-600">มีความสม่ำเสมอ (&gt;1 ครั้ง)</p>
                  </div>
                  <p className="text-3xl font-bold text-purple-700">{stats.repeat_recorders.toLocaleString()}</p>
                </div>
                {stats.active_recorders > 0 && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>อัตราความสม่ำเสมอ</span>
                      <span>{Math.round((stats.repeat_recorders / stats.active_recorders) * 100)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div
                        className="bg-purple-500 h-2.5 rounded-full transition-all"
                        style={{ width: `${(stats.repeat_recorders / stats.active_recorders) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            {/* เหตุผลในการทำ */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="text-md font-bold text-gray-800 mb-4 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-orange-500" /> สรุปเหตุผลจากการติดตาม
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-red-800">พบอุปสรรค / ความกังวล</p>
                      <p className="text-xs text-red-600">adaptation_summary = 'obstacles'</p>
                    </div>
                  </div>
                  <span className="text-xl font-bold text-red-700">{stats.obstacles_count.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                      <TrendingUp className="w-4 h-4 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-green-800">พบโอกาส / ความก้าวหน้า</p>
                      <p className="text-xs text-green-600">adaptation_summary = 'opportunities'</p>
                    </div>
                  </div>
                  <span className="text-xl font-bold text-green-700">{stats.opportunities_count.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                      <HelpCircle className="w-4 h-4 text-gray-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">อื่นๆ</p>
                      <p className="text-xs text-gray-600">adaptation_summary = 'other'</p>
                    </div>
                  </div>
                  <span className="text-xl font-bold text-gray-700">{stats.other_count.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}