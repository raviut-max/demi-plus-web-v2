'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { checkSession, logout, getPatientList, getPatientGoals } from '@/lib/supabase/queries';
import { ArrowLeft, LogOut, Save, Target, History } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ✅ กิจกรรมคงที่ตาม PAM Level (ไม่สามารถเพิ่ม/ลบได้)
const FIXED_GOALS = {
  L2: [
    { code: 'stop_sweet', name_th: 'หยุดกินหวาน', type: 'food', default_days: 3 },
    { code: 'reduce_rice', name_th: 'ลดข้าวลง', type: 'food', default_days: 3 },
    { code: 'protein_vegetable', name_th: 'โปรตีนทุกมื้อ', type: 'food', default_days: 3 },
    { code: 'exercise_walk', name_th: 'เดินทุกวัน', type: 'exercise', default_days: 3, target_value: 15, target_unit: 'minutes' },
    { code: 'record_weight_sugar', name_th: 'บันทึกน้ำหนัก/น้ำตาล', type: 'measurement', default_days: 3 },
  ],
  L3: [
    { code: 'stop_sweet', name_th: 'หยุดกินหวาน', type: 'food', default_days: 4 },
    { code: 'reduce_rice', name_th: 'ลดข้าวลง', type: 'food', default_days: 4 },
    { code: 'protein_vegetable', name_th: 'โปรตีนทุกมื้อ', type: 'food', default_days: 4 },
    { code: 'exercise_walk', name_th: 'เดินทุกวัน', type: 'exercise', default_days: 4, target_value: 15, target_unit: 'minutes' },
    { code: 'record_weight_sugar', name_th: 'บันทึกน้ำหนัก/น้ำตาล', type: 'measurement', default_days: 4 },
  ],
  L4: [
    // อาหาร (3)
    { code: 'carb_control', name_th: 'กินคาร์บ <5 คาร์บ/วัน', type: 'food', default_days: 5 },
    { code: 'protein_intake', name_th: 'กินโปรตีน >3 หน่วย', type: 'food', default_days: 5 },
    { code: 'water_intake', name_th: 'ดื่มน้ำ >1 ลิตร', type: 'food', default_days: 5, target_value: 1, target_unit: 'liters' },
    // ออกกำลังกาย (4)
    { code: 'stretching', name_th: 'Stretching', type: 'exercise', default_days: 5 },
    { code: 'cardio', name_th: 'Cardio', type: 'exercise', default_days: 5 },
    { code: 'strengthening', name_th: 'Strengthening', type: 'exercise', default_days: 5 },
    { code: 'hiit', name_th: 'HIIT', type: 'exercise', default_days: 5 },
    // พักผ่อน (1)
    { code: 'sleep', name_th: 'นอนหลับเพียงพอ', type: 'rest', default_days: 5 },
  ],
};

// ✅ Long-term Goals 4 ข้อ (Core Performance Goals)
const LONG_TERM_GOALS = [
  { code: 'weight', name_th: 'น้ำหนักลด (Weight Reduction)', description: 'ลดลงอย่างน้อย 5-10% และลด Visceral Fat' },
  { code: 'glucose', name_th: 'น้ำตาลลง (Glucose Control)', description: 'ควบคุมระดับน้ำตาลในเลือดให้เข้าสู่เกณฑ์ปกติ' },
  { code: 'medication', name_th: 'ลดยาได้ (Medication De-escalation)', description: 'ปรับลดหรือหยุดยาภายใต้การกำกับของแพทย์' },
  { code: 'remission', name_th: 'ภาวะเบาหวานสงบ (Remission)', description: 'บรรลุ HbA1c < 6.5% โดยไม่ต้องใช้ยาต่อเนื่อง' },
];

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
  created_at: string;
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
  const [goals, setGoals] = useState<Goal[]>([]);
  const [editedGoals, setEditedGoals] = useState<Record<string, { target_days: number; target_value?: string }>>({});

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
    loadPatients();

    const patientId = searchParams.get('patient_id');
    if (patientId) {
      setSelectedPatient(patientId);
    }
  }, [router, searchParams]);

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

  const loadPatientGoals = async (patientId: string) => {
    try {
      const data = await getPatientGoals(patientId);
      
      const patient = patients.find(p => p.id === patientId);
      if (patient) {
        setPatientPamLevel(patient.pam_level || 'L2');
      }

      setGoals(data);

      const edits: Record<string, { target_days: number; target_value?: string }> = {};
      data.forEach((goal: Goal) => {
        edits[goal.goal_name] = {
          target_days: goal.target_days || 5,
          target_value: goal.target_value?.toString() || '',
        };
      });
      setEditedGoals(edits);
    } catch (error) {
      console.error('Error loading goals:', error);
    }
  };

  const handlePatientSelect = (patientId: string) => {
    setSelectedPatient(patientId);
    if (patientId) {
      loadPatientGoals(patientId);
    } else {
      setGoals([]);
      setPatientPamLevel('');
      setEditedGoals({});
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
    if (!selectedPatient) {
      alert('กรุณาเลือกผู้ป่วย');
      return;
    }

    if (confirm('ต้องการบันทึกกิจกรรมรอบใหม่หรือไม่?\n\nระบบจะเก็บเป้าหมายเดิมเป็นประวัติ และสร้างเป้าหมายใหม่แทน')) {
      setSaving(true);

      try {
        // ✅ 1. เก็บ goals เดิมเป็นประวัติ (เปลี่ยน status เป็น 'archived')
        if (goals.length > 0) {
          await supabase
            .from('goals')
            .update({ 
              status: 'archived',
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', selectedPatient)
            .eq('goal_type', 'weekly_activity')
            .eq('status', 'active');
        }

        // ✅ 2. สร้าง goals ใหม่จากที่แก้ไข
        const fixedGoals = FIXED_GOALS[patientPamLevel as keyof typeof FIXED_GOALS] || [];
        const today = new Date().toISOString().split('T')[0];

        const newGoals = fixedGoals.map(goal => {
          const edit = editedGoals[goal.code] || { target_days: goal.default_days };
          
          return {
            user_id: selectedPatient,
            goal_type: 'weekly_activity' as const,
            goal_name: goal.code,
            goal_name_th: goal.name_th,
            target_days: edit.target_days,
            target_value: goal.target_value !== undefined ? (edit.target_value ? parseFloat(edit.target_value) : goal.target_value) : null,
            target_unit: goal.target_unit || null,
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

        alert(`✅ บันทึกกิจกรรมรอบใหม่สำเร็จ: ${newGoals.length} กิจกรรม\n\nเป้าหมายเดิมถูกเก็บเป็นประวัติแล้ว`);
        loadPatientGoals(selectedPatient);
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

  // ✅ แยก goals ตามประเภท (ไม่มี Rest สำหรับ L2/L3)
  const foodGoals = goals.filter(g => {
    const allGoals = FIXED_GOALS[patientPamLevel as keyof typeof FIXED_GOALS] || [];
    const goal = allGoals.find(a => a.code === g.goal_name);
    return goal?.type === 'food';
  });

  const exerciseGoals = goals.filter(g => {
    const allGoals = FIXED_GOALS[patientPamLevel as keyof typeof FIXED_GOALS] || [];
    const goal = allGoals.find(a => a.code === g.goal_name);
    return goal?.type === 'exercise';
  });

  const measurementGoals = goals.filter(g => {
    const allGoals = FIXED_GOALS[patientPamLevel as keyof typeof FIXED_GOALS] || [];
    const goal = allGoals.find(a => a.code === g.goal_name);
    return goal?.type === 'measurement';
  });

  const restGoals = goals.filter(g => {
    const allGoals = FIXED_GOALS[patientPamLevel as keyof typeof FIXED_GOALS] || [];
    const goal = allGoals.find(a => a.code === g.goal_name);
    return goal?.type === 'rest';
  });

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
              <p className="text-sm text-blue-800">
                <strong>ระดับผู้ป่วย:</strong> {patientPamLevel} | 
                <strong> จำนวนเป้าหมาย:</strong> {goals.length} กิจกรรม
                {patientPamLevel === 'L2' && ' (กฎทอง 5 ข้อ - เริ่มต้น 3 วัน/สัปดาห์)'}
                {patientPamLevel === 'L3' && ' (กฎทอง 5 ข้อ - เริ่มต้น 4 วัน/สัปดาห์)'}
                {patientPamLevel === 'L4' && ' (แชมป์ 8 กิจกรรม - เริ่มต้น 5 วัน/สัปดาห์)'}
              </p>
              <p className="text-xs text-blue-600 mt-1">
                💡 ปรับเปลี่ยนจำนวนวัน/สัปดาห์ แล้วกด "บันทึกกิจกรรมรอบใหม่" เพื่อบันทึกเป็นรอบใหม่
              </p>
            </div>

            {/* Long-term Goals (Core Performance Goals) */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <History className="w-5 h-5 text-purple-600" />
                เป้าหมายหลัก 4 ประการ (Core Performance Goals)
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

            {/* Food Goals */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                🍚 เป้าหมายรายสัปดาห์ - อาหาร
              </h2>

              {foodGoals.length > 0 ? (
                <div className="space-y-4">
                  {foodGoals.map((goal) => (
                    <div key={goal.id} className="flex items-center justify-between p-4 rounded-xl border border-gray-200">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-800">{goal.goal_name_th}</p>
                        <p className="text-sm text-gray-500">
                          ค่าเริ่มต้น: {FIXED_GOALS[patientPamLevel as keyof typeof FIXED_GOALS]?.find(g => g.code === goal.goal_name)?.default_days} วัน/สัปดาห์
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">วัน/สัปดาห์</label>
                          <select
                            value={editedGoals[goal.goal_name]?.target_days || FIXED_GOALS[patientPamLevel as keyof typeof FIXED_GOALS]?.find(g => g.code === goal.goal_name)?.default_days || 5}
                            onChange={(e) => handleUpdateGoal(goal.goal_name, 'target_days', parseInt(e.target.value))}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          >
                            {[1, 2, 3, 4, 5, 6, 7].map(day => (
                              <option key={day} value={day}>{day} วัน</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">ยังไม่มีกิจกรรมอาหาร</p>
              )}
            </div>

            {/* Exercise Goals */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                🧘 เป้าหมายรายสัปดาห์ - ออกกำลังกาย
              </h2>

              {exerciseGoals.length > 0 ? (
                <div className="space-y-4">
                  {exerciseGoals.map((goal) => {
                    const fixedGoal = FIXED_GOALS[patientPamLevel as keyof typeof FIXED_GOALS]?.find(g => g.code === goal.goal_name);
                    const isWalking = goal.goal_name === 'exercise_walk';

                    return (
                      <div key={goal.id} className="flex items-center justify-between p-4 rounded-xl border border-gray-200">
                        <div className="flex-1">
                          <p className="font-semibold text-gray-800">{goal.goal_name_th}</p>
                          <p className="text-sm text-gray-500">ค่าเริ่มต้น: {fixedGoal?.default_days} วัน/สัปดาห์</p>
                        </div>
                        <div className="flex items-center gap-4">
                          {isWalking && (
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">นาที/วัน</label>
                              <input
                                type="number"
                                min="5"
                                max="120"
                                step="5"
                                value={editedGoals[goal.goal_name]?.target_value || fixedGoal?.target_value?.toString() || '15'}
                                onChange={(e) => handleUpdateGoal(goal.goal_name, 'target_value', e.target.value)}
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-24"
                              />
                            </div>
                          )}
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">วัน/สัปดาห์</label>
                            <select
                              value={editedGoals[goal.goal_name]?.target_days || fixedGoal?.default_days || 5}
                              onChange={(e) => handleUpdateGoal(goal.goal_name, 'target_days', parseInt(e.target.value))}
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
              ) : (
                <p className="text-gray-500 text-center py-4">ยังไม่มีกิจกรรมออกกำลังกาย</p>
              )}
            </div>

            {/* Measurement Goals */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                📊 เป้าหมายรายสัปดาห์ - วัดและบันทึก
              </h2>

              {measurementGoals.length > 0 ? (
                <div className="space-y-4">
                  {measurementGoals.map((goal) => (
                    <div key={goal.id} className="flex items-center justify-between p-4 rounded-xl border border-gray-200">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-800">{goal.goal_name_th}</p>
                        <p className="text-sm text-gray-500">
                          ค่าเริ่มต้น: {FIXED_GOALS[patientPamLevel as keyof typeof FIXED_GOALS]?.find(g => g.code === goal.goal_name)?.default_days} วัน/สัปดาห์
                        </p>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">วัน/สัปดาห์</label>
                        <select
                          value={editedGoals[goal.goal_name]?.target_days || FIXED_GOALS[patientPamLevel as keyof typeof FIXED_GOALS]?.find(g => g.code === goal.goal_name)?.default_days || 5}
                          onChange={(e) => handleUpdateGoal(goal.goal_name, 'target_days', parseInt(e.target.value))}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                          {[1, 2, 3, 4, 5, 6, 7].map(day => (
                            <option key={day} value={day}>{day} วัน</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">ยังไม่มีกิจกรรมวัดและบันทึก</p>
              )}
            </div>

            {/* Rest Goals (เฉพาะ L4) */}
            {patientPamLevel === 'L4' && restGoals.length > 0 && (
              <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                  🌙 เป้าหมายรายสัปดาห์ - พักผ่อน
                </h2>

                <div className="space-y-4">
                  {restGoals.map((goal) => (
                    <div key={goal.id} className="flex items-center justify-between p-4 rounded-xl border border-gray-200">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-800">{goal.goal_name_th}</p>
                        <p className="text-sm text-gray-500">
                          ค่าเริ่มต้น: {FIXED_GOALS[patientPamLevel as keyof typeof FIXED_GOALS]?.find(g => g.code === goal.goal_name)?.default_days} วัน/สัปดาห์
                        </p>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">วัน/สัปดาห์</label>
                        <select
                          value={editedGoals[goal.goal_name]?.target_days || FIXED_GOALS[patientPamLevel as keyof typeof FIXED_GOALS]?.find(g => g.code === goal.goal_name)?.default_days || 5}
                          onChange={(e) => handleUpdateGoal(goal.goal_name, 'target_days', parseInt(e.target.value))}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                          {[1, 2, 3, 4, 5, 6, 7].map(day => (
                            <option key={day} value={day}>{day} วัน</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Save Button */}
            <div className="flex gap-4">
              <button
                onClick={handleSaveNewRound}
                disabled={saving || goals.length === 0}
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
                    บันทึกกิจกรรมรอบใหม่
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}