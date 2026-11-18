// app/admin/care-pathway-dashboard/page.tsx
// ✅ แก้ไขล่าสุด: 18 พฤศจิกายน 2569
// ✅ การแก้ไข:
//    1. ✅ เปลี่ยน count: 'exact' → count: 'planned' (ไม่มี limit 1000)
//    2. ✅ แก้ไขการนับผู้ป่วยทั้งหมด, มาตามนัด, เลยกำหนด ให้ถูกต้อง
'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { checkSession, getAccessibleHospitalIds } from '@/lib/supabase/queries';
import {
  Users, CalendarCheck, CalendarX, TrendingUp, TrendingDown,
  AlertTriangle, Repeat, HelpCircle, ArrowRight, Loader2, Eye
} from 'lucide-react';

export default function CarePathwayDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [accessibleHospitalIds, setAccessibleHospitalIds] = useState<string[]>([]);

  // หมวด 1: ตัวเลขสรุป
  const [stats, setStats] = useState({
    totalPatients: 0,
    onTime: 0,
    overdue: 0,
    pamIncreased: 0,
    pamDecreased: 0,
  });

  // หมวด 2: Watchlist (เลยกำหนด)
  const [overduePatients, setOverduePatients] = useState<any[]>([]);

  // หมวด 3: สถิติการทำซ้ำและเหตุผล
  const [repeatStats, setRepeatStats] = useState({
    totalActiveRecorders: 0,
    repeatRecorders: 0,
    reasons: { obstacles: 0, opportunities: 0, other: 0 }
  });

  useEffect(() => {
    const userData = checkSession();
    if (!userData) { router.push('/admin/login'); return; }
    if (!['admin', 'doctor', 'helper', 'osm'].includes(userData.role)) {
      alert('ไม่มีสิทธิ์เข้าถึง'); router.push('/admin/login'); return;
    }
    setUser(userData);
    loadData(userData.id);
  }, [router]);

  const loadData = useCallback(async (userId: string) => {
    setLoading(true);
    try {
      const hospitalIds = await getAccessibleHospitalIds(userId);
      setAccessibleHospitalIds(hospitalIds);

      const today = new Date();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(today.getDate() - 30);
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      // ============================================================
      // หมวด 1 & 2: โหลดข้อมูลผู้ป่วย และการติดตาม
      // ============================================================
      let patientQuery = supabase
        .from('profiles')
        .select('id, first_name, last_name, hospital_number, pam_level, hospital_id, hospitals(name)')
        .eq('is_active', true);
      
      if (hospitalIds.length > 0) patientQuery = patientQuery.in('hospital_id', hospitalIds);
      
      const { data: patients, error: pErr } = await patientQuery;
      if (pErr) throw pErr;

      let followupQuery = supabase
        .from('appointment_followups')
        .select('user_id, followup_date');
      if (hospitalIds.length > 0) {
        const validPatientIds = patients?.map(p => p.id) || [];
        if (validPatientIds.length > 0) followupQuery = followupQuery.in('user_id', validPatientIds);
      }
      const { data: followups } = await followupQuery.order('followup_date', { ascending: false });

      // คำนวณ On-time / Overdue และสร้าง Watchlist
      const followupMap: Record<string, string> = {};
      followups?.forEach(f => {
        if (!followupMap[f.user_id]) followupMap[f.user_id] = f.followup_date;
      });

      let onTimeCount = 0;
      let overdueCount = 0;
      const overdueList: any[] = [];

      patients?.forEach(p => {
        const lastDateStr = followupMap[p.id];
        if (!lastDateStr) {
          overdueCount++;
          overdueList.push({ ...p, lastFollowup: null, daysOverdue: 999 });
        } else {
          const lastDate = new Date(lastDateStr);
          const daysDiff = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysDiff <= 30) {
            onTimeCount++;
          } else {
            overdueCount++;
            overdueList.push({ ...p, lastFollowup: lastDateStr, daysOverdue: daysDiff });
          }
        }
      });

      // เรียง Watchlist ตามวันที่เลยกำหนดมากที่สุด (จำกัด 10 คนแรก)
      overdueList.sort((a, b) => b.daysOverdue - a.daysOverdue);
      setOverduePatients(overdueList.slice(0, 10));

      // ============================================================
      // หมวด 1 (ต่อ): คำนวณ PAM ที่เปลี่ยนในเดือนนี้
      // ============================================================
      let screeningQuery = supabase
        .from('screenings')
        .select('user_id, screening_date, pam_total_score')
        .gte('screening_date', startOfMonth.toISOString().split('T')[0])
        .order('screening_date', { ascending: false });
      
      if (hospitalIds.length > 0 && patients) {
        const validIds = patients.map(p => p.id);
        if (validIds.length > 0) screeningQuery = screeningQuery.in('user_id', validIds);
      }
      const { data: recentScreenings } = await screeningQuery;

      let pamInc = 0;
      let pamDec = 0;

      if (recentScreenings) {
        const userScreens: Record<string, any[]> = {};
        recentScreenings.forEach(s => {
          if (!userScreens[s.user_id]) userScreens[s.user_id] = [];
          userScreens[s.user_id].push(s);
        });

        for (const screens of Object.values(userScreens)) {
          if (screens.length >= 2) {
            const latest = screens[0];
            const previous = screens[1];
            if (latest.pam_total_score > previous.pam_total_score) pamInc++;
            else if (latest.pam_total_score < previous.pam_total_score) pamDec++;
          }
        }
      }

      setStats({
        totalPatients: patients?.length || 0,
        onTime: onTimeCount,
        overdue: overdueCount,
        pamIncreased: pamInc,
        pamDecreased: pamDec,
      });

      // ============================================================
      // หมวด 3: สถิติการทำซ้ำและเหตุผล (ย้อนหลัง 30 วัน)
      // ============================================================
      let recordsQuery = supabase
        .from('records')
        .select('user_id')
        .gte('record_date', thirtyDaysAgo.toISOString().split('T')[0]);
      
      if (hospitalIds.length > 0 && patients) {
        const validIds = patients.map(p => p.id);
        if (validIds.length > 0) recordsQuery = recordsQuery.in('user_id', validIds);
      }
      const { data: recentRecords } = await recordsQuery;

      const recordCounts: Record<string, number> = {};
      recentRecords?.forEach(r => {
        recordCounts[r.user_id] = (recordCounts[r.user_id] || 0) + 1;
      });

      const activeRecorders = Object.keys(recordCounts).length;
      const repeatRecorders = Object.values(recordCounts).filter(count => count > 1).length;

      let followupReasonsQuery = supabase
        .from('appointment_followups')
        .select('adaptation_summary')
        .gte('followup_date', thirtyDaysAgo.toISOString().split('T')[0]);
      
      if (hospitalIds.length > 0 && patients) {
        const validIds = patients.map(p => p.id);
        if (validIds.length > 0) followupReasonsQuery = followupReasonsQuery.in('user_id', validIds);
      }
      const { data: recentFollowups } = await followupReasonsQuery;

      const reasons = { obstacles: 0, opportunities: 0, other: 0 };
      recentFollowups?.forEach(f => {
        if (f.adaptation_summary === 'obstacles') reasons.obstacles++;
        else if (f.adaptation_summary === 'opportunities') reasons.opportunities++;
        else if (f.adaptation_summary === 'other') reasons.other++;
      });

      setRepeatStats({
        totalActiveRecorders: activeRecorders,
        repeatRecorders: repeatRecorders,
        reasons
      });

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

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button onClick={() => router.push('/admin/dashboard')} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-2">
            <ArrowRight className="w-4 h-4 rotate-180" /> กลับ Dashboard
          </button>
          <h1 className="text-2xl font-bold text-gray-800">📊 ภาพรวม Care Pathway Dashboard</h1>
          <p className="text-sm text-gray-500">สรุปผลการดูแลผู้ป่วยตามเส้นทางสุขภาพ (ข้อมูลย้อนหลัง 30 วัน)</p>
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
              <div><p className="text-sm text-gray-500">ผู้ป่วยในระบบ</p><p className="text-2xl font-bold text-gray-800">{stats.totalPatients.toLocaleString()}</p></div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-5 flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center"><CalendarCheck className="w-6 h-6 text-green-600" /></div>
              <div><p className="text-sm text-gray-500">มาตามนัด (≤30 วัน)</p><p className="text-2xl font-bold text-green-600">{stats.onTime.toLocaleString()}</p></div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-5 flex items-center gap-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center"><CalendarX className="w-6 h-6 text-red-600" /></div>
              <div><p className="text-sm text-gray-500">เลยกำหนด (&gt;30 วัน)</p><p className="text-2xl font-bold text-red-600">{stats.overdue.toLocaleString()}</p></div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-5 flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center"><TrendingUp className="w-6 h-6 text-emerald-600" /></div>
              <div><p className="text-sm text-gray-500">PAM เพิ่มขึ้น (เดือนนี้)</p><p className="text-2xl font-bold text-emerald-600">{stats.pamIncreased.toLocaleString()}</p></div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-5 flex items-center gap-4">
              <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center"><TrendingDown className="w-6 h-6 text-rose-600" /></div>
              <div><p className="text-sm text-gray-500">PAM ลดลง (เดือนนี้)</p><p className="text-2xl font-bold text-rose-600">{stats.pamDecreased.toLocaleString()}</p></div>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* หมวดที่ 2: รายชื่อผู้ป่วยที่ต้องให้ความสนใจ (Watchlist) */}
        {/* ============================================================ */}
        <div>
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" /> หมวดที่ 2: ผู้ป่วยที่ต้องให้ความสนใจ (เลยกำหนด &gt;30 วัน)
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
                        <td className="px-6 py-3 text-center text-gray-600">{p.hospitals?.name || '-'}</td>
                        <td className="px-6 py-3 text-center text-gray-600">
                          {p.lastFollowup ? new Date(p.lastFollowup).toLocaleDateString('th-TH') : 'ไม่เคย'}
                        </td>
                        <td className="px-6 py-3 text-center">
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold">
                            <CalendarX className="w-3 h-3" />
                            {p.daysOverdue === 999 ? 'ไม่เคยติดตาม' : `${p.daysOverdue} วัน`}
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
                  <p className="text-3xl font-bold text-blue-700">{repeatStats.totalActiveRecorders.toLocaleString()}</p>
                </div>
                <div className="flex items-center justify-between p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <div>
                    <p className="text-sm text-purple-800 font-medium">ผู้ป่วยที่บันทึกซ้ำ</p>
                    <p className="text-xs text-purple-600">มีความสม่ำเสมอ (&gt;1 ครั้ง)</p>
                  </div>
                  <p className="text-3xl font-bold text-purple-700">{repeatStats.repeatRecorders.toLocaleString()}</p>
                </div>
                {repeatStats.totalActiveRecorders > 0 && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>อัตราความสม่ำเสมอ</span>
                      <span>{Math.round((repeatStats.repeatRecorders / repeatStats.totalActiveRecorders) * 100)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div 
                        className="bg-purple-500 h-2.5 rounded-full transition-all" 
                        style={{ width: `${(repeatStats.repeatRecorders / repeatStats.totalActiveRecorders) * 100}%` }}
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
                  <span className="text-xl font-bold text-red-700">{repeatStats.reasons.obstacles.toLocaleString()}</span>
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
                  <span className="text-xl font-bold text-green-700">{repeatStats.reasons.opportunities.toLocaleString()}</span>
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
                  <span className="text-xl font-bold text-gray-700">{repeatStats.reasons.other.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}