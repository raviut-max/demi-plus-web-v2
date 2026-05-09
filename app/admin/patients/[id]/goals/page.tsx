// app/admin/patients/[id]/goals/page.tsx
// ✅ แก้ไขล่าสุด: 9 พฤษภาคม 2569
// ✅ การแก้ไข:
//    1. ✅ เพิ่มปุ่ม "ไปหน้าจัดการเป้าหมาย" ที่ลิงก์ไปยัง /admin/goals พร้อมส่งพารามิเตอร์กลับ
//    2. ✅ ปรับปรุงฟังก์ชัน handleBack ให้รองรับการกลับจากหน้าจัดการเป้าหมาย
//    3. ✅ เพิ่มสถานะการขยาย/ยุบรอบเป้าหมาย (expandable rounds)
//    4. ✅ แสดงป้าย "ปัจจุบัน" สำหรับรอบที่กำลังใช้งาน
//    5. ✅ ปรับปรุงการจัดกลุ่มและแสดงประวัติเป้าหมายอย่างชัดเจน
'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  checkSession,
  logout,
  getPatientDetail,
  getPatientGoals,
  getGoalRoundCount,
  getLatestGoalRound
} from '@/lib/supabase/queries';
import { supabase } from '@/lib/supabase/client';
import { 
  ArrowLeft, LogOut, Target, Trophy, History, 
  Calendar, CheckCircle2, Circle, Settings, Edit, ChevronDown, ChevronUp
} from 'lucide-react';

interface Goal {
  id: string;
  user_id: string;
  goal_type: string;
  goal_name: string;
  goal_name_th: string;
  target_days: number;
  target_value: number | null;
  target_unit: string | null;
  activity_id: string | null;
  status: string;
  created_at: string;
  round_number?: number;
  is_current: boolean;
  activities?: {
    activity_name_th: string;
    description_th: string;
  };
}

interface GoalRound {
  round_number: number;
  start_date: string;
  goals: Goal[];
  is_current: boolean;
}

export default function PatientGoalsHistoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientId = searchParams.get('patient_id') || '';
  
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<any>(null);
  const [goalRounds, setGoalRounds] = useState<GoalRound[]>([]);
  const [currentRound, setCurrentRound] = useState(1);
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
    loadPatientData();
  }, [router, patientId]);

  const loadPatientData = async () => {
    try {
      if (!patientId) return;
      
      // ✅ โหลดข้อมูลผู้ป่วย
      const patientData = await getPatientDetail(patientId);
      if (patientData) {
        setPatient(patientData);
        
        // ✅ โหลดประวัติเป้าหมายทั้งหมด
        await loadGoalHistory(patientId);
      }
    } catch (error) {
      console.error('Error loading patient data:', error);
      alert('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  const loadGoalHistory = async (userId: string) => {
    try {
      console.log('📜 Loading goal history for patient:', userId);
      
      // ✅ ดึงข้อมูล goals ทั้งหมดของผู้ป่วย
      const { data: allGoals, error } = await supabase
        .from('goals')
        .select(`
          *,
          activities (
            activity_name_th,
            description_th
          )
        `)
        .eq('user_id', userId)
        .eq('goal_type', 'weekly_activity')
        .order('round_number', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching goals:', error);
        return;
      }

      // ✅ จัดกลุ่มตาม round_number
      const roundsMap = new Map<number, Goal[]>();
      (allGoals || []).forEach((goal: Goal) => {
        const round = goal.round_number || 1;
        if (!roundsMap.has(round)) {
          roundsMap.set(round, []);
        }
        roundsMap.get(round)!.push(goal);
      });

      // ✅ แปลงเป็น array ของรอบ
      const rounds: GoalRound[] = Array.from(roundsMap.entries())
        .map(([roundNum, goals]) => ({
          round_number: roundNum,
          start_date: goals[0]?.created_at,
          goals: goals,
          is_current: goals[0]?.is_current || false,
        }))
        .sort((a, b) => b.round_number - a.round_number);

      setGoalRounds(rounds);
      
      // ✅ ตั้งค่ารอบปัจจุบัน
      const current = rounds.find(r => r.is_current);
      if (current) {
        setCurrentRound(current.round_number);
        setExpandedRounds([current.round_number]);
      } else if (rounds.length > 0) {
        setCurrentRound(rounds[0].round_number);
        setExpandedRounds([rounds[0].round_number]);
      }
      
      console.log('✅ Loaded', rounds.length, 'goal rounds');
    } catch (err) {
      console.error('Error loading goal history:', err);
    }
  };

  const toggleRound = (roundNumber: number) => {
    setExpandedRounds(prev => 
      prev.includes(roundNumber)
        ? prev.filter(n => n !== roundNumber)
        : [...prev, roundNumber]
    );
  };

  const handleBack = () => {
    // ✅ ตรวจสอบพารามิเตอร์การกลับหน้า
    const from = searchParams.get('from');
    const returnTo = searchParams.get('return_to');
    
    if (returnTo) {
      // ✅ กลับไปหน้าเดิมที่ระบุในพารามิเตอร์
      router.push(returnTo);
    } else if (from === 'patient-detail') {
      router.push(`/admin/patients/${patientId}`);
    } else if (from === 'goals-management') {
      // ✅ กลับไปหน้าจัดการเป้าหมาย
      router.push(`/admin/goals?patient_id=${patientId}`);
    } else {
      // ✅ fallback: กลับหน้าก่อนหน้าใน history
      router.back();
    }
  };

  const handleGoToGoalsManagement = () => {
    // ✅ ไปหน้าจัดการเป้าหมาย พร้อมส่งข้อมูลสำหรับการกลับ
    const returnUrl = `/admin/patients/${patientId}/goals?patient_id=${patientId}`;
    router.push(`/admin/goals?patient_id=${patientId}&from=patient-goals-history&return_to=${encodeURIComponent(returnUrl)}`);
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
    });
  };

  const getGoalStatusColor = (goal: Goal) => {
    if (goal.status === 'archived') return 'text-gray-500';
    if (goal.is_current) return 'text-green-600';
    return 'text-blue-600';
  };

  // ✅ Loading State
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">กำลังโหลดประวัติเป้าหมาย...</p>
        </div>
      </div>
    );
  }

  // ✅ No Patient Found
  if (!patient) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">ไม่พบข้อมูลผู้ป่วย</p>
          <button
            onClick={() => router.push('/admin/patients')}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            ← กลับหน้ารายการผู้ป่วย
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-100 to-cyan-50 pb-20">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-white/50 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* Navigation Buttons */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              กลับ
            </button>
            
            {/* ✅ ปุ่มไปหน้าจัดการเป้าหมาย (ใหม่) */}
            <button
              onClick={handleGoToGoalsManagement}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors shadow-sm"
            >
              <Settings className="w-4 h-4" />
              ไปหน้าจัดการเป้าหมาย
            </button>
          </div>

          {/* Page Title & User Info */}
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-800 mb-1">
                📜 ประวัติเป้าหมาย
              </h1>
              <p className="text-gray-600">
                {patient?.first_name} {patient?.last_name} | 
                HN: {patient?.hospital_number}
              </p>
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              ออกจากระบบ
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Patient Info Card */}
        <div className="bg-white rounded-xl shadow-sm p-6 border mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Target className="w-8 h-8 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-800">
                  {patient?.first_name} {patient?.last_name}
                </h2>
                <p className="text-sm text-gray-500">
                  HN: {patient?.hospital_number} | 
                  PAM Level: {patient?.pam_level || 'N/A'}
                </p>
              </div>
            </div>
            
            <div className="text-right">
              <p className="text-sm text-gray-500">รอบปัจจุบัน</p>
              <p className="text-2xl font-bold text-blue-600">#{currentRound}</p>
            </div>
          </div>
        </div>

        {/* Goal Rounds List */}
        <div className="space-y-4">
          {goalRounds.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-8 border text-center">
              <History className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p className="text-gray-500 mb-4">ยังไม่มีประวัติเป้าหมาย</p>
              <button
                onClick={handleGoToGoalsManagement}
                className="px-6 py-3 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors font-medium"
              >
                + สร้างเป้าหมายแรก
              </button>
            </div>
          ) : (
            goalRounds.map((round) => (
              <div 
                key={round.round_number}
                className={`bg-white rounded-xl shadow-sm border transition-all ${
                  round.is_current 
                    ? 'border-green-300 ring-2 ring-green-100' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {/* Round Header - Clickable to expand/collapse */}
                <button
                  onClick={() => toggleRound(round.round_number)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 rounded-t-xl transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                      round.is_current ? 'bg-green-100' : 'bg-gray-100'
                    }`}>
                      {round.is_current ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                      ) : (
                        <History className="w-5 h-5 text-gray-500" />
                      )}
                    </div>
                    <div className="text-left">
                      <p className="font-semibold text-gray-800 flex items-center gap-2">
                        รอบที่ {round.round_number}
                        {round.is_current && (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">
                            ปัจจุบัน
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-gray-500">
                        <Calendar className="w-3 h-3 inline mr-1" />
                        เริ่ม: {formatDate(round.start_date)}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-500 hidden sm:inline">
                      {round.goals.length} กิจกรรม
                    </span>
                    <span className="text-gray-400">
                      {expandedRounds.includes(round.round_number) 
                        ? <ChevronUp className="w-5 h-5" />
                        : <ChevronDown className="w-5 h-5" />
                      }
                    </span>
                  </div>
                </button>

                {/* Round Details - Expandable Content */}
                {expandedRounds.includes(round.round_number) && (
                  <div className="px-6 pb-4 border-t border-gray-100">
                    <div className="space-y-3 py-4">
                      {round.goals.map((goal) => (
                        <div 
                          key={goal.id}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {goal.is_current ? (
                              <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                            ) : (
                              <Circle className="w-5 h-5 text-gray-400 flex-shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className="font-medium text-gray-800 truncate">
                                {goal.activities?.activity_name_th || goal.goal_name_th}
                              </p>
                              <p className="text-sm text-gray-500">
                                เป้าหมาย: {goal.target_days} วัน/สัปดาห์
                                {goal.target_value && ` | ค่า: ${goal.target_value}${goal.target_unit || ''}`}
                              </p>
                            </div>
                          </div>
                          <span className={`text-sm font-medium flex-shrink-0 ${getGoalStatusColor(goal)}`}>
                            {goal.is_current ? 'ใช้งาน' : 'เก็บถาวร'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Action Buttons */}
        {goalRounds.length > 0 && (
          <div className="mt-8 flex gap-4 flex-col sm:flex-row">
            <button
              onClick={handleBack}
              className="flex-1 px-6 py-3 bg-gray-500 text-white font-semibold rounded-xl hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              กลับ
            </button>
            <button
              onClick={handleGoToGoalsManagement}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all flex items-center justify-center gap-2 shadow-md"
            >
              <Edit className="w-5 h-5" />
              จัดการเป้าหมาย
            </button>
          </div>
        )}
      </div>
    </div>
  );
}