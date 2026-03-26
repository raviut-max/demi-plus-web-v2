// app/admin/locations/import/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, logout } from '@/lib/supabase/queries';
import { ArrowLeft, Upload, Database, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export default function ImportLocationsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({
    provinces: 0,
    districts: 0,
    subdistricts: 0,
  });
  const [status, setStatus] = useState({
    message: '',
    type: '', // 'info' | 'success' | 'error'
  });

  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }

    if (userData.role !== 'admin') {
      alert('ไม่มีสิทธิ์เข้าถึง');
      router.push('/admin/login');
      return;
    }

    setUser(userData);
  }, [router]);

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  const importData = async () => {
    if (!confirm('คุณต้องการนำเข้าข้อมูลจังหวัด/อำเภอ/ตำบล ใช่หรือไม่?\n\nการดำเนินการนี้อาจใช้เวลาสักครู่')) {
      return;
    }

    setLoading(true);
    setStatus({ message: '📥 กำลังดาวน์โหลดและนำเข้าข้อมูล...', type: 'info' });
    setProgress({ provinces: 0, districts: 0, subdistricts: 0 });

    try {
      // เรียก API route แทน
      const response = await fetch('/api/import-locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import' }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Import failed');
      }

      // อัพเดท progress
      setProgress({
        provinces: result.counts.provinces,
        districts: result.counts.districts,
        subdistricts: result.counts.subdistricts,
      });

      setStatus({ 
        message: `✅ สำเร็จ! นำเข้าข้อมูลเสร็จสมบูรณ์\n- จังหวัด: ${result.counts.provinces}\n- อำเภอ: ${result.counts.districts}\n- ตำบล: ${result.counts.subdistricts}`, 
        type: 'success' 
      });

    } catch (error: any) {
      console.error('Import error:', error);
      setStatus({ 
        message: `❌ เกิดข้อผิดพลาด: ${error.message}`, 
        type: 'error' 
      });
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">กำลังโหลด...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-100 to-cyan-50 pb-20">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-white/50 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <button
                onClick={() => router.push('/admin/dashboard')}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-2"
              >
                <ArrowLeft className="w-5 h-5" />
                <span>กลับ</span>
              </button>
              <h1 className="text-3xl font-bold text-gray-800">นำเข้าข้อมูลที่อยู่</h1>
              <p className="text-gray-600">จัดการข้อมูลจังหวัด/อำเภอ/ตำบล</p>
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
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* ข้อมูลสรุป */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Database className="w-6 h-6 text-blue-600" />
            ข้อมูลที่จะนำเข้า
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <p className="text-sm text-blue-600 mb-1">จังหวัด</p>
              <p className="text-2xl font-bold text-blue-700">77</p>
            </div>
            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
              <p className="text-sm text-green-600 mb-1">อำเภอ/เขต</p>
              <p className="text-2xl font-bold text-green-700">928</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
              <p className="text-sm text-purple-600 mb-1">ตำบล</p>
              <p className="text-2xl font-bold text-purple-700">7,255</p>
            </div>
          </div>
        </div>

        {/* ความคืบหน้า */}
        {(progress.provinces > 0 || progress.districts > 0 || progress.subdistricts > 0) && (
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">ความคืบหน้า</h2>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">จังหวัด</span>
                  <span className="text-sm text-gray-600">{progress.provinces} / 77</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${(progress.provinces / 77) * 100}%` }}
                  ></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">อำเภอ/เขต</span>
                  <span className="text-sm text-gray-600">{progress.districts} / 928</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-green-600 h-2 rounded-full transition-all"
                    style={{ width: `${(progress.districts / 928) * 100}%` }}
                  ></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">ตำบล</span>
                  <span className="text-sm text-gray-600">{progress.subdistricts} / 7,255</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-purple-600 h-2 rounded-full transition-all"
                    style={{ width: `${(progress.subdistricts / 7255) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* สถานะ */}
        {status.message && (
          <div className={`rounded-xl p-4 mb-6 flex items-start gap-3 ${
            status.type === 'success' ? 'bg-green-50 border border-green-200' :
            status.type === 'error' ? 'bg-red-50 border border-red-200' :
            'bg-blue-50 border border-blue-200'
          }`}>
            {status.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            ) : status.type === 'error' ? (
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            ) : (
              <Upload className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            )}
            <p className={`text-sm whitespace-pre-line ${
              status.type === 'success' ? 'text-green-700' :
              status.type === 'error' ? 'text-red-700' :
              'text-blue-700'
            }`}>
              {status.message}
            </p>
          </div>
        )}

        {/* ปุ่มนำเข้า */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <button
            onClick={importData}
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold py-4 rounded-xl hover:from-blue-600 hover:to-cyan-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                กำลังนำเข้าข้อมูล...
              </>
            ) : (
              <>
                <Upload className="w-5 h-5" />
                นำเข้าข้อมูลจังหวัด/อำเภอ/ตำบล
              </>
            )}
          </button>
          <p className="text-xs text-gray-500 mt-4 text-center">
            ข้อมูลจาก: kongvut/thai-province-data (GitHub)
          </p>
        </div>
      </div>
    </div>
  );
}