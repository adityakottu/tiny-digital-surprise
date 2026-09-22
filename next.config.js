/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  experimental: {
    // Make sure the story HTML template (read at runtime via fs, not
    // imported as a module) is definitely bundled into the /g/[slug]
    // serverless function on Vercel, even if file-tracing misses it.
    // On Next 14 this key lives under `experimental`; moving it to the top
    // level (its Next 15 home) makes Next ignore it entirely.
    outputFileTracingIncludes: {
      "/g/[slug]": ["./lib/story-template.html"],
    },
  },
};

module.exports = nextConfig;
