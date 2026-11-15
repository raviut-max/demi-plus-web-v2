// app/admin/care-pathway-dashboard/page.tsx
// ✅ หน้าภาพรวมระบบ (System Overview)
// แสดงสถิติรวม, Funnel 6 ขั้นตอน, และ Watchlist ผู้ป่วยที่เลยกำหนด
'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, logout, getAccessibleHospitalIds } from '@/lib/supabase/queries';
import { supabase } from '@/lib/supabase/client';
import {
  ArrowLeft, Route, Users, AlertTriangle, CheckCircle, Clock,
  TrendingUp, FileText, Calendar, LogOut, Search, User, Hospital
} from 'lucide-react';

export default function CarePathwayDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [accessibleHospitalIds, setAccessibleHospitalIds] = useState<string[]>([]);
  
  // Stats
  const [totalPatients, setTotalPatients] = useState(0);
  const [completedAll, setCompletedAll] = useState(0);
  
  // Watchlist
  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const userData = checkSession();
    if (!userData) { router.push('/admin/login'); return; }
    if (!['admin', 'doctor', 'helper', 'osm'].includes(userData.role)) {
      alert('ไม่มีสิทธิ์เข้าถึง'); router.push('/admin/login'); return;
    }
    setUser(userData);
    loadData(userData.id);
  }, [router]);

  const loadData = async (userId: string) => {
    setLoading(true);
    try {
      const ids = await getAccessibleHospitalIds(userId);
      setAccessibleHospitalIds(ids);

      // 1. โหลดผู้ป่วยทั้งหมดในสิทธิ์
      let query = supabase.from('profiles').select(`
        id, first_name, last_name, hospital_number, pam_level, zone, hospital_id,
        hospitals ( name, type )
      `).eq('is_active', true);
      
      if (ids.length > 0) query = query.in('hospital_id', ids);
      
      const { data: patients, error: pErr } = await query;
      if (pErr) throw pErr;
      setTotalPatients(patients?.length || 0);

      // 2. คำนวณสถานะ Care Pathway แต่ละคน (แบบง่ายสำหรับภาพรวม)
      const watchlistData = [];
      let completedCount = 0;

      for (const p of (patients || [])) {
        // ดึงข้อมูลแบบย่อเพื่อเช็คสถานะ
        const [scr, drm, goals, rec, fu] = await Promise.all([
          supabase.from('screenings').select('id', { count: 'exact', head: true }).eq('user_id', p.id),
          supabase.from('patient_dreams').select('id', { count: 'exact', head: true }).eq('user_id', p.id).eq('status', 'active'),
          supabase.from('goals').select('id', { count: 'exact', head: true }).eq('user_id', p.id),
          supabase.from('records').select('id', { count: 'exact', head: true }).eq('user_id', p.id),
          supabase.from('appointment_followups').select('followup_date', { count: 'exact', head: true }).eq('user_id', p.id)
        ]);

        const stepsDone = [
          (scr.count || 0) > 0,
          (drm.count || 0) > 0,
          false, // oneday (ยังไม่มีข้อมูลเฉพาะ)
          (goals.count || 0) > 0,
          (rec.count || 0) > 0,
          (fu.count || 0) > 0
        ].filter(Boolean).length;

        if (stepsDone === 6) completedCount++;

        // ถ้าทำไม่ครบ 6 ขั้น หรือไม่มี followup เลย > 30 วัน ให้เข้า Watchlist
        const lastFuDate = fu.count ? (await supabase.from('appointment_followups').select('followup_date').eq('user_id', p.id).order('followup_date', { ascending: false }).limit(1).single()).data?.followup_date : null;
        const daysSinceLastFu = lastFuDate ? Math.floor((Date.now() - new Date(lastFuDate).getTime()) / (1000 * 60 * 60 * 24)) : 999;

        if (stepsDone < 6 || daysSinceLastFu > 30) {
          watchlistData.push({
            ...p,
            stepsDone,
            daysSinceLastFu: daysSinceLastFu === 999 ? 'ไม่เคย' : `${daysSinceLastFu} วัน`,
            isOverdue: daysSinceLastFu > 30
          });
        }
      }

      setCompletedAll(completedCount);
      // เรียงลำดับ: เลยกำหนดก่อน, แล้วตามด้วยขั้นตอนที่ทำได้น้อย
      watchlistData.sort((a, b) => {
        if (a.isOverdue && !b.isOverdue) return -1;
        if (!a.isOverdue && b.isOverdue) return 1;
        return a.stepsDone - b.stepsDone;
      });
      setWatchlist(watchlistData);

    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredWatchlist = useMemo(() => {
    if (!searchTerm) return watchlist;
    const lower = searchTerm.toLowerCase();
    return watchlist.filter(p => 
      p.first_name?.toLowerCase().includes(lower) ||
      p.last_name?.toLowerCase().includes(lower) ||
      p.hospital_number?.toLowerCase().includes(lower)
    );
  }, [watchlist, searchTerm]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/admin/dashboard')} className="p-2 hover:bg-gray-100 rounded-lg">
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                  <Route className="w-6 h-6 text-indigo-600" />
                  ภาพรวม Care Pathway (ระบบ)
                </h1>
                <p className="text-sm text-gray-500">ติดตามสถานะเส้นทางสุขภาพของผู้ป่วยทั้งหมดในเครือข่าย</p>
              </div>
            </div>
            <button onClick={() => { logout(); router.push('/admin/login'); }} className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">
              <LogOut className="w-4 h-4" /> ออกจากระบบ
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl shadow-sm border p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">ผู้ป่วยในระบบ</p>
              <p className="text-3xl font-bold text-gray-800">{totalPatients}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">เสร็จสิ้น 6 ขั้นตอน</p>
              <p className="text-3xl font-bold text-green-600">{completedAll}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">ต้องการความสนใจ (Watchlist)</p>
              <p className="text-3xl font-bold text-red-600">{watchlist.length}</p>
            </div>
          </div>
        </div>

        {/* Watchlist Table */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="p-6 border-b flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              รายชื่อผู้ป่วยที่ต้องการความสนใจ
            </h2>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ค้นหา ชื่อ หรือ HN..."
                className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-gray-700">ผู้ป่วย / HN</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-700">โรงพยาบาล</th>
                  <th className="px-6 py-3 text-center font-semibold text-gray-700">ความคืบหน้า</th>
                  <th className="px-6 py-3 text-center font-semibold text-gray-700">ติดตามล่าสุด</th>
                  <th className="px-6 py-3 text-center font-semibold text-gray-700">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredWatchlist.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                      <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-300" />
                      <p>ยอดเยี่ยม! ไม่มีผู้ป่วยที่ตกค้างในระบบ</p>
                    </td>
                  </tr>
                ) : (
                  filteredWatchlist.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <p className="font-medium text-gray-800">{p.first_name} {p.last_name}</p>
                        <p className="text-xs text-gray-500 font-mono">HN: {p.hospital_number}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs bg-gray-100 px-2 py-1 rounded">{p.hospitals?.name || '-'}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${p.stepsDone === 6 ? 'bg-green-500' : p.stepsDone >= 4 ? 'bg-blue-500' : 'bg-yellow-500'}`} 
                              style={{ width: `${(p.stepsDone / 6) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold text-gray-700">{p.stepsDone}/6</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                          p.isOverdue ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {p.daysSinceLastFu}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => router.push(`/admin/patients/${p.id}/care-pathway`)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-500 text-white rounded-lg text-xs font-medium hover:bg-indigo-600"
                        >
                          <FileText className="w-3 h-3" /> ดูรายละเอียด
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}