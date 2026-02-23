module.exports = {
  reactStrictMode: true,
  swcMinify: true,
  experimental: {
    appDir: true,
  },
  images: {
    domains: ['example.com'], // Add your image domains here
  },
  webpack: (config) => {
    // Custom webpack configuration can go here
    return config;
  },
};