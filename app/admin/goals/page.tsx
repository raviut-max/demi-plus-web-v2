'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, getProfile, getActivities, saveRecord, getTodayRecords } from '@/lib/supabase/queries';
import { StarBackground } from '@/components/star-background';
import Image from 'next/image';

// ✅ ตัวเลือกประเภทของหวาน
const sweetOptions = [
  { value: 'ผลไม้หวาน', label: '🍈 ผลไม้หวาน', icon: '🍈' },
  { value: 'ปรุงเติมน้ำตาล', label: '🍜 ปรุง เติมน้ำตาล เช่น ก๋วยเตี๋ยว', icon: '🍜' },
  { value: 'กับข้าวหวาน', label: '🍳 กับข้าวหวานๆ เช่น ไข่ลูกเขย หมูหวาน', icon: '🍳' },
  { value: 'น้ำหวาน', label: '🥤 น้ำหวาน ชา กาแฟ น้ำอัดลม', icon: '🥤' },
  { value: 'ขนมไทย', label: '🍮 ขนมไทย', icon: '🍮' },
  { value: 'ขนมฝรั่ง', label: '🍰 ขนมฝรั่ง เบเกอรี่ เค้ก', icon: '🍰' },
  { value: 'อื่นๆ', label: '🍪 อื่นๆ', icon: '🍪' },
];

interface Activity {
  id: string;
  activity_code: string;
  activity_name_th: string;
  description_th: string | null;
  activity_type: string;
  pam_level: string;
  is_completed: boolean;
  record_id?: string;
  weight?: number;
  blood_sugar?: number;
  sweet_type?: string[];
  exercise_minutes?: number;  // ✅ เพิ่ม field ใหม่
}

export default function RecordPage() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showWeightForm, setShowWeightForm] = useState(false);
  const [showSweetForm, setShowSweetForm] = useState(false);
  const [showExerciseForm, setShowExerciseForm] = useState(false);  // ✅ เพิ่ม state
  const [selectedSweets, setSelectedSweets] = useState<string[]>([]);
  const [weight, setWeight] = useState('');
  const [bloodSugar, setBloodSugar] = useState('');
  const [exerciseMinutes, setExerciseMinutes] = useState('10');  // ✅ เพิ่ม state (default 10 นาที)
  const router = useRouter();

  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/login');
      return;
    }
    setUser(userData);

    const fetchData = async () => {
      try {
        const [profileData, activitiesData, recordsData] = await Promise.all([
          getProfile(userData.id),
          getActivities(userData.pam_level || 'L2'),
          getTodayRecords(userData.id)
        ]);
        setProfile(profileData);
        
        const activitiesWithRecords = activitiesData.map((activity: any) => {
          const existingRecord = recordsData.find((r: any) => r.activity_id === activity.id);
          return {
            ...activity,
            is_completed: existingRecord?.is_completed ?? false,
            record_id: existingRecord?.id,
            weight: existingRecord?.weight,
            blood_sugar: existingRecord?.blood_sugar,
            sweet_type: existingRecord?.sweet_type ?? [],
            exercise_minutes: existingRecord?.exercise_minutes ?? 10,  // ✅ เพิ่ม (default 10)
          };
        });
        setActivities(activitiesWithRecords);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  const toggleActivity = async (id: string) => {
    setActivities((prev) =>
      prev.map((a) => {
        if (a.id === id) {
          const newCompleted = !a.is_completed;
          
          // ✅ กรณีบันทึกน้ำหนัก/น้ำตาล
          if (a.activity_code === 'record_weight_sugar' && newCompleted) {
            setShowWeightForm(true);
            return { ...a, is_completed: false };
          }
          
          // ✅ กรณีออกกำลังกาย - เปิดฟอร์มเลือกเวลา
          if (a.activity_type === 'exercise' && newCompleted) {
            setExerciseMinutes(a.exercise_minutes?.toString() || '10');
            setShowExerciseForm(true);
            return { ...a, is_completed: false };
          }
          
          // ✅ กรณีหยุดกินหวาน
          if (a.activity_code === 'stop_sweet') {
            if (!newCompleted) {
              setShowSweetForm(true);
              return { ...a, is_completed: true };
            }
            if (newCompleted && user) {
              saveRecord({
                user_id: user.id,
                activity_id: id,
                record_date: new Date().toISOString().split('T')[0],
                is_completed: true,
                sweet_type: [],
              });
              return { ...a, is_completed: true, sweet_type: [] };
            }
          }
          
          // ✅ กรณีอื่นๆ
          if (user && newCompleted) {
            saveRecord({
              user_id: user.id,
              activity_id: id,
              record_date: new Date().toISOString().split('T')[0],
              is_completed: true,
            });
          }
          
          return { ...a, is_completed: newCompleted };
        }
        return a;
      })
    );
  };

  const handleOpenSweetForm = (activity: Activity) => {
    setSelectedSweets(activity.sweet_type ?? []);
    setShowSweetForm(true);
  };

  const handleSaveSweet = async () => {
    if (selectedSweets.length === 0 || !user) return;
    
    const sweetActivity = activities.find(a => a.activity_code === 'stop_sweet');
    if (!sweetActivity) return;

    await saveRecord({
      user_id: user.id,
      activity_id: sweetActivity.id,
      record_date: new Date().toISOString().split('T')[0],
      is_completed: false,
      sweet_type: selectedSweets,
    });

    setActivities((prev) =>
      prev.map((a) =>
        a.id === sweetActivity.id ? { ...a, is_completed: false, sweet_type: selectedSweets } : a
      )
    );

    setShowSweetForm(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // ✅ ฟังก์ชันบันทึกเวลาออกกำลังกาย
  const handleSaveExercise = async () => {
    const minutes = parseInt(exerciseMinutes);
    
    // ✅ Validation: ต้องไม่น้อยกว่า 5 นาที
    if (minutes < 5 || !user) {
      alert('เวลาออกกำลังกายต้องไม่น้อยกว่า 5 นาที');
      return;
    }
    
    // หา activity การออกกำลังกายที่เปิดอยู่ (อันล่าสุด)
    const exerciseActivity = activities.find(a => a.activity_type === 'exercise' && !a.is_completed);
    if (!exerciseActivity) return;

    await saveRecord({
      user_id: user.id,
      activity_id: exerciseActivity.id,
      record_date: new Date().toISOString().split('T')[0],
      is_completed: true,
      exercise_minutes: minutes,
    });

    setActivities((prev) =>
      prev.map((a) =>
        a.id === exerciseActivity.id ? { ...a, is_completed: true, exercise_minutes: minutes } : a
      )
    );

    setShowExerciseForm(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleOpenWeightForm = (activity: Activity) => {
    setWeight(activity.weight?.toString() ?? '');
    setBloodSugar(activity.blood_sugar?.toString() ?? '');
    setShowWeightForm(true);
  };

  const handleSaveWeight = async () => {
    if (!weight || !bloodSugar || !user) return;
    
    const weightActivity = activities.find(a => a.activity_code === 'record_weight_sugar');
    if (!weightActivity) return;

    await saveRecord({
      user_id: user.id,
      activity_id: weightActivity.id,
      record_date: new Date().toISOString().split('T')[0],
      is_completed: true,
      weight: parseFloat(weight),
      blood_sugar: parseFloat(bloodSugar),
    });

    setActivities((prev) =>
      prev.map((a) =>
        a.id === weightActivity.id
          ? { ...a, is_completed: true, weight: parseFloat(weight), blood_sugar: parseFloat(bloodSugar) }
          : a
      )
    );

    setShowWeightForm(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const foodActivities = activities.filter((a) => a.activity_type === 'food');
  const exerciseActivities = activities.filter((a) => a.activity_type === 'exercise');
  const measurementActivities = activities.filter((a) => a.activity_type === 'measurement');
  const sleepActivities = activities.filter((a) => a.activity_type === 'rest');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">กำลังโหลด...</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-6 relative">
      <StarBackground />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-6 relative z-10">
        <div>
          <h1 className="text-xl font-bold text-gray-800">
            กิจกรรมสำหรับนักกีฬา {profile?.pam_level === 'L4' ? 'Champion' : profile?.pam_level || 'L2'}
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            {new Date().toLocaleDateString('th-TH', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            })}
          </p>
        </div>
        <Image src="/images/mascot-main.png" alt="Mascot" width={56} height={56} className="object-contain" />
      </div>

      {/* Food Section */}
      {foodActivities.length > 0 && (
        <div className="mb-4 relative z-10">
          <ActivitySection
            title="อาหาร"
            icon="🍚"
            activities={foodActivities}
            onToggle={toggleActivity}
            onOpenSweetForm={handleOpenSweetForm}
            headerBg="bg-[#ECFDF5]"
            iconMap={{ stop_sweet: '🚫🍬', reduce_rice: '🍚', protein_vegetable: '🥦🍖', carb_control: '🍚', protein_intake: '🥩', water_intake: '💧' }}
            showSweetType={true}
          />
        </div>
      )}

      {/* Exercise Section */}
      {exerciseActivities.length > 0 && (
        <div className="mb-4 relative z-10">
          <ActivitySection
            title="ออกกำลังกาย"
            icon="🧘"
            activities={exerciseActivities}
            onToggle={toggleActivity}
            headerBg="bg-[#EFF6FF]"
            iconMap={{ exercise_walk: '🚶', stretching: '🧘', cardio: '🏃', strengthening: '🏋️', hiit: '🔥' }}
            showExerciseMinutes={true}  // ✅ เพิ่ม prop
          />
        </div>
      )}

      {/* Measurement Section */}
      {measurementActivities.length > 0 && (
        <div className="mb-4 relative z-10">
          <ActivitySection
            title="วัดและบันทึก"
            icon="📊"
            activities={measurementActivities}
            onToggle={toggleActivity}
            onOpenWeightForm={handleOpenWeightForm}
            headerBg="bg-[#FDF4FF]"
            iconMap={{ record_weight_sugar: '⚖️💉' }}
            showValue={true}
          />
        </div>
      )}

      {/* Sleep Section */}
      {sleepActivities.length > 0 && (
        <div className="mb-4 relative z-10">
          <ActivitySection
            title="พักผ่อน"
            icon="🌙"
            activities={sleepActivities}
            onToggle={toggleActivity}
            headerBg="bg-[#EDE9FE]"
            iconMap={{ sleep: '🌙' }}
          />
        </div>
      )}

      {/* Save Button */}
      <div className="mt-8 relative z-10">
        <button
          onClick={handleSave}
          className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold rounded-xl hover:from-green-600 hover:to-emerald-700 transition-all"
        >
          {saved ? 'บันทึกแล้ว! ✅' : 'บันทึกกิจกรรมวันนี้'}
        </button>
      </div>

      {/* Sweet Type Form Modal */}
      {showSweetForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h2 className="text-lg font-bold text-gray-800 mb-2">🍬 วันนี้กินอะไรหวาน?</h2>
            <p className="text-xs text-gray-500 mb-4">เลือกทุกข้อที่ตรงกับที่คุณกิน</p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {sweetOptions.map((option) => (
                <label
                  key={option.value}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    selectedSweets.includes(option.value) ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedSweets.includes(option.value)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedSweets([...selectedSweets, option.value]);
                      } else {
                        setSelectedSweets(selectedSweets.filter((s) => s !== option.value));
                      }
                    }}
                    className="w-5 h-5 rounded border-gray-300 text-red-500 focus:ring-red-500"
                  />
                  <span className="text-sm font-medium text-gray-700">{option.label}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowSweetForm(false);
                  setSelectedSweets([]);
                }}
                className="flex-1 py-3 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSaveSweet}
                disabled={selectedSweets.length === 0}
                className="flex-1 py-3 bg-gradient-to-r from-red-500 to-pink-600 text-white font-bold rounded-xl hover:from-red-600 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ Exercise Minutes Form Modal */}
      {showExerciseForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h2 className="text-lg font-bold text-gray-800 mb-2">🏃 เวลาออกกำลังกาย</h2>
            <p className="text-xs text-gray-500 mb-4">ระบุเวลาออกกำลังกายเป็นนาที (อย่างน้อย 5 นาที)</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">⏱️ นาที</label>
                <input
                  type="number"
                  value={exerciseMinutes}
                  onChange={(e) => setExerciseMinutes(e.target.value)}
                  placeholder="เช่น 10"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  min="5"
                  max="180"
                  step="5"
                />
                <p className="text-xs text-gray-500 mt-1">ค่าเริ่มต้น: 10 นาที</p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowExerciseForm(false);
                  setExerciseMinutes('10');
                }}
                className="flex-1 py-3 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSaveExercise}
                disabled={parseInt(exerciseMinutes) < 5}
                className="flex-1 py-3 bg-gradient-to-r from-blue-500 to-cyan-600 text-white font-bold rounded-xl hover:from-blue-600 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Weight & Sugar Form Modal */}
      {showWeightForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h2 className="text-lg font-bold text-gray-800 mb-4">บันทึกน้ำหนักและน้ำตาล</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">⚖️ น้ำหนัก (kg)</label>
                <input
                  type="number"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="เช่น 65.5"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  min="30"
                  max="200"
                  step="0.1"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">💉 น้ำตาลในเลือด (mg/dL)</label>
                <input
                  type="number"
                  value={bloodSugar}
                  onChange={(e) => setBloodSugar(e.target.value)}
                  placeholder="เช่น 120"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  min="50"
                  max="500"
                  step="1"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowWeightForm(false);
                  setWeight('');
                  setBloodSugar('');
                }}
                className="flex-1 py-3 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSaveWeight}
                disabled={!weight || !bloodSugar}
                className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold rounded-xl hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
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

function ActivitySection({
  title,
  icon,
  activities,
  onToggle,
  onOpenSweetForm,
  onOpenWeightForm,
  headerBg,
  iconMap,
  showValue = false,
  showSweetType = false,
  showExerciseMinutes = false,  // ✅ เพิ่ม prop
}: {
  title: string;
  icon: string;
  activities: Activity[];
  onToggle: (id: string) => void;
  onOpenSweetForm?: (activity: Activity) => void;
  onOpenWeightForm?: (activity: Activity) => void;
  headerBg: string;
  iconMap: Record<string, string>;
  showValue?: boolean;
  showSweetType?: boolean;
  showExerciseMinutes?: boolean;  // ✅ เพิ่ม type
}) {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-white/50 overflow-hidden">
      {/* Header */}
      <div className={`flex items-center gap-2 px-4 py-3 ${headerBg}`}>
        <span className="text-xl" role="img" aria-label={title}>{icon}</span>
        <h2 className="text-base font-bold text-gray-800">{title}</h2>
      </div>

      {/* Activities */}
      <div className="p-4">
        {activities.map((activity) => (
          <div key={activity.id} className="flex items-center justify-between px-4 py-4 border-b border-gray-100 last:border-b-0">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-2xl shrink-0" role="img" aria-label={activity.activity_name_th}>
                  {iconMap[activity.activity_code] || '📋'}
                </span>
                <div>
                  <p className="text-sm font-bold text-gray-800">{activity.activity_name_th}</p>
                  {activity.description_th && (
                    <p className="text-xs text-gray-500 mt-0.5">{activity.description_th}</p>
                  )}
                </div>
              </div>

              {/* ✅ แสดงเวลาออกกำลังกายที่บันทึก */}
              {showExerciseMinutes && activity.activity_type === 'exercise' && activity.exercise_minutes && (
                <div className="mt-2">
                  <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-xs px-3 py-1.5 rounded-full font-semibold">
                    ⏱️ {activity.exercise_minutes} นาที
                  </span>
                </div>
              )}

              {/* แสดงประเภทของหวานที่กิน */}
              {showSweetType && activity.activity_code === 'stop_sweet' && !activity.is_completed && (
                <button
                  onClick={() => onOpenSweetForm?.(activity)}
                  className="mt-2 text-xs bg-red-100 text-red-700 px-3 py-1.5 rounded-full font-semibold hover:bg-red-200 transition-colors"
                >
                  🍬 วันนี้กิน
                </button>
              )}

              {showSweetType && activity.activity_code === 'stop_sweet' && !activity.is_completed && activity.sweet_type && activity.sweet_type.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-gray-500 mb-1">กิน:</p>
                  <div className="flex flex-wrap gap-1">
                    {activity.sweet_type.map((sweet: string, index: number) => (
                      <span key={index} className="inline-block bg-red-100 text-red-700 text-xs px-2 py-1 rounded-full mr-1 mb-1">
                        {sweetOptions.find((o) => o.value === sweet)?.icon} {sweet}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* แสดงปุ่มบันทึกน้ำหนัก/น้ำตาล */}
              {showValue && activity.activity_code === 'record_weight_sugar' && (
                <button
                  onClick={() => onOpenWeightForm?.(activity)}
                  className="mt-2 text-xs bg-green-100 text-green-700 px-3 py-1.5 rounded-full font-semibold hover:bg-green-200 transition-colors"
                >
                  📝 บันทึก
                </button>
              )}

              {/* แสดงค่าน้ำหนัก/น้ำตาลที่บันทึกแล้ว */}
              {showValue && activity.activity_code === 'record_weight_sugar' && activity.is_completed && (
                <div className="mt-2 flex gap-2">
                  {activity.weight && (
                    <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-700 text-xs px-2 py-1 rounded-full">
                      ⚖️ {activity.weight} kg
                    </span>
                  )}
                  {activity.blood_sugar && (
                    <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 text-xs px-2 py-1 rounded-full">
                      💉 {activity.blood_sugar} mg/dL
                    </span>
                  )}
                </div>
              )}
            </div>

            <ToggleSwitch checked={activity.is_completed} onChange={() => onToggle(activity.id)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-8 w-16 shrink-0 items-center rounded-full border-2 transition-colors duration-200 focus-visible:outline-none ${
        checked ? 'border-[#22C55E] bg-[#22C55E]' : 'border-[#D1D5DB] bg-[#E5E7EB]'
      }`}
    >
      <span
        className={`pointer-events-none flex h-6 w-6 items-center justify-center rounded-full bg-[#FFFFFF] shadow-md transition-transform duration-200 ${
          checked ? 'translate-x-8' : 'translate-x-0.5'
        }`}
      />
      {!checked && <span className="absolute left-1 text-[10px] text-gray-500 font-semibold">ไม่ทำ</span>}
    </button>
  );
}
