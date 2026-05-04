'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { checkSession } from '@/lib/supabase/queries';
import { ArrowLeft, Building2, Save } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface Hospital {
  id: string;
  name: string;
  code: string;
  type: 'main' | 'sub';
  parent_id: string | null;
  address: string | null;
  is_active: boolean;
}

export default function EditHospitalPage() {
  const router = useRouter();
  const params = useParams();
  const hospitalId = params.id as string;

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mainHospitals, setMainHospitals] = useState<Hospital[]>([]);
  
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    type: 'main' as 'main' | 'sub',
    parent_id: '' as string | null,
    address: '',
    is_active: true,
  });

  useEffect(() => {
    const userData = checkSession();
    if (!userData || userData.role !== 'admin') {
      router.push('/admin/login');
      return;
    }
    setUser(userData);
    loadMainHospitals();
    loadHospital();
  }, [router, hospitalId]);

  const loadMainHospitals = async () => {
    try {
      const { data, error } = await supabase
        .from('hospitals')
        .select('*')
        .eq('type', 'main')
        .eq('is_active', true)
        .neq('id', hospitalId) // ไม่รวมโรงพยาบาลที่กำลังแก้ไข
        .order('name');

      if (error) throw error;
      setMainHospitals(data || []);
    } catch (error) {
      console.error('Error loading main hospitals:', error);
    }
  };

  const loadHospital = async () => {
    try {
      const { data, error } = await supabase
        .from('hospitals')
        .select('*')
        .eq('id', hospitalId)
        .single();

      if (error) throw error;

      if (data) {
        setFormData({
          name: data.name || '',
          code: data.code || '',
          type: data.type || 'main',
          parent_id: data.parent_id || '',
          address: data.address || '',
          is_active: data.is_active ?? true,
        });
      }
    } catch (error) {
      console.error('Error loading hospital:', error);
      alert('ไม่พบข้อมูลโรงพยาบาล');
      router.push('/admin/hospitals');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.name.trim()) {
      alert('กรุณากรอกชื่อโรงพยาบาล');
      return;
    }
    
    if (!formData.code.trim()) {
      alert('กรุณากรอกรหัสโรงพยาบาล');
      return;
    }

    if (formData.type === 'sub' && !formData.parent_id) {
      alert('กรุณาเลือกโรงพยาบาลแม่ข่าย');
      return;
    }

    setSaving(true);

    try {
      const updateData: any = {
        name: formData.name.trim(),
        code: formData.code.trim().toUpperCase(),
        type: formData.type,
        parent_id: formData.type === 'sub' ? formData.parent_id : null,
        address: formData.address.trim() || null,
        is_active: formData.is_active,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('hospitals')
        .update(updateData)
        .eq('id', hospitalId);

      if (error) {
        if (error.code === '23505') { // Unique violation
          alert('รหัสโรงพยาบาลนี้มีผู้ใช้งานแล้ว กรุณาใช้รหัสอื่น');
        } else {
          throw error;
        }
        return;
      }

      alert('✅ แก้ไขโรงพยาบาลสำเร็จ!');
      router.push('/admin/hospitals');
    } catch (error: any) {
      console.error('Error updating hospital:', error);
      alert('❌ เกิดข้อผิดพลาด: ' + error.message);
    } finally {
      setSaving(false);
    }
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <button
            onClick={() => router.push('/admin/hospitals')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับ
          </button>

          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">
              <Building2 className="w-8 h-8 inline mr-2" />
              แก้ไขข้อมูลโรงพยาบาล
            </h1>
            <p className="text-gray-600">ปรับปรุงข้อมูลโรงพยาบาลแม่ข่ายหรือลูกข่าย</p>
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 space-y-6">
          
          {/* ประเภทโรงพยาบาล */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ประเภทโรงพยาบาล <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({...formData, type: e.target.value as 'main' | 'sub'})}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="main">โรงพยาบาลแม่ข่าย</option>
              <option value="sub">โรงพยาบาลลูกข่าย</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              💡 แม่ข่าย = โรงพยาบาลหลัก, ลูกข่าย = โรงพยาบาลในสังกัด
            </p>
          </div>

          {/* ชื่อโรงพยาบาล */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ชื่อโรงพยาบาล <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="เช่น โรงพยาบาลเพชรบูรณ์"
            />
          </div>

          {/* รหัสโรงพยาบาล */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              รหัสโรงพยาบาล <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.code}
              onChange={(e) => setFormData({...formData, code: e.target.value.toUpperCase()})}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 uppercase"
              placeholder="เช่น PHETCHABUN"
            />
            <p className="text-xs text-gray-500 mt-1">
              💡 ต้องไม่ซ้ำกับรหัสอื่นในระบบ
            </p>
          </div>

          {/* โรงพยาบาลแม่ข่าย (สำหรับลูกข่าย) */}
          {formData.type === 'sub' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                โรงพยาบาลแม่ข่าย <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.parent_id || ''}
                onChange={(e) => setFormData({...formData, parent_id: e.target.value})}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">-- เลือกแม่ข่าย --</option>
                {mainHospitals.map(h => (
                  <option key={h.id} value={h.id}>{h.name} ({h.code})</option>
                ))}
              </select>
              {mainHospitals.length === 0 && (
                <p className="text-xs text-orange-500 mt-1">
                  ⚠️ ยังไม่มีโรงพยาบาลแม่ข่ายในระบบ กรุณาสร้างแม่ข่ายก่อน
                </p>
              )}
            </div>
          )}

          {/* ที่อยู่ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ที่อยู่
            </label>
            <textarea
              value={formData.address}
              onChange={(e) => setFormData({...formData, address: e.target.value})}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="ที่อยู่โรงพยาบาล (ถ้ามี)"
            />
          </div>

          {/* สถานะการใช้งาน */}
          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">
                เปิดใช้งานโรงพยาบาลนี้
              </span>
            </label>
            <p className="text-xs text-gray-500 mt-1">
              💡 ยกเลิกการเลือกเพื่อปิดการใช้งานชั่วคราว (จะไม่แสดงในระบบ)
            </p>
          </div>

          {/* Submit Buttons */}
          <div className="flex gap-4 pt-6 border-t border-gray-200">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-blue-500 text-white font-bold py-3 rounded-lg hover:bg-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Save className="w-5 h-5" />
              {saving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/admin/hospitals')}
              className="flex-1 bg-gray-500 text-white font-bold py-3 rounded-lg hover:bg-gray-600 transition-all"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}