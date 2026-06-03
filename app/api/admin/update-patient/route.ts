// File: app/api/admin/update-patient/route.ts
// Description: API สำหรับอัปเดตข้อมูลคนไข้

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const { patientId, updates } = await request.json();

    console.log('[UPDATE API] Received update for patient:', patientId);
    console.log('[UPDATE API] Updates:', updates);

    if (!patientId) {
      return NextResponse.json(
        { error: 'Patient ID is required' },
        { status: 400 }
      );
    }

    const userUpdates: any = {};
    const profileUpdates: any = {};

    if (updates.id_card !== undefined) userUpdates.id_card = updates.id_card;
    if (updates.first_name !== undefined) profileUpdates.first_name = updates.first_name;
    if (updates.last_name !== undefined) profileUpdates.last_name = updates.last_name;
    if (updates.hospital_number !== undefined) profileUpdates.hospital_number = updates.hospital_number;

    let error: any = null;

    // Update users
    if (Object.keys(userUpdates).length > 0) {
      const { error: userError } = await supabase
        .from('users')
        .update(userUpdates)
        .eq('id', patientId);
      error = userError;
    }

    // Update profiles
    if (Object.keys(profileUpdates).length > 0 && !error) {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', patientId)
        .single();

      if (existingProfile) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update(profileUpdates)
          .eq('id', patientId);
        error = profileError;
      } else {
        const { error: insertError } = await supabase
          .from('profiles')
          .insert({
            id: patientId,
            ...profileUpdates,
            birth_date: new Date(),
            gender: 'female'
          });
        error = insertError;
      }
    }

    if (error) {
      console.error('[UPDATE API] Error:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    console.log('[UPDATE API] Successfully updated:', patientId);

    return NextResponse.json({
      success: true,
      message: 'Updated successfully'
    });
  } catch (error) {
    console.error('[UPDATE API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update patient' },
      { status: 500 }
    );
  }
}