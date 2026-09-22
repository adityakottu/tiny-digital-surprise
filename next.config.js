/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  // Make sure the story HTML template (read at runtime via fs, not
  // imported as a module) is definitely bundled into the /g/[slug]
  // serverless function on Vercel, even if file-tracing misses it.
  outputFileTracingIncludes: {
    "/g/[slug]": ["./lib/story-template.html"],
  },
};

module.exports = nextConfig;
