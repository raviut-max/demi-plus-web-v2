// app/admin/reports/patient-record/[id]/page.tsx
// ✅ ฉบับสมบูรณ์: 29 ตุลาคม 2569
// ✅ ตัวอย่างบนจอ + บันทึก PDF ฉบับสมบูรณ์ผ่านเทมเพลตกลาง
'use client';
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { checkSession, logout } from '@/lib/supabase/queries';
import { supabase } from '@/lib/supabase/client';
import { ArrowLeft, Download, LogOut, Loader2, CheckCircle } from 'lucide-react';
import { fetchPatientRecordData, generatePatientPDFBlob, buildRecordMeta } from '@/lib/pdf/patientRecordTemplate';

interface PatientData {
  id: string;
  first_name: string | null;
  last_name: string | null;
  hospital_number: string | null;
  age: number | null;
  gender: string | null;
  pam_level: string | null;
  zone: string | null;
  current_weight: number | null;
  waist_circumference: number | null;
  blood_sugar: number | null;
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
  const [coachName, setCoachName] = useState<string>('-');
  const [loading, setLoading] = useState(true);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isDownloaded, setIsDownloaded] = useState(false);

  const [latestHealthData, setLatestHealthData] = useState({
    weight: null as number | null,
    waist: null as number | null,
    fpg: null as number | null,
    hba1c: null as number | null,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, router]);

  useEffect(() => {
    if (patient) {
      const hospitalName = patient.hospitals?.name || 'ไม่ระบุโรงพยาบาล';
      const hn = patient.hospital_number || 'ไม่มีHN';
      const fileName = `${hospitalName}_${hn}_${patient.first_name || ''}_${patient.last_name || ''}`.replace(/\s+/g, '_');
      document.title = fileName;
    }
  }, [patient]);

  const loadPatientData = async () => {
    try {
      const { patient: p, followups: f, screenings: s, coachName: cn } = await fetchPatientRecordData(patientId);
      setPatient(p);
      setFollowups(f);
      setScreenings(s);
      setCoachName(cn);

      const latest = f[0];
      setLatestHealthData({
        weight: latest?.weight ?? p?.current_weight ?? null,
        waist: latest?.waist_circumference ?? p?.waist_circumference ?? null,
        fpg: latest?.blood_sugar_dtx ?? p?.blood_sugar ?? null,
        hba1c: p?.hba1c_level ?? null,
        healthDataDate: latest?.followup_date ?? null,
      });
    } catch (error) {
      console.error('Error loading patient data:', error);
    } finally {
      setLoading(false);
    }
  };

  // ✅ บันทึก PDF ฉบับสมบูรณ์ผ่านเทมเพลตกลาง
  const handleDownloadPDF = async () => {
    if (isGeneratingPDF || !patient) return;
    setIsGeneratingPDF(true);
    try {
      await new Promise(r => setTimeout(r, 300));
      const meta = buildRecordMeta(user?.full_name_th || 'เจ้าหน้าที่ระบบ', coachName, patient);
      const blob = await generatePatientPDFBlob(patient, followups, screenings, meta);

      const hospitalName = patient.hospitals?.name || 'ไม่ระบุโรงพยาบาล';
      const hn = patient.hospital_number || 'ไม่มีHN';
      const fileName = `${hospitalName}_${hn}_${patient.first_name || ''}_${patient.last_name || ''}`.replace(/\s+/g, '_');

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setIsDownloaded(true);
    } catch (error) {
      console.error('❌ [PDF] เกิดข้อผิดพลาด:', error);
      alert('เกิดข้อผิดพลาดในการบันทึก PDF กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // ✅ Auto-download เมื่อมี ?auto=true
  useEffect(() => {
    if (isAutoDownload && patient && !isGeneratingPDF && !isDownloaded) {
      const timer = setTimeout(() => {
        handleDownloadPDF();
      }, 2000);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAutoDownload, patient, isDownloaded]);

  const formatThaiDate = (dateString: string | null) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    return `${date.getDate()} ${thaiMonths[date.getMonth()]} ${date.getFullYear() + 543}`;
  };

  const getStatusBadge = (status: string | null) => {
    const map: any = {
      excellent: { text: 'ดีเยี่ยม', class: 'bg-green-100 text-green-700' },
      good: { text: 'ดี', class: 'bg-blue-100 text-blue-700' },
      fair: { text: 'พอใช้', class: 'bg-yellow-100 text-yellow-700' },
      needs_improvement: { text: 'ต้องปรับปรุง', class: 'bg-red-100 text-red-700' },
      monitoring: { text: 'เฝ้าระวัง', class: 'bg-purple-100 text-purple-700' },
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
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4">
            <ArrowLeft className="w-4 h-4" /> กลับไปหน้าเลือกรายการ
          </button>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">📄 ระเบียนคนไข้: {patient.first_name} {patient.last_name}</h1>
              <p className="text-gray-600">HN: {patient.hospital_number || '-'} • ผู้ดูแล: {coachName}</p>
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

      {/* ตัวอย่างบนจอ (Preview) */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* PAGE 1 */}
        <div className="bg-white p-8 mb-8 shadow">
          <div className="border-b-2 border-blue-600 pb-4 mb-6 flex justify-between">
            <div>
              <h1 className="text-2xl font-bold text-blue-600">Community Bridge</h1>
              <p className="text-sm text-gray-600">ระบบดูแลผู้ป่วยกลุ่มเสี่ยงเบาหวาน (PreDM)</p>
            </div>
            <div className="text-right">
              <h2 className="text-xl font-bold text-gray-900">ระเบียนติดตามผลครบฉบับสมบูรณ์</h2>
              <p className="text-sm text-gray-600">Complete Follow-up Record</p>
            </div>
          </div>

          <div className="bg-blue-50 rounded-lg p-4 mb-6 border-l-4 border-blue-500">
            <h3 className="text-lg font-bold text-gray-900 mb-3">👤 ข้อมูลผู้ป่วย</h3>
            <div className="grid grid-cols-3 gap-4">
              <div><p className="text-xs text-gray-600">ชื่อ-นามสกุล</p><p className="font-semibold">{patient.first_name} {patient.last_name}</p></div>
              <div><p className="text-xs text-gray-600">HN</p><p className="font-semibold">{patient.hospital_number || '-'}</p></div>
              <div><p className="text-xs text-gray-600">อายุ / เพศ</p><p className="font-semibold">{patient.age || '-'} ปี / {patient.gender === 'female' ? 'หญิง' : 'ชาย'}</p></div>
              <div><p className="text-xs text-gray-600">PAM Level</p><p className="font-semibold">{patient.pam_level || 'L0'}</p></div>
              <div><p className="text-xs text-gray-600">PROMS Zone</p><p className="font-semibold">{patient.zone || '-'}</p></div>
              <div><p className="text-xs text-gray-600">วันที่เริ่มต้น</p><p className="font-semibold">{formatThaiDate(patient.program_start_date)}</p></div>
              <div><p className="text-xs text-gray-600">ผู้ดูแล/โค้ช</p><p className="font-semibold">{coachName}</p></div>
              <div><p className="text-xs text-gray-600">โรงพยาบาล</p><p className="font-semibold">{patient.hospitals?.name || '-'}</p></div>
              <div><p className="text-xs text-gray-600">Confidence</p><p className="font-semibold">{latestFollowup?.confidence_score ?? latestScreening?.confidence_score ?? '-'}/10</p></div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 mb-3 border-b pb-2">📊 ผลการประเมินตนเอง</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-blue-50 rounded-lg p-4 text-center border-2 border-blue-200">
                <p className="text-sm text-gray-600 mb-2">PAM Score</p>
                <p className="text-3xl font-bold text-blue-600">{latestScreening?.pam_total_score || '-'}</p>
                <p className="text-sm text-gray-700 mt-2">{latestScreening?.pam_level_result || patient.pam_level || '-'}</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-4 text-center border-2 border-purple-200">
                <p className="text-sm text-gray-600 mb-2">PROMS Zone</p>
                <p className="text-3xl font-bold text-purple-600">{latestScreening?.proms_zone || '-'}</p>
                <p className="text-sm text-gray-700 mt-2">Q1:{latestScreening?.proms_q1_score || 0} Q2:{latestScreening?.proms_q2_score || 0} Q3:{latestScreening?.proms_q3_score || 0} Q4:{latestScreening?.proms_q4_score || 0}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-4 text-center border-2 border-green-200">
                <p className="text-sm text-gray-600 mb-2">Confidence Score</p>
                <p className="text-3xl font-bold text-green-600">{latestScreening?.confidence_score || latestFollowup?.confidence_score || '-'}/10</p>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 mb-3 border-b pb-2">
              📊 ค่าสุขภาพปัจจุบัน
              {latestHealthData.healthDataDate && <span className="text-sm font-normal text-gray-500 ml-2">(ข้อมูลเมื่อ {formatThaiDate(latestHealthData.healthDataDate)})</span>}
            </h3>
            <div className="grid grid-cols-4 gap-4">
              <div className="border rounded-lg p-3 text-center"><p className="text-xs text-gray-600">น้ำหนัก</p><p className="text-xl font-bold">{latestHealthData.weight || '-'} <span className="text-sm">กก.</span></p></div>
              <div className="border rounded-lg p-3 text-center"><p className="text-xs text-gray-600">รอบเอว</p><p className="text-xl font-bold">{latestHealthData.waist || '-'} <span className="text-sm">ซม.</span></p></div>
              <div className="border rounded-lg p-3 text-center"><p className="text-xs text-gray-600">ความดัน</p><p className="text-xl font-bold">{latestFollowup?.blood_pressure_sys && latestFollowup?.blood_pressure_dia ? `${latestFollowup.blood_pressure_sys}/${latestFollowup.blood_pressure_dia}` : '-'} <span className="text-sm">mmHg</span></p></div>
              <div className="border rounded-lg p-3 text-center"><p className="text-xs text-gray-600">FPG</p><p className="text-xl font-bold">{latestHealthData.fpg || '-'} <span className="text-sm">mg/dL</span></p></div>
              <div className="border rounded-lg p-3 text-center"><p className="text-xs text-gray-600">BMI</p><p className="text-xl font-bold">{(patient as any)?.bmi ?? '-'}</p></div>
              <div className="border rounded-lg p-3 text-center"><p className="text-xs text-gray-600">HbA1c</p><p className="text-xl font-bold">{latestHealthData.hba1c || '-'} <span className="text-sm">%</span></p></div>
            </div>
          </div>
        </div>

        {/* PAGE 2: ประวัติ */}
        <div className="bg-white p-8 mb-8 shadow">
          <h2 className="text-xl font-bold text-gray-900 mb-4 border-b-2 border-blue-600 pb-2">📋 ประวัติการติดตาม</h2>
          {followups.length === 0 ? (
            <p className="text-center text-gray-500 py-12">ยังไม่มีประวัติการติดตาม</p>
          ) : (
            <div className="space-y-4">
              {followups.map((f, i) => (
                <div key={f.id} className={`border rounded-lg p-4 ${i === 0 ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                  <div className="flex justify-between mb-3">
                    <span className="text-lg font-bold">รอบที่ {f.followup_round}</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusBadge(f.followup_status).class}`}>{getStatusBadge(f.followup_status).text}</span>
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
        </div>

        {/* PAGE 3: รูปภาพ */}
        <div className="bg-white p-8 mb-8 shadow">
          <h2 className="text-xl font-bold text-gray-900 mb-4 border-b-2 border-blue-600 pb-2">📈 รูปภาพประกอบ</h2>
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">📋 Life Schedule</h3>
              {latestFollowup?.life_schedule_image_url ? (
                <div className="border-2 border-gray-300 rounded-lg overflow-hidden">
                  <img src={latestFollowup.life_schedule_image_url} alt="Life Schedule" className="w-full h-auto" style={{ maxHeight: '400px', objectFit: 'contain' }} />
                </div>
              ) : (
                <div className="border-2 border-dashed border-gray-300 rounded-lg h-40 flex items-center justify-center text-gray-400">✕ ไม่พบรูปภาพ</div>
              )}
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">📈 Floating Chart</h3>
              {latestFollowup?.floating_chart_image_url ? (
                <div className="border-2 border-gray-300 rounded-lg overflow-hidden">
                  <img src={latestFollowup.floating_chart_image_url} alt="Floating Chart" className="w-full h-auto" style={{ maxHeight: '300px', objectFit: 'contain' }} />
                </div>
              ) : (
                <div className="border-2 border-dashed border-gray-300 rounded-lg h-40 flex items-center justify-center text-gray-400">✕ ไม่พบรูปภาพ</div>
              )}
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">💭 Dream Card</h3>
              {latestFollowup?.dream_card_image_url ? (
                <div className="border-2 border-gray-300 rounded-lg overflow-hidden">
                  <img src={latestFollowup.dream_card_image_url} alt="Dream Card" className="w-full h-auto" style={{ maxHeight: '300px', objectFit: 'contain' }} />
                </div>
              ) : (
                <div className="border-2 border-dashed border-gray-300 rounded-lg h-40 flex items-center justify-center text-gray-400">✕ ไม่พบรูปภาพ</div>
              )}
            </div>
          </div>
        </div>

        {/* PAGE 4: สรุป */}
        <div className="bg-white p-8 shadow">
          <h2 className="text-xl font-bold text-gray-900 mb-4 border-b-2 border-blue-600 pb-2">📝 สรุปและคำแนะนำ</h2>
          {latestFollowup?.summary && (
            <div className="bg-gray-50 rounded-lg p-4 mb-3">
              <p className="text-xs text-gray-600 font-semibold mb-1">สรุปผลการติดตาม:</p>
              <p className="text-sm">{latestFollowup.summary}</p>
            </div>
          )}
          {latestFollowup?.recommendations && (
            <div className="bg-gray-50 rounded-lg p-4 mb-3">
              <p className="text-xs text-gray-600 font-semibold mb-1">คำแนะนำ:</p>
              <p className="text-sm whitespace-pre-line">{latestFollowup.recommendations}</p>
            </div>
          )}
          <div className="mt-8 grid grid-cols-2 gap-8">
            <div className="text-center">
              <div className="border-b border-gray-400 h-16 mb-2"></div>
              <p className="text-sm font-semibold">ผู้บันทึก (อสม./เจ้าหน้าที่)</p>
              <p className="text-xs text-gray-600 mt-1">{user?.full_name_th || '-'}</p>
            </div>
            <div className="text-center">
              <div className="border-b border-gray-400 h-16 mb-2"></div>
              <p className="text-sm font-semibold">ผู้ป่วย/ญาติ</p>
              <p className="text-xs text-gray-600 mt-1">{patient.first_name} {patient.last_name}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PatientRecordDetailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    }>
      <PatientRecordContent />
    </Suspense>
  );
}