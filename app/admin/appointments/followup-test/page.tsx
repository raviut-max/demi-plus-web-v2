// app/admin/appointments/followup-test/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, logout } from '@/lib/supabase/queries';
import { 
  ArrowLeft, 
  LogOut, 
  FileText, 
  Calendar, 
  Activity, 
  Heart, 
  TrendingUp,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Play,
  RefreshCw
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

export default function FollowupTestPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [followups, setFollowups] = useState<any[]>([]);
  const [testResults, setTestResults] = useState<any>({
    page1: { status: 'pending', message: 'ยังไม่ได้ทดสอบ' },
    page2: { status: 'pending', message: 'ยังไม่ได้ทดสอบ' },
    page3: { status: 'pending', message: 'ยังไม่ได้ทดสอบ' },
  });

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
    loadTestData();
  }, [router]);

  const loadTestData = async () => {
    try {
      // โหลดนัดหมายสำหรับทดสอบ
      const { data: aptData } = await supabase
        .from('appointments')
        .select(`
          *,
          profiles (
            first_name,
            last_name,
            hospital_number
          )
        `)
        .order('appointment_date', { ascending: false })
        .limit(10);

      setAppointments(aptData || []);

      // โหลดผู้ป่วยสำหรับทดสอบ
      const { data: patientData } = await supabase
        .from('profiles')
        .select('*')
        .eq('is_active', true)
        .limit(10);

      setPatients(patientData || []);

      // โหลดข้อมูลติดตามสำหรับทดสอบ
      const { data: followupData } = await supabase
        .from('appointment_followups')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      setFollowups(followupData || []);

      console.log('📊 Test Data Loaded:', {
        appointments: aptData?.length,
        patients: patientData?.length,
        followups: followupData?.length
      });
    } catch (error) {
      console.error('Error loading test data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  const markTestComplete = (page: string, success: boolean, message: string) => {
    setTestResults(prev => ({
      ...prev,
      [page]: {
        status: success ? 'success' : 'error',
        message: message,
        timestamp: new Date().toLocaleString('th-TH')
      }
    }));
  };

  const createTestAppointment = async () => {
    try {
      if (patients.length === 0) {
        alert('❌ ไม่มีผู้ป่วยในระบบ กรุณาสร้างผู้ป่วยก่อน');
        return;
      }

      const testPatient = patients[0];
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const { data, error } = await supabase
        .from('appointments')
        .insert({
          user_id: testPatient.id,
          doctor_id: user.id,
          appointment_type: 'followup',
          appointment_date: tomorrow.toISOString(),
          status: 'scheduled',
          notes: 'นัดหมายทดสอบระบบ Follow-up',
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      alert(`✅ สร้างนัดหมายทดสอบสำเร็จ!\n\nผู้ป่วย: ${testPatient.first_name} ${testPatient.last_name}\nวันที่: ${tomorrow.toLocaleDateString('th-TH')}`);
      loadTestData();
    } catch (error: any) {
      alert('❌ เกิดข้อผิดพลาด: ' + error.message);
    }
  };

  const completeTestAppointment = async (aptId: string) => {
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'completed' })
        .eq('id', aptId);

      if (error) throw error;

      alert('✅ เปลี่ยนสถานะนัดหมายเป็น completed แล้ว!');
      loadTestData();
    } catch (error: any) {
      alert('❌ เกิดข้อผิดพลาด: ' + error.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-red-50 pb-20">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-white/50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button
            onClick={() => router.push('/admin/dashboard')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>กลับ Dashboard</span>
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                🧪 หน้าทดสอบระบบบันทึกติดตามนัดหมาย
              </h1>
              <p className="text-gray-600">
                ทดสอบโฟลว์การทำงานทั้ง 3 หน้าของระบบ Follow-up
              </p>
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
        
        {/* Test Status */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <CheckCircle className="w-6 h-6 text-green-600" />
            สถานะการทดสอบ
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Page 1 */}
            <div className={`p-4 rounded-lg border-2 ${
              testResults.page1?.status === 'success' ? 'bg-green-50 border-green-300' :
              testResults.page1?.status === 'error' ? 'bg-red-50 border-red-300' :
              'bg-gray-50 border-gray-300'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                {testResults.page1?.status === 'success' ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : testResults.page1?.status === 'error' ? (
                  <AlertCircle className="w-5 h-5 text-red-600" />
                ) : (
                  <Calendar className="w-5 h-5 text-gray-600" />
                )}
                <span className="font-bold text-gray-800">1. หน้าดูนัดหมาย</span>
              </div>
              <p className="text-sm text-gray-700">{testResults.page1?.message || 'ยังไม่ได้ทดสอบ'}</p>
              {testResults.page1?.timestamp && (
                <p className="text-xs text-gray-500 mt-2">{testResults.page1.timestamp}</p>
              )}
            </div>

            {/* Page 2 */}
            <div className={`p-4 rounded-lg border-2 ${
              testResults.page2?.status === 'success' ? 'bg-green-50 border-green-300' :
              testResults.page2?.status === 'error' ? 'bg-red-50 border-red-300' :
              'bg-gray-50 border-gray-300'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                {testResults.page2?.status === 'success' ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : testResults.page2?.status === 'error' ? (
                  <AlertCircle className="w-5 h-5 text-red-600" />
                ) : (
                  <FileText className="w-5 h-5 text-gray-600" />
                )}
                <span className="font-bold text-gray-800">2. หน้าบันทึกติดตาม</span>
              </div>
              <p className="text-sm text-gray-700">{testResults.page2?.message || 'ยังไม่ได้ทดสอบ'}</p>
              {testResults.page2?.timestamp && (
                <p className="text-xs text-gray-500 mt-2">{testResults.page2.timestamp}</p>
              )}
            </div>

            {/* Page 3 */}
            <div className={`p-4 rounded-lg border-2 ${
              testResults.page3?.status === 'success' ? 'bg-green-50 border-green-300' :
              testResults.page3?.status === 'error' ? 'bg-red-50 border-red-300' :
              'bg-gray-50 border-gray-300'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                {testResults.page3?.status === 'success' ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : testResults.page3?.status === 'error' ? (
                  <AlertCircle className="w-5 h-5 text-red-600" />
                ) : (
                  <TrendingUp className="w-5 h-5 text-gray-600" />
                )}
                <span className="font-bold text-gray-800">3. หน้าดูประวัติ</span>
              </div>
              <p className="text-sm text-gray-700">{testResults.page3?.message || 'ยังไม่ได้ทดสอบ'}</p>
              {testResults.page3?.timestamp && (
                <p className="text-xs text-gray-500 mt-2">{testResults.page3.timestamp}</p>
              )}
            </div>
          </div>
        </div>

        {/* Test Flow */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Play className="w-6 h-6 text-blue-600" />
            โฟลว์การทดสอบ (4 ขั้นตอน)
          </h2>
          
          <div className="space-y-4">
            {/* Step 1 */}
            <div className="flex items-start gap-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">1</div>
              <div className="flex-1">
                <h3 className="font-bold text-blue-800 mb-1">เข้าสู่หน้าดูนัดหมาย</h3>
                <p className="text-sm text-blue-700 mb-2">ตรวจสอบว่ามีนัดหมายที่สถานะ "completed" หรือ "scheduled" + ผ่านวันนัดแล้ว</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      router.push('/admin/appointments/view');
                      markTestComplete('page1', true, 'เข้าถึงหน้าดูนัดหมายแล้ว');
                    }}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all flex items-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    ไปหน้าดูนัดหมาย
                  </button>
                  <button
                    onClick={createTestAppointment}
                    className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all flex items-center gap-2"
                  >
                    <Play className="w-4 h-4" />
                    สร้างนัดหมายทดสอบ
                  </button>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-start gap-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
              <div className="w-8 h-8 bg-purple-500 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">2</div>
              <div className="flex-1">
                <h3 className="font-bold text-purple-800 mb-1">คลิกปุ่ม "บันทึกติดตาม"</h3>
                <p className="text-sm text-purple-700 mb-2">ปุ่มสีม่วงจะแสดงเมื่อนัดหมายเป็น "completed" และยังไม่มีการบันทึกติดตาม</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (appointments.filter(a => a.status === 'completed').length > 0) {
                        const apt = appointments.filter(a => a.status === 'completed')[0];
                        router.push(`/admin/appointments/followup/${apt.id}`);
                        markTestComplete('page2', true, 'เข้าถึงหน้าบันทึกติดตามแล้ว');
                      } else {
                        alert('⚠️ ไม่มีนัดหมายที่ completed กรุณาเปลี่ยนสถานะนัดหมายก่อน');
                      }
                    }}
                    className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-all flex items-center gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    ไปหน้าบันทึกติดตาม
                  </button>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-start gap-4 p-4 bg-pink-50 rounded-lg border border-pink-200">
              <div className="w-8 h-8 bg-pink-500 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">3</div>
              <div className="flex-1">
                <h3 className="font-bold text-pink-800 mb-1">กรอกข้อมูลและบันทึก</h3>
                <p className="text-sm text-pink-700 mb-2">กรอกข้อมูลสุขภาพ, ความก้าวหน้า, คะแนนความมั่นใจ แล้วกดบันทึก</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      markTestComplete('page2', true, 'บันทึกข้อมูลติดตามสำเร็จ');
                    }}
                    className="px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-all flex items-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    ยืนยันว่าบันทึกแล้ว
                  </button>
                </div>
              </div>
            </div>

            {/* Step 4 */}
            <div className="flex items-start gap-4 p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">4</div>
              <div className="flex-1">
                <h3 className="font-bold text-green-800 mb-1">ดูประวัติการติดตาม</h3>
                <p className="text-sm text-green-700 mb-2">ตรวจสอบว่าข้อมูลถูกบันทึกและแสดงในหน้าประวัติ correctly</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (patients.length > 0) {
                        router.push(`/admin/patients/${patients[0].id}/followup-history`);
                        markTestComplete('page3', true, 'เข้าถึงหน้าดูประวัติแล้ว');
                      } else {
                        alert('⚠️ ไม่มีผู้ป่วยในระบบ');
                      }
                    }}
                    className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all flex items-center gap-2"
                  >
                    <TrendingUp className="w-4 h-4" />
                    ไปหน้าดูประวัติ
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Test Data */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Appointments */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <Calendar className="w-6 h-6 text-blue-600" />
                นัดหมายสำหรับทดสอบ
              </h2>
              <button
                onClick={loadTestData}
                className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-all"
                title="รีเฟรชข้อมูล"
              >
                <RefreshCw className="w-5 h-5 text-gray-600" />
              </button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {appointments.length === 0 ? (
                <p className="text-gray-500 text-sm">ไม่มีนัดหมาย</p>
              ) : (
                appointments.map((apt) => (
                  <div key={apt.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-800">
                        {apt.profiles?.first_name} {apt.profiles?.last_name}
                      </span>
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        apt.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                        apt.status === 'completed' ? 'bg-green-100 text-green-700' :
                        apt.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                        'bg-orange-100 text-orange-700'
                      }`}>
                        {apt.status === 'scheduled' ? 'นัดหมาย' :
                         apt.status === 'completed' ? 'เสร็จสิ้น' :
                         apt.status === 'cancelled' ? 'ยกเลิก' :
                         'ผิดนัด'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">
                      HN: {apt.profiles?.hospital_number || '-'}
                    </p>
                    <p className="text-xs text-gray-500 mb-2">
                      {new Date(apt.appointment_date).toLocaleString('th-TH')}
                    </p>
                    <div className="flex gap-2">
                      {apt.status === 'scheduled' && (
                        <button
                          onClick={() => completeTestAppointment(apt.id)}
                          className="px-2 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600"
                        >
                          ทำให้เสร็จสิ้น
                        </button>
                      )}
                      {apt.status === 'completed' && (
                        <button
                          onClick={() => {
                            router.push(`/admin/appointments/followup/${apt.id}`);
                            markTestComplete('page2', true, 'เข้าถึงหน้าบันทึกติดตามแล้ว');
                          }}
                          className="px-2 py-1 bg-purple-500 text-white text-xs rounded hover:bg-purple-600"
                        >
                          บันทึกติดตาม
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Patients */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <Activity className="w-6 h-6 text-green-600" />
                ผู้ป่วยสำหรับทดสอบ
              </h2>
              <button
                onClick={loadTestData}
                className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-all"
                title="รีเฟรชข้อมูล"
              >
                <RefreshCw className="w-5 h-5 text-gray-600" />
              </button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {patients.length === 0 ? (
                <p className="text-gray-500 text-sm">ไม่มีผู้ป่วย</p>
              ) : (
                patients.map((patient) => (
                  <div key={patient.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-800">
                        {patient.first_name} {patient.last_name}
                      </span>
                      <span className="px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                        {patient.pam_level || 'L1'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">
                      HN: {patient.hospital_number || '-'}
                    </p>
                    <button
                      onClick={() => {
                        router.push(`/admin/patients/${patient.id}/followup-history`);
                        markTestComplete('page3', true, 'เข้าถึงหน้าดูประวัติแล้ว');
                      }}
                      className="px-2 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600 w-full"
                    >
                      ดูประวัติการติดตาม
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Followup Records */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <Heart className="w-6 h-6 text-pink-600" />
              บันทึกติดตามล่าสุด
            </h2>
            <button
              onClick={loadTestData}
              className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-all"
              title="รีเฟรชข้อมูล"
            >
              <RefreshCw className="w-5 h-5 text-gray-600" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-semibold">ครั้งที่</th>
                  <th className="px-4 py-2 text-left text-sm font-semibold">วันที่</th>
                  <th className="px-4 py-2 text-left text-sm font-semibold">น้ำหนัก</th>
                  <th className="px-4 py-2 text-left text-sm font-semibold">ความมั่นใจ</th>
                  <th className="px-4 py-2 text-left text-sm font-semibold">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {followups.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      ยังไม่มีบันทึกติดตาม
                    </td>
                  </tr>
                ) : (
                  followups.map((followup) => (
                    <tr key={followup.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm">ครั้งที่ {followup.followup_round}</td>
                      <td className="px-4 py-2 text-sm">
                        {new Date(followup.followup_date).toLocaleDateString('th-TH')}
                      </td>
                      <td className="px-4 py-2 text-sm">{followup.weight || '-'} กก.</td>
                      <td className="px-4 py-2 text-sm">{followup.confidence_score || '-'}/10</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          followup.followup_status === 'excellent' ? 'bg-green-100 text-green-700' :
                          followup.followup_status === 'good' ? 'bg-blue-100 text-blue-700' :
                          followup.followup_status === 'fair' ? 'bg-yellow-100 text-yellow-700' :
                          followup.followup_status === 'needs_improvement' ? 'bg-orange-100 text-orange-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {followup.followup_status === 'excellent' ? 'ดีมาก' :
                           followup.followup_status === 'good' ? 'ดี' :
                           followup.followup_status === 'fair' ? 'พอใช้' :
                           followup.followup_status === 'needs_improvement' ? 'ปรับปรุง' :
                           'เฝ้าระวัง'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Links */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <ExternalLink className="w-6 h-6 text-indigo-600" />
            ลิงก์ด่วน
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => {
                router.push('/admin/appointments/view');
                markTestComplete('page1', true, 'เข้าถึงหน้าดูนัดหมายแล้ว');
              }}
              className="p-4 bg-blue-50 rounded-lg border-2 border-blue-200 hover:bg-blue-100 transition-all text-left"
            >
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-5 h-5 text-blue-600" />
                <span className="font-bold text-blue-800">หน้าดูนัดหมาย</span>
              </div>
              <p className="text-sm text-blue-700">/admin/appointments/view</p>
            </button>

            <button
              onClick={() => {
                if (appointments.filter(a => a.status === 'completed').length > 0) {
                  const apt = appointments.filter(a => a.status === 'completed')[0];
                  router.push(`/admin/appointments/followup/${apt.id}`);
                  markTestComplete('page2', true, 'เข้าถึงหน้าบันทึกติดตามแล้ว');
                } else {
                  alert('⚠️ ไม่มีนัดหมายที่ completed');
                }
              }}
              className="p-4 bg-purple-50 rounded-lg border-2 border-purple-200 hover:bg-purple-100 transition-all text-left"
            >
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-5 h-5 text-purple-600" />
                <span className="font-bold text-purple-800">หน้าบันทึกติดตาม</span>
              </div>
              <p className="text-sm text-purple-700">/admin/appointments/followup/[id]</p>
            </button>

            <button
              onClick={() => {
                if (patients.length > 0) {
                  router.push(`/admin/patients/${patients[0].id}/followup-history`);
                  markTestComplete('page3', true, 'เข้าถึงหน้าดูประวัติแล้ว');
                } else {
                  alert('⚠️ ไม่มีผู้ป่วยในระบบ');
                }
              }}
              className="p-4 bg-green-50 rounded-lg border-2 border-green-200 hover:bg-green-100 transition-all text-left"
            >
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-green-600" />
                <span className="font-bold text-green-800">หน้าดูประวัติ</span>
              </div>
              <p className="text-sm text-green-700">/admin/patients/[id]/followup-history</p>
            </button>
          </div>
        </div>

        {/* Reset Test Results */}
        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setTestResults({
                page1: { status: 'pending', message: 'ยังไม่ได้ทดสอบ' },
                page2: { status: 'pending', message: 'ยังไม่ได้ทดสอบ' },
                page3: { status: 'pending', message: 'ยังไม่ได้ทดสอบ' },
              });
            }}
            className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-all flex items-center gap-2 mx-auto"
          >
            <RefreshCw className="w-5 h-5" />
            รีเซ็ตผลการทดสอบ
          </button>
        </div>
      </div>
    </div>
  );
}