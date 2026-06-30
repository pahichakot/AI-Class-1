/**
 * filters.js - Canvas 2D Overlays and Particle Engines
 * Renders resolution-independent vector shapes, masks, and physics-based particle overlays.
 */

// Global Particle Base Class
class Particle {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.type = type; // 'paw', 'bone', 'sparkle', 'star'
    this.vx = (Math.random() - 0.5) * 2;
    this.vy = type === 'sparkle' || type === 'star' 
      ? (Math.random() - 0.5) * 3 - 2 // Float upwards & outwards
      : -Math.random() * 2.5 - 1; // Puppy particles float up
    this.alpha = 1;
    this.rotation = Math.random() * Math.PI * 2;
    this.rotationSpeed = (Math.random() - 0.5) * 0.05;
    this.scale = Math.random() * 0.4 + 0.6;
    this.color = '';
    
    if (type === 'sparkle') {
      const colors = ['#00f2fe', '#7f00ff', '#ff007f', '#ffff00', '#ffffff'];
      this.color = colors[Math.floor(Math.random() * colors.length)];
      this.size = Math.random() * 8 + 6;
    } else {
      this.size = Math.random() * 12 + 14;
    }
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.rotation += this.rotationSpeed;
    this.alpha -= 0.012; // Fade out slowly
    return this.alpha > 0;
  }

  /**
   * Renders the particle on the 2D canvas
   */
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    ctx.globalAlpha = this.alpha;
    ctx.scale(this.scale, this.scale);

    if (this.type === 'bone') {
      // Draw a dog bone
      ctx.fillStyle = '#f0ebe1';
      ctx.strokeStyle = '#c8bfb0';
      ctx.lineWidth = 1.5;
      
      ctx.beginPath();
      // Central bar
      ctx.rect(-10, -3, 20, 6);
      // Knobs left
      ctx.arc(-10, -4, 4, 0, Math.PI * 2);
      ctx.arc(-10, 4, 4, 0, Math.PI * 2);
      // Knobs right
      ctx.arc(10, -4, 4, 0, Math.PI * 2);
      ctx.arc(10, 4, 4, 0, Math.PI * 2);
      
      ctx.fill();
      ctx.stroke();
      
    } else if (this.type === 'paw') {
      // Draw a puppy paw print
      ctx.fillStyle = '#ab7a5e';
      
      // Main pad
      ctx.beginPath();
      ctx.arc(0, 4, 8, 0, Math.PI, true);
      ctx.quadraticCurveTo(-6, 4, -4, 8);
      ctx.lineTo(4, 8);
      ctx.quadraticCurveTo(6, 4, 0, 4);
      ctx.fill();
      
      // 4 toe pads
      ctx.beginPath();
      ctx.arc(-7, -2, 3, 0, Math.PI * 2);
      ctx.arc(-2, -6, 3, 0, Math.PI * 2);
      ctx.arc(4, -6, 3, 0, Math.PI * 2);
      ctx.arc(9, -2, 3, 0, Math.PI * 2);
      ctx.fill();
      
    } else if (this.type === 'sparkle') {
      // Draw 4-point sparkle star
      ctx.fillStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 8;
      
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        ctx.lineTo(0, -this.size);
        ctx.quadraticCurveTo(0, 0, this.size, 0);
        ctx.quadraticCurveTo(0, 0, 0, this.size);
        ctx.quadraticCurveTo(0, 0, -this.size, 0);
        ctx.quadraticCurveTo(0, 0, 0, -this.size);
      }
      ctx.closePath();
      ctx.fill();
      
    } else if (this.type === 'star') {
      // Draw standard 5-point star
      ctx.fillStyle = '#ffb703';
      ctx.shadowColor = '#ffb703';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      
      const rot = Math.PI / 2 * 3;
      let cx = 0, cy = 0;
      const spikes = 5;
      const outerRadius = this.size * 0.7;
      const innerRadius = this.size * 0.35;
      let x = cx, y = cy;
      const step = Math.PI / spikes;

      ctx.moveTo(cx, cy - outerRadius);
      for (let i = 0; i < spikes; i++) {
        x = cx + Math.cos(rot + i * step * 2) * outerRadius;
        y = cy + Math.sin(rot + i * step * 2) * outerRadius;
        ctx.lineTo(x, y);
        x = cx + Math.cos(rot + (i * step * 2) + step) * innerRadius;
        y = cy + Math.sin(rot + (i * step * 2) + step) * innerRadius;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(cx, cy - outerRadius);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }
}

/**
 * Base FaceFilter Overlay Class
 */
class FaceFilter {
  constructor() {
    this.particles = [];
  }

  /**
   * Helper: Calculate Euclidean distance between two landmarks
   */
  getDistance(p1, p2) {
    if (!p1 || !p2) return 0;
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const dz = p1.z - p2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Helper: Calculate rotation angle (tilt) between two landmarks (e.g. eyes)
   */
  getAngle(p1, p2) {
    if (!p1 || !p2) return 0;
    return Math.atan2(p2.y - p1.y, p2.x - p1.x);
  }

  /**
   * Abstract Draw Loop called on every frame.
   */
  draw(ctx, landmarks, width, height) {
    // To be implemented by subclasses
  }

  /**
   * Emits float particles
   */
  updateParticles(ctx, width, height) {
    // Update and draw active particles
    this.particles = this.particles.filter(p => {
      const active = p.update();
      if (active) {
        // Boundary check (keep inside screen bounds)
        if (p.y < -30 || p.x < -30 || p.x > width + 30) return false;
        p.draw(ctx);
      }
      return active;
    });
  }
}

/**
 * Filter 1: Comic Book Hero Filter Overlays
 */
class ComicFilter extends FaceFilter {
  constructor() {
    super();
    this.actionBubbles = [];
    this.lastBubbleTime = 0;
    this.bubbleTexts = ['POW!', 'BAM!', 'KABOOM!', 'CRASH!', 'HERO!', 'ZAP!', 'WHACK!'];
    
    // Face outer contour landmarks in clockwise/counter-clockwise order
    this.outerContourIndices = [
      10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 
      152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109
    ];
  }

  /**
   * Traces the face mesh silhouette contour
   */
  drawFaceContour(ctx, landmarks, width, height) {
    ctx.beginPath();
    
    // Start at first landmark
    const startPt = landmarks[this.outerContourIndices[0]];
    ctx.moveTo(startPt.x * width, startPt.y * height);
    
    // Draw smooth bezier/line segments around head silhouette
    for (let i = 1; i < this.outerContourIndices.length; i++) {
      const idx = this.outerContourIndices[i];
      const pt = landmarks[idx];
      ctx.lineTo(pt.x * width, pt.y * height);
    }
    
    ctx.closePath();
  }

  /**
   * Renders the retro background speed lines
   */
  drawComicBackground(ctx, width, height, faceCenter) {
    const cx = faceCenter.x;
    const cy = faceCenter.y;
    
    // Draw yellow/orange sunburst backdrop rays
    const numRays = 24;
    const rayAngle = (Math.PI * 2) / numRays;
    const maxRadius = Math.max(width, height) * 1.5;

    ctx.fillStyle = '#ff8c00'; // Dark orange rays
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.fillStyle = '#ffd700'; // Yellow base background
    ctx.fill();

    ctx.fillStyle = '#ff5400'; // Reddish-orange rays
    for (let i = 0; i < numRays; i += 2) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, maxRadius, i * rayAngle, (i + 1) * rayAngle);
      ctx.closePath();
      ctx.fill();
    }

    // Draw vintage comic circular dot pattern overlay (subtle speed lines)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 4;
    for (let r = 80; r < maxRadius; r += 60) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    // Draw stylized retro city skyline at bottom
    ctx.fillStyle = '#0a0a1a';
    ctx.beginPath();
    ctx.moveTo(0, height);
    
    const buildingWidth = width / 12;
    for (let i = 0; i <= 12; i++) {
      const bx = i * buildingWidth;
      const bh = 80 + Math.sin(i * 1.7) * 40 + (i % 3 === 0 ? 60 : 0);
      ctx.lineTo(bx, height - bh);
      ctx.lineTo(bx + buildingWidth, height - bh);
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();
  }

  draw(ctx, landmarks, width, height) {
    if (!landmarks || landmarks.length === 0) return;

    // 1. BACKDROP REPLACEMENT using face clipping mask
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];
    const noseBridge = landmarks[4];
    const faceCenter = {
      x: noseBridge.x * width,
      y: noseBridge.y * height
    };

    ctx.save();
    // Use even-odd rule: clip anything *except* the face contour silhouette
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    
    // Draw inverted face path
    this.drawFaceContour(ctx, landmarks, width, height);
    ctx.clip('evenodd');
    
    // Render comic background rays & city in clipped area (replaces video background)
    this.drawComicBackground(ctx, width, height, faceCenter);
    ctx.restore();

    // 2. FACE CARTOON OUTLINE (Black ink stroke around face)
    ctx.save();
    this.drawFaceContour(ctx, landmarks, width, height);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 7;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();

    // 3. SUPERHERO DOMINO MASK OVERLAY
    ctx.save();
    const eyeAngle = this.getAngle(leftEye, rightEye);
    const eyeDist = this.getDistance(leftEye, rightEye) * width;
    const maskWidth = eyeDist * 2.2;
    const maskHeight = eyeDist * 1.1;

    ctx.translate(faceCenter.x, faceCenter.y - (eyeDist * 0.15));
    ctx.rotate(eyeAngle);

    // Draw stylized domino mask shape
    ctx.beginPath();
    // Top-left wing
    ctx.moveTo(-maskWidth * 0.5, -maskHeight * 0.35);
    ctx.quadraticCurveTo(-maskWidth * 0.25, -maskHeight * 0.6, 0, -maskHeight * 0.2); // Top middle curve
    ctx.quadraticCurveTo(maskWidth * 0.25, -maskHeight * 0.6, maskWidth * 0.5, -maskHeight * 0.35); // Top-right wing
    // Right wing outer curve
    ctx.quadraticCurveTo(maskWidth * 0.6, 0, maskWidth * 0.45, maskHeight * 0.35);
    // Bottom curves
    ctx.quadraticCurveTo(maskWidth * 0.2, maskHeight * 0.5, 0, maskHeight * 0.1); // Bridge dip
    ctx.quadraticCurveTo(-maskWidth * 0.2, maskHeight * 0.5, -maskWidth * 0.45, maskHeight * 0.35);
    ctx.quadraticCurveTo(-maskWidth * 0.6, 0, -maskWidth * 0.5, -maskHeight * 0.35);
    ctx.closePath();

    // Fill mask body black
    ctx.fillStyle = '#0f0f15';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Cutout eye-holes (so user's real eyes show through!)
    const leftEyeHole = { x: -eyeDist * 0.46, y: -eyeDist * 0.05 };
    const rightEyeHole = { x: eyeDist * 0.46, y: -eyeDist * 0.05 };
    const holeRadiusX = eyeDist * 0.26;
    const holeRadiusY = eyeDist * 0.18;

    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.ellipse(leftEyeHole.x, leftEyeHole.y, holeRadiusX, holeRadiusY, -0.05, 0, Math.PI * 2);
    ctx.ellipse(rightEyeHole.x, rightEyeHole.y, holeRadiusX, holeRadiusY, 0.05, 0, Math.PI * 2);
    ctx.fill();

    // Reset composite operation to draw stylized white outlines around eyes
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(leftEyeHole.x, leftEyeHole.y, holeRadiusX, holeRadiusY, -0.05, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.strokeStyle = '#ff007f';
    ctx.beginPath();
    ctx.ellipse(rightEyeHole.x, rightEyeHole.y, holeRadiusX, holeRadiusY, 0.05, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.restore();

    // 4. ANIMATED "POW! / BAM!" COMIC ACTION BUBBLES
    const now = Date.now();
    
    // Check if mouth is open wide (acts as trigger for action graphics)
    const upperLipInner = landmarks[13];
    const lowerLipInner = landmarks[14];
    const mouthDist = this.getDistance(upperLipInner, lowerLipInner) * height;
    const mouthHeightBase = this.getDistance(landmarks[0], landmarks[17]) * height;
    const isMouthOpen = mouthHeightBase > 0 && (mouthDist / mouthHeightBase) > 0.45;

    if ((isMouthOpen && now - this.lastBubbleTime > 1200) || (now - this.lastBubbleTime > 3500)) {
      const bubbleText = this.bubbleTexts[Math.floor(Math.random() * this.bubbleTexts.length)];
      
      // Position bubble offset from head top (Landmark 10)
      const headTop = landmarks[10];
      const bx = headTop.x * width + (Math.random() - 0.5) * 160;
      const by = headTop.y * height - 80 - Math.random() * 60;
      
      this.actionBubbles.push({
        x: bx,
        y: by,
        text: bubbleText,
        scale: 0.1,
        targetScale: Math.random() * 0.3 + 0.9,
        alpha: 1.0,
        rotation: (Math.random() - 0.5) * 0.4,
        maxLife: 50,
        life: 50,
        points: this.generateStarburstPoints(12, 45, 80)
      });
      this.lastBubbleTime = now;
      
      // Play a quick chime pitch when bubble sparks (if sfx available)
      if (window.sfx && !window.sfx.muted) {
        window.sfx.playSwitch();
      }
    }

    // Render action bubbles
    this.actionBubbles = this.actionBubbles.filter(b => {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rotation);
      ctx.globalAlpha = b.alpha;
      ctx.scale(b.scale, b.scale);

      // Animate popping scale up
      if (b.scale < b.targetScale) {
        b.scale += (b.targetScale - b.scale) * 0.25;
      }

      // Draw Jagged Starburst path
      ctx.beginPath();
      ctx.moveTo(b.points[0].x, b.points[0].y);
      for (let i = 1; i < b.points.length; i++) {
        ctx.lineTo(b.points[i].x, b.points[i].y);
      }
      ctx.closePath();
      
      // Yellow comic fill with thick black strokes
      ctx.fillStyle = '#ffff00';
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetX = 5;
      ctx.shadowOffsetY = 5;
      ctx.fill();
      
      ctx.shadowColor = 'transparent'; // Reset shadow
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 4;
      ctx.stroke();

      // Inner red burst
      ctx.beginPath();
      ctx.moveTo(b.points[0].x * 0.65, b.points[0].y * 0.65);
      for (let i = 1; i < b.points.length; i++) {
        ctx.lineTo(b.points[i].x * 0.65, b.points[i].y * 0.65);
      }
      ctx.closePath();
      ctx.fillStyle = '#ff0000';
      ctx.fill();
      ctx.stroke();

      // Render Comic Text
      ctx.font = '900 28px "Orbitron", Impact, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 5;
      ctx.strokeText(b.text, 0, 0);
      ctx.fillText(b.text, 0, 0);

      ctx.restore();

      b.life--;
      if (b.life < 15) {
        b.alpha = b.life / 15;
      }
      return b.life > 0;
    });
  }

  /**
   * Generates custom vertex offsets for spiky comic stars
   */
  generateStarburstPoints(spikes, minR, maxR) {
    const points = [];
    const angleStep = Math.PI / spikes;
    for (let i = 0; i < spikes * 2; i++) {
      const radius = i % 2 === 0 ? maxR : minR;
      const angle = i * angleStep;
      points.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius
      });
    }
    return points;
  }
}

/**
 * Filter 2: Cute Puppy Face Mesh Filter
 */
class PuppyFilter extends FaceFilter {
  constructor() {
    super();
  }

  draw(ctx, landmarks, width, height) {
    if (!landmarks || landmarks.length === 0) return;

    // Key coordinates
    const foreheadLeft = landmarks[103];
    const foreheadRight = landmarks[332];
    const foreheadTop = landmarks[10];
    const noseTip = landmarks[1];
    const noseLeft = landmarks[97];
    const noseRight = landmarks[327];
    
    // Scale and angle calculations
    const headWidth = this.getDistance(foreheadLeft, foreheadRight) * width;
    const headTilt = this.getAngle(foreheadLeft, foreheadRight);
    
    // Emit floating bone/paw particles occasionally
    if (Math.random() < 0.05 && this.particles.length < 20) {
      this.particles.push(new Particle(
        Math.random() * width, 
        height + 20, 
        Math.random() > 0.5 ? 'paw' : 'bone'
      ));
    }
    
    // Update background floating elements first
    this.updateParticles(ctx, width, height);

    // --- 1. RENDER EARS (Drawn on forehead coordinates) ---
    ctx.save();
    // Shift origin to forehead top-center
    ctx.translate(foreheadTop.x * width, foreheadTop.y * height);
    ctx.rotate(headTilt);

    const earSize = headWidth * 0.7;

    // Left Ear
    ctx.save();
    ctx.translate(-headWidth * 0.55, -headWidth * 0.25);
    ctx.rotate(-0.25); // Tilt outwards
    this.drawFloppyEar(ctx, earSize, false);
    ctx.restore();

    // Right Ear
    ctx.save();
    ctx.translate(headWidth * 0.55, -headWidth * 0.25);
    ctx.rotate(0.25); // Tilt outwards
    ctx.scale(-1, 1); // Flip horizontally for right ear
    this.drawFloppyEar(ctx, earSize, true);
    ctx.restore();

    ctx.restore();

    // --- 2. RENDER INTERACTIVE TONGUE (Opens on mouth open) ---
    const upperLipInner = landmarks[13];
    const lowerLipInner = landmarks[14];
    const mouthDist = this.getDistance(upperLipInner, lowerLipInner) * height;
    const mouthHeightBase = this.getDistance(landmarks[0], landmarks[17]) * height;
    const openRatio = mouthHeightBase > 0 ? (mouthDist / mouthHeightBase) : 0;

    // Open mouth threshold
    if (openRatio > 0.3) {
      ctx.save();
      // Center tongue on lower lip inner edge
      ctx.translate(lowerLipInner.x * width, lowerLipInner.y * height);
      ctx.rotate(headTilt);

      // Scale tongue length dynamically based on mouth opening width
      const tongueWidth = headWidth * 0.22;
      const tongueLen = headWidth * 0.35 * Math.min(openRatio * 1.5, 2.0);
      
      // Soft breathing hover wobble
      const wobble = 1 + Math.sin(Date.now() * 0.02) * 0.03;
      ctx.scale(1, wobble);

      // Draw cute tongue
      ctx.beginPath();
      ctx.moveTo(-tongueWidth * 0.5, 0);
      ctx.lineTo(-tongueWidth * 0.5, tongueLen - (tongueWidth * 0.5));
      ctx.arc(0, tongueLen - (tongueWidth * 0.5), tongueWidth * 0.5, Math.PI, 0, true);
      ctx.lineTo(tongueWidth * 0.5, 0);
      ctx.closePath();

      // Deep pink tongue color
      ctx.fillStyle = '#ff4d6d';
      ctx.fill();
      
      // Central folding tongue indentation crease
      ctx.beginPath();
      ctx.moveTo(0, 2);
      ctx.lineTo(0, tongueLen - 6);
      ctx.strokeStyle = '#c9184a';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.restore();
    }

    // --- 3. RENDER DOG NOSE (Drawn over nose tip) ---
    ctx.save();
    ctx.translate(noseTip.x * width, noseTip.y * height + (headWidth * 0.05));
    ctx.rotate(headTilt);

    const noseW = headWidth * 0.25;
    const noseH = noseW * 0.65;

    // Draw cute black shiny rounded triangle nose
    ctx.beginPath();
    ctx.moveTo(0, -noseH * 0.2);
    ctx.bezierCurveTo(noseW * 0.4, -noseH * 0.6, noseW * 0.55, noseH * 0.2, 0, noseH * 0.6);
    ctx.bezierCurveTo(-noseW * 0.55, noseH * 0.2, -noseW * 0.4, -noseH * 0.6, 0, -noseH * 0.2);
    ctx.closePath();

    ctx.fillStyle = '#1e1b18';
    ctx.fill();

    // Specular highlight spot (makes it shiny and 3D)
    ctx.beginPath();
    ctx.arc(-noseW * 0.12, -noseH * 0.15, noseW * 0.06, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.restore();
  }

  /**
   * Helper: Draw vector floppy dog ear
   */
  drawFloppyEar(ctx, size, isRight) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    // Outer floppy ear lobe shape
    ctx.bezierCurveTo(-size * 0.1, -size * 0.1, -size * 0.45, size * 0.35, -size * 0.2, size * 0.95);
    ctx.bezierCurveTo(0, size * 1.15, size * 0.25, size * 0.8, size * 0.15, size * 0.3);
    ctx.bezierCurveTo(size * 0.1, size * 0.1, size * 0.08, 0, 0, 0);
    ctx.closePath();

    // Dark brown outer ear coat
    ctx.fillStyle = '#834c24';
    ctx.fill();
    ctx.strokeStyle = '#5a3112';
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // Inner pink ear segment
    ctx.beginPath();
    ctx.moveTo(-size * 0.04, size * 0.12);
    ctx.bezierCurveTo(-size * 0.15, size * 0.35, -size * 0.22, size * 0.7, -size * 0.08, size * 0.85);
    ctx.bezierCurveTo(-0.02, size * 0.92, size * 0.08, size * 0.75, size * 0.06, size * 0.4);
    ctx.bezierCurveTo(size * 0.05, size * 0.25, size * 0.02, size * 0.15, -size * 0.04, size * 0.12);
    ctx.closePath();
    ctx.fillStyle = '#ffb5a7';
    ctx.fill();
  }
}

/**
 * Filter 3: Funhouse Distortion Particles and Sparkles
 */
class FunhouseFilter extends FaceFilter {
  constructor() {
    super();
  }

  draw(ctx, landmarks, width, height) {
    if (!landmarks || landmarks.length === 0) return;

    const noseTip = landmarks[1];
    const foreheadTop = landmarks[10];
    const leftCheek = landmarks[234];
    const rightCheek = landmarks[454];

    // Center coordinates
    const fx = noseTip.x * width;
    const fy = noseTip.y * height;
    const faceW = this.getDistance(leftCheek, rightCheek) * width;

    // Spawn neon stars and sparkles from the face center point
    if (Math.random() < 0.15 && this.particles.length < 35) {
      // Offset spawn location slightly around nose tip
      const sx = fx + (Math.random() - 0.5) * 60;
      const sy = fy + (Math.random() - 0.5) * 60;
      this.particles.push(new Particle(sx, sy, Math.random() > 0.4 ? 'sparkle' : 'star'));
    }

    // Render active swirls overlay around head
    ctx.save();
    ctx.translate(fx, fy);
    
    // Slow rotational clock
    const angle = (Date.now() * 0.0015) % (Math.PI * 2);
    ctx.rotate(angle);

    // Draw multi-layered swirling neon circles/ovals mapping face size
    const numRings = 3;
    ctx.lineWidth = 1.8;
    ctx.shadowBlur = 12;

    const colors = ['#00f2fe', '#7f00ff', '#ff007f'];

    for (let i = 0; i < numRings; i++) {
      ctx.strokeStyle = colors[i];
      ctx.shadowColor = colors[i];
      
      const rx = (faceW * 0.6) + (i * 22) + Math.sin(Date.now() * 0.003 + i) * 8;
      const ry = rx * 0.45; // Flattened orbit ring ellipse
      
      ctx.beginPath();
      // Rotate each layer slightly differently
      ctx.rotate(0.3);
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Add small glowing orbital dot markers on rings
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      const dotAngle = (Date.now() * 0.002 * (1 - i * 0.15)) % (Math.PI * 2);
      const dotX = Math.cos(dotAngle) * rx;
      const dotY = Math.sin(dotAngle) * ry;
      ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // Render floating particle stars (drawn over the background canvas)
    this.updateParticles(ctx, width, height);
  }
}

// Global filter registry mapping filters index
window.filterOverlays = [
  new ComicFilter(),
  new PuppyFilter(),
  new FunhouseFilter()
];
