// app/admin/patients/[id]/page.tsx
// ✅ แก้ไขล่าสุด: 22 เมษายน 2569
// ✅ การแก้ไข: แก้ไขการตรวจสอบสถานะการประเมิน - เปลี่ยนจาก pam_score → pam_total_score

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  checkSession,
  logout,
  getPatientDetail,
  getPatientGoals,
  getGoalRoundCount,
  createDefaultGoals,
  getProgress
} from '@/lib/supabase/queries';
import {
  ArrowLeft,
  Target,
  TrendingUp,
  Calendar,
  CheckCircle,
  Clock,
  Archive,
  Award,
  RefreshCw,
  AlertCircle,
  FileText,
  ChevronDown,
  ChevronUp,
  Edit,
  LogOut,
  Activity,
  ClipboardCheck
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

type ViewMode = 'goals' | 'weekly' | 'calendar';

interface GoalRecord {
  date: string;
  isCompleted: boolean;
  notes?: string;
}

interface GoalWithRecords {
  goal: any;
  completedCount: number;
  notCompletedCount: number;
  records: GoalRecord[];
  percentage: number;
}

export default function PatientDetailPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params.id as string;
  
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<any>(null);
  const [goals, setGoals] = useState<any[]>([]);
  const [goalRounds, setGoalRounds] = useState(1);
  const [selectedRound, setSelectedRound] = useState(1);
  const [records, setRecords] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('goals');
  const [creatingGoals, setCreatingGoals] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(new Date());
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set());
  
  // ✅ State สำหรับตรวจสอบการประเมิน
  const [hasBaseline, setHasBaseline] = useState(false);
  const [hasCompletedAppointment, setHasCompletedAppointment] = useState(false);
  const [hasPamAssessment, setHasPamAssessment] = useState(false);

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
    loadData();
  }, [router]);

  const loadData = async () => {
    try {
      const patientData = await getPatientDetail(patientId);
      setPatient(patientData);

      const rounds = await getGoalRoundCount(patientId);
      setGoalRounds(rounds);

      await loadGoals(selectedRound);
      await loadRecords();
      
      // ✅ ตรวจสอบสถานะการประเมิน
      await checkAssessmentStatus(patientId);
    } catch (error) {
      console.error('Error loading data:', error);
      alert('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  // ✅ ฟังก์ชันตรวจสอบสถานะการประเมิน (แก้ไขแล้ว)
  const checkAssessmentStatus = async (pid: string) => {
    try {
      console.log('🔍 Checking assessment status for patient:', pid);
      
      // ตรวจสอบ Baseline
      const { data: baselineData } = await supabase
        .from('baseline')
        .select('id')
        .eq('user_id', pid)
        .single();
      
      const hasBaselineData = !!baselineData;
      console.log('📋 Has baseline:', hasBaselineData);
      setHasBaseline(hasBaselineData);

      // ตรวจสอบ Completed Appointments
      const { data: appointmentsData } = await supabase
        .from('appointments')
        .select('id')
        .eq('user_id', pid)
        .eq('status', 'completed')
        .limit(1);
      
      const hasCompletedAppt = (appointmentsData?.length || 0) > 0;
      console.log('📋 Has completed appointments:', hasCompletedAppt);
      setHasCompletedAppointment(hasCompletedAppt);

      // ✅ แก้ไข: ตรวจสอบ PAM Assessment (จาก screenings)
      // เปลี่ยนจาก pam_score → pam_total_score
      const { data: screeningData } = await supabase
        .from('screenings')
        .select('id, pam_total_score')
        .eq('user_id', pid)
        .not('pam_total_score', 'is', null)
        .limit(1);
      
      const hasPamData = (screeningData?.length || 0) > 0;
      console.log('📋 Has PAM assessment:', hasPamData, screeningData);
      setHasPamAssessment(hasPamData);
      
    } catch (error) {
      console.error('❌ Error checking assessment status:', error);
    }
  };

  // ✅ ฟังก์ชันจัดการคลิกปุ่มความคืบหน้า (สีส้ม) - แค่เตือน แต่ยังให้เข้าได้
  const handleViewProgress = () => {
    // ✅ ตรวจสอบว่ามีการประเมินหรือยัง (แค่เตือน แต่ยังคงให้เข้าได้)
    if (!hasPamAssessment && !hasBaseline) {
      alert('⚠️ ผู้ป่วยคนนี้ยังไม่ได้ทำการประเมิน\n\nแนะนำให้ทำการประเมิน PAM/PROMs ก่อนสร้างเป้าหมาย\n\nคุณสามารถไปสร้างเป้าหมายก่อนได้ แต่ควรทำการประเมินโดยเร็ว');
      // ✅ ยังคงนำทางไปหน้า goals
    }

    // ✅ นำทางไปหน้า goals เสมอ
    router.push(`/admin/patients/${patientId}/goals`);
  };

  const loadGoals = async (round: number) => {
    try {
      const { data, error } = await supabase
        .from('goals')
        .select(`*, activities ( activity_name_th, description_th )`)
        .eq('user_id', patientId)
        .eq('round_number', round)
        .order('priority', { ascending: true });

      if (error) throw error;
      setGoals(data || []);
    } catch (error) {
      console.error('Error loading goals:', error);
    }
  };

  const loadRecords = async () => {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);

      const { data, error } = await supabase
        .from('records')
        .select(`
          *,
          activities (
            activity_code,
            activity_name_th
          )
        `)
        .eq('user_id', patientId)
        .gte('record_date', startDate.toISOString())
        .order('record_date', { ascending: false });

      if (error) throw error;
      setRecords(data || []);
    } catch (error) {
      console.error('Error loading records:', error);
    }
  };

  const handleRoundChange = (round: number) => {
    setSelectedRound(round);
    loadGoals(round);
  };

  const handleCreateDefaultGoals = async () => {
    if (!patient) return;
    if (!confirm('ต้องการสร้างเป้าหมายเริ่มต้นตาม PAM Level หรือไม่?\n\nL2/L3: กฎทอง 5 ข้อ\nL4: แชมป์ 8 กิจกรรม')) {
      return;
    }

    setCreatingGoals(true);

    try {
      const result = await createDefaultGoals(
        patientId,
        patient.pam_level || 'L2',
        user.id
      );

      if (result.success) {
        alert(`✅ สร้างเป้าหมายสำเร็จ!\n\nจำนวน: ${result.count || 0} กิจกรรม`);
        loadData();
      } else {
        alert('เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error: any) {
      console.error('Error creating goals:', error);
      alert(error.message || 'เกิดข้อผิดพลาดในการสร้างเป้าหมาย');
    } finally {
      setCreatingGoals(false);
    }
  };

  const handleArchiveCurrentRound = async () => {
    if (!confirm('ต้องการเก็บถาวรเป้าหมายรอบปัจจุบันหรือไม่?')) {
      return;
    }
    try {
      const { error } = await supabase
        .from('goals')
        .update({
          is_current: false,
          status: 'archived',
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', patientId)
        .eq('goal_type', 'weekly_activity')
        .eq('status', 'active');

      if (error) throw error;

      alert('✅ เก็บถาวรเป้าหมายสำเร็จ!');
      loadData();
    } catch (error) {
      console.error('Error archiving goals:', error);
      alert('เกิดข้อผิดพลาดในการเก็บถาวร');
    }
  };

  const toggleGoalExpansion = (goalKey: string) => {
    const newExpanded = new Set(expandedGoals);
    if (newExpanded.has(goalKey)) {
      newExpanded.delete(goalKey);
    } else {
      newExpanded.add(goalKey);
    }
    setExpandedGoals(newExpanded);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return '🟢 กำลังดำเนินการ';
      case 'completed':
        return '✅ สำเร็จ';
      case 'archived':
        return '📦 เก็บถาวร';
      default:
        return status;
    }
  };

  const getGoalIcon = (goalName: string) => {
    if (goalName?.includes('sweet')) return '🍬';
    if (goalName?.includes('rice') || goalName?.includes('carb')) return '🍚';
    if (goalName?.includes('protein') || goalName?.includes('vegetable')) return '🥗';
    if (goalName?.includes('exercise') || goalName?.includes('walk')) return '🚶';
    if (goalName?.includes('weight') || goalName?.includes('sugar')) return '⚖️';
    if (goalName?.includes('water')) return '💧';
    if (goalName?.includes('sleep')) return '😴';
    if (goalName?.includes('cardio')) return '🏃';
    return '🎯';
  };

  // 🎯 จัดกลุ่มเป้าหมายและคำนวณสถิติ
  const getGroupedGoals = (): GoalWithRecords[] => {
    const grouped: Record<string, any[]> = {};
    goals.forEach(goal => {
      const key = goal.goal_name || goal.activity_id;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(goal);
    });

    const goalGroups = Object.values(grouped).sort((a, b) => {
      const priorityA = a[0]?.priority || 999;
      const priorityB = b[0]?.priority || 999;
      return priorityA - priorityB;
    });

    return goalGroups.map(goalGroup => {
      const firstGoal = goalGroup[0];
      
      const goalRecords = records.filter(record => 
        record.activity_id === firstGoal.activity_id || 
        record.activities?.activity_code === firstGoal.goal_name
      );

      const completedRecords = goalRecords.filter(r => r.is_completed);
      const notCompletedRecords = goalRecords.filter(r => !r.is_completed);

      const formattedRecords: GoalRecord[] = [
        ...completedRecords.map(r => ({
          date: r.record_date,
          isCompleted: true,
          notes: r.notes,
        })),
        ...notCompletedRecords.map(r => ({
          date: r.record_date,
          isCompleted: false,
          notes: r.notes,
        })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      const totalRecords = goalRecords.length;
      const percentage = totalRecords > 0 
        ? Math.round((completedRecords.length / totalRecords) * 100) 
        : 0;

      return {
        goal: firstGoal,
        completedCount: completedRecords.length,
        notCompletedCount: notCompletedRecords.length,
        records: formattedRecords,
        percentage,
      };
    });
  };

  const groupedGoals = getGroupedGoals();

  const stats = {
    total: goals.length,
    completed: goals.filter(g => g.is_completed).length,
    active: goals.filter(g => g.status === 'active').length,
    progress: goals.length > 0 ? Math.round((goals.filter(g => g.is_completed).length / goals.length) * 100) : 0,
  };

  const getWeeklyData = () => {
    const weekData = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayRecords = records.filter(r => r.record_date?.startsWith(dateStr));
      
      weekData.push({
        date: dateStr,
        dayName: date.toLocaleDateString('th-TH', { weekday: 'short' }),
        dayNumber: date.getDate(),
        records: dayRecords,
        completed: dayRecords.filter(r => r.is_completed).length,
        total: goals.length,
      });
    }

    return weekData;
  };

  const getCalendarData = () => {
    const today = new Date();
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayRecords = records.filter(r => r.record_date?.startsWith(dateStr));
      const completedCount = dayRecords.filter(r => r.is_completed).length;
      const totalCount = goals.length || 5;
      const percentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
      
      days.push({
        date: dateStr,
        dayNumber: date.getDate(),
        month: date.getMonth(),
        dayOfWeek: date.getDay(),
        completedCount,
        totalCount,
        percentage,
        color: percentage >= 80 ? 'bg-green-500' :
               percentage >= 50 ? 'bg-green-300' :
               percentage >= 20 ? 'bg-yellow-300' :
               'bg-gray-200',
      });
    }

    return days;
  };

  const weeklyData = getWeeklyData();
  const calendarData = getCalendarData();

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
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
            onClick={() => router.push('/admin/patients')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับรายการผู้ป่วย
          </button>
          
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                📋 รายละเอียดผู้ป่วย
              </h1>
              <p className="text-gray-600">
                HN: {patient?.hospital_number} | 
                {patient?.first_name} {patient?.last_name} | 
                PAM: {patient?.pam_level || 'L1'}
              </p>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => router.push(`/admin/patients/${patientId}/edit`)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all"
              >
                <Edit className="w-4 h-4" />
                แก้ไขข้อมูล
              </button>
              
              {/* ✅ แสดงปุ่ม "มีการติดตามแล้ว" ถ้ามีการประเมินแล้ว */}
              {(hasBaseline || hasCompletedAppointment || hasPamAssessment) && (
                <div className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-lg border border-green-200">
                  <ClipboardCheck className="w-4 h-4" />
                  <span>มีการติดตามแล้ว</span>
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
        
        {/* 
        ========================================
        ✅ SUMMARY CARDS - ปุ่มนำทางหลัก 4 ปุ่ม
        ========================================
        */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          
          {/* 
          ========================================
          ✅ 1. ปุ่มสีฟ้า - นัดหมายครั้งถัดไป
          📅 แก้ไข: 22 เม.ย. 2569
          🔗 ลิงก์: /admin/patients/${patientId}/appointments
          📝 คำอธิบาย: คลิกเพื่อดูประวัตินัดหมายทั้งหมดของผู้ป่วยคนนี้
          ========================================
          */}
          <div 
            onClick={() => router.push(`/admin/patients/${patientId}/appointments`)}
            className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl shadow-lg p-6 cursor-pointer hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90 mb-1">นัดหมายครั้งถัดไป</p>
                <p className="text-2xl font-bold">28 เม.ย.</p>
                <p className="text-xs opacity-75 mt-1">17:26</p>
              </div>
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                <Calendar className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* 
          ========================================
          ✅ 2. ปุ่มสีเขียว - การประเมินล่าสุด (ประวัติการติดตาม)
          📅 แก้ไข: 22 เม.ย. 2569 (10:00) - แก้ไขใหม่
          🔗 ลิงก์: /admin/patients/${patientId}/screening-history
          📝 คำอธิบาย: คลิกเพื่อดูประวัติการประเมิน/ติดตามทั้งหมด (PAM, PROMs, Screening)
          ========================================
          */}
          <div 
            onClick={() => router.push(`/admin/patients/${patientId}/screening-history`)}
            className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl shadow-lg p-6 cursor-pointer hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90 mb-1">การประเมินล่าสุด</p>
                <p className="text-2xl font-bold">{hasPamAssessment ? 'มีการประเมิน' : 'ยังไม่ประเมิน'}</p>
                <p className="text-xs opacity-75 mt-1">{hasPamAssessment ? '1 ครั้ง' : '0 ครั้ง'}</p>
              </div>
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                <FileText className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* 
          ========================================
          ✅ 3. ปุ่มสีม่วง - ติดตามล่าสุด
          📅 แก้ไข: 22 เม.ย. 2569
          🔗 ลิงก์: /admin/patients/${patientId}/followup-history
          📝 คำอธิบาย: คลิกเพื่อดูประวัติการติดตามนัดหมายย้อนหลัง
          ========================================
          */}
          <div 
            onClick={() => router.push(`/admin/patients/${patientId}/followup-history`)}
            className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-xl shadow-lg p-6 cursor-pointer hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90 mb-1">ติดตามล่าสุด</p>
                <p className="text-2xl font-bold">21 เม.ย.</p>
                <p className="text-xs opacity-75 mt-1">ดี</p>
              </div>
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                <Activity className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* 
          ========================================
          ✅ 4. ปุ่มสีส้ม - ความคืบหน้า
          📅 ไม่มีการแก้ไข (เหมือนเดิม)
          🔗 ลิงก์: /admin/patients/${patientId}/goals
          📝 คำอธิบาย: คลิกเพื่อดูเป้าหมายและความคืบหน้า (มีการเตือนถ้ายังไม่ได้ประเมิน)
          ========================================
          */}
          <div 
            onClick={handleViewProgress}
            className="bg-gradient-to-br from-orange-500 to-red-500 text-white rounded-xl shadow-lg p-6 cursor-pointer hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90 mb-1">ความคืบหน้า</p>
                <p className="text-2xl font-bold">
                  {goals?.length > 0 ? `${stats.completed}/${stats.total}` : 'ยังไม่มีเป้าหมาย'}
                </p>
                <p className="text-xs opacity-75 mt-1">
                  {goals?.length > 0 
                    ? `${stats.progress}% ของเป้าหมาย` 
                    : 'กรุณาตั้งเป้าหมาย'}
                </p>
              </div>
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                <Target className="w-6 h-6" />
              </div>
            </div>
          </div>
        </div>

        {/* 
        ========================================
        ✅ ACTION BUTTONS - ปุ่มเพิ่มเติม
        ========================================
        */}
        <div className="flex flex-wrap gap-2 mb-6">
          {/* ✅ ปุ่มสีฟ้า - ดูประวัติการประเมิน */}
          <button
            onClick={() => router.push(`/admin/patients/${patientId}/assessments`)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all"
          >
            <FileText className="w-4 h-4" />
            ดูประวัติการประเมิน (0)
          </button>
          
          {/* ✅ ปุ่มสีเขียว - ไปหน้า screening/assessment (ทำ PAM) */}
          <button
            onClick={() => router.push(`/admin/screening?patient_id=${patientId}`)}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all"
          >
            <ClipboardCheck className="w-4 h-4" />
            ทำแบบประเมิน (PAM/PROMs)
          </button>
          
          {/* ✅ ปุ่มสีม่วง - ดูประวัติเป้าหมาย */}
          <button
            onClick={() => router.push(`/admin/patients/${patientId}/goals`)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-all"
          >
            <Target className="w-4 h-4" />
            ดูประวัติเป้าหมาย (0)
          </button>
          
          {/* ✅ ปุ่มสีส้ม - ดูประวัตินัดหมาย */}
          <button
            onClick={() => router.push(`/admin/patients/${patientId}/appointments`)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-all"
          >
            <Calendar className="w-4 h-4" />
            ดูประวัตินัดหมาย
          </button>
        </div>

        {/* Patient Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* ข้อมูลส่วนตัว */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              👤 ข้อมูลส่วนตัว
            </h2>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-gray-500">HN</p>
                <p className="font-semibold">{patient?.hospital_number || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">ชื่อ-นามสกุล</p>
                <p className="font-semibold">{patient?.first_name} {patient?.last_name}</p>
              </div>
              <div>
                <p className="text-gray-500">วันเกิด</p>
                <p className="font-semibold">{patient?.birth_date || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">อายุ</p>
                <p className="font-semibold">{patient?.age || '-'} ปี</p>
              </div>
              <div>
                <p className="text-gray-500">เพศ</p>
                <p className="font-semibold">{patient?.gender === 'male' ? 'ชาย' : 'หญิง'}</p>
              </div>
              <div>
                <p className="text-gray-500">เบอร์โทรศัพท์</p>
                <p className="font-semibold">{patient?.phone || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">อีเมล</p>
                <p className="font-semibold">{patient?.email || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">บัตรประชาชน</p>
                <p className="font-semibold">{patient?.id_card || '-'}</p>
              </div>
            </div>
          </div>

          {/* ข้อมูลสุขภาพ */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              🏥 ข้อมูลสุขภาพ
            </h2>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-gray-500">น้ำหนัก (kg)</p>
                <p className="font-semibold">{patient?.current_weight || '-'} kg</p>
              </div>
              <div>
                <p className="text-gray-500">ส่วนสูง (cm)</p>
                <p className="font-semibold">{patient?.height || '-'} cm</p>
              </div>
              <div>
                <p className="text-gray-500">รอบเอว (cm)</p>
                <p className="font-semibold">{patient?.waist_circumference || '-'} cm</p>
              </div>
              <div>
                <p className="text-gray-500">BMI</p>
                <p className="font-semibold">
                  {patient?.current_weight && patient?.height 
                    ? (patient.current_weight / ((patient.height / 100) ** 2)).toFixed(1)
                    : '-'}
                </p>
              </div>
              <div>
                <p className="text-gray-500">ประเภทเบาหวาน</p>
                <p className="font-semibold">{patient?.diabetes_type || 'กลุ่มเสี่ยง'}</p>
              </div>
              <div>
                <p className="text-gray-500">วันที่วินิจฉัย</p>
                <p className="font-semibold">{patient?.diagnosed_date || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">ค่า HbA1c</p>
                <p className="font-semibold">{patient?.hba1c_level || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">หมายเหตุ</p>
                <p className="font-semibold">{patient?.notes || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">อาชีพ</p>
                <p className="font-semibold">{patient?.occupation || '-'}</p>
              </div>
            </div>
          </div>

          {/* ที่อยู่ */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              📍 ที่อยู่
            </h2>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-gray-500">ที่อยู่เดิม</p>
                <p className="font-semibold">
                  {patient?.house_number} {patient?.address_line1} {patient?.soi} {patient?.road}
                </p>
              </div>
              <div>
                <p className="text-gray-500">ตำบล</p>
                <p className="font-semibold">{patient?.subdistrict || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">อำเภอ/เขต</p>
                <p className="font-semibold">{patient?.district || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">จังหวัด</p>
                <p className="font-semibold">{patient?.province || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">รหัสไปรษณีย์</p>
                <p className="font-semibold">{patient?.postal_code || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">โรงพยาบาล</p>
                <p className="font-semibold text-red-600">{patient?.hospital_name || '-'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Goals Section (ถ้ามี) */}
        {goals.length > 0 && (
          <div className="mt-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">🎯 เป้าหมายปัจจุบัน</h2>
            
            {/* Tab Navigation */}
            <div className="flex gap-2 mb-6 bg-white rounded-xl shadow-lg p-2 border border-gray-200 overflow-x-auto">
              <button
                onClick={() => setViewMode('goals')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all whitespace-nowrap ${
                  viewMode === 'goals' 
                    ? 'bg-blue-500 text-white shadow-lg' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Target className="w-5 h-5" />
                ภาพรวม
              </button>
              <button
                onClick={() => setViewMode('weekly')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all whitespace-nowrap ${
                  viewMode === 'weekly' 
                    ? 'bg-blue-500 text-white shadow-lg' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <TrendingUp className="w-5 h-5" />
                บันทึกประจำวัน
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all whitespace-nowrap ${
                  viewMode === 'calendar' 
                    ? 'bg-blue-500 text-white shadow-lg' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Calendar className="w-5 h-5" />
                ปฏิทิน
              </button>
            </div>

            {/* Goals Content */}
            {viewMode === 'goals' && (
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-200">
                  <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    <Target className="w-6 h-6 text-blue-600" />
                    เป้าหมายรอบที่ {selectedRound}
                  </h2>
                </div>

                <div className="divide-y divide-gray-200">
                  {groupedGoals.map(({ goal, completedCount, notCompletedCount, records: goalRecords, percentage }) => {
                    const goalKey = goal.goal_name || goal.activity_id || goal.id;
                    const isExpanded = expandedGoals.has(goalKey);

                    return (
                      <div key={goalKey} className="p-6">
                        <div 
                          className="flex items-center justify-between cursor-pointer hover:bg-gray-50 p-3 rounded-lg transition-colors"
                          onClick={() => toggleGoalExpansion(goalKey)}
                        >
                          <div className="flex items-center gap-3 flex-1">
                            <span className="text-3xl">{getGoalIcon(goal.goal_name)}</span>
                            <div className="flex-1">
                              <h3 className="text-lg font-bold text-gray-800">
                                {goal.goal_name_th || goal.goal_name}
                              </h3>
                              <p className="text-sm text-gray-500">
                                {goal.activities?.activity_name_th || goal.description_th || '-'}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <div className="flex items-center gap-2 mb-1">
                                <CheckCircle className="w-4 h-4 text-green-600" />
                                <span className="text-sm font-bold text-green-600">{completedCount}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-red-600">{notCompletedCount}</span>
                              </div>
                            </div>
                            
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                              percentage >= 80 ? 'bg-green-100' :
                              percentage >= 50 ? 'bg-yellow-100' :
                              'bg-red-100'
                            }`}>
                              <span className={`text-sm font-bold ${
                                percentage >= 80 ? 'text-green-600' :
                                percentage >= 50 ? 'text-yellow-600' :
                                'text-red-600'
                              }`}>
                                {percentage}%
                              </span>
                            </div>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="mt-4 ml-12 space-y-4">
                            {completedCount > 0 && (
                              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                                <div className="flex items-center gap-2 mb-3">
                                  <CheckCircle className="w-5 h-5 text-green-600" />
                                  <h4 className="font-bold text-green-800">
                                    ทำได้ {completedCount} ครั้ง
                                  </h4>
                                </div>
                                <div className="space-y-2">
                                  {goalRecords
                                    .filter(r => r.isCompleted)
                                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                    .map((record, index) => (
                                      <div key={index} className="flex items-center gap-3 text-sm">
                                        <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                                        <span className="text-green-800">
                                          {new Date(record.date).toLocaleDateString('th-TH', {
                                            year: 'numeric',
                                            month: 'long',
                                            day: 'numeric'
                                          })}
                                        </span>
                                      </div>
                                    ))}
                                </div>
                              </div>
                            )}

                            {notCompletedCount > 0 && (
                              <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                                <div className="flex items-center gap-2 mb-3">
                                  <span className="w-5 h-5 text-red-600">❌</span>
                                  <h4 className="font-bold text-red-800">
                                    ไม่ได้ {notCompletedCount} ครั้ง
                                  </h4>
                                </div>
                                <div className="space-y-2">
                                  {goalRecords
                                    .filter(r => !r.isCompleted)
                                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                    .map((record, index) => (
                                      <div key={index} className="flex items-center gap-3 text-sm">
                                        <span className="text-red-600">❌</span>
                                        <span className="text-red-800">
                                          {new Date(record.date).toLocaleDateString('th-TH', {
                                            year: 'numeric',
                                            month: 'long',
                                            day: 'numeric'
                                          })}
                                        </span>
                                      </div>
                                    ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}