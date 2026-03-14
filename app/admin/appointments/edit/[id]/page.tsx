'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { checkSession, logout } from '@/lib/supabase/queries';
import { ArrowLeft, LogOut, Save, Calendar, Clock, User, Stethoscope } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function EditAppointmentPage() {
  const router = useRouter();
  const params = useParams();
  const appointmentId = params.id as string;
  
  const [user, setUser] = useState<any>(null);
  const [patients, setPatients] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [appointment, setAppointment] = useState<any>(null);

  const [formData, setFormData] = useState({
    user_id: '',
    doctor_id: '',
    appointment_type: 'followup',
    appointment_date: '',
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
    loadAppointment();
  }, [router]);

  const loadAppointment = async () => {
    try {
      // ดึงข้อมูลนัดหมาย
      const { data: aptData, error: aptError } = await supabase
        .from('appointments')
        .select('*')
        .eq('id', appointmentId)
        .single();

      if (aptError) throw aptError;

      console.log('📋 Appointment data:', aptData);
      setAppointment(aptData);

      // แปลงวันที่ให้เป็นรูปแบบ datetime-local
      const dateObj = new Date(aptData.appointment_date);
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      const hours = String(dateObj.getHours()).padStart(2, '0');
      const minutes = String(dateObj.getMinutes()).padStart(2, '0');
      const dateTimeLocal = `${year}-${month}-${day}T${hours}:${minutes}`;

      // ตั้งค่าฟอร์ม
      setFormData({
        user_id: aptData.user_id,
        doctor_id: aptData.doctor_id,
        appointment_type: aptData.appointment_type,
        appointment_date: dateTimeLocal,
        duration_minutes: String(aptData.duration_minutes || 30),
        location_type: aptData.location_type || 'clinic',
        location_detail: aptData.location_detail || '',
        notes: aptData.notes || '',
      });

      // ดึงรายการผู้ป่วยและแพทย์
      const [patientsData, allStaff] = await Promise.all([
        supabase.from('profiles').select('id, full_name, hospital_number'),
        supabase.from('users').select('id, role, doctors(id, full_name_th, specialization_th)')
          .in('role', ['doctor', 'helper'])
      ]);

      setPatients(patientsData.data || []);
      
      // กรองเฉพาะ doctor และ helper
      const filteredStaff = (allStaff.data || []).filter(staff => 
        staff.role === 'doctor' || staff.role === 'helper'
      );
      
      setStaffList(filteredStaff);
    } catch (error) {
      console.error('Error loading appointment:', error);
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

    try {
      const { error } = await supabase
        .from('appointments')
        .update({
          user_id: formData.user_id,
          doctor_id: formData.doctor_id,
          appointment_type: formData.appointment_type,
          appointment_date: new Date(formData.appointment_date).toISOString(),
          duration_minutes: parseInt(formData.duration_minutes),
          location_type: formData.location_type,
          location_detail: formData.location_detail,
          notes: formData.notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', appointmentId);

      if (error) throw error;

      alert('แก้ไขนัดหมายสำเร็จ!');
      router.push('/admin/appointments/view');
    } catch (error) {
      console.error('Error updating appointment:', error);
      alert('เกิดข้อผิดพลาด: ' + (error as any).message);
    } finally {
      setSaving(false);
    }
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
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <button
                onClick={() => router.push('/admin/appointments/view')}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-2"
              >
                <ArrowLeft className="w-4 h-4" />
                กลับ
              </button>
              <h1 className="text-2xl font-bold text-gray-800">แก้ไขนัดหมาย</h1>
              <p className="text-sm text-gray-600">แก้ไขข้อมูลนัดหมายผู้ป่วย</p>
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
              onClick={() => router.push('/admin/appointments/view')}
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