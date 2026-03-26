'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, logout } from '@/lib/supabase/queries';
import { supabase } from '@/lib/supabase/client';
import { ArrowLeft, LogOut, Search, MapPin } from 'lucide-react';

export default function LocationsListPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'provinces' | 'districts' | 'subdistricts'>('provinces');
  const [searchTerm, setSearchTerm] = useState('');
  const [provinces, setProvinces] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [subdistricts, setSubdistricts] = useState<any[]>([]);

  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }

    if (userData.role !== 'admin') {
      alert('ไม่มีสิทธิ์เข้าถึง');
      router.push('/admin/login');
      return;
    }

    setUser(userData);
    loadData();
  }, [router]);

  const loadData = async () => {
    setLoading(true);
    
    const { data: provincesData } = await supabase
      .from('provinces')
      .select('*')
      .order('name_th', { ascending: true });
    
    const { data: districtsData } = await supabase
      .from('districts')
      .select('*, provinces(name_th)')
      .order('name_th', { ascending: true });
    
    const { data: subdistrictsData } = await supabase
      .from('subdistricts')
      .select('*, districts(name_th, provinces(name_th))')
      .order('name_th', { ascending: true });

    setProvinces(provincesData || []);
    setDistricts(districtsData || []);
    setSubdistricts(subdistrictsData || []);
    setLoading(false);
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  const filteredProvinces = provinces.filter(p => 
    p.name_th.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.name_en.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredDistricts = districts.filter(d => 
    d.name_th.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.name_en.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredSubdistricts = subdistricts.filter(s => 
    s.name_th.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.name_en.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!user || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">กำลังโหลด...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-100 to-cyan-50 pb-20">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-white/50 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <button
                onClick={() => router.push('/admin/dashboard')}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-2"
              >
                <ArrowLeft className="w-5 h-5" />
                <span>กลับ</span>
              </button>
              <h1 className="text-3xl font-bold text-gray-800">จัดการข้อมูลที่อยู่</h1>
              <p className="text-gray-600">ดูข้อมูลจังหวัด/อำเภอ/ตำบล</p>
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
        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-lg p-2 border border-gray-200 mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('provinces')}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all ${
                activeTab === 'provinces' 
                  ? 'bg-blue-500 text-white' 
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              จังหวัด ({provinces.length})
            </button>
            <button
              onClick={() => setActiveTab('districts')}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all ${
                activeTab === 'districts' 
                  ? 'bg-green-500 text-white' 
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              อำเภอ/เขต ({districts.length})
            </button>
            <button
              onClick={() => setActiveTab('subdistricts')}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all ${
                activeTab === 'subdistricts' 
                  ? 'bg-purple-500 text-white' 
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              ตำบล ({subdistricts.length})
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="ค้นหา..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr>
                  {activeTab === 'provinces' && (
                    <>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ID</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ชื่อไทย</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ชื่ออังกฤษ</th>
                    </>
                  )}
                  {activeTab === 'districts' && (
                    <>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ID</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">จังหวัด</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ชื่อไทย</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ชื่ออังกฤษ</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">รหัสไปรษณีย์</th>
                    </>
                  )}
                  {activeTab === 'subdistricts' && (
                    <>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ID</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">อำเภอ</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">จังหวัด</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ชื่อไทย</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ชื่ออังกฤษ</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">รหัสไปรษณีย์</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {activeTab === 'provinces' && filteredProvinces.map((province) => (
                  <tr key={province.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-600">{province.id}</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-800">{province.name_th}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{province.name_en}</td>
                  </tr>
                ))}
                {activeTab === 'districts' && filteredDistricts.map((district) => (
                  <tr key={district.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-600">{district.id}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{district.provinces?.name_th}</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-800">{district.name_th}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{district.name_en}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{district.zipcode}</td>
                  </tr>
                ))}
                {activeTab === 'subdistricts' && filteredSubdistricts.map((subdistrict) => (
                  <tr key={subdistrict.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-600">{subdistrict.id}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{subdistrict.districts?.name_th}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{subdistrict.districts?.provinces?.name_th}</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-800">{subdistrict.name_th}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{subdistrict.name_en}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{subdistrict.zipcode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}