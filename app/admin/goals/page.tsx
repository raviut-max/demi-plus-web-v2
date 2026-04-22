// app/admin/goals/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, logout, getPatientList, getGoalRoundCount, getLatestGoalRound } from '@/lib/supabase/queries';
import { supabase } from '@/lib/supabase/client';
import { ArrowLeft, LogOut, Save, Target, Trophy, Plus, CheckCircle2, Circle, Search, User, History, Calendar } from 'lucide-react';

// ✅ Default days ตาม PAM Level
const DEFAULT_DAYS_BY_LEVEL: Record<string, number> = {
  L2: 3,
  L3: 4,
  L4: 5,
};

// ✅ Long-term Goals 4 ข้อ (Core Performance Goals)
const LONG_TERM_GOALS = [
  { code: 'weight', name_th: 'น้ำหนักลด (Weight Reduction)', description: 'ลดลงอย่างน้อย 5-10% และลด Visceral Fat' },
  { code: 'glucose', name_th: 'น้ำตาลลง (Glucose Control)', description: 'ควบคุมระดับน้ำตาลในเลือดให้เข้าสู่เกณฑ์ปกติ' },
  { code: 'medication', name_th: 'ลดยาได้ (Medication De-escalation)', description: 'ปรับลดหรือหยุดยาภายใต้การกำกับของแพทย์' },
  { code: 'remission', name_th: 'ภาวะเบาหวานสงบ (Remission)', description: 'บรรลุ HbA1c < 6.5% โดยไม่ต้องใช้ยาต่อเนื่อง' },
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
}

interface GoalHistory {
  id: string;
  goals: Goal[];
  start_date: string;
  is_current: boolean;
  round_number?: number;
}

export default function AdminGoalsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState('');
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
  const [filteredPatients, setFilteredPatients] = useState<any[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [searchType, setSearchType] = useState<'hn' | 'name' | null>(null);

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

    const urlParams = new URLSearchParams(window.location.search);
    const patientId = urlParams.get('patient_id');
    if (patientId) {
      setSelectedPatient(patientId);
    }
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

  const handleSelectPatient = (patient: any) => {
    setSelectedPatient(patient.id);
    setSearchHN('');
    setSearchName('');
    setShowSearchDropdown(false);
    setFilteredPatients([]);
    loadPatientData(patient.id);
  };

  const loadPatientData = async (patientId: string) => {
    try {
      const patient = patients.find(p => p.id === patientId);
      if (patient) {
        const pamLevel = patient.pam_level || 'L2';
        setPatientPamLevel(pamLevel);

        // ✅ 1. ดึง activities
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

        console.log('📋 Loaded activities:', activitiesData?.length || 0);
        setActivities(activitiesData || []);

        // ✅ 2. ดึง goals ปัจจุบัน
        const { data: activeGoals, error: goalsError } = await supabase
          .from('goals')
          .select('*')
          .eq('user_id', patientId)
          .eq('goal_type', 'weekly_activity')
          .eq('status', 'active')
          .eq('is_current', true)
          .order('created_at', { ascending: false });

        if (goalsError) {
          console.error('Error loading goals:', goalsError);
          return;
        }

        // ✅ กรอง duplicate goals
        const uniqueGoalsMap = new Map<string, Goal>();
        (activeGoals || []).forEach((goal: Goal) => {
          if (!uniqueGoalsMap.has(goal.goal_name)) {
            uniqueGoalsMap.set(goal.goal_name, goal);
          }
        });
        const uniqueGoals = Array.from(uniqueGoalsMap.values());

        console.log('🎯 Loaded goals:', uniqueGoals.length);
        setGoals(uniqueGoals);

        // ✅ 3. โหลดค่าที่แก้ไขแล้ว
        const edits: Record<string, { target_days: number; target_value?: string }> = {};
        uniqueGoals.forEach((goal: Goal) => {
          edits[goal.goal_name] = {
            target_days: goal.target_days,
            target_value: goal.target_value?.toString() ?? '',
          };
        });
        setEditedGoals(edits);

        // ✅ 4. ดึงประวัติ goals (archived)
        const { data: archivedGoals } = await supabase
          .from('goals')
          .select('*')
          .eq('user_id', patientId)
          .eq('goal_type', 'weekly_activity')
          .eq('status', 'archived')
          .order('round_number', { ascending: false })
          .order('created_at', { ascending: false });

        // จัดกลุ่มประวัติ ตาม round_number
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

        // เพิ่ม current goals เข้าไปด้วย
        if (uniqueGoals && uniqueGoals.length > 0) {
          const currentRoundNum = uniqueGoals[0].round_number || 1;
          history.unshift({
            id: 'current',
            goals: uniqueGoals,
            start_date: uniqueGoals[0].created_at,
            is_current: true,
            round_number: currentRoundNum,
          });
        }

        setGoalHistory(history);

        // ✅ 5. โหลด primary goal
        try {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('primary_goal_code')
            .eq('id', patientId)
            .single();

          setPrimaryGoal(profileData?.primary_goal_code || '');
        } catch (err) {
          console.error('Error loading primary goal:', err);
          setPrimaryGoal('');
        }

        // ✅ 6. โหลดหมายเหตุ
        if (uniqueGoals && uniqueGoals.length > 0) {
          const firstGoal = uniqueGoals[0];
          setPrimaryGoalNote(firstGoal.primary_goal_note || '');
          setWeeklyNote(firstGoal.weekly_goal_note || '');
        } else {
          setPrimaryGoalNote('');
          setWeeklyNote('');
        }

        // ✅ 7. โหลด Round Number และวันที่บันทึกครั้งล่าสุด
        const roundCount = await getGoalRoundCount(patientId);
        setCurrentRound(roundCount);

        const latestRound = await getLatestGoalRound(patientId);
        if (latestRound) {
          setLastRecordedDate(latestRound.created_at);

          // ✅ ตรวจสอบว่าบันทึกในวันเดิมหรือไม่
          const today = new Date().toISOString().split('T')[0];
          const lastDate = new Date(latestRound.created_at).toISOString().split('T')[0];
          setIsSameDay(today === lastDate);

          console.log('📅 Last recorded:', lastDate, '| Today:', today, '| Same day:', today === lastDate);
        }
      }
    } catch (error) {
      console.error('Error loading patient data:', error);
    }
  };

  const handlePatientSelect = (patientId: string) => {
    setSelectedPatient(patientId);
    if (patientId) {
      loadPatientData(patientId);
    } else {
      setActivities([]);
      setGoals([]);
      setPatientPamLevel('');
      setEditedGoals({});
      setGoalHistory([]);
      setPrimaryGoal('');
      setPrimaryGoalNote('');
      setWeeklyNote('');
      setCurrentRound(1);
      setLastRecordedDate('');
      setIsSameDay(false);
    }
  };

  const handlePrimaryGoalChange = async (goalCode: string) => {
    if (!selectedPatient) return;
    setSavingPrimaryGoal(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          primary_goal_code: goalCode,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedPatient);

      if (error) {
        console.error('Error updating primary goal:', error);

        if (error.code === '42P01') {
          alert('ไม่พบตาราง profiles กรุณาตรวจสอบการเชื่อมต่อฐานข้อมูล');
        } else if (error.code === '42703') {
          alert('ไม่พบคอลัมน์ primary_goal_code กรุณาติดต่อผู้ดูแลระบบ');
        } else {
          alert('เกิดข้อผิดพลาด: ' + error.message);
        }
        return;
      }

      setPrimaryGoal(goalCode);
      console.log('✅ Primary goal updated:', goalCode);
    } catch (err) {
      console.error('Update primary goal error:', err);
      alert('เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setSavingPrimaryGoal(false);
    }
  };

  const handleCreateDefaultGoals = async () => {
    if (!selectedPatient || !patientPamLevel) {
      alert('กรุณาเลือกผู้ป่วย');
      return;
    }
    if (confirm(`ต้องการสร้างเป้าหมายเริ่มต้นสำหรับผู้ป่วยระดับ ${patientPamLevel} หรือไม่?`)) {
      setSaving(true);

      try {
        await supabase
          .from('goals')
          .delete()
          .eq('user_id', selectedPatient)
          .eq('goal_type', 'weekly_activity');

        const { data: activitiesData, error: activitiesError } = await supabase
          .from('activities')
          .select('*')
          .or(`pam_level.eq.${patientPamLevel},pam_level.eq.ALL`)
          .eq('is_active', true)
          .order('sort_order', { ascending: true });

        if (activitiesError || !activitiesData || activitiesData.length === 0) {
          alert('ไม่พบกิจกรรมในฐานข้อมูล กรุณาตรวจสอบตาราง activities');
          return;
        }

        const defaultDays = DEFAULT_DAYS_BY_LEVEL[patientPamLevel] || 5;
        const today = new Date().toISOString().split('T')[0];

        const newGoals = activitiesData.map(activity => ({
          user_id: selectedPatient,
          goal_type: 'weekly_activity',
          goal_name: activity.activity_code,
          goal_name_th: activity.activity_name_th,
          target_days: defaultDays,
          target_value: activity.target_value ? parseFloat(activity.target_value) : null,
          target_unit: activity.unit || null,
          activity_id: activity.id,
          start_date: today,
          status: 'active',
          priority: 1,
          is_core_goal: true,
          created_by: user?.id,
        }));

        const { error } = await supabase.from('goals').insert(newGoals);

        if (error) {
          alert('เกิดข้อผิดพลาด: ' + error.message);
          return;
        }

        alert(`✅ สร้างเป้าหมายสำเร็จ: ${newGoals.length} กิจกรรม`);
        loadPatientData(selectedPatient);
      } catch (error) {
        console.error('Error creating default goals:', error);
        alert('เกิดข้อผิดพลาดในการสร้างเป้าหมาย');
      } finally {
        setSaving(false);
      }
    }
  };

  const handleUpdateGoal = (goalName: string, field: 'target_days' | 'target_value', value: number | string) => {
    console.log(`📝 Updating ${goalName} ${field}:`, value);
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
    const today = new Date().toISOString().split('T')[0];
    console.log('🔍 [DEBUG] handleSaveNewRound - Today:', today);

    // ✅ 1. ตรวจสอบว่าวันนี้มี goals อยู่แล้วหรือไม่
    const { data: existingToday, error: fetchError } = await supabase
      .from('goals')
      .select('id, goal_name, round_number, created_at')
      .eq('user_id', selectedPatient)
      .eq('goal_type', 'weekly_activity')
      .eq('is_current', true)
      .gte('created_at', today + 'T00:00:00')
      .lte('created_at', today + 'T23:59:59');

    if (fetchError) {
      console.error('❌ [DEBUG] Error fetching:', fetchError);
    }

    console.log('📋 [DEBUG] Existing goals today:', existingToday?.length || 0);
    if (existingToday && existingToday.length > 0) {
      console.log('📋 [DEBUG] Goals to delete:', existingToday.map(g => ({
        id: g.id,
        name: g.goal_name,
        round: g.round_number
      })));
    }

    let confirmMessage = 'ต้องการบันทึกเป้าหมายรอบใหม่หรือไม่?\n\n';

    if (existingToday && existingToday.length > 0) {
      confirmMessage += `⚠️ คุณได้บันทึกเป้าหมายไปแล้ววันนี้ (${existingToday.length} กิจกรรม)\n\n`;
      confirmMessage += 'การบันทึกครั้งนี้จะลบข้อมูลเดิมของวันนี้และบันทึกใหม่\n\n';
      confirmMessage += 'ต้องการบันทึกทับหรือไม่?';
    } else {
      confirmMessage += 'ระบบจะเก็บเป้าหมายเดิมเป็นประวัติ และสร้างเป้าหมายใหม่แทน';
    }

    if (!confirm(confirmMessage)) {
      console.log('❌ [DEBUG] User cancelled');
      return;
    }

    setSaving(true);

    try {
      // ✅ 2. ลบ goals ของวันนี้ก่อน (ถ้ามี)
      if (existingToday && existingToday.length > 0) {
        console.log('🗑️ [DEBUG] Deleting goals...');
        console.log('🗑️ [DEBUG] Goal IDs:', existingToday.map(g => g.id));

        const { error: deleteError } = await supabase
          .from('goals')
          .delete()
          .eq('user_id', selectedPatient)
          .eq('goal_type', 'weekly_activity')
          .eq('is_current', true)
          .gte('created_at', today + 'T00:00:00')
          .lte('created_at', today + 'T23:59:59');

        if (deleteError) {
          console.error('❌ [DEBUG] Delete error:', deleteError);
        } else {
          console.log('✅ [DEBUG] Deleted successfully');

          // ✅ ตรวจสอบว่าลบจริงหรือไม่
          const { data: afterDelete } = await supabase
            .from('goals')
            .select('id')
            .eq('user_id', selectedPatient)
            .eq('goal_type', 'weekly_activity')
            .eq('is_current', true)
            .gte('created_at', today + 'T00:00:00')
            .lte('created_at', today + 'T23:59:59');

          console.log('🔍 [DEBUG] After delete - remaining:', afterDelete?.length || 0);
        }
      }

      // ✅ 3. Archive goals เดิม (เฉพาะของวันก่อนหน้า)
      if (!existingToday || existingToday.length === 0) {
        console.log('📦 [DEBUG] Archiving old goals...');

        const { data: goalsToArchive } = await supabase
          .from('goals')
          .select('id, goal_name, round_number')
          .eq('user_id', selectedPatient)
          .eq('goal_type', 'weekly_activity')
          .eq('is_current', true);

        console.log('📦 [DEBUG] Goals to archive:', goalsToArchive?.length || 0);

        if (goalsToArchive && goalsToArchive.length > 0) {
          const { error: archiveError } = await supabase
            .from('goals')
            .update({
              is_current: false,
              status: 'archived',
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', selectedPatient)
            .eq('goal_type', 'weekly_activity')
            .eq('is_current', true);

          if (archiveError) {
            console.error('❌ [DEBUG] Archive error:', archiveError);
          } else {
            console.log('✅ [DEBUG] Archived successfully');
          }
        }
      }

      // ✅ 4. นับ round_number ใหม่ (นับจากวันที่ไม่ซ้ำ)
      console.log('🔢 [DEBUG] Calculating new round number...');

      let newRoundNumber: number;

      if (existingToday && existingToday.length > 0) {
        // วันนี้บันทึกไปแล้ว → ใช้ round เดิม
        newRoundNumber = existingToday[0].round_number || 1;
        console.log('📅 [DEBUG] Same day - using existing round:', newRoundNumber);
      } else {
        // วันใหม่ → archive ของเก่า + นับรอบใหม่
        const { data: allGoals } = await supabase
          .from('goals')
          .select('created_at')
          .eq('user_id', selectedPatient)
          .eq('goal_type', 'weekly_activity');

        // ✅ นับจำนวนวันที่ไม่ซ้ำ (ไม่ต้องบวก 1)
        const uniqueDates = new Set(allGoals?.map(g => g.created_at.split('T')[0]) || []);
        newRoundNumber = uniqueDates.size;

        console.log('🔢 [DEBUG] Unique dates:', Array.from(uniqueDates));
        console.log('🔢 [DEBUG] New round number:', newRoundNumber);
      }

      // ✅ 5. สร้าง goals ใหม่
      const defaultDays = DEFAULT_DAYS_BY_LEVEL[patientPamLevel] || 5;

      const newGoals = activities.map(activity => {
        const edit = editedGoals[activity.activity_code] || { target_days: defaultDays };

        return {
          user_id: selectedPatient,
          goal_type: 'weekly_activity' as const,
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
          round_number: newRoundNumber,
          primary_goal_note: primaryGoalNote || null,
          weekly_goal_note: weeklyNote || null,
        };
      });

      console.log('💾 [DEBUG] Saving goals:', newGoals.length);
      console.log('💾 [DEBUG] Round number:', newRoundNumber);

      const { error } = await supabase.from('goals').insert(newGoals);

      if (error) {
        console.error('❌ [DEBUG] Insert error:', error);
        alert('เกิดข้อผิดพลาด: ' + error.message);
        return;
      }

      console.log('✅ [DEBUG] Saved successfully');
      alert(`✅ บันทึกเป้าหมายรอบใหม่สำเร็จ: ${newGoals.length} กิจกรรม`);

      await loadPatientData(selectedPatient);

    } catch (error) {
      console.error('❌ [DEBUG] Error:', error);
      alert('เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  const foodActivities = activities.filter(a => a.activity_type === 'food');
  const exerciseActivities = activities.filter(a => a.activity_type === 'exercise');
  const measurementActivities = activities.filter(a => a.activity_type === 'measurement');
  const restActivities = activities.filter(a => a.activity_type === 'rest');

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
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
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับ Dashboard
          </button>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800 mb-1">
                🎯 จัดการเป้าหมาย
              </h1>
              <p className="text-gray-600">กำหนดและจัดการเป้าหมายผู้ป่วย</p>
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

        {/* Select Patient */}
        <div className="bg-white rounded-xl shadow-sm p-6 border mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-600" />
              เลือกผู้ป่วย
            </h2>
            {/* ✅ ลบปุ่มสร้างเป้าหมายอัตโนมัติออกจากตรงนี้ */}
          </div>

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
              value={selectedPatient}
              onChange={(e) => handlePatientSelect(e.target.value)}
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

        {selectedPatient && patientPamLevel && (
          <>
            {/* Info Banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm text-blue-800">
                    <strong>ระดับผู้ป่วย:</strong> {patientPamLevel} |
                    <strong> จำนวนเป้าหมาย:</strong> {goals.length} กิจกรรม
                    {patientPamLevel === 'L2' && ' (กฎทอง 5 ข้อ - เริ่มต้น 3 วัน/สัปดาห์)'}
                    {patientPamLevel === 'L3' && ' (กฎทอง 5 ข้อ - เริ่มต้น 4 วัน/สัปดาห์)'}
                    {patientPamLevel === 'L4' && ' (แชมป์ 8 กิจกรรม - เริ่มต้น 5 วัน/สัปดาห์)'}
                  </p>

                  {/* ✅ แสดงข้อความแจ้งเตือนถ้ายังไม่มี goals */}
                  {goals.length === 0 && (
                    <div className="mt-3 p-4 bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-400 rounded-lg animate-pulse">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0">
                          <div className="w-10 h-10 bg-yellow-400 rounded-full flex items-center justify-center">
                            <span className="text-xl">⚠️</span>
                          </div>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-yellow-900 mb-1">
                            ยังไม่มีเป้าหมายสำหรับผู้ป่วยคนนี้
                          </p>
                          <p className="text-xs text-yellow-800 mb-2">
                            กรุณาสร้างเป้าหมายเริ่มต้นก่อนที่จะบันทึกข้อมูลอื่นๆ ผู้ป่วยจะต้องมีเป้าหมายก่อนที่จะทำกิจกรรมหรือติดตามผลได้
                          </p>
                          <div className="flex items-center gap-2 text-xs text-yellow-700">
                            <span className="font-semibold">💡 คำแนะนำ:</span>
                            <span>กดปุ่ม "สร้างเป้าหมายเริ่มต้น" ด้านขวาเพื่อสร้างเป้าหมายตามระดับ PAM</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* แสดง Round Number และวันที่บันทึก */}
                  <div className="mt-2 flex items-center gap-4">
                    <div className="flex items-center gap-1 text-xs text-blue-600">
                      <History className="w-3 h-3" />
                      <span>รอบที่: <strong>{currentRound}</strong></span>
                    </div>
                    {lastRecordedDate && (
                      <div className="flex items-center gap-1 text-xs text-blue-600">
                        <Calendar className="w-3 h-3" />
                        <span>บันทึกครั้งล่าสุด: <strong>{formatDate(lastRecordedDate)}</strong></span>
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
                      📅 เป้าหมายปัจจุบันเริ่มใช้: {formatDate(goalHistory[0].start_date)}
                    </p>
                  )}
                  <p className="text-xs text-blue-600 mt-1">
                    💡 ปรับเปลี่ยนจำนวนวัน/สัปดาห์ แล้วกด "บันทึกเป้าหมายรอบใหม่" เพื่อบันทึกเป็นรอบใหม่
                  </p>
                </div>

                {/* ✅ ปุ่มสร้างเป้าหมาย - แสดงเมื่อไม่มี goals */}
                {goals.length === 0 && (
                  <button
                    onClick={handleCreateDefaultGoals}
                    disabled={saving}
                    className="shrink-0 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold rounded-lg shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🎯</span>
                      <div className="text-left">
                        <div className="text-sm font-bold">สร้างเป้าหมายเริ่มต้น</div>
                        <div className="text-xs opacity-90">ตามระดับ PAM</div>
                      </div>
                    </div>
                  </button>
                )}
              </div>
            </div>

            {/* Long-term Goals */}
            <div className="bg-white rounded-xl shadow-sm p-6 border mb-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-purple-600" />
                เป้าหมายหลัก 4 ประการ (Core Performance Goals)
                <span className="text-sm font-normal text-gray-500 ml-2">- เลือก 1 ข้อที่เป็นเป้าหมายหลักของผู้ป่วย</span>
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {LONG_TERM_GOALS.map((goal) => {
                  const isSelected = primaryGoal === goal.code;
                  return (
                    <label
                      key={goal.code}
                      className={`relative flex flex-col p-4 rounded-xl border-2 cursor-pointer transition-all ${
                        isSelected
                          ? 'border-purple-500 bg-purple-50 shadow-md'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
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
                          <p className={`font-bold mb-1 ${
                            isSelected ? 'text-purple-900' : 'text-gray-800'
                          }`}>
                            {goal.name_th}
                          </p>
                          <p className={`text-sm ${
                            isSelected ? 'text-purple-700' : 'text-gray-600'
                          }`}>
                            {goal.description}
                          </p>
                        </div>
                      </div>
                      <input
                        type="radio"
                        name="primaryGoal"
                        value={goal.code}
                        checked={isSelected}
                        onChange={(e) => handlePrimaryGoalChange(e.target.value)}
                        disabled={savingPrimaryGoal}
                        className="hidden"
                      />
                    </label>
                  );
                })}
              </div>

              <div className="mt-4 pt-4 border-t border-gray-200">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  📝 เป้าหมาย(หลัก) - หมายเหตุเพิ่มเติม
                </label>
                <textarea
                  value={primaryGoalNote}
                  onChange={(e) => setPrimaryGoalNote(e.target.value)}
                  placeholder="กรอกหมายเหตุหรือคำแนะนำสำหรับเป้าหมายหลัก..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                  rows={3}
                />
                <p className="text-xs text-gray-500 mt-1">
                  💡 หมายเหตุนี้จะถูกบันทึกกับเป้าหมายหลักของผู้ป่วย
                </p>
              </div>

              {savingPrimaryGoal && (
                <p className="text-sm text-gray-500 mt-3 text-center">
                  กำลังบันทึก...
                </p>
              )}
            </div>

            {/* Food Activities */}
            {foodActivities.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-6 border mb-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4">🍚 เป้าหมายรายสัปดาห์ - อาหาร</h2>
                <div className="space-y-4">
                  {foodActivities.map((activity) => {
                    const defaultDays = DEFAULT_DAYS_BY_LEVEL[patientPamLevel] || 5;
                    const existingGoal = goals.find(g => g.goal_name === activity.activity_code);
                    const currentDays = editedGoals[activity.activity_code]?.target_days || existingGoal?.target_days || defaultDays;

                    return (
                      <div key={activity.id} className="flex items-center justify-between p-4 rounded-xl border border-gray-200">
                        <div className="flex-1">
                          <p className="font-semibold text-gray-800">{activity.activity_name_th}</p>
                          {activity.description_th && (
                            <p className="text-sm text-gray-500 mt-1">{activity.description_th}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          {activity.target_value && (
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">ค่าเป้าหมาย</label>
                              <input
                                type="number"
                                step="0.1"
                                value={editedGoals[activity.activity_code]?.target_value || existingGoal?.target_value?.toString() || activity.target_value}
                                onChange={(e) => handleUpdateGoal(activity.activity_code, 'target_value', e.target.value)}
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-24"
                              />
                            </div>
                          )}
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">วัน/สัปดาห์</label>
                            <select
                              value={currentDays}
                              onChange={(e) => handleUpdateGoal(activity.activity_code, 'target_days', parseInt(e.target.value))}
                              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            >
                              {[1, 2, 3, 4, 5, 6, 7].map(day => (
                                <option key={day} value={day}>{day} วัน</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Exercise Activities */}
            {exerciseActivities.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-6 border mb-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4">🧘 เป้าหมายรายสัปดาห์ - ออกกำลังกาย</h2>
                <div className="space-y-4">
                  {exerciseActivities.map((activity) => {
                    const defaultDays = DEFAULT_DAYS_BY_LEVEL[patientPamLevel] || 5;
                    const existingGoal = goals.find(g => g.goal_name === activity.activity_code);
                    const currentDays = editedGoals[activity.activity_code]?.target_days || existingGoal?.target_days || defaultDays;

                    return (
                      <div key={activity.id} className="flex items-center justify-between p-4 rounded-xl border border-gray-200">
                        <div className="flex-1">
                          <p className="font-semibold text-gray-800">{activity.activity_name_th}</p>
                          {activity.description_th && (
                            <p className="text-sm text-gray-500 mt-1">{activity.description_th}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">นาที/วัน</label>
                            <input
                              type="number"
                              min="5"
                              max="120"
                              step="5"
                              value={editedGoals[activity.activity_code]?.target_value || existingGoal?.target_value?.toString() || activity.target_value || '10'}
                              onChange={(e) => handleUpdateGoal(activity.activity_code, 'target_value', e.target.value)}
                              className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-24"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">วัน/สัปดาห์</label>
                            <select
                              value={currentDays}
                              onChange={(e) => handleUpdateGoal(activity.activity_code, 'target_days', parseInt(e.target.value))}
                              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            >
                              {[1, 2, 3, 4, 5, 6, 7].map(day => (
                                <option key={day} value={day}>{day} วัน</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Measurement Activities */}
            {measurementActivities.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-6 border mb-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4">📊 เป้าหมายรายสัปดาห์ - วัดและบันทึก</h2>
                <div className="space-y-4">
                  {measurementActivities.map((activity) => {
                    const defaultDays = DEFAULT_DAYS_BY_LEVEL[patientPamLevel] || 5;
                    const existingGoal = goals.find(g => g.goal_name === activity.activity_code);
                    const currentDays = editedGoals[activity.activity_code]?.target_days || existingGoal?.target_days || defaultDays;

                    return (
                      <div key={activity.id} className="flex items-center justify-between p-4 rounded-xl border border-gray-200">
                        <div className="flex-1">
                          <p className="font-semibold text-gray-800">{activity.activity_name_th}</p>
                          {activity.description_th && (
                            <p className="text-sm text-gray-500 mt-1">{activity.description_th}</p>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">วัน/สัปดาห์</label>
                          <select
                            value={currentDays}
                            onChange={(e) => handleUpdateGoal(activity.activity_code, 'target_days', parseInt(e.target.value))}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          >
                            {[1, 2, 3, 4, 5, 6, 7].map(day => (
                              <option key={day} value={day}>{day} วัน</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Rest Activities (L4 only) */}
            {patientPamLevel === 'L4' && restActivities.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-6 border mb-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4">🌙 เป้าหมายรายสัปดาห์ - พักผ่อน</h2>
                <div className="space-y-4">
                  {restActivities.map((activity) => {
                    const defaultDays = DEFAULT_DAYS_BY_LEVEL[patientPamLevel] || 5;
                    const existingGoal = goals.find(g => g.goal_name === activity.activity_code);
                    const currentDays = editedGoals[activity.activity_code]?.target_days || existingGoal?.target_days || defaultDays;

                    return (
                      <div key={activity.id} className="flex items-center justify-between p-4 rounded-xl border border-gray-200">
                        <div className="flex-1">
                          <p className="font-semibold text-gray-800">{activity.activity_name_th}</p>
                          {activity.description_th && (
                            <p className="text-sm text-gray-500 mt-1">{activity.description_th}</p>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">วัน/สัปดาห์</label>
                          <select
                            value={currentDays}
                            onChange={(e) => handleUpdateGoal(activity.activity_code, 'target_days', parseInt(e.target.value))}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          >
                            {[1, 2, 3, 4, 5, 6, 7].map(day => (
                              <option key={day} value={day}>{day} วัน</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* คอมเมนต์หมายเหตุรายสัปดาห์ (รวม) */}
            <div className="bg-white rounded-xl shadow-sm p-6 border mb-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                📝 หมายเหตุ(สัปดาห์) - คำแนะนำเพิ่มเติม
              </h2>
              <textarea
                value={weeklyNote}
                onChange={(e) => setWeeklyNote(e.target.value)}
                placeholder="กรอกหมายเหตุหรือคำแนะนำสำหรับเป้าหมายรายสัปดาห์ทั้งหมด..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                rows={4}
              />
              <p className="text-xs text-gray-500 mt-2">
                💡 หมายเหตุนี้จะถูกบันทึกกับทุกกิจกรรมในสัปดาห์นี้ และจะแสดงเมื่อผู้ป่วยบันทึกกิจกรรมรายวัน
              </p>
            </div>

            {/* Save Button */}
            {goals.length > 0 && (
              <div className="flex gap-4">
                <button
                  onClick={handleSaveNewRound}
                  disabled={saving || activities.length === 0}
                  className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold py-4 rounded-xl hover:from-green-600 hover:to-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
            )}
          </>
        )}
      </div>
    </div>
  );
}