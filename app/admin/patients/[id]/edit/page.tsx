'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { checkSession, logout, getPatientDetail } from '@/lib/supabase/queries';
import { ArrowLeft, LogOut, Save } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function EditPatientPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params.id as string;
  
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [patient, setPatient] = useState<any>(null);

  const [formData, setFormData] = useState({
    // ข้อมูลส่วนตัว
    full_name: '',
    hospital_number: '',
    birth_date: '',
    gender: '',
    phone: '',
    email: '',
    id_card: '',
    
    // ข้อมูลสุขภาพ
    current_weight: '',
    height: '',
    waist_circumference: '',
    diabetes_type: '',
    diagnosis_date: '',
    hba1c_level: '',
    blood_type: '',
    allergies: '',
    current_medications: '',
    occupation: '',
    education_level: '',
    
    // ที่อยู่
    address_line1: '',
    address_line2: '',
    district: '',
    province: '',
    postal_code: '',
    
    // ผู้ติดต่อฉุกเฉิน
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relationship: '',
  });

  useEffect(() => {
    const userData = checkSession();
    
    if (!userData) {
      router.push('/admin/login');
      return;
    }

    if (!['admin', 'doctor', 'helper'].includes(userData.role)) {
      alert('ไม่มีสิทธิ์เข้าถึง');
      router.push('/admin/login');
      return;
    }

    setUser(userData);
    loadPatientData();
  }, [router]);

  const loadPatientData = async () => {
    try {
      const data = await getPatientDetail(patientId);
      if (data) {
        setPatient(data);
        setFormData({
          full_name: data.full_name || '',
          hospital_number: data.hospital_number || '',
          birth_date: data.birth_date || '',
          gender: data.gender || '',
          phone: data.phone || '',
          email: data.email || '',
          id_card: data.users?.id_card || '',
          current_weight: data.current_weight?.toString() || '',
          height: data.height?.toString() || '',
          waist_circumference: data.waist_circumference?.toString() || '',
          diabetes_type: data.diabetes_type || '',
          diagnosis_date: data.diagnosis_date || '',
          hba1c_level: data.hba1c_level?.toString() || '',
          blood_type: data.blood_type || '',
          allergies: data.allergies || '',
          current_medications: data.current_medications || '',
          occupation: data.occupation || '',
          education_level: data.education_level || '',
          address_line1: data.address_line1 || '',
          address_line2: data.address_line2 || '',
          district: data.district || '',
          province: data.province || '',
          postal_code: data.postal_code || '',
          emergency_contact_name: data.emergency_contact_name || '',
          emergency_contact_phone: data.emergency_contact_phone || '',
          emergency_contact_relationship: data.emergency_contact_relationship || '',
        });
      }
    } catch (error) {
      console.error('Error loading patient data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const updateData: any = {
        full_name: formData.full_name,
        hospital_number: formData.hospital_number,
        birth_date: formData.birth_date,
        gender: formData.gender,
        phone: formData.phone,
        email: formData.email,
        current_weight: formData.current_weight && formData.current_weight !== 'not_measured' ? parseFloat(formData.current_weight) : null,
        height: formData.height && formData.height !== 'not_measured' ? parseFloat(formData.height) : null,
        waist_circumference: formData.waist_circumference && formData.waist_circumference !== 'not_measured' ? parseFloat(formData.waist_circumference) : null,
        diabetes_type: formData.diabetes_type,
        diagnosis_date: formData.diagnosis_date,
        hba1c_level: formData.hba1c_level && formData.hba1c_level !== 'not_measured' ? parseFloat(formData.hba1c_level) : null,
        blood_type: formData.blood_type,
        allergies: formData.allergies,
        current_medications: formData.current_medications,
        occupation: formData.occupation,
        education_level: formData.education_level,
        address_line1: formData.address_line1,
        address_line2: formData.address_line2,
        district: formData.district,
        province: formData.province,
        postal_code: formData.postal_code,
        emergency_contact_name: formData.emergency_contact_name,
        emergency_contact_phone: formData.emergency_contact_phone,
        emergency_contact_relationship: formData.emergency_contact_relationship,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', patientId);

      if (error) {
        console.error('Error updating patient:', error);
        alert('❌ บันทึกข้อมูลไม่สำเร็จ\n\n' + error.message);
        return;
      }

      alert('✅ แก้ไขข้อมูลผู้ป่วยสำเร็จ!');
      router.push(`/admin/patients/${patientId}`);
    } catch (error: any) {
      console.error('Exception during update:', error);
      alert('❌ เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-sky-100 to-cyan-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-100 to-cyan-50">
      {/* Header */}
      <div className="bg-white shadow-lg border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <button
                onClick={() => router.push(`/admin/patients/${patientId}`)}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-2"
              >
                <ArrowLeft className="w-4 h-4" />
                กลับ
              </button>
              <h1 className="text-2xl font-bold text-gray-800">แก้ไขข้อมูลผู้ป่วย</h1>
              <p className="text-sm text-gray-600">
                HN: {patient?.hospital_number} | {patient?.full_name}
              </p>
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
      <div className="max-w-6xl mx-auto px-4 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* ข้อมูลส่วนตัว */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <h2 className="text-xl font-bold text-gray-800 mb-4">ข้อมูลส่วนตัว</h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ชื่อ-นามสกุล *
                </label>
                <input
                  type="text"
                  required
                  value={formData.full_name}
                  onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  HN (Hospital Number) *
                </label>
                <input
                  type="text"
                  required
                  value={formData.hospital_number}
                  onChange={(e) => setFormData({...formData, hospital_number: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  วันเกิด
                </label>
                <input
                  type="date"
                  value={formData.birth_date}
                  onChange={(e) => setFormData({...formData, birth_date: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  เพศ
                </label>
                <select
                  value={formData.gender}
                  onChange={(e) => setFormData({...formData, gender: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">-- เลือกเพศ --</option>
                  <option value="male">ชาย</option>
                  <option value="female">หญิง</option>
                  <option value="other">อื่นๆ</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  เบอร์โทรศัพท์
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  placeholder="เช่น 0812345678"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  อีเมล
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  placeholder="patient@example.com"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* ข้อมูลสุขภาพ */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <h2 className="text-xl font-bold text-gray-800 mb-4">ข้อมูลสุขภาพ</h2>
            
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  น้ำหนัก (kg)
                </label>
                <select
                  value={formData.current_weight || ''}
                  onChange={(e) => setFormData({...formData, current_weight: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">-- เลือกค่า --</option>
                  <option value="not_measured">ยังไม่ตรวจวัด</option>
                  <option value="custom">ระบุเอง</option>
                </select>
                {formData.current_weight === 'custom' && (
                  <input
                    type="number"
                    step="0.1"
                    onChange={(e) => setFormData({...formData, current_weight: e.target.value})}
                    className="w-full px-4 py-2 mt-2 border border-gray-300 rounded-lg"
                    placeholder="ระบุน้ำหนัก"
                  />
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ส่วนสูง (cm)
                </label>
                <select
                  value={formData.height || ''}
                  onChange={(e) => setFormData({...formData, height: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">-- เลือกค่า --</option>
                  <option value="not_measured">ยังไม่ตรวจวัด</option>
                  <option value="custom">ระบุเอง</option>
                </select>
                {formData.height === 'custom' && (
                  <input
                    type="number"
                    step="0.1"
                    onChange={(e) => setFormData({...formData, height: e.target.value})}
                    className="w-full px-4 py-2 mt-2 border border-gray-300 rounded-lg"
                    placeholder="ระบุส่วนสูง"
                  />
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  รอบเอว (cm)
                </label>
                <select
                  value={formData.waist_circumference || ''}
                  onChange={(e) => setFormData({...formData, waist_circumference: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">-- เลือกค่า --</option>
                  <option value="not_measured">ยังไม่ตรวจวัด</option>
                  <option value="custom">ระบุเอง</option>
                </select>
                {formData.waist_circumference === 'custom' && (
                  <input
                    type="number"
                    step="0.1"
                    onChange={(e) => setFormData({...formData, waist_circumference: e.target.value})}
                    className="w-full px-4 py-2 mt-2 border border-gray-300 rounded-lg"
                    placeholder="ระบุรอบเอว"
                  />
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ประเภทเบาหวาน
                </label>
                <select
                  value={formData.diabetes_type}
                  onChange={(e) => setFormData({...formData, diabetes_type: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">-- เลือกประเภท --</option>
                  <option value="Type 1">Type 1</option>
                  <option value="Type 2">Type 2</option>
                  <option value="Gestational">Gestational</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  วันที่วินิจฉัย
                </label>
                <input
                  type="date"
                  value={formData.diagnosis_date}
                  onChange={(e) => setFormData({...formData, diagnosis_date: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ค่า HbA1c
                </label>
                <select
                  value={formData.hba1c_level || ''}
                  onChange={(e) => setFormData({...formData, hba1c_level: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">-- เลือกค่า --</option>
                  <option value="not_measured">ยังไม่ตรวจวัด</option>
                  <option value="custom">ระบุเอง</option>
                </select>
                {formData.hba1c_level === 'custom' && (
                  <input
                    type="number"
                    step="0.1"
                    onChange={(e) => setFormData({...formData, hba1c_level: e.target.value})}
                    className="w-full px-4 py-2 mt-2 border border-gray-300 rounded-lg"
                    placeholder="ระบุค่า HbA1c"
                  />
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  หมู่เลือด
                </label>
                <select
                  value={formData.blood_type}
                  onChange={(e) => setFormData({...formData, blood_type: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">-- เลือกหมู่เลือด --</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="AB">AB</option>
                  <option value="O">O</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                </select>
              </div>
              
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  การแพ้ยา/อาหาร
                </label>
                <input
                  type="text"
                  value={formData.allergies}
                  onChange={(e) => setFormData({...formData, allergies: e.target.value})}
                  placeholder="เช่น Penicillin, ถั่วลิสง"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* ที่อยู่ */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <h2 className="text-xl font-bold text-gray-800 mb-4">ที่อยู่</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ที่อยู่บรรทัดที่ 1
                </label>
                <input
                  type="text"
                  value={formData.address_line1}
                  onChange={(e) => setFormData({...formData, address_line1: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ที่อยู่บรรทัดที่ 2
                </label>
                <input
                  type="text"
                  value={formData.address_line2}
                  onChange={(e) => setFormData({...formData, address_line2: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    เขต/อำเภอ
                  </label>
                  <input
                    type="text"
                    value={formData.district}
                    onChange={(e) => setFormData({...formData, district: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    จังหวัด
                  </label>
                  <input
                    type="text"
                    value={formData.province}
                    onChange={(e) => setFormData({...formData, province: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    รหัสไปรษณีย์
                  </label>
                  <input
                    type="text"
                    value={formData.postal_code}
                    onChange={(e) => setFormData({...formData, postal_code: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ผู้ติดต่อฉุกเฉิน */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <h2 className="text-xl font-bold text-gray-800 mb-4">ผู้ติดต่อฉุกเฉิน</h2>
            
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ชื่อผู้ติดต่อ
                </label>
                <input
                  type="text"
                  value={formData.emergency_contact_name}
                  onChange={(e) => setFormData({...formData, emergency_contact_name: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  เบอร์โทรศัพท์
                </label>
                <input
                  type="tel"
                  value={formData.emergency_contact_phone}
                  onChange={(e) => setFormData({...formData, emergency_contact_phone: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ความสัมพันธ์
                </label>
                <input
                  type="text"
                  value={formData.emergency_contact_relationship}
                  onChange={(e) => setFormData({...formData, emergency_contact_relationship: e.target.value})}
                  placeholder="เช่น พ่อ, แม่, สามี"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex gap-4">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold py-4 rounded-xl hover:from-blue-600 hover:to-cyan-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  กำลังบันทึก...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  บันทึกการแก้ไข
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => router.push(`/admin/patients/${patientId}`)}
              className="flex-1 bg-gray-500 text-white font-bold py-4 rounded-xl hover:bg-gray-600 transition-all"
            >
              ยกเลิก
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}