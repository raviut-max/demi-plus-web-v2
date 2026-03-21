'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, getProfile, getGoals, getProgress, getWeeklyGoals } from '@/lib/supabase/queries';
import { StarBackground } from '@/components/star-background';
import Image from 'next/image';
import { Trophy, Scale, Droplet, Pill, Activity, Utensils, Dumbbell, Moon, Clock } from 'lucide-react';

interface Goal {
  id: string;
  user_id: string;
  goal_type: string;
  goal_name: string;
  goal_name_th: string;
  description_th: string | null;
  target_value: number | null;
  target_unit: string | null;
  current_value: number | null;
  current_unit: string | null;
  status: string;
  priority: number;
  is_core_goal: boolean;
  activity_id?: string;
  target_days?: number;
}

interface WeeklyGoal {
  activity_id: string;
  activity_name_th: string;
  activity_code: string;
  activity_type: string;
  target_days: number;
  completed_days: number;
  target_value?: number | null;
  target_unit?: string | null;
}

export default function GoalsPage() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [longTermGoals, setLongTermGoals] = useState<Goal[]>([]);
  const [weeklyGoals, setWeeklyGoals] = useState<WeeklyGoal[]>([]);
  const [loading, setLoading] = useState(true);
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
        const [profileData, goalsData, weeklyGoalsData, progressData] = await Promise.all([
          getProfile(userData.id),
          getGoals(userData.id),
          getWeeklyGoals(userData.id),
          getProgress(userData.id, 7)
        ]);
        
        setProfile(profileData);
        
        // ✅ แยกเป้าหมายระยะยาว (Long-term Goals)
        const longTerm = goalsData.filter((g: Goal) => 
          ['weight', 'glucose', 'medication', 'remission'].includes(g.goal_type)
        ).sort((a: Goal, b: Goal) => a.priority - b.priority);
        
        setLongTermGoals(longTerm);
        
        // ✅ คำนวณวันที่ทำสำเร็จจาก progress
        const weekly = calculateWeeklyGoals(weeklyGoalsData, progressData);
        setWeeklyGoals(weekly);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  const calculateWeeklyGoals = (weeklyGoalsData: any[], progressData: any[]): WeeklyGoal[] => {
    const foodGoals: WeeklyGoal[] = [];
    const exerciseGoals: WeeklyGoal[] = [];
    const measurementGoals: WeeklyGoal[] = [];
    const restGoals: WeeklyGoal[] = [];

    // ✅ ใช้ weeklyGoalsData เป็นหลัก (ไม่ใช่ progressData)
    weeklyGoalsData.forEach((goal: any) => {
      // นับวันที่ทำสำเร็จจาก progress
      const activityRecords = progressData.filter((r: any) => r.activity_id === goal.activity_id);
      const completedDays = activityRecords.filter((r: any) => r.is_completed).length;
      const targetDays = goal.target_days || 7;
      
      const activity = activityRecords[0]?.activities;
      
      const weeklyGoal: WeeklyGoal = {
        activity_id: goal.activity_id,
        activity_name_th: goal.goal_name_th,
        activity_code: goal.goal_name,
        activity_type: getActivityType(goal.goal_name),
        target_days: targetDays,
        completed_days: completedDays,
        target_value: goal.target_value,
        target_unit: goal.target_unit,
      };
      
      if (weeklyGoal.activity_type === 'food') {
        foodGoals.push(weeklyGoal);
      } else if (weeklyGoal.activity_type === 'exercise') {
        exerciseGoals.push(weeklyGoal);
      } else if (weeklyGoal.activity_type === 'measurement') {
        measurementGoals.push(weeklyGoal);
      } else if (weeklyGoal.activity_type === 'rest') {
        restGoals.push(weeklyGoal);
      }
    });

    return [...foodGoals, ...exerciseGoals, ...measurementGoals, ...restGoals];
  };

  const getActivityType = (activityCode: string): string => {
    const foodCodes = ['stop_sweet', 'reduce_rice', 'protein_vegetable', 'carb_control', 'protein_intake', 'water_intake'];
    const exerciseCodes = ['stretching', 'cardio', 'strengthening', 'hiit', 'exercise_walk'];
    const restCodes = ['sleep'];
    const measurementCodes = ['record_weight_sugar'];
    
    if (foodCodes.includes(activityCode)) return 'food';
    if (exerciseCodes.includes(activityCode)) return 'exercise';
    if (restCodes.includes(activityCode)) return 'rest';
    if (measurementCodes.includes(activityCode)) return 'measurement';
    return 'food';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">กำลังโหลด...</p>
      </div>
    );
  }

  // แยก weekly goals ตาม activity_type
  const foodWeeklyGoals = weeklyGoals.filter(g => g.activity_type === 'food');
  const exerciseWeeklyGoals = weeklyGoals.filter(g => g.activity_type === 'exercise');
  const measurementWeeklyGoals = weeklyGoals.filter(g => g.activity_type === 'measurement');
  const restWeeklyGoals = weeklyGoals.filter(g => g.activity_type === 'rest');

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <StarBackground />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-4 relative z-10">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">เป้าหมายของฉัน</h1>
          <div className="flex items-center gap-2 mt-1">
            <Trophy className="w-4 h-4 text-yellow-600" />
            <span className="text-sm font-semibold text-gray-700">
              {profile?.pam_level === 'L4' ? 'L4 Champion' : profile?.pam_level || 'L2'} | {profile?.zone || 'Green Zone'}
            </span>
          </div>
        </div>
        <Image
          src="/images/mascot-main.png"
          alt="Mascot"
          width={50}
          height={60}
          className="object-contain"
        />
      </div>

      {/* Long-term Goals Grid */}
      {longTermGoals.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 mb-4 relative z-10">
          {longTermGoals.map((goal, index) => (
            <div
              key={index}
              className={`rounded-xl p-4 shadow-lg border-2 flex flex-col items-center gap-2 ${
                goal.goal_type === 'remission' && goal.current_value && goal.current_value >= 6.5
                  ? 'bg-gradient-to-br from-red-100 to-pink-100 border-red-300'
                  : 'bg-gradient-to-br from-blue-100 to-cyan-100 border-blue-300'
              }`}
            >
              {goal.goal_type === 'weight' && <Scale className="h-8 w-8 text-blue-700" />}
              {goal.goal_type === 'glucose' && <Droplet className="h-8 w-8 text-blue-700" />}
              {goal.goal_type === 'medication' && <Pill className="h-8 w-8 text-blue-700" />}
              {goal.goal_type === 'remission' && <Activity className="h-8 w-8 text-red-700" />}
              
              <p className="text-base font-bold text-gray-900 text-center">
                {goal.goal_type === 'weight' && 'น้ำหนักลด'}
                {goal.goal_type === 'glucose' && 'น้ำตาล'}
                {goal.goal_type === 'medication' && 'หยุดยา'}
                {goal.goal_type === 'remission' && 'ภาวะสงบ'}
              </p>
              
              {goal.goal_type === 'weight' && (
                <div className="rounded-full bg-green-200 px-3 py-1">
                  <span className="text-sm font-bold text-green-800">
                    {goal.current_value} {goal.current_unit} → {goal.target_value} {goal.target_unit}
                  </span>
                </div>
              )}
              
              {goal.goal_type === 'glucose' && (
                <div className="text-center">
                  <span className="text-3xl font-bold text-blue-700">{goal.current_value}</span>
                  <span className="text-xs text-gray-600 block">{goal.target_unit}</span>
                </div>
              )}
              
              {goal.goal_type === 'medication' && (
                <div className="text-center">
                  <p className="text-sm text-gray-700">ลด {goal.target_value} ชนิด</p>
                  <div className="flex gap-1 mt-1">
                    <div className="w-6 h-3 bg-blue-500 rounded-full"></div>
                    <div className="w-6 h-3 bg-pink-500 rounded-full"></div>
                    <div className="w-6 h-3 bg-yellow-500 rounded-full"></div>
                  </div>
                </div>
              )}
              
              {goal.goal_type === 'remission' && (
                <div className="text-center">
                  <span className={`text-3xl font-bold ${goal.current_value && goal.current_value < 6.5 ? 'text-green-700' : 'text-red-700'}`}>
                    {goal.current_value}%
                  </span>
                  <p className="text-xs text-gray-600">HbA1c &lt; 6.5%</p>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 shadow-lg border border-white/50 mb-4 text-center relative z-10">
          <p className="text-gray-500">ยังไม่มีเป้าหมายระยะยาว</p>
          <p className="text-xs text-gray-400 mt-1">โค้ชจะกำหนดเป้าหมายให้เร็วๆ นี้</p>
        </div>
      )}

      {/* Weekly Goals - Food */}
      {foodWeeklyGoals.length > 0 && (
        <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg border-2 border-green-300 overflow-hidden mb-3 relative z-10">
          <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-green-400 to-emerald-400">
            <Utensils className="w-5 h-5 text-white" />
            <span className="font-bold text-white text-base">เป้าหมายรายสัปดาห์ - อาหาร</span>
          </div>
          
          <div className="px-4 py-3 space-y-3">
            {foodWeeklyGoals.map((goal, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-base font-bold text-gray-800">{goal.activity_name_th}</p>
                </div>
                <div className="px-3 py-1.5 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-sm font-bold">
                  {goal.target_days} วันต่อสัปดาห์
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weekly Goals - Exercise (พร้อมแสดงเวลา) */}
      {exerciseWeeklyGoals.length > 0 && (
        <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg border-2 border-blue-300 overflow-hidden mb-3 relative z-10">
          <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-400 to-cyan-400">
            <Dumbbell className="w-5 h-5 text-white" />
            <span className="font-bold text-white text-base">ออกกำลังกาย</span>
          </div>
          
          <div className="px-4 py-3 space-y-3">
            {exerciseWeeklyGoals.map((goal, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-base font-bold text-gray-800">{goal.activity_name_th}</p>
                  {/* ✅ แสดงเวลาออกกำลังกาย (ถ้ามี) */}
                  {goal.target_value && goal.target_unit === 'minutes' && (
                    <div className="flex items-center gap-1 mt-1">
                      <Clock className="w-3 h-3 text-blue-600" />
                      <span className="text-xs text-blue-700 font-semibold">
                        {goal.target_value} นาที/วัน
                      </span>
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="px-3 py-1.5 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-sm font-bold mb-1">
                    {goal.target_days} วัน/สัปดาห์
                  </div>
                  {/* ✅ แสดงไอคอนเวลาสำหรับ exercise */}
                  {goal.target_value && goal.target_unit === 'minutes' && (
                    <div className="flex items-center justify-end gap-1 text-xs text-gray-600">
                      <Clock className="w-3 h-3" />
                      <span>{goal.target_value} นาที</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Measurement Goals */}
      {measurementWeeklyGoals.length > 0 && (
        <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg border-2 border-purple-300 overflow-hidden mb-3 relative z-10">
          <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-400 to-pink-400">
            <Activity className="w-5 h-5 text-white" />
            <div>
              <span className="font-bold text-white text-base">วัดและบันทึก</span>
              <p className="text-xs text-white/90">ติดตามสุขภาพประจำวัน</p>
            </div>
          </div>
          
          <div className="px-4 py-3">
            {measurementWeeklyGoals.map((goal, index) => (
              <div key={index} className="flex items-center justify-between mb-3 last:mb-0">
                <div className="flex-1">
                  <p className="text-base font-bold text-gray-800">{goal.activity_name_th}</p>
                </div>
                <div className="px-3 py-1.5 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-sm font-bold">
                  {goal.target_days} วันต่อสัปดาห์
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rest */}
      {restWeeklyGoals.length > 0 && (
        <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg border-2 border-purple-300 overflow-hidden mb-3 relative z-10">
          <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-400 to-pink-400">
            <Moon className="w-5 h-5 text-white" />
            <div>
              <span className="font-bold text-white text-base">พักผ่อน</span>
              <p className="text-xs text-white/90">นอนหลับเพียงพอ</p>
            </div>
          </div>
          
          <div className="px-4 py-3">
            {restWeeklyGoals.map((goal, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-base font-bold text-gray-800">{goal.activity_name_th}</p>
                </div>
                <div className="px-3 py-1.5 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-sm font-bold">
                  {goal.target_days} วันต่อสัปดาห์
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Motivation Message */}
      <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl p-4 shadow-lg text-white relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <p className="font-bold text-sm">พยายามต่อไป!</p>
            <p className="text-xs text-white/90">ทุกก้าวเล็กๆ นำไปสู่สุขภาพที่ดีขึ้น</p>
          </div>
        </div>
      </div>
    </div>
  );
}