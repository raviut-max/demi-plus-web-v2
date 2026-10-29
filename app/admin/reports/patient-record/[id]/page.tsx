// app/admin/reports/patient-record/[id]/page.tsx
// ✅ แก้ไขล่าสุด: 29 ตุลาคม 2569
// ✅ การแก้ไข:
//    1. เพิ่ม useEffect ตั้งชื่อไฟล์ PDF อัตโนมัติ
//    2. ใช้ทั้ง document.title และ <title> tag
//    3. เพิ่ม console.log สำหรับ debug
'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { checkSession, logout } from '@/lib/supabase/queries';
import { supabase } from '@/lib/supabase/client';
import {
  ArrowLeft, Printer, LogOut, UserCheck, Loader2
} from 'lucide-react';

interface PatientData {
  id: string;
  first_name: string | null;
  last_name: string | null;
  hospital_number: string | null;
  age: number | null;
  gender: string | null;
  pam_level: string | null;
  pam_score: number | null;
  zone: string | null;
  current_weight: number | null;
  waist_circumference: number | null;
  blood_sugar: number | null;
  height: number | null;
  bmi: number | null;
  hba1c_level: number | null;
  program_start_date: string | null;
  hospital_id: string | null;
  coach_id: string | null;
  hospitals?: { name: string | null } | null;
}

interface FollowupRecord {
  id: string;
  followup_date: string;
  followup_round: number;
  weight: number | null;
  waist_circumference: number | null;
  blood_pressure_sys: number | null;
  blood_pressure_dia: number | null;
  blood_sugar_dtx: number | null;
  confidence_score: number | null;
  followup_status: string | null;
  food_amount_status: string | null;
  food_type_status: string | null;
  movement_status: string | null;
  adaptation_summary: string | null;
  adaptation_obstacles: string | null;
  adaptation_opportunities: string | null;
  summary: string | null;
  recommendations: string | null;
  life_schedule_image_url: string | null;
  floating_chart_image_url: string | null;
  dream_card_image_url: string | null;
  floating_chart_summary: string | null;
  dream_card_description: string | null;
}

interface ScreeningRecord {
  id: string;
  screening_date: string;
  pam_total_score: number | null;
  pam_level_result: string | null;
  proms_zone: string | null;
  proms_q1_score: number | null;
  proms_q2_score: number | null;
  proms_q3_score: number | null;
  proms_q4_score: number | null;
  confidence_score: number | null;
}

export default function PatientRecordDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const isPrintMode = searchParams.get('print') === 'true';
  const patientId = params.id as string;

  const [user, setUser] = useState<any>(null);
  const [patient, setPatient] = useState<PatientData | null>(null);
  const [followups, setFollowups] = useState<FollowupRecord[]>([]);
  const [screenings, setScreenings] = useState<ScreeningRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }
    setUser(userData);
    loadPatientData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, router]);

  // ✅ ตั้งชื่อไฟล์ PDF อัตโนมัติเมื่อโหลดข้อมูลผู้ป่วยเสร็จ
  useEffect(() => {
    if (patient) {
      const hospitalName = patient.hospitals?.name || 'ไม่ระบุโรงพยาบาล';
      const hn = patient.hospital_number || 'ไม่มีHN';
      const firstName = patient.first_name || 'ไม่ระบุชื่อ';
      const lastName = patient.last_name || '';

      // สร้างสตริงชื่อไฟล์: โรงพยาบาล_HN_ชื่อ_นามสกุล
      const fileName = `${hospitalName}_${hn}_${firstName}_${lastName}`.replace(/\s+/g, '_');

      // วิธีที่ 1: เปลี่ยน document.title
      document.title = fileName;
      
      // วิธีที่ 2: เปลี่ยน <title> tag ใน head
      const titleElement = document.querySelector('title');
      if (titleElement) {
        titleElement.textContent = fileName;
      } else {
        const newTitle = document.createElement('title');
        newTitle.textContent = fileName;
        document.head.appendChild(newTitle);
      }

      // Debug: แสดงชื่อที่ตั้งใน Console
      console.log('📄 [PDF FileName] ตั้งชื่อไฟล์เป็น:', fileName);
    }
  }, [patient]);

  const loadPatientData = async () => {
    try {
      // โหลดข้อมูลผู้ป่วย
      const { data: patientData, error: patientError } = await supabase
        .from('profiles')
        .select(`
          id, first_name, last_name, hospital_number, age, gender,
          pam_level, pam_score, zone, current_weight, waist_circumference,
          blood_sugar, height, bmi, hba1c_level, program_start_date,
          hospital_id, coach_id,
          hospitals:hospital_id (name)
        `)
        .eq('id', patientId)
        .single();

      if (patientError) throw patientError;
      setPatient(patientData);

      // โหลดข้อมูล Follow-ups
      const { data: followupData, error: followupError } = await supabase
        .from('appointment_followups')
        .select('*')
        .eq('user_id', patientId)
        .order('followup_date', { ascending: false });

      if (followupError) throw followupError;
      setFollowups(followupData || []);

      // โหลดข้อมูล Screenings
      const { data: screeningData, error: screeningError } = await supabase
        .from('screenings')
        .select('*')
        .eq('user_id', patientId)
        .order('screening_date', { ascending: false });

      if (screeningError) throw screeningError;
      setScreenings(screeningData || []);
    } catch (error) {
      console.error('Error loading patient data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const formatThaiDate = (dateString: string | null) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    const thaiMonths = [
      'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
      'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
    ];
    const day = date.getDate();
    const month = thaiMonths[date.getMonth()];
    const yearBE = date.getFullYear() + 543;
    return `${day} ${month} ${yearBE}`;
  };

  const getStatusBadge = (status: string | null) => {
    const statusMap: any = {
      'excellent': { text: 'ดีเยี่ยม', class: 'bg-green-100 text-green-700' },
      'good': { text: 'ดี', class: 'bg-blue-100 text-blue-700' },
      'fair': { text: 'พอใช้', class: 'bg-yellow-100 text-yellow-700' },
      'needs_improvement': { text: 'ต้องปรับปรุง', class: 'bg-red-100 text-red-700' },
      'monitoring': { text: 'เฝ้าระวัง', class: 'bg-purple-100 text-purple-700' }
    };
    return statusMap[status || ''] || { text: status || '-', class: 'bg-gray-100 text-gray-700' };
  };

  const getComplianceStatus = (status: string | null) => {
    const statusMap: any = {
      'completed': { text: '✅ ตามแผน', class: 'text-green-600' },
      'not_completed': { text: '❌ ไม่ตามแผน', class: 'text-red-600' },
      'not_in_plan': { text: '⚪ ไม่มีในแผน', class: 'text-gray-500' }
    };
    return statusMap[status || ''] || { text: '-', class: 'text-gray-500' };
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

  if (!patient) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600">ไม่พบข้อมูลผู้ป่วย</p>
          <button
            onClick={() => router.push('/admin/reports/patient-record')}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            กลับ
          </button>
        </div>
      </div>
    );
  }

  const latestFollowup = followups[0];
  const latestScreening = screenings[0];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header - ซ่อนเมื่อ Print */}
      <div className="bg-white shadow-sm border-b border-gray-200 print:hidden">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button onClick={() => router.push('/admin/reports/patient-record')} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4">
            <ArrowLeft className="w-4 h-4" /> กลับไปหน้าเลือกรายงาน
          </button>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                📄 ระเบียนคนไข้: {patient.first_name} {patient.last_name}
              </h1>
              <p className="text-gray-600">HN: {patient.hospital_number || '-'}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-lg"
              >
                <Printer className="w-5 h-5" />
                Print / Export PDF
              </button>
              <button
                onClick={() => { logout(); router.push('/admin/login'); }}
                className="flex items-center gap-2 px-4 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all shadow-lg"
              >
                <LogOut className="w-4 h-4" />
                ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* PDF Content - 5 หน้า A4 */}
      <div className="max-w-4xl mx-auto px-4 py-8 print:px-0 print:py-0">
        {/* ===== PAGE 1: ข้อมูลพื้นฐาน + ผลประเมิน ===== */}
        <div className="bg-white p-8 mb-8 print:mb-0 print:page-break-after" style={{ minHeight: '297mm' }}>
          {/* Header */}
          <div className="border-b-2 border-blue-600 pb-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-blue-600">Community Bridge</h1>
                <p className="text-sm text-gray-600">ระบบดูแลผู้ป่วยกลุ่มเสี่ยงเบาหวาน (PreDM)</p>
              </div>
              <div className="text-right">
                <h2 className="text-xl font-bold text-gray-900">ระเบียนติดตามผล</h2>
                <p className="text-sm text-gray-600">Follow-up Record</p>
              </div>
            </div>
          </div>

          {/* Patient Info */}
          <div className="bg-blue-50 rounded-lg p-4 mb-6 border-l-4 border-blue-500">
            <h3 className="text-lg font-bold text-gray-900 mb-3">👤 ข้อมูลผู้ป่วย</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-gray-600">ชื่อ-นามสกุล</p>
                <p className="font-semibold">{patient.first_name} {patient.last_name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">HN</p>
                <p className="font-semibold">{patient.hospital_number || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">อายุ / เพศ</p>
                <p className="font-semibold">{patient.age || '-'} ปี / {patient.gender === 'female' ? 'หญิง' : 'ชาย'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">PAM Level</p>
                <p className="font-semibold">
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">
                    {patient.pam_level || 'L0'}
                  </span>
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600">PROMS Zone</p>
                <p className="font-semibold">
                  <span className={`px-2 py-1 rounded text-sm ${
                    patient.zone === 'Green Zone' ? 'bg-green-100 text-green-700' :
                    patient.zone === 'Yellow Zone' ? 'bg-yellow-100 text-yellow-700' :
                    patient.zone === 'Red Zone' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {patient.zone || '-'}
                  </span>
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-600">โรงพยาบาล</p>
                <p className="font-semibold">{patient.hospitals?.name || '-'}</p>
              </div>
            </div>
          </div>

          {/* Self-Assessment Results */}
          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 mb-3 border-b pb-2">📊 ผลการประเมินตนเอง</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-blue-50 rounded-lg p-4 text-center border-2 border-blue-200">
                <p className="text-sm text-gray-600 mb-2">PAM Score</p>
                <p className="text-3xl font-bold text-blue-600">{latestScreening?.pam_total_score || '-'}</p>
                <p className="text-sm text-gray-700 mt-2">{patient.pam_level || '-'}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {latestScreening ? formatThaiDate(latestScreening.screening_date) : '-'}
                </p>
              </div>
              <div className="bg-purple-50 rounded-lg p-4 text-center border-2 border-purple-200">
                <p className="text-sm text-gray-600 mb-2">PROMS Zone</p>
                <p className="text-3xl font-bold text-purple-600">{latestScreening?.proms_zone || '-'}</p>
                <p className="text-sm text-gray-700 mt-2">
                  Q1:{latestScreening?.proms_q1_score || 0} Q2:{latestScreening?.proms_q2_score || 0}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {latestScreening ? formatThaiDate(latestScreening.screening_date) : '-'}
                </p>
              </div>
              <div className="bg-green-50 rounded-lg p-4 text-center border-2 border-green-200">
                <p className="text-sm text-gray-600 mb-2">Confidence Score</p>
                <p className="text-3xl font-bold text-green-600">
                  {latestScreening?.confidence_score || latestFollowup?.confidence_score || '-'}/10
                </p>
                <p className="text-xs text-gray-500 mt-3">
                  {latestScreening ? formatThaiDate(latestScreening.screening_date) : '-'}
                </p>
              </div>
            </div>
          </div>

          {/* Health Data */}
          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 mb-3 border-b pb-2">📊 ค่าสุขภาพปัจจุบัน</h3>
            <div className="grid grid-cols-4 gap-4">
              <div className="border rounded-lg p-3 text-center">
                <p className="text-xs text-gray-600">น้ำหนัก</p>
                <p className="text-xl font-bold">{patient.current_weight || '-'} <span className="text-sm">กก.</span></p>
              </div>
              <div className="border rounded-lg p-3 text-center">
                <p className="text-xs text-gray-600">รอบเอว</p>
                <p className="text-xl font-bold">{patient.waist_circumference || '-'} <span className="text-sm">ซม.</span></p>
              </div>
              <div className="border rounded-lg p-3 text-center">
                <p className="text-xs text-gray-600">FPG</p>
                <p className="text-xl font-bold">{patient.blood_sugar || '-'} <span className="text-sm">mg/dL</span></p>
              </div>
              <div className="border rounded-lg p-3 text-center">
                <p className="text-xs text-gray-600">HbA1c</p>
                <p className="text-xl font-bold">{patient.hba1c_level || '-'} <span className="text-sm">%</span></p>
              </div>
            </div>
          </div>

          {/* Latest Follow-up Summary */}
          {latestFollowup && (
            <div className="mb-6">
              <h3 className="text-lg font-bold text-gray-900 mb-3 border-b pb-2">
                📅 การติดตามล่าสุด (รอบที่ {latestFollowup.followup_round})
              </h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <p className="text-xs text-gray-600">วันที่ติดตาม</p>
                    <p className="font-semibold">{formatThaiDate(latestFollowup.followup_date)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">สถานะ</p>
                    <span className={`px-2 py-1 rounded text-sm font-semibold ${getStatusBadge(latestFollowup.followup_status).class}`}>
                      {getStatusBadge(latestFollowup.followup_status).text}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">ความมั่นใจ</p>
                    <p className="font-semibold">{latestFollowup.confidence_score || '-'}/10</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-gray-600">ปริมาณอาหาร</p>
                    <p className={`font-semibold ${getComplianceStatus(latestFollowup.food_amount_status).class}`}>
                      {getComplianceStatus(latestFollowup.food_amount_status).text}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">ชนิดอาหาร</p>
                    <p className={`font-semibold ${getComplianceStatus(latestFollowup.food_type_status).class}`}>
                      {getComplianceStatus(latestFollowup.food_type_status).text}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">การเคลื่อนไหว</p>
                    <p className={`font-semibold ${getComplianceStatus(latestFollowup.movement_status).class}`}>
                      {getComplianceStatus(latestFollowup.movement_status).text}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="mt-8 pt-4 border-t text-sm text-gray-500 flex justify-between">
            <span>Community Bridge v1.0</span>
            <span>หน้า 1 / 5</span>
          </div>
        </div>

        {/* ===== PAGE 2: ประวัติการติดตาม ===== */}
        <div className="bg-white p-8 mb-8 print:mb-0 print:page-break-after" style={{ minHeight: '297mm' }}>
          <div className="border-b-2 border-blue-600 pb-4 mb-6">
            <h2 className="text-xl font-bold text-gray-900">📋 ประวัติการติดตาม (Follow-up History)</h2>
            <p className="text-sm text-gray-600">แสดงข้อมูลย้อนหลังทุกครั้งที่มีการบันทึก</p>
          </div>

          {followups.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>ยังไม่มีประวัติการติดตาม</p>
            </div>
          ) : (
            <div className="space-y-4">
              {followups.map((followup, index) => (
                <div key={followup.id} className={`border rounded-lg p-4 ${index === 0 ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="text-lg font-bold">รอบที่ {followup.followup_round}</span>
                      <span className={`ml-2 px-2 py-1 rounded text-xs font-semibold ${getStatusBadge(followup.followup_status).class}`}>
                        {getStatusBadge(followup.followup_status).text}
                      </span>
                    </div>
                    <span className="text-sm text-gray-600">{formatThaiDate(followup.followup_date)}</span>
                  </div>
                  
                  <div className="grid grid-cols-4 gap-3 mb-3">
                    <div className="bg-white rounded p-2">
                      <p className="text-xs text-gray-600">น้ำหนัก</p>
                      <p className="font-semibold">{followup.weight || '-'} กก.</p>
                    </div>
                    <div className="bg-white rounded p-2">
                      <p className="text-xs text-gray-600">ความดัน</p>
                      <p className="font-semibold">
                        {followup.blood_pressure_sys && followup.blood_pressure_dia 
                          ? `${followup.blood_pressure_sys}/${followup.blood_pressure_dia}` 
                          : '-'} mmHg
                      </p>
                    </div>
                    <div className="bg-white rounded p-2">
                      <p className="text-xs text-gray-600">FPG</p>
                      <p className="font-semibold">{followup.blood_sugar_dtx || '-'} mg/dL</p>
                    </div>
                    <div className="bg-white rounded p-2">
                      <p className="text-xs text-gray-600">ความมั่นใจ</p>
                      <p className="font-semibold">{followup.confidence_score || '-'}/10</p>
                    </div>
                  </div>

                  {followup.summary && (
                    <div className="bg-white rounded p-2 mb-2">
                      <p className="text-xs text-gray-600 font-semibold mb-1">สรุป:</p>
                      <p className="text-sm">{followup.summary}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="mt-8 pt-4 border-t text-sm text-gray-500 flex justify-between">
            <span>Community Bridge v1.0</span>
            <span>หน้า 2 / 5</span>
          </div>
        </div>

        {/* ===== PAGE 3: รูปภาพ Life Schedule ===== */}
        {latestFollowup?.life_schedule_image_url && (
          <div className="bg-white p-8 mb-8 print:mb-0 print:page-break-after" style={{ minHeight: '297mm' }}>
            <div className="border-b-2 border-blue-600 pb-4 mb-6">
              <h2 className="text-xl font-bold text-gray-900">📋 Life Schedule - ตารางชีวิตประจำวัน</h2>
              <p className="text-sm text-gray-600">
                {formatThaiDate(latestFollowup.followup_date)} • รอบที่ {latestFollowup.followup_round}
              </p>
            </div>

            <div className="border-2 border-gray-300 rounded-lg overflow-hidden">
              <img
                src={latestFollowup.life_schedule_image_url}
                alt="Life Schedule"
                className="w-full h-auto"
                style={{ maxHeight: '240mm' }}
              />
            </div>

            <div className="mt-8 pt-4 border-t text-sm text-gray-500 flex justify-between">
              <span>Community Bridge v1.0</span>
              <span>หน้า 3 / 5</span>
            </div>
          </div>
        )}

        {/* ===== PAGE 4: รูปภาพ Floating Chart + Dream Card ===== */}
        {(latestFollowup?.floating_chart_image_url || latestFollowup?.dream_card_image_url) && (
          <div className="bg-white p-8 mb-8 print:mb-0 print:page-break-after" style={{ minHeight: '297mm' }}>
            <div className="border-b-2 border-blue-600 pb-4 mb-6">
              <h2 className="text-xl font-bold text-gray-900">📈 รูปภาพประกอบ</h2>
              <p className="text-sm text-gray-600">
                {formatThaiDate(latestFollowup?.followup_date || '')} • รอบที่ {latestFollowup?.followup_round || '-'}
              </p>
            </div>

            <div className="space-y-6">
              {latestFollowup?.floating_chart_image_url && (
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-3"> Floating Chart - กราฟแนวโน้ม</h3>
                  <div className="border-2 border-gray-300 rounded-lg overflow-hidden mb-2">
                    <img
                      src={latestFollowup.floating_chart_image_url}
                      alt="Floating Chart"
                      className="w-full h-auto"
                      style={{ maxHeight: '110mm' }}
                    />
                  </div>
                  {latestFollowup.floating_chart_summary && (
                    <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded">
                      {latestFollowup.floating_chart_summary}
                    </p>
                  )}
                </div>
              )}

              {latestFollowup?.dream_card_image_url && (
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-3">💭 Dream Card - บัตรความฝัน</h3>
                  <div className="border-2 border-gray-300 rounded-lg overflow-hidden mb-2">
                    <img
                      src={latestFollowup.dream_card_image_url}
                      alt="Dream Card"
                      className="w-full h-auto"
                      style={{ maxHeight: '110mm' }}
                    />
                  </div>
                  {latestFollowup.dream_card_description && (
                    <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded">
                      {latestFollowup.dream_card_description}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="mt-8 pt-4 border-t text-sm text-gray-500 flex justify-between">
              <span>Community Bridge v1.0</span>
              <span>หน้า 4 / 5</span>
            </div>
          </div>
        )}

        {/* ===== PAGE 5: สรุปและลายเซ็น ===== */}
        <div className="bg-white p-8" style={{ minHeight: '297mm' }}>
          <div className="border-b-2 border-blue-600 pb-4 mb-6">
            <h2 className="text-xl font-bold text-gray-900"> สรุปและคำแนะนำ</h2>
          </div>

          {latestFollowup && (
            <>
              {/* Adaptation */}
              <div className="mb-6">
                <h3 className="text-lg font-bold text-gray-900 mb-3">🔄 การปรับตัว</h3>
                {latestFollowup.adaptation_summary && (
                  <div className="bg-gray-50 rounded-lg p-4 mb-3">
                    <p className="text-xs text-gray-600 font-semibold mb-1">สรุปการปรับตัว:</p>
                    <p className="text-sm">{latestFollowup.adaptation_summary}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  {latestFollowup.adaptation_obstacles && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs text-gray-600 font-semibold mb-1">อุปสรรค:</p>
                      <p className="text-sm">{latestFollowup.adaptation_obstacles}</p>
                    </div>
                  )}
                  {latestFollowup.adaptation_opportunities && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs text-gray-600 font-semibold mb-1">โอกาส/จุดแข็ง:</p>
                      <p className="text-sm">{latestFollowup.adaptation_opportunities}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Summary & Recommendations */}
              <div className="mb-6">
                {latestFollowup.summary && (
                  <div className="bg-gray-50 rounded-lg p-4 mb-3">
                    <p className="text-xs text-gray-600 font-semibold mb-1">สรุปผลการติดตาม:</p>
                    <p className="text-sm">{latestFollowup.summary}</p>
                  </div>
                )}
                {latestFollowup.recommendations && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs text-gray-600 font-semibold mb-1">คำแนะนำ:</p>
                    <p className="text-sm whitespace-pre-line">{latestFollowup.recommendations}</p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Signature Section */}
          <div className="mt-12 grid grid-cols-2 gap-8">
            <div className="text-center">
              <div className="border-b border-gray-400 h-16 mb-2"></div>
              <p className="text-sm font-semibold">ผู้บันทึก (อสม./เจ้าหน้าที่)</p>
              <p className="text-xs text-gray-600 mt-1">วันที่: {formatThaiDate(new Date().toISOString())}</p>
            </div>
            <div className="text-center">
              <div className="border-b border-gray-400 h-16 mb-2"></div>
              <p className="text-sm font-semibold">ผู้ป่วย/ญาติ</p>
              <p className="text-xs text-gray-600 mt-1">วันที่: _______________</p>
            </div>
          </div>

          <div className="mt-8 pt-4 border-t text-sm text-gray-500 flex justify-between">
            <span>Community Bridge v1.0 • ระบบดูแลผู้ป่วย PreDM</span>
            <span>หน้า 5 / 5</span>
          </div>
        </div>
      </div>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 10mm;
          }
          body {
            background: white;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:page-break-after {
            page-break-after: always;
          }
          .print\\:mb-0 {
            margin-bottom: 0 !important;
          }
          .print\\:px-0 {
            padding-left: 0 !important;
            padding-right: 0 !important;
          }
          .print\\:py-0 {
            padding-top: 0 !important;
            padding-bottom: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}