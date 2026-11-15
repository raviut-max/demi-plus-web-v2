// app/admin/care-pathway/page.tsx
// 🛤️ ภาพรวม Care Pathway (System Overview)
// ⚠️ ไฟล์นี้ใช้ 'useRouter' เท่านั้น ห้ามมี 'useParams'
'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, logout, getAccessibleHospitalIds } from '@/lib/supabase/queries';
import { supabase } from '@/lib/supabase/client';
import {
  ArrowLeft, Route, Users, CheckCircle, AlertTriangle, Clock,
  TrendingUp, FileText, Calendar, LogOut, Search, User, Hospital, Building2
} from 'lucide-react';

interface PatientSummary {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  hospital_number: string;
  pam_level: string;
  zone: string;
  hospital_id: string | null;
  hospitals: { name: string; type: string } | null;
  stepsCompleted: number;
  daysSinceLastFollowup: number;
  isOverdue: boolean;
}

export default function CarePathwayOverviewPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [accessibleHospitalIds, setAccessibleHospitalIds] = useState<string[]>([]);
  
  const [totalPatients, setTotalPatients] = useState(0);
  const [completedAll, setCompletedAll] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [patients, setPatients] = useState<PatientSummary[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
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

      let query = supabase
        .from('profiles')
        .select(`id, first_name, last_name, hospital_number, pam_level, zone, hospital_id, hospitals ( name, type )`)
        .eq('is_active', true);
      
      if (ids.length > 0) query = query.in('hospital_id', ids);
      const { data: profiles, error: pErr } = await query;
      if (pErr) throw pErr;

      const summaries: PatientSummary[] = await Promise.all((profiles || []).map(async (p: any) => {
        const pid = p.id;
        const [scr, drm, rec, goals, fu] = await Promise.all([
          supabase.from('screenings').select('id', { count: 'exact', head: true }).eq('user_id', pid),
          supabase.from('patient_dreams').select('id', { count: 'exact', head: true }).eq('user_id', pid).eq('status', 'active'),
          supabase.from('records').select('id', { count: 'exact', head: true }).eq('user_id', pid),
          supabase.from('goals').select('id', { count: 'exact', head: true }).eq('user_id', pid).eq('goal_type', 'weekly_activity'),
          supabase.from('appointment_followups').select('followup_date').eq('user_id', pid).order('followup_date', { ascending: false }).limit(1)
        ]);

        let steps = 0;
        if ((scr.count || 0) > 0) steps++;
        if ((drm.count || 0) > 0) steps++;
        if ((rec.count || 0) > 0) steps++; 
        if ((goals.count || 0) > 0) steps++;
        if ((rec.count || 0) > 0) steps++; 
        if ((fu.count || 0) > 0) steps++;

        let daysSince = 999;
        if (fu.data && fu.data.length > 0 && fu.data[0].followup_date) {
          const lastDate = new Date(fu.data[0].followup_date);
          const today = new Date();
          daysSince = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        }

        return {
          ...p,
          full_name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
          stepsCompleted: steps,
          daysSinceLastFollowup: daysSince,
          isOverdue: daysSince > 30,
        };
      }));

      setPatients(summaries);
      setTotalPatients(summaries.length);
      setCompletedAll(summaries.filter(s => s.stepsCompleted === 6).length);
      setOverdueCount(summaries.filter(s => s.isOverdue).length);
    } catch (error) {
      console.error('❌ [CarePathwayOverview] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredPatients = useMemo(() => {
    if (!searchTerm) return patients;
    const lower = searchTerm.toLowerCase();
    return patients.filter(p => 
      p.full_name.toLowerCase().includes(lower) ||
      p.hospital_number.toLowerCase().includes(lower)
    );
  }, [patients, searchTerm]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
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
                  ภาพรวม Care Pathway
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow-sm border p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center"><Users className="w-6 h-6 text-blue-600" /></div>
            <div><p className="text-sm text-gray-500">ผู้ป่วยในระบบ</p><p className="text-2xl font-bold text-gray-800">{totalPatients}</p></div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center"><CheckCircle className="w-6 h-6 text-green-600" /></div>
            <div><p className="text-sm text-gray-500">เสร็จสิ้น 6 ขั้นตอน</p><p className="text-2xl font-bold text-green-600">{completedAll}</p></div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center"><AlertTriangle className="w-6 h-6 text-red-600" /></div>
            <div><p className="text-sm text-gray-500">เกินกำหนดติดตาม (&gt;30 วัน)</p><p className="text-2xl font-bold text-red-600">{overdueCount}</p></div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center"><TrendingUp className="w-6 h-6 text-indigo-600" /></div>
            <div><p className="text-sm text-gray-500">อัตราการสำเร็จ</p><p className="text-2xl font-bold text-indigo-600">{totalPatients > 0 ? Math.round((completedAll / totalPatients) * 100) : 0}%</p></div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="ค้นหา ชื่อ หรือ HN..." className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-gray-700">ผู้ป่วย / HN</th>
                  <th className="px-6 py-3 text-center font-semibold text-gray-700">PAM / Zone</th>
                  <th className="px-6 py-3 text-center font-semibold text-gray-700">ความคืบหน้า (6 ขั้น)</th>
                  <th className="px-6 py-3 text-center font-semibold text-gray-700">ติดตามล่าสุด</th>
                  <th className="px-6 py-3 text-center font-semibold text-gray-700">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredPatients.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-500">ไม่พบข้อมูลที่ตรงกับคำค้นหา</td></tr>
                ) : (
                  filteredPatients.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <p className="font-medium text-gray-800">{p.full_name}</p>
                        <p className="text-xs text-gray-500 font-mono">{p.hospital_number}</p>
                        <p className="text-xs text-gray-400">{p.hospitals?.name || '-'}</p>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-block px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-bold mb-1">{p.pam_level || 'L0'}</span>
                        <br />
                        <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${p.zone === 'Red Zone' ? 'bg-red-100 text-red-700' : p.zone === 'Yellow Zone' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>{p.zone || 'Green'}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${p.stepsCompleted === 6 ? 'bg-green-500' : p.stepsCompleted >= 4 ? 'bg-blue-500' : p.stepsCompleted >= 2 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${(p.stepsCompleted / 6) * 100}%` }} />
                          </div>
                          <span className="text-xs font-bold text-gray-700">{p.stepsCompleted}/6</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {p.daysSinceLastFollowup === 999 ? (
                          <span className="text-xs text-gray-400">ยังไม่เคยติดตาม</span>
                        ) : (
                          <span className={`text-xs font-bold ${p.isOverdue ? 'text-red-600' : 'text-gray-600'}`}>
                            {p.daysSinceLastFollowup} วันที่แล้ว {p.isOverdue && <AlertTriangle className="w-3 h-3 inline ml-1" />}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button onClick={() => router.push(`/admin/patients/${p.id}/care-pathway`)} className="px-3 py-1.5 bg-indigo-500 text-white rounded-lg text-xs font-medium hover:bg-indigo-600">ดูรายละเอียด</button>
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