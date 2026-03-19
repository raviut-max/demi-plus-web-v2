'use client';

import { useEffect, useState, Suspense } from 'react';
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

// ✅ คอมโพเนนต์หลักที่ต้องใช้ Suspense
function GoalsContent() {
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

  // ✅ ย้าย checkSession() เข้า useEffect (รันเฉพาะฝั่งลูกค้า)
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

  // ✅ ส่วน JSX เหมือนเดิม (ย่อเพื่อประหยัดพื้นที่)
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-100 to-cyan-50">
      {/* Header */}
      <div className="bg-white shadow-lg border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <button onClick={() => router.push('/admin/dashboard')} className="flex items-center gap-2 text-gray-600">
                <ArrowLeft className="w-4 h-4" /> กลับ Dashboard
              </button>
              <h1 className="text-2xl font-bold text-gray-800">จัดการเป้าหมาย</h1>
            </div>
            <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg">
              <LogOut className="w-4 h-4" /> ออกจากระบบ
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Select Patient */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
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
              </p>
            </div>

            {/* Long-term Goals */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4">🎯 เป้าหมายหลัก 4 ประการ</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {LONG_TERM_GOALS.map((goal, index) => (
                  <div key={index} className="p-4 rounded-xl border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50">
                    <p className="font-bold text-gray-800">{index + 1}. {goal.name_th}</p>
                    <p className="text-sm text-gray-600">{goal.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Food/Exercise/Measurement/Rest Activities */}
            {/* ... (โค้ดส่วนนี้เหมือนเดิม) ... */}

            {/* Save Button */}
            <button onClick={handleSaveNewRound} disabled={saving || activities.length === 0} className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold py-4 rounded-xl">
              {saving ? 'กำลังบันทึก...' : 'บันทึกเป้าหมายรอบใหม่'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ✅ หน้าหลักที่หุ้มด้วย Suspense
export default function AdminGoalsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-sky-100 to-cyan-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    }>
      <GoalsContent />
    </Suspense>
  );
}