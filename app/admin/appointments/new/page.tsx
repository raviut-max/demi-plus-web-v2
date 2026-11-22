// app/admin/appointments/new/page.tsx
// ✅ v-final 23 Nov 2026: query ตรง + paginate (แก้ปัญหา 1000 แถว / ชื่อไม่ขึ้น / mapping เพี้ยน)
'use client';
import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { checkSession, logout, createAppointment, getUserHospitalInfo, getAccessibleHospitalIds, isSuperAdmin } from '@/lib/supabase/queries';
import { supabase } from '@/lib/supabase/client';
import {
  CalendarPlus, AlertCircle, Loader2, ArrowLeft, User, Stethoscope, LogOut,
  CheckCircle, XCircle, Search, Users, Clock, FileText, Hospital, IdCard,
} from 'lucide-react';

interface Hospital { id: string; name: string; code: string; type: 'main' | 'sub'; parent_id: string | null; }
interface UserHospital extends Hospital { parent_hospital?: { id: string; name: string; code: string } | null; }
interface Coach { id: string; user_id: string; full_name_th: string; specialization_th?: string; is_active: boolean; hospital_id?: string; hospital_name?: string; }
interface Patient { id: string; first_name: string; last_name: string; hospital_number: string; id_card?: string | null; phone?: string | null; hospital_id?: string | null; hospital_name?: string | null; }

const PAGE_CHUNK = 1000; // chunk เพื่อบายพาส default limit ของ supabase-js

// ✅ helper: ดึงครบทุกแถวแบบ loop ด้วย range (กัน max-rows 1000 ที่ server config)
async function fetchAllPaginated<T>(buildQuery: (from: number, to: number) => Promise<any>, pageSize = PAGE_CHUNK): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  for (let i = 0; i < 200; i++) { // safety
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data || [];
    out.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

function NewAppointmentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromParam = searchParams.get('from');
  const backUrl = fromParam === 'care-pathway-dashboard' ? '/admin/care-pathway-dashboard' : '/admin/appointments/view';
  const urlPatientId = searchParams.get('patient_id') || '';

  const patientDropdownRef = useRef<HTMLDivElement>(null);
  const staffDropdownRef = useRef<HTMLDivElement>(null);

  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<UserHospital | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const [patientSearchTerm, setPatientSearchTerm] = useState('');
  const [isPatientDropdownOpen, setIsPatientDropdownOpen] = useState(false);
  const [staffSearchTerm, setStaffSearchTerm] = useState('');
  const [isStaffDropdownOpen, setIsStaffDropdownOpen] = useState(false);

  const [lockedPatient, setLockedPatient] = useState<Patient | null>(null);
  const [lockedCoach, setLockedCoach] = useState<Coach | null>(null);
  const [coachMissingWarning, setCoachMissingWarning] = useState(false);

  const [patientHospitalId, setPatientHospitalId] = useState<string | null>(null);
  const [patientHospitalName, setPatientHospitalName] = useState<string | null>(null);
  const [parentHospitalName, setParentHospitalName] = useState<string | null>(null);
  const [hospitalCoaches, setHospitalCoaches] = useState<Coach[]>([]);

  const dataLoadedRef = useRef(false);
  const autoAppliedRef = useRef(false);
  const coachesRef = useRef<Coach[]>([]);
  const hospitalCoachesRef = useRef<Coach[]>([]);
  useEffect(() => { coachesRef.current = coaches; }, [coaches]);
  useEffect(() => { hospitalCoachesRef.current = hospitalCoaches; }, [hospitalCoaches]);

  const [formData, setFormData] = useState({
    patient_id: '', staff_id: '', appointment_type: 'follow_up',
    appointment_date: '', appointment_time: '', duration_minutes: 30,
    location: 'clinic', notes: '',
  });

  // =====================================================
  // 📥 AUTH
  // =====================================================
  useEffect(() => {
    const userData = checkSession();
    if (!userData) { router.push('/admin/login'); return; }
    if (!['admin', 'doctor', 'helper', 'osm'].includes(userData.role)) {
      alert('ไม่มีสิทธิ์เข้าถึง'); router.push('/admin/login'); return;
    }
    setUser(userData);
    (async () => {
      try {
        const uh = await getUserHospitalInfo(userData.id);
        setUserHospital(uh);
        const netIds = await getAccessibleHospitalIds(userData.id);
        await loadNetworkData(netIds);
      } catch (e) { console.error(e); }
    })();
  }, [router]);

  // click outside
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (patientDropdownRef.current && !patientDropdownRef.current.contains(e.target as Node)) setIsPatientDropdownOpen(false);
      if (staffDropdownRef.current && !staffDropdownRef.current.contains(e.target as Node)) setIsStaffDropdownOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // =====================================================
  // 🏥 โหลดรายชื่อ รพ. (network = ที่เข้าถึงได้)
  // =====================================================
  async function loadNetworkData(netIds: string[]) {
    setLoading(true);
    try {
      if (!netIds || netIds.length === 0) {
        setError('ไม่พบโรงพยาบาลที่เข้าถึงได้ — กรุณาตรวจสอบการตั้งค่าผู้ใช้');
        return;
      }
      // hospitals: chunk-safe
      const hs = await fetchAllPaginated<{ id: string; name: string; code: string; type: string; parent_id: string | null }>(
        (from, to) => supabase.from('hospitals').select('id, name, code, type, parent_id')
          .eq('is_active', true).in('id', netIds).order('name').range(from, to)
      );
      const hList: Hospital[] = hs.map(h => ({ id: h.id, name: h.name, code: h.code || '-', type: (h.type === 'main' ? 'main' : 'sub'), parent_id: h.parent_id || null }));
      setHospitals(hList);
      const hMap = Object.fromEntries(hList.map(h => [h.id, h.name]));

      // patients: ดึง profiles ตรง + map hospital_name จาก hMap
      const ps = await fetchAllPaginated<any>(
        (from, to) => supabase.from('profiles')
          .select('id, first_name, last_name, hospital_number, id_card, phone, hospital_id, coach_id')
          .eq('is_active', true).in('hospital_id', netIds)
          .order('hospital_number', { ascending: true }).range(from, to)
      );
      const pList: Patient[] = ps.map(p => ({
        id: p.id,
        first_name: p.first_name || '',
        last_name: p.last_name || '',
        hospital_number: p.hospital_number || '-',
        id_card: p.id_card || null,
        phone: p.phone || null,
        hospital_id: p.hospital_id || null,
        hospital_name: hMap[p.hospital_id] || 'ไม่ระบุ',
      }));
      setPatients(pList);

      // coaches: doctors join users(inner) ด้วย hospital_id ∈ netIds
      const cs = await fetchAllPaginated<any>(
        (from, to) => supabase.from('doctors')
          .select('id, user_id, full_name_th, specialization_th, is_active, users!inner(hospital_id)')
          .eq('is_active', true).in('users.hospital_id', netIds)
          .order('full_name_th', { ascending: true }).range(from, to)
      );
      const cList: Coach[] = cs.map(c => ({
        id: c.id,
        user_id: c.user_id,
        full_name_th: c.full_name_th || `(ไม่พบชื่อ ${c.user_id?.slice(0, 8)})`,
        specialization_th: c.specialization_th || 'ไม่ระบุความเชี่ยวชาญ',
        is_active: !!c.is_active,
        hospital_id: c.users?.hospital_id,
        hospital_name: hMap[c.users?.hospital_id] || 'ไม่ระบุ',
      }));
      setCoaches(cList);

      console.log('✅ [loadNetworkData]', { hospitals: hList.length, patients: pList.length, coaches: cList.length });
    } catch (err: any) {
      console.error('❌ loadNetworkData', err);
      setError(err?.message || 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      dataLoadedRef.current = true;
      setLoading(false);
    }
  }

  // =====================================================
  // 🔄 ขอบเขตโค้ชตาม รพ.ผู้ป่วย + แม่ข่าย
  // =====================================================
  const loadHospitalCoaches = useCallback(async (scopeIds: string[]) => {
    if (!scopeIds?.length) { setHospitalCoaches([]); return; }
    try {
      const rows = await fetchAllPaginated<any>(
        (from, to) => supabase.from('doctors')
          .select('id, user_id, full_name_th, specialization_th, is_active, users!inner(hospital_id)')
          .eq('is_active', true).in('users.hospital_id', scopeIds)
          .order('full_name_th', { ascending: true }).range(from, to)
      );
      const hMap = Object.fromEntries(hospitals.map(h => [h.id, h.name]));
      setHospitalCoaches(rows.map((c: any) => ({
        id: c.id,
        user_id: c.user_id,
        full_name_th: c.full_name_th || '-',
        specialization_th: c.specialization_th || '',
        is_active: !!c.is_active,
        hospital_id: c.users?.hospital_id,
        hospital_name: hMap[c.users?.hospital_id] || '',
      })) as Coach[]);
    } catch (e) { console.error('❌ loadHospitalCoaches', e); }
  }, [hospitals]);

  const applyPatientScope = useCallback(async (p: Patient) => {
    const hId = p.hospital_id ?? null;
    setPatientHospitalId(hId);
    if (!hId) { setPatientHospitalName(null); setParentHospitalName(null); setHospitalCoaches([]); return; }
    const rec = hospitals.find(x => x.id === hId);
    setPatientHospitalName(rec?.name || null);
    const scopeIds = [hId];
    if (rec?.type === 'sub' && rec.parent_id) {
      scopeIds.unshift(rec.parent_id);
      const par = hospitals.find(x => x.id === rec.parent_id);
      setParentHospitalName(par?.name || null);
    } else setParentHospitalName(null);
    await loadHospitalCoaches(scopeIds);
  }, [hospitals, loadHospitalCoaches]);

  // =====================================================
  // 🧠 AUTO-FILL โค้ชจาก profiles.coach_id
  // =====================================================
  const autoFillCoachForPatient = useCallback(async (patientId: string) => {
    try {
      const { data } = await supabase.from('profiles').select('coach_id').eq('id', patientId).maybeSingle();
      const coachId = data?.coach_id;
      if (!coachId) {
        setLockedCoach(null); setCoachMissingWarning(true);
        setFormData(prev => ({ ...prev, staff_id: '' }));
        return;
      }
      // ถ้าไม่เจอใน list → query ตรง (กัน limit/RLS list ตัดตก)
      let found = [...hospitalCoachesRef.current, ...coachesRef.current].find(c => c.user_id === coachId) || null;
      if (!found) {
        const { data: doc } = await supabase.from('doctors')
          .select('id, user_id, full_name_th, specialization_th, is_active, users!inner(hospital_id)')
          .eq('user_id', coachId).maybeSingle();
        if (doc) {
          const hMap = Object.fromEntries(hospitals.map(h => [h.id, h.name]));
          found = {
            id: doc.id, user_id: doc.user_id,
            full_name_th: doc.full_name_th || '-',
            specialization_th: doc.specialization_th || '',
            is_active: !!doc.is_active,
            hospital_id: doc.users?.hospital_id,
            hospital_name: hMap[doc.users?.hospital_id] || '',
          };
        }
      }
      if (found) {
        setCoachMissingWarning(false);
        setFormData(prev => ({ ...prev, staff_id: found!.user_id }));
        setStaffSearchTerm(`${found.full_name_th}${found.specialization_th ? ` (${found.specialization_th})` : ''}`);
        setLockedCoach(found);
      } else {
        setLockedCoach(null); setCoachMissingWarning(true);
        console.warn('⚠️ ไม่พบโค้ช coach_id=', coachId, 'ใน doctors');
      }
    } catch (e) { console.error('❌ autoFillCoach', e); }
  }, [hospitals]);

  // =====================================================
  // 🎯 AUTO-SELECT ผู้ป่วยจาก URL
  // =====================================================
  const applyAutoPatient = (p: Patient) => {
    autoAppliedRef.current = true;
    setFormData(prev => ({ ...prev, patient_id: p.id }));
    setPatientSearchTerm(`${p.first_name} ${p.last_name} (${p.hospital_number})`);
    setLockedPatient(p);
    (async () => { await applyPatientScope(p); await autoFillCoachForPatient(p.id); })();
  };

  useEffect(() => {
    if (!urlPatientId || !dataLoadedRef.current || autoAppliedRef.current) return;
    const found = patients.find(p => p.id === urlPatientId);
    if (found) { applyAutoPatient(found); return; }
    (async () => {
      const { data } = await supabase.from('profiles')
        .select('id, first_name, last_name, hospital_number, id_card, phone, hospital_id')
        .eq('id', urlPatientId).maybeSingle();
      if (data) {
        const hMap = Object.fromEntries(hospitals.map(h => [h.id, h.name]));
        applyAutoPatient({ ...data, hospital_name: hMap[data.hospital_id] || 'ไม่ระบุ' } as Patient);
      } else setError('ไม่พบผู้ป่วย id ที่แนบมาในลิงก์');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlPatientId, patients]);

  // =====================================================
  // ⚙️ HANDLERS
  // =====================================================
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (validationErrors[name]) setValidationErrors(prev => ({ ...prev, [name]: '' }));
  };

  const filteredPatients = useMemo(() => {
    if (!patientSearchTerm.trim()) return patients.slice(0, 50);
    const t = patientSearchTerm.toLowerCase();
    return patients.filter(p =>
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(t) ||
      p.hospital_number.toLowerCase().includes(t) ||
      (p.id_card || '').includes(t)
    ).slice(0, 50);
  }, [patients, patientSearchTerm]);

  // ✅ dropdown โค้ชใช้ pool ของ รพ.ผู้ป่วย (ถ้ายังไม่รู้ → ใช้ทั้ง network)
  const coachPool = useMemo(
    () => (patientHospitalId ? (hospitalCoaches.length ? hospitalCoaches : coaches) : coaches),
    [patientHospitalId, hospitalCoaches, coaches]
  );

  const filteredStaff = useMemo(() => {
    if (!staffSearchTerm.trim()) return coachPool.slice(0, 50);
    const t = staffSearchTerm.toLowerCase();
    return coachPool.filter(c =>
      c.full_name_th.toLowerCase().includes(t) ||
      (c.specialization_th || '').toLowerCase().includes(t)
    ).slice(0, 50);
  }, [coachPool, staffSearchTerm]);

  const validateForm = () => {
    const e: Record<string, string> = {};
    if (!formData.patient_id) e.patient_id = 'กรุณาเลือกผู้ป่วย';
    if (!formData.staff_id) e.staff_id = 'กรุณาเลือกแพทย์/เจ้าหน้าที่';
    if (!formData.appointment_date) e.appointment_date = 'กรุณาเลือกวันที่';
    if (!formData.appointment_time) e.appointment_time = 'กรุณาเลือกเวลา';
    setValidationErrors(e);
    if (Object.keys(e).length) { setError(Object.values(e)[0]); return false; }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (!validateForm()) return;
    setLoading(true);
    try {
      const dt = `${formData.appointment_date}T${formData.appointment_time}:00`;
      const res = await createAppointment({
        patient_id: formData.patient_id, staff_id: formData.staff_id,
        appointment_type: formData.appointment_type, appointment_datetime: dt,
        duration_minutes: parseInt(formData.duration_minutes as any),
        location: formData.location, notes: formData.notes || undefined,
        created_by: user?.id, status: 'scheduled',
      });
      if (res.success) router.push(backUrl); else setError(res.error || 'บันทึกไม่สำเร็จ');
    } catch (err: any) { setError(err?.message || 'เกิดข้อผิดพลาดที่ไม่คาดคิด'); }
    finally { setLoading(false); }
  };

  const handleUnlockPatient = () => {
    setLockedPatient(null); setLockedCoach(null); setCoachMissingWarning(false);
    setFormData(prev => ({ ...prev, patient_id: '', staff_id: '' }));
    setPatientSearchTerm(''); setStaffSearchTerm('');
    setPatientHospitalId(null); setPatientHospitalName(null); setParentHospitalName(null); setHospitalCoaches([]);
  };
  const handleUnlockCoach = () => {
    setLockedCoach(null); setStaffSearchTerm('');
    setFormData(prev => ({ ...prev, staff_id: '' }));
    setIsStaffDropdownOpen(true);
  };

  // =====================================================
  // 🎨 RENDER
  // =====================================================
  if (success) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center bg-white p-8 rounded-xl shadow-lg border border-green-100">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-800 mb-2">สร้างนัดหมายสำเร็จ!</h2>
      </div>
    </div>
  );
  if (!user) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Header เดิม */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button onClick={() => router.push(backUrl)} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"><ArrowLeft className="w-4 h-4" /> กลับ</button>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
                <span className="bg-red-100 text-red-600 p-2 rounded-lg"><CalendarPlus className="w-6 h-6" /></span>
                สร้างนัดหมายใหม่
              </h1>
              <p className="text-gray-600 mt-1">กำหนดนัดหมายผู้ป่วยกับแพทย์หรือเจ้าหน้าที่</p>
            </div>
            {userHospital && (
              <div className="text-right bg-blue-50 px-4 py-3 rounded-xl border border-blue-200">
                <p className="font-semibold text-gray-800">{user?.full_name_th}</p>
                <p className="text-xs text-gray-500">{userHospital.name} ({userHospital.type === 'main' ? 'แม่ข่าย' : 'ลูกข่าย'})</p>
              </div>
            )}
            <button onClick={() => { logout(); router.push('/admin/login'); }} className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"><LogOut className="w-4 h-4 inline mr-2" /> ออกจากระบบ</button>
          </div>
        </div>
      </div>

      {/* Info Banner */}
      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
          <p className="font-semibold mb-1">📋 ข้อมูลเครือข่าย (โหลดครบทุกแถว)</p>
          <ul className="list-disc list-inside space-y-1">
            <li>โรงพยาบาลในเครือข่าย: {hospitals.length} แห่ง</li>
            <li>ผู้ป่วย: {patients.length} คน {loading && <Loader2 className="w-3 h-3 inline animate-spin" />}</li>
            <li>แพทย์/เจ้าหน้าที่: {coaches.length} คน</li>
            {lockedPatient && lockedCoach && (
              <li className="text-green-700 font-medium">✅ เลือกผู้ป่วย + โค้ชอัตโนมัติแล้ว</li>
            )}
            {coachMissingWarning && !lockedCoach && (
              <li className="text-amber-700 font-medium">⚠️ ยังไม่ได้มอบหมายโค้ช หรือโค้ชไม่พบในระบบ — เลือกเองด้านล่าง</li>
            )}
          </ul>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-5xl mx-auto px-4 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <p className="text-red-700">{error}</p>
            <button type="button" onClick={() => setError('')} className="ml-auto text-red-600"><XCircle className="w-5 h-5" /></button>
          </div>
        )}

        {/* SECTION 1 ผู้ป่วย */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-sm font-bold">1</span>
            ผู้ป่วย <span className="text-red-500">*</span>
            {lockedPatient && <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">เลือกอัตโนมัติจากลิงก์ ✓</span>}
          </h2>
          {lockedPatient ? (
            <div className="border-2 border-green-300 bg-green-50/60 rounded-xl p-5 flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center"><Users className="w-6 h-6 text-green-600" /></div>
                <div>
                  <p className="text-xs font-semibold text-green-600 mb-1">ผู้ป่วยที่ต้องการนัดหมาย</p>
                  <p className="text-lg font-bold text-gray-800">{lockedPatient.first_name} {lockedPatient.last_name}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-600">
                    <span className="bg-white px-2 py-1 rounded border">HN: {lockedPatient.hospital_number}</span>
                    {lockedPatient.id_card && <span className="bg-white px-2 py-1 rounded border">บัตร: {lockedPatient.id_card}</span>}
                    {lockedPatient.hospital_name && <span className="bg-white px-2 py-1 rounded border">รพ.: {lockedPatient.hospital_name}</span>}
                  </div>
                </div>
              </div>
              <button type="button" onClick={handleUnlockPatient} className="px-3 py-1.5 text-xs border border-green-300 bg-white text-green-700 rounded-lg hover:bg-green-100">เปลี่ยนผู้ป่วย</button>
            </div>
          ) : (
            <div ref={patientDropdownRef} className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text"
                  placeholder="พิมพ์ชื่อ, HN หรือ เลขบัตรประชาชน เพื่อค้นหา..."
                  value={patientSearchTerm}
                  onChange={(e) => { setPatientSearchTerm(e.target.value); setIsPatientDropdownOpen(true); if (formData.patient_id) setFormData(p => ({ ...p, patient_id: '' })); }}
                  onFocus={() => setIsPatientDropdownOpen(true)}
                  className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${validationErrors.patient_id ? 'border-red-500' : 'border-gray-300'}`} />
              </div>
              {isPatientDropdownOpen && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-80 overflow-y-auto">
                  {filteredPatients.length > 0 ? (
                    filteredPatients.map((p) => (
                      <div key={p.id}
                        onClick={() => {
                          setFormData(prev => ({ ...prev, patient_id: p.id }));
                          setPatientSearchTerm(`${p.first_name} ${p.last_name} (${p.hospital_number})`);
                          setLockedPatient(p); setIsPatientDropdownOpen(false);
                          (async () => { await applyPatientScope(p); await autoFillCoachForPatient(p.id); })();
                        }}
                        className="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100">
                        <div className="font-bold text-gray-800">{p.first_name} {p.last_name}</div>
                        <div className="text-xs text-gray-500">HN: {p.hospital_number} · {p.hospital_name}</div>
                      </div>
                    ))
                  ) : <div className="p-4 text-center text-gray-500">ไม่พบข้อมูลที่ค้นหา</div>}
                </div>
              )}
              {validationErrors.patient_id && <p className="text-xs text-red-600 mt-1">💡 {validationErrors.patient_id}</p>}
            </div>
          )}
        </div>

        {/* SECTION 2 แพทย์/โค้ช */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 text-sm font-bold">2</span>
            แพทย์/เจ้าหน้าที่ <span className="text-red-500">*</span>
            {lockedCoach && <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">เลือกอัตโนมัติจากโค้ชผู้ป่วย ✓</span>}
            {coachMissingWarning && !lockedCoach && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">⚠️ กรุณาเลือกผู้ดูแลเอง</span>}
          </h2>
          {lockedCoach ? (
            <div className="border-2 border-green-300 bg-green-50/60 rounded-xl p-5 flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center"><Stethoscope className="w-6 h-6 text-green-600" /></div>
                <div>
                  <p className="text-xs font-semibold text-green-600 mb-1">โค้ชผู้ดูแลของผู้ป่วย (เลือกอัตโนมัติ)</p>
                  <p className="text-lg font-bold text-gray-800">{lockedCoach.full_name_th}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-600">
                    <span className="bg-white px-2 py-1 rounded border">{lockedCoach.specialization_th}</span>
                    <span className="bg-white px-2 py-1 rounded border">รพ.: {lockedCoach.hospital_name}</span>
                  </div>
                </div>
              </div>
              <button type="button" onClick={handleUnlockCoach} className="px-3 py-1.5 text-xs border border-green-300 bg-white text-green-700 rounded-lg hover:bg-green-100">เปลี่ยนผู้ดูแล</button>
            </div>
          ) : (
            <div ref={staffDropdownRef} className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text"
                  placeholder={patientHospitalName ? `พิมพ์ชื่อโค้ชใน ${patientHospitalName}${parentHospitalName ? ' (+แม่ข่าย)' : ''}...` : 'พิมพ์ชื่อ หรือ ความเชี่ยวชาญ เพื่อค้นหาโค้ช...'}
                  value={staffSearchTerm}
                  onChange={(e) => { setStaffSearchTerm(e.target.value); setIsStaffDropdownOpen(true); if (formData.staff_id) { setFormData(p => ({ ...p, staff_id: '' })); } }}
                  onFocus={() => setIsStaffDropdownOpen(true)}
                  className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none ${validationErrors.staff_id ? 'border-red-500' : 'border-gray-300'}`} />
              </div>
              {isStaffDropdownOpen && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-80 overflow-y-auto">
                  <div className="px-4 py-2 bg-cyan-50 border-b border-cyan-100 text-xs text-cyan-800 font-medium flex items-center gap-2 sticky top-0">
                    <Hospital className="w-3 h-3" />
                    {patientHospitalId ? `ขอบเขต: ${patientHospitalName}${parentHospitalName ? ` + แม่ข่าย (${parentHospitalName})` : ''} — ${hospitalCoaches.length} คน` : `ทั้งเครือข่าย (${coaches.length} คน)`}
                  </div>
                  {filteredStaff.length > 0 ? (
                    filteredStaff.map((c) => (
                      <div key={c.user_id}
                        onClick={() => {
                          setFormData(prev => ({ ...prev, staff_id: c.user_id }));
                          setStaffSearchTerm(`${c.full_name_th}${c.specialization_th ? ` (${c.specialization_th})` : ''}`);
                          setIsStaffDropdownOpen(false);
                        }}
                        className="px-4 py-3 hover:bg-purple-50 cursor-pointer border-b border-gray-100">
                        <div className="font-medium text-gray-800">{c.full_name_th}</div>
                        <div className="text-xs text-gray-500 flex justify-between"><span>{c.specialization_th}</span><span>{c.hospital_name}</span></div>
                      </div>
                    ))
                  ) : <div className="p-4 text-center text-gray-500">ไม่พบข้อมูล</div>}
                </div>
              )}
              {validationErrors.staff_id && <p className="text-xs text-red-600 mt-1">💡 {validationErrors.staff_id}</p>}
            </div>
          )}
        </div>

        {/* SECTION 3 รายละเอียดนัด (เหมือนเดิม) */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><span className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 text-sm font-bold">3</span> รายละเอียดนัดหมาย</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">ประเภทนัดหมาย *</label>
              <select name="appointment_type" value={formData.appointment_type} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none">
                <option value="follow_up">ติดตามผล</option><option value="consultation">ปรึกษาแพทย์</option><option value="checkup">ตรวจสุขภาพ</option><option value="lab">เจาะเลือด/แลป</option>
              </select></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">สถานที่</label>
              <select name="location" value={formData.location} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none">
                <option value="clinic">คลินิก</option><option value="ward">หอผู้ป่วย</option><option value="online">ออนไลน์ (Telemed)</option><option value="home_visit">เยี่ยมบ้าน</option>
              </select></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">วันที่และเวลา *</label>
              <div className="flex gap-2">
                <input type="date" name="appointment_date" value={formData.appointment_date} onChange={handleChange} min={new Date().toISOString().split('T')[0]} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" />
                <input type="time" name="appointment_time" value={formData.appointment_time} onChange={handleChange} className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" /></div></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1"><Clock className="w-3 h-3 inline mr-1" /> ระยะเวลา (นาที)</label>
              <select name="duration_minutes" value={formData.duration_minutes} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none">
                <option value="15">15 นาที</option><option value="30">30 นาที</option><option value="45">45 นาที</option><option value="60">1 ชั่วโมง</option></select></div>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1"><FileText className="w-3 h-3 inline mr-1" /> หมายเหตุ</label>
            <textarea name="notes" value={formData.notes} onChange={handleChange} rows={3} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none resize-none" /></div>
        </div>

        <div className="flex gap-4 pt-4 pb-8">
          <button type="submit" disabled={loading} className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold py-4 rounded-xl hover:from-blue-700 hover:to-cyan-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg">
            {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> กำลังบันทึก...</> : <><CheckCircle className="w-5 h-5" /> ยืนยันการสร้างนัดหมาย</>}</button>
          <button type="button" onClick={() => router.push(backUrl)} className="px-8 py-4 bg-gray-500 text-white font-bold rounded-xl hover:bg-gray-600 transition-all">ยกเลิก</button>
        </div>
      </form>
    </div>
  );
}

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