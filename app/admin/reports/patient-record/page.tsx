// app/admin/reports/patient-record/page.tsx
// ✅ แก้ไขล่าสุด: 29 ตุลาคม 2569
// ✅ ฟีเจอร์ทั้งหมด:
//    1. เพิ่มคอลัมน์ "ข้อมูลติดตาม" พร้อม Badge (จำนวนครั้ง + วันที่ล่าสุด)
//    2. สรุปจำนวนผู้ป่วยที่มี/ไม่มีข้อมูลติดตามในกล่องโรงพยาบาล
//    3. ดึงค่าน้ำหนัก/FPG จาก Follow-up ล่าสุด (fallback → Profiles)
//    4. Query แบบ Batch (ดึง followups ทั้งหมดในกลุ่มเดียว)
//    5. คง state เมื่อกลับจากหน้าระเบียน (เก็บ hospital/pam/zone ใน URL)
'use client';
import { useEffect, useState, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { checkSession, logout, getAccessibleHospitalIds, getUserHospitalInfo } from '@/lib/supabase/queries';
import { supabase } from '@/lib/supabase/client';
import {
  Users, FileText, ArrowLeft, LogOut, UserCheck, Hospital,
  Search, Filter, Download, FileSpreadsheet,
  CheckSquare, Square, Loader2, Activity, AlertCircle
} from 'lucide-react';

interface Patient {
  id: string;
  first_name: string | null;
  last_name: string | null;
  hospital_number: string | null;
  age: number | null;
  gender: string | null;
  pam_level: string | null;
  zone: string | null;
  current_weight: number | null;
  blood_sugar: number | null;
  hospital_id: string | null;
  hospitals?: { name: string | null } | null;
  // ✅ ฟิลด์สำหรับข้อมูลติดตาม
  followup_count?: number;
  latest_weight?: number | null;
  latest_fpg?: number | null;
  latest_followup_date?: string | null;
}

interface HospitalData {
  id: string;
  name: string | null;
  code: string | null;
  type: 'main' | 'sub';
  patientCount?: number;
}

// ✅ Component หลัก (ใช้ useSearchParams - ต้องอยู่ใน Suspense)
function PatientRecordContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  // ✅ อ่านค่าจาก URL เพื่อคง state เมื่อกลับจากหน้าระเบียน
  const initialMode = searchParams.get('mode') || 'hospital';
  const urlHospital = searchParams.get('hospital') || 'all';
  const urlPam = searchParams.get('pam') || 'all';
  const urlZone = searchParams.get('zone') || 'all';
  const urlSearch = searchParams.get('search') || '';

  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<any>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [hospitals, setHospitals] = useState<HospitalData[]>([]);
  const [selectedHospital, setSelectedHospital] = useState<string>(urlHospital);
  const [selectedPatients, setSelectedPatients] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState(urlSearch);
  const [pamFilter, setPamFilter] = useState(urlPam);
  const [zoneFilter, setZoneFilter] = useState(urlZone);
  const [exportMode, setExportMode] = useState<'individual' | 'zip'>('individual');
  const [mode, setMode] = useState<'hospital' | 'select'>(initialMode as any);

  // ✅ ฟังก์ชันอัปเดต URL เมื่อ filter เปลี่ยน (เพื่อคง state)
  const updateUrlParams = useCallback(() => {
    const params = new URLSearchParams();
    if (selectedHospital !== 'all') params.set('hospital', selectedHospital);
    if (pamFilter !== 'all') params.set('pam', pamFilter);
    if (zoneFilter !== 'all') params.set('zone', zoneFilter);
    if (searchTerm) params.set('search', searchTerm);
    if (mode !== 'hospital') params.set('mode', mode);
    
    const newUrl = `${pathname}?${params.toString()}`;
    router.replace(newUrl, { scroll: false });
  }, [pathname, router, selectedHospital, pamFilter, zoneFilter, searchTerm, mode]);

  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }
    setUser(userData);
    loadUserHospital(userData.id);
    loadHospitals(userData.id);
    loadPatients(userData.id);
  }, [router]);

  // ✅ อัปเดต URL ทุกครั้งที่ filter เปลี่ยน
  useEffect(() => {
    updateUrlParams();
  }, [updateUrlParams]);

  const loadUserHospital = async (userId: string) => {
    try {
      const hospitalInfo = await getUserHospitalInfo(userId);
      setUserHospital(hospitalInfo);
    } catch (error) {
      console.error('Error loading hospital:', error);
    }
  };

  const loadHospitals = async (userId: string) => {
    try {
      const accessibleIds = await getAccessibleHospitalIds(userId);
      
      let query = supabase
        .from('hospitals')
        .select('id, name, code, type')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (accessibleIds.length > 0 && accessibleIds.length < 100) {
        query = query.in('id', accessibleIds);
      }

      const { data, error } = await query;
      if (error) throw error;

      const hospitalsWithCount = await Promise.all(
        (data || []).map(async (h: any) => {
          const { count } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('hospital_id', h.id)
            .eq('is_active', true);
          
          return { ...h, patientCount: count || 0 };
        })
      );

      setHospitals(hospitalsWithCount);
    } catch (error) {
      console.error('Error loading hospitals:', error);
    }
  };

  const loadPatients = async (userId: string) => {
    try {
      const accessibleIds = await getAccessibleHospitalIds(userId);
      
      let query = supabase
        .from('profiles')
        .select(`
          id, first_name, last_name, hospital_number, age, gender,
          pam_level, zone, current_weight, blood_sugar, hospital_id,
          hospitals:hospital_id (name)
        `)
        .eq('is_active', true)
        .order('first_name', { ascending: true });

      if (accessibleIds.length > 0 && accessibleIds.length < 100) {
        query = query.in('hospital_id', accessibleIds);
      }

      if (selectedHospital !== 'all') {
        query = query.eq('hospital_id', selectedHospital);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      // ✅ Query แบบ Batch - ดึง followups ทั้งหมดของผู้ป่วยในกลุ่มเดียว
      const patientIds = (data || []).map(p => p.id);
      let followupData: any[] = [];
      
      if (patientIds.length > 0) {
        const { data: followups, error: followupError } = await supabase
          .from('appointment_followups')
          .select('user_id, followup_date, weight, blood_sugar_dtx')
          .in('user_id', patientIds)
          .order('followup_date', { ascending: false });
        
        if (followupError) {
          console.error('Error loading followups:', followupError);
        } else {
          followupData = followups || [];
        }
      }

      // ✅ รวมข้อมูล Follow-up เข้ากับข้อมูลผู้ป่วย
      const patientsWithFollowup = (data || []).map(patient => {
        const patientFollowups = followupData.filter(f => f.user_id === patient.id);
        const latestFollowup = patientFollowups[0]; // ล่าสุดเพราะเรียง descending
        
        return {
          ...patient,
          followup_count: patientFollowups.length,
          // ✅ ดึงค่าจาก Follow-up ล่าสุด หรือ fallback ไป Profiles
          latest_weight: latestFollowup?.weight ?? patient.current_weight ?? null,
          latest_fpg: latestFollowup?.blood_sugar_dtx ?? patient.blood_sugar ?? null,
          latest_followup_date: latestFollowup?.followup_date || null,
        };
      });

      setPatients(patientsWithFollowup);
    } catch (error) {
      console.error('Error loading patients:', error);
    } finally {
      setLoading(false);
    }
  };

  // ✅ รีเซ็ตการเลือกเมื่อเปลี่ยนโรงพยาบาล
  useEffect(() => {
    setSelectedPatients(new Set());
  }, [selectedHospital]);

  // ✅ โหลดผู้ป่วยใหม่เมื่อเปลี่ยนโรงพยาบาล
  useEffect(() => {
    if (user) {
      loadPatients(user.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHospital]);

  const filteredPatients = patients.filter(p => {
    const searchLower = searchTerm.toLowerCase();
    const fullName = `${p.first_name || ''} ${p.last_name || ''}`.toLowerCase();
    const hn = (p.hospital_number || '').toLowerCase();
    const matchSearch = fullName.includes(searchLower) || hn.includes(searchLower);
    const matchPam = pamFilter === 'all' || p.pam_level === pamFilter;
    const matchZone = zoneFilter === 'all' || p.zone === zoneFilter;
    return matchSearch && matchPam && matchZone;
  });

  const toggleSelectAll = () => {
    if (selectedPatients.size === filteredPatients.length) {
      setSelectedPatients(new Set());
    } else {
      setSelectedPatients(new Set(filteredPatients.map(p => p.id)));
    }
  };

  const toggleSelectPatient = (patientId: string) => {
    const newSelected = new Set(selectedPatients);
    if (newSelected.has(patientId)) {
      newSelected.delete(patientId);
    } else {
      newSelected.add(patientId);
    }
    setSelectedPatients(newSelected);
  };

  const handleExport = async () => {
    if (selectedPatients.size === 0) {
      alert('กรุณาเลือกผู้ป่วยอย่างน้อย 1 คน');
      return;
    }

    setExporting(true);
    
    try {
      const selectedPatientData = patients.filter(p => selectedPatients.has(p.id));
      
      for (const patient of selectedPatientData) {
        window.open(
          `/admin/reports/patient-record/${patient.id}?print=true`,
          '_blank'
        );
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      alert(`✅ เปิดระเบียน ${selectedPatientData.length} ไฟล์แล้ว`);
    } catch (error) {
      console.error('Export error:', error);
      alert('❌ เกิดข้อผิดพลาดในการ Export');
    } finally {
      setExporting(false);
    }
  };

  const getSelectedHospitalName = () => {
    if (selectedHospital === 'all') return 'ทั้งหมด';
    const hospital = hospitals.find(h => h.id === selectedHospital);
    return hospital?.name || 'ไม่ระบุ';
  };

  // ✅ ฟังก์ชันแสดง Badge สถานะข้อมูลติดตาม
  const getFollowupBadge = (patient: Patient) => {
    if (!patient.followup_count || patient.followup_count === 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
          <AlertCircle className="w-3 h-3" />
          ไม่มีข้อมูล
        </span>
      );
    }
    
    const dateStr = patient.latest_followup_date 
      ? new Date(patient.latest_followup_date).toLocaleDateString('th-TH', { 
          day: '2-digit', 
          month: 'short', 
          year: '2-digit' 
        })
      : '';
    
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
        <Activity className="w-3 h-3" />
        {patient.followup_count} ครั้ง {dateStr && `(${dateStr})`}
      </span>
    );
  };

  // ✅ คำนวณจำนวนผู้ป่วยที่มี/ไม่มีข้อมูลติดตาม
  const patientsWithFollowup = filteredPatients.filter(p => p.followup_count && p.followup_count > 0).length;
  const patientsWithoutFollowup = filteredPatients.filter(p => !p.followup_count || p.followup_count === 0).length;

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
              <h1 className="text-3xl font-bold text-gray-800 mb-2">📄 ระเบียนคนไข้ (PDF)</h1>
              <p className="text-gray-600">เลือกรายงานและ Export เป็น PDF</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right bg-gradient-to-l from-blue-50 to-indigo-50 px-4 py-3 rounded-xl border border-blue-200">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <UserCheck className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">{user?.full_name_th || 'ผู้ดูแลระบบ'}</p>
                    <p className="text-xs text-gray-500">
                      {user?.role === 'admin' ? '👑 ผู้ดูแลระบบ' :
                       user?.role === 'doctor' ? '👨⚕️ แพทย์' :
                       user?.role === 'osm' ? '🏘️ อสม.' : '👩‍ เจ้าหน้าที่'}
                    </p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => { logout(); router.push('/admin/login'); }}
                className="flex items-center gap-2 px-4 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all shadow-lg"
              >
                <LogOut className="w-4 h-4" />
                ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Hospital Selection */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-gray-200">
          <div className="flex items-center gap-3 mb-4">
            <Hospital className="w-6 h-6 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-800">เลือกโรงพยาบาล</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                โรงพยาบาลที่ต้องการดูระเบียน
              </label>
              <select
                value={selectedHospital}
                onChange={(e) => setSelectedHospital(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">ทั้งหมด ({hospitals.reduce((sum, h) => sum + (h.patientCount || 0), 0)} คน)</option>
                {hospitals.map((hospital) => (
                  <option key={hospital.id} value={hospital.id}>
                    {hospital.name} ({hospital.patientCount || 0} คน)
                    {hospital.type === 'main' ? ' - แม่ข่าย' : ' - ลูกข่าย'}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex-1">
                <p className="text-sm text-blue-800">
                  <span className="font-semibold">🏥 โรงพยาบาล:</span> {getSelectedHospitalName()}
                </p>
                <p className="text-sm text-blue-600 mt-1">
                  <span className="font-semibold">👥 ผู้ป่วยทั้งหมด:</span> {filteredPatients.length} คน
                </p>
                <p className="text-sm text-blue-600">
                  <span className="font-semibold">✅ เลือกแล้ว:</span> {selectedPatients.size} คน
                </p>
                {/* ✅ สรุปจำนวนผู้ป่วยที่มี/ไม่มีข้อมูลติดตาม */}
                <div className="mt-2 pt-2 border-t border-blue-200 space-y-1">
                  <p className="text-xs text-green-700 font-medium">
                    ✓ มีข้อมูลติดตาม: <span className="font-bold">{patientsWithFollowup}</span> คน
                  </p>
                  <p className="text-xs text-gray-600">
                    ✗ ไม่มีข้อมูลติดตาม: <span className="font-bold">{patientsWithoutFollowup}</span> คน
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Search className="w-4 h-4 inline mr-1" /> ค้นหาชื่อ / HN
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="พิมพ์ชื่อ หรือ HN..."
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Filter className="w-4 h-4 inline mr-1" /> PAM Level
              </label>
              <select
                value={pamFilter}
                onChange={(e) => setPamFilter(e.target.value)}
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Filter className="w-4 h-4 inline mr-1" /> Zone
              </label>
              <select
                value={zoneFilter}
                onChange={(e) => setZoneFilter(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">ทั้งหมด</option>
                <option value="Green Zone">Green Zone</option>
                <option value="Yellow Zone">Yellow Zone</option>
                <option value="Red Zone">Red Zone</option>
              </select>
            </div>
          </div>
        </div>

        {/* Export Options */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-gray-200">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="text-lg font-bold text-gray-800">เลือกรูปแบบไฟล์</h3>
              <p className="text-sm text-gray-600">
                เลือกแล้ว <span className="font-bold text-blue-600">{selectedPatients.size}</span> คน
                จากทั้งหมด <span className="font-bold">{filteredPatients.length}</span> คน
                {selectedHospital !== 'all' && (
                  <span className="ml-2 text-blue-600">
                    (โรงพยาบาล: {getSelectedHospitalName()})
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setExportMode('individual')}
                className={`px-4 py-2 rounded-lg border-2 transition-all ${
                  exportMode === 'individual'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-600 hover:border-blue-300'
                }`}
              >
                <FileText className="w-4 h-4 inline mr-2" />
                แยกไฟล์ (Individual)
              </button>
              <button
                onClick={() => setExportMode('zip')}
                className={`px-4 py-2 rounded-lg border-2 transition-all ${
                  exportMode === 'zip'
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : 'border-gray-200 text-gray-600 hover:border-green-300'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4 inline mr-2" />
                รวม ZIP
              </button>
            </div>
          </div>
        </div>

        {/* Patient Table */}
        <div className="bg-white rounded-xl shadow-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-4 text-left">
                    <button
                      onClick={toggleSelectAll}
                      className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 px-2 py-1 rounded"
                    >
                      {selectedPatients.size === filteredPatients.length ? (
                        <CheckSquare className="w-5 h-5 text-blue-600" />
                      ) : (
                        <Square className="w-5 h-5 text-gray-400" />
                      )}
                      เลือกทั้งหมด
                    </button>
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ชื่อ-นามสกุล</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">HN</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">อายุ/เพศ</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">PAM Level</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Zone</th>
                  {/* ✅ คอลัมน์ข้อมูลติดตาม */}
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ข้อมูลติดตาม</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">น้ำหนัก</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">FPG</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">การกระทำ</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredPatients.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
                      <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p>ไม่พบข้อมูลผู้ป่วย</p>
                      {selectedHospital !== 'all' && (
                        <button
                          onClick={() => setSelectedHospital('all')}
                          className="mt-4 px-4 py-2 text-blue-600 hover:underline"
                        >
                          แสดงผู้ป่วยทั้งหมด
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredPatients.map((patient) => (
                    <tr key={patient.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <button
                          onClick={() => toggleSelectPatient(patient.id)}
                          className="flex items-center gap-2"
                        >
                          {selectedPatients.has(patient.id) ? (
                            <CheckSquare className="w-5 h-5 text-blue-600" />
                          ) : (
                            <Square className="w-5 h-5 text-gray-400" />
                          )}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                            <Users className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-medium">{patient.first_name} {patient.last_name}</p>
                            <p className="text-xs text-gray-500">{patient.hospitals?.name || '-'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm">{patient.hospital_number || '-'}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {patient.age || '-'} ปี / {patient.gender === 'female' ? 'หญิง' : 'ชาย'}
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
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          patient.zone === 'Green Zone' ? 'bg-green-100 text-green-700' :
                          patient.zone === 'Yellow Zone' ? 'bg-yellow-100 text-yellow-700' :
                          patient.zone === 'Red Zone' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {patient.zone || '-'}
                        </span>
                      </td>
                      {/* ✅ แสดง Badge สถานะข้อมูลติดตาม */}
                      <td className="px-6 py-4">
                        {getFollowupBadge(patient)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {patient.latest_weight ? `${patient.latest_weight} กก.` : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {patient.latest_fpg ? `${patient.latest_fpg} mg/dL` : '-'}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => router.push(`/admin/reports/patient-record/${patient.id}`)}
                          className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-medium hover:bg-indigo-200"
                        >
                          ดูระเบียน
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Export Button */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={handleExport}
            disabled={selectedPatients.size === 0 || exporting}
            className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                กำลัง Export...
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                Export PDF ({selectedPatients.size} คน)
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ✅ Export default ที่ครอบด้วย Suspense (แก้ Vercel build error)
export default function PatientRecordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    }>
      <PatientRecordContent />
    </Suspense>
  );
}