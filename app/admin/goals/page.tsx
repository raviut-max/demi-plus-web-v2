// app/admin/goals/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { checkSession, logout, getPatientList, getPatientGoals } from '@/lib/supabase/queries';
import { ArrowLeft, LogOut, Save, Target, Trophy, Plus, CheckCircle2, Circle } from 'lucide-react';
import { supabase } from '@/lib/supabase/client'; // ✅ ใช้ client กลาง

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
}

interface GoalHistory {
  id: string;
  goals: Goal[];
  start_date: string;
  is_current: boolean;
}

export default function AdminGoalsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
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
  const [primaryGoal, setPrimaryGoal] = useState<string>('');
  const [savingPrimaryGoal, setSavingPrimaryGoal] = useState(false);

  useEffect(() => {
    // ✅ FIX: กัน Vercel build (ไม่มี window)
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

    // ✅ ดึง patient_id จาก URL
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

        setActivities(activitiesData || []);

        // ✅ 2. ดึง goals ปัจจุบัน
        const { data: activeGoals, error: goalsError } = await supabase
          .from('goals')
          .select('*')
          .eq('user_id', patientId)
          .eq('goal_type', 'weekly_activity')
          .eq('status', 'active')
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

        // ✅ 4. ดึงประวัติ goals
        const { data: archivedGoals } = await supabase
          .from('goals')
          .select('*')
          .eq('user_id', patientId)
          .eq('goal_type', 'weekly_activity')
          .eq('status', 'archived')
          .order('created_at', { ascending: false });

        const historyMap = new Map<string, Goal[]>();
        (archivedGoals || []).forEach((goal: Goal) => {
          const dateKey = goal.created_at.split('T')[0];
          if (!historyMap.has(dateKey)) {
            historyMap.set(dateKey, []);
          }
          historyMap.get(dateKey)!.push(goal);
        });

        const history = Array.from(historyMap.entries()).map(([date, goalsList]) => ({
          id: date,
          goals: goalsList,
          start_date: date,
          is_current: false,
        }));

        if (uniqueGoals && uniqueGoals.length > 0) {
          const currentStartDate = uniqueGoals[0].created_at.split('T')[0];
          history.unshift({
            id: 'current',
            goals: uniqueGoals,
            start_date: currentStartDate,
            is_current: true,
          });
        }

        setGoalHistory(history);

        // ✅ 5. โหลด primary goal จาก profile (เพิ่ม error handling)
        try {
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('primary_goal_code')
            .eq('id', patientId)
            .single();

          // PGRST116 = not found (ไม่ถือว่าผิด)
          if (profileError && profileError.code !== 'PGRST116') {
            console.warn('Warning loading primary goal:', profileError);
          }
          
          setPrimaryGoal(profileData?.primary_goal_code || '');
        } catch (err) {
          console.error('Error loading primary goal:', err);
          setPrimaryGoal('');
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
    }
  };

  // ✅ ฟังก์ชันบันทึก primary goal (เพิ่ม error handling)
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
        
        // ✅ แสดงข้อความที่อ่านง่าย
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

    if (confirm('ต้องการบันทึกเป้าหมายรอบใหม่หรือไม่?\n\nระบบจะเก็บเป้าหมายเดิมเป็นประวัติ และสร้างเป้าหมายใหม่แทน')) {
      setSaving(true);

      try {
        if (goals.length > 0) {
          const { error: archiveError } = await supabase
            .from('goals')
            .update({ 
              status: 'archived',
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', selectedPatient)
            .eq('goal_type', 'weekly_activity')
            .eq('status', 'active');

          if (archiveError) {
            console.error('Error archiving goals:', archiveError);
          }
        }

        const defaultDays = DEFAULT_DAYS_BY_LEVEL[patientPamLevel] || 5;
        const today = new Date().toISOString().split('T')[0];

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
            priority: 1,
            is_core_goal: true,
            created_by: user?.id,
          };
        });

        const { error } = await supabase.from('goals').insert(newGoals);

        if (error) {
          alert('เกิดข้อผิดพลาด: ' + error.message);
          return;
        }

        alert(`✅ บันทึกเป้าหมายรอบใหม่สำเร็จ: ${newGoals.length} กิจกรรม`);
        await loadPatientData(selectedPatient);
        
      } catch (error) {
        console.error('Error saving new round:', error);
        alert('เกิดข้อผิดพลาดในการบันทึก');
      } finally {
        setSaving(false);
      }
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-sky-100 to-cyan-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-100 to-cyan-50">
      {/* Header */}
      <div className="bg-white shadow-lg border-b border-gray-200">
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
              <h1 className="text-2xl font-bold text-gray-800">จัดการเป้าหมาย</h1>
              <p className="text-sm text-gray-600">กำหนดและจัดการเป้าหมายผู้ป่วย</p>
            </div>
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

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Select Patient */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-600" />
              เลือกผู้ป่วย
            </h2>
            {selectedPatient && goals.length === 0 && (
              <button
                onClick={handleCreateDefaultGoals}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                {saving ? 'กำลังสร้าง...' : 'สร้างเป้าหมายเริ่มต้น'}
              </button>
            )}
          </div>
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
                  {goalHistory[0]?.is_current && (
                    <p className="text-xs text-blue-600 mt-1">
                      📅 เป้าหมายปัจจุบันเริ่มใช้: {formatDate(goalHistory[0].start_date)}
                    </p>
                  )}
                  <p className="text-xs text-blue-600 mt-1">
                    💡 ปรับเปลี่ยนจำนวนวัน/สัปดาห์ แล้วกด "บันทึกเป้าหมายรอบใหม่" เพื่อบันทึกเป็นรอบใหม่
                  </p>
                </div>
                
                {goals.length === 0 && (
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

            {/* ✅ Long-term Goals - Radio Button Cards */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-purple-600" />
                เป้าหมายหลัก 4 ประการ (Core Performance Goals)
                <span className="text-sm font-normal text-gray-500 ml-2">- เลือก 1 ข้อที่เป็นเป้าหมายหลักของผู้ป่วย</span>
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {LONG_TERM_GOALS.map((goal) => (
                  <label
                    key={goal.code}
                    className={`relative flex flex-col p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      primaryGoal === goal.code
                        ? 'border-purple-500 bg-purple-50 shadow-md'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-1">
                        {primaryGoal === goal.code ? (
                          <CheckCircle2 className="w-6 h-6 text-purple-600" />
                        ) : (
                          <Circle className="w-6 h-6 text-gray-400" />
                        )}
                      </div>
                      
                      <div className="flex-1">
                        <p className={`font-bold mb-1 ${
                          primaryGoal === goal.code ? 'text-purple-900' : 'text-gray-800'
                        }`}>
                          {goal.name_th}
                        </p>
                        <p className={`text-sm ${
                          primaryGoal === goal.code ? 'text-purple-700' : 'text-gray-600'
                        }`}>
                          {goal.description}
                        </p>
                      </div>
                    </div>
                    
                    <input
                      type="radio"
                      name="primaryGoal"
                      value={goal.code}
                      checked={primaryGoal === goal.code}
                      onChange={(e) => handlePrimaryGoalChange(e.target.value)}
                      disabled={savingPrimaryGoal}
                      className="hidden"
                    />
                  </label>
                ))}
              </div>
              
              {savingPrimaryGoal && (
                <p className="text-sm text-gray-500 mt-3 text-center">
                  กำลังบันทึก...
                </p>
              )}
            </div>

            {/* Food Activities */}
            {foodActivities.length > 0 && (
              <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                  🍚 เป้าหมายรายสัปดาห์ - อาหาร
                </h2>
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
              <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                  🧘 เป้าหมายรายสัปดาห์ - ออกกำลังกาย
                </h2>
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
              <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                  📊 เป้าหมายรายสัปดาห์ - วัดและบันทึก
                </h2>
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
              <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                  🌙 เป้าหมายรายสัปดาห์ - พักผ่อน
                </h2>
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
                      บันทึกเป้าหมายรอบใหม่
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