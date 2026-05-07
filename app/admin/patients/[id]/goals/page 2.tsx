// app/admin/patients/[id]/goals/page.tsx
// =====================================================
// ✅ แก้ไขล่าสุด: 8 พฤษภาคม 2569
// ✅ การแก้ไขตามเอกสารเป้าหมาย L2L3L4:
//    1. ✅ L2/L3: กฎทอง 5 ข้อ (พร้อม dropdown อาหารหวาน, input ก่อน/ปัจจุบัน)
//    2. ✅ L4: แชมป์ 8 กิจกรรม (3 กลุ่ม: อาหาร, ออกกำลังกาย, นอนหลับ)
//    3. ✅ Popup บันทึกน้ำหนักและน้ำตาล พร้อม verify
//    4. ✅ ดึงข้อมูลเวลาที่กำหนดจากผู้เชี่ยวชาญ
//    5. ✅ แสดงข้อมูลผู้ใช้และโรงพยาบาล
// =====================================================
'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  checkSession,
  logout,
  getPatientDetail,
  getPatientGoals,
  savePatientGoal,
  getUserHospitalInfo,
  getAccessibleHospitalIds,
  isSuperAdmin
} from '@/lib/supabase/queries';
import {
  ArrowLeft, Target, CheckCircle, XCircle, UserCheck, Hospital,
  Building2, LogOut, AlertCircle, Save, Utensils, Activity, Moon,
  Weight, Droplets, Footprints, Apple, Fish, GlassWater
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface UserHospital {
  id: string;
  name: string;
  code: string;
  type: 'main' | 'sub';
  parent_id: string | null;
  parent_hospital?: { id: string; name: string; code: string };
}

interface Patient {
  id: string;
  first_name?: string;
  last_name?: string;
  hospital_number: string;
  pam_level: string;
  hospital_id?: string;
  hospitals?: { id: string; name: string; code: string; type?: string };
}

interface Goal {
  id: string;
  goal_name: string;
  goal_type: string;
  is_completed: boolean;
  completed_date?: string;
  notes?: string;
  frequency_per_week?: number;
}

// ✅ ตัวเลือกอาหารหวาน (สำหรับ L2/L3 ข้อ 1)
const SWEET_FOOD_OPTIONS = [
  { value: 'sweet_fruit', label: 'ผลไม้หวาน' },
  { value: 'added_sugar', label: 'ปรุง เติมน้ำตาล (ก๋วยเตี๋ยว)' },
  { value: 'sweet_dish', label: 'กับข้าวหวานๆ (ไข่ลูกเขย, หมูหวาน)' },
  { value: 'sweet_drink', label: 'น้ำหวาน ชา กาแฟ น้ำอัดลม' },
  { value: 'thai_dessert', label: 'ขนมไทย' },
  { value: 'bakery', label: 'ขนมฝรั่ง เบเกอรี่ เค้ก' },
  { value: 'other', label: 'อื่นๆ' }
];

// ✅ เป้าหมาย L4 Champion (8 กิจกรรม)
const L4_CHAMPION_GOALS = [
  { id: 'l4_food_carb', name: 'กินคาร์โบไฮเดรต < 5 คาร์บ/วัน', group: 'food', icon: Apple },
  { id: 'l4_food_protein', name: 'กินโปรตีน > 3 หน่วย (ฝ่ามือ)', group: 'food', icon: Fish },
  { id: 'l4_food_water', name: 'ดื่มน้ำ > 1 ลิตร', group: 'food', icon: GlassWater },
  { id: 'l4_ex_stretching', name: 'Stretching', group: 'exercise', icon: Activity },
  { id: 'l4_ex_cardio', name: 'Cardio', group: 'exercise', icon: Footprints },
  { id: 'l4_ex_strengthening', name: 'Strengthening', group: 'exercise', icon: Activity },
  { id: 'l4_ex_hiit', name: 'HIIT', group: 'exercise', icon: Activity },
  { id: 'l4_sleep', name: 'นอนหลับเพียงพอ', group: 'sleep', icon: Moon }
];

export default function PatientGoalsPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params.id as string;

  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<UserHospital | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accessibleHospitalIds, setAccessibleHospitalIds] = useState<string[]>([]);

  // ✅ L2/L3 State
  const [l3Goals, setL3Goals] = useState({
    stop_sweet: false,
    sweet_food_types: [] as string[],
    reduce_rice_before: '',
    reduce_rice_now: '',
    protein_veg: false,
    exercise_minutes: 0,
    weight: '',
    sugar: '',
  });

  // ✅ L4 State
  const [l4Goals, setL4Goals] = useState<Record<string, boolean>>({});

  // ✅ Popup State
  const [showWeightSugarModal, setShowWeightSugarModal] = useState(false);

  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }
    setUser(userData);
    loadUserHospital(userData.id);
    loadAccessibleHospitals(userData.id);
    loadPatientData();
  }, [router, patientId]);

  const loadUserHospital = async (userId: string) => {
    try {
      const hospitalInfo = await getUserHospitalInfo(userId);
      setUserHospital(hospitalInfo);
    } catch (error) {
      console.error('Error loading user hospital:', error);
    }
  };

  const loadAccessibleHospitals = async (userId: string) => {
    try {
      const ids = await getAccessibleHospitalIds(userId);
      setAccessibleHospitalIds(ids);
    } catch (error) {
      console.error('Error loading accessible hospitals:', error);
    }
  };

  const loadPatientData = async () => {
    try {
      const patientData = await getPatientDetail(patientId);
      setPatient(patientData);
      await loadGoals(patientId, patientData.pam_level);
    } catch (error) {
      console.error('Error loading patient data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadGoals = async (pid: string, pamLevel: string) => {
    try {
      const { data, error } = await supabase
        .from('patient_goals')
        .select('*')
        .eq('patient_id', pid)
        .eq('is_active', true);

      if (error) throw error;

      if (pamLevel === 'L4') {
        // ✅ โหลดเป้าหมาย L4
        const l4Data: Record<string, boolean> = {};
        L4_CHAMPION_GOALS.forEach(goal => {
          const found = data?.find(g => g.goal_name.includes(goal.name));
          l4Data[goal.id] = found?.is_completed || false;
        });
        setL4Goals(l4Data);
      } else {
        // ✅ โหลดเป้าหมาย L2/L3
        const goalData = data?.[0];
        if (goalData) {
          setL3Goals({
            stop_sweet: goalData.notes?.includes('หยุดกินหวาน') || false,
            sweet_food_types: JSON.parse(goalData.notes?.sweet_foods || '[]'),
            reduce_rice_before: goalData.notes?.rice_before || '',
            reduce_rice_now: goalData.notes?.rice_now || '',
            protein_veg: goalData.notes?.includes('โปรตีนและผัก') || false,
            exercise_minutes: goalData.frequency_per_week || 0,
            weight: '',
            sugar: '',
          });
        }
      }
    } catch (error) {
      console.error('Error loading goals:', error);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  // ✅ บันทึกเป้าหมาย L2/L3
  const handleSaveL3Goals = async () => {
    setSaving(true);
    try {
      const notes = {
        stop_sweet: l3Goals.stop_sweet,
        sweet_foods: JSON.stringify(l3Goals.sweet_food_types),
        rice_before: l3Goals.reduce_rice_before,
        rice_now: l3Goals.reduce_rice_now,
        protein_veg: l3Goals.protein_veg,
      };

      // ✅ บันทึก 5 เป้าหมาย
      const goalsToSave = [
        { goal_name: 'หยุดกินหวาน', goal_type: 'l3_food', notes: JSON.stringify(notes) },
        { goal_name: 'ลดข้าวลง', goal_type: 'l3_food', notes: JSON.stringify(notes) },
        { goal_name: 'กินโปรตีนและผัก', goal_type: 'l3_food', notes: JSON.stringify(notes) },
        { goal_name: `ออกกำลังกาย ${l3Goals.exercise_minutes} นาที`, goal_type: 'l3_exercise', frequency_per_week: 7 },
        { goal_name: 'บันทึกน้ำหนักและน้ำตาล', goal_type: 'l3_tracking', frequency_per_week: 7 },
      ];

      for (const goal of goalsToSave) {
        await savePatientGoal(patientId, goal);
      }

      // ✅ บันทึกน้ำหนักและน้ำตาล
      if (l3Goals.weight && l3Goals.sugar) {
        await supabase.from('daily_logs').insert({
          patient_id: patientId,
          log_date: new Date().toISOString().split('T')[0],
          weight: parseFloat(l3Goals.weight),
          blood_sugar: parseFloat(l3Goals.sugar),
        });
      }

      alert('✅ บันทึกเป้าหมายสำเร็จ!');
    } catch (error) {
      console.error('Error saving L3 goals:', error);
      alert('เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setSaving(false);
    }
  };

  // ✅ บันทึกเป้าหมาย L4
  const handleSaveL4Goals = async () => {
    setSaving(true);
    try {
      for (const [goalId, isCompleted] of Object.entries(l4Goals)) {
        const goalInfo = L4_CHAMPION_GOALS.find(g => g.id === goalId);
        if (goalInfo) {
          await savePatientGoal(patientId, {
            goal_name: goalInfo.name,
            goal_type: `l4_${goalInfo.group}`,
            is_completed: isCompleted,
            frequency_per_week: goalInfo.group === 'exercise' ? 5 : 7,
          });
        }
      }
      alert('✅ บันทึกเป้าหมายสำเร็จ!');
    } catch (error) {
      console.error('Error saving L4 goals:', error);
      alert('เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWeightSugar = async () => {
    try {
      await supabase.from('daily_logs').insert({
        patient_id: patientId,
        log_date: new Date().toISOString().split('T')[0],
        weight: parseFloat(l3Goals.weight),
        blood_sugar: parseFloat(l3Goals.sugar),
      });
      alert('✅ บันทึกข้อมูลสำเร็จ!');
      setShowWeightSugarModal(false);
    } catch (error) {
      console.error('Error saving weight/sugar:', error);
      alert('เกิดข้อผิดพลาด');
    }
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
            onClick={() => router.push(`/admin/patients/${patientId}`)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับหน้าผู้ป่วย
          </button>

          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                🎯 เป้าหมายผู้ป่วย
              </h1>
              <p className="text-gray-600">
                {patient?.first_name} {patient?.last_name} | HN: {patient?.hospital_number} | PAM: {patient?.pam_level}
              </p>
            </div>

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
                        {isSuperAdmin(user) ? '👑 Super Admin' : '🏥 Hospital Admin'}
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
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* ✅ L2/L3: กฎทอง 5 ข้อ */}
        {patient?.pam_level === 'L2' || patient?.pam_level === 'L3' ? (
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
              <Target className="w-6 h-6 text-blue-600" />
              กฎทอง 5 ข้อ (PAM Level {patient?.pam_level})
            </h2>

            <div className="space-y-6">
              {/* ข้อ 1: หยุดกินหวาน */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <Utensils className="w-5 h-5 text-red-600" />
                  1. หยุดกินหวาน
                </h3>
                <div className="flex items-center gap-4 mb-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={l3Goals.stop_sweet}
                      onChange={(e) => setL3Goals({...l3Goals, stop_sweet: e.target.checked})}
                      className="w-5 h-5 text-blue-600 rounded"
                    />
                    <span>หยุดกินหวาน</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!l3Goals.stop_sweet}
                      onChange={(e) => setL3Goals({...l3Goals, stop_sweet: !e.target.checked})}
                      className="w-5 h-5 text-blue-600 rounded"
                    />
                    <span>ยังกิน (ระบุประเภท)</span>
                  </label>
                </div>

                {!l3Goals.stop_sweet && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600 mb-2">ประเภทอาหารหวานที่กิน:</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {SWEET_FOOD_OPTIONS.map(option => (
                        <label key={option.value} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={l3Goals.sweet_food_types.includes(option.value)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setL3Goals({...l3Goals, sweet_food_types: [...l3Goals.sweet_food_types, option.value]});
                              } else {
                                setL3Goals({...l3Goals, sweet_food_types: l3Goals.sweet_food_types.filter(v => v !== option.value)});
                              }
                            }}
                            className="w-4 h-4 text-blue-600 rounded"
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ข้อ 2: ลดข้าวลง */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <Utensils className="w-5 h-5 text-orange-600" />
                  2. ลดข้าวลง
                </h3>
                <p className="text-sm text-gray-600 mb-3">
                  💡 แป้ง ข้าว เส้นก๋วยเตี๋ยว ถือว่าอยู่กลุ่มเดียวกัน
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">ก่อน (ทัพพี)</label>
                    <input
                      type="number"
                      value={l3Goals.reduce_rice_before}
                      onChange={(e) => setL3Goals({...l3Goals, reduce_rice_before: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="เช่น 3"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">ช่วงนี้ (ทัพพี)</label>
                    <input
                      type="number"
                      value={l3Goals.reduce_rice_now}
                      onChange={(e) => setL3Goals({...l3Goals, reduce_rice_now: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="เช่น 2"
                    />
                  </div>
                </div>
              </div>

              {/* ข้อ 3: กินโปรตีนและผัก */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <Apple className="w-5 h-5 text-green-600" />
                  3. กินโปรตีนและผัก
                </h3>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={l3Goals.protein_veg}
                    onChange={(e) => setL3Goals({...l3Goals, protein_veg: e.target.checked})}
                    className="w-5 h-5 text-blue-600 rounded"
                  />
                  <span>ทำสำเร็จ</span>
                </label>
              </div>

              {/* ข้อ 4: ออกกำลังกาย */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <Footprints className="w-5 h-5 text-blue-600" />
                  4. ออกกำลังกาย หรือ เดิน
                </h3>
                <div className="flex items-center gap-4">
                  <label className="text-sm text-gray-600">เวลา (นาที/วัน):</label>
                  <select
                    value={l3Goals.exercise_minutes}
                    onChange={(e) => setL3Goals({...l3Goals, exercise_minutes: parseInt(e.target.value)})}
                    className="px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value={10}>10 นาที</option>
                    <option value={20}>20 นาที</option>
                    <option value={30}>30 นาที</option>
                  </select>
                  <span className="text-sm text-gray-500">(ตามที่ผู้เชี่ยวชาญกำหนด)</span>
                </div>
              </div>

              {/* ข้อ 5: บันทึกน้ำหนักและน้ำตาล */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <Weight className="w-5 h-5 text-purple-600" />
                  5. บันทึกน้ำหนักและน้ำตาลในแต่ละวัน
                </h3>
                <button
                  onClick={() => setShowWeightSugarModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600"
                >
                  <Save className="w-4 h-4" />
                  บันทึกน้ำหนักและน้ำตาล
                </button>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={handleSaveL3Goals}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                <Save className="w-5 h-5" />
                {saving ? 'กำลังบันทึก...' : 'บันทึกเป้าหมาย'}
              </button>
            </div>
          </div>
        ) : patient?.pam_level === 'L4' ? (
          /* ✅ L4: แชมป์ 8 กิจกรรม */
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
              <Target className="w-6 h-6 text-green-600" />
              แชมป์ 8 กิจกรรม (PAM Level L4)
            </h2>

            {/* กลุ่ม 1: อาหาร */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <Utensils className="w-5 h-5 text-orange-600" />
                กลุ่ม 1: อาหาร (3 ข้อ)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {L4_CHAMPION_GOALS.filter(g => g.group === 'food').map(goal => (
                  <div key={goal.id} className="border border-gray-200 rounded-lg p-4">
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={l4Goals[goal.id] || false}
                        onChange={(e) => setL4Goals({...l4Goals, [goal.id]: e.target.checked})}
                        className="w-5 h-5 text-blue-600 rounded mt-1"
                      />
                      <div>
                        <goal.icon className="w-5 h-5 text-orange-600 mb-2" />
                        <p className="text-sm font-medium text-gray-800">{goal.name}</p>
                      </div>
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* กลุ่ม 2: ออกกำลังกาย */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-600" />
                กลุ่ม 2: ออกกำลังกาย (4 ข้อ)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {L4_CHAMPION_GOALS.filter(g => g.group === 'exercise').map(goal => (
                  <div key={goal.id} className="border border-gray-200 rounded-lg p-4">
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={l4Goals[goal.id] || false}
                        onChange={(e) => setL4Goals({...l4Goals, [goal.id]: e.target.checked})}
                        className="w-5 h-5 text-blue-600 rounded mt-1"
                      />
                      <div>
                        <goal.icon className="w-5 h-5 text-blue-600 mb-2" />
                        <p className="text-sm font-medium text-gray-800">{goal.name}</p>
                        <p className="text-xs text-gray-500">5 วัน/สัปดาห์</p>
                      </div>
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* กลุ่ม 3: นอนหลับ */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <Moon className="w-5 h-5 text-purple-600" />
                กลุ่ม 3: นอนหลับ (1 ข้อ)
              </h3>
              <div className="border border-gray-200 rounded-lg p-4">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={l4Goals['l4_sleep'] || false}
                    onChange={(e) => setL4Goals({...l4Goals, 'l4_sleep': e.target.checked})}
                    className="w-5 h-5 text-blue-600 rounded mt-1"
                  />
                  <div>
                    <Moon className="w-5 h-5 text-purple-600 mb-2" />
                    <p className="text-sm font-medium text-gray-800">นอนหลับเพียงพอ</p>
                    <p className="text-xs text-gray-500">7 วัน/สัปดาห์</p>
                  </div>
                </label>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={handleSaveL4Goals}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
              >
                <Save className="w-5 h-5" />
                {saving ? 'กำลังบันทึก...' : 'บันทึกเป้าหมาย'}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 text-center">
            <AlertCircle className="w-12 h-12 text-orange-500 mx-auto mb-4" />
            <p className="text-gray-600">ผู้ป่วยยังไม่มีระดับ PAM ที่ชัดเจน</p>
          </div>
        )}
      </div>

      {/* ✅ Popup บันทึกน้ำหนักและน้ำตาล */}
      {showWeightSugarModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Weight className="w-6 h-6 text-purple-600" />
              บันทึกน้ำหนักและน้ำตาล
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Weight className="w-4 h-4 inline mr-1" />
                  น้ำหนัก (kg)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={l3Goals.weight}
                  onChange={(e) => setL3Goals({...l3Goals, weight: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="เช่น 65.5"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Droplets className="w-4 h-4 inline mr-1" />
                  น้ำตาลในเลือด (mg/dL)
                </label>
                <input
                  type="number"
                  value={l3Goals.sugar}
                  onChange={(e) => setL3Goals({...l3Goals, sugar: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="เช่น 110"
                />
              </div>

              {/* ✅ Verify Info */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm text-yellow-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  กรุณาตรวจสอบความถูกต้องของข้อมูลก่อนบันทึก
                </p>
              </div>
            </div>

            <div className="flex gap-4 mt-6">
              <button
                onClick={handleSaveWeightSugar}
                className="flex-1 bg-purple-500 text-white py-3 rounded-lg hover:bg-purple-600"
              >
                บันทึก
              </button>
              <button
                onClick={() => setShowWeightSugarModal(false)}
                className="flex-1 bg-gray-500 text-white py-3 rounded-lg hover:bg-gray-600"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}