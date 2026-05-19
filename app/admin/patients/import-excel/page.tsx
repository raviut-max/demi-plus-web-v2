'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, logout } from '@/lib/supabase/queries';
import { Upload, FileSpreadsheet, AlertCircle, Loader2, ArrowLeft, LogOut } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function ImportExcelPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [rawData, setRawData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ✅ ตรวจสอบ Session และสิทธิ์
  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }
    if (!['admin', 'doctor', 'helper', 'osm'].includes(userData.role)) {
      router.push('/admin/patients');
      return;
    }
    setUser(userData);
  }, [router]);

  // ✅ ฟังก์ชันประมวลผลไฟล์
  const processFile = (file: File) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setError('กรุณาเลือกไฟล์ Excel (.xlsx หรือ .xls) เท่านั้น');
      return;
    }
    setSelectedFile(file);
    setError('');
    setLoading(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // แปลงเป็น JSON Array (เก็บหัวคอลัมน์เป็น Key)
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        setRawData(jsonData);
        // 📌 ขั้นตอนต่อไป (Step 2) จะนำ jsonData มาทำตาราง Preview + Validation
      } catch (err) {
        setError('❌ ไม่สามารถอ่านไฟล์ได้ กรุณาตรวจสอบรูปแบบไฟล์');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  if (!user) {
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
          <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" /> กลับ
          </button>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">📥 นำเข้าข้อมูลผู้ป่วยจาก Excel</h1>
              <p className="text-gray-600">อัปโหลดไฟล์ Excel เพื่อนำข้อมูลผู้ป่วยเข้าระบบ</p>
            </div>
            <button onClick={() => { logout(); router.push('/admin/login'); }} className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">
              <LogOut className="w-4 h-4" /> ออกจากระบบ
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-red-800 mb-1">เกิดข้อผิดพลาด</p>
              <p className="text-sm text-red-700">{error}</p>
            </div>
            <button onClick={() => setError('')} className="text-red-600 hover:text-red-800">✕</button>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-sm font-bold">1</span>
            เลือกไฟล์ Excel
          </h2>
          
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-500 transition-colors cursor-pointer bg-gray-50"
            onClick={() => document.getElementById('file-upload')?.click()}
          >
            <input
              id="file-upload"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                <Upload className="w-8 h-8 text-blue-600" />
              </div>
              <p className="text-gray-700 font-medium">ลากไฟล์มาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์</p>
              <p className="text-sm text-gray-500">รองรับไฟล์ .xlsx, .xls เท่านั้น</p>
            </div>
          </div>

          {selectedFile && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
              <FileSpreadsheet className="w-6 h-6 text-green-600" />
              <div>
                <p className="font-semibold text-green-800">{selectedFile.name}</p>
                <p className="text-sm text-green-600">✅ อ่านไฟล์สำเร็จ: พบข้อมูล {rawData.length} แถว</p>
              </div>
            </div>
          )}

          {loading && (
            <div className="mt-4 flex items-center justify-center gap-2 text-blue-600">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>กำลังอ่านไฟล์และประมวลผลข้อมูล...</span>
            </div>
          )}
        </div>

        {/* 📌 Placeholder สำหรับขั้นตอนถัดไป */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center text-yellow-800">
          ⏳ ขั้นตอนถัดไป: แสดงตาราง Preview, ตรวจสอบความถูกต้อง, และเลือกแถวที่ต้องการนำเข้า
        </div>
      </div>
    </div>
  );
}