const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Create a simple icon using SVG
const createIcon = (size) => {
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="${size * 0.1}" fill="#3b82f6"/>
      <text
        x="50%"
        y="50%"
        font-size="${size * 0.625}"
        fill="white"
        text-anchor="middle"
        dy=".35em"
        font-family="Arial, sans-serif"
        font-weight="bold"
      >P</text>
    </svg>
  `;
  return Buffer.from(svg);
};

async function generateIcons() {
  const sizes = [192, 512];
  const publicDir = path.join(__dirname, '..', 'public');

  console.log('Generating PWA icons...');

  for (const size of sizes) {
    const outputPath = path.join(publicDir, `icon-${size}.png`);
    const svgBuffer = createIcon(size);

    try {
      await sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toFile(outputPath);

      const stats = fs.statSync(outputPath);
      console.log(`✓ Created ${path.basename(outputPath)} (${size}x${size}, ${(stats.size / 1024).toFixed(2)}KB)`);
    } catch (error) {
      console.error(`✗ Failed to create icon-${size}.png:`, error.message);
    }
  }

  console.log('\nIcon generation complete!');
}

generateIcons().catch(console.error);
