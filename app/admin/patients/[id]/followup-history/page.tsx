// app/admin/patients/[id]/followup-history/page.tsx
// ✅ แก้ไขล่าสุด: 24 เมษายน 2569
// ✅ การแก้ไข:
//    1. เพิ่มปุ่ม "บันทึกติดตามใหม่" ด้านบนหน้า
//    2. ตรวจสอบว่ามีการนัดหมายที่ยังไม่ได้ติดตามหรือไม่
//    3. แยกกรณี: มีนัดหมาย → ไปหน้าบันทึกผลการติดตาม / ไม่มีนัดหมาย → แสดง confirm

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { checkSession, logout, getPatientDetail, getPatientFollowupHistory } from '@/lib/supabase/queries';
import { ArrowLeft, Calendar, Activity, Heart, TrendingUp, FileText, Download, Printer, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

export default function FollowupHistoryPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params.id as string;
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<any>(null);
  const [followups, setFollowups] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');
  
  // ✅ State สำหรับตรวจสอบการนัดหมาย
  const [hasUnfollowedAppointment, setHasUnfollowedAppointment] = useState(false);
  const [latestAppointmentId, setLatestAppointmentId] = useState<string | null>(null);

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
      // โหลดข้อมูลผู้ป่วย
      const patientData = await getPatientDetail(patientId);
      setPatient(patientData);

      // โหลดประวัติการติดตาม
      const followupData = await getPatientFollowupHistory(patientId);
      setFollowups(followupData);

      // ✅ ตรวจสอบการนัดหมายที่ยังไม่ได้ติดตาม
      await checkUnfollowedAppointments(patientId);

      console.log('📋 Followup History:', followupData.length);
    } catch (error) {
      console.error('Error loading ', error);
      alert('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  // ✅ ฟังก์ชันตรวจสอบการนัดหมายที่ยังไม่ได้ติดตาม
  const checkUnfollowedAppointments = async (pid: string) => {
    try {
      console.log('🔍 Checking unfollowed appointments for:', pid);
      
      // ดึงนัดหมายที่เสร็จสิ้นแล้วทั้งหมด
      const {  appointmentsData } = await supabase
        .from('appointments')
        .select('id, appointment_date, status')
        .eq('user_id', pid)
        .eq('status', 'completed')
        .order('appointment_date', { ascending: false })
        .limit(1);

      if (appointmentsData && appointmentsData.length > 0) {
        const latestApt = appointmentsData[0];
        
        // ตรวจสอบว่ามี followup แล้วหรือยัง
        const {  existingFollowup } = await supabase
          .from('appointment_followups')
          .select('id')
          .eq('appointment_id', latestApt.id)
          .single();

        if (!existingFollowup) {
          // ยังไม่มี followup
          setHasUnfollowedAppointment(true);
          setLatestAppointmentId(latestApt.id);
          console.log('📅 Found unfollowed appointment:', latestApt.id);
        }
      }
    } catch (error) {
      console.error('Error checking unfollowed appointments:', error);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  // ✅ ฟังก์ชันจัดการปุ่มบันทึกติดตามใหม่
  const handleNewFollowup = () => {
    console.log('🔴 New Followup button clicked');
    console.log('  hasUnfollowedAppointment:', hasUnfollowedAppointment);
    console.log('  latestAppointmentId:', latestAppointmentId);

    if (hasUnfollowedAppointment && latestAppointmentId) {
      // ✅ มีการนัดหมายที่ยังไม่ได้ติดตาม → ไปหน้าบันทึกผลการติดตาม
      console.log('🔗 Has unfollowed appointment → Navigate to followup form');
      router.push(`/admin/appointments/followup/${latestAppointmentId}`);
    } else {
      // ✅ ไม่มีนัดหมายที่ยังไม่ได้ติดตาม → แสดง confirm dialog
      console.log('🔗 No unfollowed appointment → Show confirm dialog');
      const confirmCreate = confirm(
        '📋 ไม่พบนัดหมายที่ยังไม่ได้ติดตาม\n\n' +
        'คุณต้องการบันทึกข้อมูลการติดตาม (ก่อนนัดหมาย) ตอนนี้เลยหรือไม่?\n\n' +
        '• กด "ตกลง" → ไปหน้าบันทึกข้อมูลการติดตาม\n' +
        '• กด "ยกเลิก" → ยกเลิก'
      );

      if (confirmCreate) {
        // ✅ ไปหน้าบันทึกผลการติดตาม (แบบไม่มีนัดหมาย)
        console.log('🔗 Navigate to followup form (no appointment)');
        router.push(`/admin/appointments/followup/new?patient_id=${patientId}`);
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'excellent': return 'bg-green-100 text-green-700 border-green-300';
      case 'good': return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'fair': return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      case 'needs_improvement': return 'bg-orange-100 text-orange-700 border-orange-300';
      case 'monitoring': return 'bg-red-100 text-red-700 border-red-300';
      default: return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'excellent': return 'ดีมาก';
      case 'good': return 'ดี';
      case 'fair': return 'พอใช้';
      case 'needs_improvement': return 'ปรับปรุง';
      case 'monitoring': return 'เฝ้าระวัง';
      default: return status;
    }
  };

  const getGoalStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500';
      case 'not_completed': return 'bg-red-500';
      case 'not_in_plan': return 'bg-gray-400';
      default: return 'bg-gray-400';
    }
  };

  const getGoalStatusText = (status: string) => {
    switch (status) {
      case 'completed': return 'สำเร็จ';
      case 'not_completed': return 'ไม่สำเร็จ';
      case 'not_in_plan': return 'ยังไม่อยู่ในแผน';
      default: return status;
    }
  };

  // ✅ คำนวณความก้าวหน้า (เปรียบเทียบครั้งล่าสุดกับครั้งแรก)
  const calculateProgress = () => {
    if (followups.length < 2) return null;
    const first = followups[followups.length - 1]; // ครั้งแรก
    const latest = followups[0]; // ครั้งล่าสุด
    const progress: any = {};

    if (first.weight && latest.weight) {
      progress.weight = {
        first: first.weight,
        latest: latest.weight,
        change: (latest.weight - first.weight).toFixed(1),
        improved: latest.weight < first.weight
      };
    }

    if (first.waist_circumference && latest.waist_circumference) {
      progress.waist = {
        first: first.waist_circumference,
        latest: latest.waist_circumference,
        change: (latest.waist_circumference - first.waist_circumference).toFixed(1),
        improved: latest.waist_circumference < first.waist_circumference
      };
    }

    if (first.blood_sugar_dtx && latest.blood_sugar_dtx) {
      progress.bloodSugar = {
        first: first.blood_sugar_dtx,
        latest: latest.blood_sugar_dtx,
        change: (latest.blood_sugar_dtx - first.blood_sugar_dtx).toFixed(1),
        improved: latest.blood_sugar_dtx < first.blood_sugar_dtx
      };
    }

    if (first.confidence_score && latest.confidence_score) {
      progress.confidence = {
        first: first.confidence_score,
        latest: latest.confidence_score,
        change: latest.confidence_score - first.confidence_score,
        improved: latest.confidence_score > first.confidence_score
      };
    }

    return progress;
  };

  const progress = calculateProgress();

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
          {/* ปุ่มกลับ */}
          <button
            onClick={() => router.push(`/admin/patients/${patientId}`)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับหน้าผู้ป่วย
          </button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                📋 ประวัติการติดตามนัดหมาย
              </h1>
              <p className="text-gray-600">
                ผู้ป่วย: {patient?.first_name} {patient?.last_name} | 
                HN: {patient?.hospital_number} | 
                ทั้งหมด: {followups.length} ครั้ง
              </p>
            </div>
            
            <div className="flex gap-2">
              {/* ✅ ปุ่มบันทึกติดตามใหม่ */}
              <button
                onClick={handleNewFollowup}
                className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-all"
              >
                <Plus className="w-4 h-4" />
                บันทึกติดตามใหม่
              </button>
            
              <button
                onClick={() => setViewMode('table')}
                className={`px-4 py-2 rounded-lg transition-all ${
                  viewMode === 'table' 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                📊 ตาราง
              </button>
              <button
                onClick={() => setViewMode('chart')}
                className={`px-4 py-2 rounded-lg transition-all ${
                  viewMode === 'chart' 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                📈 กราฟ
              </button>
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                พิมพ์
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        
        {/* สรุปความก้าวหน้า */}
        {progress && (
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-green-600" />
              สรุปความก้าวหน้า (ครั้งแรก → ล่าสุด)
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* น้ำหนัก */}
              {progress.weight && (
                <div className={`p-4 rounded-lg border-2 ${
                  progress.weight.improved ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-5 h-5 text-gray-600" />
                    <span className="text-sm font-medium text-gray-700">น้ำหนัก</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-800">
                    {progress.weight.first} → {progress.weight.latest} กก.
                  </p>
                  <p className={`text-sm ${progress.weight.improved ? 'text-green-600' : 'text-red-600'}`}>
                    {progress.weight.improved ? '↓' : '↑'} {Math.abs(parseFloat(progress.weight.change))} กก.
                  </p>
                </div>
              )}

              {/* รอบเอว */}
              {progress.waist && (
                <div className={`p-4 rounded-lg border-2 ${
                  progress.waist.improved ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-5 h-5 text-gray-600" />
                    <span className="text-sm font-medium text-gray-700">รอบเอว</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-800">
                    {progress.waist.first} → {progress.waist.latest} ซม.
                  </p>
                  <p className={`text-sm ${progress.waist.improved ? 'text-green-600' : 'text-red-600'}`}>
                    {progress.waist.improved ? '↓' : '↑'} {Math.abs(parseFloat(progress.waist.change))} ซม.
                  </p>
                </div>
              )}

              {/* น้ำตาล */}
              {progress.bloodSugar && (
                <div className={`p-4 rounded-lg border-2 ${
                  progress.bloodSugar.improved ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-5 h-5 text-gray-600" />
                    <span className="text-sm font-medium text-gray-700">น้ำตาล (DTX)</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-800">
                    {progress.bloodSugar.first} → {progress.bloodSugar.latest} mg%
                  </p>
                  <p className={`text-sm ${progress.bloodSugar.improved ? 'text-green-600' : 'text-red-600'}`}>
                    {progress.bloodSugar.improved ? '↓' : '↑'} {Math.abs(parseFloat(progress.bloodSugar.change))} mg%
                  </p>
                </div>
              )}

              {/* ความมั่นใจ */}
              {progress.confidence && (
                <div className={`p-4 rounded-lg border-2 ${
                  progress.confidence.improved ? 'bg-green-50 border-green-300' : 'bg-orange-50 border-orange-300'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Heart className="w-5 h-5 text-pink-600" />
                    <span className="text-sm font-medium text-gray-700">ความมั่นใจ</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-800">
                    {progress.confidence.first} → {progress.confidence.latest}/10
                  </p>
                  <p className={`text-sm ${progress.confidence.improved ? 'text-green-600' : 'text-orange-600'}`}>
                    {progress.confidence.improved ? '↑' : '↓'} {Math.abs(progress.confidence.change)} คะแนน
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ตารางประวัติการติดตาม */}
        {viewMode === 'table' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <Calendar className="w-6 h-6 text-blue-600" />
                รายละเอียดการติดตามแต่ละครั้ง
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">ครั้งที่</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">วันที่</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">น้ำหนัก</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">รอบเอว</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">ความดัน</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">น้ำตาล</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">ความมั่นใจ</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">แผนปฏิบัติ</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">สถานะ</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">ดูรายละเอียด</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {followups.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-gray-500">
                        <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                        <p>ยังไม่มีประวัติการติดตาม</p>
                      </td>
                    </tr>
                  ) : (
                    followups.map((followup) => (
                      <tr key={followup.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm">
                          <span className="font-bold text-blue-600">ครั้งที่ {followup.followup_round}</span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {new Date(followup.followup_date).toLocaleDateString('th-TH', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {followup.weight ? (
                            <span className="font-medium">{followup.weight}</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}{' '}
                          <span className="text-xs text-gray-500">กก.</span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {followup.waist_circumference ? (
                            <span className="font-medium">{followup.waist_circumference}</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}{' '}
                          <span className="text-xs text-gray-500">ซม.</span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {followup.blood_pressure_sys && followup.blood_pressure_dia ? (
                            <span className="font-medium">
                              {followup.blood_pressure_sys}/{followup.blood_pressure_dia}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}{' '}
                          <span className="text-xs text-gray-500">mmHg</span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {followup.blood_sugar_dtx ? (
                            <span className="font-medium">{followup.blood_sugar_dtx}</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}{' '}
                          <span className="text-xs text-gray-500">mg%</span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-full bg-gray-200 rounded-full h-2 max-w-[100px]">
                              <div
                                className="bg-pink-500 h-2 rounded-full"
                                style={{ width: `${(followup.confidence_score || 0) * 10}%` }}
                              ></div>
                            </div>
                            <span className="text-sm font-medium">{followup.confidence_score || '-'}/10</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex gap-1">
                            <div
                              className={`w-6 h-6 rounded-full ${getGoalStatusColor(followup.food_amount_status)}`}
                              title={`ปริมาณอาหาร: ${getGoalStatusText(followup.food_amount_status)}`}
                            ></div>
                            <div
                              className={`w-6 h-6 rounded-full ${getGoalStatusColor(followup.food_type_status)}`}
                              title={`ชนิดอาหาร: ${getGoalStatusText(followup.food_type_status)}`}
                            ></div>
                            <div
                              className={`w-6 h-6 rounded-full ${getGoalStatusColor(followup.movement_status)}`}
                              title={`การเคลื่อนไหว: ${getGoalStatusText(followup.movement_status)}`}
                            ></div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(followup.followup_status)}`}>
                            {getStatusText(followup.followup_status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <button
                            onClick={() => router.push(`/admin/appointments/followup/${followup.id}/view`)}
                            className="px-3 py-1 bg-blue-500 text-white text-xs rounded-lg hover:bg-blue-600 transition-all flex items-center gap-1"
                          >
                            <FileText className="w-3 h-3" />
                            ดูรายละเอียด
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* โหมดกราฟ (แสดงข้อมูลแนวโน้ม) */}
        {viewMode === 'chart' && followups.length > 0 && (
          <div className="space-y-6">
            {/* กราฟน้ำหนัก */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-600" />
                แนวโน้มน้ำหนัก
              </h3>
              <div className="h-64 flex items-end gap-4">
                {followups.slice().reverse().map((followup) => (
                  <div key={followup.id} className="flex-1 flex flex-col items-center">
                    <div
                      className="w-full bg-blue-500 rounded-t-lg transition-all hover:bg-blue-600"
                      style={{
                        height: followup.weight ? `${(followup.weight / 150) * 100}%` : '0%',
                        minHeight: followup.weight ? '20px' : '0'
                      }}
                    ></div>
                    <p className="text-xs text-gray-600 mt-2 text-center">
                      ครั้งที่ {followup.followup_round}
                    </p>
                    <p className="text-xs font-bold text-gray-800">
                      {followup.weight || '-'} กก.
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* กราฟความมั่นใจ */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Heart className="w-5 h-5 text-pink-600" />
                แนวโน้มความมั่นใจ
              </h3>
              <div className="h-64 flex items-end gap-4">
                {followups.slice().reverse().map((followup) => (
                  <div key={followup.id} className="flex-1 flex flex-col items-center">
                    <div
                      className="w-full bg-pink-500 rounded-t-lg transition-all hover:bg-pink-600"
                      style={{
                        height: `${(followup.confidence_score || 0) * 10}%`,
                        minHeight: followup.confidence_score ? '20px' : '0'
                      }}
                    ></div>
                    <p className="text-xs text-gray-600 mt-2 text-center">
                      ครั้งที่ {followup.followup_round}
                    </p>
                    <p className="text-xs font-bold text-gray-800">
                      {followup.confidence_score || '-'}/10
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="mt-6 bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h3 className="text-lg font-bold text-gray-800 mb-4">คำอธิบายสัญลักษณ์</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-green-500"></div>
              <span className="text-sm text-gray-700">สำเร็จ</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-red-500"></div>
              <span className="text-sm text-gray-700">ไม่สำเร็จ</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-gray-400"></div>
              <span className="text-sm text-gray-700">ยังไม่อยู่ในแผน</span>
            </div>
          </div>
          <div className="mt-4 text-sm text-gray-600">
            <p><strong>ลำดับสัญลักษณ์:</strong> ปริมาณอาหาร | ชนิดอาหาร | การเคลื่อนไหว</p>
          </div>
        </div>

      </div>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}