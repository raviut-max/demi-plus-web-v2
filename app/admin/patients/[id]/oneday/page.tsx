// app/admin/patients/[id]/oneday/page.tsx
// ✅ ข้อ 3: ชีวิต 1 วันของฉัน — สรุปกิจวัตรรายวันจากบันทึกของผู้ป่วย
//    - ดึงกิจกรรมตาม PAM Level ของผู้ป่วย (L2/L3 หรือ L4) อัตโนมัติ
//    - แสดงภาพรวม 7 วันล่าสุด + รายละเอียดรายวันแยกหมวด (อาหาร/ออกกำลังกาย/วัดค่า/พักผ่อน)
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { checkSession, isSuperAdmin, getAccessibleHospitalIds } from '@/lib/supabase/queries';
import {
  ArrowLeft, Loader2, AlertCircle, CheckCircle2, XCircle,
  Utensils, Dumbbell, Activity, Moon, Calendar, ChevronLeft, ChevronRight
} from 'lucide-react';

// ---------- Helpers ----------
const formatThaiDate = (d: string | null | undefined) => {
  if (!d) return '-';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '-';
  const m = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const days = ['อา.','จ.','อ.','พ.','พฤ.','ศ.','ส.'];
  return `${days[date.getDay()]} ${date.getDate()} ${m[date.getMonth()]} ${date.getFullYear() + 543}`;
};

const CATEGORY_META: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  food:        { label: '🍚 อาหาร', icon: Utensils, color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
  exercise:    { label: '🏃 ออกกำลังกาย', icon: Dumbbell, color: 'text-green-700', bg: 'bg-green-50 border-green-200' },
  measurement: { label: '📊 วัดและบันทึก', icon: Activity, color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
  rest:        { label: '🌙 พักผ่อน', icon: Moon, color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200' },
};

interface ActivityDef {
  id: string;
  activity_code: string;
  activity_name_th: string;
  activity_type: string;
}

interface RecordData {
  id: string;
  activity_id: string;
  record_date: string;
  is_completed: boolean;
  notes: string | null;
}

export default function OneDayPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const patientId = params.id as string;
  const fromParam = searchParams.get('from');

  const [user, setUser] = useState<any>(null);
  const [patient, setPatient] = useState<any>(null);
  const [activities, setActivities] = useState<ActivityDef[]>([]);
  const [records, setRecords] = useState<RecordData[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorDetail, setErrorDetail] = useState('');
  
  // เลือกวันที่ (default เป็นวันนี้ หรือวันที่มีบันทึกล่าสุด)
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    const userData = checkSession();
    if (!userData) { router.push('/admin/login'); return; }
    if (!['admin', 'doctor', 'helper', 'osm'].includes(userData.role)) {
      alert('ไม่มีสิทธิ์เข้าถึง'); router.push('/admin/login'); return;
    }
    setUser(userData);
  }, [router]);

  const loadData = useCallback(async () => {
    if (!user || !patientId) return;
    setLoading(true);
    try {
      // 1. โหลดข้อมูลผู้ป่วย
      const { data: prof, error: e1 } = await supabase.from('profiles').select('*').eq('id', patientId).maybeSingle();
      if (e1) throw new Error('profiles: ' + e1.message);
      if (!prof) { setErrorDetail(`ไม่พบผู้ป่วย id: ${patientId}`); return; }

      if (!isSuperAdmin(user)) {
        const ids = await getAccessibleHospitalIds(user.id);
        if (prof.hospital_id && !ids.includes(prof.hospital_id)) { setErrorDetail('ไม่มีสิทธิ์เข้าถึงผู้ป่วยในโรงพยาบาลนี้'); return; }
      }

      setPatient(prof);

      // 2. โหลดกิจกรรมที่ตรงกับ PAM Level ของผู้ป่วย (หรือ ALL)
      const pamLevel = prof.pam_level || 'L2';
      const { data: actsData, error: e2 } = await supabase
        .from('activities')
        .select('id, activity_code, activity_name_th, activity_type')
        .or(`pam_level.eq.${pamLevel},pam_level.eq.ALL`)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      
      if (e2) console.warn('[OneDay] activities error:', e2.message);
      setActivities(actsData || []);

      // 3. โหลด records ย้อนหลัง 14 วัน (เพื่อแสดงภาพรวม 7 วัน + รายละเอียด)
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 14);
      const { data: recData, error: e3 } = await supabase
        .from('records')
        .select('id, activity_id, record_date, is_completed, notes')
        .eq('user_id', patientId)
        .gte('record_date', startDate.toISOString().split('T')[0])
        .order('record_date', { ascending: false });

      if (e3) console.warn('[OneDay] records error:', e3.message);
      setRecords(recData || []);

      // ตั้งค่า selectedDate เป็นวันที่มีบันทึกล่าสุด หรือ วันนี้
      if (recData && recData.length > 0) {
        setSelectedDate(recData[0].record_date);
      }

      setErrorDetail('');
    } catch (e: any) {
      console.error('❌ [OneDay]', e);
      setErrorDetail(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [user, patientId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ---------- คำนวณข้อมูล ----------
  // สร้างรายการ 7 วันล่าสุดสำหรับแถบด้านบน
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().split('T')[0];
  }).reverse();

  const getDayStats = (dateStr: string) => {
    const dayRecords = records.filter(r => r.record_date === dateStr);
    const done = dayRecords.filter(r => r.is_completed).length;
    return { total: dayRecords.length, done, pct: dayRecords.length > 0 ? Math.round((done / dayRecords.length) * 100) : 0 };
  };

  // จัดกลุ่มกิจกรรมตามหมวดหมู่ สำหรับวันที่เลือก
  const groupedActivities = (() => {
    const groups: Record<string, any[]> = { food: [], exercise: [], measurement: [], rest: [], other: [] };
    
    activities.forEach(act => {
      const type = act.activity_type || 'other';
      if (!groups[type]) groups[type] = [];
      
      // หา record ของกิจกรรมนี้ในวันที่เลือก
      const rec = records.find(r => r.activity_id === act.id && r.record_date === selectedDate);
      
      groups[type].push({
        ...act,
        isRecorded: !!rec,
        isCompleted: rec?.is_completed || false,
        notes: rec?.notes || '',
      });
    });
    return groups;
  })();

  const handleBack = () => {
    if (fromParam === 'care-pathway') router.push(`/admin/patients/${patientId}/care-pathway`);
    else router.push(`/admin/patients/${patientId}`);
  };

  // ---------- Render ----------
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
      </div>
    );
  }

  if (errorDetail || !patient) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md p-6 bg-white rounded-xl shadow">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-400" />
          <h2 className="text-lg font-bold text-gray-800 mb-2">เกิดข้อผิดพลาด</h2>
          <p className="text-sm text-red-600 mb-4">{errorDetail || 'ไม่พบข้อมูล'}</p>
          <button onClick={handleBack} className="px-4 py-2 bg-blue-500 text-white rounded-lg">กลับ</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {/* Header */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <button onClick={handleBack} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-2">
            <ArrowLeft className="w-4 h-4" /> {fromParam === 'care-pathway' ? 'กลับ Care Pathway' : 'กลับหน้าผู้ป่วย'}
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-sky-400 to-violet-500 rounded-full flex items-center justify-center">
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">ชีวิต 1 วันของฉัน</h1>
              <p className="text-xs text-gray-500">
                {patient.first_name} {patient.last_name} | PAM Level: {patient.pam_level || 'L2'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        
        {/* ===== แถบเลือก 7 วันล่าสุด ===== */}
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-600" /> ภาพรวม 7 วันล่าสุด
          </h3>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {last7Days.map(dateStr => {
              const stats = getDayStats(dateStr);
              const isSelected = selectedDate === dateStr;
              const isToday = dateStr === new Date().toISOString().split('T')[0];
              
              return (
                <button
                  key={dateStr}
                  onClick={() => setSelectedDate(dateStr)}
                  className={`shrink-0 w-20 p-3 rounded-xl border-2 text-center transition-all ${
                    isSelected 
                      ? 'border-blue-500 bg-blue-50 shadow-md' 
                      : 'border-gray-200 bg-white hover:border-blue-300'
                  }`}
                >
                  <p className={`text-xs font-bold ${isToday ? 'text-blue-600' : 'text-gray-600'}`}>
                    {isToday ? 'วันนี้' : formatThaiDate(dateStr).split(' ')[0]}
                  </p>
                  <p className="text-lg font-bold text-gray-800 mt-1">
                    {new Date(dateStr).getDate()}
                  </p>
                  <div className="mt-2">
                    {stats.total > 0 ? (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        stats.pct >= 80 ? 'bg-green-100 text-green-700' :
                        stats.pct >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {stats.done}/{stats.total}
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-400">ไม่มีข้อมูล</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ===== รายละเอียดวันที่เลือก ===== */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-800">
              รายละเอียดวันที่ {formatThaiDate(selectedDate)}
            </h2>
            <span className="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
              กิจกรรมตามระดับ PAM: {patient.pam_level || 'L2'}
            </span>
          </div>

          <div className="space-y-4">
            {(['food', 'exercise', 'measurement', 'rest'] as const).map(type => {
              const meta = CATEGORY_META[type];
              const Icon = meta.icon;
              const items = groupedActivities[type] || [];
              
              if (items.length === 0) return null; // ไม่แสดงหมวดที่ไม่มีกิจกรรมใน Level นี้

              const doneCount = items.filter(i => i.isCompleted).length;

              return (
                <div key={type} className={`rounded-xl border-2 ${meta.bg} overflow-hidden`}>
                  <div className="p-4 border-b border-gray-200/50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className={`w-5 h-5 ${meta.color}`} />
                      <h3 className={`font-bold ${meta.color}`}>{meta.label}</h3>
                    </div>
                    <span className="text-xs font-semibold text-gray-600 bg-white px-2 py-1 rounded-lg border">
                      ทำได้ {doneCount} / {items.length}
                    </span>
                  </div>
                  
                  <div className="divide-y divide-gray-200/50">
                    {items.map(item => (
                      <div key={item.id} className="p-4 flex items-start gap-3">
                        {/* สถานะ */}
                        <div className="shrink-0 mt-0.5">
                          {item.isRecorded ? (
                            item.isCompleted ? (
                              <CheckCircle2 className="w-6 h-6 text-green-500" />
                            ) : (
                              <XCircle className="w-6 h-6 text-red-400" />
                            )
                          ) : (
                            <div className="w-6 h-6 rounded-full border-2 border-gray-300" />
                          )}
                        </div>
                        
                        {/* เนื้อหา */}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${item.isCompleted ? 'text-gray-800' : 'text-gray-500 line-through'}`}>
                            {item.activity_name_th}
                          </p>
                          {item.isRecorded && item.notes && (
                            <p className="text-xs text-amber-700 mt-1 bg-amber-50 p-2 rounded border border-amber-200">
                              📝 {item.notes}
                            </p>
                          )}
                          {!item.isRecorded && (
                            <p className="text-xs text-gray-400 mt-1 italic">ผู้ป่วยยังไม่ได้บันทึก</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Empty State กรณีไม่มีกิจกรรมเลยใน Level นี้ (ไม่ควรเกิด แต่กันไว้) */}
          {Object.values(groupedActivities).flat().length === 0 && (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed">
              <AlertCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500">ไม่พบกิจกรรมที่กำหนดสำหรับระดับ PAM นี้</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}