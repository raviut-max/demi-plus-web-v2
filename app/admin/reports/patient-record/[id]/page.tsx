// app/admin/reports/patient-record/[id]/page.tsx
// ✅ แก้ไขล่าสุด: 29 ตุลาคม 2569
// ✅ บันทึก PDF โดยตรงอัตโนมัติ (ไม่มี Print Dialog)
'use client';
import { useEffect, useState, Suspense, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { checkSession, logout } from '@/lib/supabase/queries';
import { supabase } from '@/lib/supabase/client';
import { ArrowLeft, Download, LogOut, Loader2, CheckCircle } from 'lucide-react';

// ✅ Dynamic import เพื่อป้องกันปัญหา SSR ใน Next.js
import dynamic from 'next/dynamic';
const jsPDF = dynamic(() => import('jspdf'), { ssr: false });
const html2canvas = dynamic(() => import('html2canvas-pro'), { ssr: false });

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

function PatientRecordContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const isAutoDownload = searchParams.get('auto') === 'true';
  const patientId = params.id as string;

  const [user, setUser] = useState<any>(null);
  const [patient, setPatient] = useState<PatientData | null>(null);
  const [followups, setFollowups] = useState<FollowupRecord[]>([]);
  const [screenings, setScreenings] = useState<ScreeningRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isDownloaded, setIsDownloaded] = useState(false);
  
  const pdfContentRef = useRef<HTMLDivElement>(null);

  const [latestHealthData, setLatestHealthData] = useState({
    weight: null as number | null,
    waist: null as number | null,
    fpg: null as number | null,
    hba1c: null as number | null,
    bpSys: null as number | null,
    bpDia: null as number | null,
    healthDataDate: null as string | null,
  });

  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }
    setUser(userData);
    loadPatientData();
  }, [patientId, router]);

  useEffect(() => {
    if (patient) {
      const hospitalName = patient.hospitals?.name || 'ไม่ระบุโรงพยาบาล';
      const hn = patient.hospital_number || 'ไม่มีHN';
      const firstName = patient.first_name || 'ไม่ระบุชื่อ';
      const lastName = patient.last_name || '';
      const fileName = `${hospitalName}_${hn}_${firstName}_${lastName}`.replace(/\s+/g, '_');
      document.title = fileName;
    }
  }, [patient]);

  // ✅ Auto-download เมื่อเปิดหน้า (รอ 2.5 วินาทีให้รูปภาพโหลดเสร็จ)
  useEffect(() => {
    if (isAutoDownload && patient && !isGeneratingPDF && !isDownloaded) {
      const timer = setTimeout(() => {
        console.log('📥 [Auto-Download] เริ่มบันทึกรายการอัตโนมัติ');
        handleDownloadPDF();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [isAutoDownload, patient, isGeneratingPDF, isDownloaded]);

  const loadPatientData = async () => {
    try {
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

      const { data: followupData } = await supabase
        .from('appointment_followups')
        .select('*')
        .eq('user_id', patientId)
        .order('followup_date', { ascending: false });
      setFollowups(followupData || []);

      const { data: screeningData } = await supabase
        .from('screenings')
        .select('*')
        .eq('user_id', patientId)
        .order('screening_date', { ascending: false });
      setScreenings(screeningData || []);

      const latestFollowup = followupData?.[0];
      setLatestHealthData({
        weight: latestFollowup?.weight ?? patientData?.current_weight ?? null,
        waist: latestFollowup?.waist_circumference ?? patientData?.waist_circumference ?? null,
        fpg: latestFollowup?.blood_sugar_dtx ?? patientData?.blood_sugar ?? null,
        hba1c: patientData?.hba1c_level ?? null,
        bpSys: latestFollowup?.blood_pressure_sys ?? null,
        bpDia: latestFollowup?.blood_pressure_dia ?? null,
        healthDataDate: latestFollowup?.followup_date ?? patientData?.program_start_date ?? null,
      });
    } catch (error) {
      console.error('Error loading patient data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!pdfContentRef.current || isGeneratingPDF) return;

    setIsGeneratingPDF(true);
    try {
      // รอให้ DOM และรูปภาพ Render สมบูรณ์
      await new Promise(resolve => setTimeout(resolve, 500));

      const canvas = await html2canvas(pdfContentRef.current, {
        scale: 1.5, // ลด scale เพื่อป้องกัน Memory Crash แต่ยังคงความคมชัด
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 1000, // บังคับความกว้างให้คงที่
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = pdfWidth / imgWidth;
      const scaledHeight = imgHeight * ratio;

      let heightLeft = scaledHeight;
      let position = 0;

      // หน้าแรก
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, scaledHeight);
      heightLeft -= pdfHeight;

      // หน้าที่เหลือ (ถ้ามี)
      while (heightLeft > 0) {
        position = heightLeft - scaledHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, scaledHeight);
        heightLeft -= pdfHeight;
      }

      const hospitalName = patient?.hospitals?.name || 'ไม่ระบุโรงพยาบาล';
      const hn = patient?.hospital_number || 'ไม่มีHN';
      const firstName = patient?.first_name || 'ไม่ระบุชื่อ';
      const lastName = patient?.last_name || '';
      const fileName = `${hospitalName}_${hn}_${firstName}_${lastName}`.replace(/\s+/g, '_');

      pdf.save(`${fileName}.pdf`);
      setIsDownloaded(true);
      console.log('✅ [PDF] บันทึกสำเร็จ:', fileName);

    } catch (error) {
      console.error('❌ [PDF] เกิดข้อผิดพลาด:', error);
      alert('เกิดข้อผิดพลาดในการบันทึก PDF กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const formatThaiDate = (dateString: string | null) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    return `${date.getDate()} ${thaiMonths[date.getMonth()]} ${date.getFullYear() + 543}`;
  };

  const getStatusBadge = (status: string | null) => {
    const map: any = {
      'excellent': { text: 'ดีเยี่ยม', class: 'bg-green-100 text-green-700' },
      'good': { text: 'ดี', class: 'bg-blue-100 text-blue-700' },
      'fair': { text: 'พอใช้', class: 'bg-yellow-100 text-yellow-700' },
      'needs_improvement': { text: 'ต้องปรับปรุง', class: 'bg-red-100 text-red-700' },
      'monitoring': { text: 'เฝ้าระวัง', class: 'bg-purple-100 text-purple-700' }
    };
    return map[status || ''] || { text: status || '-', class: 'bg-gray-100 text-gray-700' };
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
          <button onClick={() => router.back()} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">กลับ</button>
        </div>
      </div>
    );
  }

  const latestFollowup = followups[0];
  const latestScreening = screenings[0];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header - ซ่อนเมื่อกำลังสร้าง PDF */}
      <div className={`bg-white shadow-sm border-b border-gray-200 ${isGeneratingPDF ? 'hidden' : ''}`}>
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4">
            <ArrowLeft className="w-4 h-4" /> กลับไปหน้าเลือกรายการ
          </button>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">📄 ระเบียนคนไข้: {patient.first_name} {patient.last_name}</h1>
              <p className="text-gray-600">HN: {patient.hospital_number || '-'}</p>
              {isAutoDownload && (
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  {isDownloaded ? <CheckCircle className="w-3 h-3" /> : <Loader2 className="w-3 h-3 animate-spin" />}
                  {isDownloaded ? 'บันทึกรายการเรียบร้อยแล้ว' : 'ระบบกำลังบันทึกรายการอัตโนมัติ...'}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleDownloadPDF}
                disabled={isGeneratingPDF || isDownloaded}
                className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGeneratingPDF ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                {isDownloaded ? 'บันทึกรายการแล้ว' : 'บันทึกรายการ PDF'}
              </button>
              <button onClick={() => { logout(); router.push('/admin/login'); }} className="flex items-center gap-2 px-4 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all shadow-lg">
                <LogOut className="w-4 h-4" /> ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ✅ พื้นที่ที่จะถูกแปลงเป็น PDF */}
      <div ref={pdfContentRef} className="max-w-4xl mx-auto px-4 py-8">
        {/* ===== PAGE 1 ===== */}
        <div className="bg-white p-8 mb-8" style={{ minHeight: '297mm' }}>
          <div className="border-b-2 border-blue-600 pb-4 mb-6 flex justify-between">
            <div>
              <h1 className="text-2xl font-bold text-blue-600">Community Bridge</h1>
              <p className="text-sm text-gray-600">ระบบดูแลผู้ป่วยกลุ่มเสี่ยงเบาหวาน (PreDM)</p>
            </div>
            <div className="text-right">
              <h2 className="text-xl font-bold text-gray-900">ระเบียนติดตามผล</h2>
              <p className="text-sm text-gray-600">Follow-up Record</p>
            </div>
          </div>

          <div className="bg-blue-50 rounded-lg p-4 mb-6 border-l-4 border-blue-500">
            <h3 className="text-lg font-bold text-gray-900 mb-3">👤 ข้อมูลผู้ป่วย</h3>
            <div className="grid grid-cols-3 gap-4">
              <div><p className="text-xs text-gray-600">ชื่อ-นามสกุล</p><p className="font-semibold">{patient.first_name} {patient.last_name}</p></div>
              <div><p className="text-xs text-gray-600">HN</p><p className="font-semibold">{patient.hospital_number || '-'}</p></div>
              <div><p className="text-xs text-gray-600">อายุ / เพศ</p><p className="font-semibold">{patient.age || '-'} ปี / {patient.gender === 'female' ? 'หญิง' : 'ชาย'}</p></div>
              <div><p className="text-xs text-gray-600">PAM Level</p><p className="font-semibold"><span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">{patient.pam_level || 'L0'}</span></p></div>
              <div><p className="text-xs text-gray-600">PROMS Zone</p><p className="font-semibold"><span className={`px-2 py-1 rounded text-sm ${patient.zone === 'Green Zone' ? 'bg-green-100 text-green-700' : patient.zone === 'Yellow Zone' ? 'bg-yellow-100 text-yellow-700' : patient.zone === 'Red Zone' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>{patient.zone || '-'}</span></p></div>
              <div><p className="text-xs text-gray-600">โรงพยาบาล</p><p className="font-semibold">{patient.hospitals?.name || '-'}</p></div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 mb-3 border-b pb-2">📊 ผลการประเมินตนเอง</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-blue-50 rounded-lg p-4 text-center border-2 border-blue-200">
                <p className="text-sm text-gray-600 mb-2">PAM Score</p>
                <p className="text-3xl font-bold text-blue-600">{latestScreening?.pam_total_score || '-'}</p>
                <p className="text-xs text-gray-500 mt-1">{latestScreening ? formatThaiDate(latestScreening.screening_date) : '-'}</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-4 text-center border-2 border-purple-200">
                <p className="text-sm text-gray-600 mb-2">PROMS Zone</p>
                <p className="text-3xl font-bold text-purple-600">{latestScreening?.proms_zone || '-'}</p>
                <p className="text-xs text-gray-500 mt-1">{latestScreening ? formatThaiDate(latestScreening.screening_date) : '-'}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-4 text-center border-2 border-green-200">
                <p className="text-sm text-gray-600 mb-2">Confidence Score</p>
                <p className="text-3xl font-bold text-green-600">{latestScreening?.confidence_score || latestFollowup?.confidence_score || '-'}/10</p>
                <p className="text-xs text-gray-500 mt-1">{latestScreening ? formatThaiDate(latestScreening.screening_date) : '-'}</p>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 mb-3 border-b pb-2">📊 ค่าสุขภาพปัจจุบัน</h3>
            <div className="grid grid-cols-4 gap-4">
              <div className="border rounded-lg p-3 text-center"><p className="text-xs text-gray-600">น้ำหนัก</p><p className="text-xl font-bold">{latestHealthData.weight || '-'} <span className="text-sm">กก.</span></p></div>
              <div className="border rounded-lg p-3 text-center"><p className="text-xs text-gray-600">รอบเอว</p><p className="text-xl font-bold">{latestHealthData.waist || '-'} <span className="text-sm">ซม.</span></p></div>
              <div className="border rounded-lg p-3 text-center"><p className="text-xs text-gray-600">FPG</p><p className="text-xl font-bold">{latestHealthData.fpg || '-'} <span className="text-sm">mg/dL</span></p></div>
              <div className="border rounded-lg p-3 text-center"><p className="text-xs text-gray-600">HbA1c</p><p className="text-xl font-bold">{latestHealthData.hba1c || '-'} <span className="text-sm">%</span></p></div>
            </div>
          </div>

          {latestFollowup && (
            <div className="mb-6">
              <h3 className="text-lg font-bold text-gray-900 mb-3 border-b pb-2">📅 การติดตามล่าสุด (รอบที่ {latestFollowup.followup_round})</h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div><p className="text-xs text-gray-600">วันที่ติดตาม</p><p className="font-semibold">{formatThaiDate(latestFollowup.followup_date)}</p></div>
                  <div><p className="text-xs text-gray-600">สถานะ</p><span className={`px-2 py-1 rounded text-sm font-semibold ${getStatusBadge(latestFollowup.followup_status).class}`}>{getStatusBadge(latestFollowup.followup_status).text}</span></div>
                  <div><p className="text-xs text-gray-600">ความมั่นใจ</p><p className="font-semibold">{latestFollowup.confidence_score || '-'}/10</p></div>
                </div>
              </div>
            </div>
          )}
          <div className="mt-8 pt-4 border-t text-sm text-gray-500 flex justify-between"><span>Community Bridge v1.0</span><span>หน้า 1</span></div>
        </div>

        {/* ===== PAGE 2 ===== */}
        <div className="bg-white p-8 mb-8" style={{ minHeight: '297mm' }}>
          <div className="border-b-2 border-blue-600 pb-4 mb-6">
            <h2 className="text-xl font-bold text-gray-900">📋 ประวัติการติดตาม</h2>
          </div>
          {followups.length === 0 ? <p className="text-center text-gray-500 py-12">ยังไม่มีประวัติการติดตาม</p> : (
            <div className="space-y-4">
              {followups.map((f, i) => (
                <div key={f.id} className={`border rounded-lg p-4 ${i === 0 ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                  <div className="flex justify-between mb-3">
                    <span className="font-bold">รอบที่ {f.followup_round}</span>
                    <span className="text-sm text-gray-600">{formatThaiDate(f.followup_date)}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="bg-white rounded p-2"><p className="text-xs text-gray-600">น้ำหนัก</p><p className="font-semibold">{f.weight || '-'} กก.</p></div>
                    <div className="bg-white rounded p-2"><p className="text-xs text-gray-600">ความดัน</p><p className="font-semibold">{f.blood_pressure_sys && f.blood_pressure_dia ? `${f.blood_pressure_sys}/${f.blood_pressure_dia}` : '-'} mmHg</p></div>
                    <div className="bg-white rounded p-2"><p className="text-xs text-gray-600">FPG</p><p className="font-semibold">{f.blood_sugar_dtx || '-'} mg/dL</p></div>
                    <div className="bg-white rounded p-2"><p className="text-xs text-gray-600">ความมั่นใจ</p><p className="font-semibold">{f.confidence_score || '-'}/10</p></div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-8 pt-4 border-t text-sm text-gray-500 flex justify-between"><span>Community Bridge v1.0</span><span>หน้า 2</span></div>
        </div>

        {/* ===== PAGE 3 (Life Schedule) ===== */}
        {latestFollowup?.life_schedule_image_url && (
          <div className="bg-white p-8 mb-8" style={{ minHeight: '297mm' }}>
            <div className="border-b-2 border-blue-600 pb-4 mb-6">
              <h2 className="text-xl font-bold text-gray-900">📋 Life Schedule - ตารางชีวิตประจำวัน</h2>
            </div>
            <div className="border-2 border-gray-300 rounded-lg overflow-hidden">
              <img src={latestFollowup.life_schedule_image_url} alt="Life Schedule" className="w-full h-auto" style={{ maxHeight: '240mm' }} />
            </div>
            <div className="mt-8 pt-4 border-t text-sm text-gray-500 flex justify-between"><span>Community Bridge v1.0</span><span>หน้า 3</span></div>
          </div>
        )}

        {/* ===== PAGE 4 (Charts) ===== */}
        {(latestFollowup?.floating_chart_image_url || latestFollowup?.dream_card_image_url) && (
          <div className="bg-white p-8 mb-8" style={{ minHeight: '297mm' }}>
            <div className="border-b-2 border-blue-600 pb-4 mb-6">
              <h2 className="text-xl font-bold text-gray-900">📈 รูปภาพประกอบ</h2>
            </div>
            <div className="space-y-6">
              {latestFollowup?.floating_chart_image_url && (
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-3">📈 Floating Chart</h3>
                  <div className="border-2 border-gray-300 rounded-lg overflow-hidden mb-2">
                    <img src={latestFollowup.floating_chart_image_url} alt="Floating Chart" className="w-full h-auto" style={{ maxHeight: '110mm' }} />
                  </div>
                </div>
              )}
              {latestFollowup?.dream_card_image_url && (
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-3">💭 Dream Card</h3>
                  <div className="border-2 border-gray-300 rounded-lg overflow-hidden mb-2">
                    <img src={latestFollowup.dream_card_image_url} alt="Dream Card" className="w-full h-auto" style={{ maxHeight: '110mm' }} />
                  </div>
                </div>
              )}
            </div>
            <div className="mt-8 pt-4 border-t text-sm text-gray-500 flex justify-between"><span>Community Bridge v1.0</span><span>หน้า 4</span></div>
          </div>
        )}

        {/* ===== PAGE 5 ===== */}
        <div className="bg-white p-8" style={{ minHeight: '297mm' }}>
          <div className="border-b-2 border-blue-600 pb-4 mb-6">
            <h2 className="text-xl font-bold text-gray-900">📝 สรุปและคำแนะนำ</h2>
          </div>
          {latestFollowup && (
            <>
              {latestFollowup.summary && <div className="bg-gray-50 rounded-lg p-4 mb-3"><p className="text-xs text-gray-600 font-semibold mb-1">สรุปผลการติดตาม:</p><p className="text-sm">{latestFollowup.summary}</p></div>}
              {latestFollowup.recommendations && <div className="bg-gray-50 rounded-lg p-4 mb-6"><p className="text-xs text-gray-600 font-semibold mb-1">คำแนะนำ:</p><p className="text-sm whitespace-pre-line">{latestFollowup.recommendations}</p></div>}
            </>
          )}
          <div className="mt-12 grid grid-cols-2 gap-8">
            <div className="text-center"><div className="border-b border-gray-400 h-16 mb-2"></div><p className="text-sm font-semibold">ผู้บันทึก (อสม./เจ้าหน้าที่)</p></div>
            <div className="text-center"><div className="border-b border-gray-400 h-16 mb-2"></div><p className="text-sm font-semibold">ผู้ป่วย/ญาติ</p></div>
          </div>
          <div className="mt-8 pt-4 border-t text-sm text-gray-500 flex justify-between"><span>Community Bridge v1.0</span><span>หน้า 5</span></div>
        </div>
      </div>
    </div>
  );
}

export default function PatientRecordDetailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div></div>}>
      <PatientRecordContent />
    </Suspense>
  );
}