import { supabase } from './client';

// =====================================================
// ฟังก์ชัน Login (รองรับทั้ง Patient และ Staff)
// =====================================================
export async function login(idCard: string, password: string) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, id_card, password_hash, role, is_active')
      .eq('id_card', idCard)
      .eq('password_hash', password)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      return null;
    }

    // ตรวจสอบว่าเป็น Staff หรือ Patient
    let full_name_th = 'ผู้ใช้';
    let hospital_number = '';
    let pam_level = 'L2';
    let zone = 'Green Zone';
    let current_step = 'Starter';

    if (['admin', 'doctor', 'helper'].includes(data.role)) {
      // Staff → ดึงข้อมูลจาก doctors table
      const { data: doctor } = await supabase
        .from('doctors')
        .select('full_name_th, specialization_th')
        .eq('user_id', data.id)
        .single();

      full_name_th = doctor?.full_name_th || 'ผู้ดูแลระบบ';
    } else {
      // Patient → ดึงข้อมูลจาก profiles table
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, hospital_number, pam_level, pam_score, zone, current_step')
        .eq('id', data.id)
        .single();

      full_name_th = profile?.full_name || 'ผู้ใช้';
      hospital_number = profile?.hospital_number || '';
      pam_level = profile?.pam_level || 'L2';
      zone = profile?.zone || 'Green Zone';
      current_step = profile?.current_step || 'Starter';
    }

    return {
      id: data.id,
      id_card: data.id_card,
      full_name_th: full_name_th,
      hospital_number: hospital_number,
      pam_level: pam_level,
      pam_score: 0,
      zone: zone,
      current_step: current_step,
      role: data.role,
    };
  } catch (err) {
    console.error('Login error:', err);
    return null;
  }
}

// =====================================================
// ฟังก์ชัน Logout
// =====================================================
export async function logout() {
  localStorage.removeItem('user_id');
  localStorage.removeItem('user_data');
  localStorage.removeItem('login_time');
}

// =====================================================
// ฟังก์ชันตรวจสอบ Session
// =====================================================
export function checkSession() {
  const userId = localStorage.getItem('user_id');
  const userData = localStorage.getItem('user_data');
  const loginTime = localStorage.getItem('login_time');

  if (!userId || !userData) {
    return null;
  }

  if (loginTime) {
    const loginDate = new Date(loginTime);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - loginDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays > 7) {
      logout();
      return null;
    }
  }

  return JSON.parse(userData);
}

// =====================================================
// ฟังก์ชันดึงข้อมูลผู้ใช้ (Profile)
// =====================================================
export async function getProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) return null;
  return data;
}

// =====================================================
// ฟังก์ชันดึงรายการผู้ป่วยทั้งหมด (Admin) - ✅ แก้ไขแล้ว
// =====================================================
export async function getPatientList(search?: string, pamLevel?: string) {
  try {
    let query = supabase
      .from('profiles')
      .select(`*, users!profiles_id_fkey ( id_card, role, is_active, created_at )`)
      .eq('is_active', true)  // ✅ กรองเฉพาะผู้ป่วยที่ยัง active
      .order('created_at', { ascending: false });

    if (search) {
      query = query.or(`full_name.ilike.%${search}%,hospital_number.ilike.%${search}%`);
    }

    if (pamLevel) {
      query = query.eq('pam_level', pamLevel);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching patient list:', error);
      return [];
    }

    console.log('📊 Patient List Data:', data);
    return data || [];
  } catch (err) {
    console.error('Get patient list error:', err);
    return [];
  }
}

// =====================================================
// ฟังก์ชันกู้คืนผู้ป่วย (Restore)
// =====================================================
export async function restorePatient(patientId: string) {
  try {
    console.log('♻️ Restoring patient:', patientId);
    
    // 1. เปิดการใช้งานใน profiles table
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ 
        is_active: true,
        status: 'active',
        updated_at: new Date().toISOString()
      })
      .eq('id', patientId);

    if (profileError) {
      console.error('Error restoring profile:', profileError);
      return { success: false, error: profileError.message };
    }

    // 2. เปิดการใช้งานใน users table
    const { error: userError } = await supabase
      .from('users')
      .update({ is_active: true })
      .eq('id', patientId);

    if (userError) {
      console.error('Error restoring user:', userError);
      return { success: false, error: userError.message };
    }

    console.log('✅ Patient restored successfully');
    return { success: true };
  } catch (err) {
    console.error('Restore patient error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการกู้คืนผู้ป่วย' };
  }
}

// =====================================================
// ฟังก์ชันดึงรายการผู้ป่วยที่ถูกลบแล้ว (Inactive Patients)
// =====================================================
export async function getDeletedPatients() {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select(`*, users!profiles_id_fkey ( id_card, role, is_active )`)
      .eq('is_active', false)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching deleted patients:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Get deleted patients error:', err);
    return [];
  }
}

// =====================================================
// ฟังก์ชันลงทะเบียนผู้ป่วยใหม่ (Admin) - ฉบับสมบูรณ์
// =====================================================
export async function registerPatient(data: {
  id_card: string;
  password: string;
  full_name: string;
  hospital_number: string;
  birth_date: string;
  gender: string;
  phone?: string;
  email?: string;
  current_weight?: number;
  height?: number;
  waist_circumference?: number;
  coach_id?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
  address_line1?: string;
  district?: string;
  province?: string;
  postal_code?: string;
  diabetes_type?: string;
  diagnosis_date?: string;
  hba1c_level?: number;
  blood_type?: string;
  allergies?: string;
  occupation?: string;
  education_level?: string;
  created_by: string;
}) {
  try {
    // 1. สร้าง user account
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        id_card: data.id_card,
        password_hash: data.password,
        role: 'patient',
        is_active: true,
        created_by: data.created_by,
      })
      .select()
      .single();

    if (userError) {
      console.error('Error creating user:', userError);
      return { success: false, error: userError.message };
    }

    // 2. สร้าง profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        full_name: data.full_name,
        hospital_number: data.hospital_number,
        birth_date: data.birth_date,
        gender: data.gender,
        phone: data.phone,
        email: data.email,
        current_weight: data.current_weight,
        height: data.height,
        waist_circumference: data.waist_circumference,
        coach_id: data.coach_id,
        emergency_contact_name: data.emergency_contact_name,
        emergency_contact_phone: data.emergency_contact_phone,
        emergency_contact_relationship: data.emergency_contact_relationship,
        address_line1: data.address_line1,
        district: data.district,
        province: data.province,
        postal_code: data.postal_code,
        diabetes_type: data.diabetes_type,
        diagnosis_date: data.diagnosis_date,
        hba1c_level: data.hba1c_level,
        blood_type: data.blood_type,
        allergies: data.allergies,
        occupation: data.occupation,
        education_level: data.education_level,
        pam_level: 'L1',
        zone: 'Green Zone',
        current_step: 'Starter',
        is_active: true,
        status: 'active',
      })
      .select()
      .single();

    if (profileError) {
      console.error('Error creating profile:', profileError);
      await supabase.from('users').delete().eq('id', user.id);
      return { success: false, error: profileError.message };
    }

    return { success: true, user, profile };
  } catch (err) {
    console.error('Register patient error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการลงทะเบียน' };
  }
}

// =====================================================
// ฟังก์ชันดึงคำถาม Screening
// =====================================================
export async function getScreeningQuestions(questionType: string = 'pam') {
  try {
    const { data, error } = await supabase
      .from('screening_questions')
      .select('*')
      .eq('question_type', questionType)
      .eq('is_active', true)
      .order('question_number', { ascending: true });

    if (error) {
      console.error('Error fetching screening questions:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Get screening questions error:', err);
    return [];
  }
}

// =====================================================
// ฟังก์ชันบันทึก Screening
// =====================================================
export async function saveScreening(data: {
  user_id: string;
  screening_type: string;
  pam_total_score?: number;
  pam_level_result?: string;
  proms_q1_score?: number;
  proms_q2_score?: number;
  proms_q3_score?: number;
  proms_q4_score?: number;
  proms_zone?: string;
  proms_has_low_score?: boolean;
  confidence_score?: number;
  confidence_improvement_plan?: string;
  conducted_by?: string;
  responses: Array<{
    question_id: string;
    question_number: number;
    question_type: string;
    selected_option?: string;
    score?: number;
  }>;
}) {
  try {
    // 1. สร้าง screening record
    const { data: screening, error: screeningError } = await supabase
      .from('screenings')
      .insert({
        user_id: data.user_id,
        screening_type: data.screening_type,
        pam_total_score: data.pam_total_score,
        pam_level_result: data.pam_level_result,
        proms_q1_score: data.proms_q1_score,
        proms_q2_score: data.proms_q2_score,
        proms_q3_score: data.proms_q3_score,
        proms_q4_score: data.proms_q4_score,
        proms_zone: data.proms_zone,
        proms_has_low_score: data.proms_has_low_score,
        confidence_score: data.confidence_score,
        confidence_improvement_plan: data.confidence_improvement_plan,
        conducted_by: data.conducted_by,
      })
      .select()
      .single();

    if (screeningError) {
      console.error('Error creating screening:', screeningError);
      return { success: false, error: screeningError.message };
    }

    // 2. บันทึก responses
    const responses = data.responses.map(r => ({
      screening_id: screening.id,
      question_id: r.question_id,
      question_number: r.question_number,
      question_type: r.question_type,
      selected_option: r.selected_option,
      score: r.score,
    }));

    const { error: responsesError } = await supabase
      .from('screening_responses')
      .insert(responses);

    if (responsesError) {
      console.error('Error saving responses:', responsesError);
      return { success: false, error: responsesError.message };
    }

    // 3. อัพเดท profile pam_level และ zone
    if (data.pam_level_result) {
      const levelMap: Record<string, string> = {
        'Deny': 'L1',
        'General': 'L2',
        'Intensive': 'L3',
        'Champion': 'L4',
      };

      const zoneMap: Record<string, string> = {
        'Deny': 'Red Zone',
        'General': 'Green Zone',
        'Intensive': 'Green Zone',
        'Champion': 'Green Zone',
      };

      await supabase
        .from('profiles')
        .update({
          pam_level: levelMap[data.pam_level_result] || 'L1',
          zone: zoneMap[data.pam_level_result] || 'Green Zone',
          pam_score: data.pam_total_score,
        })
        .eq('id', data.user_id);
    }

    return { success: true, screening };
  } catch (err) {
    console.error('Save screening error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการบันทึก screening' };
  }
}

// =====================================================
// ฟังก์ชันดึงข้อมูลโค้ช/หมอทั้งหมด
// =====================================================
export async function getCoaches() {
  try {
    const { data, error } = await supabase
      .from('doctors')
      .select('id, user_id, full_name_th, specialization_th, is_active')
      .eq('is_active', true)
      .order('full_name_th', { ascending: true });

    if (error) {
      console.error('Error fetching coaches:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Get coaches error:', err);
    return [];
  }
}

// =====================================================
// ฟังก์ชันดึงข้อมูลผู้ป่วยรายคน (Admin)
// =====================================================
export async function getPatientDetail(userId: string) {
  try {
    console.log('🔍 Fetching patient detail for ID:', userId);
    
    // 1. ดึงข้อมูล profile ก่อน (ไม่ join)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError) {
      console.error('❌ Error fetching profile:', profileError);
      return null;
    }

    // 2. ดึงข้อมูล user แยกต่างหาก
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id_card, role, is_active, created_at')
      .eq('id', userId)
      .single();

    if (userError) {
      console.error('❌ Error fetching user:', userError);
      return null;
    }

    // 3. รวมข้อมูลเข้าด้วยกัน
    const result = {
      ...profile,
      users: userData
    };

    console.log('✅ Patient detail fetched successfully:', result);
    return result;
  } catch (err) {
    console.error('❌ Get patient detail error:', err);
    return null;
  }
}

// =====================================================
// ฟังก์ชันดึงนัดหมายทั้งหมด (Admin)
// =====================================================
export async function getAppointments(userId?: string) {
  try {
    let query = supabase
      .from('appointments')
      .select(`*, users ( full_name, hospital_number ), doctors ( full_name_th, specialization_th )`)
      .order('appointment_date', { ascending: true });

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching appointments:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Get appointments error:', err);
    return [];
  }
}

// =====================================================
// ฟังก์ชันสร้างนัดหมายใหม่ (Admin)
// =====================================================
export async function createAppointment(data: {
  user_id: string;
  doctor_id: string;
  appointment_type: string;
  appointment_date: string;
  duration_minutes?: number;
  location_type?: string;
  location_detail?: string;
  notes?: string;
  created_by: string;
}) {
  try {
    const { data: appointment, error } = await supabase
      .from('appointments')
      .insert({
        user_id: data.user_id,
        doctor_id: data.doctor_id,
        appointment_type: data.appointment_type,
        appointment_date: data.appointment_date,
        duration_minutes: data.duration_minutes || 30,
        location_type: data.location_type || 'clinic',
        location_detail: data.location_detail,
        status: 'scheduled',
        notes: data.notes,
        created_by: data.created_by,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating appointment:', error);
      return { success: false, error: error.message };
    }

    return { success: true, appointment };
  } catch (err) {
    console.error('Create appointment error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการสร้างนัดหมาย' };
  }
}

// =====================================================
// ฟังก์ชันดึงสถิติ Dashboard (Admin) - ✅ แก้ไขแล้ว
// =====================================================
export async function getDashboardStats() {
  try {
    // จำนวนผู้ป่วยทั้งหมด (เฉพาะ active)
    const { count: totalPatients } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);  // ✅ เพิ่มบรรทัดนี้

    // จำนวนบันทึกวันนี้
    const today = new Date().toISOString().split('T')[0];
    const { count: todayRecords } = await supabase
      .from('records')
      .select('*', { count: 'exact', head: true })
      .eq('record_date', today);

    // จำนวนนัดหมายวันนี้
    const { count: todayAppointments } = await supabase
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .gte('appointment_date', today)
      .lte('appointment_date', today + 'T23:59:59');

    // จำนวนรอประเมิน (PAM Level = L1 หรือยังไม่ได้ทำ Screening)
    const { count: pendingAssessments } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('pam_level', 'L1');

    return {
      totalPatients: totalPatients || 0,
      todayRecords: todayRecords || 0,
      todayAppointments: todayAppointments || 0,
      pendingAssessments: pendingAssessments || 0,
    };
  } catch (err) {
    console.error('Get dashboard stats error:', err);
    return {
      totalPatients: 0,
      todayRecords: 0,
      todayAppointments: 0,
      pendingAssessments: 0,
    };
  }
}

// =====================================================
// ฟังก์ชันดึงรายการเจ้าหน้าที่ทั้งหมด (Admin เท่านั้น)
// =====================================================
export async function getStaffList(role?: string) {
  try {
    let query = supabase
      .from('users')
      .select(`*, doctors ( id, full_name_th, specialization_th, is_active, is_verified )`)
      .in('role', ['admin', 'doctor', 'helper'])
      .eq('is_active', true)  // ✅ เพิ่ม: กรองเฉพาะเจ้าหน้าที่ที่ยัง active
      .order('created_at', { ascending: false });

    if (role) {
      query = query.eq('role', role);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching staff list:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Get staff list error:', err);
    return [];
  }
}

// =====================================================
// ฟังก์ชันเพิ่มเจ้าหน้าที่ใหม่ (Admin เท่านั้น)
// =====================================================
export async function addStaff(data: {
  id_card: string;
  password: string;
  full_name_th: string;
  role: 'doctor' | 'helper';
  specialization_th?: string;
  phone?: string;
  email?: string;
  created_by: string;
}) {
  try {
    // 1. สร้าง user account
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        id_card: data.id_card,
        password_hash: data.password,
        role: data.role,
        is_active: true,
        created_by: data.created_by,
      })
      .select()
      .single();

    if (userError) {
      console.error('Error creating user:', userError);
      return { success: false, error: userError.message };
    }

    // 2. สร้าง doctor profile (สำหรับ doctor และ helper)
    if (data.role === 'doctor' || data.role === 'helper') {
      const { error: doctorError } = await supabase
        .from('doctors')
        .insert({
          user_id: user.id,
          full_name: data.id_card,
          full_name_th: data.full_name_th,
          specialization_th: data.specialization_th || (data.role === 'helper' ? 'เจ้าหน้าที่สาธารณสุข' : 'แพทย์'),
          is_active: true,
          is_verified: false,
        });

      if (doctorError) {
        console.error('Error creating doctor profile:', doctorError);
        await supabase.from('users').delete().eq('id', user.id);
        return { success: false, error: doctorError.message };
      }
    }

    return { success: true, user };
  } catch (err) {
    console.error('Add staff error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการเพิ่มเจ้าหน้าที่' };
  }
}

// =====================================================
// ฟังก์ชันแก้ไขข้อมูลเจ้าหน้าที่
// =====================================================
export async function updateStaff(userId: string, data: {
  full_name_th?: string;
  specialization_th?: string;
  phone?: string;
  email?: string;
  is_active?: boolean;
}) {
  try {
    const { error } = await supabase
      .from('doctors')
      .update({
        full_name_th: data.full_name_th,
        specialization_th: data.specialization_th,
        is_active: data.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (error) {
      console.error('Error updating staff:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Update staff error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการแก้ไขข้อมูล' };
  }
}

// =====================================================
// ฟังก์ชันลบ/ปิดการใช้งานเจ้าหน้าที่
// =====================================================
export async function deactivateStaff(userId: string) {
  try {
    // 1. ปิดการใช้งานใน doctors table
    await supabase
      .from('doctors')
      .update({ is_active: false })
      .eq('user_id', userId);

    // 2. ปิดการใช้งานใน users table
    const { error } = await supabase
      .from('users')
      .update({ is_active: false })
      .eq('id', userId);

    if (error) {
      console.error('Error deactivating staff:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Deactivate staff error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการปิดการใช้งาน' };
  }
}

// =====================================================
// ฟังก์ชันดึงข้อมูลเจ้าหน้าที่รายคน
// =====================================================
export async function getStaffDetail(userId: string) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select(`*, doctors ( id, full_name_th, specialization_th, phone, email, is_active, is_verified )`)
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching staff detail:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Get staff detail error:', err);
    return null;
  }
}

// =====================================================
// ฟังก์ชันดึงประวัติการประเมินพร้อมคำตอบ
// =====================================================
export async function getScreeningHistory(patientId: string) {
  try {
    const { data: screenings, error } = await supabase
      .from('screenings')
      .select(`*, screening_responses ( question_id, question_number, question_type, selected_option, score )`)
      .eq('user_id', patientId)
      .order('screening_date', { ascending: false });

    if (error) {
      console.error('Error fetching screening history:', error);
      return [];
    }

    return screenings || [];
  } catch (err) {
    console.error('Get screening history error:', err);
    return [];
  }
}

// =====================================================
// ฟังก์ชันดึงคำถามทั้งหมด (สำหรับแสดงคู่กับคำตอบ)
// =====================================================
export async function getAllScreeningQuestions() {
  try {
    const { data, error } = await supabase
      .from('screening_questions')
      .select('*')
      .eq('is_active', true)
      .order('question_type', { ascending: true })
      .order('question_number', { ascending: true });

    if (error) {
      console.error('Error fetching questions:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Get all questions error:', err);
    return [];
  }
}

// =====================================================
// ฟังก์ชันลบผู้ป่วย (Soft Delete)
// =====================================================
export async function deletePatient(patientId: string) {
  try {
    console.log('🗑️ Deleting patient:', patientId);
    
    // 1. ปิดการใช้งานใน profiles table
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ 
        is_active: false,
        status: 'inactive',
        updated_at: new Date().toISOString()
      })
      .eq('id', patientId);

    if (profileError) {
      console.error('Error updating profile:', profileError);
      return { success: false, error: profileError.message };
    }

    // 2. ปิดการใช้งานใน users table
    const { error: userError } = await supabase
      .from('users')
      .update({ is_active: false })
      .eq('id', patientId);

    if (userError) {
      console.error('Error updating user:', userError);
      return { success: false, error: userError.message };
    }

    console.log('✅ Patient deleted successfully');
    return { success: true };
  } catch (err) {
    console.error('Delete patient error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการลบผู้ป่วย' };
  }
}

// =====================================================
// ฟังก์ชันลบผู้ป่วยถาวร (Permanent Delete)
// =====================================================
export async function permanentlyDeletePatient(patientId: string) {
  try {
    console.log('🗑️ Permanently deleting patient:', patientId);
    
    // 1. ลบ screening responses ก่อน (foreign key constraint)
    await supabase
      .from('screening_responses')
      .delete()
      .in('screening_id', 
        (await supabase
          .from('screenings')
          .select('id')
          .eq('user_id', patientId)
        ).data?.map((s: any) => s.id) || []
      );

    // 2. ลบ screening records
    await supabase
      .from('screenings')
      .delete()
      .eq('user_id', patientId);

    // 3. ลบ appointments
    await supabase
      .from('appointments')
      .delete()
      .eq('user_id', patientId);

    // 4. ลบ profile
    const { error: profileError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', patientId);

    if (profileError) {
      console.error('Error deleting profile:', profileError);
      return { success: false, error: profileError.message };
    }

    // 5. ลบ user
    const { error: userError } = await supabase
      .from('users')
      .delete()
      .eq('id', patientId);

    if (userError) {
      console.error('Error deleting user:', userError);
      return { success: false, error: userError.message };
    }

    console.log('✅ Patient permanently deleted');
    return { success: true };
  } catch (err) {
    console.error('Permanent delete patient error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการลบผู้ป่วยถาวร' };
  }
}

// =====================================================
// ฟังก์ชันลบเจ้าหน้าที่ถาวร (Permanent Delete)
// =====================================================
export async function permanentlyDeleteStaff(staffId: string) {
  try {
    console.log('🗑️ Permanently deleting staff:', staffId);
    
    // 1. ลบจาก doctors table ก่อน (foreign key constraint)
    await supabase
      .from('doctors')
      .delete()
      .eq('user_id', staffId);

    // 2. ลบจาก users table
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', staffId);

    if (error) {
      console.error('Error deleting staff:', error);
      return { success: false, error: error.message };
    }

    console.log('✅ Staff permanently deleted');
    return { success: true };
  } catch (err) {
    console.error('Permanent delete staff error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการลบเจ้าหน้าที่ถาวร' };
  }
}

// =====================================================
// ฟังก์ชันกู้คืนเจ้าหน้าที่ (Restore)
// =====================================================
export async function restoreStaff(staffId: string) {
  try {
    console.log('♻️ Restoring staff:', staffId);
    
    // 1. เปิดการใช้งานใน doctors table
    await supabase
      .from('doctors')
      .update({ is_active: true })
      .eq('user_id', staffId);

    // 2. เปิดการใช้งานใน users table
    const { error } = await supabase
      .from('users')
      .update({ is_active: true })
      .eq('id', staffId);

    if (error) {
      console.error('Error restoring staff:', error);
      return { success: false, error: error.message };
    }

    console.log('✅ Staff restored successfully');
    return { success: true };
  } catch (err) {
    console.error('Restore staff error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการกู้คืนเจ้าหน้าที่' };
  }
}

// =====================================================
// ฟังก์ชันดึงรายการเจ้าหน้าที่ที่ปิดการใช้งาน
// =====================================================
export async function getDeactivatedStaff() {
  try {
    const { data, error } = await supabase
      .from('users')
      .select(`*, doctors ( id, full_name_th, specialization_th, phone, email )`)
      .in('role', ['admin', 'doctor', 'helper'])
      .eq('is_active', false)
      .order('created_at', { ascending: false });  // ✅ เปลี่ยนจาก updated_at เป็น created_at

    if (error) {
      console.error('Error fetching deactivated staff:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Get deactivated staff error:', err);
    return [];
  }
}

// =====================================================
// ฟังก์ชันสร้างเป้าหมายเริ่มต้นตาม PAM Level
// =====================================================
/**
สร้าง Default Goals หลังจากทำ Screening
L1: ไม่สร้าง goals (ต้องดูแลใกล้ชิดก่อน)
L2, L3: กฎทอง 5 ข้อ (5 วัน/สัปดาห์)
L4: แชมป์ 8 กิจกรรม (5 วัน/สัปดาห์)
@param userId - UUID ของผู้ป่วย
@param pamLevel - ระดับ PAM (L1, L2, L3, L4)
@param createdBy - UUID ของหมอ/admin ที่ทำ screening
*/
export async function createDefaultGoals(
  userId: string,
  pamLevel: string,
  createdBy: string
) {
  try {
    console.log('🎯 Creating default goals for user:', userId, 'PAM Level:', pamLevel);
    
    // L1: ไม่สร้าง goals (ต้องดูแลใกล้ชิดก่อน)
    if (pamLevel === 'L1') {
      console.log('⚠️ L1 Patient: No default goals created');
      return { success: true, message: 'L1 - ไม่สร้างเป้าหมายอัตโนมัติ', count: 0 };
    }

    const today = new Date().toISOString().split('T')[0];
    const goals = [];

    // ===========================================
    // L2 และ L3: กฎทอง 5 ข้อ (5 วัน/สัปดาห์)
    // ===========================================
    if (pamLevel === 'L2' || pamLevel === 'L3') {
      // ดึง activities จากฐานข้อมูล
      const { data: activities, error: activitiesError } = await supabase
        .from('activities')
        .select('id, activity_code, activity_name_th, description_th, activity_type')
        .in('activity_code', [
          'stop_sweet',
          'reduce_rice',
          'protein_vegetable',
          'exercise_walk',
          'record_weight_sugar'
        ])
        .eq('is_active', true);

      if (activitiesError) {
        console.error('Error fetching activities:', activitiesError);
      }

      // สร้าง goals จาก activities ที่มี
      if (activities && activities.length > 0) {
        activities.forEach(activity => {
          let targetValue = null;
          let targetUnit = null;

          // กำหนด target_value สำหรับ exercise_walk (15 นาที)
          if (activity.activity_code === 'exercise_walk') {
            targetValue = 15;
            targetUnit = 'minutes';
          }

          goals.push({
            user_id: userId,
            goal_type: 'weekly_activity',
            goal_name: activity.activity_code,
            goal_name_th: activity.activity_name_th,
            description: activity.description_th,
            description_th: activity.description_th,
            target_value: targetValue,
            target_unit: targetUnit,
            target_days: 5,
            start_date: today,
            status: 'active',
            priority: 1,
            is_core_goal: true,
            activity_id: activity.id,
            created_by: createdBy,
          });
        });
      }

      console.log(`✅ L2/L3: Created ${goals.length} default goals`);
    }

    // ===========================================
    // L4: แชมป์ 8 กิจกรรม (5 วัน/สัปดาห์)
    // ===========================================
    if (pamLevel === 'L4') {
      // ดึง activities จากฐานข้อมูล
      const { data: activities, error: activitiesError } = await supabase
        .from('activities')
        .select('id, activity_code, activity_name_th, description_th, activity_type')
        .in('activity_code', [
          // อาหาร (3)
          'carb_control',
          'protein_intake',
          'water_intake',
          // ออกกำลังกาย (4)
          'stretching',
          'cardio',
          'strengthening',
          'hiit',
          // พักผ่อน (1)
          'sleep'
        ])
        .eq('is_active', true);

      if (activitiesError) {
        console.error('Error fetching activities:', activitiesError);
      }

      // สร้าง goals จาก activities ที่มี
      if (activities && activities.length > 0) {
        activities.forEach(activity => {
          let targetValue = null;
          let targetUnit = null;

          // กำหนด target_value สำหรับ activity บางตัว
          if (activity.activity_code === 'water_intake') {
            targetValue = 1;
            targetUnit = 'liters';
          }

          goals.push({
            user_id: userId,
            goal_type: 'weekly_activity',
            goal_name: activity.activity_code,
            goal_name_th: activity.activity_name_th,
            description: activity.description_th,
            description_th: activity.description_th,
            target_value: targetValue,
            target_unit: targetUnit,
            target_days: 5,
            start_date: today,
            status: 'active',
            priority: 1,
            is_core_goal: true,
            activity_id: activity.id,
            created_by: createdBy,
          });
        });
      }

      console.log(`✅ L4: Created ${goals.length} default goals`);
    }

    // ===========================================
    // บันทึก goals ลงฐานข้อมูล
    // ===========================================
    if (goals.length > 0) {
      const { error } = await supabase.from('goals').insert(goals);

      if (error) {
        console.error('❌ Error creating goals:', error);
        return { success: false, error: error.message };
      }

      console.log(`✅ Created ${goals.length} default goals successfully`);
      return { success: true, count: goals.length };
    }

    return { success: true, count: 0 };
  } catch (err) {
    console.error('Create default goals error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการสร้างเป้าหมาย' };
  }
}

// =====================================================
// ฟังก์ชันดึงเป้าหมายของผู้ป่วย
// =====================================================
export async function getPatientGoals(userId: string) {
  try {
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching goals:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Get patient goals error:', err);
    return [];
  }
}

// =====================================================
// ✅ ฟังก์ชันอัปเดตเวลาออกกำลังกายใน Goals (ใหม่)
// =====================================================
export async function updateExerciseGoal(
  userId: string,
  goalName: string,
  targetValue: number,
  targetUnit: string = 'minutes'
) {
  try {
    const { error } = await supabase
      .from('goals')
      .update({
        target_value: targetValue,
        target_unit: targetUnit,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('goal_name', goalName)
      .eq('goal_type', 'weekly_activity')
      .eq('status', 'active');

    if (error) {
      console.error('Error updating exercise goal:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Update exercise goal error:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดในการอัปเดตเป้าหมาย' };
  }
}

// =====================================================
// ✅ ฟังก์ชันบันทึกเวลาออกกำลังกายที่ทำได้จริง (ใหม่)
// =====================================================
export async function saveExerciseRecord(data: {
  user_id: string;
  activity_id: string;
  record_date: string;
  exercise_minutes: number;
  is_completed: boolean;
}) {
  try {
    const { data: result, error } = await supabase
      .from('records')
      .upsert({
        user_id: data.user_id,
        activity_id: data.activity_id,
        record_date: data.record_date,
        exercise_minutes: data.exercise_minutes,
        is_completed: data.is_completed,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,activity_id,record_date',
      })
      .select();

    if (error) {
      console.error('Error saving exercise record:', error);
      return null;
    }

    return result;
  } catch (err) {
    console.error('Save exercise record error:', err);
    return null;
  }
}

// =====================================================
// ฟังก์ชันดึงกิจกรรมตาม PAM Level
// =====================================================
export async function getActivities(pamLevel: string) {
  console.log('Fetching activities for pamLevel:', pamLevel);
  
  const { data, error } = await supabase
    .from('activities')
    .select('*')
    .or(`pam_level.eq.${pamLevel},pam_level.eq.ALL`)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Error fetching activities:', error);
    return [];
  }

  console.log('Activities fetched:', data?.length || 0);
  return data || [];
}

// =====================================================
// ฟังก์ชันบันทึกกิจกรรม (ใช้ upsert) - ✅ แก้ไขแล้ว
// =====================================================
export async function saveRecord(data: {
  user_id: string;
  activity_id: string;
  record_date: string;
  is_completed: boolean;
  weight?: number;
  blood_sugar?: number;
  sweet_type?: string[];
  exercise_minutes?: number;  // ✅ เพิ่ม field
}) {
  try {
    const { data: result, error } = await supabase
      .from('records')
      .upsert({
        user_id: data.user_id,
        activity_id: data.activity_id,
        record_date: data.record_date,
        is_completed: data.is_completed,
        updated_at: new Date().toISOString(),
        ...(data.weight !== undefined && { weight: data.weight }),
        ...(data.blood_sugar !== undefined && { blood_sugar: data.blood_sugar }),
        ...(data.sweet_type !== undefined && { sweet_type: data.sweet_type }),
        ...(data.exercise_minutes !== undefined && { exercise_minutes: data.exercise_minutes }),  // ✅ เพิ่ม
      }, {
        onConflict: 'user_id,activity_id,record_date',
      })
      .select();

    if (error) {
      console.error('Upsert error:', error);
      return null;
    }

    return result;
  } catch (err) {
    console.error('Save record error:', err);
    return null;
  }
}

// =====================================================
// ฟังก์ชันดึงบันทึกวันนี้ - ✅ แก้ไขแล้ว
// =====================================================
export async function getTodayRecords(userId: string) {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('records')
      .select(`
        id, 
        activity_id, 
        is_completed, 
        record_date, 
        sweet_type, 
        weight, 
        blood_sugar,
        exercise_minutes  -- ✅ เพิ่ม field นี้
      `)
      .eq('user_id', userId)
      .eq('record_date', today);

    if (error) {
      console.error('Error fetching today records:', error);
      return [];
    }

    console.log('📝 Today records:', data);
    return data || [];
  } catch (err) {
    console.error('Get today records error:', err);
    return [];
  }
}

// =====================================================
// ฟังก์ชันดึงเป้าหมายรายสัปดาห์
// =====================================================
export async function getWeeklyGoals(userId: string) {
  try {
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .eq('goal_type', 'weekly_activity');

    if (error) {
      console.error('Error fetching weekly goals:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Get weekly goals error:', err);
    return [];
  }
}

// =====================================================
// ฟังก์ชันดึง Progress 7 วัน
// =====================================================
export async function getProgress(userId: string, days: number = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await supabase
    .from('records')
    .select(`
      *,
      activities (
        activity_code,
        activity_name_th,
        activity_type
      )
    `)
    .eq('user_id', userId)
    .gte('record_date', startDate.toISOString())
    .order('record_date', { ascending: false });

  if (error) return [];
  return data;
}

// =====================================================
// ฟังก์ชันดึงเป้าหมาย
// =====================================================
export async function getGoals(userId: string) {
  try {
    console.log('Fetching goals for userId:', userId);
    
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('priority', { ascending: true });

    if (error) {
      console.error('Error fetching goals:', error);
      return [];
    }

    console.log('Goals fetched:', data?.length || 0);
    return data || [];
  } catch (err) {
    console.error('Get goals error:', err);
    return [];
  }
}

// =====================================================
// ฟังก์ชันดึงนัดหมายครั้งถัดไป
// =====================================================
export async function getNextAppointment(userId: string) {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        doctors (
          id,
          full_name_th,
          specialization_th
        )
      `)
      .eq('user_id', userId)
      .in('status', ['scheduled', 'confirmed', 'pending'])
      .gte('appointment_date', startOfToday.toISOString())
      .order('appointment_date', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching appointment:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Appointment error:', err);
    return null;
  }
}

// =====================================================
// ฟังก์ชันดึงความรู้ (Knowledge)
// =====================================================
export async function getKnowledge(pamLevel: string = 'ALL') {
  try {
    console.log('📚 [getKnowledge] Fetching for pamLevel:', pamLevel);
    
    const { data, error } = await supabase
      .from('knowledge')
      .select('*')
      .or(`pam_level.eq.${pamLevel},pam_level.eq.ALL`)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ [getKnowledge] Error:', error);
      return [];
    }

    console.log('✅ [getKnowledge] Fetched:', data?.length || 0, 'items');
    return data || [];
  } catch (err) {
    console.error('❌ [getKnowledge] Error:', err);
    return [];
  }
}