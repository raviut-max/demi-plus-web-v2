// app/admin/appointments/new/page.tsx
// ✅ แก้ไขล่าสุด: 23 พฤศจิกายน 2569
// ✅ การแก้ไข:
//    1. Auto-select ผู้ป่วย + โค้ชจาก URL (query ตรงจาก DB)
//    2. Dropdown "เปลี่ยนผู้ดูแล" แสดงเฉพาะโค้ชในเครือข่าย รพ. ผู้ป่วย (แม่ข่าย+ลูกข่าย)
//    3. ปุ่มกลับ/ยกเลิก → กลับหน้าที่ถูกต้องตาม ?from=
//    4. แสดงชื่อ รพ. ของโค้ชใน dropdown
'use client';
import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { checkSession, logout, createAppointment } from '@/lib/supabase/queries';
import { supabase } from '@/lib/supabase/client';
import {
  CalendarPlus, AlertCircle, Loader2, ArrowLeft, User, Stethoscope, LogOut,
  CheckCircle, XCircle, Search, Users, Clock, FileText, Hospital, IdCard, RefreshCw
} from 'lucide-react';

interface Coach {
  user_id: string;
  full_name_th: string;
  specialization_th?: string;
  hospital_id?: string;
  hospital_name?: string;
  hospital_type?: string;
}

interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  hospital_number: string;
  id_card?: string;
  phone?: string;
  hospital_id?: string;
  hospital_name?: string;
}

function NewAppointmentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const fromParam = searchParams.get('from') || '';
  const urlPatientId = searchParams.get('patient_id') || '';
  const urlCoachId = searchParams.get('coach_id') || '';

  // ✅ คำนวณ backUrl จาก ?from=
  const backUrl = useMemo(() => {
    switch (fromParam) {
      case 'care-pathway-dashboard':
        return '/admin/care-pathway-dashboard';
      case 'appointments-view':
        return '/admin/appointments/view';
      case 'patient-detail':
        return urlPatientId ? `/admin/patients/${urlPatientId}` : '/admin/patients';
      default:
        return sessionStorage.getItem('appointments_new_from') || '/admin/appointments/view';
    }
  }, [fromParam, urlPatientId]);

  // บันทึก backUrl ลง sessionStorage (กรณี refresh)
  useEffect(() => {
    if (fromParam) {
      sessionStorage.setItem('appointments_new_from', backUrl);
    }
  }, [fromParam, backUrl]);

  const staffDropdownRef = useRef<HTMLDivElement>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // State สำหรับผู้ป่วย/โค้ชที่ล็อกไว้
  const [lockedPatient, setLockedPatient] = useState<Patient | null>(null);
  const [lockedCoach, setLockedCoach] = useState<Coach | null>(null);
  const [isChangingCoach, setIsChangingCoach] = useState(false);
  const [networkCoaches, setNetworkCoaches] = useState<Coach[]>([]);
  const [networkScopeLabel, setNetworkScopeLabel] = useState('');

  // Search
  const [staffSearchTerm, setStaffSearchTerm] = useState('');
  const [isStaffDropdownOpen, setIsStaffDropdownOpen] = useState(false);

  // Form
  const [formData, setFormData] = useState({
    patient_id: '',
    staff_id: '',
    appointment_type: 'follow_up',
    appointment_date: '',
    appointment_time: '',
    duration_minutes: 30,
    location: 'clinic',
    notes: '',
  });

  // =====================================================
  // 📥 AUTH + AUTO-SELECT
  // =====================================================
  useEffect(() => {
    const userData = checkSession();
    if (!userData) { router.push('/admin/login'); return; }
    if (!['admin', 'doctor', 'helper', 'osm'].includes(userData.role)) {
      alert('ไม่มีสิทธิ์เข้าถึง');
      router.push('/admin/login');
      return;
    }
    setUser(userData);
    autoSelectFromUrl();
  }, [router]);

  const autoSelectFromUrl = async () => {
    if (!urlPatientId) {
      setError('ไม่พบ patient_id ใน URL — กรุณาเข้าจากหน้า Dashboard');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // 1. โหลดข้อมูลผู้ป่วยตรงๆ จาก DB
      const { data: patientData, error: pErr } = await supabase
        .from('profiles')
        .select(`
          id,
          first_name,
          last_name,
          hospital_number,
          id_card,
          phone,
          hospital_id,
          hospitals(id, name, type, parent_id)
        `)
        .eq('id', urlPatientId)
        .maybeSingle();

      if (pErr || !patientData) {
        setError(`ไม่พบข้อมูลผู้ป่วย (id: ${urlPatientId})`);
        setLoading(false);
        return;
      }

      const patientHospital = patientData.hospitals as any;
      const patient: Patient = {
        id: patientData.id,
        first_name: patientData.first_name,
        last_name: patientData.last_name,
        hospital_number: patientData.hospital_number,
        id_card: patientData.id_card,
        phone: patientData.phone,
        hospital_id: patientData.hospital_id,
        hospital_name: patientHospital?.name,
      };
      setLockedPatient(patient);
      setFormData(prev => ({ ...prev, patient_id: patient.id }));

      // 2. คำนวณเครือข่าย รพ. ของผู้ป่วย (แม่ข่าย + ลูกข่าย)
      let networkIds: string[] = [patientData.hospital_id];
      let scopeLabel = patientHospital?.name || '';

      if (patientHospital) {
        if (patientHospital.type === 'main') {
          // แม่ข่าย → รวมลูกข่ายทั้งหมด
          const { data: subs } = await supabase
            .from('hospitals')
            .select('id, name')
            .eq('parent_id', patientHospital.id);
          if (subs && subs.length > 0) {
            networkIds = [patientHospital.id, ...subs.map(s => s.id)];
            scopeLabel = `${patientHospital.name} (แม่ข่าย) + ${subs.length} ลูกข่าย`;
          } else {
            scopeLabel = `${patientHospital.name} (แม่ข่าย)`;
          }
        } else if (patientHospital.type === 'sub' && patientHospital.parent_id) {
          // ลูกข่าย → รวมแม่ข่าย
          const { data: mainHosp } = await supabase
            .from('hospitals')
            .select('name')
            .eq('id', patientHospital.parent_id)
            .maybeSingle();
          networkIds = [patientHospital.id, patientHospital.parent_id];
          scopeLabel = `${patientHospital.name} + แม่ข่าย ${mainHosp?.name || ''}`;
        }
      }

      setNetworkScopeLabel(scopeLabel);

      // 3. โหลดโค้ชในเครือข่าย รพ. ผู้ป่วย
      const { data: coachesData, error: cErr } = await supabase
        .from('doctors')
        .select(`
          user_id,
          full_name_th,
          specialization_th,
          is_active,
          users!inner(hospital_id, hospitals(id, name, type))
        `)
        .eq('is_active', true)
        .in('users.hospital_id', networkIds);

      if (cErr) {
        console.error('❌ Error loading coaches:', cErr);
      } else {
        const coaches: Coach[] = (coachesData || []).map((c: any) => ({
          user_id: c.user_id,
          full_name_th: c.full_name_th,
          specialization_th: c.specialization_th,
          hospital_id: c.users?.hospital_id,
          hospital_name: c.users?.hospitals?.name,
          hospital_type: c.users?.hospitals?.type,
        }));
        setNetworkCoaches(coaches);

        // 4. Auto-select โค้ช ถ้ามี coach_id
        const targetCoachId = urlCoachId || '';
        if (targetCoachId) {
          const found = coaches.find(c => c.user_id === targetCoachId);
          if (found) {
            setLockedCoach(found);
            setFormData(prev => ({ ...prev, staff_id: found.user_id }));
            console.log('✅ [autoSelect] โค้ช:', found.full_name_th);
          } else {
            // Fallback: query โค้ชตรงๆ (อาจอยู่นอกเครือข่าย)
            const { data: directCoach } = await supabase
              .from('doctors')
              .select(`
                user_id,
                full_name_th,
                specialization_th,
                users(hospital_id, hospitals(name, type))
              `)
              .eq('user_id', targetCoachId)
              .maybeSingle();

            if (directCoach) {
              const c: Coach = {
                user_id: directCoach.user_id,
                full_name_th: directCoach.full_name_th,
                specialization_th: directCoach.specialization_th,
                hospital_id: directCoach.users?.hospital_id,
                hospital_name: directCoach.users?.hospitals?.name,
                hospital_type: directCoach.users?.hospitals?.type,
              };
              setLockedCoach(c);
              setFormData(prev => ({ ...prev, staff_id: c.user_id }));
              setNetworkCoaches(prev => [...prev, c]); // เพิ่มเข้า list
              console.log('✅ [autoSelect] โค้ช (fallback):', c.full_name_th);
            }
          }
        }
      }
    } catch (err: any) {
      console.error('❌ autoSelectFromUrl error:', err);
      setError(err.message || 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  // Click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (staffDropdownRef.current && !staffDropdownRef.current.contains(event.target as Node)) {
        setIsStaffDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // =====================================================
  // ⚙️ HANDLERS
  // =====================================================
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (validationErrors[name]) setValidationErrors(prev => ({ ...prev, [name]: '' }));
  };

  const filteredCoaches = useMemo(() => {
    if (!staffSearchTerm.trim()) return networkCoaches.slice(0, 50);
    const term = staffSearchTerm.toLowerCase();
    return networkCoaches
      .filter(c =>
        c.full_name_th.toLowerCase().includes(term) ||
        (c.specialization_th && c.specialization_th.toLowerCase().includes(term)) ||
        (c.hospital_name && c.hospital_name.toLowerCase().includes(term))
      )
      .slice(0, 50);
  }, [networkCoaches, staffSearchTerm]);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formData.patient_id) errors.patient_id = 'กรุณาเลือกผู้ป่วย';
    if (!formData.staff_id) errors.staff_id = 'กรุณาเลือกแพทย์/เจ้าหน้าที่';
    if (!formData.appointment_date) errors.appointment_date = 'กรุณาเลือกวันที่';
    if (!formData.appointment_time) errors.appointment_time = 'กรุณาเลือกเวลา';
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
      setError(Object.values(errors)[0]);
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validateForm()) return;
    setSubmitting(true);
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
        created_by: user?.id,
        status: 'scheduled',
      });
      if (result.success) {
        setSuccess(true);
        sessionStorage.removeItem('appointments_new_from');
        setTimeout(() => router.push(backUrl), 800);
      } else {
        setError(result.error || 'เกิดข้อผิดพลาด');
      }
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดที่ไม่คาดคิด');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnlockCoach = () => {
    setLockedCoach(null);
    setIsChangingCoach(true);
    setStaffSearchTerm('');
    setFormData(prev => ({ ...prev, staff_id: '' }));
    setIsStaffDropdownOpen(true);
  };

  const handleSelectCoach = (coach: Coach) => {
    setLockedCoach(coach);
    setIsChangingCoach(false);
    setFormData(prev => ({ ...prev, staff_id: coach.user_id }));
    setStaffSearchTerm(`${coach.full_name_th}${coach.specialization_th ? ` (${coach.specialization_th})` : ''}`);
    setIsStaffDropdownOpen(false);
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">กำลังโหลดข้อมูลผู้ป่วยและโค้ช...</p>
        </div>
      </div>
    );
  }

  if (!user || !lockedPatient) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center bg-white p-8 rounded-xl shadow-lg border border-red-100 max-w-md">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">ไม่พบข้อมูล</h2>
          <p className="text-gray-600 mb-4">{error || 'ไม่พบข้อมูลผู้ป่วย กรุณาเข้าจากลิงก์ที่ถูกต้อง'}</p>
          <button onClick={() => router.push(backUrl)} className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
            กลับ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-6">
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

      <form onSubmit={handleSubmit} className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <p className="text-red-700">{error}</p>
            <button type="button" onClick={() => setError('')} className="ml-auto text-red-600">
              <XCircle className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* SECTION 1: ผู้ป่วย (ล็อกอัตโนมัติ) */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-sm font-bold">1</span>
            ผู้ป่วย <span className="text-red-500">*</span>
            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">เลือกอัตโนมัติจากลิงก์ ✓</span>
          </h2>
          <div className="border-2 border-green-300 bg-green-50/60 rounded-xl p-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                <Users className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-xs font-semibold text-green-600 mb-1 flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> ผู้ป่วยที่ต้องการนัดหมาย
                </p>
                <p className="text-lg font-bold text-gray-800">
                  {lockedPatient.first_name} {lockedPatient.last_name}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                  <span className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-green-200 font-mono">
                    HN: {lockedPatient.hospital_number}
                  </span>
                  {lockedPatient.id_card && (
                    <span className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-green-200">
                      <IdCard className="w-3 h-3 text-gray-400" /> บัตร: {lockedPatient.id_card}
                    </span>
                  )}
                  {lockedPatient.hospital_name && (
                    <span className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-green-200">
                      <Hospital className="w-3 h-3 text-gray-400" /> รพ.: {lockedPatient.hospital_name}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: แพทย์/เจ้าหน้าที่ */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 flex-wrap">
            <span className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 text-sm font-bold">2</span>
            แพทย์/เจ้าหน้าที่ <span className="text-red-500">*</span>
            {lockedCoach && !isChangingCoach && (
              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">เลือกอัตโนมัติ ✓</span>
            )}
          </h2>

          {lockedCoach && !isChangingCoach ? (
            /* การ์ดโค้ชล็อก */
            <div className="border-2 border-green-300 bg-green-50/60 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                    <Stethoscope className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-green-600 mb-1 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> ผู้ดูแลของนัดหมายนี้
                    </p>
                    <p className="text-lg font-bold text-gray-800">{lockedCoach.full_name_th}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                      {lockedCoach.specialization_th && (
                        <span className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-green-200">
                          <User className="w-3 h-3 text-gray-400" /> {lockedCoach.specialization_th}
                        </span>
                      )}
                      {lockedCoach.hospital_name && (
                        <span className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-green-200">
                          <Hospital className="w-3 h-3 text-gray-400" />
                          สังกัด: {lockedCoach.hospital_name}
                          {lockedCoach.hospital_type === 'main' && ' (แม่ข่าย)'}
                          {lockedCoach.hospital_type === 'sub' && ' (ลูกข่าย)'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleUnlockCoach}
                  className="px-3 py-1.5 text-xs border border-green-300 bg-white text-green-700 rounded-lg hover:bg-green-100 transition-colors flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> เปลี่ยนผู้ดูแล
                </button>
              </div>
            </div>
          ) : (
            /* Dropdown เลือกโค้ช */
            <div ref={staffDropdownRef} className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="พิมพ์ชื่อ, ความเชี่ยวชาญ หรือชื่อ รพ. เพื่อค้นหา..."
                  value={staffSearchTerm}
                  onChange={(e) => {
                    setStaffSearchTerm(e.target.value);
                    setIsStaffDropdownOpen(true);
                  }}
                  onFocus={() => setIsStaffDropdownOpen(true)}
                  autoFocus
                  className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none ${
                    validationErrors.staff_id ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
              </div>
              {isStaffDropdownOpen && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-80 overflow-y-auto">
                  <div className="px-4 py-2 bg-purple-50 border-b border-purple-100 text-xs text-purple-700 font-medium sticky top-0">
                    <Hospital className="w-3 h-3 inline mr-1" />
                    แสดงเฉพาะบุคลากรในเครือข่าย: <strong>{networkScopeLabel}</strong> ({networkCoaches.length} คน)
                  </div>
                  {filteredCoaches.length > 0 ? (
                    filteredCoaches.map((c) => (
                      <div
                        key={c.user_id}
                        onClick={() => handleSelectCoach(c)}
                        className="px-4 py-3 hover:bg-purple-50 cursor-pointer border-b border-gray-100 last:border-0 transition-colors"
                      >
                        <div className="font-medium text-gray-800">{c.full_name_th}</div>
                        <div className="text-xs text-gray-500 mt-1 flex justify-between flex-wrap gap-2">
                          <span>{c.specialization_th || 'ไม่ระบุความเชี่ยวชาญ'}</span>
                          <span className="bg-gray-100 px-2 py-0.5 rounded flex items-center gap-1">
                            <Hospital className="w-3 h-3" />
                            {c.hospital_name || 'ไม่ระบุ รพ.'}
                            {c.hospital_type === 'main' && ' (แม่ข่าย)'}
                            {c.hospital_type === 'sub' && ' (ลูกข่าย)'}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center text-gray-500">
                      {staffSearchTerm ? 'ไม่พบข้อมูลที่ค้นหา' : `ไม่พบบุคลากรในเครือข่าย ${networkScopeLabel}`}
                    </div>
                  )}
                </div>
              )}
              {validationErrors.staff_id && <p className="text-xs text-red-600 mt-1">💡 {validationErrors.staff_id}</p>}
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
              <label className="block text-sm font-medium text-gray-700 mb-1"><Clock className="w-3 h-3 inline mr-1" /> ระยะเวลา (นาที)</label>
              <select name="duration_minutes" value={formData.duration_minutes} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none">
                <option value="15">15 นาที</option>
                <option value="30">30 นาที</option>
                <option value="45">45 นาที</option>
                <option value="60">1 ชั่วโมง</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1"><FileText className="w-3 h-3 inline mr-1" /> หมายเหตุ</label>
            <textarea name="notes" value={formData.notes} onChange={handleChange} rows={3} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none resize-none" />
          </div>
        </div>

        {/* Submit Buttons */}
        <div className="flex gap-4 pt-4 pb-8">
          <button type="submit" disabled={submitting} className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold py-4 rounded-xl hover:from-blue-700 hover:to-cyan-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg">
            {submitting ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> กำลังบันทึก...</>
            ) : (
              <><CheckCircle className="w-5 h-5" /> ยืนยันการสร้างนัดหมาย</>
            )}
          </button>
          <button type="button" onClick={() => router.push(backUrl)} className="px-8 py-4 bg-gray-500 text-white font-bold rounded-xl hover:bg-gray-600 transition-all">
            ยกเลิก
          </button>
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