// app/admin/goals-history/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, logout, getPatientList } from '@/lib/supabase/queries';
import { supabase } from '@/lib/supabase/client';
import { ArrowLeft, LogOut, Search, User, FileText, Calendar, History, CheckCircle, XCircle } from 'lucide-react';

interface Patient {
  id: string;
  full_name: string;
  hospital_number: string;
  pam_level: string;
  phone?: string;
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
  updated_at: string;
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

export default function GoalsHistoryPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  
  // ✅ Search States
  const [searchHN, setSearchHN] = useState('');
  const [searchName, setSearchName] = useState('');
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [searchType, setSearchType] = useState<'hn' | 'name' | null>(null);
  
  // ✅ Selected Patient
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [goalHistory, setGoalHistory] = useState<GoalRound[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedRounds, setExpandedRounds] = useState<number[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const userData = checkSession();
    
    if (!userData) {
      router.push('/admin/login');
      return;
    }

    if (!['admin', 'doctor', 'helper'].includes(userData.role)) {
      alert('ไม่มีสิทธิ์เข้าถึง');
      router.push('/admin/login');
      return;
    }

    setUser(userData);
    loadPatients();
  }, [router]);

  const loadPatients = async () => {
    try {
      const data = await getPatientList();
      setPatients(data);
    } catch (error) {
      console.error('Error loading patients:', error);
    } finally {
      setLoading(false);
    }
  };

  // ✅ ค้นหาด้วย HN
  const handleSearchHN = (value: string) => {
    setSearchHN(value);
    setSearchType('hn');
    if (value.trim() === '') {
      setFilteredPatients([]);
      setShowSearchDropdown(false);
      return;
    }

    const filtered = patients.filter(patient => 
      patient.hospital_number?.toLowerCase().includes(value.toLowerCase()) ||
      patient.full_name?.toLowerCase().includes(value.toLowerCase())
    ).slice(0, 10);

    setFilteredPatients(filtered);
    setShowSearchDropdown(true);
  };

  // ✅ ค้นหาด้วยชื่อ
  const handleSearchName = (value: string) => {
    setSearchName(value);
    setSearchType('name');
    if (value.trim() === '') {
      setFilteredPatients([]);
      setShowSearchDropdown(false);
      return;
    }

    const filtered = patients.filter(patient => 
      patient.full_name?.toLowerCase().includes(value.toLowerCase()) ||
      patient.hospital_number?.toLowerCase().includes(value.toLowerCase())
    ).slice(0, 10);

    setFilteredPatients(filtered);
    setShowSearchDropdown(true);
  };

  // ✅ เลือกผู้ป่วย
  const handleSelectPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    setSearchHN('');
    setSearchName('');
    setShowSearchDropdown(false);
    setFilteredPatients([]);
    loadGoalHistory(patient.id);
  };

// ✅ โหลดประวัติเป้าหมาย (แสดงทั้งหมดไม่กรอง)
const loadGoalHistory = async (patientId: string) => {
  setHistoryLoading(true);
  try {
    console.log('🔍 Loading ALL goal records for:', patientId);
    
    const { data: goalsData, error } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', patientId)
      .eq('goal_type', 'weekly_activity')
      .in('status', ['active', 'archived'])
      .order('created_at', { ascending: false });  // เรียงตาม created_at

    if (error) {
      console.error('Error loading goal history:', error);
      return;
    }

    console.log('📊 Loaded ALL goals:', goalsData?.length || 0, 'records');
    console.log('📊 Sample data:', goalsData?.slice(0, 3));

    // ✅ แสดงทุก record เลย ไม่จัดกลุ่ม
    const allRecords: GoalRecord[] = goalsData || [];
    
    // แปลงเป็น GoalRound โดยแต่ละ record เป็น 1 round
    const history: GoalRound[] = allRecords.map((goal, index) => ({
      round_number: goal.round_number || Math.floor(index / 5) + 1,
      is_current: goal.is_current || false,
      created_at: goal.created_at,
      goals_count: 1,
      goals: [goal],  // แต่ละรอบมีแค่ 1 goal
      primary_goal_note: goal.primary_goal_note,
      weekly_goal_note: goal.weekly_goal_note,
    }));

    console.log('📚 Total records to display:', history.length);
    setGoalHistory(history);

  } catch (error) {
    console.error('Load goal history error:', error);
  } finally {
    setHistoryLoading(false);
  }
};

  // ✅ Toggle ขยาย/ยุบรอบ
  const toggleRound = (roundNumber: number) => {
    setExpandedRounds(prev => 
      prev.includes(roundNumber) 
        ? prev.filter(r => r !== roundNumber)
        : [...prev, roundNumber]
    );
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">กำลังโหลด...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <button
                onClick={() => router.push('/admin/dashboard')}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-2"
              >
                <ArrowLeft className="w-4 h-4" />
                กลับ Dashboard
              </button>
              <h1 className="text-2xl font-bold text-gray-800">ตรวจสอบประวัติเป้าหมาย</h1>
              <p className="text-sm text-gray-600">ตรวจสอบการบันทึกเป้าหมายและหมายเหตุ</p>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
            >
              <LogOut className="w-4 h-4" />
              ออกจากระบบ
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        
        {/* ✅ ส่วนค้นหาผู้ป่วย */}
        <div className="bg-white rounded-xl shadow-sm p-6 border mb-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Search className="w-5 h-5 text-blue-600" />
            ค้นหาผู้ป่วย
          </h2>

          {/* ค้นหาด้วย HN */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              🔍 ค้นหาด้วย HN (Hospital Number)
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={searchHN}
                onChange={(e) => handleSearchHN(e.target.value)}
                placeholder="พิมพ์ HN เพื่อค้นหา..."
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* ค้นหาด้วยชื่อ */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              👤 ค้นหาด้วยชื่อผู้ป่วย
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={searchName}
                onChange={(e) => handleSearchName(e.target.value)}
                placeholder="พิมพ์ชื่อผู้ป่วยเพื่อค้นหา..."
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Dropdown ผลการค้นหา */}
          {showSearchDropdown && filteredPatients.length > 0 && (
            <div className="mb-4 border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
              {filteredPatients.map((patient) => (
                <button
                  key={patient.id}
                  onClick={() => handleSelectPatient(patient)}
                  className="w-full px-4 py-3 text-left hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-800">
                        {patient.hospital_number} - {patient.full_name}
                      </p>
                      <p className="text-sm text-gray-500">
                        PAM: {patient.pam_level} | {patient.phone || 'ไม่มีเบอร์โทร'}
                      </p>
                    </div>
                    <div className="text-sm text-blue-600 font-medium">
                      คลิกเลือก
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Dropdown แบบเดิม (สำรอง) */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              หรือเลือกจากรายการทั้งหมด
            </label>
            <select
              onChange={(e) => {
                const patient = patients.find(p => p.id === e.target.value);
                if (patient) handleSelectPatient(patient);
              }}
              value={selectedPatient?.id || ''}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">-- เลือกผู้ป่วย --</option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.hospital_number} - {patient.full_name} (PAM: {patient.pam_level})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ✅ แสดงข้อมูลผู้ป่วยที่เลือก */}
        {selectedPatient && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
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
                    <p className="text-xs text-blue-600">เบอร์โทร</p>
                    <p className="text-sm font-semibold text-blue-900">{selectedPatient.phone || '-'}</p>
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

        {/* ✅ แสดงประวัติเป้าหมาย */}
        {selectedPatient && (
          <div className="bg-white rounded-xl shadow-sm border">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <History className="w-5 h-5 text-blue-600" />
                ประวัติการบันทึกเป้าหมาย
              </h2>
            </div>

            {historyLoading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                <p className="text-gray-600">กำลังโหลดประวัติ...</p>
              </div>
            ) : goalHistory.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <FileText className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>ยังไม่มีประวัติการบันทึกเป้าหมาย</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {goalHistory.map((round) => (
                  <div key={round.round_number} className="p-4">
                    {/* Header ของแต่ละรอบ */}
                    <button
                      onClick={() => toggleRound(round.round_number)}
                      className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-full ${
                          round.is_current ? 'bg-green-100' : 'bg-gray-200'
                        }`}>
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
                              {formatDate(round.created_at)}
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
                          round.is_current 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-gray-200 text-gray-700'
                        }`}>
                          {round.is_current ? 'Active' : 'Archived'}
                        </span>
                        <span className="text-gray-400">
                          {expandedRounds.includes(round.round_number) ? '▼' : '▶'}
                        </span>
                      </div>
                    </button>

                    {/* รายละเอียดของแต่ละรอบ (ขยายได้) */}
                    {expandedRounds.includes(round.round_number) && (
                      <div className="mt-4 p-4 bg-white border border-gray-200 rounded-lg">
                        {/* หมายเหตุ */}
                        {(round.primary_goal_note || round.weekly_goal_note) && (
                          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
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
                                      <span className="text-gray-700">
                                        {goal.target_value} {goal.target_unit}
                                      </span>
                                    ) : (
                                      <span className="text-gray-400">-</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${
                                      goal.status === 'active' 
                                        ? 'bg-green-100 text-green-700' 
                                        : 'bg-gray-200 text-gray-700'
                                    }`}>
                                      {goal.status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Debug Info */}
                        <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                          <p className="text-xs text-gray-500 font-mono">
                            Created: {round.created_at} | 
                            Updated: {round.goals[0]?.updated_at} | 
                            Round: {round.round_number}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}