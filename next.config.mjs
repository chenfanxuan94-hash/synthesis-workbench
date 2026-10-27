/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["unpdf"],
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
