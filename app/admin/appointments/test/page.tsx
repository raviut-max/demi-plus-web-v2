'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

export default function TestPage() {
  const [data, setData] = useState<any[]>([]);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    testData();
  }, []);

  const testData = async () => {
    try {
      // ทดสอบดึงข้อมูลแบบง่ายที่สุด
      const { data, error } = await supabase
        .from('appointments')
        .select('*');

      if (error) {
        setError('Error: ' + error.message);
        return;
      }

      setData(data || []);
      console.log('✅ Appointments:', data);
    } catch (err: any) {
      setError('Exception: ' + err.message);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">🔍 ทดสอบข้อมูลนัดหมาย</h1>
      
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-red-600">{error}</p>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
        <p className="text-blue-800">
          <strong>จำนวนนัดหมาย:</strong> {data.length} รายการ
        </p>
      </div>

      {data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2">ID</th>
                <th className="border p-2">User ID</th>
                <th className="border p-2">Date</th>
                <th className="border p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.slice(0, 10).map((apt: any) => (
                <tr key={apt.id}>
                  <td className="border p-2">{apt.id}</td>
                  <td className="border p-2">{apt.user_id}</td>
                  <td className="border p-2">{apt.appointment_date}</td>
                  <td className="border p-2">{apt.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        onClick={testData}
        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg"
      >
        🔄 ทดสอบอีกครั้ง
      </button>
    </div>
  );
}