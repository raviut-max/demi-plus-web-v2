// 📂 ไฟล์: app/admin/patients/import-excel/page.tsx
// 🎯 หน้าที่: อ่านไฟล์ Excel → จับคู่คอลัมน์ → แสดง Preview → ตรวจสอบ Validation → แก้ไขรายบรรทัด → นำเข้า DB
// 🔗 เชื่อมต่อกับ: @/lib/supabase/queries.ts (registerPatient, getHospitalsWithHierarchy, getCoachesWithHospitals)
// 📦 Dependencies: npm install xlsx lucide-react
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx'; // 📦 ไลบรารีอ่านไฟล์ Excel อย่างปลอดภัย
import {
  checkSession, registerPatient, getCoachesWithHospitals, getHospitalsWithHierarchy
} from '@/lib/supabase/queries';
import {
  Upload, CheckCircle, AlertCircle, XCircle, Loader2, ArrowLeft,
  FileSpreadsheet, UserPlus, Edit2, Save, Layers, Eye, RefreshCw, Download
} from 'lucide-react';

// =====================================================
// 🗺️ 1. CONFIG & MAPPINGS (ตั้งค่าการจับคู่คอลัมน์)
// =====================================================
// 🔗 ใช้สำหรับจับคู่ Header ใน Excel กับ Field ในระบบอัตโนมัติ
const COLUMN_ALIASES: Record<string, string[]> = {
  id_card: ['เลขบัตรประชาชน', 'บัตรประชาชน', 'id_card', 'idcard', 'national_id', 'เลขบัตร'],
  birth_date: ['วันเกิด', 'birth_date', 'birthdate', 'dob', 'date_of_birth'],
  first_name: ['ชื่อ', 'first_name', 'firstname', 'name'],
  last_name: ['นามสกุล', 'last_name', 'lastname', 'surname'],
  hospital_number: ['HN', 'hn', 'hospital_number', 'hospitalnumber', 'เลขที่ผู้ป่วย'],
  gender: ['เพศ', 'gender', 'sex'],
  hospital: ['โรงพยาบาล', 'hospital', 'hospital_name', 'รพ.'],
  coach_name: ['ชื่อผู้ดูแล', 'โค้ช', 'coach', 'coach_name', 'อสม.'],
  phone: ['เบอร์โทร', 'โทรศัพท์', 'phone', 'tel'],
  current_weight: ['น้ำหนัก', 'weight', 'current_weight'],
  height: ['ส่วนสูง', 'height'],
  waist_circumference: ['รอบเอว', 'waist', 'waist_circumference'],
  diabetes_type: ['ประเภทเบาหวาน', 'diabetes_type'],
  blood_sugar: ['ค่าน้ำตาล', 'blood_sugar', 'glucose'],
  hba1c_level: ['HbA1c', 'hba1c'],
};

// ⚠️ ฟิลด์บังคับ (ถ้าไม่มีใน Excel จะขึ้น Error ทันที)
const REQUIRED_FIELDS = ['id_card', 'birth_date', 'first_name', 'last_name', 'hospital_number', 'gender', 'hospital'];
const FIELD_LABELS: Record<string, string> = {
  id_card: 'เลขบัตรประชาชน', birth_date: 'วันเกิด', first_name: 'ชื่อ', last_name: 'นามสกุล',
  hospital_number: 'HN', gender: 'เพศ', hospital: 'โรงพยาบาล', phone: 'เบอร์โทร',
  coach_name: 'ชื่อผู้ดูแล', current_weight: 'น้ำหนัก', height: 'ส่วนสูง', waist_circumference: 'รอบเอว',
  diabetes_type: 'ประเภทเบาหวาน', blood_sugar: 'ค่าน้ำตาล', hba1c_level: 'HbA1c'
};

// =====================================================
// 🛠️ 2. HELPER FUNCTIONS (ตรวจสอบ/แปลงข้อมูล)
// =====================================================
// 🔹 จัดการเลขบัตร: ตัดขีด/เว้นวรรค → ตรวจสอบ 13 หลัก
const normalizeIdCard = (val: string) => (val || '').toString().replace(/[\s\-\.\,]/g, '');
const validateThaiId = (id: string) => /^\d{13}$/.test(normalizeIdCard(id));

// 🔹 แปลงวันเกิด: รองรับ DD/MM/YYYY (พ.ศ.) หรือ YYYY-MM-DD (ค.ศ.) → ISO YYYY-MM-DD
const parseDateToISO = (val: string): string | null => {
  if (!val) return null;
  const clean = val.toString().trim();
  const dmy = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    let [, d, m, y] = dmy;
    const yearNum = parseInt(y, 10);
    const adY = yearNum > 2500 ? yearNum - 543 : yearNum; // แปลง พ.ศ. → ค.ศ.
    return `${adY}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const ymd = clean.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  return ymd ? ymd[0] : null;
};

// 🔹 ตรวจสอบความถูกต้องของแถวตาม DB Constraints
const validateRow = (row: any, hospitals: any[], coaches: any[]) => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const mapped = { ...row };

  if (!validateThaiId(mapped.id_card)) errors.push('บัตรประชาชนไม่ครบ 13 หลัก');
  if (!mapped.birth_date || !parseDateToISO(mapped.birth_date)) errors.push('⚠️ ต้องระบุวันเกิด (DD/MM/YYYY)');
  if (!mapped.first_name?.trim()) errors.push('ต้องระบุชื่อ');
  if (!mapped.last_name?.trim()) errors.push('ต้องระบุนามสกุล');
  if (!mapped.hospital_number?.trim()) errors.push('ต้องระบุ HN');

  // จับคู่โรงพยาบาลอัตโนมัติ
  const hosp = hospitals.find(h => h.name.includes(mapped.hospital) || h.code === mapped.hospital);
  mapped.hospital_id = hosp?.id || null;
  if (!mapped.hospital_id) errors.push(`ไม่พบโรงพยาบาล "${mapped.hospital}"`);

  // จับคู่โค้ช (Optional)
  const coach = coaches.find(c => c.full_name_th?.includes(mapped.coach_name));
  mapped.coach_id = coach?.user_id || null;
  if (mapped.coach_name && !coach) warnings.push(`ไม่พบโค้ช "${mapped.coach_name}"`);

  // แปลงตัวเลขสุขภาพ
  ['current_weight', 'height', 'waist_circumference', 'blood_sugar', 'hba1c_level'].forEach(f => {
    if (mapped[f]) {
      const num = parseFloat(mapped[f]);
      if (!isNaN(num)) mapped[f] = num;
      else errors.push(`${FIELD_LABELS[f]} ต้องเป็นตัวเลข`);
    }
  });

  return { mapped, errors, warnings, isValid: errors.length === 0 };
};

// =====================================================
// 🎯 3. MAIN COMPONENT
// =====================================================
export default function ImportPatientsExcelPage() {
  const router = useRouter();
  
  // 📦 State จัดการข้อมูลผู้ใช้และระบบ
  const [user, setUser] = useState<any>(null);
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [coaches, setCoaches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 📦 State จัดการไฟล์และ Mapping
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [manualMapping, setManualMapping] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<any[]>([]);
  const [previewMode, setPreviewMode] = useState(false);

  // 📦 State จัดการการนำเข้าและแก้ไข
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [editErrors, setEditErrors] = useState<string[]>([]);

  // 🔹 โหลดข้อมูลเริ่มต้น (สิทธิ์, รพ., โค้ช)
  useEffect(() => {
    const init = async () => {
      const u = checkSession();
      if (!u || !['admin', 'doctor', 'helper', 'osm'].includes(u.role)) return router.push('/admin/login');
      setUser(u);
      
      const h = await getHospitalsWithHierarchy();
      setHospitals(h);
      
      const c = await getCoachesWithHospitals(h.map(x => x.id));
      setCoaches(c);
      setLoading(false);
    };
    init();
  }, []);

  // 🔹 📤 อัปโหลดไฟล์ Excel → อ่านข้อมูล → Auto-Detect Mapping → Validate
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    if (!json.length) return alert('ไฟล์ว่างเปล่า');

    const headers = Object.keys(json[0]);
    setRawHeaders(headers);

    // 🔍 Auto-Detect Column Mapping
    const auto: Record<string, string> = {};
    headers.forEach(h => {
      const norm = h.trim().toLowerCase();
      for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
        if (aliases.some(a => norm.includes(a.toLowerCase()) || a.toLowerCase().includes(norm))) {
          auto[field] = h; break;
        }
      }
    });
    setManualMapping({ ...auto });
    processRows(json, headers, auto);
    setPreviewMode(true);
  };

  // 🔹 🔄 ประมวลผลแถวใหม่ทุกครั้งเมื่อเปลี่ยน Mapping หรืออัปเดตข้อมูล
  const processRows = useCallback((json: any[], headers: string[], mapping: Record<string, string>) => {
    const validated = json.map((raw, idx) => {
      const mapped: any = {};
      Object.entries(mapping).forEach(([field, header]) => mapped[field] = raw[header] || '');
      const { mapped: validData, errors, warnings, isValid } = validateRow(mapped, hospitals, coaches);
      return {
        idx, row: idx + 2, raw, mapped: validData, errors, warnings,
        id_display: normalizeIdCard(validData.id_card) || '-',
        date_iso: parseDateToISO(validData.birth_date) || validData.birth_date || '-',
        status: isValid ? 'valid' : 'error'
      };
    });
    setRows(validated);
  }, [hospitals, coaches]);

  // 🔹 🛠️ จัดการ Manual Mapping (Dropdown)
  const handleMappingChange = (field: string, newHeader: string) => {
    const next = { ...manualMapping, [field]: newHeader };
    setManualMapping(next);
    processRows(rows.map(r => r.raw), rawHeaders, next); // Re-validate ทั้งหมด
  };

  // 🔹 ✏️ เปิด/บันทึก Modal แก้ไขแถว
  const startEdit = (idx: number) => {
    setEditingRow(idx);
    setEditForm({ ...rows[idx].mapped });
    setEditErrors([]);
  };
  const saveEdit = () => {
    const { mapped, errors, warnings, isValid } = validateRow(editForm, hospitals, coaches);
    if (!isValid) { setEditErrors(errors); return; }

    const next = [...rows];
    next[editingRow!].mapped = mapped;
    next[editingRow!].errors = errors;
    next[editingRow!].warnings = warnings;
    next[editingRow!].status = isValid ? 'valid' : 'error';
    next[editingRow!].id_display = normalizeIdCard(mapped.id_card);
    next[editingRow!].date_iso = parseDateToISO(mapped.birth_date) || mapped.birth_date;
    setRows(next);
    setEditingRow(null);
  };

  // 🔹 🚀 นำเข้าข้อมูลจริง (Loop แถวที่ Valid → เรียก registerPatient)
  const handleImport = async () => {
    const valid = rows.filter(r => r.status === 'valid');
    if (!valid.length) return alert('ไม่มีข้อมูลที่ถูกต้อง');
    if (!confirm(`✅ นำเข้า ${valid.length} ราย? ข้อมูลผิดจะถูกข้าม`)) return;

    setImporting(true);
    let ok = 0, fail = 0;
    for (let i = 0; i < valid.length; i++) {
      setProgress(((i + 1) / valid.length) * 100);
      try {
        const r = valid[i].mapped;
        // 🔗 เรียกฟังก์ชันจาก queries.ts
        await registerPatient({
          id_card: normalizeIdCard(r.id_card),
          password: parseDateToISO(r.birth_date)!.split('-').reverse().join('-'), // DD-MM-YYYY สำหรับ password
          first_name: r.first_name, last_name: r.last_name,
          hospital_number: r.hospital_number,
          birth_date: parseDateToISO(r.birth_date)!,
          gender: r.gender.toLowerCase().includes('ช') ? 'male' : 'female',
          phone: r.phone || undefined,
          current_weight: r.current_weight || undefined,
          height: r.height || undefined,
          waist_circumference: r.waist_circumference || undefined,
          diabetes_type: r.diabetes_type || undefined,
          blood_sugar: r.blood_sugar || undefined,
          hba1c_level: r.hba1c_level || undefined,
          hospital_id: r.hospital_id || undefined,
          coach_id: r.coach_id || undefined,
          created_by: user.id
        });
        ok++;
      } catch { fail++; }
    }
    setImporting(false);
    alert(`✅ สำเร็จ: ${ok} | ❌ ล้มเหลว: ${fail}`);
    router.push('/admin/patients');
  };

  // =====================================================
  // 🎨 4. UI RENDER (ส่วนแสดงผลหน้าเว็บ)
  // =====================================================
  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin w-10 h-10 text-blue-500"/></div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between bg-white p-4 rounded-xl shadow">
        <div>
          <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-600 mb-1"><ArrowLeft className="w-4 h-4"/> กลับ</button>
          <h1 className="text-2xl font-bold">📥 นำเข้าผู้ป่วยจาก Excel</h1>
        </div>
        <div className="text-sm text-gray-500">ผู้ใช้งาน: {user.full_name_th}</div>
      </div>

      {/* 📤 Upload Area */}
      {!previewMode && (
        <div className="bg-white p-8 rounded-xl shadow border-2 border-dashed border-gray-300 text-center hover:border-blue-400 transition">
          <FileSpreadsheet className="w-16 h-16 mx-auto text-gray-400 mb-4"/>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" id="upload"/>
          <label htmlFor="upload" className="cursor-pointer block">
            <p className="font-medium text-lg">คลิกเพื่อเลือกไฟล์ Excel</p>
            <p className="text-gray-500 text-sm">รองรับ .xlsx, .xls (แถวแรกต้องเป็น Header)</p>
          </label>
        </div>
      )}

      {/* 🛠️ Manual Mapping & Preview Section */}
      {previewMode && (
        <>
          {/* Dropdown จับคู่คอลัมน์ด้วยมือ */}
          <div className="bg-white p-5 rounded-xl shadow">
            <div className="flex items-center gap-2 mb-4"><Layers className="w-5 h-5 text-blue-600"/><h2 className="font-bold">🔗 จับคู่คอลัมน์ (ปรับแก้ด้วยมือได้)</h2></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {REQUIRED_FIELDS.map(field => (
                <div key={field} className="bg-gray-50 p-3 rounded border">
                  <label className="text-xs font-semibold text-gray-600 block mb-1">{FIELD_LABELS[field]} <span className="text-red-500">*</span></label>
                  <select 
                    value={manualMapping[field] || ''}
                    onChange={(e) => handleMappingChange(field, e.target.value)}
                    className={`w-full text-sm border rounded px-2 py-1 ${manualMapping[field] ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50'}`}
                  >
                    <option value="">-- ไม่ได้เลือก --</option>
                    {rawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* 👁️ Preview Table */}
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="font-bold flex items-center gap-2"><Eye className="w-5 h-5"/> Preview ({rows.length} แถว)</h2>
              <div className="flex gap-2 text-sm">
                <span className="text-green-600 font-bold">✓ {rows.filter(r=>r.status==='valid').length} พร้อม</span> | 
                <span className="text-red-600 font-bold">✗ {rows.filter(r=>r.status==='error').length} ผิดพลาด</span>
              </div>
            </div>
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    <th className="p-3 text-left">แถว</th>
                    <th className="p-3 text-left">บัตรประชาชน</th>
                    <th className="p-3 text-left">ชื่อ-สกุล</th>
                    <th className="p-3 text-left">วันเกิด</th>
                    <th className="p-3 text-left">HN</th>
                    <th className="p-3 text-left">สถานะ</th>
                    <th className="p-3 text-left">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 100).map((row, i) => (
                    <tr key={i} className={`border-b ${row.status==='error'?'bg-red-50':'hover:bg-gray-50'}`}>
                      <td className="p-3">{row.row}</td>
                      <td className="p-3 font-mono">{row.id_display}</td>
                      <td className="p-3">{row.mapped.first_name} {row.mapped.last_name}</td>
                      <td className="p-3">{row.date_iso}</td>
                      <td className="p-3">{row.mapped.hospital_number}</td>
                      <td className="p-3">
                        {row.status==='valid' 
                          ? <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">✓ พร้อม</span>
                          : <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs cursor-help" title={row.errors.join('\n')}>✗ {row.errors.length} ข้อ</span>
                        }
                      </td>
                      <td className="p-3">
                        <button onClick={() => startEdit(i)} className="p-1 text-blue-600 hover:bg-blue-50 rounded"><Edit2 className="w-4 h-4"/></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t flex justify-end gap-3">
              <button onClick={handleImport} disabled={importing || rows.filter(r=>r.status==='valid').length===0} className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 flex items-center gap-2">
                {importing ? <Loader2 className="animate-spin w-4 h-4"/> : <UserPlus className="w-4 h-4"/>}
                {importing ? `กำลังนำเข้า... ${progress.toFixed(0)}%` : `นำเข้า ${rows.filter(r=>r.status==='valid').length} ราย`}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ✏️ Edit Modal */}
      {editingRow !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">✏️ แก้ไขแถวที่ {rows[editingRow].row}</h3>
            {editErrors.length > 0 && <div className="bg-red-50 text-red-700 p-3 rounded mb-3 text-sm">{editErrors.map((e,i)=> <p key={i}>• {e}</p>)}</div>}
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs">บัตรประชาชน</label><input className="w-full border p-2 rounded" value={editForm.id_card||''} onChange={e=>setEditForm({...editForm, id_card:e.target.value})}/></div>
              <div><label className="text-xs">วันเกิด (DD/MM/YYYY)</label><input className="w-full border p-2 rounded" value={editForm.birth_date||''} onChange={e=>setEditForm({...editForm, birth_date:e.target.value})}/></div>
              <div><label className="text-xs">ชื่อ</label><input className="w-full border p-2 rounded" value={editForm.first_name||''} onChange={e=>setEditForm({...editForm, first_name:e.target.value})}/></div>
              <div><label className="text-xs">นามสกุล</label><input className="w-full border p-2 rounded" value={editForm.last_name||''} onChange={e=>setEditForm({...editForm, last_name:e.target.value})}/></div>
              <div><label className="text-xs">HN</label><input className="w-full border p-2 rounded" value={editForm.hospital_number||''} onChange={e=>setEditForm({...editForm, hospital_number:e.target.value})}/></div>
              <div>
                <label className="text-xs">เพศ</label>
                <select className="w-full border p-2 rounded" value={editForm.gender||''} onChange={e=>setEditForm({...editForm, gender:e.target.value})}>
                  <option value="ชาย">ชาย</option><option value="หญิง">หญิง</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={saveEdit} className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700 flex items-center justify-center gap-2"><Save className="w-4 h-4"/> บันทึก</button>
              <button onClick={() => setEditingRow(null)} className="flex-1 bg-gray-500 text-white py-2 rounded hover:bg-gray-600">ยกเลิก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

}