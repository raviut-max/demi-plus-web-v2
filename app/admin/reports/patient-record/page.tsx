// app/admin/reports/patient-record/page.tsx
// ✅ หน้าเลือกระเบียนคนไข้สำหรับ Export PDF
// ✅ รองรับ 2 โหมด: ทั้งโรงพยาบาล / เฉพาะราย
'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { checkSession, logout, getAccessibleHospitalIds, getUserHospitalInfo } from '@/lib/supabase/queries';
import { supabase } from '@/lib/supabase/client';
import {
  Users, FileText, ArrowLeft, LogOut, UserCheck, Hospital,
  Search, Filter, Download, FileSpreadsheet,
  CheckSquare, Square, Loader2, Printer, X
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
}

export default function PatientRecordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode = searchParams.get('mode') || 'hospital';

  const [user, setUser] = useState<any>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatients, setSelectedPatients] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [pamFilter, setPamFilter] = useState('all');
  const [zoneFilter, setZoneFilter] = useState('all');
  const [exportMode, setExportMode] = useState<'individual' | 'zip'>('individual');
  const [mode, setMode] = useState<'hospital' | 'select'>(initialMode as any);

  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }
    setUser(userData);
    loadPatients(userData.id);
  }, [router]);

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

      const { data, error } = await query;
      if (error) throw error;
      setPatients(data || []);
    } catch (error) {
      console.error('Error loading patients:', error);
    } finally {
      setLoading(false);
    }
  };

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
      
      if (exportMode === 'individual') {
        // Export แยกไฟล์ - เปิดหน้าต่างใหม่ทีละคน
        for (const patient of selectedPatientData) {
          window.open(
            `/admin/reports/patient-record/${patient.id}?print=true`,
            '_blank'
          );
          // หน่วงเวลาเล็กน้อยเพื่อไม่ให้ browser block popup
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        alert(`✅ เปิดระเบียน ${selectedPatientData.length} ไฟล์แล้ว กรุณาอนุญาต Popup หากถูกบล็อค`);
      } else {
        // Export รวม ZIP - เปิดหน้ารวม
        const ids = selectedPatientData.map(p => p.id).join(',');
        window.open(
          `/admin/reports/patient-record/batch?ids=${ids}`,
          '_blank'
        );
        alert(`✅ เปิดหน้า Export ZIP แล้ว`);
      }
    } catch (error) {
      console.error('Export error:', error);
      alert('❌ เกิดข้อผิดพลาดในการ Export');
    } finally {
      setExporting(false);
    }
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
                       user?.role === 'doctor' ? '👨‍⚕️ แพทย์' :
                       user?.role === 'osm' ? '🏘️ อสม.' : '👩‍💼 เจ้าหน้าที่'}
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
        {/* Mode Selection */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4">เลือกรูปแบบการ Export</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => setMode('hospital')}
              className={`p-6 rounded-xl border-2 transition-all text-left ${
                mode === 'hospital' 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-gray-200 hover:border-blue-300'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                  <Hospital className="w-8 h-8 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-800">🏥 ทั้งโรงพยาบาล</h3>
                  <p className="text-sm text-gray-600">Export ระเบียนผู้ป่วยทั้งหมดในโรงพยาบาล</p>
                </div>
              </div>
            </button>
            <button
              onClick={() => setMode('select')}
              className={`p-6 rounded-xl border-2 transition-all text-left ${
                mode === 'select' 
                  ? 'border-green-500 bg-green-50' 
                  : 'border-gray-200 hover:border-green-300'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                  <Users className="w-8 h-8 text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-800">👤 เฉพาะราย</h3>
                  <p className="text-sm text-gray-600">เลือกผู้ป่วยเฉพาะคนที่ต้องการ</p>
                </div>
              </div>
            </button>
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
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">น้ำหนัก</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">FPG</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">การกระทำ</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredPatients.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                      <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p>ไม่พบข้อมูลผู้ป่วย</p>
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
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {patient.current_weight ? `${patient.current_weight} กก.` : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {patient.blood_sugar ? `${patient.blood_sugar} mg/dL` : '-'}
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