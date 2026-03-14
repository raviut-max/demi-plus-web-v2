'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, logout, getPatientList, getPatientGoals, createDefaultGoals } from '@/lib/supabase/queries';
import { ArrowLeft, LogOut, Save, Plus, Edit, Trash2, Target, Trophy, Activity } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ✅ กิจกรรมทั้งหมดที่สอดคล้องกับ Mobile App
const ACTIVITY_CODES = {
  // L2/L3 - กฎทอง 5 ข้อ
  GOLDEN_RULES: [
    { code: 'stop_sweet', name_th: 'หยุดกินหวาน', type: 'food', default_days: 5 },
    { code: 'reduce_rice', name_th: 'ลดข้าวลง', type: 'food', default_days: 5 },
    { code: 'protein_vegetable', name_th: 'โปรตีนทุกมื้อ', type: 'food', default_days: 5 },
    { code: 'exercise_walk', name_th: 'เดินทุกวัน', type: 'exercise', default_days: 5, target_value: 15, target_unit: 'minutes' },
    { code: 'record_weight_sugar', name_th: 'บันทึกน้ำหนัก/น้ำตาล', type: 'measurement', default_days: 5 },
  ],
  // L4 - แชมป์ 8 กิจกรรม
  CHAMPION: [
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
  // Long-term Goals
  LONG_TERM: [
    { code: 'weight', name_th: 'น้ำหนัก', type: 'weight' },
    { code: 'glucose', name_th: 'น้ำตาลในเลือด', type: 'glucose' },
    { code: 'medication', name_th: 'การกินยา', type: 'medication' },
    { code: 'remission', name_th: 'ภาวะสงบ', type: 'remission' },
  ],
};

interface Goal {
  id: string;
  user_id: string;
  goal_type: string;
  goal_name: string;
  goal_name_th: string;
  description_th: string | null;
  target_value: number | null;
  target_unit: string | null;
  target_days: number;
  start_date: string;
  status: string;
  priority: number;
  is_core_goal: boolean;
  activity_id: string | null;
}

export default function AdminGoalsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState('');
  const [patientPamLevel, setPatientPamLevel] = useState('');
  const [goals, setGoals] = useState<Goal[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [goalType, setGoalType] = useState<'weekly' | 'long_term'>('weekly');

  const [formData, setFormData] = useState({
    goal_type: 'weekly_activity',
    goal_name: '',
    goal_name_th: '',
    description_th: '',
    target_value: '',
    target_unit: '',
    target_days: 5,
    priority: 1,
    is_core_goal: true,
  });

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

  const loadPatientGoals = async (patientId: string) => {
    try {
      const data = await getPatientGoals(patientId);
      setGoals(data);
      
      // หา PAM Level จากผู้ป่วย
      const patient = patients.find(p => p.id === patientId);
      if (patient) {
        setPatientPamLevel(patient.pam_level || 'L2');
      }
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
    }
  };

  const handleAddGoal = (activityCode?: string, activityName?: string, activityType?: string) => {
    setEditingGoal(null);
    if (activityCode && activityName) {
      setFormData({
        goal_type: 'weekly_activity',
        goal_name: activityCode,
        goal_name_th: activityName || '',
        description_th: '',
        target_value: '',
        target_unit: '',
        target_days: 5,
        priority: 1,
        is_core_goal: true,
      });
    } else {
      setFormData({
        goal_type: goalType === 'weekly' ? 'weekly_activity' : 'weight',
        goal_name: '',
        goal_name_th: '',
        description_th: '',
        target_value: '',
        target_unit: '',
        target_days: 5,
        priority: 1,
        is_core_goal: true,
      });
    }
    setShowModal(true);
  };

  const handleEditGoal = (goal: Goal) => {
    setEditingGoal(goal);
    setFormData({
      goal_type: goal.goal_type,
      goal_name: goal.goal_name,
      goal_name_th: goal.goal_name_th,
      description_th: goal.description_th || '',
      target_value: goal.target_value?.toString() || '',
      target_unit: goal.target_unit || '',
      target_days: goal.target_days || 5,
      priority: goal.priority || 1,
      is_core_goal: goal.is_core_goal || false,
    });
    setShowModal(true);
  };

  const handleDeleteGoal = async (goalId: string) => {
    if (confirm('ยืนยันการลบเป้าหมายนี้?')) {
      try {
        const { error } = await supabase
          .from('goals')
          .update({ status: 'cancelled' })
          .eq('id', goalId);

        if (error) {
          alert('เกิดข้อผิดพลาด: ' + error.message);
          return;
        }

        alert('✅ ลบเป้าหมายสำเร็จ!');
        loadPatientGoals(selectedPatient);
      } catch (error) {
        alert('เกิดข้อผิดพลาดในการลบ');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const goalData: any = {
        user_id: selectedPatient,
        goal_type: formData.goal_type,
        goal_name: formData.goal_name,
        goal_name_th: formData.goal_name_th,
        description: formData.description_th,
        description_th: formData.description_th,
        target_value: formData.target_value ? parseFloat(formData.target_value) : null,
        target_unit: formData.target_unit,
        target_days: formData.target_days,
        start_date: new Date().toISOString().split('T')[0],
        status: 'active',
        priority: formData.priority,
        is_core_goal: formData.is_core_goal,
        created_by: user?.id,
      };

      if (editingGoal) {
        // แก้ไขเป้าหมายเดิม
        const { error } = await supabase
          .from('goals')
          .update(goalData)
          .eq('id', editingGoal.id);

        if (error) {
          alert('เกิดข้อผิดพลาด: ' + error.message);
          return;
        }

        alert('✅ แก้ไขเป้าหมายสำเร็จ!');
      } else {
        // เพิ่มเป้าหมายใหม่
        const { error } = await supabase
          .from('goals')
          .insert(goalData);

        if (error) {
          alert('เกิดข้อผิดพลาด: ' + error.message);
          return;
        }

        alert('✅ เพิ่มเป้าหมายสำเร็จ!');
      }

      setShowModal(false);
      loadPatientGoals(selectedPatient);
    } catch (error) {
      alert('เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setSaving(false);
    }
  };

  const handleRecreateDefaultGoals = async () => {
    if (!selectedPatient || !patientPamLevel) {
      alert('กรุณาเลือกผู้ป่วย');
      return;
    }

    if (confirm('ต้องการสร้างเป้าหมายเริ่มต้นใหม่หรือไม่? (เป้าหมายเดิมจะยังคงอยู่)')) {
      try {
        const result = await createDefaultGoals(selectedPatient, patientPamLevel, user?.id);
        
        if (result.success) {
          alert(`✅ สร้างเป้าหมายสำเร็จ: ${result.count} กิจกรรม`);
          loadPatientGoals(selectedPatient);
        } else {
          alert('เกิดข้อผิดพลาด: ' + result.error);
        }
      } catch (error) {
        alert('เกิดข้อผิดพลาดในการสร้างเป้าหมาย');
      }
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  // แยก goals ตามประเภท
  const weeklyGoals = goals.filter(g => g.goal_type === 'weekly_activity');
  const longTermGoals = goals.filter(g => 
    ['weight', 'glucose', 'medication', 'remission'].includes(g.goal_type)
  );

  // แยก weekly goals ตามประเภทกิจกรรม
  const foodGoals = weeklyGoals.filter(g => {
    const activity = [...ACTIVITY_CODES.GOLDEN_RULES, ...ACTIVITY_CODES.CHAMPION].find(a => a.code === g.goal_name);
    return activity?.type === 'food';
  });
  
  const exerciseGoals = weeklyGoals.filter(g => {
    const activity = [...ACTIVITY_CODES.GOLDEN_RULES, ...ACTIVITY_CODES.CHAMPION].find(a => a.code === g.goal_name);
    return activity?.type === 'exercise';
  });
  
  const measurementGoals = weeklyGoals.filter(g => {
    const activity = [...ACTIVITY_CODES.GOLDEN_RULES, ...ACTIVITY_CODES.CHAMPION].find(a => a.code === g.goal_name);
    return activity?.type === 'measurement';
  });
  
  const restGoals = weeklyGoals.filter(g => {
    const activity = [...ACTIVITY_CODES.GOLDEN_RULES, ...ACTIVITY_CODES.CHAMPION].find(a => a.code === g.goal_name);
    return activity?.type === 'rest';
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
            {selectedPatient && patientPamLevel && (
              <button
                onClick={handleRecreateDefaultGoals}
                className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm"
              >
                <Plus className="w-4 h-4" />
                สร้างเป้าหมายเริ่มต้นใหม่
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

        {selectedPatient && (
          <>
            {/* Long-term Goals */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-yellow-600" />
                  เป้าหมายระยะยาว
                </h2>
                <button
                  onClick={() => {
                    setGoalType('long_term');
                    handleAddGoal();
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  เพิ่มเป้าหมาย
                </button>
              </div>

              {longTermGoals.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {longTermGoals.map((goal) => (
                    <div
                      key={goal.id}
                      className="p-4 rounded-xl border-2 bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-lg font-bold text-gray-800">{goal.goal_name_th}</span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleEditGoal(goal)}
                            className="p-1 text-blue-600 hover:bg-blue-100 rounded"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteGoal(goal.id)}
                            className="p-1 text-red-600 hover:bg-red-100 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600">
                        {goal.target_value && `${goal.target_value} ${goal.target_unit || ''}`}
                      </p>
                      <span className={`inline-block mt-2 px-2 py-1 rounded text-xs font-semibold ${
                        goal.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {goal.status === 'active' ? 'ใช้งาน' : goal.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">ยังไม่มีเป้าหมายระยะยาว</p>
              )}
            </div>

            {/* Weekly Goals - Food */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  🍚 เป้าหมายรายสัปดาห์ - อาหาร
                </h2>
                <button
                  onClick={() => {
                    setGoalType('weekly');
                    handleAddGoal();
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  เพิ่มกิจกรรม
                </button>
              </div>

              {foodGoals.length > 0 ? (
                <div className="space-y-3">
                  {foodGoals.map((goal) => (
                    <div
                      key={goal.id}
                      className="flex items-center justify-between p-4 rounded-xl border border-gray-200 hover:bg-gray-50"
                    >
                      <div className="flex-1">
                        <p className="font-semibold text-gray-800">{goal.goal_name_th}</p>
                        <p className="text-sm text-gray-500">
                          {goal.target_days} วัน/สัปดาห์
                          {goal.target_value && ` | ${goal.target_value} ${goal.target_unit || ''}`}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditGoal(goal)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteGoal(goal.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">ยังไม่มีกิจกรรมอาหาร</p>
              )}
            </div>

            {/* Weekly Goals - Exercise */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  🧘 เป้าหมายรายสัปดาห์ - ออกกำลังกาย
                </h2>
                <button
                  onClick={() => {
                    setGoalType('weekly');
                    handleAddGoal();
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  เพิ่มกิจกรรม
                </button>
              </div>

              {exerciseGoals.length > 0 ? (
                <div className="space-y-3">
                  {exerciseGoals.map((goal) => (
                    <div
                      key={goal.id}
                      className="flex items-center justify-between p-4 rounded-xl border border-gray-200 hover:bg-gray-50"
                    >
                      <div className="flex-1">
                        <p className="font-semibold text-gray-800">{goal.goal_name_th}</p>
                        <p className="text-sm text-gray-500">
                          {goal.target_days} วัน/สัปดาห์
                          {goal.target_value && ` | ${goal.target_value} ${goal.target_unit || ''}`}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditGoal(goal)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteGoal(goal.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">ยังไม่มีกิจกรรมออกกำลังกาย</p>
              )}
            </div>

            {/* Weekly Goals - Measurement */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  📊 เป้าหมายรายสัปดาห์ - วัดและบันทึก
                </h2>
                <button
                  onClick={() => {
                    setGoalType('weekly');
                    handleAddGoal();
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  เพิ่มกิจกรรม
                </button>
              </div>

              {measurementGoals.length > 0 ? (
                <div className="space-y-3">
                  {measurementGoals.map((goal) => (
                    <div
                      key={goal.id}
                      className="flex items-center justify-between p-4 rounded-xl border border-gray-200 hover:bg-gray-50"
                    >
                      <div className="flex-1">
                        <p className="font-semibold text-gray-800">{goal.goal_name_th}</p>
                        <p className="text-sm text-gray-500">
                          {goal.target_days} วัน/สัปดาห์
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditGoal(goal)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteGoal(goal.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">ยังไม่มีกิจกรรมวัดและบันทึก</p>
              )}
            </div>

            {/* Weekly Goals - Rest */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  🌙 เป้าหมายรายสัปดาห์ - พักผ่อน
                </h2>
                <button
                  onClick={() => {
                    setGoalType('weekly');
                    handleAddGoal();
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  เพิ่มกิจกรรม
                </button>
              </div>

              {restGoals.length > 0 ? (
                <div className="space-y-3">
                  {restGoals.map((goal) => (
                    <div
                      key={goal.id}
                      className="flex items-center justify-between p-4 rounded-xl border border-gray-200 hover:bg-gray-50"
                    >
                      <div className="flex-1">
                        <p className="font-semibold text-gray-800">{goal.goal_name_th}</p>
                        <p className="text-sm text-gray-500">
                          {goal.target_days} วัน/สัปดาห์
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditGoal(goal)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteGoal(goal.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">ยังไม่มีกิจกรรมพักผ่อน</p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modal Form */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">
                {editingGoal ? 'แก้ไขเป้าหมาย' : 'เพิ่มเป้าหมายใหม่'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-gray-100 rounded"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ชื่อเป้าหมาย (ภาษาไทย) *
                </label>
                <input
                  type="text"
                  required
                  value={formData.goal_name_th}
                  onChange={(e) => setFormData({...formData, goal_name_th: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="เช่น หยุดกินหวาน"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ชื่อเป้าหมาย (ภาษาอังกฤษ/Code) *
                </label>
                <input
                  type="text"
                  required
                  value={formData.goal_name}
                  onChange={(e) => setFormData({...formData, goal_name: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="เช่น stop_sweet"
                />
                <p className="text-xs text-gray-500 mt-1">ใช้ activity_code จาก Mobile App</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  คำอธิบาย
                </label>
                <textarea
                  value={formData.description_th}
                  onChange={(e) => setFormData({...formData, description_th: e.target.value})}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="อธิบายเป้าหมายเพิ่มเติม"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    จำนวนวัน/สัปดาห์
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="7"
                    value={formData.target_days}
                    onChange={(e) => setFormData({...formData, target_days: parseInt(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ความสำคัญ
                  </label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({...formData, priority: parseInt(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value={1}>สูง (1)</option>
                    <option value={2}>ปานกลาง (2)</option>
                    <option value={3}>ต่ำ (3)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ค่าเป้าหมาย
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.target_value}
                    onChange={(e) => setFormData({...formData, target_value: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    placeholder="เช่น 15"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    หน่วย
                  </label>
                  <input
                    type="text"
                    value={formData.target_unit}
                    onChange={(e) => setFormData({...formData, target_unit: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    placeholder="เช่น minutes, liters"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_core_goal"
                  checked={formData.is_core_goal}
                  onChange={(e) => setFormData({...formData, is_core_goal: e.target.checked})}
                  className="w-4 h-4"
                />
                <label htmlFor="is_core_goal" className="text-sm font-medium text-gray-700">
                  เป้าหมายหลัก (Core Goal)
                </label>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-blue-500 text-white py-3 rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      กำลังบันทึก...
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      บันทึก
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 bg-gray-500 text-white py-3 rounded-lg hover:bg-gray-600"
                >
                  ยกเลิก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}