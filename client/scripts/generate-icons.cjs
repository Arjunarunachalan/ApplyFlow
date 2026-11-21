const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const iconsDir = path.join(__dirname, '..', 'public', 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

// SVG for standard icon
const svgStandard = (size, paddingRatio = 0.22) => {
  const pad = size * paddingRatio;
  const innerSize = size - (pad * 2);
  const rx = size * 0.22;
  return Buffer.from(
    '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="' + size + '" height="' + size + '" rx="' + rx + '" fill="#4f46e5" />' +
      '<g transform="translate(' + pad + ' ' + pad + ') scale(' + (innerSize / 24) + ')">' +
        '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" fill="#ffffff" />' +
        '<path d="M20 3v4" stroke="#ffffff" stroke-width="2" stroke-linecap="round" />' +
        '<path d="M22 5h-4" stroke="#ffffff" stroke-width="2" stroke-linecap="round" />' +
        '<path d="M4 17v2" stroke="#ffffff" stroke-width="2" stroke-linecap="round" />' +
        '<path d="M5 18H3" stroke="#ffffff" stroke-width="2" stroke-linecap="round" />' +
      '</g>' +
    '</svg>'
  );
};

// Maskable icon: full-bleed background without rounded corners, logo inside 60% safe circle
const svgMaskable = (size) => {
  const pad = size * 0.28;
  const innerSize = size - (pad * 2);
  return Buffer.from(
    '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="' + size + '" height="' + size + '" fill="#4f46e5" />' +
      '<g transform="translate(' + pad + ' ' + pad + ') scale(' + (innerSize / 24) + ')">' +
        '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" fill="#ffffff" />' +
        '<path d="M20 3v4" stroke="#ffffff" stroke-width="2" stroke-linecap="round" />' +
        '<path d="M22 5h-4" stroke="#ffffff" stroke-width="2" stroke-linecap="round" />' +
        '<path d="M4 17v2" stroke="#ffffff" stroke-width="2" stroke-linecap="round" />' +
        '<path d="M5 18H3" stroke="#ffffff" stroke-width="2" stroke-linecap="round" />' +
      '</g>' +
    '</svg>'
  );
};

async function buildIcons() {
  await sharp(svgStandard(512)).png().toFile(path.join(iconsDir, 'icon-512x512.png'));
  await sharp(svgStandard(192)).png().toFile(path.join(iconsDir, 'icon-192x192.png'));
  await sharp(svgMaskable(512)).png().toFile(path.join(iconsDir, 'maskable-icon-512x512.png'));
  await sharp(svgStandard(180, 0.20)).png().toFile(path.join(iconsDir, 'apple-touch-icon.png'));
  await sharp(svgStandard(32, 0.15)).png().toFile(path.join(iconsDir, 'favicon-32x32.png'));
  await sharp(svgStandard(16, 0.15)).png().toFile(path.join(iconsDir, 'favicon-16x16.png'));
  console.log('Icons generated successfully in', iconsDir);
}

buildIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
