// app/admin/goals-history/page.tsx
// ✅ เพิ่มแสดงเป้าหมายหลัก 4 ประการ (Core Performance Goals)
// ✅ รองรับ from parameter + patient_id auto-select
'use client';

import { useEffect, useState, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { checkSession, logout, isSuperAdmin, getAccessibleHospitalIds } from '@/lib/supabase/queries';
import { supabase } from '@/lib/supabase/client';
import {
  ArrowLeft, LogOut, Search, User, FileText, Calendar, History,
  CheckCircle, XCircle, Target, Loader2, AlertCircle, ChevronDown, ChevronUp,
  Trophy, CheckCircle2, Circle
} from 'lucide-react';

// ---------- Types ----------
interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  hospital_number: string;
  pam_level: string;
  phone?: string;
  hospital_id?: string;
  primary_goal_code?: string; // ✅ เพิ่ม
  hospitals?: { name: string; type: string } | null;
}

interface GoalRecord {
  id: string;
  user_id: string;
  goal_type: string;
  goal_name: string;
  goal_name_th: string;
  target_days: number;
  target_value?: number;
  target_unit?: string;
  status: string;
  is_current: boolean;
  round_number: number;
  created_at: string;
  primary_goal_note?: string;
  weekly_goal_note?: string;
}

interface GoalRound {
  round_number: number;
  is_current: boolean;
  created_at: string;
  goals_count: number;
  goals: GoalRecord[];
  primary_goal_note?: string;
  weekly_goal_note?: string;
}

// ---------- Constants ----------
const LONG_TERM_GOALS = [
  { code: 'weight', name_th: 'น้ำหนักลด (Weight Reduction)', description: 'ลดลงอย่างน้อย 5-10% และลด Visceral Fat' },
  { code: 'glucose', name_th: 'น้ำตาลลง (Glucose Control)', description: 'ควบคุมระดับน้ำตาลในเลือดให้เข้าสู่เกณฑ์ปกติ' },
  { code: 'medication', name_th: 'ลดยาได้ (Medication De-escalation)', description: 'ปรับลดหรือหยุดยาภายใต้การกำกับของแพทย์' },
  { code: 'remission', name_th: 'ภาวะเบาหวานสงบ (Remission)', description: 'บรรลุ HbA1c < 6.5% โดยไม่ต้องใช้ยาต่อเนื่อง' },
];

// ---------- Helpers ----------
const formatThaiDate = (d: string | null | undefined) => {
  if (!d) return '-';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '-';
  const m = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  return `${date.getDate()} ${m[date.getMonth()]} ${date.getFullYear() + 543}`;
};

const formatThaiDateTime = (d: string | null | undefined) => {
  if (!d) return '-';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '-';
  const m = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  return `${date.getDate()} ${m[date.getMonth()]} ${date.getFullYear() + 543} ${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
};

// ---------- Component ----------
function GoalsHistoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientIdFromQuery = searchParams.get('patient_id');
  const fromParam = searchParams.get('from');

  const [user, setUser] = useState<any>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [goalHistory, setGoalHistory] = useState<GoalRound[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(new Set());
  const [accessibleHospitalIds, setAccessibleHospitalIds] = useState<string[]>([]);

  // ✅ คำนวณปุ่มกลับตาม from
  const backTarget = (() => {
    const pid = patientIdFromQuery || selectedPatient?.id;
    switch (fromParam) {
      case 'care-pathway': return pid ? `/admin/patients/${pid}/care-pathway` : '/admin/patients';
      case 'goals': return pid ? `/admin/goals?patient_id=${pid}&from=goals-history` : '/admin/goals';
      case 'patient-goals': return pid ? `/admin/patients/${pid}/goals` : '/admin/patients';
      case 'dashboard': return '/admin/dashboard';
      default: return pid ? `/admin/patients/${pid}` : '/admin/dashboard';
    }
  })();

  const backLabel = (() => {
    switch (fromParam) {
      case 'care-pathway': return 'กลับ Care Pathway';
      case 'goals': return 'กลับหน้าจัดการเป้าหมาย';
      case 'patient-goals': return 'กลับหน้าผู้ป่วย';
      case 'dashboard': return 'กลับ Dashboard';
      default: return patientIdFromQuery ? 'กลับหน้าผู้ป่วย' : 'กลับ Dashboard';
    }
  })();

  const handleBack = () => {
    if (!fromParam && typeof window !== 'undefined' && window.history.length > 2) {
      router.back();
      return;
    }
    router.push(backTarget);
  };

  // ---------- โหลดข้อมูล ----------
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const userData = checkSession();
    if (!userData) { router.push('/admin/login'); return; }
    if (!['admin', 'doctor', 'helper', 'osm'].includes(userData.role)) {
      alert('ไม่มีสิทธิ์เข้าถึง'); router.push('/admin/login'); return;
    }
    setUser(userData);
    loadAccessibleHospitals(userData.id);
  }, [router]);

  const loadAccessibleHospitals = async (userId: string) => {
    try {
      const ids = await getAccessibleHospitalIds(userId);
      setAccessibleHospitalIds(ids);
      await loadPatients(ids);
    } catch (error) {
      console.error('Error loading accessible hospitals:', error);
      await loadPatients([]);
    }
  };

  const loadPatients = async (hospitalIds?: string[]) => {
    try {
      let query = supabase
        .from('profiles')
        .select(`*, hospitals(id, name, type)`)
        .eq('is_active', true)
        .order('first_name', { ascending: true });

      if (hospitalIds && hospitalIds.length > 0) {
        query = query.in('hospital_id', hospitalIds);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error loading patients:', error);
        return;
      }

      const patientsList: Patient[] = (data || []).map(p => ({
        ...p,
        full_name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
      }));

      setPatients(patientsList);
      setFilteredPatients(patientsList);
    } catch (error) {
      console.error('Error loading patients:', error);
    } finally {
      setLoading(false);
    }
  };

  // ✅ Auto-select เมื่อมี patient_id จาก query
  useEffect(() => {
    if (patientIdFromQuery && patients.length > 0) {
      const patient = patients.find(p => p.id === patientIdFromQuery);
      if (patient) {
        setSelectedPatient(patient);
        loadGoalHistory(patient.id);
      }
    }
  }, [patientIdFromQuery, patients]);

  // ✅ โหลดประวัติเป้าหมาย + เป้าหมายหลัก
  const loadGoalHistory = useCallback(async (patientId: string) => {
    setHistoryLoading(true);
    try {
      // ✅ ดึง goals ทั้งหมด (active + archived)
      const { data: goalsData, error } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', patientId)
        .eq('goal_type', 'weekly_activity')
        .in('status', ['active', 'archived'])
        .order('round_number', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading goal history:', error);
        return;
      }

      // ✅ ดึง primary_goal_code จาก profiles
      const { data: profileData } = await supabase
        .from('profiles')
        .select('primary_goal_code')
        .eq('id', patientId)
        .maybeSingle();

      // จัดกลุ่มตาม round_number
      const allRecords: GoalRecord[] = goalsData || [];
      const roundsMap = new Map<number, GoalRecord[]>();
      allRecords.forEach(goal => {
        const round = goal.round_number || 1;
        if (!roundsMap.has(round)) roundsMap.set(round, []);
        roundsMap.get(round)!.push(goal);
      });

      const history: GoalRound[] = Array.from(roundsMap.entries())
        .sort(([a], [b]) => b - a)
        .map(([round, goalsList]) => ({
          round_number: round,
          is_current: goalsList.some(g => g.is_current),
          created_at: goalsList[0]?.created_at,
          goals_count: goalsList.length,
          goals: goalsList,
          primary_goal_note: goalsList[0]?.primary_goal_note,
          weekly_goal_note: goalsList[0]?.weekly_goal_note,
        }));

      setGoalHistory(history);

      // ✅ อัปเดต selectedPatient ให้มี primary_goal_code (เพื่อแสดงการ์ดเป้าหมายหลัก)
      if (profileData?.primary_goal_code) {
        setSelectedPatient(prev => prev ? { ...prev, primary_goal_code: profileData.primary_goal_code } : prev);
      }

      // ขยายรอบแรกอัตโนมัติ
      if (history.length > 0) {
        setExpandedRounds(new Set([history[0].round_number]));
      }
    } catch (error) {
      console.error('Load goal history error:', error);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // ---------- Search ----------
  const handleSearch = (value: string) => {
    setSearchTerm(value);
    if (value.trim() === '') {
      setFilteredPatients(patients);
      setShowDropdown(false);
      return;
    }
    const filtered = patients.filter(p =>
      p.hospital_number?.toLowerCase().includes(value.toLowerCase()) ||
      p.full_name?.toLowerCase().includes(value.toLowerCase())
    ).slice(0, 10);
    setFilteredPatients(filtered);
    setShowDropdown(true);
  };

  const handleSelectPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    setSearchTerm('');
    setShowDropdown(false);
    loadGoalHistory(patient.id);
  };

  const toggleRound = (roundNumber: number) => {
    setExpandedRounds(prev => {
      const next = new Set(prev);
      if (next.has(roundNumber)) next.delete(roundNumber);
      else next.add(roundNumber);
      return next;
    });
  };

  const handleLogout = () => { logout(); router.push('/admin/login'); };

  // ---------- Render ----------
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <button
                onClick={handleBack}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-2"
                title={`กลับ → ${backTarget}`}
              >
                <ArrowLeft className="w-4 h-4" />
                {backLabel}
              </button>
              <h1 className="text-2xl font-bold text-gray-800">📋 ตรวจสอบประวัติเป้าหมาย</h1>
              <p className="text-sm text-gray-600">ดูการบันทึกเป้าหมายและหมายเหตุทุกรอบ</p>
              {fromParam && <p className="text-xs text-gray-400 mt-1">🔗 มาจาก: {fromParam}</p>}
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
            >
              <LogOut className="w-4 h-4" /> ออกจากระบบ
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* ✅ Search (ซ่อนเมื่อมี patient_id จาก query) */}
        {!patientIdFromQuery && (
          <div className="bg-white rounded-xl shadow-sm p-6 border">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Search className="w-5 h-5 text-blue-600" /> ค้นหาผู้ป่วย
            </h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="พิมพ์ HN หรือชื่อผู้ป่วย..."
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              {showDropdown && filteredPatients.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {filteredPatients.map(p => (
                    <button
                      key={p.id}
                      onClick={() => handleSelectPatient(p)}
                      className="w-full px-4 py-3 text-left hover:bg-blue-50 border-b border-gray-100 last:border-0"
                    >
                      <p className="font-semibold text-gray-800">{p.hospital_number} - {p.full_name}</p>
                      <p className="text-sm text-gray-500">PAM: {p.pam_level} | {p.hospitals?.name || '-'}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">หรือเลือกจากรายการ</label>
              <select
                onChange={(e) => {
                  const p = patients.find(x => x.id === e.target.value);
                  if (p) handleSelectPatient(p);
                }}
                value=""
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- เลือกผู้ป่วย --</option>
                {patients.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.hospital_number} - {p.full_name} (PAM: {p.pam_level})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* ✅ Patient Info Card */}
        {selectedPatient && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-start gap-4">
              <div className="bg-blue-100 p-3 rounded-full">
                <User className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-blue-900">{selectedPatient.full_name}</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                  <div>
                    <p className="text-xs text-blue-600">HN</p>
                    <p className="text-sm font-semibold text-blue-900">{selectedPatient.hospital_number}</p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-600">PAM Level</p>
                    <p className="text-sm font-semibold text-blue-900">{selectedPatient.pam_level}</p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-600">โรงพยาบาล</p>
                    <p className="text-sm font-semibold text-blue-900">{selectedPatient.hospitals?.name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-600">จำนวนรอบ</p>
                    <p className="text-sm font-semibold text-blue-900">{goalHistory.length} รอบ</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ✅ เป้าหมายหลัก 4 ประการ (Core Performance Goals) */}
        {selectedPatient && (
          <div className="bg-white rounded-xl shadow-sm border">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-purple-600" />
                เป้าหมายหลัก 4 ประการ (Core Performance Goals)
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {selectedPatient.primary_goal_code
                  ? `เป้าหมายหลักที่เลือก: ${LONG_TERM_GOALS.find(g => g.code === selectedPatient.primary_goal_code)?.name_th || '-'}`
                  : 'ยังไม่ได้เลือกเป้าหมายหลัก'}
              </p>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {LONG_TERM_GOALS.map((goal) => {
                  const isSelected = selectedPatient.primary_goal_code === goal.code;
                  return (
                    <div
                      key={goal.code}
                      className={`relative flex flex-col p-4 rounded-xl border-2 transition-all ${
                        isSelected
                          ? 'border-purple-500 bg-purple-50 shadow-md'
                          : 'border-gray-200 bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-1">
                          {isSelected ? (
                            <CheckCircle2 className="w-6 h-6 text-purple-600" />
                          ) : (
                            <Circle className="w-6 h-6 text-gray-400" />
                          )}
                        </div>
                        <div className="flex-1">
                          <p className={`font-bold mb-1 ${isSelected ? 'text-purple-900' : 'text-gray-800'}`}>
                            {goal.name_th}
                          </p>
                          <p className={`text-sm ${isSelected ? 'text-purple-700' : 'text-gray-600'}`}>
                            {goal.description}
                          </p>
                        </div>
                      </div>
                      {isSelected && (
                        <div className="absolute top-2 right-2">
                          <span className="px-2 py-1 bg-purple-600 text-white rounded-full text-xs font-bold">
                            ✓ เลือกแล้ว
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ✅ แสดงหมายเหตุเป้าหมายหลัก (ถ้ามี) */}
              {goalHistory[0]?.primary_goal_note && (
                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="text-sm font-semibold text-blue-900 mb-2">📝 หมายเหตุเป้าหมายหลัก</h4>
                  <p className="text-sm text-blue-800">{goalHistory[0].primary_goal_note}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ✅ Goal History (เป้าหมายรายสัปดาห์) */}
        {selectedPatient && (
          <div className="bg-white rounded-xl shadow-sm border">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <History className="w-5 h-5 text-blue-600" />
                ประวัติการบันทึกเป้าหมายรายสัปดาห์
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {goalHistory.length > 0
                  ? `พบ ${goalHistory.length} รอบ · รอบปัจจุบัน: ${goalHistory.find(r => r.is_current)?.round_number || '-'}`
                  : 'ยังไม่มีประวัติ'}
              </p>
            </div>

            {historyLoading ? (
              <div className="p-12 text-center">
                <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto mb-3" />
                <p className="text-gray-600">กำลังโหลดประวัติ...</p>
              </div>
            ) : goalHistory.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                <Target className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="font-medium">ยังไม่มีประวัติการบันทึกเป้าหมาย</p>
                <p className="text-sm mt-1">ผู้ป่วยยังไม่ได้ตั้งเป้าหมายในรอบใดๆ</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {goalHistory.map((round) => {
                  const isExpanded = expandedRounds.has(round.round_number);
                  return (
                    <div key={round.round_number}>
                      {/* Round Header */}
                      <button
                        onClick={() => toggleRound(round.round_number)}
                        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`p-2 rounded-full ${round.is_current ? 'bg-green-100' : 'bg-gray-200'}`}>
                            {round.is_current ? (
                              <CheckCircle className="w-5 h-5 text-green-600" />
                            ) : (
                              <XCircle className="w-5 h-5 text-gray-600" />
                            )}
                          </div>
                          <div className="text-left">
                            <p className="font-bold text-gray-800">
                              รอบที่ {round.round_number}
                              {round.is_current && (
                                <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                                  ปัจจุบัน
                                </span>
                              )}
                            </p>
                            <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {formatThaiDateTime(round.created_at)}
                              </span>
                              <span className="flex items-center gap-1">
                                <FileText className="w-3 h-3" />
                                {round.goals_count} กิจกรรม
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            round.is_current ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'
                          }`}>
                            {round.is_current ? 'Active' : 'Archived'}
                          </span>
                          {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                        </div>
                      </button>

                      {/* Round Detail */}
                      {isExpanded && (
                        <div className="px-4 pb-4 space-y-4">
                          {/* หมายเหตุ */}
                          {(round.primary_goal_note || round.weekly_goal_note) && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                              <h4 className="text-sm font-semibold text-blue-900 mb-2">📝 หมายเหตุ</h4>
                              {round.primary_goal_note && (
                                <div className="mb-2">
                                  <p className="text-xs text-blue-700 font-medium">เป้าหมายหลัก:</p>
                                  <p className="text-sm text-blue-800">{round.primary_goal_note}</p>
                                </div>
                              )}
                              {round.weekly_goal_note && (
                                <div>
                                  <p className="text-xs text-blue-700 font-medium">รายสัปดาห์:</p>
                                  <p className="text-sm text-blue-800">{round.weekly_goal_note}</p>
                                </div>
                              )}
                            </div>
                          )}

                          {/* ตารางกิจกรรม */}
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-gray-100">
                                  <th className="px-3 py-2 text-left font-semibold text-gray-700">กิจกรรม</th>
                                  <th className="px-3 py-2 text-center font-semibold text-gray-700">วัน/สัปดาห์</th>
                                  <th className="px-3 py-2 text-center font-semibold text-gray-700">ค่าเป้าหมาย</th>
                                  <th className="px-3 py-2 text-center font-semibold text-gray-700">สถานะ</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {round.goals.map((goal) => (
                                  <tr key={goal.id} className="hover:bg-gray-50">
                                    <td className="px-3 py-2">
                                      <p className="font-medium text-gray-800">{goal.goal_name_th}</p>
                                      <p className="text-xs text-gray-500">{goal.goal_name}</p>
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      <span className="inline-block bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs font-semibold">
                                        {goal.target_days} วัน
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      {goal.target_value ? (
                                        <span className="text-gray-700">{goal.target_value} {goal.target_unit}</span>
                                      ) : (
                                        <span className="text-gray-400">-</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${
                                        goal.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'
                                      }`}>
                                        {goal.status}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function GoalsHistoryPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
      </div>
    }>
      <GoalsHistoryContent />
    </Suspense>
  );
}