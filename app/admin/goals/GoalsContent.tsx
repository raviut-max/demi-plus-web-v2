// app/admin/goals/GoalsContent.tsx
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { checkSession, logout, getPatientList } from '@/lib/supabase/queries';
import { ArrowLeft, LogOut, Save, Target, Trophy, History, Calendar } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ✅ Default days ตาม PAM Level
const DEFAULT_DAYS_BY_LEVEL: Record<string, number> = {
  L2: 3,
  L3: 4,
  L4: 5,
};

// ✅ Long-term Goals 4 ข้อ
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

export default function GoalsContent({ user }: { user: any }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
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

  useEffect(() => {
    loadPatients();

    const patientId = searchParams.get('patient_id');
    if (patientId) {
      setSelectedPatient(patientId);
    }
  }, [searchParams]);

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

        // ✅ ดึง activities ตาม PAM Level
        const { data: activitiesData } = await supabase
          .from('activities')
          .select('*')
          .or(`pam_level.eq.${pamLevel},pam_level.eq.ALL`)
          .eq('is_active', true)
          .order('sort_order', { ascending: true });

        setActivities(activitiesData || []);

        // ✅ ดึง goals ปัจจุบัน
        const { data: activeGoals } = await supabase
          .from('goals')
          .select('*')
          .eq('user_id', patientId)
          .eq('goal_type', 'weekly_activity')
          .eq('status', 'active')
          .order('created_at', { ascending: false });

        setGoals(activeGoals || []);

        // ✅ โหลดค่าที่แก้ไขแล้ว
        const edits: Record<string, { target_days: number; target_value?: string }> = {};
        (activeGoals || []).forEach((goal: Goal) => {
          edits[goal.goal_name] = {
            target_days: goal.target_days,
            target_value: goal.target_value?.toString() || '',
          };
        });
        setEditedGoals(edits);

        // ✅ ดึงประวัติ
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

        if (activeGoals && activeGoals.length > 0) {
          const currentStartDate = activeGoals[0].created_at.split('T')[0];
          history.unshift({
            id: 'current',
            goals: activeGoals,
            start_date: currentStartDate,
            is_current: true,
          });
        }

        setGoalHistory(history);
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

    if (confirm('ต้องการบันทึกเป้าหมายรอบใหม่หรือไม่?')) {
      setSaving(true);
      try {
        // ✅ Archive goals เดิม
        if (goals.length > 0) {
          await supabase
            .from('goals')
            .update({ status: 'archived', updated_at: new Date().toISOString() })
            .eq('user_id', selectedPatient)
            .eq('goal_type', 'weekly_activity')
            .eq('status', 'active');
        }

        // ✅ สร้าง goals ใหม่
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
            target_value: activity.target_value ? (edit.target_value ? parseFloat(edit.target_value) : parseFloat(activity.target_value)) : null,
            target_unit: activity.unit || null,
            activity_id: activity.id,
            start_date: today,
            status: 'active',
            priority: 1,
            is_core_goal: true,
            created_by: user?.id,
          };
        });

        const { error } = await supabase.from('goals').insert(newGoals);
        if (error) throw error;

        alert(`✅ บันทึกเป้าหมายรอบใหม่สำเร็จ: ${newGoals.length} กิจกรรม`);
        loadPatientData(selectedPatient);
      } catch (error) {
        console.error('Error:', error);
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
    return new Date(dateString).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  if (loading) {
    return <div className="p-4 text-center text-gray-600">กำลังโหลด...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-100 to-cyan-50">
      {/* Header */}
      <div className="bg-white shadow-lg border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <button onClick={() => router.push('/admin/dashboard')} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-2">
                <ArrowLeft className="w-4 h-4" /> กลับ Dashboard
              </button>
              <h1 className="text-2xl font-bold text-gray-800">จัดการเป้าหมาย</h1>
              <p className="text-sm text-gray-600">กำหนดและจัดการเป้าหมายผู้ป่วย</p>
            </div>
            <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">
              <LogOut className="w-4 h-4" /> ออกจากระบบ
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
              <Target className="w-5 h-5 text-blue-600" /> เลือกผู้ป่วย
            </h2>
            {selectedPatient && goals.length > 0 && (
              <button onClick={() => setShowHistory(!showHistory)} className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg text-sm">
                <History className="w-4 h-4" /> {showHistory ? 'ซ่อนประวัติ' : 'ดูเป้าหมายปัจจุบัน'}
              </button>
            )}
          </div>
          <select value={selectedPatient} onChange={(e) => handlePatientSelect(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg">
            <option value="">-- เลือกผู้ป่วย --</option>
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>{patient.hospital_number} - {patient.full_name} (PAM: {patient.pam_level})</option>
            ))}
          </select>
        </div>

        {selectedPatient && patientPamLevel && (
          <>
            {/* Info Banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
              <p className="text-sm text-blue-800">
                <strong>ระดับผู้ป่วย:</strong> {patientPamLevel} | <strong>จำนวนกิจกรรม:</strong> {activities.length} กิจกรรม
                {patientPamLevel === 'L2' && ' (กฎทอง 5 ข้อ - เริ่มต้น 3 วัน/สัปดาห์)'}
                {patientPamLevel === 'L3' && ' (กฎทอง 5 ข้อ - เริ่มต้น 4 วัน/สัปดาห์)'}
                {patientPamLevel === 'L4' && ' (แชมป์ 8 กิจกรรม - เริ่มต้น 5 วัน/สัปดาห์)'}
              </p>
              {goalHistory[0]?.is_current && (
                <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> เป้าหมายปัจจุบันเริ่มใช้: {formatDate(goalHistory[0].start_date)}
                </p>
              )}
            </div>

            {/* Long-term Goals */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-purple-600" /> เป้าหมายหลัก 4 ประการ
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {LONG_TERM_GOALS.map((goal, index) => (
                  <div key={index} className="p-4 rounded-xl border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50">
                    <p className="font-bold text-gray-800 mb-1">{index + 1}. {goal.name_th}</p>
                    <p className="text-sm text-gray-600">{goal.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Food Activities */}
            {foodActivities.length > 0 && (
              <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
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
                          {activity.description_th && <p className="text-sm text-gray-500 mt-1">{activity.description_th}</p>}
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">วัน/สัปดาห์</label>
                          <select value={currentDays} onChange={(e) => handleUpdateGoal(activity.activity_code, 'target_days', parseInt(e.target.value))} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                            {[1,2,3,4,5,6,7].map(day => <option key={day} value={day}>{day} วัน</option>)}
                          </select>
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
                <h2 className="text-xl font-bold text-gray-800 mb-4">🧘 เป้าหมายรายสัปดาห์ - ออกกำลังกาย</h2>
                <div className="space-y-4">
                  {exerciseActivities.map((activity) => {
                    const defaultDays = DEFAULT_DAYS_BY_LEVEL[patientPamLevel] || 5;
                    const existingGoal = goals.find(g => g.goal_name === activity.activity_code);
                    const currentDays = editedGoals[activity.activity_code]?.target_days || existingGoal?.target_days || defaultDays;
                    const isWalking = activity.activity_code === 'exercise_walk';
                    return (
                      <div key={activity.id} className="flex items-center justify-between p-4 rounded-xl border border-gray-200">
                        <div className="flex-1">
                          <p className="font-semibold text-gray-800">{activity.activity_name_th}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          {isWalking && activity.target_value && (
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">นาที/วัน</label>
                              <input type="number" min="5" max="120" step="5" value={editedGoals[activity.activity_code]?.target_value || existingGoal?.target_value?.toString() || activity.target_value} onChange={(e) => handleUpdateGoal(activity.activity_code, 'target_value', e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-24" />
                            </div>
                          )}
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">วัน/สัปดาห์</label>
                            <select value={currentDays} onChange={(e) => handleUpdateGoal(activity.activity_code, 'target_days', parseInt(e.target.value))} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                              {[1,2,3,4,5,6,7].map(day => <option key={day} value={day}>{day} วัน</option>)}
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
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">วัน/สัปดาห์</label>
                          <select value={currentDays} onChange={(e) => handleUpdateGoal(activity.activity_code, 'target_days', parseInt(e.target.value))} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                            {[1,2,3,4,5,6,7].map(day => <option key={day} value={day}>{day} วัน</option>)}
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
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">วัน/สัปดาห์</label>
                          <select value={currentDays} onChange={(e) => handleUpdateGoal(activity.activity_code, 'target_days', parseInt(e.target.value))} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                            {[1,2,3,4,5,6,7].map(day => <option key={day} value={day}>{day} วัน</option>)}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Goal History */}
            {showHistory && (
              <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2"><History className="w-5 h-5 text-purple-600" /> ประวัติเป้าหมาย</h2>
                  <button onClick={() => setShowHistory(false)} className="text-gray-500">✕</button>
                </div>
                <div className="space-y-4">
                  {goalHistory.map((history, index) => (
                    <div key={history.id} className={`p-4 rounded-xl border-2 ${history.is_current ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="font-semibold text-gray-800">{history.is_current ? '📌 เป้าหมายปัจจุบัน' : `รอบที่ ${index}`}</p>
                          <p className="text-sm text-gray-500">เริ่มใช้: {formatDate(history.start_date)}</p>
                        </div>
                        {history.is_current && <span className="px-3 py-1 bg-green-500 text-white text-xs font-semibold rounded-full">ใช้งานอยู่</span>}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3">
                        {history.goals.map((goal) => (
                          <div key={goal.id} className="text-sm">
                            <p className="font-medium text-gray-700">{goal.goal_name_th}</p>
                            <p className="text-xs text-gray-500">{goal.target_days} วัน/สัปดาห์</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Save Button */}
            <div className="flex gap-4">
              <button onClick={handleSaveNewRound} disabled={saving || activities.length === 0} className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold py-4 rounded-xl hover:from-green-600 hover:to-emerald-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> กำลังบันทึก...</> : <><Save className="w-5 h-5" /> บันทึกเป้าหมายรอบใหม่</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}