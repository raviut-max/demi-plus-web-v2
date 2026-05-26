// app/admin/patients/page.tsx
'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx'; // ✅ เพิ่มสำหรับ Export Excel
import {
  checkSession,
  logout,
  getPatientList,
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
  FileSpreadsheet  // ✅ ไอคอนสำหรับ Export
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

const debugLog = (module: string, message: string, data?: any) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`🔍 [${module}] ${message}`, data !== undefined ? JSON.stringify(data, null, 2) : '');
  }
};

export default function PatientManagementPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [patients, setPatients] = useState<any[]>([]);
  const [deletedPatients, setDeletedPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
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
  
  const [sortColumn, setSortColumn] = useState<string>('first_name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

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
          return {
            ...c,
            patientCount: count || 0,
            hospitalName: c.users?.hospitals?.name || 'ไม่ระบุ'
          };
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

  // เมื่อเปลี่ยนโรงพยาบาล filter ให้โหลดโค้ชใหม่และรีเซ็ต coach filter
  useEffect(() => {
    if (!user) return;
    setSelectedCoachFilter('all');
    loadFilterCoachesByHospital(selectedHospitalFilter);
  }, [selectedHospitalFilter, user, loadFilterCoachesByHospital]);

  // โหลดข้อมูลเริ่มต้น
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
      const { data } = await supabase
        .from('doctors')
        .select('full_name_th')
        .eq('user_id', userId)
        .single();
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
      await loadPatients(ids);
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
      const allHospitals = await getHospitalsWithHierarchy(
        isSuperAdmin(user) ? undefined : accessibleIds
      );
      const hospitalsWithCount = await Promise.all(allHospitals.map(async (h: any) => {
        try {
          const { count } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('hospital_id', h.id)
            .eq('is_active', true);
          return {
            ...h,
            patientCount: count || 0,
            typeLabel: h.type === 'main' ? '🏢 แม่ข่าย' : '🏥 ลูกข่าย'
          };
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

  const loadPatients = async (hospitalIds?: string[]) => {
    try {
      const data = await getPatientList(
        searchTerm,
        selectedPamLevel === 'all' ? undefined : selectedPamLevel,
        hospitalIds,
        selectedHospitalFilter === 'all' ? undefined : selectedHospitalFilter,
        selectedCoachFilter === 'all' ? undefined : selectedCoachFilter
      );
      setPatients(data);
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
        filteredData = data.filter((p: any) => 
          !p.hospital_id || hospitalIds.includes(p.hospital_id)
        );
      }
      setDeletedPatients(filteredData);
    } catch (error) {
      debugLog('loadDeletedPatients', 'error', error);
      setDeletedPatients([]);
    }
  };

  const handleSearch = useCallback(() => {
    loadPatients(accessibleHospitalIds);
  }, [searchTerm, selectedPamLevel, selectedHospitalFilter, selectedCoachFilter, accessibleHospitalIds]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm || selectedHospitalFilter !== 'all' || selectedCoachFilter !== 'all' || selectedPamLevel !== 'all') {
        handleSearch();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, selectedHospitalFilter, selectedCoachFilter, selectedPamLevel, handleSearch]);

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortedPatients = [...patients].sort((a, b) => {
    let aValue = a[sortColumn];
    let bValue = b[sortColumn];
    if (sortColumn.includes('.')) {
      const [parent, child] = sortColumn.split('.');
      aValue = a[parent]?.[child];
      bValue = b[parent]?.[child];
    }
    if (sortColumn === 'coach_name') {
      aValue = a.coach_name || '';
      bValue = b.coach_name || '';
    }
    if (aValue == null) aValue = '';
    if (bValue == null) bValue = '';
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortDirection === 'asc' 
        ? aValue.localeCompare(bValue, 'th')
        : bValue.localeCompare(aValue, 'th');
    }
    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // ✅ ฟังก์ชัน Export to Excel
  const exportToExcel = () => {
    const exportData = sortedPatients.map((patient, idx) => {
      // แปลงเพศ
      let genderThai = '';
      if (patient.gender === 'male') genderThai = 'ชาย';
      else if (patient.gender === 'female') genderThai = 'หญิง';
      
      // จัดรูปแบบวันเกิด
      let birthDateStr = '';
      if (patient.birth_date) {
        const date = new Date(patient.birth_date);
        if (!isNaN(date.getTime())) {
          birthDateStr = date.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        }
      }
      
      return {
        'ลำดับ': idx + 1,
        'ชื่อ-นามสกุล': `${patient.first_name || ''} ${patient.last_name || ''}`.trim(),
        'HN': patient.hospital_number || '',
        'เลขบัตรประชาชน': patient.users?.id_card || '',
        'วันเกิด': birthDateStr,
        'อายุ': patient.age ?? '',
        'เพศ': genderThai,
        'โทรศัพท์': patient.phone || '',
        'อีเมล': patient.email || '',
        'โรงพยาบาล': patient.hospitals?.name || '',
        'โค้ช': patient.coach_name || '',
        'PAM Level': patient.pam_level || '',
        'Zone': patient.zone || '',
      };
    });
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    // กำหนดความกว้างคอลัมน์ (optional)
    ws['!cols'] = [
      { wch: 8 },   // ลำดับ
      { wch: 25 },  // ชื่อ-นามสกุล
      { wch: 15 },  // HN
      { wch: 18 },  // เลขบัตรประชาชน
      { wch: 15 },  // วันเกิด
      { wch: 8 },   // อายุ
      { wch: 8 },   // เพศ
      { wch: 15 },  // โทรศัพท์
      { wch: 20 },  // อีเมล
      { wch: 25 },  // โรงพยาบาล
      { wch: 20 },  // โค้ช
      { wch: 10 },  // PAM Level
      { wch: 12 }   // Zone
    ];
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ผู้ป่วย');
    const fileName = `patients_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const handleDeletePatient = async (patientId: string, patientName: string) => {
    if (user?.role === 'osm') {
      alert('❌ อสม. ไม่มีสิทธิ์ลบข้อมูลผู้ป่วย');
      return;
    }
    if (!confirm(`⚠️ ยืนยันการลบผู้ป่วย ${patientName}? จะย้ายไปถังขยะ`)) return;
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
    if (!confirm(`♻️ ยืนยันการกู้คืนผู้ป่วย ${patientName}?`)) return;
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
    if (!confirm(`⚠️ คำเตือน: ลบถาวร ${patientName} ไม่สามารถกู้คืนได้!`)) return;
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
      'admin': {
        text: isSuperAdmin(user) ? '👑 Super Admin' : '🏥 Hospital Admin',
        bg: isSuperAdmin(user) ? 'bg-purple-100' : 'bg-blue-100',
        textCol: isSuperAdmin(user) ? 'text-purple-700' : 'text-blue-700'
      },
      'doctor': { text: '👨‍⚕️ แพทย์', bg: 'bg-green-100', textCol: 'text-green-700' },
      'helper': { text: '👩‍💼 เจ้าหน้าที่', bg: 'bg-yellow-100', textCol: 'text-yellow-700' }
    };
    const config = roleConfig[user.role] || { text: user.role, bg: 'bg-gray-100', textCol: 'text-gray-700' };
    return (
      <span className={`px-2 py-1 ${config.bg} ${config.textCol} rounded text-xs font-semibold`}>
        {config.text}
      </span>
    );
  };

  const getSortIcon = (columnName: string) => {
    if (sortColumn !== columnName) return <ChevronsUpDown className="w-4 h-4 ml-1 opacity-30" />;
    return sortDirection === 'asc' ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />;
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
              <div><p className="text-sm text-gray-500">ผู้ป่วยทั้งหมด</p><p className="text-2xl font-bold">{patients.length}</p></div>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2"><Search className="w-4 h-4 inline mr-1" /> ค้นหา (ชื่อ, นามสกุล, HN)</label>
              <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSearch()} placeholder="พิมพ์เพื่อค้นหา..." className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2"><Building2 className="w-4 h-4 inline mr-1" /> โรงพยาบาล</label>
              <select value={selectedHospitalFilter} onChange={(e) => setSelectedHospitalFilter(e.target.value)} disabled={loadingFilters} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100">
                <option value="all">ทั้งหมด ({patients.length})</option>
                {filterHospitals.map((h: any) => (
                  <option key={h.id} value={h.id}>{h.typeLabel} {h.name} ({h.patientCount} คน)</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2"><User className="w-4 h-4 inline mr-1" /> โค้ชผู้ดูแล</label>
              <select value={selectedCoachFilter} onChange={(e) => setSelectedCoachFilter(e.target.value)} disabled={loadingFilters} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100">
                <option value="all">ทั้งหมด</option>
                {filterCoaches.map((c: any) => (
                  <option key={c.user_id} value={c.user_id}>{c.full_name_th} | {c.hospitalName} ({c.patientCount} คน)</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2"><Filter className="w-4 h-4 inline mr-1" /> PAM Level</label>
              <select value={selectedPamLevel} onChange={(e) => setSelectedPamLevel(e.target.value)} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500">
                <option value="all">ทั้งหมด</option>
                <option value="L0">L0 - ไม่ทราบ</option><option value="L1">L1 - Deny</option><option value="L2">L2 - General</option><option value="L3">L3 - Intensive</option><option value="L4">L4 - Champion</option>
              </select>
            </div>
            <div className="flex items-end">
              <button onClick={handleSearch} disabled={loadingFilters} className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center justify-center gap-2 disabled:opacity-50">
                {loadingFilters ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} ค้นหา
              </button>
            </div>
          </div>
        </div>

        {/* ✅ ปุ่ม Export Excel */}
        <div className="flex justify-end mb-4">
          <button
            onClick={exportToExcel}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all flex items-center gap-2 shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Export Excel
          </button>
        </div>

        {/* Patient Table */}
        <div className="bg-white rounded-xl shadow-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th onClick={() => handleSort('first_name')} className="px-6 py-4 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none"><div className="flex items-center">ชื่อ-นามสกุล {getSortIcon('first_name')}</div></th>
                  <th onClick={() => handleSort('users.id_card')} className="px-6 py-4 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none"><div className="flex items-center">HN / ID Card {getSortIcon('users.id_card')}</div></th>
                  <th onClick={() => handleSort('hospitals.name')} className="px-6 py-4 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none"><div className="flex items-center">โรงพยาบาล {getSortIcon('hospitals.name')}</div></th>
                  <th onClick={() => handleSort('coach_name')} className="px-6 py-4 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none"><div className="flex items-center">โค้ช {getSortIcon('coach_name')}</div></th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">PAM Level</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Zone</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sortedPatients.length === 0 ? (
                  <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-500"><Users className="w-12 h-12 mx-auto mb-4 text-gray-300" /><p>ไม่พบข้อมูลผู้ป่วย</p>{(searchTerm || selectedHospitalFilter !== 'all' || selectedCoachFilter !== 'all') && (<button onClick={() => { setSearchTerm(''); setSelectedHospitalFilter('all'); setSelectedCoachFilter('all'); handleSearch(); }} className="mt-4 px-4 py-2 text-blue-600 hover:underline">ล้างฟิลเตอร์และค้นหาใหม่</button>)}</td></tr>
                ) : (
                  sortedPatients.map((patient) => (
                    <tr key={patient.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4"><div className="flex items-center gap-3"><div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center"><Users className="w-5 h-5 text-blue-600" /></div><div><p className="font-medium">{patient.first_name} {patient.last_name}</p><p className="text-sm text-gray-500">{patient.phone || '-'}</p></div></div></td>
                      <td className="px-6 py-4"><div className="text-sm"><p className="font-mono">{patient.hospital_number || '-'}</p><p className="text-xs text-gray-400">{patient.users?.id_card || '-'}</p></div></td>
                      <td className="px-6 py-4"><span className="text-sm">{patient.hospitals?.name || '-'}</span></td>
                      <td className="px-6 py-4"><span className="text-sm">{patient.coach_name || '-'}</span></td>
                      <td className="px-6 py-4"><span className={`px-2 py-1 rounded-full text-xs font-semibold ${patient.pam_level === 'L4' ? 'bg-purple-100 text-purple-700' : patient.pam_level === 'L3' ? 'bg-blue-100 text-blue-700' : patient.pam_level === 'L2' ? 'bg-green-100 text-green-700' : patient.pam_level === 'L1' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700'}`}>{patient.pam_level || 'L0'}</span></td>
                      <td className="px-6 py-4"><span className={`px-2 py-1 rounded-full text-xs font-semibold ${patient.zone === 'Green Zone' ? 'bg-green-100 text-green-700' : patient.zone === 'Yellow Zone' ? 'bg-yellow-100 text-yellow-700' : patient.zone === 'Red Zone' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>{patient.zone || 'Zero Zone'}</span></td>
                      <td className="px-6 py-4"><div className="flex items-center gap-2"><button onClick={() => router.push(`/admin/patients/${patient.id}`)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"><Eye className="w-4 h-4" /></button><button onClick={() => router.push(`/admin/patients/${patient.id}/edit`)} className="p-2 text-green-600 hover:bg-green-50 rounded-lg"><Edit className="w-4 h-4" /></button>{canDeleteData() ? (<button onClick={() => handleDeletePatient(patient.id, `${patient.first_name} ${patient.last_name}`)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>) : (<span className="text-xs text-gray-400" title="อสม. ไม่มีสิทธิ์ลบ"><Lock className="w-3 h-3" /></span>)}</div></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Deleted Modal */}
      {showDeletedModal && canDeleteData() && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex justify-between items-center"><h2 className="text-2xl font-bold flex gap-2"><Archive className="w-6 h-6" /> ผู้ป่วยที่ลบแล้ว ({deletedPatients.length})</h2><button onClick={() => setShowDeletedModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl">×</button></div>
            <div className="p-6">{deletedPatients.length === 0 ? (<div className="text-center py-12"><Archive className="w-16 h-16 mx-auto mb-4 text-gray-300" /><p>ไม่มีผู้ป่วยที่ถูกลบ</p></div>) : (<div className="space-y-4">{deletedPatients.map((patient) => (<div key={patient.id} className="border rounded-lg p-4"><div className="flex justify-between"><div><div className="flex gap-2 mb-2"><h3 className="font-semibold">{patient.first_name} {patient.last_name}</h3><span className="px-2 py-1 bg-gray-100 rounded-full text-xs">{patient.hospital_number}</span></div><div className="text-sm space-y-1"><p>HN: {patient.hospital_number || '-'}</p><p>โรงพยาบาล: {patient.hospitals?.name || '-'}</p><p>ลบเมื่อ: {new Date(patient.updated_at).toLocaleDateString('th-TH')}</p></div></div><div className="flex gap-2"><button onClick={() => handleRestorePatient(patient.id, `${patient.first_name} ${patient.last_name}`)} className="flex gap-2 px-4 py-2 bg-green-500 text-white rounded-lg"><RotateCcw className="w-4 h-4" /> กู้คืน</button><button onClick={() => handlePermanentlyDeletePatient(patient.id, `${patient.first_name} ${patient.last_name}`)} className="flex gap-2 px-4 py-2 bg-red-600 text-white rounded-lg"><Trash2 className="w-4 h-4" /> ลบถาวร</button></div></div></div>))}</div>)}</div>
            <div className="p-6 border-t bg-gray-50"><button onClick={() => setShowDeletedModal(false)} className="w-full px-4 py-2 bg-gray-500 text-white rounded-lg">ปิด</button></div>
          </div>
        </div>
      )}
    </div>
  );
}