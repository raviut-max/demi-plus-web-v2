// app/admin/login/page.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login, logout } from '@/lib/supabase/queries';
import { LogIn, AlertCircle, Loader2, UserPlus } from 'lucide-react';

export default function AdminLoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    id_card: '',
    password: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(formData.id_card, formData.password);

    setLoading(false);

    if (result) {
      // ✅ เพิ่ม 'osm' เข้าไปในรายการบทบาทที่อนุญาตให้เข้าระบบ Admin
      if (['admin', 'doctor', 'helper', 'osm'].includes(result.role)) {
        localStorage.setItem('user_id', result.id);
        localStorage.setItem('user_data', JSON.stringify(result));
        localStorage.setItem('login_time', new Date().toISOString());
        router.push('/admin/dashboard');
      } else {
        setError('บัญชีนี้ไม่มีสิทธิ์เข้าถึงระบบ Admin');
      }
    } else {
      setError('ID Card หรือรหัสผ่านไม่ถูกต้อง');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-100 to-cyan-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center">
              <LogIn className="w-6 h-6 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">DeMi+ Admin</h1>
          <p className="text-gray-600">ระบบจัดการสำหรับเจ้าหน้าที่</p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* ID Card */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ID Card / เลขบัตรประชาชน
              </label>
              <input
                type="text"
                name="id_card"
                value={formData.id_card}
                onChange={handleChange}
                maxLength={13}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="13 หลัก"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                รหัสผ่าน
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <span className="text-red-700 text-sm">{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold py-4 rounded-xl hover:from-blue-600 hover:to-cyan-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  กำลังเข้าสู่ระบบ...
                </>
              ) : (
                'เข้าสู่ระบบ'
              )}
            </button>
          </form>

          {/* ลิงก์ไปหน้าลงทะเบียนบุคลากร */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <button
              onClick={() => router.push('/admin/staff/register')}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-all font-semibold"
            >
              <UserPlus className="w-5 h-5" />
              ลงทะเบียนบุคลากรใหม่
            </button>
            <p className="text-xs text-gray-500 text-center mt-2">
              สำหรับผู้ดูแลระบบที่ต้องการเพิ่มบุคลากรเข้าสู่ระบบ
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}