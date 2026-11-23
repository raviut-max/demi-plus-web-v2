// app/admin/appointments/new/page.tsx
// ✅ แก้ไขล่าสุด: รองรับ Auto-fill ผู้ป่วย/ผู้ดูแล, กรองผู้ดูแลตามเครือข่าย รพ. ของผู้ป่วย, และ Smart Navigation
'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  checkSession,
  logout,
  createAppointment,
} from '@/lib/supabase/queries';
import { supabase } from '@/lib/supabase/client';
import {
  CalendarPlus, AlertCircle, Loader2, ArrowLeft, Search, LogOut,
  CheckCircle, XCircle, User, Building2
} from 'lucide-react';

// =====================================================
// 📋 Interfaces
// =====================================================
interface Hospital {
  id: string; name: string; type: 'main' | 'sub'; parent_id: string | null;
}
interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  hospital_number: string;
  hospital_id: string;
  hospitals: Hospital | null;
}
interface Coach {
  user_id: string;
  full_name_th: string;
  specialization_th?: string;
  is_active: boolean;
  users?: {
    hospital_id?: string;
    hospitals?: { id: string; name: string; type: 'main' | 'sub'; parent_id: string | null };
  };
}

// =====================================================
// 🧩 Main Content Component
// =====================================================
function NewAppointmentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ✅ 1. ดึงพารามิเตอร์จาก URL
  const urlPatientId = searchParams.get('patient_id') || '';
  const urlCoachId = searchParams.get('coach_id') || '';
  const fromParam = searchParams.get('from') || '';
  
  // ✅ 2. กำหนด URL กลับที่ถูกต้องตามที่มา
  const backUrl = fromParam === 'care-pathway-dashboard' 
    ? '/admin/care-pathway-dashboard' 
    : '/admin/appointments/view';

  // State
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  
  const [lockedPatient, setLockedPatient] = useState<Patient | null>(null);
  const [lockedCoach, setLockedCoach] = useState<Coach | null>(null);
  const [isChangingCoach, setIsChangingCoach] = useState(false);
  const [networkCoaches, setNetworkCoaches] = useState<Coach[]>([]);
  const [coachSearchTerm, setCoachSearchTerm] = useState('');

  const [formData, setFormData] = useState({
    patient_id: urlPatientId,
    staff_id: urlCoachId,
    appointment_type: 'follow_up',
    appointment_date: '',
    appointment_time: '',
    duration_minutes: 30,
    location: 'clinic',
    notes: '',
  });

  // กรองรายชื่อผู้ดูแลตามเครือข่าย
  const filteredNetworkCoaches = useMemo(() => {
    if (!coachSearchTerm.trim()) return networkCoaches;
    const term = coachSearchTerm.toLowerCase();
    return networkCoaches.filter(c =>
      c.full_name_th.toLowerCase().includes(term) ||
      (c.specialization_th && c.specialization_th.toLowerCase().includes(term))
    );
  }, [networkCoaches, coachSearchTerm]);

  // =====================================================
  // 📥 โหลดข้อมูลเริ่มต้น (Auto-fill)
  // =====================================================
  useEffect(() => {
    if (!urlPatientId) return;
    
    const loadData = async () => {
      setLoading(true);
      try {
        // 1. โหลดข้อมูลผู้ป่วย
        const { data: patientData, error: pErr } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, hospital_number, hospital_id, hospitals(id, name, type, parent_id)')
          .eq('id', urlPatientId)
          .maybeSingle();
          
        if (pErr || !patientData) {
          setError('ไม่พบข้อมูลผู้ป่วย');
          return;
        }
        setLockedPatient(patientData as Patient);

        // 2. โหลดข้อมูลผู้ดูแล (ถ้ามีใน URL)
        if (urlCoachId) {
          const { data: coachData } = await supabase
            .from('doctors')
            .select('user_id, full_name_th, specialization_th, is_active, users(hospital_id, hospitals(id, name, type, parent_id))')
            .eq('user_id', urlCoachId)
            .maybeSingle();
          if (coachData) {
            setLockedCoach(coachData as Coach);
          }
        }

        // 3. โหลดรายชื่อผู้ดูแลในเครือข่ายโรงพยาบาลของผู้ป่วย (สำหรับ Dropdown)
        if (patientData.hospital_id) {
          const { data: allHospitals } = await supabase.from('hospitals').select('id, type, parent_id');
          const h = allHospitals?.find((x: any) => x.id === patientData.hospital_id);
          let networkIds: string[] = [patientData.hospital_id];
          
          if (h) {
            if (h.type === 'main') {
              const subs = allHospitals?.filter((x: any) => x.parent_id === h.id).map((x: any) => x.id) || [];
              networkIds = [h.id, ...subs];
            } else if (h.type === 'sub' && h.parent_id) {
              networkIds = [h.id, h.parent_id];
            }
          }
          
          const { data: coachesData } = await supabase
            .from('doctors')
            .select('user_id, full_name_th, specialization_th, is_active, users(hospital_id, hospitals(id, name))')
            .in('users.hospital_id', networkIds)
            .eq('is_active', true);
            
          setNetworkCoaches((coachesData || []) as Coach[]);
        }

      } catch (err) {
        console.error(err);
        setError('เกิดข้อผิดพลาดในการโหลดข้อมูล');
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [urlPatientId, urlCoachId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.patient_id || !formData.staff_id || !formData.appointment_date || !formData.appointment_time) {
      setError('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }
    
    setLoading(true);
    setError('');
    try {
      const dateTimeStr = `${formData.appointment_date}T${formData.appointment_time}:00`;
      const result = await createAppointment({
        patient_id: formData.patient_id,
        staff_id: formData.staff_id,
        appointment_type: formData.appointment_type,
        appointment_datetime: dateTimeStr,
        duration_minutes: parseInt(formData.duration_minutes.toString()),
        location: formData.location,
        notes: formData.notes || undefined,
        status: 'scheduled'
      });
      
      if (result.success) {
        setSuccess(true);
        setTimeout(() => router.push(backUrl), 1500); // ✅ กลับไปหน้าที่มาอย่างถูกต้อง
      } else {
        setError(result.error || 'เกิดข้อผิดพลาด');
      }
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดที่ไม่คาดคิด');
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // 🎨 RENDER
  // =====================================================
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center bg-white p-8 rounded-xl shadow-lg border border-green-100">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">สร้างนัดหมายสำเร็จ!</h2>
          <p className="text-gray-600">กำลังกลับไปยังหน้าก่อนหน้านี้...</p>
        </div>
      </div>
    );
  }

  if (loading && !lockedPatient) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-2" />
          <p className="text-gray-600">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-6">
          {/* ✅ ปุ่มกลับใช้ backUrl ที่คำนวณจากพารามิเตอร์ */}
          <button onClick={() => router.push(backUrl)} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4">
            <ArrowLeft className="w-4 h-4" /> กลับ
          </button>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
                <span className="bg-red-100 text-red-600 p-2 rounded-lg"><CalendarPlus className="w-6 h-6" /></span>
                สร้างนัดหมายใหม่
              </h1>
              <p className="text-gray-600 mt-1">กำหนดนัดหมายผู้ป่วยกับแพทย์หรือเจ้าหน้าที่</p>
            </div>
            <button onClick={() => { logout(); router.push('/admin/login'); }} className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">
              <LogOut className="w-4 h-4 inline mr-2" /> ออกจากระบบ
            </button>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <p className="text-red-700">{error}</p>
            <button type="button" onClick={() => setError('')} className="ml-auto text-red-600"><XCircle className="w-5 h-5" /></button>
          </div>
        )}

        {/* SECTION 1: ข้อมูลผู้ป่วย (Auto-filled) */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-sm font-bold">1</span>
            ข้อมูลผู้ป่วย
          </h2>
          {lockedPatient ? (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <User className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="font-bold text-gray-800 text-lg">{lockedPatient.first_name} {lockedPatient.last_name}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 mt-1">
                  <span>HN: {lockedPatient.hospital_number}</span>
                  <span className="flex items-center gap-1">
                    <Building2 className="w-4 h-4" />
                    {lockedPatient.hospitals?.name || 'ไม่ระบุโรงพยาบาล'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-gray-500">ไม่พบข้อมูลผู้ป่วย</p>
          )}
        </div>

        {/* SECTION 2: เลือกผู้ดูแล (Auto-filled + Network Filter) */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 text-sm font-bold">2</span>
            เลือกผู้ดูแล <span className="text-red-500">*</span>
          </h2>
          
          {!isChangingCoach && lockedCoach ? (
            /* ✅ โหมดแสดงข้อมูลผู้ดูแลที่ล็อกไว้ */
            <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <User className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">ผู้ดูแลปัจจุบัน</p>
                  <p className="font-bold text-gray-800 text-lg">
                    {lockedCoach.full_name_th} 
                    {lockedCoach.specialization_th && <span className="text-sm font-normal text-gray-600"> ({lockedCoach.specialization_th})</span>}
                  </p>
                  <p className="text-sm text-gray-600 flex items-center gap-1">
                    <Building2 className="w-4 h-4" />
                    {(lockedCoach as any).users?.hospitals?.name || 'ไม่ระบุโรงพยาบาล'}
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setIsChangingCoach(true)}
                className="px-4 py-2 text-sm bg-white border border-green-300 text-green-700 rounded-lg hover:bg-green-100 transition-colors font-medium"
              >
                เปลี่ยนผู้ดูแล
              </button>
            </div>
          ) : (
            /* ✅ โหมดค้นหาและเลือกผู้ดูแลใหม่ (กรองตามเครือข่าย รพ. ผู้ป่วย) */
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="ค้นหาชื่อหรือความเชี่ยวชาญ..."
                value={coachSearchTerm}
                onChange={(e) => setCoachSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                autoFocus
              />
              {(coachSearchTerm.length > 0 || !lockedCoach) && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                  {filteredNetworkCoaches.length > 0 ? (
                    filteredNetworkCoaches.map((c) => (
                      <div
                        key={c.user_id}
                        onClick={() => {
                          setLockedCoach(c);
                          setFormData(prev => ({ ...prev, staff_id: c.user_id }));
                          setIsChangingCoach(false);
                          setCoachSearchTerm('');
                        }}
                        className="px-4 py-3 hover:bg-purple-50 cursor-pointer border-b border-gray-100 last:border-0 transition-colors"
                      >
                        <div className="font-medium text-gray-800">{c.full_name_th}</div>
                        <div className="text-xs text-gray-500 flex justify-between mt-1">
                          <span>{c.specialization_th || 'ไม่ระบุความเชี่ยวชาญ'}</span>
                          <span>{(c as any).users?.hospitals?.name || 'ไม่ระบุรพ.'}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center text-gray-500">ไม่พบข้อมูลที่ค้นหาในเครือข่ายโรงพยาบาลนี้</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* SECTION 3: รายละเอียดนัดหมาย */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 text-sm font-bold">3</span>
            รายละเอียดนัดหมาย
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ประเภทนัดหมาย *</label>
              <select name="appointment_type" value={formData.appointment_type} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none">
                <option value="follow_up">ติดตามผล</option>
                <option value="consultation">ปรึกษาแพทย์</option>
                <option value="checkup">ตรวจสุขภาพ</option>
                <option value="lab">เจาะเลือด/แลป</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">สถานที่</label>
              <select name="location" value={formData.location} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none">
                <option value="clinic">คลินิก</option>
                <option value="ward">หอผู้ป่วย</option>
                <option value="online">ออนไลน์ (Telemed)</option>
                <option value="home_visit">เยี่ยมบ้าน</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วันที่และเวลา *</label>
              <div className="flex gap-2">
                <input type="date" name="appointment_date" value={formData.appointment_date} onChange={handleChange} min={new Date().toISOString().split('T')[0]} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" />
                <input type="time" name="appointment_time" value={formData.appointment_time} onChange={handleChange} className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ระยะเวลา (นาที)</label>
              <select name="duration_minutes" value={formData.duration_minutes} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none">
                <option value="15">15 นาที</option>
                <option value="30">30 นาที</option>
                <option value="45">45 นาที</option>
                <option value="60">1 ชั่วโมง</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
            <textarea name="notes" value={formData.notes} onChange={handleChange} rows={3} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none resize-none" />
          </div>
        </div>

        {/* Submit Buttons */}
        <div className="flex gap-4 pt-4 pb-8">
          <button type="submit" disabled={loading} className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold py-4 rounded-xl hover:from-blue-700 hover:to-cyan-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg">
            {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> กำลังบันทึก...</> : <><CheckCircle className="w-5 h-5" /> ยืนยันการสร้างนัดหมาย</>}
          </button>
          {/* ✅ ปุ่มยกเลิกใช้ backUrl ที่คำนวณจากพารามิเตอร์ */}
          <button type="button" onClick={() => router.push(backUrl)} className="px-8 py-4 bg-gray-500 text-white font-bold rounded-xl hover:bg-gray-600 transition-all">ยกเลิก</button>
        </div>
      </form>
    </div>
  );
}

// =====================================================
// 🎁 Default Export with Suspense
// =====================================================
export default function NewAppointmentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    }>
      <NewAppointmentContent />
    </Suspense>
  );
}