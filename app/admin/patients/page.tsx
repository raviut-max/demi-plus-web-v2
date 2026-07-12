// app/admin/patients/page.tsx
'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import {
  checkSession,
  logout,
  getPatientListPaginated,
  getPatientCount,
  deletePatient,
  restorePatient,
  permanentlyDeletePatient,
  getDeletedPatients,
  getAccessibleHospitalIds,
  getUserHospitalInfo,
  isSuperAdmin,
  getHospitalsWithHierarchy,
  getCoachesWithHospitals
} from '@/lib/supabase/queries';
import {
  Users, Plus, Eye, Edit, Trash2, LogOut, ArrowLeft, UserCheck,
  Archive, RotateCcw, AlertCircle, Search, Filter, Hospital,
  Calendar, Phone, Mail, MapPin, XCircle, CheckCircle, Lock, Shield,
  ChevronUp, ChevronDown, ChevronsUpDown, User, Building2, Loader2,
  FileSpreadsheet, ChevronLeft, ChevronRight, SkipBack, SkipForward, Download
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

const debugLog = (module: string, message: string, data?: any) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`🔍 [${module}] ${message}\n`, data !== undefined ? JSON.stringify(data, null, 2) : '');
  }
};

export default function PatientManagementPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [patients, setPatients] = useState<any[]>([]);
  const [deletedPatients, setDeletedPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // ✅ Search States แยกกันชัดเจน เพื่อแก้ปัญหา Permission และ Search ผิดที่
  const [searchTermNameHN, setSearchTermNameHN] = useState('');
  const [searchTermIdCard, setSearchTermIdCard] = useState('');
  const [selectedPamLevel, setSelectedPamLevel] = useState<string>('all');
  const [showDeletedModal, setShowDeletedModal] = useState(false);
  const [accessibleHospitalIds, setAccessibleHospitalIds] = useState<string[]>([]);
  const [userHospital, setUserHospital] = useState<any>(null);
  const [userName, setUserName] = useState<string>('');
  const [selectedHospitalFilter, setSelectedHospitalFilter] = useState<string>('all');
  const [selectedCoachFilter, setSelectedCoachFilter] = useState<string>('all');
  const [filterHospitals, setFilterHospitals] = useState<any[]>([]);
  const [filterCoaches, setFilterCoaches] = useState<any[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(false);

  // Sort State
  const [sortColumn, setSortColumn] = useState<string>('first_name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Pagination State - แสดงหน้าละ 100 คน
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPatients, setTotalPatients] = useState(0);
  const [pageSize] = useState(100);
  const totalPages = Math.ceil(totalPatients / pageSize);
  const [jumpToPage, setJumpToPage] = useState<string>('');

  // Helper: รับ hospital ids สำหรับ filter ตาม network
  const getHospitalIdsForFilter = useCallback(async (hospitalIdFilter: string): Promise<string[]> => {
    if (hospitalIdFilter === 'all') {
      return accessibleHospitalIds;
    }
    const { data: hospital, error } = await supabase
      .from('hospitals')
      .select('id, type, parent_id')
      .eq('id', hospitalIdFilter)
      .single();
    
    if (error || !hospital) return [hospitalIdFilter];

    if (hospital.type === 'main') {
      const { data: subHospitals } = await supabase
        .from('hospitals')
        .select('id')
        .eq('parent_id', hospital.id)
        .eq('is_active', true);
      const subIds = subHospitals?.map(h => h.id) || [];
      return [hospital.id, ...subIds];
    } else {
      return [hospital.id];
    }
  }, [accessibleHospitalIds]);

  // โหลดรายชื่อโค้ชตามโรงพยาบาลที่เลือก
  const loadFilterCoachesByHospital = useCallback(async (hospitalIdFilter: string) => {
    try {
      setLoadingFilters(true);
      const targetHospitalIds = await getHospitalIdsForFilter(hospitalIdFilter);
      const allCoaches = await getCoachesWithHospitals(targetHospitalIds);
      
      const coachesWithCount = await Promise.all(allCoaches.map(async (c: any) => {
        try {
          const { count } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('coach_id', c.user_id)
            .eq('is_active', true);
          return { ...c, patientCount: count || 0, hospitalName: c.users?.hospitals?.name || 'ไม่ระบุ' };
        } catch {
          return { ...c, patientCount: 0, hospitalName: c.users?.hospitals?.name || 'ไม่ระบุ' };
        }
      }));
      
      const sortedCoaches = [...coachesWithCount].sort((a, b) => 
        (a.full_name_th || '').localeCompare(b.full_name_th || '', 'th')
      );
      setFilterCoaches(sortedCoaches);
    } catch (error) {
      debugLog('loadFilterCoachesByHospital', 'error', error);
      setFilterCoaches([]);
    } finally {
      setLoadingFilters(false);
    }
  }, [getHospitalIdsForFilter]);

  useEffect(() => {
    if (!user) return;
    setSelectedCoachFilter('all');
    loadFilterCoachesByHospital(selectedHospitalFilter);
  }, [selectedHospitalFilter, user, loadFilterCoachesByHospital]);

  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }
    if (!['admin', 'doctor', 'helper', 'osm'].includes(userData.role)) {
      alert('ไม่มีสิทธิ์เข้าถึง');
      router.push('/admin/login');
      return;
    }
    setUser(userData);
    loadUserName(userData.id);
    loadUserHospital(userData.id);
    loadAccessibleHospitals(userData.id);
  }, [router]);

  const loadUserName = async (userId: string) => {
    try {
      const { data } = await supabase.from('doctors').select('full_name_th').eq('user_id', userId).single();
      setUserName(data?.full_name_th || 'ผู้ดูแลระบบ');
    } catch {
      setUserName('ผู้ใช้งาน');
    }
  };

  const loadUserHospital = async (userId: string) => {
    try {
      const hospitalInfo = await getUserHospitalInfo(userId);
      setUserHospital(hospitalInfo);
    } catch (error) {
      debugLog('loadUserHospital', 'error', error);
    }
  };

  const loadAccessibleHospitals = async (userId: string) => {
    try {
      const ids = await getAccessibleHospitalIds(userId);
      setAccessibleHospitalIds(ids);
      await loadFilterHospitals(userId, ids);
      await loadPatients(ids.length > 0 ? ids : undefined);
      await loadDeletedPatients(ids);
    } catch (error) {
      debugLog('loadAccessibleHospitals', 'error', error);
      setAccessibleHospitalIds([]);
      setFilterHospitals([]);
      await loadPatients([]);
      await loadDeletedPatients([]);
    } finally {
      setLoading(false);
    }
  };

  const loadFilterHospitals = async (userId: string, accessibleIds: string[]) => {
    try {
      setLoadingFilters(true);
      const allHospitals = await getHospitalsWithHierarchy(isSuperAdmin(user) ? undefined : accessibleIds);
      
      const hospitalsWithCount = await Promise.all(allHospitals.map(async (h: any) => {
        try {
          const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('hospital_id', h.id).eq('is_active', true);
          return { ...h, patientCount: count || 0, typeLabel: h.type === 'main' ? '🏢 แม่ข่าย' : '🏥 ลูกข่าย' };
        } catch {
          return { ...h, patientCount: 0, typeLabel: h.type === 'main' ? '🏢 แม่ข่าย' : '🏥 ลูกข่าย' };
        }
      }));
      
      const sortedHospitals = [...hospitalsWithCount].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'main' ? -1 : 1;
        return (a.name || '').localeCompare(b.name || '', 'th');
      });
      setFilterHospitals(sortedHospitals);
    } catch (error) {
      debugLog('loadFilterHospitals', 'error', error);
      setFilterHospitals([]);
    } finally {
      setLoadingFilters(false);
    }
  };

  // ✅ โหลดข้อมูลผู้ป่วยแบบ Pagination + Server-side Sort
  // ส่ง Parameter แยกกันชัดเจนเพื่อรักษา Permission
  const loadPatients = async (hospitalIds?: string[], forceFetchAll: boolean = false) => {
    try {
      const isAllHospitals = selectedHospitalFilter === 'all';
      const isAllCoaches = selectedCoachFilter === 'all';
      const isAllPam = selectedPamLevel === 'all';
      
      const pamParam = isAllPam ? undefined : selectedPamLevel;
      const coachIdParam = isAllCoaches ? undefined : selectedCoachFilter;
      
      // ✅ ใช้ accessibleHospitalIds สำหรับสิทธิ์เสมอ
      const accessibleIdsParam = hospitalIds;
      // ✅ ใช้ selectedHospitalFilter สำหรับการกรองย่อยเสมอ
      const filterHospitalIdParam = isAllHospitals ? undefined : selectedHospitalFilter;

      // ดึงจำนวนผู้ป่วยทั้งหมด (สำหรับแสดง summary และ pagination)
      const total = await getPatientCount(
        searchTermNameHN,
        searchTermIdCard,
        pamParam,
        accessibleIdsParam, // ✅ ใช้สำหรับนับตามสิทธิ์
        filterHospitalIdParam, // ✅ ใช้สำหรับกรองย่อย
        coachIdParam
      );
      setTotalPatients(total);

      // กำหนดขนาดหน้าสำหรับการดึงข้อมูล
      const fetchPageSize = forceFetchAll ? total : pageSize;
      const fetchCurrentPage = forceFetchAll ? 0 : currentPage;

      // ดึงข้อมูลเฉพาะหน้าปัจจุบัน (หรือทั้งหมดถ้าเป็นโหมด Export All) พร้อม sort จาก database
      const { patients: data } = await getPatientListPaginated(
        fetchCurrentPage,
        fetchPageSize,
        searchTermNameHN,
        searchTermIdCard,
        pamParam,
        accessibleIdsParam, // ✅ ใช้สำหรับบังคับสิทธิ์เสมอ
        filterHospitalIdParam, // ✅ ใช้สำหรับกรองย่อยเสมอ
        coachIdParam,
        sortColumn,
        sortDirection
      );
      setPatients(data);
      
      if (!forceFetchAll) {
        console.log(`📊 [loadPatients] Page ${currentPage + 1}/${totalPages || 1}, Loaded: ${data.length}, Total: ${total}`);
      }
    } catch (error) {
      debugLog('loadPatients', 'error', error);
      setPatients([]);
    }
  };

  const loadDeletedPatients = async (hospitalIds?: string[]) => {
    try {
      const data = await getDeletedPatients();
      let filteredData = data;
      if (!isSuperAdmin(user) && hospitalIds && hospitalIds.length > 0) {
        filteredData = data.filter((p: any) => !p.hospital_id || hospitalIds.includes(p.hospital_id));
      }
      setDeletedPatients(filteredData);
    } catch (error) {
      debugLog('loadDeletedPatients', 'error', error);
      setDeletedPatients([]);
    }
  };

  // รีเซ็ตไปหน้าแรกเมื่อเปลี่ยน filter/search
  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTermNameHN, searchTermIdCard, selectedHospitalFilter, selectedCoachFilter, selectedPamLevel]);

  // โหลดข้อมูลใหม่เมื่อ currentPage หรือ filter ใดๆ เปลี่ยน
  useEffect(() => {
    if (!user) return;
    loadPatients(accessibleHospitalIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, searchTermNameHN, searchTermIdCard, selectedHospitalFilter, selectedCoachFilter, selectedPamLevel, sortColumn, sortDirection, accessibleHospitalIds, user]);

  const handleSearch = useCallback(() => {
    setCurrentPage(0);
  }, []);

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  // Sort: เปลี่ยน column/direction + reset กลับหน้าแรก
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
    setCurrentPage(0);
  };

  const handleJumpToPage = () => {
    const pageNum = parseInt(jumpToPage);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
      setCurrentPage(pageNum - 1);
      setJumpToPage('');
    } else {
      alert(`กรุณาใส่เลขหน้าระหว่าง 1 - ${totalPages}\n`);
    }
  };

  // ✅ ปรับปรุงฟังก์ชัน Export Excel ให้รองรับข้อมูล 3 ส่วนหลัก
  const exportToExcel = async (mode: 'current' | 'all') => {
    let dataToExport = patients;
    
    // ถ้าเลือก Export ทั้งหมด ให้ดึงข้อมูลใหม่โดยไม่จำกัดจำนวนแถว (Force Fetch All)
    if (mode === 'all') {
      await loadPatients(accessibleHospitalIds, true);
      dataToExport = patients; 
    }

    // เตรียมข้อมูลสำหรับสร้าง Excel
    const exportData = await Promise.all(dataToExport.map(async (patient) => {
      const userId = patient.id;
      
      // 1. ดึงข้อมูลการประเมินทั้งหมดเพื่อนับจำนวนและหาล่าสุด
      const { data: screenings } = await supabase
        .from('screenings')
        .select('*')
        .eq('user_id', userId)
        .order('screening_date', { ascending: false });

      const totalScreenings = screenings?.length || 0;
      const latestScreening = screenings && screenings.length > 0 ? screenings[0] : null;

      // คำนวณคะแนน PROM รวม (q1-q4)
      const promsTotal = latestScreening 
        ? (latestScreening.proms_q1_score || 0) + (latestScreening.proms_q2_score || 0) + 
          (latestScreening.proms_q3_score || 0) + (latestScreening.proms_q4_score || 0)
        : '';

      // 2. ดึงข้อมูลการติดตาม (Follow-ups) สูงสุด 4 ครั้ง
      const { data: followups } = await supabase
        .from('appointment_followups')
        .select('*')
        .eq('user_id', userId)
        .order('followup_round', { ascending: true })
        .limit(4);

      // Helper สำหรับจัดรูปแบบความดัน
      const formatBP = (sys: number | null, dia: number | null) => {
        return (sys && dia) ? `${sys}/${dia}` : '';
      };

      // สร้าง Object ข้อมูลตามโครงสร้างที่กำหนด
      return {
        // --- ส่วนที่ 1: ข้อมูลส่วนตัว (1-13) ---
        'ID Card': patient.users?.id_card || '',
        'ชื่อ': patient.first_name || '',
        'นามสกุล': patient.last_name || '',
        'HN': patient.hospital_number || '',
        'วันเกิด': patient.birth_date || '',
        'อายุ': patient.age || '',
        'น้ำหนัก': patient.current_weight || '',
        'ส่วนสูง': patient.height || '',
        'รอบเอว': patient.waist_circumference || '',
        'BMI': patient.bmi || '',
        'กลุ่มเสี่ยง/เบาหวาน': patient.diabetes_type || '',
        'ค่าน้ำตาล': patient.blood_sugar || '',
        'ค่า HbA1C': patient.hba1c_level || '',

        // --- ส่วนที่ 2: การประเมินล่าสุด (14-17) ---
        'จำนวนครั้งที่ประเมิน': totalScreenings,
        'วันที่ประเมินล่าสุด': latestScreening?.screening_date || '',
        'คะแนน PROM': promsTotal,
        'คะแนน PAM': latestScreening?.pam_total_score || '',

        // --- ส่วนที่ 3: รายละเอียดการติดตาม (เรียงตาม Round 1-4) ---
        // รอบที่ 1
        'F1 วันที่': followups?.[0]?.followup_date || '',
        'F1 น้ำหนัก': followups?.[0]?.weight || '',
        'F1 รอบเอว': followups?.[0]?.waist_circumference || '',
        'F1 ความดัน': formatBP(followups?.[0]?.blood_pressure_sys, followups?.[0]?.blood_pressure_dia),
        'F1 น้ำตาล': followups?.[0]?.blood_sugar_dtx || '',
        'F1 ความมั่นใจ': followups?.[0]?.confidence_score || '',
        'F1 แผนอาหาร(ปริมาณ)': followups?.[0]?.food_amount_status || '',
        'F1 แผนอาหาร(ชนิด)': followups?.[0]?.food_type_status || '',
        'F1 แผนเคลื่อนไหว': followups?.[0]?.movement_status || '',

        // รอบที่ 2
        'F2 วันที่': followups?.[1]?.followup_date || '',
        'F2 น้ำหนัก': followups?.[1]?.weight || '',
        'F2 รอบเอว': followups?.[1]?.waist_circumference || '',
        'F2 ความดัน': formatBP(followups?.[1]?.blood_pressure_sys, followups?.[1]?.blood_pressure_dia),
        'F2 น้ำตาล': followups?.[1]?.blood_sugar_dtx || '',
        'F2 ความมั่นใจ': followups?.[1]?.confidence_score || '',
        'F2 แผนอาหาร(ปริมาณ)': followups?.[1]?.food_amount_status || '',
        'F2 แผนอาหาร(ชนิด)': followups?.[1]?.food_type_status || '',
        'F2 แผนเคลื่อนไหว': followups?.[1]?.movement_status || '',

        // รอบที่ 3
        'F3 วันที่': followups?.[2]?.followup_date || '',
        'F3 น้ำหนัก': followups?.[2]?.weight || '',
        'F3 รอบเอว': followups?.[2]?.waist_circumference || '',
        'F3 ความดัน': formatBP(followups?.[2]?.blood_pressure_sys, followups?.[2]?.blood_pressure_dia),
        'F3 น้ำตาล': followups?.[2]?.blood_sugar_dtx || '',
        'F3 ความมั่นใจ': followups?.[2]?.confidence_score || '',
        'F3 แผนอาหาร(ปริมาณ)': followups?.[2]?.food_amount_status || '',
        'F3 แผนอาหาร(ชนิด)': followups?.[2]?.food_type_status || '',
        'F3 แผนเคลื่อนไหว': followups?.[2]?.movement_status || '',

        // รอบที่ 4
        'F4 วันที่': followups?.[3]?.followup_date || '',
        'F4 น้ำหนัก': followups?.[3]?.weight || '',
        'F4 รอบเอว': followups?.[3]?.waist_circumference || '',
        'F4 ความดัน': formatBP(followups?.[3]?.blood_pressure_sys, followups?.[3]?.blood_pressure_dia),
        'F4 น้ำตาล': followups?.[3]?.blood_sugar_dtx || '',
        'F4 ความมั่นใจ': followups?.[3]?.confidence_score || '',
        'F4 แผนอาหาร(ปริมาณ)': followups?.[3]?.food_amount_status || '',
        'F4 แผนอาหาร(ชนิด)': followups?.[3]?.food_type_status || '',
        'F4 แผนเคลื่อนไหว': followups?.[3]?.movement_status || '',
      };
    }));

    // สร้าง Worksheet และ Workbook
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // ตั้งค่าความกว้างคอลัมน์ให้เหมาะสมกับข้อมูลภาษาไทยและตัวเลข
    ws['!cols'] = [
      { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, // 1-6
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 15 }, { wch: 10 }, { wch: 10 }, // 7-13
      { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, // 14-17
      // Follow-up 1-4 (9 คอลัมน์ต่อรอบ x 4 รอบ = 36 คอลัมน์)
      ...Array(36).fill({ wch: 12 }) 
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ข้อมูลผู้ป่วย');
    
    const fileName = `patients_export_${mode}_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const handleDeletePatient = async (patientId: string, patientName: string) => {
    if (user?.role === 'osm') {
      alert('❌ อสม. ไม่มีสิทธิ์ลบข้อมูลผู้ป่วย');
      return;
    }
    if (!confirm(`⚠️ ยืนยันการลบผู้ป่วย ${patientName}? จะย้ายไปถังขยะ\n`)) return;
    try {
      const result = await deletePatient(patientId);
      if (result.success) {
        alert('✅ ลบผู้ป่วยสำเร็จ!');
        await loadPatients(accessibleHospitalIds);
        await loadDeletedPatients(accessibleHospitalIds);
      } else {
        alert('❌ เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      alert('❌ เกิดข้อผิดพลาดในการลบ');
    }
  };

  const handleRestorePatient = async (patientId: string, patientName: string) => {
    if (user?.role === 'osm') {
      alert('❌ อสม. ไม่มีสิทธิ์กู้คืน');
      return;
    }
    if (!confirm(`♻️ ยืนยันการกู้คืนผู้ป่วย ${patientName}?\n`)) return;
    try {
      const result = await restorePatient(patientId);
      if (result.success) {
        alert('✅ กู้คืนสำเร็จ');
        await loadPatients(accessibleHospitalIds);
        await loadDeletedPatients(accessibleHospitalIds);
      } else {
        alert('❌ เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      alert('❌ เกิดข้อผิดพลาด');
    }
  };

  const handlePermanentlyDeletePatient = async (patientId: string, patientName: string) => {
    if (user?.role === 'osm') {
      alert('❌ อสม. ไม่มีสิทธิ์ลบถาวร');
      return;
    }
    if (!confirm(`⚠️ คำเตือน: ลบถาวร ${patientName} ไม่สามารถกู้คืนได้!\n`)) return;
    const secondConfirm = prompt('พิมพ์ "YES" (ตัวพิมพ์ใหญ่) เพื่อยืนยันการลบถาวร:');
    if (secondConfirm !== 'YES') {
      alert('ยกเลิกการลบถาวร');
      return;
    }
    try {
      const result = await permanentlyDeletePatient(patientId);
      if (result.success) {
        alert('✅ ลบถาวรสำเร็จ');
        await loadDeletedPatients(accessibleHospitalIds);
      } else {
        alert('❌ เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      alert('❌ เกิดข้อผิดพลาด');
    }
  };

  const canDeleteData = () => user?.role !== 'osm';

  const getRoleBadge = () => {
    if (!user) return null;
    const roleConfig: any = {
      'osm': { text: '🏘️ อสม.', bg: 'bg-orange-100', textCol: 'text-orange-700' },
      'admin': { text: isSuperAdmin(user) ? '👑 Super Admin' : '🏥 Hospital Admin', bg: isSuperAdmin(user) ? 'bg-purple-100' : 'bg-blue-100', textCol: isSuperAdmin(user) ? 'text-purple-700' : 'text-blue-700' },
      'doctor': { text: '👨‍⚕️ แพทย์', bg: 'bg-green-100', textCol: 'text-green-700' },
      'helper': { text: '👩‍ เจ้าหน้าที่', bg: 'bg-yellow-100', textCol: 'text-yellow-700' }
    };
    const config = roleConfig[user.role] || { text: user.role, bg: 'bg-gray-100', textCol: 'text-gray-700' };
    return <span className={`px-2 py-1 ${config.bg} ${config.textCol} rounded text-xs font-semibold`}>{config.text}</span>;
  };

  const getSortIcon = (columnName: string) => {
    if (sortColumn !== columnName) return <ChevronsUpDown className="w-4 h-4 ml-1 opacity-30" />;
    return sortDirection === 'asc' ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />;
  };

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;
    if (totalPages <= maxVisible) {
      for (let i = 0; i < totalPages; i++) pages.push(i);
    } else {
      if (currentPage < 3) {
        for (let i = 0; i < maxVisible - 1; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages - 1);
      } else if (currentPage > totalPages - 4) {
        pages.push(0);
        pages.push('...');
        for (let i = totalPages - maxVisible + 1; i < totalPages; i++) pages.push(i);
      } else {
        pages.push(0);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages - 1);
      }
    }
    return pages;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button onClick={() => router.push('/admin/dashboard')} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4">
            <ArrowLeft className="w-4 h-4" /> กลับ Dashboard
          </button>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">👥 จัดการผู้ป่วย</h1>
              <p className="text-gray-600">จัดการข้อมูลผู้ป่วยและติดตามผลการรักษา</p>
            </div>
            <div className="flex-1 max-w-md mx-4">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                    <Users className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-800">{userName}</h3>
                      {getRoleBadge()}
                    </div>
                    {userHospital && (
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2 text-gray-600">
                          <Hospital className="w-4 h-4 text-blue-500" />
                          <span>{userHospital.name}</span>
                        </div>
                        {userHospital.type === 'sub' && userHospital.parent_hospital && (
                          <div className="flex items-center gap-2 text-green-600">
                            <div className="w-4 h-4">🏥</divนี่คือไฟล์ `app/admin/patients/page.tsx` ฉบับสมบูรณ์ที่ปรับปรุงแล้ว โดยมีการแทนที่ฟังก์ชัน `exportToExcel` ด้วยเวอร์ชันใหม่ที่ดึงข้อมูลตามโครงสร้างฐานข้อมูลและข้อกำหนดในเอกสารครับ

คุณสามารถนำโค้ดทั้งหมดนี้ไปวางทับไฟล์เดิมได้เลยครับ

```tsx
// app/admin/patients/page.tsx
'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import {
  checkSession,
  logout,
  getPatientListPaginated,
  getPatientCount,
  deletePatient,
  restorePatient,
  permanentlyDeletePatient,
  getDeletedPatients,
  getAccessibleHospitalIds,
  getUserHospitalInfo,
  isSuperAdmin,
  getHospitalsWithHierarchy,
  getCoachesWithHospitals
} from '@/lib/supabase/queries';
import {
  Users, Plus, Eye, Edit, Trash2, LogOut, ArrowLeft, UserCheck,
  Archive, RotateCcw, AlertCircle, Search, Filter, Hospital,
  Calendar, Phone, Mail, MapPin, XCircle, CheckCircle, Lock, Shield,
  ChevronUp, ChevronDown, ChevronsUpDown, User, Building2, Loader2,
  FileSpreadsheet, ChevronLeft, ChevronRight, SkipBack, SkipForward, Download
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

const debugLog = (module: string, message: string, data?: any) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`🔍 [${module}] ${message}\n`, data !== undefined ? JSON.stringify(data, null, 2) : '');
  }
};

export default function PatientManagementPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [patients, setPatients] = useState<any[]>([]);
  const [deletedPatients, setDeletedPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // ✅ Search States แยกกันชัดเจน เพื่อแก้ปัญหา Permission และ Search ผิดที่
  const [searchTermNameHN, setSearchTermNameHN] = useState('');
  const [searchTermIdCard, setSearchTermIdCard] = useState('');
  const [selectedPamLevel, setSelectedPamLevel] = useState<string>('all');
  const [showDeletedModal, setShowDeletedModal] = useState(false);
  const [accessibleHospitalIds, setAccessibleHospitalIds] = useState<string[]>([]);
  const [userHospital, setUserHospital] = useState<any>(null);
  const [userName, setUserName] = useState<string>('');
  const [selectedHospitalFilter, setSelectedHospitalFilter] = useState<string>('all');
  const [selectedCoachFilter, setSelectedCoachFilter] = useState<string>('all');
  const [filterHospitals, setFilterHospitals] = useState<any[]>([]);
  const [filterCoaches, setFilterCoaches] = useState<any[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(false);

  // Sort State
  const [sortColumn, setSortColumn] = useState<string>('first_name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Pagination State - แสดงหน้าละ 100 คน
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPatients, setTotalPatients] = useState(0);
  const [pageSize] = useState(100);
  const totalPages = Math.ceil(totalPatients / pageSize);
  const [jumpToPage, setJumpToPage] = useState<string>('');

  // Helper: รับ hospital ids สำหรับ filter ตาม network
  const getHospitalIdsForFilter = useCallback(async (hospitalIdFilter: string): Promise<string[]> => {
    if (hospitalIdFilter === 'all') {
      return accessibleHospitalIds;
    }
    const { data: hospital, error } = await supabase
      .from('hospitals')
      .select('id, type, parent_id')
      .eq('id', hospitalIdFilter)
      .single();
    
    if (error || !hospital) return [hospitalIdFilter];

    if (hospital.type === 'main') {
      const { data: subHospitals } = await supabase
        .from('hospitals')
        .select('id')
        .eq('parent_id', hospital.id)
        .eq('is_active', true);
      const subIds = subHospitals?.map(h => h.id) || [];
      return [hospital.id, ...subIds];
    } else {
      return [hospital.id];
    }
  }, [accessibleHospitalIds]);

  // โหลดรายชื่อโค้ชตามโรงพยาบาลที่เลือก
  const loadFilterCoachesByHospital = useCallback(async (hospitalIdFilter: string) => {
    try {
      setLoadingFilters(true);
      const targetHospitalIds = await getHospitalIdsForFilter(hospitalIdFilter);
      const allCoaches = await getCoachesWithHospitals(targetHospitalIds);
      
      const coachesWithCount = await Promise.all(allCoaches.map(async (c: any) => {
        try {
          const { count } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('coach_id', c.user_id)
            .eq('is_active', true);
          return { ...c, patientCount: count || 0, hospitalName: c.users?.hospitals?.name || 'ไม่ระบุ' };
        } catch {
          return { ...c, patientCount: 0, hospitalName: c.users?.hospitals?.name || 'ไม่ระบุ' };
        }
      }));
      
      const sortedCoaches = [...coachesWithCount].sort((a, b) => 
        (a.full_name_th || '').localeCompare(b.full_name_th || '', 'th')
      );
      setFilterCoaches(sortedCoaches);
    } catch (error) {
      debugLog('loadFilterCoachesByHospital', 'error', error);
      setFilterCoaches([]);
    } finally {
      setLoadingFilters(false);
    }
  }, [getHospitalIdsForFilter]);

  useEffect(() => {
    if (!user) return;
    setSelectedCoachFilter('all');
    loadFilterCoachesByHospital(selectedHospitalFilter);
  }, [selectedHospitalFilter, user, loadFilterCoachesByHospital]);

  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }
    if (!['admin', 'doctor', 'helper', 'osm'].includes(userData.role)) {
      alert('ไม่มีสิทธิ์เข้าถึง');
      router.push('/admin/login');
      return;
    }
    setUser(userData);
    loadUserName(userData.id);
    loadUserHospital(userData.id);
    loadAccessibleHospitals(userData.id);
  }, [router]);

  const loadUserName = async (userId: string) => {
    try {
      const { data } = await supabase.from('doctors').select('full_name_th').eq('user_id', userId).single();
      setUserName(data?.full_name_th || 'ผู้ดูแลระบบ');
    } catch {
      setUserName('ผู้ใช้งาน');
    }
  };

  const loadUserHospital = async (userId: string) => {
    try {
      const hospitalInfo = await getUserHospitalInfo(userId);
      setUserHospital(hospitalInfo);
    } catch (error) {
      debugLog('loadUserHospital', 'error', error);
    }
  };

  const loadAccessibleHospitals = async (userId: string) => {
    try {
      const ids = await getAccessibleHospitalIds(userId);
      setAccessibleHospitalIds(ids);
      await loadFilterHospitals(userId, ids);
      await loadPatients(ids.length > 0 ? ids : undefined);
      await loadDeletedPatients(ids);
    } catch (error) {
      debugLog('loadAccessibleHospitals', 'error', error);
      setAccessibleHospitalIds([]);
      setFilterHospitals([]);
      await loadPatients([]);
      await loadDeletedPatients([]);
    } finally {
      setLoading(false);
    }
  };

  const loadFilterHospitals = async (userId: string, accessibleIds: string[]) => {
    try {
      setLoadingFilters(true);
      const allHospitals = await getHospitalsWithHierarchy(isSuperAdmin(user) ? undefined : accessibleIds);
      
      const hospitalsWithCount = await Promise.all(allHospitals.map(async (h: any) => {
        try {
          const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('hospital_id', h.id).eq('is_active', true);
          return { ...h, patientCount: count || 0, typeLabel: h.type === 'main' ? '🏢 แม่ข่าย' : '🏥 ลูกข่าย' };
        } catch {
          return { ...h, patientCount: 0, typeLabel: h.type === 'main' ? '🏢 แม่ข่าย' : '🏥 ลูกข่าย' };
        }
      }));
      
      const sortedHospitals = [...hospitalsWithCount].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'main' ? -1 : 1;
        return (a.name || '').localeCompare(b.name || '', 'th');
      });
      setFilterHospitals(sortedHospitals);
    } catch (error) {
      debugLog('loadFilterHospitals', 'error', error);
      setFilterHospitals([]);
    } finally {
      setLoadingFilters(false);
    }
  };

  // ✅ โหลดข้อมูลผู้ป่วยแบบ Pagination + Server-side Sort
  // ส่ง Parameter แยกกันชัดเจนเพื่อรักษา Permission
  const loadPatients = async (hospitalIds?: string[], forceFetchAll: boolean = false) => {
    try {
      const isAllHospitals = selectedHospitalFilter === 'all';
      const isAllCoaches = selectedCoachFilter === 'all';
      const isAllPam = selectedPamLevel === 'all';
      
      const pamParam = isAllPam ? undefined : selectedPamLevel;
      const coachIdParam = isAllCoaches ? undefined : selectedCoachFilter;
      
      // ✅ ใช้ accessibleHospitalIds สำหรับสิทธิ์เสมอ
      const accessibleIdsParam = hospitalIds;
      // ✅ ใช้ selectedHospitalFilter สำหรับการกรองย่อยเสมอ
      const filterHospitalIdParam = isAllHospitals ? undefined : selectedHospitalFilter;

      // ดึงจำนวนผู้ป่วยทั้งหมด (สำหรับแสดง summary และ pagination)
      const total = await getPatientCount(
        searchTermNameHN,
        searchTermIdCard,
        pamParam,
        accessibleIdsParam, // ✅ ใช้สำหรับนับตามสิทธิ์
        filterHospitalIdParam, // ✅ ใช้สำหรับกรองย่อย
        coachIdParam
      );
      setTotalPatients(total);

      // กำหนดขนาดหน้าสำหรับการดึงข้อมูล
      const fetchPageSize = forceFetchAll ? total : pageSize;
      const fetchCurrentPage = forceFetchAll ? 0 : currentPage;

      // ดึงข้อมูลเฉพาะหน้าปัจจุบัน (หรือทั้งหมดถ้าเป็นโหมด Export All) พร้อม sort จาก database
      const { patients: data } = await getPatientListPaginated(
        fetchCurrentPage,
        fetchPageSize,
        searchTermNameHN,
        searchTermIdCard,
        pamParam,
        accessibleIdsParam, // ✅ ใช้สำหรับบังคับสิทธิ์เสมอ
        filterHospitalIdParam, // ✅ ใช้สำหรับกรองย่อยเสมอ
        coachIdParam,
        sortColumn,
        sortDirection
      );
      setPatients(data);
      
      if (!forceFetchAll) {
        console.log(`📊 [loadPatients] Page ${currentPage + 1}/${totalPages || 1}, Loaded: ${data.length}, Total: ${total}`);
      }
    } catch (error) {
      debugLog('loadPatients', 'error', error);
      setPatients([]);
    }
  };

  const loadDeletedPatients = async (hospitalIds?: string[]) => {
    try {
      const data = await getDeletedPatients();
      let filteredData = data;
      if (!isSuperAdmin(user) && hospitalIds && hospitalIds.length > 0) {
        filteredData = data.filter((p: any) => !p.hospital_id || hospitalIds.includes(p.hospital_id));
      }
      setDeletedPatients(filteredData);
    } catch (error) {
      debugLog('loadDeletedPatients', 'error', error);
      setDeletedPatients([]);
    }
  };

  // รีเซ็ตไปหน้าแรกเมื่อเปลี่ยน filter/search
  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTermNameHN, searchTermIdCard, selectedHospitalFilter, selectedCoachFilter, selectedPamLevel]);

  // โหลดข้อมูลใหม่เมื่อ currentPage หรือ filter ใดๆ เปลี่ยน
  useEffect(() => {
    if (!user) return;
    loadPatients(accessibleHospitalIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, searchTermNameHN, searchTermIdCard, selectedHospitalFilter, selectedCoachFilter, selectedPamLevel, sortColumn, sortDirection, accessibleHospitalIds, user]);

  const handleSearch = useCallback(() => {
    setCurrentPage(0);
  }, []);

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  // Sort: เปลี่ยน column/direction + reset กลับหน้าแรก
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
    setCurrentPage(0);
  };

  const handleJumpToPage = () => {
    const pageNum = parseInt(jumpToPage);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
      setCurrentPage(pageNum - 1);
      setJumpToPage('');
    } else {
      alert(`กรุณาใส่เลขหน้าระหว่าง 1 - ${totalPages}\n`);
    }
  };

  // ✅ ปรับปรุงฟังก์ชัน Export Excel ให้รองรับข้อมูล 3 ส่วนหลัก
  const exportToExcel = async (mode: 'current' | 'all') => {
    let dataToExport = patients;
    
    // ถ้าเลือก Export ทั้งหมด ให้ดึงข้อมูลใหม่โดยไม่จำกัดจำนวนแถว (Force Fetch All)
    if (mode === 'all') {
      await loadPatients(accessibleHospitalIds, true);
      dataToExport = patients; 
    }

    // เตรียมข้อมูลสำหรับสร้าง Excel
    const exportData = await Promise.all(dataToExport.map(async (patient) => {
      const userId = patient.id;
      
      // 1. ดึงข้อมูลการประเมินทั้งหมดเพื่อนับจำนวนและหาล่าสุด
      const { data: screenings } = await supabase
        .from('screenings')
        .select('*')
        .eq('user_id', userId)
        .order('screening_date', { ascending: false });

      const totalScreenings = screenings?.length || 0;
      const latestScreening = screenings && screenings.length > 0 ? screenings[0] : null;

      // คำนวณคะแนน PROM รวม (q1-q4)
      const promsTotal = latestScreening 
        ? (latestScreening.proms_q1_score || 0) + (latestScreening.proms_q2_score || 0) + 
          (latestScreening.proms_q3_score || 0) + (latestScreening.proms_q4_score || 0)
        : '';

      // 2. ดึงข้อมูลการติดตาม (Follow-ups) สูงสุด 4 ครั้ง
      const { data: followups } = await supabase
        .from('appointment_followups')
        .select('*')
        .eq('user_id', userId)
        .order('followup_round', { ascending: true })
        .limit(4);

      // Helper สำหรับจัดรูปแบบความดัน
      const formatBP = (sys: number | null, dia: number | null) => {
        return (sys && dia) ? `${sys}/${dia}` : '';
      };

      // สร้าง Object ข้อมูลตามโครงสร้างที่กำหนด
      return {
        // --- ส่วนที่ 1: ข้อมูลส่วนตัว (1-13) ---
        'ID Card': patient.users?.id_card || '',
        'ชื่อ': patient.first_name || '',
        'นามสกุล': patient.last_name || '',
        'HN': patient.hospital_number || '',
        'วันเกิด': patient.birth_date || '',
        'อายุ': patient.age || '',
        'น้ำหนัก': patient.current_weight || '',
        'ส่วนสูง': patient.height || '',
        'รอบเอว': patient.waist_circumference || '',
        'BMI': patient.bmi || '',
        'กลุ่มเสี่ยง/เบาหวาน': patient.diabetes_type || '',
        'ค่าน้ำตาล': patient.blood_sugar || '',
        'ค่า HbA1C': patient.hba1c_level || '',

        // --- ส่วนที่ 2: การประเมินล่าสุด (14-17) ---
        'จำนวนครั้งที่ประเมิน': totalScreenings,
        'วันที่ประเมินล่าสุด': latestScreening?.screening_date || '',
        'คะแนน PROM': promsTotal,
        'คะแนน PAM': latestScreening?.pam_total_score || '',

        // --- ส่วนที่ 3: รายละเอียดการติดตาม (เรียงตาม Round 1-4) ---
        // รอบที่ 1
        'F1 วันที่': followups?.[0]?.followup_date || '',
        'F1 น้ำหนัก': followups?.[0]?.weight || '',
        'F1 รอบเอว': followups?.[0]?.waist_circumference || '',
        'F1 ความดัน': formatBP(followups?.[0]?.blood_pressure_sys, followups?.[0]?.blood_pressure_dia),
        'F1 น้ำตาล': followups?.[0]?.blood_sugar_dtx || '',
        'F1 ความมั่นใจ': followups?.[0]?.confidence_score || '',
        'F1 แผนอาหาร(ปริมาณ)': followups?.[0]?.food_amount_status || '',
        'F1 แผนอาหาร(ชนิด)': followups?.[0]?.food_type_status || '',
        'F1 แผนเคลื่อนไหว': followups?.[0]?.movement_status || '',

        // รอบที่ 2
        'F2 วันที่': followups?.[1]?.followup_date || '',
        'F2 น้ำหนัก': followups?.[1]?.weight || '',
        'F2 รอบเอว': followups?.[1]?.waist_circumference || '',
        'F2 ความดัน': formatBP(followups?.[1]?.blood_pressure_sys, followups?.[1]?.blood_pressure_dia),
        'F2 น้ำตาล': followups?.[1]?.blood_sugar_dtx || '',
        'F2 ความมั่นใจ': followups?.[1]?.confidence_score || '',
        'F2 แผนอาหาร(ปริมาณ)': followups?.[1]?.food_amount_status || '',
        'F2 แผนอาหาร(ชนิด)': followups?.[1]?.food_type_status || '',
        'F2 แผนเคลื่อนไหว': followups?.[1]?.movement_status || '',

        // รอบที่ 3
        'F3 วันที่': followups?.[2]?.followup_date || '',
        'F3 น้ำหนัก': followups?.[2]?.weight || '',
        'F3 รอบเอว': followups?.[2]?.waist_circumference || '',
        'F3 ความดัน': formatBP(followups?.[2]?.blood_pressure_sys, followups?.[2]?.blood_pressure_dia),
        'F3 น้ำตาล': followups?.[2]?.blood_sugar_dtx || '',
        'F3 ความมั่นใจ': followups?.[2]?.confidence_score || '',
        'F3 แผนอาหาร(ปริมาณ)': followups?.[2]?.food_amount_status || '',
        'F3 แผนอาหาร(ชนิด)': followups?.[2]?.food_type_status || '',
        'F3 แผนเคลื่อนไหว': followups?.[2]?.movement_status || '',

        // รอบที่ 4
        'F4 วันที่': followups?.[3]?.followup_date || '',
        'F4 น้ำหนัก': followups?.[3]?.weight || '',
        'F4 รอบเอว': followups?.[3]?.waist_circumference || '',
        'F4 ความดัน': formatBP(followups?.[3]?.blood_pressure_sys, followups?.[3]?.blood_pressure_dia),
        'F4 น้ำตาล': followups?.[3]?.blood_sugar_dtx || '',
        'F4 ความมั่นใจ': followups?.[3]?.confidence_score || '',
        'F4 แผนอาหาร(ปริมาณ)': followups?.[3]?.food_amount_status || '',
        'F4 แผนอาหาร(ชนิด)': followups?.[3]?.food_type_status || '',
        'F4 แผนเคลื่อนไหว': followups?.[3]?.movement_status || '',
      };
    }));

    // สร้าง Worksheet และ Workbook
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // ตั้งค่าความกว้างคอลัมน์ให้เหมาะสมกับข้อมูลภาษาไทยและตัวเลข
    ws['!cols'] = [
      { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, // 1-6
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 15 }, { wch: 10 }, { wch: 10 }, // 7-13
      { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, // 14-17
      // Follow-up 1-4 (9 คอลัมน์ต่อรอบ x 4 รอบ = 36 คอลัมน์)
      ...Array(36).fill({ wch: 12 }) 
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ข้อมูลผู้ป่วย');
    
    const fileName = `patients_export_${mode}_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const handleDeletePatient = async (patientId: string, patientName: string) => {
    if (user?.role === 'osm') {
      alert('❌ อสม. ไม่มีสิทธิ์ลบข้อมูลผู้ป่วย');
      return;
    }
    if (!confirm(`⚠️ ยืนยันการลบผู้ป่วย ${patientName}? จะย้ายไปถังขยะ\n`)) return;
    try {
      const result = await deletePatient(patientId);
      if (result.success) {
        alert('✅ ลบผู้ป่วยสำเร็จ!');
        await loadPatients(accessibleHospitalIds);
        await loadDeletedPatients(accessibleHospitalIds);
      } else {
        alert('❌ เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      alert('❌ เกิดข้อผิดพลาดในการลบ');
    }
  };

  const handleRestorePatient = async (patientId: string, patientName: string) => {
    if (user?.role === 'osm') {
      alert('❌ อสม. ไม่มีสิทธิ์กู้คืน');
      return;
    }
    if (!confirm(`♻️ ยืนยันการกู้คืนผู้ป่วย ${patientName}?\n`)) return;
    try {
      const result = await restorePatient(patientId);
      if (result.success) {
        alert('✅ กู้คืนสำเร็จ');
        await loadPatients(accessibleHospitalIds);
        await loadDeletedPatients(accessibleHospitalIds);
      } else {
        alert('❌ เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      alert('❌ เกิดข้อผิดพลาด');
    }
  };

  const handlePermanentlyDeletePatient = async (patientId: string, patientName: string) => {
    if (user?.role === 'osm') {
      alert('❌ อสม. ไม่มีสิทธิ์ลบถาวร');
      return;
    }
    if (!confirm(`⚠️ คำเตือน: ลบถาวร ${patientName} ไม่สามารถกู้คืนได้!\n`)) return;
    const secondConfirm = prompt('พิมพ์ "YES" (ตัวพิมพ์ใหญ่) เพื่อยืนยันการลบถาวร:');
    if (secondConfirm !== 'YES') {
      alert('ยกเลิกการลบถาวร');
      return;
    }
    try {
      const result = await permanentlyDeletePatient(patientId);
      if (result.success) {
        alert('✅ ลบถาวรสำเร็จ');
        await loadDeletedPatients(accessibleHospitalIds);
      } else {
        alert('❌ เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      alert('❌ เกิดข้อผิดพลาด');
    }
  };

  const canDeleteData = () => user?.role !== 'osm';

  const getRoleBadge = () => {
    if (!user) return null;
    const roleConfig: any = {
      'osm': { text: '🏘️ อสม.', bg: 'bg-orange-100', textCol: 'text-orange-700' },
      'admin': { text: isSuperAdmin(user) ? '👑 Super Admin' : '🏥 Hospital Admin', bg: isSuperAdmin(user) ? 'bg-purple-100' : 'bg-blue-100', textCol: isSuperAdmin(user) ? 'text-purple-700' : 'text-blue-700' },
      'doctor': { text: '👨‍⚕️ แพทย์', bg: 'bg-green-100', textCol: 'text-green-700' },
      'helper': { text: '👩‍ เจ้าหน้าที่', bg: 'bg-yellow-100', textCol: 'text-yellow-700' }
    };
    const config = roleConfig[user.role] || { text: user.role, bg: 'bg-gray-100', textCol: 'text-gray-700' };
    return <span className={`px-2 py-1 ${config.bg} ${config.textCol} rounded text-xs font-semibold`}>{config.text}</span>;
  };

  const getSortIcon = (columnName: string) => {
    if (sortColumn !== columnName) return <ChevronsUpDown className="w-4 h-4 ml-1 opacity-30" />;
    return sortDirection === 'asc' ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />;
  };

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;
    if (totalPages <= maxVisible) {
      for (let i = 0; i < totalPages; i++) pages.push(i);
    } else {
      if (currentPage < 3) {
        for (let i = 0; i < maxVisible - 1; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages - 1);
      } else if (currentPage > totalPages - 4) {
        pages.push(0);
        pages.push('...');
        for (let i = totalPages - maxVisible + 1; i < totalPages; i++) pages.push(i);
      } else {
        pages.push(0);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages - 1);
      }
    }
    return pages;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button onClick={() => router.push('/admin/dashboard')} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4">
            <ArrowLeft className="w-4 h-4" /> กลับ Dashboard
          </button>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">👥 จัดการผู้ป่วย</h1>
              <p className="text-gray-600">จัดการข้อมูลผู้ป่วยและติดตามผลการรักษา</p>
            </div>
            <div className="flex-1 max-w-md mx-4">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                    <Users className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-800">{userName}</h3>
                      {getRoleBadge()}
                    </div>
                    {userHospital && (
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2 text-gray-600">
                          <Hospital className="w-4 h-4 text-blue-500" />
                          <span>{userHospital.name}</span>
                        </div>
                        {userHospital.type === 'sub' && userHospital.parent_hospital && (
                          <div className="flex items-center gap-2 text-green-600">
                            <div className="w-4 h-4">🏥</div>
                            <span>ลูกข่าย: {userHospital.parent_hospital.name}</span>
                          </div>
                        )}
                        {userHospital.type === 'main' && (
                          <div className="flex items-center gap-2 text-purple-600">
                            <div className="w-4 h-4">🏢</div>
                            <span>แม่ข่าย</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {canDeleteData() && (
                <button onClick={() => setShowDeletedModal(true)} className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600">
                  <Archive className="w-4 h-4" /> ที่ลบแล้ว ({deletedPatients.length})
                </button>
              )}
              <button onClick={() => router.push('/admin/patients/new')} className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                <Plus className="w-4 h-4" /> เพิ่มผู้ป่วยใหม่
              </button>
              <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">
                <LogOut className="w-4 h-4" /> ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-lg p-4 border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center"><Users className="w-5 h-5 text-blue-600" /></div>
              <div><p className="text-sm text-gray-500">ผู้ป่วยทั้งหมด</p><p className="text-2xl font-bold">{totalPatients.toLocaleString()}</p></div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4 border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center"><CheckCircle className="w-5 h-5 text-green-600" /></div>
              <div><p className="text-sm text-gray-500">Green Zone</p><p className="text-2xl font-bold">{patients.filter(p => p.zone === 'Green Zone').length}</p></div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4 border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center"><AlertCircle className="w-5 h-5 text-yellow-600" /></div>
              <div><p className="text-sm text-gray-500">Yellow Zone</p><p className="text-2xl font-bold">{patients.filter(p => p.zone === 'Yellow Zone').length}</p></div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4 border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center"><XCircle className="w-5 h-5 text-red-600" /></div>
              <div><p className="text-sm text-gray-500">Red Zone</p><p className="text-2xl font-bold">{patients.filter(p => p.zone === 'Red Zone').length}</p></div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
            {/* ✅ ช่องค้นหาแยก: ชื่อ/HN */}
            <div className="lg:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Search className="w-4 h-4 inline mr-1" /> ค้นหา ชื่อ / HN
              </label>
              <input
                type="text"
                value={searchTermNameHN}
                onChange={(e) => setSearchTermNameHN(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="พิมพ์ชื่อ หรือ HN..."
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {/* ✅ ช่องค้นหาแยก: ID Card */}
            <div className="lg:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User className="w-4 h-4 inline mr-1" /> ค้นหา ID Card
              </label>
              <input
                type="text"
                value={searchTermIdCard}
                onChange={(e) => setSearchTermIdCard(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="พิมพ์เลขบัตรประชาชน..."
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Building2 className="w-4 h-4 inline mr-1" /> โรงพยาบาล
              </label>
              <select
                value={selectedHospitalFilter}
                onChange={(e) => setSelectedHospitalFilter(e.target.value)}
                disabled={loadingFilters}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              >
                <option value="all">ทั้งหมด ({totalPatients.toLocaleString()})</option>
                {filterHospitals.map((h: any) => (
                  <option key={h.id} value={h.id}>{h.typeLabel} {h.name} ({h.patientCount} คน)</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User className="w-4 h-4 inline mr-1" /> โค้ชผู้ดูแล
              </label>
              <select
                value={selectedCoachFilter}
                onChange={(e) => setSelectedCoachFilter(e.target.value)}
                disabled={loadingFilters}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              >
                <option value="all">ทั้งหมด</option>
                {filterCoaches.map((c: any) => (
                  <option key={c.user_id} value={c.user_id}>{c.full_name_th} | {c.hospitalName} ({c.patientCount} คน)</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Filter className="w-4 h-4 inline mr-1" /> PAM Level
              </label>
              <select
                value={selectedPamLevel}
                onChange={(e) => setSelectedPamLevel(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">ทั้งหมด</option>
                <option value="L0">L0 - ไม่ทราบ</option>
                <option value="L1">L1 - Deny</option>
                <option value="L2">L2 - General</option>
                <option value="L3">L3 - Intensive</option>
                <option value="L4">L4 - Champion</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleSearch}
              disabled={loadingFilters}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loadingFilters ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} ค้นหา
            </button>
          </div>
        </div>

        {/* Export & Info Bar */}
        <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
          <div className="text-sm text-gray-600">
            📄 แสดงหน้าที่ {currentPage + 1} จาก {totalPages || 1} (หน้าละ {pageSize} รายการ)
          </div>
          {/* ✅ ปุ่ม Export แบบเลือกโหมด */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportToExcel('current')}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all flex items-center gap-2 shadow-sm text-sm"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Export เฉพาะหน้านี้
            </button>
            <button
              onClick={() => exportToExcel('all')}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-sm text-sm"
            >
              <Download className="w-4 h-4" />
              Export ทั้งหมด
            </button>
          </div>
        </div>

        {/* Patient Table */}
        <div className="bg-white rounded-xl shadow-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th onClick={() => handleSort('first_name')} className="px-6 py-4 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none">
                    <div className="flex items-center">ชื่อ-นามสกุล {getSortIcon('first_name')}</div>
                  </th>
                  <th onClick={() => handleSort('hospital_number')} className="px-6 py-4 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none">
                    <div className="flex items-center">HN {getSortIcon('hospital_number')}</div>
                  </th>
                  <th onClick={() => handleSort('users.id_card')} className="px-6 py-4 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none">
                    <div className="flex items-center">ID Card {getSortIcon('users.id_card')}</div>
                  </th>
                  <th onClick={() => handleSort('hospitals.name')} className="px-6 py-4 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none">
                    <div className="flex items-center">โรงพยาบาล {getSortIcon('hospitals.name')}</div>
                  </th>
                  <th onClick={() => handleSort('coach_name')} className="px-6 py-4 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none">
                    <div className="flex items-center">โค้ช {getSortIcon('coach_name')}</div>
                  </th>
                  <th onClick={() => handleSort('pam_level')} className="px-6 py-4 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none">
                    <div className="flex items-center">PAM Level {getSortIcon('pam_level')}</div>
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {patients.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p>ไม่พบข้อมูลผู้ป่วย</p>
                      {(searchTermNameHN || searchTermIdCard || selectedHospitalFilter !== 'all' || selectedCoachFilter !== 'all') && (
                        <button
                          onClick={() => { setSearchTermNameHN(''); setSearchTermIdCard(''); setSelectedHospitalFilter('all'); setSelectedCoachFilter('all'); handleSearch(); }}
                          className="mt-4 px-4 py-2 text-blue-600 hover:underline"
                        >
                          ล้างฟิลเตอร์และค้นหาใหม่
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  patients.map((patient) => (
                    <tr key={patient.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                            <Users className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-medium">{patient.first_name} {patient.last_name}</p>
                            <p className="text-sm text-gray-500">{patient.phone || '-'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm">{patient.hospital_number || '-'}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm text-gray-600">{patient.users?.id_card || '-'}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm">{patient.hospitals?.name || '-'}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm">{patient.coach_name || '-'}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          patient.pam_level === 'L4' ? 'bg-purple-100 text-purple-700' :
                          patient.pam_level === 'L3' ? 'bg-blue-100 text-blue-700' :
                          patient.pam_level === 'L2' ? 'bg-green-100 text-green-700' :
                          patient.pam_level === 'L1' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {patient.pam_level || 'L0'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button onClick={() => router.push(`/admin/patients/${patient.id}`)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="ดูรายละเอียด">
                            <Eye className="w-4 h-4" />
                          </button>
                          <button onClick={() => router.push(`/admin/patients/${patient.id}/edit`)} className="p-2 text-green-600 hover:bg-green-50 rounded-lg" title="แก้ไข">
                            <Edit className="w-4 h-4" />
                          </button>
                          {canDeleteData() ? (
                            <button onClick={() => handleDeletePatient(patient.id, `${patient.first_name} ${patient.last_name}`)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" title="ลบ">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400" title="อสม. ไม่มีสิทธิ์ลบ">
                              <Lock className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ✅ Pagination Controls with Jump to Page */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between flex-wrap gap-4">
              <div className="text-sm text-gray-600">
                แสดง {currentPage * pageSize + 1} - {Math.min((currentPage + 1) * pageSize, totalPatients)} จาก {totalPatients.toLocaleString()} รายการ
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {/* Jump to Page Input */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">ไปยังหน้า:</span>
                  <input
                    type="number"
                    min="1"
                    max={totalPages}
                    value={jumpToPage}
                    onChange={(e) => setJumpToPage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleJumpToPage()}
                    className="w-16 px-2 py-1 border rounded text-center text-sm"
                    placeholder="หน้า"
                  />
                  <button
                    onClick={handleJumpToPage}
                    className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                  >
                    ไป
                  </button>
                </div>
                {/* Navigation Buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(0)}
                    disabled={currentPage === 0}
                    className="px-3 py-2 bg-white border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 text-sm flex items-center gap-1"
                    title="หน้าแรก"
                  >
                    <SkipBack className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                    disabled={currentPage === 0}
                    className="px-3 py-2 bg-white border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 flex items-center gap-1 text-sm"
                  >
                    <ChevronLeft className="w-4 h-4" /> ก่อนหน้า
                  </button>
                  <div className="flex gap-1">
                    {getPageNumbers().map((pageNum, idx) => {
                      if (pageNum === '...') {
                        return <span key={`ellipsis-${idx}`} className="px-3 py-2 text-gray-400">...</span>;
                      }
                      const p = pageNum as number;
                      return (
                        <button
                          key={p}
                          onClick={() => setCurrentPage(p)}
                          className={`px-3 py-2 rounded-lg text-sm font-medium ${
                            currentPage === p ? 'bg-blue-500 text-white' : 'bg-white border hover:bg-gray-50'
                          }`}
                        >
                          {p + 1}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={currentPage >= totalPages - 1}
                    className="px-3 py-2 bg-white border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 flex items-center gap-1 text-sm"
                  >
                    ถัดไป <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages - 1)}
                    disabled={currentPage >= totalPages - 1}
                    className="px-3 py-2 bg-white border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 text-sm flex items-center gap-1"
                    title="หน้าสุดท้าย"
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Deleted Modal */}
      {showDeletedModal && canDeleteData() && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex justify-between items-center">
              <h2 className="text-2xl font-bold flex gap-2">
                <Archive className="w-6 h-6" />
                ผู้ป่วยที่ลบแล้ว ({deletedPatients.length})
              </h2>
              <button onClick={() => setShowDeletedModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
            </div>
            <div className="p-6">
              {deletedPatients.length === 0 ? (
                <div className="text-center py-12">
                  <Archive className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p>ไม่มีผู้ป่วยที่ถูกลบ</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {deletedPatients.map((patient) => (
                    <div key={patient.id} className="border rounded-lg p-4">
                      <div className="flex justify-between">
                        <div>
                          <div className="flex gap-2 mb-2">
                            <h3 className="font-semibold">{patient.first_name} {patient.last_name}</h3>
                            <span className="px-2 py-1 bg-gray-100 rounded-full text-xs">{patient.hospital_number}</span>
                          </div>
                          <div className="text-sm space-y-1">
                            <p>HN: {patient.hospital_number || '-'}</p>
                            <p>โรงพยาบาล: {patient.hospitals?.name || '-'}</p>
                            <p>ลบเมื่อ: {new Date(patient.updated_at).toLocaleDateString('th-TH')}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleRestorePatient(patient.id, `${patient.first_name} ${patient.last_name}`)} className="flex gap-2 px-4 py-2 bg-green-500 text-white rounded-lg">
                            <RotateCcw className="w-4 h-4" /> กู้คืน
                          </button>
                          <button onClick={() => handlePermanentlyDeletePatient(patient.id, `${patient.first_name} ${patient.last_name}`)} className="flex gap-2 px-4 py-2 bg-red-600 text-white rounded-lg">
                            <Trash2 className="w-4 h-4" /> ลบถาวร
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-6 border-t bg-gray-50">
              <button onClick={() => setShowDeletedModal(false)} className="w-full px-4 py-2 bg-gray-500 text-white rounded-lg">ปิด</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}