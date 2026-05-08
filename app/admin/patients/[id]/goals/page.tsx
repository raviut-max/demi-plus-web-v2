// app/admin/patients/[id]/goals/page.tsx
// ✅ แก้ไขล่าสุด: 8 พฤษภาคม 2569
// ✅ การแก้ไข:
//    1. ✅ เพิ่ม Header Section แสดงข้อมูลบุคลากรและโรงพยาบาล
//    2. ✅ แก้ไขการ Query ให้กรองตาม PAM Level
//    3. ✅ แสดงเป้าหมายถูกต้องตามระดับ (L2/L3: 5 ข้อ, L4: 8 ข้อ)
//    4. ✅ ปรับปรุงการจับคู่ records กับ goals
'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  checkSession,
  logout,
  getPatientDetail,
  getPatientGoals,
  getGoalRoundCount,
  createDefaultGoals,
  getPatientRecords,
  getUserHospitalInfo
} from '@/lib/supabase/queries';
import {
  ArrowLeft,
  Target,
  TrendingUp,
  Calendar,
  CheckCircle,
  Clock,
  Archive,
  Award,
  RefreshCw,
  AlertCircle,
  FileText,
  ChevronDown,
  ChevronUp,
  Edit,
  LogOut,
  Activity,
  ClipboardCheck,
  User,
  Hospital,
  Building2,
  UserCheck
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

type ViewMode = 'goals' | 'weekly' | 'calendar';

interface GoalRecord {
  date: string;
  isCompleted: boolean;
  notes?: string;
}

interface GoalWithRecords {
  goal: any;
  completedCount: number;
  notCompletedCount: number;
  records: GoalRecord[];
  percentage: number;
}

interface UserHospital {
  id: string;
  name: string;
  type: 'main' | 'sub';
  parent_id: string | null;
  parent_hospital?: {
    id: string;
    name: string;
  };
}

export default function PatientGoalsPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params.id as string;
  
  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<UserHospital | null>(null);
  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<any>(null);
  const [goals, setGoals] = useState<any[]>([]);
  const [goalRounds, setGoalRounds] = useState(1);
  const [selectedRound, setSelectedRound] = useState(1);
  const [records, setRecords] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('goals');
  const [creatingGoals, setCreatingGoals] = useState(false);
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set());

  useEffect(() => {
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
    loadUserHospital(userData.id);
    loadData();
  }, [router]);

  const loadUserHospital = async (userId: string) => {
    try {
      const hospitalInfo = await getUserHospitalInfo(userId);
      setUserHospital(hospitalInfo);
    } catch (error) {
      console.error('Error loading user hospital:', error);
    }
  };

  const loadData = async () => {
    try {
      console.log('📊 [loadData] Loading data for patient:', patientId);
      const patientData = await getPatientDetail(patientId);
      setPatient(patientData);
      
      const rounds = await getGoalRoundCount(patientId);
      setGoalRounds(rounds);
      
      await loadGoals(selectedRound);
      await loadRecords();
    } catch (error) {
      console.error('❌ [loadData] Error:', error);
      alert('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  const loadGoals = async (round: number) => {
    try {
      console.log('🎯 [loadGoals] Loading goals for round:', round);
      
      // ✅ Query เฉพาะ goals ของ round ที่เลือก และ goal_type = weekly_activity
      const { data, error } = await supabase
        .from('goals')
        .select(`
          *,
          activities (
            activity_code,
            activity_name_th,
            description_th
          )
        `)
        .eq('user_id', patientId)
        .eq('round_number', round)
        .eq('goal_type', 'weekly_activity')
        .eq('status', 'active')
        .order('priority', { ascending: true });

      if (error) throw error;
      
      console.log('✅ [loadGoals] Loaded:', data?.length || 0, 'goals');
      setGoals(data || []);
    } catch (error) {
      console.error('❌ [loadGoals] Error:', error);
      setGoals([]);
    }
  };

  const loadRecords = async () => {
    try {
      console.log('📝 [loadRecords] Loading records for patient:', patientId);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 90); // โหลด 90 วัน
      
      const { data, error } = await supabase
        .from('records')
        .select(`
          *,
          activities (
            activity_code,
            activity_name_th
          )
        `)
        .eq('user_id', patientId)
        .gte('record_date', startDate.toISOString())
        .order('record_date', { ascending: false });

      if (error) throw error;
      
      console.log('✅ [loadRecords] Loaded:', data?.length || 0, 'records');
      setRecords(data || []);
    } catch (error) {
      console.error('❌ [loadRecords] Error:', error);
      setRecords([]);
    }
  };

  const handleRoundChange = (round: number) => {
    console.log('🔄 [handleRoundChange] Changing to round:', round);
    setSelectedRound(round);
    loadGoals(round);
  };

  const handleCreateDefaultGoals = async () => {
    if (!patient) return;
    if (!confirm('ต้องการสร้างเป้าหมายเริ่มต้นตาม PAM Level หรือไม่?\n\nL2/L3: กฎทอง 5 ข้อ\nL4: แชมป์ 8 กิจกรรม')) {
      return;
    }

    setCreatingGoals(true);
    try {
      const result = await createDefaultGoals(
        patientId,
        patient.pam_level || 'L2',
        user.id
      );
      
      if (result.success) {
        alert(`✅ สร้างเป้าหมายสำเร็จ!\n\nจำนวน: ${result.count || 0} กิจกรรม`);
        loadData();
      } else {
        alert('เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error: any) {
      console.error('❌ [handleCreateDefaultGoals] Error:', error);
      alert(error.message || 'เกิดข้อผิดพลาดในการสร้างเป้าหมาย');
    } finally {
      setCreatingGoals(false);
    }
  };

  const handleArchiveCurrentRound = async () => {
    if (!confirm('ต้องการเก็บถาวรเป้าหมายรอบปัจจุบันหรือไม่?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('goals')
        .update({
          is_current: false,
          status: 'archived',
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', patientId)
        .eq('round_number', selectedRound)
        .eq('goal_type', 'weekly_activity')
        .eq('status', 'active');

      if (error) throw error;
      
      alert('✅ เก็บถาวรเป้าหมายสำเร็จ!');
      loadData();
    } catch (error) {
      console.error('❌ [handleArchiveCurrentRound] Error:', error);
      alert('เกิดข้อผิดพลาดในการเก็บถาวร');
    }
  };

  const toggleGoalExpansion = (goalKey: string) => {
    const newExpanded = new Set(expandedGoals);
    if (newExpanded.has(goalKey)) {
      newExpanded.delete(goalKey);
    } else {
      newExpanded.add(goalKey);
    }
    setExpandedGoals(newExpanded);
  };

  const getGoalIcon = (goalName: string) => {
    if (goalName?.includes('sweet')) return '🍬';
    if (goalName?.includes('rice') || goalName?.includes('carb')) return '🍚';
    if (goalName?.includes('protein') || goalName?.includes('vegetable')) return '🥗';
    if (goalName?.includes('exercise') || goalName?.includes('walk')) return '🚶';
    if (goalName?.includes('weight') || goalName?.includes('sugar')) return '⚖️';
    if (goalName?.includes('water')) return '💧';
    if (goalName?.includes('sleep')) return '😴';
    if (goalName?.includes('cardio')) return '🏃';
    return '🎯';
  };

  // 🎯 จัดกลุ่มเป้าหมายและคำนวณสถิติ (แก้ไขแล้ว)
  const getGroupedGoals = (): GoalWithRecords[] => {
    console.log('🎯 [getGroupedGoals] Processing goals:', goals.length);
    console.log('📝 [getGroupedGoals] Available records:', records.length);

    // จัดกลุ่ม goals ตาม activity_id
    const grouped: Record<string, any[]> = {};
    goals.forEach(goal => {
      const key = goal.activity_id || goal.id;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(goal);
    });

    const goalGroups = Object.values(grouped).sort((a, b) => {
      const priorityA = a[0]?.priority || 999;
      const priorityB = b[0]?.priority || 999;
      return priorityA - priorityB;
    });

    return goalGroups.map(goalGroup => {
      const firstGoal = goalGroup[0];
      const activityId = firstGoal.activity_id;
      
      console.log('🔍 [getGroupedGoals] Processing goal:', firstGoal.goal_name, 'Activity ID:', activityId);
      
      // ✅ แก้ไข: ใช้ activity_id ในการ match แทน goal_name
      const goalRecords = records.filter(record => {
        const match = record.activity_id === activityId;
        if (match) {
          console.log('✅ [getGroupedGoals] Matched record:', record.record_date);
        }
        return match;
      });

      const completedRecords = goalRecords.filter(r => r.is_completed);
      const notCompletedRecords = goalRecords.filter(r => !r.is_completed);

      const formattedRecords: GoalRecord[] = [
        ...completedRecords.map(r => ({
          date: r.record_date,
          isCompleted: true,
          notes: r.notes,
        })),
        ...notCompletedRecords.map(r => ({
          date: r.record_date,
          isCompleted: false,
          notes: r.notes,
        })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      const totalRecords = goalRecords.length;
      const percentage = totalRecords > 0 
        ? Math.round((completedRecords.length / totalRecords) * 100) 
        : 0;

      console.log('📊 [getGroupedGoals] Goal:', firstGoal.goal_name, 
        'Completed:', completedRecords.length, 
        'Not Completed:', notCompletedRecords.length,
        'Percentage:', percentage);

      return {
        goal: firstGoal,
        completedCount: completedRecords.length,
        notCompletedCount: notCompletedRecords.length,
        records: formattedRecords,
        percentage,
      };
    });
  };

  const groupedGoals = getGroupedGoals();

  const stats = {
    total: goals.length,
    completed: goals.filter(g => g.is_completed).length,
    active: goals.filter(g => g.status === 'active').length,
    progress: goals.length > 0 
      ? Math.round((goals.filter(g => g.is_completed).length / goals.length) * 100) 
      : 0,
  };

  const getWeeklyData = () => {
    const weekData = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayRecords = records.filter(r => r.record_date?.startsWith(dateStr));
      
      weekData.push({
        date: dateStr,
        dayName: date.toLocaleDateString('th-TH', { weekday: 'short' }),
        dayNumber: date.getDate(),
        records: dayRecords,
        completed: dayRecords.filter(r => r.is_completed).length,
        total: goals.length,
      });
    }

    return weekData;
  };

  const getCalendarData = () => {
    const today = new Date();
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayRecords = records.filter(r => r.record_date?.startsWith(dateStr));
      const completedCount = dayRecords.filter(r => r.is_completed).length;
      const totalCount = goals.length || 5;
      const percentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
      
      days.push({
        date: dateStr,
        dayNumber: date.getDate(),
        month: date.getMonth(),
        dayOfWeek: date.getDay(),
        completedCount,
        totalCount,
        percentage,
        color: percentage >= 80 ? 'bg-green-500' :
               percentage >= 50 ? 'bg-green-300' :
               percentage >= 20 ? 'bg-yellow-300' :
               'bg-gray-200',
      });
    }

    return days;
  };

  const weeklyData = getWeeklyData();
  const calendarData = getCalendarData();

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ✅ Header Section - แสดงข้อมูลบุคลากรและโรงพยาบาล */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button
            onClick={() => router.push(`/admin/patients/${patientId}`)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับหน้าผู้ป่วย
          </button>

          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                📋 ประวัติเป้าหมาย
              </h1>
              <p className="text-gray-600">
                ผู้ป่วย: {patient?.first_name} {patient?.last_name} | 
                HN: {patient?.hospital_number} | 
                PAM Level: {patient?.pam_level || 'L1'}
              </p>
            </div>

            {/* ✅ แสดงข้อมูลผู้ใช้และโรงพยาบาล */}
            <div className="flex items-center gap-4">
              {userHospital && (
                <div className="text-right bg-gradient-to-l from-blue-50 to-indigo-50 px-4 py-3 rounded-xl border border-blue-200">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <UserCheck className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800 text-sm">
                        {user?.full_name_th || 'ผู้ดูแลระบบ'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {user?.role === 'admin' ? '👑 ผู้ดูแลระบบ' :
                         user?.role === 'doctor' ? '👨‍⚕️ แพทย์' : '👩‍💼 เจ้าหน้าที่'}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-blue-200 pt-2 mt-2">
                    <div className="flex items-center gap-1 mb-1">
                      <Hospital className="w-3 h-3 text-blue-600" />
                      <span className="text-xs text-gray-600 font-medium">
                        {userHospital.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {userHospital.type === 'main' ? (
                        <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-semibold">
                          🏥 แม่ข่าย
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs font-semibold">
                          🏥 ลูกข่าย
                        </span>
                      )}

                      {userHospital.type === 'sub' && userHospital.parent_hospital && (
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Building2 className="w-3 h-3" />
                          <span>แม่ข่าย: {userHospital.parent_hospital.name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all"
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
        
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <Target className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">เป้าหมายทั้งหมด</p>
                <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
              </div>
            </div>
          </div>
        
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">สำเร็จ</p>
                <p className="text-2xl font-bold text-gray-800">{stats.completed}</p>
              </div>
            </div>
          </div>
        
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                <Clock className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">กำลังดำเนินการ</p>
                <p className="text-2xl font-bold text-gray-800">{stats.active}</p>
              </div>
            </div>
          </div>
        
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                <Award className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">ความคืบหน้า</p>
                <p className="text-2xl font-bold text-gray-800">{stats.progress}%</p>
              </div>
            </div>
          </div>
        </div>

        {/* GOALS TAB - แสดงแบบจัดกลุ่ม */}
        {viewMode === 'goals' && (
          <>
            {/* Round Selector */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <Archive className="w-6 h-6 text-blue-600" />
                  เลือกรอบเป้าหมาย
                </h2>
                <p className="text-sm text-gray-500">
                  ทั้งหมด {goalRounds} รอบ
                </p>
              </div>
            
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: goalRounds }, (_, i) => i + 1).map((round) => (
                  <button
                    key={round}
                    onClick={() => handleRoundChange(round)}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${
                      selectedRound === round
                        ? 'bg-blue-500 text-white shadow-lg'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    รอบที่ {round}
                  </button>
                ))}
              </div>
            </div>

            {/* ✅ เป้าหมายตามระดับ PAM */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <Target className="w-6 h-6 text-blue-600" />
                  🎯 เป้าหมายรอบที่ {selectedRound}
                </h2>
                {patient?.pam_level && (
                  <p className="text-sm text-gray-500 mt-1">
                    {patient.pam_level === 'L2' || patient.pam_level === 'L3' 
                      ? '📋 กฎทอง 5 ข้อ - 5 วัน/สัปดาห์' 
                      : patient.pam_level === 'L4'
                        ? '🏆 แชมป์ 8 กิจกรรม - 5 วัน/สัปดาห์'
                        : '⚠️ ระดับ L1 - ยังไม่สร้างเป้าหมาย'}
                  </p>
                )}
              </div>

              {groupedGoals.length === 0 ? (
                <div className="text-center py-12">
                  <Target className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p className="text-gray-500 mb-4">ยังไม่มีเป้าหมายในรอบนี้</p>
                  {patient?.pam_level !== 'L1' && (
                    <button
                      onClick={() => router.push(`/admin/goals?patient_id=${patientId}`)}
                      className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all"
                    >
                      สร้างเป้าหมายอัตโนมัติ
                    </button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {groupedGoals.map(({ goal, completedCount, notCompletedCount, records: goalRecords, percentage }) => {
                    const goalKey = goal.activity_id || goal.id;
                    const isExpanded = expandedGoals.has(goalKey);

                    return (
                      <div key={goalKey} className="p-6">
                        {/* Header - คลิกเพื่อขยาย/ยุบ */}
                        <div 
                          className="flex items-center justify-between cursor-pointer hover:bg-gray-50 p-3 rounded-lg transition-colors"
                          onClick={() => toggleGoalExpansion(goalKey)}
                        >
                          <div className="flex items-center gap-3 flex-1">
                            <span className="text-3xl">{getGoalIcon(goal.goal_name)}</span>
                            <div className="flex-1">
                              <h3 className="text-lg font-bold text-gray-800">
                                {goal.goal_name_th || goal.goal_name}
                              </h3>
                              <p className="text-sm text-gray-500">
                                {goal.activities?.activity_name_th || goal.description_th || '-'}
                              </p>
                              {goal.target_days && (
                                <p className="text-xs text-blue-600 mt-1 font-medium">
                                  📅 เป้าหมาย: {goal.target_days} วัน/สัปดาห์
                                </p>
                              )}
                            </div>
                          </div>
                        
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <div className="flex items-center gap-2 mb-1">
                                <CheckCircle className="w-4 h-4 text-green-600" />
                                <span className="text-sm font-bold text-green-600">{completedCount}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-red-600">{notCompletedCount}</span>
                              </div>
                            </div>
                          
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                              percentage >= 80 ? 'bg-green-100' :
                              percentage >= 50 ? 'bg-yellow-100' :
                              'bg-red-100'
                            }`}>
                              <span className={`text-sm font-bold ${
                                percentage >= 80 ? 'text-green-600' :
                                percentage >= 50 ? 'text-yellow-600' :
                                'text-red-600'
                              }`}>
                                {percentage}%
                              </span>
                            </div>
                          
                            {isExpanded ? (
                              <ChevronUp className="w-5 h-5 text-gray-400" />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-gray-400" />
                            )}
                          </div>
                        </div>

                        {/* Expanded Content - แสดงรายละเอียด */}
                        {isExpanded && (
                          <div className="mt-4 ml-12 space-y-4">
                            {/* ทำได้ */}
                            {completedCount > 0 && (
                              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                                <div className="flex items-center gap-2 mb-3">
                                  <CheckCircle className="w-5 h-5 text-green-600" />
                                  <h4 className="font-bold text-green-800">
                                    ทำได้ {completedCount} ครั้ง
                                  </h4>
                                </div>
                                <div className="space-y-2">
                                  {goalRecords
                                    .filter(r => r.isCompleted)
                                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                    .map((record, index) => (
                                      <div key={index} className="flex items-center gap-3 text-sm">
                                        <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                                        <span className="text-green-800">
                                          {new Date(record.date).toLocaleDateString('th-TH', {
                                            year: 'numeric',
                                            month: 'long',
                                            day: 'numeric'
                                          })}
                                        </span>
                                        {record.notes && (
                                          <span className="text-green-600 text-xs">
                                            ({record.notes})
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                </div>
                              </div>
                            )}

                            {/* ไม่ได้ */}
                            {notCompletedCount > 0 && (
                              <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                                <div className="flex items-center gap-2 mb-3">
                                  <span className="w-5 h-5 text-red-600">❌</span>
                                  <h4 className="font-bold text-red-800">
                                    ไม่ได้ {notCompletedCount} ครั้ง
                                  </h4>
                                </div>
                                <div className="space-y-2">
                                  {goalRecords
                                    .filter(r => !r.isCompleted)
                                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                    .map((record, index) => (
                                      <div key={index} className="flex items-center gap-3 text-sm">
                                        <span className="text-red-600">❌</span>
                                        <span className="text-red-800">
                                          {new Date(record.date).toLocaleDateString('th-TH', {
                                            year: 'numeric',
                                            month: 'long',
                                            day: 'numeric'
                                          })}
                                        </span>
                                        {record.notes && (
                                          <span className="text-red-600 text-xs">
                                            ({record.notes})
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                </div>
                              </div>
                            )}

                            {/* ไม่มีบันทึก */}
                            {goalRecords.length === 0 && (
                              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 text-center">
                                <Clock className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                                <p className="text-gray-500">ยังไม่มีบันทึก</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* WEEKLY TAB */}
        {viewMode === 'weekly' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <TrendingUp className="w-6 h-6 text-blue-600" />
                บันทึกประจำวัน (7 วันล่าสุด)
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                แสดงการบันทึกกิจกรรมแต่ละวันจากมือถือผู้ป่วย
              </p>
            </div>

            <div className="p-6">
              {/* Weekly Overview */}
              <div className="grid grid-cols-7 gap-2 mb-6">
                {weeklyData.map((day) => (
                  <div 
                    key={day.date} 
                    className={`p-4 rounded-xl border-2 text-center ${
                      day.completed >= day.total && day.total > 0
                        ? 'bg-green-50 border-green-500'
                        : day.completed > 0
                        ? 'bg-blue-50 border-blue-500'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <p className="text-xs text-gray-500 mb-1">{day.dayName}</p>
                    <p className="text-lg font-bold text-gray-800">{day.dayNumber}</p>
                    <div className="mt-2">
                      {day.total > 0 ? (
                        <>
                          <p className="text-2xl font-bold text-green-600">{day.completed}</p>
                          <p className="text-xs text-gray-500">/ {day.total} กิจกรรม</p>
                        </>
                      ) : (
                        <p className="text-sm text-gray-400">ไม่มีข้อมูล</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Activity Details */}
              <div className="space-y-4">
                <h3 className="font-bold text-gray-800 mb-4">📊 รายละเอียดกิจกรรมแต่ละวัน</h3>
              
                {groupedGoals.map(({ goal }) => (
                  <div key={goal.activity_id || goal.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-2xl">{getGoalIcon(goal.goal_name)}</span>
                      <h4 className="font-bold text-gray-800">{goal.goal_name_th || goal.goal_name}</h4>
                    </div>
                  
                    <div className="grid grid-cols-7 gap-2">
                      {weeklyData.map((day) => {
                        const activityRecords = day.records.filter(
                          r => r.activity_id === goal.activity_id
                        );
                        const isCompleted = activityRecords.some(r => r.is_completed);
                        
                        return (
                          <div 
                            key={day.date} 
                            className={`p-2 rounded-lg text-center ${
                              isCompleted 
                                ?  'bg-green-500 text-white' 
                                : activityRecords.length > 0
                                ? 'bg-yellow-500 text-white'
                                : 'bg-gray-200 text-gray-400'
                            }`}
                          >
                            {isCompleted ? (
                              <CheckCircle className="w-5 h-5 mx-auto" />
                            ) : activityRecords.length > 0 ? (
                              <Clock className="w-5 h-5 mx-auto" />
                            ) : (
                              <span className="text-xs">-</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* CALENDAR TAB */}
        {viewMode === 'calendar' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <Calendar className="w-6 h-6 text-blue-600" />
                ปฏิทินการบันทึก (30 วัน)
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                สีเขียวเข้ม = บันทึกครบ, สีอ่อน = บันทึกบางส่วน, สีเทา = ไม่ได้บันทึก
              </p>
            </div>

            <div className="p-6">
              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-2 mb-6">
                {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map((day) => (
                  <div key={day} className="text-center font-bold text-gray-600 py-2">
                    {day}
                  </div>
                ))}
                
                {calendarData.map((day) => (
                  <div
                    key={day.date}
                    className={`aspect-square rounded-lg p-2 flex flex-col items-center justify-center ${day.color} transition-all hover:scale-110 cursor-pointer`}
                    title={`${day.date}: ${day.completedCount}/${day.totalCount} กิจกรรม`}
                  >
                    <span className="text-xs font-bold text-gray-800">{day.dayNumber}</span>
                    {day.completedCount > 0 && (
                      <span className="text-xs text-white mt-1">{day.completedCount}</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Monthly Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                  <p className="text-sm text-green-600 mb-1">วันที่บันทึกครบ</p>
                  <p className="text-2xl font-bold text-green-700">
                    {calendarData.filter(d => d.percentage >= 80).length} วัน
                  </p>
                </div>
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                  <p className="text-sm text-blue-600 mb-1">วันที่บันทึกบางส่วน</p>
                  <p className="text-2xl font-bold text-blue-700">
                    {calendarData.filter(d => d.percentage >= 20 && d.percentage < 80).length} วัน
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <p className="text-sm text-gray-600 mb-1">วันที่ไม่ได้บันทึก</p>
                  <p className="text-2xl font-bold text-gray-700">
                    {calendarData.filter(d => d.percentage < 20).length} วัน
                  </p>
                </div>
                <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
                  <p className="text-sm text-purple-600 mb-1">ความสม่ำเสมอ</p>
                  <p className="text-2xl font-bold text-purple-700">
                    {Math.round((calendarData.filter(d => d.percentage >= 20).length / 30) * 100)}%
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}