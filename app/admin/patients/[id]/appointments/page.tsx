// app/admin/patients/[id]/appointments/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { checkSession, getPatientDetail, getAppointments, createAppointment, getCoaches } from '@/lib/supabase/queries';
import { ArrowLeft, Calendar, Plus, Clock, User, MapPin, CheckCircle, XCircle, AlertCircle, Edit, Trash2, FileText } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

export default function PatientAppointmentsPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params.id as string;

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [appointmentsWithFollowup, setAppointmentsWithFollowup] = useState<Set<string>>(new Set());

  const [formData, setFormData] = useState({
    doctor_id: '',
    appointment_type: 'followup',
    appointment_date: '',
    appointment_time: '',
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
      console.log('📥 Loading patient detail for ID:', patientId);
      const patientData = await getPatientDetail(patientId);
      console.log('✅ Patient detail loaded:', patientData);
      setPatient(patientData);

      console.log('📥 Loading appointments for patient:', patientId);
      const appointmentsData = await getAppointments(patientId);
      console.log('✅ Appointments loaded:', appointmentsData);
      console.log('📊 Appointments count:', appointmentsData?.length || 0);

      // ✅ 1. เรียงลำดับนัดหมาย: ล่าสุดไว้บนสุด (Descending)
      const sortedAppointments = appointmentsData.sort((a, b) => {
        return new Date(b.appointment_date).getTime() - new Date(a.appointment_date).getTime();
      });
      setAppointments(sortedAppointments);

      // ✅ 2. โหลดข้อมูลว่า appointment ไหนมี followup แล้ว
      await loadFollowupStatus(sortedAppointments);

      console.log('📥 Loading doctors list...');
      const doctorsData = await getCoaches();
      console.log('✅ Doctors loaded:', doctorsData?.length || 0);
      setDoctors(doctorsData);
    } catch (error) {
      console.error('❌ Error loading ', error);
      alert('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  const loadFollowupStatus = async (appointmentsList: any[]) => {
    try {
      const followupSet = new Set<string>();
      
      for (const apt of appointmentsList) {
        const { count } = await supabase
          .from('appointment_followups')
          .select('*', { count: 'exact', head: true })
          .eq('appointment_id', apt.id);
        
        if (count && count > 0) {
          followupSet.add(apt.id);
        }
      }
      
      setAppointmentsWithFollowup(followupSet);
      console.log('✅ Followup status loaded:', followupSet.size, 'appointments have followup');
    } catch (error) {
      console.error('❌ Error loading followup status:', error);
    }
  };

  const handleCreateAppointment = async () => {
    if (!formData.doctor_id) {
      alert('กรุณาเลือกแพทย์');
      return;
    }
    if (!formData.appointment_date || !formData.appointment_time) {
      alert('กรุณาระบุวันที่และเวลานัดหมาย');
      return;
    }

    const selectedDoctor = doctors.find(d => d.id === formData.doctor_id);
    if (!selectedDoctor) {
      alert('ไม่พบข้อมูลแพทย์ที่เลือกในตาราง doctors\nกรุณาเลือกแพทย์ใหม่');
      return;
    }

    try {
      const appointmentDateTime = `${formData.appointment_date}T${formData.appointment_time}:00`;
      const result = await createAppointment({
        user_id: patientId,
        doctor_id: formData.doctor_id,
        appointment_type: formData.appointment_type,
        appointment_date: appointmentDateTime,
        location_type: formData.location_type,
        location_detail: formData.location_detail,
        notes: formData.notes,
        created_by: user.id,
      });

      if (result.success) {
        alert('✅ สร้างนัดหมายสำเร็จ!');
        setShowCreateModal(false);
        loadData();
        resetForm();
      } else {
        alert('เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      console.error('Error creating appointment:', error);
      alert('เกิดข้อผิดพลาดในการสร้างนัดหมาย: ' + (error as Error).message);
    }
  };

  const handleUpdateAppointment = async () => {
    if (!selectedAppointment) return;
    try {
      const appointmentDateTime = `${formData.appointment_date}T${formData.appointment_time}:00`;
      const { error } = await supabase
        .from('appointments')
        .update({
          doctor_id: formData.doctor_id,
          appointment_type: formData.appointment_type,
          appointment_date: appointmentDateTime,
          location_type: formData.location_type,
          location_detail: formData.location_detail,
          notes: formData.notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedAppointment.id);

      if (error) throw error;
      alert('✅ อัปเดตนัดหมายสำเร็จ!');
      setShowEditModal(false);
      loadData();
      resetForm();
    } catch (error) {
      console.error('Error updating appointment:', error);
      alert('เกิดข้อผิดพลาดในการอัปเดตนัดหมาย');
    }
  };

  const handleCancelAppointment = async (appointmentId: string) => {
    if (!confirm('คุณต้องการยกเลิกนัดหมายนี้หรือไม่?')) return;
    try {
      const { error } = await supabase.from('appointments').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', appointmentId);
      if (error) throw error;
      alert('✅ ยกเลิกนัดหมายสำเร็จ!');
      loadData();
    } catch (error) {
      console.error('Error cancelling appointment:', error);
      alert('เกิดข้อผิดพลาดในการยกเลิกนัดหมาย');
    }
  };

  const handleCompleteAppointment = async (appointmentId: string) => {
    if (!confirm('คุณต้องการทำเครื่องหมายว่านัดหมายนี้เสร็จสิ้นแล้วหรือไม่?')) return;
    try {
      const { error } = await supabase.from('appointments').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', appointmentId);
      if (error) throw error;
      alert('✅ บันทึกว่าเสร็จสิ้นแล้ว!');
      loadData();
    } catch (error) {
      console.error('Error completing appointment:', error);
      alert('เกิดข้อผิดพลาดในการบันทึก');
    }
  };

  const openEditModal = (appointment: any) => {
    setSelectedAppointment(appointment);
    const dateTime = new Date(appointment.appointment_date);
    const date = dateTime.toISOString().split('T')[0];
    const time = dateTime.toTimeString().split(' ')[0].substring(0, 5);
    setFormData({
      doctor_id: appointment.doctor_id || '',
      appointment_type: appointment.appointment_type || 'followup',
      appointment_date: date,
      appointment_time: time,
      location_type: appointment.location_type || 'clinic',
      location_detail: appointment.location_detail || '',
      notes: appointment.notes || '',
    });
    setShowEditModal(true);
  };

  const resetForm = () => {
    setFormData({ doctor_id: '', appointment_type: 'followup', appointment_date: '', appointment_time: '', location_type: 'clinic', location_detail: '', notes: '' });
    setSelectedAppointment(null);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled': return '📅 รอนัดหมาย';
      case 'confirmed': return '✅ ยืนยันแล้ว';
      case 'completed': return '✓ เสร็จสิ้น';
      case 'cancelled': return '✗ ยกเลิก';
      case 'no_show': return '⚠️ ไม่มาตามนัด';
      default: return status;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'followup': return '🔄 ติดตามผล';
      case 'consultation': return '👨‍⚕️ ปรึกษาแพทย์';
      case 'screening': return '📋 คัดกรอง';
      case 'education': return '📚 ให้ความรู้';
      default: return type;
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button onClick={() => router.push(`/admin/patients/${patientId}`)} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4">
            <ArrowLeft className="w-4 h-4" />
            กลับหน้าผู้ป่วย
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">ประวัตินัดหมาย</h1>
              <p className="text-gray-600">ผู้ป่วย: {patient?.first_name} {patient?.last_name} | HN: {patient?.hospital_number}</p>
            </div>
            <button onClick={() => { resetForm(); setShowCreateModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all">
              <Plus className="w-4 h-4" />
              สร้างนัดหมายใหม่
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center"><Calendar className="w-5 h-5 text-blue-600" /></div>
              <div><p className="text-sm text-gray-500">นัดหมายทั้งหมด</p><p className="text-2xl font-bold text-gray-800">{appointments.length}</p></div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center"><Clock className="w-5 h-5 text-blue-600" /></div>
              <div><p className="text-sm text-gray-500">รอนัดหมาย</p><p className="text-2xl font-bold text-gray-800">{appointments.filter(a => a.status === 'scheduled').length}</p></div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center"><CheckCircle className="w-5 h-5 text-green-600" /></div>
              <div><p className="text-sm text-gray-500">เสร็จสิ้น</p><p className="text-2xl font-bold text-gray-800">{appointments.filter(a => a.status === 'completed').length}</p></div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center"><XCircle className="w-5 h-5 text-red-600" /></div>
              <div><p className="text-sm text-gray-500">ยกเลิก</p><p className="text-2xl font-bold text-gray-800">{appointments.filter(a => a.status === 'cancelled').length}</p></div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center"><AlertCircle className="w-5 h-5 text-orange-600" /></div>
              <div><p className="text-sm text-gray-500">ไม่มาตามนัด</p><p className="text-2xl font-bold text-gray-800">{appointments.filter(a => a.status === 'no_show').length}</p></div>
            </div>
          </div>
        </div>

        {/* Appointments List */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2"><Calendar className="w-6 h-6 text-blue-600" /> รายการนัดหมายทั้งหมด</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">วันที่/เวลา</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ประเภท</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">แพทย์</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">สถานที่</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">สถานะ</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">หมายเหตุ</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {appointments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p>ยังไม่มีนัดหมาย</p>
                      <button onClick={() => { resetForm(); setShowCreateModal(true); }} className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">สร้างนัดหมายแรก</button>
                    </td>
                  </tr>
                ) : (
                  appointments.map((appointment) => {
                    const hasFollowup = appointmentsWithFollowup.has(appointment.id);
                    const isCompleted = appointment.status === 'completed';
                    const needsFollowup = isCompleted && !hasFollowup;

                    return (
                      <tr key={appointment.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-gray-400" />
                            <div>
                              <p className="font-medium text-gray-800">{new Date(appointment.appointment_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                              <p className="text-sm text-gray-500">{new Date(appointment.appointment_date).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">{getTypeBadge(appointment.appointment_type)}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-gray-400" />
                            <span className="text-gray-700">{appointment.doctors?.full_name_th || '-'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-gray-400" />
                            <span className="text-gray-700">{appointment.location_type === 'clinic' ? 'คลินิก' : appointment.location_type === 'online' ? 'ออนไลน์' : appointment.location_type === 'home' ? 'บ้าน' : appointment.location_detail || '-'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <span>{getStatusBadge(appointment.status)}</span>
                            {needsFollowup && (
                              <span className="text-xs text-purple-600 font-medium">⏳ รอบันทึกติดตาม</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="max-w-xs truncate text-gray-600 text-sm">{appointment.notes || '-'}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* ✅ แสดงเฉพาะปุ่ม "บันทึกติดตาม" (สีม่วง) เมื่อเสร็จสิ้นแล้วแต่ยังไม่มี followup */}
                            {needsFollowup && (
                              <button
                                onClick={() => router.push(`/admin/appointments/followup/${appointment.id}`)}
                                className="flex items-center gap-1 px-3 py-1.5 bg-purple-500 text-white text-sm rounded-lg hover:bg-purple-600 transition-colors font-medium"
                                title="บันทึกผลการติดตาม"
                              >
                                <FileText className="w-4 h-4" />
                                บันทึกติดตาม
                              </button>
                            )}

                            {/* แสดงปุ่มจัดการปกติ เฉพาะเมื่อไม่เสร็จสิ้น */}
                            {!isCompleted && (
                              <>
                                {appointment.status === 'scheduled' && (
                                  <>
                                    <button onClick={() => handleCompleteAppointment(appointment.id)} className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="ทำเครื่องหมายว่าเสร็จสิ้น">
                                      <CheckCircle className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleCancelAppointment(appointment.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="ยกเลิกนัดหมาย">
                                      <XCircle className="w-4 h-4" />
                                    </button>
                                  </>
                                )}
                                <button onClick={() => openEditModal(appointment)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="แก้ไข">
                                  <Edit className="w-4 h-4" />
                                </button>
                              </>
                            )}

                            {/* แสดงข้อความถ้าเสร็จสิ้นแล้วและมี followup แล้ว */}
                            {isCompleted && hasFollowup && (
                              <span className="text-gray-400 text-sm flex items-center gap-1">
                                <CheckCircle className="w-4 h-4" /> เสร็จสมบูรณ์
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create Appointment Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><Plus className="w-6 h-6 text-blue-600" /> สร้างนัดหมายใหม่</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">แพทย์ผู้ทำการรักษา *</label>
                <p className="text-xs text-gray-500 mb-2">พบแพทย์: {doctors.length} คน</p>
                {doctors.length === 0 && <p className="text-xs text-red-500 mb-2">⚠️ ไม่พบข้อมูลแพทย์! กรุณาตรวจสอบ RLS Policy</p>}
                <select value={formData.doctor_id} onChange={(e) => setFormData({...formData, doctor_id: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                  <option value="">-- เลือกแพทย์ --</option>
                  {doctors.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>{doctor.full_name_th} ({doctor.specialization_th})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">ประเภทนัดหมาย *</label>
                  <select value={formData.appointment_type} onChange={(e) => setFormData({...formData, appointment_type: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                    <option value="followup">🔄 ติดตามผล</option>
                    <option value="consultation">👨‍️ ปรึกษาแพทย์</option>
                    <option value="screening">📋 คัดกรอง</option>
                    <option value="education">📚 ให้ความรู้</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">สถานที่ *</label>
                  <select value={formData.location_type} onChange={(e) => setFormData({...formData, location_type: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                    <option value="clinic">🏥 คลินิก</option>
                    <option value="online">💻 ออนไลน์</option>
                    <option value="home">🏠 บ้าน</option>
                    <option value="other">📍 อื่นๆ</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">วันที่ *</label>
                  <input type="date" value={formData.appointment_date} onChange={(e) => setFormData({...formData, appointment_date: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">เวลา *</label>
                  <input type="time" value={formData.appointment_time} onChange={(e) => setFormData({...formData, appointment_time: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">รายละเอียดสถานที่</label>
                <input type="text" value={formData.location_detail} onChange={(e) => setFormData({...formData, location_detail: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="เช่น ห้องตรวจที่ 1, Zoom Meeting, etc." />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">หมายเหตุ</label>
                <textarea value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} rows={3} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="หมายเหตุเพิ่มเติม..." />
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex gap-4">
              <button onClick={handleCreateAppointment} className="flex-1 bg-blue-500 text-white font-bold py-3 rounded-lg hover:bg-blue-600 transition-all">สร้างนัดหมาย</button>
              <button onClick={() => { setShowCreateModal(false); resetForm(); }} className="flex-1 bg-gray-500 text-white font-bold py-3 rounded-lg hover:bg-gray-600 transition-all">ยกเลิก</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Appointment Modal */}
      {showEditModal && selectedAppointment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><Edit className="w-6 h-6 text-blue-600" /> แก้ไขนัดหมาย</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">แพทย์ผู้ทำการรักษา *</label>
                <select value={formData.doctor_id} onChange={(e) => setFormData({...formData, doctor_id: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                  <option value="">-- เลือกแพทย์ --</option>
                  {doctors.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>{doctor.full_name_th} ({doctor.specialization_th})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">ประเภทนัดหมาย *</label>
                  <select value={formData.appointment_type} onChange={(e) => setFormData({...formData, appointment_type: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                    <option value="followup">🔄 ติดตามผล</option>
                    <option value="consultation">👨‍⚕️ ปรึกษาแพทย์</option>
                    <option value="screening">📋 คัดกรอง</option>
                    <option value="education">📚 ให้ความรู้</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">สถานที่ *</label>
                  <select value={formData.location_type} onChange={(e) => setFormData({...formData, location_type: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                    <option value="clinic">🏥 คลินิก</option>
                    <option value="online">💻 ออนไลน์</option>
                    <option value="home">🏠 บ้าน</option>
                    <option value="other">📍 อื่นๆ</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">วันที่ *</label>
                  <input type="date" value={formData.appointment_date} onChange={(e) => setFormData({...formData, appointment_date: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">เวลา *</label>
                  <input type="time" value={formData.appointment_time} onChange={(e) => setFormData({...formData, appointment_time: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">รายละเอียดสถานที่</label>
                <input type="text" value={formData.location_detail} onChange={(e) => setFormData({...formData, location_detail: e.target.value})} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="เช่น ห้องตรวจที่ 1, Zoom Meeting, etc." />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">หมายเหตุ</label>
                <textarea value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} rows={3} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="หมายเหตุเพิ่มเติม..." />
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex gap-4">
              <button onClick={handleUpdateAppointment} className="flex-1 bg-blue-500 text-white font-bold py-3 rounded-lg hover:bg-blue-600 transition-all">บันทึกการแก้ไข</button>
              <button onClick={() => { setShowEditModal(false); resetForm(); }} className="flex-1 bg-gray-500 text-white font-bold py-3 rounded-lg hover:bg-gray-600 transition-all">ยกเลิก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}