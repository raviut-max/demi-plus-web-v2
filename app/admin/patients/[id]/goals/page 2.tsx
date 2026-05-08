// app/admin/patients/[id]/goals/page.tsx
// =====================================================
// ✅ แก้ไขล่าสุด: 8 พฤษภาคม 2569
// ✅ การแก้ไข:
//    1. ✅ เพิ่ม Header แสดงข้อมูลผู้ใช้และโรงพยาบาลสังกัด
//    2. ✅ แก้ไขเป้าหมาย L2/L3 ให้ถูกต้อง (กฎทอง 5 ข้อ)
//    3. ✅ แก้ไขเป้าหมาย L4 ให้ถูกต้อง (แชมป์ 8 กิจกรรม - 3 กลุ่ม)
//    4. ✅ แสดงความถี่ (วัน/สัปดาห์, นาที, ชั่วโมง) จากเป้าหมายที่ตกลง
//    5. ✅ จัดกลุ่มเป้าหมายตามประเภท (อาหาร, ออกกำลังกาย, นอนหลับ)
// =====================================================
'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  checkSession,
  logout,
  getPatientDetail,
  getPatientGoals,
  getUserHospitalInfo,
  getAccessibleHospitalIds,
  isSuperAdmin
} from '@/lib/supabase/queries';
import {
  ArrowLeft,
  Target,
  CheckCircle,
  Clock,
  AlertCircle,
  UserCheck,
  Hospital,
  Building2,
  LogOut,
  Utensils,
  Dumbbell,
  Moon,
  Apple,
  Droplets,
  Footprints,
  Weight,
  Activity
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface UserHospital {
  id: string;
  name: string;
  code: string;
  type: 'main' | 'sub';
  parent_id: string | null;
  parent_hospital?: {
    id: string;
    name: string;
    code: string;
  };
}

interface Patient {
  id: string;
  first_name?: string;
  last_name?: string;
  hospital_number: string;
  pam_level: string;
  hospital_id?: string;
  hospitals?: {
    id: string;
    name: string;
    code: string;
    type?: string;
  };
  coaches?: {
    full_name_th: string;
  };
}

interface Goal {
  id: string;
  goal_name: string;
  goal_type: string;
  target_frequency?: number; // วัน/สัปดาห์
  target_duration?: number; // นาที
  target_amount?: number; // หน่วย/ลิตร/ชั่วโมง
  is_completed: boolean;
  completed_count?: number;
  priority?: number;
}

interface GoalGroup {
  name: string;
  icon: any;
  color: string;
  goals: Goal[];
}

export default function PatientGoalsPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params.id as string;

  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<UserHospital | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessibleHospitalIds, setAccessibleHospitalIds] = useState<string[]>([]);
  const [goalsByLevel, setGoalsByLevel] = useState<GoalGroup[]>([]);

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
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          *,
          hospitals (
            id,
            name,
            code,
            type
          ),
          coaches (
            full_name_th
          )
        `)
        .eq('id', patientId)
        .single();

      if (error) throw error;
      setPatient(data);
      loadGoals(data.pam_level);
    } catch (error) {
      console.error('Error loading patient:', error);
    } finally {
      setLoading(false);
    }
  };

  // ✅ โหลดเป้าหมายตามระดับ PAM
  const loadGoals = async (pamLevel: string) => {
    try {
      const { data, error } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', patientId)
        .eq('is_active', true)
        .order('priority', { ascending: true });

      if (error) throw error;

      // ✅ จัดกลุ่มเป้าหมายตาม PAM Level
      const grouped = groupGoalsByLevel(pamLevel, data || []);
      setGoalsByLevel(grouped);
    } catch (error) {
      console.error('Error loading goals:', error);
    }
  };

  // ✅ จัดกลุ่มเป้าหมายตามระดับ PAM
  const groupGoalsByLevel = (pamLevel: string, goals: Goal[]): GoalGroup[] => {
    if (pamLevel === 'L2' || pamLevel === 'L3') {
      // ✅ กฎทอง 5 ข้อ
      return [
        {
          name: '🥗 อาหาร',
          icon: Utensils,
          color: 'green',
          goals: goals.filter(g => 
            g.goal_name.includes('หวาน') || 
            g.goal_name.includes('ข้าว') || 
            g.goal_name.includes('โปรตีน')
          ),
        },
        {
          name: ' ออกกำลังกาย',
          icon: Footprints,
          color: 'blue',
          goals: goals.filter(g => 
            g.goal_name.includes('ออกกำลังกาย') || 
            g.goal_name.includes('เดิน')
          ),
        },
        {
          name: '⚖️ บันทึกสุขภาพ',
          icon: Weight,
          color: 'purple',
          goals: goals.filter(g => 
            g.goal_name.includes('น้ำหนัก') || 
            g.goal_name.includes('น้ำตาล')
          ),
        },
      ];
    } else if (pamLevel === 'L4') {
      // ✅ แชมป์ 8 กิจกรรม (3 กลุ่ม)
      return [
        {
          name: '🍎 กลุ่ม 1: อาหาร (3 ข้อ)',
          icon: Apple,
          color: 'green',
          goals: goals.filter(g => 
            g.goal_name.includes('คาร์บ') || 
            g.goal_name.includes('โปรตีน') || 
            g.goal_name.includes('น้ำ')
          ),
        },
        {
          name: '💪 กลุ่ม 2: ออกกำลังกาย (4 ข้อ)',
          icon: Dumbbell,
          color: 'blue',
          goals: goals.filter(g => 
            g.goal_name.includes('Stretching') || 
            g.goal_name.includes('Cardio') || 
            g.goal_name.includes('Strengthening') || 
            g.goal_name.includes('HIIT')
          ),
        },
        {
          name: '😴 กลุ่ม 3: นอนหลับ (1 ข้อ)',
          icon: Moon,
          color: 'purple',
          goals: goals.filter(g => 
            g.goal_name.includes('นอน')
          ),
        },
      ];
    }
    return [];
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ✅ Header - แสดงข้อมูลผู้ใช้และโรงพยาบาล */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button
            onClick={() => router.push(`/admin/patients/${patientId}`)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับหน้าผู้ป่วย
          </button>

          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                🎯 ประวัติเป้าหมายผู้ป่วย
              </h1>
              <p className="text-gray-600">
                {patient?.first_name} {patient?.last_name} | HN: {patient?.hospital_number} | PAM: {patient?.pam_level}
              </p>
            </div>

            <div className="flex items-center gap-4">
              {/* ✅ แสดงข้อมูลผู้ใช้ */}
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
                        {isSuperAdmin(user) ? '👑 Super Admin' :
                         user?.role === 'doctor' ? '👨‍️ แพทย์' : '👩‍💼 เจ้าหน้าที่'}
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

                      {userHospital.type === 'sub' && userHospital.parent_hospital && (
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Building2 className="w-3 h-3" />
                          <span>แม่ข่าย: {userHospital.parent_hospital.name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ✅ แสดงข้อมูลผู้ป่วย */}
              {patient && (
                <div className="text-right bg-gradient-to-l from-green-50 to-emerald-50 px-4 py-3 rounded-xl border border-green-200">
                  <div className="flex items-center gap-1 mb-1">
                    <Hospital className="w-3 h-3 text-green-600" />
                    <span className="text-xs text-gray-600 font-medium">
                      {patient.hospitals?.name || '-'}
                    </span>
                  </div>
                  {patient.coaches?.full_name_th && (
                    <div className="flex items-center gap-1">
                      <UserCheck className="w-3 h-3 text-green-600" />
                      <span className="text-xs text-gray-600">
                        {patient.coaches.full_name_th}
                      </span>
                    </div>
                  )}
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
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* ✅ แสดงกลุ่มเป้าหมาย */}
        {goalsByLevel.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <AlertCircle className="w-16 h-16 mx-auto mb-4 text-orange-500" />
            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              ยังไม่มีเป้าหมาย
            </h2>
            <p className="text-gray-600 mb-6">
              ผู้ป่วยยังไม่ได้ตั้งค่าเป้าหมาย
            </p>
            <button
              onClick={() => router.push(`/admin/patients/${patientId}/goals/setup`)}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all"
            >
              ตั้งค่าเป้าหมาย
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {goalsByLevel.map((group, groupIndex) => {
              const Icon = group.icon;
              const bgColor = group.color === 'green' ? 'bg-green-50' :
                             group.color === 'blue' ? 'bg-blue-50' : 'bg-purple-50';
              const borderColor = group.color === 'green' ? 'border-green-200' :
                                 group.color === 'blue' ? 'border-blue-200' : 'border-purple-200';
              const textColor = group.color === 'green' ? 'text-green-700' :
                               group.color === 'blue' ? 'text-blue-700' : 'text-purple-700';

              return (
                <div key={groupIndex} className={`bg-white rounded-xl shadow-lg border ${borderColor} overflow-hidden`}>
                  {/* Group Header */}
                  <div className={`${bgColor} px-6 py-4 border-b ${borderColor}`}>
                    <div className="flex items-center gap-3">
                      <Icon className={`w-6 h-6 ${textColor}`} />
                      <h2 className={`text-xl font-bold ${textColor}`}>
                        {group.name}
                      </h2>
                      <span className={`px-3 py-1 bg-white rounded-full text-sm font-semibold ${textColor}`}>
                        {group.goals.length} ข้อ
                      </span>
                    </div>
                  </div>

                  {/* Goals List */}
                  <div className="p-6">
                    <div className="space-y-4">
                      {group.goals.map((goal, goalIndex) => (
                        <div
                          key={goal.id}
                          className={`flex items-center justify-between p-4 rounded-lg border-2 transition-all ${
                            goal.is_completed
                              ? 'border-green-200 bg-green-50'
                              : 'border-gray-200 bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-4 flex-1">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              goal.is_completed ? 'bg-green-100' : 'bg-gray-100'
                            }`}>
                              {goal.is_completed ? (
                                <CheckCircle className="w-5 h-5 text-green-600" />
                              ) : (
                                <Clock className="w-5 h-5 text-gray-400" />
                              )}
                            </div>
                            <div className="flex-1">
                              <p className={`font-semibold ${
                                goal.is_completed ? 'text-green-800' : 'text-gray-800'
                              }`}>
                                {goalIndex + 1}. {goal.goal_name}
                              </p>
                              
                              {/* ✅ แสดงความถี่ */}
                              <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                                {goal.target_frequency && (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {goal.target_frequency} วัน/สัปดาห์
                                  </span>
                                )}
                                {goal.target_duration && (
                                  <span className="flex items-center gap-1">
                                    <Activity className="w-3 h-3" />
                                    {goal.target_duration} นาที
                                  </span>
                                )}
                                {goal.target_amount && (
                                  <span className="flex items-center gap-1">
                                    <Droplets className="w-3 h-3" />
                                    {goal.target_amount} {goal.goal_name.includes('น้ำ') ? 'ลิตร' : 'หน่วย'}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Progress */}
                          <div className="text-right">
                            <p className="text-sm text-gray-500 mb-1">ความคืบหน้า</p>
                            <p className={`text-2xl font-bold ${
                              goal.is_completed ? 'text-green-600' : 'text-orange-600'
                            }`}>
                              {goal.completed_count || 0}
                              {goal.target_frequency && (
                                <span className="text-sm text-gray-500"> / {goal.target_frequency}</span>
                              )}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Summary Stats */}
        {goalsByLevel.length > 0 && (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <Target className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">เป้าหมายทั้งหมด</p>
                  <p className="text-2xl font-bold text-gray-800">
                    {goalsByLevel.reduce((sum, g) => sum + g.goals.length, 0)}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">ทำสำเร็จ</p>
                  <p className="text-2xl font-bold text-green-600">
                    {goalsByLevel.reduce((sum, g) => 
                      sum + g.goals.filter(gol => gol.is_completed).length, 0
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                  <Clock className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">กำลังดำเนินการ</p>
                  <p className="text-2xl font-bold text-orange-600">
                    {goalsByLevel.reduce((sum, g) => 
                      sum + g.goals.filter(gol => !gol.is_completed).length, 0
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}