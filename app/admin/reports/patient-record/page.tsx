// app/admin/reports/patient-record/page.tsx
// ✅ ฉบับสมบูรณ์: 29 ตุลาคม 2569
// ✅ ใช้เทมเพลตกลาง (patientRecordTemplate) สร้าง PDF ฉบับสมบูรณ์
'use client';
import { useEffect, useState, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { checkSession, logout, getAccessibleHospitalIds } from '@/lib/supabase/queries';
import { supabase } from '@/lib/supabase/client';
import {
  Users, FileText, ArrowLeft, LogOut, UserCheck, Hospital,
  Search, Filter, CheckSquare, Square, Activity, AlertCircle,
  X, CheckCircle, FolderOpen,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Loader2, Info, HardDrive
} from 'lucide-react';
import JSZip from 'jszip';
import { fetchPatientRecordData, generatePatientPDFBlob, buildRecordMeta } from '@/lib/pdf/patientRecordTemplate';

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

function PatientRecordContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlHospital = searchParams.get('hospital') || 'all';
  const urlPam = searchParams.get('pam') || 'all';
  const urlZone = searchParams.get('zone') || 'all';
  const urlSearch = searchParams.get('search') || '';

  const [user, setUser] = useState<any>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [hospitals, setHospitals] = useState<HospitalData[]>([]);
  const [selectedHospital, setSelectedHospital] = useState<string>(urlHospital);
  const [selectedPatients, setSelectedPatients] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState(urlSearch);
  const [pamFilter, setPamFilter] = useState(urlPam);
  const [zoneFilter, setZoneFilter] = useState(urlZone);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);

  const [showExportList, setShowExportList] = useState(false);
  const [exportQueue, setExportQueue] = useState<Patient[]>([]);

  const [isBatchRecording, setIsBatchRecording] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchSuccess, setBatchSuccess] = useState(0);
  const [batchFailed, setBatchFailed] = useState(0);
  const [batchCurrentName, setBatchCurrentName] = useState('');
  const [batchStatus, setBatchStatus] = useState<'idle' | 'recording' | 'done' | 'error'>('idle');
  const [batchErrorMessage, setBatchErrorMessage] = useState('');

  const updateUrlParams = useCallback(() => {
    const params = new URLSearchParams();
    if (selectedHospital !== 'all') params.set('hospital', selectedHospital);
    if (pamFilter !== 'all') params.set('pam', pamFilter);
    if (zoneFilter !== 'all') params.set('zone', zoneFilter);
    if (searchTerm) params.set('search', searchTerm);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router, selectedHospital, pamFilter, zoneFilter, searchTerm]);

  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }
    setUser(userData);
    loadHospitals(userData.id);
    loadPatients(userData.id);
  }, [router]);

  useEffect(() => {
    updateUrlParams();
  }, [updateUrlParams]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedHospital, searchTerm, pamFilter, zoneFilter]);

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

      const patientIds = (data || []).map(p => p.id);
      let followupData: any[] = [];
      if (patientIds.length > 0) {
        const { data: followups } = await supabase
          .from('appointment_followups')
          .select('user_id, followup_date, weight, blood_sugar_dtx')
          .in('user_id', patientIds)
          .order('followup_date', { ascending: false });
        followupData = followups || [];
      }

      const patientsWithFollowup = (data || []).map(patient => {
        const patientFollowups = followupData.filter(f => f.user_id === patient.id);
        const latestFollowup = patientFollowups[0];
        return {
          ...patient,
          followup_count: patientFollowups.length,
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

  useEffect(() => {
    setSelectedPatients(new Set());
  }, [selectedHospital]);

  useEffect(() => {
    if (user) loadPatients(user.id);
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

  const totalPages = Math.ceil(filteredPatients.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedPatients = filteredPatients.slice(startIndex, endIndex);

  const toggleSelectAll = () => {
    const currentPageIds = paginatedPatients.map(p => p.id);
    const allSelected = currentPageIds.every(id => selectedPatients.has(id));
    const newSelected = new Set(selectedPatients);
    if (allSelected) currentPageIds.forEach(id => newSelected.delete(id));
    else currentPageIds.forEach(id => newSelected.add(id));
    setSelectedPatients(newSelected);
  };

  const toggleSelectPatient = (patientId: string) => {
    const newSelected = new Set(selectedPatients);
    if (newSelected.has(patientId)) newSelected.delete(patientId);
    else newSelected.add(patientId);
    setSelectedPatients(newSelected);
  };

  const handleExport = () => {
    if (selectedPatients.size === 0) {
      alert('กรุณาเลือกผู้ป่วยอย่างน้อย 1 คน');
      return;
    }
    const selectedPatientData = patients.filter(p => selectedPatients.has(p.id));
    setExportQueue(selectedPatientData);
    setBatchProgress(0);
    setBatchSuccess(0);
    setBatchFailed(0);
    setBatchStatus('idle');
    setBatchErrorMessage('');
    setShowExportList(true);
  };

  // ✅ สร้าง PDF ฉบับสมบูรณ์ผ่านเทมเพลตกลาง
  const generatePatientPDF = async (patientId: string): Promise<Blob> => {
    const { patient, followups, screenings, coachName } = await fetchPatientRecordData(patientId);
    const meta = buildRecordMeta(user?.full_name_th || 'เจ้าหน้าที่ระบบ', coachName, patient);
    return generatePatientPDFBlob(patient, followups, screenings, meta);
  };

  // ✅ บันทึกรวม: เลือกโฟลเดอร์แล้วบันทึกทั้งหมด
  const handleBatchRecord = async () => {
    if (exportQueue.length === 0) {
      alert('ไม่มีรายการที่จะบันทึก');
      return;
    }

    const supportsFileSystemAccess = 'showDirectoryPicker' in window;

    if (!supportsFileSystemAccess) {
      const confirmed = window.confirm(
        `เบราว์เซอร์ของคุณไม่รองรับการเลือกโฟลเดอร์โดยตรง\n\nระบบจะบันทึกรวมเป็นไฟล์ ZIP (${exportQueue.length} ไฟล์) แทน\n\nต้องการดำเนินการต่อหรือไม่?`
      );
      if (!confirmed) return;
      await handleBatchRecordAsZip();
      return;
    }

    const confirmed = window.confirm(
      `จะบันทึกรายการ ${exportQueue.length} คน ลงในโฟลเดอร์ที่คุณเลือก\n\n• ระบบจะเปิดหน้าต่างเลือกโฟลเดอร์\n• PDF ฉบับสมบูรณ์จะถูกลงโฟลเดอร์นั้นโดยตรง\n• ชื่อไฟล์: โรงพยาบาล_HN_ชื่อ_นามสกุล.pdf\n\nต้องการดำเนินการต่อหรือไม่?`
    );
    if (!confirmed) return;

    try {
      const dirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite', startIn: 'downloads' });

      setIsBatchRecording(true);
      setBatchStatus('recording');
      setBatchProgress(0);
      setBatchTotal(exportQueue.length);
      setBatchSuccess(0);
      setBatchFailed(0);

      let successCount = 0;
      let failedCount = 0;
      const errors: string[] = [];

      for (let i = 0; i < exportQueue.length; i++) {
        const patient = exportQueue[i];
        const patientName = `${patient.first_name || ''} ${patient.last_name || ''}`.trim();
        setBatchCurrentName(patientName);
        setBatchProgress(i + 1);

        try {
          const pdfBlob = await generatePatientPDF(patient.id);
          const hospitalName = patient.hospitals?.name || 'ไม่ระบุโรงพยาบาล';
          const hn = patient.hospital_number || 'ไม่มีHN';
          const firstName = patient.first_name || 'ไม่ระบุชื่อ';
          const lastName = patient.last_name || '';
          const fileName = `${hospitalName}_${hn}_${firstName}_${lastName}`.replace(/\s+/g, '_') + '.pdf';

          const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(pdfBlob);
          await writable.close();

          successCount++;
          setBatchSuccess(successCount);
        } catch (error: any) {
          console.error(`❌ [Batch] ล้มเหลว: ${patientName}`, error);
          failedCount++;
          setBatchFailed(failedCount);
          errors.push(`${patientName}: ${error.message || error}`);
        }
      }

      setBatchStatus('done');
      const msg = `✅ บันทึกรายการเสร็จสิ้น!\n\n✓ สำเร็จ: ${successCount} ไฟล์\n✗ ล้มเหลว: ${failedCount} ไฟล์\n\nโฟลเดอร์ปลายทาง: ${dirHandle.name}`;
      alert(errors.length > 0 ? msg + `\n\n❌ ข้อผิดพลาด:\n${errors.join('\n')}` : msg);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        alert('❌ ยกเลิกการเลือกโฟลเดอร์');
      } else {
        setBatchStatus('error');
        setBatchErrorMessage(error.message || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ');
        alert('❌ เกิดข้อผิดพลาด: ' + (error.message || 'กรุณาลองใหม่อีกครั้ง'));
      }
    } finally {
      setIsBatchRecording(false);
    }
  };

  // ✅ Fallback: บันทึกรวมเป็น ZIP
  const handleBatchRecordAsZip = async () => {
    setIsBatchRecording(true);
    setBatchStatus('recording');
    setBatchProgress(0);
    setBatchTotal(exportQueue.length);
    setBatchSuccess(0);
    setBatchFailed(0);

    const zip = new JSZip();
    let successCount = 0;
    let failedCount = 0;

    try {
      for (let i = 0; i < exportQueue.length; i++) {
        const patient = exportQueue[i];
        setBatchCurrentName(`${patient.first_name || ''} ${patient.last_name || ''}`.trim());
        setBatchProgress(i + 1);
        try {
          const pdfBlob = await generatePatientPDF(patient.id);
          const hospitalName = patient.hospitals?.name || 'ไม่ระบุโรงพยาบาล';
          const hn = patient.hospital_number || 'ไม่มีHN';
          const fileName = `${hospitalName}_${hn}_${patient.first_name || ''}_${patient.last_name || ''}`.replace(/\s+/g, '_') + '.pdf';
          zip.file(fileName, pdfBlob);
          successCount++;
          setBatchSuccess(successCount);
        } catch (error) {
          failedCount++;
          setBatchFailed(failedCount);
        }
      }

      setBatchCurrentName('กำลังสร้างไฟล์ ZIP...');
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ระเบียนคนไข้_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setBatchStatus('done');
      alert(`✅ บันทึกรายการเสร็จสิ้น!\n\n✓ สำเร็จ: ${successCount} ไฟล์\n✗ ล้มเหลว: ${failedCount} ไฟล์\n\nไฟล์ ZIP ถูกดาวน์โหลดแล้ว`);
    } catch (error: any) {
      setBatchStatus('error');
      setBatchErrorMessage(error.message);
      alert('❌ เกิดข้อผิดพลาด: ' + (error.message || 'กรุณาลองใหม่อีกครั้ง'));
    } finally {
      setIsBatchRecording(false);
    }
  };

  const closeExportList = () => {
    if (isBatchRecording && !confirm('กำลังบันทึกรายการอยู่ ต้องการยกเลิกหรือไม่?')) return;
    setShowExportList(false);
    setExportQueue([]);
    setBatchProgress(0);
    setBatchSuccess(0);
    setBatchFailed(0);
    setBatchStatus('idle');
  };

  const getSelectedHospitalName = () => {
    if (selectedHospital === 'all') return 'ทั้งหมด';
    const hospital = hospitals.find(h => h.id === selectedHospital);
    return hospital?.name || 'ไม่ระบุ';
  };

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
      ? new Date(patient.latest_followup_date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })
      : '';
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
        <Activity className="w-3 h-3" />
        {patient.followup_count} ครั้ง {dateStr && `(${dateStr})`}
      </span>
    );
  };

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
              <p className="text-gray-600">เลือกรายงานและบันทึกรายการเป็น PDF ฉบับสมบูรณ์</p>
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
                      {user?.role === 'admin' ? '👑 ผู้ดูแลระบบ' : user?.role === 'doctor' ? '👨‍️ แพทย์' : user?.role === 'osm' ? '🏘️ อสม.' : '👩‍💼 เจ้าหน้าที่'}
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

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* เลือกโรงพยาบาล */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-gray-200">
          <div className="flex items-center gap-3 mb-4">
            <Hospital className="w-6 h-6 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-800">เลือกโรงพยาบาล</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">โรงพยาบาลที่ต้องการดูระเบียน</label>
              <select
                value={selectedHospital}
                onChange={(e) => setSelectedHospital(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">ทั้งหมด ({hospitals.reduce((sum, h) => sum + (h.patientCount || 0), 0)} คน)</option>
                {hospitals.map((hospital) => (
                  <option key={hospital.id} value={hospital.id}>
                    {hospital.name} ({hospital.patientCount || 0} คน){hospital.type === 'main' ? ' - แม่ข่าย' : ' - ลูกข่าย'}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex-1">
                <p className="text-sm text-blue-800"><span className="font-semibold">🏥 โรงพยาบาล:</span> {getSelectedHospitalName()}</p>
                <p className="text-sm text-blue-600 mt-1"><span className="font-semibold">👥 ผู้ป่วยทั้งหมด:</span> {filteredPatients.length} คน</p>
                <p className="text-sm text-blue-600"><span className="font-semibold">✅ เลือกแล้ว:</span> {selectedPatients.size} คน</p>
                <div className="mt-2 pt-2 border-t border-blue-200 space-y-1">
                  <p className="text-xs text-green-700 font-medium">✓ มีข้อมูลติดตาม: <span className="font-bold">{patientsWithFollowup}</span> คน</p>
                  <p className="text-xs text-gray-600">✗ ไม่มีข้อมูลติดตาม: <span className="font-bold">{patientsWithoutFollowup}</span> คน</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ปุ่มบันทึกรวม */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl shadow-lg p-6 mb-6 text-white">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h3 className="text-xl font-bold mb-1">💾 บันทึกรายการ PDF</h3>
              <p className="text-blue-100 text-sm">
                เลือกแล้ว <span className="font-bold text-white">{selectedPatients.size}</span> คน
                {selectedHospital !== 'all' && <span className="ml-2">(โรงพยาบาล: {getSelectedHospitalName()})</span>}
              </p>
            </div>
            <button
              onClick={handleExport}
              disabled={selectedPatients.size === 0}
              className="px-6 py-3 bg-white text-blue-600 rounded-lg hover:bg-blue-50 transition-all font-semibold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              <FileText className="w-5 h-5" />
              บันทึกรวม ({selectedPatients.size})
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2"><Search className="w-4 h-4 inline mr-1" /> ค้นหาชื่อ / HN</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="พิมพ์ชื่อ หรือ HN..."
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2"><Filter className="w-4 h-4 inline mr-1" /> PAM Level</label>
              <select value={pamFilter} onChange={(e) => setPamFilter(e.target.value)} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500">
                <option value="all">ทั้งหมด</option>
                <option value="L0">L0 - ไม่ทราบ</option>
                <option value="L1">L1 - Deny</option>
                <option value="L2">L2 - General</option>
                <option value="L3">L3 - Intensive</option>
                <option value="L4">L4 - Champion</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2"><Filter className="w-4 h-4 inline mr-1" /> Zone</label>
              <select value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500">
                <option value="all">ทั้งหมด</option>
                <option value="Green Zone">Green Zone</option>
                <option value="Yellow Zone">Yellow Zone</option>
                <option value="Red Zone">Red Zone</option>
              </select>
            </div>
          </div>
        </div>

        {/* ตารางผู้ป่วย */}
        <div className="bg-white rounded-xl shadow-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-4 text-left">
                    <button onClick={toggleSelectAll} className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 px-2 py-1 rounded">
                      {paginatedPatients.length > 0 && paginatedPatients.every(p => selectedPatients.has(p.id)) ? (
                        <CheckSquare className="w-5 h-5 text-blue-600" />
                      ) : (
                        <Square className="w-5 h-5 text-gray-400" />
                      )}
                      เลือกหน้านี้
                    </button>
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ชื่อ-นามสกุล</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">HN</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">อายุ/เพศ</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">PAM</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Zone</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ติดตาม</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">น้ำหนัก</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">FPG</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">การกระทำ</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {paginatedPatients.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
                      <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p>ไม่พบข้อมูลผู้ป่วย</p>
                    </td>
                  </tr>
                ) : (
                  paginatedPatients.map((patient) => (
                    <tr key={patient.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <button onClick={() => toggleSelectPatient(patient.id)} className="flex items-center gap-2">
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
                      <td className="px-6 py-4"><span className="font-mono text-sm">{patient.hospital_number || '-'}</span></td>
                      <td className="px-6 py-4 text-sm text-gray-700">{patient.age || '-'} ปี / {patient.gender === 'female' ? 'หญิง' : 'ชาย'}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          patient.pam_level === 'L4' ? 'bg-purple-100 text-purple-700' :
                          patient.pam_level === 'L3' ? 'bg-blue-100 text-blue-700' :
                          patient.pam_level === 'L2' ? 'bg-green-100 text-green-700' :
                          patient.pam_level === 'L1' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>{patient.pam_level || 'L0'}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          patient.zone === 'Green Zone' ? 'bg-green-100 text-green-700' :
                          patient.zone === 'Yellow Zone' ? 'bg-yellow-100 text-yellow-700' :
                          patient.zone === 'Red Zone' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>{patient.zone || '-'}</span>
                      </td>
                      <td className="px-6 py-4">{getFollowupBadge(patient)}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{patient.latest_weight ? `${patient.latest_weight} กก.` : '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{patient.latest_fpg ? `${patient.latest_fpg} mg/dL` : '-'}</td>
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

          {totalPages > 1 && (
            <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between">
              <div className="text-sm text-gray-600">แสดง {startIndex + 1} - {Math.min(endIndex, filteredPatients.length)} จาก {filteredPatients.length} คน</div>
              <div className="flex items-center gap-2">
                <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50"><ChevronsLeft className="w-4 h-4" /></button>
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50"><ChevronLeft className="w-4 h-4" /></button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) pageNum = i + 1;
                  else if (currentPage <= 3) pageNum = i + 1;
                  else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                  else pageNum = currentPage - 2 + i;
                  return (
                    <button key={pageNum} onClick={() => setCurrentPage(pageNum)} className={`px-3 py-2 rounded-lg text-sm font-medium ${currentPage === pageNum ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 hover:bg-gray-100'}`}>
                      {pageNum}
                    </button>
                  );
                })}
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50"><ChevronRight className="w-4 h-4" /></button>
                <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50"><ChevronsRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal บันทึกรวม */}
      {showExportList && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <FolderOpen className="w-6 h-6 text-blue-600" />
                บันทึกรายการรวม ({exportQueue.length} คน)
              </h3>
              <button onClick={closeExportList} className="text-gray-400 hover:text-gray-600" disabled={isBatchRecording}>
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6">
              {batchStatus === 'idle' && (
                <>
                  <div className="mb-6 p-4 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg text-white">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="font-bold text-lg mb-1">💾 บันทึกรวมทั้งหมด</h4>
                        <p className="text-sm text-blue-100">เลือกโฟลเดอร์ → ระบบจะบันทึก PDF {exportQueue.length} ไฟล์ลงโฟลเดอร์นั้นทันที</p>
                      </div>
                      <button
                        onClick={handleBatchRecord}
                        className="px-6 py-3 bg-white text-blue-600 rounded-lg hover:bg-blue-50 transition-all font-bold flex items-center gap-2 shadow-lg"
                      >
                        <HardDrive className="w-5 h-5" />
                        เลือกโฟลเดอร์และบันทึก
                      </button>
                    </div>
                  </div>
                  <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-start gap-3">
                      <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-blue-800 mb-2">📋 วิธีใช้งาน:</p>
                        <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
                          <li>กดปุ่ม "เลือกโฟลเดอร์และบันทึก" ด้านบน</li>
                          <li>เลือกโฟลเดอร์ปลายทางที่ต้องการบันทึก</li>
                          <li>ระบบจะสร้าง PDF ฉบับสมบูรณ์และบันทึกลงโฟลเดอร์ทันที</li>
                          <li>รอจนกว่าระบบจะบันทึกครบทุกคน</li>
                        </ol>
                        <p className="text-xs text-blue-600 mt-3 italic">💡 ชื่อไฟล์: โรงพยาบาล_HN_ชื่อ_นามสกุล.pdf</p>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {batchStatus === 'recording' && (
                <div className="mb-6 p-6 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg text-white">
                  <div className="flex items-center gap-3 mb-4">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <div>
                      <h4 className="font-bold text-lg">กำลังบันทึกรายการ...</h4>
                      <p className="text-sm text-blue-100">{batchCurrentName && `กำลังบันทึก: ${batchCurrentName}`}</p>
                    </div>
                  </div>
                  <div className="mb-2">
                    <div className="flex justify-between text-sm mb-2">
                      <span>ความคืบหน้า:</span>
                      <span className="font-bold">{batchProgress} / {batchTotal} คน</span>
                    </div>
                    <div className="w-full bg-blue-200 rounded-full h-3 overflow-hidden">
                      <div className="h-3 bg-white rounded-full transition-all duration-300" style={{ width: `${batchTotal > 0 ? (batchProgress / batchTotal) * 100 : 0}%` }} />
                    </div>
                  </div>
                  <div className="flex justify-between text-xs mt-3 text-blue-100">
                    <span>✅ สำเร็จ: {batchSuccess}</span>
                    {batchFailed > 0 && <span>❌ ล้มเหลว: {batchFailed}</span>}
                  </div>
                </div>
              )}

              {batchStatus === 'done' && (
                <div className="mb-6 p-6 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-8 h-8 text-green-600 flex-shrink-0" />
                    <div>
                      <h4 className="font-bold text-lg text-green-800 mb-2">✅ บันทึกรายการเสร็จสิ้น!</h4>
                      <p className="text-sm text-green-700">✓ สำเร็จ: <strong>{batchSuccess}</strong> ไฟล์</p>
                      {batchFailed > 0 && <p className="text-sm text-yellow-700">✗ ล้มเหลว: <strong>{batchFailed}</strong> ไฟล์</p>}
                    </div>
                  </div>
                </div>
              )}

              {batchStatus === 'error' && (
                <div className="mb-6 p-6 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-8 h-8 text-red-600 flex-shrink-0" />
                    <div>
                      <h4 className="font-bold text-lg text-red-800 mb-2">❌ เกิดข้อผิดพลาด</h4>
                      <p className="text-sm text-red-700">{batchErrorMessage}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <h4 className="font-semibold text-gray-700">รายการที่จะบันทึก ({exportQueue.length} คน):</h4>
                {exportQueue.map((patient, index) => (
                  <div key={patient.id} className="flex items-center justify-between p-3 rounded-lg border bg-white border-gray-200">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold bg-blue-500">{index + 1}</div>
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900">{patient.first_name} {patient.last_name}</p>
                        <p className="text-xs text-gray-500">HN: {patient.hospital_number || '-'} | {patient.hospitals?.name || '-'}</p>
                      </div>
                    </div>
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  </div>
                ))}
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 flex justify-end">
              <button onClick={closeExportList} disabled={isBatchRecording} className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium disabled:opacity-50">
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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