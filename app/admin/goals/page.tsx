// app/admin/goals/page.tsx
// ✅ แก้ไขล่าสุด: 9 พฤษภาคม 2569
// ✅ การแก้ไข:
//    1. ✅ ปรับปรุงการตรวจสอบและแจ้งเตือนกรณีผู้ป่วย L0
//    2. ✅ แสดงข้อความอธิบายชัดเจนว่า L0 คืออะไร
//    3. ✅ ปุ่มสร้างเป้าหมายเด่นชัดสำหรับผู้ป่วย L0
//    4. ✅ ป้องกันการตั้งเป้าหมายถ้าผู้ป่วยยังไม่ได้คัดกรอง
'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  checkSession, 
  logout, 
  getPatientList, 
  getGoalRoundCount, 
  getLatestGoalRound, 
  saveGoalsNewRound, 
  getAccessibleHospitalIds, 
  getUserHospitalInfo,
  createDefaultGoals
} from '@/lib/supabase/queries';
import { supabase } from '@/lib/supabase/client';
import { 
  ArrowLeft, 
  LogOut, 
  Save, 
  Target, 
  Trophy, 
  Plus, 
  CheckCircle2, 
  Circle, 
  Search, 
  User, 
  History, 
  Calendar, 
  Hospital, 
  Building2, 
  UserCheck,
  AlertTriangle,
  Award,
  Clock,
  Archive,
  RefreshCw,
  Activity,
  ClipboardCheck,
  TrendingUp,
  FileText,
  ChevronDown,
  ChevronUp,
  Edit
} from 'lucide-react';

// ✅ Default days ตาม PAM Level
const DEFAULT_DAYS_BY_LEVEL: Record<string, number> = {
  L2: 3,
  L3: 4,
  L4: 5,
};

// ✅ Long-term Goals 4 ข้อ (Core Performance Goals)
const LONG_TERM_GOALS = [
  { 
    code: 'weight', 
    name_th: 'น้ำหนักลด (Weight Reduction)', 
    description: 'ลดลงอย่างน้อย 5-10% และลด Visceral Fat' 
  },
  { 
    code: 'glucose', 
    name_th: 'น้ำตาลลง (Glucose Control)', 
    description: 'ควบคุมระดับน้ำตาลในเลือดให้เข้าสู่เกณฑ์ปกติ' 
  },
  { 
    code: 'medication', 
    name_th: 'ลดยาได้ (Medication De-escalation)', 
    description: 'ปรับลดหรือหยุดยาภายใต้การกำกับของแพทย์' 
  },
  { 
    code: 'remission', 
    name_th: 'ภาวะเบาหวานสงบ (Remission)', 
    description: 'บรรลุ HbA1c < 6.5% โดยไม่ต้องใช้ยาต่อเนื่อง' 
  },
];

interface Activity {
  id: string;
  activity_code: string;
  activity_name: string;
  activity_name_th: string;
  description_th: string | null;
  activity_type: string;
  pam_level: string;
  target_value: string | null;
  unit: string | null;
  sort_order: number;
}

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
  last_recorded_date?: string;
  primary_goal_note?: string;
  weekly_goal_note?: string;
  is_completed?: boolean;
}

interface GoalHistory {
  id: string;
  goals: Goal[];
  start_date: string;
  is_current: boolean;
  round_number?: number;
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

interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  hospital_number: string;
  pam_level: string;
  pam_score?: number;
  phone?: string;
  hospitals?: {
    id: string;
    name: string;
    type: 'main' | 'sub';
  };
}

export default function AdminGoalsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientIdFromUrl = searchParams.get('patient_id');
  
  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<UserHospital | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState('');
  const [patientData, setPatientData] = useState<Patient | null>(null);
  const [patientPamLevel, setPatientPamLevel] = useState('');
  const [activities, setActivities] = useState<Activity[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [editedGoals, setEditedGoals] = useState<Record<string, { target_days: number; target_value?: string }>>({});
  const [goalHistory, setGoalHistory] = useState<GoalHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [primaryGoal, setPrimaryGoal] = useState('');
  const [savingPrimaryGoal, setSavingPrimaryGoal] = useState(false);
  const [primaryGoalNote, setPrimaryGoalNote] = useState('');
  const [weeklyNote, setWeeklyNote] = useState('');
  
  // ✅ State สำหรับ Round Number
  const [currentRound, setCurrentRound] = useState(1);
  const [lastRecordedDate, setLastRecordedDate] = useState('');
  const [isSameDay, setIsSameDay] = useState(false);
  
  // ✅ State สำหรับค้นหาผู้ป่วย
  const [searchHN, setSearchHN] = useState('');
  const [searchName, setSearchName] = useState('');
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [searchType, setSearchType] = useState<'hn' | 'name' | null>(null);
  const [accessibleHospitalIds, setAccessibleHospitalIds] = useState<string[]>([]);

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
    loadUserHospital(userData.id);
    loadAccessibleHospitals(userData.id);
    
    // ✅ ถ้ามี patient_id ใน URL ให้เลือกผู้ป่วยนั้นทันที
    if (patientIdFromUrl) {
      setSelectedPatient(patientIdFromUrl);
    }
  }, [router, patientIdFromUrl]);

  // ✅ โหลดข้อมูลผู้ป่วยเมื่อมีการเลือกผู้ป่วย
  useEffect(() => {
    if (selectedPatient && patients.length > 0) {
      loadPatientData(selectedPatient);
    }
  }, [selectedPatient, patients]);

  // =====================================================
  // 📥 DATA LOADING FUNCTIONS
  // =====================================================

  // ✅ โหลดข้อมูลโรงพยาบาลของผู้ใช้
  const loadUserHospital = async (userId: string) => {
    try {
      const hospitalInfo = await getUserHospitalInfo(userId);
      setUserHospital(hospitalInfo);
    } catch (error) {
      console.error('Error loading user hospital:', error);
    }
  };

  // ✅ โหลดโรงพยาบาลที่เข้าถึงได้
  const loadAccessibleHospitals = async (userId: string) => {
    try {
      const ids = await getAccessibleHospitalIds(userId);
      setAccessibleHospitalIds(ids);
      
      // ✅ โหลดผู้ป่วยหลังจากได้สิทธิ์แล้ว
      loadPatients(ids);
    } catch (error) {
      console.error('Error loading accessible hospitals:', error);
    }
  };

  // ✅ โหลดผู้ป่วย (กรองตามโรงพยาบาล)
  const loadPatients = async (hospitalIds?: string[]) => {
    try {
      let query = supabase
        .from('profiles')
        .select(`*, hospitals ( id, name, type )`)
        .eq('is_active', true)
        .order('first_name', { ascending: true });
      
      // ✅ กรองตามโรงพยาบาลที่เข้าถึงได้
      if (hospitalIds && hospitalIds.length > 0) {
        query = query.in('hospital_id', hospitalIds);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading patients:', error);
        return;
      }

      const patientsWithData = data?.map(patient => ({
        ...patient,
        full_name: patient.first_name && patient.last_name 
          ? `${patient.first_name} ${patient.last_name}`
          : '',
      })) || [];

      setPatients(patientsWithData);
    } catch (error) {
      console.error('Error loading patients:', error);
    } finally {
      setLoading(false);
    }
  };

  // ✅ โหลดข้อมูลผู้ป่วยที่เลือก
  const loadPatientData = async (patientId: string) => {
    try {
      const patient = patients.find(p => p.id === patientId);
      if (patient) {
        const pamLevel = patient.pam_level || 'L0';
        setPatientData(patient);
        setPatientPamLevel(pamLevel);
        
        // ✅ โหลด activities ตาม PAM Level
        await loadActivities(pamLevel);
        
        // ✅ โหลด goals ปัจจุบัน
        await loadGoals(1);
        
        // ✅ โหลดประวัติ goals
        await loadGoalHistory(patientId);
        
        // ✅ โหลด Round Number และวันที่บันทึก
        const roundCount = await getGoalRoundCount(patientId);
        setCurrentRound(roundCount);
        
        const latestRound = await getLatestGoalRound(patientId);
        if (latestRound) {
          setLastRecordedDate(latestRound.created_at);
          const today = new Date().toISOString().split('T')[0];
          const lastDate = new Date(latestRound.created_at).toISOString().split('T')[0];
          setIsSameDay(today === lastDate);
        }
      }
    } catch (error) {
      console.error('Error loading patient data:', error);
    }
  };

  // ✅ โหลด activities ตาม PAM Level
  const loadActivities = async (pamLevel: string) => {
    try {
      const { data: activitiesData, error: activitiesError } = await supabase
        .from('activities')
        .select('*')
        .or(`pam_level.eq.${pamLevel},pam_level.eq.ALL`)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (activitiesError) {
        console.error('Error loading activities:', activitiesError);
        return;
      }

      setActivities(activitiesData || []);
    } catch (error) {
      console.error('Error loading activities:', error);
    }
  };

  // ✅ โหลด goals
  const loadGoals = async (round: number) => {
    try {
      const { data, error } = await supabase
        .from('goals')
        .select(`*, activities ( activity_code, activity_name_th, description_th )`)
        .eq('user_id', selectedPatient)
        .eq('round_number', round)
        .eq('goal_type', 'weekly_activity')
        .eq('status', 'active')
        .order('priority', { ascending: true });
      
      if (error) throw error;
      setGoals(data || []);
    } catch (error) {
      console.error('Error loading goals:', error);
      setGoals([]);
    }
  };

  // ✅ โหลดประวัติ goals
  const loadGoalHistory = async (patientId: string) => {
    try {
      const { data: archivedGoals } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', patientId)
        .eq('goal_type', 'weekly_activity')
        .eq('status', 'archived')
        .order('round_number', { ascending: false })
        .order('created_at', { ascending: false });

      const roundsMap = new Map<number, Goal[]>();
      (archivedGoals || []).forEach((goal: Goal) => {
        const round = goal.round_number || 1;
        if (!roundsMap.has(round)) {
          roundsMap.set(round, []);
        }
        roundsMap.get(round)!.push(goal);
      });

      const history = Array.from(roundsMap.entries()).map(([round, goalsList]) => ({
        id: `round-${round}`,
        goals: goalsList,
        start_date: goalsList[0]?.created_at,
        is_current: false,
        round_number: round,
      }));

      // ✅ เพิ่ม current goals
      if (goals && goals.length > 0) {
        const currentRoundNum = goals[0].round_number || 1;
        history.unshift({
          id: 'current',
          goals: goals,
          start_date: goals[0].created_at,
          is_current: true,
          round_number: currentRoundNum,
        });
      }

      setGoalHistory(history);
    } catch (error) {
      console.error('Error loading goal history:', error);
    }
  };

  // ✅ ฟังก์ชันค้นหาผู้ป่วย
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

  const handleSelectPatient = (patient: Patient) => {
    setSelectedPatient(patient.id);
    setSearchHN('');
    setSearchName('');
    setShowSearchDropdown(false);
    setFilteredPatients([]);
  };

  // ✅ สร้างเป้าหมายเริ่มต้นตาม PAM Level
  const handleCreateDefaultGoals = async () => {
    if (!selectedPatient || !patientPamLevel) {
      alert('กรุณาเลือกผู้ป่วย');
      return;
    }

    // ✅ ตรวจสอบว่าเป็น L0 หรือไม่
    if (patientPamLevel === 'L0') {
      alert('⚠️ ผู้ป่วยยังอยู่ในระดับ L0 (ยังไม่ได้คัดกรอง)\n\nไม่สามารถสร้างเป้าหมายได้จนกว่าผู้ป่วยจะทำการคัดกรอง PAM ก่อน');
      return;
    }

    if (!confirm(`ต้องการสร้างเป้าหมายเริ่มต้นสำหรับผู้ป่วยระดับ ${patientPamLevel} หรือไม่?\n\nL2/L3: กฎทอง 5 ข้อ\nL4: แชมป์ 8 กิจกรรม`)) {
      return;
    }

    setSaving(true);
    try {
      const result = await createDefaultGoals(
        selectedPatient,
        patientPamLevel,
        user.id
      );
      
      if (result.success) {
        alert(`✅ สร้างเป้าหมายสำเร็จ!\n\nจำนวน: ${result.count || 0} กิจกรรม`);
        loadPatientData(selectedPatient);
      } else {
        alert('เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error: any) {
      console.error('Error creating default goals:', error);
      alert(error.message || 'เกิดข้อผิดพลาดในการสร้างเป้าหมาย');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateGoal = (goalName: string, field: 'target_days' | 'target_value', value: number | string) => {
    setEditedGoals(prev => ({
      ...prev,
      [goalName]: {
        ...prev[goalName],
        [field]: value,
      },
    }));
  };

  const handleSaveNewRound = async () => {
    if (!selectedPatient || !patientPamLevel) {
      alert('กรุณาเลือกผู้ป่วย');
      return;
    }

    // ✅ ตรวจสอบว่าเป็น L0 หรือไม่
    if (patientPamLevel === 'L0') {
      alert('⚠️ ผู้ป่วยยังอยู่ในระดับ L0 (ยังไม่ได้คัดกรอง)\n\nไม่สามารถบันทึกเป้าหมายได้จนกว่าผู้ป่วยจะทำการคัดกรอง PAM ก่อน');
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    setSaving(true);

    try {
      // ✅ ตรวจสอบว่ามี goals วันนี้แล้วหรือไม่
      const { data: existingToday } = await supabase
        .from('goals')
        .select('id, goal_name, round_number, created_at')
        .eq('user_id', selectedPatient)
        .eq('goal_type', 'weekly_activity')
        .eq('status', 'active')
        .gte('created_at', today + 'T00:00:00')
        .lte('created_at', today + 'T23:59:59');

      let nextRound: number;

      if (existingToday && existingToday.length > 0) {
        nextRound = existingToday[0].round_number || 1;
        
        // ✅ ลบ goals ของวันนี้
        await supabase
          .from('goals')
          .delete()
          .eq('user_id', selectedPatient)
          .eq('goal_type', 'weekly_activity')
          .eq('status', 'active')
          .gte('created_at', today + 'T00:00:00')
          .lte('created_at', today + 'T23:59:59');
      } else {
        // ✅ Archive goals เดิม
        const { data: goalsToArchive } = await supabase
          .from('goals')
          .select('id, goal_name')
          .eq('user_id', selectedPatient)
          .eq('goal_type', 'weekly_activity')
          .eq('status', 'active');

        if (goalsToArchive && goalsToArchive.length > 0) {
          await supabase
            .from('goals')
            .update({
              is_current: false,
              status: 'archived',
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', selectedPatient)
            .eq('goal_type', 'weekly_activity')
            .eq('status', 'active');
        }

        // ✅ นับ round ใหม่
        const { data: allRounds } = await supabase
          .from('goals')
          .select('round_number')
          .eq('user_id', selectedPatient)
          .eq('goal_type', 'weekly_activity');

        const uniqueRounds = new Set(allRounds?.map(g => g.round_number) || []);
        nextRound = uniqueRounds.size + 1;
      }

      // ✅ สร้าง goals ใหม่
      const defaultDays = DEFAULT_DAYS_BY_LEVEL[patientPamLevel] || 5;
      const newGoals = activities.map(activity => {
        const edit = editedGoals[activity.activity_code] || { target_days: defaultDays };
        
        return {
          user_id: selectedPatient,
          goal_type: 'weekly_activity',
          goal_name: activity.activity_code,
          goal_name_th: activity.activity_name_th,
          target_days: edit.target_days,
          target_value: edit.target_value ? parseFloat(edit.target_value) : 
                       (activity.target_value ? parseFloat(activity.target_value) : null),
          target_unit: activity.unit || (activity.activity_type === 'exercise' ? 'minutes' : null),
          activity_id: activity.id,
          start_date: today,
          status: 'active',
          is_current: true,
          priority: 1,
          is_core_goal: true,
          created_by: user?.id,
          round_number: nextRound,
          primary_goal_note: primaryGoalNote || null,
          weekly_goal_note: weeklyNote || null,
        };
      });

      const { error } = await supabase.from('goals').insert(newGoals);

      if (error) {
        alert('เกิดข้อผิดพลาด: ' + error.message);
        return;
      }

      alert(`✅ บันทึกเป้าหมายรอบใหม่สำเร็จ: ${newGoals.length} กิจกรรม`);
      loadPatientData(selectedPatient);
    } catch (error) {
      console.error('Error saving goals:', error);
      alert('เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setSaving(false);
    }
  };

  const handleRoundChange = (round: number) => {
    setCurrentRound(round);
    loadGoals(round);
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
        .eq('user_id', selectedPatient)
        .eq('round_number', currentRound)
        .eq('goal_type', 'weekly_activity')
        .eq('status', 'active');
      
      if (error) throw error;
      
      alert('✅ เก็บถาวรเป้าหมายสำเร็จ!');
      loadPatientData(selectedPatient);
    } catch (error) {
      console.error('Error archiving goals:', error);
      alert('เกิดข้อผิดพลาดในการเก็บถาวร');
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button
            onClick={() => router.push('/admin/dashboard')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับ Dashboard
          </button>

          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-800 mb-1">
                🎯 จัดการเป้าหมาย
              </h1>
              <p className="text-gray-600">กำหนดและจัดการเป้าหมายผู้ป่วย</p>
            </div>

            <div className="flex items-center gap-4">
              {/* ✅ แสดงข้อมูลผู้ใช้และโรงพยาบาล */}
              {userHospital && (
                <div className="text-right bg-gradient-to-l from-blue-50 to-indigo-50 px-4 py-3 rounded-xl border border-blue-200">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <UserCheck className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">
                        {user?.full_name_th || 'ผู้ดูแลระบบ'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {user?.role === 'admin' ? '👑 ผู้ดูแลระบบ' :
                         user?.role === 'doctor' ? '👨‍⚕️ แพทย์' : '👩‍💼 เจ้าหน้าที่'}
                      </p>
                    </div>
                  </div>

                  {/* ✅ แสดงข้อมูลโรงพยาบาล */}
                  <div className="border-t border-blue-200 pt-2 mt-2">
                    <div className="flex items-center gap-1 mb-1">
                      <Hospital className="w-3 h-3 text-blue-600" />
                      <span className="text-xs text-gray-600 font-medium">
                        {userHospital.name}
                      </span>
                    </div>

                    {/* ✅ Badge ประเภทโรงพยาบาล */}
                    <div className="flex items-center gap-2">
                      {userHospital.type === 'main' ? (
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-semibold">
                          🏥 แม่ข่าย
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-semibold">
                          🏥 ลูกข่าย
                        </span>
                      )}

                      {/* ✅ แสดงแม่ข่าย (ถ้าเป็นลูกข่าย) */}
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
                className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
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
        {/* Select Patient */}
        <div className="bg-white rounded-xl shadow-sm p-6 border mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-600" />
              เลือกผู้ป่วย
            </h2>
            {selectedPatient && goals.length === 0 && (
              <button
                onClick={handleCreateDefaultGoals}
                disabled={saving || patientPamLevel === 'L0'}
                className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-all ${
                  patientPamLevel === 'L0'
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-green-500 text-white hover:bg-green-600'
                }`}
              >
                <Plus className="w-4 h-4" />
                {patientPamLevel === 'L0' ? 'รอคัดกรอง L0' : saving ? 'กำลังสร้าง...' : 'สร้างเป้าหมายเริ่มต้น'}
              </button>
            )}
          </div>

          {/* ✅ แสดงแจ้งเตือนกรณี L0 */}
          {selectedPatient && patientPamLevel === 'L0' && (
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                <div>
                  <h4 className="font-bold text-yellow-800 mb-1">
                    ⚠️ ผู้ป่วยยังไม่ได้คัดกรอง (ระดับ L0)
                  </h4>
                  <p className="text-yellow-700 text-sm">
                    ผู้ป่วยยังไม่ได้ทำการคัดกรอง PAM จึงยังไม่สามารถสร้างเป้าหมายได้
                    กรุณาให้ผู้ป่วยทำการคัดกรองก่อน แล้วค่อยกลับมาสร้างเป้าหมาย
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Search by HN */}
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

          {/* Search by Name */}
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

          {/* Search Results Dropdown */}
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
                      {patient.hospitals && (
                        <p className="text-xs text-blue-600 mt-1">
                          🏥 {patient.hospitals.name} {patient.hospitals.type === 'main' ? '(แม่ข่าย)' : '(ลูกข่าย)'}
                        </p>
                      )}
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
              หรือเลือกรายการทั้งหมด
            </label>
            <select
              value={selectedPatient}
              onChange={(e) => handleSelectPatient(patients.find(p => p.id === e.target.value)!)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">-- เลือกผู้ป่วย --</option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.hospital_number} - {patient.full_name} (PAM: {patient.pam_level})
                  {patient.hospitals?.name ? ` - ${patient.hospitals.name}` : ''}
                </option>
              ))}
            </select>
            {accessibleHospitalIds.length > 0 && (
              <p className="text-xs text-gray-500 mt-2">
                🔒 แสดงผู้ป่วยจาก {accessibleHospitalIds.length} โรงพยาบาลที่คุณมีสิทธิ์เข้าถึง
              </p>
            )}
          </div>
        </div>

        {/* ✅ แสดงข้อมูลเมื่อเลือกผู้ป่วยแล้ว */}
        {selectedPatient && patientPamLevel && (
          <>
            {/* Info Banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm text-blue-800">
                    <strong>ระดับผู้ป่วย: </strong> {patientPamLevel} | 
                    <strong> จำนวนเป้าหมาย: </strong> {goals.length} กิจกรรม
                    {patientPamLevel === 'L2' && ' (กฎทอง 5 ข้อ - เริ่มต้น 3 วัน/สัปดาห์)'}
                    {patientPamLevel === 'L3' && ' (กฎทอง 5 ข้อ - เริ่มต้น 4 วัน/สัปดาห์)'}
                    {patientPamLevel === 'L4' && ' (แชมป์ 8 กิจกรรม - เริ่มต้น 5 วัน/สัปดาห์)'}
                  </p>
                  
                  {/* ✅ แสดง Round Number และวันที่บันทึก */}
                  <div className="mt-2 flex items-center gap-4">
                    <div className="flex items-center gap-1 text-xs text-blue-600">
                      <History className="w-3 h-3" />
                      <span>รอบที่: <strong>{currentRound}</strong></span>
                    </div>
                    {lastRecordedDate && (
                      <div className="flex items-center gap-1 text-xs text-blue-600">
                        <Calendar className="w-3 h-3" />
                        <span>บันทึกครั้งล่าสุด: <strong>{new Date(lastRecordedDate).toLocaleDateString('th-TH')}</strong></span>
                      </div>
                    )}
                    {isSameDay && (
                      <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">
                        ⚠️ บันทึกวันนี้แล้ว
                      </span>
                    )}
                  </div>
                  
                  {goalHistory[0]?.is_current && (
                    <p className="text-xs text-blue-600 mt-1">
                      📅 เป้าหมายปัจจุบันเริ่มใช้: {new Date(goalHistory[0].start_date).toLocaleDateString('th-TH')}
                    </p>
                  )}
                  <p className="text-xs text-blue-600 mt-1">
                    💡 ปรับเปลี่ยนจำนวนวัน/สัปดาห์ แล้วกด "บันทึกเป้าหมายรอบใหม่" เพื่อบันทึกเป็นรอบใหม่
                  </p>
                </div>
                
                {goals.length === 0 && patientPamLevel !== 'L0' && (
                  <button
                    onClick={handleCreateDefaultGoals}
                    disabled={saving}
                    className="shrink-0 px-4 py-2 bg-green-500 text-white text-sm font-semibold rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
                  >
                    🎯 สร้างเป้าหมาย
                  </button>
                )}
              </div>
            </div>

            {/* Goals List */}
            {goals.length > 0 ? (
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-200">
                  <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    <Target className="w-6 h-6 text-blue-600" />
                    เป้าหมายรอบที่ {currentRound}
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {patientPamLevel === 'L2' || patientPamLevel === 'L3' 
                      ? '📋 กฎทอง 5 ข้อ - 5 วัน/สัปดาห์' 
                      : patientPamLevel === 'L4'
                        ? '🏆 แชมป์ 8 กิจกรรม - 5 วัน/สัปดาห์'
                        : '⚠️ ระดับ L0 - ยังไม่สร้างเป้าหมาย'}
                  </p>
                </div>

                <div className="divide-y divide-gray-200">
                  {goals.map((goal) => (
                    <div key={goal.id} className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-3xl">{getGoalIcon(goal.goal_name)}</span>
                          <div>
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
                              <span className="text-sm font-bold text-green-600">
                                {goal.is_completed ? '✓' : '○'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Save Button */}
                <div className="p-6 border-t border-gray-200">
                  <button
                    onClick={handleSaveNewRound}
                    disabled={saving}
                    className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold py-4 rounded-xl hover:from-green-600 hover:to-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {saving ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        กำลังบันทึก...
                      </>
                    ) : (
                      <>
                        <Save className="w-5 h-5" />
                        {isSameDay ? `บันทึกทับรอบที่ ${currentRound} (วันเดิม)` : `บันทึกเป้าหมายรอบที่ ${currentRound + 1}`}
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : patientPamLevel !== 'L0' && (
              <div className="text-center py-12 bg-white rounded-xl shadow-lg border border-gray-200">
                <Target className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p className="text-gray-500 mb-4">ยังไม่มีเป้าหมายในรอบนี้</p>
                <button
                  onClick={handleCreateDefaultGoals}
                  disabled={saving}
                  className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all"
                >
                  สร้างเป้าหมายอัตโนมัติ
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}