// app/admin/patients/[id]/goals/page.tsx
// =====================================================
// ✅ แก้ไขล่าสุด: 8 พฤษภาคม 2569
// ✅ การแก้ไขตามเอกสารเป้าหมาย L2L3L4:
//    1. ✅ L2/L3: กฎทอง 5 ข้อ (หยุดกินหวานมี dropdown, ลดข้าวมี before/after, ฯลฯ)
//    2. ✅ L4: Champion 8 กิจกรรม (3 กลุ่ม: อาหาร, ออกกำลังกาย, นอนหลับ)
//    3. ✅ ดึงข้อมูลผู้เชี่ยวชาญกำหนดเวลาออกกำลังกาย
//    4. ✅ Popup บันทึกน้ำหนักและน้ำตาล พร้อม verify
//    5. ✅ แสดงข้อมูลผู้ป่วยและโรงพยาบาล
// =====================================================
'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  checkSession,
  logout,
  getPatientDetail,
  getUserHospitalInfo,
  getAccessibleHospitalIds,
  isSuperAdmin,
  getPatientGoals,
  savePatientGoal,
  getExpertRecommendations
} from '@/lib/supabase/queries';
import {
  ArrowLeft, Target, CheckCircle, XCircle, UserCheck, Hospital,
  Building2, LogOut, AlertCircle, Save, Edit, Calendar,
  Weight, Activity, Utensils, Moon, Droplets, Footprints,
  Heart, Apple, Clock, TrendingUp, Info
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
  full_name?: string;
  hospital_number: string;
  pam_level: string;
  hospital_id?: string;
  hospitals?: { id: string; name: string; code: string; type?: string };
  birth_date?: string;
  gender?: string;
  phone?: string;
}

interface Goal {
  id?: string;
  patient_id: string;
  goal_type: string;
  goal_name: string;
  target_value?: string;
  is_completed: boolean;
  completed_date?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

interface ExpertRecommendation {
  id: string;
  patient_id: string;
  exercise_type: string;
  recommended_duration: number; // นาที
  frequency_per_week: number;
  notes?: string;
}

// ✅ Sweet Food Options (สำหรับ L2/L3 ข้อ 1)
const SWEET_FOOD_OPTIONS = [
  { value: 'fruit', label: 'ผลไม้หวาน' },
  { value: 'seasoning', label: 'ปรุง เติมน้ำตาล (ก๋วยเตี๋ยว)' },
  { value: 'sweet_dish', label: 'กับข้าวหวานๆ (ไข่ลูกเขย, หมูหวาน)' },
  { value: 'sweet_drink', label: 'น้ำหวาน ชา กาแฟ น้ำอัดลม' },
  { value: 'thai_dessert', label: 'ขนมไทย' },
  { value: 'bakery', label: 'ขนมฝรั่ง เบเกอรี่ เค้ก' },
  { value: 'other', label: 'อื่นๆ' }
];

// ✅ Exercise Types (สำหรับ L4)
const EXERCISE_TYPES = [
  { value: 'stretching', label: 'Stretching', icon: '🧘' },
  { value: 'cardio', label: 'Cardio', icon: '🏃' },
  { value: 'strengthening', label: 'Strengthening', icon: '💪' },
  { value: 'hiit', label: 'HIIT', icon: '⚡' }
];

export default function PatientGoalsPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params.id as string;

  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<UserHospital | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accessibleHospitalIds, setAccessibleHospitalIds] = useState<string[]>([]);
  
  // ✅ Goals State
  const [goals, setGoals] = useState<Goal[]>([]);
  const [expertRecommendations, setExpertRecommendations] = useState<ExpertRecommendation[]>([]);
  
  // ✅ Weight & Sugar Modal
  const [showWeightSugarModal, setShowWeightSugarModal] = useState(false);
  const [weightData, setWeightData] = useState({ weight: '', sugar: '', date: new Date().toISOString().split('T')[0] });
  
  // ✅ Goal Completion State (สำหรับ toggle)
  const [goalCompletion, setGoalCompletion] = useState<Record<string, boolean>>({});
  
  // ✅ L2/L3 Specific States
  const [sweetFoodChoice, setSweetFoodChoice] = useState<'stop' | 'eat'>('stop');
  const [sweetFoodTypes, setSweetFoodTypes] = useState<string[]>([]);
  const [riceBefore, setRiceBefore] = useState('');
  const [riceNow, setRiceNow] = useState('');
  const [proteinVegDone, setProteinVegDone] = useState(false);
  const [exerciseMinutes, setExerciseMinutes] = useState(0);
  
  // ✅ L4 Specific States
  const [l4Goals, setL4Goals] = useState({
    carbs: false,
    protein: false,
    water: false,
    stretching: false,
    cardio: false,
    strengthening: false,
    hiit: false,
    sleep: false
  });

  // =====================================================
  // 🔄 INITIAL DATA LOADING
  // =====================================================
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
    } catch (error) {
      console.error('Error loading accessible hospitals:', error);
    }
  };

  // ✅ โหลดข้อมูลผู้ป่วย
  const loadPatientData = async () => {
    try {
      // ✅ ตรวจสอบสิทธิ์การเข้าถึงผู้ป่วย
      if (!isSuperAdmin(user) && accessibleHospitalIds.length > 0) {
        const { data: patientData } = await supabase
          .from('profiles')
          .select('*, hospitals (id, name, code, type)')
          .eq('id', patientId)
          .single();
        
        if (!patientData || !accessibleHospitalIds.includes(patientData.hospital_id)) {
          alert('❌ คุณไม่มีสิทธิ์เข้าถึงผู้ป่วยนี้');
          router.push('/admin/patients');
          return;
        }
        
        setPatient(patientData);
        await loadGoals(patientId);
        await loadExpertRecommendations(patientId);
      } else {
        const patientData = await getPatientDetail(patientId);
        setPatient(patientData);
        await loadGoals(patientId);
        await loadExpertRecommendations(patientId);
      }
    } catch (error) {
      console.error('Error loading patient:', error);
      alert('เกิดข้อผิดพลาดในการโหลดข้อมูลผู้ป่วย');
    } finally {
      setLoading(false);
    }
  };

  // ✅ โหลดเป้าหมายของผู้ป่วย
  const loadGoals = async (pid: string) => {
    try {
      const patientGoals = await getPatientGoals(pid);
      setGoals(patientGoals);
      
      // ✅ Set completion state from existing goals
      const completion: Record<string, boolean> = {};
      patientGoals.forEach(goal => {
        completion[goal.goal_type] = goal.is_completed;
      });
      setGoalCompletion(completion);
    } catch (error) {
      console.error('Error loading goals:', error);
    }
  };

  // ✅ โหลดคำแนะนำจากผู้เชี่ยวชาญ
  const loadExpertRecommendations = async (pid: string) => {
    try {
      const recommendations = await getExpertRecommendations(pid);
      setExpertRecommendations(recommendations);
      
      // ✅ Set exercise minutes from recommendations
      const exerciseRec = recommendations.find(r => r.exercise_type === 'general');
      if (exerciseRec) {
        setExerciseMinutes(exerciseRec.recommended_duration);
      }
    } catch (error) {
      console.error('Error loading expert recommendations:', error);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  // =====================================================
  // 💾 SAVE GOALS
  // =====================================================
  const handleSaveGoals = async () => {
    setSaving(true);
    try {
      const pamLevel = patient?.pam_level;
      const goalsToSave: any[] = [];

      if (pamLevel === 'L2' || pamLevel === 'L3') {
        // ✅ L2/L3: กฎทอง 5 ข้อ
        goalsToSave.push(
          { goal_type: 'stop_sweet', goal_name: 'หยุดกินหวาน', is_completed: sweetFoodChoice === 'stop', notes: sweetFoodChoice === 'eat' ? sweetFoodTypes.join(', ') : '' },
          { goal_type: 'reduce_rice', goal_name: 'ลดข้าว', is_completed: riceNow !== '' && Number(riceNow) < Number(riceBefore), notes: `ก่อน: ${riceBefore} ทัพพี, ช่วงนี้: ${riceNow} ทัพพี` },
          { goal_type: 'protein_veg', goal_name: 'กินโปรตีนและผัก', is_completed: proteinVegDone },
          { goal_type: 'exercise', goal_name: 'ออกกำลังกาย/เดิน', is_completed: exerciseMinutes > 0, notes: `${exerciseMinutes} นาที/วัน` },
          { goal_type: 'weight_sugar', goal_name: 'บันทึกน้ำหนักและน้ำตาล', is_completed: true }
        );
      } else if (pamLevel === 'L4') {
        // ✅ L4: Champion 8 กิจกรรม
        goalsToSave.push(
          { goal_type: 'carbs', goal_name: 'กินคาร์โบไฮเดรต < 5 คาร์บ/วัน', is_completed: l4Goals.carbs },
          { goal_type: 'protein', goal_name: 'กินโปรตีน > 3 หน่วย(ฝ่ามือ)', is_completed: l4Goals.protein },
          { goal_type: 'water', goal_name: 'ดื่มน้ำ > 1 ลิตร', is_completed: l4Goals.water },
          { goal_type: 'stretching', goal_name: 'Stretching', is_completed: l4Goals.stretching },
          { goal_type: 'cardio', goal_name: 'Cardio', is_completed: l4Goals.cardio },
          { goal_type: 'strengthening', goal_name: 'Strengthening', is_completed: l4Goals.strengthening },
          { goal_type: 'hiit', goal_name: 'HIIT', is_completed: l4Goals.hiit },
          { goal_type: 'sleep', goal_name: 'นอนหลับเพียงพอ', is_completed: l4Goals.sleep }
        );
      }

      // ✅ Save each goal
      for (const goal of goalsToSave) {
        await savePatientGoal(patientId, {
          ...goal,
          patient_id: patientId
        });
      }

      alert('✅ บันทึกเป้าหมายสำเร็จ!');
    } catch (error) {
      console.error('Error saving goals:', error);
      alert('เกิดข้อผิดพลาดในการบันทึกเป้าหมาย');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleGoal = (goalType: string) => {
    setGoalCompletion(prev => ({
      ...prev,
      [goalType]: !prev[goalType]
    }));
  };

  // =====================================================
  // ⏳ LOADING STATE
  // =====================================================
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    );
  }

  const pamLevel = patient?.pam_level;

  // =====================================================
  // 🎨 RENDER UI
  // =====================================================
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
                {patient?.first_name} {patient?.last_name} | HN: {patient?.hospital_number} | PAM: {pamLevel}
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
      <div className="max-w-5xl mx-auto px-4 py-8">
        
        {/* ✅ PAM Level Banner */}
        <div className={`rounded-xl shadow-lg p-6 mb-6 ${
          pamLevel === 'L1' ? 'bg-red-50 border-2 border-red-500' :
          pamLevel === 'L2' ? 'bg-green-50 border-2 border-green-500' :
          pamLevel === 'L3' ? 'bg-yellow-50 border-2 border-yellow-500' :
          'bg-blue-50 border-2 border-blue-500'
        }`}>
          <div className="flex items-center gap-3 mb-4">
            <Target className={`w-8 h-8 ${
              pamLevel === 'L1' ? 'text-red-600' :
              pamLevel === 'L2' ? 'text-green-600' :
              pamLevel === 'L3' ? 'text-yellow-600' :
              'text-blue-600'
            }`} />
            <div>
              <h2 className="text-2xl font-bold text-gray-800">
                {pamLevel === 'L1' ? 'L1 - Red Zone (ต้องการการดูแลอย่างใกล้ชิด)' :
                 pamLevel === 'L2' ? 'L2 - กฎทอง 5 ข้อ' :
                 pamLevel === 'L3' ? 'L3 - กฎทอง 5 ข้อ (Intensive)' :
                 'L4 - Champion (8 กิจกรรม)'}
              </h2>
              <p className="text-gray-600">
                {pamLevel === 'L2' || pamLevel === 'L3' ? 'เป้าหมายพื้นฐาน 5 ข้อสำหรับการดูแลสุขภาพ' :
                 'เป้าหมายระดับแชมป์ 8 กิจกรรม ใน 3 กลุ่ม'}
              </p>
            </div>
          </div>
        </div>

        {/* ✅ L2/L3: กฎทอง 5 ข้อ */}
        {(pamLevel === 'L2' || pamLevel === 'L3') && (
          <div className="space-y-6">
            
            {/* ข้อ 1: หยุดกินหวาน */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <span className="text-xl">🍬</span>
                </div>
                <h3 className="text-xl font-bold text-gray-800">1. หยุดกินหวาน</h3>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setSweetFoodChoice('stop')}
                    className={`flex-1 py-3 rounded-lg border-2 transition-all ${
                      sweetFoodChoice === 'stop'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    ✅ หยุดกิน
                  </button>
                  <button
                    onClick={() => setSweetFoodChoice('eat')}
                    className={`flex-1 py-3 rounded-lg border-2 transition-all ${
                      sweetFoodChoice === 'eat'
                        ? 'border-orange-500 bg-orange-50 text-orange-700'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    🍽️ กิน (เลือกประเภท)
                  </button>
                </div>

                {sweetFoodChoice === 'eat' && (
                  <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                    <p className="text-sm font-medium text-orange-800 mb-3">เลือกประเภทอาหารหวานที่กิน:</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {SWEET_FOOD_OPTIONS.map(option => (
                        <label key={option.value} className="flex items-center gap-2 p-2 bg-white rounded border border-orange-200">
                          <input
                            type="checkbox"
                            checked={sweetFoodTypes.includes(option.value)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSweetFoodTypes([...sweetFoodTypes, option.value]);
                              } else {
                                setSweetFoodTypes(sweetFoodTypes.filter(t => t !== option.value));
                              }
                            }}
                            className="w-4 h-4 text-orange-600 rounded"
                          />
                          <span className="text-sm">{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ข้อ 2: ลดข้าว */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                  <span className="text-xl">🍚</span>
                </div>
                <h3 className="text-xl font-bold text-gray-800">2. ลดข้าวลง</h3>
              </div>
              
              <div className="bg-blue-50 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2 text-blue-800 mb-2">
                  <Info className="w-5 h-5" />
                  <p className="text-sm font-medium">คำแนะนำ: ลดข้าวจากที่เคยกิน (แป้ง ข้าว เส้นก๋วยเตี๋ยว ถือว่าอยู่กลุ่มเดียวกัน)</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">ก่อน: ............ ทัพพี</label>
                    <input
                      type="number"
                      value={riceBefore}
                      onChange={(e) => setRiceBefore(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="เช่น 3"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">ช่วงนี้: ............ ทัพพี</label>
                    <input
                      type="number"
                      value={riceNow}
                      onChange={(e) => setRiceNow(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="เช่น 2"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ข้อ 3: กินโปรตีนและผัก */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <span className="text-xl">🥗</span>
                </div>
                <h3 className="text-xl font-bold text-gray-800">3. กินโปรตีนและผัก</h3>
              </div>
              
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setProteinVegDone(!proteinVegDone)}
                  className={`flex-1 py-4 rounded-lg border-2 transition-all flex items-center justify-center gap-2 ${
                    proteinVegDone
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  {proteinVegDone ? <CheckCircle className="w-6 h-6" /> : <div className="w-6 h-6 border-2 border-gray-300 rounded"></div>}
                  <span className="text-lg font-medium">ทำแล้ว</span>
                </button>
              </div>
            </div>

            {/* ข้อ 4: ออกกำลังกาย */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                  <span className="text-xl">🚶</span>
                </div>
                <h3 className="text-xl font-bold text-gray-800">4. ออกกำลังกาย หรือ เดิน</h3>
              </div>
              
              {expertRecommendations.length > 0 && (
                <div className="bg-purple-50 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-2 text-purple-800">
                    <Clock className="w-5 h-5" />
                    <p className="text-sm font-medium">
                      ผู้เชี่ยวชาญแนะนำ: <strong>{exerciseMinutes} นาที/วัน</strong>
                    </p>
                  </div>
                </div>
              )}
              
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  value={exerciseMinutes}
                  onChange={(e) => setExerciseMinutes(Number(e.target.value))}
                  className="w-32 px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="นาที"
                />
                <span className="text-gray-600">นาที/วัน</span>
              </div>
            </div>

            {/* ข้อ 5: บันทึกน้ำหนักและน้ำตาล */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-xl">⚖️</span>
                </div>
                <h3 className="text-xl font-bold text-gray-800">5. บันทึกน้ำหนักและน้ำตาล</h3>
              </div>
              
              <button
                onClick={() => setShowWeightSugarModal(true)}
                className="w-full py-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all flex items-center justify-center gap-2"
              >
                <Weight className="w-5 h-5" />
                บันทึกน้ำหนักและน้ำตาล
              </button>
            </div>
          </div>
        )}

        {/* ✅ L4: Champion 8 กิจกรรม */}
        {pamLevel === 'L4' && (
          <div className="space-y-6">
            
            {/* กลุ่ม 1: อาหาร */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <Utensils className="w-6 h-6 text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-800">กลุ่ม 1: อาหาร (3 ข้อ)</h3>
              </div>
              
              <div className="space-y-3">
                {[
                  { key: 'carbs', label: 'กินคาร์โบไฮเดรต < 5 คาร์บ/วัน', icon: '🍚' },
                  { key: 'protein', label: 'กินโปรตีน > 3 หน่วย(ฝ่ามือ)', icon: '🍗' },
                  { key: 'water', label: 'ดื่มน้ำ > 1 ลิตร', icon: '💧' }
                ].map(item => (
                  <label key={item.key} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <input
                      type="checkbox"
                      checked={l4Goals[item.key as keyof typeof l4Goals]}
                      onChange={() => handleToggleGoal(item.key)}
                      className="w-5 h-5 text-green-600 rounded"
                    />
                    <span className="text-lg">{item.icon}</span>
                    <span className="flex-1 font-medium text-gray-800">{item.label}</span>
                    {goalCompletion[item.key] && <CheckCircle className="w-6 h-6 text-green-600" />}
                  </label>
                ))}
              </div>
            </div>

            {/* กลุ่ม 2: ออกกำลังกาย */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                  <Activity className="w-6 h-6 text-orange-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-800">กลุ่ม 2: ออกกำลังกาย (4 ข้อ)</h3>
              </div>
              
              {expertRecommendations.length > 0 && (
                <div className="bg-purple-50 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-2 text-purple-800">
                    <Clock className="w-5 h-5" />
                    <p className="text-sm font-medium">
                      ผู้เชี่ยวชาญแนะนำ: <strong>{exerciseMinutes} นาที/วัน</strong>
                    </p>
                  </div>
                </div>
              )}
              
              <div className="space-y-3">
                {EXERCISE_TYPES.map(exercise => (
                  <label key={exercise.value} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <input
                      type="checkbox"
                      checked={l4Goals[exercise.value as keyof typeof l4Goals]}
                      onChange={() => handleToggleGoal(exercise.value)}
                      className="w-5 h-5 text-orange-600 rounded"
                    />
                    <span className="text-2xl">{exercise.icon}</span>
                    <span className="flex-1 font-medium text-gray-800">{exercise.label}</span>
                    {goalCompletion[exercise.value] && <CheckCircle className="w-6 h-6 text-green-600" />}
                  </label>
                ))}
              </div>
            </div>

            {/* กลุ่ม 3: นอนหลับ */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <Moon className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-800">กลุ่ม 3: นอนหลับ (1 ข้อ)</h3>
              </div>
              
              <label className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <input
                  type="checkbox"
                  checked={l4Goals.sleep}
                  onChange={() => handleToggleGoal('sleep')}
                  className="w-5 h-5 text-blue-600 rounded"
                />
                <span className="text-2xl">😴</span>
                <span className="flex-1 font-medium text-gray-800">นอนหลับเพียงพอ (7-8 ชั่วโมง)</span>
                {goalCompletion.sleep && <CheckCircle className="w-6 h-6 text-green-600" />}
              </label>
            </div>
          </div>
        )}

        {/* ✅ Save Button */}
        <div className="mt-8 flex justify-end">
          <button
            onClick={handleSaveGoals}
            disabled={saving}
            className="flex items-center gap-2 px-8 py-4 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-all disabled:opacity-50 font-bold text-lg"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                กำลังบันทึก...
              </>
            ) : (
              <>
                <Save className="w-6 h-6" />
                บันทึกเป้าหมาย
              </>
            )}
          </button>
        </div>
      </div>

      {/* ✅ Weight & Sugar Modal */}
      {showWeightSugarModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <Weight className="w-6 h-6 text-blue-600" />
                บันทึกน้ำหนักและน้ำตาล
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">วันที่</label>
                <input
                  type="date"
                  value={weightData.date}
                  onChange={(e) => setWeightData({...weightData, date: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <TrendingUp className="w-4 h-4 inline mr-1" />
                  น้ำหนัก (kg)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={weightData.weight}
                  onChange={(e) => setWeightData({...weightData, weight: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="เช่น 65.5"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Droplets className="w-4 h-4 inline mr-1" />
                  น้ำตาล (mg/dL)
                </label>
                <input
                  type="number"
                  value={weightData.sugar}
                  onChange={(e) => setWeightData({...weightData, sugar: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="เช่น 110"
                />
              </div>
              
              {/* ✅ Verify Info */}
              <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-200">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-yellow-800">
                    <strong>ตรวจสอบ:</strong> กรุณาตรวจสอบความถูกต้องของข้อมูลก่อนบันทึก
                  </p>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => setShowWeightSugarModal(false)}
                className="flex-1 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-all"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => {
                  // TODO: Save weight & sugar data
                  alert('✅ บันทึกข้อมูลสำเร็จ!');
                  setShowWeightSugarModal(false);
                }}
                className="flex-1 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all"
              >
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}