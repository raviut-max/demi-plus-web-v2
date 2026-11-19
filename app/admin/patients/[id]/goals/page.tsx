// app/admin/patients/[id]/goals/page.tsx
// ✅ แก้ไขล่าสุด: เพิ่มการรองรับ from=care-pathway เพื่อให้ปุ่มกลับทำงานถูกต้อง
'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import {
  checkSession,
  logout,
  getPatientDetail,
  getUserHospitalInfo,
  isSuperAdmin,
  isHospitalAdmin,
  getPatientGoals,
  getGoalRoundCount,
  createDefaultGoals,
  getPatientRecords
} from '@/lib/supabase/queries';
import {
  ArrowLeft, Target, Calendar, Edit, LogOut, Activity, ClipboardCheck,
  FileText, Phone, User, Heart, Hospital, Shield, Building2, Route,
  Plus, CheckCircle, XCircle, Clock, History, ChevronDown, ChevronUp,
  TrendingUp, Award
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

export default function PatientGoalsPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const patientId = params.id as string;
  
  // ✅ อ่านค่า from parameter เพื่อกลับให้ถูกหน้า
  const from = searchParams.get('from');

  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<any>(null);
  
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [goals, setGoals] = useState<any[]>([]);
  const [goalRounds, setGoalRounds] = useState(1);
  const [selectedRound, setSelectedRound] = useState(1);
  const [records, setRecords] = useState<any[]>([]);
  const [creatingGoals, setCreatingGoals] = useState(false);

  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }
    if (!['admin', 'doctor', 'helper', 'osm'].includes(userData.role)) {
      alert('ไม่มีสิทธิ์เข้าถึง');
      router.push('/admin/login');
      return;
    }
    setUser(userData);
    loadUserHospital(userData.id);
    loadData();
  }, [router]);

  const loadUserHospital = async (userId: string) => {
    try {
      const hospitalInfo = await getUserHospitalInfo(userId);
      setUserHospital(hospitalInfo);
    } catch (error) {
      console.error('❌ [loadUserHospital] Error:', error);
    }
  };

  const loadData = async () => {
    try {
      console.log('📡 Loading patient detail:', patientId);
      const patientData = await getPatientDetail(patientId);
      setPatient(patientData);

      const rounds = await getGoalRoundCount(patientId);
      setGoalRounds(rounds);
      
      await loadGoals(selectedRound);
      await loadRecords();
    } catch (error) {
      console.error('❌ Error loading data:', error);
      alert('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  const loadGoals = async (round: number) => {
    try {
      const { data, error } = await supabase
        .from('goals')
        .select(`*, activities ( activity_code, activity_name_th, description_th )`)
        .eq('user_id', patientId)
        .eq('round_number', round)
        .eq('goal_type', 'weekly_activity')
        .eq('status', activeTab === 'active' ? 'active' : 'archived')
        .order('priority', { ascending: true });

      if (error) throw error;
      setGoals(data || []);
    } catch (err) {
      console.error('❌ [loadGoals] Error:', err);
      setGoals([]);
    }
  };

  const loadRecords = async () => {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 90);
      const { data, error } = await supabase
        .from('records')
        .select(`*, activities ( activity_code, activity_name_th )`)
        .eq('user_id', patientId)
        .gte('record_date', startDate.toISOString())
        .order('record_date', { ascending: false });

      if (error) throw error;
      setRecords(data || []);
    } catch (err) {
      console.error('❌ [loadRecords] Error:', err);
      setRecords([]);
    }
  };

  useEffect(() => {
    if (patientId) loadGoals(selectedRound);
  }, [selectedRound, activeTab, patientId]);

  const handleCreateDefaultGoals = async () => {
    if (!patient) return;
    if (!confirm('ต้องการสร้างเป้าหมายเริ่มต้นตาม PAM Level หรือไม่?\n\nL2/L3: กฎทอง 5 ข้อ\nL4: แชมป์ 8 กิจกรรม')) {
      return;
    }
    setCreatingGoals(true);
    try {
      const result = await createDefaultGoals(patientId, patient.pam_level || 'L2', user.id);
      if (result.success) {
        alert(`✅ สร้างเป้าหมายสำเร็จ!\n\nจำนวน: ${result.count || 0} กิจกรรม`);
        setGoalRounds(prev => prev + 1);
        setSelectedRound(prev => prev + 1);
        setActiveTab('active');
        loadData();
      } else {
        alert('เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error: any) {
      console.error('❌ [handleCreateDefaultGoals] Error:', error);
      alert(error.message || 'เกิดข้อผิดพลาดในการสร้างเป้าหมาย');
    } finally {
      setCreatingGoals(false);
    }
  };

  const handleArchiveRound = async () => {
    if (!confirm('ต้องการเก็บถาวรเป้าหมายรอบปัจจุบันหรือไม่?')) return;
    try {
      const { error } = await supabase
        .from('goals')
        .update({ is_current: false, status: 'archived', updated_at: new Date().toISOString() })
        .eq('user_id', patientId)
        .eq('round_number', selectedRound)
        .eq('goal_type', 'weekly_activity')
        .eq('status', 'active');

      if (error) throw error;
      alert('✅ เก็บถาวรเป้าหมายสำเร็จ!');
      loadData();
    } catch (err) {
      console.error('❌ [handleArchiveRound] Error:', err);
      alert('เกิดข้อผิดพลาดในการเก็บถาวร');
    }
  };

  // ✅ ปุ่มกลับที่ตรวจสอบ from parameter
  const handleBack = () => {
    if (from === 'care-pathway') {
      router.push(`/admin/patients/${patientId}/care-pathway`);
    } else {
      router.push(`/admin/patients/${patientId}`);
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
          {/* ✅ ปุ่มกลับที่ตรวจสอบ from parameter */}
          <button onClick={handleBack} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4">
            <ArrowLeft className="w-4 h-4" />
            กลับ{from === 'care-pathway' ? ' Care Pathway' : 'หน้าผู้ป่วย'}
          </button>
          
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">🎯 เป้าหมายและแผนสุขภาพ</h1>
              <p className="text-gray-600">
                ผู้ป่วย: {patient?.first_name} {patient?.last_name} | 
                HN: {patient?.hospital_number} | 
                PAM: {patient?.pam_level || 'L1'}
              </p>
            </div>
            
            {/* User Info Card */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <Shield className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold text-gray-800 text-sm">
                      {user?.full_name_th || 'ผู้ใช้งาน'}
                    </h3>
                    {user && (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        isSuperAdmin(user) ? 'bg-purple-200 text-purple-800' :
                        isHospitalAdmin(user) ? 'bg-blue-200 text-blue-800' :
                        user.role === 'doctor' ? 'bg-green-200 text-green-800' :
                        user.role === 'helper' ? 'bg-yellow-200 text-yellow-800' :
                        'bg-gray-200 text-gray-800'
                      }`}>
                        {isSuperAdmin(user) ? '👑 Super Admin' :
                         isHospitalAdmin(user) ? '🏥 Hospital Admin' :
                         user.role === 'doctor' ? '👨‍⚕️ แพทย์' :
                         user.role === 'helper' ? '👩‍💼 เจ้าหน้าที่' : '🏘️ อสม.'}
                      </span>
                    )}
                  </div>
                  {userHospital && (
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center gap-1.5 text-gray-600">
                        <Hospital className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                        <span className="truncate font-medium">{userHospital.name}</span>
                      </div>
                      {userHospital.type === 'sub' && userHospital.parent_hospital && (
                        <div className="flex items-center gap-1.5 text-green-600">
                          <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate">ลูกข่าย: {userHospital.parent_hospital.name}</span>
                        </div>
                      )}
                      {userHospital.type === 'main' && (
                        <div className="flex items-center gap-1.5 text-purple-600">
                          <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>แม่ข่าย</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => router.push(`/admin/patients/${patientId}/edit`)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all"
              >
                <Edit className="w-4 h-4" />
                แก้ไขข้อมูล
              </button>
              <button
                onClick={() => { logout(); router.push('/admin/login'); }}
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
        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={handleCreateDefaultGoals}
            disabled={creatingGoals}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {creatingGoals ? 'กำลังสร้าง...' : 'สร้างเป้าหมายเริ่มต้น'}
          </button>
          {activeTab === 'active' && goals.length > 0 && (
            <button
              onClick={handleArchiveRound}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-all"
            >
              <History className="w-4 h-4" />
              เก็บถาวรรอบนี้
            </button>
          )}
          <button
            onClick={() => router.push(`/admin/patients/${patientId}/care-pathway`)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all"
          >
            <Route className="w-4 h-4" />
            เส้นทางสุขภาพ (Care Pathway)
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-6 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              activeTab === 'active' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            🎯 เป้าหมายปัจจุบัน (รอบที่ {selectedRound})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 font-medium border-b-2 transition-colors ${
              activeTab === 'history' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            📜 ประวัติเป้าหมาย
          </button>
        </div>

        {/* Active Tab Content */}
        {activeTab === 'active' && (
          <div className="space-y-6">
            {goals.length === 0 ? (
              <div className="bg-white rounded-xl shadow-lg p-12 border border-gray-200 text-center">
                <Target className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <h3 className="text-xl font-bold text-gray-800 mb-2">ยังไม่มีเป้าหมายในรอบนี้</h3>
                <p className="text-gray-500 mb-6">กดปุ่ม "สร้างเป้าหมายเริ่มต้น" เพื่อกำหนดเป้าหมายตามระดับ PAM</p>
                <button
                  onClick={handleCreateDefaultGoals}
                  disabled={creatingGoals}
                  className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all disabled:opacity-50"
                >
                  {creatingGoals ? 'กำลังสร้าง...' : 'สร้างเป้าหมายเริ่มต้น'}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {goals.map((goal) => {
                  const activityRecords = records.filter(r => r.activity_id === goal.activity_id);
                  const completedCount = activityRecords.filter(r => r.is_completed).length;
                  const totalCount = activityRecords.length;
                  const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

                  return (
                    <div key={goal.id} className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                            {goal.activities?.activity_name_th || goal.goal_name_th}
                          </h3>
                          <p className="text-sm text-gray-500 mt-1">{goal.activities?.description_th || goal.description_th}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-2xl font-bold text-blue-600">{percentage}%</span>
                          <p className="text-xs text-gray-500">ความสำเร็จ</p>
                        </div>
                      </div>
                      
                      <div className="mb-4">
                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                          <span>เป้าหมาย: {goal.target_days} วัน/สัปดาห์</span>
                          <span>ทำสำเร็จ: {completedCount} / {totalCount} ครั้ง</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3">
                          <div 
                            className={`h-3 rounded-full transition-all ${
                              percentage >= 80 ? 'bg-green-500' : percentage >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${percentage}%` }}
                          ></div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => router.push(`/admin/patients/${patientId}/records?activity_id=${goal.activity_id}`)}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-all text-sm font-medium"
                        >
                          <FileText className="w-4 h-4" />
                          บันทึกกิจกรรม
                        </button>
                        <button
                          onClick={() => router.push(`/admin/patients/${patientId}/records?activity_id=${goal.activity_id}&view=history`)}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 transition-all text-sm font-medium"
                        >
                          <History className="w-4 h-4" />
                          ดูประวัติ
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* History Tab Content */}
        {activeTab === 'history' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-800">ประวัติรอบเป้าหมาย</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">รอบที่</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">วันที่สร้าง</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">จำนวนเป้าหมาย</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {Array.from({ length: Math.max(1, goalRounds - 1) }, (_, i) => i + 1).reverse().map((round) => (
                    <tr key={round} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-800">รอบที่ {round}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">-</td>
                      <td className="px-6 py-4 text-sm text-gray-600">-</td>
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                          เก็บถาวร
                        </span>
                      </td>
                    </tr>
                  ))}
                  {goalRounds <= 1 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                        ยังไม่มีประวัติรอบเป้าหมาย
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}