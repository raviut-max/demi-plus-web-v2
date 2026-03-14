/** @type {import('next').NextConfig} */
const nextConfig = {
  // ✅ ปิด ESLint ระหว่าง build
  eslint: {
    ignoreDuringBuilds: true,
  },
  // ✅ ปิด TypeScript checking ระหว่าง build
  typescript: {
    ignoreBuildErrors: true,
  },
  // ✅ รองรับ images จาก Supabase
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
};

export default nextConfig;
