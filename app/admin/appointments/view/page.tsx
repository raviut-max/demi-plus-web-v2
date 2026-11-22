// app/admin/appointments/view/page.tsx
// ✅ แก้ไขล่าสุด: 22 พฤศจิกายน 2569
// ✅ การแก้ไข:
//    1. ✅ แก้บั๊กนับจำนวนผิด 1000 (Supabase default limit) → ดึงครบทุกคนแบบ chunked loop
//    2. ✅ แสดงผลแบบ Pagination 15 คน/หน้า เลื่อนหน้าได้ถูกต้อง (client-side slice — เร็วมาก)
//    3. ✅ ตัด N+1 queries → ใช้ batch query เฉพาะ 15 แถวของหน้าปัจจุบัน + cache
//    4. ✅ Stats (ทั้งหมด/มีนัด/ไม่มีนัด/รอดำเนินการ) นับจากข้อมูลจริงทั้งหมด
//    5. ✅ กรองเฉพาะผู้ป่วย is_active=true ให้ตรงกับหน้าจัดการผู้ป่วย
//    6. ✅ Reset หน้าเป็น 1 เมื่อเปลี่ยนตัวกรอง
'use client';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, logout, getAccessibleHospitalIds, getUserHospitalInfo } from '@/lib/supabase/queries';
import {
  Calendar, Filter, LogOut, ArrowLeft, Clock, User, Stethoscope, Plus,
  FileText, CheckCircle, Eye, X, CalendarX, Hospital, Building2,
  UserCheck, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Loader2, SkipBack, SkipForward,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

// ============================================================
// 🧩 Types
// ============================================================
interface PatientWithAppointment {
  patient_id: string;
  patient_name: string;
  hospital_number: string;
  appointment_id?: string;
  appointment_date?: string;
  appointment_type?: string;
  doctor_id?: string;
  status?: string;
  hasAppointment: boolean;
  patient_hospital_id?: string;
}

interface UserHospital {
  id: string;
  name: string;
  type: 'main' | 'sub';
  parent_id: string | null;
  parent_hospital?: { id: string; name: string };
}

// ✅ ค่าคงที่: 15 คน/หน้า ตาม requirement
const PAGE_SIZE = 15;

// ============================================================
// 🧰 Helper: ดึงข้อมูลครบทุกแถว (แก้ Supabase limit 1000)
// ============================================================
async function fetchAllRows(
  table: string,
  select: string,
  applyFilters: (q: any) => any,
  chunkSize = 1000
): Promise<any[]> {
  const out: any[] = [];
  let from = 0;
  while (true) {
    let query = supabase
      .from(table)
      .select(select)
      .order('id', { ascending: true }); // ✅ order ให้ pagination เสถียร
    query = applyFilters(query);
    query = query.range(from, from + chunkSize - 1);
    const { data, error } = await query;
    if (error) {
      console.error(`❌ [fetchAllRows] ${table}:`, error);
      break;
    }
    if (data) out.push(...data);
    if (!data || data.length < chunkSize) break;
    from += chunkSize;
    if (from > 100000) break; // กัน infinite loop
  }
  return out;
}

export default function ViewAppointmentsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<UserHospital | null>(null);
  const [patientsWithAppointments, setPatientsWithAppointments] = useState<PatientWithAppointment[]>([]);
  const [allPatients, setAllPatients] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [filterDate, setFilterDate] = useState('');
  const [filterDoctor, setFilterDoctor] = useState('');
  const [filterPatient, setFilterPatient] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [accessibleHospitalIds, setAccessibleHospitalIds] = useState<string[]>([]);

  // ✅ Pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const [jumpToPage, setJumpToPage] = useState('');

  // ✅ Cache สำหรับ enrichment (กัน query ซ้ำ)
  const [doctorMap, setDoctorMap] = useState<Record<string, { name: string; hospital: any }>>({});
  const [followupMap, setFollowupMap] = useState<Record<string, boolean>>({});

  // ============================================================
  // 🔐 Session + Role
  // ============================================================
  useEffect(() => {
    const userData = checkSession();
    if (!userData) { router.push('/admin/login'); return; }
    if (!['admin', 'doctor', 'helper', 'osm'].includes(userData.role)) {
      alert('ไม่มีสิทธิ์เข้าถึง'); router.push('/admin/login'); return;
    }
    setUser(userData);
    loadUserHospital(userData.id);
    loadAccessibleHospitals(userData.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const loadUserHospital = async (userId: string) => {
    try {
      const hospitalInfo = await getUserHospitalInfo(userId);
      setUserHospital(hospitalInfo);
    } catch (error) {
      console.error('Error loading user hospital:', error);
    }
  };

  const loadAccessibleHospitals = async (userId: string) => {
    try {
      const ids = await getAccessibleHospitalIds(userId);
      setAccessibleHospitalIds(ids);
      console.log('🏥 Accessible hospitals for appointments:', ids.length);
      loadData(ids);
    } catch (error) {
      console.error('Error loading accessible hospitals:', error);
    }
  };

  // ============================================================
  // 📊 โหลดข้อมูล (✅ ดึงครบทุกแถว ไม่ถูก cap 1000)
  // ============================================================
  const loadData = async (hospitalIds?: string[]) => {
    setLoading(true);
    const t0 = performance.now();
    try {
      // ---------- 1) ผู้ป่วยทั้งหมด (chunked loop + is_active) ----------
      const patientsData = await fetchAllRows(
        'profiles',
        'id, first_name, last_name, hospital_number, hospital_id',
        (q) => {
          q = q.eq('is_active', true);
          if (hospitalIds && hospitalIds.length > 0) q = q.in('hospital_id', hospitalIds);
          return q;
        }
      );
      setAllPatients(patientsData);

      // ---------- 2) นัดหมายทั้งหมด (chunked loop) ----------
      const aptData = await fetchAllRows(
        'appointments',
        'id, user_id, appointment_date, appointment_type, status, doctor_id',
        (q) => q
      );

      // ---------- 3) Map นัดหมายล่าสุดต่อผู้ป่วย ----------
      const appointmentMap = new Map<string, any>();
      aptData.forEach((apt: any) => {
        const cur = appointmentMap.get(apt.user_id);
        if (!cur || new Date(apt.appointment_date) > new Date(cur.appointment_date)) {
          appointmentMap.set(apt.user_id, apt);
        }
      });

      // ---------- 4) รวมข้อมูล ----------
      const combined: PatientWithAppointment[] = patientsData.map((patient: any) => {
        const latest = appointmentMap.get(patient.id) || null;
        return {
          patient_id: patient.id,
          patient_name: `${patient.first_name} ${patient.last_name}`,
          hospital_number: patient.hospital_number,
          appointment_id: latest?.id,
          appointment_date: latest?.appointment_date,
          appointment_type: latest?.appointment_type,
          doctor_id: latest?.doctor_id,
          status: latest?.status,
          hasAppointment: !!latest,
          patient_hospital_id: patient.hospital_id,
        };
      });

      setPatientsWithAppointments(combined);
      console.log(`✅ [loadData] Patients: ${patientsData.length}, Appointments: ${aptData.length}, เสร็จใน ${(performance.now() - t0).toFixed(0)}ms`);

      // ---------- 5) แพทย์สำหรับ filter ----------
      let doctorsQuery = supabase
        .from('doctors')
        .select(`id, full_name_th, full_name, user_id, users!doctors_user_id_fkey ( role, hospital_id, hospitals ( name, type ) )`)
        .eq('is_active', true);
      if (hospitalIds && hospitalIds.length > 0) {
        doctorsQuery = doctorsQuery.in('users.hospital_id', hospitalIds);
      }
      const { data: doctorsData } = await doctorsQuery;
      const filteredStaff = doctorsData?.filter((staff: any) =>
        staff.users?.role === 'doctor' || staff.users?.role === 'helper'
      ) || [];
      setDoctors(filteredStaff);
    } catch (error) {
      console.error('❌ Error loading data:', error);
      alert('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // 🔎 Filters + Pagination (client-side — เลื่อนหน้าเร็วมาก)
  // ============================================================
  const filteredPatients = useMemo(() => {
    return patientsWithAppointments.filter((patient) => {
      if (filterPatient && patient.patient_id !== filterPatient) return false;
      if (filterDoctor && patient.doctor_id !== filterDoctor) return false;
      if (filterDate && patient.appointment_date) {
        const aptDate = new Date(patient.appointment_date).toISOString().split('T')[0];
        if (aptDate !== filterDate) return false;
      }
      if (filterStatus !== 'all') {
        if (filterStatus === 'no_appointment') return !patient.hasAppointment;
        if (['scheduled', 'completed', 'cancelled', 'no_show'].includes(filterStatus)) {
          return patient.hasAppointment && patient.status === filterStatus;
        }
      }
      return true;
    });
  }, [patientsWithAppointments, filterDate, filterDoctor, filterPatient, filterStatus]);

  const totalPages = Math.max(1, Math.ceil(filteredPatients.length / PAGE_SIZE));
  const paginatedRows = useMemo(
    () => filteredPatients.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE),
    [filteredPatients, currentPage]
  );

  // ✅ Reset หน้าเป็น 1 เมื่อเปลี่ยนตัวกรอง
  useEffect(() => {
    setCurrentPage(0);
  }, [filterDate, filterDoctor, filterPatient, filterStatus]);

  // ============================================================
  // ⚡ Enrichment แบบ Batch (แทน N+1 — query แค่ 2 ครั้ง/หน้า)
  // ============================================================
  useEffect(() => {
    const rows = paginatedRows;
    if (rows.length === 0) return;

    const aptIds = [...new Set(rows.map((r) => r.appointment_id).filter(Boolean))] as string[];
    const docIds = [...new Set(rows.map((r) => r.doctor_id).filter(Boolean))] as string[];

    const pendingApt = aptIds.filter((id) => followupMap[id] === undefined);
    const pendingDoc = docIds.filter((id) => !doctorMap[id]);

    if (pendingApt.length === 0 && pendingDoc.length === 0) return;

    (async () => {
      const tasks: Promise<void>[] = [];

      if (pendingApt.length > 0) {
        tasks.push(
          supabase.from('appointment_followups').select('appointment_id').in('appointment_id', pendingApt)
            .then(({ data }) => {
              const found = new Set((data || []).map((d: any) => d.appointment_id));
              setFollowupMap((prev) => {
                const next = { ...prev };
                pendingApt.forEach((id) => (next[id] = found.has(id)));
                return next;
              });
            })
        );
      }

      if (pendingDoc.length > 0) {
        tasks.push(
          supabase
            .from('doctors')
            .select(`id, full_name_th, full_name, users!doctors_user_id_fkey ( hospital_id, hospitals ( id, name, type ) )`)
            .in('id', pendingDoc)
            .then(({ data }) => {
              setDoctorMap((prev) => {
                const next = { ...prev };
                (data || []).forEach((d: any) => {
                  next[d.id] = {
                    name: d.full_name_th || d.full_name || '-',
                    hospital: d.users?.hospitals
                      ? { id: d.users.hospitals.id, name: d.users.hospitals.name, type: d.users.hospitals.type }
                      : null,
                  };
                });
                return next;
              });
            })
        );
      }

      await Promise.all(tasks);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paginatedRows]);

  // ============================================================
  // 📈 Stats (นับจากข้อมูลจริงทั้งหมด — ไม่ใช่แค่ 1000)
  // ============================================================
  const stats = useMemo(() => ({
    total: patientsWithAppointments.length,
    hasAppointment: patientsWithAppointments.filter((p) => p.hasAppointment).length,
    noAppointment: patientsWithAppointments.filter((p) => !p.hasAppointment).length,
    scheduled: patientsWithAppointments.filter((p) => p.status === 'scheduled').length,
  }), [patientsWithAppointments]);

  // ============================================================
  // 🎛️ Handlers
  // ============================================================
  const handleLogout = () => { logout(); router.push('/admin/login'); };

  const getStatusColor = (status: string | null | undefined) => {
    if (!status) return 'bg-gray-100 text-gray-700 border border-gray-300';
    switch (status) {
      case 'scheduled': return 'bg-blue-100 text-blue-700';
      case 'completed': return 'bg-green-100 text-green-700';
      case 'cancelled': return 'bg-red-100 text-red-700';
      case 'no_show': return 'bg-orange-100 text-orange-700';
      default: return 'bg-gray-100 text-gray-700 border border-gray-300';
    }
  };

  const getStatusText = (status: string | null | undefined) => {
    if (!status) return 'ไม่มีนัดหมาย';
    switch (status) {
      case 'scheduled': return 'นัดหมาย';
      case 'completed': return 'เสร็จสิ้น';
      case 'cancelled': return 'ยกเลิก';
      case 'no_show': return 'ผิดนัด';
      default: return status;
    }
  };

  const isPastAppointment = (appointmentDate: string) => new Date(appointmentDate) < new Date();

  const handleComplete = async (aptId: string) => {
    const patient = patientsWithAppointments.find((p) => p.appointment_id === aptId);
    if (!patient || !patient.appointment_date) return;
    const aptDate = new Date(patient.appointment_date);
    const now = new Date();
    if (aptDate > now) {
      const timeDiff = aptDate.getTime() - now.getTime();
      const daysLeft = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
      const hoursLeft = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const confirmEarly = confirm(
        `⚠️ คำเตือน: ยังไม่ถึงวันนัดหมาย!\n\nเวลานัด: ${aptDate.toLocaleString('th-TH')}\n\nเหลืออีกประมาณ ${daysLeft > 0 ? `${daysLeft} วัน ` : ''}${hoursLeft} ชั่วโมง\n\nคุณต้องการเสร็จสิ้นนัดหมายนี้จริงๆ หรือไม่?`
      );
      if (!confirmEarly) return;
    } else {
      if (!confirm('ยืนยันว่านัดหมายนี้เสร็จสิ้นแล้ว?')) return;
    }
    const { error } = await supabase.from('appointments')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', aptId);
    if (error) alert('เกิดข้อผิดพลาด: ' + error.message);
    else { alert('✅ บันทึกสำเร็จ!'); await loadData(accessibleHospitalIds); }
  };

  const handleNoShow = async (aptId: string) => {
    if (!confirm('ยืนยันว่าผู้ป่วยผิดนัด (No-show)?')) return;
    const { error } = await supabase.from('appointments')
      .update({ status: 'no_show', updated_at: new Date().toISOString() })
      .eq('id', aptId);
    if (error) alert('เกิดข้อผิดพลาด: ' + error.message);
    else { alert('✅ บันทึกสถานะผิดนัดสำเร็จ!'); await loadData(accessibleHospitalIds); }
  };

  const handleCancel = async (aptId: string) => {
    if (!confirm('ยืนยันการยกเลิกนัดหมายนี้?')) return;
    const { error } = await supabase.from('appointments')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', aptId);
    if (error) alert('เกิดข้อผิดพลาด: ' + error.message);
    else { alert('✅ ยกเลิกนัดหมายสำเร็จ!'); await loadData(accessibleHospitalIds); }
  };

  const handleViewDetails = (patient: PatientWithAppointment) => {
    setSelectedPatient(patient);
    setShowDetailsModal(true);
  };

  const clearFilters = () => {
    setFilterDate(''); setFilterDoctor(''); setFilterPatient(''); setFilterStatus('all');
  };

  const handleJumpToPage = () => {
    const pageNum = parseInt(jumpToPage);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
      setCurrentPage(pageNum - 1);
      setJumpToPage('');
    } else {
      alert(`กรุณาใส่เลขหน้าระหว่าง 1 - ${totalPages}`);
    }
  };

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;
    if (totalPages <= maxVisible) {
      for (let i = 0; i < totalPages; i++) pages.push(i);
    } else if (currentPage < 3) {
      for (let i = 0; i < maxVisible - 1; i++) pages.push(i);
      pages.push('...'); pages.push(totalPages - 1);
    } else if (currentPage > totalPages - 4) {
      pages.push(0); pages.push('...');
      for (let i = totalPages - maxVisible + 1; i < totalPages; i++) pages.push(i);
    } else {
      pages.push(0); pages.push('...');
      for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
      pages.push('...'); pages.push(totalPages - 1);
    }
    return pages;
  };

  // ============================================================
  // 🖥️ Render
  // ============================================================
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">กำลังโหลดข้อมูลนัดหมาย...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button onClick={() => router.push('/admin/dashboard')} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-2">
            <ArrowLeft className="w-4 h-4" /> กลับ Dashboard
          </button>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">📅 ดูนัดหมาย</h1>
              <p className="text-gray-600">ตรวจสอบตารางนัดหมายและผู้ป่วยที่ยังไม่มีนัดหมาย</p>
            </div>
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
                          user?.role === 'helper' ? '👩‍💼 เจ้าหน้าที่' : '🏘️ อสม.'}
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
              <div className="flex gap-2">
                <button onClick={() => router.push('/admin/appointments/new')} className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all">
                  <Plus className="w-4 h-4" /> สร้างนัดหมายใหม่
                </button>
                <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all">
                  <LogOut className="w-4 h-4" /> ออกจากระบบ
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Summary — ✅ นับจากข้อมูลจริงทั้งหมด */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center"><User className="w-5 h-5 text-blue-600" /></div>
              <div>
                <p className="text-sm text-gray-500">ผู้ป่วยทั้งหมด</p>
                <p className="text-2xl font-bold text-gray-800">{stats.total.toLocaleString()}</p>
                {accessibleHospitalIds.length > 0 && accessibleHospitalIds.length < 100 && (
                  <p className="text-xs text-gray-400 mt-1">🔒 จาก {accessibleHospitalIds.length} รพ.</p>
                )}
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center"><Calendar className="w-5 h-5 text-green-600" /></div>
              <div><p className="text-sm text-gray-500">มีนัดหมาย</p><p className="text-2xl font-bold text-gray-800">{stats.hasAppointment.toLocaleString()}</p></div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center"><CalendarX className="w-5 h-5 text-red-600" /></div>
              <div><p className="text-sm text-gray-500">ไม่มีนัดหมาย</p><p className="text-2xl font-bold text-gray-800">{stats.noAppointment.toLocaleString()}</p></div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center"><Clock className="w-5 h-5 text-blue-600" /></div>
              <div><p className="text-sm text-gray-500">รอดำเนินการ</p><p className="text-2xl font-bold text-gray-800">{stats.scheduled.toLocaleString()}</p></div>
            </div>
          </div>
        </div>

        {/* ✅ แถบตรวจสอบความถูกต้อง */}
        <div className="mb-6 text-xs text-gray-500 flex items-center gap-2">
          <span>ตรวจสอบยอดรวม:</span>
          <span className={`font-bold ${stats.hasAppointment + stats.noAppointment === stats.total ? 'text-green-600' : 'text-amber-600'}`}>
            {stats.hasAppointment + stats.noAppointment === stats.total
              ? `✅ ${stats.hasAppointment} + ${stats.noAppointment} = ${stats.total} ครบถ้วน`
              : `⚠️ ${stats.hasAppointment} + ${stats.noAppointment} ≠ ${stats.total}`}
          </span>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-bold text-gray-800">ตัวกรอง</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วันที่</label>
              <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">แพทย์</label>
              <select value={filterDoctor} onChange={(e) => setFilterDoctor(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                <option value="">ทั้งหมด</option>
                {doctors.map((doctor: any) => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.full_name_th || doctor.full_name || '-'} ({doctor.users?.hospitals?.name || '-'})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ผู้ป่วย</label>
              <select value={filterPatient} onChange={(e) => setFilterPatient(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                <option value="">ทั้งหมด</option>
                {allPatients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.first_name} {patient.last_name} ({patient.hospital_number})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">สถานะ</label>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                <option value="all">ทั้งหมด</option>
                <option value="no_appointment">ไม่มีนัดหมาย</option>
                <option value="scheduled">รอดำเนินการ</option>
                <option value="completed">เสร็จสิ้น</option>
                <option value="cancelled">ยกเลิก</option>
                <option value="no_show">ผิดนัด</option>
              </select>
            </div>
          </div>
          {(filterDate || filterDoctor || filterPatient || filterStatus !== 'all') && (
            <div className="mt-4">
              <button onClick={clearFilters} className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-all">ล้างตัวกรอง</button>
            </div>
          )}
        </div>

        {/* ✅ Info bar */}
        <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
          <div className="text-sm text-gray-600">
            📄 แสดงหน้าที่ {currentPage + 1} จาก {totalPages} (หน้าละ {PAGE_SIZE} คน) — ผลรวมตามตัวกรอง: <b>{filteredPatients.length.toLocaleString()}</b> คน
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ผู้ป่วย</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">แพทย์</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ประเภท</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">วันที่/เวลา</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">สถานะ</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                      <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p>ไม่พบข้อมูล</p>
                      {(filterDate || filterDoctor || filterPatient || filterStatus !== 'all') && (
                        <p className="text-sm mt-2 text-gray-400">ลองปรับแต่งตัวกรอง</p>
                      )}
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map((patient) => {
                    const doc = patient.doctor_id ? doctorMap[patient.doctor_id] : undefined;
                    const hasFollowup = patient.appointment_id ? !!followupMap[patient.appointment_id] : false;
                    return (
                      <tr key={patient.patient_id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <button onClick={() => router.push(`/admin/patients/${patient.patient_id}?from=appointments`)} className="text-left group" title="ไปหน้ารายละเอียดผู้ป่วย">
                            <p className="font-medium text-gray-800 group-hover:text-blue-600 group-hover:underline transition-colors">{patient.patient_name}</p>
                            <p className="text-sm text-gray-500">{patient.hospital_number}</p>
                          </button>
                        </td>
                        <td className="px-6 py-4">
                          {patient.hasAppointment ? (
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <Stethoscope className="w-4 h-4 text-gray-400" />
                                <span className="text-gray-700">{doc?.name || (patient.appointment_id ? '...' : '-')}</span>
                              </div>
                              {doc?.hospital && (
                                <div className="flex items-center gap-1 text-xs text-gray-500">
                                  <Hospital className="w-3 h-3" />
                                  <span>{doc.hospital.name}{doc.hospital.type === 'main' ? ' (แม่ข่าย)' : ' (ลูกข่าย)'}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">{patient.appointment_type || '-'}</td>
                        <td className="px-6 py-4 text-sm">
                          {patient.appointment_date ? (
                            <>
                              <p className="text-gray-800">{new Date(patient.appointment_date).toLocaleDateString('th-TH')}</p>
                              <p className="text-gray-500">{new Date(patient.appointment_date).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</p>
                            </>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(patient.status)}`}>
                            {getStatusText(patient.status)}
                          </span>
                          {hasFollowup && (
                            <div className="mt-1 flex items-center gap-1 text-xs text-green-600">
                              <CheckCircle className="w-3 h-3" />
                              <span>บันทึกติดตามแล้ว</span>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2 flex-wrap">
                            <button onClick={() => handleViewDetails({ ...patient, doctor_name: doc?.name || '-', doctor_hospital: doc?.hospital || null, hasFollowup })} className="px-3 py-1 bg-blue-500 text-white text-xs rounded-lg hover:bg-blue-600 transition-all flex items-center gap-1" title="ดูรายละเอียด">
                              <Eye className="w-3 h-3" /> ดูรายละเอียด
                            </button>
                            {!patient.hasAppointment && (
                              <button onClick={() => router.push(`/admin/appointments/new?patient_id=${patient.patient_id}`)} className="px-3 py-1 bg-green-500 text-white text-xs rounded-lg hover:bg-green-600 transition-all flex items-center gap-1" title="สร้างนัดหมายใหม่">
                                <Plus className="w-3 h-3" /> สร้างนัดหมาย
                              </button>
                            )}
                            {patient.hasAppointment && patient.appointment_id && (
                              <>
                                {patient.status === 'scheduled' && (
                                  <>
                                    <button onClick={() => router.push(`/admin/appointments/edit/${patient.appointment_id}`)} className="px-3 py-1 bg-yellow-500 text-white text-xs rounded-lg hover:bg-yellow-600 transition-all" title="แก้ไขนัดหมาย">แก้ไข</button>
                                    <button onClick={() => handleComplete(patient.appointment_id!)} className="px-3 py-1 bg-green-500 text-white text-xs rounded-lg hover:bg-green-600 transition-all" title={isPastAppointment(patient.appointment_date!) ? 'เสร็จสิ้นนัดหมาย' : 'เสร็จสิ้นก่อนกำหนด'}>เสร็จสิ้น</button>
                                    {isPastAppointment(patient.appointment_date!) && (
                                      <button onClick={() => handleNoShow(patient.appointment_id!)} className="px-3 py-1 bg-orange-500 text-white text-xs rounded-lg hover:bg-orange-600 transition-all" title="บันทึกว่าผิดนัด">ผิดนัด</button>
                                    )}
                                    <button onClick={() => handleCancel(patient.appointment_id!)} className="px-3 py-1 bg-red-500 text-white text-xs rounded-lg hover:bg-red-600 transition-all" title="ยกเลิกนัดหมาย">ยกเลิก</button>
                                  </>
                                )}
                                {patient.status === 'completed' && !hasFollowup && (
                                  <button onClick={() => router.push(`/admin/appointments/followup/${patient.appointment_id}`)} className="px-3 py-1 bg-purple-500 text-white text-xs rounded-lg hover:bg-purple-600 transition-all flex items-center gap-1" title="บันทึกผลการติดตาม">
                                    <FileText className="w-3 h-3" /> บันทึกติดตาม
                                  </button>
                                )}
                                {patient.status === 'completed' && hasFollowup && (
                                  <span className="px-3 py-1 bg-gray-100 text-gray-500 text-xs rounded-lg flex items-center gap-1">
                                    <CheckCircle className="w-3 h-3" /> ติดตามแล้ว
                                  </span>
                                )}
                                {(patient.status === 'completed' || patient.status === 'cancelled' || patient.status === 'no_show') && (
                                  <span className="text-xs text-gray-500 italic">ไม่สามารถแก้ไขได้</span>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ✅ Pagination Controls — 15 คน/หน้า */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between flex-wrap gap-4">
              <div className="text-sm text-gray-600">
                แสดง {currentPage * PAGE_SIZE + 1} - {Math.min((currentPage + 1) * PAGE_SIZE, filteredPatients.length)} จาก {filteredPatients.length.toLocaleString()} คน
                <span className="text-gray-400 ml-2">(หน้า {currentPage + 1} / {totalPages})</span>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">ไปยังหน้า:</span>
                  <input type="number" min="1" max={totalPages} value={jumpToPage} onChange={(e) => setJumpToPage(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleJumpToPage()} className="w-16 px-2 py-1 border rounded text-center text-sm" placeholder="หน้า" />
                  <button onClick={handleJumpToPage} className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600">ไป</button>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setCurrentPage(0)} disabled={currentPage === 0} className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed" title="หน้าแรก"><SkipBack className="w-4 h-4" /></button>
                  <button onClick={() => setCurrentPage((p) => Math.max(0, p - 1))} disabled={currentPage === 0} className="px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-1"><ChevronLeft className="w-4 h-4" /> ก่อนหน้า</button>
                  <div className="flex gap-1">
                    {getPageNumbers().map((pageNum, idx) => {
                      if (pageNum === '...') return <span key={`e-${idx}`} className="px-3 py-2 text-gray-400">...</span>;
                      const p = pageNum as number;
                      return (
                        <button key={p} onClick={() => setCurrentPage(p)} className={`px-3 py-2 rounded-lg text-sm font-medium ${currentPage === p ? 'bg-blue-500 text-white' : 'bg-white border border-gray-300 hover:bg-gray-50'}`}>
                          {p + 1}
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))} disabled={currentPage >= totalPages - 1} className="px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-1">ถัดไป <ChevronRight className="w-4 h-4" /></button>
                  <button onClick={() => setCurrentPage(totalPages - 1)} disabled={currentPage >= totalPages - 1} className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed" title="หน้าสุดท้าย"><SkipForward className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>แสดง {paginatedRows.length} จาก {filteredPatients.length.toLocaleString()} คน (ตามตัวกรอง) | ผู้ป่วยทั้งหมดในระบบ {stats.total.toLocaleString()} คน</p>
          {accessibleHospitalIds.length > 0 && (
            <p className="text-xs text-gray-400 mt-1">🔒 จำกัดการแสดงผลตามโรงพยาบาลที่สังกัด ({accessibleHospitalIds.length} โรงพยาบาล)</p>
          )}
        </div>
      </div>

      {/* Modal รายละเอียด */}
      {showDetailsModal && selectedPatient && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <Calendar className="w-6 h-6 text-blue-600" /> รายละเอียด
              </h2>
              <button onClick={() => setShowDetailsModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
            </div>
            <div className="p-6 space-y-6">
              <div className="bg-blue-50 rounded-lg p-4">
                <h3 className="text-sm font-bold text-blue-800 mb-2">👤 ผู้ป่วย</h3>
                <p className="text-lg font-bold text-blue-900">{selectedPatient.patient_name}</p>
                <p className="text-sm text-blue-700">HN: {selectedPatient.hospital_number}</p>
              </div>
              {selectedPatient.hasAppointment ? (
                <div className="grid grid-cols-2 gap-4">
                  <div><p className="text-sm text-gray-500">ประเภท</p><p className="font-medium text-gray-800">{selectedPatient.appointment_type || '-'}</p></div>
                  <div><p className="text-sm text-gray-500">สถานะ</p><span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(selectedPatient.status)}`}>{getStatusText(selectedPatient.status)}</span></div>
                  <div>
                    <p className="text-sm text-gray-500">วันที่</p>
                    <p className="font-medium text-gray-800">{selectedPatient.appointment_date ? new Date(selectedPatient.appointment_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">เวลา</p>
                    <p className="font-medium text-gray-800">{selectedPatient.appointment_date ? new Date(selectedPatient.appointment_date).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">แพทย์</p>
                    <p className="font-medium text-gray-800">{selectedPatient.doctor_name || '-'}</p>
                    {selectedPatient.doctor_hospital && (
                      <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                        <Hospital className="w-3 h-3" />
                        <span>{selectedPatient.doctor_hospital.name}{selectedPatient.doctor_hospital.type === 'main' ? ' (แม่ข่าย)' : ' (ลูกข่าย)'}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-red-50 border-2 border-red-300 rounded-lg p-6 text-center">
                  <CalendarX className="w-12 h-12 mx-auto mb-3 text-red-500" />
                  <h3 className="text-lg font-bold text-red-800 mb-2">ยังไม่มีนัดหมาย</h3>
                  <p className="text-red-600 mb-4">ผู้ป่วยคนนี้ยังไม่มีนัดหมายในระบบ</p>
                  <button onClick={() => { setShowDetailsModal(false); router.push(`/admin/appointments/new?patient_id=${selectedPatient.patient_id}`); }} className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all">
                    <Plus className="w-4 h-4 inline mr-2" /> สร้างนัดหมายใหม่
                  </button>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-200 bg-gray-50 sticky bottom-0 flex justify-end">
              <button onClick={() => setShowDetailsModal(false)} className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-all font-bold">ปิด</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}