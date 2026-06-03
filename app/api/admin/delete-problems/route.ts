// File: app/api/admin/delete-problems/route.ts
// Description: API สำหรับลบข้อมูลคนไข้ (รองรับ multiple delete)

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const { patientIds } = await request.json();

    console.log('🗑️ [DELETE API] Received delete request for', patientIds.length, 'patients:', patientIds);

    if (!patientIds || !Array.isArray(patientIds) || patientIds.length === 0) {
      return NextResponse.json(
        { error: 'No patient IDs provided' },
        { status: 400 }
      );
    }

    // 1. ตรวจสอบว่า user มีอยู่จริงหรือไม่
    const { data: existingUsers, error: checkError } = await supabase
      .from('users')
      .select('id, id_card')
      .in('id', patientIds);

    if (checkError) {
      console.error('❌ [DELETE API] Error checking users:', checkError);
    } else {
      console.log('✅ [DELETE API] Found', existingUsers?.length, 'users to delete');
    }

    // 2. ลบ users ทั้งหมดในครั้งเดียว (จะ cascade ลบ profiles อัตโนมัติ)
    const { data, error } = await supabase
      .from('users')
      .delete()
      .in('id', patientIds);

    if (error) {
      console.error('❌ [DELETE API] Delete error:', error);
      return NextResponse.json(
        { error: error.message, details: error },
        { status: 500 }
      );
    }

    // 3. ตรวจสอบว่าลบจริงหรือไม่
    const { data: remainingUsers } = await supabase
      .from('users')
      .select('id')
      .in('id', patientIds);

    const deletedCount = patientIds.length - (remainingUsers?.length || 0);
    
    if (remainingUsers && remainingUsers.length > 0) {
      console.warn('⚠️ [DELETE API] Some users still exist after delete:', remainingUsers);
    } else {
      console.log('✅ [DELETE API] Successfully deleted', deletedCount, 'users');
    }

    return NextResponse.json({
      success: true,
      deleted: deletedCount,
      message: `Deleted ${deletedCount} patients successfully`
    });
  } catch (error) {
    console.error('❌ [DELETE API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete patients', details: error },
      { status: 500 }
    );
  }
}