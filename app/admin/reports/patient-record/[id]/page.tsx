// app/admin/reports/patient-record/[id]/page.tsx
// ✅ ฉบับสมบูรณ์: 29 ตุลาคม 2569
// ✅ หน้า Preview แสดงผลตรงกับเอกสาร PDF ที่บันทึก (ใช้เทมเพลตกลางตัวเดียวกัน)
'use client';
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { checkSession, logout } from '@/lib/supabase/queries';
import {
  fetchPatientRecordData,
  generatePatientPDFBlob,
  buildRecordMeta,
  renderPatientPages,
} from '@/lib/pdf/patientRecordTemplate';
import { ArrowLeft, Download, LogOut, Loader2, CheckCircle, FileText } from 'lucide-react';

function PatientRecordContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const isAutoDownload = searchParams.get('auto') === 'true';
  const patientId = params.id as string;

  const [user, setUser] = useState<any>(null);
  const [patient, setPatient] = useState<any>(null);
  const [followups, setFollowups] = useState<any[]>([]);
  const [screenings, setScreenings] = useState<any[]>([]);
  const [coachName, setCoachName] = useState<string>('-');
  const [loading, setLoading] = useState(true);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isDownloaded, setIsDownloaded] = useState(false);

  // ✅ หน้าเอกสารที่เรนเดอร์จากเทมเพลตกลาง (ตรงกับ PDF ที่จะบันทึก)
  const [pages, setPages] = useState<string[]>([]);

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

  // ✅ ตั้งชื่อไฟล์ PDF อัตโนมัติ
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
    } catch (error) {
      console.error('Error loading patient data:', error);
    } finally {
      setLoading(false);
    }
  };

  // ✅ สร้างหน้าเอกสาร Preview จากเทมเพลตกลาง (ตัวเดียวกับที่ใช้บันทึก PDF)
  useEffect(() => {
    if (patient) {
      try {
        const meta = buildRecordMeta(user?.full_name_th || 'เจ้าหน้าที่ระบบ', coachName, patient);
        const htmlPages = renderPatientPages(patient, followups, screenings, meta);
        setPages(htmlPages);
      } catch (error) {
        console.error('Error rendering preview pages:', error);
      }
    }
  }, [patient, followups, screenings, coachName, user]);

  // ✅ บันทึก PDF ฉบับสมบูรณ์
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

  return (
    <div className="min-h-screen bg-gray-200">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-600 hover:text-gray-800">
                <ArrowLeft className="w-4 h-4" /> กลับ
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-800">
                  📄 ระเบียนคนไข้: {patient.first_name} {patient.last_name}
                </h1>
                <p className="text-xs text-gray-600">
                  HN: {patient.hospital_number || '-'} • ผู้ดูแล: {coachName}
                  {pages.length > 0 && <span className="ml-2 text-blue-600 font-semibold">• เอกสาร {pages.length} หน้า</span>}
                </p>
                {isAutoDownload && (
                  <p className="text-xs text-green-600 mt-0.5 flex items-center gap-1">
                    {isDownloaded ? <CheckCircle className="w-3 h-3" /> : <Loader2 className="w-3 h-3 animate-spin" />}
                    {isDownloaded ? 'บันทึกรายการเรียบร้อยแล้ว' : 'ระบบกำลังบันทึกรายการอัตโนมัติ...'}
                  </p>
                )}
              </div>
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

      {/* ✅ Preview เอกสาร - เรนเดอร์จากเทมเพลตกลาง (ตรงกับ PDF ที่บันทึกทุกหน้า) */}
      <div className="py-8 overflow-x-auto">
        <div className="text-center mb-4">
          <span className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
            <FileText className="w-4 h-4" />
            ตัวอย่างเอกสารด้านล่างตรงกับไฟล์ PDF ที่จะบันทึกทุกหน้า
          </span>
        </div>

        {pages.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto mb-3" />
              <p className="text-gray-600">กำลังจัดหน้าเอกสาร...</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-8 px-4">
            {pages.map((html, i) => (
              <div key={i} className="relative">
                <div className="absolute -top-6 left-0 text-xs font-semibold text-gray-500">
                  หน้า {i + 1} / {pages.length}
                </div>
                <div
                  className="shadow-2xl rounded-sm"
                  style={{ width: 794 }}
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              </div>
            ))}
          </div>
        )}
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