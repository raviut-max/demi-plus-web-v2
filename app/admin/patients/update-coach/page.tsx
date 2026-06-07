/**
📄 ไฟล์: page.tsx
📂 ตำแหน่ง: app/admin/patients/update-coach/page.tsx
🏥 ระบบ: DEMI+ (Diabetes Engagement Management Interface Plus)
📝 หน้าที่: อัปเดตโค้ชให้ผู้ป่วยที่มีอยู่แล้วผ่าน Excel
*/
'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, getCoachesWithHospitals } from '@/lib/supabase/queries';
import { supabase } from '@/lib/supabase/client';
import { Upload, AlertCircle, Loader2, ArrowLeft, CheckCircle, XCircle, Download, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function UpdateCoachPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [rawData, setRawData] = useState<any[]>([]);
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [headerMapping, setHeaderMapping] = useState<Record<string, string>>({ id_card: '', coach_name: '' });
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview' | 'processing' | 'success'>('upload');
  const [coaches, setCoaches] = useState<any[]>([]);
  const [processedCount, setProcessedCount] = useState({ success: 0, failed: 0 });
  const [errors, setErrors] = useState<any[]>([]);

  useEffect(() => {
    const userData = checkSession();
    if (!userData) { router.push('/admin/login'); return; }
    if (!['admin', 'doctor'].includes(userData.role)) { router.push('/admin/patients'); return; }
    setUser(userData);
    loadCoaches();
  }, [router]);

  const loadCoaches = async () => {
    try {
      const allCoaches = await getCoachesWithHospitals();
      setCoaches(allCoaches);
    } catch (err) { console.error('Error loading coaches:', err); }
  };

  // ✅ ฟังก์ชันจับคู่คอลัมน์อัตโนมัติ
  useEffect(() => {
    if (rawData.length === 0 || excelHeaders.length === 0) return;
    
    const newMapping = { ...headerMapping };
    let hasChange = false;

    excelHeaders.forEach(header => {
      const lowerHeader = header.toLowerCase().trim();
      
      // ตรวจสอบ ID Card
      if ((lowerHeader.includes('id') && lowerHeader.includes('card')) || 
          lowerHeader.includes('บัตรประชาชน') || lowerHeader.includes('เลขบัตร')) {
        if (!newMapping.id_card) { newMapping.id_card = header; hasChange = true; }
      }
      
      // ตรวจสอบ Coach Name
      if (lowerHeader.includes('coach') || lowerHeader.includes('โค้ช') || 
          lowerHeader.includes('ผู้ดูแล') || lowerHeader.includes('หมอ')) {
        if (!newMapping.coach_name) { newMapping.coach_name = header; hasChange = true; }
      }
    });

    if (hasChange) setHeaderMapping(newMapping);
  }, [rawData, excelHeaders]);

  const processFile = (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) { setError('กรุณาเลือกไฟล์ Excel เท่านั้น'); return; }
    setSelectedFile(file); setError(''); setLoading(true);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'array', cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
        setRawData(json);
        if (json.length > 0) setExcelHeaders(Object.keys(json[0]));
        setStep('mapping');
      } catch { setError('❌ ไม่สามารถอ่านไฟล์ได้'); }
      finally { setLoading(false); }
    };
    reader.readAsArrayBuffer(file);
  };

  const buildPreview = () => {
    if (!headerMapping.id_card || !headerMapping.coach_name) {
      setError('❌ กรุณาระบุคอลัมน์ "เลขบัตรประชาชน" และ "ชื่อโค้ช" ให้ครบถ้วน');
      return;
    }
    
    const mapped = rawData.map((row, idx) => ({
      _rowIndex: idx,
      id_card: String(row[headerMapping.id_card] || '').replace(/[-\s]/g, ''),
      coach_name: String(row[headerMapping.coach_name] || '').trim(),
      original_data: row
    })).filter(r => r.id_card && r.coach_name); // กรองแถวที่ข้อมูลไม่ครบออก

    setPreviewData(mapped);
    setStep('preview');
  };

  const handleUpdate = async () => {
    setStep('processing');
    setProcessedCount({ success: 0, failed: 0 });
    setErrors([]);
    
    const results = { success: 0, failed: 0, errors: [] as any[] };

    for (let i = 0; i < previewData.length; i++) {
      const item = previewData[i];
      try {
        // 1. หา Patient ID จากบัตรประชาชน
        const { data: patientUser, error: userError } = await supabase
          .from('users')
          .select('id')
          .eq('id_card', item.id_card)
          .eq('role', 'patient')
          .single();

        if (userError || !patientUser) {
          throw new Error('ไม่พบผู้ป่วยในระบบ (ตรวจสอบเลขบัตรประชาชน)');
        }

        // 2. หา Coach ID จากชื่อ (แบบ Flexible)
        const coachNameLower = item.coach_name.toLowerCase();
        const foundCoach = coaches.find(c => 
          c.full_name_th?.toLowerCase().includes(coachNameLower) || 
          coachNameLower.includes(c.full_name_th?.toLowerCase() || '')
        );

        if (!foundCoach) {
          throw new Error(`ไม่พบโค้ชชื่อ: "${item.coach_name}" ในระบบ`);
        }

        // 3. อัปเดต Profile
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ 
            coach_id: foundCoach.user_id,
            updated_at: new Date().toISOString()
          })
          .eq('id', patientUser.id);

        if (updateError) throw updateError;

        results.success++;
      } catch (err: any) {
        results.failed++;
        results.errors.push({
          row: i + 1,
          id_card: item.id_card,
          coach_name: item.coach_name,
          error: err.message
        });
      }
      
      // อัปเดต Progress ทุกๆ 10 รายการเพื่อไม่ให้ UI ค้าง
      if (i % 10 === 0) {
        setProcessedCount({ success: results.success, failed: results.failed });
      }
    }

    setProcessedCount({ success: results.success, failed: results.failed });
    setErrors(results.errors);
    setStep('success');
  };

  const downloadTemplate = () => {
    const template = [
      { 'เลขบัตรประชาชน': '1234567890123', 'ชื่อโค้ช': 'นายแพทย์ สมชาย ใจดี' }
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'Template_Update_Coach.xlsx');
  };

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-lg p-8">
          <div className="text-center mb-8">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-800">ดำเนินการเสร็จสิ้น</h2>
            <p className="text-gray-600 mt-2">อัปเดตโค้ชสำเร็จ: <span className="font-bold text-green-600">{processedCount.success}</span> ราย</p>
            <p className="text-gray-600">ล้มเหลว: <span className="font-bold text-red-600">{processedCount.failed}</span> ราย</p>
          </div>

          {errors.length > 0 && (
            <div className="mb-8">
              <h3 className="font-semibold text-red-600 mb-2">รายการที่ผิดพลาด:</h3>
              <div className="bg-red-50 border border-red-200 rounded-lg max-h-64 overflow-y-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-red-100 sticky top-0">
                    <tr><th className="p-2">แถว</th><th className="p-2">บัตร ปชช.</th><th className="p-2">โค้ช</th><th className="p-2">เหตุผล</th></tr>
                  </thead>
                  <tbody>
                    {errors.map((err, idx) => (
                      <tr key={idx} className="border-b border-red-100">
                        <td className="p-2">{err.row}</td>
                        <td className="p-2 font-mono">{err.id_card}</td>
                        <td className="p-2">{err.coach_name}</td>
                        <td className="p-2 text-red-600">{err.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={() => {
                 const ws = XLSX.utils.json_to_sheet(errors);
                 const wb = XLSX.utils.book_new();
                 XLSX.utils.book_append_sheet(wb, ws, 'Errors');
                 XLSX.writeFile(wb, 'Update_Coach_Errors.xlsx');
              }} className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 flex items-center gap-2 mx-auto">
                <Download className="w-4 h-4" /> ดาวน์โหลดรายงานข้อผิดพลาด
              </button>
            </div>
          )}

          <div className="flex justify-center gap-4">
            <button onClick={() => { setStep('upload'); setRawData([]); setPreviewData([]); setErrors([]); }} className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
              อัปโหลดไฟล์ใหม่
            </button>
            <button onClick={() => router.back()} className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium">
              กลับหน้าหลัก
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b border-gray-200 px-4 py-6">
        <div className="max-w-7xl mx-auto">
          <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4">
            <ArrowLeft className="w-4 h-4" /> กลับ
          </button>
          <h1 className="text-3xl font-bold text-gray-800">🔄 อัปเดตโค้ชให้ผู้ป่วย (Existing Patients)</h1>
          <p className="text-gray-600 mt-1">ใช้สำหรับเติมหรือเปลี่ยนชื่อโค้ชให้ผู้ป่วยที่มีอยู่ในระบบแล้ว</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-700 flex-1">{error}</p>
            <button onClick={() => setError('')} className="text-red-600">✕</button>
          </div>
        )}

        {step === 'upload' && (
          <div className="bg-white rounded-xl shadow p-6 border border-gray-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold">1. อัปโหลดไฟล์ Excel</h2>
              <button onClick={downloadTemplate} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                <FileSpreadsheet className="w-4 h-4" /> ดาวน์โหลด Template
              </button>
            </div>
            
            <div onDrop={(e) => { e.preventDefault(); if(e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]); }} 
                 onDragOver={e => e.preventDefault()} 
                 onClick={() => document.getElementById('file-input-update')?.click()} 
                 className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-blue-500 cursor-pointer bg-gray-50 transition-colors">
              <input id="file-input-update" type="file" accept=".xlsx,.xls" onChange={e => e.target.files?.[0] && processFile(e.target.files[0])} className="hidden" />
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-700 font-medium text-lg">ลากไฟล์มาวาง หรือคลิกเลือก</p>
              <p className="text-sm text-gray-500 mt-2">รองรับ .xlsx, .xls</p>
            </div>
            {loading && <div className="mt-4 flex justify-center items-center gap-2 text-blue-600"><Loader2 className="w-4 h-4 animate-spin" /> กำลังอ่านไฟล์...</div>}
          </div>
        )}

        {step === 'mapping' && (
          <div className="bg-white rounded-xl shadow p-6 border border-gray-200">
            <h2 className="text-lg font-semibold mb-6">2. จับคู่คอลัมน์ข้อมูล</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="p-4 border rounded-lg bg-blue-50 border-blue-200">
                <label className="block text-sm font-bold text-blue-800 mb-2">คอลัมน์เลขบัตรประชาชน (Required)</label>
                <select value={headerMapping.id_card} onChange={e => setHeaderMapping({...headerMapping, id_card: e.target.value})} className="w-full p-2 border rounded">
                  <option value="">-- เลือกคอลัมน์ --</option>
                  {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div className="p-4 border rounded-lg bg-green-50 border-green-200">
                <label className="block text-sm font-bold text-green-800 mb-2">คอลัมน์ชื่อโค้ช (Required)</label>
                <select value={headerMapping.coach_name} onChange={e => setHeaderMapping({...headerMapping, coach_name: e.target.value})} className="w-full p-2 border rounded">
                  <option value="">-- เลือกคอลัมน์ --</option>
                  {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={buildPreview} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">ถัดไป: ตรวจสอบข้อมูล →</button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="bg-white rounded-xl shadow p-6 border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">3. ตรวจสอบก่อนอัปเดต ({previewData.length} รายการ)</h2>
              <span className="text-sm text-gray-500">ระบบจะค้นหาผู้ป่วยจากบัตรประชาชน และจับคู่กับโค้ชที่มีอยู่จริง</span>
            </div>
            
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <p className="font-bold">คำเตือน:</p>
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li>หากไม่พบผู้ป่วยในระบบ รายการนั้นจะถูกข้าม</li>
                  <li>หากไม่พบชื่อโค้ชในฐานข้อมูล รายการนั้นจะถือว่าล้มเหลว</li>
                  <li>การดำเนินการนี้จะเขียนทับข้อมูลโค้ชเดิมทันที</li>
                </ul>
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto border rounded-lg mb-6">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-100 sticky top-0">
                  <tr><th className="p-3">#</th><th className="p-3">เลขบัตรประชาชน</th><th className="p-3">ชื่อโค้ชในไฟล์</th></tr>
                </thead>
                <tbody>
                  {previewData.slice(0, 10).map((row, idx) => (
                    <tr key={idx} className="border-b">
                      <td className="p-3">{idx + 1}</td>
                      <td className="p-3 font-mono">{row.id_card}</td>
                      <td className="p-3">{row.coach_name}</td>
                    </tr>
                  ))}
                  {previewData.length > 10 && (
                    <tr><td colSpan={3} className="p-3 text-center text-gray-500 italic">...และอีก {previewData.length - 10} รายการ</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-4">
              <button onClick={() => setStep('mapping')} className="px-4 py-2 border rounded hover:bg-gray-50">ย้อนกลับ</button>
              <button onClick={handleUpdate} className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium flex items-center gap-2">
                <CheckCircle className="w-4 h-4" /> ยืนยันการอัปเดต
              </button>
            </div>
          </div>
        )}

        {step === 'processing' && (
          <div className="bg-white rounded-xl shadow p-12 border border-gray-200 text-center">
            <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-800">กำลังประมวลผล...</h3>
            <p className="text-gray-500 mt-2">สำเร็จ: {processedCount.success} | ล้มเหลว: {processedCount.failed}</p>
            <p className="text-xs text-gray-400 mt-1">กรุณาอย่าปิดหน้านี้จนกว่ากระบวนการจะเสร็จสิ้น</p>
          </div>
        )}
      </div>
    </div>
  );
}