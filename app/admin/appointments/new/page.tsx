// app/admin/appointments/new/page.tsx
// ✅ แก้ไขล่าสุด: 23 เมษายน 2569
// ✅ การแก้ไข:
//    1. ตรวจสอบ query parameter 'returnUrl' เพื่อกลับหน้าถูกต้อง
//    2. หลังสร้างนัดหมายเสร็จ → กลับไปตามที่มา (patient detail หรือ appointments view)
//    3. เพิ่ม debug log ครบถ้วน

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { checkSession, logout, getPatientList, getStaffList } from '@/lib/supabase/queries';
import { ArrowLeft, LogOut, Save, Calendar, Clock, User, Stethoscope } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function NewAppointmentPage() {
  const router = useRouter();
  const searchParams = useSearchParams(); // ✅ ดึง query parameters
  
  const [user, setUser] = useState<any>(null);
  const [patients, setPatients] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // ✅ ดึง returnUrl จาก query parameter
  const returnUrl = searchParams.get('returnUrl');
  const patientIdFromQuery = searchParams.get('patient_id');
  
  console.log('🔍 [DEBUG] New Appointment Page');
  console.log('🔗 returnUrl:', returnUrl);
  console.log('👤 patient_id from query:', patientIdFromQuery);

  // ตั้งค่าเริ่มต้นเป็นวันพรุ่งนี้ 08:00
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(8, 0, 0, 0);

  const [formData, setFormData] = useState({
    user_id: patientIdFromQuery || '', // ✅ ถ้ามี patient_id จาก query ให้ตั้งเป็นค่าเริ่มต้น
    doctor_id: '',
    appointment_type: 'followup',
    appointment_date: tomorrow.toISOString().slice(0, 16),
    duration_minutes: '30',
    location_type: 'clinic',
    location_detail: '',
    notes: '',
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
    loadData();
  }, [router]);

  const loadData = async () => {
    try {
      const [patientsData, allStaff] = await Promise.all([
        getPatientList(),
        getStaffList()
      ]);

      // ✅ กรองเอาเฉพาะ doctor และ helper (ไม่เอา admin)
      const filteredStaff = allStaff.filter(staff => 
        staff.role === 'doctor' || staff.role === 'helper'
      );

      setPatients(patientsData);
      setStaffList(filteredStaff);
    } catch (error) {
      console.error('Error loading ', error);
      alert('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    console.log('💾 [DEBUG] Submitting appointment...');
    console.log('📝 FormData:', formData);
    console.log('🔗 returnUrl:', returnUrl);

    try {
      const { error } = await supabase
        .from('appointments')
        .insert({
          user_id: formData.user_id,
          doctor_id: formData.doctor_id,
          appointment_type: formData.appointment_type,
          appointment_date: new Date(formData.appointment_date).toISOString(),
          duration_minutes: parseInt(formData.duration_minutes),
          location_type: formData.location_type,
          location_detail: formData.location_detail,
          status: 'scheduled',
          notes: formData.notes,
          created_by: user.id,
        });

      if (error) throw error;

      console.log('✅ Appointment created successfully!');
      alert('สร้างนัดหมายสำเร็จ!');
      
      // ✅ กลับไปตามที่มา
      if (returnUrl) {
        console.log('🔙 Redirecting to returnUrl:', returnUrl);
        router.push(decodeURIComponent(returnUrl));
      } else {
        console.log('🔙 Redirecting to appointments view');
        router.push('/admin/appointments/view');
      }
    } catch (error) {
      console.error('Error creating appointment:', error);
      alert('เกิดข้อผิดพลาด: ' + (error as any).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
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
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับ
          </button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                สร้างนัดหมายใหม่
              </h1>
              <p className="text-gray-600">กำหนดนัดหมายผู้ป่วย</p>
            </div>
            
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
            >
              <LogOut className="w-4 h-4" />
              ออกจากระบบ
            </button>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-lg p-6 space-y-6">
          
          {/* ผู้ป่วย */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <User className="w-4 h-4 inline mr-1" />
              ผู้ป่วย *
            </label>
            <select
              value={formData.user_id}
              onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- เลือกผู้ป่วย --</option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.full_name} ({patient.hospital_number})
                </option>
              ))}
            </select>
          </div>

          {/* แพทย์/เจ้าหน้าที่ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Stethoscope className="w-4 h-4 inline mr-1" />
              แพทย์/เจ้าหน้าที่ *
            </label>
            <select
              value={formData.doctor_id}
              onChange={(e) => setFormData({ ...formData, doctor_id: e.target.value })}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- เลือกแพทย์/เจ้าหน้าที่ --</option>
              {staffList.map((staff: any) => {
                const staffId = staff.id;
                const staffName = staff.doctors?.full_name_th || staff.full_name_th || '-';
                const staffRole = staff.role === 'doctor' ? 'แพทย์' : 'เจ้าหน้าที่';
                const specialization = staff.doctors?.specialization_th || '';
                
                return (
                  <option key={staffId} value={staffId}>
                    {staffName} ({staffRole}{specialization ? ` - ${specialization}` : ''})
                  </option>
                );
              })}
            </select>
          </div>

          {/* ประเภทนัดหมาย */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ประเภทนัดหมาย *
            </label>
            <select
              value={formData.appointment_type}
              onChange={(e) => setFormData({ ...formData, appointment_type: e.target.value })}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            >
              <option value="followup">ติดตามผล</option>
              <option value="consultation">ปรึกษา</option>
              <option value="checkup">ตรวจสุขภาพ</option>
              <option value="treatment">รักษา</option>
              <option value="other">อื่นๆ</option>
            </select>
          </div>

          {/* วันที่และเวลา */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Calendar className="w-4 h-4 inline mr-1" />
              วันที่และเวลา *
            </label>
            <input
              type="datetime-local"
              value={formData.appointment_date}
              onChange={(e) => setFormData({ ...formData, appointment_date: e.target.value })}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          {/* ระยะเวลาและสถานที่ */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Clock className="w-4 h-4 inline mr-1" />
                ระยะเวลา (นาที)
              </label>
              <select
                value={formData.duration_minutes}
                onChange={(e) => setFormData({ ...formData, duration_minutes: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="15">15 นาที</option>
                <option value="30">30 นาที</option>
                <option value="45">45 นาที</option>
                <option value="60">60 นาที</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">สถานที่</label>
              <select
                value={formData.location_type}
                onChange={(e) => setFormData({ ...formData, location_type: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="clinic">คลินิก</option>
                <option value="online">ออนไลน์</option>
                <option value="home">บ้านผู้ป่วย</option>
                <option value="other">อื่นๆ</option>
              </select>
            </div>
          </div>

          {/* หมายเหตุ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">หมายเหตุ</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              placeholder="หมายเหตุเพิ่มเติม"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-blue-500 text-white font-bold py-3 rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Save className="w-5 h-5" />
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 bg-gray-500 text-white font-bold py-3 rounded-lg hover:bg-gray-600"
            >
              ยกเลิก
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}